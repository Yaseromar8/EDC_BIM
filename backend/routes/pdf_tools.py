"""Herramientas de ingeniería sobre PDF: anotaciones (markups) y calibración de escala.

Las geometrías se guardan en coordenadas del espacio PDF (puntos, origen
abajo-izquierda) para que sean independientes del zoom/rotación del visor.
"""
from esquema_congelado import solo_con_ddl
import json
import re
import os
import traceback
import uuid
from flask import Blueprint, request, jsonify, g
from db import get_db_connection
from folder_permissions import check_folder_permission
from perimetro_de_obra import guardia_de_recurso
import almacen_de_nubes as _alm

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
            _con_observacion(cur, rows, node_id)
            _con_nube(cur, rows, node_id)
            _con_incidencias_para_la_nube_suelta(cur, rows, node_id)
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
            del_plano = _observaciones_del_plano(cur, node_id)
        return jsonify({"success": True, "markups": rows, "en_otras_versiones": en_otras,
                        "observaciones_del_plano": del_plano})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


def _negativa_para_marcar(node_id):
    """Dibujar en un plano o levantar una observación sobre él exige «Ver, descargar y marcar» en su carpeta.

    Revisar no es editar (docs/archivos/24, D2; ISO 19650): quien revisa observa lo compartido y no modifica el
    trabajo de otro equipo, así que basta ese nivel, que existe para eso, y no hace falta «Editar». Hasta el 3-nov-2026
    aquí bastaba ser de la obra, y el lector CAD sí lo exigía (`cad_review._node`). La obra sale del NODO, no del
    cuerpo: el `model_urn` lo elige quien llama.
    """
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT model_urn FROM file_nodes WHERE id::text = %s AND NOT is_deleted', (str(node_id),))
            fila = cur.fetchone()
    except Exception:
        return jsonify({"success": False, "error": "No se pudo comprobar el permiso."}), 503
    if not fila:
        return jsonify({"success": False, "error": "Documento no encontrado."}), 404
    return check_folder_permission(_user(), str(node_id), fila[0], 'view_markup', 'marcar este plano')


@pdf_tools_bp.route('/api/pdf/markups', methods=['POST'])
def create_markup():
    d = request.get_json() or {}
    required = ('node_id', 'model_urn', 'page', 'kind', 'geometry')
    if any(k not in d for k in required):
        return jsonify({"success": False, "error": f"Faltan campos {required}"}), 400
    # Se comprueba contra el NODO del documento, no contra el model_urn del
    # cuerpo: el model_urn lo elige quien llama, el nodo dice de que obra es.
    negativa = guardia_de_recurso('file_nodes', d['node_id']) or _negativa_para_marcar(d['node_id'])
    if negativa:
        return negativa
    # Las citas y las fotos NO entran al crear: van por el PATCH, que comprueba
    # que cada documento es de la obra y que quien cita puede abrirlo.
    estilo = dict(d.get('style') or {})
    estilo.pop('citas', None)
    estilo.pop('fotos', None)
    estilo.pop('comentarios', None)     # al duplicar, la conversación se queda en la original
    # Grosor, relleno y festones (al duplicar una marca, 2-nov-2026): las mismas reglas que al cambiarlos.
    pedido = {k: estilo.pop(k) for k in ('grosor', 'relleno', 'festones', 'triangulo') if k in estilo}
    if pedido:
        estilo, error = _estilo(d['kind'], pedido, estilo)
        if error:
            return jsonify({"success": False, "error": error}), 400
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


# EDITAR LA FIGURA (29-oct-2026, como la revisión de CAD y como ACC): mover, cambiar de tamaño, recolorear
# o reescribir una marca es cosa de su autor y SOLO mientras es su borrador. Publicada, es lo que la obra ya
# vio: se retira de la obra para cambiarla. Con una observación abierta, ni eso: es lo que el responsable
# tiene que corregir.
TOPE_PUNTOS = 500
TOPE_TEXTO = 500
LIMITE_DE_COORDENADA = 1e6     # puntos de PDF; una hoja A0 mide unos 3.400
FORMA_DE_LA_GEOMETRIA = {
    'cloud': 'caja', 'rect': 'caja', 'arrow': 'flecha',
    'measure': 'linea', 'pen': 'linea', 'area': 'poligono',
    'count': 'punto', 'text': 'punto', 'sello': 'punto', 'foto': 'punto',
}


def _numero(v):
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return None
    v = float(v)
    return round(v, 3) if v == v and abs(v) < LIMITE_DE_COORDENADA else None


def _punto(v):
    if not isinstance(v, (list, tuple)) or len(v) != 2:
        return None
    x, y = _numero(v[0]), _numero(v[1])
    return None if x is None or y is None else [x, y]


def _geometria(kind, valor, anterior):
    """(geometría limpia con la misma forma que la del tipo de marca, error)."""
    forma = FORMA_DE_LA_GEOMETRIA.get(kind)
    if not forma:
        return None, 'Esta marca no se puede mover.'
    if not isinstance(valor, dict):
        return None, 'A la posición le falta su contenido.'
    # La NUBE POLIGONAL (2-nov-2026): una nube que en vez de su caja lleva sus vértices.
    if kind == 'cloud' and 'points' in valor:
        forma = 'poligono'
    if forma == 'caja':
        x, y, w, h = (_numero(valor.get(k)) for k in ('x', 'y', 'w', 'h'))
        if None in (x, y, w, h) or w <= 0 or h <= 0:
            return None, 'La caja de la marca no es válida.'
        return {'x': x, 'y': y, 'w': w, 'h': h}, None
    if forma == 'flecha':
        p1, p2 = _punto(valor.get('p1')), _punto(valor.get('p2'))
        if not p1 or not p2:
            return None, 'Los extremos de la flecha no son válidos.'
        return {'p1': p1, 'p2': p2}, None
    if forma == 'punto':
        p = _punto(valor.get('p'))
        if not p:
            return None, 'La posición de la marca no es válida.'
        nueva = {'p': p}
        if kind == 'foto' and 'ang' in (anterior or {}):
            nueva['ang'] = anterior['ang']          # moverla no la gira
        return nueva, None
    puntos = valor.get('points')
    minimo = 3 if forma == 'poligono' else 2
    if not isinstance(puntos, list) or not minimo <= len(puntos) <= TOPE_PUNTOS:
        return None, 'La marca necesita entre %d y %d puntos.' % (minimo, TOPE_PUNTOS)
    limpios = [_punto(q) for q in puntos]
    if not all(limpios):
        return None, 'Uno de los puntos de la marca no es válido.'
    return {'points': limpios}, None


