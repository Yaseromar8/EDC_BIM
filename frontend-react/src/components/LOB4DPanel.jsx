import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadAlignedModels } from '../aps/utils/loadAlignedModels';
import { apiFetch } from '../utils/apiFetch';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (
    typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://visor-ecd-backend.onrender.com'
);

// ══════════════════════════════════════════════════════════════════════════════
// 4D LOB — "Simulación 4D" es 100% NATIVA (React + visor como parte del layout:
// sin iframe, sin tracking, sin lag) y se alimenta SOLO de datos reales:
//   /api/lob/timeline  ← Excel DURACIONES ⨯ Metrados ⨯ Valorizaciones (backend)
//   FRENTE chips       ← MAPEO_FRENTES del Excel; filtran TODO (sim, panel, gantt, EDT)
//   civil_alignments   ← eje/progresivas activados en Civil (persistente)
// "Tablas 4D" (Línea de Balance / Matriz / EDT del standalone) siguen en iframe;
// en 2a se inyecta la tabla EDT cruzada real.
// ══════════════════════════════════════════════════════════════════════════════

const STANDALONE_URL = '/4D%20LOB%20Progress%20-%20Standalone.html';
const LOB_DATA_FILES = [
    '/lob-data/DURACIONES%20LB00_R00.xlsm',
    '/lob-data/Metrados%20RIBA%205%20-%20Paquete%208_SINOHYDRO_V03.xlsx',
];

const cleanUrn = (urn) => String(urn || '').replace(/^urn:/i, '');
const modelFrontOf = (m) => m?.appProjectId || m?.project || m?.front || m?.frente || '';

const C = {
    bg: '#0a0b0d', panel: '#101317', card: 'rgba(14,16,20,0.92)',
    border: '1px solid rgba(255,255,255,0.10)', borderSoft: '1px solid rgba(255,255,255,0.06)',
    text: '#e6e8ec', muted: '#8a919c', faint: '#5d6672',
    done: '#22c55e', exec: '#f59e0b', plan: '#3aa0ff', pend: '#232a34', accent: '#3aa0ff',
    mono: "'IBM Plex Mono', Consolas, monospace",
    sans: "Inter, 'Artifakt Element', system-ui, sans-serif",
};

const fmtNum = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString('es-PE', { maximumFractionDigits: d }));

