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
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { apiFetch } from '../../utils/apiFetch';
import { SOURCES, discoverFields, isolateInViewer, colorizeInViewer, clearViewerViz, resetEngineCaches } from './engine';
import ChartCard from './ChartCard';
import ChartEditor from './ChartEditor';
import VistaDePagina from './VistaDePagina';
import BarraDeVistas from './BarraDeVistas';
import Herramienta, { CSS_HERRAMIENTAS, Icono, Separador } from './Herramienta';
import { Nota, TextoLibre, BarraInferior, PaletaIzquierda, PildoraZoom } from '../../../../design/lienzo/PiezasLienzo';
import { NOTA_LADO, NOTA_HUECO, medidaTexto } from '../../../../design/lienzo/notas';
import { prepararImanes, imantarArrastre, svgDeLineas } from '../../../../design/lienzo/imanes';
import { ANALISIS } from './analisisDeAuditoria';
// El itemizado vigente del frente abierto: el que se subió a la Planilla (docs/visor/51).
import { itemizadoDeObra } from '../../utils/itemizadoDeObraVisor';
import { C, FUENTE, RADIO, REJILLA, COLUMNA, HUECO, ANCHOS, ALTO_DEFECTO, anchoCercano, altoMinimo, nombreCampo } from './tema';

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
// Tamaños de tarjeta sobre la cuadrícula (tema.js): S, M y L = 1, 2 y 3 columnas,
// para que los bordes de las tarjetas siempre coincidan (docs/visor/41).
const NODE_DEFAULT = { w: ANCHOS.m, h: ALTO_DEFECTO.grafico };
const NODE_KPI = { w: ANCHOS.s, h: ALTO_DEFECTO.kpi };
const altoDe = (cfg) => (cfg.type === 'audit' || (cfg.type === 'presupuesto' && ANALISIS[cfg.analisis]?.alto) ? ALTO_DEFECTO.qa : NODE_DEFAULT.h);
const tamanoDe = (cfg) => (cfg.type === 'kpi' ? NODE_KPI
  : { w: ANCHOS[cfg.size] || NODE_DEFAULT.w, h: altoDe(cfg) });  // la auditoría, el flujo y el recorrido: más altos
// Encaje a rejilla al mover/redimensionar (patrón Vyssuals: lienzo ordenado,
// nodos alineados sin esfuerzo).
const SNAP = REJILLA;
const snap = (v) => Math.round(v / SNAP) * SNAP;
// Tipografía: IBM Plex Sans para todo, la letra del sistema (D-26).
const FONT_UI = FUENTE;
const ANCHO_COMPACTO = 1000;   // por debajo, la cabecera muestra las herramientas solo con icono
const ANCHO_MINIMO = 640;      // por debajo, también «Nuevo gráfico» va solo con icono
const compactaDe = (w) => (w < ANCHO_MINIMO ? '2' : w < ANCHO_COMPACTO ? '1' : '0');
export const FONT_TITLE = FUENTE;
// Secciones (frames) estilo Miro: título sobre una región que agrupa nodos — la
// estructura narrativa del tablero del usuario en Miro. Una línea de color de la
// paleta oficial marca cada sección; el fondo es siempre el mismo, sobrio.
const FRAME_COLORS = [C.orange, C.blue, C.green, C.gris700];
const ANCHO_SECCION = ANCHOS.l + HUECO * 2;

// Pantalla completa (docs/visor/54): el tablero ocupa toda la ventana a la derecha de la barra lateral
// del visor (64 px), ENCIMA del 3D, que no cambia de tamaño (redibujarlo cuesta ≈ 220 ms, §7 del 52).
// El panel acoplado a la derecha (55 % / 70 %, con doble búfer) está en 53f2a2b4, para cuando se ponga
// el botón de acoplar.
const ANCHO_RIEL = 64;

// ── Cámara del lienzo, como tldraw/Forma Board (docs/visor/54 §1) ─────────────────────────────────
const ZOOM_MIN = 0.01;          // 1 %, como Forma Board: el mundo es mucho más grande que el tablero
const ZOOM_MAX = 4;
const PASOS_ZOOM = [0.01, 0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];   // los escalones de tldraw
const FRICCION = 0.09;          // inercia al soltar el lienzo (cameraSlideFriction de tldraw)
const ARRASTRE_MIN = 4;         // px antes de que un clic se convierta en arrastre
// Cuadrícula por niveles (como tldraw): la celda del mundo es 32 px × 4ⁿ, la que en pantalla quede entre
// 12 y 48 px; la línea menor se desvanece al acercarse a 12 px y la mayor (cada 4) toma su lugar. Así hay
// rejilla a cualquier zoom, del 1 % al 400 %, sin saltos.
const rejillaDe = (v) => {
  let paso = 32;
  while (paso * v.s < 12) paso *= 4;
  while (paso * v.s >= 48) paso /= 4;
  const menor = paso * v.s, mayor = menor * 4;
  const a = Math.min(1, (menor - 12) / 18);
  const mn = `rgba(20,20,19,${(0.05 * a).toFixed(3)})`, mj = 'rgba(20,20,19,0.075)';
  return {
    imagen: [`linear-gradient(${mn} 1px, transparent 1px)`, `linear-gradient(90deg, ${mn} 1px, transparent 1px)`,
      `linear-gradient(${mj} 1px, transparent 1px)`, `linear-gradient(90deg, ${mj} 1px, transparent 1px)`].join(','),
    tamano: [`${menor}px ${menor}px`, `${menor}px ${menor}px`, `${mayor}px ${mayor}px`, `${mayor}px ${mayor}px`].join(','),
  };
};
// Selección fina (docs/visor/54): grosores en px de PANTALLA, sea cual sea el zoom (--s lo pone la cámara).
const AZUL_SEL = '#0D66B4';
const linea = (px) => `calc(${px}px / var(--s, 1))`;
const CSS_LIENZO = `.tablero-nodo:hover { outline: ${linea(1.5)} solid rgba(13, 102, 180, 0.45); }`;
const mismoConjunto = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

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