# EL ESTILO DE LA FIGURA (2-nov-2026, como el «Estilo» de ACC: color de trazo y de relleno): además del color, el
# grosor del trazo, el relleno (uno de los colores de la paleta, que se pinta translúcido) y el tamaño de los festones
# de la nube. Valores cerrados: lo que no está aquí no entra en `style`.
GROSORES = ('fino', 'medio', 'grueso')
# El TRIÁNGULO DE REVISIÓN de la nube: el código de la revisión que la levanta (C02, R1, B…), como en los planos.
TRIANGULO = re.compile(r'^[A-Za-z0-9][A-Za-z0-9.\-]{0,7}$')
FESTONES = ('pequenos', 'medianos', 'grandes')
CON_RELLENO = ('cloud', 'rect')
CON_GROSOR = ('cloud', 'rect', 'arrow', 'pen')


def _estilo(kind, pedido, estilo):
    """(estilo nuevo, None) o (None, motivo). Solo grosor, relleno y festones, y solo donde tienen sentido."""
    if not isinstance(pedido, dict):
        return None, "El estilo no es válido."
    nuevo = dict(estilo)
    if 'grosor' in pedido:
        if kind not in CON_GROSOR or pedido['grosor'] not in GROSORES:
            return None, "Ese grosor no vale para esta marca."
        nuevo['grosor'] = pedido['grosor']
    if 'relleno' in pedido:
        if kind not in CON_RELLENO:
            return None, "Esta marca no lleva relleno."
        if pedido['relleno'] in (None, '', 'ninguno'):
            nuevo.pop('relleno', None)
        else:
            color, error = _color(pedido['relleno'])
            if error:
                return None, error
            nuevo['relleno'] = color
    if 'festones' in pedido:
        if kind != 'cloud' or pedido['festones'] not in FESTONES:
            return None, "Solo la nube tiene festones (pequeños, medianos o grandes)."
        nuevo['festones'] = pedido['festones']
    if 'triangulo' in pedido:
        if kind != 'cloud':
            return None, "Solo la nube lleva triángulo de revisión."
        valor = str(pedido['triangulo'] or '').strip()
        if not valor:
            nuevo.pop('triangulo', None)
        elif not TRIANGULO.match(valor):
            return None, "El triángulo lleva el código de la revisión: hasta 8 letras o números (C02, R1…)."
        else:
            nuevo['triangulo'] = valor.upper()
    return nuevo, None


