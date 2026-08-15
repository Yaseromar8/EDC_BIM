"""Los estados del entorno comun de datos, y la unica puerta para cambiarlos.

POR QUE EXISTE ESTE MODULO
--------------------------
La maquina de estados estaba escrita (WIP -> Compartido -> Publicado -> Archivo)
pero era INALCANZABLE: ningun documento entraba nunca en ella. Al subir un fichero
se le escribia 'ACTIVE', o 'NON_CONFORMING' si el nombre no cuadraba con la
nomenclatura, y la columna ademas tenia DEFAULT 'DRAFT'. Cuatro vocabularios
distintos en la misma columna, y la maquina solo entendia uno.

Consecuencia practica: pulsar "pasar a Compartido" en el portal devolvia
    400 "Transicion no permitida: de ACTIVE a SHARED"
porque VALID_TRANSITIONS.get('ACTIVE') era el conjunto vacio. Mientras tanto la
pantalla pintaba "WIP" sobre esos documentos, porque el frontend cae al valor por
defecto cuando no reconoce el estado. La interfaz decia una cosa y la base tenia
otra.

Ademas habia dos caminos hacia la misma columna, con reglas distintas:
  - el cambio por lote, que validaba transiciones y exigia autoridad
  - la aprobacion de una revision, que hacia UPDATE directo sin validar nada
y un tercero accidental: renombrar un fichero le escribia 'ACTIVE' encima,
degradando en silencio un documento aprobado.

Aqui esta el vocabulario unico y la unica funcion que escribe la columna.

LA CONFORMIDAD DEL NOMBRE NO ES UN ESTADO
-----------------------------------------
'NON_CONFORMING' describia otra cosa: que el nombre del fichero no sigue la
convencion. Eso es ortogonal al ciclo de vida -- un documento puede estar en
Borrador Y tener mal el nombre -- y meterlo en la misma columna convertia el area
de retencion en una trampa sin salida: se entraba y solo se salia borrando.

Por eso la conformidad se lleva a su propia marca (file_nodes.nomenclatura_ok) y
el estado queda limpio. Corregir el nombre saca el documento de la cuarentena de
forma natural, sin tocar su punto del ciclo.
"""

# ── El vocabulario. Uno solo. ────────────────────────────────────────────────

WIP = 'WIP'
SHARED = 'SHARED'
PUBLISHED = 'PUBLISHED'
ARCHIVED = 'ARCHIVED'

ESTADOS = (WIP, SHARED, PUBLISHED, ARCHIVED)
INICIAL = WIP

ETIQUETAS = {
    WIP: 'Trabajo en curso',
    SHARED: 'Compartido',
    PUBLISHED: 'Publicado',
    ARCHIVED: 'Archivado',
}

# Valores que se escribieron antes de unificar el vocabulario, y a que estado del
# ciclo corresponden. Se conservan aqui para que la migracion y el codigo vivo
# digan lo mismo, y para poder leer una base que aun no se ha migrado.
HEREDADOS = {
    'ACTIVE': WIP,           # lo que escribia la subida
    'DRAFT': WIP,            # el DEFAULT de la columna
    'NON_CONFORMING': WIP,   # el nombre no cumple; eso pasa a nomenclatura_ok
    'REVIEW': SHARED,        # del comentario original del esquema
    'APPROVED': PUBLISHED,   # idem
}

TRANSICIONES = {
    WIP:       {SHARED},
    SHARED:    {WIP, PUBLISHED},
    PUBLISHED: {SHARED, ARCHIVED},
    ARCHIVED:  {PUBLISHED},
}

# Pasar a Publicado o a Archivo es un acto de autoridad: uno dice "esto ya se
# puede usar", el otro retira algo que estaba en uso.
REQUIEREN_AUTORIDAD = {PUBLISHED, ARCHIVED}

MOTIVOS = {
    (WIP, PUBLISHED): "No se puede publicar un documento que no ha pasado por Compartido.",
    (WIP, ARCHIVED): "No se puede archivar un documento que sigue en Trabajo en curso.",
    (SHARED, ARCHIVED): "Un documento debe publicarse antes de poder archivarse.",
    (PUBLISHED, WIP): "Un documento publicado no vuelve a borrador: pasalo antes a Compartido.",
    (ARCHIVED, SHARED): "Un documento archivado solo puede volver a Publicado.",
    (ARCHIVED, WIP): "Un documento archivado no vuelve directamente a borrador.",
}


