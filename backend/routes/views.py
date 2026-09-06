"""Las rutas de las Saved Views.

QUE FORMA TIENE CADA RESPUESTA --y por que no es una sola-- esta en
`vistas_contrato.py`. Aqui solo se decide QUE consulta se hace y QUIEN mira.
"""
from esquema_congelado import solo_con_ddl
import os
import json
import secrets
import time
import traceback
from flask import Blueprint, request, jsonify, g
from politica import publico_en_lectura
from db import get_db_connection
import vistas_contrato as contrato
import vistas_v2
import vistas_permisos as permisos
import vistas_compartidas as compartidas
from perimetro_de_obra import guardia_de_obra
from rate_limit import limite

views_bp = Blueprint('views', __name__)


@solo_con_ddl
def ensure_saved_views_table():
    """Creates the saved_views table in PostgreSQL if it doesn't exist."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                CREATE TABLE IF NOT EXISTS saved_views (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    project_id TEXT,
                    viewer_state JSONB,
                    filter_state JSONB,
                    config JSONB,
                    created_at TIMESTAMP DEFAULT NOW()
                )
            ''')
            conn.commit()
            print("[views] Table saved_views ready.")
    except Exception as e:
        print(f"[views] Error creating saved_views table: {e}")


try:
    ensure_saved_views_table()
except Exception:
    pass



def leer_por_token(token):
    """La fila cuya CAPACIDAD publica es este token. None si no hay ninguna.

    Consulta separada de `leer_fila` a proposito: son dos preguntas distintas
    --«la vista tal» y «la vista que abre este enlace»-- y mezclarlas en una
    funcion con dos ramas es como se acaba aceptando una clave donde se
    esperaba la otra.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT %s FROM saved_views WHERE share_token = %%s::uuid"
                % contrato.SQL_DETALLE, (token,))
            r = cursor.fetchone()
            return dict(zip(contrato.COLUMNAS_DETALLE, r)) if r else None
    except Exception as e:
        print(f"[views] lectura por token fallida: {e}")
        return None


