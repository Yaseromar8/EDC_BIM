// Lienzo — la pizarra compartida de ALEPHIA (docs/visor/57, 58): la misma experiencia que se midió frente a los
// Tableros de ACC (docs/visor/54, 55), como pieza común para Docs y View.
//
// Qué trae: cámara en el DOM (rueda ×1,10 hacia el cursor, espacio / clic derecho / botón central para mover,
// con inercia; zoom 1–400 %), rejilla por niveles, marco de selección, arrastre al píxel con imanes y líneas
// guía (Excalidraw, MIT) y desplazamiento automático al llegar al borde, notas (crecen si el texto no cabe; puntos
// laterales), texto, secciones (con tamaños; se redimensionan por cualquier esquina), barra contextual (bloquear,
// color, letra, tamaño, alineación), menú contextual (clic derecho: cortar, copiar, pegar, reordenar, organizar,
// enmarcar…), portapapeles del sistema (entre tableros y pestañas; un texto copiado de fuera se pega como texto),
// buscar, atajos de teclado y barras flotantes.
//
// Contenido: { notas: [...], secciones: [...] }. La cámara es de cada persona (no viaja en el contenido): se
// guarda en el navegador con `claveCamara`. Cada cambio confirmado (un arrastre al soltar, un texto a los 350 ms)
// llama a `onCambio(contenido)`; el que guarda decide cuándo. `ref.aplicar(contenido)` pone un contenido que llega
// de fuera (otra persona guardó) sin contarlo como cambio propio; `ref.ocupado()` dice si la persona está a mitad
// de un gesto o escribiendo (para no cambiarle el tablero bajo el ratón).
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { C, FUENTE, RADIO } from './tema';
import { Nota, TextoLibre, BarraInferior, PaletaIzquierda, PildoraZoom, BarraContextual } from './PiezasLienzo';
import { MenuContextual, PanelBuscar, VentanaAtajos } from './MenusLienzo';
import { NOTA_LADO, NOTA_HUECO, medidaTexto, COLORES_NOTA, COLORES_TINTA, FUENTES, TAMANOS } from './notas';
import { prepararImanes, imantarArrastre, svgDeLineas } from './imanes';

const ZOOM_MIN = 0.01, ZOOM_MAX = 4;
const PASOS_ZOOM = [0.01, 0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];
const FRICCION = 0.09;
const ARRASTRE_MIN = 4;
const BORDE = 32, VELOCIDAD_BORDE = 16;        // desplazamiento automático: franja de 32 px, hasta 16 px por fotograma
const SECCION_MIN = [160, 120];
const AZUL_SEL = '#0D66B4';
const COLORES_SECCION = [C.orange, C.blue, C.green, C.gris700];
const MARCA = 'data-alephia-lienzo';            // marca del portapapeles: contenido de un lienzo de ALEPHIA
const linea = (px) => `calc(${px}px / var(--s, 1))`;
const CSS_LIENZO = `.tablero-nodo:hover { outline: ${linea(1.5)} solid rgba(13, 102, 180, 0.45); }
.lienzo-punto { opacity: 0; transition: opacity 120ms ease; } .lienzo-punto:hover { opacity: 1; }
[data-lienzo] input.lienzo-sin-anillo:focus-visible { box-shadow: none !important; }`;
// Los puntos de «nota al lado» solo aparecen al pasar el ratón por la nota elegida (como en ACC).
const cssPuntos = (id) => (id ? `[data-lienzo]:has([data-id="${id}"]:hover) .lienzo-punto { opacity: 1; }` : '');
const ESTILO = ['color', 'fuente', 'tamano', 'alinear', 'vertical'];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const redondo = (v) => Math.round(v);
const mismoConjunto = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const cajaDe = (l) => (l.length ? { x1: Math.min(...l.map(c => c.x)), y1: Math.min(...l.map(c => c.y)), x2: Math.max(...l.map(c => c.x + c.w)), y2: Math.max(...l.map(c => c.y + c.h)) } : null);
const dentro = (c, f) => { const cx = c.x + c.w / 2, cy = c.y + c.h / 2; return cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h; };
const editable = (t) => !!t?.closest?.('input, textarea, select, [contenteditable]');
const rejillaDe = (v) => {
  let paso = 32;
  while (paso * v.s < 12) paso *= 4;
  while (paso * v.s >= 48) paso /= 4;
  const menor = paso * v.s, mayor = menor * 4, a = Math.min(1, (menor - 12) / 18);
  const mn = `rgba(20,20,19,${(0.05 * a).toFixed(3)})`, mj = 'rgba(20,20,19,0.075)';
  return {
    imagen: [`linear-gradient(${mn} 1px, transparent 1px)`, `linear-gradient(90deg, ${mn} 1px, transparent 1px)`,
      `linear-gradient(${mj} 1px, transparent 1px)`, `linear-gradient(90deg, ${mj} 1px, transparent 1px)`].join(','),
    tamano: [`${menor}px ${menor}px`, `${menor}px ${menor}px`, `${mayor}px ${mayor}px`, `${mayor}px ${mayor}px`].join(','),
  };
};
const leerCamara = (clave) => { try { const v = JSON.parse(localStorage.getItem(clave) || 'null'); return v && Number.isFinite(v.s) ? v : null; } catch { return null; } };

// ── Portapapeles: lo que se copia viaja como HTML con una marca, más el texto plano para pegar en otra parte ──
const escaparHtml = (t) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const textoPlanoDe = (d) => [...d.secciones.map(f => f.titulo), ...d.notas.map(n => n.texto)].filter(Boolean).join('\n\n');
const htmlDe = (d) => `<div ${MARCA}="${encodeURIComponent(JSON.stringify(d))}">${escaparHtml(textoPlanoDe(d)).replace(/\n/g, '<br>')}</div>`;
const num = (v, def = 0) => (Number.isFinite(v) ? v : def);
const txt = (v, max = 20000) => (typeof v === 'string' ? v.slice(0, max) : '');
// Lo que llega del portapapeles se valida campo a campo: solo pasan las formas y los valores que el lienzo conoce.
function limpiarPegado(d) {
  if (!d || typeof d !== 'object') return null;
  const estilo = (x) => ({
    ...(COLORES_NOTA[x.color] ? { color: x.color } : {}), ...(FUENTES[x.fuente] ? { fuente: x.fuente } : {}),
    ...(TAMANOS.some(t => t[0] === x.tamano) ? { tamano: x.tamano } : {}),
    ...(['izquierda', 'centro', 'derecha'].includes(x.alinear) ? { alinear: x.alinear } : {}),
    ...(['arriba', 'centro', 'abajo'].includes(x.vertical) ? { vertical: x.vertical } : {}),
    ...(x.bloqueado ? { bloqueado: true } : {}),
  });
  const notas = (Array.isArray(d.notas) ? d.notas : []).slice(0, 2000).filter(n => n && (n.tipo === 'nota' || n.tipo === 'texto')).map(n => ({
    tipo: n.tipo, x: num(n.x), y: num(n.y), w: clamp(num(n.w, NOTA_LADO), 8, 20000), h: clamp(num(n.h, NOTA_LADO), 8, 20000), texto: txt(n.texto), ...estilo(n),
  }));
  const secciones = (Array.isArray(d.secciones) ? d.secciones : []).slice(0, 500).filter(Boolean).map(f => ({
    x: num(f.x), y: num(f.y), w: clamp(num(f.w, 640), SECCION_MIN[0], 50000), h: clamp(num(f.h, 400), SECCION_MIN[1], 50000),
    titulo: txt(f.titulo, 200) || 'Sección', color: clamp(Math.round(num(f.color)), 0, COLORES_SECCION.length - 1), ...(f.bloqueado ? { bloqueado: true } : {}),
  }));
  return notas.length || secciones.length ? { notas, secciones } : null;
}
function leerHtml(html) {
  const m = (html || '').match(new RegExp(`${MARCA}="([^"]*)"`));
  if (!m) return null;
  try { return limpiarPegado(JSON.parse(decodeURIComponent(m[1]))); } catch { return null; }
}

