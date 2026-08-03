// ghostEarthworks.js — dibuja el holograma de movimiento de tierras (corte /
// relleno) que genera el backend desde las secciones persistidas de Civil 3D.
//
// El backend entrega POR CUERPO (una malla por lista de material de Civil) en
// METROS ABSOLUTOS. Aquí solo se convierte a unidades del visor — la
// conversión de verdad vive en LOB4DExtension.civilToViewerPoint (escala por
// unidades, globalOffset y transform del modelo, ya probada con el eje); si
// la extensión no está cargada se usa un fallback equivalente sin transform.
//
// Estilo holograma por cuerpo: relleno translúcido con test de profundidad
// (se lee como enterrado) + pasada "rayos X" tenue a través del modelo +
// aros de sección. Cada cuerpo tiene SU color (leyenda legible) y puede
// ocultarse por separado desde la leyenda de la barra inferior.

const OVERLAY = 'ecd-ghost-earthworks';

// Paletas por tipo: cálidos = corte (excavación), fríos = relleno.
const PALETTES = {
    corte: ['#d9a35e', '#c1703f', '#a8562e', '#8f6d3c'],
    relleno: ['#3fb27f', '#2e9d9a', '#5a9bd8', '#7fc25f', '#3a7bc2', '#57c7a8'],
};

let _bodies = new Map();   // id → { meshes: [], matNames: [] }
let _matSeq = 0;

// Tono oscurecido del color del cuerpo: los trazos (contorno/rayado) deben
// CONTRASTAR con su propia piel translúcida, no camuflarse en ella.
function _shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f);
    const g = Math.round(((n >> 8) & 255) * f);
    const b = Math.round((n & 255) * f);
    return (r << 16) | (g << 8) | b;
}

function _getModel(viewer) {
    const models = viewer?.getAllModels?.() || [];
    return models[0] || null;
}

function _makeConverter(viewer) {
    const model = _getModel(viewer);
    if (!model) return null;
    const ext = viewer.getExtension && viewer.getExtension('LOB4DExtension');
    if (ext && typeof ext.civilToViewerPoint === 'function') {
        return (x, y, z) => ext.civilToViewerPoint({ x, y, z }, model);
    }
    // Fallback (sin LOB4D): metros → unidades del modelo − globalOffset
    const THREE = window.THREE;
    const unitToMeters = {
        m: 1, meter: 1, meters: 1,
        mm: 0.001, millimeter: 0.001, millimeters: 0.001,
        cm: 0.01, centimeter: 0.01, centimeters: 0.01,
        ft: 0.3048, feet: 0.3048, foot: 0.3048,
        in: 0.0254, inch: 0.0254, inches: 0.0254,
    };
    const to = unitToMeters[String(model.getUnitString?.() || 'm').toLowerCase()] || 1;
    const scale = 1 / to;
    const off = (model.getData && model.getData().globalOffset) || { x: 0, y: 0, z: 0 };
    return (x, y, z) => new THREE.Vector3(x * scale - off.x, y * scale - off.y, z * scale - off.z);
}

function _ensureOverlay(viewer) {
    try {
        if (viewer.overlays && !viewer.overlays.hasScene(OVERLAY)) viewer.overlays.addScene(OVERLAY);
    } catch { /* noop */ }
}

// Registrar el material en el MaterialManager de LMV: es lo que suscribe al
// material a los PLANOS DE CORTE del visor (sin esto, la herramienta Corte
// rebana los modelos pero el holograma sigue entero). Si ya hay un corte
// activo al dibujar, se aplica de inmediato.
function _registerForCutplanes(viewer, mat, entry) {
    try {
        const name = `ecd-ghost-${++_matSeq}`;
        viewer.impl.matman().addMaterial(name, mat, true);
        entry.matNames.push(name);
        const cp = viewer.impl.getCutPlanes?.();
        if (cp && cp.length) { mat.cutplanes = cp; mat.needsUpdate = true; }
    } catch { /* sin matman: el holograma se dibuja igual, solo no se corta */ }
}

// ── Tapas dinámicas en el plano de corte (estilo ACC) ───────────────────────
// Cuando la herramienta Corte rebana el holograma, la cara cortada se tapa
// con la sección del cuerpo: relleno casi sólido + rayado por tipo (45°
// corte / 135° relleno) + contorno — como LMV tapa el concreto del box.
// Se recalcula en vivo al mover el plano (CUTPLANES_CHANGE_EVENT).
let _capMeshes = [];
let _capListener = null;
let _capTimer = null;
let _capPoll = null;
let _capHash = '';
let _upm = 1000; // unidades del visor por metro (se mide al dibujar)

