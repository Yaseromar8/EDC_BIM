"""Documentos/enlaces vinculados a un elemento del modelo (por external_id).

Reemplaza el endpoint inexistente '/api/docs/mutate-bind' que dejaba roto el
panel Docs del visor. Se ancla al external_id (estable entre versiones del
modelo), coherente con el resto del inventario en PostgreSQL.
"""
from esquema_congelado import solo_con_ddl
import traceback
from flask import Blueprint, request, jsonify, g
from db import get_db_connection
from perimetro_de_obra import guardia_de_recurso, guardia_de_obra

element_docs_bp = Blueprint('element_docs', __name__)


@solo_con_ddl
def ensure_element_docs_table():
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS element_docs (
                id SERIAL PRIMARY KEY,
                external_id TEXT NOT NULL,
                url TEXT NOT NULL,
                doc_type TEXT DEFAULT 'url',
                title TEXT,
                model_urn TEXT,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )''')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_element_docs_ext ON element_docs(external_id)')
        conn.commit()


def _user():
    return getattr(g, 'current_user', None) or {}


@element_docs_bp.route('/api/element-docs', methods=['GET'])
def list_element_docs():
    external_id = request.args.get('external_id')
    if not external_id:
        return jsonify({"success": False, "error": "Falta external_id"}), 400
    # LA OBRA ACOTA TAMBIEN LA LECTURA.
    #
    # Antes se filtraba SOLO por external_id, y ese identificador no distingue
    # obras: en inventory_assets es unico junto al model_urn, no por si mismo
    # (UNIQUE (model_urn, external_id)). Dos obras con el mismo elemento
    # -- normal si comparten familia o plantilla -- se veian los documentos
    # cruzados. El POST de aqui al lado ya exigia la obra; el GET no.
    model_urn = request.args.get('model_urn')
    negada = guardia_de_obra(model_urn, 'ver los documentos del elemento') if model_urn else None
    if negada:
        return negada
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT id, url, doc_type, title, created_by, created_at
                           FROM element_docs
                          WHERE external_id = %s
                            AND (%s IS NULL OR model_urn IS NULL OR model_urn = %s)
                          ORDER BY id DESC""", (external_id, model_urn, model_urn))
            docs = [{"id": r[0], "url": r[1], "doc_type": r[2], "title": r[3],
                     "created_by": r[4], "created_at": r[5].isoformat() if r[5] else None}
                    for r in cur.fetchall()]
        return jsonify({"success": True, "docs": docs})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@element_docs_bp.route('/api/element-docs', methods=['POST'])
def add_element_doc():
    d = request.get_json() or {}
    if not d.get('external_id') or not d.get('url'):
        return jsonify({"success": False, "error": "Faltan external_id/url"}), 400
    negativa = guardia_de_obra(d.get('model_urn'), 'vincular un documento a un elemento')
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""INSERT INTO element_docs (external_id, url, doc_type, title, model_urn, created_by)
                           VALUES (%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (d['external_id'], d['url'], d.get('doc_type', 'url'),
                         d.get('title'), d.get('model_urn'), _user().get('name') or d.get('user')))
            new_id = cur.fetchone()[0]
            conn.commit()
        return jsonify({"success": True, "id": new_id})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@element_docs_bp.route('/api/element-docs/<int:doc_id>', methods=['DELETE'])
def delete_element_doc(doc_id):
    # De que obra es este recurso. Sin esto, conocer el id bastaba
    # para escribir en el expediente de otra obra.
    negativa = guardia_de_recurso('element_docs', doc_id)
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM element_docs WHERE id = %s", (doc_id,))
            conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500