def _color(valor):
    v = str(valor or '').strip()
    if len(v) == 7 and v[0] == '#' and all(c in '0123456789abcdefABCDEF' for c in v[1:]):
        return v.lower(), None
    return None, 'El color no es válido.'


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
    """Citas, fotos, sello, orientación, posición, color y texto de una marca. Solo su autor.

    Cuerpo: {citas?: [id], fotos?: [id], sello?: {...}, angulo?: grados,
    geometria?: {...}, color?: '#rrggbb', estilo?: {grosor, relleno, festones}, texto?: str}. Lo que no viene no
    cambia. Citar exige poder abrir lo citado (regla 2). La figura (geometria,
    color, estilo, texto) solo cambia en un borrador sin observación abierta.
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
            texto = None
            if any(k in d for k in ('geometria', 'color', 'estilo', 'texto')):
                cur.execute("SELECT publicado FROM pdf_markups WHERE id = %s", (markup_id,))
                if (cur.fetchone() or (False,))[0]:
                    return jsonify({"success": False, "code": "MARCA_PUBLICADA",
                                    "error": "La marca está publicada: retírala de la obra para cambiarla."}), 409
                viva = _observacion_viva(cur, markup_id)
                if viva:
                    return jsonify({"success": False, "code": "OBSERVACION_ABIERTA",
                                    "error": "La marca tiene la observación %s abierta: es lo que el responsable tiene que corregir." % viva}), 409
                if 'geometria' in d:
                    geometria, error = _geometria(kind, d['geometria'], geometria)
                    if error:
                        return jsonify({"success": False, "error": error}), 400
                if 'color' in d:
                    if kind == 'sello':
                        return jsonify({"success": False, "error": "El color del sello lo da su estado."}), 400
                    color, error = _color(d['color'])
                    if error:
                        return jsonify({"success": False, "error": error}), 400
                    estilo['color'] = color
                if 'estilo' in d:
                    estilo, error = _estilo(kind, d['estilo'], estilo)
                    if error:
                        return jsonify({"success": False, "error": error}), 400
                if 'texto' in d:
                    texto = str(d['texto'] or '').strip()
                    if kind != 'text':
                        return jsonify({"success": False, "error": "Solo una marca de texto lleva texto."}), 400
                    if not texto or len(texto) > TOPE_TEXTO:
                        return jsonify({"success": False, "error": "El texto va de 1 a %d caracteres." % TOPE_TEXTO}), 400
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
            # Los comentarios no se tocan aquí: se conservan los que haya en la base, por si alguien comentó mientras.
            # La respuesta va sin ellos; el lector se queda con los que ya tenía.
            estilo.pop('comentarios', None)
            if texto is not None:
                cur.execute("UPDATE pdf_markups SET style = %s::jsonb || " + _COMENTARIOS_QUE_HAY
                            + ", geometry = %s, text_content = %s WHERE id = %s",
                            (json.dumps(estilo), json.dumps(geometria), texto, markup_id))
            else:
                cur.execute("UPDATE pdf_markups SET style = %s::jsonb || " + _COMENTARIOS_QUE_HAY
                            + ", geometry = %s WHERE id = %s",
                            (json.dumps(estilo), json.dumps(geometria), markup_id))
            marca = {'id': markup_id, 'kind': kind, 'style': estilo, 'geometry': geometria}
            if texto is not None:
                marca['text'] = texto
            _con_enlaces(cur, [marca])
            conn.commit()
        return jsonify({"success": True, "markup": marca})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ══ COMENTARIOS DE UNA MARCA (3-nov-2026) ════════════════════════════════════
#
# Pedido del propietario: «en la nube, ¿hay forma de colocar comentarios? No crear su panel, sino comentarios».
# Es la opción B de docs/ux/MARCAS_REVISION_LO_PROFESIONAL.md, y con sus mismas garantías: SOLO SE AÑADEN
# (nadie borra ni cambia lo que dijo otro, ni el autor de la marca), cada uno con su autor y su fecha, y sin
# estado ni responsables: eso sigue siendo la observación. Viven en `style.comentarios`, sin migración.

TOPE_COMENTARIO = 2000
TOPE_COMENTARIOS = 200
_COMENTARIOS_QUE_HAY = ("jsonb_build_object('comentarios', COALESCE(style->'comentarios', '[]'::jsonb))")


@pdf_tools_bp.route('/api/pdf/markups/<int:markup_id>/comentarios', methods=['POST'])
def comentar_marca(markup_id):
    """{texto} → añade un comentario a una marca que el usuario ve (publicada, o suya). Cualquiera de la obra."""
    negativa = guardia_de_recurso('pdf_markups', markup_id)
    if negativa:
        return negativa
    autor = _user().get('name') or ''
    if not autor:
        return jsonify({"success": False, "error": "Autenticación requerida."}), 401
    texto = str((request.get_json(silent=True) or {}).get('texto') or '').strip()
    if not texto or len(texto) > TOPE_COMENTARIO:
        return jsonify({"success": False, "error": "El comentario va de 1 a %d caracteres." % TOPE_COMENTARIO}), 400
    from datetime import datetime, timezone
    comentario = {'id': uuid.uuid4().hex[:12], 'autor': autor, 'autor_id': _user().get('id'), 'texto': texto,
                  'en': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')}
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Se AÑADE en la base (`||`), no se reescribe la lista: dos personas comentando a la vez no se pisan.
            cur.execute("""UPDATE pdf_markups
                              SET style = jsonb_set(COALESCE(style, '{}'::jsonb), '{comentarios}',
                                                    COALESCE(style->'comentarios', '[]'::jsonb) || %s::jsonb)
                            WHERE id = %s AND (publicado OR created_by = %s)
                              AND jsonb_array_length(COALESCE(style->'comentarios', '[]'::jsonb)) < %s
                        RETURNING style->'comentarios'""",
                        (json.dumps([comentario]), markup_id, autor, TOPE_COMENTARIOS))
            fila = cur.fetchone()
            if not fila:
                cur.execute("SELECT 1 FROM pdf_markups WHERE id = %s AND (publicado OR created_by = %s)",
                            (markup_id, autor))
                if cur.fetchone():
                    return jsonify({"success": False, "code": "TOPE_COMENTARIOS",
                                    "error": "La marca ya tiene %d comentarios: sigue la conversación en una observación."
                                    % TOPE_COMENTARIOS}), 409
                return jsonify({"success": False, "error": "La marca no existe."}), 404
            conn.commit()
        return jsonify({"success": True, "comentario": comentario, "comentarios": fila[0] or []})
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
            estilo = {k: v for k, v in (estilo or {}).items() if k != 'comentarios'}   # la conversación es de la V anterior
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
# OBSERVACIÓN DEL PLANO (2-nov-2026, docs/archivos/18). El dueño: «en un plano puedo tener varias marcas y no quisiera
# agarrar cada nube y asignarla: asignar todo el plano a un usuario con su estado y fecha». Es la misma observación de
# documento (migración 37, mismos estados y actos), pero su origen es el PLANO (`origen_id` = el documento) y su
# evidencia, la versión y TODAS las marcas que se eligieron. Sin migración: `origen_tipo` es texto y `evidencia`, jsonb.
ORIGEN_PLANO = 'PLANO'
_EN_EVIDENCIA = lambda markup_id: json.dumps([{'marca': int(markup_id)}])
# Un BORRADOR (migración 45) solo lo ve quien lo levantó: todavía no se envió a nadie.
# Tampoco un borrador DESCARTADO (2-nov-2026): para todos es como si no existiera (flujo_de_issue.SQL_NO_DESCARTADA).
_NO_ES_BORRADOR_AJENO = "(estado <> 'Borrador' OR autor_id = %s) AND NOT (history @> '[{\"event\": \"discarded\"}]'::jsonb)"


def _yo():
    try:
        return _user().get('id')
    except RuntimeError:             # fuera de una petición (las pruebas llaman a las funciones a pelo)
        return None


def _observacion_viva(cur, markup_id):
    """El código de la observación ABIERTA de la marca, o None.

    Mientras haya una, la marca no se retira ni se borra: es lo que el responsable
    tiene que ver para corregir, y lo que la observación señala en la hoja. Un
    borrador (45) también la retiene: va a enviarse con ella.
    """
    import flujo_de_issue as iss
    cur.execute("""SELECT codigo FROM doc_issues
                    WHERE estado = ANY(%s)
                      AND ((origen_tipo = %s AND origen_id = %s) OR (origen_tipo = %s AND evidencia @> %s::jsonb))
                    LIMIT 1""", (list(iss.SIN_CERRAR), ORIGEN_MARCA, str(markup_id), ORIGEN_PLANO, _EN_EVIDENCIA(markup_id)))
    fila = cur.fetchone()
    return fila[0] if fila else None


def _nombres(cur, ids):
    ids = sorted({int(i) for i in ids if i})
    if not ids:
        return {}
    cur.execute("SELECT id, COALESCE(NULLIF(name, ''), email) FROM users WHERE id = ANY(%s)", (ids,))
    return {r[0]: r[1] for r in cur.fetchall()}


def _con_empresas(cur, resumenes):
    """A los resúmenes sin persona responsable, la EMPRESA responsable (45) y su nombre. Una consulta, y solo si hace
    falta."""
    sin = [o for o in resumenes if o and not o.get('responsable_id')]
    if not sin:
        return resumenes
    cur.execute("""SELECT i.id, c.id, c.name FROM doc_issues i JOIN companies c ON c.id = i.responsable_empresa
                    WHERE i.id = ANY(%s)""", ([int(o['id']) for o in sin],))
    por_id = {str(f[0]): (f[1], f[2]) for f in cur.fetchall()}
    for o in sin:
        if o['id'] in por_id:
            o['responsable_empresa'], o['responsable'] = por_id[o['id']]
    return resumenes


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
        'estado_etiqueta': iss.etiqueta_estado(r[2]),
    }


def _con_observacion(cur, rows, node_id=None):
    """Pone en cada marca su observación más reciente (o None). Una consulta para toda la hoja.

    `node_id`: el plano de esas marcas. Con él, las observaciones del plano entero se buscan SOLO en ese plano
    (índice `idx_issues_origen`); sin él se recorrerían las de todos los planos de todas las obras.
    """
    import flujo_de_issue as iss
    for m in rows:
        m['observacion'] = None
    ids = [str(m['id']) for m in rows if m.get('id') is not None]
    if not ids:
        return rows
    cur.execute("""SELECT DISTINCT ON (origen_id)
                          id, codigo, estado, titulo, responsable_id, verificador_id, vence_en, origen_id
                     FROM doc_issues
                    WHERE origen_tipo = %s AND origen_id = ANY(%s) AND tipo = %s AND """
                + _NO_ES_BORRADOR_AJENO + """
                    ORDER BY origen_id, creado_en DESC, id DESC""", (ORIGEN_MARCA, ids, iss.OBSERVACION, _yo()))
    filas = cur.fetchall()
    nombres = _nombres(cur, [x for r in filas for x in (r[4], r[5])])
    hoy = _hoy_en_obra()
    por_marca = {r[7]: _resumen_de_observacion(r, nombres, hoy) for r in filas}
    # Las que no tienen una suya pueden estar en una OBSERVACIÓN DEL PLANO: la más reciente que la incluye.
    sueltas = [str(m['id']) for m in rows if m.get('id') is not None and str(m.get('id')) not in por_marca]
    if sueltas:
        cur.execute("""SELECT id, codigo, estado, titulo, responsable_id, verificador_id, vence_en, origen_id, evidencia
                         FROM doc_issues
                        WHERE origen_tipo = %s AND (%s::text IS NULL OR origen_id = %s::text) AND tipo = %s
                          AND evidencia @> ANY(%s::jsonb[]) AND """
                    + _NO_ES_BORRADOR_AJENO + """
                        ORDER BY creado_en DESC, id DESC""",
                    (ORIGEN_PLANO, node_id and str(node_id), node_id and str(node_id), iss.OBSERVACION,
                     [_EN_EVIDENCIA(i) for i in sueltas], _yo()))
        del_plano = cur.fetchall()
        nombres.update(_nombres(cur, [x for r in del_plano for x in (r[4], r[5])]))
        for r in del_plano:
            resumen = {**_resumen_de_observacion(r[:8], nombres, hoy), 'del_plano': True}
            for e in r[8] or []:
                clave = str(e.get('marca')) if isinstance(e, dict) and e.get('marca') is not None else None
                if clave in sueltas and clave not in por_marca:
                    por_marca[clave] = resumen
    _con_empresas(cur, list({id(o): o for o in por_marca.values()}.values()))
    for m in rows:
        m['observacion'] = por_marca.get(str(m.get('id')))
    return rows


def _con_nube(cur, rows, node_id):
    """Cada NUBE de una incidencia (46/47) lleva su número (`nube_numero`, el de su fila: el mismo que en el panel),
    a quién se asignó, su estado y su color en este plano (`nube`), y su incidencia (`observacion`) si no le venía por
    la evidencia (una nube añadida después).

    LA MISMA REGLA QUE EL PANEL (`nubes_de_issue.visible`, docs/archivos/25 S3): una nube de encargo que esta persona
    no ve en el panel —trabajo en proceso de otro equipo— tampoco sale en la hoja, ni su marca. Cinco consultas como
    mucho, sean cuantas sean las nubes."""
    import almacen_de_nubes as alm
    import nubes_de_issue as nub
    for m in rows:
        m['nube'] = None
    de_marca = alm.de_las_marcas(cur, [m['id'] for m in rows
                                       if m.get('kind') == nub.TIPO_DE_NUBE and m.get('id') is not None])
    if not de_marca:
        return rows
    yo, empresa, admin_en = _quien_mira(cur)
    visibles = {}
    for mid, (n, issue) in de_marca.items():
        if nub.visible(n, nub.papeles(yo, issue, n, admin_en(issue['project_id']), empresa), empresa):
            visibles[mid] = (n, issue)
    rows[:] = [m for m in rows if m.get('id') not in de_marca or m['id'] in visibles]
    if not visibles:
        return rows

    # Su incidencia, en las marcas que no la traían por la evidencia.
    sin_obs = {visibles[m['id']][1]['id'] for m in rows if m['id'] in visibles and not m.get('observacion')}
    if sin_obs:
        cur.execute("""SELECT id, codigo, estado, titulo, responsable_id, verificador_id, vence_en, origen_id
                         FROM doc_issues WHERE id = ANY(%s)""", (sorted(sin_obs),))
        filas = cur.fetchall()
        nombres, hoy = _nombres(cur, [x for r in filas for x in (r[4], r[5])]), _hoy_en_obra()
        resumen = {r[0]: _resumen_de_observacion(r, nombres, hoy) for r in filas}
        _con_empresas(cur, list(resumen.values()))
        for m in rows:
            if m['id'] in visibles and not m.get('observacion'):
                n, issue = visibles[m['id']]
                if issue['id'] in resumen:
                    m['observacion'] = {**resumen[issue['id']], 'encargo': n['clase'] == 'encargo'}

    # A quién va cada una y su color en este plano.
    uids = sorted({n['destino_usuario'] for n, _i in visibles.values() if n['destino_usuario']})
    eids = sorted({n['destino_empresa'] for n, _i in visibles.values() if n['destino_empresa']})
    personas, empresas = {}, {}
    if uids:
        cur.execute('SELECT id, name FROM users WHERE id = ANY(%s)', (uids,))
        personas = dict(cur.fetchall())
    if eids:
        cur.execute('SELECT id, name FROM companies WHERE id = ANY(%s)', (eids,))
        empresas = dict(cur.fetchall())
    colores = nub.colores_del_plano(cur, node_id)
    for m in rows:
        if m['id'] not in visibles:
            continue
        n, issue = visibles[m['id']]
        m['nube_numero'] = n['numero']
        m['nube'] = {'estado': n['estado'], 'estado_etiqueta': nub.ETIQUETAS.get(n['estado'], n['estado']),
                     'clase': n['clase'], 'numero': n['numero'],
                     # Lo que la leyenda cuenta «por entregar»: lo decide el servidor, no la pantalla.
                     'por_entregar': nub.por_entregar(n, issue),
                     'destino_nombre': personas.get(n['destino_usuario']) or empresas.get(n['destino_empresa']),
                     'destino_es_empresa': bool(n['destino_empresa']),
                     'color': colores.get(nub.clave_de_destino(n))}
    return rows


def _quien_mira(cur):
    """(usuario, su empresa, admin_en(obra)) de quien pide la hoja: lo que piden `papeles()` y `visible()`. La
    pregunta de administrador se hace una vez por obra."""
    from administracion_de_obra import es_admin_de_obra
    yo = _user()
    empresa = None
    if yo.get('id'):
        cur.execute('SELECT company_id FROM users WHERE id = %s', (yo['id'],))
        f = cur.fetchone()
        empresa = f[0] if f else None
    cache = {}

    def admin_en(obra):
        if obra not in cache:
            cache[obra] = es_admin_de_obra(cur, yo, obra)
        return cache[obra]
    return yo, empresa, admin_en


def _con_incidencias_para_la_nube_suelta(cur, rows, node_id):
    """Una NUBE SUELTA (de ninguna incidencia) que esta persona puede repartir lleva a qué incidencias abiertas de este
    plano puede ir y cómo (`puede_unirse_a`: [{id, codigo, titulo, clase, asigna}]). La regla es
    `nubes_de_issue.como_se_anade`, la misma de la ruta que la añade (docs/archivos/25, P2): la pantalla solo la pinta.
    Se reparte una nube TUYA (las marcas guardan el nombre de su autor) o, si administras la obra, cualquiera."""
    import flujo_de_issue as iss
    import nubes_de_issue as nub
    sueltas = [m for m in rows if m.get('kind') == nub.TIPO_DE_NUBE and m.get('id') is not None
               and not m.get('observacion') and not m.get('nube')]
    yo, empresa, admin_en = _quien_mira(cur)
    if not sueltas or not yo.get('id'):
        return rows
    # Las incidencias vivas de ESTE plano: levantadas desde él o con alguna marca suya en la evidencia.
    cur.execute("""SELECT id, project_id, codigo, titulo, estado, autor_id, verificador_id, responsable_id,
                          responsable_empresa
                     FROM doc_issues
                    WHERE model_urn = (SELECT model_urn FROM file_nodes WHERE id = %s)
                      AND estado <> ALL(%s)
                      AND ((origen_tipo = %s AND origen_id = %s) OR evidencia @> %s::jsonb)
                    ORDER BY creado_en DESC, id DESC LIMIT 50""",
                (str(node_id), [iss.VERIFICADO, iss.ANULADO, iss.BORRADOR], ORIGEN_PLANO, str(node_id),
                 json.dumps([{'documento': str(node_id)}])))
    destinos = []
    admin_aqui = False
    for r in cur.fetchall():
        issue = {'id': r[0], 'project_id': r[1], 'codigo': r[2], 'titulo': r[3], 'estado': r[4], 'autor_id': r[5],
                 'verificador_id': r[6], 'responsable_id': r[7], 'responsable_empresa': r[8]}
        admin = admin_en(issue['project_id'])
        admin_aqui = admin_aqui or admin
        como = nub.como_se_anade(nub.papeles(yo, issue, None, admin, empresa))
        if como:
            destinos.append({'id': str(issue['id']), 'codigo': issue['codigo'], 'titulo': issue['titulo'],
                             'clase': como[0], 'asigna': como[1]})
    if not destinos:
        return rows
    for m in sueltas:
        if admin_aqui or m.get('created_by') == (yo.get('name') or ''):
            m['puede_unirse_a'] = destinos
    return rows


def _observaciones_del_plano(cur, node_id):
    """Las observaciones del plano entero (las más recientes primero), con su versión y sus marcas."""
    import flujo_de_issue as iss
    cur.execute("""SELECT id, codigo, estado, titulo, responsable_id, verificador_id, vence_en, origen_id, evidencia,
                          autor_id
                     FROM doc_issues
                    WHERE origen_tipo = %s AND origen_id = %s AND tipo = %s AND """ + _NO_ES_BORRADOR_AJENO + """
                    ORDER BY creado_en DESC, id DESC LIMIT 50""", (ORIGEN_PLANO, str(node_id), iss.OBSERVACION, _yo()))
    filas = cur.fetchall()
    nombres, hoy = _nombres(cur, [x for r in filas for x in (r[4], r[5])]), _hoy_en_obra()
    salida = []
    for r in filas:
        evidencia = [e for e in (r[8] or []) if isinstance(e, dict)]
        plano = next((e for e in evidencia if e.get('tipo') == 'plano'), {})
        salida.append({**_resumen_de_observacion(r[:8], nombres, hoy), 'del_plano': True,
                       'autor_id': r[9] if len(r) > 9 else None,
                       'version_id': plano.get('version_id'), 'version_numero': plano.get('version_numero'),
                       # EL PIN EN LA HOJA (2-nov-2026, como ACC): página y punto en coordenadas del PDF.
                       'pin': plano.get('pin'),
                       'marcas': [e['marca'] for e in evidencia if e.get('tipo') == 'marca' and e.get('marca') is not None]})
    return _con_empresas(cur, salida)


def _leer_observaciones_del_plano(nodo):
    """GET: las observaciones del plano entero (las más recientes primero) o, con `?id=`, el detalle de una.

    Un borrador ajeno no se ve (migración 45). El detalle es el mismo que el de la observación de una marca.
    """
    import flujo_de_issue as iss
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            pedida = request.args.get('id')
            if pedida is None:
                salida = jsonify({"success": True, "observaciones": _observaciones_del_plano(cur, nodo)})
            else:
                try:
                    iid = int(pedida)
                except ValueError:
                    return jsonify({"success": False, "error": "Observación no válida."}), 400
                cur.execute("SELECT " + _COLS_DETALLE + """, evidencia FROM doc_issues
                              WHERE id = %s AND origen_tipo = %s AND origen_id = %s AND tipo = %s AND """
                            + _NO_ES_BORRADOR_AJENO, (iid, ORIGEN_PLANO, nodo, iss.OBSERVACION, _yo()))
                r = cur.fetchone()
                if not r:
                    return jsonify({"success": False, "error": "La observación no existe."}), 404
                obs = _detalle_de_observacion(cur, r[:14], True)
                evidencia = [e for e in (r[14] or []) if isinstance(e, dict)]
                plano = next((e for e in evidencia if e.get('tipo') == 'plano'), {})
                obs.update({'version_id': plano.get('version_id'), 'version_numero': plano.get('version_numero'),
                            'marcas': [e['marca'] for e in evidencia
                                       if e.get('tipo') == 'marca' and e.get('marca') is not None]})
                salida = jsonify({"success": True, "observacion": obs})
        salida.headers['Cache-Control'] = 'private, no-store'
        return salida
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


def _marca_para_observacion(cur, markup_id):
    cur.execute("""SELECT m.created_by, m.publicado, m.page, m.kind, m.file_node_id::text, n.model_urn, n.name,
                          COALESCE(m.file_version_id, n.current_version_id)::text, v.version_number
                     FROM pdf_markups m
                     JOIN file_nodes n ON n.id = m.file_node_id
                LEFT JOIN file_versions v ON v.id = COALESCE(m.file_version_id, n.current_version_id)
                    WHERE m.id = %s""", (markup_id,))
    return cur.fetchone()


def _campos_de_observacion(d, uid, empresa_vale=False):
    """((titulo, descripcion, responsable, vence), None) o (None, respuesta de error).

    Un BORRADOR (45) se guarda sin responsable, como en las demás incidencias: el panel lo permite y antes el plano y la
    marca lo rechazaban. Se exige al enviarlo (`routes.issues._falta_para_enviar`).

    Con `empresa_vale` (la del plano, 45) el responsable puede ser una EMPRESA (`responsable_empresa`): entonces
    `responsable` vuelve None y la empresa la valida `routes.issues.datos_de_la_45`.
    """
    from datetime import date
    titulo = str(d.get('titulo') or '').strip()[:180]
    if not titulo:
        return None, (jsonify({"success": False, "error": "Escribe qué hay que corregir."}), 400)
    descripcion = str(d.get('descripcion') or '').strip()[:2000] or None
    try:
        responsable = int(d.get('responsable_id'))
    except (TypeError, ValueError):
        responsable = None
    if responsable is None and not (empresa_vale and d.get('responsable_empresa')) and not d.get('borrador'):
        return None, (jsonify({"success": False, "error": "Elige a quién le toca corregir.",
                               "code": "SIN_RESPONSABLE"}), 400)
    if responsable == uid:
        return None, (jsonify({"success": False,
                               "error": "La verificas tú, que la detectaste: el responsable de corregir tiene que ser otra persona.",
                               "code": "VERIFICADOR_ES_RESPONSABLE"}), 409)
    try:
        vence = date.fromisoformat(str(d.get('vence_en') or '')[:10])
    except ValueError:
        return None, (jsonify({"success": False, "error": "Pon una fecha límite."}), 400)
    if vence < _hoy_en_obra():
        return None, (jsonify({"success": False, "error": "La fecha límite no puede estar en el pasado."}), 400)
    return (titulo, descripcion, responsable, vence), None


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
    campos, error = _campos_de_observacion(d, uid, empresa_vale=True)
    if error:
        return error
    titulo, descripcion, responsable, vence = campos
    borrador = bool(d.get('borrador'))
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
                if persona is None:
                    continue
                cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s', (obra, persona))
                if not cur.fetchone():
                    return jsonify({"success": False,
                                    "error": "El %s no es miembro de esta obra." % quien,
                                    "code": "%s_NO_MIEMBRO" % quien.upper()}), 409
            # Empresa responsable, observadores, adjuntos y clasificación (45): la misma regla que el resto.
            from routes.issues import datos_de_la_45, guardar_datos_de_la_45
            if borrador and iss.opcional_apagado(iss.BORRADOR, iss.opcionales_de_obra(cur, obra)):
                return jsonify({"success": False, "error": "Esta obra no usa borradores.", "code": "ESTADO_APAGADO"}), 409
            datos45, error = datos_de_la_45(cur, obra, iss.OBSERVACION, d if responsable is None
                                            else {**d, 'responsable_empresa': None}, responsable, uid, borrador)
            if error:
                return (jsonify({"success": False, **error[0].get_json()}), error[1])
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
            origen_tipo, origen_id = ORIGEN_MARCA, str(markup_id)
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
                         origen_tipo, origen_id,
                         json.dumps([reg.entrada('detected', actor, codigo=codigo, tipo=iss.OBSERVACION,
                                                 desde_marca=markup_id)])))
                    iid = cur.fetchone()[0]
                    if borrador:
                        cur.execute('UPDATE doc_issues SET estado = %s WHERE id = %s', (iss.BORRADOR, iid))
                    guardar_datos_de_la_45(cur, iid, datos45)
                    # Sus nubes nacen con ella, numeradas en el orden de su evidencia (47).
                    _alm.crear_filas_de_la_incidencia(cur, {
                        'id': iid, 'model_urn': model_urn, 'evidencia': evidencia,
                        'origen_tipo': origen_tipo, 'origen_id': origen_id}, creado_por=uid)
                    cur.execute('RELEASE SAVEPOINT alta_observacion')
                    break
                except Exception:
                    cur.execute('ROLLBACK TO SAVEPOINT alta_observacion')
                    if intento == 4:
                        raise
            # Un borrador (45) ni publica la marca ni le debe nada a nadie: eso pasa al enviarlo.
            if not publicado and not borrador:
                cur.execute("""UPDATE pdf_markups SET publicado = TRUE, publicado_en = CURRENT_TIMESTAMP,
                                      publicado_por = %s
                                WHERE id = %s""", (uid, markup_id))
            conn.commit()
            # LA PELOTA, en el mismo acto: al responsable le aparece en «Mi trabajo» y recibe aviso.
            # En su propio try, como en el protocolo: si el encargo falla, la observación ya existe.
            if not borrador:
                try:
                    eid = _enc.abrir(cur, 'ISSUE', iid, 'Corregir %s: %s' % (codigo, titulo),
                                     destino_usuario=responsable,
                                     destino_empresa=None if responsable else datos45['responsable_empresa'],
                                     vence_en=vence, creado_por=actor)
                    if eid:
                        _enc.avisar(cur, eid)
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    print('[pdf] observación %s creada sin encargo: %s' % (codigo, str(e)[:120]))
            log_activity(model_urn, 'CREATE', 'ISSUE', str(iid), codigo, actor,
                         {'tipo': iss.OBSERVACION, 'responsable': responsable, 'marca': markup_id})
            marca = {'id': markup_id}
            _con_observacion(cur, [marca], nodo)
        return jsonify({"success": True, "observacion": marca['observacion'], "publicado": not borrador or bool(publicado)}), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


_COLS_DETALLE = """id, codigo, estado, titulo, responsable_id, verificador_id, vence_en, origen_id,
                  descripcion, autor_id, evidencia_correccion, history, autoverificacion, creado_en"""


def _detalle_de_observacion(cur, r, del_plano=False):
    """Lo que pinta el panel de una observación (fila con `_COLS_DETALLE`): el resumen, el autor, la evidencia de la
    corrección (sin enseñar el nombre de lo que esta persona no puede ver) y el historial."""
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
        **({'del_plano': True} if del_plano else {}),
    })
    _con_empresas(cur, [obs])
    return obs


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
                            WHERE origen_tipo = %s AND origen_id = %s AND tipo = %s AND """ + _NO_ES_BORRADOR_AJENO + """
                            ORDER BY creado_en DESC, id DESC LIMIT 1""",
                        (ORIGEN_MARCA, str(markup_id), iss.OBSERVACION, _yo()))
            r = cur.fetchone()
            del_plano = False
            if not r:
                cur.execute("""SELECT id, codigo, estado, titulo, responsable_id, verificador_id, vence_en, origen_id,
                                      descripcion, autor_id, evidencia_correccion, history, autoverificacion,
                                      creado_en
                                 FROM doc_issues
                                WHERE origen_tipo = %s AND tipo = %s AND evidencia @> %s::jsonb AND """
                                + _NO_ES_BORRADOR_AJENO + """
                                ORDER BY creado_en DESC, id DESC LIMIT 1""",
                            (ORIGEN_PLANO, iss.OBSERVACION, _EN_EVIDENCIA(markup_id), _yo()))
                r, del_plano = cur.fetchone(), True
            if not r:
                return jsonify({"success": True, "observacion": None})
            obs = _detalle_de_observacion(cur, r, del_plano)
        response = jsonify({"success": True, "observacion": obs})
        response.headers['Cache-Control'] = 'private, no-store'
        return response
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@pdf_tools_bp.route('/api/pdf/planos/<node_id>/observacion', methods=['GET', 'POST'])
def observacion_del_plano(node_id):
    """Levanta UNA observación del PLANO entero (docs/archivos/18): con responsable, fecha límite y las marcas que se
    eligieron de una versión. La levanta cualquier miembro de la obra que pueda ver el plano, y la verifica él.

    Cuerpo: {titulo, descripcion?, responsable_id, vence_en, version_id?, marcas: [ids], borrador?}. Las marcas tienen
    que ser de ese plano y esa versión, visibles para quien la levanta (publicadas o suyas) y sin otra observación
    abierta. Sus borradores entran publicados: el responsable tiene que verlos. Con `borrador` (migración 45) se guarda
    sin enviar: ni encargo ni marcas publicadas hasta `POST /api/issues/<id>/enviar`.
    """
    import encargos as _enc
    import flujo_de_issue as iss
    import flujo_de_registro as reg
    from db import log_activity, resolve_project_id
    from perimetro_de_obra import guardia_de_obra

    nodo = _uuid(node_id)
    if not nodo:
        return jsonify({"success": False, "error": "Plano no válido."}), 400
    negativa = guardia_de_recurso('file_nodes', nodo)
    if negativa:
        return negativa
    if request.method == 'GET':
        return _leer_observaciones_del_plano(nodo)
    negativa = _negativa_para_marcar(nodo)
    if negativa:
        return negativa
    d = request.get_json(silent=True) or {}
    u = _user()
    uid, autor = u.get('id'), u.get('name') or ''
    actor = u.get('email') or autor or 'desconocido'
    if not uid or not autor:
        return jsonify({"success": False, "error": "Sesión sin identidad."}), 401
    campos, error = _campos_de_observacion(d, uid, empresa_vale=True)
    if error:
        return error
    titulo, descripcion, responsable, vence = campos
    marcas_pedidas = d.get('marcas') if isinstance(d.get('marcas'), list) else []
    try:
        marcas_pedidas = sorted({int(x) for x in marcas_pedidas})[:500]
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Las marcas no son válidas."}), 400
    borrador = bool(d.get('borrador'))
    # EL PIN (2-nov-2026, como la herramienta «Incidencia» de ACC): dónde se clavó en la hoja. Opcional.
    pin = None
    if d.get('pin') is not None:
        crudo = d.get('pin') if isinstance(d.get('pin'), dict) else {}
        pagina, punto = crudo.get('pagina'), _punto(crudo.get('p'))
        if isinstance(pagina, bool) or not isinstance(pagina, int) or not 1 <= pagina <= 5000 or not punto                 or not all(-1e6 < c < 1e6 for c in punto):
            return jsonify({"success": False, "error": "El pin no es válido."}), 400
        pin = {'pagina': pagina, 'p': punto}
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            version_pedida = _uuid(d.get('version_id'))
            cur.execute("""SELECT n.model_urn, n.name, v.id::text, v.version_number
                             FROM file_nodes n
                        LEFT JOIN file_versions v ON v.id = COALESCE(%s::uuid, n.current_version_id) AND v.file_node_id = n.id
                            WHERE n.id = %s""", (version_pedida, nodo))
            fila = cur.fetchone()
            if not fila:
                return jsonify({"success": False, "error": "El plano no existe."}), 404
            model_urn, nombre, version_id, version_num = fila
            if version_pedida and version_id != version_pedida:
                return jsonify({"success": False, "error": "Esa versión no es de este plano."}), 400
            obra = resolve_project_id(model_urn)
            if not obra:
                return jsonify({"success": False, "error": "No se pudo determinar la obra."}), 400
            corte = guardia_de_obra(obra, 'levantar una observación')
            if corte:
                return corte
            for quien, persona in (('responsable', responsable), ('verificador', uid)):
                if persona is None:
                    continue
                cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s', (obra, persona))
                if not cur.fetchone():
                    return jsonify({"success": False,
                                    "error": "El %s no es miembro de esta obra." % quien,
                                    "code": "%s_NO_MIEMBRO" % quien.upper()}), 409
            # Empresa responsable, observadores, adjuntos y clasificación (45): la misma regla que el alta de incidencias.
            from routes.issues import datos_de_la_45, guardar_datos_de_la_45
            datos45, error = datos_de_la_45(cur, obra, iss.OBSERVACION, d if responsable is None
                                            else {**d, 'responsable_empresa': None}, responsable, uid, borrador)
            if error:
                return (jsonify({"success": False, **error[0].get_json()}), error[1])
            marcas = []
            if marcas_pedidas:
                # Las de este plano y esta versión que esta persona ve (publicadas o suyas); las anteriores a la
                # migración 36, sin versión, cuentan como de la vigente.
                cur.execute("""SELECT m.id, m.created_by, m.publicado, m.page, m.kind
                                 FROM pdf_markups m JOIN file_nodes n ON n.id = m.file_node_id
                                WHERE m.id = ANY(%s) AND m.file_node_id = %s
                                  AND (m.file_version_id = %s OR (m.file_version_id IS NULL AND n.current_version_id = %s))
                                  AND (m.publicado OR m.created_by = %s)""",
                            (marcas_pedidas, nodo, version_id, version_id, autor))
                marcas = cur.fetchall()
                if len(marcas) != len(marcas_pedidas):
                    return jsonify({"success": False, "error": "Alguna marca no es de esta versión del plano.",
                                    "code": "MARCA_AJENA"}), 400
                ocupadas = [c for c in (_observacion_viva(cur, m[0]) for m in marcas) if c]
                if ocupadas:
                    return jsonify({"success": False,
                                    "error": "Alguna marca ya está en una observación abierta (%s)." % ', '.join(sorted(set(ocupadas))),
                                    "code": "YA_TIENE_OBSERVACION"}), 409
            ubicacion = ' · '.join(x for x in (nombre, 'V%s' % version_num if version_num else '',
                                               'pág. %d' % pin['pagina'] if pin else '',
                                               ('%d marca%s' % (len(marcas), '' if len(marcas) == 1 else 's')) if marcas
                                               else ('' if pin else 'plano entero'))
                                   if x)[:300]
            if borrador and iss.opcional_apagado(iss.BORRADOR, iss.opcionales_de_obra(cur, obra)):
                return jsonify({"success": False, "error": "Esta obra no usa borradores.",
                                "code": "ESTADO_APAGADO"}), 409
            evidencia = [{'tipo': 'plano', 'documento': nodo, 'nombre': nombre, 'version_id': version_id,
                          'version_numero': version_num, **({'pin': pin} if pin else {})}] + [
                {'tipo': 'marca', 'marca': m[0], 'documento': nodo, 'nombre': nombre, 'version_id': version_id,
                 'version_numero': version_num, 'pagina': m[3], 'clase': m[4]} for m in marcas]
            origen_tipo, origen_id = ORIGEN_PLANO, nodo
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
                         origen_tipo, origen_id,
                         json.dumps([reg.entrada('detected', actor, codigo=codigo, tipo=iss.OBSERVACION,
                                                 desde_plano=nodo, marcas=len(marcas))])))
                    iid = cur.fetchone()[0]
                    if borrador:
                        cur.execute('UPDATE doc_issues SET estado = %s WHERE id = %s', (iss.BORRADOR, iid))
                    guardar_datos_de_la_45(cur, iid, datos45)
                    # Sus nubes nacen con ella, numeradas en el orden de su evidencia (47).
                    _alm.crear_filas_de_la_incidencia(cur, {
                        'id': iid, 'model_urn': model_urn, 'evidencia': evidencia,
                        'origen_tipo': origen_tipo, 'origen_id': origen_id}, creado_por=uid)
                    cur.execute('RELEASE SAVEPOINT alta_observacion')
                    break
                except Exception:
                    cur.execute('ROLLBACK TO SAVEPOINT alta_observacion')
                    if intento == 4:
                        raise
            # Un borrador no publica nada ni le debe nada a nadie: eso pasa al enviarlo.
            publicadas = [] if borrador else [m[0] for m in marcas if not m[2]]
            if publicadas:
                cur.execute("""UPDATE pdf_markups SET publicado = TRUE, publicado_en = CURRENT_TIMESTAMP, publicado_por = %s
                                WHERE id = ANY(%s) AND created_by = %s""", (uid, publicadas, autor))
            conn.commit()
            # LA PELOTA, en el mismo acto: al responsable le aparece en «Mi trabajo» y recibe aviso.
            if not borrador:
                try:
                    eid = _enc.abrir(cur, 'ISSUE', iid, 'Corregir %s: %s' % (codigo, titulo),
                                     destino_usuario=responsable,
                                     destino_empresa=None if responsable else datos45['responsable_empresa'],
                                     vence_en=vence, creado_por=actor)
                    if eid:
                        _enc.avisar(cur, eid)
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    print('[pdf] observación del plano %s creada sin encargo: %s' % (codigo, str(e)[:120]))
            log_activity(model_urn, 'CREATE', 'ISSUE', str(iid), codigo, actor,
                         {'tipo': iss.OBSERVACION, 'responsable': responsable, 'plano': nodo, 'marcas': len(marcas),
                          'borrador': borrador or None})
            obs = next((o for o in _observaciones_del_plano(cur, nodo) if o['id'] == str(iid)), None)
        return jsonify({"success": True, "observacion": obs, "publicadas": publicadas}), 201
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
