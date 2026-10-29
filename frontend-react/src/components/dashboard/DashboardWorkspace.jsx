// DashboardWorkspace — Tablero de análisis del frente (lienzo tipo Miro).
// =============================================================================
// Panel dividido junto al 3D con un LIENZO INFINITO propio (sin dependencias):
//   · pan (arrastrar el fondo) + zoom (rueda hacia el cursor) + encajar vista
//   · nodos flotantes: los mueves (asa = cabecera) y redimensionas (esquina)
//   · nodo "Parámetros": la fuente QA — clic en un parámetro → gráfico
// Los gráficos leen SOLO de la nube (Inventory/Postgres precargado) y
// sincronizan con el visor: clic en segmento → aísla; "Pintar" → colorea
// (y se replica a Revit si el Live Link está activo).
// Persistencia por frente en Postgres (/api/dashboards) con autoguardado —
// incluye posición/tamaño de cada nodo y el encuadre del lienzo.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '../../utils/apiFetch';
import { SOURCES, discoverFields, isolateInViewer, colorizeInViewer, clearViewerViz, resetEngineCaches, fmt } from './engine';
import ChartCard from './ChartCard';
import ChartEditor from './ChartEditor';
import { C, FUENTE, RADIO, REJILLA, COLUMNA, HUECO, ANCHOS, ALTO_DEFECTO, anchoCercano, altoMinimo, nombreCampo } from './tema';

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
// Tamaños de tarjeta sobre la cuadrícula (tema.js): S, M y L = 1, 2 y 3 columnas,
// para que los bordes de las tarjetas siempre coincidan (docs/visor/41).
const NODE_DEFAULT = { w: ANCHOS.m, h: ALTO_DEFECTO.grafico };
const NODE_KPI = { w: ANCHOS.s, h: ALTO_DEFECTO.kpi };
const tamanoDe = (cfg) => (cfg.type === 'kpi' ? NODE_KPI : { w: ANCHOS[cfg.size] || NODE_DEFAULT.w, h: NODE_DEFAULT.h });
// Encaje a rejilla al mover/redimensionar (patrón Vyssuals: lienzo ordenado,
// nodos alineados sin esfuerzo).
const SNAP = REJILLA;
const snap = (v) => Math.round(v / SNAP) * SNAP;
// Tipografía: IBM Plex Sans para todo, la letra del sistema (D-26).
const FONT_UI = FUENTE;
export const FONT_TITLE = FUENTE;
// Secciones (frames) estilo Miro: título sobre una región que agrupa nodos — la
// estructura narrativa del tablero del usuario en Miro. Una línea de color de la
// paleta oficial marca cada sección; el fondo es siempre el mismo, sobrio.
const FRAME_COLORS = [C.orange, C.blue, C.green, C.gris700];
const ANCHO_SECCION = ANCHOS.l + HUECO * 2;
const horaCorta = () => new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });

// Posición por defecto en cascada para tableros guardados sin layout (migración
// desde la versión en rejilla) o nodos nuevos sin punto de inserción.
const withLayout = (list) => list.map((c, i) => ({
  ...c,
  x: c.x ?? 40 + (i % 2) * 470,
  y: c.y ?? 40 + Math.floor(i / 2) * 390,
  w: c.w ?? (c.type === 'kpi' ? NODE_KPI.w : NODE_DEFAULT.w),
  h: c.h ?? (c.type === 'kpi' ? NODE_KPI.h : NODE_DEFAULT.h),
}));

