# -*- coding: utf-8 -*-
"""GAP 07 · POST /api/sync — lo que se capturo en obra entra aqui.

ATOMICIDAD POR OPERACION, NO POR LOTE
--------------------------------------
Cada acto va en SU PROPIA transaccion. Una operacion invalida no puede tumbar
actos independientes que ya eran validos: quien sincroniza despues de una
jornada sin cobertura trae quince cosas, y que una mal formada tire las otras
catorce seria perder trabajo por un detalle.

Y por eso la respuesta va POR `operation_id`, no un «sync failed»:

    OP1 -> APLICADA
    OP2 -> APLICADA
    OP3 -> CONFLICTO
    OP4 -> BLOQUEADA (depende de OP3)

LAS SIETE REVALIDACIONES, Y DONDE VA CADA UNA
-----------------------------------------------
    1. identidad / sesion          antes del bucle: es una sola
    2. pertenencia a la obra       por operacion
    3. acceso a la herramienta     por operacion   (capa 16 + capa 08)
    4. permiso de recurso          por operacion
    5. autorizacion de flujo       DENTRO de la transaccion que muta
    6. responsabilidad / BIC       DENTRO de la transaccion que muta
    7. estado canonico actual      DENTRO de la transaccion que muta

Las tres ultimas dependen de datos MUTABLES, y comprobarlas fuera dejaria una
ventana entre validar y escribir:

        validar  ->  (otro cambia el objeto)  ->  mutar

Por eso van en la misma transaccion Y con `FOR UPDATE` sobre la fila del objeto:
sin el bloqueo, dos sincronizaciones simultaneas leerian el mismo estado y las
dos se creerian legitimadas.

EL ACTOR NUNCA VIENE DEL MOVIL
-------------------------------
Es la identidad autenticada AHORA. Un acto capturado el martes por alguien a
quien sacaron de la obra el miercoles no entra el jueves.

Lo que si se conserva del campo es `capturado_en`. Y NO se usa para ordenar
entre dispositivos: dos relojes movidos reordenarian actos ajenos entre si.
"""
import json
import logging

from flask import Blueprint, g, jsonify, request

from db import get_db_connection, log_activity, resolve_project_id
from perimetro_de_obra import guardia_de_obra
import acceso_a_herramientas as _ath
import encargos as _enc
import flujo_de_issue as iss
import flujo_de_protocolo as pro
import flujo_de_registro as reg
import gcs_manager as gcs
import herramientas_de_obra as _hdo
import sincronizacion_de_campo as sync

logger = logging.getLogger('sync')

sync_bp = Blueprint('sync_bp', __name__)

# Que herramienta gobierna cada dominio. Es la MISMA que gobierna sus rutas en
# linea: sincronizar no puede ser una puerta que se salte la capa 16.
HERRAMIENTA_DE = {sync.PROTOCOLO: 'protocolos', sync.ISSUE: 'issues',
                  sync.FOTO: 'fotos', sync.PARTE: 'cuaderno',
                  sync.ASIENTO: 'cuaderno'}

MAX_POR_LOTE = 200


def _usuario():
    return getattr(g, 'current_user', None) or {}


def _actor():
    u = _usuario()
    return u.get('email') or u.get('name') or 'desconocido'


def _respuesta(op, d, dependencia=None):
    """El desenlace de UNA operacion, con todo lo que el movil necesita."""
    r = {
        'operation_id': op.get('operation_id'),
        'local_object_id': op.get('local_object_id'),
        'status': d.estado,
        'canonical_object_id': d.server_object_id,
        'canonical_result': d.resultado or None,
        'error_code': d.code,
        'error': d.motivo,
    }
    if dependencia:
        r['dependency_blocker'] = dependencia
    if d.estado == sync.CONFLICTO:
        r['conflict_state'] = (d.resultado or {}).get('servidor')
    return r


# ── LAS CAPAS 2, 3 y 4 ─────────────────────────────────────────────────────

def _puede_operar_en_la_obra(cur, obra, op):
    """None si puede; un Desenlace RECHAZADA si no.

    Se revalida ENTERO en cada sincronizacion. Un acto offline no congela los
    permisos de quien lo capturo.
    """
    # 2 · pertenencia
    negativa = guardia_de_obra(obra, 'sincronizar trabajo de campo')
    if negativa:
        return sync.rechazada(
            'ya no perteneces a esta obra, así que este acto no puede entrar. '
            'No se ha borrado: sigue en tu dispositivo.', 'ACCESO_REVOCADO')

    # 3 · acceso a la herramienta: capa 16 (¿existe aquí?) y capa 08 (¿entras tú?)
    #
    # Se comprueba AQUI y no en el middleware porque el middleware deduce la
    # herramienta de la RUTA, y `/api/sync` no es de ninguna: trae actos de
    # varias. Sin esto, sincronizar seria la puerta que se salta la capa 16.
    codigo = HERRAMIENTA_DE.get(op['object_type'])
    if codigo:
        if not _hdo.esta_activa(cur, obra, codigo):
            return sync.rechazada(
                'la herramienta «%s» ya no está habilitada en esta obra'
                % _hdo.etiqueta(codigo), 'HERRAMIENTA_NO_ACTIVA')
        if not _ath.puede_entrar(cur, _usuario(), obra, codigo):
            return sync.rechazada(
                'ya no tienes acceso a «%s» en esta obra' % _hdo.etiqueta(codigo),
                'SIN_ACCESO_A_HERRAMIENTA')
    return None


# ══ LOS ACTOS · ISSUE ══════════════════════════════════════════════════════

