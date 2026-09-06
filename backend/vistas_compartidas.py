# -*- coding: utf-8 -*-
"""Como se resuelve un enlace de vista compartida. UNA sola funcion.

QUE ESTABA MAL
--------------
El enlace era `?shareView=<saved_views.id>`: la IDENTIDAD de la fila hacia de
CAPACIDAD publica. Mientras el id sea impredecible funciona, y medido sobre la
copia de produccion del 4-sep-2026 no todos lo son:

    7 vistas   ->   3 con id = hora en milisegundos (13 cifras)
                    4 con id = secrets.token_urlsafe(24)

Los cuatro tokens tienen 192 bits y no son el problema. Los tres timestamps
tienen 33,6 bits sobre los 150 dias en que se crearon, y 15,9 si se sabe el
minuto -- que es lo que sabe cualquiera a quien le hayan dicho «acabo de guardar
una vista».

Ademas, mientras identidad y capacidad sean la misma cosa, un enlace no se
puede revocar sin cambiar la clave primaria de la fila.

LAS TRES CLASES DE CLAVE, Y NI UNA MAS
--------------------------------------
    uuid                        -> `share_token`. La via nueva. Siempre valida.
    13 cifras / 32 urlsafe      -> `id`, PERO SOLO si esa fila lleva la marca
                                   `legacy_enlace`. Mientras la ventana este
                                   abierta, y SE ANOTA en el censo.
    cualquier otra cosa         -> no resuelve. NUNCA.

LA MARCA, Y NO EL FORMATO, ES LO QUE DECIDE
-------------------------------------------
Parece que bastaria reconocer los dos formatos historicos. No basta, y el
motivo es concreto: los ids que genera el codigo de hoy son
`secrets.token_urlsafe(24)` -- LA MISMA FORMA que los 4 enlaces antiguos de
produccion. Aceptar el formato dejaria a cada vista nueva llevando su capacidad
publica en la clave primaria, que es exactamente lo que E-4D viene a terminar.

Por eso la via antigua no es una FORMA sino un CONJUNTO CERRADO: las filas que
ya existian cuando se aplico la migracion 30, marcadas alli con `legacy_enlace`
y con el DEFAULT cambiado a FALSE acto seguido. Ninguna vista creada despues la
hereda. El formato se sigue mirando, pero solo como filtro barato para no ir a
la base con cualquier cadena.

RESPUESTAS QUE NO CUENTAN DE MAS
--------------------------------
Un token que no existe y una clave con formato desconocido dan lo MISMO: no
encontrada. Distinguirlos convertiria el endpoint en un oraculo que confirma que
cierta capacidad existe aunque no se pueda usar. La unica respuesta distinta es
para una clave de FORMATO ANTIGUO cuando la ventana ya se cerro, y se decide sin
mirar la base: la respuesta es la misma exista esa vista o no.

LA VENTANA LEGACY SE DECIDE, Y NO DECIDIR ES CERRARLA
-----------------------------------------------------
`ENLACES_LEGACY_HASTA`, variable de entorno, cambiable en produccion sin
desplegar. Los tres valores validos son afirmaciones, no ausencias:

    abierto                     la via antigua sigue abierta
    retirado                    cerrada
    2026-12-31T23:59:59+00:00   abierta hasta ese instante (ISO 8601 CON zona)

Y lo que no es ninguno de los tres:

    (sin definir)   CERRADA. Nadie ha decidido que siga abierta.
    (invalida)      CERRADA, y ademas se registra como configuracion rota.

La primera version de esto trataba la ausencia como «abierta», y esta bien
sacarlo a la luz: una compatibilidad que se mantiene sola mientras nadie escriba
nada no se retira nunca. No se retira por decision, se retira por olvido -- y el
olvido, aqui, va en la direccion de dejar viva una capacidad de 33 bits.

La consecuencia operativa hay que decirla clara: DESPLEGAR ESTO SIN PONER LA
VARIABLE CIERRA LOS 7 ENLACES HISTORICOS DE PRODUCCION. Para conservarlos
durante la transicion hay que escribir `ENLACES_LEGACY_HASTA=abierto` --o una
fecha-- en el entorno, y eso es exactamente lo que se pretende: que alguien lo
haya decidido.

La fecha se exige CON ZONA HORARIA. Una fecha desnuda se interpreta distinto
segun donde corra el proceso, y «caduca el 31» dejaria de significar lo mismo en
Lima que en el contenedor.

`postura_de_seguridad` lleva este punto en su inventario, junto a los demas: asi
«faltan: N» sube si alguien despliega sin decidirlo, en vez de quedarse callado.

Una fecha escrita en la migracion habria sido irreversible y se habria decidido
antes de tener el censo, que es justo el dato con el que hay que decidirla.
"""

import os
import re
from datetime import datetime, timezone

from app_logging import get_logger

logger = get_logger('vistas_compartidas')

