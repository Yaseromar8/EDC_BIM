import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { loadAlignedModels } from '../aps/utils/loadAlignedModels';

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
    added: [0.22, 0.65, 0.15],     // verde
    removed: [0.89, 0.29, 0.29],   // rojo
    modified: [0.82, 0.20, 0.85],  // magenta — distinto del material naranja de los modelos
};

// ── Design tokens (minimalista profesional, alineado al dark theme de la app) ──
const T = {
    bg: '#15181d', panel: '#1b2026', panelSoft: '#20262d',
    border: '1px solid rgba(255,255,255,0.08)', borderSoft: '1px solid rgba(255,255,255,0.05)',
    text: '#ccd2d9', muted: '#8a93a0', faint: '#5d6672',
    accent: '#3d7eff', green: '#5fbf67', red: '#e06a6a', amber: '#dba94d', magenta: '#cf57d6',
    radius: 8,
};

const S = {
    overlay: { position: 'fixed', inset: 0, zIndex: 9000, background: T.bg, display: 'flex', flexDirection: 'column', color: T.text, fontFamily: 'inherit', fontSize: 13 },
    // setup
    setupWrap: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
    setupCard: { width: 'min(980px, 94vw)', background: T.panel, border: T.border, borderRadius: 12, padding: '26px 30px' },
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

const createEmptySide = () => ({
    pickerSel: '',
    pickerVersions: [],
    pickerVUrn: '',
    pickerLoadingV: false,
    links: [],
});

const modelKey = (model) => {
    if (!model) return '__unknown__';
    try {
        return String(model.id || model.getData?.().urn || model.getData?.().guid || '__unknown__');
    } catch (e) {
        return '__unknown__';
    }
};

export default function CompareView({ BACKEND_URL, onExit }) {
    const [phase, setPhase] = useState('setup');           // 'setup' | 'view'
    const [models, setModels] = useState([]);
    const [side, setSide] = useState({
        a: createEmptySide(),
        b: createEmptySide(),
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
    const hoverFiveDCacheRef = useRef({});
    const hoverFetchRef = useRef({ timer: null, seq: 0, pendingExt: null });
    const vs = useRef({ a: null, b: null, maps: {}, rev: {}, syncing: false, selSyncing: false });

    useEffect(() => {
        apiFetch(`${BACKEND_URL}/api/config/project`)
            .then(r => r.json())
            .then(cfg => setModels(cfg.models || []))
            .catch(() => setStatus('No se pudo cargar la lista de modelos.'));
        // Purgar temporales de sesiones anteriores (por si quedo algo de un crash)
        apiFetch(`${BACKEND_URL}/api/compare/cleanup`, { method: 'POST' }).catch(() => { });
    }, [BACKEND_URL]);

    // Salir SIEMPRE limpia las extracciones temporales: no queda nada en la BD.
    const doExit = useCallback(() => {
        apiFetch(`${BACKEND_URL}/api/compare/cleanup`, { method: 'POST' }).catch(() => { });
        onExit();
    }, [BACKEND_URL, onExit]);

    // Pausar el visor PRINCIPAL mientras comparamos. Tener 3 visores LMV activos
    // satura GPU/RAM (geometría que desaparece al moverse, parpadeo). stop() detiene
    // su render loop y libera el hilo de render para los 2 visores del comparador;
    // start() lo reanuda al salir. Reversible: NO destruye el modelo ya cargado.
    useEffect(() => {
        try { window.NOP_VIEWER && window.NOP_VIEWER.stop && window.NOP_VIEWER.stop(); } catch (e) { /* noop */ }
        return () => { try { window.NOP_VIEWER && window.NOP_VIEWER.start && window.NOP_VIEWER.start(); } catch (e) { /* noop */ } };
    }, []);

    const frentes = useMemo(() => [...new Set(models.map(m => m.appProjectId).filter(Boolean))], [models]);
    const byFrente = useMemo(() => {
        const g = {};
        models.forEach(m => { (g[m.appProjectId || 'otros'] = g[m.appProjectId || 'otros'] || []).push(m); });
        return g;
    }, [models]);

    // ── Seleccion por lado: al elegir modelo, cargar sus versiones ACC ──
    const pickModel = (key, val) => {
        setSide(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                pickerSel: val,
                pickerVersions: [],
                pickerVUrn: '',
                pickerLoadingV: val && !val.startsWith('frente:')
            }
        }));
        if (!val || val.startsWith('frente:')) return;
        const m = models.find(x => String(x.id) === val);
        if (!m) return;
        apiFetch(`${BACKEND_URL}/api/compare/versions?model_id=${encodeURIComponent(val)}`)
            .then(r => r.json())
            .then(d => {
                const versions = d.versions || [{ versionNumber: m.versionNumber, urn: m.urn, isCurrent: true }];
                const current = versions.find(v => v.isCurrent) || versions[0];
                setSide(prev => ({
                    ...prev,
                    [key]: {
                        ...prev[key],
                        pickerVersions: versions,
                        pickerVUrn: current ? current.urn : m.urn,
                        pickerLoadingV: false
                    }
                }));
            })
            .catch(() => setSide(prev => ({
                ...prev,
                [key]: {
                    ...prev[key],
                    pickerVersions: [{ versionNumber: m.versionNumber, urn: m.urn, isCurrent: true }],
                    pickerVUrn: m.urn,
                    pickerLoadingV: false
                }
            })));
    };

    const pickVersion = (key, vUrn) => setSide(prev => ({ ...prev, [key]: { ...prev[key], pickerVUrn: vUrn } }));
    const addLink = (key) => {
        setSide(prev => {
            const s = prev[key];
            if (!s.pickerSel) return prev;

            let link = null;
            if (s.pickerSel.startsWith('frente:')) {
                const frente = s.pickerSel.slice(7);
                link = { type: 'frente', value: frente, label: `Frente ${frente}` };
            } else {
                const m = models.find(x => String(x.id) === s.pickerSel);
                if (!m || !s.pickerVUrn) return prev;
                const v = s.pickerVersions.find(x => x.urn === s.pickerVUrn);
                link = {
                    type: 'source',
                    value: s.pickerVUrn,
                    modelId: m.id,
                    label: `${m.name}${v && v.versionNumber ? ` · v${v.versionNumber}` : ''}`,
                };
            }

            const currentLinks = link.type === 'frente'
                ? []
                : s.links.filter(item => item.type !== 'frente');
            const exists = currentLinks.some(item => item.type === link.type && item.value === link.value);

            return {
                ...prev,
                [key]: {
                    ...s,
                    links: exists ? currentLinks : [...currentLinks, link],
                    pickerSel: '',
                    pickerVersions: [],
                    pickerVUrn: '',
                    pickerLoadingV: false,
                }
            };
        });
    };
    const removeLink = (key, idx) => {
        setSide(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                links: prev[key].links.filter((_, i) => i !== idx),
            }
        }));
    };
    const clearLinks = (key) => {
        setSide(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                links: [],
            }
        }));
    };
    const swapSides = () => setSide(prev => ({ a: prev.b, b: prev.a }));

    const scopeOf = (s) => {
        if (!s.links.length) return null;
        const front = s.links.find(item => item.type === 'frente');
        if (front) return { type: 'frente', value: front.value };
        const values = s.links.filter(item => item.type === 'source').map(item => item.value);
        if (!values.length) return null;
        return values.length === 1 ? { type: 'source', value: values[0] } : { type: 'sources', values };
    };
    const labelOf = (s) => {
        if (!s.links.length) return '';
        if (s.links.length === 1) return s.links[0].label;
        return `${s.links.length} vínculos`;
    };

    // ── Visores ──
    const makeViewer = (container) => {
        const ViewerCtor = window.Autodesk.Viewing.Viewer3D || window.Autodesk.Viewing.GuiViewer3D;
        const v = new ViewerCtor(container, {});
        v.start();
        return v;
    };
    const sourceUrnsOf = (scope) => {
        if (!scope) return [];
        if (scope.type === 'source') return [scope.value];
        if (scope.type === 'sources') return scope.values || [];
        return [];
    };
    const buildExternalLookups = (viewer) => new Promise(resolve => {
        const modelsInViewer = viewer.getAllModels ? viewer.getAllModels() : (viewer.model ? [viewer.model] : []);
        if (!modelsInViewer.length) return resolve({ map: {}, rev: { byModel: {}, flat: {} } });

        const map = {};
        const rev = { byModel: {}, flat: {} };
        let pending = modelsInViewer.length;

        modelsInViewer.forEach(model => {
            const key = modelKey(model);
            rev.byModel[key] = rev.byModel[key] || {};
            model.getExternalIdMapping((extMap) => {
                Object.entries(extMap || {}).forEach(([ext, dbId]) => {
                    map[ext] = { id: dbId, model };
                    rev.byModel[key][dbId] = ext;
                    if (!rev.flat[dbId]) rev.flat[dbId] = ext;
                });
                pending -= 1;
                if (pending === 0) resolve({ map, rev });
            }, () => {
                pending -= 1;
                if (pending === 0) resolve({ map, rev });
            });
        });
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
                const revByModel = rev && ev.model ? rev.byModel?.[modelKey(ev.model)] : null;
                const ext = revByModel?.[dbId] || rev?.flat?.[dbId];
                if (!dbId || dbId <= 0 || !ext) {
                    hoverFetchRef.current.seq += 1;
                    hoverFetchRef.current.pendingExt = null;
                    if (hoverFetchRef.current.timer) {
                        clearTimeout(hoverFetchRef.current.timer);
                        hoverFetchRef.current.timer = null;
                    }
                    setTip(null);
                    return;
                }
                const cached = hoverFiveDCacheRef.current[ext];
                if (cached) {
                    hoverFetchRef.current.pendingExt = null;
                    setTip({ side: k, ext, data: cached, loading: false });
                    return;
                }
                if (hoverFetchRef.current.pendingExt === ext) {
                    return;
                }

                hoverFetchRef.current.seq += 1;
                const fetchSeq = hoverFetchRef.current.seq;
                hoverFetchRef.current.pendingExt = ext;
                if (hoverFetchRef.current.timer) clearTimeout(hoverFetchRef.current.timer);
                setTip(null);

                hoverFetchRef.current.timer = setTimeout(async () => {
                    try {
                        const scopes = scopesRef.current;
                        if (!scopes) return;
                        const res = await apiFetch(`${BACKEND_URL}/api/compare/element-metrados`, {
                            method: 'POST',
                            body: JSON.stringify({ external_id: ext, a: scopes.a, b: scopes.b })
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || 'No se pudo obtener el diff 5D del elemento');
                        const byElement = { a: data.a || {}, b: data.b || {} };
                        hoverFiveDCacheRef.current[ext] = byElement;
                        if (hoverFetchRef.current.seq !== fetchSeq) return;
                        hoverFetchRef.current.pendingExt = null;
                        setTip({ side: k, ext, data: byElement });
                    } catch (e) {
                        console.warn('[Compare] hover 5D:', e);
                        if (hoverFetchRef.current.seq !== fetchSeq) return;
                        hoverFetchRef.current.pendingExt = null;
                        setTip(null);
                    }
                }, 120);
            });
        });
    }, [BACKEND_URL]);

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
                        const rev = vs.current.rev[k];
                        const revByModel = rev && ev.model ? rev.byModel?.[modelKey(ev.model)] : null;
                        const ext = revByModel?.[dbId] || rev?.flat?.[dbId] || null;
                        const target = ext && vs.current.maps[other] ? vs.current.maps[other][ext] : null;
                        if (ov) {
                            if (target) ov.select([target.id], target.model);
                            else ov.clearSelection();
                        }
                        if (ext) openDetailRef.current({ id: ext, name: 'Elemento …' + String(ext).slice(-10) });
                    }
                } finally { vs.current.selSyncing = false; }
            });
        });
    }, []);

    const themeSide = (viewer, map, list, rgb) => {
        if (!viewer || !viewer.model || !map) return;
        const color = new window.THREE.Vector4(rgb[0], rgb[1], rgb[2], 1);
        list.forEach(it => {
            const target = map[it.id];
            if (target) viewer.setThemingColor(target.id, color, target.model, true);
        });
    };

    // ── Extraccion bajo demanda de versiones historicas (scope temporal) ──
    const ensureExtracted = async (urn, label) => {
        const chk = await apiFetch(`${BACKEND_URL}/api/compare/extracted?urn=${encodeURIComponent(urn)}`).then(r => r.json());
        if (chk.extracted) return;

        // 0) Asegurar que la version este TRADUCIDA en ACC (las versiones viejas
        //    pueden no tener SVF). Disparamos la traduccion UNA sola vez (force) y
        //    luego solo consultamos el estado -> sin bucle de re-disparo.
        let triggered = false;
        for (let i = 0; i < 90; i++) {                        // ~15 min de techo
            const prep = await apiFetch(`${BACKEND_URL}/api/compare/prepare-version`, {
                method: 'POST', body: JSON.stringify({ urn, force: !triggered })
            }).then(r => r.json());
            triggered = true;  // ya disparamos (o consultamos) la primera vez

            if (prep.error) throw new Error(`${label}: ${prep.error}`);
            if (prep.status === 'ready') break;

            if (prep.status === 'translating') {
                const pct = prep.progress ? ` ${prep.progress}` : '';
                setStatus(`Traduciendo ${label} en Autodesk…${pct} (versión histórica; la primera vez puede tardar)`);
            } else {
                // failed / not_translated DESPUES de haber forzado el disparo -> rendirse claro
                throw new Error(
                    `${label}: esa versión no se puede traducir en Autodesk (${prep.detail || 'archivo original no disponible'}). ` +
                    `Suele pasar con versiones muy antiguas cuyo archivo ya fue archivado en ACC. ` +
                    `Prueba con una versión más reciente o la actual.`
                );
            }
            await new Promise(r => setTimeout(r, 8000));
        }

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
        hoverFiveDCacheRef.current = {};
        hoverFetchRef.current.seq += 1;
        hoverFetchRef.current.pendingExt = null;
        if (hoverFetchRef.current.timer) {
            clearTimeout(hoverFetchRef.current.timer);
            hoverFetchRef.current.timer = null;
        }
        setBusy(true); setDiff(null); setFiveD(null); fiveDRef.current = null;
        setDetail(null); setActiveList(null); setTip(null);
        setPhase('view');
        await new Promise(r => setTimeout(r, 60));            // esperar el render de los panes

        try {
            const urnsA = sourceUrnsOf(sa);
            const urnsB = sourceUrnsOf(sb);
            const both3D = urnsA.length > 0 && urnsB.length > 0;

            // 1) Asegurar que ambas versiones esten extraidas (el diff es en Postgres)
            for (let i = 0; i < urnsA.length; i++) await ensureExtracted(urnsA[i], `lado A · vínculo ${i + 1}`);
            for (let i = 0; i < urnsB.length; i++) await ensureExtracted(urnsB[i], `lado B · vínculo ${i + 1}`);

            // 2) Diff de datos
            setStatus('Comparando datos en PostgreSQL…');
            const res = await apiFetch(`${BACKEND_URL}/api/compare/diff`, { method: 'POST', body: JSON.stringify({ a: sa, b: sb }) });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Falló el diff');
            setDiff(d);

            // Guard: si un lado quedo SIN datos, avisar y no pintar (todo saldria
            // "agregado"/"eliminado" y el resultado seria enganoso).
            const sideEmpty = d.summary.total_a === 0 ? 'A' : (d.summary.total_b === 0 ? 'B' : null);

            // 3) Vista 3D
            if (both3D) {
                setStatus('Cargando ambas versiones…');
                if (!vs.current.a) vs.current.a = makeViewer(contA.current);
                if (!vs.current.b) vs.current.b = makeViewer(contB.current);
                // Cargar A primero para conocer su globalOffset (cercano al modelo),
                // y cargar B con EL MISMO offset -> alineados y sin perder precision.
                const offset = await loadAlignedModels(vs.current.a, urnsA);
                await loadAlignedModels(vs.current.b, urnsB, { sharedOffset: offset });
                wireSync();

                const lookupA = await buildExternalLookups(vs.current.a);
                const lookupB = await buildExternalLookups(vs.current.b);
                vs.current.maps = { a: lookupA.map, b: lookupB.map };
                vs.current.rev = { a: lookupA.rev, b: lookupB.rev };
                if (!sideEmpty) {
                    setStatus('Pintando diferencias…');
                    themeSide(vs.current.b, lookupB.map, d.added, COLORS.added);
                    themeSide(vs.current.b, lookupB.map, d.modified, COLORS.modified);
                    themeSide(vs.current.a, lookupA.map, d.removed, COLORS.removed);
                    themeSide(vs.current.a, lookupA.map, d.modified, COLORS.modified);
                }
                wireHover();
                wireMirror();
            }

            if (sideEmpty) {
                setStatus(`⚠ El lado ${sideEmpty} no tiene datos extraídos en PostgreSQL — el diff no es representativo (no se pintó). Revisa que esa versión se haya extraído bien.`);
            }

            // 4) Diff 5D valorizado
            setStatus('Calculando diff 5D (metrados y precios)…');
            try {
                const r5 = await apiFetch(`${BACKEND_URL}/api/compare/metrados`, {
                    method: 'POST', body: JSON.stringify({ a: sa, b: sb })
                });
                const d5 = await r5.json();
                if (r5.ok) { setFiveD(d5); fiveDRef.current = d5; }
            } catch (e5) { console.warn('[Compare] 5D no disponible:', e5); }

            if (!sideEmpty) {
                setStatus(both3D
                    ? 'Listo. Pasa el mouse por un elemento para ver su metrado; haz clic para resaltarlo en ambos lados.'
                    : 'Diff de datos listo. El 3D se activa comparando dos modelos individuales.');
            }
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
        const targets = list.map(it => map[it.id]).filter(Boolean);
        if (!targets.length) return;
        const aggregate = targets.reduce((acc, target) => {
            const key = modelKey(target.model);
            if (!acc[key]) acc[key] = { model: target.model, ids: [] };
            acc[key].ids.push(target.id);
            return acc;
        }, {});
        const groups = Object.values(aggregate);
        const vm = viewer.impl && viewer.impl.visibilityManager;
        if (vm && typeof vm.aggregateIsolate === 'function') {
            vm.aggregateIsolate(groups);
            return;
        }
        viewer.isolate(groups[0].ids, groups[0].model);
    };
    const showAll = () => ['a', 'b'].forEach(k => {
        const v = vs.current[k];
        if (!v) return;
        const modelsInViewer = v.getAllModels ? v.getAllModels() : (v.model ? [v.model] : []);
        modelsInViewer.forEach(model => v.isolate([], model));
    });

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
        hoverFetchRef.current.seq += 1;
        if (hoverFetchRef.current.timer) clearTimeout(hoverFetchRef.current.timer);
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
        const rawSide = side[key];
        const s = {
            ...rawSide,
            sel: rawSide.pickerSel,
            versions: rawSide.pickerVersions,
            vUrn: rawSide.pickerVUrn,
            loadingV: rawSide.pickerLoadingV,
        };
        const linkValues = new Set(s.links.map(link => link.value));
        const duplicateSelected = !!s.pickerSel && !s.pickerSel.startsWith('frente:') && !!s.pickerVUrn && linkValues.has(s.pickerVUrn);
        const addDisabled = !s.pickerSel || (!s.pickerSel.startsWith('frente:') && !s.pickerVUrn) || duplicateSelected;
        const sideName = key.toUpperCase();
        const addLabel = duplicateSelected
            ? 'Ya esta agregado'
            : `${s.links.length ? '+ Agregar otro modelo' : '+ Agregar modelo'} a ${sideName}`;
        return (
            <div style={S.sideCard}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={S.label}>{title}</div>
                    <span style={{ fontSize: 10.5, color: T.accent, border: '1px solid rgba(61,126,255,0.35)', borderRadius: 999, padding: '2px 8px', marginBottom: 10 }}>
                        MULTI-MODELO
                    </span>
                </div>
                <div style={{ fontSize: 11.5, color: T.faint, margin: '-3px 0 10px' }}>
                    Selecciona un modelo, agregalo a la lista y repite para sumar mas vinculos.
                </div>
                <select style={S.select} value={s.pickerSel} onChange={e => pickModel(key, e.target.value)}>
                    <option value="">Seleccionar modelo para agregar...</option>
                    <optgroup label="Frentes completos (reemplaza la lista; solo datos)">
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
                    style={{ ...S.select, opacity: s.pickerVersions.length ? 1 : 0.5 }}
                    value={s.pickerVUrn}
                    disabled={!s.pickerVersions.length}
                    onChange={e => pickVersion(key, e.target.value)}
                >
                    {s.pickerLoadingV && <option>Cargando versiones...</option>}
                    {!s.pickerLoadingV && !s.pickerVersions.length && <option>{s.pickerSel && !s.pickerSel.startsWith('frente:') ? '-' : 'No aplica (frente completo)'}</option>}
                    {s.pickerVersions.map(v => (
                        <option key={v.urn} value={v.urn}>
                            v{v.versionNumber}{v.isCurrent ? ' · actual' : ''}{v.createTime ? ` · ${String(v.createTime).slice(0, 10)}` : ''}
                        </option>
                    ))}
                </select>
                <div style={{ fontSize: 11.5, color: T.faint, minHeight: 16 }}>
                    {s.pickerVersions.length > 1 && 'Las versiones historicas se extraen automaticamente al comparar.'}
                </div>
                <button
                    type="button"
                    style={{
                        ...S.btnGhost,
                        width: '100%',
                        marginTop: 8,
                        background: addDisabled ? 'transparent' : T.accent,
                        color: addDisabled ? T.muted : '#fff',
                        border: addDisabled ? T.border : 'none',
                        fontWeight: 600,
                        opacity: addDisabled ? 0.45 : 1,
                        cursor: addDisabled ? 'default' : 'pointer'
                    }}
                    disabled={addDisabled}
                    onClick={() => addLink(key)}
                >
                    {addLabel}
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, maxHeight: 118, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 11, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            {s.links.length} vinculo{s.links.length === 1 ? '' : 's'} agregado{s.links.length === 1 ? '' : 's'}
                        </div>
                        {s.links.length > 0 && (
                            <button
                                type="button"
                                style={{ ...S.btnGhost, padding: '2px 7px', fontSize: 11 }}
                                onClick={() => clearLinks(key)}
                            >
                                Limpiar
                            </button>
                        )}
                    </div>
                    {s.links.length === 0 && (
                        <div style={{ padding: '7px 8px', border: T.borderSoft, borderRadius: 6, color: T.faint, background: 'rgba(255,255,255,0.02)' }}>
                            Todavia no hay modelos agregados en este lado.
                        </div>
                    )}
                    {s.links.map((link, idx) => (
                        <div
                            key={`${link.type}-${link.value}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 8px',
                                border: T.borderSoft,
                                borderRadius: 6,
                                background: 'rgba(255,255,255,0.03)',
                                minWidth: 0
                            }}
                        >
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={link.label}>
                                {link.label}
                            </span>
                            <button
                                type="button"
                                style={{ ...S.btnGhost, padding: '2px 7px', fontSize: 12 }}
                                onClick={() => removeLink(key, idx)}
                                title="Quitar vínculo"
                            >
                                ×
                            </button>
                        </div>
                    ))}
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
                            <button style={{ ...S.btnGhost, border: 'none', fontSize: 16, padding: 4 }} onClick={doExit} title="Cerrar">✕</button>
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
                            <button style={S.btnGhost} onClick={doExit}>Cancelar</button>
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
                        {diff && (
                            <div style={{ display: 'flex', gap: 14, marginLeft: 16, alignItems: 'center' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.muted }}><span style={S.dot(T.green)} />Agregado</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.muted }}><span style={S.dot(T.red)} />Eliminado</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.muted }}><span style={S.dot(T.magenta)} />Modificado</span>
                            </div>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                            <button style={S.btnGhost} onClick={editSelection}>Editar selección</button>
                            <button style={S.btnGhost} onClick={showAll}>Mostrar todo</button>
                            <button style={S.btnGhost} onClick={doExit}>Salir</button>
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
                                <button style={S.pill(T.magenta, activeList === 'modified')} onClick={() => { setActiveList('modified'); isolate('a', diff.modified); isolate('b', diff.modified); }}>
                                    <span style={S.dot(T.magenta)} />{diff.summary.modified.toLocaleString()} modificados
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
