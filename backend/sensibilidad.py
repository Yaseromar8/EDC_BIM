"""Que informacion de esta obra es delicada, y quien puede sacarla del ECD.

EL HUECO QUE CIERRA
-------------------
La plataforma sabia en que punto del ciclo estaba un documento (estados), para que
se podia usar (idoneidad) y quien podia abrirlo (permisos por carpeta). Lo que no
sabia es si el documento es DELICADO. Y son cosas distintas: un plano puede estar
publicado, ser apto para construir y ser accesible a todo el equipo, y aun asi no
deber salir del ECD.

Buscando 'sensib|clasific|confiden' en el esquema salian dos columnas de otra cosa
(una puntuacion de confianza y una categoria de metrados). Es decir: no era que
estuviera mal, es que no existia.

LO QUE PIDE LA PARTE 5 DE LA ISO 19650, Y LO QUE HACE ESTO
----------------------------------------------------------
La parte 5 no empieza por controles, empieza por una pregunta: ¿esta obra necesita
un enfoque de seguridad, o no? Eso es el TRIAJE, y su resultado manda sobre todo lo
demas. Una obra sin nada delicado no tiene que cargar con medidas que estorban; una
obra con informacion sensible no puede tratarla como el resto.

Este modulo implementa lo minimo para poder sostener que se sigue ese enfoque:
  1. El TRIAJE de la obra queda registrado: si requiere o no enfoque de seguridad,
     por que, quien lo decidio, cuando, y cuando toca revisarlo. Sin fecha de
     revision el triaje envejece y deja de valer.
  2. Cada documento puede llevar un NIVEL de sensibilidad, que se HEREDA de su
     carpeta si no lo tiene propio. Sin herencia, clasificar 282 planos a mano no
     lo hace nadie, y una clasificacion que nadie rellena es peor que ninguna.
  3. Hay una consulta unica para preguntar "¿este documento puede salir del ECD?",
     para que las rutas que emiten enlaces no decidan cada una por su cuenta.

NO REPRODUCE LA NORMA. Las definiciones normativas viven en la norma, que es de
pago. Las etiquetas de abajo son NUESTRAS, en castellano llano, y son un punto de
partida: cada obra ajusta su catalogo a lo que diga su plan de ejecucion BIM y su
evaluacion de sensibilidad, que es lo que se audita. Por eso el catalogo se guarda
POR OBRA y es editable, igual que el de idoneidad y el de nomenclatura.
"""
from esquema_congelado import solo_con_ddl

from app_logging import get_logger

logger = get_logger('sensibilidad')

# Los niveles, de menos a mas delicado. El orden IMPORTA: se compara con >= para
# decidir si algo puede salir del ECD, asi que no se reordena a la ligera.
NIVELES_POR_DEFECTO = [
    # codigo, etiqueta (nuestra), orden, puede_salir_del_ecd
    ('N0', 'Sin restricción — puede compartirse fuera del ECD', 0, True),
    ('N1', 'Uso interno del proyecto — no sale sin autorización', 1, False),
    ('N2', 'Restringido — solo quien lo necesita para su trabajo', 2, False),
    ('N3', 'Crítico — afecta a la seguridad del activo o de las personas', 3, False),
]

# Cuando una obra no ha hecho su triaje, sus documentos no son "publicos por
# defecto": son de uso interno. Es la unica postura honesta mientras nadie haya
# mirado. Lo contrario -tratar como abierto lo que no se ha evaluado- es
# exactamente el fallo que la parte 5 quiere evitar.
NIVEL_SIN_EVALUAR = 'N1'


@solo_con_ddl
def asegurar_tablas(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sensibilidad_catalogo (
            model_urn      VARCHAR(255) NOT NULL,
            codigo         VARCHAR(10)  NOT NULL,
            etiqueta       TEXT         NOT NULL,
            orden          INTEGER      NOT NULL DEFAULT 0,
            puede_salir    BOOLEAN      NOT NULL DEFAULT FALSE,
            activo         BOOLEAN      DEFAULT TRUE,
            PRIMARY KEY (model_urn, codigo)
        )""")
    # El triaje es de la OBRA, no del documento: es la decision de si esta obra
    # necesita enfoque de seguridad. Una fila por obra.
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS triaje_seguridad (
            model_urn        VARCHAR(255) PRIMARY KEY,
            requiere_enfoque BOOLEAN      NOT NULL,
            justificacion    TEXT,
            evaluado_por     VARCHAR(255),
            evaluado_en      TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            revisar_en       DATE
        )""")
    # El nivel vive en el nodo: asi una CARPETA puede llevar el nivel y todos sus
    # hijos heredarlo, que es lo unico que hace viable clasificar cientos de
    # planos. NULL = no clasificado aqui; se resuelve subiendo.
    cursor.execute("ALTER TABLE file_nodes ADD COLUMN IF NOT EXISTS sensibilidad VARCHAR(10)")


