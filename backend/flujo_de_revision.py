# -*- coding: utf-8 -*-
"""Quien es el revisor de un paso, cuando vence su turno, y si el flujo esta vivo.

POR QUE ESTE MODULO EXISTE APARTE
---------------------------------
Estas tres preguntas se hacen desde dos sitios que no deben depender el uno del
otro: el manejador de revisiones (`routes/reviews.py`) y la conciliacion de
encargos (`encargos.py`). Si cada uno las respondiera a su manera, la revision y
su proyeccion podrian discrepar sobre a quien le toca -- que es justo lo que
todo este bloque existe para impedir.

LA IDENTIDAD DEL REVISOR
------------------------
Un paso NUEVO lleva `user_id`: una identidad del sistema, inequivoca.

Hasta ahora un paso era `{email, name}` y la comprobacion de quien podia actuar
comparaba `u.email == paso.email` **o** `u.name == paso.name`. Con dos personas
llamadas igual -- que en una obra con varias empresas no es raro -- las dos eran
candidatas a firmar el mismo paso. Y un cambio de nombre dejaba a la buena fuera.

    NUEVO:    user_id            identidad estructurada. Es la que manda.
    legacy:   email              si el paso no tiene user_id.
    legacy:   name               ultimo recurso, si tampoco hay email.

`email` y `name` se conservan en los pasos nuevos, pero como INSTANTANEA: dicen a
quien se le pidio y con que nombre, aunque esa persona se llame distinto dentro
de dos anos. Son informacion visible e historica, no identidad.

**REGLA QUE NO SE PUEDE RELAJAR:** si el paso trae `user_id`, los respaldos por
correo y por nombre NO se consultan. Consultarlos «por si acaso» devolveria
exactamente la ambiguedad que el `user_id` viene a eliminar.

LOS PASOS HISTORICOS NO SE REESCRIBEN
-------------------------------------
No se intenta convertir un nombre antiguo en un usuario de hoy: seria adivinar
sobre el expediente. Un paso legacy sigue resolviendose por correo o por nombre,
y se comporta exactamente como antes.
"""
import datetime
import logging

logger = logging.getLogger(__name__)


def revisor_del_paso(cur, paso):
    """(user_id, motivo). `user_id` es None si no hay identidad utilizable.

    `motivo` explica por que, para poder DECIRLO en vez de callarlo.
    """
    paso = paso or {}
    uid = paso.get('user_id')
    if uid:
        try:
            cur.execute('SELECT id FROM users WHERE id = %s AND is_active', (int(uid),))
        except (TypeError, ValueError):
            return None, 'el paso trae un user_id que no es un numero'
        fila = cur.fetchone()
        if fila:
            return fila[0], ''
        return None, 'la cuenta del revisor (usuario %s) ya no esta activa' % uid

    # -- Desde aqui, solo pasos LEGACY --
    from encargos import usuario_por_email
    correo = paso.get('email')
    if correo:
        uid = usuario_por_email(cur, correo)
        if uid:
            return uid, ''
        return None, 'paso legacy: el correo «%s» no corresponde a ningun usuario activo' % correo
    if paso.get('name'):
        return None, 'paso legacy: solo tiene nombre, sin identidad de usuario'
    return None, 'el paso no dice a quien le toca'


def puede_actuar(usuario, paso, uid_del_paso=None):
    """¿Esta persona es el revisor de este paso?

    Con `user_id` en el paso, la respuesta es una comparacion de identidades y
    NADA MAS. Sin el, se cae a los respaldos historicos.
    """
    usuario = usuario or {}
    paso = paso or {}

    if paso.get('user_id'):
        try:
            return int(usuario.get('id') or 0) == int(paso['user_id'])
        except (TypeError, ValueError):
            return False

    # -- Respaldos SOLO para pasos legacy --
    correo = (usuario.get('email') or '').strip().lower()
    nombre = (usuario.get('name') or '').strip().lower()
    p_correo = (paso.get('email') or '').strip().lower()
    p_nombre = (paso.get('name') or '').strip().lower()
    if p_correo:
        return bool(correo) and correo == p_correo
    return bool(nombre) and bool(p_nombre) and nombre == p_nombre


def es_legacy(paso):
    """Un paso sin identidad estructurada. Se conserva; no se convierte."""
    return not (paso or {}).get('user_id')


def vencimiento(paso, desde=None):
    """Cuando vence el turno de este paso. None si no se le puso plazo.

    Se calcula al EMPEZAR el turno y no al crear la revision, porque cuando se
    crea no se sabe cuando le tocara al paso 3. Dias naturales: un calendario de
    feriados es un modulo, no un campo.
    """
    dias = (paso or {}).get('dias')
    if dias in (None, '', 0):
        return None
    try:
        dias = int(dias)
    except (TypeError, ValueError):
        return None
    if dias <= 0:
        return None
    base = desde or datetime.datetime.now(datetime.timezone.utc)
    return base + datetime.timedelta(days=dias)