# ── Las formas de clave, medidas contra los datos reales ───────────────────
RE_TOKEN = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-'
                      r'[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
RE_LEGACY_RELOJ = re.compile(r'^[0-9]{13}$')            # 3 vistas en produccion
RE_LEGACY_URLSAFE = re.compile(r'^[A-Za-z0-9_-]{32}$')  # 4 vistas en produccion

# Resultados de la resolucion. El manejador traduce a codigo HTTP.
OK = 'ok'
NO_ENCONTRADA = 'no-encontrada'
LEGACY_RETIRADO = 'legacy-retirado'

# Vias, para el censo y para los registros.
VIA_TOKEN = 'token'
VIA_LEGACY = 'legacy'

# Cada cuanto se anota un uso de la via antigua, POR VISTA. Es una escritura en
# una ruta publica sin sesion: sin este freno, el censo seria un amplificador
# --una peticion de un anonimo, una escritura en la base--. Con el, el numero
# deja de ser «peticiones» y pasa a ser «minutos distintos en que se uso», que
# es lo que hace falta para decidir si la via sigue viva.
MINUTOS_ENTRE_ANOTACIONES = 1

# ── El limite del endpoint publico ─────────────────────────────────────────
# DEFENSA SECUNDARIA, y conviene decirlo antes de dar el numero: lo que arregla
# el problema es que la capacidad deje de ser un timestamp de 33 bits. Un limite
# no convierte un secreto adivinable en un secreto.
#
# No habia ninguna politica que reutilizar: ni esta ruta ni la hermana de
# documentos (`/api/docs/shared/<share_id>`) llevaban limite propio, asi que
# heredaban el global de 200/min por IP. Lo que hay en el proyecto para
# comparar son limites de autenticacion --20/min en el login, 8/min por cuenta--
# que son de otra naturaleza.
#
# 30 por minuto y por IP:
#   · abrir un enlace compartido son DOS peticiones (la vista y su inventario)
#     y se hacen una vez. 30 deja quince aperturas por minuto desde una misma
#     salida a internet, que cubre de sobra a una oficina entera detras de un
#     NAT recargando la pagina.
#   · contra la adivinanza, divide el barrido por 6,7. Sobre la unica ventana
#     que importa --los 3 enlaces de 13 cifras de produccion, y solo mientras la
#     via antigua siga abierta-- pasa de 1,5 dias a 10 dias con 100 IP para
#     barrer un dia conocido.
#
# Va tambien en las dos rutas del inventario compartido: se llega a ellas con la
# MISMA clave, asi que limitar solo una deja la otra de oraculo y el limite se
# convierte en decorado.
LIMITE_PUBLICO = '30 per minute'



def clase_de_clave(clave):
    """`'token'`, `'legacy'` o `None`. No toca la base."""
    if not clave or not isinstance(clave, str):
        return None
    clave = clave.strip()
    if RE_TOKEN.match(clave):
        return VIA_TOKEN
    if RE_LEGACY_RELOJ.match(clave) or RE_LEGACY_URLSAFE.match(clave):
        return VIA_LEGACY
    return None


# Los estados en que puede estar la ventana. Se nombran para que el motivo se
# pueda ensenar y probar: «cerrada» y «nadie la ha configurado» son la misma
# respuesta HTTP y dos problemas distintos.
ABIERTO = 'abierto'
RETIRADO = 'retirado'
VIGENTE = 'vigente'              # hay fecha y todavia no ha pasado
CADUCADO = 'caducado'            # hay fecha y ya paso
SIN_CONFIGURAR = 'sin-configurar'
INVALIDO = 'invalido'

_APAGADO = ('retirado', 'off', 'no', 'false', '0')
_ENCENDIDO = ('abierto', 'on', 'si', 'sí', 'true', '1')


def estado_legacy(ahora=None):
    """(abierta, estado, detalle). La decision entera, y por que.

    FALLO SEGURO: si nadie lo ha configurado, o lo ha configurado mal, la via
    antigua NO se abre. Un valor ausente no es una decision.
    """
    valor = (os.getenv('ENLACES_LEGACY_HASTA') or '').strip()

    if not valor:
        return False, SIN_CONFIGURAR, (
            'ENLACES_LEGACY_HASTA no esta puesta. La via antigua queda CERRADA: '
            'mantenerla abierta tiene que decidirlo alguien, no el silencio.')

    if valor.lower() in _APAGADO:
        return False, RETIRADO, 'retirada por configuracion'
    if valor.lower() in _ENCENDIDO:
        return True, ABIERTO, 'abierta por configuracion, sin fecha de cierre'

    try:
        limite = datetime.fromisoformat(valor.replace('Z', '+00:00'))
    except ValueError:
        return False, INVALIDO, (
            'ENLACES_LEGACY_HASTA=%r no es «abierto», ni «retirado», ni una fecha '
            'ISO 8601 con zona horaria. La via antigua queda CERRADA.' % valor)

    if limite.tzinfo is None:
        # Una fecha sin zona significa una cosa distinta en cada maquina, y
        # «caduca el 31» dejaria de querer decir lo mismo en Lima que en el
        # contenedor. Se rechaza en vez de suponer una.
        return False, INVALIDO, (
            'ENLACES_LEGACY_HASTA=%r no lleva zona horaria. Escribela: '
            '2026-12-31T23:59:59-05:00. La via antigua queda CERRADA.' % valor)

    ahora = ahora or datetime.now(timezone.utc)
    if ahora <= limite:
        return True, VIGENTE, 'abierta hasta %s' % limite.isoformat()
    return False, CADUCADO, 'la ventana vencio el %s' % limite.isoformat()