def sembrar_catalogo(cursor, model_urn):
    """Deja el catalogo por defecto en una obra que aun no tiene el suyo."""
    asegurar_tablas(cursor)
    for codigo, etiqueta, orden, puede_salir in NIVELES_POR_DEFECTO:
        cursor.execute("""
            INSERT INTO sensibilidad_catalogo (model_urn, codigo, etiqueta, orden, puede_salir)
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (model_urn, codigo) DO NOTHING
        """, (model_urn, codigo, etiqueta, orden, puede_salir))


def catalogo_de_obra(cursor, model_urn):
    """Los niveles de esta obra. Siembra el juego por defecto si no hay ninguno."""
    asegurar_tablas(cursor)
    cursor.execute("""SELECT codigo, etiqueta, orden, puede_salir FROM sensibilidad_catalogo
                       WHERE model_urn = %s AND activo ORDER BY orden""", (model_urn,))
    filas = cursor.fetchall()
    if not filas:
        sembrar_catalogo(cursor, model_urn)
        cursor.execute("""SELECT codigo, etiqueta, orden, puede_salir FROM sensibilidad_catalogo
                           WHERE model_urn = %s AND activo ORDER BY orden""", (model_urn,))
        filas = cursor.fetchall()
    return [{'codigo': c, 'etiqueta': e, 'orden': o, 'puede_salir': p} for c, e, o, p in filas]


def triaje_de_obra(cursor, model_urn):
    """El triaje de esta obra, o None si nadie lo ha hecho todavia.

    Ese None no es un detalle: significa que la obra NO ha sido evaluada, y hay que
    poder distinguirlo de "se evaluo y salio que no hace falta". Son dos respuestas
    distintas ante una auditoria.
    """
    asegurar_tablas(cursor)
    cursor.execute("""SELECT requiere_enfoque, justificacion, evaluado_por, evaluado_en, revisar_en
                        FROM triaje_seguridad WHERE model_urn = %s""", (model_urn,))
    fila = cursor.fetchone()
    if not fila:
        return None
    requiere, just, por, en, revisar = fila
    return {'requiere_enfoque': requiere, 'justificacion': just, 'evaluado_por': por,
            'evaluado_en': en.isoformat() if en else None,
            'revisar_en': revisar.isoformat() if revisar else None,
            'caducado': _caducado(revisar)}


def _caducado(revisar_en):
    """Un triaje con fecha de revision pasada ya no sostiene nada."""
    if not revisar_en:
        return False
    from datetime import date
    return revisar_en < date.today()


def guardar_triaje(cursor, model_urn, requiere_enfoque, justificacion=None,
                   evaluado_por=None, revisar_en=None):
    """Registra (o rehace) el triaje de la obra.

    Se exige justificacion SIEMPRE, tambien cuando se decide que NO hace falta
    enfoque de seguridad: un "no hace falta" sin motivo escrito no se puede
    defender delante de nadie, y es justo la decision que mas se cuestiona.
    """
    asegurar_tablas(cursor)
    if not (justificacion or '').strip():
        raise ValueError('El triaje necesita una justificación escrita, también '
                         'cuando la conclusión es que no hacen falta medidas.')
    cursor.execute("""
        INSERT INTO triaje_seguridad (model_urn, requiere_enfoque, justificacion,
                                      evaluado_por, evaluado_en, revisar_en)
        VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP, %s)
        ON CONFLICT (model_urn) DO UPDATE
           SET requiere_enfoque = EXCLUDED.requiere_enfoque,
               justificacion    = EXCLUDED.justificacion,
               evaluado_por     = EXCLUDED.evaluado_por,
               evaluado_en      = CURRENT_TIMESTAMP,
               revisar_en       = EXCLUDED.revisar_en
    """, (model_urn, bool(requiere_enfoque), justificacion.strip(), evaluado_por, revisar_en))


def nivel_efectivo(cursor, node_id, model_urn):
    """El nivel de un nodo: el suyo, o el de la primera carpeta que lo tenga.

    Sube por parent_id hasta encontrar uno. Si nadie lo declara, devuelve
    NIVEL_SIN_EVALUAR: sin clasificar NO es sinonimo de publico.

    Una sola consulta recursiva, no un bucle de consultas: clasificar 2.800
    ficheros no puede costar 2.800 viajes a la base.
    """
    if not node_id:
        return NIVEL_SIN_EVALUAR
    cursor.execute("""
        WITH RECURSIVE arriba AS (
            SELECT id, parent_id, sensibilidad, 0 AS salto
              FROM file_nodes WHERE id = %s AND model_urn = %s
            UNION ALL
            SELECT fn.id, fn.parent_id, fn.sensibilidad, a.salto + 1
              FROM file_nodes fn
              INNER JOIN arriba a ON fn.id = a.parent_id
             WHERE fn.model_urn = %s
        )
        SELECT sensibilidad FROM arriba
         WHERE sensibilidad IS NOT NULL
         ORDER BY salto ASC LIMIT 1
    """, (str(node_id), model_urn, model_urn))
    fila = cursor.fetchone()
    return (fila[0] if fila and fila[0] else NIVEL_SIN_EVALUAR)


