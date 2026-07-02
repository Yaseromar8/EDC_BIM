import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { loadAlignedModels } from '../aps/utils/loadAlignedModels';
import { apiFetch } from '../utils/apiFetch';
import { renderEdtExplorer, findVisibleEdtHost } from './lobEdtExplorer';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || (
    typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://visor-ecd-backend.onrender.com'
);

const STANDALONE_URL = '/4D%20LOB%20Progress%20-%20Standalone.html';
const LOB_DATA_FILES = [
    '/lob-data/DURACIONES%20LB00_R00.xlsm',
    '/lob-data/Metrados%20RIBA%205%20-%20Paquete%208_SINOHYDRO_V03.xlsx',
];

const cleanUrn = (urn) => String(urn || '').replace(/^urn:/i, '');

const HUD = {
    date: '13 Ene \u00b7 14:00',
    pk: '0+540',
    progress: 47.2,
};

const STATUS_ITEMS = [
    { label: 'Ejecutado', color: '#22c55e' },
    { label: 'En ejecucion', color: '#f59e0b' },
    { label: 'Programado', color: '#3aa0ff' },
    { label: 'Pendiente', color: '#232a34' },
];

const modelUrnOf = (model) => cleanUrn(model?.urn || model?.derivativeUrn || model?.id);
const modelLabelOf = (model) => model?.name || model?.displayName || model?.fileName || modelUrnOf(model);
const modelFrontOf = (model) => model?.appProjectId || model?.project || model?.front || model?.frente || 'Frente actual';
const normalizeButtonText = (value) => String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00e3\u00b1/g, 'n');

const findTextElement = (doc, text) => {
    if (!doc?.body) return null;
    const nodeFilter = doc.defaultView?.NodeFilter?.SHOW_TEXT || 4;
    const walker = doc.createTreeWalker(doc.body, nodeFilter);
    let node = walker.nextNode();
    while (node) {
        if (String(node.nodeValue || '').includes(text)) return node.parentElement;
        node = walker.nextNode();
    }
    return null;
};

const findViewerFrame = (doc) => {
    const label = findTextElement(doc, 'VISTA 3D') || findTextElement(doc, 'LMV VIEWER');
    if (!label) return null;
    let candidate = label;
    for (let i = 0; i < 10 && candidate; i += 1) {
        const rect = candidate.getBoundingClientRect();
        if (rect.width > 520 && rect.height > 320) return candidate;
        candidate = candidate.parentElement;
    }
    return null;
};

const injectEdtInfo = (doc, excelInfo) => {
    if (!excelInfo?.length) return;
    const edt = doc.getElementById('2a');
    if (!edt || doc.getElementById('lob-edt-data-status')) return;
    const panel = doc.createElement('div');
    panel.id = 'lob-edt-data-status';
    panel.style.cssText = 'margin-top:14px;background:#0e1014;border:1px solid #23262d;border-radius:10px;padding:14px 16px;font-family:Inter,system-ui,sans-serif;color:#d7dbe2;font-size:12px;';
    panel.innerHTML = `
      <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#6b7280;font-weight:700;margin-bottom:10px;">Datos EDT conectados</div>
      ${excelInfo.map((item) => `
        <div style="display:grid;grid-template-columns:1fr auto;gap:12px;padding:8px 0;border-top:1px solid #1c1f25;">
          <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.name}</div>
          <div style="font-family:'IBM Plex Mono',monospace;color:#8a919c;">${item.sheets.length} hojas &middot; ${item.rows} filas</div>
        </div>`).join('')}`;
    const inner = edt.querySelector('div[style*="height"]') || edt;
    inner.appendChild(panel);
};

function ViewerHud({ rect, hud = HUD }) {
    const progress = Math.max(0, Math.min(100, hud.progress ?? 0));
    const ring = `conic-gradient(#22c55e 0 ${progress}%, #232a34 ${progress}% 100%)`;
    const cardBase = {
        position: 'absolute',
        background: 'rgba(14,16,20,0.88)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 10,
        boxShadow: '0 12px 32px rgba(0,0,0,0.32)',
        color: '#e6e8ec',
        fontFamily: 'Inter, Artifakt Element, system-ui, sans-serif',
        boxSizing: 'border-box',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
    };

    return (
        <div
            style={{
                position: 'fixed',
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                zIndex: 2,
                pointerEvents: 'none',
            }}
        >
            <div style={{ ...cardBase, top: 14, left: 14, minWidth: 220, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700 }}>
                    Fecha de simulacion
                </div>
                <div style={{ fontFamily: 'IBM Plex Mono, Consolas, monospace', fontSize: 22, fontWeight: 700, marginTop: 6 }}>
                    {hud.date}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, fontSize: 11, color: '#8a919c' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#8a919c' }} />
                    {hud.sub || <>Frente activo <span style={{ color: '#c8cdd6', fontWeight: 700 }}>PK {hud.pk}</span></>}
                </div>
            </div>

            <div style={{ ...cardBase, top: 14, right: 14, padding: '13px 15px', minWidth: 128 }}>
                <div style={{ fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700, marginBottom: 9 }}>
                    Estado 4D
                </div>
                {STATUS_ITEMS.map((item) => (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12, fontWeight: 600, color: '#d7dbe2' }}>
                        <span style={{ width: 12, height: 12, borderRadius: 3, background: item.color }} />
                        {item.label}
                    </div>
                ))}
            </div>

            <div style={{ ...cardBase, left: 14, bottom: 14, width: 218, padding: '15px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 58, height: 58, borderRadius: '50%', background: ring, display: 'grid', placeItems: 'center', flex: '0 0 auto' }}>
                    <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#0e1014' }} />
                </div>
                <div>
                    <div style={{ fontSize: 21, fontWeight: 800, lineHeight: 1 }}>{(hud.progress ?? 0).toFixed(1)}%</div>
                    <div style={{ fontSize: 11, color: '#8a919c', marginTop: 4 }}>avance fisico global</div>
                </div>
            </div>
        </div>
    );
}

