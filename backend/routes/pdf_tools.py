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
        # 36 · cada marca pertenece a la VERSIÓN donde se dibujó (y de qué marca es copia).
        cur.execute('ALTER TABLE pdf_markups ADD COLUMN IF NOT EXISTS file_version_id UUID')
        cur.execute('ALTER TABLE pdf_markups ADD COLUMN IF NOT EXISTS llevada_de INTEGER')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_pdf_markups_node_version ON pdf_markups(file_node_id, file_version_id)')
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
            # 36 · POR VERSIÓN. Con `version_id` solo salen las marcas de ESA versión (las anteriores a la
            # migración, sin versión, cuentan como de la vigente) y además cuántas hay en las demás, para
            # el aviso «3 marcas en la V1 · Ver». Sin `version_id`, como siempre: todas.
            version = _uuid(request.args.get('version_id'))
            cond = 'AND m.page = %s' if page else ''
            params = [node_id, autor] + ([page] if page else [])
            if version:
                cond += """ AND (m.file_version_id = %s OR (m.file_version_id IS NULL AND n.current_version_id = %s))"""
                params += [version, version]
            # La visibilidad se filtra PRIMERO, sobre pdf_markups sola (file_nodes también tiene created_by).
            cur.execute("""SELECT m.id, m.page, m.kind, m.geometry, m.style, m.text_content,
                                  m.created_by, m.created_at, m.publicado, m.publicado_en,
                                  COALESCE(m.file_version_id, n.current_version_id)::text, v.version_number,
                                  m.llevada_de
                             FROM (SELECT * FROM pdf_markups
                                    WHERE file_node_id = %s
                                      AND (publicado OR created_by = %s)) m
                             JOIN file_nodes n ON n.id = m.file_node_id
                        LEFT JOIN file_versions v ON v.id = COALESCE(m.file_version_id, n.current_version_id)
                            WHERE TRUE """ + cond + """
                            ORDER BY m.id""", params)
            rows = [{
                "id": r[0], "page": r[1], "kind": r[2], "geometry": r[3],
                "style": r[4] or {}, "text": r[5], "created_by": r[6],
                "created_at": r[7].isoformat() if r[7] else None,
                "publicado": bool(r[8]),
                "publicado_en": r[9].isoformat() if r[9] else None,
                "version_id": r[10], "version_number": r[11], "llevada_de": r[12],
            } for r in cur.fetchall()]
            _con_enlaces(cur, rows)
            _con_observacion(cur, rows)
            en_otras = []
            if version:
                cur.execute("""SELECT v.id::text, v.version_number, count(*)
                                 FROM pdf_markups m
                                 JOIN file_nodes n ON n.id = m.file_node_id
                                 JOIN file_versions v ON v.id = COALESCE(m.file_version_id, n.current_version_id)
                                WHERE m.file_node_id = %s
                                  AND v.id <> %s
                                  AND (m.publicado OR m.created_by = %s)
                                GROUP BY v.id, v.version_number
                                ORDER BY v.version_number DESC""", (node_id, version, autor))
                en_otras = [{"version_id": r[0], "version_number": r[1], "marcas": r[2]} for r in cur.fetchall()]
        return jsonify({"success": True, "markups": rows, "en_otras_versiones": en_otras})
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
            version = _version_del_documento(cur, d['node_id'], d.get('version_id'))
            cur.execute("""INSERT INTO pdf_markups (file_node_id, model_urn, page, kind, geometry, style, text_content,
                                                    created_by, file_version_id)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (d['node_id'], d['model_urn'], d['page'], d['kind'],
                         json.dumps(d['geometry']), json.dumps(estilo),
                         d.get('text'), _user().get('name') or d.get('user'), version))
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
            viva = _observacion_viva(cur, markup_id)
            if viva:
                return jsonify({"success": False, "code": "OBSERVACION_ABIERTA",
                                "error": "La marca tiene la observación %s abierta: anúlala o ciérrala antes de borrarla." % viva}), 409
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
            viva = None if quiere else _observacion_viva(cur, markup_id)
            if viva:
                return jsonify({"success": False, "code": "OBSERVACION_ABIERTA",
                                "error": "La marca tiene la observación %s abierta: el responsable la necesita a la vista." % viva}), 409
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
                                  COALESCE(m.style->'fotos', '[]'::jsonb) ? %s,
                                  COALESCE(m.file_version_id, n.current_version_id)::text, v.version_number,
                                  COALESCE(m.file_version_id, n.current_version_id) = n.current_version_id
                             FROM pdf_markups m
                             JOIN file_nodes n ON n.id = m.file_node_id AND NOT n.is_deleted
                        LEFT JOIN file_versions v ON v.id = COALESCE(m.file_version_id, n.current_version_id)
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
                    'version': {'id': r[9], 'numero': r[10], 'vigente': bool(r[11])},
                })
        response = jsonify({"success": True, "citas": citas})
        response.headers['Cache-Control'] = 'private, no-store'
        return response
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ══ MARCAS POR VERSIÓN (16-oct-2026, migración 36) ═════════════════════════

def _version_del_documento(cur, node_id, pedida):
    """La versión donde nace una marca: la pedida si es de este documento; si no, la vigente."""
    pedida = _uuid(pedida)
    if pedida:
        cur.execute("SELECT id::text FROM file_versions WHERE id = %s AND file_node_id = %s", (pedida, node_id))
        fila = cur.fetchone()
        if fila:
            return fila[0]
    cur.execute("SELECT current_version_id::text FROM file_nodes WHERE id = %s", (node_id,))
    fila = cur.fetchone()
    return fila[0] if fila else None


@pdf_tools_bp.route('/api/pdf/markups/<int:markup_id>/llevar', methods=['POST'])
def llevar_a_la_vigente(markup_id):
    """«Llevar a la vigente»: COPIA una marca de una versión anterior a la vigente.

    No se mueve ni se copia nada solo: lo decide una persona, para la observación que
    sigue pendiente en la versión nueva. La copia es de quien la lleva, nace en
    borrador y dice de qué marca viene (`llevada_de`). La original no cambia: la
    observación sobre la V1 sigue siendo sobre la V1.
    """
    negativa = guardia_de_recurso('pdf_markups', markup_id)
    if negativa:
        return negativa
    autor = _user().get('name') or ''
    if not autor:
        return jsonify({"success": False, "error": "Autenticación requerida."}), 401
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT m.file_node_id::text, m.model_urn, m.page, m.kind, m.geometry, m.style,
                                  m.text_content, COALESCE(m.file_version_id, n.current_version_id)::text,
                                  n.current_version_id::text, v.version_number
                             FROM pdf_markups m
                             JOIN file_nodes n ON n.id = m.file_node_id AND NOT n.is_deleted
                        LEFT JOIN file_versions v ON v.id = COALESCE(m.file_version_id, n.current_version_id)
                            WHERE m.id = %s AND (m.publicado OR m.created_by = %s)""", (markup_id, autor))
            fila = cur.fetchone()
            if not fila:
                return jsonify({"success": False, "error": "La marca no existe."}), 404
            nodo, obra, pagina, kind, geometria, estilo, texto, version, vigente, numero = fila
            if not vigente:
                return jsonify({"success": False, "error": "El documento no tiene versión vigente."}), 409
            if version == vigente:
                return jsonify({"success": False, "error": "Esta marca ya está en la versión vigente."}), 409
            cur.execute("""INSERT INTO pdf_markups (file_node_id, model_urn, page, kind, geometry, style, text_content,
                                                    created_by, file_version_id, llevada_de)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (nodo, obra, pagina, kind, json.dumps(geometria or {}), json.dumps(estilo or {}),
                         texto, autor, vigente, markup_id))
            nuevo = cur.fetchone()[0]
            conn.commit()
        return jsonify({"success": True, "id": nuevo, "desde_version": numero})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


TOPE_CONSULTA_DE_CITAS = 100


@pdf_tools_bp.route('/api/pdf/citas-de', methods=['GET'])
def citas_de():
    """?ids=a,b,c → {id: {marcas, planos}}: el aviso de Archivos antes de suprimir.

    Solo cuenta lo que el usuario puede ver (marcas publicadas o suyas, en planos
    que puede abrir), con la misma regla que «Citado en». Un documento sin
    citas no aparece. No bloquea nada: el borrado sigue siendo decisión de quien
    borra.
    """
    ids = []
    for valor in (request.args.get('ids') or '').split(','):
        nid = _uuid(valor.strip())
        if nid and nid not in ids:
            ids.append(nid)
    if not ids:
        return jsonify({"success": True, "citas": {}})
    if len(ids) > TOPE_CONSULTA_DE_CITAS:
        ids = ids[:TOPE_CONSULTA_DE_CITAS]
    autor = _user().get('name') or ''
    salida = {}
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            docs = _documentos(cur, ids)
            cache = {}
            for nid in ids:
                doc = docs.get(nid)
                if not doc or guardia_de_recurso('file_nodes', nid) or not _puede_ver(nid, doc[0], cache):
                    continue
                cur.execute("""SELECT m.file_node_id::text, count(*)
                                 FROM pdf_markups m
                                 JOIN file_nodes n ON n.id = m.file_node_id AND NOT n.is_deleted
                                WHERE n.model_urn = %s
                                  AND (COALESCE(m.style->'citas', '[]'::jsonb) ? %s
                                       OR COALESCE(m.style->'fotos', '[]'::jsonb) ? %s)
                                  AND (m.publicado OR m.created_by = %s)
                                GROUP BY m.file_node_id""", (doc[0], nid, nid, autor))
                planos = [(r[0], r[1]) for r in cur.fetchall() if _puede_ver(r[0], doc[0], cache)]
                if planos:
                    salida[nid] = {'nombre': doc[1], 'marcas': sum(n for _, n in planos), 'planos': len(planos)}
        response = jsonify({"success": True, "citas": salida})
        response.headers['Cache-Control'] = 'private, no-store'
        return response
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ══ OBSERVACIÓN DE DOCUMENTO desde una marca (20-oct-2026, migración 37) ══════
#
# La marca DIBUJA; lo que hay que corregir se gestiona en una OBSERVACIÓN, que es
# una incidencia (`doc_issues`, tipo OBSERVACION) con todo lo suyo: responsable
# miembro de la obra, verificador designado, fecha límite, evidencia de la
# corrección, historial que solo crece y «Mi trabajo» con aviso. Los actos
# (corregir, verificar o reabrir, anular, comentar) son los de /api/issues: aquí
# solo se CREA desde la marca y se LEE junto a ella.
#
#   · La levanta el AUTOR de la marca, que queda como quien detecta y quien
#     verifica (escrito, no deducido; regla del objeto en flujo_de_issue).
#   · El responsable es otro miembro de la obra: quien corrige no verifica.
#   · Una marca tiene como mucho UNA observación viva a la vez. Cerrada esa,
#     un problema nuevo es una observación nueva.
#   · Al levantarla, la marca se publica: una observación sobre un borrador que
#     el responsable no puede ver no se puede atender.
# Decisión del propietario: docs/ux/MARCAS_REVISION_LO_PROFESIONAL.md, opción A.

ORIGEN_MARCA = 'MARCA'


def _observacion_viva(cur, markup_id):
    """El código de la observación ABIERTA de la marca, o None.

    Mientras haya una, la marca no se retira ni se borra: es lo que el responsable
    tiene que ver para corregir, y lo que la observación señala en la hoja.
    """
    import flujo_de_issue as iss
    cur.execute("""SELECT codigo FROM doc_issues
                    WHERE origen_tipo = %s AND origen_id = %s AND estado = ANY(%s)
                    LIMIT 1""", (ORIGEN_MARCA, str(markup_id), list(iss.VIVOS)))
    fila = cur.fetchone()
    return fila[0] if fila else None


def _nombres(cur, ids):
    ids = sorted({int(i) for i in ids if i})
    if not ids:
        return {}
    cur.execute("SELECT id, COALESCE(NULLIF(name, ''), email) FROM users WHERE id = ANY(%s)", (ids,))
    return {r[0]: r[1] for r in cur.fetchall()}


def _hoy_en_obra():
    from datetime import datetime, timedelta, timezone
    return (datetime.now(timezone.utc) - timedelta(hours=5)).date()   # Perú, UTC−5 sin horario de verano


def _resumen_de_observacion(r, nombres, hoy):
    """(id, codigo, estado, titulo, responsable_id, verificador_id, vence_en, origen_id) → lo que pinta la hoja."""
    import flujo_de_issue as iss
    vence = r[6].date() if hasattr(r[6], 'date') else r[6]
    return {
        'id': str(r[0]), 'codigo': r[1], 'estado': r[2], 'titulo': r[3],
        'responsable_id': r[4], 'responsable': nombres.get(r[4]),
        'verificador_id': r[5], 'verificador': nombres.get(r[5]),
        'vence_en': vence.isoformat() if vence else None,
        'vencida': bool(vence and vence < hoy and r[2] in iss.VIVOS),
        'cerrada': iss.esta_cerrado(r[2]),
    }


def _con_observacion(cur, rows):
    """Pone en cada marca su observación más reciente (o None). Una consulta para toda la hoja."""
    import flujo_de_issue as iss
    for m in rows:
        m['observacion'] = None
    ids = [str(m['id']) for m in rows if m.get('id') is not None]
    if not ids:
        return rows
    cur.execute("""SELECT DISTINCT ON (origen_id)
                          id, codigo, estado, titulo, responsable_id, verificador_id, vence_en, origen_id
                     FROM doc_issues
                    WHERE origen_tipo = %s AND origen_id = ANY(%s) AND tipo = %s
                    ORDER BY origen_id, creado_en DESC, id DESC""", (ORIGEN_MARCA, ids, iss.OBSERVACION))
    filas = cur.fetchall()
    nombres = _nombres(cur, [x for r in filas for x in (r[4], r[5])])
    hoy = _hoy_en_obra()
    por_marca = {r[7]: _resumen_de_observacion(r, nombres, hoy) for r in filas}
    for m in rows:
        m['observacion'] = por_marca.get(str(m.get('id')))
    return rows


def _marca_para_observacion(cur, markup_id):
    cur.execute("""SELECT m.created_by, m.publicado, m.page, m.kind, m.file_node_id::text, n.model_urn, n.name,
                          COALESCE(m.file_version_id, n.current_version_id)::text, v.version_number
                     FROM pdf_markups m
                     JOIN file_nodes n ON n.id = m.file_node_id
                LEFT JOIN file_versions v ON v.id = COALESCE(m.file_version_id, n.current_version_id)
                    WHERE m.id = %s""", (markup_id,))
    return cur.fetchone()


@pdf_tools_bp.route('/api/pdf/markups/<int:markup_id>/observacion', methods=['POST'])
def crear_observacion(markup_id):
    """Levanta una OBSERVACIÓN DE DOCUMENTO desde una marca. Solo su autor.

    Cuerpo: {titulo, descripcion?, responsable_id, vence_en: 'AAAA-MM-DD'}.
    """
    import encargos as _enc
    import flujo_de_issue as iss
    import flujo_de_registro as reg
    from datetime import date
    from db import log_activity, resolve_project_id
    from perimetro_de_obra import guardia_de_obra

    negativa = guardia_de_recurso('pdf_markups', markup_id)
    if negativa:
        return negativa
    d = request.get_json(silent=True) or {}
    u = _user()
    uid, autor = u.get('id'), u.get('name') or ''
    actor = u.get('email') or autor or 'desconocido'
    if not uid or not autor:
        return jsonify({"success": False, "error": "Sesión sin identidad."}), 401
    titulo = str(d.get('titulo') or '').strip()[:180]
    if not titulo:
        return jsonify({"success": False, "error": "Escribe qué hay que corregir."}), 400
    descripcion = str(d.get('descripcion') or '').strip()[:2000] or None
    try:
        responsable = int(d.get('responsable_id'))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Elige a quién le toca corregir.",
                        "code": "SIN_RESPONSABLE"}), 400
    if responsable == uid:
        return jsonify({"success": False,
                        "error": "La verificas tú, que la detectaste: el responsable de corregir tiene que ser otra persona.",
                        "code": "VERIFICADOR_ES_RESPONSABLE"}), 409
    try:
        vence = date.fromisoformat(str(d.get('vence_en') or '')[:10])
    except ValueError:
        return jsonify({"success": False, "error": "Pon una fecha límite."}), 400
    if vence < _hoy_en_obra():
        return jsonify({"success": False, "error": "La fecha límite no puede estar en el pasado."}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            fila = _marca_para_observacion(cur, markup_id)
            if not fila:
                return jsonify({"success": False, "error": "La marca no existe."}), 404
            creador, publicado, pagina, kind, nodo, model_urn, nombre, version_id, version_num = fila
            if creador != autor:
                # El borrador de otro no existe para ti; sobre la marca publicada de otro, la observación
                # la levanta quien la dibujó (es quien sabe qué pidió y quien la verificará).
                if not publicado:
                    return jsonify({"success": False, "error": "La marca no existe."}), 404
                return jsonify({"success": False,
                                "error": "La observación la levanta quien dibujó la marca."}), 403
            obra = resolve_project_id(model_urn)
            if not obra:
                return jsonify({"success": False, "error": "No se pudo determinar la obra."}), 400
            corte = guardia_de_obra(obra, 'levantar una observación')
            if corte:
                return corte
            for quien, persona in (('responsable', responsable), ('verificador', uid)):
                cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s', (obra, persona))
                if not cur.fetchone():
                    return jsonify({"success": False,
                                    "error": "El %s no es miembro de esta obra." % quien,
                                    "code": "%s_NO_MIEMBRO" % quien.upper()}), 409
            viva = _observacion_viva(cur, markup_id)
            if viva:
                return jsonify({"success": False,
                                "error": "Esta marca ya tiene una observación abierta (%s)." % viva,
                                "code": "YA_TIENE_OBSERVACION"}), 409

            ubicacion = ' · '.join(x for x in (nombre, 'V%s' % version_num if version_num else '',
                                               'hoja %s' % pagina) if x)[:300]
            evidencia = [{'tipo': 'marca', 'marca': markup_id, 'documento': nodo, 'nombre': nombre,
                          'version_id': version_id, 'version_numero': version_num, 'pagina': pagina,
                          'clase': kind}]
            iid = codigo = None
            for intento in range(5):
                codigo = reg.siguiente_codigo(cur, iss.SEMANTICA, obra)
                try:
                    cur.execute('SAVEPOINT alta_observacion')
                    cur.execute("""INSERT INTO doc_issues
                        (project_id, model_urn, codigo, tipo, titulo, descripcion, ubicacion,
                         autor_id, responsable_id, verificador_id, created_by, vence_en, evidencia,
                         origen_tipo, origen_id, history)
                        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                        RETURNING id""",
                        (obra, model_urn, codigo, iss.OBSERVACION, titulo, descripcion, ubicacion,
                         uid, responsable, uid, actor, vence, json.dumps(evidencia),
                         ORIGEN_MARCA, str(markup_id),
                         json.dumps([reg.entrada('detected', actor, codigo=codigo, tipo=iss.OBSERVACION,
                                                 desde_marca=markup_id)])))
                    iid = cur.fetchone()[0]
                    cur.execute('RELEASE SAVEPOINT alta_observacion')
                    break
                except Exception:
                    cur.execute('ROLLBACK TO SAVEPOINT alta_observacion')
                    if intento == 4:
                        raise
            if not publicado:
                cur.execute("""UPDATE pdf_markups SET publicado = TRUE, publicado_en = CURRENT_TIMESTAMP,
                                      publicado_por = %s
                                WHERE id = %s""", (uid, markup_id))
            conn.commit()
            # LA PELOTA, en el mismo acto: al responsable le aparece en «Mi trabajo» y recibe aviso.
            # En su propio try, como en el protocolo: si el encargo falla, la observación ya existe.
            try:
                eid = _enc.abrir(cur, 'ISSUE', iid, 'Corregir %s: %s' % (codigo, titulo),
                                 destino_usuario=responsable, vence_en=vence, creado_por=actor)
                if eid:
                    _enc.avisar(cur, eid)
                conn.commit()
            except Exception as e:
                conn.rollback()
                print('[pdf] observación %s creada sin encargo: %s' % (codigo, str(e)[:120]))
            log_activity(model_urn, 'CREATE', 'ISSUE', str(iid), codigo, actor,
                         {'tipo': iss.OBSERVACION, 'responsable': responsable, 'marca': markup_id})
            marca = {'id': markup_id}
            _con_observacion(cur, [marca])
        return jsonify({"success": True, "observacion": marca['observacion'], "publicado": True}), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@pdf_tools_bp.route('/api/pdf/markups/<int:markup_id>/observacion', methods=['GET'])
def leer_observacion(markup_id):
    """La observación más reciente de la marca, con su historial y la evidencia de la corrección.

    Los documentos de la evidencia se nombran como las citas: lo que no puedes abrir sale «restringido».
    """
    import flujo_de_issue as iss
    negativa = guardia_de_recurso('pdf_markups', markup_id)
    if negativa:
        return negativa
    autor = _user().get('name') or ''
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT created_by, publicado FROM pdf_markups WHERE id = %s", (markup_id,))
            fila = cur.fetchone()
            if not fila or (not fila[1] and fila[0] != autor):
                return jsonify({"success": False, "error": "La marca no existe."}), 404
            cur.execute("""SELECT id, codigo, estado, titulo, responsable_id, verificador_id, vence_en, origen_id,
                                  descripcion, autor_id, evidencia_correccion, history, autoverificacion,
                                  creado_en
                             FROM doc_issues
                            WHERE origen_tipo = %s AND origen_id = %s AND tipo = %s
                            ORDER BY creado_en DESC, id DESC LIMIT 1""",
                        (ORIGEN_MARCA, str(markup_id), iss.OBSERVACION))
            r = cur.fetchone()
            if not r:
                return jsonify({"success": True, "observacion": None})
            nombres = _nombres(cur, (r[4], r[5], r[9]))
            obs = _resumen_de_observacion(r, nombres, _hoy_en_obra())
            corregida = []
            ids = [_uuid(e.get('documento')) for e in (r[10] or []) if isinstance(e, dict) and _uuid(e.get('documento'))]
            docs, cache = _documentos(cur, ids), {}
            for e in r[10] or []:
                if not isinstance(e, dict):
                    continue
                nid = _uuid(e.get('documento'))
                item = {'por': e.get('por'), 'comentario': e.get('comentario')}
                if nid:
                    doc = docs.get(nid)
                    if not doc:
                        item.update({'id': nid, 'eliminado': True})
                    elif _puede_ver(nid, doc[0], cache):
                        item.update({'id': nid, 'nombre': doc[1]})
                    else:
                        item.update({'id': nid, 'restringido': True})
                corregida.append(item)
            obs.update({
                'descripcion': r[8], 'autor_id': r[9], 'autor': nombres.get(r[9]),
                'evidencia_correccion': corregida,
                'historial': [h for h in (r[11] or []) if isinstance(h, dict)],
                'autoverificacion': bool(r[12]),
                'creado_en': r[13].isoformat() if r[13] else None,
            })
        response = jsonify({"success": True, "observacion": obs})
        response.headers['Cache-Control'] = 'private, no-store'
        return response
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