// Planos de corte ACTIVOS desde la fuente autoritativa: la extensión
// Autodesk.Section guarda su plano en un SET nombrado que getCutPlanes()
// clásico no siempre refleja — getAllCutPlanes() sí los fusiona todos.
function _getActivePlanes(viewer) {
    try {
        const impl = viewer.impl;
        const all = impl.getAllCutPlanes && impl.getAllCutPlanes();
        if (all && all.length) return all;
        const basic = impl.getCutPlanes && impl.getCutPlanes();
        if (basic && basic.length) return basic;
        const raw = impl.matman && impl.matman().getCutPlanesRaw && impl.matman().getCutPlanesRaw();
        return raw || [];
    } catch { return []; }
}

function _planesHash(planes) {
    // Orden-independiente: los SETS de planos de LMV pueden enumerarse en
    // distinto orden entre llamadas — sin sort, la tapa se reconstruía en
    // bucle (parpadeo) sin que el corte cambiara de verdad.
    const parts = [];
    for (const p of planes) parts.push(`${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)},${p.w.toFixed(2)}`);
    parts.sort();
    return parts.join(';');
}

function _clearCaps(viewer) {
    _capMeshes.forEach((m) => {
        try { viewer.overlays.removeMesh(m, OVERLAY); } catch { /* noop */ }
        try { m.geometry?.dispose?.(); m.material?.dispose?.(); } catch { /* noop */ }
    });
    _capMeshes = [];
}

// Ear-clipping 2D (mismo algoritmo que el backend): respeta formas en C.
function _earClipJS(pts) {
    const n = pts.length;
    if (n < 3) return [];
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const inTri = (p, a, b, c) => {
        const d1 = cross(a, b, p), d2 = cross(b, c, p), d3 = cross(c, a, p);
        return !(((d1 < 0) || (d2 < 0) || (d3 < 0)) && ((d1 > 0) || (d2 > 0) || (d3 > 0)));
    };
    const idxs = pts.map((_, i) => i);
    const tris = [];
    let guard = 0;
    while (idxs.length > 3 && guard++ < 20000) {
        let clipped = false;
        const m = idxs.length;
        for (let k = 0; k < m; k++) {
            const i0 = idxs[(k - 1 + m) % m], i1 = idxs[k], i2 = idxs[(k + 1) % m];
            const a = pts[i0], b = pts[i1], c = pts[i2];
            if (cross(a, b, c) <= 1e-9) continue;
            let ok = true;
            for (const j of idxs) {
                if (j === i0 || j === i1 || j === i2) continue;
                if (inTri(pts[j], a, b, c)) { ok = false; break; }
            }
            if (ok) { tris.push([i0, i1, i2]); idxs.splice(k, 1); clipped = true; break; }
        }
        if (!clipped) break;
    }
    if (idxs.length === 3) tris.push([idxs[0], idxs[1], idxs[2]]);
    return tris;
}

// Rayado 2D recortado contra un polígono CON HUECOS (par-impar sobre todos
// los lazos, como el backend). Acepta un lazo o lista de lazos.
function _hatchJS(loopOrLoops, angleDeg, spacing) {
    const loops = (loopOrLoops.length && Array.isArray(loopOrLoops[0]) && Array.isArray(loopOrLoops[0][0]))
        ? loopOrLoops : [loopOrLoops];
    const valid = loops.filter((l) => l.length >= 3);
    if (!valid.length || !(spacing > 0)) return [];
    const a = (angleDeg * Math.PI) / 180;
    const ca = Math.cos(a), sa = Math.sin(a);
    const rots = valid.map((l) => l.map(([x, y]) => [x * ca + y * sa, -x * sa + y * ca]));
    let vmin = Infinity, vmax = -Infinity;
    rots.forEach((rl) => rl.forEach(([, v]) => { if (v < vmin) vmin = v; if (v > vmax) vmax = v; }));
    if (vmax - vmin < 1e-6) return [];
    if ((vmax - vmin) / spacing > 40) spacing = (vmax - vmin) / 40;
    const out = [];
    for (let v = vmin + spacing * 0.5; v < vmax; v += spacing) {
        const xs = [];
        rots.forEach((rot) => {
            const n = rot.length;
            for (let i = 0; i < n; i++) {
                const [u1, v1] = rot[i], [u2, v2] = rot[(i + 1) % n];
                if ((v1 <= v && v < v2) || (v2 <= v && v < v1)) {
                    xs.push(u1 + ((u2 - u1) * (v - v1)) / (v2 - v1));
                }
            }
        });
        xs.sort((p, q) => p - q);
        for (let k = 0; k + 1 < xs.length; k += 2) {
            if (xs[k + 1] - xs[k] < 1e-4) continue;
            out.push(xs[k] * ca - v * sa, xs[k] * sa + v * ca,
                     xs[k + 1] * ca - v * sa, xs[k + 1] * sa + v * ca);
        }
    }
    return out;
}