export default function LOB4DPanel({ onClose, models = [], activeViewableGuids = {} }) {
    const iframeRef = useRef(null);
    const pollRef = useRef(null);
    const rectTimerRef = useRef(null);
    const viewerHostRef = useRef(null);
    const lobViewerRef = useRef(null);
    const loadedKeyRef = useRef('');
    const [viewerRect, setViewerRect] = useState(null);
    const [viewerStatus, setViewerStatus] = useState('Preparando visor 4D...');
    const [excelInfo, setExcelInfo] = useState([]);
    const [selectedUrns, setSelectedUrns] = useState([]);
    const [pickerMode, setPickerMode] = useState(null);
    const [workspaceReady, setWorkspaceReady] = useState(false);

    // ── Motor 4D (datos reales del backend /api/lob) ──
    const [lobData, setLobData] = useState(null);      // { config, partidas, avance, frentes }
    const [simPeriod, setSimPeriod] = useState(0);     // posición del timeline (0..maxPeriod, continuo)
    const [simPlaying, setSimPlaying] = useState(false);
    const [hud, setHud] = useState(HUD);
    const [activeFrente, setActiveFrente] = useState(null); // frente del Excel (MAPEO_FRENTES); null = todos
    const rectRafRef = useRef(null);                   // rAF del tracking del visor (sin lag)
    const lastViewerSizeRef = useRef({ w: 0, h: 0 });

    const lobFrente = useMemo(
        () => modelFrontOf(models?.[0]) !== 'Frente actual'
            ? modelFrontOf(models?.[0])
            : 'global',
        [models]
    );

    const maxPeriod = useMemo(() => {
        if (!lobData) return 7;
        let max = 1;
        Object.values(lobData.avance || {}).forEach((periodos) => {
            Object.keys(periodos).forEach((p) => { max = Math.max(max, Number(p)); });
        });
        return max;
    }, [lobData]);

    // Cargar timeline del backend. Si el frente aún no tiene datos, AUTO-IMPORTA
    // los Excel (servidos en /lob-data) al backend — cero pasos manuales/curl.
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
                // re-importar también si aún no hay fechas P6 (import viejo sin XML)
                const needsImport = !d || !Object.keys(d.activities || {}).length;
                if (needsImport && alive) {
                    setViewerStatus('Importando cronograma 4D (Excel + P6 → backend)…');
                    const [durB, metB, xmlB] = await Promise.all([
                        ...LOB_DATA_FILES.map((u) => fetch(u).then((r) => (r.ok ? r.blob() : null)).catch(() => null)),
                        fetch('/lob-data/cronograma_p6.xml').then((r) => (r.ok ? r.blob() : null)).catch(() => null),
                    ]);
                    if (durB || metB || xmlB) {
                        const fd = new FormData();
                        fd.append('model_urn', lobFrente);
                        if (durB) fd.append('duraciones', new File([durB], 'duraciones.xlsm'));
                        if (metB) fd.append('metrados', new File([metB], 'metrados.xlsx'));
                        if (xmlB) fd.append('cronograma', new File([xmlB], 'cronograma_p6.xml'));
                        const ir = await apiFetch(`${BACKEND_URL}/api/lob/import`, { method: 'POST', body: fd, isUpload: true });
                        const ij = await ir.json().catch(() => ({}));
                        if (!ir.ok) throw new Error(ij.error || 'Import de cronograma falló');
                        d = await fetchTimeline();
                    }
                }
                if (!alive) return;
                if (d) {
                    setLobData(d);
                    setViewerStatus(`Cronograma 4D listo: ${d.partidas.length} partidas · ${Object.keys(d.activities || {}).length} fechas P6 · ${Object.keys(d.frentes || {}).length} frentes`);
                } else {
                    setViewerStatus('4D sin datos: el backend no tiene /api/lob (¿reiniciado?) o el import falló.');
                }
            } catch (e) {
                console.warn('[LOB4D] timeline/import:', e);
                if (alive) setViewerStatus('4D sin datos: reinicia el backend (rutas /api/lob nuevas).');
            }
        })();
        return () => { alive = false; };
    }, [lobFrente]);

    // Play: avanza el periodo suavemente
    useEffect(() => {
        if (!simPlaying) return;
        const t = window.setInterval(() => {
            setSimPeriod((prev) => {
                const next = prev + 0.05;
                if (next >= maxPeriod) { setSimPlaying(false); return maxPeriod; }
                return next;
            });
        }, 120);
        return () => window.clearInterval(t);
    }, [simPlaying, maxPeriod]);

    // Clasificar partidas al momento simPeriod y colorear POR ELEMENTO (via extensión)
    useEffect(() => {
        if (!lobData) return;
        const current = Math.floor(simPeriod) + 1;           // periodo 1-based en curso
        const byCode = lobData.avance || {};
        // FRENTE activo (del Excel MAPEO_FRENTES): filtra las partidas por prefijo
        const codBases = activeFrente ? (lobData.frentes?.[activeFrente] || []) : null;
        const partidas = (lobData.partidas || []).filter(
            (p) => !codBases || codBases.some((cb) => String(p.codigo).startsWith(cb))
        );

        const completedTasks = [];
        const activeTasks = [];
        const plannedTasks = [];
        let valorizado = 0;
        let total = 0;

        partidas.forEach((p) => {
            const periodos = byCode[p.codigo] || {};
            let acumPrev = 0;   // ejecutado en periodos ya CERRADOS
            let enCurso = 0;    // ejecutado en el periodo actual
            let futuro = 0;
            Object.entries(periodos).forEach(([per, val]) => {
                const n = Number(per);
                if (n < current) acumPrev += val;
                else if (n === current) enCurso = val;
                else futuro += val;
            });

            const met = p.metrado || 0;
            const pu = p.pu || 0;
            if (met > 0 && pu > 0) {
                total += met * pu;
                const frac = Math.min(1, (acumPrev + enCurso * (simPeriod - Math.floor(simPeriod))) / met);
                valorizado += met * pu * frac;
            }

            const task = { id: p.activity_id, code: p.codigo };
            if (met > 0 && acumPrev >= met * 0.995) completedTasks.push(task);
            else if (enCurso > 0) activeTasks.push(task);
            else if (acumPrev > 0) activeTasks.push(task);          // empezada, pausada
            else if (futuro > 0) plannedTasks.push(task);           // arranca después
        });

        // Fecha derivada de config (si existe); si no, etiqueta honesta de periodo
        const cfg = lobData.config || {};
        let dateLabel = `VAL N°${String(current).padStart(2, '0')}`;
        let dateISO = null;
        if (cfg.fecha_inicio) {
            const d = new Date(cfg.fecha_inicio);
            d.setDate(d.getDate() + Math.round(simPeriod * (cfg.dias_por_periodo || 30)));
            dateISO = d.toISOString();
            dateLabel = d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
        }

        const progress = total > 0 ? (valorizado / total) * 100 : 0;
        setHud({
            date: dateLabel,
            sub: `${completedTasks.length} listas · ${activeTasks.length} en curso · ${plannedTasks.length} programadas`,
            progress,
        });

        window.dispatchEvent(new CustomEvent('lob-time-update', {
            detail: { date: dateISO, tasks: activeTasks, completedTasks, plannedTasks, progress, frente: activeFrente },
        }));
    }, [lobData, simPeriod, activeFrente]);

    const availableModels = useMemo(() => {
        return (models || [])
            .map((model) => ({ ...model, _lobUrn: modelUrnOf(model), _lobLabel: modelLabelOf(model), _lobFront: modelFrontOf(model) }))
            .filter((model) => model._lobUrn);
    }, [models]);

    const availableFronts = useMemo(() => {
        const map = new Map();
        availableModels.forEach((model) => {
            if (!map.has(model._lobFront)) map.set(model._lobFront, []);
            map.get(model._lobFront).push(model);
        });
        return [...map.entries()].map(([name, items]) => ({ name, items }));
    }, [availableModels]);

    useEffect(() => {
        const urns = availableModels.map((model) => model._lobUrn);
        setSelectedUrns((prev) => {
            const kept = prev.filter((urn) => urns.includes(urn));
            return kept.length ? kept : urns;
        });
    }, [availableModels]);

    // Pausar el visor principal mientras el 4D LOB está abierto (como Comparar).
    useEffect(() => {
        try { window.NOP_VIEWER?.stop?.(); } catch (e) { /* noop */ }
        return () => {
            if (pollRef.current) window.clearInterval(pollRef.current);
            if (rectTimerRef.current) window.clearInterval(rectTimerRef.current);
            if (rectRafRef.current) window.cancelAnimationFrame(rectRafRef.current);
            // Limpiar theming 4D que la extensión del visor PRINCIPAL pudo aplicar
            // (también escucha 'lob-time-update' mientras está pausado).
            try { window.dispatchEvent(new CustomEvent('lob-clear')); } catch (e) { /* noop */ }
            try { lobViewerRef.current?.finish?.(); lobViewerRef.current = null; } catch (e) { /* noop */ }
            try { window.NOP_VIEWER?.start?.(); } catch (e) { /* noop */ }
        };
    }, []);

    // Cargar info EDT (Excel) para inyectar en el standalone.
    useEffect(() => {
        let alive = true;
        Promise.all(LOB_DATA_FILES.map(async (url) => {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`No se pudo leer ${url}`);
            const buffer = await response.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
            const first = workbook.Sheets[workbook.SheetNames[0]];
            const rows = first ? XLSX.utils.sheet_to_json(first, { header: 1, blankrows: false }).length : 0;
            return { name: decodeURIComponent(url.split('/').pop()), sheets: workbook.SheetNames, rows };
        }))
            .then((info) => {
                if (!alive) return;
                setExcelInfo(info);
                const doc = iframeRef.current?.contentDocument;
                if (doc) injectEdtInfo(doc, info);
            })
            .catch((err) => { console.warn('[LOB4D] Excel EDT:', err); if (alive) setExcelInfo([]); });
        return () => { alive = false; };
    }, []);

    // 2a EXPLORADOR EDT dinámico: árbol jerárquico + KPIs + detalle con el cruce
    // completo (Metrados ⨯ Valorizaciones ⨯ Cronograma P6). Ver lobEdtExplorer.js.
    // La vista 2a VISIBLE vive dentro del workspace #3a (la maqueta la dibuja al
    // clicar su tab), así que un intervalo la localiza por texto y la reemplaza;
    // si la maqueta la redibuja, se re-inyecta sola.
    useEffect(() => {
        if (!workspaceReady || !lobData) return;
        const timer = window.setInterval(() => {
            const doc = iframeRef.current?.contentDocument;
            if (!doc) return;
            doc.getElementById('lob-edt-data-status')?.remove();
            doc.getElementById('lob-edt-cross')?.remove();
            try {
                const visibleHost = findVisibleEdtHost(doc);
                if (visibleHost && !visibleHost.querySelector('#lob-edt-live')) {
                    renderEdtExplorer(doc, lobData, activeFrente, visibleHost);
                }
            } catch (e) { console.warn('[LOB4D] EDT explorer:', e); }
        }, 500);
        return () => window.clearInterval(timer);
    }, [workspaceReady, lobData, activeFrente]);

    const updateViewerRect = useCallback((iframe, frame) => {
        const iframeBox = iframe.getBoundingClientRect();
        const frameBox = frame.getBoundingClientRect();
        const next = {
            left: Math.round(iframeBox.left + frameBox.left),
            top: Math.round(iframeBox.top + frameBox.top),
            width: Math.round(frameBox.width),
            height: Math.round(frameBox.height),
        };
        if (next.width < 80 || next.height < 80) return;
        setViewerRect((prev) => {
            if (prev && Math.abs(prev.left - next.left) < 2 && Math.abs(prev.top - next.top) < 2 &&
                Math.abs(prev.width - next.width) < 2 && Math.abs(prev.height - next.height) < 2) return prev;
            return next;
        });
    }, []);

    // Aísla el workspace '3a' del standalone (tabs + paneles + área "VISTA 3D") y lo
    // escala para llenar el iframe. El visor real se monta sobre el frame "VISTA 3D".
    const wireStandaloneControls = useCallback((doc) => {
        const addButtons = Array.from(doc.querySelectorAll('button, a, [role="button"]'))
            .filter((el) => /anadir|agregar/.test(normalizeButtonText(el.textContent)));

        addButtons.forEach((button) => {
            if (button.dataset.lobBridgeAddWired) return;
            button.dataset.lobBridgeAddWired = '1';
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                setPickerMode('models');
            }, true);
        });

        const frontLabel = findTextElement(doc, 'FRENTE');
        const frontHost = frontLabel?.parentElement;
        if (frontHost && !doc.getElementById('lob-front-add-button')) {
            const add = doc.createElement('button');
            add.id = 'lob-front-add-button';
            add.type = 'button';
            add.textContent = '+ Añadir';
            add.style.cssText = [
                'margin-left:8px',
                'padding:5px 10px',
                'border-radius:6px',
                'border:1px dashed #33373f',
                'background:#15181d',
                'color:#8a919c',
                'font-size:11px',
                'font-weight:700',
                'cursor:pointer',
            ].join(';');
            add.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                setPickerMode('fronts');
            }, true);
            frontHost.appendChild(add);
        }
    }, []);

    const showOnlyWorkspace = useCallback((iframe) => {
        if (pollRef.current) window.clearInterval(pollRef.current);
        if (rectTimerRef.current) window.clearInterval(rectTimerRef.current);
        if (rectRafRef.current) window.cancelAnimationFrame(rectRafRef.current);
        setWorkspaceReady(false);
        setViewerRect(null);
        let attempts = 0;
        pollRef.current = window.setInterval(() => {
            attempts += 1;
            try {
                const doc = iframe.contentDocument || iframe.contentWindow?.document;
                if (!doc) return;
                const target = doc.getElementById('3a');
                if (!target) { if (attempts > 120) { window.clearInterval(pollRef.current); pollRef.current = null; } return; }

                window.clearInterval(pollRef.current);
                pollRef.current = null;

                doc.documentElement.style.cssText += ';margin:0;padding:0;width:100%;height:100%;overflow:hidden;';
                doc.body.style.cssText += ';margin:0;padding:0;width:100%;height:100%;background:#0a0b0d;overflow:hidden;';
                let bridgeStyle = doc.getElementById('lob-bridge-layout-style');
                if (!bridgeStyle) {
                    bridgeStyle = doc.createElement('style');
                    bridgeStyle.id = 'lob-bridge-layout-style';
                    doc.head.appendChild(bridgeStyle);
                }
                bridgeStyle.textContent = `
                    html, body {
                        width: 100% !important;
                        height: 100% !important;
                        min-height: 0 !important;
                        overflow: hidden !important;
                        background: #0a0b0d !important;
                    }
                    #3a {
                        position: fixed !important;
                        inset: 0 !important;
                        width: 100vw !important;
                        height: 100vh !important;
                        max-width: none !important;
                        max-height: none !important;
                        margin: 0 !important;
                        transform: none !important;
                        transform-origin: top left !important;
                        z-index: 999999 !important;
                        overflow: hidden !important;
                    }
                    #3a > :first-child {
                        display: none !important;
                    }
                `;

                const titleRow = target.firstElementChild;
                if (titleRow) titleRow.style.display = 'none';
                const shell = target.children[1];
                if (shell) {
                    shell.style.borderRadius = '0';
                    shell.style.border = 'none';
                    shell.style.boxShadow = 'none';
                    shell.style.margin = '0';
                    shell.style.width = '100%';
                    shell.style.height = '100%';
                    shell.style.maxWidth = 'none';
                    shell.style.maxHeight = 'none';
                    shell.style.minHeight = '0';
                    shell.style.display = 'flex';
                    shell.style.flexDirection = 'column';
                    if (shell.firstElementChild) shell.firstElementChild.style.display = 'none';
                }

                target.style.position = 'fixed';
                target.style.inset = '0';
                target.style.left = '0';
                target.style.top = '0';
                target.style.margin = '0';
                target.style.zIndex = '999999';
                target.style.transformOrigin = 'top left';
                target.style.transform = 'none';
                target.style.width = '100vw';
                target.style.height = '100vh';
                target.style.maxWidth = 'none';
                target.style.maxHeight = 'none';
                target.style.overflow = 'hidden';
                target.style.pointerEvents = 'auto';

                const fitWorkspace = () => {
                    target.style.width = '100vw';
                    target.style.height = '100vh';
                    target.style.transform = 'none';
                    target.style.left = '0';
                    target.style.top = '0';
                    if (shell) {
                        shell.style.width = '100%';
                        shell.style.height = '100%';
                        shell.style.maxWidth = 'none';
                    }
                };

                const frame = findViewerFrame(doc);
                if (frame) {
                    frame.style.background = '#10141a';
                    const label = findTextElement(doc, 'VISTA 3D');
                    if (label?.parentElement) label.parentElement.style.opacity = '0';
                }

                fitWorkspace();
                injectEdtInfo(doc, excelInfo);
                wireStandaloneControls(doc);
                setWorkspaceReady(true);

                // Tracking del área "VISTA 3D" por rAF (cada frame) con frame CACHEADO:
                // el visor sigue al layout sin el lag/flotado del polling de 350ms.
                if (rectRafRef.current) window.cancelAnimationFrame(rectRafRef.current);
                let cachedFrame = null;
                let tickCount = 0;
                const track = () => {
                    tickCount += 1;
                    if (!cachedFrame || !cachedFrame.isConnected || tickCount % 45 === 0) {
                        cachedFrame = findViewerFrame(doc);
                        fitWorkspace();
                        wireStandaloneControls(doc);
                    }
                    if (cachedFrame) updateViewerRect(iframe, cachedFrame);
                    rectRafRef.current = window.requestAnimationFrame(track);
                };
                rectRafRef.current = window.requestAnimationFrame(track);

                window.setTimeout(fitWorkspace, 250);
                window.setTimeout(fitWorkspace, 900);
            } catch (err) {
                window.clearInterval(pollRef.current);
                pollRef.current = null;
                console.warn('[LOB4D] No se pudo aislar 3a:', err);
            }
        }, 100);
    }, [excelInfo, updateViewerRect, wireStandaloneControls]);

    // Monta el visor NATIVO sobre el frame "VISTA 3D" de '3a' y carga los mismos
    // modelos del visor principal (misma vista + ubicación via helper compartido).
    // Sin Initializer: Autodesk.Viewing ya está inicializado por el visor principal
    // (evita el doble-init que crasheaba con "hasModels").
    useEffect(() => {
        const host = viewerHostRef.current;
        if (!host || !viewerRect || !window.Autodesk?.Viewing) return;

        const configs = (models || [])
            .filter((m) => m?.urn)
            .map((m) => {
                const urn = cleanUrn(m.urn);
                return { urn, viewGuid: activeViewableGuids[m.urn] || activeViewableGuids[urn] || m.defaultViewGuid || null };
            })
            .filter((config) => selectedUrns.includes(config.urn));
        if (!configs.length) {
            if (lobViewerRef.current) {
                try { lobViewerRef.current.finish(); } catch (e) { /* noop */ }
                lobViewerRef.current = null;
                loadedKeyRef.current = '';
            }
            setViewerStatus('No hay modelos vinculados para cargar en 4D LOB.');
            return;
        }

        const key = configs.map((c) => `${c.urn}:${c.viewGuid || ''}`).join('|');
        if (loadedKeyRef.current === key && lobViewerRef.current) {
            try { lobViewerRef.current.resize(); } catch (e) { /* noop */ }
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                if (lobViewerRef.current) { lobViewerRef.current.finish(); lobViewerRef.current = null; }
                const Ctor = window.Autodesk.Viewing.Viewer3D || window.Autodesk.Viewing.GuiViewer3D;
                const viewer = new Ctor(host, {});
                viewer.start();
                if (cancelled) { viewer.finish(); return; }
                lobViewerRef.current = viewer;
                loadedKeyRef.current = key;
                setViewerStatus(`Cargando ${configs.length} modelo${configs.length === 1 ? '' : 's'} en 4D LOB...`);
                await loadAlignedModels(viewer, configs);
                if (cancelled) return;
                try { viewer.fitToView(); } catch (e) { /* noop */ }
                // Motor 4D en ESTE visor: la extensión escucha 'lob-time-update' y
                // colorea POR ELEMENTO (índice por CodigoDePartida/ActivityID).
                try {
                    const ext = await viewer.loadExtension('LOB4DExtension');
                    // Reconocer lo activado en CIVIL: si hay eje/progresivas seleccionados
                    // (sesión o persistencia), dibujarlos también en el visor 4D.
                    const session = window.__civilToolsSession;
                    const rec = session?.records?.[session?.lastKey];
                    const civilData = rec?.alignmentData?.length ? rec.alignmentData : window.__lobCivilAlignments;
                    const civilSel = rec?.selectedAlignmentId || (civilData?.[0]?.alignmentId);
                    if (ext && civilData?.length && civilSel) {
                        ext.setStationAnnotationsVisible?.(rec?.stationLabelsVisible ?? true);
                        ext.bakeAlignment(civilData, civilSel);
                    }
                } catch (e) { console.warn('[LOB4D] ext:', e); }
                setViewerStatus(`${configs.length} modelo${configs.length === 1 ? '' : 's'} cargado${configs.length === 1 ? '' : 's'} en 4D LOB.`);
            } catch (err) {
                console.error('[LOB4D] Viewer load:', err);
                setViewerStatus('No se pudo cargar el modelo en el visor 4D.');
            }
        })();
        return () => { cancelled = true; };
    }, [models, viewerRect, activeViewableGuids, selectedUrns]);

    useEffect(() => {
        // resize() del visor SOLO cuando cambia el tamaño (no en cada movimiento):
        // re-layout del canvas en cada frame causaba el "flotado"/lag.
        if (!viewerRect) return;
        const last = lastViewerSizeRef.current;
        if (Math.abs(last.w - viewerRect.width) < 2 && Math.abs(last.h - viewerRect.height) < 2) return;
        lastViewerSizeRef.current = { w: viewerRect.width, h: viewerRect.height };
        try { lobViewerRef.current?.resize?.(); } catch (e) { /* noop */ }
    }, [viewerRect]);

    const toggleModelSelection = (urn) => {
        setSelectedUrns((prev) => {
            if (prev.includes(urn)) return prev.filter((item) => item !== urn);
            return [...prev, urn];
        });
    };

    const selectFront = (front) => {
        setSelectedUrns(front.items.map((model) => model._lobUrn));
        setPickerMode(null);
    };

    // Frentes REALES del Excel (MAPEO_FRENTES). Elegir uno filtra la simulación,
    // el EDT y los datos de todas las pestañas; además auto-selecciona los modelos
    // cuyo frente de app coincide por tokens (ej. 'DRENAJE URBANO' ↔ 'DRENAJE_URBANO').
    const excelFronts = useMemo(() => Object.keys(lobData?.frentes || {}), [lobData]);
    const selectExcelFront = (name) => {
        setActiveFrente((prev) => (prev === name ? null : name));
        const tokens = String(name).toUpperCase().split(/[^A-ZÑ0-9]+/).filter((t) => t.length >= 4);
        const matched = availableModels.filter((m) => {
            const hay = `${m._lobFront} ${m._lobLabel}`.toUpperCase();
            return tokens.some((t) => hay.includes(t));
        });
        if (matched.length) setSelectedUrns(matched.map((m) => m._lobUrn));
        setPickerMode(null);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#0a0b0d', pointerEvents: 'auto' }}>
            <iframe
                ref={iframeRef}
                title="4D LOB Progress"
                src={STANDALONE_URL}
                onLoad={(event) => showOnlyWorkspace(event.currentTarget)}
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    background: '#0a0b0d',
                    zIndex: 0,
                    opacity: workspaceReady ? 1 : 0,
                    transition: 'opacity 120ms ease',
                }}
            />

            {viewerRect && (
                <div
                    ref={viewerHostRef}
                    style={{ position: 'fixed', left: viewerRect.left, top: viewerRect.top, width: viewerRect.width, height: viewerRect.height, zIndex: 1, background: '#10141a', overflow: 'hidden' }}
                />
            )}

            {viewerRect && <ViewerHud rect={viewerRect} hud={hud} />}

            {/* Timeline 4D (datos reales; solo si hay import en el backend) */}
            {viewerRect && lobData && (
                <div style={{
                    position: 'fixed',
                    left: viewerRect.left + Math.max(12, viewerRect.width * 0.18),
                    width: Math.min(viewerRect.width * 0.64, 720),
                    top: viewerRect.top + viewerRect.height - 58,
                    zIndex: 3,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    background: 'rgba(14,16,20,0.9)',
                    border: '1px solid rgba(255,255,255,0.10)',
                    borderRadius: 10,
                    padding: '10px 14px',
                    pointerEvents: 'auto',
                }}>
                    <button
                        type="button"
                        onClick={() => setSimPlaying((p) => !p)}
                        title={simPlaying ? 'Pausar simulación' : 'Reproducir simulación 4D'}
                        style={{
                            width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer',
                            background: simPlaying ? '#e0982a' : '#22c55e', color: '#0a0b0d',
                            fontSize: 14, fontWeight: 900, flex: '0 0 auto',
                        }}
                    >
                        {simPlaying ? '❚❚' : '▶'}
                    </button>
                    <input
                        type="range"
                        min={0}
                        max={maxPeriod}
                        step={0.05}
                        value={simPeriod}
                        onChange={(e) => { setSimPlaying(false); setSimPeriod(Number(e.target.value)); }}
                        style={{ flex: 1, accentColor: '#3aa0ff' }}
                    />
                    <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: 12, color: '#c8cdd6', flex: '0 0 auto', minWidth: 86, textAlign: 'right' }}>
                        VAL {String(Math.floor(simPeriod) + 1).padStart(2, '0')}/{String(maxPeriod).padStart(2, '0')}
                    </span>
                </div>
            )}

            {pickerMode && (
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        zIndex: 4,
                        background: 'rgba(6,8,12,0.66)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'Inter, Artifakt Element, system-ui, sans-serif',
                        color: '#d7dbe2',
                    }}
                    onClick={() => setPickerMode(null)}
                >
                    <div
                        style={{
                            width: 'min(760px, 92vw)',
                            maxHeight: '78vh',
                            background: '#15181d',
                            border: '1px solid rgba(255,255,255,0.10)',
                            borderRadius: 12,
                            boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
                            overflow: 'hidden',
                        }}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ fontSize: 16, fontWeight: 800 }}>
                                {pickerMode === 'fronts' ? 'Añadir frente al 4D LOB' : 'Añadir modelos al 4D LOB'}
                            </div>
                            <div style={{ marginLeft: 'auto', fontSize: 12, color: '#8a919c' }}>
                                {selectedUrns.length} / {availableModels.length} modelos activos
                            </div>
                        </div>

                        <div style={{ padding: 18, maxHeight: '55vh', overflow: 'auto' }}>
                            {pickerMode === 'fronts' && excelFronts.length > 0 ? (
                                <div style={{ display: 'grid', gap: 10 }}>
                                    <div style={{ fontSize: 11, color: '#8a919c', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                                        Frentes del cronograma (Excel)
                                    </div>
                                    {excelFronts.map((name) => {
                                        const active = activeFrente === name;
                                        const nCods = (lobData?.frentes?.[name] || []).length;
                                        return (
                                            <button
                                                key={name}
                                                type="button"
                                                onClick={() => selectExcelFront(name)}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '1fr auto',
                                                    gap: 12,
                                                    alignItems: 'center',
                                                    textAlign: 'left',
                                                    padding: '12px 14px',
                                                    borderRadius: 8,
                                                    border: active ? '1px solid #3aa0ff' : '1px solid rgba(255,255,255,0.09)',
                                                    background: active ? 'rgba(58,160,255,0.16)' : '#1b2027',
                                                    color: '#d7dbe2',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <span style={{ fontWeight: 800 }}>{name}{active ? ' ✓' : ''}</span>
                                                <span style={{ color: '#8a919c', fontSize: 12 }}>{nCods} códigos EDT</span>
                                            </button>
                                        );
                                    })}
                                    {activeFrente && (
                                        <button
                                            type="button"
                                            onClick={() => { setActiveFrente(null); setPickerMode(null); }}
                                            style={{ border: '1px dashed rgba(255,255,255,0.2)', background: 'transparent', color: '#8a919c', borderRadius: 8, padding: '10px 14px', cursor: 'pointer' }}
                                        >
                                            Quitar filtro de frente (ver todo)
                                        </button>
                                    )}
                                </div>
                            ) : pickerMode === 'fronts' ? (
                                <div style={{ display: 'grid', gap: 10 }}>
                                    {availableFronts.map((front) => {
                                        const activeCount = front.items.filter((model) => selectedUrns.includes(model._lobUrn)).length;
                                        return (
                                            <button
                                                key={front.name}
                                                type="button"
                                                onClick={() => selectFront(front)}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: '1fr auto',
                                                    gap: 12,
                                                    alignItems: 'center',
                                                    textAlign: 'left',
                                                    padding: '12px 14px',
                                                    borderRadius: 8,
                                                    border: '1px solid rgba(255,255,255,0.09)',
                                                    background: activeCount ? 'rgba(58,160,255,0.10)' : '#1b2027',
                                                    color: '#d7dbe2',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <span style={{ fontWeight: 800 }}>{front.name}</span>
                                                <span style={{ color: '#8a919c', fontSize: 12 }}>{front.items.length} modelos</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ display: 'grid', gap: 8 }}>
                                    {availableModels.map((model) => {
                                        const active = selectedUrns.includes(model._lobUrn);
                                        return (
                                            <label
                                                key={model._lobUrn}
                                                style={{
                                                    display: 'grid',
                                                    gridTemplateColumns: 'auto 1fr auto',
                                                    gap: 12,
                                                    alignItems: 'center',
                                                    padding: '10px 12px',
                                                    borderRadius: 8,
                                                    border: '1px solid rgba(255,255,255,0.08)',
                                                    background: active ? 'rgba(58,160,255,0.10)' : '#1b2027',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={active}
                                                    onChange={() => toggleModelSelection(model._lobUrn)}
                                                    style={{ accentColor: '#3aa0ff' }}
                                                />
                                                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {model._lobLabel}
                                                </span>
                                                <span style={{ color: '#8a919c', fontSize: 11 }}>{model._lobFront}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div style={{ padding: '14px 18px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                            <button
                                type="button"
                                onClick={() => setSelectedUrns(availableModels.map((model) => model._lobUrn))}
                                style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#8a919c', borderRadius: 7, padding: '8px 12px', cursor: 'pointer' }}
                            >
                                Cargar todos
                            </button>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button
                                    type="button"
                                    onClick={() => setPickerMode(null)}
                                    style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#8a919c', borderRadius: 7, padding: '8px 14px', cursor: 'pointer' }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPickerMode(null)}
                                    style={{ border: 'none', background: '#3aa0ff', color: '#fff', borderRadius: 7, padding: '8px 16px', cursor: 'pointer', fontWeight: 800 }}
                                >
                                    Aplicar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ position: 'absolute', left: 20, bottom: 14, zIndex: 3, background: 'rgba(14,16,20,0.82)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: '#8a919c', fontSize: 12, pointerEvents: 'none' }}>
                {viewerStatus}{excelInfo.length > 0 && ` · EDT: ${excelInfo.length} archivos`}
            </div>

            <button type="button" onClick={onClose} aria-label="Cerrar 4D LOB" title="Cerrar 4D LOB"
                style={{ position: 'absolute', top: 12, right: 14, zIndex: 3, width: 34, height: 34, borderRadius: 7, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(14,16,20,0.86)', color: '#d7dbe2', cursor: 'pointer', fontSize: 18, fontWeight: 700, lineHeight: '30px' }}>
                x
            </button>
        </div>
    );
}
