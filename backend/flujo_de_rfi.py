# -*- coding: utf-8 -*-
"""Quien puede hacer que con un RFI, y en que orden.

POR QUE EL RFI NO COPIA EL MECANISMO DE REVIEWS
-----------------------------------------------
En una revision, el revisor de un paso lo FIJA el flujo al crearse, y
sustituirlo es un rescate: por eso esta encerrado tras «solo administrador y
solo si esta bloqueada».

En un RFI, pasar la pelota ES EL FLUJO: pregunto, respondes, reviso, cierro.
Encerrarlo tras las mismas puertas convertiria la operacion ordinaria en un
tramite. Pero «sin puertas de administrador» tampoco es «cualquiera»: un miembro
cualquiera de la obra no puede quitarle un RFI a otro en silencio.

LAS TRES REGLAS, Y DE DONDE SALEN
---------------------------------
Se apoyan solo en lo que ya existe --`created_by`, `responsable_id`,
`users.role` y la membresia--. Ninguna capa de permisos nueva.

  PASAR LA PELOTA   el AUTOR, el RESPONSABLE ACTUAL, o un ADMINISTRADOR.
                    Son las tres posiciones que existen en el flujo real: quien
                    pregunto dirige su consulta y la recupera; quien la tiene
                    puede decir «esto es del proyectista»; y el administrador
                    desatasca.

  DICTAR VEREDICTO  SOLO el responsable actual. Ni el autor ni un administrador.
                    Un veredicto que puede dictar quien pregunto no prueba nada,
                    y hoy CUALQUIER miembro de la obra podia hacerlo.

  CERRAR            el AUTOR o un ADMINISTRADOR. Cierra quien pregunto, cuando
                    la respuesta le sirve.

EL RFI LEGACY
-------------
Los 25 registros reales tienen `responsable` como TEXTO ('Ing. Valeria
Barrenechea') y ningun `responsable_id`. No se convierte: seria adivinar sobre el
expediente.

  CERRADO   se conserva exactamente. Es archivo.
  ABIERTO   necesita ADOPCION antes de recibir veredicto o cierre: una persona
            elige a que usuario de la obra corresponde. El texto original se
            conserva al lado, y queda dicho QUIEN lo eligio.
"""
import datetime
import logging
import re

logger = logging.getLogger(__name__)

ESTADOS = ('Emitido', 'En revisión', 'Respondido', 'Cerrado')

# A donde puede ir cada estado. No se inventa ninguno: son los cuatro que la
# interfaz ya ofrece y los que usan los 25 registros reales.
#
# `Respondido -> En revisión` existe a proposito: si la respuesta no sirve, el
# autor la devuelve. Sin ese camino, un RFI mal respondido solo se podria
# cerrar, que es peor.
TRANSICIONES = {
    'Emitido':     ('Emitido', 'En revisión'),
    'En revisión': ('En revisión', 'Respondido'),
    'Respondido':  ('Respondido', 'En revisión', 'Cerrado'),
    'Cerrado':     ('Cerrado',),          # cerrado es cerrado
}


def _mismo(a, b):
    return bool(a) and bool(b) and str(a).strip().lower() == str(b).strip().lower()


def es_el_autor(usuario, rfi):
    """`created_by` guarda el correo o el nombre. Se comparan los dos."""
    u = usuario or {}
    autor = (rfi or {}).get('created_by')
    return _mismo(u.get('email'), autor) or _mismo(u.get('name'), autor)


def es_el_responsable(usuario, rfi):
    """Por IDENTIDAD. El texto `responsable` nunca decide."""
    rid = (rfi or {}).get('responsable_id')
    if not rid:
        return False
    try:
        return int((usuario or {}).get('id') or 0) == int(rid)
    except (TypeError, ValueError):
        return False


def es_admin(usuario):
    return (usuario or {}).get('role') == 'admin'


# ── Las tres reglas ───────────────────────────────────────────────────────

def puede_pasar_la_pelota(usuario, rfi):
    return (es_el_autor(usuario, rfi) or es_el_responsable(usuario, rfi)
            or es_admin(usuario))


def puede_dictar_veredicto(usuario, rfi):
    """SOLO el responsable actual.

    Ni el autor ni un administrador: un veredicto que puede dictar quien
    pregunto no prueba nada. Un administrador que necesite intervenir se asigna
    el RFI primero --y eso queda escrito en el historial--.
    """
    return es_el_responsable(usuario, rfi)


def puede_cerrar(usuario, rfi):
    return es_el_autor(usuario, rfi) or es_admin(usuario)


# ── El RFI legacy ─────────────────────────────────────────────────────────

def es_legacy(rfi):
    """Viene del registro ANTERIOR: tiene responsable en TEXTO y ninguno estructurado.

    Las dos condiciones, y las dos importan. La primera version solo miraba la
    ausencia de `responsable_id`, y con eso un RFI RECIEN CREADO --que tampoco
    lo tiene-- se tomaba por legacy: su primera asignacion se registraba como
    «adopción» en vez de como asignación. Lo encontro el ensayo.

    Un RFI nuevo sin asignar no es legacy: es nuevo. Legacy es el que arrastra
    un nombre escrito a mano y ningun usuario detras.
    """
    rfi = rfi or {}
    return bool((rfi.get('responsable') or '').strip()) and not rfi.get('responsable_id')