function _pointInLoop2(pt, loop) {
    const [x, y] = pt;
    let inside = false;
    const n = loop.length;
    for (let i = 0; i < n; i++) {
        const [x1, y1] = loop[i], [x2, y2] = loop[(i + 1) % n];
        if ((y1 <= y && y < y2) || (y2 <= y && y < y1)) {
            if (x1 + ((x2 - x1) * (y - y1)) / (y2 - y1) > x) inside = !inside;
        }
    }
    return inside;
}

// Rebana la sopa de triángulos de un cuerpo con el plano n·p + w = 0 y
// devuelve los lazos cerrados de la intersección (arrays de puntos 3D).
function _sliceBody(pos, n, w) {
    const segs = [];
    const P = (t, k) => [pos[t + k * 3], pos[t + k * 3 + 1], pos[t + k * 3 + 2]];
    for (let t = 0; t < pos.length; t += 9) {
        const p = [P(t, 0), P(t, 1), P(t, 2)];
        const d = p.map((q) => n.x * q[0] + n.y * q[1] + n.z * q[2] + w);
        const cut = [];
        for (let k = 0; k < 3; k++) {
            const k2 = (k + 1) % 3;
            if ((d[k] < 0 && d[k2] >= 0) || (d[k2] < 0 && d[k] >= 0)) {
                const s = d[k] / (d[k] - d[k2]);
                cut.push([p[k][0] + (p[k2][0] - p[k][0]) * s,
                          p[k][1] + (p[k2][1] - p[k][1]) * s,
                          p[k][2] + (p[k2][2] - p[k][2]) * s]);
            }
        }
        if (cut.length === 2) segs.push(cut);
    }
    // encadenar segmentos en lazos (llaves cuantizadas: los bordes compartidos
    // producen exactamente el mismo punto flotante, la cuantización es red de
    // seguridad)
    const key = (q) => `${Math.round(q[0] * 50)}|${Math.round(q[1] * 50)}|${Math.round(q[2] * 50)}`;
    const adj = new Map();
    segs.forEach((s, i) => {
        for (const end of [0, 1]) {
            const k = key(s[end]);
            if (!adj.has(k)) adj.set(k, []);
            adj.get(k).push({ i, end });
        }
    });
    const used = new Array(segs.length).fill(false);
    const loops = [];
    for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const loop = [segs[i][0], segs[i][1]];
        let guard = 0;
        while (guard++ < segs.length + 2) {
            const kEnd = key(loop[loop.length - 1]);
            const cands = (adj.get(kEnd) || []).filter((c) => !used[c.i]);
            if (!cands.length) break;
            const c = cands[0];
            used[c.i] = true;
            loop.push(segs[c.i][c.end === 0 ? 1 : 0]);
            if (key(loop[loop.length - 1]) === key(loop[0])) { loop.pop(); break; }
        }
        if (loop.length >= 3 && key(segs[i][0]) === key(loop[0])) loops.push(loop);
    }
    return loops;
}

