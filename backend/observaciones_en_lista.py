"""Las observaciones de cada plano, para la lista de Archivos (31-oct-2026).

El dueño: «en la lista de archivos, que se pueda diferenciar si tiene observación o no». Junto al nombre del plano
se pinta un aviso discreto, uno por plano: ámbar con las observaciones ABIERTAS, rojo si alguna está VENCIDA y un
check verde cuando todas las de la versión vigente se CERRARON. Las nubes sueltas no cuentan (decisión del dueño):
una nube solo dibuja; lo que pide una corrección es la observación que se crea desde ella (migración 37) o la del plano
entero, que reúne varias marcas (2-nov-2026, docs/archivos/18).

Qué se cuenta, por documento:
- abiertas: observaciones vivas (Abierto, Corregido —falta verificar—, Reabierto) de CUALQUIER versión del plano. Lo
  pendiente de la V1 sigue contando al subir la V2, hasta que alguien lo cierre.
- vencidas: de esas, las que pasaron su fecha límite.
- cerradas: verificadas en la versión vigente (o en marcas anteriores a la migración 36, que no tienen versión).
- la próxima en vencer: su fecha y su responsable, para la ayuda al pasar el ratón.

Una consulta por pregunta para toda la carpeta, no una por fila. Lo que se pregunta son ids que la lista ya filtró
por permisos, así que no se cuenta nada de un documento que la persona no ve.
"""
import flujo_de_issue as iss

ORIGEN_MARCA = 'MARCA'
ORIGEN_PLANO = 'PLANO'   # observación del plano entero (2-nov-2026, docs/archivos/18): su origen es el documento

# Las observaciones de cada plano, vengan de una marca o del plano entero, con su documento y su versión.
_OBS = """WITH obs AS (
    SELECT m.file_node_id AS nodo, m.file_version_id AS version, i.estado, i.vence_en, i.responsable_id, i.creado_en
      FROM doc_issues i
      JOIN pdf_markups m ON i.origen_tipo = %s AND i.origen_id = m.id::text
     WHERE i.tipo = %s AND m.file_node_id = ANY(%s::uuid[])
    UNION ALL
    SELECT i.origen_id::uuid, NULLIF(i.evidencia->0->>'version_id', '')::uuid, i.estado, i.vence_en, i.responsable_id,
           i.creado_en
      FROM doc_issues i
     WHERE i.origen_tipo = %s AND i.tipo = %s AND i.origen_id = ANY(%s)
)
"""


def _parametros(ids):
    return (ORIGEN_MARCA, iss.OBSERVACION, ids, ORIGEN_PLANO, iss.OBSERVACION, ids)


def resumen(cur, node_ids):
    """{node_id: {'abiertas', 'vencidas', 'cerradas', 'vence', 'responsable'}} solo de los planos con observaciones."""
    ids = [str(i) for i in node_ids if i]
    if not ids:
        return {}
    vivos = list(iss.VIVOS)
    cur.execute(_OBS + """SELECT o.nodo::text,
                          count(*) FILTER (WHERE o.estado = ANY(%s)),
                          count(*) FILTER (WHERE o.estado = ANY(%s) AND o.vence_en IS NOT NULL AND o.vence_en < now()),
                          count(*) FILTER (WHERE o.estado = %s
                                             AND (o.version IS NULL OR o.version = n.current_version_id))
                     FROM obs o
                     JOIN file_nodes n ON n.id = o.nodo
                    GROUP BY o.nodo""",
                _parametros(ids) + (vivos, vivos, iss.VERIFICADO))
    salida = {}
    for nodo, abiertas, vencidas, cerradas in cur.fetchall():
        if abiertas or cerradas:
            salida[nodo] = {'abiertas': int(abiertas), 'vencidas': int(vencidas), 'cerradas': int(cerradas),
                            'vence': None, 'responsable': None}
    con_abiertas = [n for n, r in salida.items() if r['abiertas']]
    if con_abiertas:
        cur.execute(_OBS + """SELECT DISTINCT ON (o.nodo)
                              o.nodo::text, o.vence_en, COALESCE(NULLIF(u.name, ''), u.email)
                         FROM obs o
                         LEFT JOIN users u ON u.id = o.responsable_id
                        WHERE o.estado = ANY(%s)
                        ORDER BY o.nodo, o.vence_en ASC NULLS LAST, o.creado_en ASC""",
                    _parametros(con_abiertas) + (vivos,))
        for nodo, vence, responsable in cur.fetchall():
            if nodo in salida:
                salida[nodo]['vence'] = vence.isoformat() if hasattr(vence, 'isoformat') else vence
                salida[nodo]['responsable'] = responsable
    return salida