def etiqueta_del_paso(paso):
    """Como se le llama al revisor por pantalla. Nunca decide nada."""
    paso = paso or {}
    return paso.get('name') or paso.get('email') or ('usuario %s' % paso.get('user_id'))


def sustituir_revisor(pasos, indice, nuevo, quien, motivo, ahora=None):
    """Devuelve (pasos_nuevos, entrada_de_historial). NO escribe nada.

    LO QUE SE CONSERVA, Y POR QUE
    -----------------------------
    El revisor anterior no se borra: queda dentro del propio paso, en
    `reasignado_de`. Un paso que fue sustituido tiene que poder contarlo por si
    mismo, sin obligar a nadie a reconstruirlo leyendo el historial entero.

    Y los actos ya realizados NO se tocan. Esta funcion solo reescribe el paso
    EN CURSO y anade una entrada; las aprobaciones y rechazos anteriores siguen
    en `history` exactamente como se firmaron. Sustituir a quien todavia no ha
    actuado no cambia lo que ya hizo otro.

    Si el paso ya habia sido sustituido antes, `reasignado_de` guarda al de
    entonces --el inmediatamente anterior-- y la cadena completa se lee en el
    historial, que es donde vive el relato.
    """
    import copy
    import datetime as _dt

    pasos = copy.deepcopy(list(pasos or []))
    anterior = dict(pasos[indice] or {})
    # `reasignado_de` no se arrastra dentro de si mismo: el historial es la
    # cadena, el paso solo guarda de quien viene ahora.
    anterior.pop('reasignado_de', None)

    paso = dict(pasos[indice] or {})
    paso['user_id'] = nuevo['id']
    paso['email'] = nuevo.get('email')
    paso['name'] = nuevo.get('name')
    paso['reasignado_de'] = anterior          # el que estaba, tal cual
    pasos[indice] = paso

    entrada = {
        'event': 'step_reassigned',
        'step': indice,
        'from': {'user_id': anterior.get('user_id'),
                 'email': anterior.get('email'),
                 'name': anterior.get('name')},
        'to': {'user_id': nuevo['id'], 'email': nuevo.get('email'),
               'name': nuevo.get('name')},
        'by': quien,
        'reason': (motivo or '').strip()[:400],
        'at': (ahora or _dt.datetime.now(_dt.timezone.utc)).isoformat(),
    }
    return pasos, entrada


def sigue_habiendo_independencia(pasos, autor):
    """¿Queda al menos un revisor distinto de quien creo la revision?

    Se vuelve a comprobar DESPUES de sustituir. Sin esto, una sustitucion
    podria dejar como unico revisor al propio autor -- una firma delante del
    espejo, y por la puerta de atras: la revision es el camino a PUBLICADO.

    `autor` es lo que guarda `doc_reviews.created_by`: el correo, o el nombre si
    no habia correo. Se compara contra las dos claves del paso porque en un paso
    legacy puede no haber correo.
    """
    autor = (autor or '').strip().lower()
    if not autor:
        return True          # sin autor registrado no hay a quien excluir
    for paso in (pasos or []):
        correo = ((paso or {}).get('email') or '').strip().lower()
        nombre = ((paso or {}).get('name') or '').strip().lower()
        if correo != autor and nombre != autor:
            return True
    return False


def estado_del_flujo(cur, rev, project_id=None):
    """('ACTIVA'|'BLOQUEADA'|'CERRADA', motivo) de una revision.

    BLOQUEADA es el caso que motivo esta pieza: el revisor del paso actual ya no
    puede actuar --se fue de la obra, o su cuenta se desactivo-- y la revision se
    queda parada sin que nada lo diga. NO es un estado nuevo del ciclo de vida:
    se CALCULA al mirarla, no se guarda. Anadir un estado obligaria a mantenerlo
    al dia, y un estado que puede quedarse viejo es peor que no tenerlo.

    Y no se reasigna sola: quien sustituye a un revisor que se fue es una
    decision de obra, y automatizarla romperia la regla de independencia.
    """
    if (rev or {}).get('status') != 'pending':
        return 'CERRADA', ''
    pasos = rev.get('steps') or []
    i = rev.get('current_step') or 0
    if i >= len(pasos):
        return 'BLOQUEADA', 'la revision apunta a un paso que no existe'
    paso = pasos[i] or {}

    uid, motivo = revisor_del_paso(cur, paso)
    if not uid:
        return 'BLOQUEADA', motivo or 'no se puede determinar el revisor del paso actual'

    obra = project_id or rev.get('_project_id')
    if not obra:
        from db import resolve_project_id
        obra = resolve_project_id(rev.get('model_urn'))
    if not obra:
        return 'BLOQUEADA', 'no se puede determinar la obra de la revision'

    cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s',
                (str(obra), uid))
    if not cur.fetchone():
        return 'BLOQUEADA', ('%s ya no pertenece a esta obra, asi que nadie puede '
                             'actuar en el paso %d' % (etiqueta_del_paso(paso), i + 1))
    return 'ACTIVA', ''