function _updateCaps(viewer) {
    const THREE = window.THREE;
    _clearCaps(viewer);
    try {
        const planes = _getActivePlanes(viewer);
        _capHash = _planesHash(planes);
        if (!planes.length || !_bodies.size) { viewer.impl.invalidate(false, false, true); return; }
        for (const pl of planes) {
            const len = Math.hypot(pl.x, pl.y, pl.z) || 1;
            const n = { x: pl.x / len, y: pl.y / len, z: pl.z / len };
            const w = pl.w / len;
            // base ortonormal del plano (u horizontal si se puede, v el resto)
            const up = Math.abs(n.z) < 0.92 ? [0, 0, 1] : [1, 0, 0];
            let u = [up[1] * n.z - up[2] * n.y, up[2] * n.x - up[0] * n.z, up[0] * n.y - up[1] * n.x];
            const ul = Math.hypot(u[0], u[1], u[2]) || 1;
            u = [u[0] / ul, u[1] / ul, u[2] / ul];
            const v = [n.y * u[2] - n.z * u[1], n.z * u[0] - n.x * u[2], n.x * u[1] - n.y * u[0]];
            const eps = Math.max(0.5, 0.002 * _upm); // separar la tapa del plano (sin z-fight)

            _bodies.forEach((entry) => {
                if (!entry.pos) return;
                if (entry.meshes[0] && entry.meshes[0].visible === false) return;
                const rawLoops = _sliceBody(entry.pos, n, w);
                // Agrupar por CONTENCIÓN: el lazo mayor es la cara; los lazos
                // contenidos son HUECOS (el túnel del box) — la tapa se perfora
                // y el rayado par-impar los respeta (nada cruza la estructura).
                const items = [];
                for (const loop of rawLoops) {
                    const loop2d = loop.map((p) => [p[0] * u[0] + p[1] * u[1] + p[2] * u[2],
                                                    p[0] * v[0] + p[1] * v[1] + p[2] * v[2]]);
                    let area = 0;
                    for (let i = 0; i < loop2d.length; i++) {
                        const [x1, y1] = loop2d[i], [x2, y2] = loop2d[(i + 1) % loop2d.length];
                        area += x1 * y2 - x2 * y1;
                    }
                    if (Math.abs(area / 2) < 0.01 * _upm * _upm) continue; // astillas < 0.01 m²
                    let l2 = loop2d, l3 = loop;
                    if (area < 0) { l2 = [...loop2d].reverse(); l3 = [...loop].reverse(); }
                    let cx = 0, cy = 0;
                    l2.forEach(([x, y]) => { cx += x; cy += y; });
                    items.push({ l2, l3, absArea: Math.abs(area / 2), c: [cx / l2.length, cy / l2.length] });
                }
                items.sort((a, b) => b.absArea - a.absArea);
                const groups = [];
                for (const it of items) {
                    const host = groups.find((g) => _pointInLoop2(it.c, g.l2));
                    if (host) host.holes.push(it);
                    else groups.push({ ...it, holes: [] });
                }

                for (const grp of groups) {
                    const { l2, l3 } = grp;
                    const holes2 = grp.holes.map((h) => h.l2);
                    const off = (p) => [p[0] - n.x * eps, p[1] - n.y * eps, p[2] - n.z * eps];

                    // 1) relleno casi sólido de la cara, PERFORADO en los huecos
                    let tris = _earClipJS(l2);
                    if (holes2.length && tris.length) {
                        tris = tris.filter(([i0, i1, i2]) => {
                            const tcx = (l2[i0][0] + l2[i1][0] + l2[i2][0]) / 3;
                            const tcy = (l2[i0][1] + l2[i1][1] + l2[i2][1]) / 3;
                            return !holes2.some((h) => _pointInLoop2([tcx, tcy], h));
                        });
                    }
                    if (tris.length) {
                        const fp = new Float32Array(tris.length * 9);
                        tris.forEach((tri, ti) => {
                            tri.forEach((idx, k) => {
                                const p = off(l3[idx]);
                                fp[ti * 9 + k * 3] = p[0]; fp[ti * 9 + k * 3 + 1] = p[1]; fp[ti * 9 + k * 3 + 2] = p[2];
                            });
                        });
                        const fg = new THREE.BufferGeometry();
                        fg.setAttribute
                            ? fg.setAttribute('position', new THREE.BufferAttribute(fp, 3))
                            : fg.addAttribute('position', new THREE.BufferAttribute(fp, 3));
                        const fm = new THREE.MeshBasicMaterial({
                            color: parseInt(entry.colorHex.slice(1), 16),
                            transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide,
                        });
                        const mesh = new THREE.Mesh(fg, fm);
                        viewer.overlays.addMesh(mesh, OVERLAY);
                        _capMeshes.push(mesh);
                    }

                    // 2) rayado por tipo dentro de la cara (par-impar con huecos)
                    const hs = _hatchJS([l2, ...holes2], entry.kind === 'corte' ? 45 : 135, 0.6 * _upm);
                    if (hs.length >= 4) {
                        const hp = new Float32Array((hs.length / 4) * 6);
                        for (let i = 0, o = 0; i < hs.length; i += 4, o += 6) {
                            const p1 = off([u[0] * hs[i] + v[0] * hs[i + 1] - n.x * w,
                                            u[1] * hs[i] + v[1] * hs[i + 1] - n.y * w,
                                            u[2] * hs[i] + v[2] * hs[i + 1] - n.z * w]);
                            const p2 = off([u[0] * hs[i + 2] + v[0] * hs[i + 3] - n.x * w,
                                            u[1] * hs[i + 2] + v[1] * hs[i + 3] - n.y * w,
                                            u[2] * hs[i + 2] + v[2] * hs[i + 3] - n.z * w]);
                            hp[o] = p1[0]; hp[o + 1] = p1[1]; hp[o + 2] = p1[2];
                            hp[o + 3] = p2[0]; hp[o + 4] = p2[1]; hp[o + 5] = p2[2];
                        }
                        const hg = new THREE.BufferGeometry();
                        hg.setAttribute
                            ? hg.setAttribute('position', new THREE.BufferAttribute(hp, 3))
                            : hg.addAttribute('position', new THREE.BufferAttribute(hp, 3));
                        const hm = new THREE.LineBasicMaterial({
                            color: _shade(entry.colorHex, 0.3), transparent: true, opacity: 0.95, depthWrite: false,
                        });
                        const seg = THREE.LineSegments ? new THREE.LineSegments(hg, hm) : new THREE.Line(hg, hm, THREE.LinePieces);
                        viewer.overlays.addMesh(seg, OVERLAY);
                        _capMeshes.push(seg);
                    }

                    // 3) contornos de la cara: exterior + huecos
                    const om = new THREE.LineBasicMaterial({
                        color: _shade(entry.colorHex, 0.3), transparent: true, opacity: 1, depthWrite: false,
                    });
                    for (const lp of [l3, ...grp.holes.map((h) => h.l3)]) {
                        const closed = lp.map(off);
                        closed.push(closed[0]);
                        const og = new THREE.BufferGeometry();
                        const op = new Float32Array(closed.length * 3);
                        closed.forEach((p, i) => { op[i * 3] = p[0]; op[i * 3 + 1] = p[1]; op[i * 3 + 2] = p[2]; });
                        og.setAttribute
                            ? og.setAttribute('position', new THREE.BufferAttribute(op, 3))
                            : og.addAttribute('position', new THREE.BufferAttribute(op, 3));
                        const oline = new THREE.Line(og, om);
                        viewer.overlays.addMesh(oline, OVERLAY);
                        _capMeshes.push(oline);
                    }
                }
            });
        }
    } catch (err) {
        console.warn('[Holograma] tapas de corte:', err);
    }
    try { viewer.impl.invalidate(false, false, true); } catch { /* noop */ }
}

