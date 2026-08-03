"""
civil_ghost.py — Holograma de movimiento de tierras (corte / relleno).

Genera mallas 3D lofteando las secciones transversales persistidas
(civil_sections, schema v2) sobre el eje real (civil_alignments). El modelo
BIM no tiene la forma de la excavación; este módulo la reconstruye desde la
MISMA fuente que valida el ingeniero (las secciones de Civil 3D), así el
holograma y el cuadro de volúmenes nunca se contradicen.

Contrato de salida: la malla va en METROS ABSOLUTOS (coordenadas del JSON de
Civil). El visor la convierte con la misma transformación probada del eje
(LOB4DExtension.civilToViewerPoint). Regla del proyecto: la matemática vive
aquí; el visor solo dibuja.

Geometría:
  - Cada estación aporta un lazo cerrado por material (desmonte/terraplén).
  - El lazo (offset, cota) se lleva al mundo: P(pk) + normal(pk)·offset,
    Z = cota (las cotas de v2 son absolutas).
  - Lazos consecutivos se remuestrean a N puntos equiespaciados por longitud
    de arco (arranque en el vértice de mayor offset, sentido antihorario) y
    se cosen como cinta de triángulos; tapas en los extremos de cada tramo.
  - Un material puede dibujarse como VARIAS regiones disjuntas por estación
    (margen izquierda, margen derecha, franja sobre el box). Cada región se
    encadena con la más cercana de la estación siguiente (deriva de centroide
    ≤ TRACK_JUMP) y cada cadena se loftea por su lado — nada salta de margen.
  - Volumen de control por prismoide (media de áreas × Δpk) con el área del
    CUADRO de Civil por estación (neta, suma de todas las regiones): debe
    casar con el cuadro del SectionViewer, que usa la misma fórmula.
"""
import math
import re

from flask import Blueprint, request, jsonify

civil_ghost_bp = Blueprint('civil_ghost_bp', __name__)

# Materiales de Civil 3D en español o inglés (materialName o nombre de la
# Material List). Mismo criterio laxo que el cuadro de volúmenes del visor.
KIND_PATTERNS = {
    'corte': re.compile(r'desmonte|corte|excav|cut', re.I),
    'relleno': re.compile(r'terrapl|relleno|fill', re.I),
}

RING_N = 64          # puntos por anillo tras remuestrear (correspondencia 1:1)
HRING_N = 32         # puntos por anillo de HUECO (islas: el túnel del box)
MAX_EXTRAPOLATION = 50.0  # m fuera del dominio del eje antes de descartar la estación
# Deriva máxima del centroide de una región entre estaciones consecutivas para
# considerarla LA MISMA región (dato real PQT8: deriva dentro de un margen
# ≤1.6 m/estación; el salto entre márgenes del canal es ≥5.5 m). Más allá, la
# pista se corta y se tapa: NUNCA coser regiones de márgenes distintos.
TRACK_JUMP = 2.0
# Área mínima de una región/hueco para dibujarse. Los hatch reales traen lazos
# residuales (las paredes del box: líneas de ~0.004 m² y ancho 0) que NO son
# dibujo del cadista sino ruido de la extracción — encadenarlos torcía el loft
# (paredes barriendo de una línea a una franja). 0.05 m² = nada constructivo.
MIN_REGION_M2 = 0.05
# Dos regiones solo se encadenan si sus áreas son comparables (≥15%): una
# franja de 2.5 m² nunca es continuación de un residuo de 0.01 m².
TRACK_AREA_RATIO = 0.15


# ── Geometría pura ──────────────────────────────────────────────────────────

def _signed_area(pts):
    s = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def _split_loops(points, eps=0.05):
    """Un hatch de Civil puede traer VARIOS lazos concatenados (contorno
    exterior + ISLAS/huecos, p. ej. el relleno alrededor del box): un lazo
    cierra cuando un punto vuelve cerca del punto inicial. Misma convención
    que splitLoops del SectionViewer (eps 0.05 m)."""
    pts = []
    for p in points or []:
        try:
            x, y = float(p[0]), float(p[1])
        except (TypeError, ValueError, IndexError):
            continue
        if math.isfinite(x) and math.isfinite(y):
            if pts and abs(x - pts[-1][0]) < 1e-9 and abs(y - pts[-1][1]) < 1e-9:
                continue
            pts.append((x, y))
    loops = []
    start = 0
    i = start + 2
    while i < len(pts):
        if math.hypot(pts[i][0] - pts[start][0], pts[i][1] - pts[start][1]) < eps:
            loops.append(pts[start:i + 1])
            start = i + 1
            i = start + 2
        else:
            i += 1
    if start < len(pts) - 1:
        loops.append(pts[start:])
    out = []
    for l in loops:
        c = _clean_loop(l)
        if len(c) >= 3:
            out.append(c)
    return out


def _point_in_loop(pt, loop):
    """Par-impar clásico (ray casting)."""
    x, y = pt
    inside = False
    n = len(loop)
    for i in range(n):
        x1, y1 = loop[i]
        x2, y2 = loop[(i + 1) % n]
        if (y1 <= y < y2) or (y2 <= y < y1):
            t = (y - y1) / (y2 - y1)
            if x1 + (x2 - x1) * t > x:
                inside = not inside
    return inside


def _centroid2(loop):
    return (sum(p[0] for p in loop) / len(loop), sum(p[1] for p in loop) / len(loop))


def _clean_loop(points):
    """[[off, cota]...] numéricos, sin punto de cierre ni duplicados seguidos."""
    pts = []
    for p in points or []:
        try:
            x, y = float(p[0]), float(p[1])
        except (TypeError, ValueError, IndexError):
            continue
        if not (math.isfinite(x) and math.isfinite(y)):
            continue
        if pts and abs(x - pts[-1][0]) < 1e-9 and abs(y - pts[-1][1]) < 1e-9:
            continue
        pts.append((x, y))
    if len(pts) >= 2 and abs(pts[0][0] - pts[-1][0]) < 1e-9 and abs(pts[0][1] - pts[-1][1]) < 1e-9:
        pts = pts[:-1]
    return pts


def _ccw_keep_anchor(pts):
    """Fuerza sentido antihorario SIN cambiar el vértice inicial (el orden de
    Civil es la correspondencia natural entre estaciones)."""
    if _signed_area(pts) < 0:
        return [pts[0]] + pts[1:][::-1]
    return pts


