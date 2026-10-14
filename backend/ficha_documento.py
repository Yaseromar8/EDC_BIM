# -*- coding: utf-8 -*-
"""LO CONECTADO A UN DOCUMENTO — la pestaña «Relacionados» de la ficha (14-oct-2026).

Paso 3 de docs/ux/PROPUESTA_CONSULTA_Y_TRAZABILIDAD.md (maqueta v8): revisiones,
envíos (transmittals), RFI, compromisos del plan de entregas y marcas de revisión
CAD en las que aparece ESTE documento. Solo lo que está enlazado de verdad: cada
bloque sale de una tabla que ya existe y se busca por el ID del documento, no
por su nombre.

Lo sirve `GET /api/docs/trazabilidad` (sin ruta nueva). Cada bloque es
independiente: si una tabla no existe en esta base o su consulta falla, ese
bloque sale vacío y los demás siguen.
"""
import json

LIMITE = 30


def _existe(cur, tabla):
    cur.execute("SELECT to_regclass(%s)", ('public.' + tabla,))
    fila = cur.fetchone()
    return bool(fila and fila[0])


def _contiene(nodo):
    """Los dos formatos con los que se guardan los documentos en las listas JSONB:
    `[{"node_id": …}]` (el actual) y `[{"id": …}]` (el antiguo)."""
    return (json.dumps([{'node_id': str(nodo)}]), json.dumps([{'id': str(nodo)}]))


def _iso(v):
    return v.isoformat() if v is not None and hasattr(v, 'isoformat') else v


def _revisiones(cur, urn, nodo):
    a, b = _contiene(nodo)
    cur.execute("""SELECT id, title, status, final_status, created_at, cerrada_en
                     FROM doc_reviews
                    WHERE model_urn = %s AND (items @> %s::jsonb OR items @> %s::jsonb)
                    ORDER BY created_at DESC LIMIT %s""", (urn, a, b, LIMITE))
    return [{'id': i, 'titulo': t, 'estado': s, 'resultado': f,
             'creada_en': _iso(c), 'cerrada_en': _iso(ce)}
            for i, t, s, f, c, ce in cur.fetchall()]


def _envios(cur, urn, nodo):
    a, b = _contiene(nodo)
    cur.execute("""SELECT id, number, subject, created_by, created_at,
                          jsonb_array_length(COALESCE(acuses, '[]'::jsonb))
                     FROM transmittals
                    WHERE model_urn = %s AND (items @> %s::jsonb OR items @> %s::jsonb)
                    ORDER BY created_at DESC LIMIT %s""", (urn, a, b, LIMITE))
    return [{'id': i, 'numero': n, 'asunto': s, 'por': p, 'cuando': _iso(c), 'acuses': ac or 0}
            for i, n, s, p, c, ac in cur.fetchall()]


def _rfis(cur, urn, nodo):
    a, b = _contiene(nodo)
    cur.execute("""SELECT id, codigo, titulo, estado, fecha
                     FROM doc_rfis
                    WHERE model_urn = %s AND (adjuntos @> %s::jsonb OR adjuntos @> %s::jsonb)
                    ORDER BY fecha DESC NULLS LAST LIMIT %s""", (urn, a, b, LIMITE))
    return [{'id': str(i), 'codigo': c, 'titulo': t, 'estado': e, 'fecha': _iso(f)}
            for i, c, t, e, f in cur.fetchall()]


def _plan(cur, urn, nodo, estado_doc):
    import plan_de_entrega as _p
    cur.execute("""SELECT tipo, identificador, hito, fecha_comprometida
                     FROM plan_entregas
                    WHERE model_urn = %s AND file_node_id = %s
                    ORDER BY fecha_comprometida NULLS LAST LIMIT %s""", (urn, str(nodo), LIMITE))
    salida = []
    for tipo, ident, hito, fecha in cur.fetchall():
        e = _p._estado_de(fecha, nodo, estado_doc)
        salida.append({'plan': tipo, 'codigo': ident, 'hito': hito, 'fecha': _iso(fecha),
                       'estado': e, 'etiqueta': _p.ETIQUETAS.get(e, e)})
    return salida


def _marcas(cur, nodo):
    # Solo las PUBLICADAS: un borrador de marca es de quien lo dibuja.
    cur.execute("""SELECT count(*) FROM cad_review_marks
                    WHERE file_node_id = %s AND published AND deleted_at IS NULL""", (str(nodo),))
    fila = cur.fetchone() or (0,)
    return {'publicadas': int(fila[0] or 0)}


_BLOQUES = (
    ('revisiones', 'doc_reviews', lambda cur, urn, n, e: _revisiones(cur, urn, n)),
    ('envios', 'transmittals', lambda cur, urn, n, e: _envios(cur, urn, n)),
    ('rfis', 'doc_rfis', lambda cur, urn, n, e: _rfis(cur, urn, n)),
    ('plan', 'plan_entregas', _plan),
    ('marcas', 'cad_review_marks', lambda cur, urn, n, e: _marcas(cur, n)),
)


def relacionados(cur, urn, nodo, estado_doc=None):
    """{revisiones, envios, rfis, plan, marcas}. Cada bloque, por su cuenta.

    Cada consulta va en su SAVEPOINT: en PostgreSQL un fallo aborta la transacción
    entera, y sin esto una tabla rara dejaría sin datos al resto de la ficha.
    """
    salida = {}
    for clave, tabla, leer in _BLOQUES:
        vacio = {'publicadas': 0} if clave == 'marcas' else []
        try:
            cur.execute('SAVEPOINT relacionados')
            salida[clave] = leer(cur, urn, nodo, estado_doc) if _existe(cur, tabla) else vacio
            cur.execute('RELEASE SAVEPOINT relacionados')
        except Exception as e:
            print(f'[ficha] relacionados/{clave}: {e}')
            try:
                cur.execute('ROLLBACK TO SAVEPOINT relacionados')
            except Exception:
                pass
            salida[clave] = vacio
    return salida
