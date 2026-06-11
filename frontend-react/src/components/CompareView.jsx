import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../utils/apiFetch';

/**
 * CompareView — Comparador (contractual vs avance), estilo ACC Compare pero propio.
 *
 *  - Setup minimalista: modelo/documento + VERSION ACC por lado (como el dialogo
 *    "Comparar documentos" de ACC), con swap A<->B.
 *  - Diff de DATOS en PostgreSQL por external_id (+ diff 5D valorizado).
 *  - Si una version historica no esta extraida, se extrae automaticamente a un
 *    scope temporal ('__cmp__') sin tocar el inventario del frente real.
 *  - Vista: dos visores LMV sincronizados; verde agregado / rojo eliminado /
 *    ambar modificado; hover = tooltip 5D; click = seleccion espejo.
 */

const COLORS = {
    added: [0.22, 0.65, 0.15],
    removed: [0.89, 0.29, 0.29],
    modified: [0.94, 0.62, 0.15],
};

// ── Design tokens (minimalista profesional, alineado al dark theme de la app) ──
const T = {
    bg: '#15181d', panel: '#1b2026', panelSoft: '#20262d',
    border: '1px solid rgba(255,255,255,0.08)', borderSoft: '1px solid rgba(255,255,255,0.05)',
    text: '#ccd2d9', muted: '#8a93a0', faint: '#5d6672',
    accent: '#3d7eff', green: '#5fbf67', red: '#e06a6a', amber: '#dba94d',
    radius: 8,
};

