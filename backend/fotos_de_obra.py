# -*- coding: utf-8 -*-
"""NG-02 · LA FOTO DE CAMPO — la semántica, separada de las rutas.

UNA FOTO ES EVIDENCIA CITABLE (doc 94): alguien, en un momento DECLARADO, vio
algo en un sitio. Para valer como evidencia responde tres preguntas: de qué
obra es, dónde se tomó (progresiva / elemento / lámina — no lat-long: el GPS
se limpia del fichero por privacidad ANTES de subir, regla ya vigente), y a
qué acto acompaña.

LA REGLA QUE NO SE NEGOCIA: la foto de un acto y la foto de galería son EL
MISMO OBJETO. Adjuntar es VINCULAR, no copiar — el vínculo con un issue o un
punto de acta es el nombre del objeto en el almacén (`objeto`), que es la
misma llave de idempotencia del GAP 07.

SENSIBILIDAD, NO «PRIVADO» (decisión 2 del doc 94): un álbum jamás concede
acceso que la obra no dio. Quién ve qué sale de la obra + el nivel ISO
19650-5 que ya gobierna los documentos:

    N0 · N1   cualquier miembro de la obra
    N2 · N3   su autor y los administradores de la obra

MARCAS, NUNCA SOBRE EL BINARIO: la anotación es una capa vectorial aparte.
El original es el testigo y no se toca. Una marca NACE PRIVADA (la ve solo su
autor) y su autor decide publicarla — el mismo criterio personal→publicado de
los markups de plano (GAP 02).
"""
import uuid


# ── SENSIBILIDAD ───────────────────────────────────────────────────────────
# El catálogo es el de `sensibilidad.py` (N0..N3). Aquí solo la regla de
# visibilidad de FOTOS, que es más estricta que la de exportación: restringe
# también DENTRO de la obra.
NIVELES = ('N0', 'N1', 'N2', 'N3')
NIVEL_POR_DEFECTO = 'N1'          # sin clasificar NO es sinónimo de público
RESTRINGIDOS = ('N2', 'N3')


def puede_ver(usuario, foto, es_admin_de_obra=False):
    """N0/N1: cualquier miembro (el perímetro de obra ya se comprobó antes).
    N2/N3: su autor, o un administrador de la obra.

    El admin ve porque administra la obra — no porque el álbum se lo dé: los
    álbumes no conceden nada.
    """
    nivel = (foto or {}).get('sensibilidad') or NIVEL_POR_DEFECTO
    if nivel not in RESTRINGIDOS:
        return True
    uid = (usuario or {}).get('id')
    return bool(uid) and (uid == (foto or {}).get('autor_id') or es_admin_de_obra)


def nivel_valido(nivel):
    return nivel in NIVELES


# ── MARCAS ─────────────────────────────────────────────────────────────────
FIGURAS = ('flecha', 'circulo', 'rectangulo', 'texto', 'trazo')


def marca_nueva(usuario, figuras, nota=None):
    """Una marca recién hecha: PRIVADA, de su autor, con figuras validadas.

    Las coordenadas son RELATIVAS (0..1): en píxeles absolutos la marca se
    descoloca en cuanto la foto se muestre a otro tamaño — la misma lección de
    los anclajes de plano.
    """
    limpias, malas = [], []
    for f in (figuras or []):
        f = f or {}
        if f.get('tipo') not in FIGURAS:
            malas.append(str(f.get('tipo')))
            continue
        pts = f.get('puntos') or []
        if not pts or any(not (0 <= float(p.get('x', -1)) <= 1
                               and 0 <= float(p.get('y', -1)) <= 1) for p in pts):
            malas.append('%s sin puntos 0..1' % f['tipo'])
            continue
        limpias.append({'tipo': f['tipo'],
                        'puntos': [{'x': float(p['x']), 'y': float(p['y'])} for p in pts],
                        'texto': (f.get('texto') or '').strip() or None})
    if malas or not limpias:
        return None, malas or ['sin figuras']
    return {
        'id': uuid.uuid4().hex[:12],
        'por_id': (usuario or {}).get('id'),
        'por': (usuario or {}).get('email') or (usuario or {}).get('name') or 'desconocido',
        'nota': (nota or '').strip() or None,
        'publicada': False,
        'figuras': limpias,
    }, []


def marcas_visibles(usuario, foto):
    """Las publicadas, más las privadas DEL QUE MIRA. Las privadas ajenas no
    existen para nadie más — ni para el admin: una marca privada es un borrador
    personal, no un registro de obra."""
    uid = (usuario or {}).get('id')
    return [m for m in ((foto or {}).get('marcas') or [])
            if m.get('publicada') or m.get('por_id') == uid]


def puede_publicar_marca(usuario, marca):
    """La publica SU AUTOR. Publicar la marca de otro sería firmar por él."""
    uid = (usuario or {}).get('id')
    return bool(uid) and uid == (marca or {}).get('por_id')


# ── EL OBJETO DEL ALMACÉN ──────────────────────────────────────────────────

def nombre_de_objeto(project_id):
    """El MISMO esquema de nombres del GAP 07 (`evidencia/<obra>/<uuid>`), a
    propósito: una foto nacida en línea y una nacida en la cola viven en el
    mismo sitio con la misma reconciliación. Dos prefijos serían dos verdades
    sobre dónde está la evidencia."""
    return 'evidencia/%s/%s' % (project_id, uuid.uuid4())


def objeto_es_de_la_obra(objeto, project_id):
    """Una foto solo puede registrar objetos DEL PREFIJO DE SU OBRA. Sin esto,
    conocer el nombre de un blob ajeno bastaría para colgarlo en la galería
    propia — un cruce de obras por el almacén."""
    return bool(objeto) and objeto.startswith('evidencia/%s/' % project_id)
