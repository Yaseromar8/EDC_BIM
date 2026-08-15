"""Para que sirve cada version de un documento, y como se llama esa emision.

EL HUECO QUE CIERRA
-------------------
La plataforma sabia DONDE estaba un documento (su punto del ciclo de vida) pero
nunca PARA QUE se podia usar. Un documento marcado como Publicado no distinguia
entre "apto para construir", "solo para informacion" y "para coordinacion". Y
construir con un plano que solo era informativo es, en obra, un problema caro.

Buscando 'idoneidad|suitability|revision_code' en todo el repositorio salian cero
resultados: no era que estuviera mal, es que no existia.

DOS DATOS DISTINTOS, Y LOS DOS FALTABAN
---------------------------------------
1. El CODIGO DE IDONEIDAD dice con que autorizacion se emite esta version.
2. El CODIGO DE REVISION la identifica como emision formal (P01, P02, C01...).
   No es el contador de subidas: hoy corregir una errata de maquetacion sube a V5
   igual que emitir una revision contractual nueva, y ante "ensename la revision
   P02 y cuando se emitio" no habia respuesta.

Los dos van en la VERSION, no en el documento: cada emision lleva la suya, y por
eso se puede reconstruir con que autorizacion se entrego cada cosa y cuando.

SOBRE LOS CODIGOS
-----------------
El catalogo de abajo es el juego de codigos de uso corriente en un ECD, con
descripciones NUESTRAS en castellano llano. Las definiciones normativas viven en
la norma, que es de pago: esto no las reproduce ni las sustituye. El catalogo se guarda POR OBRA porque lo que se audita es el plan de ejecucion
BIM de cada una, y no todas usan el mismo juego de codigos.

Y SE PUEDE EDITAR DE VERDAD (desde el 15-ago-2026). Durante un tiempo esto se
documento como editable sin serlo: la tabla se leia por obra y no habia NINGUNA
via para escribirla. Ahora `guardar_catalogo()` la reescribe, con dos reglas que
no son opcionales:

  · un codigo YA USADO no se borra, se desactiva. Borrarlo dejaria documentos
    sellados con una idoneidad que no significa nada;
  · a un codigo ya usado no se le cambia la familia. Eso reescribiria el
    significado de lo que ya se entrego con el.
"""
from esquema_congelado import solo_con_ddl

from app_logging import get_logger

logger = get_logger('idoneidad')

# Familias. Lo que de verdad importa aqui es en que punto del ciclo se puede usar
# cada una: los codigos de compartido NO valen para publicar y al reves.
COMPARTIDO = 'compartido'
PUBLICADO = 'publicado'

CATALOGO_POR_DEFECTO = [
    # codigo, etiqueta (nuestra), familia
    ('S0', 'Trabajo en curso — no apto para compartir', COMPARTIDO),
    ('S1', 'Para coordinación con otras disciplinas', COMPARTIDO),
    ('S2', 'Solo para información', COMPARTIDO),
    ('S3', 'Para revisión y comentarios', COMPARTIDO),
    ('S4', 'Para aprobación de la fase', COMPARTIDO),
    ('S6', 'Para aceptación del cliente', COMPARTIDO),
    ('S7', 'Para aceptación como activo (operación)', COMPARTIDO),
    ('A1', 'Autorizado para construcción', PUBLICADO),
    ('A2', 'Autorizado para construcción con observaciones menores', PUBLICADO),
    ('B1', 'Aceptado con comentarios — corregir y reemitir', PUBLICADO),
    ('B2', 'Aceptado parcialmente — no construir lo observado', PUBLICADO),
    ('CR', 'Solo como registro (as-built / expediente)', PUBLICADO),
    ('PR', 'Publicado como referencia', PUBLICADO),
]

# Prefijos de revision: preliminar mientras se comparte, contractual al publicar.
PREFIJO_POR_DESTINO = {'SHARED': 'P', 'PUBLISHED': 'C'}