def _issue_create(cur, obra, op):
    """Crea el issue. Las mismas exigencias que `POST /api/issues`.

    No se reutiliza aquel manejador porque lee de `request` y decide su propia
    transaccion; lo que SI se reutiliza es la semantica --`flujo_de_issue`-- que
    es donde vive la regla. La prueba
    `test_sync_exige_LO_MISMO_que_el_alta_en_linea` comprueba que no divergen.
    """
    p = op.get('payload') or {}
    tipo = (p.get('tipo') or '').strip().upper()
    if tipo not in iss.CODIGOS_TIPO:
        return sync.rechazada('tipo de issue desconocido: %s' % tipo, 'TIPO_DESCONOCIDO')
    titulo = (p.get('titulo') or '').strip()
    if not titulo:
        return sync.rechazada('el título es obligatorio', 'SIN_TITULO')

    responsable = p.get('responsable_id')
    if tipo in iss.EXIGEN_RESPONSABLE and not responsable:
        return sync.rechazada(
            'un %s sin responsable es un defecto que nadie va a corregir'
            % iss.etiqueta_tipo(tipo), 'SIN_RESPONSABLE')
    verificador = p.get('verificador_id')
    if tipo in iss.EXIGEN_VERIFICADOR and not verificador:
        return sync.rechazada(
            'un %s exige un verificador designado distinto de quien corrige'
            % iss.etiqueta_tipo(tipo), 'SIN_VERIFICADOR')
    if verificador and responsable and int(verificador) == int(responsable):
        return sync.rechazada('el verificador no puede ser quien corrige',
                              'VERIFICADOR_ES_RESPONSABLE')

    # Los designados TIENEN QUE SEGUIR EN LA OBRA. Se comprueba ahora, no
    # cuando se capturo: pudieron salir mientras no habia cobertura.
    for quien, uid in (('responsable', responsable), ('verificador', verificador)):
        if not uid:
            continue
        cur.execute('SELECT 1 FROM project_users WHERE project_id=%s AND user_id=%s',
                    (obra, int(uid)))
        if not cur.fetchone():
            return sync.rechazada(
                'el %s que elegiste en campo ya no es miembro de esta obra'
                % quien, '%s_NO_MIEMBRO' % quien.upper())

    # EL ANCLAJE CONSERVA LA REVISION QUE SE VIO EN CAMPO.
    #
    # Si mientras no habia cobertura se emitio una revision mas nueva, la
    # observacion NO se mueve a la vigente: se levanto sobre un soporte
    # concreto y tiene que seguir diciendo sobre CUAL. Tampoco es un conflicto
    # --nadie hizo nada incompatible-- asi que no se molesta a nadie con una
    # decision que no hay que tomar.
    #
    # Lo unico que se comprueba es que esa revision sea de ESTA obra: sin eso se
    # podria clavar una observacion sobre el plano de otra con solo conocer su
    # id.
    revision_id = p.get('revision_id')
    if revision_id:
        cur.execute("""SELECT pl.project_id FROM doc_plano_revisiones r
                         JOIN doc_planos pl ON pl.id = r.plano_id
                        WHERE r.id = %s""", (revision_id,))
        f = cur.fetchone()
        if not f:
            return sync.rechazada(
                'la lámina sobre la que anotaste esto ya no existe',
                'REVISION_NO_EXISTE')
        if str(f[0]) != str(obra):
            return sync.rechazada('esa lámina pertenece a otra obra', 'OTRA_OBRA')

    for intento in range(5):
        codigo = reg.siguiente_codigo(cur, iss.SEMANTICA, obra)
        try:
            cur.execute('SAVEPOINT alta_sync')
            cur.execute("""INSERT INTO doc_issues
                (project_id, model_urn, codigo, tipo, titulo, descripcion,
                 revision_id, ubicacion, progresiva, autor_id, responsable_id,
                 verificador_id, created_by, vence_en, evidencia,
                 origen_tipo, origen_id, history)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id""",
                (obra, p.get('model_urn'), codigo, tipo, titulo,
                 (p.get('descripcion') or '').strip() or None,
                 revision_id,
                 (p.get('ubicacion') or '').strip() or None,
                 (p.get('progresiva') or '').strip() or None,
                 _usuario().get('id'), responsable, verificador, _actor(),
                 p.get('vence_en') or None, json.dumps(p.get('evidencia') or []),
                 'CAMPO_OFFLINE', op.get('local_object_id'),
                 json.dumps([reg.entrada('detected', _actor(), codigo=codigo,
                                         tipo=tipo,
                                         capturado_en=op.get('capturado_en'))])))
            iid = cur.fetchone()[0]
            cur.execute('RELEASE SAVEPOINT alta_sync')
            break
        except Exception:
            cur.execute('ROLLBACK TO SAVEPOINT alta_sync')
            if intento == 4:
                raise

    try:
        eid = _enc.abrir(cur, 'ISSUE', iid, 'Corregir %s: %s' % (codigo, titulo),
                         destino_usuario=responsable, creado_por=_actor())
        if eid:
            _enc.avisar(cur, eid)
    except Exception as e:
        logger.warning('[sync %s] sin encargo: %s', iid, str(e)[:120])

    return sync.aplicada(iid, {'codigo': codigo, 'tipo': tipo, 'estado': iss.ABIERTO})


def _issue_leer_bloqueando(cur, iid):
    """Lee el issue Y LO BLOQUEA. Sin `FOR UPDATE`, dos sincronizaciones
    simultaneas leerian el mismo estado y las dos se creerian legitimadas."""
    cur.execute("""SELECT id, project_id, codigo, titulo, estado, autor_id,
                          responsable_id, verificador_id, autoverificacion,
                          evidencia, evidencia_correccion, history, model_urn,
                          vence_en
                     FROM doc_issues WHERE id = %s FOR UPDATE""", (iid,))
    f = cur.fetchone()
    if not f:
        return None
    return {'id': f[0], 'project_id': f[1], 'codigo': f[2], 'titulo': f[3],
            'estado': f[4], 'autor_id': f[5], 'responsable_id': f[6],
            'verificador_id': f[7], 'autoverificacion': bool(f[8]),
            'evidencia': f[9] or [], 'evidencia_correccion': f[10] or [],
            'history': f[11] or [], 'model_urn': f[12], 'vence_en': f[13]}


def _estado_esperado(op, d):
    """CONFLICTO si el servidor se movio. Nunca `last-write-wins`.

    El movil dice en que estado creia que estaba el objeto. Si ya no es ese, no
    se reinterpreta la intencion: se conserva lo que queria hacer, lo que el
    servidor dice ahora, y decide una persona.
    """
    esperado = (op.get('base_version') or (op.get('payload') or {}).get('expected_state'))
    if not esperado:
        return None
    if str(esperado) != str(d['estado']):
        return sync.en_conflicto(
            'cuando lo capturaste en obra este %s estaba en «%s», y ahora está '
            'en «%s». No se ha tocado nada: decide qué hacer con lo que trajiste.'
            % (d['codigo'], esperado, d['estado']),
            'CONFLICTO_DE_ESTADO',
            estado_servidor={'estado': d['estado'], 'codigo': d['codigo']})
    return None