export default function DashboardWorkspace({ project, backendUrl, onClose, proyecto = null, vistaInicial = null }) {
  const [rows, setRows] = useState(null);          // dataset (null = cargando)
  const [fields, setFields] = useState([]);
  const [hora, setHora] = useState('');             // cuándo se leyó el inventario
  const [dashId, setDashId] = useState(null);
  const [dashName, setDashName] = useState('General');
  const [charts, setCharts] = useState([]);
  const [frames, setFrames] = useState([]);         // secciones estilo Miro
  const [notas, setNotas] = useState([]);           // notas adhesivas y textos libres (config.notas)
  const notasRef = useRef(notas);
  const [herramienta, setHerramienta] = useState('seleccionar');   // seleccionar · mano · nota · texto · seccion
  const [colorNota, setColorNota] = useState('amarillo');
  const [editandoNota, setEditandoNota] = useState(null);
  const framesRef = useRef(frames);
  const [editing, setEditing] = useState(null);     // config en edición | 'new'
  const [active, setActive] = useState(null);       // { chartId, key } aislado
  const [saveState, setSaveState] = useState('');
  const [anchoVentana, setAnchoVentana] = useState(() => window.innerWidth);
  const [view, setView] = useState({ tx: 30, ty: 30, s: 0.85 }); // encuadre del lienzo
  const itemizado = useSyncExternalStore(itemizadoDeObra.suscribir, itemizadoDeObra.estado);
  // Vistas (docs/visor/52): grupos de tarjetas elegidas por el usuario, con su botón; se ven encajadas.
  const [vistas, setVistas] = useState([]);
  const [vistaActiva, setVistaActiva] = useState(null);
  const [eligiendo, setEligiendo] = useState(false);
  const [elegidas, setElegidas] = useState(() => new Set());
  const [nombreVista, setNombreVista] = useState('');
  const vistaRef = useRef(null);                  // la vista de página: exporta imagen y PDF
  const [exportando, setExportando] = useState('');
  const [avisoVista, setAvisoVista] = useState('');
  const [listo, setListo] = useState(null);         // archivo hecho que el navegador no dejó bajar solo
  const [aviso, setAviso] = useState('');
  const [locked, setLocked] = useState(false); // candado: bloquea mover/redimensionar nodos
  const lockedRef = useRef(false);
  useEffect(() => { lockedRef.current = locked; }, [locked]);
  const viewRef = useRef(view);              // la cámara VIVA (la que se ve); `view` es la confirmada
  const confirmadaRef = useRef(view);
  const confirmarTimer = useRef(0);
  const inerciaRef = useRef(0);
  const animRef = useRef(0);
  const espacioRef = useRef(false);
  const contenidoRef = useRef(null);
  const marcoSelRef = useRef(null);
  const zoomTextoRef = useRef(null);
  const panelRef = useRef(null);
  const guiasRef = useRef(null);                     // líneas guía de los imanes (SVG en el mundo)
  const selCajaRef = useRef(null);                   // recuadro de la selección (se mueve con lo arrastrado)
  const nodosRef = useRef(new Map());                // id → elemento del DOM de cada tarjeta, sección o nota
  const refsDeNodo = useRef(new Map());
  const refNodo = (id) => {   // una función estable por id (React no la vuelve a llamar en cada render)
    if (!refsDeNodo.current.has(id)) refsDeNodo.current.set(id, (el) => { if (el) nodosRef.current.set(id, el); else nodosRef.current.delete(id); });
    return refsDeNodo.current.get(id);
  };
  const [sel, setSel] = useState(() => new Set());   // tarjetas y secciones seleccionadas
  const selRef = useRef(sel);
  const portapapeles = useRef(null);
  const [menuZoom, setMenuZoom] = useState(false);
  const chartsRef = useRef(charts);
  const vistasRef = useRef([]);
  const canvasRef = useRef(null);
  const saveTimer = useRef(null);
  const loadedRef = useRef(false);

  // Una cámara confirmada desde fuera (cargar el tablero, encajar…) pasa a ser la viva; la que confirma el
  // propio lienzo ya lo era.
  useEffect(() => {
    if (view === confirmadaRef.current) return;
    confirmadaRef.current = view;
    viewRef.current = view;
    pintarCamara();
  }, [view]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { selRef.current = sel; }, [sel]);
  // Al abrir, el tablero toma el foco: los atajos funcionan sin tener que hacer clic dentro primero.
  useEffect(() => { panelRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => { chartsRef.current = charts; }, [charts]);
  useEffect(() => { framesRef.current = frames; }, [frames]);
  useEffect(() => { vistasRef.current = vistas; }, [vistas]);
  useEffect(() => { notasRef.current = notas; }, [notas]);

  // ── Historial (Ctrl+Z / Ctrl+Y): fotos de {tarjetas, secciones, vistas}. Un arrastre es UN paso (se
  // confirma al soltar); escribir un título se agrupa (350 ms sin cambios).
  const hist = useRef({ pasado: [], futuro: [], actual: null, aplicando: false, gesto: false, t: 0 });
  const confirmarHistorial = useCallback(() => {
    const h = hist.current;
    if (!loadedRef.current) return;
    const ahora = { charts: chartsRef.current, frames: framesRef.current, vistas: vistasRef.current, notas: notasRef.current };
    if (!h.actual) { h.actual = ahora; return; }
    if (ahora.charts === h.actual.charts && ahora.frames === h.actual.frames && ahora.vistas === h.actual.vistas && ahora.notas === h.actual.notas) return;
    h.pasado.push(h.actual);
    if (h.pasado.length > 100) h.pasado.shift();
    h.futuro = [];
    h.actual = ahora;
  }, []);
  useEffect(() => {
    const h = hist.current;
    if (!loadedRef.current) { h.actual = null; h.pasado = []; h.futuro = []; return; }
    if (h.aplicando) { h.aplicando = false; h.actual = { charts, frames, vistas, notas }; return; }
    if (h.gesto) return;
    clearTimeout(h.t);
    h.t = setTimeout(confirmarHistorial, 350);
  }, [charts, frames, vistas, notas, confirmarHistorial]);
  const aplicarFoto = (foto) => {
    hist.current.aplicando = true;
    hist.current.actual = foto;
    setCharts(foto.charts); setFrames(foto.frames); setVistas(foto.vistas); setNotas(foto.notas || []);
    setEditandoNota(null);
    setSeleccion(new Set());
  };
  const deshacer = () => {
    const h = hist.current;
    clearTimeout(h.t); confirmarHistorial();
    const prev = h.pasado.pop();
    if (!prev) return;
    h.futuro.push(h.actual);
    aplicarFoto(prev);
  };
  const rehacer = () => {
    const h = hist.current;
    const sig = h.futuro.pop();
    if (!sig) return;
    h.pasado.push(h.actual);
    aplicarFoto(sig);
  };
  const iniciarGesto = () => { clearTimeout(hist.current.t); confirmarHistorial(); hist.current.gesto = true; };
  const terminarGesto = () => { hist.current.gesto = false; confirmarHistorial(); };

  // Pantalla completa: el 3D no reserva hueco (se anuncia 0 a App.jsx) y no se redimensiona.
  const width = anchoVentana - ANCHO_RIEL;
  useEffect(() => {
    const alCambiar = () => setAnchoVentana(window.innerWidth);
    window.addEventListener('resize', alCambiar);
    window.dispatchEvent(new CustomEvent('tablero-width', { detail: { width: 0 } }));
    return () => window.removeEventListener('resize', alCambiar);
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
          setNotas(Array.isArray(dd.config?.notas) ? dd.config.notas : []);
          const vs = Array.isArray(dd.config?.vistas) ? dd.config.vistas : [];
          setVistas(vs);
          // Enlace recibido: «<tablero>.<vista>». Solo si la vista es de ESTE tablero.
          if (vistaInicial) {
            const [tab, vid] = String(vistaInicial).split('.');
            if (String(tab) === String(first.id) && vs.some(v => v.id === vid)) setVistaActiva(vid);
          }
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
          body: JSON.stringify({ config: { version: 2, charts, frames, vistas, notas, view: viewRef.current } }),
        });
        setSaveState('saved');
        setTimeout(() => setSaveState(''), 1600);
      } catch { setSaveState(''); }
    }, 1200);
    return () => clearTimeout(saveTimer.current);
  }, [charts, frames, vistas, notas, dashId, backendUrl]);

  // ── Cámara (docs/visor/54): como tldraw, se mueve en el DOM (transformación del contenido y fondo de
  // la cuadrícula) sin pasar por React, que redibujaba TODAS las tarjetas en cada movimiento. React se
  // entera cuando la cámara se queda quieta 180 ms (y entonces las gráficas se re-rasterizan nítidas).
  const pintarCamara = useCallback(() => {
    const v = viewRef.current, el = canvasRef.current, cont = contenidoRef.current;
    if (cont) { cont.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`; cont.style.setProperty('--s', v.s); }
    if (el) {
      const g = rejillaDe(v);
      el.style.backgroundImage = g.imagen;
      el.style.backgroundSize = g.tamano;
      el.style.backgroundPosition = `${v.tx}px ${v.ty}px`;
    }
    if (zoomTextoRef.current) zoomTextoRef.current.textContent = `${Math.round(v.s * 100)} %`;
  }, []);
  const moverCamara = useCallback((v) => {
    viewRef.current = v;
    pintarCamara();
    clearTimeout(confirmarTimer.current);
    confirmarTimer.current = setTimeout(() => { confirmadaRef.current = viewRef.current; setView(viewRef.current); }, 180);
  }, [pintarCamara]);
  const pararCamara = () => { cancelAnimationFrame(inerciaRef.current); cancelAnimationFrame(animRef.current); };
  // Ir a una cámara con la animación de tldraw (320 ms, suave al empezar y al acabar).
  const animarCamara = useCallback((destino, ms = 320) => {
    cancelAnimationFrame(inerciaRef.current); cancelAnimationFrame(animRef.current);
    const desde = { ...viewRef.current }, t0 = performance.now();
    const paso = (ahora) => {
      const k = suave(Math.min(1, (ahora - t0) / ms));
      moverCamara({ s: desde.s + (destino.s - desde.s) * k, tx: desde.tx + (destino.tx - desde.tx) * k, ty: desde.ty + (destino.ty - desde.ty) * k });
      if (k < 1) animRef.current = requestAnimationFrame(paso);
    };
    animRef.current = requestAnimationFrame(paso);
  }, [moverCamara]);
  const zoomEn = (v, s, px, py) => {   // la cámara con zoom s conservando el punto (px, py) de pantalla
    const wx = (px - v.tx) / v.s, wy = (py - v.ty) / v.s;
    return { s, tx: px - wx * s, ty: py - wy * s };
  };

  // Rueda = zoom hacia el cursor, ×1,10 por muesca e instantáneo (lo medido en Forma Board). Pellizco del
  // panel táctil (Ctrl + rueda) = zoom continuo.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      pararCamara();
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 33; else if (e.deltaMode === 2) d *= 600;
      const factor = e.ctrlKey ? Math.exp(-d * 0.01) : Math.pow(1.1, -d / 100);
      const rect = el.getBoundingClientRect();
      const v = viewRef.current;
      moverCamara(zoomEn(v, clamp(v.s * factor, ZOOM_MIN, ZOOM_MAX), e.clientX - rect.left, e.clientY - rect.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [rows === null, moverCamara]);   // eslint-disable-line react-hooks/exhaustive-deps

  // Mover el lienzo: barra espaciadora + arrastrar, clic derecho o botón central (como tldraw). Al soltar
  // con velocidad sigue deslizando y frena (inercia).
  const panear = (e) => {
    e.preventDefault();
    pararCamara();
    const el = canvasRef.current;
    const ini = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
    let ult = { x: e.clientX, y: e.clientY, t: performance.now() }, vel = { x: 0, y: 0 };
    if (el) el.style.cursor = 'grabbing';
    const onMove = (ev) => {
      moverCamara({ ...viewRef.current, tx: ini.tx + ev.clientX - ini.x, ty: ini.ty + ev.clientY - ini.y });
      const t = performance.now(), dt = Math.max(1, t - ult.t);
      vel = { x: 0.2 * vel.x + 0.8 * (ev.clientX - ult.x) / dt, y: 0.2 * vel.y + 0.8 * (ev.clientY - ult.y) / dt };
      ult = { x: ev.clientX, y: ev.clientY, t };
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (el) el.style.cursor = espacioRef.current ? 'grab' : '';
      if (performance.now() - ult.t > 60 || Math.hypot(vel.x, vel.y) < 0.15) return;
      let t = performance.now();
      const paso = (ahora) => {
        const dt = ahora - t; t = ahora;
        const k = Math.pow(1 - FRICCION, dt / 16.7);
        vel = { x: vel.x * k, y: vel.y * k };
        if (Math.hypot(vel.x, vel.y) < 0.02) return;
        const v = viewRef.current;
        moverCamara({ ...v, tx: v.tx + vel.x * dt, ty: v.ty + vel.y * dt });
        inerciaRef.current = requestAnimationFrame(paso);
      };
      inerciaRef.current = requestAnimationFrame(paso);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const todosLosNodos = () => [...chartsRef.current, ...framesRef.current, ...notasRef.current];

  // ── Selección: clic, Mayús+clic, y marco arrastrando el fondo (tarjetas que toca; secciones enteras) ──
  const setSeleccion = (n) => { if (!mismoConjunto(n, selRef.current)) { selRef.current = n; setSel(n); } };
  const seleccionarAlPulsar = (id, e) => {
    const actual = selRef.current;
    if (e.shiftKey) { const n = new Set(actual); if (n.has(id)) n.delete(id); else n.add(id); setSeleccion(n); return false; }
    if (!actual.has(id)) setSeleccion(new Set([id]));
    return true;
  };
  const iniciarMarco = (e) => {
    window.getSelection()?.removeAllRanges();   // un lienzo no selecciona texto al arrastrar, selecciona piezas
    const el = canvasRef.current, marco = marcoSelRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const a = { x: e.clientX - r.left, y: e.clientY - r.top };
    const base = e.shiftKey ? new Set(selRef.current) : new Set();
    let activo = false;
    const onMove = (ev) => {
      const b = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      if (!activo && Math.hypot(b.x - a.x, b.y - a.y) < ARRASTRE_MIN) return;
      activo = true;
      const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y), x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y);
      if (marco) Object.assign(marco.style, { display: 'block', left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
      const v = viewRef.current;
      const W = { x1: (x1 - v.tx) / v.s, y1: (y1 - v.ty) / v.s, x2: (x2 - v.tx) / v.s, y2: (y2 - v.ty) / v.s };
      const n = new Set(base);
      for (const c of [...chartsRef.current, ...notasRef.current]) if (c.x < W.x2 && c.x + c.w > W.x1 && c.y < W.y2 && c.y + c.h > W.y1) n.add(c.id);
      for (const f of framesRef.current) if (f.x >= W.x1 && f.x + f.w <= W.x2 && f.y >= W.y1 && f.y + f.h <= W.y2) n.add(f.id);
      setSeleccion(n);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (marco) marco.style.display = 'none';
      if (!activo && !e.shiftKey) setSeleccion(new Set());
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const puntoDelMundo = (e) => {
    const r = canvasRef.current.getBoundingClientRect(), v = viewRef.current;
    return { x: (e.clientX - r.left - v.tx) / v.s, y: (e.clientY - r.top - v.ty) / v.s };
  };
  // Nota nueva (lista para escribir) y nota al lado de otra (los puntos laterales, como tldraw).
  const crearNota = (x, y, color = colorNota) => {
    const n = { id: uid(), tipo: 'nota', x: snap(x), y: snap(y), w: NOTA_LADO, h: NOTA_LADO, texto: '', color };
    setNotas(ns => [...ns, n]);
    setSeleccion(new Set([n.id]));
    setEditandoNota(n.id);
    setHerramienta('seleccionar');
  };
  const notaAlLado = (nota, dir) => {
    const d = { derecha: [nota.w + NOTA_HUECO, 0], izquierda: [-(nota.w + NOTA_HUECO), 0], abajo: [0, nota.h + NOTA_HUECO], arriba: [0, -(nota.h + NOTA_HUECO)] }[dir];
    crearNota(nota.x + d[0], nota.y + d[1], nota.color);
  };
  const crearTexto = (x, y) => {
    const t = { id: uid(), tipo: 'texto', x, y: y - 16, texto: '', ...medidaTexto('') };
    setNotas(ns => [...ns, t]);
    setSeleccion(new Set([t.id]));
    setEditandoNota(t.id);
    setHerramienta('seleccionar');
  };
  const cambiarTextoNota = (id, texto) => setNotas(ns => ns.map(n => (n.id !== id ? n : n.tipo === 'texto' ? { ...n, texto, ...medidaTexto(texto) } : { ...n, texto })));
  const terminarNota = (id) => {
    setEditandoNota(null);
    setNotas(ns => ns.filter(n => !(n.id === id && n.tipo === 'texto' && !n.texto.trim())));   // un texto vacío no se queda
  };
  // Sección dibujada arrastrando (o, con un clic, de 640 × 400 donde se pulsó).
  const dibujarSeccion = (e) => {
    const el = canvasRef.current, marco = marcoSelRef.current;
    const r = el.getBoundingClientRect();
    const a = { x: e.clientX - r.left, y: e.clientY - r.top }, a0 = puntoDelMundo(e);
    let b = a;
    const onMove = (ev) => {
      b = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      Object.assign(marco.style, { display: 'block', left: `${Math.min(a.x, b.x)}px`, top: `${Math.min(a.y, b.y)}px`, width: `${Math.abs(b.x - a.x)}px`, height: `${Math.abs(b.y - a.y)}px` });
    };
    const onUp = (ev) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      marco.style.display = 'none';
      const b0 = puntoDelMundo(ev);
      const grande = Math.abs(b.x - a.x) > 24 && Math.abs(b.y - a.y) > 24;
      const f = grande
        ? { x: snap(Math.min(a0.x, b0.x)), y: snap(Math.min(a0.y, b0.y)), w: snap(Math.abs(b0.x - a0.x)), h: snap(Math.abs(b0.y - a0.y)) }
        : { x: snap(a0.x - 320), y: snap(a0.y - 200), w: 640, h: 400 };
      const nueva = { id: uid(), title: `Sección ${framesRef.current.length + 1}`, color: framesRef.current.length % FRAME_COLORS.length, ...f };
      setFrames(fs => [...fs, nueva]);
      setSeleccion(new Set([nueva.id]));
      setHerramienta('seleccionar');
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  // Sección de un tamaño fijo (16:9, A4…), centrada en lo que se ve: una «página» lista para fijar como vista.
  const crearSeccionDeTamano = (nombre, [w, h]) => {
    const r = canvasRef.current.getBoundingClientRect(), v = viewRef.current;
    const cx = (r.width / 2 - v.tx) / v.s, cy = (r.height / 2 - v.ty) / v.s;
    const nueva = { id: uid(), title: nombre, color: framesRef.current.length % FRAME_COLORS.length, x: snap(cx - w / 2), y: snap(cy - h / 2), w, h };
    setFrames(fs => [...fs, nueva]);
    setSeleccion(new Set([nueva.id]));
    setHerramienta('seleccionar');
    encuadrar([nueva], 1);
  };
  const alPulsarLienzo = (e) => {
    setMenuZoom(false);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && (espacioRef.current || herramienta === 'mano'))) { panear(e); return; }
    if (e.button !== 0) return;
    // preventDefault: si no, el navegador mueve el foco al panel justo después y la nota deja de editarse.
    if (herramienta === 'nota') { e.preventDefault(); const p = puntoDelMundo(e); crearNota(p.x - NOTA_LADO / 2, p.y - NOTA_LADO / 2); return; }
    if (herramienta === 'texto') { e.preventDefault(); const p = puntoDelMundo(e); crearTexto(p.x, p.y); return; }
    if (herramienta === 'seccion') { dibujarSeccion(e); return; }
    iniciarMarco(e);
  };
  // Doble clic en el vacío = texto (como tldraw).
  const alDobleClicLienzo = (e) => {
    if (e.target !== canvasRef.current || herramienta !== 'seleccionar') return;
    const p = puntoDelMundo(e);
    crearTexto(p.x, p.y);
  };

  // Mover lo seleccionado arrastrando la cabecera de una tarjeta, el asa de una sección o una nota (si lo
  // pulsado no estaba seleccionado, solo eso; las secciones llevan sus tarjetas y notas). Como en ACC:
  // - se mueve EN EL DOM (transform) sin pasar por React, que redibujaba todas las tarjetas en cada
  //   movimiento; al soltar se confirma una vez (flushSync) y se quita el transform en el mismo cuadro;
  // - sin rejilla: al píxel, y con IMANES (docs/visor/55, de Excalidraw) a 8 px de pantalla contra los
  //   elementos visibles: bordes, centros y huecos, con sus líneas guía. Ctrl al arrastrar los apaga.
  const arrastrar = (pulsado) => (e) => {
    if (e.button !== 0 || espacioRef.current) return;
    e.preventDefault(); e.stopPropagation();
    if (!seleccionarAlPulsar(pulsado, e) || lockedRef.current) return;
    const ids = selRef.current.has(pulsado) ? selRef.current : new Set([pulsado]);
    const v = viewRef.current;
    const fs = framesRef.current.filter(f => ids.has(f.id));
    const dentro = (c, f) => { const cx = c.x + c.w / 2, cy = c.y + c.h / 2; return cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h; };
    const esSeccion = new Set(framesRef.current.map(f => f.id));
    const moviles = todosLosNodos().filter(n => ids.has(n.id) || (!esSeccion.has(n.id) && fs.some(f => dentro(n, f))));
    if (!moviles.length) return;
    const idsMov = new Set(moviles.map(n => n.id));
    const caja = [Math.min(...moviles.map(n => n.x)), Math.min(...moviles.map(n => n.y)),
      Math.max(...moviles.map(n => n.x + n.w)), Math.max(...moviles.map(n => n.y + n.h))];
    // Referencias para los imanes: lo visible que no se mueve (calculado una vez, como el SnapCache).
    const r = canvasRef.current.getBoundingClientRect();
    const vis = [-v.tx / v.s, -v.ty / v.s, (r.width - v.tx) / v.s, (r.height - v.ty) / v.s];
    const cache = prepararImanes(todosLosNodos()
      .filter(n => !idsMov.has(n.id) && n.x < vis[2] && n.x + n.w > vis[0] && n.y < vis[3] && n.y + n.h > vis[1])
      .map(n => [n.x, n.y, n.x + n.w, n.y + n.h]));
    const ini = { x: e.clientX, y: e.clientY };
    let movido = false, off = { x: 0, y: 0 }, elementos = [];
    const pintar = (dx, dy, lineas) => {
      const t = `translate(${dx}px, ${dy}px)`;
      for (const el of elementos) el.style.transform = t;
      if (selCajaRef.current) selCajaRef.current.style.transform = t;
      if (guiasRef.current) guiasRef.current.innerHTML = lineas.length ? svgDeLineas(lineas, v.s) : '';
    };
    const onMove = (ev) => {
      if (!movido) {
        if (Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y) < ARRASTRE_MIN) return;
        movido = true;
        iniciarGesto();
        elementos = [...idsMov].map(id => nodosRef.current.get(id)).filter(Boolean);
        for (const el of elementos) el.style.willChange = 'transform';
      }
      let dx = (ev.clientX - ini.x) / v.s, dy = (ev.clientY - ini.y) / v.s, lineas = [];
      if (!ev.ctrlKey && !ev.metaKey) ({ dx, dy, lineas } = imantarArrastre(cache, caja, dx, dy, v.s));
      off = { x: Math.round(dx), y: Math.round(dy) };
      pintar(dx, dy, lineas);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (!movido) return;
      const mover = (n) => (idsMov.has(n.id) ? { ...n, x: n.x + off.x, y: n.y + off.y } : n);
      flushSync(() => { setCharts(cs => cs.map(mover)); setFrames(xs => xs.map(mover)); setNotas(xs => xs.map(mover)); });
      for (const el of elementos) { el.style.transform = ''; el.style.willChange = ''; }
      if (selCajaRef.current) selCajaRef.current.style.transform = '';
      if (guiasRef.current) guiasRef.current.innerHTML = '';
      terminarGesto();
    };
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
    iniciarGesto();
    const onMove = (ev) => {
      const dw = (ev.clientX - start.x) / v.s, dh = (ev.clientY - start.y) / v.s;
      // El ancho salta a S, M o L (todo encaja); el alto sigue la cuadrícula.
      setCharts(cs => cs.map(c => (c.id === id ? { ...c, w: anchoCercano(clamp(start.w + dw, ANCHOS.s, ANCHOS.l)), h: snap(clamp(start.h + dh, 144, 912)) } : c)));
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); terminarGesto(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // ── Secciones estilo Miro ─────────────────────────────────────────────────
  const removeFrame = (id) => setFrames(fs => fs.filter(f => f.id !== id)); // no borra los nodos
  const renameFrame = (id, title) => setFrames(fs => fs.map(f => (f.id === id ? { ...f, title } : f)));

  const startResizeFrame = (id) => (e) => {
    if (e.button !== 0 || lockedRef.current) return;
    e.preventDefault(); e.stopPropagation();
    const v = viewRef.current;
    const f = framesRef.current.find(x => x.id === id);
    if (!f) return;
    const start = { x: e.clientX, y: e.clientY, w: f.w, h: f.h };
    iniciarGesto();
    const onMove = (ev) => {
      const dw = (ev.clientX - start.x) / v.s, dh = (ev.clientY - start.y) / v.s;
      setFrames(fs => fs.map(x => (x.id === id ? { ...x, w: snap(Math.max(start.w + dw, 240)), h: snap(Math.max(start.h + dh, 160)) } : x)));
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); terminarGesto(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Encuadrar una lista de tarjetas/secciones (con margen), animado.
  const encuadrar = useCallback((list, maxZoom = 1) => {
    const el = canvasRef.current;
    if (!el || !list.length) return;
    const minX = Math.min(...list.map(c => c.x)) - 40, minY = Math.min(...list.map(c => c.y)) - 40;
    const maxX = Math.max(...list.map(c => c.x + c.w)) + 40, maxY = Math.max(...list.map(c => c.y + c.h)) + 40;
    const rect = el.getBoundingClientRect();
    const s = clamp(Math.min(rect.width / (maxX - minX), rect.height / (maxY - minY)), ZOOM_MIN, maxZoom);
    animarCamara({ s, tx: (rect.width - (maxX - minX) * s) / 2 - minX * s, ty: (rect.height - (maxY - minY) * s) / 2 - minY * s });
  }, [animarCamara]);
  const fitView = useCallback(() => {
    const list = [...chartsRef.current, ...framesRef.current, ...notasRef.current];
    if (list.length) encuadrar(list); else animarCamara({ tx: 30, ty: 30, s: 0.85 });
  }, [encuadrar, animarCamara]);
  const zoomASeleccion = () => {
    const ids = selRef.current;
    encuadrar(todosLosNodos().filter(x => ids.has(x.id)), 2);
  };
  const zoomA = (s) => {
    const el = canvasRef.current;
    const rect = el ? el.getBoundingClientRect() : { width: 600, height: 600 };
    animarCamara(zoomEn(viewRef.current, clamp(s, ZOOM_MIN, ZOOM_MAX), rect.width / 2, rect.height / 2));
  };
  // Ctrl+ / Ctrl− y los botones + / −: al siguiente escalón (10 %, 25 %, 50 %, 75 %, 100 %, 125 %…).
  const zoomPaso = (dir) => {
    const s = viewRef.current.s;
    const sig = dir > 0 ? PASOS_ZOOM.find(p => p > s * 1.001) : [...PASOS_ZOOM].reverse().find(p => p < s * 0.999);
    zoomA(sig ?? (dir > 0 ? ZOOM_MAX : ZOOM_MIN));
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
  const deleteChart = (id) => {
    setCharts(cs => cs.filter(c => c.id !== id));
    setVistas(vs => vs.map(v => (v.cards.includes(id) ? { ...v, cards: v.cards.filter(x => x !== id) } : v)));   // y de sus vistas
  };
  const addParamsNode = () => {
    if (chartsRef.current.some(c => c.type === 'qa')) return; // una fuente basta
    const size = { w: ANCHOS.s, h: ALTO_DEFECTO.qa };
    const { x, y, marco } = huecoLibre(size.w, size.h);
    setCharts(cs => [...cs, { id: uid(), type: 'qa', title: 'Parámetros del modelo', ...size, x, y }]);
    crecerSeccion(marco, x, y, size.w, size.h);
  };
  // ── Vistas: elegir tarjetas → fijar con un nombre → botón que las muestra encajadas ──
  const alternarElegida = (id) => setElegidas(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const cancelarEleccion = () => { setEligiendo(false); setElegidas(new Set()); setNombreVista(''); };
  const fijarVista = () => {
    const cards = chartsRef.current.filter(c => elegidas.has(c.id)).sort((a, b) => a.y - b.y || a.x - b.x).map(c => c.id);
    if (!cards.length) return;
    const v = { id: uid(), titulo: nombreVista.trim() || `Vista ${vistas.length + 1}`, cards };
    setVistas(vs => [...vs, v]);
    cancelarEleccion();
    setVistaActiva(v.id);
  };
  const vistaVisible = vistas.find(v => v.id === vistaActiva) || null;
  const avisarVista = (t) => { setAvisoVista(t); setTimeout(() => setAvisoVista(''), 2800); };
  const copiarEnlaceDeVista = async () => {
    const enlace = enlaceDe(vistaVisible);
    try { await navigator.clipboard.writeText(enlace); avisarVista('Enlace copiado'); }
    catch { window.prompt('Copia el enlace de la vista:', enlace); }
  };
  // Chrome solo deja bajar un archivo sin preguntar si el clic del usuario es reciente (unos 5 s); la
  // captura puede tardar más, y entonces bloqueaba la descarga en silencio. Si el clic ya caducó, el
  // archivo queda listo en la barra y «Guardar» lo baja con un clic nuevo.
  const bajar = ({ nombre, url }) => {
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
  };
  const exportarVista = async (tipo) => {
    setListo(null);
    setExportando(tipo === 'pdf' ? 'Creando el PDF…' : 'Creando la imagen…');
    try {
      const { nombre, blob } = await vistaRef.current.exportar(tipo);
      const archivo = { nombre, url: URL.createObjectURL(blob), tipo };
      if (navigator.userActivation?.isActive) { bajar(archivo); avisarVista('Descargado'); }
      else setListo(archivo);
    } catch (e) { avisarVista(`No se pudo exportar: ${e.message}`); }
    setExportando('');
  };
  const guardarListo = () => { if (listo) { bajar(listo); setListo(null); } };
  useEffect(() => () => { if (listo) setTimeout(() => URL.revokeObjectURL(listo.url), 60000); }, [listo]);
  const quitarVista = () => {
    if (!vistaVisible || !window.confirm(`¿Quitar la vista «${vistaVisible.titulo}»? Las gráficas siguen en el lienzo.`)) return;
    setVistas(vs => vs.filter(v => v.id !== vistaVisible.id));
    setVistaActiva(null);
  };
  // Enlace de una vista para la gente de la obra: abre el visor en el frente y el Tablero en la vista.
  const enlaceDe = (v) => {
    const frente = proyecto?.frontId;
    const id = String(proyecto?.id || project);
    const base = frente && id.endsWith('_' + frente) ? id.slice(0, -(frente.length + 1)) : id;
    const u = new URL(window.location.origin + window.location.pathname);
    u.searchParams.set('project', base);
    if (frente) u.searchParams.set('frente', frente);
    if (proyecto?.frontName) u.searchParams.set('fn', proyecto.frontName);
    u.searchParams.set('tablero', `${dashId}.${v.id}`);
    return u.toString();
  };

  // ── Acciones sobre la selección (teclado y, más adelante, menú contextual) ───────────────────────
  const borrarSeleccion = () => {
    const ids = selRef.current;
    if (!ids.size) return;
    setCharts(cs => cs.filter(c => !ids.has(c.id)));
    setFrames(fs => fs.filter(f => !ids.has(f.id)));
    setNotas(ns => ns.filter(n => !ids.has(n.id)));
    setVistas(vs => vs.map(v => (v.cards.some(id => ids.has(id)) ? { ...v, cards: v.cards.filter(id => !ids.has(id)) } : v)));
    setSeleccion(new Set());
  };
  const copiar = () => {
    const ids = selRef.current;
    if (!ids.size) return false;
    portapapeles.current = {
      charts: chartsRef.current.filter(c => ids.has(c.id)),
      frames: framesRef.current.filter(f => ids.has(f.id)),
      notas: notasRef.current.filter(n => ids.has(n.id)),
      veces: 0,
    };
    return true;
  };
  const pegar = () => {
    const p = portapapeles.current;
    if (!p || (!p.charts.length && !p.frames.length && !p.notas.length)) return;
    p.veces += 1;
    const d = SNAP * 2 * p.veces;
    const nuevasC = p.charts.map(c => ({ ...c, id: uid(), x: c.x + d, y: c.y + d }));
    const nuevasF = p.frames.map(f => ({ ...f, id: uid(), x: f.x + d, y: f.y + d }));
    const nuevasN = p.notas.map(n => ({ ...n, id: uid(), x: n.x + d, y: n.y + d }));
    if (nuevasC.length) setCharts(cs => [...cs, ...nuevasC]);
    if (nuevasF.length) setFrames(fs => [...fs, ...nuevasF]);
    if (nuevasN.length) setNotas(ns => [...ns, ...nuevasN]);
    setSeleccion(new Set([...nuevasC, ...nuevasF, ...nuevasN].map(x => x.id)));
  };
  const duplicar = () => {
    const anterior = portapapeles.current;
    if (!copiar()) return;
    pegar();
    portapapeles.current = anterior;   // duplicar no pisa lo copiado con Ctrl+C
  };
  const seleccionarTodo = () => setSeleccion(new Set(todosLosNodos().map(x => x.id)));
  const empujar = (tecla, grande) => {
    const ids = selRef.current;
    if (!ids.size || lockedRef.current) return;
    const p = grande ? 10 : 1;
    const dx = tecla === 'arrowleft' ? -p : tecla === 'arrowright' ? p : 0;
    const dy = tecla === 'arrowup' ? -p : tecla === 'arrowdown' ? p : 0;
    setCharts(cs => cs.map(c => (ids.has(c.id) ? { ...c, x: c.x + dx, y: c.y + dy } : c)));
    setFrames(fs => fs.map(f => (ids.has(f.id) ? { ...f, x: f.x + dx, y: f.y + dy } : f)));
    setNotas(ns => ns.map(n => (ids.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)));
  };

  // Teclado del lienzo (atajos de tldraw). Solo con el foco en el tablero, sin escribir en un campo, sin
  // el editor abierto y fuera de una vista. `data-escape-propio`: el visor corta Escape en la ventana.
  const enfocarPanel = (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    panelRef.current?.focus({ preventScroll: true });
  };
  const alTeclear = (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable], [role="dialog"]')) return;
    if (editing || vistaActiva || eligiendo) return;
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    let hecho = true;
    if (k === ' ') { espacioRef.current = true; if (canvasRef.current) canvasRef.current.style.cursor = 'grab'; }
    else if (k === 'delete' || k === 'backspace') borrarSeleccion();
    else if (k === 'escape') { if (herramienta !== 'seleccionar') setHerramienta('seleccionar'); else if (selRef.current.size) setSeleccion(new Set()); else hecho = false; }
    else if (ctrl && k === 'z' && !e.shiftKey) deshacer();
    else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) rehacer();
    else if (ctrl && k === 'd') duplicar();
    else if (ctrl && k === 'c') copiar();
    else if (ctrl && k === 'v') pegar();
    else if (ctrl && k === 'a') seleccionarTodo();
    else if (ctrl && (k === '=' || k === '+')) zoomPaso(1);
    else if (ctrl && k === '-') zoomPaso(-1);
    else if (e.shiftKey && e.code === 'Digit0') zoomA(1);
    else if (e.shiftKey && e.code === 'Digit1') fitView();
    else if (e.shiftKey && e.code === 'Digit2') zoomASeleccion();
    else if (k.startsWith('arrow') && !ctrl) empujar(k, e.shiftKey);   // 1 px, 10 con Mayús
    else if (!ctrl && !e.altKey && { v: 1, h: 1, n: 1, t: 1, f: 1 }[k]) setHerramienta({ v: 'seleccionar', h: 'mano', n: 'nota', t: 'texto', f: 'seccion' }[k]);
    else if (k === 'enter' && selRef.current.size === 1 && notasRef.current.some(n => selRef.current.has(n.id))) setEditandoNota([...selRef.current][0]);
    else hecho = false;
    if (hecho) { e.preventDefault(); e.stopPropagation(); }
  };
  // Los atajos se escuchan en la ventana mientras el tablero está abierto, si el foco está en el tablero o
  // en ninguna parte: al cerrarse un menú, el botón pulsado desaparece y el foco cae al documento (antes
  // Ctrl+Z dejaba de responder justo después de usar un menú).
  const teclado = useRef(null);
  useEffect(() => {
    const aqui = () => { const a = document.activeElement; return !a || a === document.body || !!panelRef.current?.contains(a); };
    const abajo = (e) => { if (aqui()) teclado.current?.alTeclear(e); };
    const arriba = (e) => { if (aqui()) teclado.current?.alSoltarTecla(e); };
    window.addEventListener('keydown', abajo);
    window.addEventListener('keyup', arriba);
    return () => { window.removeEventListener('keydown', abajo); window.removeEventListener('keyup', arriba); };
  }, []);
  const alSoltarTecla = (e) => {
    if (e.key === ' ') { espacioRef.current = false; if (canvasRef.current) canvasRef.current.style.cursor = ''; }
  };
  teclado.current = { alTeclear, alSoltarTecla };

  // Flujo Vyssuals: clic en un parámetro de la fuente → gráfico pre-armado.
  const createFromField = (f) => {
    setEditing({ title: nombreCampo(f.key), type: 'bar', metric: 'count', groupBy: f.key, topN: 12, size: 'm' });
  };

  const loading = rows === null;



  return (
    <div ref={panelRef} tabIndex={-1} data-escape-propio data-compacta={compactaDe(width)}
      onPointerDownCapture={enfocarPanel} style={{
      // top:48 → bajo el TopBar del visor (48px, z-index 2000); a la izquierda, la barra lateral del visor
      position: 'fixed', top: 48, left: ANCHO_RIEL, right: 0, bottom: 0, zIndex: 1400, outline: 'none',
      // Tema claro de la paleta oficial: página Light, tarjetas blancas, borde Light Gray
      background: C.light, borderLeft: `1px solid ${C.lightGray}`,
      display: 'flex', flexDirection: 'column',
      color: C.dark, fontFamily: FONT_UI,
    }}>
      <style>{CSS_HERRAMIENTAS + CSS_LIENZO}</style>

      {/* Cabecera: nombre del tablero a la izquierda, acciones a la derecha */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px 7px 14px', borderBottom: `1px solid ${C.lightGray}`, background: C.blanco, flexShrink: 0 }}>
        <input
          value={dashName}
          onChange={e => setDashName(e.target.value)}
          onBlur={() => dashId && apiFetch(`${backendUrl}/api/dashboards/${dashId}`, { method: 'PUT', body: JSON.stringify({ name: dashName }) }).catch(() => {})}
          title="Nombre del tablero (clic para cambiarlo)"
          style={{ background: 'transparent', border: 'none', outline: 'none', color: C.dark, fontSize: 14, fontWeight: 600, flex: '0 1 150px', minWidth: 60, fontFamily: FUENTE }}
        />
        <span className="tablero-guardado" style={{ fontSize: 12, color: C.gris600, minWidth: 62 }}>
          {saveState === 'saving' ? 'Guardando…' : saveState === 'saved' ? 'Guardado' : ''}
        </span>
        {/* Organizar (las herramientas de añadir están en las barras flotantes del lienzo, como en Forma Board) */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2, alignItems: 'center', minWidth: 0 }}>
          <Herramienta icono="ordenar" texto="Ordenar" ayuda="Acomodar las tarjetas de cada sección en filas, con el mismo hueco entre todas" onClick={ordenar} />
          <Herramienta icono="limpiar" texto="Limpiar 3D" ayuda="Restaurar el 3D (quitar colores y aislamientos)" onClick={handleClear3D} />
          <Separador />
          <button onClick={onClose} title="Cerrar tablero" aria-label="Cerrar tablero"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, marginLeft: 4, background: 'none', border: 'none', borderRadius: 6, color: C.gris600, cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = C.light50; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
            <Icono nombre="cerrar" tam={16} />
          </button>
        </div>
      </div>

      {/* Sin línea de datos (el dueño la quitó): solo aparece un aviso cuando lo hay. */}
      {aviso && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', fontSize: 12, color: C.orange30D, borderBottom: `1px solid ${C.lightGray}`, background: C.blanco, flexShrink: 0 }}>
          {aviso}
          <button onClick={() => setAviso('')} title="Cerrar el aviso" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.gris600, cursor: 'pointer', padding: 0, fontSize: 14, lineHeight: 1 }}>×</button>
        </div>
      )}

      {/* Vistas: pestañas (Lienzo y una por vista) y, en una vista, el menú «⋯» (docs/visor/52) */}
      <BarraDeVistas
        vistas={vistas} vistaActiva={vistaActiva} onIr={setVistaActiva}
        eligiendo={eligiendo} nElegidas={elegidas.size} nombreVista={nombreVista} onNombre={setNombreVista}
        onFijar={fijarVista} onCancelar={cancelarEleccion}
        onNuevaVista={() => { setVistaActiva(null); setEligiendo(true); }} puedeNueva={!loading && charts.length > 0}
        vistaVisible={vistaVisible} nGraficas={vistaVisible ? vistaVisible.cards.filter(id => charts.some(c => c.id === id)).length : 0}
        ocupado={exportando} aviso={avisoVista} listo={listo} onGuardar={guardarListo} onDescartar={() => setListo(null)}
        onCopiarEnlace={copiarEnlaceDeVista} onExportar={exportarVista}
        onRenombrar={(id, t) => setVistas(vs => vs.map(v => (v.id === id ? { ...v, titulo: t } : v)))}
        onQuitar={quitarVista}
      />

      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
      {/* ── LIENZO INFINITO ── */}
      {(() => {
        const rejilla = rejillaDe(view);
        return (
      <div
        ref={canvasRef}
        onPointerDown={alPulsarLienzo}
        onDoubleClick={alDobleClicLienzo}
        onContextMenu={e => e.preventDefault()}
        style={{
          flex: 1, position: 'relative', overflow: 'hidden', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none',
          cursor: herramienta === 'mano' ? 'grab' : herramienta === 'seleccionar' ? 'default' : 'crosshair',
          backgroundColor: C.light,
          backgroundImage: rejilla.imagen,
          backgroundSize: rejilla.tamano,
          backgroundPosition: `${view.tx}px ${view.ty}px`,
        }}
      >
        {/* Marco de selección (en coordenadas de pantalla; se dibuja en el DOM al arrastrar) */}
        <div ref={marcoSelRef} style={{ display: 'none', position: 'absolute', zIndex: 3, pointerEvents: 'none',
          background: 'rgba(13, 102, 180, 0.06)', border: `1px solid ${AZUL_SEL}` }} />
        <div ref={contenidoRef} style={{
          position: 'absolute', top: 0, left: 0, '--s': view.s,
          transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
          transformOrigin: '0 0',
        }}>
          {/* Secciones (frames) estilo Miro: región sobria + título con una línea de
              color de la paleta. El cuerpo NO captura clics (el pan sigue funcionando
              encima); solo la barra de título y la esquina son interactivas. */}
          {frames.map(f => {
            const color = FRAME_COLORS[(f.color || 0) % FRAME_COLORS.length];
            return (
              <div key={f.id} ref={refNodo(f.id)} style={{ position: 'absolute', left: f.x, top: f.y, width: f.w, height: f.h, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(241, 240, 232, 0.72)', borderRadius: RADIO,
                  border: `1px solid ${C.lightGray}`, outline: sel.has(f.id) ? `${linea(1.5)} solid ${AZUL_SEL}` : 'none' }} />
                {/* Barra de título: asa (arrastra sección + contenido) · nombre editable · quitar */}
                <div style={{ position: 'absolute', top: -32, left: 0, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
                  <div onPointerDown={arrastrar(f.id)} title="Arrastrar la sección (mueve también sus tarjetas)"
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
              </div>
            );
          })}

          {(charts || []).map(cfg => (
            <div key={cfg.id} ref={refNodo(cfg.id)} className="tablero-nodo" style={{ position: 'absolute', left: cfg.x, top: cfg.y, width: cfg.w, height: cfg.h,
              borderRadius: RADIO, outline: sel.has(cfg.id) ? `${linea(1.5)} solid ${AZUL_SEL}` : undefined, outlineOffset: 0 }}
              onPointerDown={e => {
                // Clic derecho, central o con espacio: lo maneja el lienzo (mover). Clic: seleccionar.
                if (e.button !== 0 || espacioRef.current) return;
                e.stopPropagation();
                if (!eligiendo) seleccionarAlPulsar(cfg.id, e);
              }}>
              <ChartCard
                config={cfg}
                rows={rows || []}
                fields={fields}
                meta={{ fuente: SOURCES.inventory.label, hora }}
                itemizado={itemizado}
                onEdit={setEditing}
                onUpdate={(next) => setCharts(cs => cs.map(c => (c.id === next.id ? next : c)))}
                onDelete={deleteChart}
                onIsolate={handleIsolate}
                onPaint={handlePaint}
                onCreateFromField={createFromField}
                activeKey={active?.chartId === cfg.id ? active.key : null}
                dragHandlers={{ onPointerDown: arrastrar(cfg.id) }}
                zoom={view.s}
              />
              {eligiendo && (
                <div onClick={() => alternarElegida(cfg.id)} title={elegidas.has(cfg.id) ? 'Quitar de la vista' : 'Añadir a la vista'}
                  style={{ position: 'absolute', inset: 0, zIndex: 4, cursor: 'pointer', borderRadius: RADIO,
                    background: elegidas.has(cfg.id) ? 'rgba(106, 155, 204, 0.16)' : 'rgba(250, 249, 245, 0.35)',
                    outline: elegidas.has(cfg.id) ? `3px solid ${C.blue}` : `1px dashed ${C.gris300}` }}>
                  <span style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: elegidas.has(cfg.id) ? C.blue : C.blanco, border: `1px solid ${elegidas.has(cfg.id) ? C.blue : C.gris300}`, color: C.blanco, fontSize: 14 }}>
                    {elegidas.has(cfg.id) ? '✓' : ''}
                  </span>
                </div>
              )}
            </div>
          ))}

          {notas.map(n => {
            const Pieza = n.tipo === 'texto' ? TextoLibre : Nota;
            return (
              <Pieza key={n.id} nota={n} editando={editandoNota === n.id} refNodo={refNodo(n.id)}
                onPointerDown={arrastrar(n.id)}
                onDoubleClick={(e) => { e.stopPropagation(); setEditandoNota(n.id); }}
                onCambiar={(t) => cambiarTextoNota(n.id, t)}
                onTerminar={() => terminarNota(n.id)} />
            );
          })}

          {(() => {
            // Recuadro de la selección con sus asas (tamaño constante en pantalla). El asa de abajo a la
            // derecha cambia el tamaño de UNA tarjeta o sección; las demás marcan las esquinas.
            const elegidos = [...charts, ...frames, ...notas].filter(x => sel.has(x.id));
            if (!elegidos.length || editandoNota) return null;
            const x1 = Math.min(...elegidos.map(x => x.x)), y1 = Math.min(...elegidos.map(x => x.y));
            const x2 = Math.max(...elegidos.map(x => x.x + x.w)), y2 = Math.max(...elegidos.map(x => x.y + x.h));
            const uno = elegidos.length === 1 ? elegidos[0] : null;
            const redimensionar = uno && !locked && (charts.includes(uno) ? startResize(uno.id) : frames.includes(uno) ? startResizeFrame(uno.id) : null);
            const asa = (left, top, cursor, onDown) => (
              <div onPointerDown={onDown || undefined} style={{ position: 'absolute', left, top, width: linea(9), height: linea(9),
                transform: 'translate(-50%, -50%)', background: '#fff', border: `${linea(1.5)} solid ${AZUL_SEL}`, boxSizing: 'border-box',
                borderRadius: linea(1.5), pointerEvents: onDown ? 'auto' : 'none', cursor }} />
            );
            const notaSola = uno && notas.includes(uno) && uno.tipo === 'nota';
            const punto = (left, top, dir) => (
              <div onPointerDown={e => { e.stopPropagation(); e.preventDefault(); notaAlLado(uno, dir); }} title="Nota al lado"
                style={{ position: 'absolute', left, top, width: linea(14), height: linea(14), transform: 'translate(-50%, -50%)',
                  borderRadius: '50%', background: 'rgba(13, 102, 180, 0.16)', border: `${linea(1.5)} solid ${AZUL_SEL}`, boxSizing: 'border-box',
                  pointerEvents: 'auto', cursor: 'pointer' }} />
            );
            return (
              <div ref={selCajaRef} style={{ position: 'absolute', left: x1, top: y1, width: x2 - x1, height: y2 - y1, pointerEvents: 'none' }}>
                {elegidos.length > 1 && <div style={{ position: 'absolute', inset: 0, outline: `${linea(1)} solid ${AZUL_SEL}` }} />}
                {asa('0%', '0%', 'default')}
                {asa('100%', '0%', 'default')}
                {asa('0%', '100%', 'default')}
                {asa('100%', '100%', redimensionar ? 'nwse-resize' : 'default', redimensionar)}
                {notaSola && (
                  <>
                    {punto('50%', `calc(0% - 22px / var(--s, 1))`, 'arriba')}
                    {punto(`calc(100% + 22px / var(--s, 1))`, '50%', 'derecha')}
                    {punto('50%', `calc(100% + 22px / var(--s, 1))`, 'abajo')}
                    {punto(`calc(0% - 22px / var(--s, 1))`, '50%', 'izquierda')}
                  </>
                )}
              </div>
            );
          })()}

          {/* Líneas guía de los imanes (las dibuja el arrastre directamente en el DOM) */}
          <svg ref={guiasRef} style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex: 6 }} />
        </div>

        {/* Estados vacíos (fuera del transform) */}
        {loading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: C.gris600, fontSize: 14, pointerEvents: 'none' }}>
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
            <div style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 320, textAlign: 'center', marginBottom: 16 }}>
              Crea una gráfica con «Gráfico» o añade la lista de «Parámetros» (a la izquierda). Abajo están las notas, el texto y las secciones.
            </div>
          </div>
        )}

        {/* Barras flotantes, como Forma Board: datos a la izquierda, herramientas abajo, zoom abajo a la derecha */}
        <PaletaIzquierda onGrafico={() => setEditing('new')} onParametros={addParamsNode} parametrosApagado={loading}
          onDeshacer={deshacer} onRehacer={rehacer} />
        <BarraInferior herramienta={herramienta} onHerramienta={setHerramienta} colorNota={colorNota} onColorNota={setColorNota}
          onSeccionTamano={crearSeccionDeTamano} />
        <PildoraZoom textoRef={zoomTextoRef} porcentaje={`${Math.round(view.s * 100)} %`}
          onMenos={() => zoomPaso(-1)} onMas={() => zoomPaso(1)} onMenu={() => setMenuZoom(m => !m)} />
        {menuZoom && (
          <div onPointerDown={e => e.stopPropagation()} role="menu"
            style={{ position: 'absolute', right: 14, bottom: 62, zIndex: 5, minWidth: 240, padding: '6px 0', background: C.blanco,
              border: `1px solid ${C.lightGray}`, borderRadius: 8, boxShadow: '0 6px 20px rgba(20,20,19,0.12)', fontFamily: FUENTE }}>
            {[
              ['Acercar', 'Ctrl +', () => zoomPaso(1)],
              ['Alejar', 'Ctrl −', () => zoomPaso(-1)],
              ['Zoom a 100 %', '⇧ 0', () => zoomA(1)],
              ['Ajustar a todo', '⇧ 1', fitView],
              ['Zoom a la selección', '⇧ 2', zoomASeleccion, !sel.size],
              [locked ? 'Desbloquear tarjetas' : 'Bloquear tarjetas', '', () => setLocked(l => !l)],
            ].map(([texto, atajo, accion, apagado]) => (
              <button key={texto} role="menuitem" disabled={apagado} onClick={() => { setMenuZoom(false); accion(); }}
                style={{ display: 'flex', justifyContent: 'space-between', gap: 16, width: '100%', padding: '7px 14px', background: 'none', border: 'none',
                  cursor: apagado ? 'default' : 'pointer', fontSize: 13, fontFamily: FUENTE, color: apagado ? C.midGray : C.dark }}
                onMouseEnter={e => { if (!apagado) e.currentTarget.style.background = C.light50; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
                <span>{texto}</span><span style={{ color: C.gris600, fontSize: 12 }}>{atajo}</span>
              </button>
            ))}
            <div style={{ borderTop: `1px solid ${C.light50}`, margin: '4px 0 0', padding: '8px 14px 4px', fontSize: 12, lineHeight: 1.6, color: C.gris600 }}>
              Arrastrar el fondo: seleccionar · Doble clic: texto<br />Espacio o clic derecho + arrastrar: mover<br />Rueda: zoom · Supr: borrar · Ctrl+Z: deshacer<br />V seleccionar · H mano · N nota · T texto · F sección
            </div>
          </div>
        )}
      </div>
        );
      })()}

      {vistaVisible && (
        <VistaDePagina
          ref={vistaRef}
          key={vistaVisible.id}
          columnas={width < 1000 ? 2 : 3}
          vista={vistaVisible}
          charts={charts}
          rows={rows || []}
          fields={fields}
          meta={{ fuente: SOURCES.inventory.label, hora }}
          itemizado={itemizado}
          contexto={[proyecto?.displayName || proyecto?.name, dashName].filter(Boolean).join(' · ')}
          activo={active}
          onIsolate={handleIsolate}
          onPaint={handlePaint}
          onEdit={setEditing}
          onUpdateChart={(next) => setCharts(cs => cs.map(c => (c.id === next.id ? next : c)))}
          onQuitarDeVista={(id) => setVistas(vs => vs.map(v => (v.id === vistaVisible.id ? { ...v, cards: v.cards.filter(x => x !== id) } : v)))}
        />
      )}
      </div>

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
