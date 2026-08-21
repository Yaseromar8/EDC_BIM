# -*- coding: utf-8 -*-
"""El directorio de la obra, y «Mi Trabajo».

Dos cosas, y ninguna mas:

  /api/projects/<id>/participantes   quien participa en la obra y con que
                                     funcion contractual (empresa x obra)
  /api/mi-trabajo                    que esta esperando por mi

NO HAY --Y NO DEBE HABER-- NINGUNA RUTA QUE ESCRIBA UN ENCARGO.
---------------------------------------------------------------
`encargos` es una PROYECCION de lo que los objetos de negocio ya saben: la
Review, el RFI, el Redline y el Transmittal son duenos de su estado y de su
responsable. Un encargo se abre y se cierra unicamente como consecuencia de una
transicion de su objeto.

Si algun dia hace falta reasignar, la respuesta no es `PATCH /api/encargos/<id>`:
es reasignar EL OBJETO, y que el encargo lo siga. Lo contrario crearia dos
verdades sobre quien debe que, y la que veria el usuario en su bandeja podria no
ser la que el objeto cree.

Lo ata `test_no_existe_ninguna_ruta_que_escriba_encargos`.
"""
from flask import Blueprint, request, jsonify, g

from db import get_db_connection, resolve_project_id
from perimetro_de_obra import guardia_de_obra
import directorio_de_obra as dir_obra
import encargos as enc

directorio_bp = Blueprint('directorio', __name__)


def _usuario():
    return getattr(g, 'current_user', None) or {}


# ── Directorio de la obra ─────────────────────────────────────────────────

@directorio_bp.route('/api/projects/<path:project_id>/participantes', methods=['GET'])
def listar_participantes(project_id):
    """Que empresas participan en esta obra y con que funcion."""
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'ver el directorio de esta obra')
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            filas = dir_obra.participantes(cur, obra)
            yo = dir_obra.funcion_de(cur, obra, _usuario().get('id'))
        return jsonify({
            'project_id': obra,
            'funciones': list(dir_obra.FUNCIONES),
            'mi_funcion': yo,
            'participantes': [{'company_id': c, 'nombre': n, 'funcion': f}
                              for c, n, f in filas],
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@directorio_bp.route('/api/projects/<path:project_id>/participantes', methods=['POST'])
def poner_participante(project_id):
    """Declara que una empresa participa en la obra con una funcion.

    Solo un administrador. Esto NO da acceso a nadie: la membresia sigue siendo
    `project_users`, y este registro solo dice en que calidad participa una
    empresa que ya esta en la obra.
    """
    if _usuario().get('role') != 'admin':
        return jsonify({'error': 'Solo un administrador puede cambiar el directorio',
                        'code': 'FORBIDDEN'}), 403
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'cambiar el directorio de esta obra')
    if negativa:
        return negativa

    d = request.get_json(silent=True) or {}
    company_id, funcion = d.get('company_id'), (d.get('funcion') or '').strip().upper()
    if not company_id or funcion not in dir_obra.FUNCIONES:
        return jsonify({'error': 'Hacen falta company_id y una funcion de: %s'
                                 % ', '.join(dir_obra.FUNCIONES)}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO project_companies (project_id, company_id, funcion, creado_por)
                VALUES (%s,%s,%s,%s)
                ON CONFLICT (project_id, company_id)
                DO UPDATE SET funcion = EXCLUDED.funcion
                RETURNING company_id
            """, (obra, int(company_id), funcion, _usuario().get('email')))
            ok = cur.fetchone()
            conn.commit()
        if not ok:
            return jsonify({'error': 'No se pudo registrar'}), 500
        return jsonify({'project_id': obra, 'company_id': int(company_id),
                        'funcion': funcion}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@directorio_bp.route('/api/projects/<path:project_id>/participantes/<int:company_id>',
                     methods=['DELETE'])
def quitar_participante(project_id, company_id):
    if _usuario().get('role') != 'admin':
        return jsonify({'error': 'Solo un administrador puede cambiar el directorio',
                        'code': 'FORBIDDEN'}), 403
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'cambiar el directorio de esta obra')
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('DELETE FROM project_companies WHERE project_id=%s AND company_id=%s',
                        (obra, company_id))
            n = cur.rowcount
            conn.commit()
        return jsonify({'borrado': n}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Mi Trabajo ────────────────────────────────────────────────────────────

@directorio_bp.route('/api/mi-trabajo', methods=['GET'])
def mi_trabajo():
    """Lo que esta esperando por el usuario de la sesion. SOLO LEE.

    Es transversal a las obras a proposito -- la pregunta «¿que debo?» no se hace
    obra por obra -- y por eso esta entre las rutas justificadas sin obra en el
    middleware. La comprobacion de pertenencia no se salta: va DENTRO de la
    consulta, como `JOIN project_users` (ver `encargos._MI_TRABAJO`).
    """
    u = _usuario()
    if not u.get('id'):
        return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401

    obra = None
    if request.args.get('project_id'):
        obra = resolve_project_id(request.args.get('project_id'))
        if not obra:
            return jsonify({'error': 'Obra no encontrada'}), 404
        negativa = guardia_de_obra(obra, 'ver el trabajo pendiente de esta obra')
        if negativa:
            return negativa
    try:
        with get_db_connection() as conn:
            pendientes = enc.mi_trabajo(conn.cursor(), u['id'], obra)
        return jsonify({'pendientes': pendientes, 'total': len(pendientes)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