def _ear_clip(pts):
    """Triangulación por ear-clipping de un polígono simple CCW.

    Necesaria para las TAPAS: los rellenos alrededor del box son formas en C —
    un abanico desde el centroide cruza el hueco. Devuelve triples de índices;
    si el polígono viene degenerado devuelve lo que logre (el llamador decide
    el fallback).
    """
    n = len(pts)
    if n < 3:
        return []

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    def in_tri(p, a, b, c):
        d1, d2, d3 = cross(a, b, p), cross(b, c, p), cross(c, a, p)
        has_neg = d1 < 0 or d2 < 0 or d3 < 0
        has_pos = d1 > 0 or d2 > 0 or d3 > 0
        return not (has_neg and has_pos)

    idxs = list(range(n))
    tris = []
    guard = 0
    while len(idxs) > 3 and guard < 20000:
        guard += 1
        clipped = False
        m = len(idxs)
        # 1) vértices COLINEALES: triángulo de área ~0 — se descartan sin
        # emitir (el remuestreo x64 genera muchos sobre tramos rectos y
        # atascaban el clipping → la tapa caía al abanico, que en regiones
        # cóncavas barre el vacío: los "rayos" que se veían en los extremos).
        for k in range(m):
            i0, i1, i2 = idxs[(k - 1) % m], idxs[k], idxs[(k + 1) % m]
            if abs(cross(pts[i0], pts[i1], pts[i2])) <= 1e-9:
                idxs.pop(k)
                clipped = True
                break
        if clipped:
            continue
        # 2) oreja convexa normal
        for k in range(m):
            i0, i1, i2 = idxs[(k - 1) % m], idxs[k], idxs[(k + 1) % m]
            a, b, c = pts[i0], pts[i1], pts[i2]
            if cross(a, b, c) <= 1e-12:
                continue  # vértice reflexo: no es oreja
            ok = True
            for j in idxs:
                if j in (i0, i1, i2):
                    continue
                if in_tri(pts[j], a, b, c):
                    ok = False
                    break
            if ok:
                tris.append((i0, i1, i2))
                idxs.pop(k)
                clipped = True
                break
        if not clipped:
            break  # polígono con autointersección/degenerado: parar limpio
    if len(idxs) == 3:
        tris.append((idxs[0], idxs[1], idxs[2]))
    return tris


def _resample_loop(pts, n=RING_N):
    """Remuestrea un lazo cerrado a n puntos por longitud de arco.

    Normaliza para que dos anillos consecutivos se correspondan vértice a
    vértice: sentido antihorario y arranque en el vértice de mayor offset.
    """
    m = len(pts)
    if m < 3:
        return None
    if _signed_area(pts) < 0:
        pts = pts[::-1]
    start = max(range(len(pts)), key=lambda i: pts[i][0])
    pts = pts[start:] + pts[:start]

    seg_len = []
    total = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        d = math.hypot(x2 - x1, y2 - y1)
        seg_len.append(d)
        total += d
    if total <= 1e-9:
        return None

    out = []
    step = total / n
    seg = 0
    acc = 0.0  # longitud recorrida hasta el inicio del segmento actual
    for k in range(n):
        target = k * step
        while seg < len(pts) - 1 and acc + seg_len[seg] < target:
            acc += seg_len[seg]
            seg += 1
        d = seg_len[seg] or 1e-12
        t = min(1.0, max(0.0, (target - acc) / d))
        x1, y1 = pts[seg]
        x2, y2 = pts[(seg + 1) % len(pts)]
        out.append((x1 + (x2 - x1) * t, y1 + (y2 - y1) * t))
    return out


def _hatch_segments(loops, angle_deg, spacing):
    """Rayado de lámina DENTRO de un polígono con HUECOS: líneas paralelas al
    ángulo dado recortadas par-impar contra TODOS los lazos (exterior + islas
    — así el rayado nunca invade el box). Acepta un lazo suelto o lista de
    lazos. Devuelve [(x1,y1,x2,y2)...] en el plano (offset, cota)."""
    if loops and isinstance(loops[0], tuple) and len(loops[0]) == 2 and not isinstance(loops[0][0], (list, tuple)):
        loops = [loops]  # compat: un solo lazo
    loops = [l for l in (loops or []) if len(l) >= 3]
    if not loops:
        return []
    a = math.radians(angle_deg)
    ca, sa = math.cos(a), math.sin(a)
    rot_loops = [[(x * ca + y * sa, -x * sa + y * ca) for x, y in l] for l in loops]
    vmin = min(v for rl in rot_loops for _, v in rl)
    vmax = max(v for rl in rot_loops for _, v in rl)
    if vmax - vmin < 1e-6:
        return []
    if (vmax - vmin) / spacing > 40:
        spacing = (vmax - vmin) / 40
    segs = []
    v = vmin + spacing * 0.5
    while v < vmax:
        xs = []
        for rl in rot_loops:
            n = len(rl)
            for i in range(n):
                u1, v1 = rl[i]
                u2, v2 = rl[(i + 1) % n]
                if (v1 <= v < v2) or (v2 <= v < v1):
                    t = (v - v1) / (v2 - v1)
                    xs.append(u1 + (u2 - u1) * t)
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            ua, ub = xs[k], xs[k + 1]
            if ub - ua < 1e-4:
                continue
            segs.append((ua * ca - v * sa, ua * sa + v * ca,
                         ub * ca - v * sa, ub * sa + v * ca))
        v += spacing
    return segs


# Estilo de rayado por tipo (lenguaje de lámina: corte 45°, relleno 135°)
HATCH_STYLE = {
    'corte': (45.0, 0.6),
    'relleno': (135.0, 0.6),
}


def _align_to_prev(prev2d, ring2d):
    """Rota cíclicamente ring2d para que cada vértice case con su par del
    anillo anterior (mínima suma de distancias). Sin esto, el arranque del
    remuestreo puede saltar de esquina entre estaciones y el loft se TUERCE
    (caras cruzadas). Ambos anillos ya vienen CCW y con el mismo conteo."""
    n = len(ring2d)
    if not prev2d or len(prev2d) != n:
        return ring2d
    best_k, best_d = 0, None
    for k in range(n):
        d = 0.0
        for i in range(0, n, 2):  # muestreo cada 2: fiel también cuando el contorno cambia de forma
            p = prev2d[i]
            q = ring2d[(i + k) % n]
            d += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
            if best_d is not None and d >= best_d:
                break
        if best_d is None or d < best_d:
            best_d, best_k = d, k
    return ring2d[best_k:] + ring2d[:best_k]


