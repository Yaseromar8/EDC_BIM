"""Flujos de revisión y aprobación de documentos (ISO 19650 / estilo ACC Reviews).

Una revisión congela una lista de documentos (con su versión) y una secuencia
de revisores. Cada paso aprueba o rechaza con comentario (trazable en history).
Al aprobar el último paso, los documentos transicionan al estado ISO final.
"""
from esquema_congelado import solo_con_ddl
import json
import logging
import traceback
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, g
from db import (get_db_connection, log_activity, registrar_actividad,
                resolve_project_id)
import estados_ecd as ecd
from perimetro_de_obra import guardia_de_obra
import plantillas_de_revision as plt

reviews_bp = Blueprint('reviews', __name__)

FINAL_STATUSES = (ecd.SHARED, ecd.PUBLISHED)


def _empieza_el_turno(cur, rid, steps, indice, actor, titulo, history):
    """Arranca el turno de un paso: fija su plazo, lo anota y abre el encargo.

    Devuelve (vence_en, history). El plazo se calcula AQUI, al empezar el turno,
    y se guarda en el Review -- no en el encargo. El encargo lo copia. Si el
    encargo se pierde, la conciliacion lo reconstruye CON su plazo, porque el
    Review lo sabe.

    Si el revisor no se puede determinar o no es miembro de la obra, NO se abre
    encargo: un encargo no da acceso, y no se inventa uno para quien no esta
    dentro. La revision no avanza sola por eso -- queda BLOQUEADA, y
    `flujo_de_revision.estado_del_flujo` lo dice al mirarla.
    """
    import flujo_de_revision as flujo
    if indice >= len(steps or []):
        return None, history
    paso = steps[indice] or {}
    vence = flujo.vencimiento(paso)

    # El historial registra el COMIENZO del turno, no solo su resolucion. Sin
    # esto, «cuanto tardo cada revisor» y «con que plazo se le pidio» habia que
    # inferirlos de la fila anterior.
    history = list(history or []) + [{
        'event': 'step_started',
        'step': indice,
        'to': flujo.etiqueta_del_paso(paso),
        'to_user_id': paso.get('user_id'),
        'due': vence.isoformat() if vence else None,
        'at': datetime.now(timezone.utc).isoformat(),
    }]

    try:
        import encargos as _enc
        uid, motivo = flujo.revisor_del_paso(cur, paso)
        if not uid:
            logging.getLogger('reviews').warning(
                'revision %s paso %s sin encargo: %s', rid, indice, motivo)
            return vence, history
        eid = _enc.abrir(cur, 'REVIEW', rid,
                         'Revisar: %s (paso %d)' % (titulo, indice + 1),
                         destino_usuario=uid, vence_en=vence, creado_por=actor)
        if eid:
            _enc.avisar(cur, eid)
    except Exception as e:
        # La revision avanza igual: el encargo es su reflejo, no su motor.
        logging.getLogger('reviews').warning('encargo no abierto: %s', e)
    return vence, history


def _pasos_validos(cur, obra, steps, contrato):
    """None si los pasos son utilizables; (respuesta, codigo) si no.

    EL CONTRATO SE EXIGE AQUI, PARA LOS DOS CAMINOS DE ALTA (REVIEWS-R01)
    --------------------------------------------------------------------
    Esta funcion la atraviesan las revisiones escritas a mano Y las expandidas
    de una plantilla: por eso la comprobacion del contrato vive aqui y no en
    cada camino. Si estuviera duplicada, el dia que una de las dos copias se
    quedara vieja habria un bypass -- y un bypass aqui significa una revision
    AUTORIDAD_TERMINAL cuyos pasos no dicen quien tiene la autoridad final.

    Bajo `AUTORIDAD_TERMINAL` se exigen dos cosas y las dos son fallo cerrado:
    que TODOS los pasos declaren REVISA o APRUEBA, y que el flujo pueda
    cerrarse -- es decir, que el ultimo posicional sea APRUEBA. Lo segundo se
    pregunta con la misma funcion que usa el motor al aprobar.

    Bajo PRE no se exige ninguna de las dos: los pasos sin `decision` son
    exactamente lo que el camino manual ha producido siempre.

    UNA REVISION NUEVA EXIGE REVISOR ESTRUCTURADO. Hasta ahora un paso era
    `{email, name}` y quien podia actuar se decidia comparando correo O NOMBRE:
    con dos personas llamadas igual -- que en una obra con varias empresas no es
    raro -- las dos eran candidatas a firmar el mismo paso.

    Se exige aqui, al crear, y no al aprobar: descubrir que el paso 3 apunta a
    nadie cuando ya han firmado dos revisores es tarde.

    Los pasos HISTORICOS no se tocan ni se convierten: siguen resolviendose por
    correo y por nombre. Esta comprobacion solo mira lo que entra de nuevo.
    """
    for i, paso in enumerate(steps):
        if not isinstance(paso, dict) or not paso.get('user_id'):
            return jsonify({
                "success": False,
                "error": "El paso %d no dice a que USUARIO le toca. Elige al "
                         "revisor de la lista de miembros de la obra." % (i + 1),
                "code": "PASO_SIN_REVISOR",
            }), 400
        try:
            uid = int(paso['user_id'])
        except (TypeError, ValueError):
            return jsonify({"success": False,
                            "error": "El revisor del paso %d no es valido." % (i + 1)}), 400
        cur.execute('SELECT 1 FROM users WHERE id = %s AND is_active', (uid,))
        if not cur.fetchone():
            return jsonify({"success": False,
                            "error": "El revisor del paso %d no existe o esta "
                                     "desactivado." % (i + 1)}), 400
        # Y tiene que estar EN LA OBRA. Si no, el encargo no se podria abrir
        # --un encargo no da acceso-- y la revision naceria bloqueada.
        cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s',
                    (str(obra), uid))
        if not cur.fetchone():
            cur.execute('SELECT name, email FROM users WHERE id = %s', (uid,))
            quien = cur.fetchone() or ('', '')
            return jsonify({
                "success": False,
                "error": "%s no pertenece a esta obra, así que no puede revisar "
                         "el paso %d. Añádelo a la obra primero." % (
                             quien[0] or quien[1] or ('usuario %s' % uid), i + 1),
                "code": "REVISOR_FUERA_DE_LA_OBRA",
            }), 400
        # `dias` es opcional; si viene, tiene que ser un numero positivo.
        if paso.get('dias') not in (None, ''):
            try:
                if int(paso['dias']) <= 0:
                    raise ValueError
            except (TypeError, ValueError):
                return jsonify({"success": False,
                                "error": "El plazo del paso %d tiene que ser un "
                                         "numero de dias mayor que cero." % (i + 1)}), 400

    # ── EL CONTRATO DEL FLUJO ──────────────────────────────────────────────
    #
    # `contrato` es OBLIGATORIO, sin valor por defecto. Un default aqui seria
    # una via para que un llamador futuro validara los pasos de un alta contra
    # un contrato que no es el que se va a persistir.
    import flujo_de_revision as flujo
    if not flujo.contrato_conocido(contrato):
        return jsonify({
            "success": False,
            "error": "No se puede crear una revisión sin saber con qué reglas "
                     "se va a cerrar.",
            "code": "CONTRATO_DESCONOCIDO",
        }), 500
    if contrato == flujo.AUTORIDAD_TERMINAL:
        faltan = flujo.pasos_sin_decision(steps)
        if faltan:
            return jsonify({
                "success": False,
                "error": ("El paso %s no dice qué se le pide: revisar o aprobar. "
                          "Sin eso no se puede saber quién tiene la autoridad "
                          "final." % ', '.join(str(n) for n in faltan)),
                "code": "PASO_SIN_DECISION",
            }), 400
        if not flujo.cierra_positivamente(contrato, steps, len(steps) - 1):
            return jsonify({
                "success": False,
                "error": ("El último paso de este flujo sólo revisa, así que la "
                          "revisión no podría cerrarse nunca. El último paso "
                          "tiene que ser de aprobación."),
                "code": "FLUJO_SIN_CIERRE",
            }), 400
    return None


@solo_con_ddl
def ensure_reviews_table():
    with get_db_connection() as conn:
        cur = conn.cursor()
        cur.execute('''
            CREATE TABLE IF NOT EXISTS doc_reviews (
                id SERIAL PRIMARY KEY,
                model_urn TEXT NOT NULL,
                title TEXT NOT NULL,
                items JSONB NOT NULL,
                steps JSONB NOT NULL,
                current_step INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                final_status TEXT DEFAULT 'SHARED',
                history JSONB DEFAULT '[]'::jsonb,
                created_by TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )''')
        cur.execute('CREATE INDEX IF NOT EXISTS idx_doc_reviews_urn ON doc_reviews(model_urn)')
        # Con que autorizacion queda emitido lo que se apruebe, y cuando se cerro
        # la revision. Ante "cuando se aprobo este plano" no habia respuesta: el
        # historial guardaba quien y en que paso, pero ninguna fecha.
        cur.execute('ALTER TABLE doc_reviews ADD COLUMN IF NOT EXISTS codigo_idoneidad VARCHAR(10)')
        cur.execute('ALTER TABLE doc_reviews ADD COLUMN IF NOT EXISTS cerrada_en TIMESTAMP WITH TIME ZONE')
        # CUANDO VENCE EL TURNO ACTUAL, Y POR QUE VIVE AQUI.
        #
        # El plazo estaba solo en `encargos`, y solo para el primer paso. Eso es
        # al reves de la regla: el Review es la fuente de verdad de su proceso.
        # Si el encargo se perdia y la conciliacion lo reconstruia, el plazo
        # desaparecia -- porque el Review no sabia cual era.
        #
        # Se guarda el vencimiento del paso EN CURSO. El de cada paso se calcula
        # al empezar su turno desde `steps[i].dias`, porque al crear la revision
        # no se sabe cuando le tocara al paso 3.
        cur.execute('ALTER TABLE doc_reviews ADD COLUMN IF NOT EXISTS paso_vence_en TIMESTAMP')
        conn.commit()


