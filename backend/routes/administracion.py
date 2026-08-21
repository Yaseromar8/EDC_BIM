# -*- coding: utf-8 -*-
"""QUIEN ADMINISTRA ESTA OBRA. La unica ruta que lo cambia.

POR QUE UN MODULO PROPIO Y NO `routes/directorio.py`
----------------------------------------------------
Porque el directorio es una PROYECCION: dice quien participa y con que funcion
contractual, y `test_el_bloque_no_toca_documentos_ni_permisos` fija que no
escriba en `project_users` ni en los permisos. Nombrar un administrador SI
cambia quien puede que, asi que no cabe ahi. La prueba tenia razon.

QUE ES, Y QUE NO ES
-------------------
Concede administrar ESTA obra: su directorio, sus permisos documentales y los
rescates que Reviews, RFI y Red Line ya permiten a un administrador. Su
autoridad TERMINA aqui -- no da nada en ninguna otra obra, y no es el Entity
Admin, que sigue siendo `users.role` y sigue teniendo alcance de instancia.

Y NO ALTERA nada de lo que la persona ya era: ni su empresa, ni su funcion
contractual, ni sus encargos, ni un solo historico.
"""
from flask import Blueprint, request, jsonify, g

from db import get_db_connection, resolve_project_id
from perimetro_de_obra import guardia_de_obra
import administracion_de_obra as _adm

administracion_bp = Blueprint('administracion', __name__)


def _usuario():
    return getattr(g, 'current_user', None) or {}


@administracion_bp.route('/api/projects/<path:project_id>/mi-administracion',
                         methods=['GET'])
def mi_administracion(project_id):
    """QUE administra QUIEN MIRA, en esta obra. Para la interfaz.

    POR QUE HACE FALTA UNA RUTA
    ---------------------------
    Porque el navegador ya no puede deducirlo. Hasta hoy la interfaz miraba
    `user.role === 'admin'` y con eso decidia si enseñar «Crear carpeta»,
    «Permisos» o «Destruir» -- en CUALQUIER obra. Ahora la administracion es
    POR OBRA y vive en la base, asi que hay que preguntarla.

    LO QUE ESTO NO ES
    -----------------
    No es una autorizacion. La interfaz no autoriza nada: cada ruta vuelve a
    comprobarlo en el servidor, y `ensayo_de_administracion.py` lo demuestra
    llamando a las rutas con la sesion equivocada. Esto solo evita ofrecer
    botones que van a devolver 403 -- que es la otra mitad de «la interfaz no
    promete nada que el producto no haga».
    """
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'ver esta obra')
    if negativa:
        return negativa
    u = _usuario()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            return jsonify({
                'project_id': obra,
                # LAS DOS FIGURAS, SEPARADAS. La interfaz necesita distinguirlas:
                # archivar una obra o tocar el catalogo de la entidad NO es lo
                # mismo que administrar ESTA obra.
                'es_entity_admin': bool(_adm.es_entity_admin(u)),
                'es_admin_de_obra': bool(_adm.es_admin_de_obra(cur, u, obra)),
            }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@administracion_bp.route('/api/projects/<path:project_id>/miembros/<int:user_id>/admin',
                     methods=['PUT'])
def nombrar_admin_de_obra(project_id, user_id):
    """Nombra o retira a un ADMINISTRADOR DE ESTA OBRA.

    QUE CONCEDE, Y QUE NO
    ---------------------
    Concede administrar ESTA obra: su directorio, sus permisos documentales y
    los rescates que Reviews, RFI y Red Line ya permiten a un administrador. Su
    autoridad TERMINA aqui: no le da nada en ninguna otra obra.

    Y NO ALTERA nada de lo que la persona ya era: ni su empresa, ni su funcion
    contractual, ni sus encargos, ni un solo historico. Es una columna en la
    fila de membresia y nada mas.

    POR QUE HACE FALTA SER MIEMBRO
    ------------------------------
    Porque la administracion VIVE en `project_users`: no existe la fila, no
    existe la administracion. La regla no se comprueba -- es la forma de la
    tabla. Retirar a alguien de la obra le retira la administracion en el mismo
    acto, sin que nadie tenga que acordarse.
    """
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'administrar esta obra')
    if negativa:
        return negativa

    d = request.get_json(silent=True) or {}
    if 'es_admin' not in d:
        return jsonify({'error': 'Falta es_admin (true o false)'}), 400
    quiere = bool(d.get('es_admin'))

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            negativa = _adm.guardia_administrativa(
                cur, _usuario(), obra, 'nombrar administradores de esta obra')
            if negativa:
                return negativa

            cur.execute('SELECT 1 FROM project_users WHERE project_id = %s '
                        '  AND user_id = %s', (obra, user_id))
            if not cur.fetchone():
                return jsonify({
                    'error': 'Esa persona no participa en esta obra. Un '
                             'administrador de obra tiene que ser miembro de ella.',
                    'code': 'NO_ES_MIEMBRO'}), 404

            # NADIE SE QUEDA SIN ADMINISTRADOR POR DESCUIDO. Si se retira al
            # ultimo y quien lo hace no es Entity Admin, la obra quedaria sin
            # quien la administre y sin quien pueda devolverle uno.
            if not quiere:
                cur.execute("SELECT count(*) FROM project_users "
                            " WHERE project_id = %s AND es_admin", (obra,))
                if (cur.fetchone() or [0])[0] <= 1 and not _adm.es_entity_admin(_usuario()):
                    return jsonify({
                        'error': 'Es el único administrador de esta obra. Nombra a '
                                 'otro antes de retirarlo.',
                        'code': 'ULTIMO_ADMIN_DE_OBRA'}), 409

            cur.execute('UPDATE project_users SET es_admin = %s '
                        ' WHERE project_id = %s AND user_id = %s RETURNING user_id',
                        (quiere, obra, user_id))
            if not cur.fetchone():
                return jsonify({'error': 'No se pudo actualizar'}), 500
            conn.commit()
            try:
                from db import log_activity
                log_activity(obra,
                             'project_admin_concedido' if quiere else 'project_admin_retirado',
                             'user', entity_id=str(user_id),
                             performed_by=(_usuario().get('email')
                                           or _usuario().get('name')))
            except Exception:
                pass
        return jsonify({'project_id': obra, 'user_id': user_id,
                        'es_admin': quiere, 'alcance': 'esta obra'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