def normalizar(valor):
    """Traduce cualquier estado guardado al vocabulario unico.

    Sirve para leer filas que todavia no se han migrado sin que la interfaz
    mienta ni la maquina se quede bloqueada.
    """
    if not valor:
        return INICIAL
    v = str(valor).strip().upper()
    if v in ESTADOS:
        return v
    return HEREDADOS.get(v, INICIAL)


def transicion_permitida(actual, nuevo):
    """(permitida, motivo). El motivo se le ensena al usuario tal cual."""
    actual = normalizar(actual)
    if nuevo not in ESTADOS:
        return False, f"Estado desconocido: {nuevo}. Validos: {', '.join(ESTADOS)}."
    if nuevo == actual:
        return True, None
    if nuevo in TRANSICIONES.get(actual, set()):
        return True, None
    return False, MOTIVOS.get(
        (actual, nuevo),
        f"No se puede pasar de {ETIQUETAS.get(actual, actual)} a {ETIQUETAS.get(nuevo, nuevo)}.",
    )


class TransicionRechazada(Exception):
    """Lleva el motivo ya redactado para el usuario."""

    def __init__(self, motivo, documento=None):
        super().__init__(motivo)
        self.motivo = motivo
        self.documento = documento


def _autor(usuario):
    """Quien firma el cambio. Sale de la sesion verificada, nunca de la peticion.

    El registro de actividad tomaba el autor de data.get('user'), es decir, del
    cuerpo que manda el cliente: cualquiera con sesion podia firmar un cambio de
    estado con el nombre de otra persona. Un registro asi no prueba nada.
    """
    if not isinstance(usuario, dict):
        return None
    return usuario.get('email') or usuario.get('name') or (
        f"usuario:{usuario.get('id')}" if usuario.get('id') else None
    )