def _axis_polyline(alignment):
    """[(station, x, y)] ordenado del perfil con más puntos válidos.

    La geometría horizontal (x, y por estación) es la misma en todos los
    perfiles del alineamiento; se toma el más denso.
    """
    best = []
    for prof in (alignment or {}).get('profiles') or []:
        pts = []
        for p in prof.get('points') or []:
            try:
                st = float(p.get('station'))
                x = float(p.get('x'))
                y = float(p.get('y'))
            except (TypeError, ValueError):
                continue
            if math.isfinite(st) and math.isfinite(x) and math.isfinite(y):
                pts.append((st, x, y))
        if len(pts) > len(best):
            best = pts
    best.sort(key=lambda r: r[0])
    dedup = []
    for r in best:
        if not dedup or r[0] - dedup[-1][0] > 1e-6:
            dedup.append(r)
    return dedup


def _frame_at(axis, pk):
    """Posición y normal-derecha del eje en pk: ((px, py), (nx, ny)).

    Convención Civil 3D: offset positivo a la DERECHA del sentido de avance
    de las progresivas (se puede invertir con ?flip=1). Fuera del dominio se
    extrapola con la tangente del extremo (hasta MAX_EXTRAPOLATION).
    """
    lo, hi = 0, len(axis) - 1
    if pk <= axis[0][0]:
        i, j = 0, 1
    elif pk >= axis[hi][0]:
        i, j = hi - 1, hi
    else:
        while hi - lo > 1:
            mid = (lo + hi) // 2
            if axis[mid][0] <= pk:
                lo = mid
            else:
                hi = mid
        i, j = lo, hi
    s0, x0, y0 = axis[i]
    s1, x1, y1 = axis[j]
    span = s1 - s0
    t = (pk - s0) / span if abs(span) > 1e-9 else 0.0
    px = x0 + (x1 - x0) * t
    py = y0 + (y1 - y0) * t
    dx, dy = x1 - x0, y1 - y0
    d = math.hypot(dx, dy) or 1e-12
    tx, ty = dx / d, dy / d
    return (px, py), (ty, -tx)


def _material_key(label):
    """Identidad ESTABLE de una lista de material a lo largo del eje.

    Civil nombra cada sección como
    "SECCIONES - SL-1341 - Material List - (44) - Corte(7764)": el nombre de
    la sample line (SL-1341) y el id final (7764) cambian por estación, pero
    "(44) - Corte" es la misma lista en todas. Esa es la clave para loftear
    cada material como un cuerpo continuo.
    """
    s = str(label or '').strip()
    s = re.sub(r'\(\d+\)\s*$', '', s)                    # id único del final
    m = re.search(r'material list.*$', s, re.I)          # desde "Material List"
    if m:
        s = m.group(0)
    else:
        s = re.sub(r'^secciones\s*-\s*', '', s, flags=re.I)
        s = re.sub(r'^sl[-\s]?\d+\s*-\s*', '', s, flags=re.I)  # nombre de la sample line
    return re.sub(r'\s+', ' ', s).strip().lower()


def _loops_by_material(station_obj, kind_re):
    """Regiones cerradas del tipo pedido en una estación, por clave de material.

    Devuelve {clave: (regions, area_neta)} con regions = [(outer, holes), ...].
    Un mismo hatch del cadista puede dibujar VARIAS regiones disjuntas (margen
    izquierda, margen derecha, franja sobre el box): se conservan TODAS — el
    campo 'area' de Civil ya las suma. Si una clave aparece dos veces en la
    misma estación (raro), se fusionan regiones y áreas.
    """
    kind_name = 'cut' if kind_re is KIND_PATTERNS.get('corte') else 'fill'
    out = {}
    for sec in station_obj.get('sections') or []:
        # Las formas de CORREDOR no son listas de material del cadista (un
        # shape "Relleno" del corridor matchearía el patrón y contaminaría
        # el holograma con cuerpos que no están en el cuadro de volúmenes).
        role = sec.get('role')
        if role == 'corridor' or sec.get('sourceType') == 'CorridorShape':
            continue
        # VISIBILIDAD DEL CADISTA: el holograma dibuja SOLO lo que él muestra
        # en su lámina — draw=false y estilos _Invisible quedan fuera (los usa
        # para el QTO, no para el dibujo). Misma regla que el visualizador 2D.
        if sec.get('hidden') or sec.get('draw') is False:
            continue
        if 'invisible' in str(sec.get('styleName') or '').lower():
            continue
        # CONTRATO CANÓNICO primero (viene clasificado desde el persist);
        # regex de nombre solo como fallback para extracciones viejas.
        if role is not None:
            if role != 'material' or sec.get('kind') != kind_name:
                continue
        else:
            label0 = sec.get('materialName') or sec.get('name') or ''
            if not kind_re.search(str(label0)):
                continue
        label = sec.get('materialName') or sec.get('sourceName') or sec.get('name') or ''
        closed = bool(sec.get('closed'))
        try:
            area_field = float(sec.get('area') or 0.0)
        except (TypeError, ValueError):
            area_field = 0.0
        if not math.isfinite(area_field) or area_field < 0:
            area_field = 0.0
        # Civil solo reporta 'area' en REGIONES reales: una polilínea abierta
        # con área (p. ej. la lista (45) del terraplén) es un lazo al que le
        # falta el segmento de cierre → se cierra solo. Sin área y sin cierre
        # es una línea de dibujo (terreno, proyección…): fuera.
        if not closed and area_field <= 0:
            continue
        # LAZOS MÚLTIPLES: un hatch puede traer varios contornos + ISLAS. Cada
        # lazo (de mayor a menor área) es una REGIÓN nueva o un HUECO de la
        # región que lo contiene (el box es un hueco del relleno; el loft debe
        # respetarlo o "cruza la estructura"). Antes se conservaba SOLO el lazo
        # mayor: se perdía hasta la mitad del área dibujada y, cuando "el
        # mayor" cambiaba de margen entre estaciones, la cinta cruzaba el
        # canal en diagonal. Se respeta TODO lo que el cadista dibujó.
        loops = _split_loops(sec.get('points'))
        if not loops:
            pts = _clean_loop(sec.get('points'))
            loops = [pts] if len(pts) >= 3 else []
        if not loops:
            continue
        regions = []  # [[outer, holes]] en orden de área descendente
        for l in sorted(loops, key=lambda q: abs(_signed_area(q)), reverse=True):
            if abs(_signed_area(l)) < MIN_REGION_M2:
                continue  # residuos (p. ej. las paredes del box: ~0.004 m²)
            for reg in regions:
                if _point_in_loop(_centroid2(l), reg[0]):
                    reg[1].append(l)  # hueco de esa región
                    break
            else:
                regions.append([l, []])
        for reg in regions:
            reg[1].sort(key=lambda q: _centroid2(q)[0])  # orden estable por offset
        regions = [(o, hs) for o, hs in regions]
        # área NETA: la del cuadro de Civil (cuenta TODAS las regiones y ya
        # descuenta islas) o, si falta, la suma de lo dibujado
        drawn = sum(abs(_signed_area(o)) - sum(abs(_signed_area(h)) for h in hs)
                    for o, hs in regions)
        area = area_field if area_field > 0 else drawn
        if area <= 0:
            continue
        key = sec.get('materialKey') or _material_key(label)
        if key in out:
            out[key] = (out[key][0] + regions, out[key][1] + area)
        else:
            out[key] = (regions, area)
    return out


