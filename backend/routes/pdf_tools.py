"""Herramientas de ingeniería sobre PDF: anotaciones (markups) y calibración de escala.

Las geometrías se guardan en coordenadas del espacio PDF (puntos, origen
abajo-izquierda) para que sean independientes del zoom/rotación del visor.
"""
from esquema_congelado import solo_con_ddl
import json
import os
import traceback
import uuid
from flask import Blueprint, request, jsonify, g
from db import get_db_connection
from folder_permissions import check_folder_permission
from perimetro_de_obra import guardia_de_recurso

pdf_tools_bp = Blueprint('pdf_tools', __name__)


@solo_con_ddl
def ensure_pdf_tools_tables():
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS pdf_markups (
                id SERIAL PRIMARY KEY,
                file_node_id UUID NOT NULL,
                model_urn TEXT NOT NULL,
                page INTEGER NOT NULL,
                kind TEXT NOT NULL,
                geometry JSONB NOT NULL,
                style JSONB DEFAULT '{}'::jsonb,
                text_content TEXT,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )''')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_pdf_markups_node_page ON pdf_markups(file_node_id, page)')
        cur.execute('''
            CREATE TABLE IF NOT EXISTS pdf_calibrations (
                file_node_id UUID NOT NULL,
                page INTEGER NOT NULL,
                units_per_pdf DOUBLE PRECISION NOT NULL,
                display_unit TEXT DEFAULT 'm',
                updated_by TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (file_node_id, page)
            )''')
        conn.commit()
        _migrar_a_uuid(cur, conn)


def _migrar_a_uuid(cur, conn):
    """`file_node_id` tiene que ser UUID, porque `file_nodes.id` LO ES.

    EL DEFECTO
    ----------
    Las dos tablas se crearon con `file_node_id INTEGER` mientras `file_nodes.id`
    es UUID. Consecuencia: crear un markup sobre CUALQUIER documento real
    devolvia 500 --`invalid input syntax for type integer`--. La herramienta
    estaba en el visor de PDF, el usuario la veia, y el backend la rechazaba
    siempre. Lo encontro el ensayo del expediente el 21-ago-2026.

    COMO SE MIGRA
    -------------
    Solo si TODAS las filas convierten. Si alguna no --por ejemplo una fila
    huerfana con `file_node_id = 123`, que no apunta a ningun documento y nunca
    pudo mostrarse-- NO se toca nada y SE DICE cual es y por que. Convertir
    «arreglando» filas seria perder informacion con buena intencion, y decidir
    que se hace con un dato que no entendemos no es cosa del arranque.
    """
    for tabla in ('pdf_markups', 'pdf_calibrations'):
        try:
            cur.execute("""SELECT format_type(a.atttypid, a.atttypmod)
                             FROM pg_class c JOIN pg_attribute a ON a.attrelid = c.oid
                            WHERE c.relname = %s AND a.attname = 'file_node_id'""",
                        (tabla,))
            fila = cur.fetchone()
            if not fila or fila[0] == 'uuid':
                continue
            cur.execute("SELECT count(*) FROM %s WHERE file_node_id::text "
                        "  !~ '^[0-9a-fA-F-]{36}$'" % tabla)
            rebeldes = cur.fetchone()[0]
            if rebeldes:
                cur.execute("SELECT DISTINCT file_node_id FROM %s WHERE "
                            "  file_node_id::text !~ '^[0-9a-fA-F-]{36}$' LIMIT 5" % tabla)
                print('[pdf] AVISO: %s.file_node_id sigue siendo INTEGER. %d fila(s) '
                      'no convierten a UUID (%s). NO se migra y NO se borra nada: '
                      'crear markups seguira fallando hasta que se decida que hacer '
                      'con esas filas.'
                      % (tabla, rebeldes,
                         ', '.join(str(r[0]) for r in cur.fetchall())))
                conn.commit()
                continue
            cur.execute('ALTER TABLE %s ALTER COLUMN file_node_id TYPE UUID '
                        '  USING file_node_id::text::uuid' % tabla)
            conn.commit()
            print('[pdf] %s.file_node_id migrado a UUID.' % tabla)
        except Exception as e:
            conn.rollback()
            print('[pdf] %s.file_node_id no migrado: %s' % (tabla, str(e)[:90]))


def _user():
    u = getattr(g, 'current_user', None)
    return (u or {})


@pdf_tools_bp.route('/api/pdf/markups', methods=['GET'])
def list_markups():
    node_id = request.args.get('node_id')
    page = request.args.get('page')
    if not node_id:
        return jsonify({"success": False, "error": "Falta node_id"}), 400
    # Las ESCRITURAS de este blueprint llevaban guardia desde el principio; las
    # LECTURAS no, asi que cualquier sesion leia las marcas de cualquier obra
    # -- y una nube de revision o una medicion dice tanto del plano como el
    # plano mismo. La misma guardia que ya usa el POST de aqui al lado.
    negativa = guardia_de_recurso('file_nodes', node_id)
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # GAP 02 · PERSONAL vs PUBLICADO.
            #
            # Cada quien ve LO PUBLICADO y ADEMAS LO SUYO todavia sin publicar.
            # Un markup es primero un BORRADOR de quien lo dibuja: si cada trazo
            # tentativo apareciera para toda la obra en el acto, la gente
            # dejaria de marcar sobre el plano y volveria a las capturas de
            # pantalla por WhatsApp -- que es exactamente lo que este producto
            # existe para evitar.
            #
            # El filtro va en el SQL y no en Python: traer lo ajeno sin publicar
            # y descartarlo despues ya seria haberlo enviado por la red.
            autor = _user().get('name') or ''
            cond = 'AND page = %s' if page else ''
            params = [node_id] + ([page] if page else []) + [autor]
            cur.execute("""SELECT id, page, kind, geometry, style, text_content,
                                  created_by, created_at, publicado, publicado_en
                             FROM pdf_markups
                            WHERE file_node_id = %s """ + cond + """
                              AND (publicado OR created_by = %s)
                            ORDER BY id""", params)
            rows = [{
                "id": r[0], "page": r[1], "kind": r[2], "geometry": r[3],
                "style": r[4] or {}, "text": r[5], "created_by": r[6],
                "created_at": r[7].isoformat() if r[7] else None,
                "publicado": bool(r[8]),
                "publicado_en": r[9].isoformat() if r[9] else None,
            } for r in cur.fetchall()]
            _con_enlaces(cur, rows)
        return jsonify({"success": True, "markups": rows})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@pdf_tools_bp.route('/api/pdf/markups', methods=['POST'])
def create_markup():
    d = request.get_json() or {}
    required = ('node_id', 'model_urn', 'page', 'kind', 'geometry')
    if any(k not in d for k in required):
        return jsonify({"success": False, "error": f"Faltan campos {required}"}), 400
    # Se comprueba contra el NODO del documento, no contra el model_urn del
    # cuerpo: el model_urn lo elige quien llama, el nodo dice de que obra es.
    negativa = guardia_de_recurso('file_nodes', d['node_id'])
    if negativa:
        return negativa
    # Las citas y las fotos NO entran al crear: van por el PATCH, que comprueba
    # que cada documento es de la obra y que quien cita puede abrirlo.
    estilo = dict(d.get('style') or {})
    estilo.pop('citas', None)
    estilo.pop('fotos', None)
    if d['kind'] == 'sello':
        sello, error = _sello(estilo.get('sello'))
        if error:
            return jsonify({"success": False, "error": error}), 400
        estilo['sello'] = sello
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO pdf_markups (file_node_id, model_urn, page, kind, geometry, style, text_content, created_by)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (d['node_id'], d['model_urn'], d['page'], d['kind'],
                         json.dumps(d['geometry']), json.dumps(estilo),
                         d.get('text'), _user().get('name') or d.get('user')))
            new_id = cur.fetchone()[0]
            conn.commit()
        return jsonify({"success": True, "id": new_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@pdf_tools_bp.route('/api/pdf/markups/<int:markup_id>', methods=['DELETE'])
def delete_markup(markup_id):
    negativa = guardia_de_recurso('pdf_markups', markup_id)
    if negativa:
        return negativa
    try:
        u = _user()
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Cada quien borra lo suyo; admin borra todo
            if u.get('role') == 'admin':
                cur.execute("DELETE FROM pdf_markups WHERE id = %s", (markup_id,))
            else:
                cur.execute("DELETE FROM pdf_markups WHERE id = %s AND created_by = %s",
                            (markup_id, u.get('name')))
            deleted = cur.rowcount
            conn.commit()
        if not deleted:
            return jsonify({"success": False, "error": "No encontrado o sin permiso"}), 403
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@pdf_tools_bp.route('/api/pdf/markups/<int:markup_id>/publicar', methods=['POST'])
def publicar_markup(markup_id):
    """Publicar es un ACTO, y solo de su autor.

    No se publica «al guardar» ni con un interruptor global: quien dibujo la
    marca decide cuando deja de ser su borrador. Un administrador tampoco
    publica por el -- publicar es firmar que esa marca ya es para todos, y esa
    firma es de quien la hizo.

    Despublicar SI se permite: retirar del plano una marca propia que ya no
    aplica es lo contrario de reescribir la historia -- la marca sigue siendo
    suya y sigue existiendo, solo deja de proponerse a los demas.
    """
    negativa = guardia_de_recurso('pdf_markups', markup_id)
    if negativa:
        return negativa
    quiere = bool((request.get_json(silent=True) or {}).get('publicado', True))
    autor = _user().get('name') or ''
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""UPDATE pdf_markups
                              SET publicado = %s,
                                  publicado_en = CASE WHEN %s THEN CURRENT_TIMESTAMP ELSE NULL END,
                                  publicado_por = CASE WHEN %s THEN %s ELSE NULL END
                            WHERE id = %s AND created_by = %s
                        RETURNING publicado""",
                        (quiere, quiere, quiere, _user().get('id'), markup_id, autor))
            fila = cur.fetchone()
            conn.commit()
        if not fila:
            return jsonify({"success": False,
                            "error": "Solo el autor de la marca puede publicarla o retirarla."}), 403
        return jsonify({"success": True, "publicado": fila[0]})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@pdf_tools_bp.route('/api/pdf/calibration', methods=['GET'])
def get_calibration():
    node_id = request.args.get('node_id')
    if not node_id:
        return jsonify({"success": False, "error": "Falta node_id"}), 400
    negativa = guardia_de_recurso('file_nodes', node_id)
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT page, units_per_pdf, display_unit FROM pdf_calibrations WHERE file_node_id = %s",
                        (node_id,))
            cals = {str(r[0]): {"units_per_pdf": r[1], "display_unit": r[2]} for r in cur.fetchall()}
        return jsonify({"success": True, "calibrations": cals})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@pdf_tools_bp.route('/api/pdf/calibration', methods=['PUT'])
def set_calibration():
    d = request.get_json() or {}
    if any(k not in d for k in ('node_id', 'page', 'units_per_pdf')):
        return jsonify({"success": False, "error": "Faltan node_id/page/units_per_pdf"}), 400
    # La calibracion decide a cuantos metros equivale un pixel del plano: con
    # ella se miden longitudes. No puede ajustarla quien no es de la obra.
    negativa = guardia_de_recurso('file_nodes', d['node_id'])
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO pdf_calibrations (file_node_id, page, units_per_pdf, display_unit, updated_by)
                           VALUES (%s,%s,%s,%s,%s)
                           ON CONFLICT (file_node_id, page) DO UPDATE SET
                             units_per_pdf = EXCLUDED.units_per_pdf,
                             display_unit = EXCLUDED.display_unit,
                             updated_by = EXCLUDED.updated_by,
                             updated_at = CURRENT_TIMESTAMP""",
                        (d['node_id'], d['page'], d['units_per_pdf'],
                         d.get('display_unit', 'm'), _user().get('name')))
            conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


# ══ FOTO, SELLO Y REFERENCIAS (16-oct-2026) ════════════════════════════════
#
# Una marca puede CITAR documentos de la obra (`style.citas`) y una marca de
# foto lleva sus fotos (`style.fotos`): las dos son listas de ids de
# file_nodes. Sin migración: `style` ya es JSONB.
#
# Tres reglas, las mismas que el sustento de metrados y los grupos:
#   1. Solo documentos VIVOS de la MISMA obra que el plano.
#   2. Citar exige poder abrir lo citado.
#   3. Una cita NO concede acceso: al listar, lo que el usuario no puede abrir
#      sale como «restringido», sin nombre.
# La foto es un DOCUMENTO (se sube a MULTIMEDIA/ con su versión, sus permisos y
# su auditoría) y la marca la cita: la misma foto puede estar en varios planos.

TOPE_CITAS = 20
TOPE_FOTOS = 12
EXTENSIONES_DE_FOTO = ('.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif', '.bmp')
# El sello es una NOTA sobre la hoja: no cambia el estado del documento. La
# decisión de verdad va por Revisiones. Por eso sus estados son de revisión de
# campo y no «Aprobado».
ESTADOS_DE_SELLO = {
    'revisado': 'Revisado',
    'conforme': 'Conforme',
    'con_observaciones': 'Conforme con observaciones',
    'observado': 'Observado',
}


def _user():
    return getattr(g, 'current_user', None) or {}


def _uuid(valor):
    try:
        return str(uuid.UUID(str(valor)))
    except (TypeError, ValueError, AttributeError):
        return None


def _sello(valor):
    """(sello limpio, error)."""
    if not isinstance(valor, dict):
        return None, 'Al sello le falta su contenido.'
    estado = str(valor.get('estado') or '').strip()
    if estado not in ESTADOS_DE_SELLO:
        return None, 'El estado del sello no es válido: ' + ', '.join(ESTADOS_DE_SELLO.values()) + '.'
    titulo = str(valor.get('titulo') or '').strip()[:80]
    comentario = str(valor.get('comentario') or '').strip()[:300]
    return {'estado': estado, 'titulo': titulo, 'comentario': comentario}, None


def _ids(valor, tope, que):
    """(lista de ids únicos y en orden, error)."""
    if not isinstance(valor, list):
        return None, 'Las %s van en una lista.' % que
    ids = []
    for v in valor:
        nid = _uuid(v)
        if not nid:
            return None, 'Una de las %s no es un documento válido.' % que
        if nid not in ids:
            ids.append(nid)
    if len(ids) > tope:
        return None, 'Como mucho %d %s por marca.' % (tope, que)
    return ids, None


def _documentos(cur, ids):
    """{id: (model_urn, nombre, tipo)} de los documentos vivos entre `ids`."""
    if not ids:
        return {}
    cur.execute("""SELECT id::text, model_urn, name, node_type FROM file_nodes
                    WHERE id::text = ANY(%s) AND NOT is_deleted""", (list(ids),))
    return {r[0]: (r[1], r[2], r[3]) for r in cur.fetchall()}


def _puede_ver(nid, obra, cache):
    if nid not in cache:
        cache[nid] = check_folder_permission(_user(), nid, obra, 'viewer', 'ver un documento citado') is None
    return cache[nid]


def _con_enlaces(cur, rows):
    """Pone en cada marca sus `citas` y `fotos` con nombre, o restringidas."""
    todos = set()
    for m in rows:
        estilo = m.get('style') or {}
        for clave in ('citas', 'fotos'):
            todos.update(i for i in (estilo.get(clave) or []) if _uuid(i))
    if not todos:
        for m in rows:
            m['citas'], m['fotos'] = [], []
        return rows
    docs = _documentos(cur, todos)
    cache = {}
    for m in rows:
        estilo = m.get('style') or {}
        for clave in ('citas', 'fotos'):
            salida = []
            for nid in estilo.get(clave) or []:
                doc = docs.get(nid)
                if not doc:
                    salida.append({'id': nid, 'eliminado': True})
                elif _puede_ver(nid, doc[0], cache):
                    salida.append({'id': nid, 'nombre': doc[1]})
                else:
                    salida.append({'id': nid, 'restringido': True})
            m[clave] = salida
    return rows


@pdf_tools_bp.route('/api/pdf/markups/<int:markup_id>', methods=['PATCH'])
def editar_markup(markup_id):
    """Citas, fotos, sello y orientación de una marca. Solo su autor.

    Cuerpo: {citas?: [id], fotos?: [id], sello?: {...}, angulo?: grados}. Lo que
    no viene no cambia. Citar exige poder abrir lo citado (regla 2).
    """
    negativa = guardia_de_recurso('pdf_markups', markup_id)
    if negativa:
        return negativa
    d = request.get_json(silent=True) or {}
    autor = _user().get('name') or ''
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT m.kind, m.style, m.geometry, m.created_by, n.model_urn
                             FROM pdf_markups m
                             JOIN file_nodes n ON n.id = m.file_node_id
                            WHERE m.id = %s""", (markup_id,))
            fila = cur.fetchone()
            if not fila:
                return jsonify({"success": False, "error": "La marca no existe."}), 404
            kind, estilo, geometria, creador, obra = fila
            if not autor or creador != autor:
                return jsonify({"success": False, "error": "Solo el autor de la marca puede cambiarla."}), 403
            estilo, geometria = dict(estilo or {}), dict(geometria or {})
            cache = {}
            for clave, tope, que in (('citas', TOPE_CITAS, 'referencias'), ('fotos', TOPE_FOTOS, 'fotos')):
                if clave not in d:
                    continue
                if clave == 'fotos' and kind != 'foto':
                    return jsonify({"success": False, "error": "Solo una marca de foto lleva fotos."}), 400
                ids, error = _ids(d[clave], tope, que)
                if error:
                    return jsonify({"success": False, "error": error}), 400
                docs = _documentos(cur, ids)
                for nid in ids:
                    doc = docs.get(nid)
                    if not doc or doc[2] != 'FILE':
                        return jsonify({"success": False, "error": "Uno de los documentos ya no existe."}), 404
                    if doc[0] != obra:
                        return jsonify({"success": False,
                                        "error": "Solo se pueden citar documentos de la misma obra."}), 400
                    if clave == 'fotos' and os.path.splitext(doc[1] or '')[1].lower() not in EXTENSIONES_DE_FOTO:
                        return jsonify({"success": False, "error": "«%s» no es una foto." % doc[1]}), 400
                    if not _puede_ver(nid, obra, cache):
                        return jsonify({"success": False,
                                        "error": "No puedes citar un documento que no puedes abrir."}), 403
                estilo[clave] = ids
            if 'sello' in d:
                if kind != 'sello':
                    return jsonify({"success": False, "error": "Esta marca no es un sello."}), 400
                sello, error = _sello(d['sello'])
                if error:
                    return jsonify({"success": False, "error": error}), 400
                estilo['sello'] = sello
            if 'angulo' in d:
                if kind != 'foto':
                    return jsonify({"success": False, "error": "Solo se orienta una marca de foto."}), 400
                try:
                    geometria['ang'] = round(float(d['angulo']) % 360, 1)
                except (TypeError, ValueError):
                    return jsonify({"success": False, "error": "Ángulo no válido."}), 400
            cur.execute("UPDATE pdf_markups SET style = %s, geometry = %s WHERE id = %s",
                        (json.dumps(estilo), json.dumps(geometria), markup_id))
            marca = {'id': markup_id, 'kind': kind, 'style': estilo, 'geometry': geometria}
            _con_enlaces(cur, [marca])
            conn.commit()
        return jsonify({"success": True, "markup": marca})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@pdf_tools_bp.route('/api/pdf/citado-en', methods=['GET'])
def citado_en():
    """?node_id=<documento>: las marcas de qué planos citan este documento.

    Es el sentido que ACC no tiene. Solo marcas publicadas o propias, y solo de
    planos que el usuario puede abrir: saber que un plano cita una foto ya dice
    algo del plano (regla 3).
    """
    nid = _uuid(request.args.get('node_id'))
    if not nid:
        return jsonify({"success": False, "error": "Documento no válido."}), 400
    negativa = guardia_de_recurso('file_nodes', nid)
    if negativa:
        return negativa
    autor = _user().get('name') or ''
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT model_urn FROM file_nodes WHERE id = %s AND NOT is_deleted", (nid,))
            fila = cur.fetchone()
            if not fila:
                return jsonify({"success": False, "error": "Documento no encontrado."}), 404
            obra = fila[0]
            cache = {}
            if not _puede_ver(nid, obra, cache):
                return jsonify({"success": False, "error": "No tienes acceso a este documento."}), 403
            cur.execute("""SELECT m.id, m.kind, m.page, m.file_node_id::text, n.name,
                                  m.created_by, m.created_at, m.publicado,
                                  COALESCE(m.style->'fotos', '[]'::jsonb) ? %s
                             FROM pdf_markups m
                             JOIN file_nodes n ON n.id = m.file_node_id AND NOT n.is_deleted
                            WHERE n.model_urn = %s
                              AND (COALESCE(m.style->'citas', '[]'::jsonb) ? %s
                                   OR COALESCE(m.style->'fotos', '[]'::jsonb) ? %s)
                              AND (m.publicado OR m.created_by = %s)
                            ORDER BY n.name, m.page, m.id
                            LIMIT 200""", (nid, obra, nid, nid, autor))
            citas = []
            for r in cur.fetchall():
                if not _puede_ver(r[3], obra, cache):
                    continue
                citas.append({
                    'marca': r[0], 'tipo': r[1], 'pagina': r[2],
                    'plano': {'id': r[3], 'nombre': r[4]},
                    'autor': r[5], 'fecha': r[6].isoformat() if r[6] else None,
                    'publicado': bool(r[7]), 'como': 'foto' if r[8] else 'referencia',
                })
        response = jsonify({"success": True, "citas": citas})
        response.headers['Cache-Control'] = 'private, no-store'
        return response
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
