# -*- coding: utf-8 -*-
"""La MECANICA comun de los registros documentales formales. La SEMANTICA, no.

QUE COMPARTEN EL RFI Y EL RED LINE, Y QUE NO
--------------------------------------------
Comparten la FORMA: un registro numerado por obra, con un documento formal
adjunto, un responsable con identidad, un plazo, un veredicto y un historial.

NO comparten el SIGNIFICADO. Un RFI PREGUNTA, y su veredicto acepta o rechaza
la RESPUESTA. Un Red Line PROPONE UNA MODIFICACION DEL PROYECTO --un croquis
numerado y firmado, `RL_0004_..._SKT_...pdf`-- y su veredicto acepta o rechaza
LA MODIFICACION.

Por eso este fichero contiene solo la mecanica --como se compara una identidad,
como se valida una transicion, como se calcula el siguiente numero-- y cada
objeto declara su semantica en su propio fichero, a la vista.

POR QUE UNA PIEZA COMUN Y NO DOS COPIAS
---------------------------------------
Porque una regla de gobierno duplicada acaba divergiendo, y eso ya se pago en
este proyecto: `_faltantes` y `_sigue_debiendose` usaban criterios PARECIDOS
pero distintos, y la conciliacion OSCILABA en vez de converger.

POR QUE LA SEMANTICA SE DECLARA Y NO SE HEREDA
----------------------------------------------
Una `Semantica` es un DATO, no una subclase. Se lee de un vistazo quien puede
que en cada objeto, y `ensayo_de_desacople.py` comprueba que tocar una NO
cambia el comportamiento de la otra. Compartir mecanica no puede convertirse en
compartir flujo sin que nadie lo note.
"""
import collections
import datetime
import logging
import re

logger = logging.getLogger(__name__)

# Las posiciones que existen en un flujo de registro. NO son roles del sistema
# de permisos: son POSICIONES DEL PROPIO FLUJO, y por eso no hizo falta ninguna
# capa de permisos nueva para gobernarlo.
AUTOR = 'autor'
RESPONSABLE = 'responsable'
ADMIN = 'admin'
POSICIONES = (AUTOR, RESPONSABLE, ADMIN)

Semantica = collections.namedtuple('Semantica', (
    'clave',                  # el `objeto_tipo` del encargo: 'RFI' | 'REDLINE'
    'tabla',                  # 'doc_rfis' | 'doc_redlines'
    'prefijo',                # 'RFI' | 'RL'
    'singular',               # como se nombra en los mensajes al usuario
    'estados',
    'transiciones',
    'quien_pasa_la_pelota',
    'quien_dicta_veredicto',
    'quien_cierra',
    'quien_adopta',
    'restriccion_unica',
    'asunto_encargo',         # que dice el encargo que hay que hacer
    'msg_no_reasigna',
    'msg_no_adopta',
    'msg_no_veredicto',
    'msg_no_cierra',
    'msg_falta_veredicto',
    'msg_cerrado',
    'msg_necesita_adopcion',
    'msg_bloqueado_fuera',
))


# ── Identidad ─────────────────────────────────────────────────────────────
# Mecanica pura: no depende de que objeto sea.

def _mismo(a, b):
    return bool(a) and bool(b) and str(a).strip().lower() == str(b).strip().lower()


def es_el_autor(usuario, obj):
    """`created_by` guarda el correo o el nombre. Se comparan los dos."""
    u = usuario or {}
    autor = (obj or {}).get('created_by')
    return _mismo(u.get('email'), autor) or _mismo(u.get('name'), autor)


def es_el_responsable(usuario, obj):
    """Por IDENTIDAD. El texto `responsable` nunca decide."""
    rid = (obj or {}).get('responsable_id')
    if not rid:
        return False
    try:
        return int((usuario or {}).get('id') or 0) == int(rid)
    except (TypeError, ValueError):
        return False