def _issue_mark_corrected(cur, obra, op, iid):
    p = op.get('payload') or {}
    d = _issue_leer_bloqueando(cur, iid)
    if not d:
        return sync.rechazada('ese issue ya no existe', 'NO_EXISTE')
    if str(d['project_id']) != str(obra):
        return sync.rechazada('ese issue es de otra obra', 'OTRA_OBRA')

    # 7 · estado canonico, con el objeto ya bloqueado
    conflicto = _estado_esperado(op, d)
    if conflicto:
        return conflicto
    ok, motivo = reg.transicion_valida(iss.SEMANTICA, d['estado'], iss.CORREGIDO)
    if not ok:
        return sync.en_conflicto(
            'este %s ya está en «%s»: %s' % (d['codigo'], d['estado'], motivo),
            'TRANSICION_INVALIDA',
            estado_servidor={'estado': d['estado'], 'codigo': d['codigo']})

    # 6 · responsabilidad. Pudo cambiar mientras no habia cobertura.
    if not iss.puede_corregir(_usuario(), d):
        return sync.rechazada(
            'ya no eres quien tiene que corregir este %s' % d['codigo'],
            'NO_RESPONSABLE')

    evidencia = list(d['evidencia_correccion'] or []) + [
        {**(e if isinstance(e, dict) else {'nombre': e}),
         'por': _actor(), 'en_estado': d['estado'],
         'capturado_en': op.get('capturado_en')}
        for e in (p.get('evidencia') or [])]
    if not evidencia:
        return sync.rechazada(
            'declarar corregido exige evidencia', 'SIN_EVIDENCIA')

    cur.execute("""UPDATE doc_issues SET estado=%s, evidencia_correccion=%s,
                          corregido_en=CURRENT_TIMESTAMP WHERE id=%s""",
                (iss.CORREGIDO, json.dumps(evidencia), iid))
    h = list(d['history']) + [reg.entrada('corrected', _actor(),
                                          evidencias=len(evidencia),
                                          capturado_en=op.get('capturado_en'),
                                          origen='campo sin cobertura')]
    cur.execute('UPDATE doc_issues SET history=%s WHERE id=%s', (json.dumps(h), iid))
    try:
        _enc.cerrar_los_de(cur, 'ISSUE', iid, cerrado_por=_actor())
        if d['verificador_id']:
            eid = _enc.abrir(cur, 'ISSUE', iid,
                             'Verificar la corrección de %s: %s'
                             % (d['codigo'], d['titulo']),
                             destino_usuario=d['verificador_id'], creado_por=_actor())
            if eid:
                _enc.avisar(cur, eid)
    except Exception as e:
        logger.warning('[sync %s] BIC: %s', iid, str(e)[:120])
    return sync.aplicada(iid, {'codigo': d['codigo'], 'estado': iss.CORREGIDO})


def _issue_add_evidence(cur, obra, op, iid):
    """CASO B · el blob vive FUERA de la base.

        EXISTE EL OBJETO EXTERNO   ≠   LA OPERACION SE APLICO

    Que una foto este en el almacen no significa que el issue quedara corregido
    ni que el protocolo aceptara la evidencia. La autoridad sigue en PostgreSQL:
    el blob solo pasa a ser evidencia contractual cuando la revalidacion
    canonica sale bien y queda VINCULADO en la misma transaccion que el cambio.

    Si la operacion termina RECHAZADA o en CONFLICTO, el objeto se queda
    DESACOPLADO --subido pero no expuesto-- y su nombre determinista permite
    reconciliarlo o limpiarlo despues.
    """
    p = op.get('payload') or {}
    d = _issue_leer_bloqueando(cur, iid)
    if not d:
        return sync.rechazada('ese issue ya no existe', 'NO_EXISTE')
    if str(d['project_id']) != str(obra):
        return sync.rechazada('ese issue es de otra obra', 'OTRA_OBRA')
    conflicto = _estado_esperado(op, d)
    if conflicto:
        return conflicto

    # Adjuntar evidencia lo puede hacer quien la levanto o quien la corrige: son
    # los dos que estan en obra mirando el defecto.
    uid = _usuario().get('id')
    if uid not in (d['autor_id'], d['responsable_id']):
        return sync.rechazada(
            'solo quien detectó el defecto o quien tiene que corregirlo pueden '
            'adjuntarle evidencia', 'NO_PUEDE_ADJUNTAR')

    objeto = p.get('objeto_externo') or sync.nombre_del_objeto_externo(
        obra, op['operation_id'])
    evidencia = list(d['evidencia'] or []) + [{
        'nombre': p.get('nombre') or 'evidencia.jpg',
        'objeto_externo': objeto,
        'sha256': p.get('sha256'),
        'por': _actor(),
        'capturado_en': op.get('capturado_en'),
    }]
    cur.execute('UPDATE doc_issues SET evidencia=%s WHERE id=%s',
                (json.dumps(evidencia), iid))
    h = list(d['history']) + [reg.entrada('evidence_added', _actor(),
                                          objeto=objeto,
                                          capturado_en=op.get('capturado_en'))]
    cur.execute('UPDATE doc_issues SET history=%s WHERE id=%s', (json.dumps(h), iid))
    return sync.aplicada(iid, {'codigo': d['codigo'], 'objeto_externo': objeto,
                               'evidencias': len(evidencia)})




# ══ LOS ACTOS · PROTOCOLO ══════════════════════════════════════════════════
#
# EL MISMO MOTOR, OTRO DOMINIO. Esta vertical existe para demostrar que lo
# construido es infraestructura y no «offline para issues» disfrazado: mismo
# `operation_id`, mismo modelo de cola, misma revalidacion, misma idempotencia,
# mismo tratamiento de dependencias y de conflicto.
#
# Lo unico que cambia es la SEMANTICA, que vive donde siempre --en
# `flujo_de_protocolo`-- y no se reescribe aqui.

def _acta_leer_bloqueando(cur, aid):
    cur.execute("""SELECT id, project_id, codigo, titulo, estado, items,
                          autor_id, responsable_id, history, model_urn
                     FROM doc_actas WHERE id = %s FOR UPDATE""", (aid,))
    f = cur.fetchone()
    if not f:
        return None
    return {'id': f[0], 'project_id': f[1], 'codigo': f[2], 'titulo': f[3],
            'estado': f[4], 'items': f[5] or [], 'autor_id': f[6],
            'responsable_id': f[7], 'history': f[8] or [], 'model_urn': f[9]}