const Lienzo = forwardRef(function Lienzo({ inicial = null, onCambio, claveCamara = '', paletaExtra = null }, ref) {
  const [notas, setNotas] = useState(() => inicial?.notas || []);
  const [secciones, setSecciones] = useState(() => inicial?.secciones || []);
  const [view, setView] = useState(() => (claveCamara && leerCamara(claveCamara)) || { tx: 80, ty: 80, s: 1 });
  const [sel, setSel] = useState(() => new Set());
  const [herramienta, setHerramienta] = useState('seleccionar');
  const [colorNota, setColorNota] = useState('amarillo');
  const [editandoNota, setEditandoNota] = useState(null);
  const [menuZoom, setMenuZoom] = useState(false);
  const [menu, setMenu] = useState(null);              // menú contextual: { x, y, sobre: 'seleccion' | 'vacio' }
  const [buscando, setBuscando] = useState(false);
  const [atajos, setAtajos] = useState(false);
  const notasRef = useRef(notas), seccionesRef = useRef(secciones), selRef = useRef(sel), editandoRef = useRef(null);
  const viewRef = useRef(view), confirmadaRef = useRef(view), confirmarTimer = useRef(0);
  const inerciaRef = useRef(0), animRef = useRef(0), espacioRef = useRef(false);
  const panelRef = useRef(null), canvasRef = useRef(null), contenidoRef = useRef(null);
  const marcoSelRef = useRef(null), zoomTextoRef = useRef(null), guiasRef = useRef(null), selCajaRef = useRef(null), barraRef = useRef(null);
  const nodosRef = useRef(new Map()), refsDeNodo = useRef(new Map());
  const portapapeles = useRef(null), pegado = useRef({ firma: '', veces: 0 }), punteroRef = useRef(null), firmasAltura = useRef(new Map());
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;
  useEffect(() => { notasRef.current = notas; }, [notas]);
  useEffect(() => { seccionesRef.current = secciones; }, [secciones]);
  useEffect(() => { selRef.current = sel; }, [sel]);
  useEffect(() => { editandoRef.current = editandoNota; }, [editandoNota]);
  const todos = () => [...seccionesRef.current, ...notasRef.current];
  const refNodo = (id) => {
    if (!refsDeNodo.current.has(id)) refsDeNodo.current.set(id, (el) => { if (el) { el.dataset.id = id; nodosRef.current.set(id, el); } else nodosRef.current.delete(id); });
    return refsDeNodo.current.get(id);
  };

  // ── Historial y avisos de cambio ─────────────────────────────────────────────────────────────────
  const hist = useRef({ pasado: [], futuro: [], actual: { notas, secciones }, aplicando: false, gesto: false, t: 0 });
  const confirmar = useCallback(() => {
    const h = hist.current;
    const ahora = { notas: notasRef.current, secciones: seccionesRef.current };
    if (ahora.notas === h.actual.notas && ahora.secciones === h.actual.secciones) return;
    h.pasado.push(h.actual);
    if (h.pasado.length > 100) h.pasado.shift();
    h.futuro = [];
    h.actual = ahora;
    onCambioRef.current?.(ahora);
  }, []);
  useEffect(() => {
    const h = hist.current;
    if (h.aplicando) { h.aplicando = false; h.actual = { notas, secciones }; return; }
    if (h.gesto) return;
    clearTimeout(h.t);
    h.t = setTimeout(confirmar, 350);
  }, [notas, secciones, confirmar]);
  const setSeleccion = (n) => { if (!mismoConjunto(n, selRef.current)) { selRef.current = n; setSel(n); } };
  const ponerContenido = (c, avisar) => {
    hist.current.aplicando = !avisar;
    setNotas(c.notas || []); setSecciones(c.secciones || []);
    setEditandoNota(null);
  };
  const deshacer = () => {
    const h = hist.current;
    clearTimeout(h.t); confirmar();
    const prev = h.pasado.pop();
    if (!prev) return;
    h.futuro.push(h.actual);
    h.actual = prev;
    ponerContenido(prev, false);
    setSeleccion(new Set());
    onCambioRef.current?.(prev);
  };
  const rehacer = () => {
    const h = hist.current;
    const sig = h.futuro.pop();
    if (!sig) return;
    h.pasado.push(h.actual);
    h.actual = sig;
    ponerContenido(sig, false);
    setSeleccion(new Set());
    onCambioRef.current?.(sig);
  };
  // Cada acción discreta (crear, borrar, pegar, alinear, estilo…) es su propio paso de deshacer, como en ACC: antes
  // de hacerla se cierra el paso anterior. Solo lo que se escribe se agrupa (350 ms).
  const marcar = () => { clearTimeout(hist.current.t); confirmar(); };
  const iniciarGesto = () => { marcar(); hist.current.gesto = true; };
  const terminarGesto = () => { hist.current.gesto = false; confirmar(); };
  useImperativeHandle(ref, () => ({
    contenido: () => ({ notas: notasRef.current, secciones: seccionesRef.current }),
    // Contenido que llega de fuera (otra persona guardó y se fusionó): pasa a ser el actual, sin avisar, y el
    // historial empieza de nuevo desde él (deshacer no puede llevarse por delante lo que trajo otra persona).
    aplicar: (c) => {
      const h = hist.current;
      clearTimeout(h.t);
      h.actual = { notas: c.notas || [], secciones: c.secciones || [] };
      h.pasado = []; h.futuro = [];
      notasRef.current = h.actual.notas; seccionesRef.current = h.actual.secciones;
      const vivos = new Set([...h.actual.notas, ...h.actual.secciones].map(x => x.id));
      setSeleccion(new Set([...selRef.current].filter(id => vivos.has(id))));
      ponerContenido(h.actual, false);
    },
    ocupado: () => hist.current.gesto || !!editandoRef.current,
  }), []);

  // La barra contextual va encima de lo elegido, pero nunca fuera de la pantalla: se corre hacia dentro por los
  // lados y, si arriba no cabe, pasa debajo de la selección (como en ACC). Se recoloca al mover la cámara.
  const colocarBarra = useCallback(() => {
    const w = barraRef.current, c = canvasRef.current, s = selCajaRef.current;
    if (!w || !c || !s) return;
    w.style.setProperty('--bx', '0px'); w.style.setProperty('--by', '-14px');
    const r = w.getBoundingClientRect(), R = c.getBoundingClientRect(), S = s.getBoundingClientRect(), m = 8;
    let bx = 0, by = -14;
    if (r.left < R.left + m) bx = R.left + m - r.left; else if (r.right > R.right - m) bx = R.right - m - r.right;
    if (r.top < R.top + m) by += Math.max(R.top + m, Math.min(S.bottom + 14, R.bottom - r.height - 72)) - r.top;
    w.style.setProperty('--bx', `${Math.round(bx)}px`); w.style.setProperty('--by', `${Math.round(by)}px`);
  }, []);
  useLayoutEffect(() => { colocarBarra(); });

  // ── Cámara: en el DOM, React se entera al quedarse quieta ────────────────────────────────────────
  const pintarCamara = useCallback(() => {
    const v = viewRef.current, el = canvasRef.current, cont = contenidoRef.current;
    if (cont) { cont.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`; cont.style.setProperty('--s', v.s); }
    if (el) { const g = rejillaDe(v); el.style.backgroundImage = g.imagen; el.style.backgroundSize = g.tamano; el.style.backgroundPosition = `${v.tx}px ${v.ty}px`; }
    if (zoomTextoRef.current) zoomTextoRef.current.textContent = `${Math.round(v.s * 100)} %`;
    colocarBarra();
  }, [colocarBarra]);
  const moverCamara = useCallback((v) => {
    viewRef.current = v;
    pintarCamara();
    clearTimeout(confirmarTimer.current);
    confirmarTimer.current = setTimeout(() => {
      confirmadaRef.current = viewRef.current;
      setView(viewRef.current);
      if (claveCamara) { try { localStorage.setItem(claveCamara, JSON.stringify(viewRef.current)); } catch { /* sin almacenamiento */ } }
    }, 180);
  }, [pintarCamara, claveCamara]);
  useEffect(() => {
    if (view === confirmadaRef.current) return;
    confirmadaRef.current = view; viewRef.current = view; pintarCamara();
  }, [view, pintarCamara]);
  const pararCamara = () => { cancelAnimationFrame(inerciaRef.current); cancelAnimationFrame(animRef.current); };
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
  const zoomEn = (v, s, px, py) => { const wx = (px - v.tx) / v.s, wy = (py - v.ty) / v.s; return { s, tx: px - wx * s, ty: py - wy * s }; };
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault(); pararCamara();
      let d = e.deltaY;
      if (e.deltaMode === 1) d *= 33; else if (e.deltaMode === 2) d *= 600;
      const factor = e.ctrlKey ? Math.exp(-d * 0.01) : Math.pow(1.1, -d / 100);
      const r = el.getBoundingClientRect(), v = viewRef.current;
      moverCamara(zoomEn(v, clamp(v.s * factor, ZOOM_MIN, ZOOM_MAX), e.clientX - r.left, e.clientY - r.top));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [moverCamara]);
  // Mover el lienzo. Con el clic derecho, soltar sin haberlo movido abre el menú contextual (`sinMover`).
  const panear = (e, sinMover) => {
    e.preventDefault(); pararCamara();
    const el = canvasRef.current, ini = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
    let ult = { x: e.clientX, y: e.clientY, t: performance.now() }, vel = { x: 0, y: 0 }, movido = !sinMover;
    if (el && movido) el.style.cursor = 'grabbing';
    const onMove = (ev) => {
      if (!movido) {
        if (Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y) < ARRASTRE_MIN) return;
        movido = true; if (el) el.style.cursor = 'grabbing';
      }
      moverCamara({ ...viewRef.current, tx: ini.tx + ev.clientX - ini.x, ty: ini.ty + ev.clientY - ini.y });
      const t = performance.now(), dt = Math.max(1, t - ult.t);
      vel = { x: 0.2 * vel.x + 0.8 * (ev.clientX - ult.x) / dt, y: 0.2 * vel.y + 0.8 * (ev.clientY - ult.y) / dt };
      ult = { x: ev.clientX, y: ev.clientY, t };
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      if (el) el.style.cursor = '';
      if (!movido) { sinMover(); return; }
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
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };
  // Al arrastrar algo (o el marco) cerca del borde, el lienzo se desplaza solo, más deprisa cuanto más cerca.
  const bordeAutomatico = (alMover) => {
    let ultimo = null, vivo = true, raf = 0;
    const paso = () => {
      if (!vivo) return;
      const el = canvasRef.current;
      if (el && ultimo) {
        const r = el.getBoundingClientRect();
        const vel = (d) => (d < BORDE ? ((BORDE - Math.max(d, 0)) / BORDE) * VELOCIDAD_BORDE : 0);
        const vx = vel(ultimo.clientX - r.left) - vel(r.right - ultimo.clientX);
        const vy = vel(ultimo.clientY - r.top) - vel(r.bottom - ultimo.clientY);
        if (vx || vy) {
          const v = viewRef.current;
          moverCamara({ ...v, tx: v.tx + vx, ty: v.ty + vy });
          alMover(ultimo);
        }
      }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return { puntero: (ev) => { ultimo = { clientX: ev.clientX, clientY: ev.clientY, ctrlKey: ev.ctrlKey, metaKey: ev.metaKey }; }, parar: () => { vivo = false; cancelAnimationFrame(raf); } };
  };
  const visible = () => {
    const r = canvasRef.current.getBoundingClientRect(), v = viewRef.current;
    return { x1: -v.tx / v.s, y1: -v.ty / v.s, x2: (r.width - v.tx) / v.s, y2: (r.height - v.ty) / v.s };
  };
  const encuadrar = useCallback((list, maxZoom = 1) => {
    const el = canvasRef.current;
    if (!el || !list.length) return;
    const minX = Math.min(...list.map(c => c.x)) - 40, minY = Math.min(...list.map(c => c.y)) - 40;
    const maxX = Math.max(...list.map(c => c.x + c.w)) + 40, maxY = Math.max(...list.map(c => c.y + c.h)) + 40;
    const r = el.getBoundingClientRect();
    const s = clamp(Math.min(r.width / (maxX - minX), r.height / (maxY - minY)), ZOOM_MIN, maxZoom);
    animarCamara({ s, tx: (r.width - (maxX - minX) * s) / 2 - minX * s, ty: (r.height - (maxY - minY) * s) / 2 - minY * s });
  }, [animarCamara]);
  const ajustarATodo = () => { const l = todos(); if (l.length) encuadrar(l); else animarCamara({ tx: 80, ty: 80, s: 1 }); };
  const zoomASeleccion = () => encuadrar(todos().filter(x => selRef.current.has(x.id)), 2);
  const zoomA = (s) => { const r = canvasRef.current.getBoundingClientRect(); animarCamara(zoomEn(viewRef.current, clamp(s, ZOOM_MIN, ZOOM_MAX), r.width / 2, r.height / 2)); };
  const zoomPaso = (dir) => {
    const s = viewRef.current.s;
    const sig = dir > 0 ? PASOS_ZOOM.find(p => p > s * 1.001) : [...PASOS_ZOOM].reverse().find(p => p < s * 0.999);
    zoomA(sig ?? (dir > 0 ? ZOOM_MAX : ZOOM_MIN));
  };

  // ── Selección y marco ────────────────────────────────────────────────────────────────────────────
  const seleccionarAlPulsar = (id, e) => {
    const actual = selRef.current;
    if (e.shiftKey) { const n = new Set(actual); if (n.has(id)) n.delete(id); else n.add(id); setSeleccion(n); return false; }
    if (!actual.has(id)) setSeleccion(new Set([id]));
    return true;
  };
  const puntoDelMundo = (e) => { const r = canvasRef.current.getBoundingClientRect(), v = viewRef.current; return { x: (e.clientX - r.left - v.tx) / v.s, y: (e.clientY - r.top - v.ty) / v.s }; };
  // Marco (de selección o de una sección nueva): el punto de partida se fija en el mundo, así sigue en su sitio
  // aunque el lienzo se desplace solo al llegar al borde.
  const rectangulo = (e, alMover, alSoltar) => {
    const el = canvasRef.current, marco = marcoSelRef.current;
    const a = puntoDelMundo(e), aPantalla = { x: e.clientX, y: e.clientY };
    let b = a, activo = false;
    const caja = () => ({ x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) });
    const pintar = (ev) => {
      b = puntoDelMundo(ev);
      if (!activo && Math.hypot(ev.clientX - aPantalla.x, ev.clientY - aPantalla.y) < ARRASTRE_MIN) return;
      activo = true;
      const v = viewRef.current, W = caja();
      Object.assign(marco.style, { display: 'block', left: `${W.x1 * v.s + v.tx}px`, top: `${W.y1 * v.s + v.ty}px`, width: `${(W.x2 - W.x1) * v.s}px`, height: `${(W.y2 - W.y1) * v.s}px` });
      alMover?.(W);
    };
    const borde = bordeAutomatico(pintar);
    const onMove = (ev) => { borde.puntero(ev); pintar(ev); };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      borde.parar();
      marco.style.display = 'none';
      alSoltar(activo, caja());
    };
    if (el) window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  const iniciarMarco = (e) => {
    window.getSelection()?.removeAllRanges();   // un lienzo no selecciona texto al arrastrar, selecciona piezas
    const base = e.shiftKey ? new Set(selRef.current) : new Set();
    rectangulo(e, (W) => {
      const n = new Set(base);
      for (const c of notasRef.current) if (c.x < W.x2 && c.x + c.w > W.x1 && c.y < W.y2 && c.y + c.h > W.y1) n.add(c.id);
      for (const f of seccionesRef.current) if (f.x >= W.x1 && f.x + f.w <= W.x2 && f.y >= W.y1 && f.y + f.h <= W.y2) n.add(f.id);
      setSeleccion(n);
    }, (activo) => { if (!activo && !e.shiftKey) setSeleccion(new Set()); });
  };

  // ── Crear: notas, texto, secciones ───────────────────────────────────────────────────────────────
  const crearNota = (x, y, color = colorNota) => {
    marcar();
    const n = { id: uid(), tipo: 'nota', x: redondo(x), y: redondo(y), w: NOTA_LADO, h: NOTA_LADO, texto: '', color };
    setNotas(ns => [...ns, n]); setSeleccion(new Set([n.id])); setEditandoNota(n.id); setHerramienta('seleccionar');
  };
  const notaAlLado = (nota, dir) => {
    const d = { derecha: [nota.w + NOTA_HUECO, 0], izquierda: [-(nota.w + NOTA_HUECO), 0], abajo: [0, nota.h + NOTA_HUECO], arriba: [0, -(NOTA_LADO + NOTA_HUECO)] }[dir];
    crearNota(nota.x + d[0], nota.y + d[1], nota.color);
  };
  const crearTexto = (x, y) => {
    marcar();
    const t = { id: uid(), tipo: 'texto', x: redondo(x), y: redondo(y - 16), texto: '', ...medidaTexto('') };
    setNotas(ns => [...ns, t]); setSeleccion(new Set([t.id])); setEditandoNota(t.id); setHerramienta('seleccionar');
  };
  const cambiarTexto = (id, texto) => setNotas(ns => ns.map(n => (n.id !== id ? n : n.tipo === 'texto' ? { ...n, texto, ...medidaTexto(texto, n) } : { ...n, texto })));
  const terminarNota = (id) => { setEditandoNota(null); setNotas(ns => ns.filter(n => !(n.id === id && n.tipo === 'texto' && !n.texto.trim()))); };
  const nuevaSeccion = (f, titulo, detras = false) => {
    marcar();
    const s = { id: uid(), titulo: titulo || `Sección ${seccionesRef.current.length + 1}`, color: seccionesRef.current.length % COLORES_SECCION.length, ...f };
    setSecciones(xs => (detras ? [s, ...xs] : [...xs, s])); setSeleccion(new Set([s.id])); setHerramienta('seleccionar');
    return s;
  };
  const dibujarSeccion = (e) => {
    const p = puntoDelMundo(e);
    rectangulo(e, null, (grande, W) => {
      if (grande && W.x2 - W.x1 > 24 && W.y2 - W.y1 > 24) nuevaSeccion({ x: redondo(W.x1), y: redondo(W.y1), w: redondo(W.x2 - W.x1), h: redondo(W.y2 - W.y1) });
      else nuevaSeccion({ x: redondo(p.x - 320), y: redondo(p.y - 200), w: 640, h: 400 });
    });
  };
  const seccionDeTamano = (nombre, [w, h]) => {
    const r = canvasRef.current.getBoundingClientRect(), v = viewRef.current;
    const cx = (r.width / 2 - v.tx) / v.s, cy = (r.height / 2 - v.ty) / v.s;
    encuadrar([nuevaSeccion({ x: redondo(cx - w / 2), y: redondo(cy - h / 2), w, h }, nombre)], 1);
  };

  // La nota crece hacia abajo cuando su texto no cabe (y vuelve a su alto al acortarlo), como en ACC.
  useLayoutEffect(() => {
    const cambios = new Map();
    for (const n of notas) {
      if (n.tipo !== 'nota') continue;
      const firma = `${n.texto}|${n.tamano}|${n.fuente}|${n.w}|${n.h}`;
      if (firmasAltura.current.get(n.id) === firma) continue;
      firmasAltura.current.set(n.id, firma);
      const el = nodosRef.current.get(n.id);
      if (!el) continue;
      const alto = el.style.height;
      el.style.height = 'auto';
      const necesita = Math.max(NOTA_LADO, Math.ceil(el.offsetHeight));
      el.style.height = alto;
      if (Math.abs(necesita - n.h) > 1) cambios.set(n.id, necesita);
    }
    if (cambios.size) setNotas(ns => ns.map(n => (cambios.has(n.id) ? { ...n, h: cambios.get(n.id) } : n)));
  }, [notas]);

  // ── Mover, alinear, ordenar ──────────────────────────────────────────────────────────────────────
  // Desplazar elementos (id → [dx, dy]); una sección arrastra lo que tiene dentro.
  const desplazar = (deltas) => {
    if (!deltas.size) return;
    marcar();
    const fs = seccionesRef.current.filter(f => deltas.has(f.id));
    const delta = (n) => deltas.get(n.id) || (!n.bloqueado && fs.find(f => dentro(n, f)) && deltas.get(fs.find(f => dentro(n, f)).id));
    const mover = (n) => { const d = delta(n); return d && (d[0] || d[1]) ? { ...n, x: redondo(n.x + d[0]), y: redondo(n.y + d[1]) } : n; };
    setNotas(ns => ns.map(mover)); setSecciones(xs => xs.map(mover));
  };
  const elegidosMovibles = () => todos().filter(x => selRef.current.has(x.id) && !x.bloqueado);
  const alinear = (modo) => {
    const l = elegidosMovibles(), c = cajaDe(l);
    if (l.length < 2) return;
    const d = new Map(l.map(x => [x.id, {
      izquierda: [c.x1 - x.x, 0], derecha: [c.x2 - (x.x + x.w), 0], centroH: [(c.x1 + c.x2) / 2 - (x.x + x.w / 2), 0],
      arriba: [0, c.y1 - x.y], abajo: [0, c.y2 - (x.y + x.h)], centroV: [0, (c.y1 + c.y2) / 2 - (x.y + x.h / 2)],
    }[modo]]));
    desplazar(d);
  };
  const repartir = (eje, apilar) => {
    const l = elegidosMovibles();
    if (l.length < (apilar ? 2 : 3)) return;
    const [p, t] = eje === 'h' ? ['x', 'w'] : ['y', 'h'];
    const orden = [...l].sort((a, b) => a[p] - b[p]);
    const inicio = orden[0][p], fin = Math.max(...orden.map(x => x[p] + x[t]));
    const hueco = apilar ? 16 : (fin - inicio - orden.reduce((s, x) => s + x[t], 0)) / (orden.length - 1);
    let cursor = inicio;
    const d = new Map();
    for (const x of orden) { d.set(x.id, eje === 'h' ? [cursor - x.x, 0] : [0, cursor - x.y]); cursor += x[t] + hueco; }
    desplazar(d);
  };
  const reordenar = (modo) => {
    marcar();
    const ids = selRef.current;
    const mover = (xs) => {
      const a = [...xs];
      if (modo === 'frente') return [...a.filter(x => !ids.has(x.id)), ...a.filter(x => ids.has(x.id))];
      if (modo === 'fondo') return [...a.filter(x => ids.has(x.id)), ...a.filter(x => !ids.has(x.id))];
      if (modo === 'adelante') { for (let i = a.length - 2; i >= 0; i--) if (ids.has(a[i].id) && !ids.has(a[i + 1].id)) [a[i], a[i + 1]] = [a[i + 1], a[i]]; }
      else { for (let i = 1; i < a.length; i++) if (ids.has(a[i].id) && !ids.has(a[i - 1].id)) [a[i], a[i - 1]] = [a[i - 1], a[i]]; }
      return a;
    };
    setNotas(mover); setSecciones(mover);
  };
  const enmarcar = () => {
    const c = cajaDe(todos().filter(x => selRef.current.has(x.id)));
    if (!c) return;
    const m = 32;
    nuevaSeccion({ x: redondo(c.x1 - m), y: redondo(c.y1 - m), w: Math.max(SECCION_MIN[0], redondo(c.x2 - c.x1 + 2 * m)), h: Math.max(SECCION_MIN[1], redondo(c.y2 - c.y1 + 2 * m)) }, null, true);
  };

  // ── Arrastrar en el DOM con imanes (y desplazamiento automático en el borde) ─────────────────────
  const arrastrar = (pulsado) => (e) => {
    if (e.button !== 0 || espacioRef.current) return;
    e.preventDefault(); e.stopPropagation();
    setMenu(null);
    if (!seleccionarAlPulsar(pulsado, e)) return;
    const ids = selRef.current.has(pulsado) ? selRef.current : new Set([pulsado]);
    const fs = seccionesRef.current.filter(f => ids.has(f.id));
    const esSeccion = new Set(seccionesRef.current.map(f => f.id));
    const moviles = todos().filter(n => !n.bloqueado && (ids.has(n.id) || (!esSeccion.has(n.id) && fs.some(f => dentro(n, f)))));
    if (!moviles.length) return;
    const idsMov = new Set(moviles.map(n => n.id));
    const c = cajaDe(moviles), caja = [c.x1, c.y1, c.x2, c.y2];
    const cache = prepararImanes(todos().filter(n => !idsMov.has(n.id)).slice(0, 3000).map(n => [n.x, n.y, n.x + n.w, n.y + n.h]));
    const ini = puntoDelMundo(e), iniPantalla = { x: e.clientX, y: e.clientY };
    let movido = false, off = { x: 0, y: 0 }, elementos = [], borde = null;
    const pintar = (ev) => {
      const v = viewRef.current, p = puntoDelMundo(ev);
      let dx = p.x - ini.x, dy = p.y - ini.y, lineas = [];
      if (!ev.ctrlKey && !ev.metaKey) ({ dx, dy, lineas } = imantarArrastre(cache, caja, dx, dy, v.s));
      off = { x: redondo(dx), y: redondo(dy) };
      const t = `translate(${dx}px, ${dy}px)`;
      for (const el of elementos) el.style.transform = t;
      if (selCajaRef.current) selCajaRef.current.style.transform = t;
      if (guiasRef.current) guiasRef.current.innerHTML = lineas.length ? svgDeLineas(lineas, v.s) : '';
    };
    const onMove = (ev) => {
      if (!movido) {
        if (Math.hypot(ev.clientX - iniPantalla.x, ev.clientY - iniPantalla.y) < ARRASTRE_MIN) return;
        movido = true; iniciarGesto();
        elementos = [...idsMov].map(id => nodosRef.current.get(id)).filter(Boolean);
        for (const el of elementos) el.style.willChange = 'transform';
        borde = bordeAutomatico(pintar);
      }
      borde.puntero(ev);
      pintar(ev);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      if (!movido) return;
      borde.parar();
      const mover = (n) => (idsMov.has(n.id) ? { ...n, x: n.x + off.x, y: n.y + off.y } : n);
      flushSync(() => { setNotas(xs => xs.map(mover)); setSecciones(xs => xs.map(mover)); });
      for (const el of elementos) { el.style.transform = ''; el.style.willChange = ''; }
      if (selCajaRef.current) selCajaRef.current.style.transform = '';
      if (guiasRef.current) guiasRef.current.innerHTML = '';
      terminarGesto();
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };
  // Redimensionar una sección por cualquiera de sus cuatro esquinas.
  const redimensionarSeccion = (id, esquina) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const f = seccionesRef.current.find(x => x.id === id);
    if (!f || f.bloqueado) return;
    const ini = puntoDelMundo(e), [mw, mh] = SECCION_MIN;
    iniciarGesto();
    const onMove = (ev) => {
      const p = puntoDelMundo(ev), dx = p.x - ini.x, dy = p.y - ini.y;
      let x1 = f.x, y1 = f.y, x2 = f.x + f.w, y2 = f.y + f.h;
      if (esquina.includes('o')) x1 = Math.min(f.x + dx, x2 - mw); else x2 = Math.max(f.x + f.w + dx, x1 + mw);
      if (esquina.includes('n')) y1 = Math.min(f.y + dy, y2 - mh); else y2 = Math.max(f.y + f.h + dy, y1 + mh);
      setSecciones(xs => xs.map(x => (x.id === id ? { ...x, x: redondo(x1), y: redondo(y1), w: redondo(x2 - x1), h: redondo(y2 - y1) } : x)));
    };
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); terminarGesto(); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  // ── Borrar, estilo, bloqueo ──────────────────────────────────────────────────────────────────────
  // Borrar una sección borra también lo que tiene dentro (como un marco de ACC); lo bloqueado se queda.
  const borrarSeleccion = () => {
    const ids = selRef.current;
    if (!ids.size) return;
    marcar();
    const fs = seccionesRef.current.filter(f => ids.has(f.id) && !f.bloqueado);
    const fuera = (x) => !x.bloqueado && (ids.has(x.id) || (x.tipo && fs.some(f => dentro(x, f))));
    setNotas(ns => ns.filter(n => !fuera(n))); setSecciones(xs => xs.filter(f => !fuera(f)));
    setSeleccion(new Set(todos().filter(x => ids.has(x.id) && x.bloqueado).map(x => x.id)));
  };
  const aplicarEstilo = (patch) => {
    marcar();
    const ids = selRef.current;
    setNotas(ns => ns.map(n => {
      if (!ids.has(n.id) || n.bloqueado) return n;
      const m = { ...n, ...patch };
      return n.tipo === 'texto' ? { ...m, ...medidaTexto(m.texto, m) } : m;
    }));
  };
  const alternarBloqueo = () => {
    const ids = selRef.current;
    if (!ids.size) return;
    marcar();
    const bloquear = !todos().filter(x => ids.has(x.id)).every(x => x.bloqueado);
    const poner = (x) => {
      if (!ids.has(x.id)) return x;
      const { bloqueado: _, ...resto } = x;
      return bloquear ? { ...resto, bloqueado: true } : resto;
    };
    setNotas(ns => ns.map(poner)); setSecciones(xs => xs.map(poner));
    setEditandoNota(null);
  };
  const editar = (id) => { if (!notasRef.current.find(n => n.id === id)?.bloqueado) setEditandoNota(id); };
  const seleccionarTodo = () => setSeleccion(new Set(todos().map(x => x.id)));

  // ── Copiar, cortar, pegar, duplicar ──────────────────────────────────────────────────────────────
  // Lo elegido y, de cada sección elegida, lo que tiene dentro.
  const recoger = () => {
    const ids = selRef.current;
    const fs = seccionesRef.current.filter(f => ids.has(f.id));
    return { notas: notasRef.current.filter(n => ids.has(n.id) || fs.some(f => dentro(n, f))), secciones: fs };
  };
  // Pegar: en el mismo sitio (desplazado 32 px cada vez que se repite) si eso está a la vista; si no, donde está
  // el puntero o en el centro de la pantalla.
  const colocar = (datos, firma) => {
    const p = pegado.current;
    if (p.firma === firma) p.veces += 1; else { p.firma = firma; p.veces = 1; }
    const c = cajaDe([...datos.secciones, ...datos.notas]), V = visible();
    let dx, dy;
    if (c.x1 < V.x2 && c.x2 > V.x1 && c.y1 < V.y2 && c.y2 > V.y1) { dx = 32 * p.veces; dy = 32 * p.veces; }
    else {
      const q = punteroRef.current && punteroRef.current.x > V.x1 && punteroRef.current.x < V.x2 && punteroRef.current.y > V.y1 && punteroRef.current.y < V.y2
        ? punteroRef.current : { x: (V.x1 + V.x2) / 2, y: (V.y1 + V.y2) / 2 };
      dx = q.x - (c.x1 + c.x2) / 2; dy = q.y - (c.y1 + c.y2) / 2;
    }
    const nn = datos.notas.map(n => ({ ...n, id: uid(), x: redondo(n.x + dx), y: redondo(n.y + dy) }));
    marcar();
    const nf = datos.secciones.map(f => ({ ...f, id: uid(), x: redondo(f.x + dx), y: redondo(f.y + dy) }));
    if (nn.length) setNotas(ns => [...ns, ...nn]);
    if (nf.length) setSecciones(xs => [...xs, ...nf]);
    setSeleccion(new Set([...nf, ...nn].map(x => x.id)));
  };
  const pegarTexto = (texto) => {
    const limpio = (texto || '').replace(/\r\n?/g, '\n').trim().slice(0, 5000);
    if (!limpio) return;
    const V = visible(), q = punteroRef.current && punteroRef.current.x > V.x1 && punteroRef.current.x < V.x2 && punteroRef.current.y > V.y1 && punteroRef.current.y < V.y2
      ? punteroRef.current : { x: (V.x1 + V.x2) / 2, y: (V.y1 + V.y2) / 2 };
    const m = medidaTexto(limpio);
    const t = { id: uid(), tipo: 'texto', x: redondo(q.x - m.w / 2), y: redondo(q.y - m.h / 2), texto: limpio, ...m };
    marcar();
    setNotas(ns => [...ns, t]); setSeleccion(new Set([t.id]));
  };
  const pegarDatos = (datos, firma) => { if (datos) colocar(datos, firma); };
  const duplicar = () => {
    const d = recoger();
    if (!d.notas.length && !d.secciones.length) return;
    colocar(d, `duplicar:${[...selRef.current].join(',')}`);
  };
  // Teclado: los eventos nativos del portapapeles (funcionan entre pestañas y con otras aplicaciones).
  const alCopiar = (e, cortar) => {
    const d = recoger();
    if (!d.notas.length && !d.secciones.length) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', textoPlanoDe(d));
    e.clipboardData.setData('text/html', htmlDe(d));
    portapapeles.current = d;
    if (cortar) borrarSeleccion();
  };
  const alPegar = (e) => {
    const html = e.clipboardData.getData('text/html'), datos = leerHtml(html);
    if (datos) { e.preventDefault(); pegarDatos(datos, html); return; }
    const texto = e.clipboardData.getData('text/plain');
    if (texto) { e.preventDefault(); pegarTexto(texto); }
  };
  // Menú contextual: el portapapeles asíncrono (pide permiso para leer); si no se puede, el interno.
  const copiarMenu = async (cortar) => {
    const d = recoger();
    if (!d.notas.length && !d.secciones.length) return;
    portapapeles.current = d;
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([htmlDe(d)], { type: 'text/html' }), 'text/plain': new Blob([textoPlanoDe(d)], { type: 'text/plain' }) })]);
    } catch { try { await navigator.clipboard.writeText(textoPlanoDe(d)); } catch { /* queda el interno */ } }
    if (cortar) borrarSeleccion();
  };
  const pegarMenu = async () => {
    try {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes('text/html')) {
          const html = await (await item.getType('text/html')).text(), datos = leerHtml(html);
          if (datos) { pegarDatos(datos, html); return; }
        }
        if (item.types.includes('text/plain')) { pegarTexto(await (await item.getType('text/plain')).text()); return; }
      }
    } catch { /* sin permiso para leer el portapapeles: el interno */ }
    if (portapapeles.current) pegarDatos(limpiarPegado(portapapeles.current), 'interno');
  };

  // ── Menú contextual ──────────────────────────────────────────────────────────────────────────────
  const abrirMenu = (cx, cy, id) => {
    const r = panelRef.current.getBoundingClientRect();
    let sobre = 'vacio';
    if (id) { if (!selRef.current.has(id)) setSeleccion(new Set([id])); sobre = 'seleccion'; }
    else {
      const c = cajaDe(todos().filter(x => selRef.current.has(x.id))), p = puntoDelMundo({ clientX: cx, clientY: cy });
      if (c && p.x >= c.x1 && p.x <= c.x2 && p.y >= c.y1 && p.y <= c.y2) sobre = 'seleccion'; else setSeleccion(new Set());
    }
    setMenuZoom(false);
    setMenu({ x: cx - r.left, y: cy - r.top, sobre });
  };
  const cerrarMenu = useCallback(() => setMenu(null), []);
  const itemsDelMenu = () => {
    if (!menu) return [];
    const elegidosAhora = todos().filter(x => sel.has(x.id)), movibles = elegidosAhora.filter(x => !x.bloqueado);
    const todoBloqueado = elegidosAhora.length > 0 && elegidosAhora.every(x => x.bloqueado);
    if (menu.sobre === 'vacio' || !elegidosAhora.length) {
      return [
        { texto: 'Pegar', atajo: 'Ctrl V', accion: pegarMenu },
        { texto: 'Seleccionar todo', atajo: 'Ctrl A', accion: seleccionarTodo, apagado: !todos().length },
        null,
        { texto: 'Zoom a 100 %', atajo: '⇧ 0', accion: () => zoomA(1) },
        { texto: 'Ajustar a todo', atajo: '⇧ 1', accion: ajustarATodo },
        null,
        { texto: 'Atajos de teclado', atajo: '?', accion: () => setAtajos(true) },
      ];
    }
    return [
      { texto: 'Cortar', atajo: 'Ctrl X', accion: () => copiarMenu(true), apagado: !movibles.length },
      { texto: 'Copiar', atajo: 'Ctrl C', accion: () => copiarMenu(false) },
      { texto: 'Pegar', atajo: 'Ctrl V', accion: pegarMenu },
      { texto: 'Duplicar', atajo: 'Ctrl D', accion: duplicar },
      null,
      { texto: 'Reordenar', hijos: [
        { texto: 'Traer al frente', atajo: '⇧ ]', accion: () => reordenar('frente') },
        { texto: 'Traer adelante', atajo: ']', accion: () => reordenar('adelante') },
        { texto: 'Enviar atrás', atajo: '[', accion: () => reordenar('atras') },
        { texto: 'Enviar al fondo', atajo: '⇧ [', accion: () => reordenar('fondo') },
      ] },
      ...(movibles.length >= 2 ? [{ texto: 'Organizar', hijos: [
        { texto: 'Alinear a la izquierda', accion: () => alinear('izquierda') },
        { texto: 'Centrar en horizontal', accion: () => alinear('centroH') },
        { texto: 'Alinear a la derecha', accion: () => alinear('derecha') },
        null,
        { texto: 'Alinear arriba', accion: () => alinear('arriba') },
        { texto: 'Centrar en vertical', accion: () => alinear('centroV') },
        { texto: 'Alinear abajo', accion: () => alinear('abajo') },
        null,
        { texto: 'Distribuir en horizontal', accion: () => repartir('h', false), apagado: movibles.length < 3 },
        { texto: 'Distribuir en vertical', accion: () => repartir('v', false), apagado: movibles.length < 3 },
        null,
        { texto: 'Apilar en horizontal', accion: () => repartir('h', true) },
        { texto: 'Apilar en vertical', accion: () => repartir('v', true) },
      ] }] : []),
      { texto: 'Enmarcar en una sección', accion: enmarcar },
      null,
      { texto: todoBloqueado ? 'Desbloquear' : 'Bloquear', atajo: '⇧ L', accion: alternarBloqueo },
      null,
      { texto: 'Eliminar', atajo: 'Supr', accion: borrarSeleccion, peligro: true, apagado: !movibles.length },
      null,
      { texto: 'Seleccionar todo', atajo: 'Ctrl A', accion: seleccionarTodo },
    ];
  };

  // ── Pulsar en el lienzo ──────────────────────────────────────────────────────────────────────────
  const alPulsarLienzo = (e) => {
    setMenuZoom(false);
    if (menu) setMenu(null);
    if (e.button === 2) {
      const id = e.target.closest?.('[data-id]')?.dataset.id || null;
      const cx = e.clientX, cy = e.clientY;
      panear(e, () => abrirMenu(cx, cy, id));
      return;
    }
    if (e.button === 1 || (e.button === 0 && (espacioRef.current || herramienta === 'mano'))) { panear(e); return; }
    if (e.button !== 0) return;
    if (herramienta === 'nota') { e.preventDefault(); const p = puntoDelMundo(e); crearNota(p.x - NOTA_LADO / 2, p.y - NOTA_LADO / 2); return; }
    if (herramienta === 'texto') { e.preventDefault(); const p = puntoDelMundo(e); crearTexto(p.x, p.y); return; }
    if (herramienta === 'seccion') { dibujarSeccion(e); return; }
    iniciarMarco(e);
  };
  const alDobleClic = (e) => { if (e.target === canvasRef.current && herramienta === 'seleccionar') { const p = puntoDelMundo(e); crearTexto(p.x, p.y); } };

  // ── Teclado ──────────────────────────────────────────────────────────────────────────────────────
  const empujar = (k, grande) => {
    const ids = selRef.current;
    if (!ids.size) return;
    const p = grande ? 10 : 1;
    const d = [k === 'arrowleft' ? -p : k === 'arrowright' ? p : 0, k === 'arrowup' ? -p : k === 'arrowdown' ? p : 0];
    desplazar(new Map(elegidosMovibles().map(x => [x.id, d])));
  };
  const alTeclear = (e) => {
    if (editable(e.target)) return;
    // Un diálogo encima del tablero se queda sus teclas; el que CONTIENE al tablero (Docs lo abre en uno) no.
    const dialogo = e.target.closest?.('[role="dialog"]');
    if (dialogo && !dialogo.contains(panelRef.current)) return;
    const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    // Ctrl+C / X / V los atienden los eventos nativos del portapapeles (copy, cut, paste).
    if (ctrl && !e.altKey && (k === 'c' || k === 'x' || k === 'v')) return;
    let hecho = true;
    if (k === ' ') { espacioRef.current = true; if (canvasRef.current) canvasRef.current.style.cursor = 'grab'; }
    else if (k === 'delete' || k === 'backspace') borrarSeleccion();
    else if (k === 'escape') {
      if (buscando) setBuscando(false);
      else if (herramienta !== 'seleccionar') setHerramienta('seleccionar');
      else if (selRef.current.size) setSeleccion(new Set());
      else hecho = false;
    }
    else if (ctrl && k === 'z' && !e.shiftKey) deshacer();
    else if (ctrl && (k === 'y' || (k === 'z' && e.shiftKey))) rehacer();
    else if (ctrl && k === 'd') duplicar();
    else if (ctrl && k === 'a') seleccionarTodo();
    else if (ctrl && k === 'f') setBuscando(true);
    else if (ctrl && (k === '=' || k === '+')) zoomPaso(1);
    else if (ctrl && k === '-') zoomPaso(-1);
    else if (!ctrl && e.key === '?') setAtajos(true);
    else if (!ctrl && e.shiftKey && k === 'l') alternarBloqueo();
    else if (!ctrl && (e.key === ']' || e.key === '}')) reordenar(e.shiftKey || e.key === '}' ? 'frente' : 'adelante');
    else if (!ctrl && (e.key === '[' || e.key === '{')) reordenar(e.shiftKey || e.key === '{' ? 'fondo' : 'atras');
    else if (e.shiftKey && e.code === 'Digit0') zoomA(1);
    else if (e.shiftKey && e.code === 'Digit1') ajustarATodo();
    else if (e.shiftKey && e.code === 'Digit2') zoomASeleccion();
    else if (k.startsWith('arrow') && !ctrl) empujar(k, e.shiftKey);
    else if (!ctrl && !e.altKey && !e.shiftKey && { v: 1, h: 1, n: 1, t: 1, f: 1 }[k]) setHerramienta({ v: 'seleccionar', h: 'mano', n: 'nota', t: 'texto', f: 'seccion' }[k]);
    else if (k === 'enter' && selRef.current.size === 1 && notasRef.current.some(n => selRef.current.has(n.id))) editar([...selRef.current][0]);
    else hecho = false;
    if (hecho) { e.preventDefault(); e.stopPropagation(); }
  };
  const alSoltarTecla = (e) => { if (e.key === ' ') { espacioRef.current = false; if (canvasRef.current) canvasRef.current.style.cursor = ''; } };
  const teclado = useRef(null);
  teclado.current = { alTeclear, alSoltarTecla, alCopiar, alPegar };
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const aqui = () => { const a = document.activeElement; return !a || a === document.body || !!panelRef.current?.contains(a); };
    const abajo = (e) => { if (aqui()) teclado.current.alTeclear(e); };
    const arriba = (e) => { if (aqui()) teclado.current.alSoltarTecla(e); };
    const copiar = (e) => { if (aqui() && !editable(e.target)) teclado.current.alCopiar(e, false); };
    const cortar = (e) => { if (aqui() && !editable(e.target)) teclado.current.alCopiar(e, true); };
    const pegar = (e) => { if (aqui() && !editable(e.target)) teclado.current.alPegar(e); };
    window.addEventListener('keydown', abajo); window.addEventListener('keyup', arriba);
    window.addEventListener('copy', copiar); window.addEventListener('cut', cortar); window.addEventListener('paste', pegar);
    return () => {
      window.removeEventListener('keydown', abajo); window.removeEventListener('keyup', arriba);
      window.removeEventListener('copy', copiar); window.removeEventListener('cut', cortar); window.removeEventListener('paste', pegar);
    };
  }, []);

  // ── Dibujo ───────────────────────────────────────────────────────────────────────────────────────
  const rejilla = rejillaDe(view);
  const elegidos = [...secciones, ...notas].filter(x => sel.has(x.id));
  const caja = elegidos.length && !editandoNota ? cajaDe(elegidos) : null;
  const uno = elegidos.length === 1 ? elegidos[0] : null;
  const unaSeccion = uno && secciones.includes(uno) && !uno.bloqueado ? uno : null;
  const conEstilo = elegidos.filter(x => x.tipo === 'nota' || x.tipo === 'texto');
  const primero = conEstilo[0] || {};
  const estiloElegido = Object.fromEntries(ESTILO.map(k => [k, conEstilo.every(x => x[k] === primero[k]) ? primero[k] : undefined]));
  const hayEnTitulo = elegidos.some(x => secciones.includes(x));
  const todoBloqueado = elegidos.length > 0 && elegidos.every(x => x.bloqueado);
  const asa = (left, top, esquina) => {
    const activa = !!unaSeccion;
    return (
      <div onPointerDown={activa ? redimensionarSeccion(unaSeccion.id, esquina) : undefined}
        style={{ position: 'absolute', left, top, width: linea(9), height: linea(9), transform: 'translate(-50%, -50%)',
          background: '#fff', border: `${linea(1.5)} solid ${AZUL_SEL}`, boxSizing: 'border-box', borderRadius: linea(1.5),
          pointerEvents: activa ? 'auto' : 'none', cursor: activa ? (esquina === 'no' || esquina === 'se' ? 'nwse-resize' : 'nesw-resize') : 'default' }} />
    );
  };
  const punto = (left, top, dir) => (
    <div className="lienzo-punto" onPointerDown={e => { e.stopPropagation(); e.preventDefault(); notaAlLado(uno, dir); }} title="Nota al lado"
      style={{ position: 'absolute', left, top, width: linea(14), height: linea(14), transform: 'translate(-50%, -50%)', borderRadius: '50%',
        background: 'rgba(13, 102, 180, 0.16)', border: `${linea(1.5)} solid ${AZUL_SEL}`, boxSizing: 'border-box', pointerEvents: 'auto', cursor: 'pointer' }} />
  );

  return (
    <div ref={panelRef} tabIndex={-1} data-escape-propio data-lienzo
      onPointerDownCapture={(e) => { if (!editable(e.target)) panelRef.current?.focus({ preventScroll: true }); }}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', outline: 'none', fontFamily: FUENTE, color: C.dark }}>
      <style>{CSS_LIENZO + cssPuntos(uno && uno.tipo === 'nota' && !uno.bloqueado ? uno.id : null)}</style>
      <div ref={canvasRef} onPointerDown={alPulsarLienzo} onDoubleClick={alDobleClic} onContextMenu={e => e.preventDefault()}
        onPointerMove={(e) => { if (e.pointerType === 'mouse' && canvasRef.current) punteroRef.current = puntoDelMundo(e); }}
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', touchAction: 'none', userSelect: 'none', WebkitUserSelect: 'none', backgroundColor: C.light,
          backgroundImage: rejilla.imagen, backgroundSize: rejilla.tamano, backgroundPosition: `${view.tx}px ${view.ty}px`,
          cursor: herramienta === 'mano' ? 'grab' : herramienta === 'seleccionar' ? 'default' : 'crosshair' }}>
        <div ref={marcoSelRef} style={{ display: 'none', position: 'absolute', zIndex: 3, pointerEvents: 'none', background: 'rgba(13, 102, 180, 0.06)', border: `1px solid ${AZUL_SEL}` }} />
        <div ref={contenidoRef} style={{ position: 'absolute', top: 0, left: 0, '--s': view.s, transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`, transformOrigin: '0 0' }}>
          {secciones.map(f => (
            <div key={f.id} ref={refNodo(f.id)} style={{ position: 'absolute', left: f.x, top: f.y, width: f.w, height: f.h, pointerEvents: 'none' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(241, 240, 232, 0.72)', borderRadius: RADIO, border: `1px solid ${C.lightGray}`,
                outline: sel.has(f.id) ? `${linea(1.5)} solid ${AZUL_SEL}` : 'none' }} />
              <div style={{ position: 'absolute', top: -32, left: 0, display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
                <div onPointerDown={arrastrar(f.id)} title={f.bloqueado ? 'Sección bloqueada' : 'Arrastrar la sección (mueve también lo que tiene dentro)'}
                  style={{ cursor: f.bloqueado ? 'default' : 'grab', color: C.gris600, display: 'flex', alignItems: 'center', touchAction: 'none', padding: 2 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="6" r="1.6" /><circle cx="7" cy="12" r="1.6" /><circle cx="7" cy="18" r="1.6" /><circle cx="14" cy="6" r="1.6" /><circle cx="14" cy="12" r="1.6" /><circle cx="14" cy="18" r="1.6" /></svg>
                </div>
                <span style={{ width: 3, height: 16, background: COLORES_SECCION[(f.color || 0) % COLORES_SECCION.length] }} />
                <input value={f.titulo} readOnly={!!f.bloqueado} aria-label="Título de la sección"
                  onChange={e => setSecciones(xs => xs.map(x => (x.id === f.id ? { ...x, titulo: e.target.value.slice(0, 200) } : x)))}
                  onPointerDown={e => { if (e.button === 0) e.stopPropagation(); }}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: C.dark, fontFamily: FUENTE, fontWeight: 600, fontSize: 14, width: Math.max(140, (f.titulo?.length || 8) * 9) }} />
              </div>
            </div>
          ))}
          {notas.map(n => {
            const Pieza = n.tipo === 'texto' ? TextoLibre : Nota;
            return (
              <Pieza key={n.id} nota={n} editando={editandoNota === n.id} refNodo={refNodo(n.id)} onPointerDown={arrastrar(n.id)}
                onDoubleClick={(e) => { e.stopPropagation(); editar(n.id); }}
                onCambiar={(t) => cambiarTexto(n.id, t)} onTerminar={() => terminarNota(n.id)} />
            );
          })}
          {caja && (
            <div ref={selCajaRef} style={{ position: 'absolute', left: caja.x1, top: caja.y1, width: caja.x2 - caja.x1, height: caja.y2 - caja.y1, pointerEvents: 'none' }}>
              {(elegidos.length > 1 || (uno && !secciones.includes(uno))) && <div style={{ position: 'absolute', inset: 0, outline: `${linea(1)} solid ${AZUL_SEL}` }} />}
              {asa('0%', '0%', 'no')}
              {asa('100%', '0%', 'ne')}
              {asa('0%', '100%', 'so')}
              {asa('100%', '100%', 'se')}
              {/* Barra contextual: a tamaño de pantalla (escala inversa), centrada encima de lo elegido */}
              {!menu && (
                <div ref={barraRef} style={{ position: 'absolute', left: '50%', top: hayEnTitulo ? -36 : 0, pointerEvents: 'auto', zIndex: 7,
                  transform: 'translate(-50%, -100%) scale(calc(1 / var(--s, 1))) translate(var(--bx, 0px), var(--by, -14px))', transformOrigin: '50% 100%' }}>
                  <BarraContextual estilo={estiloElegido} conNotas={conEstilo.some(x => x.tipo === 'nota')} conTextos={conEstilo.some(x => x.tipo === 'texto')}
                    conEstilo={conEstilo.length > 0} bloqueado={todoBloqueado}
                    onEstilo={aplicarEstilo} onBloquear={alternarBloqueo}
                    colores={{ nota: COLORES_NOTA, tinta: COLORES_TINTA }} fuentes={FUENTES} tamanos={TAMANOS}
                    acciones={[['Duplicar', 'Ctrl D', duplicar], null, ['Traer al frente', '⇧ ]', () => reordenar('frente')], ['Enviar al fondo', '⇧ [', () => reordenar('fondo')], null,
                      [todoBloqueado ? 'Desbloquear' : 'Bloquear', '⇧ L', alternarBloqueo], null, ['Eliminar', 'Supr', borrarSeleccion, true]]} />
                </div>
              )}
              {uno && uno.tipo === 'nota' && !uno.bloqueado && (
                <>
                  {punto('50%', 'calc(0% - 22px / var(--s, 1))', 'arriba')}
                  {punto('calc(100% + 22px / var(--s, 1))', '50%', 'derecha')}
                  {punto('50%', 'calc(100% + 22px / var(--s, 1))', 'abajo')}
                  {punto('calc(0% - 22px / var(--s, 1))', '50%', 'izquierda')}
                </>
              )}
            </div>
          )}
          <svg ref={guiasRef} style={{ position: 'absolute', left: 0, top: 0, width: 1, height: 1, overflow: 'visible', pointerEvents: 'none', zIndex: 6 }} />
        </div>
        {!notas.length && !secciones.length && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.gris600, pointerEvents: 'none', textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.dark, marginBottom: 6 }}>Tablero vacío</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 380 }}>Abajo tienes las notas (N), el texto (T) y las secciones (F). Doble clic en el vacío para escribir; clic derecho para el menú; ? para los atajos.</div>
          </div>
        )}
      </div>

      <PaletaIzquierda items={[...(paletaExtra || []), ['buscar', 'Buscar', () => setBuscando(b => !b)]]} onDeshacer={deshacer} onRehacer={rehacer} />
      {buscando && (
        <PanelBuscar elementos={[...secciones, ...notas]} onCerrar={() => { setBuscando(false); panelRef.current?.focus({ preventScroll: true }); }}
          onIr={(x) => { setSeleccion(new Set([x.id])); encuadrar([x], Math.max(viewRef.current.s, 0.5)); }} />
      )}
      <BarraInferior herramienta={herramienta} onHerramienta={setHerramienta} colorNota={colorNota} onColorNota={setColorNota} onSeccionTamano={seccionDeTamano} />
      <PildoraZoom textoRef={zoomTextoRef} porcentaje={`${Math.round(view.s * 100)} %`} onMenos={() => zoomPaso(-1)} onMas={() => zoomPaso(1)} onMenu={() => setMenuZoom(m => !m)} />
      {menuZoom && (
        <div onPointerDown={e => e.stopPropagation()} role="menu"
          style={{ position: 'absolute', right: 14, bottom: 66, zIndex: 5, minWidth: 240, padding: '6px 0', background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)', fontFamily: FUENTE }}>
          {[['Acercar', 'Ctrl +', () => zoomPaso(1)], ['Alejar', 'Ctrl −', () => zoomPaso(-1)], ['Zoom a 100 %', '⇧ 0', () => zoomA(1)],
            ['Ajustar a todo', '⇧ 1', ajustarATodo], ['Zoom a la selección', '⇧ 2', zoomASeleccion, !sel.size], ['Atajos de teclado', '?', () => setAtajos(true)]].map(([texto, atajo, accion, apagado]) => (
            <button key={texto} role="menuitem" disabled={apagado} onClick={() => { setMenuZoom(false); accion(); }}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 16, width: '100%', padding: '7px 14px', background: 'none', border: 'none',
                cursor: apagado ? 'default' : 'pointer', fontSize: 12.5, fontFamily: FUENTE, color: apagado ? C.midGray : C.dark }}
              onMouseEnter={e => { if (!apagado) e.currentTarget.style.background = C.light50; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
              <span>{texto}</span><span style={{ color: C.gris600, fontSize: 11.5 }}>{atajo}</span>
            </button>
          ))}
        </div>
      )}
      {menu && <MenuContextual x={menu.x} y={menu.y} items={itemsDelMenu()} onCerrar={cerrarMenu} />}
      {atajos && <VentanaAtajos onCerrar={() => { setAtajos(false); panelRef.current?.focus({ preventScroll: true }); }} />}
    </div>
  );
});

export default Lienzo;
