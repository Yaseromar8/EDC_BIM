/**
 * PdfCompareView — «Comparar versiones» de un plano PDF (3-nov-2026, a pedido del dueño: «muy profesional, así como
 * ACC, Procore, pero nuestro»).
 *
 * LO ESTÁNDAR (medido en Autodesk Build «Compare Sheets» y Procore «Compare Drawings»):
 *   - elegir las dos versiones; superpuesto con rojo = solo en la anterior, azul = solo en la nueva, el resto igual;
 *   - apagar los colores o cada versión; lado a lado con zoom vinculado; cortina para pasar de una a otra;
 *   - alinear a mano cuando una versión viene corrida (arrastrar, o las flechas del teclado).
 * LO NUESTRO:
 *   - los CAMBIOS se encuentran solos y se encierran en nubes de revisión numeradas, con su lista (dónde está, si se
 *     añadió, se quitó o se modificó) para recorrerlos uno a uno (N / Mayús+N);
 *   - lo que no cambió se ATENÚA a voluntad para que salte lo que sí;
 *   - la paleta oficial: rojo #B93535, azul #507294, Dark; la nube activa en el naranja del indicador.
 *
 * La matemática (tinta, tolerancia de un píxel, zonas, nube, encuadre) vive en utils/compararVersiones.js y tiene su
 * banco en pruebas/compararVersiones.prueba.mjs. Aquí solo se dibuja y se navega.
 *
 * Las dos versiones se dibujan UNA vez por página a una «hoja de comparación» de hasta 3.600 px de lado (9 MP),
 * la nueva a su tamaño y la anterior AL MISMO ANCHO (si el papel cambió, se compara igual). Zoom y desplazamiento
 * son transformaciones CSS sobre esos lienzos: no se vuelve a dibujar al moverse.
 */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { abrirPdf, pdfjsLib } from '../utils/pdfjs';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { crearFuente } from '../utils/fuenteDeMosaico';
import {
  tintaDe, dilatar, componer, detectarAfinando, encuadrar, zoomEn, UMBRAL_TINTA,
  cambiosDeTexto, juntarConTexto, textoDelCambio,
} from '../utils/compararVersiones';
import './PdfCompareView.css';

const LADO_MAX = 3600;
const PIXELES_MAX = 9e6;
// CÓMO SE RECONOCE CADA CAMBIO (3-nov-2026, el dueño: «¿cómo reconocerá que fue agregado, modificado o eliminado?»).
// Un solo código en la hoja, la lista y la leyenda, con los colores del propio dibujo: lo añadido en el azul de la nueva,
// lo quitado en el rojo de la anterior (y con trazo discontinuo), lo modificado en Dark; y un signo, para quien no
// distinga colores o mire en cortina o lado a lado, donde el dibujo no va teñido.
const TIPO = {
  'añadido': { nombre: 'Añadido', plural: 'Añadidos', signo: '+', clase: 'anadido' },
  quitado: { nombre: 'Quitado', plural: 'Quitados', signo: '−', clase: 'quitado' },
  modificado: { nombre: 'Modificado', plural: 'Modificados', signo: '±', clase: 'modificado' },
};
const tipoDe = (z) => TIPO[z.tipo] || TIPO.modificado;

async function urlFirmada(gcsUrn, obra) {
  const r = await apiFetch(`${API}/api/docs/signed-url?urn=${encodeURIComponent(gcsUrn)}&model_urn=${encodeURIComponent(obra)}`);
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.success) throw new Error(d.error || 'No se pudo abrir la versión.');
  return d.url;
}

function nuevoLienzo(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.className = 'cmp-canvas';
  return c;
}

// Los textos de la página, en píxeles de la hoja: { s, x, y, w, h } (y = arriba del texto).
async function textosDe(pdf, numero, escala) {
  if (!pdf || numero > pdf.numPages) return [];
  const pagina = await pdf.getPage(numero);
  const vp = pagina.getViewport({ scale: escala });
  const contenido = await pagina.getTextContent();
  return contenido.items.filter(i => i.str && i.str.trim()).map(i => {
    const t = pdfjsLib.Util.transform(vp.transform, i.transform);
    const alto = Math.hypot(t[2], t[3]) || 1;
    return { s: i.str, x: t[4], y: t[5] - alto, w: Math.max(1, i.width * escala), h: alto };
  });
}

// ── LA FUENTE DE UNA VERSIÓN: su MOSAICO o su PDF ─────────────────────────────────────────────────────────────────
//
// Dibujar en el navegador un plano de CAD pesado con pdf.js cuesta 30–40 s (medido en el banco con DR-803, igual que
// el lector en sep-2026). Por eso, como el lector, la comparación usa las TESELAS que el servidor prepara al subir
// (/api/docs/mosaico; niveles de 1.500, 3.000, 6.000 y 12.000 px de lado mayor): la hoja base sale del nivel z1 y la
// zona nítida del nivel que pida el zoom. El mosaico es solo de la primera página; las demás, o una versión sin
// mosaico, se dibujan con pdf.js. Una fuente sabe dibujar un TROZO de la hoja de comparación (ancho W) en un lienzo.

async function preguntarMosaico(cuerpo, timeoutMs) {
  try {
    const r = await apiFetch(`${API}/api/docs/mosaico`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), timeoutMs,
    });
    const d = await r.json();
    return r.ok && d && d.success ? d : null;
  } catch { return null; }
}

// Una tesela que se pueda LEER (getImageData). El lector las pone en <img> sin CORS, y el navegador puede tener esa
// copia guardada: pedida otra vez en modo CORS, la copia sin cabeceras se rechaza. Por eso se trae con fetch en modo
// CORS y, si falla, una vez más saltando la caché (el bucket declara CORS: apply_cors.py).
async function imagen(url) {
  let r;
  try { r = await fetch(url, { mode: 'cors' }); }
  catch { r = await fetch(url, { mode: 'cors', cache: 'reload' }); }
  if (!r.ok) throw new Error('No se pudo traer una tesela.');
  return createImageBitmap(await r.blob());
}

// Espera a tener la URL de esas teselas (las de niveles profundos las dibuja el servidor la primera vez).
function asegurarUrls(fuente, z, lista, tope = 40000) {
  const faltan = () => lista.filter(([x, y]) => !fuente.url(z, x, y));
  if (!faltan().length) return Promise.resolve();
  return new Promise((listo) => {
    const reloj = setTimeout(listo, tope);
    fuente.pedir(z, faltan(), () => { if (!faltan().length) { clearTimeout(reloj); listo(); } });
  });
}