def transicionar(cursor, model_urn, ids, nuevo, usuario, motivo_del_cambio=None,
                 autorizar=None, codigo_idoneidad=None):
    """Cambia el estado de uno o varios documentos. LA UNICA PUERTA.

    Trabaja sobre el cursor que le pasan, sin abrir conexion ni hacer commit: asi
    la aprobacion de una revision y el cambio por lote comparten transaccion con
    lo suyo, y el registro de auditoria cae o se guarda CON el cambio, nunca por
    separado (no debe quedar constancia de algo que no llego a pasar).

    'autorizar' es opcional: autorizar(node_id) -> bool, y se pregunta POR CADA
    documento. El permiso del lote se comprobaba solo sobre el primer elemento de
    la lista, asi que teniendo mando en una carpeta se podian mover documentos de
    cualquier otra metiendolos en la misma peticion.

    Devuelve {'cambiados': [...], 'sin_cambio': [...]}.
    Lanza TransicionRechazada si alguno no puede: o pasan todos o no pasa ninguno.
    """
    if nuevo not in ESTADOS:
        raise TransicionRechazada(
            f"Estado desconocido: {nuevo}. Validos: {', '.join(ESTADOS)}."
        )
    # Publicar o archivar EXIGE que quien llama diga como se comprueba la
    # autoridad. Declarar REQUIEREN_AUTORIDAD y no usarlo aqui seria repetir el
    # fallo que veniamos a arreglar: en este mismo proyecto ya habia un
    # @requiere_rol('admin') que no bloqueaba nada y daba sensacion de guardia.
    # Sin forma de comprobar, no se publica.
    if nuevo in REQUIEREN_AUTORIDAD and autorizar is None:
        raise TransicionRechazada(
            f"No se puede pasar a {ETIQUETAS[nuevo]} sin comprobar la autoridad "
            f"de quien lo pide."
        )
    # Con que autorizacion se emite. Publicar sin decir para que sirve el
    # documento es justo lo que un auditor no acepta: "Publicado" a secas no
    # distingue apto para construir de solo informativo.
    from idoneidad import validar_para, siguiente_revision, canonico
    vale, motivo = validar_para(cursor, model_urn, codigo_idoneidad, nuevo)
    if not vale:
        raise TransicionRechazada(motivo)
    # Se graba el codigo TAL COMO ESTA EN EL CATALOGO, no como llego por HTTP: la
    # validacion tolera mayusculas y espacios, y si se sellara la cadena cruda un
    # '  a1  ' quedaria guardado asi, fuera de cualquier filtro por 'A1'.
    codigo_idoneidad = canonico(cursor, model_urn, codigo_idoneidad)

    ids = [str(i) for i in (ids or []) if i]
    if not ids:
        return {'cambiados': [], 'sin_cambio': [], 'emisiones': {}}

    # Solo DOCUMENTOS. Una carpeta no se emite: no tiene versiones, asi que el
    # sello no encontraba donde grabarse y el numero de revision salia siempre
    # 'C01'. La interfaz no lo ofrece, pero la API si lo aceptaba.
    cursor.execute(
        "SELECT id, name, status, nomenclatura_ok FROM file_nodes "
        "WHERE id = ANY(%s::uuid[]) AND model_urn = %s AND is_deleted = FALSE "
        "AND node_type = 'FILE'",
        (ids, model_urn),
    )
    filas = cursor.fetchall()
    encontrados = {str(f[0]) for f in filas}
    perdidos = [i for i in ids if i not in encontrados]
    if perdidos:
        # Pedir documentos de otra obra no debe cambiar nada a medias. Y hay que
        # distinguir el motivo: decirle "no está en esta obra" a quien seleccionó
        # una carpeta de SU obra manda a buscar el problema donde no está.
        cursor.execute(
            "SELECT count(*) FROM file_nodes WHERE id = ANY(%s::uuid[]) "
            "AND model_urn = %s AND node_type = 'FOLDER'", (perdidos, model_urn))
        carpetas = (cursor.fetchone() or [0])[0]
        if carpetas:
            raise TransicionRechazada(
                "Las carpetas no se emiten: el estado y la idoneidad son de cada "
                "documento. Selecciona los documentos.", documento=perdidos[0])
        raise TransicionRechazada(
            f"{len(perdidos)} documento(s) no están en esta obra.", documento=perdidos[0]
        )

    # El modo ESTRICTO de nomenclatura era configuracion muerta: se guardaba, se
    # validaba al escribirla y NADIE la leia. El modulo documentaba «aviso (se
    # marca, no se aisla) y estricto», y el estricto no aislaba nada. Una opcion
    # que dice que protege y no protege es peor que no tenerla: se enciende, se
    # da por resuelto y se deja de mirar.
    #
    # Su sitio es esta puerta y no la subida: un fichero mal nombrado se puede
    # tener en borrador -- ahi es donde se trabaja y se corrige -- pero no se
    # comparte ni se publica. Emitir un contenedor cuyo nombre no cumple el
    # patron de la obra es emitir algo que quien lo recibe no puede cotejar con
    # su compromiso del MIDP.
    estricta = False
    if nuevo in ('SHARED', 'PUBLISHED'):
        try:
            import nomenclatura
            estricta = (nomenclatura.config_de_obra(cursor, model_urn).get('modo')
                        == nomenclatura.ESTRICTO)
        except Exception as e:
            # Si no se puede saber el modo NO se endurece: cortar el paso a
            # compartido de una obra entera por un fallo de lectura seria peor
            # que el problema que resuelve.
            import logging
            logging.getLogger(__name__).warning(
                f'no se pudo leer el modo de nomenclatura de {model_urn}: {e}')

    cambiados, sin_cambio = [], []
    for node_id, nombre, guardado, nombre_ok in filas:
        if estricta and nombre_ok is False:
            raise TransicionRechazada(
                f"«{nombre}»: el nombre no cumple la nomenclatura de la obra, y "
                f"esta obra esta en modo estricto. Renombralo antes de "
                f"{'publicarlo' if nuevo == 'PUBLISHED' else 'compartirlo'}.",
                documento=str(node_id))
        actual = normalizar(guardado)
        if actual == nuevo:
            sin_cambio.append(str(node_id))
            continue
        permitida, motivo = transicion_permitida(actual, nuevo)
        if not permitida:
            raise TransicionRechazada(f"«{nombre}»: {motivo}", documento=str(node_id))
        if autorizar is not None and not autorizar(str(node_id)):
            raise TransicionRechazada(
                f"No tienes permiso suficiente sobre «{nombre}».", documento=str(node_id)
            )
        # Si otra persona lo tiene reservado para editarlo, cambiarle el estado
        # por debajo seria exactamente lo que la reserva viene a evitar.
        from bloqueo_de_edicion import comprobar_libre, DocumentoReservado
        try:
            comprobar_libre(cursor, node_id, usuario, 'cambiar el estado')
        except DocumentoReservado as reservado:
            raise TransicionRechazada(f"«{nombre}»: {reservado.motivo}",
                                      documento=str(node_id))
        cambiados.append((str(node_id), nombre, actual))

    if not cambiados:
        # Misma forma SIEMPRE. Devolver un diccionario con menos claves cuando no
        # hay nada que cambiar obliga a quien llama a defenderse de dos formas
        # distintas del mismo resultado, y ahi es donde se cuelan los fallos.
        return {'cambiados': [], 'sin_cambio': sin_cambio, 'emisiones': {}}

    cursor.execute(
        "UPDATE file_nodes SET status = %s, updated_at = CURRENT_TIMESTAMP, updated_by = %s "
        "WHERE id = ANY(%s::uuid[]) AND model_urn = %s",
        (nuevo, _autor(usuario), [c[0] for c in cambiados], model_urn),
    )

    # Compartir y publicar son EMISIONES: llevan su codigo de revision, su
    # idoneidad y su fecha, y quedan grabados en la VERSION concreta que se
    # emitio. Volver a borrador o archivar no emite nada, y no marca.
    emitidos = {}
    if nuevo in ('SHARED', 'PUBLISHED'):
        for node_id, _nombre, _anterior in cambiados:
            emitidos[node_id] = _sellar_emision(
                cursor, node_id, nuevo, codigo_idoneidad,
                siguiente_revision(cursor, node_id, nuevo), _autor(usuario))

    _auditar(cursor, model_urn, cambiados, nuevo, usuario, motivo_del_cambio, emitidos)
    return {'cambiados': [c[0] for c in cambiados], 'sin_cambio': sin_cambio,
            'emisiones': emitidos}