export default function DashboardWorkspace({ project, backendUrl, onClose }) {
  const [rows, setRows] = useState(null);          // dataset (null = cargando)
  const [fields, setFields] = useState([]);
  const [hora, setHora] = useState('');             // cuándo se leyó el inventario
  const [dashId, setDashId] = useState(null);
  const [dashName, setDashName] = useState('General');
  const [charts, setCharts] = useState([]);
  const [frames, setFrames] = useState([]);         // secciones estilo Miro
  const framesRef = useRef(frames);
  const [editing, setEditing] = useState(null);     // config en edición | 'new'
  const [active, setActive] = useState(null);       // { chartId, key } aislado
  const [saveState, setSaveState] = useState('');
  const [width, setWidth] = useState(() => Math.min(Math.round(window.innerWidth * 0.5), 820));
  const [view, setView] = useState({ tx: 30, ty: 30, s: 0.85 }); // encuadre del lienzo
  const [locked, setLocked] = useState(false); // candado: bloquea mover/redimensionar nodos
  const lockedRef = useRef(false);
  useEffect(() => { lockedRef.current = locked; }, [locked]);
  const viewRef = useRef(view);
  const chartsRef = useRef(charts);
  const canvasRef = useRef(null);
  const saveTimer = useRef(null);
  const loadedRef = useRef(false);

  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { chartsRef.current = charts; }, [charts]);
  useEffect(() => { framesRef.current = frames; }, [frames]);

  // ── Split REAL con el visor: anunciar nuestro ancho para que el contenedor
  // del 3D se encoja (su ResizeObserver llama a viewer.resize()). Al cerrar,
  // se anuncia 0 y el visor recupera todo el lienzo. Nada queda tapado.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('tablero-width', { detail: { width } }));
  }, [width]);
  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent('tablero-width', { detail: { width: 0 } }));
  }, []);

  // ── Dataset: Inventory de la nube (precargado por App.jsx) ────────────────
  useEffect(() => {
    let stop = false;
    resetEngineCaches();
    (async () => {
      const data = await SOURCES.inventory.getRows();
      if (stop) return;
      setRows(data);
      setFields(discoverFields(data));
      setHora(horaCorta());
    })();
    return () => { stop = true; };
  }, [project]);

  // ── Cargar (o crear) el tablero del frente ────────────────────────────────
  useEffect(() => {
    let stop = false;
    loadedRef.current = false;
    (async () => {
      try {
        const r = await apiFetch(`${backendUrl}/api/dashboards?project=${encodeURIComponent(project)}`);
        const d = await r.json();
        if (stop) return;
        if (d.dashboards?.length) {
          const first = d.dashboards[0];
          const rr = await apiFetch(`${backendUrl}/api/dashboards/${first.id}`);
          const dd = await rr.json();
          if (stop) return;
          setDashId(first.id);
          setDashName(dd.name || 'General');
          setCharts(withLayout(Array.isArray(dd.config?.charts) ? dd.config.charts : []));
          setFrames(Array.isArray(dd.config?.frames) ? dd.config.frames : []);
          if (dd.config?.view) setView(dd.config.view);
        } else {
          const rr = await apiFetch(`${backendUrl}/api/dashboards`, {
            method: 'POST',
            body: JSON.stringify({ project, name: 'General', config: { version: 2, charts: [] } }),
          });
          const dd = await rr.json();
          if (!stop && dd.id) setDashId(dd.id);
        }
      } catch (e) { console.warn('[Tablero] No se pudo cargar:', e); }
      finally { if (!stop) loadedRef.current = true; }
    })();
    return () => { stop = true; };
  }, [project, backendUrl]);

  // ── Autoguardado (nodos + secciones + encuadre) ───────────────────────────
  useEffect(() => {
    if (!dashId || !loadedRef.current) return undefined;
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await apiFetch(`${backendUrl}/api/dashboards/${dashId}`, {
          method: 'PUT',
          body: JSON.stringify({ config: { version: 2, charts, frames, view: viewRef.current } }),
        });
        setSaveState('saved');
        setTimeout(() => setSaveState(''), 1600);
      } catch { setSaveState(''); }
    }, 1200);
    return () => clearTimeout(saveTimer.current);
  }, [charts, frames, dashId, backendUrl]);

  // ── Lienzo: zoom con la rueda HACIA el cursor (listener nativo, no pasivo) ─
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left, py = e.clientY - rect.top;
      const v = viewRef.current;
      const s = clamp(v.s * Math.exp(-e.deltaY * 0.0013), 0.2, 2.2);
      // conservar el punto del mundo que está bajo el cursor
      const wx = (px - v.tx) / v.s, wy = (py - v.ty) / v.s;
      setView({ s, tx: px - wx * s, ty: py - wy * s });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [rows === null]);

  // Pan: arrastrar el fondo del lienzo (no un nodo).
  const onPanStart = (e) => {
    if (e.button !== 0) return;
    const start = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
    const onMove = (ev) => setView(v => ({ ...v, tx: start.tx + ev.clientX - start.x, ty: start.ty + ev.clientY - start.y }));
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Mover un nodo (asa = cabecera de la tarjeta). Con encaje a rejilla.
  const startMove = (id) => (e) => {
    if (e.button !== 0 || lockedRef.current) return;
    e.preventDefault(); e.stopPropagation();
    const v = viewRef.current;
    const node = chartsRef.current.find(c => c.id === id);
    if (!node) return;
    const start = { x: e.clientX, y: e.clientY, nx: node.x, ny: node.y };
    const onMove = (ev) => {
      const dx = (ev.clientX - start.x) / v.s, dy = (ev.clientY - start.y) / v.s;
      setCharts(cs => cs.map(c => (c.id === id ? { ...c, x: snap(start.nx + dx), y: snap(start.ny + dy) } : c)));
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Redimensionar un nodo (esquina inferior derecha). Con encaje a rejilla.
  const startResize = (id) => (e) => {
    if (e.button !== 0 || lockedRef.current) return;
    e.preventDefault(); e.stopPropagation();
    const v = viewRef.current;
    const node = chartsRef.current.find(c => c.id === id);
    if (!node) return;
    const start = { x: e.clientX, y: e.clientY, w: node.w, h: node.h };
    const onMove = (ev) => {
      const dw = (ev.clientX - start.x) / v.s, dh = (ev.clientY - start.y) / v.s;
      // El ancho salta a S, M o L (todo encaja); el alto sigue la cuadrícula.
      setCharts(cs => cs.map(c => (c.id === id ? { ...c, w: anchoCercano(clamp(start.w + dw, ANCHOS.s, ANCHOS.l)), h: snap(clamp(start.h + dh, 144, 912)) } : c)));
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Secciones estilo Miro ─────────────────────────────────────────────────
  const addFrame = () => {
    const size = { w: ANCHO_SECCION, h: 656 };
    const pos = insertPoint(size.w, size.h);
    setFrames(fs => [...fs, {
      id: uid(), title: `Sección ${fs.length + 1}`, color: fs.length % FRAME_COLORS.length,
      x: snap(pos.x), y: snap(pos.y), ...size,
    }]);
  };
  const removeFrame = (id) => setFrames(fs => fs.filter(f => f.id !== id)); // no borra los nodos
  const renameFrame = (id, title) => setFrames(fs => fs.map(f => (f.id === id ? { ...f, title } : f)));

  // Mover una sección ARRASTRA también los nodos contenidos (comportamiento Miro).
  const startMoveFrame = (id) => (e) => {
    if (e.button !== 0 || lockedRef.current) return;
    e.preventDefault(); e.stopPropagation();
    const v = viewRef.current;
    const f = framesRef.current.find(x => x.id === id);
    if (!f) return;
    const start = { x: e.clientX, y: e.clientY, fx: f.x, fy: f.y };
    // qué nodos viven dentro (por su centro) AL INICIO del arrastre
    const contained = new Map(chartsRef.current
      .filter(c => {
        const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
        return cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h;
      })
      .map(c => [c.id, { x: c.x, y: c.y }]));
    const onMove = (ev) => {
      const dx = (ev.clientX - start.x) / v.s, dy = (ev.clientY - start.y) / v.s;
      setFrames(fs => fs.map(x => (x.id === id ? { ...x, x: snap(start.fx + dx), y: snap(start.fy + dy) } : x)));
      if (contained.size) {
        setCharts(cs => cs.map(c => {
          const o = contained.get(c.id);
          return o ? { ...c, x: snap(o.x + dx), y: snap(o.y + dy) } : c;
        }));
      }
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startResizeFrame = (id) => (e) => {
    if (e.button !== 0 || lockedRef.current) return;
    e.preventDefault(); e.stopPropagation();
    const v = viewRef.current;
    const f = framesRef.current.find(x => x.id === id);
    if (!f) return;
    const start = { x: e.clientX, y: e.clientY, w: f.w, h: f.h };
    const onMove = (ev) => {
      const dw = (ev.clientX - start.x) / v.s, dh = (ev.clientY - start.y) / v.s;
      setFrames(fs => fs.map(x => (x.id === id ? { ...x, w: snap(Math.max(start.w + dw, 240)), h: snap(Math.max(start.h + dh, 160)) } : x)));
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Encajar todo (nodos + secciones) en la vista.
  const fitView = useCallback(() => {
    const list = [...chartsRef.current, ...framesRef.current];
    const el = canvasRef.current;
    if (!el || !list.length) { setView({ tx: 30, ty: 30, s: 0.85 }); return; }
    const minX = Math.min(...list.map(c => c.x)) - 40;
    const minY = Math.min(...list.map(c => c.y)) - 40;
    const maxX = Math.max(...list.map(c => c.x + c.w)) + 40;
    const maxY = Math.max(...list.map(c => c.y + c.h)) + 40;
    const rect = el.getBoundingClientRect();
    const s = clamp(Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY)), 0.2, 1.15);
    setView({
      s,
      tx: (rect.width - (maxX - minX) * s) / 2 - minX * s,
      ty: (rect.height - (maxY - minY) * s) / 2 - minY * s,
    });
  }, []);

  const zoomBy = (factor) => {
    const el = canvasRef.current;
    const rect = el ? el.getBoundingClientRect() : { width: 600, height: 600 };
    const px = rect.width / 2, py = rect.height / 2;
    const v = viewRef.current;
    const s = clamp(v.s * factor, 0.2, 2.2);
    const wx = (px - v.tx) / v.s, wy = (py - v.ty) / v.s;
    setView({ s, tx: px - wx * s, ty: py - wy * s });
  };

  // Punto de inserción de una SECCIÓN: centro visible del lienzo (coords de mundo).
  const insertPoint = (w, h) => {
    const el = canvasRef.current;
    const rect = el ? el.getBoundingClientRect() : { width: 700, height: 600 };
    const v = viewRef.current;
    return {
      x: Math.round((rect.width / 2 - v.tx) / v.s - w / 2),
      y: Math.round((rect.height / 2 - v.ty) / v.s - h / 2),
    };
  };

  // Una tarjeta nueva entra en el PRIMER HUECO LIBRE, alineada a las columnas: dentro
  // de la sección que está en el centro de la vista, o desde la esquina visible si no
  // hay sección. Nunca encima de otra (docs/visor/41 §1, hallazgo 7).
  const huecoLibre = (w, h) => {
    const el = canvasRef.current;
    const rect = el ? el.getBoundingClientRect() : { width: 700, height: 600 };
    const v = viewRef.current;
    const cx = (rect.width / 2 - v.tx) / v.s, cy = (rect.height / 2 - v.ty) / v.s;
    const marco = framesRef.current.find(f => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h) || null;
    const x0 = snap(marco ? marco.x + HUECO : -v.tx / v.s + 32);
    const y0 = snap(marco ? marco.y + HUECO : -v.ty / v.s + 32);
    // Siempre tres columnas como mínimo (las secciones de antes medían 992): si hace
    // falta, la sección se ensancha al poner la tarjeta (crecerSeccion).
    const ancho = Math.max((marco ? Math.max(marco.w, ANCHO_SECCION) : ANCHO_SECCION) - HUECO * 2, w);
    const choca = (x, y) => chartsRef.current.some(c =>
      x < c.x + c.w + HUECO && x + w + HUECO > c.x && y < c.y + c.h + HUECO && y + h + HUECO > c.y);
    for (let y = y0; y < y0 + 8000; y += REJILLA) {
      for (let x = x0; x + w <= x0 + ancho; x += COLUMNA + HUECO) {
        if (!choca(x, y)) return { x, y, marco };
      }
    }
    return { x: x0, y: y0, marco };
  };
  // Si la tarjeta cae fuera de su sección (más abajo o más a la derecha), la sección
  // crece para contenerla.
  const crecerSeccion = (marco, x, y, w, h) => {
    if (!marco) return;
    const alto = snap(y + h + HUECO - marco.y);
    const ancho = snap(x + w + HUECO - marco.x);
    if (alto > marco.h || ancho > marco.w) {
      setFrames(fs => fs.map(f => (f.id === marco.id ? { ...f, h: Math.max(f.h, alto), w: Math.max(f.w, ancho) } : f)));
    }
  };

  // «Ordenar»: acomoda las tarjetas de cada sección en filas (de arriba abajo y de
  // izquierda a derecha, respetando el orden que ya tenían), con anchos S/M/L y el
  // mismo hueco entre todas. Lo que no está en una sección, igual, desde su esquina.
  const ordenar = () => {
    const fs = framesRef.current;
    const cs = chartsRef.current;
    const dentro = (c, f) => {
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      return cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h;
    };
    const pos = new Map();
    const altos = new Map();
    // Por filas: cada tarjeta con su ancho S/M/L y, dentro de una fila, todas con el
    // mismo alto (el mayor, y nunca menos que el mínimo de su tipo): la fila cuadra
    // arriba y abajo.
    const colocar = (lista, x0, y0, ancho) => {
      const orden = [...lista].sort((a, b) => a.y - b.y || a.x - b.x);
      const filas = [];
      let fila = [], x = x0;
      for (const c of orden) {
        const w = anchoCercano(c.w);
        if (fila.length && x + w > x0 + ancho) { filas.push(fila); fila = []; x = x0; }
        fila.push({ c, x, w });
        x += w + HUECO;
      }
      if (fila.length) filas.push(fila);
      let y = y0;
      for (const f of filas) {
        const alto = snap(Math.max(...f.map(({ c }) => Math.max(c.h, altoMinimo(c.type)))));
        for (const { c, x: cx, w } of f) pos.set(c.id, { x: cx, y, w, h: alto });
        y += alto + HUECO;
      }
      return y - HUECO;
    };
    const usados = new Set();
    for (const f of fs) {
      const lista = cs.filter(c => !usados.has(c.id) && dentro(c, f));
      if (!lista.length) continue;
      lista.forEach(c => usados.add(c.id));
      // Una sección más estrecha que tres columnas (las de antes medían 992) se
      // ensancha a tres columnas exactas: así S + M o S + S + S caben en una fila.
      const ancho = Math.max(f.w, ANCHO_SECCION);
      const fondo = colocar(lista, snap(f.x + HUECO), snap(f.y + HUECO), ancho - HUECO * 2);
      altos.set(f.id, { w: ancho, h: Math.max(f.h, snap(fondo - f.y + HUECO)) });
    }
    const sueltos = cs.filter(c => !usados.has(c.id));
    if (sueltos.length) {
      colocar(sueltos, snap(Math.min(...sueltos.map(c => c.x))), snap(Math.min(...sueltos.map(c => c.y))), ANCHOS.l);
    }
    setCharts(list => list.map(c => (pos.has(c.id) ? { ...c, ...pos.get(c.id) } : c)));
    if (altos.size) setFrames(list => list.map(f => (altos.has(f.id) ? { ...f, ...altos.get(f.id) } : f)));
  };

  // ── Acciones 3D ───────────────────────────────────────────────────────────
  const handleIsolate = useCallback(async (group, config) => {
    if (active?.chartId === config.id && active?.key === group.key) {
      await isolateInViewer([]);
      setActive(null);
      return;
    }
    const ok = await isolateInViewer(group.externalIds);
    setActive(ok ? { chartId: config.id, key: group.key } : null);
  }, [active]);

  const handlePaint = useCallback(async (groups, config) => {
    setActive(null);
    return colorizeInViewer(groups, config);   // los mismos colores que el gráfico
  }, []);

  const handleClear3D = useCallback(() => {
    clearViewerViz();
    setActive(null);
  }, []);

  useEffect(() => () => { try { clearViewerViz(); } catch { /* */ } }, []);

  // ── CRUD de nodos ─────────────────────────────────────────────────────────
  const saveChart = (cfg) => {
    if (cfg.id) {
      // Si se cambió el tamaño en el editor, la tarjeta toma su ancho S/M/L.
      setCharts(cs => cs.map(c => (c.id === cfg.id
        ? { ...c, ...cfg, ...(cfg.size && cfg.size !== c.size && cfg.type !== 'kpi' ? { w: ANCHOS[cfg.size] } : {}) }
        : c)));
    } else {
      const size = tamanoDe(cfg);
      const { x, y, marco } = huecoLibre(size.w, size.h);
      setCharts(cs => [...cs, { ...cfg, id: uid(), ...size, x, y }]);
      crecerSeccion(marco, x, y, size.w, size.h);
    }
    setEditing(null);
  };
  const deleteChart = (id) => setCharts(cs => cs.filter(c => c.id !== id));
  const addParamsNode = () => {
    if (chartsRef.current.some(c => c.type === 'qa')) return; // una fuente basta
    const size = { w: ANCHOS.s, h: ALTO_DEFECTO.qa };
    const { x, y, marco } = huecoLibre(size.w, size.h);
    setCharts(cs => [...cs, { id: uid(), type: 'qa', title: 'Parámetros del modelo', ...size, x, y }]);
    crecerSeccion(marco, x, y, size.w, size.h);
  };
  // Flujo Vyssuals: clic en un parámetro de la fuente → gráfico pre-armado.
  const createFromField = (f) => {
    setEditing({ title: nombreCampo(f.key), type: 'bar', metric: 'count', groupBy: f.key, topN: 12, size: 'm' });
  };

  // ── Redimensionado del panel (borde izquierdo) ────────────────────────────
  const onResizeStart = (e) => {
    e.preventDefault();
    const startX = e.clientX, startW = width;
    const onMove = (ev) => setWidth(clamp(startW + (startX - ev.clientX), 400, window.innerWidth - 300));
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const loading = rows === null;

  const ctrlBtn = (title, onClick, label) => (
    <button onClick={onClick} title={title} style={{
      width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.blanco, border: `1px solid ${C.lightGray}`, borderRadius: 6, cursor: 'pointer',
      color: C.gris700, fontSize: 15, fontWeight: 600,
    }}>{label}</button>
  );

  // Botones de la cabecera: secundarios con borde; uno solo principal, en Dark (paleta D-24).
  const boton = (principal = false, apagado = false) => ({
    padding: '5px 11px', borderRadius: 6, fontSize: 12, fontWeight: principal ? 600 : 500, fontFamily: FUENTE,
    border: `1px solid ${principal ? C.dark : C.gris300}`,
    background: apagado ? C.light50 : principal ? C.dark : C.blanco,
    color: apagado ? C.midGray : principal ? C.light : C.dark,
    cursor: apagado ? 'default' : 'pointer',
  });

  return (
    <div style={{
      // top:48 → bajo el TopBar del visor (48px, z-index 2000)
      position: 'fixed', top: 48, right: 0, bottom: 0, width, zIndex: 1400,
      // Tema claro de la paleta oficial: página Light, tarjetas blancas, borde Light Gray
      background: C.light, borderLeft: `1px solid ${C.lightGray}`,
      display: 'flex', flexDirection: 'column',
      color: C.dark, fontFamily: FONT_UI,
    }}>
      {/* Asa de redimensionado del panel */}
      <div onPointerDown={onResizeStart} title="Arrastra para redimensionar"
        style={{ position: 'absolute', left: -4, top: 0, bottom: 0, width: 8, cursor: 'ew-resize', zIndex: 3 }} />

      {/* Cabecera: nombre del tablero a la izquierda, acciones a la derecha */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${C.lightGray}`, background: C.blanco, flexShrink: 0, flexWrap: 'wrap' }}>
        <input
          value={dashName}
          onChange={e => setDashName(e.target.value)}
          onBlur={() => dashId && apiFetch(`${backendUrl}/api/dashboards/${dashId}`, { method: 'PUT', body: JSON.stringify({ name: dashName }) }).catch(() => {})}
          title="Nombre del tablero (clic para cambiarlo)"
          style={{ background: 'transparent', border: 'none', outline: 'none', color: C.dark, fontSize: 14, fontWeight: 600, width: 150, fontFamily: FUENTE }}
        />
        <span style={{ fontSize: 11, color: C.gris600, minWidth: 62 }}>
          {saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? 'Guardado' : ''}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={ordenar} title="Acomodar las tarjetas de cada sección en filas, con el mismo hueco entre todas" style={boton()}>Ordenar</button>
          <button onClick={addFrame} title="Añadir una sección con título para agrupar tarjetas" style={boton()}>Sección</button>
          <button onClick={addParamsNode} disabled={loading} title="Añadir la lista de parámetros del modelo con su completitud" style={boton(false, loading)}>Parámetros</button>
          <button onClick={handleClear3D} title="Restaurar el 3D (quitar colores y aislamientos)" style={boton()}>Limpiar 3D</button>
          <button onClick={() => setEditing('new')} disabled={loading} style={boton(true, loading)}>Nuevo gráfico</button>
          <button onClick={onClose} title="Cerrar tablero" style={{ background: 'none', border: 'none', color: C.gris600, fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 2px' }}>×</button>
        </div>
      </div>

      {/* Barra de datos: solo de dónde sale lo que se ve; la ayuda, en el ⓘ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', fontSize: 11, color: C.gris600, borderBottom: `1px solid ${C.lightGray}`, background: C.blanco, flexShrink: 0 }}>
        <span>
          {loading
            ? 'Cargando el inventario de la nube…'
            : `${fmt(rows.length)} elementos · ${fmt(fields.length)} parámetros · ${SOURCES.inventory.label}${hora ? ` · leído ${hora}` : ''}`}
        </span>
        <span title="Rueda: acercar o alejar · arrastrar el fondo: mover el lienzo · arrastrar la cabecera de una tarjeta: moverla · esquina: cambiar su tamaño (S, M o L)"
          style={{ cursor: 'help', display: 'inline-flex' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><line x1="12" y1="11" x2="12" y2="16" /><circle cx="12" cy="8" r="0.6" fill="currentColor" /></svg>
        </span>
      </div>

      {/* ── LIENZO INFINITO ── */}
      {(() => {
        // Cuadrícula estilo Miro: LÍNEAS cuadradas, con celda menor y mayor
        // (cada 4). Adaptativa: la menor desaparece al alejarse para no
        // ensuciar; ambas acompañan el pan/zoom.
        const minor = 32 * view.s;
        const showMinor = minor >= 11;
        const major = minor * 4;
        const mnC = 'rgba(20,20,19,0.045)';   // Dark al 4,5 % y al 8 %: cuadrícula cálida
        const mjC = 'rgba(20,20,19,0.080)';
        const imgs = [];
        const sizes = [];
        if (showMinor) {
          imgs.push(`linear-gradient(${mnC} 1px, transparent 1px)`, `linear-gradient(90deg, ${mnC} 1px, transparent 1px)`);
          sizes.push(`${minor}px ${minor}px`, `${minor}px ${minor}px`);
        }
        imgs.push(`linear-gradient(${mjC} 1px, transparent 1px)`, `linear-gradient(90deg, ${mjC} 1px, transparent 1px)`);
        sizes.push(`${major}px ${major}px`, `${major}px ${major}px`);
        return (
      <div
        ref={canvasRef}
        onPointerDown={onPanStart}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden', cursor: 'grab',
          backgroundColor: C.light,
          backgroundImage: imgs.join(','),
          backgroundSize: sizes.join(','),
          backgroundPosition: `${view.tx}px ${view.ty}px`,
        }}
      >
        <div style={{
          position: 'absolute', top: 0, left: 0,
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
          transformOrigin: '0 0',
        }}>
          {/* Secciones (frames) estilo Miro: región sobria + título con una línea de
              color de la paleta. El cuerpo NO captura clics (el pan sigue funcionando
              encima); solo la barra de título y la esquina son interactivas. */}
          {frames.map(f => {
            const color = FRAME_COLORS[(f.color || 0) % FRAME_COLORS.length];
            return (
              <div key={f.id} style={{ position: 'absolute', left: f.x, top: f.y, width: f.w, height: f.h, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(241, 240, 232, 0.72)', border: `1px solid ${C.lightGray}`, borderRadius: RADIO }} />
                {/* Barra de título: asa (arrastra sección + contenido) · nombre editable · quitar */}
                <div style={{ position: 'absolute', top: -32, left: 0, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
                  <div onPointerDown={startMoveFrame(f.id)} title="Arrastrar la sección (mueve también sus tarjetas)"
                    style={{ cursor: 'grab', color: C.gris600, display: 'flex', alignItems: 'center', touchAction: 'none', padding: 2 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="6" r="1.6" /><circle cx="7" cy="12" r="1.6" /><circle cx="7" cy="18" r="1.6" /><circle cx="14" cy="6" r="1.6" /><circle cx="14" cy="12" r="1.6" /><circle cx="14" cy="18" r="1.6" /></svg>
                  </div>
                  <span style={{ width: 3, height: 16, background: color, borderRadius: 0 }} />
                  <input
                    value={f.title}
                    readOnly={locked}
                    onChange={e => renameFrame(f.id, e.target.value)}
                    onPointerDown={e => e.stopPropagation()}
                    style={{
                      background: 'transparent', border: 'none', outline: 'none', color: C.dark,
                      fontFamily: FONT_TITLE, fontWeight: 600, fontSize: 14,
                      width: Math.max(140, (f.title?.length || 8) * 9),
                    }}
                  />
                  {!locked && (
                    <button onClick={() => removeFrame(f.id)} title="Quitar sección (las tarjetas se quedan)"
                      style={{ background: 'none', border: 'none', color: C.gris600, fontSize: 15, cursor: 'pointer', lineHeight: 1, padding: 2 }}>×</button>
                  )}
                </div>
                {!locked && (
                  <div onPointerDown={startResizeFrame(f.id)} title="Cambiar el tamaño de la sección"
                    style={{ position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, cursor: 'nwse-resize', pointerEvents: 'auto', borderRight: `2px solid ${C.gris300}`, borderBottom: `2px solid ${C.gris300}`, borderRadius: '0 0 6px 0' }} />
                )}
              </div>
            );
          })}

          {(charts || []).map(cfg => (
            <div key={cfg.id} style={{ position: 'absolute', left: cfg.x, top: cfg.y, width: cfg.w, height: cfg.h }}
              onPointerDown={e => e.stopPropagation()}>
              <ChartCard
                config={cfg}
                rows={rows || []}
                fields={fields}
                meta={{ fuente: SOURCES.inventory.label, hora }}
                onEdit={setEditing}
                onUpdate={(next) => setCharts(cs => cs.map(c => (c.id === next.id ? next : c)))}
                onDelete={deleteChart}
                onIsolate={handleIsolate}
                onPaint={handlePaint}
                onCreateFromField={createFromField}
                activeKey={active?.chartId === cfg.id ? active.key : null}
                dragHandlers={{ onPointerDown: startMove(cfg.id) }}
                zoom={view.s}
              />
              {/* Esquina de redimensionado (oculta con el candado activo) */}
              {!locked && (
                <div onPointerDown={startResize(cfg.id)} title="Cambiar el tamaño (el ancho salta a S, M o L)"
                  style={{ position: 'absolute', right: -3, bottom: -3, width: 16, height: 16, cursor: 'nwse-resize', borderRight: `2px solid ${C.gris300}`, borderBottom: `2px solid ${C.gris300}`, borderRadius: '0 0 6px 0' }} />
              )}
            </div>
          ))}
        </div>

        {/* Estados vacíos (fuera del transform) */}
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: C.gris600, fontSize: 13, pointerEvents: 'none' }}>
            <div className="adsk-spinner" style={{ width: 26, height: 26 }} />
            Preparando datos…
          </div>
        )}
        {!loading && !charts.length && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.gris600, pointerEvents: 'none' }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke={C.gris300} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 14 }}>
              <line x1="6" y1="20" x2="6" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="18" y1="20" x2="18" y2="14" />
            </svg>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.dark, marginBottom: 6 }}>Empieza tu tablero</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 320, textAlign: 'center', marginBottom: 16 }}>
              Añade la lista de parámetros y haz clic en uno para graficarlo, o crea un gráfico con «Nuevo gráfico».
            </div>
            <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
              <button onClick={addParamsNode} style={boton()}>Parámetros</button>
              <button onClick={() => setEditing('new')} style={boton(true)}>Nuevo gráfico</button>
            </div>
          </div>
        )}

        {/* Controles de zoom (abajo-derecha, patrón Miro/Vyssuals) */}
        <div style={{ position: 'absolute', right: 12, bottom: 12, display: 'flex', flexDirection: 'column', gap: 6, zIndex: 2 }}>
          {ctrlBtn('Acercar', () => zoomBy(1.25), '+')}
          {ctrlBtn('Alejar', () => zoomBy(0.8), '−')}
          {ctrlBtn('Encajar todo', fitView,
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>)}
          {ctrlBtn(locked ? 'Desbloquear nodos (permitir mover)' : 'Bloquear nodos (evitar moverlos sin querer)', () => setLocked(l => !l),
            locked
              ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.orange30D} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></svg>)}
          <div style={{ textAlign: 'center', fontSize: 10.5, color: C.gris600, fontVariantNumeric: 'tabular-nums' }}>{Math.round(view.s * 100)} %</div>
        </div>
      </div>
        );
      })()}

      {/* Editor */}
      {editing && (
        <ChartEditor
          initial={editing === 'new' ? null : editing}
          fields={fields}
          rows={rows || []}
          onSave={saveChart}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}