const S = {
    overlay: { position: 'fixed', inset: 0, zIndex: 9000, background: T.bg, display: 'flex', flexDirection: 'column', color: T.text, fontFamily: 'inherit', fontSize: 13 },
    // setup
    setupWrap: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
    setupCard: { width: 'min(860px, 94vw)', background: T.panel, border: T.border, borderRadius: 12, padding: '26px 30px' },
    sideCard: { flex: 1, background: T.panelSoft, border: T.borderSoft, borderRadius: T.radius, padding: '16px 18px', minWidth: 0 },
    label: { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.muted, marginBottom: 10, fontWeight: 600 },
    select: { width: '100%', background: T.bg, color: T.text, border: T.border, borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', marginBottom: 10 },
    btnPrimary: { background: T.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '9px 22px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
    btnGhost: { background: 'transparent', color: T.muted, border: T.border, borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' },
    btnIcon: { background: 'transparent', color: T.muted, border: T.border, borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    // view
    topBar: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: T.border, background: T.panel },
    chipSide: { fontSize: 12, padding: '4px 10px', borderRadius: 6, background: T.panelSoft, border: T.borderSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 },
    viewers: { flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, minHeight: 0, background: 'rgba(255,255,255,0.06)' },
    pane: { position: 'relative', background: '#0e1115', overflow: 'hidden' },
    paneTag: { position: 'absolute', top: 10, left: 12, zIndex: 5, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', padding: '3px 10px', borderRadius: 5, background: 'rgba(13,16,20,0.75)', border: T.borderSoft },
    statusBar: { padding: '5px 14px', fontSize: 12, color: T.muted, borderTop: T.borderSoft, background: T.panel },
    bottom: { borderTop: T.border, padding: '10px 14px', display: 'flex', gap: 16, alignItems: 'flex-start', maxHeight: 230, background: T.panel },
    pill: (color, active) => ({ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12.5, padding: '6px 12px', borderRadius: 6, border: active ? `1px solid ${color}` : T.border, color: T.text, background: active ? 'rgba(255,255,255,0.04)' : 'transparent', whiteSpace: 'nowrap' }),
    dot: (color) => ({ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }),
    list: { flex: 1, overflowY: 'auto', maxHeight: 180, fontSize: 12.5 },
    listItem: { padding: '4px 8px', borderBottom: T.borderSoft, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: T.muted },
    detail: { flex: 1.2, overflowY: 'auto', maxHeight: 180, fontSize: 12.5, background: T.panelSoft, borderRadius: T.radius, padding: '10px 12px', border: T.borderSoft },
};

export default function CompareView({ BACKEND_URL, onExit }) {
    const [phase, setPhase] = useState('setup');           // 'setup' | 'view'
    const [models, setModels] = useState([]);
    const [side, setSide] = useState({
        a: { sel: '', versions: [], vUrn: '', loadingV: false },
        b: { sel: '', versions: [], vUrn: '', loadingV: false },
    });
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [diff, setDiff] = useState(null);
    const [fiveD, setFiveD] = useState(null);
    const [activeList, setActiveList] = useState(null);
    const [detail, setDetail] = useState(null);
    const [tip, setTip] = useState(null);
    const contA = useRef(null);
    const contB = useRef(null);
    const tipEl = useRef(null);
    const fiveDRef = useRef(null);
    const scopesRef = useRef(null);
    const vs = useRef({ a: null, b: null, maps: {}, rev: {}, syncing: false, selSyncing: false });

    useEffect(() => {
        apiFetch(`${BACKEND_URL}/api/config/project`)
            .then(r => r.json())
            .then(cfg => setModels(cfg.models || []))
            .catch(() => setStatus('No se pudo cargar la lista de modelos.'));
    }, [BACKEND_URL]);

    const frentes = useMemo(() => [...new Set(models.map(m => m.appProjectId).filter(Boolean))], [models]);
    const byFrente = useMemo(() => {
        const g = {};
        models.forEach(m => { (g[m.appProjectId || 'otros'] = g[m.appProjectId || 'otros'] || []).push(m); });
        return g;
    }, [models]);

    // ── Seleccion por lado: al elegir modelo, cargar sus versiones ACC ──
    const pickModel = (key, val) => {
        setSide(prev => ({ ...prev, [key]: { sel: val, versions: [], vUrn: '', loadingV: val && !val.startsWith('frente:') } }));
        if (!val || val.startsWith('frente:')) return;
        const m = models.find(x => String(x.id) === val);
        if (!m) return;
        apiFetch(`${BACKEND_URL}/api/compare/versions?model_id=${encodeURIComponent(val)}`)
            .then(r => r.json())
            .then(d => {
                const versions = d.versions || [{ versionNumber: m.versionNumber, urn: m.urn, isCurrent: true }];
                const current = versions.find(v => v.isCurrent) || versions[0];
                setSide(prev => ({ ...prev, [key]: { ...prev[key], versions, vUrn: current ? current.urn : m.urn, loadingV: false } }));
            })
            .catch(() => setSide(prev => ({
                ...prev,
                [key]: { ...prev[key], versions: [{ versionNumber: m.versionNumber, urn: m.urn, isCurrent: true }], vUrn: m.urn, loadingV: false }
            })));
    };

    const pickVersion = (key, vUrn) => setSide(prev => ({ ...prev, [key]: { ...prev[key], vUrn } }));
    const swapSides = () => setSide(prev => ({ a: prev.b, b: prev.a }));

    const scopeOf = (s) => {
        if (!s.sel) return null;
        if (s.sel.startsWith('frente:')) return { type: 'frente', value: s.sel.slice(7) };
        return s.vUrn ? { type: 'source', value: s.vUrn } : null;
    };
    const labelOf = (s) => {
        if (!s.sel) return '';
        if (s.sel.startsWith('frente:')) return `Frente ${s.sel.slice(7)}`;
        const m = models.find(x => String(x.id) === s.sel);
        const v = s.versions.find(x => x.urn === s.vUrn);
        return m ? `${m.name}${v && v.versionNumber ? ` · v${v.versionNumber}` : ''}` : '';
    };

    // ── Visores ──
    const makeViewer = (container) => {
        const v = new window.Autodesk.Viewing.GuiViewer3D(container, {});
        v.start();
        return v;
    };
    const loadUrn = (viewer, urn) => new Promise((resolve, reject) => {
        window.Autodesk.Viewing.Document.load('urn:' + urn, (doc) => {
            viewer.loadDocumentNode(doc, doc.getRoot().getDefaultGeometry()).then(resolve).catch(reject);
        }, (err) => reject(new Error('No se pudo cargar esa versión (¿traducida en ACC?): ' + err)));
    });

    const wireSync = useCallback(() => {
        const { a, b } = vs.current;
        if (!a || !b || vs.current.synced) return;
        const sync = (src, dst) => () => {
            if (vs.current.syncing) return;
            vs.current.syncing = true;
            try {
                const nav = src.navigation;
                dst.navigation.setView(nav.getPosition(), nav.getTarget());
                dst.navigation.setCameraUpVector(nav.getCameraUpVector());
            } catch (e) { /* montando */ }
            vs.current.syncing = false;
        };
        a.addEventListener(window.Autodesk.Viewing.CAMERA_CHANGE_EVENT, sync(a, b));
        b.addEventListener(window.Autodesk.Viewing.CAMERA_CHANGE_EVENT, sync(b, a));
        vs.current.synced = true;
    }, []);

    const wireHover = useCallback(() => {
        const Av = window.Autodesk.Viewing;
        ['a', 'b'].forEach(k => {
            const v = vs.current[k];
            if (!v || v.__hoverWired) return;
            v.__hoverWired = true;
            v.addEventListener(Av.OBJECT_UNDER_MOUSE_CHANGED, (ev) => {
                const dbId = ev.dbId;
                const rev = vs.current.rev[k];
                if (!dbId || dbId <= 0 || !rev || !rev[dbId]) { setTip(null); return; }
                const ext = rev[dbId];
                const data = fiveDRef.current && fiveDRef.current.byElement ? fiveDRef.current.byElement[ext] : null;
                setTip({ side: k, ext, data });
            });
        });
    }, []);

    const wireMirror = useCallback(() => {
        const Av = window.Autodesk.Viewing;
        ['a', 'b'].forEach(k => {
            const v = vs.current[k];
            if (!v || v.__selWired) return;
            v.__selWired = true;
            v.addEventListener(Av.SELECTION_CHANGED_EVENT, (ev) => {
                if (vs.current.selSyncing) return;
                const dbId = ev.dbIdArray && ev.dbIdArray[0];
                const other = k === 'a' ? 'b' : 'a';
                const ov = vs.current[other];
                vs.current.selSyncing = true;
                try {
                    if (!dbId) { if (ov) ov.clearSelection(); }
                    else {
                        const ext = vs.current.rev[k] ? vs.current.rev[k][dbId] : null;
                        const odb = ext && vs.current.maps[other] ? vs.current.maps[other][ext] : null;
                        if (ov && ov.model) { if (odb) ov.select([odb]); else ov.clearSelection(); }
                        if (ext) openDetailRef.current({ id: ext, name: 'Elemento …' + String(ext).slice(-10) });
                    }
                } finally { vs.current.selSyncing = false; }
            });
        });
    }, []);

    const themeSide = (viewer, map, list, rgb) => {
        if (!viewer || !viewer.model || !map) return;
        const color = new window.THREE.Vector4(rgb[0], rgb[1], rgb[2], 1);
        list.forEach(it => { const dbId = map[it.id]; if (dbId) viewer.setThemingColor(dbId, color, viewer.model, true); });
    };

    // ── Extraccion bajo demanda de versiones historicas (scope temporal) ──
    const ensureExtracted = async (urn, label) => {
        const chk = await apiFetch(`${BACKEND_URL}/api/compare/extracted?urn=${encodeURIComponent(urn)}`).then(r => r.json());
        if (chk.extracted) return;
        setStatus(`Extrayendo metadata de ${label} (versión histórica)…`);
        const res = await apiFetch(`${BACKEND_URL}/api/inventory/extract`, {
            method: 'POST', body: JSON.stringify({ urn, target_urn: '__cmp__' })
        });
        const { job_id } = await res.json();
        if (!job_id) throw new Error('No se pudo iniciar la extracción de ' + label);
        for (let i = 0; i < 150; i++) {                       // hasta ~7.5 min
            await new Promise(r => setTimeout(r, 3000));
            const st = await apiFetch(`${BACKEND_URL}/api/inventory/extract/status/${job_id}`).then(r => r.json()).catch(() => null);
            if (st && st.status === 'success') return;
            if (st && st.status === 'error') throw new Error(`Extracción de ${label} falló: ${st.message}`);
            if (st && typeof st.progress === 'number') setStatus(`Extrayendo ${label}… ${st.progress}%`);
        }
        throw new Error('La extracción de ' + label + ' tardó demasiado.');
    };

    // ── Comparar ──
    const runCompare = async () => {
        const sa = scopeOf(side.a);
        const sb = scopeOf(side.b);
        if (!sa || !sb) return;
        scopesRef.current = { a: sa, b: sb };
        setBusy(true); setDiff(null); setFiveD(null); fiveDRef.current = null;
        setDetail(null); setActiveList(null); setTip(null);
        setPhase('view');
        await new Promise(r => setTimeout(r, 60));            // esperar el render de los panes

        try {
            const both3D = sa.type === 'source' && sb.type === 'source';

            // 1) Asegurar que ambas versiones esten extraidas (el diff es en Postgres)
            if (sa.type === 'source') await ensureExtracted(sa.value, 'lado A');
            if (sb.type === 'source') await ensureExtracted(sb.value, 'lado B');

            // 2) Diff de datos
            setStatus('Comparando datos en PostgreSQL…');
            const res = await apiFetch(`${BACKEND_URL}/api/compare/diff`, { method: 'POST', body: JSON.stringify({ a: sa, b: sb }) });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Falló el diff');
            setDiff(d);

            // 3) Vista 3D
            if (both3D) {
                setStatus('Cargando ambas versiones…');
                if (!vs.current.a) vs.current.a = makeViewer(contA.current);
                if (!vs.current.b) vs.current.b = makeViewer(contB.current);
                await Promise.all([loadUrn(vs.current.a, sa.value), loadUrn(vs.current.b, sb.value)]);
                wireSync();

                setStatus('Pintando diferencias…');
                const mapA = await new Promise(r => vs.current.a.model.getExternalIdMapping(r));
                const mapB = await new Promise(r => vs.current.b.model.getExternalIdMapping(r));
                vs.current.maps = { a: mapA, b: mapB };
                const invert = (m) => { const out = {}; Object.keys(m || {}).forEach(k => { out[m[k]] = k; }); return out; };
                vs.current.rev = { a: invert(mapA), b: invert(mapB) };
                themeSide(vs.current.b, mapB, d.added, COLORS.added);
                themeSide(vs.current.b, mapB, d.modified, COLORS.modified);
                themeSide(vs.current.a, mapA, d.removed, COLORS.removed);
                themeSide(vs.current.a, mapA, d.modified, COLORS.modified);
                wireHover();
                wireMirror();
            }

            // 4) Diff 5D valorizado
            setStatus('Calculando diff 5D (metrados y precios)…');
            try {
                const r5 = await apiFetch(`${BACKEND_URL}/api/compare/metrados`, {
                    method: 'POST', body: JSON.stringify({ a: sa, b: sb, include_elements: both3D })
                });
                const d5 = await r5.json();
                if (r5.ok) { setFiveD(d5); fiveDRef.current = d5; }
            } catch (e5) { console.warn('[Compare] 5D no disponible:', e5); }

            setStatus(both3D
                ? 'Verde: agregado · rojo: eliminado · ámbar: modificado. Hover = diff de metrado; click = espejo.'
                : 'Diff de datos listo. El 3D se activa comparando dos modelos individuales.');
        } catch (e) {
            console.error('[Compare]', e);
            setStatus('Error: ' + e.message);
        }
        setBusy(false);
    };

    const editSelection = () => {
        ['a', 'b'].forEach(k => { try { vs.current[k] && vs.current[k].finish(); } catch (e) { /* noop */ } });
        vs.current = { a: null, b: null, maps: {}, rev: {}, syncing: false, selSyncing: false };
        setDiff(null); setFiveD(null); fiveDRef.current = null; setDetail(null); setActiveList(null); setTip(null);
        setStatus('');
        setPhase('setup');
    };

    const isolate = (k, list) => {
        const viewer = vs.current[k];
        const map = vs.current.maps[k];
        if (!viewer || !viewer.model || !map) return;
        const ids = list.map(it => map[it.id]).filter(Boolean);
        if (ids.length) viewer.isolate(ids, viewer.model);
    };
    const showAll = () => ['a', 'b'].forEach(k => { const v = vs.current[k]; if (v && v.model) v.isolate([], v.model); });

    const openDetail = async (item) => {
        try {
            const scopes = scopesRef.current;
            if (!scopes) return;
            const res = await apiFetch(`${BACKEND_URL}/api/compare/element`, {
                method: 'POST', body: JSON.stringify({ external_id: item.id, a: scopes.a, b: scopes.b })
            });
            const d = await res.json();
            const flat = (props) => {
                const out = {};
                Object.entries(props || {}).forEach(([g, sub]) => {
                    if (sub && typeof sub === 'object') Object.entries(sub).forEach(([k, v]) => { out[`${g} · ${k}`] = String(v); });
                });
                return out;
            };
            const fa = flat(d.a && d.a.properties);
            const fb = flat(d.b && d.b.properties);
            const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])];
            const changes = keys.filter(k => fa[k] !== fb[k]).map(k => ({ prop: k, a: fa[k] !== undefined ? fa[k] : '—', b: fb[k] !== undefined ? fb[k] : '—' }));
            setDetail({ name: (d.a && d.a.name) || (d.b && d.b.name) || item.name || item.id, changes });
        } catch (e) { console.error('[Compare] detalle:', e); }
    };
    const openDetailRef = useRef(openDetail);
    openDetailRef.current = openDetail;

    useEffect(() => () => {
        ['a', 'b'].forEach(k => { try { vs.current[k] && vs.current[k].finish(); } catch (e) { /* noop */ } });
    }, []);

    const puMap = useMemo(() => {
        const m = {};
        ((fiveD && fiveD.partidas) || []).forEach(p => { if (p.precio_unitario != null) m[p.codigo] = p.precio_unitario; });
        return m;
    }, [fiveD]);
    const fmtMoney = (v) => (v == null ? '—' : (v < 0 ? '−' : '+') + 'S/ ' + Math.abs(v).toLocaleString('es-PE', { maximumFractionDigits: 2 }));
    const fmtNum = (v) => Number(v || 0).toLocaleString('es-PE', { maximumFractionDigits: 3 });
    const tipRows = useMemo(() => {
        if (!tip || !tip.data) return [];
        const cods = [...new Set([...Object.keys(tip.data.a || {}), ...Object.keys(tip.data.b || {})])];
        return cods.map(c => {
            const ma = (tip.data.a && tip.data.a[c]) || 0;
            const mb = (tip.data.b && tip.data.b[c]) || 0;
            const delta = mb - ma;
            const pu = puMap[c];
            return { c, ma, mb, delta, dp: pu != null ? delta * pu : null };
        });
    }, [tip, puMap]);

    const listData = (diff && activeList && Array.isArray(diff[activeList])) ? diff[activeList] : [];

    // ── Render: selector de lado (setup) ──
    const renderSide = (key, title) => {
        const s = side[key];
        return (
            <div style={S.sideCard}>
                <div style={S.label}>{title}</div>
                <select style={S.select} value={s.sel} onChange={e => pickModel(key, e.target.value)}>
                    <option value="">Seleccionar modelo o documento…</option>
                    <optgroup label="Frentes completos (solo datos)">
                        {frentes.map(f => <option key={'f' + f} value={'frente:' + f}>Frente {f}</option>)}
                    </optgroup>
                    {Object.entries(byFrente).map(([f, ms]) => (
                        <optgroup key={f} label={f}>
                            {ms.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                        </optgroup>
                    ))}
                </select>
                <div style={{ ...S.label, marginTop: 4 }}>Versión</div>
                <select
                    style={{ ...S.select, opacity: s.versions.length ? 1 : 0.5 }}
                    value={s.vUrn}
                    disabled={!s.versions.length}
                    onChange={e => pickVersion(key, e.target.value)}
                >
                    {s.loadingV && <option>Cargando versiones…</option>}
                    {!s.loadingV && !s.versions.length && <option>{s.sel && !s.sel.startsWith('frente:') ? '—' : 'No aplica (frente completo)'}</option>}
                    {s.versions.map(v => (
                        <option key={v.urn} value={v.urn}>
                            v{v.versionNumber}{v.isCurrent ? ' · actual' : ''}{v.createTime ? ` · ${String(v.createTime).slice(0, 10)}` : ''}
                        </option>
                    ))}
                </select>
                <div style={{ fontSize: 11.5, color: T.faint, minHeight: 16 }}>
                    {s.versions.length > 1 && 'Las versiones históricas se extraen automáticamente al comparar.'}
                </div>
            </div>
        );
    };

    // ════════════════════ RENDER ════════════════════
    return (
        <div
            style={S.overlay}
            onMouseMove={(e) => {
                if (tipEl.current) {
                    tipEl.current.style.left = Math.min(e.clientX + 16, window.innerWidth - 290) + 'px';
                    tipEl.current.style.top = Math.min(e.clientY + 14, window.innerHeight - 180) + 'px';
                }
            }}
        >
            {phase === 'setup' && (
                <div style={S.setupWrap}>
                    <div style={S.setupCard}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 17, fontWeight: 600 }}>Comparar</span>
                            <button style={{ ...S.btnGhost, border: 'none', fontSize: 16, padding: 4 }} onClick={onExit} title="Cerrar">✕</button>
                        </div>
                        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 22 }}>
                            Elige el modelo o documento y la versión de cada lado. A es la base (contractual); B el avance actual.
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            {renderSide('a', 'A · Base / contractual')}
                            <button style={S.btnIcon} onClick={swapSides} title="Intercambiar lados">⇄</button>
                            {renderSide('b', 'B · Avance')}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                            <button style={S.btnGhost} onClick={onExit}>Cancelar</button>
                            <button
                                style={{ ...S.btnPrimary, opacity: (scopeOf(side.a) && scopeOf(side.b) && !busy) ? 1 : 0.45 }}
                                disabled={!scopeOf(side.a) || !scopeOf(side.b) || busy}
                                onClick={runCompare}
                            >
                                Comparar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {phase === 'view' && (
                <>
                    <div style={S.topBar}>
                        <span style={{ fontWeight: 600, fontSize: 13.5 }}>Comparador</span>
                        <span style={{ ...S.chipSide, color: T.red }} title={labelOf(side.a)}>A · {labelOf(side.a)}</span>
                        <span style={{ color: T.faint }}>→</span>
                        <span style={{ ...S.chipSide, color: T.green }} title={labelOf(side.b)}>B · {labelOf(side.b)}</span>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                            <button style={S.btnGhost} onClick={editSelection}>Editar selección</button>
                            <button style={S.btnGhost} onClick={showAll}>Mostrar todo</button>
                            <button style={S.btnGhost} onClick={onExit}>Salir</button>
                        </div>
                    </div>

                    <div style={S.viewers}>
                        <div style={S.pane}>
                            <span style={{ ...S.paneTag, color: T.red }}>A {diff ? `· ${diff.summary.total_a.toLocaleString()} elem` : ''}</span>
                            <div ref={contA} style={{ position: 'absolute', inset: 0 }} />
                        </div>
                        <div style={S.pane}>
                            <span style={{ ...S.paneTag, color: T.green }}>B {diff ? `· ${diff.summary.total_b.toLocaleString()} elem` : ''}</span>
                            <div ref={contB} style={{ position: 'absolute', inset: 0 }} />
                        </div>
                    </div>

                    <div style={S.statusBar}>{busy && <span style={{ color: T.accent }}>● </span>}{status}</div>

                    {diff && (
                        <div style={S.bottom}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
                                <button style={S.pill(T.green, activeList === 'added')} onClick={() => { setActiveList('added'); isolate('b', diff.added); }}>
                                    <span style={S.dot(T.green)} />{diff.summary.added.toLocaleString()} agregados
                                </button>
                                <button style={S.pill(T.red, activeList === 'removed')} onClick={() => { setActiveList('removed'); isolate('a', diff.removed); }}>
                                    <span style={S.dot(T.red)} />{diff.summary.removed.toLocaleString()} eliminados
                                </button>
                                <button style={S.pill(T.amber, activeList === 'modified')} onClick={() => { setActiveList('modified'); isolate('a', diff.modified); isolate('b', diff.modified); }}>
                                    <span style={S.dot(T.amber)} />{diff.summary.modified.toLocaleString()} modificados
                                </button>
                                {fiveD && fiveD.partidas && fiveD.partidas.length > 0 && (
                                    <button style={S.pill(T.accent, activeList === '5d')} onClick={() => setActiveList('5d')}>
                                        <span style={S.dot(T.accent)} />5D · {fmtMoney(fiveD.totals.delta_precio_total)}
                                    </button>
                                )}
                                <span style={{ fontSize: 11, color: T.faint, paddingLeft: 2 }}>{diff.summary.unchanged.toLocaleString()} sin cambio</span>
                            </div>

                            <div style={S.list}>
                                {activeList === null && <div style={{ color: T.faint, padding: 8 }}>Selecciona una categoría para listar y aislar sus elementos.</div>}
                                {activeList === '5d' && fiveD && (
                                    <>
                                        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 72px 72px 76px 92px', gap: 4, padding: '3px 6px', color: T.faint, fontWeight: 600, fontSize: 11, position: 'sticky', top: 0, background: T.panel }}>
                                            <span>Partida</span><span>Descripción</span><span style={{ textAlign: 'right' }}>A</span><span style={{ textAlign: 'right' }}>B</span><span style={{ textAlign: 'right' }}>Δ metrado</span><span style={{ textAlign: 'right' }}>Δ S/</span>
                                        </div>
                                        {fiveD.partidas.slice(0, 200).map(p => (
                                            <div key={p.codigo} style={{ display: 'grid', gridTemplateColumns: '90px 1fr 72px 72px 76px 92px', gap: 4, padding: '3px 6px', borderBottom: T.borderSoft, fontSize: 12 }}>
                                                <span style={{ color: T.muted }}>{p.codigo}</span>
                                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: T.text }} title={p.descripcion || ''}>{p.descripcion || '—'}</span>
                                                <span style={{ textAlign: 'right', color: T.muted }}>{fmtNum(p.metrado_a)}</span>
                                                <span style={{ textAlign: 'right', color: T.muted }}>{fmtNum(p.metrado_b)}</span>
                                                <span style={{ textAlign: 'right', color: p.delta > 0 ? T.green : p.delta < 0 ? T.red : T.faint }}>{fmtNum(p.delta)}{p.unidad ? ` ${p.unidad}` : ''}</span>
                                                <span style={{ textAlign: 'right', color: (p.delta_precio || 0) > 0 ? T.green : (p.delta_precio || 0) < 0 ? T.red : T.faint }}>{p.delta_precio == null ? '—' : fmtMoney(p.delta_precio)}</span>
                                            </div>
                                        ))}
                                        <div style={{ padding: '6px', fontSize: 11, color: T.faint }}>
                                            {fiveD.totals.con_precio}/{fiveD.totals.partidas} partidas con precio · Total <strong style={{ color: T.accent }}>{fmtMoney(fiveD.totals.delta_precio_total)}</strong>
                                        </div>
                                    </>
                                )}
                                {activeList !== '5d' && listData.slice(0, 500).map(it => (
                                    <div key={it.id} style={S.listItem} title={it.id} onClick={() => openDetail(it)}>{it.name || it.id}</div>
                                ))}
                                {activeList !== '5d' && listData.length > 500 && <div style={{ color: T.faint, padding: 6 }}>… y {listData.length - 500} más</div>}
                            </div>

                            <div style={S.detail}>
                                {!detail && <span style={{ color: T.faint }}>Haz clic en un elemento (lista o 3D) para ver qué propiedades cambiaron.</span>}
                                {detail && (
                                    <>
                                        <div style={{ fontWeight: 600, marginBottom: 6 }}>{detail.name}</div>
                                        {detail.changes.length === 0 && <div style={{ color: T.faint }}>Sin cambios de propiedades (puede ser cambio geométrico).</div>}
                                        {detail.changes.slice(0, 60).map((c, i) => (
                                            <div key={i} style={{ marginBottom: 4, borderBottom: T.borderSoft, paddingBottom: 3 }}>
                                                <div style={{ color: T.muted, fontSize: 11.5 }}>{c.prop}</div>
                                                <div><span style={{ color: T.red }}>{c.a}</span> <span style={{ color: T.faint }}>→</span> <span style={{ color: T.green }}>{c.b}</span></div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Tooltip 5D de hover */}
            <div
                ref={tipEl}
                style={{
                    position: 'fixed', zIndex: 9500, pointerEvents: 'none', display: tip ? 'block' : 'none',
                    background: 'rgba(18,22,27,0.97)', border: T.border, borderRadius: T.radius,
                    padding: '9px 12px', maxWidth: 280, fontSize: 12,
                }}
            >
                {tip && (
                    <>
                        <div style={{ fontWeight: 600, marginBottom: 4 }}>
                            …{String(tip.ext).slice(-10)} <span style={{ fontWeight: 400, color: T.faint }}>({tip.side === 'a' ? 'A' : 'B'})</span>
                        </div>
                        {tipRows.length === 0 && <div style={{ color: T.faint }}>Sin parámetros de partida (DSI).</div>}
                        {tipRows.map(r => (
                            <div key={r.c} style={{ marginBottom: 3 }}>
                                <div style={{ color: T.accent, fontSize: 11.5 }}>{r.c}</div>
                                <div style={{ color: T.muted }}>
                                    {fmtNum(r.ma)} → {fmtNum(r.mb)} · <span style={{ color: r.delta > 0 ? T.green : r.delta < 0 ? T.red : T.faint }}>Δ {fmtNum(r.delta)}</span>
                                    {r.dp != null && <span style={{ color: r.dp > 0 ? T.green : r.dp < 0 ? T.red : T.faint }}> · {fmtMoney(r.dp)}</span>}
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
}