def necesita_adopcion(rfi):
    """Legacy y TODAVIA ABIERTO.

    Un legacy cerrado no necesita nada: es archivo y se conserva tal cual.
    Uno abierto, en cambio, arrastraria el defecto de que cualquiera dicte su
    veredicto, y eso no puede pasar al producto nuevo.
    """
    return es_legacy(rfi) and (rfi or {}).get('estado') != 'Cerrado'


def puede_adoptar(usuario, rfi):
    """Quien incorpora un legacy al flujo estructurado.

    El autor o un administrador. El «responsable actual» no puede: todavia no
    existe como identidad -- es justamente lo que falta.
    """
    return es_el_autor(usuario, rfi) or es_admin(usuario)


# ── Estados ───────────────────────────────────────────────────────────────

def transicion_valida(actual, nuevo):
    actual = actual or 'Emitido'
    if nuevo not in ESTADOS:
        return False, 'El estado «%s» no existe.' % nuevo
    permitidos = TRANSICIONES.get(actual, ())
    if nuevo not in permitidos:
        return False, ('Un RFI «%s» no puede pasar a «%s». Desde ahí solo: %s.'
                       % (actual, nuevo, ', '.join(permitidos)))
    return True, ''


def exige_veredicto(nuevo):
    """`Respondido` sin veredicto es un estado que no dice nada.

    Hoy hay DOS RFI con `fecha_respuesta` puesta y ninguna respuesta: cada campo
    se escribia por su cuenta y nada comprobaba que el conjunto tuviera sentido.
    """
    return nuevo == 'Respondido'


def estado_del_flujo(cur, rfi, project_id=None):
    """('ACTIVO'|'SIN_ASIGNAR'|'BLOQUEADO'|'CERRADO', motivo).

    Se CALCULA al mirarlo; no se guarda. Un estado guardado habria que
    mantenerlo al dia, y uno que puede quedarse viejo es peor que no tenerlo.
    """
    rfi = rfi or {}
    if rfi.get('estado') == 'Cerrado':
        return 'CERRADO', ''

    rid = rfi.get('responsable_id')
    if not rid:
        if rfi.get('responsable'):
            return 'SIN_ASIGNAR', ('viene del registro anterior: su responsable es '
                                   'solo el texto «%s»' % rfi['responsable'])
        return 'SIN_ASIGNAR', 'todavía no tiene responsable'

    cur.execute('SELECT 1 FROM users WHERE id = %s AND is_active', (int(rid),))
    if not cur.fetchone():
        return 'BLOQUEADO', 'la cuenta del responsable (usuario %s) ya no está activa' % rid

    obra = project_id or rfi.get('project_id')
    if not obra:
        return 'BLOQUEADO', 'no se puede determinar la obra del RFI'
    cur.execute('SELECT 1 FROM project_users WHERE project_id = %s AND user_id = %s',
                (str(obra), int(rid)))
    if not cur.fetchone():
        cur.execute('SELECT name, email FROM users WHERE id = %s', (int(rid),))
        quien = cur.fetchone() or ('', '')
        return 'BLOQUEADO', ('%s ya no pertenece a esta obra, así que nadie puede '
                             'responder este RFI' % (quien[0] or quien[1] or rid))
    return 'ACTIVO', ''


# ── Numeracion ────────────────────────────────────────────────────────────

_SUFIJO = re.compile(r'(\d+)\s*$')


def siguiente_codigo(cur, project_id, prefijo='RFI'):
    """El siguiente numero DENTRO DE LA OBRA, tratando el sufijo como numero.

    POR QUE NO `COUNT(*) + 1`
    -------------------------
    Contar filas recicla numeros en cuanto se borra uno, y ordena 'RFI-9'
    despues de 'RFI-10'. Se toma el MAXIMO del sufijo numerico, que es lo que la
    numeracion significa.

    POR QUE POR `project_id` Y NO POR `model_urn`
    ---------------------------------------------
    Porque `model_urn` es un ALCANCE, no la obra: la obra '1' tiene OCHO alias
    registrados. Agrupar por alcance dejaria convivir dos RFI-013 en la misma
    obra, creados bajo alias distintos.

    Los codigos que no encajen en el patron se ignoran en el calculo en vez de
    reventar: un registro heredado con un codigo raro no puede impedir crear el
    siguiente.
    """
    cur.execute("""SELECT COALESCE(MAX(NULLIF(substring(codigo from '[0-9]+$'), '')::bigint), 0)
                     FROM doc_rfis WHERE project_id = %s""", (str(project_id),))
    ultimo = (cur.fetchone() or [0])[0] or 0
    return '%s-%03d' % (prefijo, int(ultimo) + 1)


# ── Historial ─────────────────────────────────────────────────────────────

def entrada(evento, por, **datos):
    """Una linea del historial. Siempre con quien y cuando."""
    d = {'event': evento, 'by': por,
         'at': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    d.update({k: v for k, v in datos.items() if v is not None})
    return d