def asegurar_tabla_emisiones(cursor):
    """El registro de EMISIONES. Una fila por cada vez que un contenedor sale.

    POR QUE HACIA FALTA UNA TABLA
    -----------------------------
    Hasta ahora la emision se grababa haciendo UPDATE sobre la fila de la
    version: idoneidad, revision, quien y cuando, encima de lo que hubiera. Pero
    el MISMO fichero se emite varias veces -- se comparte como S3 para revision
    y semanas despues se publica como A1 -- y la segunda emision pisaba a la
    primera. No la matizaba: la borraba. Quien compartio, que dia y con que
    idoneidad dejaba de existir en el expediente.

    Y de rebote se rompia la numeracion. `siguiente_revision` cuenta los codigos
    ya usados leyendo `file_versions.codigo_revision`, que solo conserva el
    ultimo: los pisados se volvian invisibles y el numero se reutilizaba. Un
    P01 que sale dos veces con contenidos distintos deja de identificar nada, y
    en una reclamacion es exactamente el dato que se mira.

    Aqui no se actualiza nunca una fila: cada emision se añade. Es un registro,
    no un estado.
    """
    cursor.execute(Q_CREATE_EMISIONES)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_emisiones_nodo "
                   "ON file_emisiones (file_node_id, emitida_en DESC)")


Q_CREATE_EMISIONES = """
    CREATE TABLE IF NOT EXISTS file_emisiones (
        id               SERIAL PRIMARY KEY,
        file_node_id     UUID NOT NULL,
        file_version_id  UUID,
        model_urn        TEXT,
        destino          VARCHAR(16) NOT NULL,
        codigo_idoneidad VARCHAR(10),
        codigo_revision  VARCHAR(10),
        emitida_por      TEXT,
        emitida_en       TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    )
"""


def _insertar_emision(cursor, node_id, destino, codigo_idoneidad, codigo_revision, autor):
    """Una fila nueva en el registro de emisiones. Nunca actualiza ninguna."""
    cursor.execute('SAVEPOINT antes_de_emitir')
    cursor.execute(
        """INSERT INTO file_emisiones
               (file_node_id, file_version_id, model_urn, destino,
                codigo_idoneidad, codigo_revision, emitida_por)
           SELECT %s,
                  COALESCE(fn.current_version_id,
                           (SELECT id FROM file_versions WHERE file_node_id = %s
                             ORDER BY version_number DESC LIMIT 1)),
                  fn.model_urn, %s, %s, %s, %s
             FROM file_nodes fn WHERE fn.id = %s""",
        (str(node_id), str(node_id), destino, codigo_idoneidad, codigo_revision,
         autor, str(node_id)),
    )
    cursor.execute('RELEASE SAVEPOINT antes_de_emitir')


