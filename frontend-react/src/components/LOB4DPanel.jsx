import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { loadAlignedModels } from '../aps/utils/loadAlignedModels';

const STANDALONE_URL = '/4D%20LOB%20Progress%20-%20Standalone.html';
const LOB_DATA_FILES = [
    '/lob-data/DURACIONES%20LB00_R00.xlsm',
    '/lob-data/Metrados%20RIBA%205%20-%20Paquete%208_SINOHYDRO_V03.xlsx',
];

const cleanUrn = (urn) => String(urn || '').replace(/^urn:/i, '');

const findTextElement = (doc, text) => {
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
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
          <div style="font-family:'IBM Plex Mono',monospace;color:#8a919c;">${item.sheets.length} hojas · ${item.rows} filas</div>
        </div>`).join('')}`;
    const inner = edt.querySelector('div[style*="height"]') || edt;
    inner.appendChild(panel);
};

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

    // Pausar el visor principal mientras el 4D LOB está abierto (como Comparar).
    useEffect(() => {
        try { window.NOP_VIEWER?.stop?.(); } catch (e) { /* noop */ }
        return () => {
            if (pollRef.current) window.clearInterval(pollRef.current);
            if (rectTimerRef.current) window.clearInterval(rectTimerRef.current);
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
    const showOnlyWorkspace = useCallback((iframe) => {
        if (pollRef.current) window.clearInterval(pollRef.current);
        if (rectTimerRef.current) window.clearInterval(rectTimerRef.current);
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

                const titleRow = target.firstElementChild;
                if (titleRow) titleRow.style.display = 'none';
                const shell = target.children[1];
                if (shell) {
                    shell.style.borderRadius = '0';
                    shell.style.border = 'none';
                    shell.style.boxShadow = 'none';
                    shell.style.margin = '0';
                    if (shell.firstElementChild) shell.firstElementChild.style.display = 'none';
                }

                target.style.position = 'fixed';
                target.style.left = '50%';
                target.style.top = '50%';
                target.style.margin = '0';
                target.style.zIndex = '999999';
                target.style.transformOrigin = 'top left';
                target.style.pointerEvents = 'auto';

                const fitWorkspace = () => {
                    const vw = doc.documentElement.clientWidth || iframe.clientWidth || 1;
                    const vh = doc.documentElement.clientHeight || iframe.clientHeight || 1;
                    const tw = target.scrollWidth || target.offsetWidth || 1520;
                    const th = target.scrollHeight || target.offsetHeight || 968;
                    const scale = Math.min(vw / tw, vh / th, 1.18);
                    target.style.width = `${tw}px`;
                    target.style.height = `${th}px`;
                    target.style.transform = `translate(-50%, -50%) scale(${scale})`;
                };

                const frame = findViewerFrame(doc);
                if (frame) {
                    frame.style.background = '#10141a';
                    const label = findTextElement(doc, 'VISTA 3D');
                    if (label?.parentElement) label.parentElement.style.opacity = '0';
                }

                fitWorkspace();
                injectEdtInfo(doc, excelInfo);

                rectTimerRef.current = window.setInterval(() => {
                    fitWorkspace();
                    const currentFrame = findViewerFrame(doc);
                    if (currentFrame) updateViewerRect(iframe, currentFrame);
                }, 350);

                window.setTimeout(fitWorkspace, 250);
                window.setTimeout(fitWorkspace, 900);
            } catch (err) {
                window.clearInterval(pollRef.current);
                pollRef.current = null;
                console.warn('[LOB4D] No se pudo aislar 3a:', err);
            }
        }, 100);
    }, [excelInfo, updateViewerRect]);

    // Monta el visor NATIVO sobre el frame "VISTA 3D" de '3a' y carga los mismos
    // modelos del visor principal (misma vista + ubicación via helper compartido).
    // Sin Initializer: Autodesk.Viewing ya está inicializado por el visor principal
    // (evita el doble-init que crasheaba con "hasModels").
    useEffect(() => {
        const host = viewerHostRef.current;
        if (!host || !viewerRect || !window.Autodesk?.Viewing) return;

        const configs = (models || [])
            .filter((m) => m?.urn)
            .map((m) => ({ urn: cleanUrn(m.urn), viewGuid: activeViewableGuids[m.urn] || m.defaultViewGuid || null }));
        if (!configs.length) { setViewerStatus('No hay modelos vinculados para cargar en 4D LOB.'); return; }

        const key = configs.map((c) => c.urn).join('|');
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
                setViewerStatus(`${configs.length} modelo${configs.length === 1 ? '' : 's'} cargado${configs.length === 1 ? '' : 's'} en 4D LOB.`);
            } catch (err) {
                console.error('[LOB4D] Viewer load:', err);
                setViewerStatus('No se pudo cargar el modelo en el visor 4D.');
            }
        })();
        return () => { cancelled = true; };
    }, [models, viewerRect, activeViewableGuids]);

    useEffect(() => {
        try { lobViewerRef.current?.resize?.(); } catch (e) { /* noop */ }
    }, [viewerRect]);

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9000, background: '#0a0b0d', pointerEvents: 'auto' }}>
            <iframe
                ref={iframeRef}
                title="4D LOB Progress"
                src={STANDALONE_URL}
                onLoad={(event) => showOnlyWorkspace(event.currentTarget)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none', background: '#0a0b0d', zIndex: 0 }}
            />

            {viewerRect && (
                <div
                    ref={viewerHostRef}
                    style={{ position: 'fixed', left: viewerRect.left, top: viewerRect.top, width: viewerRect.width, height: viewerRect.height, zIndex: 1, background: '#10141a', overflow: 'hidden' }}
                />
            )}

            <div style={{ position: 'absolute', left: 20, bottom: 14, zIndex: 2, background: 'rgba(14,16,20,0.82)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '8px 12px', color: '#8a919c', fontSize: 12, pointerEvents: 'none' }}>
                {viewerStatus}{excelInfo.length > 0 && ` · EDT: ${excelInfo.length} archivos`}
            </div>

            <button type="button" onClick={onClose} aria-label="Cerrar 4D LOB" title="Cerrar 4D LOB"
                style={{ position: 'absolute', top: 12, right: 14, zIndex: 2, width: 34, height: 34, borderRadius: 7, border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(14,16,20,0.86)', color: '#d7dbe2', cursor: 'pointer', fontSize: 18, fontWeight: 700, lineHeight: '30px' }}>
                x
            </button>
        </div>
    );
}