function _scheduleCapRebuild(viewer) {
    // limpiar YA (la tapa vieja no debe quedarse flotando mientras arrastras)
    _clearCaps(viewer);
    try { viewer.impl.invalidate(false, false, true); } catch { /* noop */ }
    if (_capTimer) clearTimeout(_capTimer);
    _capTimer = setTimeout(() => _updateCaps(viewer), 120);
}

function _attachCapListener(viewer) {
    if (_capListener) return;
    const EV = window.Autodesk?.Viewing?.CUTPLANES_CHANGE_EVENT || 'cutplanes-change';
    // GUARD anti-parpadeo: el 4D/heatmap disparan este evento en ráfaga sin
    // que el corte cambie de verdad — solo reconstruir si el hash difiere.
    _capListener = () => {
        const h = _planesHash(_getActivePlanes(viewer));
        if (h !== _capHash) _scheduleCapRebuild(viewer);
    };
    try { viewer.addEventListener(EV, _capListener); } catch { /* noop */ }
    // Respaldo: la extensión Autodesk.Section actualiza su set de planos y en
    // algunos builds el evento no llega — comparar los planos cada 400 ms y
    // reconstruir solo si cambiaron (barato: 4 floats por plano).
    _capPoll = setInterval(() => {
        const h = _planesHash(_getActivePlanes(viewer));
        if (h !== _capHash) _scheduleCapRebuild(viewer);
    }, 400);
}