def legacy_vigente(ahora=None):
    """¿Sigue abierta la via antigua? La respuesta corta, para las rutas."""
    abierta, estado, detalle = estado_legacy(ahora)
    if estado in (SIN_CONFIGURAR, INVALIDO):
        # Se avisa cada vez, y a proposito: es configuracion rota, no una
        # preferencia, y quien lea los registros tiene que tropezarse con ello.
        logger.warning('[enlaces legacy] %s', detalle)
    return abierta


def anotar_uso_legacy(view_id, get_db_connection):
    """Suma uno al censo, como mucho una vez por minuto y por vista.

    Nunca levanta: el censo es para tomar una decision, no para servir la
    peticion. Si la base no deja escribir, el enlace tiene que abrir igual.
    """
    try:
        with get_db_connection() as conn:
            cur = conn.cursor()
            # El intervalo va como PARAMETRO, no interpolado en el texto: es un
            # numero de este modulo y no de la peticion, pero mezclar formateo
            # de Python con los marcadores de psycopg2 en la misma cadena es
            # como se cuelan los errores que parecen funcionar.
            cur.execute(
                "UPDATE saved_views "
                "   SET legacy_accesos = legacy_accesos + 1, legacy_ultimo_acceso = NOW() "
                " WHERE id = %s "
                "   AND (legacy_ultimo_acceso IS NULL "
                "        OR legacy_ultimo_acceso < NOW() - (%s || ' minutes')::interval)",
                (view_id, str(MINUTOS_ENTRE_ANOTACIONES)))
            conn.commit()
    except Exception as e:
        logger.warning('no se pudo anotar el uso legacy de %s: %s', view_id, e)


def resolver_vista_compartida(clave, leer_por_id, leer_por_token,
                              get_db_connection=None, anotar=True):
    """La UNICA forma de convertir un `?shareView=` en una vista.

    La usan los dos consumidores que existen --el estado de la vista y el
    inventario de la vista compartida--, y por eso recibe los lectores como
    parametros en vez de importarlos: asi este modulo no depende de las rutas y
    se puede probar entero sin Flask.

    @returns (fila | None, resultado, via)
    """
    clase = clase_de_clave(clave)

    if clase is None:
        return None, NO_ENCONTRADA, None

    if clase == VIA_TOKEN:
        return (leer_por_token(clave.strip()) or None), OK, VIA_TOKEN

    # ── Via antigua ────────────────────────────────────────────────────────
    # La ventana se comprueba ANTES de tocar la base: con la via cerrada, la
    # respuesta es la misma exista la vista o no, y por tanto no dice nada.
    if not legacy_vigente():
        return None, LEGACY_RETIRADO, VIA_LEGACY

    fila = leer_por_id(clave.strip())
    # LA MARCA MANDA, NO EL FORMATO. Los ids que genera el codigo de hoy tienen
    # la misma forma que los 4 enlaces antiguos de produccion; si bastara el
    # formato, cada vista nueva volveria a llevar su capacidad en la clave
    # primaria y esto no habria servido de nada.
    if fila and not fila.get('legacy_enlace'):
        return None, NO_ENCONTRADA, VIA_LEGACY
    if fila and anotar and get_db_connection is not None:
        anotar_uso_legacy(clave.strip(), get_db_connection)
    return fila, OK, VIA_LEGACY


def obra_de_la_vista(clave, leer_por_id, leer_por_token, get_db_connection):
    """La obra del enlace, o None. El SEGUNDO consumidor de la resolucion.

    El inventario de una vista compartida se sirve por una ruta propia que no
    lleva obra en la peticion: la resuelve desde el enlace. Vive aqui, y no en
    `server.py`, para que los dos consumidores compartan la funcion de verdad y
    no una copia parecida -- dos resolutores que casi coinciden acaban aceptando
    cosas distintas, y el que se olvide sera el que nadie mire.

    NO anota el censo: abrir un enlace son DOS peticiones --la vista y su
    inventario-- y contar las dos daria el doble de lo que fue. Cuenta la vista.
    """
    fila, _resultado, _via = resolver_vista_compartida(
        clave, leer_por_id, leer_por_token, get_db_connection, anotar=False)
    return ((fila or {}).get('project_id')) or None