def _user():
    return getattr(g, 'current_user', None) or {}


def _puede_con_estos_documentos(user, model_urn, items, nivel, accion):
    """Comprueba obra y permiso de carpeta sobre CADA documento de la revision.

    Devuelve None si puede, o la respuesta de error. Aqui no habia ninguna
    comprobacion: ni de obra ni de carpeta. Una revision es el camino por el que
    un documento acaba publicado, asi que sin esto era la puerta de atras.
    """
    from routes.documents import verify_project_access
    from folder_permissions import check_folder_permission

    if not user:
        return jsonify({"success": False, "error": "Autenticación requerida"}), 401
    if not verify_project_access(user, model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403
    for it in (items or []):
        node_id = it.get('node_id') if isinstance(it, dict) else it
        if not node_id:
            continue
        negado = check_folder_permission(user, node_id, model_urn, nivel, accion)
        if negado:
            return negado
    return None


def _uuid(valor):
    """El identificador en su forma canonica, o None si no es un UUID.

    Se valida ANTES de preguntar a la base: un texto cualquiera en `version_id`
    no puede llegar a un `::uuid` y convertirse en un 500.
    """
    try:
        return str(uuid.UUID(str(valor).strip()))
    except (TypeError, ValueError, AttributeError):
        return None


def _posiciones(numeros):
    return ', '.join(str(n) for n in numeros)


def _versiones_fijadas(cur, model_urn, items, para_alta):
    """(sin_version, no_validas): posiciones, desde 1, de los documentos cuya
    version fijada no se sostiene.

    QUE SE FIJA, Y POR QUE AQUI
    ---------------------------
    Una revision somete a juicio UNA VERSION CONCRETA de cada documento, y la
    guarda del cierre compara esa version con la vigente para no sellar lo que
    nadie miro. Esa guarda solo protege si la version esta de verdad fijada: con
    `version_id` ausente se saltaba en silencio, y con la version de OTRO
    documento la revision nombraba uno y la previsualizacion ensenaba otro.

      sin_version  el item no dice que version se somete (falta, null o vacio)
      no_validas   el item no es un documento, la version no existe, no es de ESE
                   documento, o ese documento no es de ESTA obra

    Las causas de `no_validas` se devuelven JUNTAS a proposito: distinguirlas le
    diria a quien pregunta si un identificador ajeno existe.

    `para_alta` exige ademas que el documento siga vivo en el arbol: no se abre
    una revision sobre algo que esta en la papelera. Para revisiones ya guardadas
    no se exige, para no cambiar lo que ya pasaba con un documento borrado.
    """
    sin_version, no_validas = [], []
    for n, it in enumerate(items or [], start=1):
        if not isinstance(it, dict) or not it.get('node_id'):
            no_validas.append(n)
            continue
        if it.get('version_id') in (None, ''):
            sin_version.append(n)
            continue
        nodo, version = _uuid(it.get('node_id')), _uuid(it.get('version_id'))
        if not nodo or not version:
            no_validas.append(n)
            continue
        cur.execute(
            "SELECT 1 FROM file_versions v JOIN file_nodes n ON n.id = v.file_node_id "
            " WHERE v.id = %s::uuid AND n.id = %s::uuid AND n.model_urn = %s"
            + (" AND n.node_type = 'FILE' AND COALESCE(n.is_deleted, FALSE) = FALSE"
               if para_alta else ""),
            (version, nodo, model_urn))
        if not cur.fetchone():
            no_validas.append(n)
    return sin_version, no_validas


def _documentos_con_version_fijada(cur, model_urn, items):
    """None si cada documento del alta fija una version SUYA; (respuesta, codigo) si no.

    NO se rellena una version ausente con la vigente. Elegirla aqui seria decidir
    DESPUES que se sometio a revision, que es justo lo que no puede pasar: quien
    manda a revisar dice que version manda, y si no lo dice, no se abre.

    Los mensajes nombran POSICIONES, nunca documentos: si un item apunta a una
    version ajena, el nombre de ese documento no tiene por que salir de aqui.
    """
    sin_version, no_validas = _versiones_fijadas(cur, model_urn, items, para_alta=True)
    if sin_version:
        return jsonify({
            "success": False,
            "error": ("El documento %s de la revisión no dice qué versión se somete a "
                      "revisión. Vuelve a seleccionarlo en Archivos."
                      % _posiciones(sin_version)),
            "code": "VERSION_NO_DECLARADA",
        }), 400
    if no_validas:
        return jsonify({
            "success": False,
            "error": ("La versión indicada para el documento %s no es una versión de ese "
                      "documento en esta obra." % _posiciones(no_validas)),
            "code": "VERSION_NO_VALIDA",
        }), 400
    return None


def _asociacion_invalida(posiciones):
    """La negativa para una AUTORIDAD_TERMINAL cuya version fijada no se sostiene."""
    return jsonify({
        "success": False,
        "error": ("Esta revisión no puede aprobarse: el documento %s no tiene fijada una "
                  "versión válida de ese documento. Se puede rechazar; no se puede "
                  "avanzar ni emitir." % _posiciones(posiciones)),
        "code": "ASOCIACION_DOCUMENTAL_INVALIDA",
    }), 409


def _puede_ver_la_revision(cur, usuario, model_urn, items, contexto, vistos):
    """¿Puede este usuario abrir TODOS los documentos de esta revision?

    UNA REVISION DICE QUE PLANOS HAY Y QUIEN LOS APRUEBA
    ----------------------------------------------------
    El listado solo comprobaba la obra, asi que un miembro sin permiso sobre una
    carpeta reservada recibia el nombre de sus documentos, sus identificadores,
    quien los revisa y los comentarios de cada paso: lo mismo que el indice del
    expediente y el listado de carpetas ya le negaban.

    La regla es la documental de siempre (`permiso_documental`), preguntada por
    cada documento y por el dueno de cada version fijada, porque la version
    tambien nombra un documento. Si falla UNO, la revision no se devuelve:
    ocultar solo `items` dejaria el titulo, el historial y los comentarios.

    Sin excepcion por estar asignado: asignar no concede permiso documental. El
    administrador de la obra pasa porque la politica documental ya le reconoce
    atravesar los permisos de carpeta de ESA obra, no por una regla de aqui.
    """
    import flujo_de_revision as flujo
    # La regla vive en el dominio del flujo: la misma que decide `/act`, las
    # asignaciones, el bloqueo y lo que cuentan la bandeja y el correo.
    return flujo.puede_consultar_la_revision(cur, usuario, model_urn, items,
                                             contexto, vistos)


def _participantes_con_acceso(cur, model_urn, steps, items):
    """None si cada persona del flujo puede consultar TODOS los documentos; si no,
    la negativa.

    QUIEN FIRMA TIENE QUE PODER VER LO QUE FIRMA
    --------------------------------------------
    `/act` ya lo exige al actuar; comprobarlo tambien al asignar evita que una
    revision nazca con un paso que nadie podra ejercer. NO sustituye a la puerta
    de `/act`: el acceso puede retirarse despues.

    Se pregunta por las personas FINALMENTE resueltas --escritas a mano o
    expandidas de una plantilla--, con la misma regla que el listado. No se
    concede ni se sustituye a nadie: se dice que paso no se sostiene y lo decide
    quien crea. El mensaje nombra pasos, no documentos ni permisos.
    """
    import flujo_de_revision as flujo
    sin_acceso, por_persona = [], {}
    for n, paso in enumerate(steps or [], start=1):
        uid, _motivo = flujo.revisor_del_paso(cur, paso)
        if uid not in por_persona:
            por_persona[uid] = bool(uid) and flujo.puede_consultar_la_revision(
                cur, flujo.persona(cur, uid), model_urn, items)
        if not por_persona[uid]:
            sin_acceso.append(n)
    if sin_acceso:
        return jsonify({
            "success": False,
            "error": ("La persona del paso %s no puede consultar todos los documentos de "
                      "esta revisión. Pide que le den acceso o elige a otra persona."
                      % _posiciones(sin_acceso)),
            "code": "REVISOR_SIN_ACCESO_DOCUMENTAL",
        }), 400
    return None


def _con_asociacion_documental(cur, rev):
    """Marca EN LA RESPUESTA los documentos de una AUTORIDAD_TERMINAL cuya version
    fijada no se sostiene. La revision guardada no se toca.

    Sin la marca, la pantalla ofrecia abrirlos y la previsualizacion, que resuelve
    por la version, ensenaba al dueno de ESA version con el nombre del otro. PRE
    no se marca: sus items historicos no fijaban version y su semantica se
    conserva tal cual.
    """
    import flujo_de_revision as flujo
    if rev.get('contrato') != flujo.AUTORIDAD_TERMINAL:
        return rev
    sin_version, no_validas = _versiones_fijadas(cur, rev['model_urn'], rev['items'],
                                                 para_alta=False)
    malas = set(sin_version) | set(no_validas)
    if malas:
        rev['items'] = [dict(it, asociacion_valida=False)
                        if isinstance(it, dict) and n in malas else it
                        for n, it in enumerate(rev['items'] or [], start=1)]
    return rev


# LAS COLUMNAS QUE LEEN EL LISTADO Y EL DETALLE, en el orden que espera
# `_row_to_dict`. Una sola definicion para las dos lecturas: si manana se anade
# una columna, no puede quedar una de las dos pantallas leyendo otra forma.
# `/act` y la sustitucion conservan la suya, con FOR UPDATE.
#
# LAS FECHAS SALEN CON SU ZONA (E1.2 · H9). `created_at` y `paso_vence_en` son
# TIMESTAMP sin zona: guardan la hora en la zona de la base (UTC en produccion), y
# la pantalla leia '2026-09-14T00:15:08' como hora de Lima -- cinco horas de mas,
# mientras `cerrada_en` y el historial, que si llevan zona, se veian bien. Se leen
# con la zona de la sesion, que es la misma con la que se escribieron, y salen como
# un instante. No se migra ningun dato.
_COLUMNAS_DE_REVISION = """id, model_urn, title, items, steps, current_step, status,
                                  final_status, history, created_by,
                                  created_at AT TIME ZONE current_setting('TimeZone'),
                                  codigo_idoneidad, cerrada_en,
                                  paso_vence_en AT TIME ZONE current_setting('TimeZone'),
                                  plantilla_id, plantilla_nombre, plantilla_version,
                                  contrato"""


def _row_to_dict(r):
    return {
        "id": r[0], "model_urn": r[1], "title": r[2], "items": r[3],
        "steps": r[4], "current_step": r[5], "status": r[6],
        "final_status": r[7], "history": r[8] or [],
        "created_by": r[9], "created_at": r[10].isoformat() if r[10] else None,
        "codigo_idoneidad": r[11] if len(r) > 11 else None,
        "cerrada_en": r[12].isoformat() if len(r) > 12 and r[12] else None,
        "paso_vence_en": r[13].isoformat() if len(r) > 13 and r[13] else None,
        # DE DONDE SALIO ESTE FLUJO. Se guardaba y no se devolvia, asi que la
        # revision sabia su procedencia y ninguna pantalla podia ensenarla --
        # que es la misma clase de capacidad muerta que «existe en el backend».
        # Lo encontro la EXP: el snapshot era correcto y la procedencia salia
        # vacia. Es traza, nunca autoridad: nadie la consulta para decidir.
        "plantilla_id": str(r[14]) if len(r) > 14 and r[14] else None,
        "plantilla_nombre": r[15] if len(r) > 15 else None,
        "plantilla_version": r[16] if len(r) > 16 else None,
        # CON QUE REGLAS NACIO ESTA REVISION (REVIEWS-R01). Va al final a
        # proposito: `_row_to_dict` indexa por posicion, asi que anadir al final
        # no desplaza nada. Y se devuelve SIN valor por defecto: si llegara
        # vacio, `/act` tiene que fallar cerrado, no suponer PRE.
        "contrato": r[17] if len(r) > 17 else None,
    }


def _con_estado_del_flujo(cur, rev):
    """Anade si la revision esta ACTIVA, BLOQUEADA o CERRADA.

    Se CALCULA al mirarla; no se guarda. Un estado guardado habria que
    mantenerlo al dia, y un estado que puede quedarse viejo es peor que no
    tenerlo. Tampoco es un estado nuevo del ciclo de vida del Review: `status`
    sigue siendo pending/approved/rejected.
    """
    try:
        import flujo_de_revision as flujo
        estado, motivo = flujo.estado_del_flujo(cur, rev)
        rev['flujo'] = estado
        rev['flujo_motivo'] = motivo
    except Exception:
        rev['flujo'] = None
        rev['flujo_motivo'] = ''
    return rev


# ── LECTURA: LISTADO FILTRADO Y DETALLE (REVIEWS · E1) ───────────────────────
#
# Solo leen. Lo que ensenan sobre QUIEN puede actuar y COMO se llama lo que
# puede hacer sale de las MISMAS funciones que usa `/act`, para que la pantalla
# no ofrezca un boton que el servidor va a negar ni esconda uno que acepta.
# `/act` lo vuelve a comprobar todo: esto es presentacion, no autoridad.

FILTROS_DEL_LISTADO = ('todas', 'me_toca', 'en_curso', 'bloqueadas', 'terminadas',
                       'iniciadas_por_mi')
_LIMITE_POR_DEFECTO = 20
_LIMITE_MAXIMO = 100
_LOTE_DE_LECTURA = 100
# Tope de filas EXAMINADAS por peticion. El permiso documental se pregunta fila
# a fila y ANTES de cortar la pagina; sin tope, alguien que no ve casi nada haria
# recorrer la obra entera en cada peticion. Al alcanzarlo se devuelve `siguiente`
# para continuar desde ahi.
_TOPE_DE_FILAS_EXAMINADAS = 1000


def _codigo_de_revision(rid):
    return 'RV-%03d' % int(rid)


def _me_toca(usuario, rev):
    """¿Tiene que actuar esta persona AHORA? La misma identidad que decide `/act`."""
    import flujo_de_revision as flujo
    if rev.get('status') != 'pending' or rev.get('flujo') != 'ACTIVA':
        return False
    return flujo.puede_actuar(usuario, flujo.paso_en(rev.get('steps'), rev.get('current_step')))


def _con_versiones_vigentes(cur, rev):
    """Anade a cada documento su version VIGENTE, para poder decir «hay una nueva».

    La revision no se toca: juzga la version fijada. Y la comparacion es la de la
    guarda del cierre -- `file_nodes.current_version_id` distinta de la fijada --,
    asi que lo que aqui se ve como «version nueva» es exactamente lo que va a
    impedir cerrar. Los documentos cuya asociacion no se sostiene no se miran.
    """
    nodos = sorted({_uuid(it.get('node_id')) for it in (rev.get('items') or [])
                    if isinstance(it, dict) and it.get('asociacion_valida') is not False
                    and _uuid(it.get('node_id'))})
    if not nodos:
        return rev
    # `status` es el estado de HOY de cada documento: con el, el cierre avisa si ya
    # esta en su destino o si volveria atras (E1.2 · H7-A).
    cur.execute("SELECT id::text, current_version_id::text, version_number, status "
                "  FROM file_nodes WHERE id = ANY(%s::uuid[]) AND model_urn = %s",
                (nodos, rev['model_urn']))
    vigentes = {f[0]: (f[1], f[2], f[3]) for f in cur.fetchall()}
    items = []
    for it in rev.get('items') or []:
        if isinstance(it, dict) and it.get('asociacion_valida') is not False:
            vigente = vigentes.get(_uuid(it.get('node_id')) or '')
            if vigente:
                fijada = _uuid(it.get('version_id'))
                it = dict(it, version_vigente_numero=vigente[1],
                          es_version_vigente=(None if not fijada else
                                              not (vigente[0] and vigente[0] != fijada)),
                          estado_documento=ecd.normalizar(vigente[2]))
        items.append(it)
    rev['items'] = items
    return rev


# Cuantas otras revisiones se nombran como mucho en un aviso. Es un aviso, no una
# regla: si hubiera mas en curso sobre el mismo documento, nombra las mas recientes.
_TOPE_DE_OTRAS_EN_CURSO = 50
# Cuantos documentos puede preguntar el alta de una vez.
_TOPE_DE_DOCUMENTOS_DEL_ALTA = 500


def _otras_en_curso(cur, usuario, model_urn, nodos, excluir=None, contexto=None, vistos=None):
    """Las OTRAS revisiones en curso de esta obra que llevan alguno de estos
    documentos y que esta persona puede ver: `{node_id: [{id, codigo, title}]}`.

    DOS REVISIONES SOBRE EL MISMO DOCUMENTO (E1.2 · H7-A)
    -----------------------------------------------------
    El servidor lo permite, y un documento tiene un solo estado: lo que emite una
    revision cambia lo que la otra sigue revisando, y parecen cruzadas. No se
    prohibe -- eso seria una regla nueva, y la decide el propietario --: se AVISA,
    en el alta y en el detalle.

    Solo se nombran revisiones que esta persona ya puede abrir, con la misma regla
    documental que el listado. Una que no puede ver no se menciona, ni siquiera con
    un aviso neutro. Solo lee.
    """
    nodos = sorted({n for n in (_uuid(x) for x in (nodos or [])) if n})
    if not nodos:
        return {}
    cur.execute("SELECT id, title, items FROM doc_reviews "
                " WHERE model_urn = %s AND COALESCE(status, 'pending') = 'pending' "
                "   AND id <> %s AND jsonb_typeof(items) = 'array' "
                "   AND EXISTS (SELECT 1 FROM jsonb_array_elements(items) AS it "
                "                WHERE it->>'node_id' = ANY(%s)) "
                " ORDER BY id DESC LIMIT %s",
                (model_urn, int(excluir or 0), nodos, _TOPE_DE_OTRAS_EN_CURSO))
    filas = cur.fetchall()
    if not filas:
        return {}
    if contexto is None:
        import permiso_documental as pd
        contexto = pd.contexto_de_permisos(cur, usuario, model_urn)
    vistos = {} if vistos is None else vistos
    salida = {}
    for rid, titulo, items in filas:
        propios = {_uuid(it.get('node_id')) for it in (items or []) if isinstance(it, dict)}
        comunes = sorted(propios.intersection(nodos))
        if not comunes or not _puede_ver_la_revision(cur, usuario, model_urn, items or [],
                                                     contexto, vistos):
            continue
        for n in comunes:
            salida.setdefault(n, []).append({'id': rid, 'codigo': _codigo_de_revision(rid),
                                             'title': titulo})
    return salida


def _pasos_para_mostrar(rev):
    """Los pasos como se ensenan: papel, estado, acto registrado y sustituciones.

    Se DERIVAN de `steps`, `current_step`, `status` e `history`; no se guarda nada
    nuevo. El papel es el que declara el paso (`decision`): una PRE historica
    puede no tenerlo, y entonces no se inventa.
    """
    import flujo_de_revision as flujo
    pasos = rev.get('steps') or []
    actual = rev.get('current_step') or 0
    estado_de_la_revision = rev.get('status')
    historia = [h for h in (rev.get('history') or []) if isinstance(h, dict)]
    salida = []
    for i, paso in enumerate(pasos):
        paso = paso if isinstance(paso, dict) else {}
        if estado_de_la_revision == 'approved':
            estado = 'hecho'
        elif estado_de_la_revision == 'rejected':
            estado = ('hecho' if i < actual else 'rechazado' if i == actual
                      else 'no_alcanzado')
        else:
            estado = 'hecho' if i < actual else 'actual' if i == actual else 'pendiente'
        actos = [h for h in historia if h.get('event') in ('approve', 'reject')
                 and h.get('step') == i]
        inicios = [h for h in historia if h.get('event') == 'step_started'
                   and h.get('step') == i]
        salida.append({
            'numero': i + 1,
            'etiqueta': paso.get('etiqueta'),
            'persona': flujo.etiqueta_del_paso(paso),
            'user_id': paso.get('user_id'),
            'decision': flujo.decision_del_paso(paso),
            'terminal': flujo.es_paso_terminal(pasos, i),
            'dias': paso.get('dias'),
            'estado': estado,
            'acto': ({k: actos[-1].get(k) for k in ('event', 'by', 'at', 'comment', 'emitido')}
                     if actos else None),
            'inicio': inicios[-1].get('at') if inicios else None,
            'vence': (rev.get('paso_vence_en') if estado == 'actual'
                      else (inicios[-1].get('due') if inicios else None)),
            'sustituciones': [{k: h.get(k) for k in ('from', 'to', 'by', 'reason', 'at')}
                              for h in historia
                              if h.get('event') == 'step_reassigned' and h.get('step') == i],
        })
    return salida


def _acciones_para(cur, usuario, rev):
    """Que puede hacer ESTA persona ahora mismo con esta revision.

    Las mismas preguntas, en el mismo orden, que `/act`: si el paso le toca, si
    puede consultar todos los documentos, que permite el contrato PERSISTIDO y,
    para aprobar, la asociacion de versiones y la guarda de version nueva del
    cierre. No cambia ninguna regla ni decide nada: `/act` lo vuelve a comprobar.

    Espera la revision marcada por `_con_asociacion_documental`,
    `_con_versiones_vigentes` y `_con_estado_del_flujo`.
    """
    import flujo_de_revision as flujo
    acciones = {
        'aprobar': {'disponible': False, 'tipo': None, 'motivo_no': '',
                    'siguiente_paso': None, 'destino': None},
        'rechazar': {'disponible': False, 'motivo_no': ''},
        'sustituir': False,
        'motivo': '',
    }
    if rev.get('status') != 'pending':
        acciones['motivo'] = 'La revisión ya terminó.'
        return acciones
    if rev.get('flujo') == 'BLOQUEADA':
        acciones['motivo'] = 'La revisión no puede avanzar: %s.' % (
            rev.get('flujo_motivo') or 'está bloqueada')
        # La unica salida, con la puerta de `/reasignar`: rol GLOBAL de administrador.
        acciones['sustituir'] = (usuario or {}).get('role') == 'admin'
        return acciones

    pasos = rev.get('steps') or []
    indice = rev.get('current_step') or 0
    paso = flujo.paso_en(pasos, indice)
    if not flujo.puede_actuar(usuario, paso):
        acciones['motivo'] = 'Este paso le corresponde a %s.' % flujo.etiqueta_del_paso(paso)
        return acciones
    if not flujo.puede_consultar_la_revision(cur, usuario, rev['model_urn'], rev['items']):
        acciones['motivo'] = ('No puedes actuar en esta revisión: no tienes acceso a todos '
                              'sus documentos.')
        return acciones
    contrato = rev.get('contrato')
    if not flujo.contrato_conocido(contrato):
        acciones['motivo'] = ('Esta revisión declara un contrato que este motor no entiende, '
                              'así que no se toca.')
        return acciones

    puede_rechazar, motivo_rechazo = flujo.acto_permitido(contrato, pasos, indice, 'reject')
    acciones['rechazar'] = {'disponible': puede_rechazar,
                            'motivo_no': '' if puede_rechazar else motivo_rechazo}

    puede_aprobar, motivo_no = flujo.acto_permitido(contrato, pasos, indice, 'approve')
    cierra = puede_aprobar and flujo.cierra_positivamente(contrato, pasos, indice)
    if cierra:
        tipo = 'aprobar_y_cerrar'
    elif contrato == flujo.AUTORIDAD_TERMINAL and flujo.decision_del_paso(paso) == plt.REVISA:
        tipo = 'conformidad'
    else:
        tipo = 'aprobar'
    items = [it for it in (rev.get('items') or []) if isinstance(it, dict)]
    if (puede_aprobar and contrato == flujo.AUTORIDAD_TERMINAL
            and any(it.get('asociacion_valida') is False for it in items)):
        puede_aprobar = False
        motivo_no = ('Un documento no tiene fijada una versión válida: no se puede aprobar; '
                     'se puede rechazar.')
    if puede_aprobar and cierra:
        nuevas = [it for it in items
                  if it.get('version_id') and it.get('es_version_vigente') is False]
        if nuevas:
            puede_aprobar = False
            motivo_no = ('Hay una versión nueva de %s: aprobar cerraría la revisión sobre algo '
                         'que nadie revisó. Hay que volver a mandarlo a revisión.'
                         % ', '.join(it.get('name') or 'un documento' for it in nuevas[:5]))
    siguiente = None
    if not cierra and indice + 1 < len(pasos):
        siguiente = {'numero': indice + 2,
                     'persona': flujo.etiqueta_del_paso(flujo.paso_en(pasos, indice + 1))}
    # AL CERRAR, QUE PASA CON LOS DOCUMENTOS (E1.2 · H7-A). No cambia ninguna regla:
    # dice ANTES de confirmar si ya estaban en su destino -- porque otra revision los
    # emitio -- o si alguno volveria atras, por ejemplo de Publicado a Compartido.
    # `estado_documento` lo pone `_con_versiones_vigentes`.
    ya_en_destino, retroceden = [], []
    if cierra:
        destino = ecd.normalizar(rev.get('final_status'))
        for it in items:
            estado = it.get('estado_documento')
            if estado not in ecd.ESTADOS:
                continue
            if estado == destino:
                ya_en_destino.append(it.get('name') or 'un documento')
            elif ecd.ESTADOS.index(estado) > ecd.ESTADOS.index(destino):
                retroceden.append({'name': it.get('name') or 'un documento', 'estado': estado})
    acciones['aprobar'] = {'disponible': puede_aprobar, 'tipo': tipo,
                           'motivo_no': '' if puede_aprobar else motivo_no,
                           'siguiente_paso': siguiente,
                           'destino': rev.get('final_status') if cierra else None,
                           'ya_en_destino': ya_en_destino,
                           'todos_en_destino': bool(items) and len(ya_en_destino) == len(items),
                           'retroceden': retroceden}
    return acciones


@reviews_bp.route('/api/reviews', methods=['GET'])
def list_reviews():
    """Las revisiones de una obra que esta persona puede ver, filtradas y por paginas.

    FILTROS: todas · me_toca (en curso, activa y es quien actua) · en_curso ·
    bloqueadas · terminadas · iniciadas_por_mi (`created_by`, correo o nombre).

    PAGINAS POR CURSOR: `antes_de` es un id y el orden es descendente. El permiso
    documental y el filtro se aplican ANTES de cortar la pagina, asi que una
    pagina no sale corta por revisiones que no se pueden ver -- salvo al llegar
    al tope de filas examinadas, que devuelve `siguiente` para continuar.
    """
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({"success": False, "error": "Falta model_urn"}), 400
    # Las revisiones de una obra dicen que planos hay y quien los aprueba: se
    # leian cambiando el ?model_urn.
    from routes.documents import verify_project_access
    if not verify_project_access(_user(), model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403
    filtro = (request.args.get('filtro') or 'todas').strip().lower()
    if filtro not in FILTROS_DEL_LISTADO:
        return jsonify({"success": False, "error": "Ese filtro de revisiones no existe.",
                        "code": "FILTRO_DESCONOCIDO"}), 400
    try:
        limite = int(request.args.get('limite') or _LIMITE_POR_DEFECTO)
        antes_de = request.args.get('antes_de')
        antes_de = int(antes_de) if antes_de not in (None, '') else None
    except (TypeError, ValueError):
        limite, antes_de = 0, None
    if not 1 <= limite <= _LIMITE_MAXIMO or (antes_de is not None and antes_de < 1):
        return jsonify({"success": False, "error": "La paginación pedida no es válida.",
                        "code": "PAGINACION_NO_VALIDA"}), 400

    usuario = _user()
    condiciones, parametros = ['model_urn = %s'], [model_urn]
    if filtro in ('me_toca', 'en_curso', 'bloqueadas'):
        condiciones.append("COALESCE(status, 'pending') = 'pending'")
    elif filtro == 'terminadas':
        condiciones.append("COALESCE(status, 'pending') <> 'pending'")
    elif filtro == 'iniciadas_por_mi':
        quien = sorted({(x or '').strip().lower() for x in
                        (usuario.get('email'), usuario.get('name')) if (x or '').strip()})
        if not quien:
            return jsonify({"success": True, "reviews": [], "siguiente": None,
                            "filtro": filtro, "limite": limite})
        condiciones.append('LOWER(created_by) = ANY(%s)')
        parametros.append(quien)
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # QUIEN VE CADA REVISION: la regla documental, no solo la obra (ver
            # `_puede_ver_la_revision`). Los hechos del usuario se calculan UNA vez.
            import permiso_documental as pd
            contexto = pd.contexto_de_permisos(cur, usuario, model_urn)
            vistos, data, siguiente = {}, [], None
            cursor_id, examinadas, ultima = antes_de, 0, None
            while True:
                donde = condiciones + (['id < %s'] if cursor_id else [])
                cur.execute('SELECT ' + _COLUMNAS_DE_REVISION + ' FROM doc_reviews WHERE '
                            + ' AND '.join(donde) + ' ORDER BY id DESC LIMIT %s',
                            tuple(parametros + ([cursor_id] if cursor_id else [])
                                  + [_LOTE_DE_LECTURA]))
                filas = cur.fetchall()
                for r in filas:
                    examinadas += 1
                    ultima = r[0]
                    rev = _row_to_dict(r)
                    if not _puede_ver_la_revision(cur, usuario, model_urn, rev['items'],
                                                  contexto, vistos):
                        continue
                    rev = _con_estado_del_flujo(cur, _con_asociacion_documental(cur, rev))
                    rev['me_toca'] = _me_toca(usuario, rev)
                    if filtro == 'me_toca' and not rev['me_toca']:
                        continue
                    if filtro == 'bloqueadas' and rev.get('flujo') != 'BLOQUEADA':
                        continue
                    if len(data) >= limite:
                        # Hay al menos una mas que ensenar: la lista continua.
                        siguiente = data[-1]['id']
                        break
                    rev['codigo'] = _codigo_de_revision(rev['id'])
                    data.append(rev)
                if siguiente is not None or len(filas) < _LOTE_DE_LECTURA:
                    break
                cursor_id = ultima
                if examinadas >= _TOPE_DE_FILAS_EXAMINADAS:
                    siguiente = data[-1]['id'] if len(data) >= limite else ultima
                    break
        # `obra_id` es lo que lleva el enlace de cada revision (`?obra=`).
        return jsonify({"success": True, "reviews": data, "siguiente": siguiente,
                        "filtro": filtro, "limite": limite,
                        "obra_id": resolve_project_id(model_urn)})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@reviews_bp.route('/api/reviews/<int:rid>', methods=['GET'])
def get_review(rid):
    """El detalle de UNA revision: documentos y versiones, pasos, historial y lo
    que esta persona puede hacer ahora. Solo lectura.

    Se abre por su enlace (`/?obra=<id>&revision=<rid>`) o desde Mi Trabajo, con
    las mismas puertas que el listado: la obra de la FILA guardada y poder
    consultar TODOS sus documentos. Si no, 403 sin titulo ni nombres: el enlace
    solo confirma que la revision existe, que es lo que Mi Trabajo ya dice con su
    asunto neutro. `model_urn`, si llega, es el ambito de la pantalla que la pide:
    una revision de otra obra no se ensena dentro de esta.
    """
    usuario = _user()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute('SELECT ' + _COLUMNAS_DE_REVISION + ' FROM doc_reviews WHERE id = %s',
                        (rid,))
            fila = cur.fetchone()
            if not fila:
                return jsonify({"success": False, "error": "Esa revisión no existe.",
                                "code": "REVISION_NO_ENCONTRADA"}), 404
            rev = _row_to_dict(fila)
            # La obra sale de la revision guardada, no de lo que mande el cliente.
            from routes.documents import verify_project_access
            if not verify_project_access(usuario, rev['model_urn']):
                return jsonify({"success": False, "error": "No tienes acceso a esta obra.",
                                "code": "SIN_ACCESO_A_LA_OBRA"}), 403
            obra = resolve_project_id(rev['model_urn'])
            ambito = request.args.get('model_urn')
            destino = resolve_project_id(ambito) if ambito else None
            if destino and obra and destino != obra:
                return jsonify({"success": False, "error": "Esa revisión es de otra obra.",
                                "code": "REVISION_DE_OTRA_OBRA"}), 404
            import permiso_documental as pd
            contexto = pd.contexto_de_permisos(cur, usuario, rev['model_urn'])
            if not _puede_ver_la_revision(cur, usuario, rev['model_urn'], rev['items'],
                                          contexto, {}):
                return jsonify({
                    "success": False,
                    "error": ("No puedes ver esta revisión: no tienes acceso a todos sus "
                              "documentos. Pide acceso a quien administra la obra."),
                    "code": "SIN_PERMISO_DOCUMENTAL"}), 403
            rev = _con_versiones_vigentes(cur, _con_asociacion_documental(cur, rev))
            rev = _con_estado_del_flujo(cur, rev)
            # En que OTRA revision en curso, que esta persona pueda ver, esta cada
            # documento (E1.2 · H7-A). Una revision terminada ya no lo necesita.
            if (rev.get('status') or 'pending') == 'pending':
                otras = _otras_en_curso(cur, usuario, rev['model_urn'],
                                        [it.get('node_id') for it in rev['items'] or []
                                         if isinstance(it, dict)],
                                        excluir=rev['id'], contexto=contexto)
                rev['items'] = [dict(it, tambien_en=otras.get(_uuid(it.get('node_id')), []))
                                if isinstance(it, dict) else it for it in rev['items'] or []]
            rev['codigo'] = _codigo_de_revision(rev['id'])
            rev['obra_id'] = obra
            rev['me_toca'] = _me_toca(usuario, rev)
            rev['pasos'] = _pasos_para_mostrar(rev)
            rev['acciones'] = _acciones_para(cur, usuario, rev)
        return jsonify({"success": True, "revision": rev})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@reviews_bp.route('/api/reviews/en-curso', methods=['GET'])
def revisiones_en_curso_con():
    """En que OTRAS revisiones en curso estan ya estos documentos. Para el alta.

    `?model_urn=<obra>&node_id=<id>&node_id=<id>...` devuelve
    `{documentos: {node_id: [{id, codigo, title}]}}`, solo con revisiones que esta
    persona puede ver (E1.2 · H7-A). Es un AVISO antes de crear otra, no una
    prohibicion. Solo lee.
    """
    model_urn = request.args.get('model_urn')
    if not model_urn:
        return jsonify({"success": False, "error": "Falta model_urn"}), 400
    usuario = _user()
    from routes.documents import verify_project_access
    if not verify_project_access(usuario, model_urn):
        return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403
    pedidos = request.args.getlist('node_id')
    nodos = [_uuid(n) for n in pedidos]
    if not pedidos or len(pedidos) > _TOPE_DE_DOCUMENTOS_DEL_ALTA or not all(nodos):
        return jsonify({"success": False, "error": "Los documentos pedidos no son válidos.",
                        "code": "DOCUMENTOS_NO_VALIDOS"}), 400
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            documentos = _otras_en_curso(cur, usuario, model_urn, nodos)
        return jsonify({"success": True, "documentos": documentos})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


def _revision_independiente(user, steps):
    """None si la revision tiene al menos un ojo ajeno; (respuesta, codigo) si no.

    POR QUE ES UNA REGLA Y NO UNA RECOMENDACION
    -------------------------------------------
    Una revision cuyo unico revisor es quien la crea no revisa nada: es una
    firma delante del espejo. Y en este sistema no es un detalle de proceso,
    porque la revision es el camino a PUBLICADO -- el estado con el que se
    construye. Sin esta comprobacion, cualquiera con permiso de edicion sobre
    sus propios documentos se los aprobaba a si mismo y quedaba en el
    expediente como material autorizado, con historial y fechas de aprobacion
    que parecen los de una revision de verdad. Eso es peor que no tener
    revision: tiene su apariencia.

    La regla es la minima que sostiene el control: el autor NO puede ser el
    unico. Puede estar entre los revisores -- en un equipo pequeño el autor
    conoce el documento y su firma vale -- pero tiene que haber alguien mas.
    Prohibirle aparecer del todo seria mas estricto de lo que pide ISO 19650-2
    y bloquearia a equipos de dos personas sin ganar nada.
    """
    correo = (user.get('email') or '').strip().lower()
    nombre = (user.get('name') or '').strip().lower()
    mi_id = user.get('id')

    def es_el_autor(paso):
        # Con identidad estructurada se comparan identidades: si no, dos
        # personas con el mismo nombre podrian «dar independencia» a una
        # revision en la que en realidad solo firma el autor.
        if paso.get('user_id') and mi_id:
            try:
                return int(paso['user_id']) == int(mi_id)
            except (TypeError, ValueError):
                return False
        c = (paso.get('email') or '').strip().lower()
        n = (paso.get('name') or '').strip().lower()
        return (correo and c == correo) or (nombre and n == nombre)

    ajenos = [p for p in steps if not es_el_autor(p)]
    if ajenos:
        return None
    return jsonify({
        "success": False,
        "error": "Una revisión necesita al menos un revisor distinto de quien la "
                 "crea. Puedes estar entre los revisores, pero no ser el único. "
                 "Si eres la única persona en esta obra, invita a alguien desde "
                 "Administración → Miembros y asígnalo como revisor.",
        "code": "REVISION_SIN_INDEPENDENCIA",
    }), 400


@reviews_bp.route('/api/reviews', methods=['POST'])
def create_review():
    d = request.get_json() or {}
    negativa = guardia_de_obra(d.get('model_urn'), 'crear una revision')
    if negativa:
        return negativa
    items, steps = d.get('items') or [], d.get('steps') or []

    # ── CON QUE REGLAS NACE ESTA REVISION (REVIEWS-R01) ───────────────────
    # Lo pone el SERVIDOR. Si el cliente manda `contrato`, se ignora: el motor
    # con el que se cierra un expediente no lo elige quien abre el expediente.
    import flujo_de_revision as flujo
    contrato = flujo.CONTRATO_VIGENTE

    # ── GAP 06 · APLICAR UNA PLANTILLA ────────────────────────────────────
    #
    # La expansion vive AQUI, dentro del alta de siempre, y no en una ruta
    # paralela. Lo que sale de la plantilla son unos `steps` como cualquier
    # otros: a partir de esta linea el codigo no distingue si los escribio una
    # persona o los produjo un molde, y por tanto pasan por las MISMAS
    # comprobaciones -- independencia autor/revisor, permiso sobre los
    # documentos, idoneidad, revisor miembro de la obra.
    #
    # Y son una COPIA. La revision guarda su flujo en `steps`; la plantilla no
    # vuelve a mirarse nunca mas. Cambiarla despues no toca esta revision.
    procedencia = None
    if d.get('plantilla_id') and not steps:
        obra_p = resolve_project_id(d.get('model_urn') or '')
        with get_db_connection() as _c:
            _cur = _c.cursor()
            _cur.execute("""SELECT id, alcance, project_id, nombre, pasos, activa, version
                             FROM doc_review_plantillas WHERE id = %s""",
                         (int(d['plantilla_id']),))
            _p = _cur.fetchone()
            if not _p:
                return jsonify({"success": False,
                                "error": "Esa plantilla no existe."}), 404
            plantilla = {'id': str(_p[0]), 'alcance': _p[1], 'project_id': _p[2],
                         'nombre': _p[3], 'pasos': _p[4] or [], 'activa': bool(_p[5]),
                         'version': _p[6]}
            if plantilla['alcance'] == plt.OBRA and plantilla['project_id'] != obra_p:
                return jsonify({"success": False,
                                "error": "Esa plantilla es de otra obra.",
                                "code": "OTRA_OBRA"}), 409
            if not plantilla['activa']:
                return jsonify({
                    "success": False,
                    "error": "Esa plantilla está deshabilitada: no se pueden abrir "
                             "revisiones nuevas con ella. Las que ya se abrieron "
                             "siguen su curso.",
                    "code": "PLANTILLA_DESACTIVADA"}), 409
            res = plt.resolver(_cur, plantilla, obra_p, d.get('elecciones'))
            if res.error:
                return jsonify({"success": False, "error": res.error,
                                "code": res.code, "opciones": res.opciones}), 409
            steps = res.pasos
            procedencia = plt.procedencia(plantilla)

    if not d.get('model_urn') or not d.get('title') or not items or not steps:
        return jsonify({"success": False, "error": "Faltan model_urn/title/items/steps"}), 400
    final_status = d.get('final_status', ecd.SHARED)
    if final_status not in FINAL_STATUSES:
        return jsonify({"success": False, "error": f"final_status debe ser {FINAL_STATUSES}"}), 400
    u = _user()
    # Este modulo no comprobaba NADA: ni que la obra fuera tuya, ni que tuvieras
    # permiso sobre los documentos. Cualquiera con sesion podia crear una revision
    # sobre planos de otra obra, ponerse a si mismo de revisor y publicarlos.
    negado = _puede_con_estos_documentos(u, d['model_urn'], items, 'edit',
                                         'incluir documentos en una revisión')
    if negado:
        return negado
    negado = _revision_independiente(u, steps)
    if negado:
        return negado
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # Se valida AL CREAR, no al aprobar: enterarse de que el código no
            # sirve cuando ya han firmado tres revisores es tarde y humillante.
            from idoneidad import validar_para
            vale, motivo = validar_para(cur, d['model_urn'],
                                        d.get('codigo_idoneidad'), final_status)
            if not vale:
                return jsonify({"success": False, "error": motivo}), 400

            # Una revision NUEVA exige revisor estructurado en cada paso, y bajo
            # el contrato nuevo tambien que cada paso diga QUE se le pide.
            obra = resolve_project_id(d['model_urn'])
            negado = _pasos_validos(cur, obra, steps, contrato)
            if negado:
                return negado

            # QUE VERSION DE CADA DOCUMENTO SE SOMETE A REVISION. Vale para los dos
            # caminos de alta --a mano y de plantilla--, porque los `items` llegan
            # igual por los dos. Va antes del INSERT: si no se sostiene, no nace la
            # revision, ni su encargo, ni su aviso.
            negado = _documentos_con_version_fijada(cur, d['model_urn'], items)
            if negado:
                return negado

            # QUIEN FIRMA TIENE QUE PODER VER LO QUE FIRMA. Con los pasos ya
            # resueltos --a mano o de plantilla-- y las versiones ya validadas,
            # cada persona del flujo tiene que poder consultar todos los
            # documentos. Tambien antes del INSERT: si no se sostiene, no nace nada.
            negado = _participantes_con_acceso(cur, d['model_urn'], steps, items)
            if negado:
                return negado

            actor = u.get('email') or u.get('name')
            historia = [{"event": "created", "by": actor,
                         "at": datetime.now(timezone.utc).isoformat()}]
            # La PROCEDENCIA viaja con el nombre y la version aplicados, no solo
            # con el id: «plantilla 4» dejaria de decir nada el dia que esa
            # plantilla se renombre o cambie. Es traza, nunca autoridad.
            cur.execute("""INSERT INTO doc_reviews (model_urn, title, items, steps, final_status,
                                                    created_by, history, codigo_idoneidad,
                                                    plantilla_id, plantilla_nombre,
                                                    plantilla_version, contrato)
                           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                        (d['model_urn'], d['title'], json.dumps(items), json.dumps(steps),
                         final_status, actor, json.dumps(historia),
                         (d.get('codigo_idoneidad') or '').strip().upper() or None,
                         (procedencia or {}).get('plantilla_id'),
                         (procedencia or {}).get('plantilla_nombre'),
                         (procedencia or {}).get('plantilla_version'),
                         contrato))
            rid = cur.fetchone()[0]

            # Arranca el turno del primer revisor: fija su plazo EN EL REVIEW, lo
            # anota en el historial y abre el encargo, que es la proyeccion de lo
            # que `steps` y `current_step` ya dicen.
            vence, historia = _empieza_el_turno(cur, rid, steps, 0, actor,
                                                d['title'], historia)
            cur.execute("UPDATE doc_reviews SET paso_vence_en=%s, history=%s WHERE id=%s",
                        (vence, json.dumps(historia), rid))

            # EL TESTIGO DEL CONTRATO, DENTRO DE LA MISMA TRANSACCION.
            #
            # El alta deja escrito con que reglas nacio la revision, para poder
            # CONTRASTARLO despues con la columna: si algun dia una dijera
            # AUTORIDAD_TERMINAL y el otro dijera PRE, la contradiccion es
            # detectable. Y `activity_log` tiene UPDATE, DELETE y TRUNCATE
            # revocados para `ecd_app` (03_grants_ida.sql), asi que la
            # aplicacion no puede reescribir lo que declaro.
            #
            # POR QUE `registrar_actividad` Y NO `log_activity`: el segundo abre
            # otra conexion, confirma por su cuenta y traga los fallos. Con eso,
            # la garantia del contrato --«toda revision nueva produce un
            # registro de alta cuyo contrato coincide con doc_reviews.contrato»--
            # no existia: la revision se confirmaba primero y el testigo se
            # escribia despues, y si fallaba quedaba una revision sin testigo en
            # silencio. Aqui van en la MISMA transaccion: si el testigo no se
            # puede escribir, la revision no nace.
            #
            # LO QUE ESTO NO ES: evidencia independiente frente a `ecd_migrator`
            # o al superusuario. Quien pueda alterar la columna puede alterar el
            # testigo -- es dueno de las dos tablas. Se dice aqui para que nadie
            # lea de esta linea una garantia que no da.
            registrar_actividad(cur, d['model_urn'], 'review_created', 'review',
                                entity_id=str(rid), entity_name=d['title'],
                                performed_by=u.get('name'),
                                details={"contrato": contrato})
            conn.commit()
        return jsonify({"success": True, "id": rid, "contrato": contrato})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@reviews_bp.route('/api/reviews/<int:rid>/act', methods=['POST'])
def act_on_review(rid):
    """Aprueba o rechaza el paso actual. Solo el revisor asignado (o un admin)."""
    d = request.get_json() or {}
    action = d.get('action')
    comment = (d.get('comment') or '').strip()
    if action not in ('approve', 'reject'):
        return jsonify({"success": False, "error": "action debe ser approve|reject"}), 400
    u = _user()
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT id, model_urn, title, items, steps, current_step, status,
                                  final_status, history, created_by, created_at,
                                  codigo_idoneidad, cerrada_en, paso_vence_en,
                                  plantilla_id, plantilla_nombre, plantilla_version,
                                  contrato
                           FROM doc_reviews WHERE id = %s FOR UPDATE""", (rid,))
            row = cur.fetchone()
            if not row:
                return jsonify({"success": False, "error": "Revisión no encontrada"}), 404
            rev = _row_to_dict(row)
            # La obra sale de la revision guardada, no de lo que mande el cliente.
            from routes.documents import verify_project_access
            if not verify_project_access(u, rev['model_urn']):
                return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403
            if rev['status'] != 'pending':
                return jsonify({"success": False, "error": f"La revisión ya está {rev['status']}"}), 409

            step = rev['steps'][rev['current_step']]
            # UNA sola forma de decidir quien es el revisor. Con `user_id` en el
            # paso es una comparacion de identidades y NADA MAS: los respaldos
            # por correo y por nombre solo se consultan en pasos LEGACY, que no
            # tienen identidad estructurada. Consultarlos «por si acaso» en un
            # paso nuevo devolveria la ambiguedad que el user_id viene a quitar
            # -- dos personas llamadas igual, las dos candidatas a firmar.
            import flujo_de_revision as flujo
            # B12 CERRADO (21-ago-2026).
            #
            # Aqui habia `… or u.get('role') == 'admin'`: un administrador podia
            # APROBAR O RECHAZAR el paso asignado a otra persona. Es mas
            # autoridad de la que declaran las propias reglas de Reviews, y
            # contradice el patron de RFI y Red Line, donde el administrador NO
            # dicta el veredicto -- «un veredicto que puede dictar cualquiera no
            # prueba nada».
            #
            # El rescate administrativo legitimo sigue existiendo y esta abajo:
            # sustituir al revisor de una revision BLOQUEADA, con auditoria. Eso
            # cambia QUIEN debe actuar; no actua por el.
            if not flujo.puede_actuar(u, step):
                return jsonify({"success": False,
                                "error": "Este paso corresponde a %s"
                                         % flujo.etiqueta_del_paso(step)}), 403

            # ── ¿PUEDE CONSULTAR LO QUE VA A JUZGAR? ─────────────────────────
            #
            # Ser el revisor del paso no basta: la asignacion no concede permiso
            # documental. Dar conformidad, aprobar o rechazar exige poder consultar
            # TODOS los documentos de la revision --y el dueno de cada version
            # fijada-- con la regla documental de siempre. Vale para `approve` y
            # para `reject`, en cualquier paso y con cualquier contrato: es una
            # condicion del actor, no del contrato. Una PRE no cambia de semantica;
            # cambia quien puede ejercerla.
            #
            # Antes de la primera escritura, como las puertas de abajo. El mensaje
            # no nombra documentos: quien lo recibe no puede verlos. La salida es
            # la de siempre: devolverle el acceso, o que un administrador sustituya
            # al revisor.
            if not flujo.puede_consultar_la_revision(cur, u, rev['model_urn'], rev['items']):
                return jsonify({
                    "success": False,
                    "error": ("No puedes actuar en esta revisión: no tienes acceso a todos "
                              "sus documentos. Pide a quien administra la obra que te lo "
                              "devuelva o que sustituya al revisor."),
                    "code": "SIN_PERMISO_DOCUMENTAL"}), 403

            # ── ¿PERMITE EL CONTRATO ESTE ACTO? (REVIEWS-R01) ─────────────
            #
            # VA AQUI, Y NO MAS ABAJO, POR UNA RAZON MECANICA: el primer efecto
            # de este manejador es cerrar el encargo del paso. Cualquier puerta
            # posterior dejaria un efecto parcial -- el encargo cerrado y la
            # revision sin avanzar. Esta comprobacion es la ultima cosa que se
            # hace antes de tocar algo, y hasta aqui no se ha escrito nada.
            #
            # Rechaza dos cosas, las dos por fallo cerrado:
            #
            #   - Un contrato que este motor no entiende. NUNCA se supone PRE:
            #     suponer seria aplicar la regla posicional a un expediente que
            #     declaro otra, que es exactamente el error que R01 evita.
            #
            #   - `approve` sobre un ultimo paso que solo REVISA. El acto se
            #     rechaza y NO se muta nada: ni estado, ni paso, ni historial,
            #     ni documentos. Y NO se convierte a `rejected`, porque quien
            #     pulso no ejecuto `reject` -- convertirla seria firmar un
            #     veredicto en su nombre.
            permitido, motivo_contrato = flujo.acto_permitido(
                rev['contrato'], rev['steps'], rev['current_step'], action)
            if not permitido:
                return jsonify({"success": False, "error": motivo_contrato,
                                "code": "CONTRATO_NO_PERMITE_EL_ACTO"}), 409

            # ¿SE SABE QUE VERSION DE CADA DOCUMENTO SE ESTA REVISANDO?
            #
            # Mismo sitio que la puerta anterior y por la misma razon: aun no se
            # ha escrito nada. Una AUTORIDAD_TERMINAL sin version fijada, o con una
            # version que no es de su documento, no avanza en positivo ni emite:
            # su historial afirmaria haber revisado algo que no se puede decir que
            # se reviso. Rechazar sigue permitido --es la salida-- y PRE queda
            # fuera: su contrato historico nunca fijo version.
            if action == 'approve' and rev['contrato'] == flujo.AUTORIDAD_TERMINAL:
                sin_version, no_validas = _versiones_fijadas(
                    cur, rev['model_urn'], rev['items'], para_alta=False)
                if sin_version or no_validas:
                    return _asociacion_invalida(sorted(set(sin_version) | set(no_validas)))

            # CON FECHA. Cada acto de aprobacion o rechazo tiene que quedar
            # fechado: es la primera pregunta de una supervision, y hasta ahora la
            # unica forma de reconstruirla era mirar la fila correlativa del
            # registro de actividad y suponer.
            entry = {"event": action, "step": rev['current_step'],
                     "by": u.get('email') or u.get('name'), "comment": comment,
                     "at": datetime.now(timezone.utc).isoformat()}
            # CON QUE AUTORIDAD QUEDA EMITIDO ESTE ACTO (REVIEWS-R01).
            #
            # La clave solo APARECE bajo el contrato nuevo. Bajo PRE la entrada
            # del historial sale identica a como salia antes de R01 -- ni una
            # clave mas: una revision PRE no adquiere un campo que su proceso
            # nunca tuvo, y su expediente no cambia de forma a mitad de camino.
            emitido = flujo.emitido_de(rev['contrato'], step, action)
            if emitido:
                entry['emitido'] = emitido
            history = rev['history'] + [entry]

            # Se resolvio el paso: quien lo debia deja de deberlo. Va antes de
            # decidir si avanza o se rechaza, porque en los dos casos el encargo
            # de ESTE paso queda cerrado.
            try:
                import encargos as _enc
                _enc.cerrar_los_de(cur, 'REVIEW', rid, u.get('email') or u.get('name'))
            except Exception as _e:
                # La revision avanza igual: el encargo es su reflejo, no su motor.
                import logging as _lg
                _lg.getLogger('reviews').warning('encargo no cerrado: %s', _e)

            if action == 'reject':
                cur.execute("UPDATE doc_reviews SET status='rejected', history=%s, "
                            "       paso_vence_en=NULL WHERE id=%s",
                            (json.dumps(history), rid))
            elif not flujo.cierra_positivamente(rev['contrato'], rev['steps'],
                                                rev['current_step']):
                # AVANZA. La condicion era `current_step + 1 < len(steps)`, y
                # bajo PRE `cierra_positivamente` devuelve exactamente eso
                # negado: una revision PRE avanza y cierra igual que antes de
                # R01. Bajo AUTORIDAD_TERMINAL, un APRUEBA intermedio tambien
                # cae aqui: completa su paso y da paso, no cierra.
                #
                # El turno siguiente calcula SU plazo, no hereda el del anterior
                # ni se queda sin ninguno -- que es lo que pasaba antes: solo el
                # primer paso recibia vencimiento.
                siguiente = rev['current_step'] + 1
                vence, history = _empieza_el_turno(
                    cur, rid, rev['steps'], siguiente,
                    u.get('email') or u.get('name'), rev['title'], history)
                cur.execute("UPDATE doc_reviews SET current_step=%s, history=%s, "
                            "       paso_vence_en=%s WHERE id=%s",
                            (siguiente, json.dumps(history), vence, rid))
            else:
                # CIERRE POSITIVO. Bajo PRE, el ultimo paso posicional. Bajo
                # AUTORIDAD_TERMINAL, el ultimo posicional Y con decision
                # APRUEBA -- la unica combinacion que produce efecto documental
                # final. Un REVISA terminal no llega nunca aqui: lo para
                # `acto_permitido` arriba, sin mutar nada.
                #
                # Ultimo paso aprobado: los documentos avanzan al estado final.
                #
                # Esto era un UPDATE directo a file_nodes que se saltaba la maquina
                # de estados entera: por aqui un documento pasaba a Publicado sin
                # haber estado nunca Compartido, y el registro no decia de donde
                # venia. Ahora va por la misma puerta que el resto
                # (backend/estados_ecd.py), que valida el camino y deja UNA linea
                # de auditoria por documento, con su nombre y su estado anterior.
                cur.execute("UPDATE doc_reviews SET status='approved', history=%s, "
                            "cerrada_en=CURRENT_TIMESTAMP, paso_vence_en=NULL WHERE id=%s",
                            (json.dumps(history), rid))
                ids = [it.get('node_id') for it in rev['items'] if it.get('node_id')]
                destino = ecd.normalizar(rev['final_status'])

                # ¿Sigue siendo la misma versión que se mandó a revisar?
                # Antes se aprobaba el node_id a secas, así que se sellaba «apto
                # para construcción» sobre lo que hubiera subido en ese momento,
                # que podía no ser lo que nadie miró. Sin version_id no hay con qué
                # comparar, y eso sólo se acepta en las revisiones PRE históricas,
                # que nacieron sin fijarla. Una AUTORIDAD_TERMINAL sin versión ya la
                # para la puerta de arriba; esta es la segunda llave, para que faltar
                # `version_id` no vuelva a bastar para pasar por aquí.
                cambiados = []
                for n, it in enumerate(rev['items'], start=1):
                    esperada = it.get('version_id')
                    if not esperada or not it.get('node_id'):
                        if rev['contrato'] == flujo.PRE:
                            continue
                        conn.rollback()
                        return _asociacion_invalida([n])
                    cur.execute("SELECT current_version_id, name, version_number "
                                "FROM file_nodes WHERE id = %s", (it['node_id'],))
                    fila = cur.fetchone()
                    if fila and fila[0] and str(fila[0]) != str(esperada):
                        cambiados.append(f"{fila[1] or it.get('name')} (ahora v{fila[2]})")
                if cambiados:
                    conn.rollback()
                    return jsonify({
                        "success": False,
                        "error": ("No se puede aprobar: alguien subió una versión nueva "
                                  "después de mandar esto a revisión, así que se estaría "
                                  "aprobando algo que nadie revisó. Cambió: "
                                  + ", ".join(cambiados[:5])
                                  + (" …" if len(cambiados) > 5 else "")
                                  + ". Vuelve a mandarlo a revisión.")}), 409
                # Publicar es un acto de autoridad tambien por esta via: quien
                # aprueba el ultimo paso tiene que mandar de verdad sobre la
                # carpeta del documento, no solo estar apuntado como revisor.
                nivel = 'admin' if destino in ecd.REQUIEREN_AUTORIDAD else 'edit'
                from folder_permissions import check_folder_permission

                def _autorizado(node_id):
                    return check_folder_permission(
                        u, node_id, rev['model_urn'], nivel,
                        f"aprobar como {ecd.ETIQUETAS.get(destino, destino)}") is None

                # La idoneidad la fija la revision al crearse, pero quien aprueba
                # puede indicarla si falta. Sin esto, las revisiones que YA estan
                # en marcha con destino Publicado -- creadas antes de que existiera
                # el campo -- no se podrian aprobar nunca: el codigo llegaria vacio
                # y la puerta las rechazaria una y otra vez, sin salida.
                idoneidad = (rev.get('codigo_idoneidad')
                             or (d.get('codigo_idoneidad') or '').strip().upper() or None)
                try:
                    ecd.transicionar_recorriendo(
                        cur, rev['model_urn'], ids, destino, u,
                        motivo_del_cambio=f"revisión #{rid}: {rev['title']}",
                        autorizar=_autorizado,
                        codigo_idoneidad=idoneidad)
                except ecd.TransicionRechazada as rechazo:
                    conn.rollback()
                    return jsonify({"success": False, "error": rechazo.motivo}), 409
            conn.commit()

        # `emitido` NO viaja al registro de actividad de las transiciones. El
        # testigo del contrato se congelo para EL ALTA y solo para el alta;
        # ampliarlo a los actos seria ampliar el proposito de activity_log
        # dentro de R01. La autoridad de cada acto vive en `history`, que es
        # donde el contrato la puso.
        log_activity(rev['model_urn'], f'review_{action}', 'review', entity_id=str(rid),
                     entity_name=rev['title'], performed_by=u.get('name'),
                     details={"step": rev['current_step'], "comment": comment})
        return jsonify({"success": True})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@reviews_bp.route('/api/reviews/<int:rid>/reasignar', methods=['POST'])
def reasignar_revisor(rid):
    """Sustituye al revisor del paso actual de una revision BLOQUEADA.

    POR QUE EXISTE, Y POR QUE ES TAN ESTRECHA
    -----------------------------------------
    Una revision cuyo revisor sale de la obra se queda parada: no se le puede
    abrir encargo --un encargo no da acceso-- y el tampoco puede actuar. Se
    detecta y se dice, pero hasta ahora no habia salida.

    Esta ruta es esa salida, y NADA MAS:

      - SOLO si la revision esta BLOQUEADA. No es administracion de flujos: no
        sirve para cambiar revisores de una revision que avanza bien. Permitirlo
        convertiria una via de rescate en una forma de elegir quien firma.
      - SOLO un administrador.
      - NUNCA automatica. Quien sustituye a un revisor que se fue es una
        decision de obra; el sistema la ejecuta, no la toma.
      - El nuevo revisor tiene que ser miembro de la obra, igual que al crear.
      - La INDEPENDENCIA se vuelve a comprobar: una sustitucion no puede dejar
        como unico revisor al autor de la revision.

    LO QUE NO TOCA
    --------------
    Los actos ya firmados. Solo reescribe el paso EN CURSO y ANADE una entrada
    al historial. Las aprobaciones anteriores siguen exactamente como estaban.

    Y no toca ningun encargo directamente: cierra los del objeto y arranca el
    turno por la MISMA via que el resto del flujo (`_empieza_el_turno`), porque
    `encargos` es la proyeccion y se mueve cuando se mueve el objeto.
    """
    u = _user()
    if not u:
        return jsonify({"success": False, "error": "Autenticación requerida"}), 401
    if u.get('role') != 'admin':
        return jsonify({"success": False,
                        "error": "Solo un administrador puede sustituir al revisor "
                                 "de una revisión bloqueada.",
                        "code": "SOLO_ADMIN"}), 403

    d = request.get_json(silent=True) or {}
    nuevo_id, motivo = d.get('user_id'), (d.get('motivo') or '').strip()
    if not nuevo_id:
        return jsonify({"success": False, "error": "Falta user_id del nuevo revisor"}), 400
    if not motivo:
        # El motivo es obligatorio a proposito: una sustitucion sin explicacion
        # deja el historial contando QUE paso y no POR QUE, que es la mitad
        # inutil de una trazabilidad.
        return jsonify({"success": False,
                        "error": "Explica por qué se sustituye al revisor: queda en "
                                 "el historial de la revisión.",
                        "code": "FALTA_MOTIVO"}), 400

    import flujo_de_revision as flujo
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            cur.execute("""SELECT id, model_urn, title, items, steps, current_step, status,
                                  final_status, history, created_by, created_at,
                                  codigo_idoneidad, cerrada_en, paso_vence_en,
                                  plantilla_id, plantilla_nombre, plantilla_version,
                                  contrato
                           FROM doc_reviews WHERE id = %s FOR UPDATE""", (rid,))
            row = cur.fetchone()
            if not row:
                return jsonify({"success": False, "error": "Revisión no encontrada"}), 404
            rev = _row_to_dict(row)

            # La obra sale de la revision guardada, no de lo que mande el cliente.
            from routes.documents import verify_project_access
            if not verify_project_access(u, rev['model_urn']):
                return jsonify({"success": False, "error": "No tienes acceso a esta obra."}), 403

            estado, motivo_bloqueo = flujo.estado_del_flujo(cur, rev)
            if estado != 'BLOQUEADA':
                return jsonify({
                    "success": False,
                    "error": "Esta revisión no está bloqueada (%s). Sustituir al "
                             "revisor solo sirve para desatascar, no para cambiar "
                             "quién firma una revisión que avanza." % estado.lower(),
                    "code": "NO_ESTA_BLOQUEADA"}), 409

            obra = resolve_project_id(rev['model_urn'])
            cur.execute('SELECT id, email, name FROM users WHERE id = %s AND is_active',
                        (int(nuevo_id),))
            fila = cur.fetchone()
            if not fila:
                return jsonify({"success": False,
                                "error": "El revisor elegido no existe o está desactivado."}), 400
            nuevo = {'id': fila[0], 'email': fila[1], 'name': fila[2]}

            cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s',
                        (str(obra), nuevo['id']))
            if not cur.fetchone():
                return jsonify({
                    "success": False,
                    "error": "%s no pertenece a esta obra. Añádelo a la obra antes de "
                             "asignarle la revisión." % (nuevo['name'] or nuevo['email']),
                    "code": "REVISOR_FUERA_DE_LA_OBRA"}), 400

            # Y tiene que poder CONSULTAR todos los documentos: se le va a pedir
            # que los juzgue, y `/act` se lo exigira. Sustituir por alguien que no
            # puede verlos solo cambiaria quien esta bloqueado. No se concede nada.
            if not flujo.puede_consultar_la_revision(cur, flujo.persona(cur, nuevo['id']),
                                                     rev['model_urn'], rev['items']):
                return jsonify({
                    "success": False,
                    "error": "%s no puede consultar todos los documentos de esta revisión. "
                             "Dale acceso antes de asignársela o elige a otra persona."
                             % (nuevo['name'] or nuevo['email']),
                    "code": "REVISOR_SIN_ACCESO_DOCUMENTAL"}), 400

            indice = rev['current_step'] or 0
            pasos, entrada = flujo.sustituir_revisor(
                rev['steps'], indice, nuevo, u.get('email') or u.get('name'), motivo)

            if not flujo.sigue_habiendo_independencia(pasos, rev['created_by']):
                return jsonify({
                    "success": False,
                    "error": "Esa sustitución dejaría a quien creó la revisión como "
                             "único revisor. Elige a otra persona.",
                    "code": "REVISION_SIN_INDEPENDENCIA"}), 400

            historia = list(rev['history'] or []) + [entrada]

            # El encargo del revisor que se fue deja de existir; el turno arranca
            # de nuevo para quien entra, con el plazo del paso.
            try:
                import encargos as _enc
                _enc.cerrar_los_de(cur, 'REVIEW', rid, u.get('email') or u.get('name'))
            except Exception as e:
                logging.getLogger('reviews').warning('encargo previo no cerrado: %s', e)

            vence, historia = _empieza_el_turno(
                cur, rid, pasos, indice, u.get('email') or u.get('name'),
                rev['title'], historia)

            cur.execute("UPDATE doc_reviews SET steps=%s, history=%s, paso_vence_en=%s "
                        " WHERE id=%s",
                        (json.dumps(pasos), json.dumps(historia), vence, rid))
            conn.commit()

        log_activity(rev['model_urn'], 'review_reassigned', 'review', entity_id=str(rid),
                     entity_name=rev['title'], performed_by=u.get('name'))
        return jsonify({"success": True, "id": rid, "step": indice,
                        "nuevo_revisor": nuevo, "paso_vence_en":
                            vence.isoformat() if vence else None})
    except Exception as e:
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