def es_admin(usuario, cur=None, obra=None):
    """La posicion ADMIN de un flujo: administrador **DE ESA OBRA**.

    Antes era `role == 'admin'` a secas, y con eso un administrador ajeno a la
    obra podia pasar la pelota de un RFI o cerrarlo. Ahora, cuando se le da
    contexto --cursor y obra--, se resuelve por obra; sin contexto cae al Entity
    Admin, que conserva alcance global mientras 1 instancia = 1 cliente.

    Lo que esta posicion NUNCA ha concedido, y sigue sin conceder: dictar el
    veredicto. Eso es `quien_dicta_veredicto=(RESPONSABLE,)` en las dos
    semanticas, y no incluye a ADMIN.
    """
    usuario = usuario or {}
    if usuario.get('role') == 'admin':
        return True
    if cur is None or not obra:
        return False
    try:
        from administracion_de_obra import es_admin_de_obra
        return es_admin_de_obra(cur, usuario, obra)
    except Exception:
        return False                      # FAIL-CLOSED


def ocupa(usuario, obj, posicion, cur=None):
    if posicion == AUTOR:
        return es_el_autor(usuario, obj)
    if posicion == RESPONSABLE:
        return es_el_responsable(usuario, obj)
    if posicion == ADMIN:
        # La obra sale del PROPIO OBJETO: un RFI sabe de que obra es, asi que la
        # administracion se resuelve contra esa y no contra ninguna otra.
        return es_admin(usuario, cur, (obj or {}).get('project_id'))
    # Una posicion que no existe no puede darse por falsa en silencio: seria
    # una regla de gobierno que no gobierna nada y nadie lo notaria.
    raise ValueError('posición desconocida en el flujo: %r' % (posicion,))


def alguna_de(usuario, obj, posiciones, cur=None):
    """Si el usuario ocupa ALGUNA de las posiciones que la semantica declara."""
    return any(ocupa(usuario, obj, p, cur) for p in (posiciones or ()))


# ── Las reglas, evaluadas contra lo que declara CADA objeto ───────────────

def puede_pasar_la_pelota(sem, usuario, obj, cur=None):
    return alguna_de(usuario, obj, sem.quien_pasa_la_pelota, cur)


def puede_dictar_veredicto(sem, usuario, obj, cur=None):
    return alguna_de(usuario, obj, sem.quien_dicta_veredicto, cur)


def puede_cerrar(sem, usuario, obj, cur=None):
    return alguna_de(usuario, obj, sem.quien_cierra, cur)


def puede_adoptar(sem, usuario, obj, cur=None):
    return alguna_de(usuario, obj, sem.quien_adopta, cur)


# ── Registros heredados ───────────────────────────────────────────────────

def es_legacy(obj):
    """Viene del registro ANTERIOR: responsable en TEXTO y ninguno estructurado.

    LAS DOS CONDICIONES, Y LAS DOS IMPORTAN. La primera version miraba solo la
    ausencia de `responsable_id`, y con eso un registro RECIEN CREADO --que
    tampoco lo tiene-- se tomaba por heredado: su primera asignacion se
    registraba como «adopción» en vez de como asignación. Lo encontro el ensayo.
    """
    obj = obj or {}
    return bool((obj.get('responsable') or '').strip()) and not obj.get('responsable_id')


def necesita_adopcion(obj):
    """Heredado y TODAVIA ABIERTO.

    Uno heredado y cerrado no necesita nada: es archivo y se conserva tal cual.
    Los 33 Red Lines historicos estan TODOS cerrados, asi que NINGUNO pide
    adopcion -- y esa es exactamente la razon de que esta regla mire el estado.
    """
    return es_legacy(obj) and (obj or {}).get('estado') != 'Cerrado'


# ── Estados ───────────────────────────────────────────────────────────────

def transicion_valida(sem, actual, nuevo):
    actual = actual or 'Emitido'
    if nuevo not in sem.estados:
        return False, 'El estado «%s» no existe.' % nuevo
    permitidos = sem.transiciones.get(actual, ())
    if nuevo not in permitidos:
        return False, ('Un %s «%s» no puede pasar a «%s». Desde ahí solo: %s.'
                       % (sem.singular, actual, nuevo, ', '.join(permitidos)))
    return True, ''


def exige_veredicto(nuevo):
    """`Respondido` sin veredicto es un estado que no dice nada."""
    return nuevo == 'Respondido'