function _detachCapListener(viewer) {
    const EV = window.Autodesk?.Viewing?.CUTPLANES_CHANGE_EVENT || 'cutplanes-change';
    try { if (_capListener) viewer.removeEventListener(EV, _capListener); } catch { /* noop */ }
    _capListener = null;
    if (_capTimer) { clearTimeout(_capTimer); _capTimer = null; }
    if (_capPoll) { clearInterval(_capPoll); _capPoll = null; }
    _capHash = '';
}

export function clearGhostEarthworks(viewer) {
    if (!viewer) { _bodies = new Map(); _capMeshes = []; return; }
    _detachCapListener(viewer);
    _clearCaps(viewer);
    _bodies.forEach((entry) => {
        entry.meshes.forEach((m) => {
            try { viewer.overlays.removeMesh(m, OVERLAY); } catch { /* noop */ }
            try {
                m.geometry?.dispose?.();
                m.material?.dispose?.();
            } catch { /* noop */ }
        });
        entry.matNames.forEach((n) => {
            try { viewer.impl.matman().removeMaterial(n); } catch { /* noop */ }
        });
    });
    _bodies = new Map();
    try { viewer.impl.invalidate(false, false, true); } catch { /* noop */ }
}

// Oculta/muestra UN cuerpo (fila de la leyenda) sin redibujar nada.
export function setGhostBodyVisible(viewer, id, visible) {
    const entry = _bodies.get(id);
    if (!entry) return;
    entry.meshes.forEach((m) => { m.visible = !!visible; });
    _updateCaps(viewer); // la tapa del cuerpo oculto también debe desaparecer
    try { viewer.impl.invalidate(false, false, true); } catch { /* noop */ }
}

/**
 * payload: respuesta de /api/civil/earthworks-mesh
 *   { ringSize, kinds: { corte: { volume, bodies: [{material,label,vertices,indices,ringBases,volume}] } } }
 * Devuelve { volumes: {corte,relleno}, bodies: [{id,kind,label,color,volume,stations}] } o null.
 */