def _pretty_label(key, kind_name):
    """Nombre corto para la leyenda: 'material list - (44) - corte' → 'Corte (44)'."""
    m = re.search(r'\((\d+)\)', key)
    num = f" ({m.group(1)})" if m else ''
    if key.startswith('material list'):
        return kind_name.capitalize() + num
    base = re.sub(r'\s*-\s*material\s*.*$', '', key).strip(' -')
    base = base[:1].upper() + base[1:] if base else kind_name.capitalize()
    return base + num


def _build_kind_mesh(stations, axis, kind_re, flip, kind_name='', hatch_step=2.5):
    """Loft del tipo (corte o relleno) a lo largo del eje.

    Una estación puede traer VARIAS listas de material del mismo tipo
    ((44) Corte, (49) Corte…): cada lista se loftea como CUERPO independiente
    (identidad = _material_key) con su propia malla — así el visor puede
    colorearlos y ocultarlos por separado (leyenda legible, no una masa).
    Dentro de un cuerpo, cada región disjunta del hatch se encadena por
    continuidad de centroide (PISTAS) y se loftea por separado; el volumen es
    uno solo por estación (área del cuadro de Civil, todas las regiones).
    stations: dicts v2 ORDENADOS por pk. Salida por cuerpo: vertices planos
    [x,y,z...] en metros absolutos, indices, ringBases, volumen prismoide.
    """
    s_min, s_max = axis[0][0], axis[-1][0]
    warnings = []

    # 1) regiones por estación agrupadas por identidad de material
    per_station = []  # [(pk, {clave: ([(outer, holes)...], area_neta)})]
    for st in stations:
        try:
            pk = float(st.get('station'))
        except (TypeError, ValueError):
            continue
        loops = _loops_by_material(st, kind_re)
        if loops and (pk < s_min - MAX_EXTRAPOLATION or pk > s_max + MAX_EXTRAPOLATION):
            warnings.append(f'PK {pk:.1f} fuera del eje (dominio {s_min:.0f}-{s_max:.0f}); omitida')
            loops = {}
        per_station.append((pk, loops, st.get('_zone')))
    material_keys = sorted({k for _, loops, _z in per_station for k in loops})

    # Las polilíneas ABIERTAS con área se cierran solas (les falta el segmento
    # de cierre). Si ese cierre resulta LARGO respecto al perímetro, el lazo es
    # sospechoso — se dibuja igual pero se avisa.
    gappy = set()
    for st in stations:
        for sec in st.get('sections') or []:
            label = sec.get('materialName') or sec.get('name') or ''
            if not kind_re.search(str(label)) or sec.get('closed'):
                continue
            try:
                if float(sec.get('area') or 0.0) <= 0:
                    continue
            except (TypeError, ValueError):
                continue
            loops0 = _split_loops(sec.get('points'))
            pts = max(loops0, key=lambda l: abs(_signed_area(l))) if loops0 else []
            if len(pts) < 3:
                continue
            per = sum(math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
                      for i in range(len(pts) - 1))
            gap = math.hypot(pts[0][0] - pts[-1][0], pts[0][1] - pts[-1][1])
            if per > 0 and gap / (per + gap) > 0.30:
                gappy.add(_material_key(label))
    for k in sorted(gappy):
        warnings.append(f'"{k}" venía abierta y el cierre automático es largo (revisar la forma en la sección)')

    if not material_keys:
        return None if not warnings else {'warnings_only': True, 'warnings': warnings}

    # 2) cada material se loftea por separado como CUERPO con malla propia
    bodies = []
    for key in material_keys:
        entries = [(pk, loops.get(key), zn) for pk, loops, zn in per_station]

        vertices = []
        indices = []
        ring_bases = []
        outlines = []
        hatches = []
        mid_outlines = []   # secciones INTERPOLADAS entre reales (costillas)
        mid_hatches = []
        areas = []
        mat_volume = 0.0
        segments = 0
        direct_all = True   # True solo si TODAS las pistas cosieron 1:1
        ring_sizes = set()
        h_ang, h_sp = HATCH_STYLE.get(kind_name, (45.0, 0.6))

        def _push_ring(ring):
            base = len(vertices) // 3
            for x, y, z in ring:
                vertices.extend((round(x, 3), round(y, 3), round(z, 3)))
            ring_bases.append(base)
            return base

        def _cap(base, ring2d, holes2d, invert):
            """Tapa con triangulación REAL del lazo (ear-clipping) y PERFORADA:
            los triángulos cuyo centroide cae dentro de un hueco (la isla del
            box) se descartan — la tapa no cruza la estructura. Éxito = los
            triángulos cubren el área del lazo (el conteo ya no sirve: los
            vértices colineales del remuestreo se descartan sin emitir).
            Fallback: abanico sin perforar (solo si viene degenerado)."""
            tris = _ear_clip(ring2d)
            area_ring = abs(_signed_area(ring2d))
            area_tris = sum(abs((ring2d[i1][0] - ring2d[i0][0]) * (ring2d[i2][1] - ring2d[i0][1])
                                - (ring2d[i1][1] - ring2d[i0][1]) * (ring2d[i2][0] - ring2d[i0][0])) / 2.0
                            for (i0, i1, i2) in tris)
            if not tris or (area_ring > 1e-9 and area_tris < 0.95 * area_ring):
                c = len(vertices) // 3
                # centroide 3D promediando los vértices del anillo ya subidos
                xs = [vertices[(base + i) * 3] for i in range(len(ring2d))]
                ys = [vertices[(base + i) * 3 + 1] for i in range(len(ring2d))]
                zs = [vertices[(base + i) * 3 + 2] for i in range(len(ring2d))]
                vertices.extend((round(sum(xs) / len(xs), 3), round(sum(ys) / len(ys), 3), round(sum(zs) / len(zs), 3)))
                n = len(ring2d)
                for i in range(n):
                    a, b = base + i, base + (i + 1) % n
                    indices.extend((c, b, a) if invert else (c, a, b))
                return
            for (i0, i1, i2) in tris:
                if holes2d:
                    cx = (ring2d[i0][0] + ring2d[i1][0] + ring2d[i2][0]) / 3.0
                    cy = (ring2d[i0][1] + ring2d[i1][1] + ring2d[i2][1]) / 3.0
                    if any(_point_in_loop((cx, cy), h) for h in holes2d):
                        continue
                a, b, c = base + i0, base + i1, base + i2
                indices.extend((a, c, b) if invert else (a, b, c))

        # ── PISTAS: un material puede dibujarse como VARIAS regiones disjuntas
        # por estación (margen izquierda, margen derecha, franja sobre el box).
        # Cada región se encadena con la más cercana de la estación SIGUIENTE
        # (deriva de centroide ≤ TRACK_JUMP, asignación golosa global) y cada
        # cadena se loftea por su lado. Si una región no encuentra pareja, su
        # pista se corta y se tapa — NUNCA se cose de un margen al otro (eso
        # producía las cintas diagonales cruzando el canal).
        tracks = []   # pistas cerradas: {'items': [(pk, (outer, holes)), ...]}
        open_tr = []  # pistas abiertas en la estación anterior (centroide+área)
        prev_zone = None
        for pk, entry, zone in entries:
            # CORTE ENTRE ZONAS: cada DWG es un tramo independiente del frente.
            # Sin esto, la última estación de un archivo se cosía con la
            # primera del siguiente y la cinta cruzaba el vacío entre ambos.
            if zone != prev_zone:
                tracks.extend(open_tr)
                open_tr = []
            prev_zone = zone
            regions = entry[0] if entry else []
            r_areas = [abs(_signed_area(o)) for o, _hs in regions]
            cands = []
            for ti, tr in enumerate(open_tr):
                for ri, reg in enumerate(regions):
                    rc = _centroid2(reg[0])
                    d = math.hypot(rc[0] - tr['c'][0], rc[1] - tr['c'][1])
                    if d > TRACK_JUMP:
                        continue
                    # áreas comparables: una franja real nunca continúa en un
                    # residuo (encadenarlos torcía la pared de una a otro)
                    lo, hi = sorted((tr['a'], r_areas[ri]))
                    if hi > 0 and lo / hi < TRACK_AREA_RATIO:
                        continue
                    cands.append((d, ti, ri))
            cands.sort(key=lambda t: t[0])
            used_t, used_r = set(), set()
            for _d, ti, ri in cands:
                if ti in used_t or ri in used_r:
                    continue
                used_t.add(ti)
                used_r.add(ri)
                open_tr[ti]['items'].append((pk, regions[ri]))
                open_tr[ti]['c'] = _centroid2(regions[ri][0])
                open_tr[ti]['a'] = r_areas[ri]
            nxt = []
            for ti, tr in enumerate(open_tr):
                (nxt if ti in used_t else tracks).append(tr)
            for ri, reg in enumerate(regions):
                if ri not in used_r:
                    nxt.append({'items': [(pk, reg)], 'c': _centroid2(reg[0]), 'a': r_areas[ri]})
            open_tr = nxt
        tracks.extend(open_tr)

        # ── loft por pista (solo geometría; volumen, áreas y rayado de lámina
        # se emiten POR ESTACIÓN más abajo, una sola vez)
        for tr in tracks:
            items = tr['items']
            if len(items) < 2:
                continue  # región suelta: su contorno se dibuja igual abajo
            # Correspondencia entre estaciones: Civil emite la MISMA lista de
            # material con los mismos puntos de forma (conteo y orden) en
            # todas las sample lines — si los conteos coinciden, se cosen los
            # vértices ORIGINALES 1:1 (forma exacta, esquinas vivas). Solo si
            # difieren se remuestrea por longitud de arco (fallback). Con
            # ISLAS siempre remuestreo (la 1:1 no maneja huecos).
            counts = {len(o) for _, (o, _hs) in items}
            any_holes = any(hs for _, (_o, hs) in items)
            direct = len(counts) == 1 and not any_holes
            ring_n = counts.pop() if direct else RING_N

            rings = []
            prev2d = None
            prev_holes2d = []
            for pk, (outer_raw, holes_raw) in items:
                ring2d = _ccw_keep_anchor(outer_raw) if direct else _resample_loop(outer_raw)
                if not ring2d or len(ring2d) != ring_n:
                    rings.append(None)
                    continue
                # anclar la correspondencia con el anillo anterior: sin esto el
                # loft se tuerce cuando el arranque salta de esquina. TAMBIÉN
                # en modo directo: el vértice inicial del lazo de un hatch no
                # es estable entre estaciones (la rotación cíclica conserva
                # los vértices exactos, solo elige dónde empieza).
                ring2d = _align_to_prev(prev2d, ring2d)
                prev2d = ring2d
                # HUECOS (islas): anillo propio de HRING_N pts, alineado con el
                # hueco homólogo de la estación anterior (orden por offset)
                holes2d = []
                for hi, hraw in enumerate(holes_raw):
                    h2 = _resample_loop(hraw, HRING_N)
                    if not h2 or len(h2) != HRING_N:
                        continue
                    if hi < len(prev_holes2d):
                        h2 = _align_to_prev(prev_holes2d[hi], h2)
                    holes2d.append(h2)
                prev_holes2d = holes2d

                (px, py), (nx, ny) = _frame_at(axis, pk)
                if flip:
                    nx, ny = -nx, -ny
                ring = [(px + nx * off, py + ny * off, cota) for off, cota in ring2d]
                hole_rings = [[(px + nx * off, py + ny * off, cota) for off, cota in h2] for h2 in holes2d]
                rings.append({'pk': pk, 'ring': ring, 'ring2d': ring2d,
                              'holes2d': holes2d, 'holeRings': hole_rings})

            run = []
            for r in rings + [None]:
                if r:
                    run.append(r)
                    continue
                if len(run) >= 2:
                    segments += 1
                    direct_all = direct_all and direct
                    ring_sizes.add(ring_n)
                    bases = [_push_ring(rr['ring']) for rr in run]
                    # anillos de HUECOS (paredes del túnel del box): fuera de ringBases
                    hole_bases = []
                    for rr in run:
                        hb = []
                        for hring in rr['holeRings']:
                            hb.append(len(vertices) // 3)
                            for x, y, z in hring:
                                vertices.extend((round(x, 3), round(y, 3), round(z, 3)))
                        hole_bases.append(hb)
                    for k in range(len(run) - 1):
                        b0, b1 = bases[k], bases[k + 1]
                        for i in range(ring_n):
                            j = (i + 1) % ring_n
                            indices.extend((b0 + i, b1 + i, b1 + j))
                            indices.extend((b0 + i, b1 + j, b0 + j))
                        # paredes de cada hueco entre estaciones consecutivas
                        for h in range(min(len(hole_bases[k]), len(hole_bases[k + 1]))):
                            hb0, hb1 = hole_bases[k][h], hole_bases[k + 1][h]
                            for i in range(HRING_N):
                                j = (i + 1) % HRING_N
                                indices.extend((hb0 + i, hb1 + i, hb1 + j))
                                indices.extend((hb0 + i, hb1 + j, hb0 + j))

                        # Costillas ENTRE secciones reales: el prismoide asume
                        # variación lineal entre estaciones, así que la sección
                        # interpolada es exactamente la hipótesis del metrado —
                        # se raya también para que el cuerpo se lea continuo.
                        if hatch_step > 0:
                            pk_a, pk_b = run[k]['pk'], run[k + 1]['pk']
                            r2a, r2b = run[k]['ring2d'], run[k + 1]['ring2d']
                            span = pk_b - pk_a
                            j2 = 1
                            while True:
                                s = pk_a + j2 * hatch_step
                                if s >= pk_b - 1e-6:
                                    break
                                t = (s - pk_a) / span
                                ring_i = [(r2a[i][0] * (1 - t) + r2b[i][0] * t,
                                           r2a[i][1] * (1 - t) + r2b[i][1] * t)
                                          for i in range(ring_n)]
                                # huecos interpolados (solo si ambas estaciones
                                # tienen los mismos): el rayado par-impar los respeta
                                holes_i = []
                                ha, hbx = run[k]['holes2d'], run[k + 1]['holes2d']
                                if len(ha) == len(hbx):
                                    for hh in range(len(ha)):
                                        if len(ha[hh]) == len(hbx[hh]):
                                            holes_i.append([(ha[hh][i][0] * (1 - t) + hbx[hh][i][0] * t,
                                                             ha[hh][i][1] * (1 - t) + hbx[hh][i][1] * t)
                                                            for i in range(len(ha[hh]))])
                                (ipx, ipy), (inx, iny) = _frame_at(axis, s)
                                if flip:
                                    inx, iny = -inx, -iny
                                mo = []
                                # costilla: mitad de puntos basta en anillos densos
                                for off, cota in (ring_i[::2] if ring_n > 24 else ring_i):
                                    mo.extend((round(ipx + inx * off, 2), round(ipy + iny * off, 2), round(cota, 2)))
                                mid_outlines.append(mo)
                                mh = []
                                for (o1, c1, o2, c2) in _hatch_segments([ring_i] + holes_i, h_ang, h_sp):
                                    mh.extend((round(ipx + inx * o1, 2), round(ipy + iny * o1, 2), round(c1, 2),
                                               round(ipx + inx * o2, 2), round(ipy + iny * o2, 2), round(c2, 2)))
                                mid_hatches.append(mh)
                                j2 += 1
                    _cap(bases[0], run[0]['ring2d'], run[0]['holes2d'], invert=True)
                    _cap(bases[-1], run[-1]['ring2d'], run[-1]['holes2d'], invert=False)
                run = []

        # ── volumen, áreas y dibujo de lámina POR ESTACIÓN (una sola vez,
        # independiente de en cuántas regiones/pistas se dibuje el material).
        # El volumen usa el área NETA del cuadro de Civil: es la cifra del
        # cadista — ya suma todas las regiones y descuenta islas — y así el
        # holograma nunca contradice al cuadro de volúmenes.
        present = []       # (índice de estación, pk, área neta)
        coverage_bad = []  # estaciones donde el dibujo no casa con el cuadro
        for si, (pk, entry, zone) in enumerate(entries):
            if not entry:
                continue
            regions, a_civil = entry
            drawn = sum(abs(_signed_area(o)) - sum(abs(_signed_area(h)) for h in hs)
                        for o, hs in regions)
            a_st = a_civil if a_civil > 0 else drawn
            present.append((si, pk, a_st, zone))
            areas.append({'station': pk, 'area': round(a_st, 3)})
            if a_civil > 0.05 and abs(drawn - a_civil) / a_civil > 0.30:
                coverage_bad.append((pk, drawn, a_civil))
            (px, py), (nx, ny) = _frame_at(axis, pk)
            if flip:
                nx, ny = -nx, -ny
            # contornos EXACTOS del hatch (vértices originales) y rayado de
            # lámina PAR-IMPAR por región (respeta islas: no invade el box)
            hatch = []
            for outer_raw, holes_raw in regions:
                for lp in [outer_raw] + holes_raw:
                    fl = []
                    for off, cota in lp:
                        fl.extend((round(px + nx * off, 3), round(py + ny * off, 3), round(cota, 3)))
                    outlines.append(fl)
                for (o1, c1, o2, c2) in _hatch_segments([outer_raw] + holes_raw, h_ang, h_sp):
                    hatch.extend((round(px + nx * o1, 3), round(py + ny * o1, 3), round(c1, 3),
                                  round(px + nx * o2, 3), round(py + ny * o2, 3), round(c2, 3)))
            hatches.append(hatch)
        for j in range(len(present) - 1):
            # prismoide solo entre estaciones CONSECUTIVAS del muestreo y del
            # MISMO archivo (un hueco en la cadena, o el salto de zona, corta
            # el cuerpo igual que corta el loft)
            if present[j + 1][0] == present[j][0] + 1 and present[j + 1][3] == present[j][3]:
                mat_volume += (present[j][2] + present[j + 1][2]) / 2.0 \
                    * abs(present[j + 1][1] - present[j][1])
        for j, (si, pk, _a, zone) in enumerate(present):
            has_prev = j > 0 and present[j - 1][0] == si - 1 and present[j - 1][3] == zone
            has_next = j + 1 < len(present) and present[j + 1][0] == si + 1 and present[j + 1][3] == zone
            if not has_prev and not has_next:
                warnings.append(f"[{key}] PK {pk:.1f} aislada (sin vecina con el material); sin tramo de volumen")
        if coverage_bad:
            pk_w, dn, ac = max(coverage_bad, key=lambda t: abs(t[1] - t[2]) / t[2])
            extra = f' y {len(coverage_bad) - 1} estación(es) más' if len(coverage_bad) > 1 else ''
            warnings.append(f'[{key}] en PK {pk_w:.1f} el hatch dibujado cubre '
                            f'{dn / ac * 100:.0f}% del área del cuadro ({dn:.2f} vs {ac:.2f} m²){extra} '
                            '— la malla sigue al dibujo y el volumen al cuadro; revisar la lámina')

        if indices:
            bodies.append({
                'material': key,
                'label': _pretty_label(key, kind_name),
                'vertices': vertices,
                'indices': indices,
                'ringBases': ring_bases,
                # ringSize solo es fiable si TODAS las pistas cosieron con el
                # mismo conteo (el visor usa outlines; esto es solo fallback)
                'ringSize': ring_sizes.pop() if len(ring_sizes) == 1 else RING_N,
                'outlines': outlines,
                'hatches': hatches,
                'midOutlines': mid_outlines,
                'midHatches': mid_hatches,
                'direct': direct_all,
                'volume': round(mat_volume, 2),
                'areas': areas,
                'stations': len(present),
                'segments': segments,
            })

    if not bodies:
        return None if not warnings else {'warnings_only': True, 'warnings': warnings}

    return {
        'volume': round(sum(b['volume'] for b in bodies), 2),
        'bodies': bodies,
        'stations': len({a['station'] for b in bodies for a in b['areas']}),
        'warnings': warnings,
    }


# ── Acceso a datos persistidos ──────────────────────────────────────────────

def _normalize_stations(data):
    if not data:
        return []
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and data.get('schemaVersion', 0) >= 2 and isinstance(data.get('stations'), list):
        return data['stations']
    return []


def _normalize_alignments(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ('items', 'alignments'):
            if isinstance(data.get(key), list):
                return data[key]
    return []


def _align_id(a):
    return a.get('alignmentId') or a.get('name') or ''


def _fuse_station_rows(rows):
    """FUSIÓN POR EJE de varias extracciones (varios DWG = varias ZONAS del
    mismo frente). rows: [(urn, updated_at, data)].

    Regla del proyecto: el eje es UNO; cada archivo aporta su tramo. En
    colisión (eje, pk) manda el archivo MÁS RECIENTE. Devuelve
    (stations_fusionadas, zonas, avisos) — zonas con su rango de pks para
    auditoría y para que los sólidos evalúen cada zona con SUS topografías.
    """
    fused = {}
    owner = {}
    zonas = []
    clashes = {}
    for urn, upd, data in sorted(rows, key=lambda r: str(r[1])):  # viejo → nuevo
        sts = _normalize_stations(data)
        pks = []
        for st in sts:
            try:
                pk = float(st.get('station'))
            except (TypeError, ValueError):
                continue
            key = ((st.get('alignmentId') or ''), round(pk, 2))
            if key in owner and owner[key] != urn:
                ck = (owner[key], urn)
                clashes[ck] = clashes.get(ck, 0) + 1
            try:
                st['_zone'] = urn     # de qué DWG vino esta estación
            except Exception:
                pass
            fused[key] = st
            owner[key] = urn
            pks.append(pk)
        if pks:
            zonas.append({'urn': urn, 'updated_at': upd,
                          'pk0': min(pks), 'pk1': max(pks), 'n': len(pks)})
    stations = [fused[k] for k in sorted(fused)]
    avisos = []
    for (old_u, new_u), n in sorted(clashes.items()):
        avisos.append(f'solape de zonas: {n} estación(es) de …{old_u[-8:]} '
                      f'reemplazadas por …{new_u[-8:]} (más reciente)')
    return stations, zonas, avisos


def _axis_for(align_rows_data, want_align, coherence_warns=None):
    """Eje para want_align entre VARIOS archivos: gana el de dominio más
    largo; los demás se COMPARAN contra él (candado de coherencia — copias
    divergentes o re-estacado se avisan, nunca se fusionan en silencio)."""
    candidates = []
    for urn, _upd, data in align_rows_data:
        for a in _normalize_alignments(data):
            if _align_id(a) == want_align:
                poly = _axis_polyline(a)
                if len(poly) >= 2:
                    candidates.append((urn, poly))
                break
    if not candidates:
        return None, None
    candidates.sort(key=lambda c: c[1][-1][0] - c[1][0][0], reverse=True)
    best_urn, best = candidates[0]
    if coherence_warns is not None:
        for urn, poly in candidates[1:]:
            s0 = max(best[0][0], poly[0][0])
            s1 = min(best[-1][0], poly[-1][0])
            if s1 - s0 < 1.0:
                continue
            worst = 0.0
            worst_s = s0
            for k in range(21):
                s = s0 + (s1 - s0) * k / 20.0
                (x1, y1), _n1 = _frame_at(best, s)
                (x2, y2), _n2 = _frame_at(poly, s)
                d = math.hypot(x1 - x2, y1 - y2)
                if d > worst:
                    worst, worst_s = d, s
            if worst > 0.25:
                coherence_warns.append(
                    f'EJE "{want_align}" difiere entre archivos hasta {worst:.2f} m '
                    f'en PK {worst_s:.1f} (…{best_urn[-8:]} vs …{urn[-8:]}) — revisar con el cadista')
    return best, best_urn


# Caché de mallas generadas. La clave incluye los updated_at de secciones y
# alineamientos: re-extraer invalida sola la entrada. Generar toma ~0.3 s pero
# BAJAR los JSONB desde Cloud SQL remoto toma segundos — este caché deja las
# activaciones repetidas en milisegundos.
_MESH_CACHE = {}
_MESH_CACHE_MAX = 8
# Memo de frescura: validar updated_at contra Cloud SQL remoto cuesta ~0.3 s
# por round-trip; dentro de esta ventana se sirve directo del caché sin tocar
# la BD (una re-extracción se ve reflejada como MUCHO en 60 s).
_FRESH_MEMO = {}
_FRESH_TTL_SEC = 60


@civil_ghost_bp.route('/api/civil/earthworks-mesh', methods=['GET'])
def earthworks_mesh():
    """Holograma corte/relleno del frente.

    Params: scope_urn (requerido) · alignmentId (opcional: si falta, el eje
    con más estaciones en la extracción más reciente) · flip=1 (invierte el
    lado de los offsets) · kinds=corte,relleno (por defecto ambos).
    """
    scope_urn = (request.args.get('scope_urn') or '').strip()
    if not scope_urn:
        return jsonify({'error': 'Falta scope_urn'}), 400
    want_align = (request.args.get('alignmentId') or '').strip() or None
    flip = request.args.get('flip') in ('1', 'true', 'yes')
    kinds = [k for k in (request.args.get('kinds') or 'corte,relleno').split(',')
             if k.strip() in KIND_PATTERNS]
    try:
        hatch_step = float(request.args.get('hatch_step', 2.5))
    except (TypeError, ValueError):
        hatch_step = 2.5
    if hatch_step > 0:
        hatch_step = max(0.5, hatch_step)  # 0 = sin costillas intermedias

    try:
        import time as _time
        from db import get_db_connection

        # 0) Frescura memorizada: si validamos hace <TTL, ni tocamos la BD.
        # ?fresh=1 la salta (el panel Civil lo manda tras extraer/borrar).
        force_fresh = request.args.get('fresh') in ('1', 'true')
        memo = None if force_fresh else _FRESH_MEMO.get(scope_urn)
        if memo and _time.time() - memo[0] < _FRESH_TTL_SEC:
            section_meta_rows, align_meta_rows = memo[1], memo[2]
            cache_key = (scope_urn, want_align or '', flip, hatch_step, ','.join(sorted(kinds)),
                         tuple(section_meta_rows), tuple(align_meta_rows))
            cached = _MESH_CACHE.get(cache_key)
            if cached is not None:
                return jsonify(cached), 200

        with get_db_connection() as conn:
            cur = conn.cursor()
            # 1) SOLO metadatos (baratos) y en UNA ida a la BD remota: sirven
            # para el índice del caché sin bajar los JSONB pesados.
            cur.execute("""SELECT 'S' AS t, urn, updated_at::text FROM civil_sections WHERE scope_urn = %s
                           UNION ALL
                           SELECT 'A', urn, updated_at::text FROM civil_alignments WHERE scope_urn = %s""",
                        (scope_urn, scope_urn))
            meta = cur.fetchall()
            section_meta_rows = sorted(((u, t) for k, u, t in meta if k == 'S'), key=lambda r: r[1], reverse=True)
            align_meta_rows = sorted(((u, t) for k, u, t in meta if k == 'A'), key=lambda r: r[1], reverse=True)
            _FRESH_MEMO[scope_urn] = (_time.time(), section_meta_rows, align_meta_rows)

            if not section_meta_rows:
                return jsonify({'error': 'sin-secciones', 'detail': 'Este frente no tiene secciones extraídas.'}), 404
            if not align_meta_rows:
                return jsonify({'error': 'sin-eje', 'detail': 'Este frente no tiene alineamientos extraídos.'}), 404

            cache_key = (scope_urn, want_align or '', flip, hatch_step, ','.join(sorted(kinds)),
                         tuple(section_meta_rows), tuple(align_meta_rows))
            cached = _MESH_CACHE.get(cache_key)
            if cached is not None:
                return jsonify(cached), 200

            # 2) Miss: bajar TODAS las filas con estaciones y FUSIONAR por eje
            # (varios DWG = varias ZONAS del mismo frente; el eje es uno y
            # cada archivo aporta su tramo — en solape manda el más reciente)
            rows_data = []
            for urn, updated in section_meta_rows:
                cur.execute("SELECT data FROM civil_sections WHERE scope_urn = %s AND urn = %s", (scope_urn, urn))
                row = cur.fetchone()
                if row and _normalize_stations(row[0]):
                    rows_data.append((urn, updated, row[0]))
            if not rows_data:
                return jsonify({'error': 'sin-estaciones', 'detail': 'Las secciones guardadas no traen estaciones v2.'}), 404
            stations, zonas, zone_warns = _fuse_station_rows(rows_data)
            if want_align:
                stations = [s for s in stations if (s.get('alignmentId') or '') == want_align]
                if not stations:
                    return jsonify({'error': 'sin-estaciones', 'detail': f'Sin estaciones para el eje "{want_align}".'}), 404
            sections_meta = [{'urn': z['urn'], 'updated_at': z['updated_at'],
                              'pk0': round(z['pk0'], 2), 'pk1': round(z['pk1'], 2),
                              'estaciones': z['n']} for z in zonas]
            if len(zonas) > 1:
                zone_warns.insert(0, 'Zonas fusionadas: ' + ' · '.join(
                    f"…{z['urn'][-8:]} {z['pk0']:.0f}-{z['pk1']:.0f} ({z['n']} est.)" for z in zonas))

            # 3) Eje: decidirlo YA (con las estaciones en mano); entre varios
            # archivos gana el dominio más largo y los demás se comparan
            # (candado de coherencia contra copias divergentes/re-estacado)
            if not want_align:
                counts = {}
                for s in stations:
                    counts[s.get('alignmentId') or ''] = counts.get(s.get('alignmentId') or '', 0) + 1
                want_align = max(counts, key=counts.get)
                stations = [s for s in stations if (s.get('alignmentId') or '') == want_align]

            align_rows_data = []
            for urn, updated in align_meta_rows:
                cur.execute("SELECT data FROM civil_alignments WHERE scope_urn = %s AND urn = %s", (scope_urn, urn))
                row = cur.fetchone()
                if row:
                    align_rows_data.append((urn, updated, row[0]))
            axis, axis_urn = _axis_for(align_rows_data, want_align, coherence_warns=zone_warns)
            align_meta = {'urn': axis_urn} if axis_urn else None
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

    def _pk(s):
        try:
            return float(s.get('station'))
        except (TypeError, ValueError):
            return math.inf
    stations = sorted((s for s in stations if math.isfinite(_pk(s))), key=_pk)

    if not axis:
        return jsonify({'error': 'sin-geometria-eje',
                        'detail': f'El eje "{want_align}" no tiene perfil con puntos x/y por estación.'}), 404

    out_kinds = {}
    warnings = list(zone_warns)
    for kind in kinds:
        built = _build_kind_mesh(stations, axis, KIND_PATTERNS[kind], flip, kind_name=kind, hatch_step=hatch_step)
        if built:
            warnings.extend(f'[{kind}] {w}' for w in built.pop('warnings'))
            if not built.get('warnings_only'):
                out_kinds[kind] = built
    if not out_kinds:
        return jsonify({'error': 'sin-materiales',
                        'detail': 'Ninguna estación trae lazos cerrados de desmonte/terraplén.',
                        'alignmentId': want_align}), 404

    payload = {
        'alignmentId': want_align,
        'scope_urn': scope_urn,
        'flip': flip,
        'units': 'm',
        'ringSize': RING_N,
        'kinds': out_kinds,
        'warnings': warnings,
        'source': {'sections': sections_meta, 'alignments': align_meta},
    }
    if len(_MESH_CACHE) >= _MESH_CACHE_MAX:
        _MESH_CACHE.pop(next(iter(_MESH_CACHE)))
    _MESH_CACHE[cache_key] = payload
    return jsonify(payload), 200