def _sellar_emision(cursor, node_id, destino, codigo_idoneidad, codigo_revision, autor):
    """Anota la emision en el registro y deja el sello en la version vigente.

    Las dos cosas, y no una: el registro es la memoria (nunca se pisa) y las
    columnas de la version y del documento son el «ahora mismo», que es lo que
    se lista y se filtra en pantalla.
    """
    # La memoria PRIMERO. Emitir sin dejar constancia de la emision es
    # exactamente el fallo que esto viene a arreglar, asi que si no se puede
    # anotar, no se emite.
    #
    # La tabla puede no existir todavia en una base que venga de antes: se crea
    # al vuelo la primera vez, si a este proceso se le permite tocar el esquema.
    # No se deja pasar en silencio -- eso reconstruiria el agujero -- pero
    # tampoco se tumba una publicacion por una tabla que sabemos crear.
    import logging
    registro = logging.getLogger(__name__)
    try:
        _insertar_emision(cursor, node_id, destino, codigo_idoneidad,
                          codigo_revision, autor)
    except Exception as e:
        from esquema_congelado import ddl_permitido
        if not ddl_permitido():
            registro.error(f'no se pudo anotar la emision de {node_id}: {e}')
            raise
        registro.warning(f'creando file_emisiones al vuelo: {e}')
        cursor.execute('ROLLBACK TO SAVEPOINT antes_de_emitir')
        asegurar_tabla_emisiones(cursor)
        _insertar_emision(cursor, node_id, destino, codigo_idoneidad,
                          codigo_revision, autor)

    cursor.execute(
        """UPDATE file_versions
              SET codigo_idoneidad = %s, codigo_revision = %s,
                  emitida_en = CURRENT_TIMESTAMP, emitida_por = %s
            WHERE id = (
                SELECT COALESCE(
                    (SELECT current_version_id FROM file_nodes WHERE id = %s),
                    (SELECT id FROM file_versions WHERE file_node_id = %s
                      ORDER BY version_number DESC LIMIT 1)
                ))""",
        (codigo_idoneidad, codigo_revision, autor, str(node_id), str(node_id)),
    )
    # Y en el documento, la de su version vigente, para poder listar y filtrar.
    cursor.execute(
        "UPDATE file_nodes SET codigo_idoneidad = %s, codigo_revision = %s WHERE id = %s",
        (codigo_idoneidad, codigo_revision, str(node_id)),
    )
    return {'idoneidad': codigo_idoneidad, 'revision': codigo_revision}


def camino_hasta(actual, destino):
    """Los pasos de la maquina para ir de un estado a otro, o None si no hay.

    Sirve para la aprobacion de una revision: revisar un borrador y aprobarlo
    como Publicado es el camino NORMAL de un ECD, y obligar al usuario a pulsar
    antes "pasar a Compartido" a mano es burocracia sin ganancia. Lo que no vale
    es saltarse el paso en la base y que el historial mienta: se recorren los
    estados de uno en uno y cada salto queda registrado.
    """
    actual = normalizar(actual)
    if destino not in ESTADOS:
        return None
    if actual == destino:
        return []
    # Anchura primero: la maquina es diminuta y asi el camino es el mas corto.
    frontera = [(actual, [])]
    vistos = {actual}
    while frontera:
        estado, pasos = frontera.pop(0)
        for siguiente in sorted(TRANSICIONES.get(estado, set())):
            if siguiente in vistos:
                continue
            camino = pasos + [siguiente]
            if siguiente == destino:
                return camino
            vistos.add(siguiente)
            frontera.append((siguiente, camino))
    return None


