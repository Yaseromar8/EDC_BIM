# -*- coding: utf-8 -*-
"""El plan de entrega de información (MIDP/TIDP) como dato del ECD.

QUÉ ES ESTO, Y QUÉ NO ES
------------------------
Un compromiso NO es un documento. El MIDP dice *qué se prometió entregar, quién
y cuándo*; el ECD guarda *lo que hay*. Son dos cosas distintas y hasta ahora en
esta plataforma solo existía la segunda: el plan vivía en un Excel, fuera del
sistema, y nadie podía contestar «¿vamos al día?» sin abrirlo y cotejar a mano.

Por eso el plan entra primero **solo**, sin tocar ficheros. Un entregable puede
estar comprometido durante meses antes de que exista el PDF, y ese periodo -- el
de «esto está prometido y todavía no está» -- es justamente el que hay que poder
ver. Vincular cada compromiso con su documento viene después y es otra decisión,
con su propio rastro de quién lo vinculó y cuándo.

POR QUÉ MIDP Y TIDP EN LA MISMA TABLA
-------------------------------------
El MIDP es la suma de los TIDP: mismo tipo de fila, distinto alcance. Separarlos
en dos tablas obligaría a duplicar toda la lógica de estado y vinculación para
después volver a unirlos en cada consulta. Se distinguen por la columna `tipo`,
y el TIDP lleva además el equipo responsable.

MULTI-OBRA
----------
Ni los códigos ni las columnas están cableados: salen del fichero que se importe,
igual que en cotejar_midp.py. Toda obra ISO 19650 tiene su MIDP, así que
«importa tu plan» sirve de alta para cualquier obra, no solo para Talara.
"""

import datetime

from esquema_congelado import solo_con_ddl

# Estados derivados. NO se guardan: se calculan al leer, porque dependen de la
# fecha de hoy y del estado del documento vinculado. Un estado guardado se
# queda viejo en cuanto pasa la medianoche y nadie lo recalcula.
COMPROMETIDO = 'comprometido'   # en el plan, sin cotejar, y el plazo no ha llegado
VINCULADO = 'vinculado'         # tiene documento, aún no publicado
ENTREGADO = 'entregado'         # documento publicado
VENCIDO = 'vencido'             # el PLAZO se cumplió y sigue sin cotejar

# El matiz de VENCIDO no es cosmético, y la primera versión lo tenía mal.
#
# Que un compromiso no tenga documento vinculado en el ECD NO significa que no
# se haya entregado: significa que el ECD no lo sabe. Vincular es un trabajo
# manual que puede no haberse hecho todavía -- de hecho, al importar un plan por
# primera vez no se ha hecho para NINGUNA fila. Con el texto anterior
# ("Vencido / vencidos sin entregar") la pantalla afirmaba que la obra había
# incumplido 1.108 entregas cuando lo único cierto era que nadie había cotejado
# aún. Eso es una acusación, y encima falsa, en una pantalla que se lleva a una
# reunión con el cliente.
#
# Lo único que el sistema sabe con certeza es el CALENDARIO. Por eso el estado
# se llama "plazo vencido" y no "no entregado", y por eso resumen() publica
# aparte cuántos compromisos están cotejados: sin cotejo, el porcentaje de
# entrega no mide la obra, mide nuestro propio trabajo de vinculación.
ETIQUETAS = {
    COMPROMETIDO: 'Comprometido',
    VINCULADO: 'Vinculado',
    ENTREGADO: 'Entregado',
    VENCIDO: 'Plazo vencido',
}


