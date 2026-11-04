# -*- coding: utf-8 -*-
"""DÓNDE VIVEN LAS NUBES DE UNA INCIDENCIA: leerlas, crearlas y tener al día lo que se debe en ellas (47, 4-nov-2026).

`nubes_de_issue.py` decide (papeles, actos, quién debe, quién ve) sin tocar la base; este módulo es lo único que lee y
escribe `doc_issue_nubes`, para que la ruta de la incidencia, la hoja del plano y la conciliación de «Mi trabajo»
trabajen con LA MISMA nube. Diseño y motivo: docs/archivos/23 y 25.

  · Una fila por nube DESDE EL ALTA de la incidencia (`crear_filas_de_la_incidencia`): no hay nubes «virtuales».
  · El número lo pone la base (`tg_issue_nubes_numero`, migración 47) y no cambia.
  · Lo que se debe en una nube (su encargo NUBE) se SINCRONIZA con `deudor()`: si ya lo debe quien lo tiene abierto, no
    se toca (ni se vuelve a avisar); si cambió, se cierra y se abre al nuevo. Lo mismo al cerrar la incidencia: con ella
    cerrada nadie debe nada y se cierran.
  · Quien llama tiene bloqueada la incidencia (`SELECT … FOR UPDATE`) mientras actúa sobre sus nubes.
  · Los correos los manda quien llama DESPUÉS del commit, con los ids que devuelve `sincronizar_pelota`.
"""

import json

import encargos as _enc
import nubes_de_issue as _nub

COLUMNAS = ('id, issue_id, markup_id, model_urn, clase, padre_id, empresa_equipo, destino_usuario, destino_empresa, '
            'pedido, vence_en, estado, ronda, rondas, verificacion, history, creado_por, creado_en, actualizado_en, '
            'numero')


def de_fila(r):
    return {
        'id': r[0], 'issue_id': r[1], 'markup_id': r[2], 'model_urn': r[3], 'clase': r[4], 'padre_id': r[5],
        'empresa_equipo': r[6], 'destino_usuario': r[7], 'destino_empresa': r[8], 'pedido': r[9],
        'vence_en': r[10].isoformat() if r[10] else None, 'estado': r[11], 'ronda': r[12] or 0,
        'rondas': r[13] or [], 'verificacion': r[14], 'history': r[15] or [], 'creado_por': r[16],
        'creado_en': r[17].isoformat() if r[17] else None,
        'actualizado_en': r[18].isoformat() if r[18] else None,
        'numero': r[19],
    }


def de_la_incidencia(cur, issue_id):
    """Las nubes de una incidencia, por su número."""
    cur.execute('SELECT %s FROM doc_issue_nubes WHERE issue_id = %%s ORDER BY numero' % COLUMNAS, (int(issue_id),))
    return [de_fila(r) for r in cur.fetchall()]


def crear_fila(cur, issue, markup_id, clase='observacion', padre_id=None, empresa_equipo=None, creado_por=None):
    """La fila de una nube (su número lo pone la base). Si la marca ya es nube de la incidencia, la que había."""
    cur.execute("""INSERT INTO doc_issue_nubes (issue_id, markup_id, model_urn, clase, padre_id, empresa_equipo,
                                                creado_por)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (issue_id, markup_id) DO NOTHING
                   RETURNING id""",
                (int(issue['id']), markup_id, issue['model_urn'], clase, padre_id, empresa_equipo, creado_por))
    f = cur.fetchone()
    if f:
        return f[0]
    cur.execute('SELECT id FROM doc_issue_nubes WHERE issue_id = %s AND markup_id = %s', (int(issue['id']), markup_id))
    f = cur.fetchone()
    return f[0] if f else None


def crear_filas_de_la_incidencia(cur, issue, creado_por=None):
    """Al dar de alta una incidencia: una fila por cada marca suya que es NUBE, en el orden de su evidencia (así se
    numeran). Las flechas, textos o recuadros la acompañan sin fila: no se asignan ni llevan estado."""
    marcas = _nub.marcas_de_la_incidencia(issue)
    if not marcas:
        return []
    cur.execute('SELECT id FROM pdf_markups WHERE id = ANY(%s) AND kind = %s', (marcas, _nub.TIPO_DE_NUBE))
    nubes = {r[0] for r in cur.fetchall()}
    return [crear_fila(cur, issue, m, creado_por=creado_por) for m in marcas if m in nubes]