def leer_fila(view_id):
    """La fila entera de una vista, como diccionario por nombre de columna.

    Devuelve el DATO EN BRUTO, sin decidir que se ensena: eso depende de quien
    pregunta y lo resuelve `vistas_contrato`. Separarlo evita el error de tener
    una funcion que «lee una vista» y acaba siendo tambien la que decide que
    campos son publicos.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT %s FROM saved_views WHERE id = %%s" % contrato.SQL_DETALLE,
                (view_id,)
            )
            r = cursor.fetchone()
            return dict(zip(contrato.COLUMNAS_DETALLE, r)) if r else None
    except Exception as e:
        print(f"[views] DB read by id failed: {e}")
        return None


def get_view_by_id(view_id):
    """Compatibilidad: la forma de detalle, para quien ya la usaba.

    Un unico llamador fuera de aqui --`_obra_de_la_vista` en server.py, que solo
    mira `projectId` para acotar el inventario de un enlace compartido--.
    """
    fila = leer_fila(view_id)
    return contrato.fila_de_detalle(fila) if fila else None


def listar_vistas(project_id=None):
    """EL LISTADO. Metadatos y nada mas.

    La consulta NO NOMBRA `viewer_state`, `filter_state`, `config` ni `state`.
    No es que se filtren despues: es que no salen de la base. Medido en la base
    de trabajo: 14 vistas cuyos documentos suman 74.526 bytes que el panel no
    llega a mirar --pinta `id` y `name`, ViewsPanel.jsx:163-165--.

    EL ORDEN: `updated_at DESC NULLS LAST, created_at DESC`.

    Lo primero que se ve es lo ultimo que se toco, que es lo que uno busca en una
    galeria. Antes era `created_at` ascendente --las mas viejas arriba-- y con
    PUT y PATCH ya existiendo eso deja de tener sentido: una vista que acabas de
    actualizar se quedaba enterrada.

    `NULLS LAST` no es decoracion: `updated_at` es NULL en las 14 vistas
    historicas --nunca se han modificado-- y en PostgreSQL DESC ordena los NULL
    PRIMERO por omision. Sin esa clausula, las mas viejas seguirian arriba, que
    es exactamente lo contrario de lo que se pretende.

    Y esta forma es la que el indice de E-0 sabe servir:
    `ix_saved_views_project_updated (project_id, updated_at DESC NULLS LAST)`.
    Con 14 filas PostgreSQL elige recorrido secuencial y hace bien; lo que se
    comprueba es que la CONSULTA sea compatible con el indice cuando crezca.
    """
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            if project_id:
                cursor.execute(
                    "SELECT %s FROM saved_views WHERE project_id = %%s "
                    "ORDER BY updated_at DESC NULLS LAST, created_at DESC" % contrato.SQL_LISTADO,
                    (project_id,)
                )
            else:
                cursor.execute(
                    "SELECT %s FROM saved_views "
                    "ORDER BY updated_at DESC NULLS LAST, created_at DESC" % contrato.SQL_LISTADO
                )
            return [dict(zip(contrato.COLUMNAS_LISTADO, r)) for r in cursor.fetchall()]
    except Exception as e:
        print(f"[views] DB read failed: {e}")
        return []


def save_view_to_db(view):
    """Inserts a single view into PostgreSQL."""
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # `created_by` NO entra en el DO UPDATE: el autor de una vista no
            # cambia porque alguien la vuelva a escribir.
            cursor.execute('''
                INSERT INTO saved_views (id, name, project_id, viewer_state, filter_state, config, created_by, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    viewer_state = EXCLUDED.viewer_state,
                    filter_state = EXCLUDED.filter_state,
                    config = EXCLUDED.config
            ''', (
                view['id'], view['name'], view.get('projectId'),
                json.dumps(view.get('viewerState', {})),
                json.dumps(view.get('filterState', {})),
                json.dumps(view.get('config', {})),
                view.get('createdBy')
            ))
            conn.commit()
            return True
    except Exception as e:
        print(f"[views] DB save failed: {e}")
        return False


# --- API Routes ---


@views_bp.route("/api/views/<view_id>", methods=["GET"])
@limite(compartidas.LIMITE_PUBLICO)
@publico_en_lectura(motivo='es el enlace de vista compartida: quien lo abre es un tercero sin sesion')
def get_view(view_id):
    """EL DETALLE. La misma ruta sirve a dos lectores muy distintos.

    CON SESION  -> se direcciona por el ID de la vista, y se comprueba la obra.
    SIN SESION  -> se direcciona por la CAPACIDAD (`share_token`), o por la via
                   antigua mientras su ventana siga abierta. Lo justo para
                   restaurar, y ni un dato de persona.

    Que el parametro se llame `view_id` es historia: por la via publica ya no es
    un id, es una clave de enlace. Renombrarlo cambiaria el nombre del endpoint
    de Flask y con el las entradas de politica y las pruebas que lo nombran, asi
    que se deja quieto y se dice aqui.

    Quien mira se sabe SIEMPRE, tambien en las rutas publicas: el middleware
    resuelve la identidad antes de decidir si la exige (auth_middleware.py, «se
    resuelve SIEMPRE que venga un token, incluso en rutas publicas»).
    """
    usuario = getattr(g, 'current_user', None)

    if not usuario:
        fila, resultado, _via = compartidas.resolver_vista_compartida(
            view_id, leer_fila, leer_por_token, get_db_connection)
        if resultado == compartidas.LEGACY_RETIRADO:
            # 410: este enlace EXISTIO y ya no sirve. Se responde igual exista
            # la vista o no --no se ha mirado la base-- asi que no dice nada de
            # ninguna vista concreta.
            return jsonify({
                'error': 'Este enlace antiguo ya no esta activo. Pide uno nuevo a quien te lo compartio.',
                'code': 'ENLACE_RETIRADO'}), 410
        if not fila:
            return jsonify({"error": "View not found"}), 404
        return jsonify(contrato.fila_publica(fila))

    fila = leer_fila(view_id)
    if not fila:
        return jsonify({"error": "View not found"}), 404
    if usuario:
        # CON SESION la obra si se comprueba. Es deliberado que sea mas estricto
        # que la via anonima: el enlace compartido es una concesion explicita a
        # quien tiene el identificador, mientras que una sesion identificada
        # tiene una obra y unos limites que si se pueden comprobar.
        negativa = guardia_de_obra(fila.get('project_id'), 'ver esta vista')
        if negativa:
            return negativa
        manda_aqui = permisos.es_admin_de_la_obra(usuario, fila.get('project_id'))
        return jsonify(permisos.con_permisos(contrato.fila_de_detalle(fila, usuario),
                                             usuario, manda_aqui))


@views_bp.route('/api/views', methods=['GET'])
def get_views():
    """EL LISTADO. Exige sesion, y no por un decorador: el middleware solo abre
    el prefijo `/api/views/` --con barra-- para los enlaces compartidos, y esta
    ruta es `/api/views`."""
    project_id = request.args.get('project')
    if not project_id:
        # Sin frente no se puede acotar, y un listado sin acotar devolvia las
        # vistas de TODAS las obras. No se elige una por defecto: se pide.
        return jsonify({'error': 'Falta el frente: /api/views?project=...',
                        'code': 'FALTA_OBRA'}), 400
    negativa = guardia_de_obra(project_id, 'ver las vistas de esta obra')
    if negativa:
        return negativa
    usuario = getattr(g, 'current_user', None)
    # UNA sola consulta para todo el listado: la obra es la misma para todas sus
    # filas, y preguntarla por vista seria N consultas para la misma respuesta.
    manda_aqui = permisos.es_admin_de_la_obra(usuario, project_id)
    return jsonify([permisos.con_permisos(contrato.fila_de_listado(f, usuario), usuario, manda_aqui)
                    for f in listar_vistas(project_id)])


# ── ESCRITURA ─────────────────────────────────────────────────────────────

# El unico interruptor de esta etapa, y esta apagado.
#
# Un PUT sobre una vista v1 la convertiria en v2, y esa conversion DESTRUYE el
# unico ejemplar del documento v1: `viewer_state`, `filter_state` y `config`
# pasan a NULL y no hay vuelta atras. Nadie lo necesita todavia --el restaurador
# v2 es E-5-- y la regla vigente dice que las vistas v1 no se reescriben. La via
# para llevarse una v1 a v2 es «Guardar como», que crea otra fila y deja la
# original intacta.
#
# Queda escrito y probado en las dos posiciones para que encenderlo sea una
# decision de una linea, no un desarrollo.
CONVERSION_V1_EN_SITIO = False

# Lo unico que PATCH puede tocar. Todo lo demas es identidad o documento.
CAMPOS_DE_METADATOS = ('name', 'description', 'thumbnail')


def _usuario():
    return getattr(g, 'current_user', None) or {}


# ═══════════════════════════════════════════════════════════════════════════
# DOS CAPAS, Y NO SON LA MISMA PREGUNTA
# ═══════════════════════════════════════════════════════════════════════════
#
#   ACCESO AL RECURSO   ¿puede esta persona entrar en esta obra?   -> aqui
#   AUTORIA             ¿puede modificar ESTA vista?               -> vistas_permisos
#
# Hasta E-4C solo existia la segunda, y con eso un miembro de la obra A podia
# LEER el listado y el detalle de las vistas de la obra B: para leer no hacia
# falta ser autor de nada.
#
# COMO SE RESUELVE LA OBRA DE UNA VISTA
# -------------------------------------
# `saved_views.project_id` guarda el FRENTE --'1_DRENAJE', '1_CANAL'--, no
# `projects.id`. La traduccion NO se inventa aqui: la hace `resolve_project_id`
# (db.py), cuya autoridad es `project_ref` y que ademas conoce la convencion
# `<obra>_<FRENTE>`. Medido contra la base de trabajo:
#
#     1_CANAL                              -> obra '1'                        4 miembros
#     1_DRENAJE                            -> obra '1'                        4 miembros
#     b.proj_pqt8_..._INTERFERENCIAS       -> obra 'b.proj_pqt8_...4852'      1 miembro
#     ''  (3 vistas de marzo)              -> None
#
# Las tres de la cadena vacia NO resuelven, y eso se trata como negativa: no
# saber de que obra es una vista no puede resolverse dandola por buena. Solo el
# Entity Admin las alcanza. En el panel ya eran invisibles --el listado filtra
# por frente-- asi que esto no le quita a nadie algo que estuviera usando.
#
# `guardia_de_obra` es la pieza que ya existia para esto: Entity Admin o Project
# Admin de esa obra pasan; el resto tiene que ser miembro; sin obra resoluble,
# 403. No se usa `guardia_de_recurso` porque devuelve el valor CRUDO de la
# columna --el frente-- y se lo pasa a `_user_in_project` sin traducir, que es
# justamente el paso que aqui hace falta.
def _alcance_y_autor(view_id):
    """(frente, autor, schema_version) de una vista. None si no existe.

    Lectura corta y SIN bloqueo: se necesita antes de abrir la transaccion de
    escritura, porque `guardia_de_obra` abre su propia conexion y encadenarla
    dentro de un `FOR UPDATE` seria sostener un bloqueo mientras se pide otra
    conexion del pool. La obra de una vista no cambia --ni PUT ni PATCH pueden
    tocar `project_id`-- asi que leerla antes es tan valido como leerla dentro;
    la AUTORIA, que si decide, se vuelve a comprobar ya con la fila bloqueada.
    """
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT project_id, created_by, schema_version "
                        "  FROM saved_views WHERE id = %s", (view_id,))
            return cur.fetchone()
    except Exception as e:
        print(f"[views] no se pudo leer el alcance: {e}")
        return None


def _no_persistible(problemas, mensaje='El documento no se puede guardar como v2.'):
    """422: la peticion esta bien formada, su contenido no se puede guardar.

    Ni se limpia ni se guarda a medias: se dice QUE campo y POR QUE, y no se
    escribe una fila.
    """
    return jsonify(vistas_v2.cuerpo_de_rechazo(problemas, mensaje)), 422


def _campos_no_permitidos(data, permitidos):
    return [k for k in data.keys() if k not in permitidos]


def _nueva_id():
    """El identificador ES la credencial: GET /api/views/<id> es publico, asi
    que quien acierte el numero ve la vista. Antes era la hora en milisegundos
    --13 cifras derivadas del reloj--, de modo que quien supiera aproximadamente
    cuando se creo recorria un rango estrecho hasta dar con ella. Comprobado: un
    anonimo, sin cabecera ninguna, sacaba el nombre, la obra y el estado de
    camara de una vista ajena."""
    return secrets.token_urlsafe(24)


@views_bp.route('/api/views', methods=['POST'])
def save_view():
    """Crear una vista. El cuerpo decide si nace v1 o v2.

    Con `state` (o `schemaVersion: 2`) nace v2 y las tres columnas de v1 quedan
    NULL. Sin el, nace v1 exactamente como hasta hoy: el visor desplegado sigue
    guardando v1 y esta etapa no lo cambia.

    LO QUE SI CAMBIA EN LA VIA v1: la fila queda FIRMADA. `created_by` NULL
    significa «vista anterior a esta migracion, autor desconocido» y la politica
    de permisos la trata como de la obra --solo administracion la modifica--. Si
    las vistas nuevas siguieran naciendo sin autor, esa politica convertiria a
    todo el mundo en invitado de su propia vista: la guardas y ya no la puedes
    borrar. NULL tiene que seguir queriendo decir «historica».
    """
    data = request.get_json(silent=True) or {}
    autor = _usuario().get('id')
    # La obra se lee AQUI, en la ruta, y no dentro de cada ayudante: es el dato
    # con el que el control central acota la peticion, y esconderlo un nivel mas
    # abajo lo deja fuera de su alcance sin que nadie lo decida.
    obra = data.get('project') or data.get('projectId')
    negativa = guardia_de_obra(obra, 'guardar una vista en esta obra')
    if negativa:
        return negativa

    if 'state' in data or data.get('schemaVersion') == vistas_v2.SCHEMA_VERSION:
        return _crear_v2(data, autor, obra)
    return _crear_v1(data, autor, obra)


def _crear_v1(data, autor, obra):
    if not data or 'name' not in data or 'viewerState' not in data:
        return jsonify({'error': 'Missing name or state'}), 400

    new_view = {
        'id': _nueva_id(),
        'name': data['name'],
        'viewerState': data['viewerState'],
        'filterState': data.get('filterState', {}),
        'config': data.get('config', {}),
        'createdAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'projectId': obra,
        'createdBy': autor,
    }

    if not save_view_to_db(new_view):
        return jsonify({'error': 'Failed to save view to database'}), 500

    # Se responde con la forma del LISTADO, no con el documento que acaba de
    # subir: quien guarda ya lo tiene, y asi lo que se anade al panel tiene la
    # misma forma que lo que el panel ya tenia.
    fila = leer_fila(new_view['id'])
    if not fila:
        return jsonify(new_view)
    return jsonify(permisos.con_permisos(contrato.fila_de_listado(fila, _usuario()),
                                         _usuario(), permisos.es_admin_de_la_obra(_usuario(), obra)))


def _crear_v2(data, autor, obra):
    estado = data.get('state')
    nombre = data.get('name')
    descripcion = data.get('description')
    miniatura = data.get('thumbnail')

    ok_meta, problemas = vistas_v2.validar_metadatos(nombre, descripcion, miniatura)
    ok_doc, problemas_doc = vistas_v2.validar_v2_persistible(estado)
    problemas = problemas + problemas_doc
    if not (ok_meta and ok_doc):
        return _no_persistible(problemas)

    vista_id = _nueva_id()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Las tres columnas de v1 NO se nombran: quedan NULL. Un documento v2
            # vive entero en `state`, y tener las dos mitades a la vez seria tener
            # dos verdades sobre la misma vista.
            cur.execute(
                """INSERT INTO saved_views
                       (id, name, project_id, schema_version, state,
                        description, thumbnail, created_by, created_at, updated_at)
                   VALUES (%s, %s, %s, 2, %s::jsonb, %s, %s, %s, NOW(), NOW())""",
                (vista_id, nombre.strip(), obra,
                 json.dumps(estado), descripcion, miniatura, autor))
            conn.commit()
    except Exception as e:
        print(f"[views] alta v2 fallida: {e}")
        return jsonify({'error': 'No se pudo guardar la vista.'}), 500

    fila = leer_fila(vista_id)
    return jsonify(permisos.con_permisos(contrato.fila_de_detalle(fila, _usuario()), _usuario(),
                                         permisos.es_admin_de_la_obra(_usuario(), obra))), 201


@views_bp.route('/api/views/<view_id>', methods=['PUT'])
def reemplazar_estado(view_id):
    """PUT = «esta vista pasa a estar ASI». El mismo id, el mismo enlace.

    Reemplaza `state` y anota `updated_at`. No toca el nombre, ni la
    descripcion, ni la miniatura, ni la obra, ni el autor: renombrar es PATCH.
    Que guardar el estado cambiara ademas el nombre seria justo el tipo de
    efecto secundario que hace que nadie sepa que hizo una peticion.

    La lectura y la escritura van en la MISMA transaccion y la fila se toma con
    `FOR UPDATE`: si dos personas guardan a la vez, una espera a la otra en vez
    de escribir sobre una lectura vieja. Y si la validacion falla, se sale sin
    `commit` -- el gestor de conexion deshace y la fila queda como estaba.
    """
    data = request.get_json(silent=True) or {}
    sobra = _campos_no_permitidos(data, ('state', 'schemaVersion'))
    if sobra:
        return jsonify({'error': 'PUT solo reemplaza el estado.', 'code': 'CAMPO_NO_PERMITIDO',
                        'campos': sobra, 'ayuda': 'los metadatos se cambian con PATCH'}), 400
    if 'state' not in data:
        return jsonify({'error': 'Falta `state`.', 'code': 'FALTA_STATE'}), 400
    if 'schemaVersion' in data and data['schemaVersion'] != vistas_v2.SCHEMA_VERSION:
        return jsonify({'error': 'PUT solo acepta documentos v2.', 'code': 'SCHEMA_VERSION'}), 400

    estado = data['state']
    alcance = _alcance_y_autor(view_id)
    if not alcance:
        return jsonify({'error': 'View not found'}), 404
    negativa = guardia_de_obra(alcance[0], 'actualizar esta vista')
    if negativa:
        return negativa

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT schema_version, created_by FROM saved_views WHERE id = %s FOR UPDATE",
                        (view_id,))
            fila = cur.fetchone()
            if not fila:
                return jsonify({'error': 'View not found'}), 404
            version_actual, autor = int(fila[0] or 1), fila[1]

            # QUIEN, antes que QUE. Sobre la fila ya bloqueada: autorizar contra
            # una lectura anterior seria autorizar contra datos que pueden haber
            # cambiado entre medias.
            negativa = permisos.guardia(
                _usuario(), autor, 'actualizar',
                permisos.es_admin_de_la_obra(_usuario(), alcance[0], cur))
            if negativa:
                return negativa

            if version_actual != vistas_v2.SCHEMA_VERSION and not CONVERSION_V1_EN_SITIO:
                return jsonify({
                    'error': 'Esta vista es v1 y no se convierte en sitio.',
                    'code': 'V1_NO_SE_CONVIERTE',
                    'ayuda': 'usa «Guardar como» para crear una v2 nueva; la v1 queda intacta',
                }), 409

            ok, problemas = vistas_v2.validar_v2_persistible(estado)
            if not ok:
                return _no_persistible(problemas)

            cur.execute(
                """UPDATE saved_views
                      SET state = %s::jsonb, schema_version = 2,
                          viewer_state = NULL, filter_state = NULL, config = NULL,
                          updated_at = NOW()
                    WHERE id = %s""",
                (json.dumps(estado), view_id))
            conn.commit()
    except Exception as e:
        print(f"[views] PUT fallido: {e}")
        return jsonify({'error': 'No se pudo actualizar la vista.'}), 500

    return jsonify(permisos.con_permisos(
        contrato.fila_de_detalle(leer_fila(view_id), _usuario()), _usuario(),
        permisos.es_admin_de_la_obra(_usuario(), alcance[0])))


@views_bp.route('/api/views/<view_id>', methods=['PATCH'])
def cambiar_metadatos(view_id):
    """PATCH = la etiqueta, no el contenido.

    Nombre, descripcion y miniatura. Cualquier otra clave se RECHAZA por su
    nombre en vez de ignorarse: una peticion que pide cambiar `state` y recibe
    200 se lee como que lo cambio.

    `updated_at` si se mueve: renombrar es modificar, y la fecha dice cuando se
    toco la vista por ultima vez.
    """
    data = request.get_json(silent=True) or {}
    sobra = _campos_no_permitidos(data, CAMPOS_DE_METADATOS)
    if sobra:
        return jsonify({'error': 'PATCH solo cambia metadatos.', 'code': 'CAMPO_NO_PERMITIDO',
                        'campos': sobra,
                        'ayuda': 'el estado se reemplaza con PUT; la obra y el autor no se cambian'}), 400
    presentes = [c for c in CAMPOS_DE_METADATOS if c in data]
    if not presentes:
        return jsonify({'error': 'Nada que cambiar.', 'code': 'SIN_CAMBIOS',
                        'campos_admitidos': list(CAMPOS_DE_METADATOS)}), 400

    ok, problemas = vistas_v2.validar_metadatos(
        data.get('name'), data.get('description'), data.get('thumbnail'),
        obligatorio_nombre=False)
    if not ok:
        return _no_persistible(problemas, 'Los metadatos no son validos.')

    alcance = _alcance_y_autor(view_id)
    if not alcance:
        return jsonify({'error': 'View not found'}), 404
    negativa = guardia_de_obra(alcance[0], 'renombrar esta vista')
    if negativa:
        return negativa

    columna = {'name': 'name', 'description': 'description', 'thumbnail': 'thumbnail'}
    asignaciones = ', '.join('%s = %%s' % columna[c] for c in presentes)
    valores = [data[c].strip() if c == 'name' else data[c] for c in presentes]

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT created_by FROM saved_views WHERE id = %s FOR UPDATE", (view_id,))
            fila = cur.fetchone()
            if not fila:
                return jsonify({'error': 'View not found'}), 404
            negativa = permisos.guardia(
                _usuario(), fila[0], 'renombrar',
                permisos.es_admin_de_la_obra(_usuario(), alcance[0], cur))
            if negativa:
                return negativa
            cur.execute(
                "UPDATE saved_views SET %s, updated_at = NOW() WHERE id = %%s" % asignaciones,
                valores + [view_id])
            conn.commit()
    except Exception as e:
        print(f"[views] PATCH fallido: {e}")
        return jsonify({'error': 'No se pudieron cambiar los metadatos.'}), 500

    return jsonify(permisos.con_permisos(
        contrato.fila_de_detalle(leer_fila(view_id), _usuario()), _usuario(),
        permisos.es_admin_de_la_obra(_usuario(), alcance[0])))


@views_bp.route('/api/views/<view_id>/enlace', methods=['POST'])
def emitir_enlace(view_id):
    """Crea --o rota-- la capacidad publica de una vista.

    El enlace ya NO se puede construir en el navegador, y esa es toda la
    diferencia: antes `Copiar enlace` concatenaba `?shareView=` con el id que ya
    tenia en pantalla, asi que compartir no era un acto que el servidor viera
    pasar. Ahora hay que pedirlo, y para pedirlo hay que poder.

    QUIEN PUEDE
    -----------
    Las dos capas de siempre, y en el mismo orden: acceso a la obra primero,
    autoria despues. Emitir una capacidad publica es una decision sobre QUIEN VE
    esa vista, asi que pide lo mismo que modificarla: su autor, o administracion.
    Una vista historica --sin autor-- solo la comparte administracion.

    ROTAR
    -----
    Con `{"rotar": true}` se emite una capacidad nueva y LA ANTERIOR DEJA DE
    SERVIR en el mismo acto: el token es unico por fila. El `id` no se toca, asi
    que nada que apunte a la vista se entera. Es la revocacion, sin necesidad de
    una pantalla todavia.

    Sin `rotar`, si ya hay capacidad se DEVUELVE LA MISMA. Emitir una nueva cada
    vez que alguien abre el desplegable invalidaria en silencio el enlace que
    esa persona compartio ayer.
    """
    data = request.get_json(silent=True) or {}
    rotar = bool(data.get('rotar'))

    alcance = _alcance_y_autor(view_id)
    if not alcance:
        return jsonify({'error': 'View not found'}), 404
    negativa = guardia_de_obra(alcance[0], 'compartir esta vista')
    if negativa:
        return negativa

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT created_by, share_token FROM saved_views "
                        " WHERE id = %s FOR UPDATE", (view_id,))
            fila = cur.fetchone()
            if not fila:
                return jsonify({'error': 'View not found'}), 404
            negativa = permisos.guardia(
                _usuario(), fila[0], 'compartir',
                permisos.es_admin_de_la_obra(_usuario(), alcance[0], cur))
            if negativa:
                return negativa

            token = fila[1]
            if token is None or rotar:
                # El token lo genera POSTGRES, no el cliente ni el proceso: es
                # la misma fuente que ya usa `document_shares`.
                cur.execute("UPDATE saved_views SET share_token = gen_random_uuid() "
                            " WHERE id = %s RETURNING share_token", (view_id,))
                token = cur.fetchone()[0]
            conn.commit()
    except Exception as e:
        print(f"[views] no se pudo emitir el enlace: {e}")
        return jsonify({'error': 'No se pudo crear el enlace.'}), 500

    return jsonify({'shareToken': str(token), 'rotado': bool(rotar)})


@views_bp.route('/api/views/<view_id>', methods=['DELETE'])
def delete_view(view_id):
    """Borrar una vista. Hasta esta etapa NO PREGUNTABA NADA.

    Bastaba una sesion --cualquiera-- para borrar la vista de cualquier persona
    en cualquier obra, y ademas respondia `{'success': true}` cuando la vista no
    existia, de modo que el panel la quitaba de la lista igual. No era un
    descuido evitable: la tabla no tenia autor a quien preguntar hasta E-0.

    Ahora: 404 si no esta, 403 si no es tuya, y el borrado va en la misma
    transaccion que la comprobacion.
    """
    alcance = _alcance_y_autor(view_id)
    if not alcance:
        return jsonify({'error': 'View not found'}), 404
    negativa = guardia_de_obra(alcance[0], 'borrar esta vista')
    if negativa:
        return negativa

    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("SELECT created_by FROM saved_views WHERE id = %s FOR UPDATE", (view_id,))
            fila = cur.fetchone()
            if not fila:
                return jsonify({'error': 'View not found'}), 404
            negativa = permisos.guardia(
                _usuario(), fila[0], 'borrar',
                permisos.es_admin_de_la_obra(_usuario(), alcance[0], cur))
            if negativa:
                return negativa
            cur.execute("DELETE FROM saved_views WHERE id = %s", (view_id,))
            conn.commit()
    except Exception as e:
        print(f"[views] DELETE fallido: {e}")
        return jsonify({'error': 'No se pudo borrar la vista.'}), 500
    return jsonify({'success': True})