export default function LOB4DPanel({ onClose, models = [], activeViewableGuids = {} }) {
    const [tab, setTab] = useState('sim');              // 'sim' nativo | 'tablas' iframe
    const [status, setStatus] = useState('Cargando…');
    const [lobData, setLobData] = useState(null);
    const [activeFrente, setActiveFrente] = useState(null);
    const [simPeriod, setSimPeriod] = useState(0);
    const [simPlaying, setSimPlaying] = useState(false);
    const [simSpeed, setSimSpeed] = useState(1);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [selectedUrns, setSelectedUrns] = useState([]);

    const hostRef = useRef(null);
    const viewerRef = useRef(null);
    const loadedKeyRef = useRef('');
    const iframeRef = useRef(null);
    const iframePollRef = useRef(null);

    const availableModels = useMemo(() => (models || [])
        .map((m) => ({ ...m, _urn: cleanUrn(m.urn), _front: modelFrontOf(m), _label: m.name || m.label || cleanUrn(m.urn) }))
        .filter((m) => m._urn), [models]);

    const lobFrente = useMemo(() => modelFrontOf(models?.[0]) || 'global', [models]);

    useEffect(() => {
        const urns = availableModels.map((m) => m._urn);
        setSelectedUrns((prev) => {
            const kept = prev.filter((u) => urns.includes(u));
            return kept.length ? kept : urns;
        });
    }, [availableModels]);

    // ── Lifecycle: pausar visor principal; restaurar al salir ──
    useEffect(() => {
        try { window.NOP_VIEWER?.stop?.(); } catch (e) { /* noop */ }
        return () => {
            if (iframePollRef.current) window.clearInterval(iframePollRef.current);
            try { window.dispatchEvent(new CustomEvent('lob-clear')); } catch (e) { /* noop */ }
            try { viewerRef.current?.finish?.(); viewerRef.current = null; } catch (e) { /* noop */ }
            try { window.NOP_VIEWER?.start?.(); } catch (e) { /* noop */ }
        };
    }, []);

    // ── Datos: timeline del backend con AUTO-IMPORT de los Excel si está vacío ──
    useEffect(() => {
        let alive = true;
        const fetchTimeline = async () => {
            const r = await apiFetch(`${BACKEND_URL}/api/lob/timeline?model_urn=${encodeURIComponent(lobFrente)}`);
            if (!r.ok) return null;
            const d = await r.json();
            return (d && !d.error && (d.partidas || []).length) ? d : null;
        };
        (async () => {
            try {
                let d = await fetchTimeline();
                if (!d && alive) {
                    setStatus('Importando cronograma (Excel → backend)…');
                    const [durB, metB] = await Promise.all(LOB_DATA_FILES.map(
                        (u) => fetch(u).then((r) => (r.ok ? r.blob() : null)).catch(() => null)
                    ));
                    if (durB || metB) {
                        const fd = new FormData();
                        fd.append('model_urn', lobFrente);
                        if (durB) fd.append('duraciones', new File([durB], 'duraciones.xlsm'));
                        if (metB) fd.append('metrados', new File([metB], 'metrados.xlsx'));
                        const ir = await apiFetch(`${BACKEND_URL}/api/lob/import`, { method: 'POST', body: fd, isUpload: true });
                        if (!ir.ok) throw new Error((await ir.json().catch(() => ({}))).error || 'Import falló');
                        d = await fetchTimeline();
                    }
                }
                if (!alive) return;
                if (d) {
                    setLobData(d);
                    setStatus(`Cronograma: ${d.partidas.length} partidas · ${Object.keys(d.frentes || {}).length} frentes`);
                } else {
                    setStatus('Sin datos 4D — reinicia el backend (rutas /api/lob) y reabre.');
                }
            } catch (e) {
                console.warn('[LOB4D] datos:', e);
                if (alive) setStatus('Sin datos 4D — reinicia el backend (rutas /api/lob) y reabre.');
            }
        })();
        return () => { alive = false; };
    }, [lobFrente]);

    // ── Visor NATIVO: parte del layout (flex), mismos modelos/vistas que el principal ──
    useEffect(() => {
        const host = hostRef.current;
        if (!host || !window.Autodesk?.Viewing) return;

        const configs = availableModels
            .filter((m) => selectedUrns.includes(m._urn))
            .map((m) => ({ urn: m._urn, viewGuid: activeViewableGuids[m.urn] || activeViewableGuids[m._urn] || m.defaultViewGuid || null }));
        if (!configs.length) return;

        const key = configs.map((c) => `${c.urn}:${c.viewGuid || ''}`).join('|');
        if (loadedKeyRef.current === key && viewerRef.current) return;

        let cancelled = false;
        (async () => {
            try {
                if (viewerRef.current) { viewerRef.current.finish(); viewerRef.current = null; }
                const Ctor = window.Autodesk.Viewing.Viewer3D || window.Autodesk.Viewing.GuiViewer3D;
                const viewer = new Ctor(host, {});
                viewer.start();
                if (cancelled) { viewer.finish(); return; }
                viewerRef.current = viewer;
                loadedKeyRef.current = key;
                await loadAlignedModels(viewer, configs);
                if (cancelled) return;
                try { viewer.fitToView(); } catch (e) { /* noop */ }
                try {
                    const ext = await viewer.loadExtension('LOB4DExtension');
                    // Reconocer el eje/progresivas activados en CIVIL (sesión o persistencia)
                    const session = window.__civilToolsSession;
                    const rec = session?.records?.[session?.lastKey];
                    const civilData = rec?.alignmentData?.length ? rec.alignmentData : window.__lobCivilAlignments;
                    const civilSel = rec?.selectedAlignmentId || civilData?.[0]?.alignmentId;
                    if (ext && civilData?.length && civilSel) {
                        ext.setStationAnnotationsVisible?.(rec?.stationLabelsVisible ?? true);
                        ext.bakeAlignment(civilData, civilSel);
                    }
                } catch (e) { console.warn('[LOB4D] ext:', e); }
            } catch (err) {
                console.error('[LOB4D] visor:', err);
                setStatus('No se pudo cargar el modelo en el visor 4D.');
            }
        })();
        return () => { cancelled = true; };
    }, [availableModels, selectedUrns, activeViewableGuids]);

    useEffect(() => {
        const onResize = () => { try { viewerRef.current?.resize?.(); } catch (e) { /* noop */ } };
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    useEffect(() => { if (tab === 'sim') { try { viewerRef.current?.resize?.(); } catch (e) { /* noop */ } } }, [tab]);

    // ── Motor 4D: clasificación por periodo, filtrada por FRENTE del Excel ──
    const maxPeriod = useMemo(() => {
        if (!lobData) return 7;
        let max = 1;
        Object.values(lobData.avance || {}).forEach((ps) => Object.keys(ps).forEach((p) => { max = Math.max(max, Number(p)); }));
        return max;
    }, [lobData]);

    const sim = useMemo(() => {
        if (!lobData) return null;
        const current = Math.floor(simPeriod) + 1;
        const frac = simPeriod - Math.floor(simPeriod);
        const byCode = lobData.avance || {};
        const codBases = activeFrente ? (lobData.frentes?.[activeFrente] || []) : null;
        const partidas = (lobData.partidas || []).filter(
            (p) => !codBases || codBases.some((cb) => String(p.codigo).startsWith(cb))
        );

        const completed = []; const active = []; const planned = [];
        const rows = []; let valorizado = 0; let total = 0;

        partidas.forEach((p) => {
            const ps = byCode[p.codigo] || {};
            let acumPrev = 0; let enCurso = 0; let futuro = 0;
            let first = null; let last = null;
            Object.entries(ps).forEach(([per, val]) => {
                const n = Number(per);
                if (first == null || n < first) first = n;
                if (last == null || n > last) last = n;
                if (n < current) acumPrev += val;
                else if (n === current) enCurso = val;
                else futuro += val;
            });
            const met = p.metrado || 0; const pu = p.pu || 0;
            if (met > 0 && pu > 0) {
                total += met * pu;
                valorizado += met * pu * Math.min(1, (acumPrev + enCurso * frac) / met);
            }
            const task = { id: p.activity_id, code: p.codigo };
            let state = 'pend';
            if (met > 0 && acumPrev >= met * 0.995) { completed.push(task); state = 'done'; }
            else if (enCurso > 0 || acumPrev > 0) { active.push(task); state = 'exec'; }
            else if (futuro > 0) { planned.push(task); state = 'plan'; }
            const ejecTotal = acumPrev + enCurso + futuro;
            const pct = met > 0 ? Math.min(100, ((acumPrev + enCurso * frac) / met) * 100) : null;
            rows.push({ ...p, state, first, last, pct, ejecTotal });
        });

        return {
            current, partidas, completed, active, planned, rows,
            progress: total > 0 ? (valorizado / total) * 100 : 0,
        };
    }, [lobData, simPeriod, activeFrente]);

    // Dispatch → LOB4DExtension colorea POR ELEMENTO (CodigoDePartida/ActivityID)
    useEffect(() => {
        if (!sim) return;
        const cfg = lobData?.config || {};
        let dateISO = null;
        if (cfg.fecha_inicio) {
            const d = new Date(cfg.fecha_inicio);
            d.setDate(d.getDate() + Math.round(simPeriod * (cfg.dias_por_periodo || 30)));
            dateISO = d.toISOString();
        }
        window.dispatchEvent(new CustomEvent('lob-time-update', {
            detail: {
                date: dateISO, tasks: sim.active, completedTasks: sim.completed,
                plannedTasks: sim.planned, progress: sim.progress, frente: activeFrente,
            },
        }));
    }, [sim, lobData, simPeriod, activeFrente]);

    // Play
    useEffect(() => {
        if (!simPlaying) return;
        const t = window.setInterval(() => {
            setSimPeriod((prev) => {
                const next = prev + 0.02 * simSpeed;
                if (next >= maxPeriod) { setSimPlaying(false); return maxPeriod; }
                return next;
            });
        }, 90);
        return () => window.clearInterval(t);
    }, [simPlaying, simSpeed, maxPeriod]);

    const dateLabel = useMemo(() => {
        const cfg = lobData?.config || {};
        if (cfg.fecha_inicio) {
            const d = new Date(cfg.fecha_inicio);
            d.setDate(d.getDate() + Math.round(simPeriod * (cfg.dias_por_periodo || 30)));
            return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
        }
        return `VAL N°${String(Math.floor(simPeriod) + 1).padStart(2, '0')}`;
    }, [lobData, simPeriod]);

    const excelFronts = useMemo(() => Object.keys(lobData?.frentes || {}), [lobData]);

    const selectExcelFront = (name) => {
        const next = activeFrente === name ? null : name;
        setActiveFrente(next);
        if (next) {
            const tokens = String(next).toUpperCase().split(/[^A-ZÑ0-9]+/).filter((t) => t.length >= 4);
            const matched = availableModels.filter((m) => tokens.some((t) => `${m._front} ${m._label}`.toUpperCase().includes(t)));
            if (matched.length) setSelectedUrns(matched.map((m) => m._urn));
        }
    };

    // ── Iframe "Tablas 4D": aislar workspace 3a + inyectar EDT cruzado real en 2a ──
    const isolateIframe = useCallback(() => {
        const iframe = iframeRef.current;
        const doc = iframe && (iframe.contentDocument || iframe.contentWindow?.document);
        const target = doc?.getElementById('3a');
        if (!doc || !target) return false;
        doc.documentElement.style.cssText += ';margin:0;padding:0;width:100%;height:100%;overflow:hidden;';
        doc.body.style.cssText += ';margin:0;padding:0;width:100%;height:100%;background:#0a0b0d;overflow:hidden;';
        target.style.cssText += ';position:fixed;inset:0;width:100vw;height:100vh;margin:0;transform:none;z-index:999999;overflow:auto;';
        if (target.firstElementChild) target.firstElementChild.style.display = 'none';
        return true;
    }, []);

    const injectEdt = useCallback(() => {
        const iframe = iframeRef.current;
        const doc = iframe && (iframe.contentDocument || iframe.contentWindow?.document);
        const edt = doc?.getElementById('2a');
        if (!doc || !edt || !lobData) return;
        doc.getElementById('lob-edt-cross')?.remove();

        const codBases = activeFrente ? (lobData.frentes?.[activeFrente] || []) : null;
        const partidas = (lobData.partidas || []).filter((p) => !codBases || codBases.some((cb) => String(p.codigo).startsWith(cb)));
        const byCode = lobData.avance || {};
        const rows = partidas.slice(0, 400).map((p) => {
            const ejec = Object.values(byCode[p.codigo] || {}).reduce((a, b) => a + b, 0);
            const pct = p.metrado > 0 ? Math.min(100, (ejec / p.metrado) * 100) : null;
            return `<tr style="border-top:1px solid #1c1f25;">
                <td style="padding:6px 8px;font-family:${C.mono};color:#8ecbff;white-space:nowrap;">${p.codigo}</td>
                <td style="padding:6px 8px;max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${p.descripcion || ''}">${p.descripcion || '—'}</td>
                <td style="padding:6px 8px;color:#8a919c;">${p.unidad || ''}</td>
                <td style="padding:6px 8px;text-align:right;">${fmtNum(p.metrado)}</td>
                <td style="padding:6px 8px;text-align:right;color:#8a919c;">${fmtNum(p.duracion, 1)}</td>
                <td style="padding:6px 8px;text-align:right;font-weight:700;color:${pct == null ? '#5d6672' : pct >= 99.5 ? C.done : pct > 0 ? C.exec : '#5d6672'};">${pct == null ? '—' : fmtNum(pct, 1) + '%'}</td>
            </tr>`;
        }).join('');

        const panel = doc.createElement('div');
        panel.id = 'lob-edt-cross';
        panel.style.cssText = `margin-top:14px;background:#0e1014;border:1px solid #23262d;border-radius:10px;padding:14px 16px;font-family:${C.sans};color:#d7dbe2;font-size:12px;`;
        panel.innerHTML = `
          <div style="display:flex;gap:10px;margin-bottom:10px;align-items:center;">
            <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;font-weight:700;">EDT cruzado — Duraciones ⨯ Metrados ⨯ Valorizaciones</div>
            <div style="margin-left:auto;font-family:${C.mono};color:#8a919c;">${activeFrente || 'TODOS'} · ${partidas.length} partidas</div>
          </div>
          <div style="max-height:52vh;overflow:auto;border:1px solid #1c1f25;border-radius:8px;">
            <table style="width:100%;border-collapse:collapse;">
              <thead><tr style="position:sticky;top:0;background:#12151a;color:#6b7280;text-transform:uppercase;font-size:10px;letter-spacing:.08em;">
                <th style="padding:8px;text-align:left;">EDT / Partida</th><th style="padding:8px;text-align:left;">Descripción</th>
                <th style="padding:8px;text-align:left;">Und</th><th style="padding:8px;text-align:right;">Metrado</th>
                <th style="padding:8px;text-align:right;">Duración (d)</th><th style="padding:8px;text-align:right;">Avance</th>
              </tr></thead><tbody>${rows}</tbody>
            </table>
          </div>`;
        (edt.querySelector('div[style*="height"]') || edt).appendChild(panel);
    }, [lobData, activeFrente]);

    const onIframeLoad = useCallback(() => {
        if (iframePollRef.current) window.clearInterval(iframePollRef.current);
        let n = 0;
        iframePollRef.current = window.setInterval(() => {
            n += 1;
            if (isolateIframe()) { injectEdt(); window.clearInterval(iframePollRef.current); iframePollRef.current = null; }
            else if (n > 120) { window.clearInterval(iframePollRef.current); iframePollRef.current = null; }
        }, 100);
    }, [isolateIframe, injectEdt]);

    useEffect(() => { if (tab === 'tablas') injectEdt(); }, [tab, injectEdt]);

    // ── Gantt nativo (cronograma por partida, del frente activo) ──
    const ganttRows = useMemo(() => {
        if (!sim) return [];
        return sim.rows
            .filter((r) => r.first != null)
            .sort((a, b) => (a.first - b.first) || (a.orden - b.orden))
            .slice(0, 12);
    }, [sim]);

    const stateColor = (s) => (s === 'done' ? C.done : s === 'exec' ? C.exec : s === 'plan' ? C.plan : C.pend);

    const execNow = useMemo(() => (sim ? sim.rows.filter((r) => r.state === 'exec').slice(0, 6) : []), [sim]);
    const upcoming = useMemo(() => {
        if (!sim) return [];
        return sim.rows.filter((r) => r.state === 'plan' && r.first != null && r.first > sim.current)
            .sort((a, b) => a.first - b.first).slice(0, 5);
    }, [sim]);

    // ══════════════════ RENDER ══════════════════
    const chip = (active) => ({
        border: active ? `1px solid ${C.accent}` : '1px solid rgba(255,255,255,0.12)',
        background: active ? 'rgba(58,160,255,0.16)' : 'transparent',
        color: active ? '#cfe0ff' : C.muted,
        borderRadius: 7, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
    });
    const cardStyle = { background: C.card, border: C.border, borderRadius: 10, padding: '12px 15px', boxShadow: '0 12px 32px rgba(0,0,0,0.32)' };
    const lbl = { fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700 };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: C.bg, display: 'flex', flexDirection: 'column', fontFamily: C.sans, color: C.text }}>
            {/* ── Barra superior: vistas + FRENTES del Excel ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: C.border, background: C.panel, flexShrink: 0, overflowX: 'auto' }}>
                <span style={{ ...lbl, marginRight: 4 }}>Vistas</span>
                <button type="button" style={chip(tab === 'sim')} onClick={() => setTab('sim')}>1b Simulación 4D</button>
                <button type="button" style={chip(tab === 'tablas')} onClick={() => setTab('tablas')}>1a·1c·2a Tablas 4D</button>

                <span style={{ ...lbl, marginLeft: 18, marginRight: 4 }}>Frente</span>
                {excelFronts.length === 0 && <span style={{ fontSize: 11, color: C.faint }}>(sin datos aún)</span>}
                {excelFronts.map((name, i) => (
                    <button key={name} type="button" style={chip(activeFrente === name)} onClick={() => selectExcelFront(name)}>
                        {String(i + 1).padStart(2, '0')}. {name}
                    </button>
                ))}
                {activeFrente && (
                    <button type="button" style={{ ...chip(false), borderStyle: 'dashed' }} onClick={() => setActiveFrente(null)}>✕ Todos</button>
                )}
                <button type="button" style={{ ...chip(false), borderStyle: 'dashed' }} onClick={() => setPickerOpen(true)}>+ Modelos</button>

                <button type="button" onClick={onClose} title="Cerrar 4D LOB"
                    style={{ marginLeft: 'auto', width: 30, height: 30, borderRadius: 7, border: C.border, background: C.card, color: C.text, cursor: 'pointer', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>×</button>
            </div>

            {/* ── Contenido ── */}
            <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex' }}>
                {/* SIMULACIÓN 4D nativa */}
                <div style={{ flex: 1, minWidth: 0, display: tab === 'sim' ? 'flex' : 'none' }}>
                    {/* Visor: hijo real del layout (sin iframe → sin lag) */}
                    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
                        <div ref={hostRef} style={{ position: 'absolute', inset: 0, background: '#10141a' }} />

                        {/* HUD: fecha */}
                        <div style={{ ...cardStyle, position: 'absolute', top: 14, left: 14, minWidth: 200, pointerEvents: 'none' }}>
                            <div style={lbl}>Fecha de simulación</div>
                            <div style={{ fontFamily: C.mono, fontSize: 21, fontWeight: 700, marginTop: 6 }}>{dateLabel}</div>
                            <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                                {sim ? `${sim.completed.length} listas · ${sim.active.length} en curso · ${sim.planned.length} programadas` : 'sin datos'}
                            </div>
                        </div>

                        {/* HUD: leyenda */}
                        <div style={{ ...cardStyle, position: 'absolute', top: 14, right: 14, pointerEvents: 'none' }}>
                            <div style={{ ...lbl, marginBottom: 8 }}>Estado 4D</div>
                            {[['Ejecutado', C.done], ['En ejecución', C.exec], ['Programado', C.plan], ['Pendiente', C.pend]].map(([t, col]) => (
                                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, fontSize: 12, fontWeight: 600 }}>
                                    <span style={{ width: 12, height: 12, borderRadius: 3, background: col }} />{t}
                                </div>
                            ))}
                        </div>

                        {/* HUD: avance global (ponderado por PU) */}
                        <div style={{ ...cardStyle, position: 'absolute', left: 14, bottom: 14, display: 'flex', alignItems: 'center', gap: 13, pointerEvents: 'none' }}>
                            <div style={{ width: 54, height: 54, borderRadius: '50%', background: `conic-gradient(${C.done} 0 ${Math.min(100, sim?.progress || 0)}%, ${C.pend} ${Math.min(100, sim?.progress || 0)}% 100%)`, display: 'grid', placeItems: 'center' }}>
                                <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#0e1014' }} />
                            </div>
                            <div>
                                <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{(sim?.progress || 0).toFixed(1)}%</div>
                                <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>avance físico global{activeFrente ? ` · ${activeFrente}` : ''}</div>
                            </div>
                        </div>

                        <div style={{ position: 'absolute', left: 14, bottom: 92, fontSize: 11, color: C.faint, pointerEvents: 'none' }}>{status}</div>
                    </div>

                    {/* Panel derecho: frente de trabajo REAL */}
                    <div style={{ width: 300, flexShrink: 0, borderLeft: C.border, background: C.panel, padding: '16px 16px', overflowY: 'auto' }}>
                        <div style={lbl}>Frente de trabajo</div>
                        <div style={{ fontFamily: C.mono, fontSize: 22, fontWeight: 800, marginTop: 6 }}>{activeFrente || 'TODOS'}</div>
                        <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                            {sim ? `${sim.partidas.length} partidas · periodo VAL ${String(sim.current).padStart(2, '0')}/${String(maxPeriod).padStart(2, '0')}` : '—'}
                        </div>

                        <div style={{ ...lbl, marginTop: 20, marginBottom: 8 }}>En ejecución ahora</div>
                        {execNow.length === 0 && <div style={{ fontSize: 12, color: C.faint }}>Nada en curso en este periodo.</div>}
                        {execNow.map((r) => (
                            <div key={r.codigo} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.exec, flexShrink: 0 }} />
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.descripcion}>{r.descripcion || r.codigo}</span>
                                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>{r.pct == null ? '' : `${r.pct.toFixed(0)}%`}</span>
                            </div>
                        ))}

                        <div style={{ ...lbl, marginTop: 20, marginBottom: 8 }}>Próximas (siguientes periodos)</div>
                        {upcoming.length === 0 && <div style={{ fontSize: 12, color: C.faint }}>Sin programadas después de este periodo.</div>}
                        {upcoming.map((r) => (
                            <div key={r.codigo} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12 }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.plan, flexShrink: 0 }} />
                                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.descripcion}>{r.descripcion || r.codigo}</span>
                                <span style={{ fontFamily: C.mono, fontSize: 10, color: C.muted }}>VAL {String(r.first).padStart(2, '0')}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* TABLAS 4D (standalone en iframe con EDT real inyectado) */}
                <iframe
                    ref={iframeRef}
                    title="4D LOB — Tablas"
                    src={STANDALONE_URL}
                    onLoad={onIframeLoad}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: C.bg, display: tab === 'tablas' ? 'block' : 'none' }}
                />
            </div>

            {/* ── Cronograma nativo (gantt por partida) + controles ── */}
            {tab === 'sim' && (
                <div style={{ flexShrink: 0, borderTop: C.border, background: C.panel, padding: '10px 14px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <button
                            type="button"
                            onClick={() => setSimPlaying((p) => !p)}
                            disabled={!sim}
                            title={simPlaying ? 'Pausar' : 'Reproducir simulación 4D'}
                            style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: sim ? 'pointer' : 'default', background: simPlaying ? C.exec : C.done, color: '#0a0b0d', fontSize: 13, fontWeight: 900, opacity: sim ? 1 : 0.4 }}
                        >
                            {simPlaying ? '❚❚' : '▶'}
                        </button>
                        <span style={{ fontFamily: C.mono, fontSize: 13, fontWeight: 700 }}>{dateLabel}</span>
                        {[1, 4, 12].map((s) => (
                            <button key={s} type="button" onClick={() => setSimSpeed(s)}
                                style={{ ...chip(simSpeed === s), padding: '3px 8px', fontSize: 11 }}>×{s}</button>
                        ))}
                        <input
                            type="range" min={0} max={maxPeriod} step={0.02} value={simPeriod}
                            onChange={(e) => { setSimPlaying(false); setSimPeriod(Number(e.target.value)); }}
                            style={{ flex: 1, accentColor: C.accent }}
                            disabled={!sim}
                        />
                        <span style={{ fontFamily: C.mono, fontSize: 12, color: C.muted }}>
                            VAL {String(Math.floor(simPeriod) + 1).padStart(2, '0')}/{String(maxPeriod).padStart(2, '0')}
                        </span>
                    </div>

                    {/* Gantt: filas = partidas del frente; barras = periodos con ejecución */}
                    <div style={{ position: 'relative' }}>
                        {ganttRows.map((r) => (
                            <div key={r.codigo} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 18 }}>
                                <span style={{ width: 170, flexShrink: 0, fontSize: 10.5, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }} title={`${r.codigo} ${r.descripcion || ''}`}>
                                    {r.descripcion || r.codigo}
                                </span>
                                <div style={{ position: 'relative', flex: 1, height: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 5 }}>
                                    {r.first != null && (
                                        <div style={{
                                            position: 'absolute',
                                            left: `${((r.first - 1) / maxPeriod) * 100}%`,
                                            width: `${Math.max(1.5, ((r.last - r.first + 1) / maxPeriod) * 100)}%`,
                                            top: 0, bottom: 0, borderRadius: 5,
                                            background: stateColor(r.state), opacity: r.state === 'plan' ? 0.55 : 0.9,
                                        }} />
                                    )}
                                </div>
                            </div>
                        ))}
                        {ganttRows.length > 0 && (
                            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `calc(178px + (100% - 178px) * ${Math.min(1, simPeriod / maxPeriod)})`, width: 2, background: '#ef4444' }} title="Posición de simulación" />
                        )}
                        {ganttRows.length === 0 && (
                            <div style={{ fontSize: 12, color: C.faint, padding: '6px 0' }}>
                                {sim ? 'Este frente no tiene partidas con ejecución registrada.' : status}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Picker de modelos */}
            {pickerOpen && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 5, background: 'rgba(6,8,12,0.66)', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPickerOpen(false)}>
                    <div style={{ width: 'min(680px, 92vw)', maxHeight: '76vh', background: '#15181d', border: C.border, borderRadius: 12, overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
                        <div style={{ padding: '16px 20px', borderBottom: C.borderSoft, fontWeight: 800 }}>Modelos en el visor 4D</div>
                        <div style={{ padding: 16, maxHeight: '54vh', overflow: 'auto', display: 'grid', gap: 8 }}>
                            {availableModels.map((m) => {
                                const active = selectedUrns.includes(m._urn);
                                return (
                                    <label key={m._urn} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12, alignItems: 'center', padding: '10px 12px', borderRadius: 8, border: C.borderSoft, background: active ? 'rgba(58,160,255,0.10)' : '#1b2027', cursor: 'pointer' }}>
                                        <input type="checkbox" checked={active} style={{ accentColor: C.accent }}
                                            onChange={() => setSelectedUrns((prev) => (prev.includes(m._urn) ? prev.filter((u) => u !== m._urn) : [...prev, m._urn]))} />
                                        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m._label}</span>
                                        <span style={{ color: C.muted, fontSize: 11 }}>{m._front}</span>
                                    </label>
                                );
                            })}
                        </div>
                        <div style={{ padding: '12px 16px', borderTop: C.borderSoft, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                            <button type="button" onClick={() => setSelectedUrns(availableModels.map((m) => m._urn))} style={{ ...chip(false) }}>Todos</button>
                            <button type="button" onClick={() => setPickerOpen(false)} style={{ ...chip(true) }}>Aplicar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