def guardar(cur, n):
    """Escribe lo que cambia un acto. El número, la incidencia y la marca no cambian aquí."""
    cur.execute("""UPDATE doc_issue_nubes
                      SET destino_usuario=%s, destino_empresa=%s, pedido=%s, vence_en=%s, estado=%s, ronda=%s,
                          rondas=%s, verificacion=%s, history=%s, actualizado_en=CURRENT_TIMESTAMP
                    WHERE id=%s""",
                (n['destino_usuario'], n['destino_empresa'], n['pedido'], n['vence_en'], n['estado'], n['ronda'],
                 json.dumps(n['rondas']), json.dumps(n['verificacion']) if n['verificacion'] else None,
                 json.dumps(n['history']), n['id']))


def sincronizar_pelota(cur, issue, n, actor=None):
    """Que el encargo NUBE de esta nube lo tenga quien la debe AHORA (`deudor`), con el asunto de ahora.

    Devuelve los ids de los encargos ABIERTOS en esta llamada, para avisarlos después del commit. Un encargo abierto
    que sigue siendo correcto no se toca: reasignar la incidencia no vuelve a mandar el correo a quien ya lo tenía."""
    uid, empresa = _nub.deudor(n, issue)
    asunto = _enc.asunto_de_nube(issue.get('codigo'), n.get('pedido'), entregada=n.get('estado') == _nub.ENTREGADA)
    cur.execute("""SELECT id, destino_usuario, destino_empresa, asunto FROM encargos
                    WHERE objeto_tipo = 'NUBE' AND objeto_id = %s AND estado = 'abierto'""", (str(n['id']),))
    abiertos = cur.fetchall()
    quien = (uid, empresa) if (uid or empresa) else None
    sigue = next((a for a in abiertos if quien and (a[1], a[2]) == quien and a[3] == asunto[:400]), None)
    for a in abiertos:
        if a is not sigue:
            _enc.cerrar_uno(cur, a[0], cerrado_por=actor)
    if not quien or sigue:
        return []
    eid = _enc.abrir(cur, 'NUBE', n['id'], asunto, destino_usuario=uid, destino_empresa=empresa,
                     vence_en=_nub.plazo(n, issue), creado_por=actor)
    return [eid] if eid else []


def sincronizar_pelotas(cur, issue, actor=None):
    """Todas las nubes de la incidencia (tras cerrarla, anularla o cambiar su encargado)."""
    avisos = []
    for n in de_la_incidencia(cur, issue['id']):
        avisos += sincronizar_pelota(cur, issue, n, actor)
    return avisos


def de_las_marcas(cur, marcas):
    """{marca: (nube, issue)} de las marcas que son nube de alguna incidencia: la de la incidencia más reciente si la
    marca ya fue nube de otra cerrada. `issue` trae lo que piden `papeles()` y `visible()`. Una sola consulta."""
    if not marcas:
        return {}
    cur.execute("""SELECT DISTINCT ON (n.markup_id) %s,
                          i.id, i.project_id, i.codigo, i.estado, i.autor_id, i.verificador_id, i.responsable_id,
                          i.responsable_empresa
                     FROM doc_issue_nubes n JOIN doc_issues i ON i.id = n.issue_id
                    WHERE n.markup_id = ANY(%%s)
                    ORDER BY n.markup_id, n.id DESC""" % ', '.join('n.' + c.strip() for c in COLUMNAS.split(',')),
                (list(marcas),))
    salida = {}
    for r in cur.fetchall():
        n = de_fila(r[:20])
        salida[n['markup_id']] = (n, {'id': r[20], 'project_id': r[21], 'codigo': r[22], 'estado': r[23],
                                      'autor_id': r[24], 'verificador_id': r[25], 'responsable_id': r[26],
                                      'responsable_empresa': r[27]})
    return salida