function fuenteDeMosaico(fuente, man) {
  const n1 = man.niveles[1] || man.niveles[0];
  return {
    tipo: 'mosaico',
    ancho: n1.ancho, alto: n1.alto,
    // El trozo (hx, hy, hw, hh) de una hoja de ancho W, en un lienzo cw × ch.
    async trozo(W, hx, hy, hw, hh, cw, ch) {
      const c = nuevoLienzo(cw, ch);
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cw, ch);
      const k = cw / hw;                                           // px del lienzo por px de hoja
      const nivel = man.niveles.find(nv => nv.ancho / W >= k * 0.95) || man.niveles[man.niveles.length - 1];
      const r = nivel.ancho / W;                                   // px del nivel por px de hoja
      const T = man.tesela || 512;
      const lx = hx * r, ly = hy * r, lw = hw * r, lh = hh * r;
      const lista = [];
      for (let y = Math.max(0, Math.floor(ly / T)); y <= Math.min(nivel.filas - 1, Math.floor((ly + lh) / T)); y++) {
        for (let x = Math.max(0, Math.floor(lx / T)); x <= Math.min(nivel.columnas - 1, Math.floor((lx + lw) / T)); x++) lista.push([x, y]);
      }
      await asegurarUrls(fuente, nivel.z, lista);
      const e = cw / lw;                                           // px del lienzo por px del nivel
      await Promise.all(lista.map(async ([x, y]) => {
        const url = fuente.url(nivel.z, x, y);
        if (!url) return;
        const img = await imagen(url);
        ctx.drawImage(img, (x * T - lx) * e, (y * T - ly) * e, img.width * e, img.height * e);
      }));
      return c;
    },
  };
}

async function fuenteDePdf(pdf, numero) {
  if (!pdf || numero > pdf.numPages) return { tipo: 'vacia', ancho: 0, alto: 0, async trozo(W, hx, hy, hw, hh, cw, ch) { return blanco(cw, ch); } };
  const pagina = await pdf.getPage(numero);
  const base = pagina.getViewport({ scale: 1 });
  return {
    tipo: 'pdf', ancho: base.width, alto: base.height,
    async trozo(W, hx, hy, hw, hh, cw, ch) {
      const c = blanco(cw, ch);
      const k = cw / hw;
      await pagina.render({ canvasContext: c.getContext('2d'), viewport: pagina.getViewport({ scale: (W / base.width) * k }),
        transform: [1, 0, 0, 1, -hx * k, -hy * k] }).promise;
      return c;
    },
  };
}

function blanco(w, h) {
  const c = nuevoLienzo(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  return c;
}

// Un lienzo con la tinta de una versión en un color: para alinear «en vivo» (multiplicar dos capas teñidas).
function tenido(tinta, w, h, [r, g, b]) {
  const c = nuevoLienzo(w, h);
  const img = c.getContext('2d').createImageData(w, h);
  const d = img.data;
  for (let i = 0, j = 0; i < tinta.length; i++, j += 4) {
    const k = tinta[i] > UMBRAL_TINTA / 2 ? tinta[i] / 255 : 0;
    d[j] = 255 + (r - 255) * k; d[j + 1] = 255 + (g - 255) * k; d[j + 2] = 255 + (b - 255) * k; d[j + 3] = 255;
  }
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

// Las miniaturas de la lista: cada zona recortada del superpuesto, a 96 × 64.
function miniaturasDe(lienzo, zonas) {
  const m = {};
  const tw = 96, th = 64;
  for (const z of zonas.slice(0, 60)) {
    const c = document.createElement('canvas');
    c.width = tw; c.height = th;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, tw, th);
    const k = Math.min(tw / z.w, th / z.h);
    ctx.drawImage(lienzo, z.x, z.y, z.w, z.h, (tw - z.w * k) / 2, (th - z.h * k) / 2, z.w * k, z.h * k);
    m[z.n] = c.toDataURL('image/png');
  }
  return m;
}

// Pone un <canvas> ya hecho dentro de este div (los lienzos son grandes: se mueven, no se copian).
function Lienzo({ canvas, style, className }) {
  const caja = useRef(null);
  useLayoutEffect(() => {
    const el = caja.current;
    if (!el || !canvas) return undefined;
    el.appendChild(canvas);
    return () => { if (canvas.parentNode === el) el.removeChild(canvas); };
  }, [canvas]);
  return <div ref={caja} className={className} style={style} />;
}

const fecha = (iso) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
};