def nivel_declarado(cursor, node_id, model_urn):
    """(nivel, lo_declaro_alguien). La segunda mitad es la que importa.

    `nivel_efectivo` devuelve N1 tanto si alguien clasifico el documento como
    «uso interno» como si NADIE lo ha mirado nunca. Son cosas distintas y
    confundirlas cuesta caro: hoy ningun documento de la plataforma tiene nivel
    -- la columna es nueva y no hay pantalla que la escriba -- asi que TODOS
    resuelven a N1, y N1 no puede salir.

    Consecuencia medida: en cuanto una obra contesta «si» en su triaje, se le
    bloquean de golpe los enlaces Y los transmittals de sus miles de documentos,
    sin haber clasificado nada y sin sitio donde hacerlo.

    Distinguir «lo miraron y dijeron interno» de «nadie lo ha mirado» permite
    tratar cada canal como merece, en vez de parar la obra entera.
    """
    if not node_id:
        return NIVEL_SIN_EVALUAR, False
    cursor.execute("""
        WITH RECURSIVE arriba AS (
            SELECT id, parent_id, sensibilidad, 0 AS salto
              FROM file_nodes WHERE id = %s AND model_urn = %s
            UNION ALL
            SELECT fn.id, fn.parent_id, fn.sensibilidad, a.salto + 1
              FROM file_nodes fn
              INNER JOIN arriba a ON fn.id = a.parent_id
             WHERE fn.model_urn = %s
        )
        SELECT sensibilidad FROM arriba
         WHERE sensibilidad IS NOT NULL
         ORDER BY salto ASC LIMIT 1
    """, (str(node_id), model_urn, model_urn))
    fila = cursor.fetchone()
    if fila and fila[0]:
        return fila[0], True
    return NIVEL_SIN_EVALUAR, False


def puede_salir_por_canal(cursor, node_id, model_urn, canal='enlace_publico'):
    """La misma pregunta, pero sabiendo POR DONDE sale. (permitido, nivel, motivo).

    No son el mismo riesgo y tratarlos igual fue el error:

      · ENLACE PUBLICO — distribucion incontrolada. Quien tenga la URL, abre, y
        ningun permiso del ECD alcanza a un fichero que ya salio. Aqui «nadie lo
        ha clasificado» tiene que bloquear: la parte 5 existe para que no salga
        lo que nadie ha mirado.

      · TRANSMITTAL — canal formal: destinatarios con nombre, numero de serie,
        acuse de recibo y registro. Aqui bloquear por «sin clasificar» para la
        obra entera, sin pantalla para clasificar, no protege nada y para las
        entregas. Manda la clasificacion cuando EXISTE; cuando no existe, el ECD
        no tiene base para llamar delicado a un documento, y la entrega trazable
        sigue su curso.

    El propio comentario de transmittals.py ya defendia esta distincion y luego
    aplicaba la regla estricta igual. Esto la hace de verdad.
    """
    triaje = triaje_de_obra(cursor, model_urn)
    if triaje is None:
        if canal == 'transmittal':
            return True, None, ''
        return False, None, 'La obra no tiene hecho el triaje de seguridad.'
    if triaje['caducado']:
        if canal == 'transmittal':
            return True, None, ''
        return False, None, 'El triaje de seguridad de la obra está caducado; hay que revisarlo.'
    if not triaje['requiere_enfoque']:
        return True, None, ''

    nivel, declarado = nivel_declarado(cursor, node_id, model_urn)
    if canal == 'transmittal' and not declarado:
        # Nadie lo ha clasificado: no hay base para frenar una entrega trazable.
        return True, None, ''

    for n in catalogo_de_obra(cursor, model_urn):
        if n['codigo'] == nivel:
            if n['puede_salir']:
                return True, nivel, ''
            if declarado:
                return False, nivel, f"Nivel {nivel}: {n['etiqueta']}"
            return False, nivel, (
                f'Este documento no tiene nivel de sensibilidad asignado, y esta '
                f'obra declaró que maneja información delicada. Clasifícalo (o su '
                f'carpeta) antes de emitir un enlace público.')
    return False, nivel, f'El nivel «{nivel}» no está en el catálogo de esta obra.'


def puede_salir_del_ecd(cursor, node_id, model_urn):
    """El canal por defecto es el ENLACE PUBLICO, que es el mas estricto.

    Se conserva el nombre porque es el que llaman las rutas y porque el criterio
    por defecto no cambia: delega en `puede_salir_por_canal`, que es donde vive
    ahora la unica copia de la decision.
    """
    return puede_salir_por_canal(cursor, node_id, model_urn, canal='enlace_publico')

