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
from google.cloud import discoveryengine_v1beta as discoveryengine


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

    if not question or not (full_path or node_id):
        return jsonify({"error": "Falta pregunta o identificador"}), 400

    # Resolución robusta por ID si está disponible
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

    print(f"[AI] Pregunta sobre {gcs_urn}: '{question[:80]}...'")

    try:
        model  = GenerativeModel("gemini-2.0-flash")
        cached = _get_cached(gcs_urn)

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

        return jsonify({"answer": response.text, "success": True})

    except Exception as e:
        print(f"[AI] Error: {str(e)}")
        return jsonify({"error": str(e)}), 500


@ai_bp.route('/api/ai/universal-search', methods=['POST'])
def universal_search():
    """
    Realiza una búsqueda inteligente en todo el proyecto usando el motor RAG de Vertex AI.
    Esto consume el crédito de S/. 3,550.
    """
    data = request.get_json()
    if not data:
        return jsonify({"error": "Sin datos"}), 400
    
    query = data.get('query')
    if not query:
        return jsonify({"error": "Falta la consulta"}), 400

    print(f"[AI] Búsqueda Universal: '{query}'")
    
    try:
        # 1. Intent Detection with Gemini
        # Determinamos si el usuario quiere BUSCAR información en documentos 
        # o MANIPULAR el visor 3D (aislar, ocultar, filtrar).
        router_model = GenerativeModel("gemini-2.0-flash")
        router_prompt = f"""
        Analiza la siguiente consulta del usuario de un visualizador BIM y decide si es una PREGUNTA sobre el contenido de los documentos del proyecto (document_query) 
        o un COMANDO para aislar/filtrar elementos en el modelo 3D (model_command).

        CONSULTA: "{query}"

        Si es un COMANDO de modelo, responde ÚNICAMENTE con un JSON con este formato:
        {{
          "intent": "model_command",
          "action": "isolate", 
          "parameter": "nombre del parámetro a buscar (ej: 'Protocolo', 'Nivel', 'Categoría')",
          "value": "valor del parámetro",
          "operator": "equals" o "contains"
        }}

        Si es una PREGUNTA de documentos, responde ÚNICAMENTE:
        {{ "intent": "document_query" }}
        """
        
        router_res = router_model.generate_content(router_prompt)
        import json
        try:
            # Clean possible markdown blocks from JSON response
            clean_json = router_res.text.strip()
            if "```json" in clean_json:
                clean_json = clean_json.split("```json")[1].split("```")[0].strip()
            elif "```" in clean_json:
                clean_json = clean_json.split("```")[1].split("```")[0].strip()
            
            intent_data = json.loads(clean_json)
            if intent_data.get("intent") == "model_command":
                print(f"[AI] 🚀 Comando de Modelo Detectado: {intent_data}")
                return jsonify({
                    "success": True,
                    "intent": "model_command",
                    "command": intent_data
                })
        except Exception as e:
            print(f"[AI] Error parseando intent (continuando con RAG): {e}")

        # --- HISTORIAL DE CHAT PARA TRAZABILIDAD ---
        history = data.get('history', [])
        history_context = ""
        if history:
            history_context = "HISTORIAL DE CONVERSACIÓN PREVIA:\n"
            for msg in history[-6:]: # Tomar los últimos 6 mensajes para contexto
                role = "Usuario" if msg.get('role') == 'user' else "Asistente"
                history_context += f"{role}: {msg.get('content')}\n"
            history_context += "\n--- FIN DEL HISTORIAL ---\n"

        # 2. Document Search (RAG) - Existing logic
        # ID del motor de búsqueda configurado en Google Cloud Console
        ENGINE_ID = "visor-inteligente-talara_1772391119562"
        BUCKET_NAME = os.environ.get("GCS_BUCKET_NAME", "yaser-pqt08-talara")
        
        client = discoveryengine.SearchServiceClient()
        serving_config = f"projects/{PROJECT_ID}/locations/global/collections/default_collection/engines/{ENGINE_ID}/servingConfigs/default_serving_config"
        
        # --- NUEVA ESTRATEGIA: INYECTAR CONTEXTO DE CARPETAS ---
        model_urn = data.get('model_urn')
        folder_context = "No detectada"
        try:
            from file_system_db import get_node_full_path
            from db import get_db_connection
            with get_db_connection() as conn:
                cursor = conn.cursor()
                if model_urn:
                    cursor.execute("""
                        SELECT name, id FROM file_nodes 
                        WHERE model_urn = %s AND is_deleted = FALSE 
                        AND node_type = 'FILE'
                        ORDER BY created_at DESC LIMIT 50
                    """, (model_urn,))
                else:
                    cursor.execute("""
                        SELECT name, id FROM file_nodes 
                        WHERE is_deleted = FALSE 
                        AND node_type = 'FILE'
                        ORDER BY created_at DESC LIMIT 50
                    """)
                
                docs_list = cursor.fetchall()
                if docs_list:
                    folder_context = "\n".join([f"- {get_node_full_path(d[1])}" for d in docs_list])
                else:
                    # Fallback agresivo: intentar sin ningun filtro de URN si el anterior falló
                    cursor.execute("SELECT name, id FROM file_nodes WHERE is_deleted = FALSE AND node_type = 'FILE' LIMIT 20")
                    docs_list = cursor.fetchall()
                    if docs_list:
                        folder_context = "\n".join([f"- {get_node_full_path(d[1])}" for d in docs_list])

        except Exception as ce:
            print(f"[AI] Error recuperando contexto de carpetas: {ce}")

        search_request = discoveryengine.SearchRequest(
            serving_config=serving_config,
            query=query,
            page_size=5,
            content_search_spec={
                "summary_spec": {
                    "summary_result_count": 5,
                    "include_citations": True,
                    "model_spec": {"version": "stable"},
                    "model_prompt_spec": {
                        "preamble": f"ERES EL AUDITOR INTELIGENTE DEL PROYECTO TALARA.\n"
                                    f"A continuación tienes la lista de documentos cargados en el sistema a los que tienes acceso total:\n"
                                    f"{folder_context}\n\n"
                                    f"{history_context}"
                                    "INSTRUCCIONES CRÍTICAS:\n"
                                    "1. Tu fuente de verdad son los fragmentos de documentos proporcionados por el motor de búsqueda.\n"
                                    "2. Los archivos están en Google Cloud Storage. IGNORA rutas locales de disco C: que aparezcan en metadatos.\n"
                                    "3. Si el usuario pregunta qué documentos tienes, usa la lista de ESTRUCTURA DE ARCHIVOS arriba para responder.\n"
                                    "4. NUNCA digas que solo puedes ver un documento si ves varios en la lista de arriba.\n"
                                    "5. Mantén la continuidad del chat. Responde siempre en español profesional."
                    }
                }
            }
        )
        
        response = client.search(search_request)
        
        # Extraer resultados y mapear con DB para botones de acción (Open Doc)
        results = []
        from file_system_db import find_node_by_gcs_urn, get_node_full_path
        
        # Intentamos extraer el model_urn del request o contexto (fallback global)
        model_urn = data.get('model_urn') or "urn:adsk.viewing:fs.file:dXJuOmFkc2sub2JqZWN0czpvcy5vYmplY3Q6eWFzZXItcHF0MDgtdGFsYXJhL1BRVDhfVEFMQVJBLmR3Zw"

        for res in response.results:
            struct_data = res.document.derived_struct_data
            gcs_link = struct_data.get('link', '') 
            
            # Limpieza robusta de GCS_URN: gs://bucket/path -> path
            # Buscamos la primera barra después de gs://...
            if gcs_link.startswith("gs://"):
                path_part = gcs_link[5:] # Quitar gs://
                if "/" in path_part:
                    gcs_urn = path_part[path_part.find("/")+1:] # Tomar todo despues del bucket
                else:
                    gcs_urn = path_part
            else:
                gcs_urn = gcs_link
            
            # Buscar en DB
            node_info = find_node_by_gcs_urn(model_urn, gcs_urn)
            
            display_title = struct_data.get('title', res.document.name)
            node_id = None
            
            if node_info:
                node_id = node_info[0]
                db_name = node_info[1]
                db_metadata = node_info[2] or {}
                # PRIORIDAD: Breadcrumb Path (para mostrar subcarpetas) > Título extraído por IA > Nombre en DB
                display_title = get_node_full_path(node_id) or db_metadata.get('plano_titulo') or db_name or display_title

            # LIMPIEZA FINAL DE RUIDO (DiRoots/LocalPaths debris)
            if not node_info:
                if "\\" in display_title: display_title = display_title.split("\\")[-1]
                if "/" in display_title: display_title = display_title.split("/")[-1]
                # Solo si parece un ID técnico muy feo y no tiene extensión de archivo
                if len(display_title) > 40 and "." not in display_title:
                   display_title = "Documento Técnico"

            results.append({
                "id": res.id,
                "nodeId": node_id,
                "title": display_title,
                "link": gcs_link,
                "snippet": struct_data.get('snippets', [{}])[0].get('snippet', '')
            })

        answer = "No se encontró información suficiente en los documentos para responder esta pregunta."
        if response.summary and response.summary.summary_text:
            answer = response.summary.summary_text

        return jsonify({
            "success": True,
            "intent": "document_query",
            "answer": answer,
            "results": results,
            "model_urn": model_urn
        })

    except Exception as e:
        print(f"[AI] Universal Search Error: {e}")
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
        model = GenerativeModel("gemini-1.5-flash")
        
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