const Ico = ({ children, size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

/** La caja (x, y, w, h) en píxeles de una geometría de marca, con `aPx(x, y)` de puntos del PDF a píxeles. */
function cajaDeGeometria(g, aPx) {
  if (!g) return null;
  let pts = [];
  if (Array.isArray(g.points)) pts = g.points.map(p => aPx(p[0], p[1]));
  else if (g.p1 && g.p2) pts = [aPx(g.p1[0], g.p1[1]), aPx(g.p2[0], g.p2[1])];
  else if (g.w != null && g.h != null) pts = [aPx(g.x, g.y), aPx(g.x + g.w, g.y + g.h)];
  else if (g.p) { const c = aPx(g.p[0], g.p[1]); pts = [[c[0] - 20, c[1] - 20], [c[0] + 20, c[1] + 20]]; }
  if (!pts.length) return null;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(4, Math.max(...xs) - x), h: Math.max(4, Math.max(...ys) - y) };
}

// `enfoque` { pagina, geometria } (doc 23 §6.7): abrir encuadrado en una NUBE de una incidencia, con su zona marcada,
// para decidir si quedó levantada. `geometria` en puntos del PDF, como la guardan las marcas.
export default function PdfCompareView({ fileName, nodeId = null, versiones = [], versionA, versionB, projectPrefix, onClose,
                                         enfoque = null }) {
  const lista = useMemo(() => {
    const todas = versiones.length ? versiones : [versionB, versionA].filter(Boolean);
    return [...todas].sort((p, q) => (q.version_number || 0) - (p.version_number || 0));
  }, [versiones, versionA, versionB]);
  const vigente = lista[0]?.version_number;
  const [idA, setIdA] = useState(String(versionA?.id ?? lista[1]?.id ?? ''));
  const [idB, setIdB] = useState(String(versionB?.id ?? lista[0]?.id ?? ''));
  const vA = lista.find(v => String(v.id) === idA) || versionA;
  const vB = lista.find(v => String(v.id) === idB) || versionB;
  const etiqueta = (v) => (v ? `V${v.version_number || 1}` : '—');

  const [pagina, setPagina] = useState(enfoque?.pagina || 1);
  const [zonaDeLaNube, setZonaDeLaNube] = useState(null);   // { x, y, w, h } en píxeles de la hoja comparada
  const [paginas, setPaginas] = useState(1);
  const [modo, setModo] = useState('superpuesto');      // 'superpuesto' | 'cortina' | 'lado'
  const [capas, setCapas] = useState({ colores: true, verA: true, verB: true, atenuar: 0.35, nubes: true });
  const [desfase, setDesfase] = useState({ dx: 0, dy: 0 });
  const [alineando, setAlineando] = useState(false);
  const [vista, setVista] = useState({ s: 0.2, x: 0, y: 0 });
  const [vistaA, setVistaA] = useState(null);           // lado a lado SIN vincular: la vista de la izquierda
  const [enlazado, setEnlazado] = useState(true);
  const [cortina, setCortina] = useState(0.5);
  const [hoja, setHoja] = useState(null);               // { w, h, a, b, dilA, dilB, fA, fB, lienzoA, lienzoB, lienzoC, tA, tB, faltaA, faltaB }
  const [textos, setTextos] = useState(null);           // { a, b }: llegan después, con el PDF
  const [cambios, setCambios] = useState([]);
  const [miniaturas, setMiniaturas] = useState({});
  const [activo, setActivo] = useState(null);
  const [filtro, setFiltro] = useState('todos');        // 'todos' | 'añadido' | 'quitado' | 'modificado'
  const [estado, setEstado] = useState({ que: 'cargando', texto: 'Abriendo las dos versiones…' });
  // La lista abierta en pantallas anchas; en una tableta o un teléfono taparía la hoja: empieza cerrada.
  const [panel, setPanel] = useState(() => typeof window === 'undefined' || window.innerWidth > 900);
  // NITIDEZ AL ACERCAR: la zona visible, vuelta a dibujar a la resolución de la pantalla al dejar de moverse.
  const [detalle, setDetalle] = useState(null);         // { x, y, w, h, f, A, B, C, ta, tb, dA, dB, cw, ch, ox, oy }
  const [afinando, setAfinando] = useState(false);
  const turno = useRef(0);

  const visor = useRef(null);
  const visorA = useRef(null);
  const [anchoVisor, setAnchoVisor] = useState(800);   // para la cortina, que se dibuja según el ancho del visor
  useEffect(() => {
    const el = visor.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setAnchoVisor(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const pdfs = useRef(new Map());
  const primeraVista = useRef(true);

  const mosaicos = useRef(new Map());
  const mosaicoDe = useCallback((v) => {
    const clave = String(v.id);
    if (!nodeId) return Promise.resolve(null);
    if (!mosaicos.current.has(clave)) {
      const f = crearFuente({ node_id: nodeId, version_id: v.id }, preguntarMosaico, { reintentosSiSePrepara: 0 });
      mosaicos.current.set(clave, f.manifiesto(() => true).then(man => (man && man.niveles?.length ? fuenteDeMosaico(f, man) : null)));
    }
    return mosaicos.current.get(clave);
  }, [nodeId]);

  const pdfDe = useCallback((v) => {
    const clave = String(v.id);
    if (!pdfs.current.has(clave)) {
      pdfs.current.set(clave, urlFirmada(v.gcs_urn, projectPrefix).then(url => abrirPdf({ url }).promise));
    }
    return pdfs.current.get(clave);
  }, [projectPrefix]);

  // ── 1 · Dibujar las dos versiones de la página (una vez por página y par de versiones) ──
  // Primera página: del mosaico si las dos lo tienen (segundos); si no, o en otras páginas, con pdf.js. Los textos se
  // leen después del PDF, sin dibujarlo, y se suman a la lista de cambios cuando llegan.
  useEffect(() => {
    if (!vA || !vB) return undefined;
    let vivo = true;
    (async () => {
      setEstado({ que: 'cargando', texto: `Trayendo ${etiqueta(vA)} y ${etiqueta(vB)}…` });
      setHoja(null); setTextos(null); setDetalle(null); setCambios([]); setActivo(null); setMiniaturas({}); setFiltro('todos');
      try {
        let fA = null, fB = null;
        if (pagina === 1) {
          const [ma, mb] = await Promise.all([mosaicoDe(vA), mosaicoDe(vB)]);
          if (ma && mb) { fA = ma; fB = mb; }
        }
        let pa = null, pb = null;
        if (!fA) {
          setEstado({ que: 'cargando', texto: `Dibujando ${etiqueta(vA)} y ${etiqueta(vB)}…` });
          [pa, pb] = await Promise.all([pdfDe(vA), pdfDe(vB)]);
          if (!vivo) return;
          setPaginas(Math.max(pa.numPages, pb.numPages));
          [fA, fB] = await Promise.all([fuenteDePdf(pa, pagina), fuenteDePdf(pb, pagina)]);
        }
        if (!vivo) return;
        const ref = fB.ancho ? fB : fA;
        const s = fB.tipo === 'mosaico' ? 1
          : Math.min(LADO_MAX / Math.max(ref.ancho, ref.alto), Math.sqrt(PIXELES_MAX / (ref.ancho * ref.alto)));
        const w = Math.round(ref.ancho * s);
        const h = Math.max(Math.round(ref.alto * s), fA.ancho ? Math.round(fA.alto * (w / fA.ancho)) : 0);
        const leer = (c) => c.getContext('2d').getImageData(0, 0, w, h).data;
        let da, db, a, b;
        try {
          [da, db] = await Promise.all([fA.trozo(w, 0, 0, w, h, w, h), fB.trozo(w, 0, 0, w, h, w, h)]);
          a = tintaDe(leer(da)); b = tintaDe(leer(db));
        } catch (e) {
          // Teselas que no se pueden leer (p. ej. un bucket sin CORS): se vuelve a pdf.js, sin más.
          if (fA.tipo !== 'mosaico') throw e;
          mosaicos.current.clear();
          if (vivo) setEstado({ que: 'cargando', texto: 'Dibujando con el PDF…' });
          [pa, pb] = await Promise.all([pdfDe(vA), pdfDe(vB)]);
          [fA, fB] = await Promise.all([fuenteDePdf(pa, pagina), fuenteDePdf(pb, pagina)]);
          [da, db] = await Promise.all([fA.trozo(w, 0, 0, w, h, w, h), fB.trozo(w, 0, 0, w, h, w, h)]);
          a = tintaDe(leer(da)); b = tintaDe(leer(db));
        }
        if (!vivo) return;
        setEstado({ que: 'cargando', texto: 'Buscando los cambios…' });
        await new Promise(r => setTimeout(r, 0));
        const dilA = dilatar(a, w, h, 1);
        const dilB = dilatar(b, w, h, 1);
        if (!vivo) return;
        ultimoDesfase.current = null;
        setHoja({ w, h, a, b, dilA, dilB, fA, fB, lienzoA: da, lienzoB: db, lienzoC: nuevoLienzo(w, h),
          tA: tenido(a, w, h, [185, 53, 53]), tB: tenido(b, w, h, [80, 114, 148]),
          faltaA: fA.tipo === 'vacia', faltaB: fB.tipo === 'vacia' });
        setEstado({ que: 'listo' });
        // Los textos, del PDF (sin dibujarlo): se comparan cuando llegan.
        const [qa, qb] = pa ? [pa, pb] : await Promise.all([pdfDe(vA), pdfDe(vB)]);
        if (!vivo) return;
        setPaginas(Math.max(qa.numPages, qb.numPages));
        const anchoPt = async (pdf) => (pagina <= pdf.numPages ? (await pdf.getPage(pagina)).getViewport({ scale: 1 }).width : 1);
        const [wa, wb] = await Promise.all([anchoPt(qa), anchoPt(qb)]);
        const [ta, tb] = await Promise.all([textosDe(qa, pagina, w / wa), textosDe(qb, pagina, w / wb)]);
        if (vivo) setTextos({ a: ta, b: tb });
        // LA NUBE que se viene a verificar: de puntos del PDF a píxeles de esta hoja, y se encuadra en ella.
        if (vivo && enfoque?.geometria && (enfoque.pagina || 1) === pagina && pagina <= qb.numPages) {
          const vpN = (await qb.getPage(pagina)).getViewport({ scale: w / wb });
          const caja = cajaDeGeometria(enfoque.geometria, (x, y) => vpN.convertToViewportPoint(x, y));
          if (vivo && caja) {
            setZonaDeLaNube(caja);
            primeraVista.current = false;
            const m = medida(visor.current);
            const v = encuadrar(caja, m.w, m.h, { aire: 0.9, maximo: 3 });
            setVista(v);
            setVistaA(v);
          }
        }
      } catch (e) {
        if (vivo) setEstado({ que: 'error', texto: e.message || 'No se pudo comparar.' });
      }
    })();
    return () => { vivo = false; };
  }, [idA, idB, pagina]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 2 · Componer el superpuesto (cada vez que cambian las capas o el desfase) ──
  // Los cambios y sus miniaturas se buscan solo cuando cambia la hoja o el desfase: no dependen de los colores.
  const ultimoDesfase = useRef(null);
  useEffect(() => {
    if (!hoja || alineando) return undefined;
    // Un temporizador y no requestAnimationFrame: con la pestaña tapada el navegador no da fotogramas, y la lista se
    // quedaba en «Sin cambios» (medido en el banco, 3-nov-2026).
    const id = setTimeout(() => {
      const c = hoja.lienzoC;
      const ctx = c.getContext('2d');
      const img = ctx.createImageData(hoja.w, hoja.h);
      const mapa = componer({ ...hoja, dx: desfase.dx, dy: desfase.dy, salida: img.data, colores: capas.colores,
        verA: capas.verA, verB: capas.verB, atenuar: capas.atenuar });
      ctx.putImageData(img, 0, 0);
      const clave = `${hoja.w}x${hoja.h}:${desfase.dx},${desfase.dy}:${textos ? 't' : ''}`;
      if (ultimoDesfase.current === clave) return;
      ultimoDesfase.current = clave;
      const todo = capas.colores && capas.verA && capas.verB ? mapa
        : componer({ ...hoja, dx: desfase.dx, dy: desfase.dy, salida: new Uint8ClampedArray(hoja.w * hoja.h * 4) });
      const textoA = (textos?.a || []).map(t => ({ ...t, x: t.x + desfase.dx, y: t.y + desfase.dy }));
      const { zonas: porPixeles } = detectarAfinando({ mapa: todo, a: hoja.a, b: hoja.b, w: hoja.w, h: hoja.h,
        dx: desfase.dx, dy: desfase.dy });
      const zonas = juntarConTexto(porPixeles, cambiosDeTexto(textoA, textos?.b || []), hoja.w, hoja.h);
      setCambios(zonas);
      setActivo(null);
      setMiniaturas(miniaturasDe(c, zonas));
    }, 0);
    return () => clearTimeout(id);
  }, [hoja, textos, alineando, desfase, capas.colores, capas.verA, capas.verB, capas.atenuar]);

  // ── 2 bis · Nitidez: al dejar de moverse con zoom por encima de la hoja base, se dibuja la zona visible de las dos
  // versiones a la resolución de la pantalla (y se vuelve a comparar esa zona). La hoja base sigue debajo.
  useEffect(() => {
    if (!hoja || alineando || estado.que !== 'listo') return undefined;
    const el = visor.current;
    if (!el) return undefined;
    const espera = setTimeout(async () => {
      const r = el.getBoundingClientRect();
      const v = vista;
      const dpr = window.devicePixelRatio || 1;
      if (v.s * dpr <= 1.15) { setDetalle(null); return; }
      const holgura = 0.15;
      const vw = r.width / v.s, vh = r.height / v.s;
      const x0 = Math.max(0, -v.x / v.s - vw * holgura), y0 = Math.max(0, -v.y / v.s - vh * holgura);
      const x1 = Math.min(hoja.w, (r.width - v.x) / v.s + vw * holgura), y1 = Math.min(hoja.h, (r.height - v.y) / v.s + vh * holgura);
      if (x1 - x0 < 2 || y1 - y0 < 2) return;
      const f = Math.min(v.s * dpr, 4, Math.sqrt(8e6 / ((x1 - x0) * (y1 - y0))));
      if (f <= 1.15) { setDetalle(null); return; }
      const cw = Math.round((x1 - x0) * f), ch = Math.round((y1 - y0) * f);
      const yo = ++turno.current;
      setAfinando(true);
      try {
        // En «lado a lado» la anterior se mira en su propio panel, sin el desfase; en los demás modos, con él.
        const ox = modo === 'lado' ? 0 : desfase.dx, oy = modo === 'lado' ? 0 : desfase.dy;
        const [A, B] = await Promise.all([
          hoja.fA.trozo(hoja.w, x0 - ox, y0 - oy, x1 - x0, y1 - y0, cw, ch),
          hoja.fB.trozo(hoja.w, x0, y0, x1 - x0, y1 - y0, cw, ch),
        ]);
        if (yo !== turno.current) return;
        const leer = (c) => c.getContext('2d').getImageData(0, 0, cw, ch).data;
        const ta = tintaDe(leer(A)), tb = tintaDe(leer(B));
        const radio = Math.max(1, Math.round(f));
        setDetalle({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, f, A, B, C: nuevoLienzo(cw, ch), ta, tb,
          dA: dilatar(ta, cw, ch, radio), dB: dilatar(tb, cw, ch, radio), cw, ch, ox, oy, modo });
      } catch { /* se queda la hoja base */ }
      finally { if (yo === turno.current) setAfinando(false); }
    }, 280);
    return () => clearTimeout(espera);
  }, [hoja, vista, modo, desfase, alineando, estado.que]);

  // El superpuesto de la zona nítida, con las mismas capas que la hoja.
  useEffect(() => {
    if (!detalle || modo !== 'superpuesto') return;
    const ctx = detalle.C.getContext('2d');
    const img = ctx.createImageData(detalle.cw, detalle.ch);
    componer({ a: detalle.ta, b: detalle.tb, dilA: detalle.dA, dilB: detalle.dB, w: detalle.cw, h: detalle.ch,
      salida: img.data, colores: capas.colores, verA: capas.verA, verB: capas.verB, atenuar: capas.atenuar });
    ctx.putImageData(img, 0, 0);
  }, [detalle, modo, capas.colores, capas.verA, capas.verB, capas.atenuar]);

  // ── 3 · Encuadre ──
  const medida = (el) => {
    const r = el?.getBoundingClientRect();
    return r ? { w: r.width, h: r.height } : { w: 800, h: 600 };
  };
  const ajustar = useCallback(() => {
    if (!hoja) return;
    const m = medida(visor.current);
    const v = encuadrar({ x: 0, y: 0, w: hoja.w, h: hoja.h }, m.w, m.h, { aire: 0.03, maximo: 4 });
    setVista(v);
    if (!enlazado) setVistaA(v);
  }, [hoja, enlazado]);
  // Se encuadra la hoja al abrir y cuando la página nueva tiene otro tamaño; al cambiar de versión, la vista se queda.
  const tamano = useRef('');
  useLayoutEffect(() => {
    if (!hoja) return;
    const t = `${hoja.w}x${hoja.h}`;
    if (primeraVista.current || t !== tamano.current) { primeraVista.current = false; ajustar(); }
    tamano.current = t;
  }, [hoja, ajustar]);
  useEffect(() => { ajustar(); }, [modo]); // eslint-disable-line react-hooks/exhaustive-deps

  const irACambio = useCallback((n) => {
    const z = cambios.find(c => c.n === n);
    if (!z) return;
    setActivo(n);
    const m = medida(visor.current);
    const v = encuadrar(z, m.w, m.h, { aire: 0.6, maximo: 1.6 });
    setVista(v);
    if (!enlazado) setVistaA({ ...v, x: v.x - desfase.dx * v.s, y: v.y - desfase.dy * v.s });
  }, [cambios, enlazado, desfase]);
  const visibles = useMemo(() => (filtro === 'todos' ? cambios : cambios.filter(c => c.tipo === filtro)), [cambios, filtro]);
  const siguiente = useCallback((paso) => {
    if (!visibles.length) return;
    const i = visibles.findIndex(c => c.n === activo);
    const j = i < 0 ? (paso > 0 ? 0 : visibles.length - 1) : (i + paso + visibles.length) % visibles.length;
    irACambio(visibles[j].n);
  }, [visibles, activo, irACambio]);

  // ── 4 · Rueda (zoom anclado en el cursor) y arrastre (mover la hoja, o la versión anterior al alinear) ──
  const vistaDe = useCallback((lado) => (lado === 'a' && !enlazado && vistaA ? vistaA : vista), [enlazado, vistaA, vista]);
  const fijarVista = useCallback((lado, f) => {
    if (lado === 'a' && !enlazado) setVistaA(v => f(v || vista));
    else setVista(f);
  }, [enlazado, vista]);

  useEffect(() => {
    const els = [[visor.current, 'b'], [visorA.current, 'a']].filter(([el]) => el);
    const quitar = els.map(([el, lado]) => {
      const alRodar = (e) => {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const factor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0012));
        fijarVista(lado, v => zoomEn(v, e.clientX - r.left, e.clientY - r.top, factor, { maximo: 6 }));
      };
      el.addEventListener('wheel', alRodar, { passive: false });
      return () => el.removeEventListener('wheel', alRodar);
    });
    return () => quitar.forEach(f => f());
  }, [fijarVista, modo, hoja]);

  const arrastre = useRef(null);
  const alBajar = (lado) => (e) => {
    if (e.button !== 0 || e.target.closest('.cmp-cortina-asa, .cmp-nube, button, select, input')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { x: e.clientX, y: e.clientY, lado, v: vistaDe(lado), d: desfase };
  };
  const alMover = (e) => {
    const a = arrastre.current;
    if (!a) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    if (alineando) {
      setDesfase({ dx: Math.round(a.d.dx + dx / a.v.s), dy: Math.round(a.d.dy + dy / a.v.s) });
    } else {
      fijarVista(a.lado, () => ({ ...a.v, x: a.v.x + dx, y: a.v.y + dy }));
    }
  };
  const alSoltar = () => { arrastre.current = null; };

  const zoomBoton = (f) => {
    const m = medida(visor.current);
    setVista(v => zoomEn(v, m.w / 2, m.h / 2, f, { maximo: 6 }));
    if (!enlazado) setVistaA(v => (v ? zoomEn(v, m.w / 2, m.h / 2, f, { maximo: 6 }) : v));
  };

  // ── 5 · Teclado ──
  useEffect(() => {
    const alTeclear = (e) => {
      if (e.target.closest?.('input, select, textarea')) return;
      if (e.key === 'Escape') { e.preventDefault(); if (alineando) setAlineando(false); else onClose?.(); return; }
      if (alineando && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const p = e.shiftKey ? 10 : 1;
        setDesfase(d => ({ dx: d.dx + (e.key === 'ArrowRight' ? p : e.key === 'ArrowLeft' ? -p : 0),
                           dy: d.dy + (e.key === 'ArrowDown' ? p : e.key === 'ArrowUp' ? -p : 0) }));
        return;
      }
      if (e.key === '1') setModo('superpuesto');
      else if (e.key === '2') setModo('cortina');
      else if (e.key === '3') setModo('lado');
      else if (e.key.toLowerCase() === 'n') siguiente(e.shiftKey ? -1 : 1);
      else if (e.key === '0') ajustar();
      else if (e.key === '+' || e.key === '=') zoomBoton(1.25);
      else if (e.key === '-') zoomBoton(0.8);
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }); // se vuelve a atar en cada dibujado: usa el estado del momento

  const empezarAlinear = () => { setModo('superpuesto'); setAlineando(true); };
  const intercambiar = () => { setIdA(idB); setIdB(idA); setDesfase({ dx: -desfase.dx, dy: -desfase.dy }); primeraVista.current = false; };

  // ── Dibujo ──
  const transformar = (v) => ({ transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})` });
  // La nube que se verifica, en trazo discontinuo: no es un cambio encontrado, es el sitio que hay que mirar.
  const laNube = (dx = 0, dy = 0) => (hoja && zonaDeLaNube && (
    <svg className="cmp-nubes" width={hoja.w} height={hoja.h} viewBox={`0 0 ${hoja.w} ${hoja.h}`} aria-hidden="true">
      <rect className="cmp-foco" x={zonaDeLaNube.x + dx} y={zonaDeLaNube.y + dy} width={zonaDeLaNube.w} height={zonaDeLaNube.h} />
    </svg>
  ));
  // LAS MARCAS DE LOS CAMBIOS: un rectángulo fino y una etiqueta con su número, de tamaño fijo en pantalla (3-nov-2026,
  // el dueño: «más profesional y serio»; las nubes de festones, a toda la hoja, se veían recargadas).
  const nubes = (dx = 0, dy = 0) => (hoja && capas.nubes && !alineando && visibles.length > 0 && (
    <svg className="cmp-nubes" width={hoja.w} height={hoja.h} viewBox={`0 0 ${hoja.w} ${hoja.h}`} aria-hidden="true">
      <g transform={`translate(${dx} ${dy})`}>
        {visibles.map(z => {
          const s = vistaDe('b').s;
          const t = tipoDe(z);
          const rotulo = `${t.signo} ${z.n}`;
          const alto = 16 / s, ancho = (rotulo.length * 6.6 + 10) / s;
          const ty = z.y - alto >= 0 ? z.y - alto : z.y;
          const esActivo = z.n === activo;
          return (
            <g key={z.n} className={`cmp-nube cmp-nube--${t.clase}${esActivo ? ' cmp-nube--activa' : ''}`}
              onClick={(e) => { e.stopPropagation(); irACambio(z.n); }}>
              <title>{`${t.nombre} · ${z.lugar}`}</title>
              <rect className="cmp-nube-caja" x={z.x} y={z.y} width={z.w} height={z.h} />
              <rect className="cmp-nube-etiqueta" x={z.x} y={ty} width={ancho} height={alto} rx={2 / s} />
              <text x={z.x + ancho / 2} y={ty + alto / 2} fontSize={10.5 / s} dy={3.6 / s}>{rotulo}</text>
            </g>
          );
        })}
      </g>
    </svg>
  ));
  // La zona nítida, en su sitio de la hoja (la de la anterior, dentro de su capa desplazada).
  const nitido = (lienzo, paraModo, enCapaA = false) => (detalle && lienzo && detalle.modo === paraModo && (
    <Lienzo canvas={lienzo} className="cmp-detalle" style={{ left: detalle.x - (enCapaA ? detalle.ox : 0),
      top: detalle.y - (enCapaA ? detalle.oy : 0), width: detalle.w, height: detalle.h }} />
  ));
  const recorteCortina = () => {
    if (!hoja) return {};
    const xHoja = (cortina * anchoVisor - vista.x) / vista.s - desfase.dx;
    return { clipPath: `inset(0 ${Math.max(0, hoja.w - xHoja)}px 0 0)` };
  };

  const resumen = cambios.length === 0 ? 'Sin cambios' : cambios.length === 1 ? '1 cambio' : `${cambios.length} cambios`;
  const opcion = (v) => `${etiqueta(v)}${v.version_number === vigente ? ' · vigente' : ''} · ${fecha(v.updated || v.created_at)}${v.updated_by ? ` · ${v.updated_by}` : ''}`;

  return (
    <div className="cmp" role="dialog" aria-label={`Comparar versiones de ${fileName}`}>
      {/* ── Barra superior: qué se compara y cómo ── */}
      <header className="cmp-cab">
        <button type="button" className="cmp-icono" onClick={onClose} aria-label="Cerrar la comparación" data-tip="Cerrar (Esc)">
          <Ico><path d="M15 6l-6 6 6 6" /></Ico>
        </button>
        <div className="cmp-titulo">
          <b>Comparar versiones</b>
          <span title={fileName}>{fileName}</span>
        </div>
        <div className="cmp-versiones">
          <label className="cmp-version cmp-version--a">
            <span className="cmp-version-rol">Anterior</span>
            <select value={idA} onChange={e => { setIdA(e.target.value); setDesfase({ dx: 0, dy: 0 }); }} aria-label="Versión anterior">
              {lista.map(v => <option key={v.id} value={String(v.id)} disabled={String(v.id) === idB}>{opcion(v)}</option>)}
            </select>
          </label>
          <button type="button" className="cmp-icono" onClick={intercambiar} aria-label="Intercambiar las versiones" data-tip="Intercambiar">
            <Ico><path d="M7 7h11l-3-3M17 17H6l3 3" /></Ico>
          </button>
          <label className="cmp-version cmp-version--b">
            <span className="cmp-version-rol">Nueva</span>
            <select value={idB} onChange={e => { setIdB(e.target.value); setDesfase({ dx: 0, dy: 0 }); }} aria-label="Versión nueva">
              {lista.map(v => <option key={v.id} value={String(v.id)} disabled={String(v.id) === idA}>{opcion(v)}</option>)}
            </select>
          </label>
        </div>
        <div className="cmp-modos" role="radiogroup" aria-label="Modo de comparación">
          {[['superpuesto', 'Superpuesto', '1'], ['cortina', 'Cortina', '2'], ['lado', 'Lado a lado', '3']].map(([k, t, tecla]) => (
            <button key={k} type="button" role="radio" aria-checked={modo === k} data-tip={`${t} (${tecla})`}
              onClick={() => { setModo(k); if (k !== 'superpuesto') setAlineando(false); }}>{t}</button>
          ))}
        </div>
        <button type="button" className={`cmp-icono${panel ? ' cmp-icono--on' : ''}`} onClick={() => setPanel(p => !p)}
          aria-pressed={panel} aria-label="Lista de cambios" data-tip="Lista de cambios">
          <Ico><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M14.5 4.5v15" /></Ico>
        </button>
      </header>

      <div className="cmp-cuerpo">
        {/* ── La hoja ── */}
        <div className={`cmp-escena cmp-escena--${modo}`}>
          {modo === 'lado' && (
            <div ref={visorA} className="cmp-visor cmp-visor--a" onPointerDown={alBajar('a')} onPointerMove={alMover}
              onPointerUp={alSoltar} onPointerCancel={alSoltar} onDoubleClick={ajustar}>
              <span className="cmp-rotulo cmp-rotulo--a">{etiqueta(vA)}{hoja?.faltaA ? ' · sin esta página' : ''}</span>
              {hoja && (
                <div className="cmp-lienzo" style={{ ...transformar(vistaDe('a')), width: hoja.w, height: hoja.h }}>
                  <Lienzo canvas={hoja.lienzoA} />
                  {enlazado && nitido(detalle?.A, 'lado')}
                  {nubes(-desfase.dx, -desfase.dy)}
                  {laNube(-desfase.dx, -desfase.dy)}
                </div>
              )}
            </div>
          )}
          <div ref={visor} className={`cmp-visor${alineando ? ' cmp-visor--alineando' : ''}`} onPointerDown={alBajar('b')}
            onPointerMove={alMover} onPointerUp={alSoltar} onPointerCancel={alSoltar} onDoubleClick={ajustar}>
            {modo === 'lado' && <span className="cmp-rotulo cmp-rotulo--b">{etiqueta(vB)}{hoja?.faltaB ? ' · sin esta página' : ''}</span>}
            {hoja && (
              <div className="cmp-lienzo" style={{ ...transformar(vista), width: hoja.w, height: hoja.h }}>
                {modo === 'superpuesto' && !alineando && <Lienzo canvas={hoja.lienzoC} />}
                {modo === 'superpuesto' && !alineando && nitido(detalle?.C, 'superpuesto')}
                {modo === 'superpuesto' && alineando && (
                  <>
                    <Lienzo canvas={hoja.tB} />
                    <Lienzo canvas={hoja.tA} className="cmp-capa-multiplicar"
                      style={{ transform: `translate(${desfase.dx}px, ${desfase.dy}px)` }} />
                  </>
                )}
                {modo === 'cortina' && (
                  <>
                    <Lienzo canvas={hoja.lienzoB} />
                    {nitido(detalle?.B, 'cortina')}
                    <div className="cmp-capa" style={{ transform: `translate(${desfase.dx}px, ${desfase.dy}px)`, ...recorteCortina() }}>
                      <Lienzo canvas={hoja.lienzoA} />
                      {nitido(detalle?.A, 'cortina', true)}
                    </div>
                  </>
                )}
                {modo === 'lado' && <Lienzo canvas={hoja.lienzoB} />}
                {modo === 'lado' && nitido(detalle?.B, 'lado')}
                {nubes()}
                {laNube()}
              </div>
            )}
            {modo === 'cortina' && hoja && (
              <CortinaAsa valor={cortina} onCambio={setCortina} izquierda={etiqueta(vA)} derecha={etiqueta(vB)} />
            )}
            {estado.que === 'cargando' && <div className="cmp-progreso" aria-hidden="true"><i /></div>}
            {estado.que !== 'listo' && (
              <div className={`cmp-estado${estado.que === 'error' ? ' cmp-estado--error' : ''}`} role="status">{estado.texto}</div>
            )}
            {afinando && !alineando && <span className="cmp-afinando" aria-live="polite">Afinando…</span>}
            {alineando && (
              <div className="cmp-aviso" role="status">
                Arrastra para mover la {etiqueta(vA)} sobre la {etiqueta(vB)}, o usa las flechas (Mayús: 10 px).
                <span className="cmp-aviso-cifra">{desfase.dx}, {desfase.dy} px</span>
                <button type="button" onClick={() => setDesfase({ dx: 0, dy: 0 })}>Restablecer</button>
                <button type="button" className="cmp-prim" onClick={() => setAlineando(false)}>Listo</button>
              </div>
            )}
            {hoja && (hoja.faltaA || hoja.faltaB) && modo !== 'lado' && (
              <div className="cmp-aviso cmp-aviso--falta" role="status">
                La {hoja.faltaA ? etiqueta(vA) : etiqueta(vB)} no tiene la página {pagina}.
              </div>
            )}
          </div>
          {/* ── El mando, flotante como el del lector: página, zoom, alinear y marcas ── */}
          <div className="cmp-mando" role="toolbar" aria-label="Controles de la comparación">
            <div className="cmp-grupo">
              <button type="button" className="cmp-icono" onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={pagina <= 1}
                aria-label="Página anterior"><Ico><path d="M15 6l-6 6 6 6" /></Ico></button>
              <span className="cmp-cifra">{pagina} de {paginas}</span>
              <button type="button" className="cmp-icono" onClick={() => setPagina(p => Math.min(paginas, p + 1))} disabled={pagina >= paginas}
                aria-label="Página siguiente"><Ico><path d="M9 6l6 6-6 6" /></Ico></button>
            </div>
            <span className="cmp-sep" />
            <div className="cmp-grupo">
              <button type="button" className="cmp-icono" onClick={() => zoomBoton(0.8)} aria-label="Alejar" data-tip="Alejar (−)">
                <Ico><path d="M6 12h12" /></Ico></button>
              <span className="cmp-cifra">{Math.round(vista.s * 100)} %</span>
              <button type="button" className="cmp-icono" onClick={() => zoomBoton(1.25)} aria-label="Acercar" data-tip="Acercar (+)">
                <Ico><path d="M6 12h12M12 6v12" /></Ico></button>
              <button type="button" className="cmp-icono" onClick={ajustar} aria-label="Hoja entera" data-tip="Hoja entera (0)">
                <Ico><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" /></Ico></button>
              {modo === 'lado' && (
                <button type="button" className={`cmp-icono${enlazado ? ' cmp-icono--on' : ''}`} aria-pressed={enlazado}
                  onClick={() => { setEnlazado(e => !e); setVistaA(vista); }} aria-label="Vincular el zoom de las dos" data-tip={enlazado ? 'Zoom vinculado' : 'Zoom suelto'}>
                  <Ico><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></Ico>
                </button>
              )}
            </div>
            <span className="cmp-sep" />
            <button type="button" className={`cmp-icono cmp-icono--texto${alineando ? ' cmp-icono--on' : ''}`} onClick={() => (alineando ? setAlineando(false) : empezarAlinear())}
              aria-pressed={alineando} data-tip="Alinear">
              <Ico><path d="M12 3.5v17M3.5 12h17" /><rect x="7.5" y="7.5" width="9" height="9" rx="1" /></Ico>Alinear
              {(desfase.dx || desfase.dy) && !alineando ? <small>{desfase.dx}, {desfase.dy}</small> : null}
            </button>
            <button type="button" className={`cmp-icono${capas.nubes ? ' cmp-icono--on' : ''}`} aria-pressed={capas.nubes}
              onClick={() => setCapas(c => ({ ...c, nubes: !c.nubes }))} aria-label="Marcar los cambios" data-tip={capas.nubes ? 'Ocultar las marcas' : 'Marcar los cambios'}>
              <Ico><rect x="4.5" y="6.5" width="15" height="12" rx="1" strokeDasharray="2.5 2" /><path d="M4.5 3.5h5" /></Ico>
            </button>
          </div>
          {modo === 'superpuesto' && !alineando && hoja && (
                <div className="cmp-leyenda" role="group" aria-label="Leyenda">
                  <button type="button" className="cmp-capa-boton cmp-capa-boton--a" aria-pressed={capas.verA}
                    onClick={() => setCapas(c => ({ ...c, verA: !c.verA }))} data-tip={capas.verA ? `Ocultar la ${etiqueta(vA)}` : `Mostrar la ${etiqueta(vA)}`}>
                    <i /><span>Quitado · solo en {etiqueta(vA)}</span></button>
                  <button type="button" className="cmp-capa-boton cmp-capa-boton--b" aria-pressed={capas.verB}
                    onClick={() => setCapas(c => ({ ...c, verB: !c.verB }))} data-tip={capas.verB ? `Ocultar la ${etiqueta(vB)}` : `Mostrar la ${etiqueta(vB)}`}>
                    <i /><span>Añadido · solo en {etiqueta(vB)}</span></button>
                  <label className="cmp-atenuar" data-tip="Atenuar">
                    <i />Igual
                    <input type="range" min="0.1" max="1" step="0.05" value={capas.atenuar}
                      onChange={e => setCapas(c => ({ ...c, atenuar: Number(e.target.value) }))} aria-label="Intensidad de lo que no cambió" />
                  </label>
                  <button type="button" className={`cmp-icono${capas.colores ? '' : ' cmp-icono--on'}`} aria-pressed={!capas.colores}
                    onClick={() => setCapas(c => ({ ...c, colores: !c.colores }))} aria-label="Sin colores" data-tip={capas.colores ? 'Ver sin colores' : 'Ver con colores'}>
                    <Ico><path d="M12 3.5s6 6.4 6 10.5a6 6 0 0 1-12 0c0-4.1 6-10.5 6-10.5z" />{!capas.colores && <path d="M4 4l16 16" />}</Ico>
                  </button>
                </div>
          )}
        </div>

        {/* ── Los cambios ── */}
        {panel && (
          <aside className="cmp-panel" aria-label="Cambios">
            <div className="cmp-panel-cab">
              <b>{estado.que === 'listo' && !alineando ? resumen : 'Cambios'}</b>
              {cambios.length > 1 && (
                <span className="cmp-panel-nav">
                  <button type="button" className="cmp-icono" onClick={() => siguiente(-1)} aria-label="Cambio anterior" data-tip="Anterior (Mayús+N)">
                    <Ico size={16}><path d="M15 6l-6 6 6 6" /></Ico></button>
                  <button type="button" className="cmp-icono" onClick={() => siguiente(1)} aria-label="Cambio siguiente" data-tip="Siguiente (N)">
                    <Ico size={16}><path d="M9 6l6 6-6 6" /></Ico></button>
                </span>
              )}
            </div>
            {estado.que === 'listo' && !alineando && cambios.length > 0 && (
              <div className="cmp-filtro" role="radiogroup" aria-label="Qué cambios ver">
                <button type="button" role="radio" aria-checked={filtro === 'todos'} onClick={() => setFiltro('todos')}>
                  Todos <span>{cambios.length}</span></button>
                {Object.entries(TIPO).map(([k, t]) => {
                  const n = cambios.filter(c => c.tipo === k).length;
                  return n > 0 && (
                    <button key={k} type="button" role="radio" aria-checked={filtro === k} onClick={() => setFiltro(k)}
                      className={`cmp-filtro--${t.clase}`}>
                      <i aria-hidden="true">{t.signo}</i>{t.plural} <span>{n}</span></button>
                  );
                })}
              </div>
            )}
            {estado.que === 'listo' && !alineando && cambios.length === 0 && (
              <p className="cmp-panel-vacio">No hay diferencias en esta página entre la {etiqueta(vA)} y la {etiqueta(vB)}.</p>
            )}
            {alineando && <p className="cmp-panel-vacio">Los cambios se vuelven a buscar al terminar de alinear.</p>}
            <ol className="cmp-cambios">
              {!alineando && visibles.map(z => (
                <li key={z.n}>
                  <button type="button" className={z.n === activo ? 'cmp-cambio cmp-cambio--activo' : 'cmp-cambio'}
                    onClick={() => irACambio(z.n)}>
                    <span className={`cmp-cambio-num cmp-cambio-num--${tipoDe(z).clase}`}>{tipoDe(z).signo} {z.n}</span>
                    {miniaturas[z.n] ? <img src={miniaturas[z.n]} alt="" /> : <span className="cmp-cambio-mini" />}
                    <span className="cmp-cambio-texto">
                      <b className="cmp-tipo">{tipoDe(z).nombre}</b>
                      {z.textos?.length > 0 && (
                        <span className="cmp-cambio-dice" title={z.textos.map(t => textoDelCambio(t)).join(' · ')}>
                          {textoDelCambio(z.textos[0], 28)}{z.textos.length > 1 ? ` · y ${z.textos.length - 1} más` : ''}
                        </span>
                      )}
                      <span>{z.lugar}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          </aside>
        )}
      </div>

    </div>
  );
}

// El asa de la cortina: una línea vertical que se arrastra; a la izquierda la anterior, a la derecha la nueva.
function CortinaAsa({ valor, onCambio, izquierda, derecha }) {
  const caja = useRef(null);
  const mover = (e) => {
    const r = caja.current?.parentNode.getBoundingClientRect();
    if (r) onCambio(Math.max(0.02, Math.min(0.98, (e.clientX - r.left) / r.width)));
  };
  return (
    <div ref={caja} className="cmp-cortina" style={{ left: `${valor * 100}%` }}>
      <span className="cmp-cortina-rotulo cmp-cortina-rotulo--a">{izquierda}</span>
      <span className="cmp-cortina-rotulo cmp-cortina-rotulo--b">{derecha}</span>
      <button type="button" className="cmp-cortina-asa" aria-label="Mover la cortina"
        onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) mover(e); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') { e.stopPropagation(); onCambio(Math.max(0.02, valor - 0.02)); }
          if (e.key === 'ArrowRight') { e.stopPropagation(); onCambio(Math.min(0.98, valor + 0.02)); }
        }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"
          strokeLinejoin="round" aria-hidden="true"><path d="M9 7l-4 5 4 5M15 7l4 5-4 5" /></svg>
      </button>
    </div>
  );
}