def _protocolo_create(cur, obra, op):
    """Levanta un acta en campo, copiando los puntos de su plantilla.

    Los puntos se COPIAN y quedan fijos, igual que en linea: si la plantilla
    cambia manana, esta acta seguira diciendo lo que se comprobo hoy. Que se
    levantara sin cobertura no cambia esa regla.
    """
    p = op.get('payload') or {}
    plantilla_id = p.get('protocolo_id')
    if not plantilla_id:
        return sync.rechazada('un acta se levanta sobre un protocolo concreto',
                              'SIN_PLANTILLA')

    # LA VERSION FORMA PARTE DE LA INTENCION, no es un detalle del cliente.
    #
    # Quien marco los puntos en obra los marco contra UNA version concreta de la
    # plantilla: la que tenia descargada. Si al sincronizar se usara la vigente,
    # sus respuestas se reinterpretarian contra un cuestionario distinto -- y
    # «conforme» en el punto 3 de la v1 puede ser otro punto en la v2. Eso es
    # falsificar lo que alguien comprobo, con buena intencion.
    version_pedida = p.get('protocolo_version')
    if version_pedida is None:
        return sync.rechazada(
            'este acta no dice contra qué versión del protocolo se llenó. Sin '
            'eso no se puede reconstruir lo que se comprobó.',
            'SIN_VERSION_DE_PLANTILLA')

    # LA MISMA CONSULTA que el alta en linea (routes/protocolos.py): si las dos
    # leyeran columnas distintas, un acta levantada en campo y otra levantada en
    # la oficina guardarian cosas distintas de la MISMA plantilla.
    cur.execute("""SELECT id, nombre, version, secciones, activo, project_id
                     FROM doc_protocolos WHERE id = %s""", (plantilla_id,))
    pl = cur.fetchone()
    if not pl:
        return sync.rechazada('ese protocolo ya no existe', 'PLANTILLA_NO_EXISTE')
    if str(pl[5]) != str(obra):
        return sync.rechazada('ese protocolo es de otra obra', 'OTRA_OBRA')

    # NO SE USA LA VIGENTE POR COMODIDAD. Si la version que se llevo a obra ya
    # no es la actual, hay que RECONSTRUIRLA; y si no se puede, es CONFLICTO.
    #
    # Hoy no se puede: `doc_protocolos` guarda una sola fila por plantilla y no
    # hay historico de versiones. Tampoco hace falta todavia --no existe ruta
    # para editar una plantilla, asi que `version` es siempre 1-- pero el dia
    # que exista, esta comprobacion ya esta puesta y falla cerrado en vez de
    # reinterpretar respuestas ajenas.
    if int(version_pedida) != int(pl[2] or 1):
        return sync.en_conflicto(
            'llenaste este acta contra la versión %s del protocolo «%s» y la '
            'vigente es la %s. Tus respuestas NO se reinterpretan contra otra '
            'versión: se conservan tal cual para que decidas.'
            % (version_pedida, pl[1], pl[2]),
            'VERSION_DE_PLANTILLA_NO_RECONSTRUIBLE',
            estado_servidor={'protocolo': pl[1], 'version_vigente': pl[2],
                             'version_usada': version_pedida})
    if not pl[4]:
        return sync.rechazada(
            'ese protocolo se desactivó mientras estabas sin cobertura; las '
            'actas ya levantadas siguen su curso, pero no se abren nuevas',
            'PLANTILLA_DESACTIVADA')

    items = []
    for seccion in (pl[3] or []):
        for it in (seccion.get('items') or []):
            items.append({'texto': it.get('texto'), 'tipo': it.get('tipo'),
                          'seccion': seccion.get('nombre'),
                          'exige_si_no_conforme': it.get('exige_si_no_conforme') or [],
                          'resultado': pro.PENDIENTE})
    if not items:
        return sync.rechazada('ese protocolo no tiene puntos que comprobar',
                              'PLANTILLA_SIN_PUNTOS')

    responsable = p.get('responsable_id')
    if responsable:
        cur.execute('SELECT 1 FROM project_users WHERE project_id=%s AND user_id=%s',
                    (obra, int(responsable)))
        if not cur.fetchone():
            return sync.rechazada(
                'el responsable que elegiste en campo ya no es miembro de esta obra',
                'RESPONSABLE_NO_MIEMBRO')

    for intento in range(5):
        codigo = reg.siguiente_codigo(cur, pro.SEMANTICA, obra)
        try:
            cur.execute('SAVEPOINT alta_acta_sync')
            cur.execute("""INSERT INTO doc_actas
                (project_id, model_urn, codigo, protocolo_id, protocolo_nombre,
                 protocolo_version, titulo, ubicacion,
                 progresiva, items, estado, autor_id, responsable_id, created_by,
                 history)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                # `version_pedida`, NO `pl[2]`: son el mismo numero aqui --la
                # comprobacion de arriba lo garantiza-- pero lo que se guarda
                # tiene que ser la version que se uso EN CAMPO. Si manana
                # alguien afloja aquella comprobacion, esto seguira siendo
                # cierto en vez de convertirse en una mentira silenciosa.
                (obra, p.get('model_urn'), codigo, plantilla_id, pl[1],
                 int(version_pedida),
                 (p.get('titulo') or pl[1] or '').strip(),
                 (p.get('ubicacion') or '').strip() or None,
                 (p.get('progresiva') or '').strip() or None,
                 json.dumps(items), pro.BORRADOR, _usuario().get('id'),
                 responsable, _actor(),
                 json.dumps([reg.entrada('created', _actor(), codigo=codigo,
                                         capturado_en=op.get('capturado_en'),
                                         origen='campo sin cobertura')])))
            aid = cur.fetchone()[0]
            cur.execute('RELEASE SAVEPOINT alta_acta_sync')
            break
        except Exception:
            cur.execute('ROLLBACK TO SAVEPOINT alta_acta_sync')
            if intento == 4:
                raise
    return sync.aplicada(aid, {'codigo': codigo, 'puntos': len(items),
                               'estado': pro.BORRADOR})


def _protocolo_set_items(cur, obra, op, aid):
    """Marca los puntos comprobados. ES EL ACTO DE CAMPO por excelencia: se hace
    caminando la obra, y es justo el que hoy se resuelve en papel."""
    p = op.get('payload') or {}
    d = _acta_leer_bloqueando(cur, aid)
    if not d:
        return sync.rechazada('esa acta ya no existe', 'NO_EXISTE')
    if str(d['project_id']) != str(obra):
        return sync.rechazada('esa acta es de otra obra', 'OTRA_OBRA')

    conflicto = _estado_esperado_acta(op, d)
    if conflicto:
        return conflicto
    # 7 · UNA ACTA FIRMADA NO SE EDITA. Es lo que la hace valer algo.
    if d['estado'] != pro.BORRADOR:
        return sync.en_conflicto(
            'esta acta ya está en «%s»: lo que se comprobó quedó fijado y no se '
            'edita. Lo que traes de campo no se ha perdido.' % d['estado'],
            'ACTA_NO_EDITABLE',
            estado_servidor={'estado': d['estado'], 'codigo': d['codigo']})

    # 6 · quien la levanto o su responsable. Los dos estan en obra mirandola.
    uid = _usuario().get('id')
    if uid not in (d['autor_id'], d['responsable_id']):
        return sync.rechazada(
            'solo quien levantó el acta o su responsable pueden marcar sus puntos',
            'NO_PUEDE_MARCAR')

    entrantes = p.get('items') or []
    if len(entrantes) != len(d['items']):
        return sync.en_conflicto(
            'el acta tiene %d puntos y traes %d: la plantilla cambió o el acta '
            'no es la que crees' % (len(d['items']), len(entrantes)),
            'PUNTOS_NO_CUADRAN',
            estado_servidor={'puntos': len(d['items']), 'codigo': d['codigo']})
    for i, it in enumerate(entrantes):
        if (it.get('resultado') or pro.PENDIENTE) not in pro.RESULTADOS:
            return sync.rechazada('el punto %d trae un resultado desconocido'
                                  % (i + 1), 'RESULTADO_DESCONOCIDO')

    items = []
    for viejo, nuevo in zip(d['items'], entrantes):
        items.append({**viejo,
                      'resultado': nuevo.get('resultado') or pro.PENDIENTE,
                      'observacion': nuevo.get('observacion'),
                      'valor': nuevo.get('valor'),
                      'fotos': nuevo.get('fotos') or viejo.get('fotos') or []})
    cur.execute('UPDATE doc_actas SET items=%s WHERE id=%s',
                (json.dumps(items), aid))
    h = list(d['history']) + [reg.entrada(
        'items_set', _actor(), capturado_en=op.get('capturado_en'),
        no_conformes=sum(1 for x in items if x['resultado'] == pro.NO_CONFORME),
        origen='campo sin cobertura')]
    cur.execute('UPDATE doc_actas SET history=%s WHERE id=%s', (json.dumps(h), aid))
    return sync.aplicada(aid, {
        'codigo': d['codigo'],
        'veredicto_que_corresponde': pro.veredicto_que_corresponde(items)[0],
        'no_conformes': sum(1 for x in items if x['resultado'] == pro.NO_CONFORME)})


def _estado_esperado_acta(op, d):
    esperado = (op.get('base_version') or (op.get('payload') or {}).get('expected_state'))
    if not esperado:
        return None
    if str(esperado) != str(d['estado']):
        return sync.en_conflicto(
            'cuando la marcaste en obra esta acta estaba en «%s» y ahora está en '
            '«%s». No se ha tocado nada.' % (esperado, d['estado']),
            'CONFLICTO_DE_ESTADO',
            estado_servidor={'estado': d['estado'], 'codigo': d['codigo']})
    return None


# ══ LOS ACTOS · FOTO ═══════════════════════════════════════════════════════

def _foto_create(cur, obra, op):
    """Registra una foto capturada en campo. CASO A: el binario YA subió por
    /api/sync/evidencia (con su idempotencia externa); este acto solo escribe
    la fila -- enteramente PostgreSQL.

    La semantica vive en `fotos_de_obra`: mismo objeto para galeria y para
    evidencia de actos, sensibilidad en vez de «privado», y el objeto tiene
    que ser DEL PREFIJO DE ESTA OBRA -- sin eso, conocer el nombre de un blob
    ajeno bastaria para colgarlo en la galeria propia.
    """
    import fotos_de_obra as fdo
    p = op.get('payload') or {}
    objeto = p.get('objeto_externo') or sync.nombre_del_objeto_externo(
        obra, op['operation_id'])
    if not fdo.objeto_es_de_la_obra(objeto, obra):
        return sync.rechazada('esa evidencia pertenece a otra obra', 'OTRA_OBRA')
    sensibilidad = (p.get('sensibilidad') or fdo.NIVEL_POR_DEFECTO).strip()
    if not fdo.nivel_valido(sensibilidad):
        return sync.rechazada('sensibilidad desconocida: %s' % sensibilidad,
                              'SENSIBILIDAD_DESCONOCIDA')

    # IDEMPOTENCIA POR OBJETO ademas de por acto: si un reenvio raro llegara
    # con OTRO operation_id pero el mismo blob, no nacen dos fotos del mismo
    # testigo -- se devuelve la que ya existe.
    cur.execute('SELECT id FROM doc_fotos WHERE objeto = %s', (objeto,))
    ya = cur.fetchone()
    if ya:
        return sync.aplicada(ya[0], {'objeto': objeto, 'ya_existia': True})

    cur.execute("""INSERT INTO doc_fotos
                     (project_id, model_urn, objeto, nombre, tipo_mime, tamano,
                      sha256, capturado_en, autor_id, created_by, descripcion,
                      progresiva, external_id, ubicacion, sensibilidad, history)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   RETURNING id""",
                (obra, p.get('model_urn') or obra, objeto,
                 p.get('nombre') or 'foto de campo',
                 p.get('tipo_mime'), p.get('tamano'), p.get('sha256'),
                 op.get('capturado_en'), _usuario().get('id'), _actor(),
                 (p.get('descripcion') or '').strip() or None,
                 (p.get('progresiva') or '').strip() or None,
                 (p.get('external_id') or '').strip() or None,
                 (p.get('ubicacion') or '').strip() or None,
                 sensibilidad,
                 json.dumps([reg.entrada('created', _actor(),
                                         capturado_en=op.get('capturado_en'),
                                         origen='campo sin cobertura')])))
    fid = cur.fetchone()[0]
    return sync.aplicada(fid, {'objeto': objeto})


# ══ LOS ACTOS · CUADERNO (NG-03) ═══════════════════════════════════════════
#
# Abrir el parte y registrar asientos SON actos de campo. Aprobar, devolver,
# cerrar la jornada y emitir instrucciones NO estan aqui a proposito: son SOLO
# EN LINEA (doc 96 §H) -- autoridad revalidada al momento, la misma decision
# semantica que dejo la firma de actas fuera del motor.

def _parte_create(cur, obra, op):
    """Abre la jornada desde campo. La fecha es la OPERATIVA DECLARADA -- regla
    congelada por el propietario: jamas se deriva del reloj UTC del servidor.

    IDEMPOTENTE POR IDENTIDAD ademas de por acto: si el parte de esa fecha ya
    existe (otro companero lo abrio, o un reenvio raro), se devuelve el que
    hay -- dos moviles sin cobertura el mismo dia no paren dos jornadas.
    """
    import cuaderno_de_obra as cdo
    p = op.get('payload') or {}
    fecha, mal = cdo.fecha_operativa_valida(p.get('fecha_operativa'))
    if not fecha:
        return sync.rechazada(
            'un parte es de una jornada concreta: fecha_operativa AAAA-MM-DD, '
            'declarada, no derivada del reloj del servidor', mal)

    cur.execute("""SELECT id, estado FROM doc_partes
                    WHERE project_id = %s AND fecha_operativa = %s""",
                (obra, fecha))
    ya = cur.fetchone()
    if ya:
        return sync.aplicada(ya[0], {'fecha_operativa': fecha.isoformat(),
                                     'estado': ya[1], 'ya_existia': True})

    import directorio_de_obra as dirobra
    uid = _usuario().get('id')
    funcion = dirobra.funcion_de(cur, obra, uid)
    cur.execute("""INSERT INTO doc_partes
                     (project_id, model_urn, fecha_operativa, responsable_id,
                      created_by, estado, history)
                   VALUES (%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                (obra, p.get('model_urn') or obra, fecha, uid, _actor(),
                 cdo.ABIERTO,
                 json.dumps([reg.entrada('abierto', _actor(),
                                         fecha_operativa=fecha.isoformat(),
                                         funcion=funcion,
                                         capturado_en=op.get('capturado_en'),
                                         origen='campo sin cobertura')])))
    pid = cur.fetchone()[0]
    return sync.aplicada(pid, {'fecha_operativa': fecha.isoformat(),
                               'estado': cdo.ABIERTO})


def _asiento_create(cur, obra, op):
    """Registra un asiento capturado en campo. LA MISMA SEMANTICA que la ruta
    en linea (`cuaderno_de_obra`): tipo del catalogo cerrado, referencia
    obligatoria segun tipo, snapshot de empresa+funcion DE AHORA (el actor se
    revalida al sincronizar, no se congela el de la captura), y aprobacion si
    el autor es colaborador -- el autor NO gana autoridad por crear.
    """
    import cuaderno_de_obra as cdo
    import directorio_de_obra as dirobra
    p = op.get('payload') or {}

    # A que parte pertenece: id canonico, o el local de un PARTE/CREATE previo.
    parte_id = p.get('parte_id')
    if not parte_id and p.get('parte_local'):
        parte_id = sync.resolver_objeto(cur, obra, p['parte_local'])
    if not parte_id and p.get('fecha_operativa'):
        fecha, _mal = cdo.fecha_operativa_valida(p.get('fecha_operativa'))
        if fecha:
            cur.execute("""SELECT id FROM doc_partes
                            WHERE project_id = %s AND fecha_operativa = %s""",
                        (obra, fecha))
            f = cur.fetchone()
            parte_id = f[0] if f else None
    if not parte_id:
        return sync.bloqueada(
            'este asiento es de un parte que todavía no existe en el servidor',
            'OBJETO_LOCAL_SIN_RESOLVER')

    # El candado del parte: FOR UPDATE, como las actas firmadas. Un parte
    # CERRADO no admite asientos ni desde campo.
    cur.execute("""SELECT id, project_id, estado, fecha_operativa
                     FROM doc_partes WHERE id = %s FOR UPDATE""", (int(parte_id),))
    parte = cur.fetchone()
    if not parte:
        return sync.rechazada('ese parte ya no existe', 'NO_EXISTE')
    if str(parte[1]) != str(obra):
        return sync.rechazada('ese parte es de otra obra', 'OTRA_OBRA')
    if parte[2] != cdo.ABIERTO:
        return sync.en_conflicto(
            'la jornada del %s ya se cerró: lo que traes no se ha perdido, '
            'pero entra citando en el parte del día en curso, no en uno '
            'congelado' % parte[3].isoformat(),
            'PARTE_CERRADO',
            estado_servidor={'estado': parte[2],
                             'fecha_operativa': parte[3].isoformat()})

    tipo = (p.get('tipo') or '').strip()
    ok, mal = cdo.validar_asiento(tipo, p.get('texto'), p.get('contenido'),
                                  p.get('referencias'))
    if not ok:
        return sync.rechazada('asiento no registrable', mal)

    uid = _usuario().get('id')
    funcion = dirobra.funcion_de(cur, obra, uid)
    cur.execute("""SELECT c.name FROM users u LEFT JOIN companies c
                     ON c.id = u.company_id WHERE u.id = %s""", (uid,))
    f = cur.fetchone()
    empresa = f[0] if f else None
    estado = cdo.estado_inicial_de_asiento(funcion)

    for intento in range(5):
        numero = cdo.siguiente_numero_de_asiento(cur, obra)
        try:
            cur.execute('SAVEPOINT alta_asiento_sync')
            cur.execute("""INSERT INTO doc_asientos
                (project_id, parte_id, numero, tipo, texto, contenido,
                 referencias, autor_id, autor_empresa, autor_funcion,
                 created_by, estado, capturado_en, history)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id""",
                (obra, int(parte_id), numero, tipo,
                 (p.get('texto') or '').strip() or None,
                 json.dumps(p.get('contenido') or {}),
                 json.dumps(p.get('referencias') or {}),
                 uid, empresa, funcion, _actor(), estado,
                 op.get('capturado_en'),
                 json.dumps([reg.entrada('registrado', _actor(), numero=numero,
                                         tipo=tipo, funcion=funcion,
                                         estado=estado,
                                         capturado_en=op.get('capturado_en'),
                                         origen='campo sin cobertura')])))
            aid = cur.fetchone()[0]
            cur.execute('RELEASE SAVEPOINT alta_asiento_sync')
            break
        except Exception:
            cur.execute('ROLLBACK TO SAVEPOINT alta_asiento_sync')
            if intento == 4:
                raise

    if estado == cdo.EN_APROBACION:
        try:
            eid = _enc.abrir(cur, 'ASIENTO', aid,
                             'Aprobar o devolver el asiento N.º %s (%s)'
                             % (numero, tipo),
                             destino_funcion='SUPERVISION', creado_por=_actor())
            if eid:
                _enc.avisar(cur, eid)
        except Exception as e:
            logger.warning('[sync asiento %s] sin encargo: %s', aid, str(e)[:120])
    return sync.aplicada(aid, {'numero': numero, 'tipo': tipo, 'estado': estado})


DESPACHO = {
    (sync.ISSUE, sync.CREATE): _issue_create,
    (sync.ISSUE, sync.MARK_CORRECTED): _issue_mark_corrected,
    (sync.ISSUE, sync.ADD_EVIDENCE): _issue_add_evidence,
    (sync.PROTOCOLO, sync.CREATE): _protocolo_create,
    (sync.PROTOCOLO, sync.SET_ITEMS): _protocolo_set_items,
    (sync.FOTO, sync.CREATE): _foto_create,
    (sync.PARTE, sync.CREATE): _parte_create,
    (sync.ASIENTO, sync.CREATE): _asiento_create,
}


def _registrar_indeterminada(op, obra, actor_id, actor_visible, error):
    """Deja constancia DURABLE de un acto cuyo efecto externo no se conoce.

    Va en una conexion NUEVA: la del acto acaba de fallar y su transaccion esta
    envenenada. Y si esto tambien fallara, se registra en el log y se responde
    igualmente INDETERMINADA -- porque lo que NO se puede hacer es decirle al
    movil «reintentalo» cuando no se sabe si algo quedo fuera.
    """
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            objeto = sync.nombre_del_objeto_externo(obra, op['operation_id'])
            sync.reservar_efecto_externo(cur, op, actor_id, actor_visible, objeto)
            sync.cerrar(cur, obra, op['operation_id'],
                        sync.indeterminada('el acto fallo despues de poder haber '
                                           'tocado el almacen', objeto_externo=objeto),
                        diagnostico=str(error)[:400])
            conn.commit()
    except Exception as e2:
        logger.error('[sync] %s quedo INDETERMINADA SIN registrar: %s',
                     op.get('operation_id'), e2)




# ══ LA RUTA DE LA EVIDENCIA ════════════════════════════════════════════════
#
# EL CASO EXTERNO MAS DURO, Y POR QUE ESTA RUTA ESTA SEPARADA DE `/api/sync`
# ---------------------------------------------------------------------------
# La secuencia que hay que sobrevivir es esta:
#
#     el movil sube la foto  ->  GCS la guarda  ->  la respuesta SE PIERDE
#     el movil no sabe nada  ->  reintenta con el MISMO operation_id
#
# Si el nombre del objeto lo eligiera el movil o llevara un aleatorio, ese
# reintento crearia un SEGUNDO objeto y la obra acabaria con la misma foto dos
# veces --o, peor, con dos y sin saber cual es la buena--. Como el nombre se
# deriva de `(obra, operation_id)`, el reintento apunta al mismo sitio y la
# pregunta «¿ocurrio?» tiene respuesta: se le pregunta al almacen.
#
# POR ESO LO PRIMERO QUE HACE ESTA RUTA ES CONSULTAR, NO SUBIR.
#
# Y va aparte de `/api/sync` por una razon de forma: un lote de actos es JSON y
# cabe en una peticion; ocho megas de foto no. Mezclarlos obligaria a que un
# acta de 2 KB esperase a que subiera la foto de otro acto.
#
#     EXISTE EL OBJETO EXTERNO   ≠   LA OPERACION SE APLICO
#
# Esta ruta NO adjunta nada a ningun issue: dejar el objeto arriba no lo
# convierte en evidencia contractual. Queda DESACOPLADO hasta que `/api/sync`
# revalida el acto entero y lo vincula en la misma transaccion que el cambio.
# Si aquel acto termina RECHAZADO o en CONFLICTO, el objeto se queda ahi sin
# exponerse, con su nombre determinista para reconciliarlo o limpiarlo.

MAX_EVIDENCIA = 32 * 1024 * 1024


@sync_bp.route('/api/sync/evidencia', methods=['POST'])
def subir_evidencia():
    """Sube UNA evidencia bajo su nombre determinista. Idempotente de verdad."""
    if not _usuario().get('id'):
        return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401

    operation_id = (request.form.get('operation_id') or '').strip()
    if not operation_id:
        return jsonify({'error': 'una evidencia pertenece a un acto concreto',
                        'code': 'SIN_OPERATION_ID'}), 400

    obra = resolve_project_id(request.form.get('project_id') or '')
    if not obra:
        return jsonify({'error': 'no se pudo determinar la obra',
                        'code': 'PROJECT_UNRESOLVED'}), 400

    # LAS MISMAS CAPAS 2 y 3 que el acto. Subir un binario a la carpeta de una
    # obra es entrar en esa obra: que el fichero sea «solo una foto» no lo
    # convierte en una operacion sin permiso.
    with get_db_connection() as conn:
        negada = _puede_operar_en_la_obra(
            conn.cursor(), obra,
            {'object_type': sync.ISSUE, 'action': sync.ADD_EVIDENCE})
    if negada:
        return jsonify({'error': negada.motivo, 'code': negada.code}), 403

    objeto = sync.nombre_del_objeto_externo(obra, operation_id)

    # 1 · PREGUNTAR PRIMERO. Si el objeto ya esta, este es un reintento de algo
    # que si ocurrio: se devuelve lo que hay y no se sube nada.
    try:
        ya = gcs.describir_blob(objeto)
    except Exception as e:
        # No se pudo ni preguntar. Subir a ciegas seria seguro --el nombre es el
        # mismo-- pero se responde con la verdad: no se sabe.
        logger.error('[sync] no se pudo consultar %s: %s', objeto, e)
        return jsonify({'error': 'no se pudo comprobar si esta evidencia ya '
                                 'estaba subida; no se ha vuelto a intentar',
                        'code': 'ALMACEN_NO_RESPONDE'}), 503
    if ya:
        return jsonify({'objeto_externo': objeto, 'ya_existia': True,
                        'tamaño': ya['tamaño'], 'sha256': request.form.get('sha256'),
                        'nota': 'esta evidencia ya estaba subida; no se ha '
                                'duplicado'}), 200

    fichero = request.files.get('file')
    if not fichero or not fichero.filename:
        return jsonify({'error': 'no llegó ningún fichero', 'code': 'SIN_FICHERO'}), 400
    fichero.seek(0, 2)
    tamaño = fichero.tell()
    fichero.seek(0)
    if tamaño > MAX_EVIDENCIA:
        return jsonify({'error': 'esa evidencia pesa demasiado (máximo %d MB)'
                                 % (MAX_EVIDENCIA // (1024 * 1024)),
                        'code': 'EVIDENCIA_DEMASIADO_GRANDE'}), 413
    if not tamaño:
        return jsonify({'error': 'esa evidencia llegó vacía', 'code': 'FICHERO_VACIO'}), 400

    # 2 · LIMPIAR Y SUBIR. El nombre no lo elige el movil, y el GPS del EXIF
    # se quita ANTES de subir -- la misma regla que la subida en linea: si el
    # fichero con coordenadas llegara al almacen, limpiarlo despues no lo quita
    # de donde ya fue. Lo limpiado SE DEVUELVE: el cliente lo mete en el
    # payload del acto FOTO/CREATE y acaba en doc_fotos.exif, no perdido.
    import io as _io
    import privacidad_imagen
    datos = fichero.read()
    limpios, metadatos = privacidad_imagen.limpiar(datos, fichero.filename)
    url = gcs.upload_file_to_gcs(_io.BytesIO(limpios), objeto)
    if not url:
        # Fallo AL SUBIR. Puede que el objeto quedara a medias o no quedara
        # nada; el reintento volvera a preguntar, y esa consulta es la que lo
        # resuelve. No se responde 200 con un objeto que quiza no existe.
        return jsonify({'error': 'no se pudo subir esta evidencia; sigue en tu '
                                 'dispositivo y se reintentará',
                        'code': 'SUBIDA_FALLIDA'}), 502

    return jsonify({'objeto_externo': objeto, 'ya_existia': False,
                    'tamaño': len(limpios), 'sha256': request.form.get('sha256'),
                    'exif': metadatos or {}}), 201


# ══ LA RUTA ════════════════════════════════════════════════════════════════

@sync_bp.route('/api/sync', methods=['POST'])
def sincronizar():
    # 1 · IDENTIDAD. Una sola vez: es la misma para todo el lote, y es la de
    # AHORA -- no la que tenia quien capturo los actos.
    if not _usuario().get('id'):
        return jsonify({'error': 'Autenticación requerida', 'code': 'NO_TOKEN'}), 401

    cuerpo = request.get_json(silent=True) or {}
    operaciones = cuerpo.get('operations') or []
    if not isinstance(operaciones, list):
        return jsonify({'error': 'operations tiene que ser una lista'}), 400
    if len(operaciones) > MAX_POR_LOTE:
        return jsonify({'error': 'demasiadas operaciones en un envío (máximo %d)'
                                 % MAX_POR_LOTE, 'code': 'LOTE_DEMASIADO_GRANDE'}), 413

    actor_id = _usuario().get('id')
    actor_visible = _actor()
    resultados = []
    # Desenlaces de ESTE lote, para resolver dependencias sin ir a la base
    # cuando la predecesora acaba de procesarse.
    en_este_lote = {}

    for op in sync.ordenar(operaciones):
        mal = sync.forma_valida(op)
        if mal:
            resultados.append({
                'operation_id': (op or {}).get('operation_id'),
                'status': sync.RECHAZADA, 'error_code': 'FORMA_INVALIDA',
                'error': mal, 'canonical_object_id': None,
                'canonical_result': None})
            continue

        obra = resolve_project_id(op.get('project_id') or '')
        if not obra:
            d = sync.rechazada('no se pudo determinar la obra de este acto',
                               'PROJECT_UNRESOLVED')
            en_este_lote[op['operation_id']] = d
            resultados.append(_respuesta(op, d))
            continue
        op['project_id'] = obra

        # CADA OPERACION EN SU PROPIA TRANSACCION. Una invalida no puede tumbar
        # los actos independientes que ya eran validos.
        try:
            with get_db_connection() as conn:
                cur = conn.cursor()

                # Reenvio: se devuelve lo consolidado y NO se ejecuta nada.
                previo = sync.ya_procesada(cur, obra, op['operation_id'])
                if previo:
                    conn.commit()
                    en_este_lote[op['operation_id']] = previo
                    resultados.append(_respuesta(op, previo))
                    continue

                # Dependencia. Se mira primero en el lote y despues en la base.
                dep = op.get('depende_de')
                if dep:
                    d_prev = en_este_lote.get(dep)
                    if d_prev is not None:
                        ok = d_prev.estado == sync.APLICADA
                        motivo = ('la operación de la que depende terminó en %s'
                                  % d_prev.estado)
                    else:
                        ok, motivo = sync.dependencia_satisfecha(cur, obra, op)
                    if not ok:
                        d = sync.bloqueada(
                            motivo + '. No se ha ejecutado ni descartado: cuando '
                            'aquella se resuelva, esta vuelve a ser elegible.')
                        sync.anotar(cur, op, actor_id, actor_visible, d)
                        conn.commit()
                        en_este_lote[op['operation_id']] = d
                        resultados.append(_respuesta(op, d, dependencia=dep))
                        continue

                # Capas 2, 3
                negada = _puede_operar_en_la_obra(cur, obra, op)
                if negada:
                    sync.anotar(cur, op, actor_id, actor_visible, negada)
                    conn.commit()
                    en_este_lote[op['operation_id']] = negada
                    resultados.append(_respuesta(op, negada))
                    continue

                # A que objeto canonico se refiere
                iid = op.get('server_object_id')
                if not iid and op['action'] != sync.CREATE:
                    iid = sync.resolver_objeto(cur, obra, op['local_object_id'])
                    if not iid:
                        d = sync.bloqueada(
                            'este acto es sobre un objeto que todavía no existe '
                            'en el servidor', 'OBJETO_LOCAL_SIN_RESOLVER')
                        sync.anotar(cur, op, actor_id, actor_visible, d)
                        conn.commit()
                        en_este_lote[op['operation_id']] = d
                        resultados.append(_respuesta(op, d, dependencia=dep))
                        continue

                manejador = DESPACHO.get((op['object_type'], op['action']))
                if not manejador:
                    d = sync.rechazada(
                        'ese acto todavía no se sincroniza sin cobertura. Hoy: '
                        'levantar un issue, adjuntarle evidencia y darlo por '
                        'corregido; levantar un acta y marcar sus puntos; '
                        'registrar una foto; abrir el parte diario y registrar '
                        'asientos. Firmar, aprobar, cerrar la jornada y emitir '
                        'instrucciones se hacen con conexión, a propósito.',
                        'ACTO_NO_SINCRONIZABLE')
                    sync.anotar(cur, op, actor_id, actor_visible, d)
                    conn.commit()
                    en_este_lote[op['operation_id']] = d
                    resultados.append(_respuesta(op, d))
                    continue

                # Capas 5, 6 y 7 viven DENTRO del manejador, en esta misma
                # transaccion y con la fila bloqueada.
                if op['action'] == sync.CREATE:
                    d = manejador(cur, obra, op)
                else:
                    d = manejador(cur, obra, op, iid)

                # El acto y su registro CONFIRMAN JUNTOS.
                sync.anotar(cur, op, actor_id, actor_visible, d)
                conn.commit()

                if d.estado == sync.APLICADA:
                    log_activity((op.get('payload') or {}).get('model_urn'),
                                 'SYNC_' + op['action'], op['object_type'],
                                 str(d.server_object_id), '', actor_visible,
                                 {'operation_id': op['operation_id']})
                en_este_lote[op['operation_id']] = d
                resultados.append(_respuesta(op, d, dependencia=dep))
        except Exception as e:
            logger.error('[sync] %s %s: %s', op.get('operation_id'),
                         op.get('action'), e)
            # ── LA FRONTERA QUE NO SE PUEDE DEGRADAR ──────────────────────
            #
            #   REINTENTABLE    sabemos que NINGUN efecto durable ocurrio
            #   INDETERMINADA   pudo ocurrir un efecto externo, y no se sabe
            #
            # Para un acto ENTERAMENTE en PostgreSQL, que la transaccion no
            # confirme significa literalmente que no paso nada: REINTENTABLE es
            # la verdad, y no se anota fila porque no hay desenlace que anotar.
            #
            # Para un acto que PUDO tocar el exterior, responder REINTENTABLE
            # seria invitar al movil a reintentar sobre un efecto que quiza ya
            # ocurrio. Ahi hace falta constancia durable: se registra
            # INDETERMINADA con su objeto determinista, y se reconcilia despues
            # preguntandole al almacen si existe.
            if sync.puede_tocar_el_exterior(op.get('object_type'),
                                            op.get('action')):
                _registrar_indeterminada(op, obra, actor_id, actor_visible, e)
                d = sync.indeterminada(
                    'no se pudo saber si la evidencia llegó a subirse. NO se '
                    'reintenta sola: queda anotada y se reconcilia comprobando '
                    'si el objeto existe.',
                    objeto_externo=sync.nombre_del_objeto_externo(
                        obra, op.get('operation_id')))
                en_este_lote[op['operation_id']] = d
                resultados.append(_respuesta(op, d))
                continue
            resultados.append({
                'operation_id': op.get('operation_id'),
                'local_object_id': op.get('local_object_id'),
                'status': sync.REINTENTABLE,
                'canonical_object_id': None, 'canonical_result': None,
                'error_code': 'ERROR_DE_SERVIDOR',
                'error': 'no se pudo procesar y no quedó nada hecho; '
                         'vuelve a enviarlo'})

    return jsonify({
        'resultados': resultados,
        'aplicadas': sum(1 for r in resultados if r['status'] == sync.APLICADA),
        'total': len(resultados),
    })