@solo_con_ddl
def asegurar_tabla(cursor):
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS idoneidad_catalogo (
            model_urn  VARCHAR(255) NOT NULL,
            codigo     VARCHAR(10)  NOT NULL,
            etiqueta   TEXT         NOT NULL,
            familia    VARCHAR(20)  NOT NULL,
            activo     BOOLEAN      DEFAULT TRUE,
            orden      INTEGER      DEFAULT 0,
            PRIMARY KEY (model_urn, codigo)
        )
    """)


def catalogo_de_obra(cursor, model_urn):
    """Los codigos de esta obra. La primera vez siembra el juego por defecto.

    Distingue "esta obra no tiene catalogo todavia" de "su catalogo esta vacio a
    proposito". Antes se miraba solo si habia filas ACTIVAS: una obra que
    desactivara todos sus codigos volvia a ver los trece por defecto y podia
    publicar con un codigo que habia retirado a mano, que es lo contrario de lo
    que promete el modulo.
    """
    asegurar_tabla(cursor)
    cursor.execute(
        "SELECT codigo, etiqueta, familia, activo FROM idoneidad_catalogo "
        "WHERE model_urn = %s ORDER BY orden, codigo",
        (model_urn,),
    )
    filas = cursor.fetchall()
    if filas:
        return [{'codigo': c, 'etiqueta': e, 'familia': f}
                for c, e, f, activo in filas if activo]

    for i, (codigo, etiqueta, familia) in enumerate(CATALOGO_POR_DEFECTO):
        cursor.execute(
            "INSERT INTO idoneidad_catalogo (model_urn, codigo, etiqueta, familia, orden) "
            "VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
            (model_urn, codigo, etiqueta, familia, i),
        )
    return [{'codigo': c, 'etiqueta': e, 'familia': f}
            for c, e, f in CATALOGO_POR_DEFECTO]


def codigos_en_uso(cursor, model_urn):
    """Los codigos que ya estan escritos en el expediente de esta obra.

    Se mira en las CUATRO tablas donde se graba una idoneidad. Mirando solo una,
    un codigo podria borrarse del catalogo estando en uso en otra, y los
    documentos sellados con el se quedarian con una idoneidad que no significa
    nada: ni se puede mostrar, ni se puede saber si permitia construir.
    """
    usados = set()
    consultas = [
        ("SELECT DISTINCT codigo_idoneidad FROM file_nodes "
         "WHERE model_urn = %s AND codigo_idoneidad IS NOT NULL"),
        ("SELECT DISTINCT codigo_idoneidad FROM doc_reviews "
         "WHERE model_urn = %s AND codigo_idoneidad IS NOT NULL"),
        ("SELECT DISTINCT codigo_idoneidad FROM file_emisiones "
         "WHERE model_urn = %s AND codigo_idoneidad IS NOT NULL"),
        # file_versions no lleva obra: se llega por el nodo.
        ("SELECT DISTINCT v.codigo_idoneidad FROM file_versions v "
         "JOIN file_nodes n ON n.id = v.file_node_id "
         "WHERE n.model_urn = %s AND v.codigo_idoneidad IS NOT NULL"),
    ]
    for sql in consultas:
        cursor.execute(sql, (model_urn,))
        usados.update(f[0].strip().upper() for f in cursor.fetchall() if f[0])
    return usados


def guardar_catalogo(cursor, model_urn, entradas, autor=None):
    """Reescribe el catalogo de idoneidad de una obra. Devuelve (catalogo, avisos).

    POR QUE ESTO NO ES UN CRUD NORMAL
    ---------------------------------
    El catalogo no es una lista de opciones: es el vocabulario con el que el
    expediente dice para que sirve cada documento. Cambiarlo a la ligera
    reescribe el significado de lo ya entregado.

    Dos reglas, y las dos salen del mismo sitio:

      · un codigo YA USADO no se borra. Se puede desactivar -- deja de ofrecerse
        para emisiones nuevas -- pero la fila se queda, porque hay documentos
        sellados con el y sin la fila su idoneidad no significa nada;

      · a un codigo ya usado no se le cambia la FAMILIA. Mover un codigo de
        «publicado» a «compartido» convierte retroactivamente en no autorizado
        todo lo que se publico con el. La etiqueta si se puede corregir: aclarar
        como se lee un codigo no cambia lo que autorizo en su dia.

    Un catalogo sin ningun codigo de publicacion activo NO se rechaza -- puede
    ser una obra que todavia no publica -- pero se avisa, porque mientras siga
    asi nadie podra pasar un documento a Publicado. Es reversible editandolo otra
    vez, asi que avisar es proporcionado; bloquear seria decidir por la obra.
    """
    asegurar_tabla(cursor)
    if not isinstance(entradas, list) or not entradas:
        raise ValueError('El catálogo no puede quedarse vacío.')

    limpias, vistos = [], set()
    for i, e in enumerate(entradas):
        codigo = str((e or {}).get('codigo') or '').strip().upper()
        etiqueta = str((e or {}).get('etiqueta') or '').strip()
        familia = str((e or {}).get('familia') or '').strip().lower()
        if not codigo:
            raise ValueError('Hay una fila sin código.')
        if len(codigo) > 10:
            raise ValueError('El código «%s» pasa de 10 caracteres.' % codigo)
        if codigo in vistos:
            raise ValueError('El código «%s» está repetido.' % codigo)
        if not etiqueta:
            raise ValueError('El código «%s» no tiene descripción. Un código sin '
                             'explicación obliga a cada uno a suponer qué '
                             'significa.' % codigo)
        if familia not in (COMPARTIDO, PUBLICADO):
            raise ValueError('La familia de «%s» tiene que ser «%s» o «%s».'
                             % (codigo, COMPARTIDO, PUBLICADO))
        vistos.add(codigo)
        limpias.append({'codigo': codigo, 'etiqueta': etiqueta, 'familia': familia,
                        'activo': bool((e or {}).get('activo', True)), 'orden': i})

    en_uso = codigos_en_uso(cursor, model_urn)

    cursor.execute('SELECT codigo, familia FROM idoneidad_catalogo WHERE model_urn = %s',
                   (model_urn,))
    antes = {c: f for c, f in cursor.fetchall()}

    desaparecidos = sorted(c for c in en_uso if c in antes and c not in vistos)
    if desaparecidos:
        raise ValueError(
            'No se pueden quitar códigos que ya están usados en el expediente: %s. '
            'Desactívalos en vez de borrarlos: dejan de ofrecerse para emisiones '
            'nuevas y los documentos que los llevan siguen significando algo.'
            % ', '.join(desaparecidos))

    cambian_familia = sorted(e['codigo'] for e in limpias
                             if e['codigo'] in en_uso and e['codigo'] in antes
                             and antes[e['codigo']] != e['familia'])
    if cambian_familia:
        raise ValueError(
            'No se puede cambiar la familia de un código ya usado: %s. Movería de '
            'sitio lo que ya se entregó con él. Crea un código nuevo.'
            % ', '.join(cambian_familia))

    cursor.execute('DELETE FROM idoneidad_catalogo WHERE model_urn = %s', (model_urn,))
    for e in limpias:
        cursor.execute(
            'INSERT INTO idoneidad_catalogo (model_urn, codigo, etiqueta, familia, '
            'activo, orden) VALUES (%s, %s, %s, %s, %s, %s)',
            (model_urn, e['codigo'], e['etiqueta'], e['familia'], e['activo'],
             e['orden']))

    avisos = []
    activos = [e for e in limpias if e['activo']]
    if not any(e['familia'] == PUBLICADO for e in activos):
        avisos.append('No queda ningún código de publicación activo: mientras siga '
                      'así, no se podrá pasar ningún documento a Publicado.')
    if not any(e['familia'] == COMPARTIDO for e in activos):
        avisos.append('No queda ningún código para compartir activo: no se podrá '
                      'compartir nada para revisión.')
    apagados = {e['codigo'] for e in limpias if not e['activo']}
    inactivos_en_uso = sorted(c for c in en_uso if c in apagados)
    if inactivos_en_uso:
        avisos.append('Estos códigos siguen usados en el expediente y ya no se '
                      'ofrecen para emisiones nuevas: %s.'
                      % ', '.join(inactivos_en_uso))

    logger.info('catalogo de idoneidad de %s reescrito por %s: %d codigos',
                model_urn, autor or '?', len(limpias))
    return ([{'codigo': e['codigo'], 'etiqueta': e['etiqueta'], 'familia': e['familia']}
             for e in activos], avisos)


def canonico(cursor, model_urn, codigo):
    """El codigo tal y como esta en el catalogo, o None si no esta.

    Lo que se GRABA tiene que ser esto y no lo que llego por HTTP. Se validaba
    tolerando mayusculas y espacios pero luego se sellaba la cadena cruda: un
    '  a1  ' quedaba guardado con los espacios, cualquier filtro por 'A1' dejaba
    ese documento fuera, y con relleno suficiente el UPDATE reventaba contra el
    VARCHAR(10) y la peticion salia con un 500.
    """
    if not codigo:
        return None
    buscado = str(codigo).strip().upper()
    for entrada in catalogo_de_obra(cursor, model_urn):
        if entrada['codigo'].strip().upper() == buscado:
            return entrada['codigo'].strip()
    return None


def familia_de(cursor, model_urn, codigo):
    """A que familia pertenece el codigo en ESTA obra, o None si no existe."""
    if not codigo:
        return None
    buscado = str(codigo).strip().upper()
    for entrada in catalogo_de_obra(cursor, model_urn):
        if entrada['codigo'].strip().upper() == buscado:
            # La familia tambien se compara sin distinguir mayusculas ni espacios:
            # una fila con 'Publicado ' dejaba el codigo inservible para los dos
            # destinos y ademas lo hacia desaparecer del selector, sin ninguna
            # pista de por que.
            return str(entrada['familia'] or '').strip().lower()
    return None


def validar_para(cursor, model_urn, codigo, destino):
    """(vale, motivo). El motivo se le ensena al usuario tal cual.

    La regla que importa: un codigo de la familia de compartido no autoriza a
    publicar. Que un documento este Publicado no dice nada por si solo; lo que
    dice para que sirve es esto.
    """
    if destino not in ('SHARED', 'PUBLISHED'):
        return True, None   # volver a borrador o archivar no emite nada

    if not codigo:
        if destino == 'PUBLISHED':
            return False, ("Falta el código de idoneidad: hay que decir para qué "
                           "queda autorizado el documento antes de publicarlo.")
        return True, None   # compartir sin codigo se tolera; publicar no

    familia = familia_de(cursor, model_urn, codigo)
    if familia is None:
        return False, f"El código de idoneidad «{codigo}» no está en el catálogo de esta obra."

    esperada = PUBLICADO if destino == 'PUBLISHED' else COMPARTIDO
    if familia != esperada:
        if destino == 'PUBLISHED':
            return False, (f"«{codigo}» es un código para compartir, no autoriza a "
                           f"publicar. Para publicar hace falta un código de la "
                           f"familia de autorización (A…, B…, CR, PR).")
        return False, (f"«{codigo}» es un código de publicación; para compartir "
                       f"usa uno de la familia S…")
    return True, None


def _numero(codigo, prefijo):
    if not codigo:
        return 0
    c = str(codigo).strip().upper()
    if not c.startswith(prefijo):
        return 0
    resto = c[len(prefijo):]
    return int(resto) if resto.isdigit() else 0


def siguiente_revision(cursor, node_id, destino):
    """El codigo de revision que toca para esta emision.

    Preliminar (P01, P02...) mientras el documento se comparte; contractual
    (C01, C02...) al publicarlo. Se calcula sobre TODAS las revisiones que ha
    tenido el documento, no sobre la ultima, para que volver atras y reemitir no
    reutilice un numero ya entregado: un codigo de revision que se repite deja de
    identificar nada.
    """
    prefijo = PREFIJO_POR_DESTINO.get(destino)
    if not prefijo:
        return None

    # Se cuenta sobre el REGISTRO DE EMISIONES, no sobre la columna de la
    # version. La columna guarda solo la ultima emision de cada version: al
    # publicar un fichero que ya se habia compartido, la nueva pisaba a la vieja
    # y el codigo anterior se volvia invisible. Con eso, el siguiente calculo
    # devolvia un numero YA ENTREGADO -- P01 dos veces, con contenidos distintos.
    # Un codigo de revision que se repite deja de identificar nada, y es
    # exactamente el dato que se mira en una reclamacion.
    #
    # Se leen las dos fuentes y se toma el mayor: el registro es la buena, y las
    # columnas conservan el historial anterior a que el registro existiera. Sin
    # esa union, el primer documento emitido tras el cambio volveria a P01.
    usados = []
    cursor.execute("SELECT to_regclass('public.file_emisiones')")
    hay_registro = cursor.fetchone()
    if hay_registro and hay_registro[0]:
        cursor.execute(
            "SELECT codigo_revision FROM file_emisiones "
            "WHERE file_node_id = %s AND codigo_revision IS NOT NULL",
            (str(node_id),),
        )
        usados += [r[0] for r in cursor.fetchall()]
    cursor.execute(
        "SELECT codigo_revision FROM file_versions "
        "WHERE file_node_id = %s AND codigo_revision IS NOT NULL",
        (str(node_id),),
    )
    usados += [r[0] for r in cursor.fetchall()]
    mayor = max([_numero(c, prefijo) for c in usados] or [0])
    return f"{prefijo}{mayor + 1:02d}"
