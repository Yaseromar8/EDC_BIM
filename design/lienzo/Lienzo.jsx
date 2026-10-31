// Lienzo — la pizarra compartida de ALEPHIA (docs/visor/57): la misma experiencia que se midió y afinó en el
// Tablero de View frente a los Tableros de ACC (docs/visor/54, 55), ahora como pieza común para Docs y View.
//
// Qué trae: cámara en el DOM (rueda ×1,10 hacia el cursor, espacio / clic derecho / botón central para mover,
// con inercia; zoom 1–400 %), rejilla por niveles, marco de selección, arrastre al píxel con imanes y líneas
// guía (Excalidraw, MIT), notas (con sus puntos laterales), texto, secciones (con tamaños), teclado (Supr,
// Ctrl+Z/Y, Ctrl+D, Ctrl+C/V, Ctrl+A, Esc, flechas, V H N T F, ⇧0 ⇧1 ⇧2, Ctrl ±) y barras flotantes.
//
// Contenido: { notas: [...], secciones: [...] }. La cámara es de cada persona (no viaja en el contenido):
// se guarda en el navegador con `claveCamara`. Cada cambio confirmado (un arrastre al soltar, un texto a los
// 350 ms) llama a `onCambio(contenido)`; el que guarda decide cuándo. `ref.aplicar(contenido)` pone un
// contenido que llega de fuera (otra persona guardó) sin contarlo como cambio propio.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { C, FUENTE, RADIO } from './tema';
import { Nota, TextoLibre, BarraInferior, PaletaIzquierda, PildoraZoom, BarraContextual } from './PiezasLienzo';
import { NOTA_LADO, NOTA_HUECO, medidaTexto, COLORES_NOTA, COLORES_TINTA, FUENTES, TAMANOS } from './notas';
import { prepararImanes, imantarArrastre, svgDeLineas } from './imanes';

const ZOOM_MIN = 0.01, ZOOM_MAX = 4;
const PASOS_ZOOM = [0.01, 0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4];
const FRICCION = 0.09;
const ARRASTRE_MIN = 4;
const AZUL_SEL = '#0D66B4';
const COLORES_SECCION = [C.orange, C.blue, C.green, C.gris700];
const linea = (px) => `calc(${px}px / var(--s, 1))`;
const CSS_LIENZO = `.tablero-nodo:hover { outline: ${linea(1.5)} solid rgba(13, 102, 180, 0.45); }
.lienzo-punto { opacity: 0; transition: opacity 120ms ease; } .lienzo-punto:hover { opacity: 1; }`;
// Los puntos de «nota al lado» solo aparecen al pasar el ratón por la nota elegida (como en ACC).
const cssPuntos = (id) => (id ? `[data-lienzo]:has([data-id="${id}"]:hover) .lienzo-punto { opacity: 1; }` : '');
const ESTILO = ['color', 'fuente', 'tamano', 'alinear', 'vertical'];
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const redondo = (v) => Math.round(v);
const mismoConjunto = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
const suave = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
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

