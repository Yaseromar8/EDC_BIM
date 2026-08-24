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


# =========================================================================
#  P5 · MEMBRESÍA DE ESTA OBRA — incorporar y retirar personas
# =========================================================================
#  «La ruta existía sin pantalla» (doc 55 §P5): la única forma de meter a
#  alguien en una obra era el reemplazo-por-lista de Entity Admin
#  (POST /api/projects/<id>/users). Estas rutas hacen la membresía operable
#  DESDE LA OBRA y con la autoridad de la obra: guardia_administrativa
#  (Entity Admin O administrador de ESTA obra), que es exactamente la figura
#  que en ACC/Procore gestiona el padrón de su proyecto. Nada aquí ensancha
#  Entity Admin.
#
#  La cadena que el propietario fijó: PERSONA → EMPRESA → FUNCIÓN
#  CONTRACTUAL → MEMBRESÍA → ¿PROJECT ADMIN? Cada eslabón se escribe donde
#  vive (empresa en users, función en project_companies, membresía aquí);
#  estas rutas solo tocan la MEMBRESÍA — la pantalla compone la cadena.


@administracion_bp.route('/api/projects/<path:project_id>/candidatos',
                         methods=['GET'])
def candidatos_de_obra(project_id):
    """Quién puede incorporarse a esta obra. El directorio de incorporación.

    POR QUÉ UNA RUTA PROPIA Y NO GET /api/users
    -------------------------------------------
    El padrón entero es del Entity Admin (lista de objetivos de phishing); a
    los demás, /api/users solo les da compañeros de obra. Pero el que
    ADMINISTRA UNA OBRA necesita elegir a quién incorporar de la entidad —
    la misma tensión que ACC resuelve dándole al Project Admin el directorio
    de la cuenta SOLO en el acto de añadir miembros. Esto es eso: visible
    únicamente para quien pasa `guardia_administrativa`, y devuelve solo lo
    incorporable (activos, no miembros ya, sin Entity Admins — que alcanzan
    todas las obras sin membresía).

    Los PENDIENTES sí salen (con su marca): incorporar a un invitado antes
    de que active es el flujo normal de arranque de una obra.
    """
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'ver esta obra')
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            negativa = _adm.guardia_administrativa(
                cur, _usuario(), obra, 'incorporar personas a esta obra')
            if negativa:
                return negativa
            cur.execute("""
                SELECT u.id, u.name, u.email, c.name, u.company_id,
                       (u.activated_at IS NULL) AS pendiente
                  FROM users u
             LEFT JOIN companies c ON c.id = u.company_id
                 WHERE COALESCE(u.is_active, TRUE)
                   AND u.role <> 'admin'
                   AND u.id NOT IN (SELECT user_id FROM project_users
                                     WHERE project_id = %s)
                 ORDER BY u.name NULLS LAST, u.email
            """, (obra,))
            gente = [{'id': r[0], 'name': r[1], 'email': r[2],
                      'empresa': r[3], 'company_id': r[4],
                      'pendiente': bool(r[5])} for r in cur.fetchall()]
        return jsonify({'project_id': obra, 'candidatos': gente}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@administracion_bp.route('/api/projects/<path:project_id>/miembros',
                         methods=['POST'])
def incorporar_miembro(project_id):
    """Incorpora UNA persona a esta obra. El acto de membresía, con nombre.

    Es deliberadamente de una en una: la incorporación es un acto que se
    audita por persona («quién metió a quién y cuándo»), no un estado que se
    sincroniza por lista. El reemplazo-por-lista de Entity Admin sigue
    existiendo para lo suyo; esto es el flujo de obra.

    QUÉ NO HACE: no toca empresa, ni función contractual, ni permisos de
    carpeta, ni concede administración. Solo nace la fila de membresía
    (es_admin FALSE, assigned_at ahora) — el resto de la cadena se decide en
    sus propios controles.
    """
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'administrar esta obra')
    if negativa:
        return negativa

    d = request.get_json(silent=True) or {}
    if not d.get('user_id'):
        return jsonify({'error': 'Falta user_id'}), 400
    uid = int(d['user_id'])

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            negativa = _adm.guardia_administrativa(
                cur, _usuario(), obra, 'incorporar personas a esta obra')
            if negativa:
                return negativa

            cur.execute('SELECT role, COALESCE(is_active, TRUE) '
                        '  FROM users WHERE id = %s', (uid,))
            fila = cur.fetchone()
            if not fila:
                return jsonify({'error': 'Esa persona no existe'}), 404
            if fila[0] == 'admin':
                # No es un capricho: la membresía de un Entity Admin sería una
                # fila mentirosa — su alcance no sale de ella y retirársela no
                # le quitaría nada.
                return jsonify({
                    'error': 'El Administrador de la entidad alcanza todas '
                             'las obras sin membresía: no hay nada que '
                             'incorporar.',
                    'code': 'ENTITY_ADMIN_SIN_MEMBRESIA'}), 409
            if not fila[1]:
                return jsonify({
                    'error': 'Esa cuenta está desactivada. Reactívala (o '
                             'reinvítala) antes de incorporarla a una obra.',
                    'code': 'CUENTA_RETIRADA'}), 409

            cur.execute("""INSERT INTO project_users (project_id, user_id)
                           VALUES (%s, %s)
                           ON CONFLICT DO NOTHING RETURNING user_id""",
                        (obra, uid))
            ya_estaba = cur.fetchone() is None
            conn.commit()
            if not ya_estaba:
                try:
                    from db import log_activity
                    log_activity(obra, 'miembro_incorporado', 'user',
                                 entity_id=str(uid),
                                 performed_by=(_usuario().get('email')
                                               or _usuario().get('name')))
                except Exception:
                    pass
        return jsonify({'project_id': obra, 'user_id': uid,
                        'ya_estaba': ya_estaba}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@administracion_bp.route('/api/projects/<path:project_id>/miembros/<int:user_id>',
                         methods=['DELETE'])
def retirar_miembro(project_id, user_id):
    """Retira a una persona DE ESTA OBRA. RETIRAR MEMBRESÍA ≠ RETIRAR IDENTIDAD.

    La cuenta sigue viva, sus actos históricos (RFIs, revisiones, redlines,
    asientos) quedan exactamente donde están. Lo que muere es lo que era de
    esta obra y era CONCESIÓN, no historia:

      · la fila de membresía — y con ella la administración de obra, porque
        es_admin vive en esa fila (la forma de la tabla, no una regla);
      · sus permisos de carpeta EN ESTA OBRA (precedente del PASO 14:
        «concesión de acceso, no acto histórico»).

    Y nadie deja la obra sin administrador por descuido: retirar al último
    administrador la bloquea el mismo 409 que retirarle la administración —
    salvo que lo haga el Entity Admin, que puede volver a nombrar.
    """
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'administrar esta obra')
    if negativa:
        return negativa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            negativa = _adm.guardia_administrativa(
                cur, _usuario(), obra, 'retirar personas de esta obra')
            if negativa:
                return negativa

            cur.execute('SELECT COALESCE(es_admin, FALSE) FROM project_users '
                        ' WHERE project_id = %s AND user_id = %s', (obra, user_id))
            fila = cur.fetchone()
            if not fila:
                return jsonify({'error': 'Esa persona no participa en esta obra.',
                                'code': 'NO_ES_MIEMBRO'}), 404
            if fila[0]:
                cur.execute('SELECT count(*) FROM project_users '
                            ' WHERE project_id = %s AND es_admin', (obra,))
                if (cur.fetchone() or [0])[0] <= 1 and not _adm.es_entity_admin(_usuario()):
                    return jsonify({
                        'error': 'Es el único administrador de esta obra. '
                                 'Nombra a otro antes de retirarlo.',
                        'code': 'ULTIMO_ADMIN_DE_OBRA'}), 409

            # Las concesiones de carpeta de ESTA obra (por model_urn, que es
            # como el expediente cuelga de la obra). Se cuentan para el asiento.
            cur.execute("""
                DELETE FROM folder_permissions fp
                 USING file_nodes fn, projects p
                 WHERE fp.folder_node_id = fn.id
                   AND fn.model_urn = p.model_urn
                   AND p.id = %s AND fp.user_id = %s
            """, (obra, user_id))
            permisos_fuera = cur.rowcount or 0
            cur.execute('DELETE FROM project_users WHERE project_id = %s '
                        '  AND user_id = %s', (obra, user_id))
            conn.commit()
            try:
                from db import log_activity
                log_activity(obra, 'miembro_retirado', 'user',
                             entity_id=str(user_id),
                             performed_by=(_usuario().get('email')
                                           or _usuario().get('name')))
            except Exception:
                pass
        return jsonify({'project_id': obra, 'user_id': user_id,
                        'permisos_de_carpeta_retirados': permisos_fuera,
                        'nota': 'La identidad y sus actos históricos se conservan.'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# =========================================================================
#  CAPA 16 · TOOL ACTIVATION — qué herramientas existen en esta obra
# =========================================================================
#  Estas rutas NUNCA se gobiernan a sí mismas: si apagar «RFI» apagara
#  también la pantalla que lo enciende, la operación sería irreversible
#  desde la interfaz. La compuerta del middleware solo mira las rutas de
#  DATOS de cada herramienta.


@administracion_bp.route('/api/projects/<path:project_id>/herramientas',
                         methods=['GET'])
def herramientas_de_la_obra(project_id):
    """Qué herramientas están habilitadas aquí, y el catálogo completo.

    La puede leer cualquier MIEMBRO: la interfaz necesita saber qué pestañas
    ofrecer, y ofrecer una que va a devolver 403 es prometer lo que el
    producto no hace. Cambiarlas es otra cosa (abajo, con autoridad).
    """
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'ver esta obra')
    if negativa:
        return negativa
    try:
        import herramientas_de_obra as hdo
        with get_db_connection() as conn:
            cur = conn.cursor()
            estado = hdo.estado_de_obra(cur, obra)
        return jsonify({
            'project_id': obra,
            'estado': estado,
            'catalogo': hdo.catalogo_publico(),
            # DOCUMENTOS no aparece: es el substrato del producto y no se
            # apaga (diferencia deliberada con ACC, ver el módulo).
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@administracion_bp.route('/api/projects/<path:project_id>/herramientas/<codigo>',
                         methods=['PUT'])
def cambiar_herramienta(project_id, codigo):
    """Enciende o apaga UNA herramienta en esta obra. Acto administrativo.

    QUÉ CONCEDE Y QUÉ NO: cambia la DISPONIBILIDAD de la herramienta para
    toda la obra. No toca la membresía de nadie, ni sus permisos de carpeta,
    ni su autoridad en los flujos. Apagar no borra NADA de lo ya registrado
    —los RFI existentes siguen ahí— solo deja de poder usarse hasta que se
    vuelva a encender: es configuración, no destrucción.
    """
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'administrar esta obra')
    if negativa:
        return negativa

    import herramientas_de_obra as hdo
    if codigo not in hdo.CODIGOS:
        return jsonify({'error': 'Herramienta desconocida: %s' % codigo,
                        'code': 'HERRAMIENTA_DESCONOCIDA'}), 400
    d = request.get_json(silent=True) or {}
    if 'activa' not in d:
        return jsonify({'error': 'Falta activa (true o false)'}), 400
    quiere = bool(d.get('activa'))

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            negativa = _adm.guardia_administrativa(
                cur, _usuario(), obra, 'activar o desactivar herramientas')
            if negativa:
                return negativa
            quien = (_usuario().get('email') or _usuario().get('name') or '?')
            cur.execute("""INSERT INTO project_tools
                                (project_id, herramienta, activa, cambiado_por)
                           VALUES (%s, %s, %s, %s)
                           ON CONFLICT (project_id, herramienta)
                           DO UPDATE SET activa = EXCLUDED.activa,
                                         cambiado_por = EXCLUDED.cambiado_por,
                                         cambiado_en = CURRENT_TIMESTAMP""",
                        (str(obra), codigo, quiere, quien))
            conn.commit()
            try:
                from db import log_activity
                log_activity(obra,
                             'herramienta_activada' if quiere else 'herramienta_desactivada',
                             'tool', entity_id=codigo, performed_by=quien)
            except Exception:
                pass
        return jsonify({'project_id': obra, 'herramienta': codigo,
                        'activa': quiere, 'etiqueta': hdo.etiqueta(codigo)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# =========================================================================
#  CAPA 08 · MEMBER TOOL ACCESS — quién entra a una herramienta habilitada
# =========================================================================
#  El escalón entre la MEMBRESÍA (capa 03) y el PERMISO DE RECURSO (capa 09).
#  Ni sustituye a la activación de la obra (capa 16: apagada no entra nadie)
#  ni concede un solo documento.


@administracion_bp.route('/api/projects/<path:project_id>/miembros/<int:user_id>/herramientas',
                         methods=['GET'])
def herramientas_del_miembro(project_id, user_id):
    """A qué herramientas entra ESTA persona en ESTA obra.

    Devuelve las dos capas por separado, sin mezclarlas: `activa_en_la_obra`
    (capa 16) y `acceso_del_miembro` (capa 08). Presentarlas fundidas en un
    solo booleano sería justo el atajo que borra la distinción — y quien
    administra necesita saber si una herramienta le falta a alguien porque
    está apagada para todos o porque se la retiraron a él.
    """
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'administrar esta obra')
    if negativa:
        return negativa
    try:
        import herramientas_de_obra as hdo
        import acceso_a_herramientas as ath
        with get_db_connection() as conn:
            cur = conn.cursor()
            negativa = _adm.guardia_administrativa(
                cur, _usuario(), obra, 'ver el acceso a herramientas de un miembro')
            if negativa:
                return negativa
            cur.execute('SELECT 1 FROM project_users WHERE project_id = %s '
                        '  AND user_id = %s', (str(obra), user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Esa persona no participa en esta obra.',
                                'code': 'NO_ES_MIEMBRO'}), 404
            activas = hdo.estado_de_obra(cur, obra)
            del_miembro = ath.estado_de_miembro(cur, obra, user_id)
        return jsonify({
            'project_id': obra, 'user_id': user_id,
            'herramientas': [{
                'codigo': h['codigo'], 'etiqueta': h['etiqueta'],
                'activa_en_la_obra': activas.get(h['codigo'], True),
                'acceso_del_miembro': del_miembro.get(h['codigo'], True),
                # EFECTIVO = las dos cosas. Se da calculado para que la
                # pantalla no lo recomponga a su manera, pero las dos
                # razones viajan aparte y se pueden explicar.
                'efectivo': bool(activas.get(h['codigo'], True)
                                 and del_miembro.get(h['codigo'], True)),
            } for h in hdo.CATALOGO],
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@administracion_bp.route('/api/projects/<path:project_id>/miembros/<int:user_id>'
                         '/herramientas/<codigo>', methods=['PUT'])
def cambiar_acceso_a_herramienta(project_id, user_id, codigo):
    """Concede o retira a ESTA persona el acceso a UNA herramienta, aquí.

    QUÉ NO HACE: no la mete ni la saca de la obra, no toca su empresa ni su
    función contractual, no le da ni le quita un documento, y no enciende la
    herramienta si está apagada para todos. Solo este escalón.
    """
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'administrar esta obra')
    if negativa:
        return negativa

    import herramientas_de_obra as hdo
    import acceso_a_herramientas as ath
    if codigo not in hdo.CODIGOS:
        return jsonify({'error': 'Herramienta desconocida: %s' % codigo,
                        'code': 'HERRAMIENTA_DESCONOCIDA'}), 400
    d = request.get_json(silent=True) or {}
    if 'permitido' not in d:
        return jsonify({'error': 'Falta permitido (true o false)'}), 400
    quiere = bool(d.get('permitido'))

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            negativa = _adm.guardia_administrativa(
                cur, _usuario(), obra, 'cambiar el acceso a herramientas')
            if negativa:
                return negativa
            cur.execute('SELECT 1 FROM project_users WHERE project_id = %s '
                        '  AND user_id = %s', (str(obra), user_id))
            if not cur.fetchone():
                # No se puede conceder acceso a una herramienta a quien no
                # participa: seria una fila que no alcanza a nadie y que ademas
                # sugiere un acceso que la membresia niega antes.
                return jsonify({'error': 'Esa persona no participa en esta obra. '
                                         'Incorpórala primero.',
                                'code': 'NO_ES_MIEMBRO'}), 404
            quien = (_usuario().get('email') or _usuario().get('name') or '?')
            queda = ath.fijar(cur, obra, user_id, codigo, quiere, quien)
            conn.commit()
            try:
                from db import log_activity
                log_activity(obra,
                             'acceso_herramienta_concedido' if queda
                             else 'acceso_herramienta_retirado',
                             'user', entity_id='%s:%s' % (user_id, codigo),
                             performed_by=quien)
            except Exception:
                pass
        return jsonify({'project_id': obra, 'user_id': user_id,
                        'herramienta': codigo, 'permitido': queda,
                        'etiqueta': hdo.etiqueta(codigo)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@administracion_bp.route('/api/projects/<path:project_id>/miembros/<int:user_id>'
                         '/aplicar-perfil', methods=['POST'])
def aplicar_perfil_a_miembro(project_id, user_id):
    """CAPA 13 · aplica un perfil a esta persona EN ESTA OBRA.

    APLICAR es un acto DE OBRA (autoridad de la obra), aunque el catálogo de
    perfiles sea de la entidad. Y es un acto, no un vínculo: escribe filas
    normales de la capa 08 y ahí termina. Después manda esa tabla — el perfil
    no vuelve a consultarse para decidir nada, y editarlo mañana no cambiará
    lo que esta persona tiene hoy.
    """
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'administrar esta obra')
    if negativa:
        return negativa

    d = request.get_json(silent=True) or {}
    if not d.get('perfil_id'):
        return jsonify({'error': 'Falta perfil_id'}), 400

    import perfiles_de_acceso as pa
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            negativa = _adm.guardia_administrativa(
                cur, _usuario(), obra, 'aplicar perfiles de acceso')
            if negativa:
                return negativa
            perfil = pa.leer(cur, int(d['perfil_id']))
            if not perfil:
                return jsonify({'error': 'Perfil no encontrado'}), 404
            cur.execute('SELECT 1 FROM project_users WHERE project_id = %s '
                        '  AND user_id = %s', (str(obra), user_id))
            if not cur.fetchone():
                return jsonify({'error': 'Esa persona no participa en esta obra. '
                                         'Incorpórala primero.',
                                'code': 'NO_ES_MIEMBRO'}), 404
            quien = (_usuario().get('email') or _usuario().get('name') or '?')
            escrito = pa.aplicar(cur, perfil, obra, user_id, quien)
            conn.commit()
            try:
                from db import log_activity
                log_activity(obra, 'perfil_de_acceso_aplicado', 'user',
                             entity_id='%s:perfil-%s' % (user_id, perfil['id']),
                             performed_by=quien)
            except Exception:
                pass
        return jsonify({
            'project_id': obra, 'user_id': user_id,
            'perfil': {'id': perfil['id'], 'nombre': perfil['nombre']},
            'aplicado': escrito,
            'nota': 'A partir de aquí manda el acceso a herramientas de esta '
                    'persona: el perfil dejó la configuración y no vuelve a '
                    'decidir. Editarlo después no la cambiará.',
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# =========================================================================
#  CAPA 14 · PROJECT TEMPLATES — configuración de obra, reproducible
# =========================================================================


@administracion_bp.route('/api/projects/<path:project_id>/aplicar-plantilla',
                         methods=['POST'])
def aplicar_plantilla(project_id):
    """Escribe la configuración de una plantilla en ESTA obra.

    Pensado para una obra RECIÉN CREADA: escribe carpetas, herramientas,
    empresas e idoneidad. Las carpetas se crean con IDENTIDAD NUEVA —
    reutilizar los ids del origen haría que dos obras compartieran nodos y el
    aislamiento se rompería en el acto.

    NO trae miembros ni permisos: la gente entra por invitación y membresía,
    nunca por herencia de una plantilla.
    """
    obra = resolve_project_id(project_id)
    if not obra:
        return jsonify({'error': 'Obra no encontrada'}), 404
    negativa = guardia_de_obra(obra, 'administrar esta obra')
    if negativa:
        return negativa

    d = request.get_json(silent=True) or {}
    if not d.get('plantilla_id'):
        return jsonify({'error': 'Falta plantilla_id'}), 400

    import plantillas_de_obra as pdo
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            negativa = _adm.guardia_administrativa(
                cur, _usuario(), obra, 'aplicar una plantilla a esta obra')
            if negativa:
                return negativa
            cur.execute('SELECT nombre, molde FROM plantillas_de_obra WHERE id = %s',
                        (int(d['plantilla_id']),))
            fila = cur.fetchone()
            if not fila:
                return jsonify({'error': 'Plantilla no encontrada'}), 404
            nombre_plantilla, molde = fila[0], (fila[1] or {})

            cur.execute('SELECT model_urn FROM projects WHERE id = %s', (str(obra),))
            f2 = cur.fetchone()
            if not f2 or not f2[0]:
                return jsonify({'error': 'La obra no tiene expediente asociado.'}), 409
            model_urn = f2[0]

            quien = (_usuario().get('email') or _usuario().get('name') or '?')
            creado = pdo.aplicar(cur, molde, obra, model_urn, quien)
            conn.commit()
            try:
                from db import log_activity
                log_activity(obra, 'plantilla_aplicada', 'project',
                             entity_id=str(d['plantilla_id']), performed_by=quien)
            except Exception:
                pass
        return jsonify({
            'project_id': obra, 'plantilla': nombre_plantilla, 'creado': creado,
            'nota': 'Se creó la configuración. La obra no tiene documentos, actos '
                    'ni miembros de la plantilla: eso se incorpora aquí.',
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500