export function drawGhostEarthworks(viewer, payload) {
    const THREE = window.THREE;
    if (!viewer || !THREE || !payload?.kinds) return null;
    const toViewer = _makeConverter(viewer);
    if (!toViewer) return null;

    clearGhostEarthworks(viewer);
    _ensureOverlay(viewer);

    // unidades del visor por metro (para espaciar el rayado de las tapas)
    try {
        const a0 = toViewer(0, 0, 0), b0 = toViewer(1, 0, 0);
        if (a0 && b0) _upm = a0.distanceTo(b0) || 1000;
    } catch { _upm = 1000; }

    const ringN = Number(payload.ringSize) || 64;
    const volumes = {};
    const legend = [];
    const diag = [];

    Object.entries(payload.kinds).forEach(([kind, data]) => {
        const palette = PALETTES[kind] || PALETTES.corte;
        (data?.bodies || []).forEach((body, bi) => {
            const verts = body?.vertices || [];
            const idx = body?.indices || [];
            if (verts.length < 9 || idx.length < 3) return;

            // Convertir vértices una sola vez (metros absolutos → visor)
            const vcount = Math.floor(verts.length / 3);
            const pts = new Array(vcount);
            for (let i = 0; i < vcount; i++) {
                pts[i] = toViewer(verts[i * 3], verts[i * 3 + 1], verts[i * 3 + 2]);
                if (!pts[i]) return;
            }

            const colorHex = palette[bi % palette.length];
            const color = parseInt(colorHex.slice(1), 16);

            // Triángulos SIN indexar (sopa) + SOMBREADO por cara con luz fija:
            // el color por vértice hace que el cuerpo se lea como SÓLIDO con
            // volumen (la niebla de 7 vidrios planos superpuestos no se
            // distingue; era la queja del supervisor).
            const cr = ((color >> 16) & 255) / 255;
            const cg = ((color >> 8) & 255) / 255;
            const cb = (color & 255) / 255;
            const LX = 0.35, LY = 0.22, LZ = 0.91; // luz fija ~cenital
            const pos = new Float32Array(idx.length * 3);
            const col = new Float32Array(idx.length * 3);
            for (let t = 0; t < idx.length; t += 3) {
                const p1 = pts[idx[t]], p2 = pts[idx[t + 1]], p3 = pts[idx[t + 2]];
                if (!p1 || !p2 || !p3) return;
                const ax = p2.x - p1.x, ay = p2.y - p1.y, az = p2.z - p1.z;
                const bx = p3.x - p1.x, by = p3.y - p1.y, bz = p3.z - p1.z;
                let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
                const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
                const d = Math.abs((nx * LX + ny * LY + nz * LZ) / nl);
                const sh = 0.45 + 0.55 * d;
                for (let k = 0; k < 3; k++) {
                    const p = [p1, p2, p3][k];
                    pos[(t + k) * 3] = p.x; pos[(t + k) * 3 + 1] = p.y; pos[(t + k) * 3 + 2] = p.z;
                    col[(t + k) * 3] = cr * sh; col[(t + k) * 3 + 1] = cg * sh; col[(t + k) * 3 + 2] = cb * sh;
                }
            }
            const geom = new THREE.BufferGeometry();
            const setAttr = (name, arr) => geom.setAttribute
                ? geom.setAttribute(name, new THREE.BufferAttribute(arr, 3))
                : geom.addAttribute(name, new THREE.BufferAttribute(arr, 3));
            setAttr('position', pos);
            setAttr('color', col);

            const id = `${kind}:${body.material || bi}`;
            // pos/kind/colorHex quedan guardados para las tapas dinámicas de corte
            const entry = { meshes: [], matNames: [], pos, kind, colorHex };
            _bodies.set(id, entry);
            const add = (obj) => { viewer.overlays.addMesh(obj, OVERLAY); entry.meshes.push(obj); };

            // Jerarquía de opacidad por CONTENCIÓN: el corte es la envolvente
            // (vidrio suave); los rellenos, interiores, van cuasi-sólidos.
            // Sin pasada rayos-X: era la mayor fuente de niebla.
            const solidMat = new THREE.MeshBasicMaterial({
                transparent: true, opacity: kind === 'corte' ? 0.14 : 0.5,
                depthWrite: false, side: THREE.DoubleSide,
                vertexColors: THREE.VertexColors !== undefined ? THREE.VertexColors : true,
            });
            _registerForCutplanes(viewer, solidMat, entry);
            add(new THREE.Mesh(geom, solidMat));

            // Marco de sección por estación. Preferencia: el CONTORNO EXACTO
            // del hatch (vértices originales de Civil, sin remuestrear) que el
            // backend manda en body.outlines; fallback: aros remuestreados.
            // depthTest TRUE: el MODELO sólido oculta los trazos (nada de
            // arañazos sobre el concreto); la piel del holograma NO los oculta
            // porque no escribe profundidad — se leen dentro del fantasma.
            const lineMat = new THREE.LineBasicMaterial({
                color: _shade(colorHex, 0.45), transparent: true, opacity: 0.95,
                depthWrite: false,
            });
            _registerForCutplanes(viewer, lineMat, entry);
            const addLoop = (loopPts) => {
                if (loopPts.length < 2) return;
                const closed = loopPts.concat([loopPts[0]]);
                const g = new THREE.BufferGeometry();
                if (g.setFromPoints) g.setFromPoints(closed);
                else {
                    const rp = new Float32Array(closed.length * 3);
                    closed.forEach((p, i) => { rp[i * 3] = p.x; rp[i * 3 + 1] = p.y; rp[i * 3 + 2] = p.z; });
                    g.addAttribute('position', new THREE.BufferAttribute(rp, 3));
                }
                add(new THREE.Line(g, lineMat));
            };

            const outlines = Array.isArray(body.outlines) ? body.outlines : null;
            if (outlines && outlines.length) {
                for (const flat of outlines) {
                    const m = Math.floor((flat?.length || 0) / 3);
                    if (m < 3) continue;
                    const loopPts = [];
                    for (let i = 0; i < m; i++) {
                        const p = toViewer(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]);
                        if (!p) { loopPts.length = 0; break; }
                        loopPts.push(p);
                    }
                    addLoop(loopPts);
                }

                // Rayado de lámina (hatch) dentro de cada contorno: todos los
                // segmentos del cuerpo fusionados en UN LineSegments.
                const hatches = Array.isArray(body.hatches) ? body.hatches : [];
                const segXyz = [];
                for (const flat of hatches) {
                    const m = Math.floor((flat?.length || 0) / 3);
                    for (let i = 0; i + 1 < m; i += 2) {
                        const p1 = toViewer(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]);
                        const p2 = toViewer(flat[(i + 1) * 3], flat[(i + 1) * 3 + 1], flat[(i + 1) * 3 + 2]);
                        if (p1 && p2) segXyz.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
                    }
                }
                const addSegs = (xyz, opacity) => {
                    if (xyz.length < 6) return;
                    const hg = new THREE.BufferGeometry();
                    const hp = new Float32Array(xyz);
                    hg.setAttribute
                        ? hg.setAttribute('position', new THREE.BufferAttribute(hp, 3))
                        : hg.addAttribute('position', new THREE.BufferAttribute(hp, 3));
                    const hatchMat = new THREE.LineBasicMaterial({
                        color: _shade(colorHex, 0.5), transparent: true, opacity,
                        depthWrite: false,
                    });
                    _registerForCutplanes(viewer, hatchMat, entry);
                    const segsObj = THREE.LineSegments
                        ? new THREE.LineSegments(hg, hatchMat)
                        : new THREE.Line(hg, hatchMat, THREE.LinePieces);
                    add(segsObj);
                };
                addSegs(segXyz, 0.55);

                // Costillas INTERPOLADAS entre secciones reales (la hipótesis
                // lineal del prismoide dibujada): contorno y rayado tenues,
                // para que el cuerpo se lea CONTINUO sin opacar las reales.
                const midLineMat = new THREE.LineBasicMaterial({
                    color: _shade(colorHex, 0.5), transparent: true, opacity: 0.35,
                    depthWrite: false,
                });
                _registerForCutplanes(viewer, midLineMat, entry);
                for (const flat of (Array.isArray(body.midOutlines) ? body.midOutlines : [])) {
                    const m = Math.floor((flat?.length || 0) / 3);
                    if (m < 3) continue;
                    const loopPts = [];
                    for (let i = 0; i < m; i++) {
                        const p = toViewer(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]);
                        if (!p) { loopPts.length = 0; break; }
                        loopPts.push(p);
                    }
                    if (loopPts.length < 3) continue;
                    const closed = loopPts.concat([loopPts[0]]);
                    const g = new THREE.BufferGeometry();
                    if (g.setFromPoints) g.setFromPoints(closed);
                    else {
                        const rp = new Float32Array(closed.length * 3);
                        closed.forEach((p, i) => { rp[i * 3] = p.x; rp[i * 3 + 1] = p.y; rp[i * 3 + 2] = p.z; });
                        g.addAttribute('position', new THREE.BufferAttribute(rp, 3));
                    }
                    add(new THREE.Line(g, midLineMat));
                }
                const midXyz = [];
                for (const flat of (Array.isArray(body.midHatches) ? body.midHatches : [])) {
                    const m = Math.floor((flat?.length || 0) / 3);
                    for (let i = 0; i + 1 < m; i += 2) {
                        const p1 = toViewer(flat[i * 3], flat[i * 3 + 1], flat[i * 3 + 2]);
                        const p2 = toViewer(flat[(i + 1) * 3], flat[(i + 1) * 3 + 1], flat[(i + 1) * 3 + 2]);
                        if (p1 && p2) midXyz.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
                    }
                }
                addSegs(midXyz, 0.28);
            } else {
                const rN = Number(body.ringSize) || ringN;
                const ringBases = Array.isArray(body.ringBases) ? body.ringBases : [];
                for (const base of ringBases) {
                    if (base + rN > vcount) continue;
                    const loopPts = [];
                    for (let i = 0; i < rN; i++) loopPts.push(pts[base + i]);
                    addLoop(loopPts);
                }
            }

            legend.push({
                id, kind, color: colorHex,
                label: body.label || body.material || kind,
                volume: body.volume, stations: body.stations,
            });
            const nHatch = (body.hatches || []).reduce((s, h) => s + Math.floor((h?.length || 0) / 6), 0);
            diag.push(`${body.label}: ${(body.outlines || []).length} contornos, ${nHatch} rayas`);
        });
        if (data?.volume != null) volumes[kind] = data.volume;
    });

    if (!legend.length) return null;
    console.log(`[Holograma] ${diag.join(' | ')}`);
    // tapas de corte: recalcular al mover el plano y también ya mismo (por si
    // hay un corte activo al encender la capa)
    _attachCapListener(viewer);
    _updateCaps(viewer);
    try { viewer.impl.invalidate(false, false, true); } catch { /* noop */ }
    return { volumes, bodies: legend };
}

export function hasGhostEarthworks() {
    return _bodies.size > 0;
}
