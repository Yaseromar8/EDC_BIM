"""Las observaciones de cada plano, para la lista de Archivos (31-oct-2026).

El dueño: «en la lista de archivos, que se pueda diferenciar si tiene observación o no». Junto al nombre del plano
se pinta un aviso discreto, uno por plano: ámbar con las observaciones ABIERTAS, rojo si alguna está VENCIDA y un
check verde cuando todas las de la versión vigente se CERRARON. Las nubes sueltas no cuentan (decisión del dueño):
una nube solo dibuja; lo que pide una corrección es la observación que se crea desde ella (migración 37).

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


def resumen(cur, node_ids):
    """{node_id: {'abiertas', 'vencidas', 'cerradas', 'vence', 'responsable'}} solo de los planos con observaciones."""
    ids = [str(i) for i in node_ids if i]
    if not ids:
        return {}
    vivos = list(iss.VIVOS)
    cur.execute("""SELECT m.file_node_id::text,
                          count(*) FILTER (WHERE i.estado = ANY(%s)),
                          count(*) FILTER (WHERE i.estado = ANY(%s) AND i.vence_en IS NOT NULL AND i.vence_en < now()),
                          count(*) FILTER (WHERE i.estado = %s
                                             AND (m.file_version_id IS NULL OR m.file_version_id = n.current_version_id))
                     FROM doc_issues i
                     JOIN pdf_markups m ON i.origen_tipo = %s AND i.origen_id = m.id::text
                     JOIN file_nodes n ON n.id = m.file_node_id
                    WHERE i.tipo = %s AND m.file_node_id = ANY(%s::uuid[])
                    GROUP BY m.file_node_id""",
                (vivos, vivos, iss.VERIFICADO, ORIGEN_MARCA, iss.OBSERVACION, ids))
    salida = {}
    for nodo, abiertas, vencidas, cerradas in cur.fetchall():
        if abiertas or cerradas:
            salida[nodo] = {'abiertas': int(abiertas), 'vencidas': int(vencidas), 'cerradas': int(cerradas),
                            'vence': None, 'responsable': None}
    con_abiertas = [n for n, r in salida.items() if r['abiertas']]
    if con_abiertas:
        cur.execute("""SELECT DISTINCT ON (m.file_node_id)
                              m.file_node_id::text, i.vence_en, COALESCE(NULLIF(u.name, ''), u.email)
                         FROM doc_issues i
                         JOIN pdf_markups m ON i.origen_tipo = %s AND i.origen_id = m.id::text
                         LEFT JOIN users u ON u.id = i.responsable_id
                        WHERE i.tipo = %s AND i.estado = ANY(%s) AND m.file_node_id = ANY(%s::uuid[])
                        ORDER BY m.file_node_id, i.vence_en ASC NULLS LAST, i.creado_en ASC""",
                    (ORIGEN_MARCA, iss.OBSERVACION, vivos, con_abiertas))
        for nodo, vence, responsable in cur.fetchall():
            if nodo in salida:
                salida[nodo]['vence'] = vence.isoformat() if hasattr(vence, 'isoformat') else vence
                salida[nodo]['responsable'] = responsable
    return salida
