"""Herramientas de ingeniería sobre PDF: anotaciones (markups) y calibración de escala.

Las geometrías se guardan en coordenadas del espacio PDF (puntos, origen
abajo-izquierda) para que sean independientes del zoom/rotación del visor.
"""
from esquema_congelado import solo_con_ddl
import json
import traceback
from flask import Blueprint, request, jsonify, g
from db import get_db_connection
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
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO pdf_markups (file_node_id, model_urn, page, kind, geometry, style, text_content, created_by)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (d['node_id'], d['model_urn'], d['page'], d['kind'],
                         json.dumps(d['geometry']), json.dumps(d.get('style') or {}),
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
