"""La convencion de nombres de CADA obra, y a que ficheros se le aplica.

EL PROBLEMA QUE RESUELVE
------------------------
Habia un unico patron escrito a mano en el codigo, con siete campos y correlativo
de cuatro a seis digitos, y se aplicaba a TODO lo que se subiera. Medido contra la
base real de la obra: de 2.831 ficheros lo cumplian DOS (los dos modelos de
Revit). Los otros 2.829 estaban en cuarentena.

Y al mirar que eran, la razon saltaba a la vista:

    IMG-20260420-WA0031.jpg
    WhatsApp Image 2026-07-02 at 11.08.13 AM.jpeg
    500125-SCL-OT-GEN-RFI-023.pdf

El 94,5% del ECD son FOTOS DE CAMPO llegadas por WhatsApp, que es como se
documenta una obra de verdad. A una foto de una zanja no se le puede exigir la
nomenclatura de un plano: no es un entregable, es evidencia. Y el tercero es un
documento con la convencion REAL del proyecto -- seis campos y correlativo de tres
digitos -- que el patron fijo tambien rechazaba.

Una regla que rechaza al 99,9% no es una regla: es ruido. Y peor, la cuarentena
dejaba de servir para lo unico que sirve, que es ver de un vistazo lo que hay que
corregir.

QUE CAMBIA
----------
1. El patron es DE LA OBRA y editable, porque lo que se audita es lo que diga el
   plan de ejecucion BIM del proyecto, no una constante del programa.
2. Hay tipos de fichero EXENTOS. A una foto o un video no se le aplica la
   convencion de planos: quedan sin evaluar, no "mal nombrados".
3. Hay dos modos: aviso (se marca, no se aisla) y estricto. Se arranca en aviso,
   porque encender el estricto sobre un ECD sin calibrar deja el portal vacio.
"""

import re

from app_logging import get_logger

logger = get_logger('nomenclatura')

# El patron que habia escrito a mano. Se conserva como valor de partida porque es
# la convencion del marco, pero ya no es una constante: cada obra ajusta el suyo.
PATRON_POR_DEFECTO = r"^[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[A-Z0-9]+-[0-9]{4,6}$"

# Evidencia de campo, no entregables. Juzgarlas con una regla de planos es lo que
# metio 2.676 fotos en cuarentena.
EXENTAS_POR_DEFECTO = [
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'bmp', 'tif', 'tiff',
    'mp4', 'mov', '3gp', 'avi', 'm4v', 'webm', 'ogg', 'mkv',
]

AVISO = 'aviso'
ESTRICTO = 'estricto'


def asegurar_tabla(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS nomenclatura_config (
            model_urn   VARCHAR(255) PRIMARY KEY,
            patron      TEXT NOT NULL,
            exentas     TEXT[] NOT NULL DEFAULT '{}',
            modo        VARCHAR(20) NOT NULL DEFAULT 'aviso',
            actualizado TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
    """)


def config_de_obra(cursor, model_urn):
    """La convencion de esta obra. La primera vez siembra la de partida."""
    asegurar_tabla(cursor)
    cursor.execute(
        "SELECT patron, exentas, modo FROM nomenclatura_config WHERE model_urn = %s",
        (model_urn,))
    fila = cursor.fetchone()
    if fila:
        return {'patron': fila[0], 'exentas': list(fila[1] or []), 'modo': fila[2]}

    cursor.execute(
        "INSERT INTO nomenclatura_config (model_urn, patron, exentas, modo) "
        "VALUES (%s, %s, %s, %s) ON CONFLICT (model_urn) DO NOTHING",
        (model_urn, PATRON_POR_DEFECTO, EXENTAS_POR_DEFECTO, AVISO))
    return {'patron': PATRON_POR_DEFECTO, 'exentas': list(EXENTAS_POR_DEFECTO),
            'modo': AVISO}


def guardar_config(cursor, model_urn, patron=None, exentas=None, modo=None):
    """Actualiza la convencion. Valida el patron ANTES de guardarlo.

    Un patron mal escrito no puede llegar a la base: reventaria en cada subida, y
    ademas el control se apagaria solo y en silencio, que es peor que no tenerlo.
    """
    actual = config_de_obra(cursor, model_urn)
    nuevo_patron = patron if patron is not None else actual['patron']
    try:
        re.compile(nuevo_patron)
    except re.error as e:
        raise ValueError(f"El patrón no es válido: {e}")
    nuevo_modo = (modo or actual['modo']).lower()
    if nuevo_modo not in (AVISO, ESTRICTO):
        raise ValueError(f"Modo desconocido: {modo}. Válidos: {AVISO}, {ESTRICTO}.")
    nuevas_exentas = [str(x).lower().lstrip('.') for x in
                      (exentas if exentas is not None else actual['exentas'])]

    cursor.execute(
        "INSERT INTO nomenclatura_config (model_urn, patron, exentas, modo, actualizado) "
        "VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP) "
        "ON CONFLICT (model_urn) DO UPDATE SET patron = EXCLUDED.patron, "
        "exentas = EXCLUDED.exentas, modo = EXCLUDED.modo, actualizado = CURRENT_TIMESTAMP",
        (model_urn, nuevo_patron, nuevas_exentas, nuevo_modo))
    return {'patron': nuevo_patron, 'exentas': nuevas_exentas, 'modo': nuevo_modo}


def _extension(nombre):
    return nombre.rsplit('.', 1)[1].lower() if '.' in nombre else ''


def evaluar(config, nombre):
    """True si cumple, False si no, None si a ese fichero NO se le aplica.

    Ese None es la diferencia que faltaba: una foto de campo no esta "mal
    nombrada", es que la convencion de planos no le corresponde. Guardar None en
    vez de False la deja fuera de la cuarentena sin mentir sobre ella.
    """
    if not nombre:
        return None
    if _extension(nombre) in {e.lower().lstrip('.') for e in (config.get('exentas') or [])}:
        return None
    base = nombre.rsplit('.', 1)[0] if '.' in nombre else nombre
    try:
        return bool(re.match(config.get('patron') or PATRON_POR_DEFECTO, base.upper()))
    except re.error as e:
        # Un control que se apaga solo y en silencio no es un control. Se avisa y
        # se deja sin evaluar, que es lo honesto: no sabemos si cumple.
        logger.error(f"patrón de nomenclatura inválido en la obra: {e}")
        return None


def evaluar_para(cursor, model_urn, nombre):
    """Atajo: lee la convencion de la obra y evalua un nombre."""
    return evaluar(config_de_obra(cursor, model_urn), nombre)
