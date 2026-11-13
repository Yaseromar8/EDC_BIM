# -*- coding: utf-8 -*-
"""LO QUE UNA PERSONA YA ENTREGÓ Y ESPERA RESPUESTA (13-nov-2026).

El dueño: «al inicio, agregar un resumen de cada usuario de lo que está pendiente, vencido y entregado… para que
cada vez que ingresen sepa qué le falta». Lo pendiente y lo vencido ya los da «Mi trabajo» (`encargos.mi_trabajo`):
son las tareas abiertas de esa persona. Faltaba la otra mitad: lo que YA hizo y está esperando a otro. Sin eso,
quien entrega no sabe si su parte quedó cerrada o sigue en el aire.

Entregado es, con lo que ya se guarda (sin migración):

  · una NUBE suya (o de su empresa) en estado «entregada»: respondió o adjuntó, y falta que el encargado del plano
    la acepte o la devuelva;
  · una INCIDENCIA de la que es responsable en estado «Corregido»: dijo que ya está, y falta que otro la verifique.

En cuanto el otro actúa, sale de aquí sola: aceptada o verificada, ya no hay nada que mirar; devuelta o reabierta,
vuelve a «pendiente» por el camino de siempre.

SOLO LEE. Como «Mi trabajo», va por la membresía (`JOIN project_users`): lo de una obra de la que la persona ya no
es miembro no sale. No concede nada: abrir cualquiera vuelve a pasar por los guardias del documento.
"""
import flujo_de_issue as iss
import nubes_de_issue as nubes

TOPE = 50

_NUBES = """
SELECT n.id, i.project_id, p.name, i.id, i.codigo, n.pedido, n.markup_id, n.rondas,
       n.actualizado_en AT TIME ZONE current_setting('TimeZone'), i.evidencia
  FROM doc_issue_nubes n
  JOIN doc_issues i ON i.id = n.issue_id
  JOIN project_users pu ON pu.project_id = i.project_id AND pu.user_id = %(uid)s
  LEFT JOIN projects p ON p.id = i.project_id
 WHERE n.estado = %(entregada)s
   AND (n.destino_usuario = %(uid)s
        OR (n.destino_empresa IS NOT NULL
            AND EXISTS (SELECT 1 FROM users u WHERE u.id = %(uid)s AND u.company_id = n.destino_empresa)))
   AND i.estado <> ALL(%(cerradas)s)
   AND NOT (i.history @> '[{"event": "discarded"}]'::jsonb)
   {de_la_obra}
 ORDER BY n.actualizado_en DESC
 LIMIT %(tope)s
"""

_INCIDENCIAS = """
SELECT i.id, i.project_id, p.name, i.codigo, i.titulo,
       i.corregido_en AT TIME ZONE current_setting('TimeZone'), i.evidencia
  FROM doc_issues i
  JOIN project_users pu ON pu.project_id = i.project_id AND pu.user_id = %(uid)s
  LEFT JOIN projects p ON p.id = i.project_id
 WHERE i.estado = %(corregido)s
   AND i.responsable_id = %(uid)s
   AND NOT (i.history @> '[{"event": "discarded"}]'::jsonb)
   {de_la_obra}
 ORDER BY i.corregido_en DESC NULLS LAST
 LIMIT %(tope)s
"""


def _corto(texto, tope=120):
    texto = (texto or '').strip()
    return texto if len(texto) <= tope else texto[:tope - 1] + '…'


def solo_con_nota(rondas):
    """¿La última entrega de la nube fue solo decir qué se hizo, sin adjuntar ningún documento? Es el caso «había que
    mover un cuadro»: no se entrega nada, se da por resuelto."""
    ultima = (rondas or [])[-1] if isinstance(rondas, list) and rondas else {}
    entregas = ultima.get('entregas') if isinstance(ultima, dict) else None
    if not entregas:
        return False
    return not any(isinstance(e, dict) and e.get('tipo') == 'documento' for e in entregas)


def asunto_de_nube_entregada(codigo, pedido, rondas):
    """«Entregado en ISS-002: fotos de la junta» o, si solo se respondió, «Resuelto en ISS-002: mover el cuadro»."""
    texto = _corto(pedido)
    return '%s en %s%s' % ('Resuelto' if solo_con_nota(rondas) else 'Entregado', codigo or 'la incidencia',
                           ': %s' % texto if texto else '')


def _iso(valor):
    return valor.isoformat() if hasattr(valor, 'isoformat') else (valor or None)


def entregado_por(cur, user_id, project_id=None):
    """Lo que esta persona entregó y espera respuesta, lo más reciente primero. Cada fila tiene la forma de las de
    «Mi trabajo» (para que la pantalla la abra igual) y `espera`: a qué está esperando."""
    params = {'uid': int(user_id), 'tope': TOPE, 'entregada': nubes.ENTREGADA, 'corregido': iss.CORREGIDO,
              'cerradas': [iss.VERIFICADO, iss.ANULADO, iss.BORRADOR]}
    # `replace` y no `format`: el SQL lleva llaves propias (el JSON de `history`).
    de_la_obra = ''
    if project_id:
        de_la_obra = 'AND i.project_id = %(pid)s'
        params['pid'] = str(project_id)
    salida = []

    cur.execute(_NUBES.replace('{de_la_obra}', de_la_obra), params)
    for nid, obra, nombre, iid, codigo, pedido, marca, rondas, cuando, evidencia in cur.fetchall() or []:
        documento, version = nubes.documento_de_la_incidencia({'evidencia': evidencia})
        salida.append({
            'id': 'nube-%s' % nid, 'project_id': obra, 'project_name': nombre, 'objeto_tipo': 'NUBE',
            'objeto_id': str(nid), 'asunto': asunto_de_nube_entregada(codigo, pedido, rondas),
            'entregado_en': _iso(cuando), 'incidencia': iid, 'documento': documento, 'version': version,
            'marca': marca, 'espera': 'que lo acepten',
        })

    cur.execute(_INCIDENCIAS.replace('{de_la_obra}', de_la_obra), params)
    for iid, obra, nombre, codigo, titulo, cuando, evidencia in cur.fetchall() or []:
        documento, version = nubes.documento_de_la_incidencia({'evidencia': evidencia})
        salida.append({
            'id': 'incidencia-%s' % iid, 'project_id': obra, 'project_name': nombre, 'objeto_tipo': 'ISSUE',
            'objeto_id': str(iid), 'asunto': 'Corregido en %s%s' % (codigo or 'la incidencia',
                                                                    ': %s' % _corto(titulo) if titulo else ''),
            'entregado_en': _iso(cuando), 'incidencia': iid, 'documento': documento, 'version': version,
            'marca': None, 'espera': 'que lo verifiquen',
        })

    salida.sort(key=lambda f: f['entregado_en'] or '', reverse=True)
    return salida[:TOPE]