@solo_con_ddl
def asegurar_tablas(cursor):
    """La tabla del plan. Se llama desde el bootstrap, no en caliente."""
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS plan_entregas (
            id              SERIAL PRIMARY KEY,
            model_urn       TEXT NOT NULL,
            tipo            VARCHAR(8) NOT NULL DEFAULT 'MIDP',
            identificador   TEXT NOT NULL,
            titulo          TEXT,
            -- Las piezas del código, tal y como las nombra la Guía Nacional BIM.
            -- Se guardan por separado ademas del identificador completo porque
            -- son con lo que se agrupa y se filtra: por disciplina, por volumen.
            proyecto        TEXT,
            originador      TEXT,
            volumen         TEXT,
            nivel           TEXT,
            tipo_doc        TEXT,
            disciplina      TEXT,
            numeracion      TEXT,
            formato         TEXT,
            -- El COMO se entrega. Sin esto el plan es una lista de codigos: dice
            -- QUE hay que entregar pero no que tiene que contener, ni con que
            -- nivel de detalle, ni a que escala. El LOIN es la parte del MIDP
            -- que le dice al que produce el modelo cuando ha terminado.
            descripcion     TEXT,
            escala          TEXT,
            formato_lamina  TEXT,
            paquete_trabajo TEXT,
            predecesores    TEXT,
            lod             TEXT,   -- nivel de informacion GEOMETRICA
            loi             TEXT,   -- nivel de informacion ALFANUMERICA
            documentacion_asociada TEXT,
            tiempo_produccion      TEXT,
            -- Lo que el plan COMPROMETE. Se compara despues con lo entregado.
            idoneidad_prevista TEXT,
            revision_prevista  TEXT,
            responsable     TEXT,
            fecha_comprometida DATE,
            hito            TEXT,
            -- El vinculo al documento real. Nulo hasta que alguien lo decide.
            file_node_id    UUID,
            vinculado_en    TIMESTAMP WITH TIME ZONE,
            vinculado_por   TEXT,
            -- De donde salio esta fila, para poder rehacer la importacion.
            origen          TEXT,
            hoja            TEXT,
            importado_en    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            importado_por   TEXT,
            -- La unicidad NO es (obra, tipo, contenedor): es (obra, tipo,
            -- contenedor, ETAPA). El mismo contenedor se entrega dos veces, una
            -- por etapa RIBA, con fechas y LOIN distintos -- son dos compromisos
            -- distintos. Con la clave sin la etapa, la segunda entrega machacaba
            -- a la primera: el TIDP de PQT8 leia 622 filas y guardaba 512.
            CONSTRAINT plan_entregas_contenedor_etapa
                UNIQUE (model_urn, tipo, identificador, hito)
        )
    """)
    # Para las bases donde la tabla ya existe sin el LOIN. Anadir columnas no
    # toca las filas: el plan importado antes sigue ahi, solo que con el «como»
    # vacio hasta que se reimporte.
    for columna in ('descripcion TEXT', 'escala TEXT', 'formato_lamina TEXT',
                    'paquete_trabajo TEXT', 'predecesores TEXT', 'lod TEXT',
                    'loi TEXT', 'documentacion_asociada TEXT',
                    'tiempo_produccion TEXT'):
        cursor.execute('ALTER TABLE plan_entregas ADD COLUMN IF NOT EXISTS ' + columna)

    # Bases con la clave vieja (sin etapa): se limpia el identificador que la
    # primera version ensuciaba con « · Etapa RIBA X» para fabricar unicidad, y
    # se cambia la clave. El identificador es el nombre ISO del contenedor y
    # tiene que poder cotejarse contra el nombre del fichero: llevarle pegada la
    # etapa lo hacia imposible.
    # El ORDEN importa: limpiar los identificadores con la clave vieja todavia
    # puesta los hace chocar entre si -- dos etapas del mismo contenedor. Se
    # quita la clave, se limpia, y se pone la nueva.
    cursor.execute("ALTER TABLE plan_entregas DROP CONSTRAINT IF EXISTS "
                   "plan_entregas_model_urn_tipo_identificador_key")
    cursor.execute("""
        UPDATE plan_entregas
           SET hito = COALESCE(NULLIF(hito, ''), split_part(identificador, ' · ', 2)),
               identificador = split_part(identificador, ' · ', 1)
         WHERE identificador LIKE '%% · %%'
    """)
    cursor.execute("SELECT 1 FROM pg_constraint "
                   "WHERE conname = 'plan_entregas_contenedor_etapa'")
    if not cursor.fetchone():
        cursor.execute("ALTER TABLE plan_entregas ADD CONSTRAINT "
                       "plan_entregas_contenedor_etapa "
                       "UNIQUE (model_urn, tipo, identificador, hito)")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_plan_entregas_obra "
                   "ON plan_entregas (model_urn, tipo)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_plan_entregas_nodo "
                   "ON plan_entregas (file_node_id) WHERE file_node_id IS NOT NULL")


def _fecha(valor):
    """Las fechas de un Excel llegan como datetime, como texto o como nada."""
    if valor is None or valor == '':
        return None
    if isinstance(valor, datetime.datetime):
        return valor.date()
    if isinstance(valor, datetime.date):
        return valor
    texto = str(valor).strip()
    for formato in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%m/%d/%Y'):
        try:
            return datetime.datetime.strptime(texto, formato).date()
        except ValueError:
            continue
    return None


def importar(cursor, model_urn, entregables, tipo='MIDP', origen=None, autor=None):
    """Mete el plan en el ECD. Devuelve (nuevos, actualizados).

    Es IDEMPOTENTE por (obra, tipo, identificador): reimportar un MIDP corregido
    actualiza las filas en vez de duplicarlas. Y NO pisa el vínculo al documento:
    si alguien ya ató un compromiso a su PDF, una reimportación del plan no puede
    deshacer ese trabajo.
    """
    nuevos = actualizados = 0
    for e in entregables:
        ident = str(e.get('identificador') or '').strip()
        if not ident:
            continue
        cursor.execute("""
            INSERT INTO plan_entregas
                (model_urn, tipo, identificador, titulo, proyecto, originador, volumen,
                 nivel, tipo_doc, disciplina, numeracion, formato, idoneidad_prevista,
                 revision_prevista, responsable, fecha_comprometida, hito, origen, hoja,
                 importado_por, descripcion, escala, formato_lamina, paquete_trabajo,
                 predecesores, lod, loi, documentacion_asociada, tiempo_produccion)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT ON CONSTRAINT plan_entregas_contenedor_etapa DO UPDATE SET
                titulo = EXCLUDED.titulo,
                proyecto = EXCLUDED.proyecto,
                originador = EXCLUDED.originador,
                volumen = EXCLUDED.volumen,
                nivel = EXCLUDED.nivel,
                tipo_doc = EXCLUDED.tipo_doc,
                disciplina = EXCLUDED.disciplina,
                numeracion = EXCLUDED.numeracion,
                formato = EXCLUDED.formato,
                idoneidad_prevista = EXCLUDED.idoneidad_prevista,
                revision_prevista = EXCLUDED.revision_prevista,
                responsable = EXCLUDED.responsable,
                fecha_comprometida = EXCLUDED.fecha_comprometida,
                hito = EXCLUDED.hito,
                descripcion = EXCLUDED.descripcion,
                escala = EXCLUDED.escala,
                formato_lamina = EXCLUDED.formato_lamina,
                paquete_trabajo = EXCLUDED.paquete_trabajo,
                predecesores = EXCLUDED.predecesores,
                lod = EXCLUDED.lod,
                loi = EXCLUDED.loi,
                documentacion_asociada = EXCLUDED.documentacion_asociada,
                tiempo_produccion = EXCLUDED.tiempo_produccion,
                origen = EXCLUDED.origen,
                hoja = EXCLUDED.hoja,
                importado_en = NOW(),
                importado_por = EXCLUDED.importado_por
            RETURNING (xmax = 0) AS es_nuevo
        """, (
            model_urn, tipo, ident, e.get('titulo'),
            e.get('proyecto'), e.get('originador'), e.get('volumen'), e.get('nivel'),
            e.get('tipo'), e.get('disciplina'), e.get('numeracion'), e.get('formato'),
            e.get('estado'), e.get('revision'), e.get('responsable'),
            _fecha(e.get('fecha')), e.get('hito'), origen, e.get('hoja'), autor,
            e.get('descripcion'), e.get('escala'), e.get('formato_lamina'),
            e.get('paquete_trabajo'), e.get('predecesores'), e.get('lod'),
            e.get('loi'), e.get('documentacion'), e.get('produccion'),
        ))
        fila = cursor.fetchone()
        if fila and fila[0]:
            nuevos += 1
        else:
            actualizados += 1
    return nuevos, actualizados


def _estado_de(fecha_comprometida, file_node_id, estado_doc, hoy=None):
    """El estado de un compromiso, calculado al leer."""
    if file_node_id:
        # 'PUBLISHED' es lo unico que cuenta como entregado de verdad: un
        # documento compartido todavia esta en revision.
        return ENTREGADO if (estado_doc or '').upper() == 'PUBLISHED' else VINCULADO
    # Sin documento vinculado no se puede afirmar nada sobre la entrega: solo
    # sobre el plazo, que es lo que dice el calendario.
    hoy = hoy or datetime.date.today()
    if fecha_comprometida and fecha_comprometida < hoy:
        return VENCIDO
    return COMPROMETIDO


def listar(cursor, model_urn, tipo=None, hoy=None):
    """El plan de la obra, con el estado de cada compromiso.

    Funciona AUNQUE no exista el arbol documental. Es lo normal, no una rareza:
    el plan se carga al principio de la obra, cuando todavia no hay ni un
    documento -- y en una base donde el gestor documental no se ha usado nunca,
    file_nodes ni siquiera existe. Que el plan reventara por eso seria justo lo
    contrario de "el compromiso va antes que el fichero".
    """
    cursor.execute("SELECT to_regclass('public.file_nodes')")
    hay_documentos = bool(cursor.fetchone()[0])

    if hay_documentos:
        sql = """
            SELECT p.id, p.tipo, p.identificador, p.titulo, p.disciplina, p.volumen,
                   p.formato, p.idoneidad_prevista, p.revision_prevista, p.responsable,
                   p.fecha_comprometida, p.hito, p.file_node_id,
                   n.name, n.status, n.codigo_idoneidad, n.codigo_revision,
                   p.descripcion, p.escala, p.formato_lamina, p.lod, p.loi,
                   p.documentacion_asociada, p.predecesores, p.paquete_trabajo,
                   p.proyecto, p.originador, p.nivel, p.tipo_doc, p.numeracion
              FROM plan_entregas p
              LEFT JOIN file_nodes n ON n.id = p.file_node_id AND NOT n.is_deleted
             WHERE p.model_urn = %s
        """
    else:
        sql = """
            SELECT p.id, p.tipo, p.identificador, p.titulo, p.disciplina, p.volumen,
                   p.formato, p.idoneidad_prevista, p.revision_prevista, p.responsable,
                   p.fecha_comprometida, p.hito, p.file_node_id,
                   NULL, NULL, NULL, NULL,
                   p.descripcion, p.escala, p.formato_lamina, p.lod, p.loi,
                   p.documentacion_asociada, p.predecesores, p.paquete_trabajo,
                   p.proyecto, p.originador, p.nivel, p.tipo_doc, p.numeracion
              FROM plan_entregas p
             WHERE p.model_urn = %s
        """
    params = [model_urn]
    if tipo:
        sql += ' AND p.tipo = %s'
        params.append(tipo)
    sql += ' ORDER BY p.disciplina NULLS LAST, p.identificador'
    cursor.execute(sql, params)

    salida = []
    for (pid, t, ident, titulo, disc, vol, fmt, idon, rev, resp, fecha, hito,
         node_id, doc_nombre, doc_estado, doc_idon, doc_rev,
         descr, escala, fmt_lam, lod, loi, doc_asoc, predec, paq_trab,
         c_proy, c_orig, c_niv, c_tipo, c_num) in cursor.fetchall():
        estado = _estado_de(fecha, node_id, doc_estado, hoy)
        salida.append({
            'id': pid, 'tipo': t, 'identificador': ident, 'titulo': titulo,
            'disciplina': disc, 'volumen': vol, 'formato': fmt,
            'idoneidad_prevista': idon, 'revision_prevista': rev,
            'responsable': resp,
            'fecha_comprometida': fecha.isoformat() if fecha else None,
            'hito': hito,
            # El COMO. Va en cada fila y no solo en el resumen porque la pregunta
            # «¿que tengo que producir yo?» se hace sobre UN contenedor, no sobre
            # el plan entero.
            'descripcion': descr, 'escala': escala, 'formato_lamina': fmt_lam,
            'lod': lod, 'loi': loi, 'documentacion_asociada': doc_asoc,
            'predecesores': predec, 'paquete_trabajo': paq_trab,
            # Las piezas del codigo, para poder explicar como se nombra el fichero.
            'codigo': {'proyecto': c_proy, 'originador': c_orig, 'volumen': vol,
                       'nivel': c_niv, 'tipo': c_tipo, 'disciplina': disc,
                       'numeracion': c_num},
            'estado': estado, 'estado_etiqueta': ETIQUETAS[estado],
            'documento': ({'node_id': str(node_id), 'nombre': doc_nombre,
                           'estado': doc_estado, 'idoneidad': doc_idon,
                           'revision': doc_rev} if node_id else None),
            # Lo prometido frente a lo entregado. Que un documento exista no
            # significa que cumpla: se puede haber entregado con una idoneidad
            # menor que la comprometida, y eso hay que verlo.
            'cumple_idoneidad': (None if not node_id or not idon
                                 else (doc_idon or '').upper() == str(idon).upper()),
        })
    return salida


def resumen(cursor, model_urn, tipo=None, hoy=None):
    """Cuántos compromisos hay en cada estado. Es la cifra de la reunión."""
    filas = listar(cursor, model_urn, tipo, hoy)
    cuenta = {k: 0 for k in ETIQUETAS}
    for f in filas:
        cuenta[f['estado']] += 1
    total = len(filas)
    # Cotejados = los que tienen documento atado. Es la cifra que dice si el
    # resto de números significan algo: con 0 cotejados, "0% entregado" habla de
    # nuestro trabajo de vinculación, no de lo que la obra entregó.
    cotejados = cuenta[VINCULADO] + cuenta[ENTREGADO]
    return {
        'total': total,
        'por_estado': cuenta,
        'entregados': cuenta[ENTREGADO],
        'porcentaje_entregado': round(100.0 * cuenta[ENTREGADO] / total, 1) if total else 0.0,
        'vencidos': cuenta[VENCIDO],
        'cotejados': cotejados,
        'sin_cotejar': total - cotejados,
        'plan_sin_cotejar': cotejados == 0 and total > 0,
    }


# Familias de idoneidad de ISO 19650. La letra manda: S = compartido (todavia
# revision), A y B = autorizado (apto para el uso que declara), CR = registro de
# lo construido. La diferencia no es de matiz: con un S3 no se construye.
def familia_idoneidad(codigo):
    c = (codigo or '').strip().upper()
    if not c:
        return None
    if c.startswith('CR'):
        return 'registro'
    if c[0] == 'S':
        return 'compartido'
    if c[0] in ('A', 'B'):
        return 'autorizado'
    return 'fuera de vocabulario'


def _cuenta(filas, clave):
    """Recuento ordenado de mayor a menor, saltando los vacios."""
    c = {}
    for f in filas:
        v = f.get(clave)
        if v:
            c[v] = c.get(v, 0) + 1
    return [{'valor': k, 'n': n} for k, n in sorted(c.items(), key=lambda x: -x[1])]


def requisitos(cursor, model_urn, tipo=None, hoy=None):
    """QUE se entrega y COMO, leido del propio plan.

    POR QUE EXISTE ESTO
    -------------------
    La primera version de la pantalla era una tabla de 1.108 codigos, y el
    usuario dijo lo unico que habia que decir: «lo veo como una lista y ya, por
    ningun lado me transmite que se debe entregar o como». Tenia razon. Un MIDP
    no es un inventario de nombres de fichero: es el compromiso de entregar unos
    contenedores CON UNOS REQUISITOS -- formato, escala, nivel de informacion
    (LOIN), idoneidad y revision. Eso estaba en el Excel y en la base, pero no
    se leia por ninguna parte.

    Aqui se agrega lo que el plan EXIGE, para poder contestar de un vistazo
    «¿que tengo que producir, y con que?» sin recorrer mil filas.

    Los avisos no son decoracion. Un plan que no compromete ni un solo entregable
    como autorizado, o que deja centenares de contenedores sin responsable, tiene
    un agujero -- y es mejor verlo aqui que descubrirlo el dia de la entrega.
    """
    filas = listar(cursor, model_urn, tipo, hoy)

    # Hitos: cada etapa con su fecha. Es el «cuando» del compromiso.
    hitos = {}
    for f in filas:
        h = f.get('hito') or 'Sin etapa'
        d = hitos.setdefault(h, {'hito': h, 'total': 0, 'fecha': None,
                                 'sin_responsable': 0, 'responsables': set()})
        d['total'] += 1
        if f.get('fecha_comprometida') and (d['fecha'] is None or f['fecha_comprometida'] < d['fecha']):
            d['fecha'] = f['fecha_comprometida']
        if f.get('responsable'):
            d['responsables'].add(f['responsable'])
        else:
            d['sin_responsable'] += 1
    lista_hitos = sorted(
        ({'hito': d['hito'], 'total': d['total'], 'fecha': d['fecha'],
          'sin_responsable': d['sin_responsable'], 'responsables': len(d['responsables'])}
         for d in hitos.values()),
        key=lambda d: (d['fecha'] or '9999', d['hito']))

    # LOIN: la pareja LOD/LOI es lo que le dice al modelador cuando ha acabado.
    loin = {}
    for f in filas:
        if f.get('lod') or f.get('loi'):
            k = (f.get('lod') or '—', f.get('loi') or '—')
            loin[k] = loin.get(k, 0) + 1
    lista_loin = [{'lod': a, 'loi': b, 'n': n}
                  for (a, b), n in sorted(loin.items(), key=lambda x: -x[1])]

    idoneidad = _cuenta(filas, 'idoneidad_prevista')
    for i in idoneidad:
        i['familia'] = familia_idoneidad(i['valor'])

    total = len(filas)
    sin_responsable = sum(1 for f in filas if not f.get('responsable'))
    sin_loin = sum(1 for f in filas if not f.get('lod') and not f.get('loi'))
    autorizados = sum(i['n'] for i in idoneidad if i['familia'] == 'autorizado')
    fuera = [i for i in idoneidad if i['familia'] == 'fuera de vocabulario']

    # La nomenclatura no es burocracia: es lo unico que permite cotejar un
    # fichero entregado con el compromiso que lo pedia. Un codigo que no sigue
    # el patron no casara NUNCA con su documento, y el compromiso se quedara
    # eternamente sin cotejar sin que nadie sepa por que.
    mal_formados, discrepantes = [], []
    for f in filas:
        partes = str(f.get('identificador') or '').split('-')
        if len(partes) != 7:
            mal_formados.append(f['identificador'])
        elif f.get('disciplina') and partes[5] != f['disciplina']:
            discrepantes.append(f['identificador'])

    avisos = []
    if mal_formados:
        avisos.append({
            'nivel': 'error',
            'texto': '%d codigos no siguen la nomenclatura de 7 partes del propio '
                     'plan (por ejemplo «%s»). Un fichero entregado con ese nombre '
                     'no se podra cotejar con su compromiso.'
                     % (len(mal_formados), mal_formados[0])})
    if discrepantes:
        avisos.append({
            'nivel': 'error',
            'texto': '%d codigos declaran una disciplina distinta de la que lleva '
                     'el propio codigo (por ejemplo «%s»). Uno de los dos esta mal '
                     'y el plan no dice cual.' % (len(discrepantes), discrepantes[0])})
    if total and not autorizados:
        avisos.append({
            'nivel': 'aviso',
            'texto': 'Ningun contenedor se compromete con idoneidad autorizada '
                     '(familia A o B): el plan entero se entrega como compartido, '
                     'que es material de revision, no apto para construir.'})
    if sin_responsable:
        avisos.append({
            'nivel': 'aviso',
            'texto': '%d de %d contenedores no tienen parte responsable asignada '
                     'en el plan.' % (sin_responsable, total)})
    if sin_loin:
        avisos.append({
            'nivel': 'aviso',
            'texto': '%d contenedores no declaran nivel de informacion (LOD/LOI): '
                     'quien los produzca no tiene criterio para saber cuando ha '
                     'terminado.' % sin_loin})
    for i in fuera:
        avisos.append({
            'nivel': 'error',
            'texto': '«%s» no es un codigo de idoneidad de ISO 19650 y lo llevan '
                     '%d contenedores.' % (i['valor'], i['n'])})

    # Un ejemplo real para poder explicar como se nombra el fichero.
    ejemplo = next((f for f in filas if f.get('codigo', {}).get('proyecto')), None)

    return {
        'total': total,
        'hitos': lista_hitos,
        'formatos': _cuenta(filas, 'formato'),
        'formatos_lamina': _cuenta(filas, 'formato_lamina'),
        'escalas': _cuenta(filas, 'escala'),
        'idoneidad': idoneidad,
        'revision': _cuenta(filas, 'revision_prevista'),
        'disciplinas': _cuenta(filas, 'disciplina'),
        'responsables': _cuenta(filas, 'responsable'),
        'loin': lista_loin,
        'codigos_mal_formados': len(mal_formados),
        'codigos_discrepantes': len(discrepantes),
        'nomenclatura': ({
            'partes': ['Proyecto', 'Originador', 'Volumen', 'Nivel', 'Tipo',
                       'Disciplina', 'Numeracion'],
            'ejemplo': ejemplo['identificador'],
            'piezas': ejemplo['codigo'],
        } if ejemplo else None),
        'avisos': avisos,
    }


def vincular(cursor, plan_id, file_node_id, autor=None):
    """Ata un compromiso a su documento. Devuelve True si se ató.

    Se comprueba que el documento sea DE LA MISMA OBRA que el compromiso: atar
    un entregable de una obra a un PDF de otra convertiria el plan en una
    mentira, y ademas seria una fuga entre obras.
    """
    cursor.execute("""
        UPDATE plan_entregas p
           SET file_node_id = %s, vinculado_en = NOW(), vinculado_por = %s
          FROM file_nodes n
         WHERE p.id = %s
           AND n.id = %s
           AND n.model_urn = p.model_urn
           AND NOT n.is_deleted
        RETURNING p.id
    """, (file_node_id, autor, plan_id, file_node_id))
    return cursor.fetchone() is not None


def desvincular(cursor, plan_id, autor=None):
    """Deshace el vínculo. El compromiso sigue en el plan: no se borra."""
    cursor.execute("""
        UPDATE plan_entregas
           SET file_node_id = NULL, vinculado_en = NULL, vinculado_por = %s
         WHERE id = %s AND file_node_id IS NOT NULL
        RETURNING id
    """, (autor, plan_id))
    return cursor.fetchone() is not None


def sugerir_vinculos(cursor, model_urn, tipo=None):
    """Compromisos cuyo identificador aparece en el nombre de un documento.

    NO vincula: propone. El nombre de un fichero se parece al código pero no es
    el código, y atar automáticamente por parecido acabaría atando el plano
    equivocado — que en un expediente es peor que no atar nada.
    """
    sql = """
        SELECT p.id, p.identificador, n.id, n.name
          FROM plan_entregas p
          JOIN file_nodes n
            ON n.model_urn = p.model_urn
           AND NOT n.is_deleted
           AND n.node_type = 'FILE'
           AND position(p.identificador in n.name) > 0
         WHERE p.model_urn = %s AND p.file_node_id IS NULL
    """
    params = [model_urn]
    if tipo:
        sql += ' AND p.tipo = %s'
        params.append(tipo)
    sql += ' ORDER BY p.identificador'
    cursor.execute(sql, params)
    return [{'plan_id': a, 'identificador': b, 'node_id': str(c), 'nombre': d}
            for a, b, c, d in cursor.fetchall()]
