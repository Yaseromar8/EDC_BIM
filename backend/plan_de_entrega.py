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
COMPROMETIDO = 'comprometido'   # en el plan, sin documento todavía
VINCULADO = 'vinculado'         # tiene documento, aún no publicado
ENTREGADO = 'entregado'         # documento publicado
VENCIDO = 'vencido'             # pasó la fecha y no hay documento

ETIQUETAS = {
    COMPROMETIDO: 'Comprometido',
    VINCULADO: 'Vinculado',
    ENTREGADO: 'Entregado',
    VENCIDO: 'Vencido',
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
            UNIQUE (model_urn, tipo, identificador)
        )
    """)
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
                 importado_por)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s)
            ON CONFLICT (model_urn, tipo, identificador) DO UPDATE SET
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
    hoy = hoy or datetime.date.today()
    if fecha_comprometida and fecha_comprometida < hoy:
        return VENCIDO
    return COMPROMETIDO


def listar(cursor, model_urn, tipo=None, hoy=None):
    """El plan de la obra, con el estado de cada compromiso."""
    sql = """
        SELECT p.id, p.tipo, p.identificador, p.titulo, p.disciplina, p.volumen,
               p.formato, p.idoneidad_prevista, p.revision_prevista, p.responsable,
               p.fecha_comprometida, p.hito, p.file_node_id,
               n.name, n.status, n.codigo_idoneidad, n.codigo_revision
          FROM plan_entregas p
          LEFT JOIN file_nodes n ON n.id = p.file_node_id AND NOT n.is_deleted
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
         node_id, doc_nombre, doc_estado, doc_idon, doc_rev) in cursor.fetchall():
        estado = _estado_de(fecha, node_id, doc_estado, hoy)
        salida.append({
            'id': pid, 'tipo': t, 'identificador': ident, 'titulo': titulo,
            'disciplina': disc, 'volumen': vol, 'formato': fmt,
            'idoneidad_prevista': idon, 'revision_prevista': rev,
            'responsable': resp,
            'fecha_comprometida': fecha.isoformat() if fecha else None,
            'hito': hito,
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
    return {
        'total': total,
        'por_estado': cuenta,
        'entregados': cuenta[ENTREGADO],
        'porcentaje_entregado': round(100.0 * cuenta[ENTREGADO] / total, 1) if total else 0.0,
        'vencidos': cuenta[VENCIDO],
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
