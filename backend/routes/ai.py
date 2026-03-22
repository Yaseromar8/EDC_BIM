import os
import io
import time
import threading
from flask import Blueprint, request, jsonify
import vertexai
from vertexai.generative_models import GenerativeModel, Part
from google.cloud import storage
import pdfplumber
import fitz  # pymupdf
import traceback
from google.cloud import discoveryengine_v1beta as discoveryengine
import json
import re
from skills.pdf_researcher import PDFResearcher


ai_bp = Blueprint('ai', __name__)

# ─── Configuración ────────────────────────────────────────────────────────────
BASE_DIR   = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_ID = "correos-gmail-425301"
LOCATION   = "us-central1"

for path in [
    os.path.join(BASE_DIR, "gcp_sa.json"),
    os.path.join(BASE_DIR, "backend", "gcp_sa.json"),
    "c:/Users/omars/OneDrive/Desktop/VISOR_APS_TL/backend/gcp_sa.json"
]:
    if os.path.exists(path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = path
        print(f"[AI] Credenciales: {path}")
        break
else:
    print("[AI] ⚠️ CRÍTICO: No se encontró gcp_sa.json")

try:
    vertexai.init(project=PROJECT_ID, location=LOCATION)
    print(f"[AI] Vertex AI inicializado en {LOCATION}")
except Exception as e:
    print(f"[AI] Error inicializando Vertex: {e}")

# ─── Caché en memoria ─────────────────────────────────────────────────────────
# Estructura:
#   { "ruta/archivo.pdf": {
#       "type"  : "text" | "images",
#       "text"  : str,           # si type == "text"
#       "images": [bytes, ...],  # si type == "images" (PNG por página)
#       "pages" : int,
#       "ts"    : float
#   }}
_pdf_cache  = {}
_cache_lock = threading.Lock()
PDF_CACHE_TTL    = 1800   # 30 minutos
TEXT_THRESHOLD   = 300    # chars promedio por página → si menos, es plano visual
MAX_VISUAL_PAGES = 12     # máximo de páginas a renderizar como PNG
VISUAL_DPI       = 150    # resolución del render (150 DPI = buena calidad / peso razonable)


# ─── Helpers de caché ─────────────────────────────────────────────────────────

def _get_cached(full_path: str):
    with _cache_lock:
        entry = _pdf_cache.get(full_path)
        if entry and (time.time() - entry["ts"]) < PDF_CACHE_TTL:
            return entry
        if entry:
            del _pdf_cache[full_path]
        return None


def _set_cached(full_path: str, entry: dict):
    entry["ts"] = time.time()
    with _cache_lock:
        _pdf_cache[full_path] = entry
    doc_type = entry["type"]
    pages    = entry.get("pages", "?")
    if doc_type == "text":
        print(f"[AI] 📥 Caché TEXT: {len(entry['text']):,} chars, {pages} pág → '{full_path}'")
    else:
        print(f"[AI] 📥 Caché IMG:  {len(entry['images'])} PNGs ({VISUAL_DPI} DPI) → '{full_path}'")


# ─── Procesamiento de PDF ──────────────────────────────────────────────────────

def _download_pdf(full_path: str, bucket_name: str) -> bytes:
    print(f"[AI] ⬇️  Descargando: gs://{bucket_name}/{full_path}")
    try:
        client = storage.Client()
        blob = client.bucket(bucket_name).blob(full_path)
        if not blob.exists():
            raise FileNotFoundError(f"El archivo {full_path} no existe en el bucket {bucket_name}")
        return blob.download_as_bytes()
    except Exception as e:
        print(f"[AI] Error descargando PDF: {e}")
        raise e


def _process_pdf(pdf_bytes: bytes) -> dict:
    """
    Analiza el PDF y decide el modo de caché:
      - "text"   → documentos con texto rico (reportes, specs, metrados)
      - "images" → planos, escaneos, documentos mayormente visuales
    """
    # ── Intento 1: extraer texto con pdfplumber ────────────────────────────
    text_parts = []
    num_pages  = 0
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            num_pages = len(pdf.pages)
            for page in pdf.pages:
                t = page.extract_text()
                if t:
                    text_parts.append(f"--- Página {page.page_number}/{num_pages} ---\n{t}")
    except Exception as e:
        print(f"[AI] pdfplumber error: {e}")

    full_text     = "\n\n".join(text_parts)
    avg_chars_pag = len(full_text) / max(num_pages, 1)

    print(f"[AI] PDF: {num_pages} págs, {len(full_text):,} chars, ~{avg_chars_pag:.0f} chars/pág")

    # ── ¿Suficiente texto? → modo TEXT ────────────────────────────────────
    if avg_chars_pag >= TEXT_THRESHOLD:
        return {"type": "text", "text": full_text, "pages": num_pages}

    # ── Poco texto → PLANO o ESCANEO → renderizar páginas como PNG ────────
    print(f"[AI] 📐 Documento visual detectado ({avg_chars_pag:.0f} chars/pág < {TEXT_THRESHOLD})")
    print(f"[AI] 🖼️  Renderizando hasta {MAX_VISUAL_PAGES} páginas a {VISUAL_DPI} DPI...")

    images = []
    try:
        doc   = fitz.open(stream=pdf_bytes, filetype="pdf")
        pages_to_render = min(len(doc), MAX_VISUAL_PAGES)
        mat   = fitz.Matrix(VISUAL_DPI / 72, VISUAL_DPI / 72)

        for i in range(pages_to_render):
            pix       = doc.load_page(i).get_pixmap(matrix=mat, alpha=False)
            img_bytes = pix.tobytes("png")
            images.append(img_bytes)

        print(f"[AI] ✅ {len(images)} PNGs generados ({sum(len(b) for b in images)/1024:.0f} KB total)")
    except Exception as e:
        print(f"[AI] pymupdf error: {e}")
        # Fallback: si falla el render, guardar el texto que tenemos (aunque escaso)
        return {"type": "text", "text": full_text or "[Sin texto extraíble]", "pages": num_pages}

    return {"type": "images", "images": images, "pages": num_pages}


# ─── Endpoint: Precarga (warmup) ──────────────────────────────────────────────
@ai_bp.route('/api/ai/warmup', methods=['POST'])
def warmup_document():
    """
    Descarga, analiza y cachea el PDF (texto o imágenes según tipo).
    El frontend lo llama en background al abrir un documento.
    """
    data        = request.get_json() or {}
    full_path   = data.get('fullPath') or data.get('full_path')
    node_id     = data.get('nodeId') or data.get('node_id')
    bucket_name = os.environ.get("GCS_BUCKET_NAME")

    if not (full_path or node_id) or not bucket_name:
        return jsonify({"error": "Falta identificador o GCS_BUCKET_NAME"}), 400

    # Si tenemos node_id, resolvemos el URN real (robusto contra tildes/rutas)
    gcs_urn = full_path
    if node_id:
        try:
            from db import get_db_connection
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT gcs_urn FROM file_nodes WHERE id = %s", (node_id,))
                row = cursor.fetchone()
                if row: gcs_urn = row[0]
        except Exception: pass

    # ¿Ya en caché y válido?
    cached = _get_cached(gcs_urn)
    if cached:
        return jsonify({
            "status" : "already_cached",
            "type"   : cached["type"],
            "pages"  : cached.get("pages", 0)
        })

    if not gcs_urn.lower().endswith('.pdf') and not node_id:
        return jsonify({"status": "skipped", "reason": "not_pdf"})

    try:
        pdf_bytes = _download_pdf(gcs_urn, bucket_name)
        entry     = _process_pdf(pdf_bytes)
        _set_cached(gcs_urn, entry)
        return jsonify({
            "status" : "ready",
            "type"   : entry["type"],
            "pages"  : entry.get("pages", 0)
        })
    except Exception as e:
        print(f"[AI] Warmup error: {e}")
        return jsonify({"error": str(e)}), 500


# ─── Endpoint: Preguntar a Gemini ─────────────────────────────────────────────
@ai_bp.route('/api/ai/ask', methods=['POST'])
def ask_document():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Sin datos"}), 400

    question    = data.get('question')
    full_path   = data.get('fullPath') or data.get('full_path')
    node_id     = data.get('nodeId') or data.get('node_id')
    bucket_name = os.environ.get("GCS_BUCKET_NAME")

    if not question:
        return jsonify({"error": "Falta pregunta"}), 400

    # Si no se provee un documento específico, redirigimos a la lógica de búsqueda universal
    if not (full_path or node_id):
        print("[AI] /api/ai/ask -> Redirigiendo a Búsqueda Universal (Global mode)")
        # Llamamos internamente a la lógica de universal_search
        return universal_search()

    # Resolución robusta por ID si está disponible
    gcs_urn = full_path
    doc_desc = None
    if node_id:
        try:
            from db import get_db_connection
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT gcs_urn, description FROM file_nodes WHERE id = %s", (node_id,))
                row = cursor.fetchone()
                if row: 
                    gcs_urn = row[0]
                    doc_desc = row[1]
        except Exception: pass

    print(f"[AI] Pregunta sobre {gcs_urn}: '{question[:80]}...'")

    try:
        model  = GenerativeModel("gemini-2.0-flash")
        cached = _get_cached(gcs_urn)
        
        # Log init interaction in buffer
        interaction_id = None
        try:
            from db import get_db_connection
            import uuid
            interaction_id = str(uuid.uuid4())
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("""
                    INSERT INTO ai_brain.feedback_buffer (id, model_urn, user_query, ai_response)
                    VALUES (%s, %s, %s, %s)
                """, (interaction_id, data.get('model_urn', 'unknown'), question, 'PENDING'))
                conn.commit()
        except Exception as db_err:
            print(f"[AI] Error logging initial interaction: {db_err}")

        # ══════════════════════════════════════════════════════════════════
        # CAMINO 1 — Caché TEXT (documentos con texto rico)
        # ══════════════════════════════════════════════════════════════════
        if cached and cached["type"] == "text":
            print("[AI] ⚡ Camino 1: texto cacheado")
            doc_text = cached["text"][:60000]
            prompt = f"""Eres un experto en ingeniería civil y construcción.
Analiza el siguiente contenido de un documento técnico y responde en ESPAÑOL.

DOCUMENTO:
{doc_text}

ETIQUETA MANUAL (Contexto experto): {doc_desc or 'Sin etiqueta'}

PREGUNTA: {question}

Responde de forma precisa y técnica. Si hay tablas o listas, preséntala con formato claro."""
            response = model.generate_content(prompt)

        # ══════════════════════════════════════════════════════════════════
        # CAMINO 2 — Caché IMAGES (planos o escaneos renderizados como PNG)
        # ══════════════════════════════════════════════════════════════════
        elif cached and cached["type"] == "images":
            print(f"[AI] 🖼️  Camino 2: {len(cached['images'])} PNGs cacheados (plano/escaneo)")
            parts = []
            for img_bytes in cached["images"]:
                parts.append(Part.from_data(data=img_bytes, mime_type="image/png"))

            prompt = f"""Eres un experto en ingeniería civil especializado en lectura de planos técnicos.
ETIQUETA MANUAL (Contexto experto): {doc_desc or 'Sin etiqueta'}
Analiza las imágenes de este documento (plano o escaneo) y responde en ESPAÑOL.

PREGUNTA: {question}

Presta atención a: cotas, etiquetas, cuadros de rótulo, notas técnicas, simbología y geometría.
Si hay tablas o datos importantes, extráelos claramente."""
            parts.append(prompt)
            response = model.generate_content(parts)

        # ══════════════════════════════════════════════════════════════════
        # CAMINO 3 — Sin caché (fallback: PDF directo desde GCS)
        # ══════════════════════════════════════════════════════════════════
        else:
            print(f"[AI] 🐢 Camino 3: sin caché → PDF ({gcs_urn}) directo desde GCS")
            pdf_uri  = f"gs://{bucket_name}/{gcs_urn}"
            pdf_part = Part.from_uri(uri=pdf_uri, mime_type="application/pdf")
            prompt   = f"""Eres un experto en ingeniería civil.
ETIQUETA MANUAL (Contexto experto): {doc_desc or 'Sin etiqueta'}
Analiza el documento PDF y responde en ESPAÑOL: {question}"""
            response = model.generate_content([pdf_part, prompt])

            # Cachear en background para la próxima pregunta
            if gcs_urn.lower().endswith('.pdf') or node_id:
                def cache_bg():
                    try:
                        pdf_bytes = _download_pdf(gcs_urn, bucket_name)
                        entry     = _process_pdf(pdf_bytes)
                        _set_cached(gcs_urn, entry)
                    except Exception as bg_err:
                        print(f"[AI] Cache BG error: {bg_err}")
                threading.Thread(target=cache_bg, daemon=True).start()

        # Update buffer with final response
        if interaction_id:
            try:
                from db import get_db_connection
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("UPDATE ai_brain.feedback_buffer SET ai_response = %s WHERE id = %s", 
                                   (response.text, interaction_id))
                    conn.commit()
            except Exception as db_err:
                print(f"[AI] Error updating final response in buffer: {db_err}")

        return jsonify({"answer": response.text, "success": True, "interaction_id": interaction_id})

    except Exception as e:
        print(f"[AI] Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@ai_bp.route('/api/ai/feedback', methods=['POST'])
def save_ai_feedback():
    """
    Guarda la corrección humana (HITL) en el buffer de feedback.
    """
    data = request.get_json()
    interaction_id = data.get('interaction_id')
    human_correction = data.get('human_correction')
    reward_value = data.get('reward_value', -1.0)
    
    if not interaction_id or not human_correction:
        return jsonify({"error": "Falta interaction_id o human_correction"}), 400
        
    try:
        from db import get_db_connection
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                UPDATE ai_brain.feedback_buffer 
                SET human_correction = %s, reward_value = %s
                WHERE id = %s
            """, (human_correction, reward_value, interaction_id))
            conn.commit()
            
            # TODO: Evaluar si se debe convertir esta corrección en una "Regla de Oro" inmediatamente
            # en ai_brain.global_knowledge si el usuario tiene rol de admin/experto.
            pass
            
        return jsonify({"success": True, "message": "Feedback guardado correctamente"})
    except Exception as e:
        print(f"[AI] Feedback Error: {e}")
        return jsonify({"error": str(e)}), 500


@ai_bp.route('/api/ai/universal-search', methods=['POST'])
def universal_search():
    """
    Realiza una búsqueda inteligente en todo el proyecto usando el motor RAG de Vertex AI.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Sin datos"}), 400
    
    query = (data.get('query') or data.get('question') or '').strip()
    if query.startswith('"') and query.endswith('"'): query = query[1:-1].strip()
    if query.startswith("'") and query.endswith("'"): query = query[1:-1].strip()

    if not query:
        return jsonify({"error": "Falta la consulta"}), 400

    print(f"[AI] Búsqueda Universal (Sanitized): '{query}'")
    
    # --- 0. DEEP RESEARCH AGENT (IA 2 Style) ---
    agent_reasoning = []
    deep_context = ""
    
    # Detect if query needs specific point investigation (e.g. CP-APN, BP-, Section, etc)
    expanded_query = query.upper().replace("PANAMERICANA", "APN").replace("PANEMIRCANA", "APN")
    if any(term in expanded_query for term in ["CP-", "BP-", "APN", "PENDIENTE", "COTA", "TR-", "HIDRAULICO", "CAUDAL"]):
        print(f"[AI] Iniciando Investigación Profunda para: {query} (Expanded: {expanded_query})")
        agent_reasoning.append(f"Detectada consulta técnica específica sobre '{query}'. Aplicando diccionario técnico...")
        try:
            doc_dir = os.path.join(BASE_DIR, "uploads", "documents")
            researcher = PDFResearcher(doc_dir)
            
            # Step 1: Search for specific codes in expanded query
            codes = re.findall(r'[A-Z]{2,}-[A-Z0-9]{2,}-[0-9]{1,}', expanded_query)
            if not codes: codes = re.findall(r'[A-Z]{2,}-[0-9]{1,}', expanded_query)
            # Add APN specifically if Panamericana was mentioned
            if "APN" in expanded_query and "APN" not in codes:
                codes.insert(0, "APN") # Prioritize APN search
            
            # Prioritize CP (Primarios) over CS (Secundarios) if it's a "Panamericana" query
            codes.sort(key=lambda x: ("CP-" in x or x == "APN"), reverse=True)
            
            distinct_results = []
            for code in codes:
                agent_reasoning.append(f"Buscando código '{code}' en el expediente...")
                found = researcher.search_keyword(code)
                
                # REGLA ORO: Si buscamos APN, también buscamos explícitamente "Tabla 78"
                if code == "APN":
                    agent_reasoning.append("Buscando 'Tabla 78' para datos de Colector Primario...")
                    found_78 = researcher.search_keyword("Tabla 78")
                    if found_78: found = found_78 + found # Priorize page with Tabla 78
                
                if found:
                    agent_reasoning.append(f"Encontrado '{code}' en {len(found)} ubicaciones.")
                    # Take top 3 pages for more context
                    for f in found[:3]:
                        agent_reasoning.append(f"Extrayendo tabla de {f['file']} (Página {f['page']})...")
                        page_text = researcher.extract_page(f['full_path'], f['page'])
                        deep_context += f"\n--- EXTRACTO DE {f['file']} (PAGINA {f['page']}) ---\n{page_text}\n"
            
            if deep_context:
                agent_reasoning.append("Análisis de tablas completado. Cruzando datos con el motor de búsqueda...")
        except Exception as ae:
            print(f"[AI] Agent Error: {ae}")
            agent_reasoning.append(f"Error en investigación: {str(ae)}")

    import traceback # Added import
    try:
        # --- 1. INTENT ROUTING (Safe Path) ---
        intent_data = {"intent": "document_query"} # Default to document_query
        try:
            # Use gemini-1.5-flash-002 but don't fail if model not found
            router_model = GenerativeModel("gemini-2.0-flash")
            router_prompt = f"""
            Eres un clasificador de intenciones para un Asistente de Ingeniería.
            Pregunta: "{query}"
            Responde ÚNICAMENTE en JSON: {{ "intent": "model_command" | "document_query", "target": "foco/objeto" }}
            """
            router_res = router_model.generate_content(router_prompt)
            clean_json = router_res.text.strip()
            if "```" in clean_json: clean_json = clean_json.split("```")[1].strip()
            if clean_json.startswith("json"): clean_json = clean_json[4:].strip()
            import json
            intent_data = json.loads(clean_json)
            if intent_data.get("intent") == "model_command":
                return jsonify({"success": True, "intent": "model_command", "command": intent_data})
        except Exception as router_err:
            print(f"[AI] Router Error (Ignorado): {router_err}")

        # --- 2. CONTEXT PREPARATION (RAG) ---
        history = data.get('history', [])
        history_context = ""
        if history:
            history_context = "HISTORIAL RECIENTE:\n" + "\n".join([f"{'Usuario' if m.get('role')=='user' else 'Asistente'}: {m.get('content')}" for m in history[-5:]])

        # model_urn fallback al inicio para consultas DB (En Talara es '1')
        model_urn = data.get('model_urn') or "1"
        if model_urn == "global_pqt8": model_urn = "1" # Mapping user friendly urn to db urn
        
        folder_context = "No detectada"
        matches_context = ""
        technical_paths = []
        
        try:
            from file_system_db import get_node_full_path, find_nodes_by_description_match
            from db import get_db_connection # Moved import here to avoid circular dependency if db is imported earlier
            
            # Fetch project metadata
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT metadata FROM projects WHERE id = %s", (model_urn,))
                proj_row = cursor.fetchone()
                if proj_row and proj_row[0]:
                    technical_paths = proj_row[0].get('ai_technical_paths', [])

            # Priority matches in descriptions
            matches = find_nodes_by_description_match(query, model_urn, limit=8, priority_folders=technical_paths)
            if matches:
                matches_context = "ARCHIVOS PRIORITARIOS (Match en descripción):\n"
                for m_id, m_name, m_desc in matches:
                    matches_context += f"- [{m_desc or m_name}] {get_node_full_path(m_id)}\n"

            # Recent files for general context
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT id, name, description FROM file_nodes WHERE model_urn = %s AND is_deleted = FALSE AND node_type = 'FILE' ORDER BY created_at DESC LIMIT 15", (model_urn,))
                docs_list = cursor.fetchall()
                if docs_list:
                    folder_context = "\n".join([f"- [{d[2] or d[1]}] {get_node_full_path(d[0])}" for d in docs_list])
        except Exception as e:
            print(f"[AI] Context Error: {e}")

        # --- 3. DISCOVERY ENGINE SEARCH ---
        ENGINE_ID = "visor-inteligente-talara_1772391119562"
        client = discoveryengine.SearchServiceClient()
        serving_config = f"projects/{PROJECT_ID}/locations/global/collections/default_collection/engines/{ENGINE_ID}/servingConfigs/default_serving_config"
        
        search_request = discoveryengine.SearchRequest(
            serving_config=serving_config,
            query=query,
            page_size=5
        )
        
        response = client.search(search_request)
        
        # --- DIAGNOSTIC TRACE ---
        try:
            with open(os.path.join(BASE_DIR, "rag_trace.json"), "w", encoding="utf-8") as f:
                trace_data = {
                    "query": query,
                    "summary": response.summary.summary_text if response.summary else "NO SUMMARY",
                    "results_count": len(response.results),
                    "results": []
                }
                for r in response.results:
                    trace_data["results"].append({
                        "title": r.document.derived_struct_data.get('title'),
                        "link": r.document.derived_struct_data.get('link'),
                        "snippets": r.document.derived_struct_data.get('snippets')
                    })
                json.dump(trace_data, f, indent=2, ensure_ascii=False)
            print(f"[AI] Diagnostic trace saved to rag_trace.json")
        except Exception as te:
            print(f"[AI] Trace Error: {te}")
        
        # --- 4. RESULT PROCESSING & CONTEXT BUILDING ---
        results = []
        retrieved_context = ""
        from file_system_db import find_node_by_gcs_urn, get_node_full_path
        import db

        for res in response.results:
            struct_data = res.document.derived_struct_data
            gcs_link = struct_data.get('link', '') 
            gcs_urn = gcs_link[5:].split('/', 1)[1] if gcs_link.startswith("gs://") and '/' in gcs_link[5:] else gcs_link
            
            node_info = find_node_by_gcs_urn(model_urn, gcs_urn)
            node_id = node_info[0] if node_info else None
            db_desc = node_info[4] if node_info else None
            
            display_title = db_desc or get_node_full_path(node_id) or struct_data.get('title', res.document.name)
            display_title = re.sub(r'^[0-9]{8,15}_[a-z0-9]{8,15}_', '', display_title)
            
            snippet = (struct_data.get('snippets') or [{}])[0].get('snippet', '')
            retrieved_context += f"FUENTE: {display_title}\nCONTENIDO: {snippet}\n\n"

            results.append({
                "id": res.id,
                "nodeId": node_id,
                "title": display_title,
                "description": db_desc,
                "link": gcs_link,
                "snippet": snippet
            })

        # --- 5. CUSTOM SYNTHESIS (Gemini 2.0 Flash) ---
        synthesis_model = GenerativeModel("gemini-2.0-flash")
        synthesis_prompt = f"""
ERES UN ANALISTA TÉCNICO EXPERTO (AUDITOR SENIOR) EN EL PROYECTO TALARA.
Tu objetivo es responder de forma EJECUTIVA y PROFESIONAL.

--- INFORMACIÓN RETRIEVED (CDE) ---
{retrieved_context}

--- INVESTIGACIÓN DE CAMPO (AGENTIC) ---
{deep_context}

--- DICCIONARIO TÉCNICO ---
- 'Panamericana' = 'APN'.
- 'Buzón' = 'BP', 'Colector Primario' = 'CP', 'Colector Secundario' = 'CS'.
*** IMPORTANTE: Para pendientes de la Panamericana (CP-APN), los datos están en la TABLA 78 (Pág. 262) del RP-HD-001008. ***

INSTRUCCIONES DE RESPUESTA:
1. **RESPUESTA DIRECTA**: Empieza con el dato o tabla solicitada. Sin preámbulos.
2. **TABLAS EXCEL**: Usa MarkDown con líneas en blanco antes y después. Formato:
   | TRAMO | PENDIENTE | ... |
   |:---|:---|:---|
   CADA FILA DEBE ESTAR EN UNA LÍNEA NUEVA.
3. **DIVISOR**: Después de la respuesta, escribe la etiqueta `[INTERNAL_ANALYSIS]` en su propia línea.
4. **ANEXO**: Explica tu lógica después de la etiqueta.

PREGUNTA DEL USUARIO: {query}
HISTORIAL: {history_context}

Responde en ESPAÑOL:
"""
        try:
            gen_response = synthesis_model.generate_content(synthesis_prompt)
            answer = gen_response.text
        except Exception as ge:
            print(f"[AI] Synthesis Error: {ge}")
            answer = "Error al sintetizar respuesta técnica."

        return jsonify({
            "success": True, 
            "intent": "document_query", 
            "answer": answer, 
            "results": results, 
            "model_urn": model_urn,
            "agent_steps": agent_reasoning
        })

    except Exception as e:
        print(f"[AI] Universal Search ERROR: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
@ai_bp.route('/api/ai/analyze-title', methods=['POST'])
def analyze_drawing_title():
    """
    Analiza la primera página de un PDF para extraer el Título del Plano del membrete.
    Integración solicitada por el usuario para 'leer planos' automáticamente.
    """
    data = request.get_json()
    full_path = data.get('fullPath') or data.get('full_path')
    node_id = data.get('nodeId') or data.get('node_id')
    bucket_name = os.environ.get("GCS_BUCKET_NAME")

    if not full_path or not bucket_name:
        return jsonify({"error": "Falta información (fullPath/bucket)"}), 400

    # Resolución robusta por ID
    gcs_urn = full_path
    if node_id:
        try:
            from db import get_db_connection
            with get_db_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT gcs_urn FROM file_nodes WHERE id = %s", (node_id,))
                row = cursor.fetchone()
                if row: gcs_urn = row[0]
        except Exception: pass

    print(f"[AI] Analizando título de plano: {gcs_urn}")

    try:
        # Usamos flash para que sea instantáneo
        model = GenerativeModel("gemini-1.5-pro") # Trying pro for title analysis if available
        
        # Descargamos solo para procesar la primera página
        pdf_bytes = _download_pdf(gcs_urn, bucket_name)
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        if len(doc) == 0:
            return jsonify({"error": "PDF vacío"}), 400
            
        # Renderizar la primera página (donde suele estar el membrete/rótulo)
        mat = fitz.Matrix(150 / 72, 150 / 72)
        pix = doc.load_page(0).get_pixmap(matrix=mat, alpha=False)
        img_bytes = pix.tobytes("png")
        
        prompt = """Analiza este membrete de plano técnico de ingeniería y extrae ÚNICAMENTE el nombre o título descriptivo del plano. 
        Por ejemplo: 'PLANO DE CIMENTACIONES', 'DETALLES DE ARMADO', 'PERFIL LONGITUDINAL'.
        Ignora códigos como '500125-XXX', escalas y fechas. 
        Sé conciso. Si no encuentras un título claro, responde 'Sin título detectado'."""
        
        part = Part.from_data(data=img_bytes, mime_type="image/png")
        response = model.generate_content([part, prompt])
        
        title = response.text.strip().replace('"', '').replace('\n', ' ')
        if len(title) > 100: title = title[:97] + "..." # Limitar longitud
        
        print(f"[AI] Título extraído: '{title}'")

        # Persistir en la base de datos para no tener que preguntar otra vez
        if node_id:
            try:
                from db import get_db_connection
                import json
                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    cursor.execute("UPDATE file_nodes SET metadata = metadata || %s WHERE id = %s", 
                                   (json.dumps({"plano_titulo": title}), node_id))
                    conn.commit()
            except Exception as db_err:
                print(f"[AI] Warning: no se pudo guardar título en DB: {db_err}")
                
        return jsonify({
            "success": True, 
            "title": title,
            "nodeId": node_id
        })
    except Exception as e:
        print(f"[AI] Error en análisis de título: {e}")
        return jsonify({"error": str(e)}), 500