const Lienzo = forwardRef(function Lienzo({ inicial = null, onCambio, claveCamara = '', paletaExtra = null }, ref) {
  const [notas, setNotas] = useState(() => inicial?.notas || []);
  const [secciones, setSecciones] = useState(() => inicial?.secciones || []);
  const [view, setView] = useState(() => (claveCamara && leerCamara(claveCamara)) || { tx: 80, ty: 80, s: 1 });
  const [sel, setSel] = useState(() => new Set());
  const [herramienta, setHerramienta] = useState('seleccionar');
  const [colorNota, setColorNota] = useState('amarillo');
  const [editandoNota, setEditandoNota] = useState(null);
  const [menuZoom, setMenuZoom] = useState(false);
  const notasRef = useRef(notas), seccionesRef = useRef(secciones), selRef = useRef(sel);
  const viewRef = useRef(view), confirmadaRef = useRef(view), confirmarTimer = useRef(0);
  const inerciaRef = useRef(0), animRef = useRef(0), espacioRef = useRef(false);
  const panelRef = useRef(null), canvasRef = useRef(null), contenidoRef = useRef(null);
  const marcoSelRef = useRef(null), zoomTextoRef = useRef(null), guiasRef = useRef(null), selCajaRef = useRef(null);
  const nodosRef = useRef(new Map()), refsDeNodo = useRef(new Map()), portapapeles = useRef(null);
  const onCambioRef = useRef(onCambio);
  onCambioRef.current = onCambio;
  useEffect(() => { notasRef.current = notas; }, [notas]);
  useEffect(() => { seccionesRef.current = secciones; }, [secciones]);
  useEffect(() => { selRef.current = sel; }, [sel]);
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
  const iniciarGesto = () => { clearTimeout(hist.current.t); confirmar(); hist.current.gesto = true; };
  const terminarGesto = () => { hist.current.gesto = false; confirmar(); };
  useImperativeHandle(ref, () => ({
    contenido: () => ({ notas: notasRef.current, secciones: seccionesRef.current }),
    // Contenido que llega de fuera (otra persona guardó y se fusionó): pasa a ser el actual, sin avisar, y el
    // historial empieza de nuevo desde él.
    aplicar: (c) => {
      const h = hist.current;
      clearTimeout(h.t);
      h.actual = { notas: c.notas || [], secciones: c.secciones || [] };
      h.pasado = []; h.futuro = [];      // deshacer no puede llevarse por delante lo que trajo otra persona
      notasRef.current = h.actual.notas; seccionesRef.current = h.actual.secciones;
      ponerContenido(h.actual, false);
    },
  }), []);

  // ── Cámara: en el DOM, React se entera al quedarse quieta ────────────────────────────────────────
  const pintarCamara = useCallback(() => {
    const v = viewRef.current, el = canvasRef.current, cont = contenidoRef.current;
    if (cont) { cont.style.transform = `translate(${v.tx}px, ${v.ty}px) scale(${v.s})`; cont.style.setProperty('--s', v.s); }
    if (el) { const g = rejillaDe(v); el.style.backgroundImage = g.imagen; el.style.backgroundSize = g.tamano; el.style.backgroundPosition = `${v.tx}px ${v.ty}px`; }
    if (zoomTextoRef.current) zoomTextoRef.current.textContent = `${Math.round(v.s * 100)} %`;
  }, []);
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
  const panear = (e) => {
    e.preventDefault(); pararCamara();
    const el = canvasRef.current, ini = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
    let ult = { x: e.clientX, y: e.clientY, t: performance.now() }, vel = { x: 0, y: 0 };
    if (el) el.style.cursor = 'grabbing';
    const onMove = (ev) => {
      moverCamara({ ...viewRef.current, tx: ini.tx + ev.clientX - ini.x, ty: ini.ty + ev.clientY - ini.y });
      const t = performance.now(), dt = Math.max(1, t - ult.t);
      vel = { x: 0.2 * vel.x + 0.8 * (ev.clientX - ult.x) / dt, y: 0.2 * vel.y + 0.8 * (ev.clientY - ult.y) / dt };
      ult = { x: ev.clientX, y: ev.clientY, t };
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      if (el) el.style.cursor = '';
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
  const rectangulo = (e, alMover, alSoltar) => {
    const el = canvasRef.current, marco = marcoSelRef.current, r = el.getBoundingClientRect();
    const a = { x: e.clientX - r.left, y: e.clientY - r.top };
    let b = a, activo = false;
    const onMove = (ev) => {
      b = { x: ev.clientX - r.left, y: ev.clientY - r.top };
      if (!activo && Math.hypot(b.x - a.x, b.y - a.y) < ARRASTRE_MIN) return;
      activo = true;
      const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y), x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y);
      Object.assign(marco.style, { display: 'block', left: `${x1}px`, top: `${y1}px`, width: `${x2 - x1}px`, height: `${y2 - y1}px` });
      const v = viewRef.current;
      alMover?.({ x1: (x1 - v.tx) / v.s, y1: (y1 - v.ty) / v.s, x2: (x2 - v.tx) / v.s, y2: (y2 - v.ty) / v.s });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      marco.style.display = 'none';
      const v = viewRef.current;
      alSoltar(activo, { x1: (Math.min(a.x, b.x) - v.tx) / v.s, y1: (Math.min(a.y, b.y) - v.ty) / v.s, x2: (Math.max(a.x, b.x) - v.tx) / v.s, y2: (Math.max(a.y, b.y) - v.ty) / v.s });
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
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
    const n = { id: uid(), tipo: 'nota', x: redondo(x), y: redondo(y), w: NOTA_LADO, h: NOTA_LADO, texto: '', color };
    setNotas(ns => [...ns, n]); setSeleccion(new Set([n.id])); setEditandoNota(n.id); setHerramienta('seleccionar');
  };
  const notaAlLado = (nota, dir) => {
    const d = { derecha: [nota.w + NOTA_HUECO, 0], izquierda: [-(nota.w + NOTA_HUECO), 0], abajo: [0, nota.h + NOTA_HUECO], arriba: [0, -(nota.h + NOTA_HUECO)] }[dir];
    crearNota(nota.x + d[0], nota.y + d[1], nota.color);
  };
  const crearTexto = (x, y) => {
    const t = { id: uid(), tipo: 'texto', x: redondo(x), y: redondo(y - 16), texto: '', ...medidaTexto('') };
    setNotas(ns => [...ns, t]); setSeleccion(new Set([t.id])); setEditandoNota(t.id); setHerramienta('seleccionar');
  };
  const cambiarTexto = (id, texto) => setNotas(ns => ns.map(n => (n.id !== id ? n : n.tipo === 'texto' ? { ...n, texto, ...medidaTexto(texto, n) } : { ...n, texto })));
  const terminarNota = (id) => { setEditandoNota(null); setNotas(ns => ns.filter(n => !(n.id === id && n.tipo === 'texto' && !n.texto.trim()))); };
  const nuevaSeccion = (f, titulo) => {
    const s = { id: uid(), titulo: titulo || `Sección ${seccionesRef.current.length + 1}`, color: seccionesRef.current.length % COLORES_SECCION.length, ...f };
    setSecciones(xs => [...xs, s]); setSeleccion(new Set([s.id])); setHerramienta('seleccionar');
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
  const alPulsarLienzo = (e) => {
    setMenuZoom(false);
    if (e.button === 1 || e.button === 2 || (e.button === 0 && (espacioRef.current || herramienta === 'mano'))) { panear(e); return; }
    if (e.button !== 0) return;
    if (herramienta === 'nota') { e.preventDefault(); const p = puntoDelMundo(e); crearNota(p.x - NOTA_LADO / 2, p.y - NOTA_LADO / 2); return; }
    if (herramienta === 'texto') { e.preventDefault(); const p = puntoDelMundo(e); crearTexto(p.x, p.y); return; }
    if (herramienta === 'seccion') { dibujarSeccion(e); return; }
    iniciarMarco(e);
  };
  const alDobleClic = (e) => { if (e.target === canvasRef.current && herramienta === 'seleccionar') { const p = puntoDelMundo(e); crearTexto(p.x, p.y); } };

  // ── Arrastrar en el DOM con imanes ───────────────────────────────────────────────────────────────
  const arrastrar = (pulsado) => (e) => {
    if (e.button !== 0 || espacioRef.current) return;
    e.preventDefault(); e.stopPropagation();
    if (!seleccionarAlPulsar(pulsado, e)) return;
    const ids = selRef.current.has(pulsado) ? selRef.current : new Set([pulsado]);
    const v = viewRef.current;
    const fs = seccionesRef.current.filter(f => ids.has(f.id));
    const dentro = (c, f) => { const cx = c.x + c.w / 2, cy = c.y + c.h / 2; return cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h; };
    const esSeccion = new Set(seccionesRef.current.map(f => f.id));
    const moviles = todos().filter(n => !n.bloqueado && (ids.has(n.id) || (!esSeccion.has(n.id) && fs.some(f => dentro(n, f)))));
    if (!moviles.length) return;
    const idsMov = new Set(moviles.map(n => n.id));
    const caja = [Math.min(...moviles.map(n => n.x)), Math.min(...moviles.map(n => n.y)), Math.max(...moviles.map(n => n.x + n.w)), Math.max(...moviles.map(n => n.y + n.h))];
    const r = canvasRef.current.getBoundingClientRect();
    const vis = [-v.tx / v.s, -v.ty / v.s, (r.width - v.tx) / v.s, (r.height - v.ty) / v.s];
    const cache = prepararImanes(todos().filter(n => !idsMov.has(n.id) && n.x < vis[2] && n.x + n.w > vis[0] && n.y < vis[3] && n.y + n.h > vis[1]).map(n => [n.x, n.y, n.x + n.w, n.y + n.h]));
    const ini = { x: e.clientX, y: e.clientY };
    let movido = false, off = { x: 0, y: 0 }, elementos = [];
    const onMove = (ev) => {
      if (!movido) {
        if (Math.hypot(ev.clientX - ini.x, ev.clientY - ini.y) < ARRASTRE_MIN) return;
        movido = true; iniciarGesto();
        elementos = [...idsMov].map(id => nodosRef.current.get(id)).filter(Boolean);
        for (const el of elementos) el.style.willChange = 'transform';
      }
      let dx = (ev.clientX - ini.x) / v.s, dy = (ev.clientY - ini.y) / v.s, lineas = [];
      if (!ev.ctrlKey && !ev.metaKey) ({ dx, dy, lineas } = imantarArrastre(cache, caja, dx, dy, v.s));
      off = { x: redondo(dx), y: redondo(dy) };
      const t = `translate(${dx}px, ${dy}px)`;
      for (const el of elementos) el.style.transform = t;
      if (selCajaRef.current) selCajaRef.current.style.transform = t;
      if (guiasRef.current) guiasRef.current.innerHTML = lineas.length ? svgDeLineas(lineas, v.s) : '';
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
      if (!movido) return;
      const mover = (n) => (idsMov.has(n.id) ? { ...n, x: n.x + off.x, y: n.y + off.y } : n);
      flushSync(() => { setNotas(xs => xs.map(mover)); setSecciones(xs => xs.map(mover)); });
      for (const el of elementos) { el.style.transform = ''; el.style.willChange = ''; }
      if (selCajaRef.current) selCajaRef.current.style.transform = '';
      if (guiasRef.current) guiasRef.current.innerHTML = '';
      terminarGesto();
    };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };
  const redimensionarSeccion = (id) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const f = seccionesRef.current.find(x => x.id === id), v = viewRef.current;
    if (!f || f.bloqueado) return;
    const ini = { x: e.clientX, y: e.clientY, w: f.w, h: f.h };
    iniciarGesto();
    const onMove = (ev) => setSecciones(xs => xs.map(x => (x.id === id ? { ...x, w: redondo(Math.max(ini.w + (ev.clientX - ini.x) / v.s, 160)), h: redondo(Math.max(ini.h + (ev.clientY - ini.y) / v.s, 120)) } : x)));
    const onUp = () => { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); terminarGesto(); };
    window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
  };

  // ── Acciones de teclado ──────────────────────────────────────────────────────────────────────────
  const borrarSeleccion = () => {
    const ids = selRef.current;
    if (!ids.size) return;
    const fuera = (x) => ids.has(x.id) && !x.bloqueado;
    setNotas(ns => ns.filter(n => !fuera(n))); setSecciones(fs => fs.filter(f => !fuera(f)));
    setSeleccion(new Set(todos().filter(x => ids.has(x.id) && x.bloqueado).map(x => x.id)));
  };
  // Barra contextual: estilo de notas y textos, bloqueo y orden de dibujo.
  const aplicarEstilo = (patch) => {
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
    const elegidosAhora = todos().filter(x => ids.has(x.id));
    const bloquear = !elegidosAhora.every(x => x.bloqueado);
    const poner = (x) => (ids.has(x.id) ? { ...x, bloqueado: bloquear || undefined } : x);
    setNotas(ns => ns.map(poner)); setSecciones(fs => fs.map(poner));
    setEditandoNota(null);
  };
  const ordenar = (alFrente) => {
    const ids = selRef.current;
    const mover = (xs) => { const a = xs.filter(x => ids.has(x.id)), b = xs.filter(x => !ids.has(x.id)); return alFrente ? [...b, ...a] : [...a, ...b]; };
    setNotas(mover); setSecciones(mover);
  };
  const editar = (id) => { if (!notasRef.current.find(n => n.id === id)?.bloqueado) setEditandoNota(id); };
  const copiar = () => {
    const ids = selRef.current;
    if (!ids.size) return false;
    portapapeles.current = { notas: notasRef.current.filter(n => ids.has(n.id)), secciones: seccionesRef.current.filter(f => ids.has(f.id)), veces: 0 };
    return true;
  };
  const pegar = () => {
    const p = portapapeles.current;
    if (!p || (!p.notas.length && !p.secciones.length)) return;
    p.veces += 1;
    const d = 32 * p.veces;
    const nn = p.notas.map(n => ({ ...n, id: uid(), x: n.x + d, y: n.y + d }));
    const nf = p.secciones.map(f => ({ ...f, id: uid(), x: f.x + d, y: f.y + d }));
    if (nn.length) setNotas(ns => [...ns, ...nn]);
    if (nf.length) setSecciones(fs => [...fs, ...nf]);
    setSeleccion(new Set([...nn, ...nf].map(x => x.id)));
  };
  const duplicar = () => { const antes = portapapeles.current; if (!copiar()) return; pegar(); portapapeles.current = antes; };
  const empujar = (k, grande) => {
    const ids = selRef.current;
    if (!ids.size) return;
    const p = grande ? 10 : 1;
    const dx = k === 'arrowleft' ? -p : k === 'arrowright' ? p : 0, dy = k === 'arrowup' ? -p : k === 'arrowdown' ? p : 0;
    const mover = (n) => (ids.has(n.id) && !n.bloqueado ? { ...n, x: n.x + dx, y: n.y + dy } : n);
    setNotas(ns => ns.map(mover)); setSecciones(fs => fs.map(mover));
  };
  const alTeclear = (e) => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    // Un diálogo encima del tablero se queda sus teclas; el que CONTIENE al tablero (Docs lo abre en uno) no.
    const dialogo = e.target.closest?.('[role="dialog"]');
    if (dialogo && !dialogo.contains(panelRef.current)) return;
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
    else if (ctrl && k === 'a') setSeleccion(new Set(todos().map(x => x.id)));
    else if (ctrl && e.shiftKey && k === 'l') alternarBloqueo();
    else if (ctrl && (k === '=' || k === '+')) zoomPaso(1);
    else if (ctrl && k === '-') zoomPaso(-1);
    else if (e.shiftKey && e.code === 'Digit0') zoomA(1);
    else if (e.shiftKey && e.code === 'Digit1') ajustarATodo();
    else if (e.shiftKey && e.code === 'Digit2') zoomASeleccion();
    else if (k.startsWith('arrow') && !ctrl) empujar(k, e.shiftKey);
    else if (!ctrl && !e.altKey && { v: 1, h: 1, n: 1, t: 1, f: 1 }[k]) setHerramienta({ v: 'seleccionar', h: 'mano', n: 'nota', t: 'texto', f: 'seccion' }[k]);
    else if (k === 'enter' && selRef.current.size === 1 && notasRef.current.some(n => selRef.current.has(n.id))) editar([...selRef.current][0]);
    else hecho = false;
    if (hecho) { e.preventDefault(); e.stopPropagation(); }
  };
  const alSoltarTecla = (e) => { if (e.key === ' ') { espacioRef.current = false; if (canvasRef.current) canvasRef.current.style.cursor = ''; } };
  const teclado = useRef(null);
  teclado.current = { alTeclear, alSoltarTecla };
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true });
    const aqui = () => { const a = document.activeElement; return !a || a === document.body || !!panelRef.current?.contains(a); };
    const abajo = (e) => { if (aqui()) teclado.current.alTeclear(e); };
    const arriba = (e) => { if (aqui()) teclado.current.alSoltarTecla(e); };
    window.addEventListener('keydown', abajo); window.addEventListener('keyup', arriba);
    return () => { window.removeEventListener('keydown', abajo); window.removeEventListener('keyup', arriba); };
  }, []);

  // ── Dibujo ───────────────────────────────────────────────────────────────────────────────────────
  const rejilla = rejillaDe(view);
  const elegidos = [...secciones, ...notas].filter(x => sel.has(x.id));
  const caja = elegidos.length && !editandoNota ? {
    x1: Math.min(...elegidos.map(x => x.x)), y1: Math.min(...elegidos.map(x => x.y)),
    x2: Math.max(...elegidos.map(x => x.x + x.w)), y2: Math.max(...elegidos.map(x => x.y + x.h)),
  } : null;
  const uno = elegidos.length === 1 ? elegidos[0] : null;
  const conEstilo = elegidos.filter(x => x.tipo === 'nota' || x.tipo === 'texto');
  const primero = conEstilo[0] || {};
  const estiloElegido = Object.fromEntries(ESTILO.map(k => [k, conEstilo.every(x => x[k] === primero[k]) ? primero[k] : undefined]));
  const hayEnTitulo = elegidos.some(x => secciones.includes(x));
  const asa = (left, top, cursor, onDown) => (
    <div onPointerDown={onDown || undefined} style={{ position: 'absolute', left, top, width: linea(9), height: linea(9), transform: 'translate(-50%, -50%)',
      background: '#fff', border: `${linea(1.5)} solid ${AZUL_SEL}`, boxSizing: 'border-box', borderRadius: linea(1.5), pointerEvents: onDown ? 'auto' : 'none', cursor }} />
  );
  const punto = (left, top, dir) => (
    <div className="lienzo-punto" onPointerDown={e => { e.stopPropagation(); e.preventDefault(); notaAlLado(uno, dir); }} title="Nota al lado"
      style={{ position: 'absolute', left, top, width: linea(14), height: linea(14), transform: 'translate(-50%, -50%)', borderRadius: '50%',
        background: 'rgba(13, 102, 180, 0.16)', border: `${linea(1.5)} solid ${AZUL_SEL}`, boxSizing: 'border-box', pointerEvents: 'auto', cursor: 'pointer' }} />
  );

  return (
    <div ref={panelRef} tabIndex={-1} data-escape-propio data-lienzo
      onPointerDownCapture={(e) => { if (!e.target.closest?.('input, textarea, select, [contenteditable]')) panelRef.current?.focus({ preventScroll: true }); }}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', outline: 'none', fontFamily: FUENTE, color: C.dark }}>
      <style>{CSS_LIENZO + cssPuntos(uno && uno.tipo === 'nota' && !uno.bloqueado ? uno.id : null)}</style>
      <div ref={canvasRef} onPointerDown={alPulsarLienzo} onDoubleClick={alDobleClic} onContextMenu={e => e.preventDefault()}
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
                <div onPointerDown={arrastrar(f.id)} title="Arrastrar la sección (mueve también lo que tiene dentro)"
                  style={{ cursor: 'grab', color: C.gris600, display: 'flex', alignItems: 'center', touchAction: 'none', padding: 2 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="7" cy="6" r="1.6" /><circle cx="7" cy="12" r="1.6" /><circle cx="7" cy="18" r="1.6" /><circle cx="14" cy="6" r="1.6" /><circle cx="14" cy="12" r="1.6" /><circle cx="14" cy="18" r="1.6" /></svg>
                </div>
                <span style={{ width: 3, height: 16, background: COLORES_SECCION[(f.color || 0) % COLORES_SECCION.length] }} />
                <input value={f.titulo} onChange={e => setSecciones(xs => xs.map(x => (x.id === f.id ? { ...x, titulo: e.target.value } : x)))}
                  onPointerDown={e => e.stopPropagation()}
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
              {asa('0%', '0%', 'default')}
              {asa('100%', '0%', 'default')}
              {asa('0%', '100%', 'default')}
              {asa('100%', '100%', uno && secciones.includes(uno) ? 'nwse-resize' : 'default', uno && secciones.includes(uno) ? redimensionarSeccion(uno.id) : null)}
              {/* Barra contextual: a tamaño de pantalla (escala inversa), centrada encima de lo elegido */}
              <div style={{ position: 'absolute', left: '50%', top: hayEnTitulo ? -36 : 0, pointerEvents: 'auto', zIndex: 7,
                transform: 'translate(-50%, -100%) scale(calc(1 / var(--s, 1))) translateY(-14px)', transformOrigin: '50% 100%' }}>
                <BarraContextual estilo={estiloElegido} conNotas={conEstilo.some(x => x.tipo === 'nota')} conTextos={conEstilo.some(x => x.tipo === 'texto')}
                  conEstilo={conEstilo.length > 0} bloqueado={elegidos.every(x => x.bloqueado)}
                  onEstilo={aplicarEstilo} onBloquear={alternarBloqueo}
                  colores={{ nota: COLORES_NOTA, tinta: COLORES_TINTA }} fuentes={FUENTES} tamanos={TAMANOS}
                  acciones={[['Duplicar', 'Ctrl D', duplicar], null, ['Traer al frente', '', () => ordenar(true)], ['Enviar al fondo', '', () => ordenar(false)], null,
                    [elegidos.every(x => x.bloqueado) ? 'Desbloquear' : 'Bloquear', 'Ctrl ⇧ L', alternarBloqueo], null, ['Eliminar', 'Supr', borrarSeleccion, true]]} />
              </div>
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
            <div style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 360 }}>Abajo tienes las notas (N), el texto (T) y las secciones (F). Doble clic en el vacío para escribir.</div>
          </div>
        )}
      </div>

      <PaletaIzquierda items={paletaExtra || []} onDeshacer={deshacer} onRehacer={rehacer} />
      <BarraInferior herramienta={herramienta} onHerramienta={setHerramienta} colorNota={colorNota} onColorNota={setColorNota} onSeccionTamano={seccionDeTamano} />
      <PildoraZoom textoRef={zoomTextoRef} porcentaje={`${Math.round(view.s * 100)} %`} onMenos={() => zoomPaso(-1)} onMas={() => zoomPaso(1)} onMenu={() => setMenuZoom(m => !m)} />
      {menuZoom && (
        <div onPointerDown={e => e.stopPropagation()} role="menu"
          style={{ position: 'absolute', right: 14, bottom: 66, zIndex: 5, minWidth: 240, padding: '6px 0', background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)', fontFamily: FUENTE }}>
          {[['Acercar', 'Ctrl +', () => zoomPaso(1)], ['Alejar', 'Ctrl −', () => zoomPaso(-1)], ['Zoom a 100 %', '⇧ 0', () => zoomA(1)],
            ['Ajustar a todo', '⇧ 1', ajustarATodo], ['Zoom a la selección', '⇧ 2', zoomASeleccion, !sel.size]].map(([texto, atajo, accion, apagado]) => (
            <button key={texto} role="menuitem" disabled={apagado} onClick={() => { setMenuZoom(false); accion(); }}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 16, width: '100%', padding: '7px 14px', background: 'none', border: 'none',
                cursor: apagado ? 'default' : 'pointer', fontSize: 12.5, fontFamily: FUENTE, color: apagado ? C.midGray : C.dark }}
              onMouseEnter={e => { if (!apagado) e.currentTarget.style.background = C.light50; }} onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
              <span>{texto}</span><span style={{ color: C.gris600, fontSize: 11.5 }}>{atajo}</span>
            </button>
          ))}
          <div style={{ borderTop: `1px solid ${C.light50}`, margin: '4px 0 0', padding: '8px 14px 4px', fontSize: 11, lineHeight: 1.6, color: C.gris600 }}>
            Arrastrar el fondo: seleccionar · Doble clic: texto<br />Espacio o clic derecho + arrastrar: mover<br />V seleccionar · H mano · N nota · T texto · F sección
          </div>
        </div>
      )}
    </div>
  );
});

export default Lienzo;