def transicionar_recorriendo(cursor, model_urn, ids, destino, usuario,
                             motivo_del_cambio=None, autorizar=None,
                             codigo_idoneidad=None):
    """Lleva los documentos hasta el destino pasando por los estados intermedios.

    Solo para la aprobacion de revisiones. El cambio manual por lote usa
    transicionar(), que NO recorre: si alguien pulsa "publicar" sobre un borrador
    tiene que enterarse de que falta compartirlo, no que se lo hagamos por detras.
    """
    ids = [str(i) for i in (ids or []) if i]
    if not ids:
        return {'cambiados': [], 'sin_cambio': [], 'pasos': []}

    # Solo DOCUMENTOS. Una carpeta no se emite: no tiene versiones, asi que el
    # sello no encontraba donde grabarse y el numero de revision salia siempre
    # 'C01'. La interfaz no lo ofrece, pero la API si lo aceptaba.
    cursor.execute(
        "SELECT id, name, status FROM file_nodes "
        "WHERE id = ANY(%s::uuid[]) AND model_urn = %s AND is_deleted = FALSE "
        "AND node_type = 'FILE'",
        (ids, model_urn),
    )
    filas = cursor.fetchall()
    if not filas:
        raise TransicionRechazada("Los documentos de la revisión ya no están en la obra.")

    # Se agrupa por estado de partida: normalmente todos vienen del mismo.
    por_estado = {}
    for node_id, _nombre, guardado in filas:
        por_estado.setdefault(normalizar(guardado), []).append(str(node_id))

    cambiados, pasos_dados = [], []
    for origen, grupo in por_estado.items():
        camino = camino_hasta(origen, destino)
        if camino is None:
            raise TransicionRechazada(
                f"No hay forma de llevar un documento de "
                f"{ETIQUETAS.get(origen, origen)} a {ETIQUETAS.get(destino, destino)}."
            )
        for paso in camino:
            # La idoneidad se aplica a la EMISION FINAL. Los pasos intermedios son
            # el recorrido de la maquina, no una emision aparte: colarles el
            # codigo de destino ahi fallaria (un codigo de publicacion no vale
            # para compartir) y ademas mentiria sobre lo que se autorizo.
            r = transicionar(cursor, model_urn, grupo, paso, usuario, motivo_del_cambio,
                             autorizar=autorizar,
                             codigo_idoneidad=codigo_idoneidad if paso == destino else None)
            pasos_dados.append(paso)
            cambiados.extend(r['cambiados'])
    return {'cambiados': cambiados, 'sin_cambio': [], 'pasos': pasos_dados}


def _auditar(cursor, model_urn, cambiados, nuevo, usuario, motivo_del_cambio, emitidos=None):
    """Una linea POR DOCUMENTO, con su nombre y de que estado venia.

    Antes se escribia una sola linea agregada: "12 items -> PUBLISHED". Ante la
    pregunta de un auditor -- que plano se publico, y quien lo saco de publicado --
    esa linea no responde nada.
    """
    import json as _json

    autor = _autor(usuario)
    for node_id, nombre, anterior in cambiados:
        detalle = {
            'estado_anterior': anterior,
            'estado_nuevo': nuevo,
            'anterior_etiqueta': ETIQUETAS.get(anterior, anterior),
            'nuevo_etiqueta': ETIQUETAS.get(nuevo, nuevo),
        }
        if motivo_del_cambio:
            detalle['motivo'] = motivo_del_cambio
        sello = (emitidos or {}).get(node_id)
        if sello:
            # Con que autorizacion se emitio y con que numero de revision. Es lo
            # que se le ensena a un auditor junto con la fecha y el autor.
            detalle['codigo_idoneidad'] = sello.get('idoneidad')
            detalle['codigo_revision'] = sello.get('revision')
        try:
            # El cambio de estado va ENCADENADO como cualquier otro evento.
            # Estas filas -- quien publico que plano, y cuando -- son las mas
            # probatorias del expediente, y hasta hoy eran justo las que no
            # entraban en la cadena: se insertaban a mano aqui, salteando
            # log_activity. Medido tras un recorrido ECD completo:
            # 19 filas 'cambio_de_estado', 0 selladas.
            import datetime as _dt
            cuando = _dt.datetime.now(_dt.timezone.utc)
            contenido = {
                'model_urn': model_urn, 'action': 'cambio_de_estado',
                'entity_type': 'file', 'entity_id': str(node_id),
                'entity_name': nombre, 'performed_by': autor,
                'details': detalle, 'created_at': cuando,
            }
            hash_anterior = h = None
            try:
                import auditoria_encadenada as _cadena
                hash_anterior, h = _cadena.sello_para_insercion(cursor, contenido)
            except Exception as _e:
                print(f"[estados_ecd] cambio de estado sin sello: {_e}")

            cursor.execute(
                "INSERT INTO activity_log "
                "(model_urn, action, entity_type, entity_id, entity_name, performed_by, "
                " details, created_at, hash_anterior, hash) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (model_urn, 'cambio_de_estado', 'file', str(node_id), nombre,
                 autor, _json.dumps(detalle), cuando, hash_anterior, h),
            )
        except Exception as e:  # pragma: no cover - defensivo
            # Si no se puede dejar constancia, no se hace el cambio: un ECD sin
            # rastro de quien publico que no sirve para una auditoria.
            raise TransicionRechazada(
                f"No se pudo registrar el cambio de estado y por eso no se aplica: {e}"
            )