def estado_del_flujo(cur, sem, obj, project_id=None):
    """('ACTIVO'|'SIN_ASIGNAR'|'BLOQUEADO'|'CERRADO', motivo).

    Se CALCULA al mirarlo; no se guarda. Un estado guardado habria que
    mantenerlo al dia, y uno que puede quedarse viejo es peor que no tenerlo.
    """
    obj = obj or {}
    if obj.get('estado') == 'Cerrado':
        return 'CERRADO', ''

    rid = obj.get('responsable_id')
    if not rid:
        if obj.get('responsable'):
            return 'SIN_ASIGNAR', ('viene del registro anterior: su responsable es '
                                   'solo el texto «%s»' % obj['responsable'])
        return 'SIN_ASIGNAR', 'todavía no tiene responsable'

    cur.execute('SELECT 1 FROM users WHERE id = %s AND is_active', (int(rid),))
    if not cur.fetchone():
        return 'BLOQUEADO', 'la cuenta del responsable (usuario %s) ya no está activa' % rid

    obra = project_id or obj.get('project_id')
    if not obra:
        return 'BLOQUEADO', 'no se puede determinar la obra de este %s' % sem.singular
    cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s',
                (str(obra), int(rid)))
    if not cur.fetchone():
        cur.execute('SELECT name, email FROM users WHERE id = %s', (int(rid),))
        quien = cur.fetchone() or ('', '')
        return 'BLOQUEADO', sem.msg_bloqueado_fuera % (quien[0] or quien[1] or rid)
    return 'ACTIVO', ''


# ── Numeracion ────────────────────────────────────────────────────────────

_SUFIJO = re.compile(r'(\d+)\s*$')

# La tabla la fija la `Semantica` del objeto, NUNCA la peticion. Va interpolada
# porque un nombre de tabla no puede ser un parametro de consulta, y por eso se
# comprueba antes contra la lista cerrada de tablas conocidas.
_TABLAS = ('doc_rfis', 'doc_redlines', 'doc_submittals', 'doc_actas',
           'doc_issues', 'doc_instrucciones')

_MAX_SUFIJO = ("SELECT COALESCE(MAX(NULLIF(substring(codigo from %s), '')::bigint), 0)"
               "  FROM {tabla} WHERE project_id = %s")


def siguiente_codigo(cur, sem, project_id):
    """El siguiente numero DENTRO DE LA OBRA, tratando el sufijo como numero.

    POR QUE NO `COUNT(*) + 1`
    -------------------------
    Contar filas recicla numeros en cuanto se borra uno, y ordena 'RL-9' despues
    de 'RL-10'. Se toma el MAXIMO del sufijo numerico, que es lo que la
    numeracion significa. Los Red Lines reales llegan a RL-033: contar habria
    bastado hasta el primer borrado.

    POR QUE POR `project_id` Y NO POR `model_urn`
    ---------------------------------------------
    Porque `model_urn` es un ALCANCE, no la obra: la obra '1' tiene OCHO alias
    registrados. Agrupar por alcance dejaria convivir dos RL-013 en la misma
    obra, creados bajo alias distintos.

    Y CADA REGISTRO CUENTA EL SUYO: la numeracion del RFI no avanza la del Red
    Line ni al reves, porque cada `Semantica` nombra su propia tabla.

    Los codigos que no encajen en el patron se ignoran en el calculo en vez de
    reventar: un registro heredado con un codigo raro no puede impedir crear el
    siguiente.
    """
    if sem.tabla not in _TABLAS:
        raise ValueError('tabla desconocida en la semántica: %r' % (sem.tabla,))
    cur.execute(_MAX_SUFIJO.format(tabla=sem.tabla), ('[0-9]+$', str(project_id)))
    ultimo = (cur.fetchone() or [0])[0] or 0
    return '%s-%03d' % (sem.prefijo, int(ultimo) + 1)


# ── Historial ─────────────────────────────────────────────────────────────

def entrada(evento, por, **datos):
    """Una linea del historial. Siempre con quien y cuando."""
    d = {'event': evento, 'by': por,
         'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    d.update({k: v for k, v in datos.items() if v is not None})
    return d
