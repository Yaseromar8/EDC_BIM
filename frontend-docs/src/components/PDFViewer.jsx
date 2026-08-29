// frontend-docs/src/components/PDFViewer.jsx
// ═══════════════════════════════════════════════════════════════
// FACADE PATTERN: Visor PDF profesional basado en Mozilla PDF.js
// Modo: Single-Page (100% Zoom, Scroll-Zoom, Click-Pan)
// ═══════════════════════════════════════════════════════════════
import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import PdfToolsOverlay, { COLORS } from './PdfToolsOverlay';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import { tiraEstaAbierta, recordarTira } from '../utils/tiraDocumentos';
import { urlsDeMiniaturas } from '../utils/colaMiniaturas';
import './PDFViewer.css';

// Configurar el worker de PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).toString();

// ----------------------------------------------------------------------
// Sub-componente para renderizar Miniaturas en el Sidebar
// ----------------------------------------------------------------------
// Techo de resolución del canvas (~16 MP). Sin esto, un plano A0 a 8× con
// devicePixelRatio 2 pedía cientos de megapíxeles: el navegador se arrodilla.
const MAX_CANVAS_PIXELS = 16_000_000;

// Buscar sin tildes ni mayúsculas: "excavacion" encuentra "EXCAVACIÓN".
const normalizeText = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const THUMB_W = 140;          // ancho fijo de miniatura
const THUMB_PLACEHOLDER_H = 181; // alto aprox. A4 → reserva espacio y evita saltos de scroll

function Thumbnail({ pdf, pageNum, isActive, onClick }) {
  const canvasRef = useRef(null);
  const hostRef = useRef(null);
  // RENDIMIENTO: antes TODAS las miniaturas se dibujaban al montar (un PDF de
  // 200 páginas = 200 renders simultáneos → congelaba el visor). Ahora cada una
  // se dibuja SOLO cuando está por entrar en pantalla, y una única vez.
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '400px 0px' }); // pre-carga un poco antes de que se vea
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return undefined;
    let renderTask = null;
    let cancelled = false;

    const renderThumb = async () => {
      try {
        const page = await pdf.getPage(pageNum);
        if (cancelled) return;

        const viewport0 = page.getViewport({ scale: 1 });
        const canvas = canvasRef.current;
        if (!canvas) return;

        const scale = THUMB_W / viewport0.width;
        const viewport = page.getViewport({ scale });

        // Las miniaturas NO necesitan devicePixelRatio completo: a 140px de
        // ancho, 1x se ve igual y cuesta la cuarta parte de píxeles.
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(viewport.width * dpr);
        canvas.height = Math.round(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const ctx = canvas.getContext('2d'); // sin alpha:false → nada de miniaturas negras
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        renderTask = page.render({ canvasContext: ctx, viewport });
        await renderTask.promise;
        if (!cancelled) setReady(true);
      } catch (err) {
        if (err?.name !== 'RenderingCancelledException' && err?.name !== 'RenderingCancelled') {
          console.error('Thumbnail render error:', err);
        }
      }
    };

    renderThumb();
    return () => {
      cancelled = true;
      if (renderTask) renderTask.cancel();
    };
  }, [visible, pdf, pageNum]);

  return (
    <div
      ref={hostRef}
      data-thumb-page={pageNum}
      role="button"
      tabIndex={0}
      aria-current={isActive ? 'page' : undefined}
      aria-label={`Ir a la página ${pageNum}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClick();
        }
      }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '12px 0', cursor: 'pointer',
        background: isActive ? '#e3eaf0' : 'transparent',
        borderBottom: '1px solid #e3e6ea',
        transition: 'background 0.2s'
      }}
    >
      <div style={{
        boxShadow: isActive ? '0 0 0 2px var(--accent)' : '0 2px 5px rgba(0,0,0,0.2)',
        background: '#fff', padding: 2, borderRadius: 2,
        // Reserva el espacio antes de dibujar: la lista no "salta" al hacer scroll.
        minHeight: ready ? undefined : THUMB_PLACEHOLDER_H,
        width: THUMB_W + 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <canvas ref={canvasRef} />
      </div>
      <span style={{ fontSize: 11, color: '#4a5561', marginTop: 8, fontVariantNumeric: 'tabular-nums', fontWeight: isActive ? 600 : 400 }}>
        {pageNum}
      </span>
    </div>
  );
}


// ── EL CATÁLOGO DE HERRAMIENTAS, AGRUPADO POR LO QUE HACE ───────────────
// Once iconos en fila plana no se leen: hay que buscarlos uno a uno. En
// grupos —navegar, medir, anotar, borrar— la mano va sola. Cada uno lleva su
// PISTA, que se enseña cuando está activo en vez de un letrero permanente.
const GRUPOS_DE_HERRAMIENTAS = [
  { nombre: 'navegar', items: [
    { id: 'pan', etiqueta: 'Mover', title: 'Navegar: arrastra para mover, rueda para acercar',
      icon: <><path d="M9 11V6a1.6 1.6 0 0 1 3.2 0v5"/><path d="M12.2 11V4.8a1.6 1.6 0 0 1 3.2 0V11"/><path d="M15.4 11.4V7.6a1.6 1.6 0 0 1 3.2 0V15a6 6 0 0 1-6 6h-1.3a5 5 0 0 1-3.7-1.7L5 15.6a1.6 1.6 0 0 1 2.4-2.1L9 15"/></>,
      hint: 'Arrastra para mover el plano · rueda para acercar' } ] },
  { nombre: 'medir', items: [
    { id: 'calibrate', etiqueta: 'Escala', title: 'Calibrar escala con una distancia conocida',
      icon: <><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M6.8 17.2 17.2 6.8"/><path d="m10 14 1 1M13 11l1 1"/></>,
      hint: 'Marca dos puntos de una distancia conocida y escríbela' },
    { id: 'measure', etiqueta: 'Medir', title: 'Medir distancia',
      icon: <><rect x="2" y="9" width="20" height="6" rx="1" transform="rotate(-45 12 12)"/><path d="m8 12 1.4 1.4M11 9l1.4 1.4M14 6l1.4 1.4"/></>,
      hint: 'Clic por puntos · doble clic termina la medición' },
    { id: 'area', etiqueta: 'Área', title: 'Medir área',
      icon: <path d="m12 3 8.5 6.5-3.2 10.4H6.7L3.5 9.5z"/>,
      hint: 'Clic en cada vértice · doble clic cierra el área' },
    { id: 'count', etiqueta: 'Contar', title: 'Conteo de elementos',
      icon: <><circle cx="12" cy="12" r="8.5"/><path d="M12 8.5v7M8.5 12h7"/></>,
      hint: 'Cada clic suma una unidad al conteo' } ] },
  { nombre: 'anotar', items: [
    { id: 'cloud', etiqueta: 'Nube', title: 'Nube de revisión',
      icon: <path d="M17.5 19a4.5 4.5 0 0 0 .4-9 7 7 0 0 0-13.5 1.9A4 4 0 0 0 6 19z"/>,
      hint: 'Arrastra para encerrar lo que hay que revisar' },
    { id: 'arrow', etiqueta: 'Flecha', title: 'Flecha',
      icon: <path d="M5 19 19 5m0 0h-7m7 0v7"/>,
      hint: 'Arrastra desde el origen hasta la punta' },
    { id: 'rect', etiqueta: 'Marco', title: 'Rectángulo',
      icon: <rect x="4" y="6" width="16" height="12" rx="1.5"/>,
      hint: 'Arrastra para dibujar el rectángulo' },
    { id: 'pen', etiqueta: 'Lápiz', title: 'Lápiz libre',
      icon: <path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>,
      hint: 'Dibuja a mano alzada' },
    { id: 'text', etiqueta: 'Texto', title: 'Texto',
      icon: <path d="M5 6V4h14v2M12 4v16M9 20h6"/>,
      hint: 'Clic donde quieras escribir' } ] },
  { nombre: 'borrar', items: [
    { id: 'erase', etiqueta: 'Borrar', title: 'Borrar anotación',
      icon: <><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6M14 11v6"/></>,
      hint: 'Clic sobre una anotación para borrarla' } ] },
];

const HINTS = Object.fromEntries(
  GRUPOS_DE_HERRAMIENTAS.flatMap(g => g.items.map(t => [t.id, t.hint])));

// ----------------------------------------------------------------------
// Visor Principal
// ----------------------------------------------------------------------
// UNA MINIATURA DE OTRO DOCUMENTO DE LA CARPETA.
//
// El servidor rasteriza y CACHEA la primera pagina (?thumb=1), asi que esto
// es una imagen pequena. Se pide con apiFetch y se vuelve un blob local: una
// etiqueta <img> no puede mandar la cabecera de sesion, y meter el token en
// la direccion es justo el defecto que se corrigio en el menu del clic
// derecho. Y se pide SOLO cuando entra en pantalla (IntersectionObserver):
// una carpeta con 100 planos no baja 100 miniaturas de golpe.
// EL GIRO REAL DE LA HOJA = el que trae el plano + el que pidio el usuario.
//
// En pdf.js, `getViewport({ rotation })` NO SUMA la rotacion: la SUSTITUYE.
// Si no se le pasa nada usa la de la pagina (`page.rotate`), que es la
// correcta. El lector le pasaba siempre su propio contador -- que arranca en
// 0 -- y con eso DESCARTABA la rotacion que el plano lleva dentro.
//
// La mayoria de laminas de obra se autoran como hoja vertical con /Rotate 90,
// no como hoja apaisada. Por eso un A3 apaisado se abria de pie. La prueba de
// que la causa era esta y no otra: la miniatura de la tira SI salia bien,
// porque su viewport se pide sin rotacion y hereda la de la pagina.
const giroDeLaHoja = (page, giroPedido) =>
  (((page && page.rotate) || 0) + (giroPedido || 0)) % 360;

// ───────────────────────────────────────────────────────────────────────────
// LOS ULTIMOS DOCUMENTOS ABIERTOS, EN MEMORIA
//
// Reabrir un plano ya visto volvia a tardar lo mismo que la primera vez. Los
// BYTES ya no se bajaban (eso lo resuelve la cache del navegador), pero al
// cerrar el documento se liberaba, asi que pdf.js tenia que INTERPRETARLO
// entero otra vez -- y eso es lo que se sentia.
//
// DOS documentos como tope, no mas. Un plano A1 no es un fichero de texto y
// este mes ya hubo un aviso de memoria por guardar cosas grandes sin pensar;
// el tope se eligio midiendo (ver el commit), no a ojo.
//
// Ademas hay FRENO POR PRESION: antes de guardar se mira cuanta memoria queda
// libre y, si el navegador va justo, se vacia el almacen en vez de crecer. Un
// visor que se queda sin memoria es peor que uno que tarda dos segundos.
const CACHE_MAX_DOCS = 2;
const _docsAbiertos = new Map();          // url -> documento de pdf.js

function _memoriaApretada() {
  try {
    const m = performance && performance.memory;
    if (!m || !m.jsHeapSizeLimit) return false;
    return m.usedJSHeapSize / m.jsHeapSizeLimit > 0.7;
  } catch { return false; }   // navegador que no lo expone: se sigue normal
}

function _soltarDocumento(pdf) {
  try { pdf && pdf.destroy(); } catch { /* ya liberado */ }
}

function documentoEnCache(url) {
  return url ? _docsAbiertos.get(url) || null : null;
}

function guardarDocumento(url, pdf) {
  if (!url || !pdf) return;
  if (_memoriaApretada()) {
    for (const [, viejo] of _docsAbiertos) _soltarDocumento(viejo);
    _docsAbiertos.clear();
    console.warn('[PDFViewer] memoria justa: se vacia el almacen de documentos');
    return;                                // ni siquiera se guarda este
  }
  _docsAbiertos.delete(url);               // reinsertar = pasa a ser el mas reciente
  _docsAbiertos.set(url, pdf);
  while (_docsAbiertos.size > CACHE_MAX_DOCS) {
    const masViejo = _docsAbiertos.keys().next().value;
    _soltarDocumento(_docsAbiertos.get(masViejo));
    _docsAbiertos.delete(masViejo);
  }
}

// Lo que mide el banco de pruebas. No se usa en la aplicacion.
if (typeof window !== 'undefined') window.__alephiaDocsEnCache = () => _docsAbiertos.size;

export default function PDFViewer({ url, preparando = false,
  alEscritorio = null, appEscritorio = null, fileName = 'documento.pdf', nodeId = null, projectPrefix = '',
                                    versionLabel = null, versionInfo = null, hideTitle = false,
                                    onClose = null, onVersionClick = null,
                                    hermanos = [], onAbrirHermano = null,
                                    esAdmin = false, obraDelDocumento = '' }) {
  const viewerRef = useRef(null); // Para Fullscreen
  const canvasRef = useRef(null);
  const wrapRef = useRef(null); // Envuelve canvas + overlay de herramientas
  const containerRef = useRef(null);
  const sidebarRef = useRef(null);
  const pdfDocRef = useRef(null);
  const loadingTaskRef = useRef(null);
  const renderTaskRef = useRef(null);
  const renderSequenceRef = useRef(0);
  const baseVpRef = useRef({});
  const huboDocumentoRef = useRef(false);          // cache "pagina:rotacion" → viewport a escala 1
  const renderDebounceRef = useRef(null); // coalesce de renders durante el zoom
  // Texto por página SOLO EN MEMORIA: se lee del PDF al vuelo y se descarta al
  // cerrar el documento. No se extrae ni se guarda nada en el servidor.
  const textCacheRef = useRef(new Map());
  const busquedaVivaRef = useRef(null);   // debounce de la busqueda en vivo
  const bufferCanvasRef = useRef(null);   // doble bufer del render (uno, reutilizado)
  const anclaRef = useRef(null);          // punto que el zoom debe conservar bajo el cursor
  const [avisoDeRender, setAvisoDeRender] = useState(true);
  const [saltandoA, setSaltandoA] = useState(null);

  // CUANDO LA HOJA CABE ENTERA NO HAY SCROLL QUE MOVER, y el zoom crecia
  // desde el centro: el detalle que mirabas se escapaba. Este desplazamiento
  // propio la mueve cuando el scroll no puede, para que el punto bajo el
  // cursor siga bajo el cursor a CUALQUIER zoom.
  const [desplazamiento, setDesplazamiento] = useState({ x: 0, y: 0 });
  const [zoomMenuOpen, setZoomMenuOpen] = useState(false);
  // LA TIRA DE LA CARPETA (el boton de cuadricula, como ACC): saltar al
  // plano siguiente sin volver al explorador. Cerrada por defecto -- ocupa
  // alto util y no todo el mundo la quiere abierta.
  // LAS MINIATURAS DE LA TIRA, en UNA peticion y en paralelo -- el mismo
  // camino que la cuadricula. Antes cada una era un fetch autenticado que
  // obligaba al backend a bajar el objeto y reenviarlo, de dos en dos: por
  // eso salian «sin vista previa» o en blanco. Solo se piden cuando la tira
  // se ABRE: quien no la usa no paga nada.
  const [minisTira, setMinisTira] = useState({});
  const [tiraAbierta, _setTiraAbierta] = useState(tiraEstaAbierta);
  const setTiraAbierta = (v) => {
    const valor = typeof v === 'function' ? v(tiraAbierta) : v;
    recordarTira(valor);
    _setTiraAbierta(valor);
  };
  useEffect(() => { setSaltandoA(null); }, [fileName]);
  const indiceActual = hermanos.findIndex(h => h.name === fileName);
  // LA FIRMA DE LA CARPETA, no el array. `hermanos` llega como un array nuevo
  // en cada renderizado del padre, asi que el efecto se disparaba a cada
  // salto de lamina y volvia a pedir las 45 miniaturas: de ahi que la cinta
  // «se recargara» cada vez. La firma solo cambia si cambia la CARPETA.
  const firmaHermanos = hermanos.map(h => h.gcs_urn || h.name).join('|');
  useEffect(() => {
    if (!tiraAbierta || !hermanos.length) return undefined;
    let vivo = true;
    const conUrn = hermanos.filter(h => h.gcs_urn).map(h => h.gcs_urn);
    urlsDeMiniaturas(obraDelDocumento, conUrn).then(({ urls }) => {
      if (vivo) setMinisTira(prev => ({ ...prev, ...urls }));
    });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiraAbierta, firmaHermanos, obraDelDocumento]);

  // LA CINTA SE CENTRA UNA SOLA VEZ: AL ABRIRLA.
  //
  // Antes esto vivia en el `ref` del carril, que React ejecuta EN CADA
  // RENDERIZADO. Resultado: al pulsar otra lamina la cinta se desplazaba sola
  // -- «como si yo moviera la barra»-- y perdias el sitio donde estabas
  // mirando. Ahora se centra al abrir y despues la cinta es tuya: no se mueve
  // salvo que la muevas.
  const carrilRef = useRef(null);
  const yaCentradaRef = useRef(false);
  useEffect(() => {
    if (!tiraAbierta) { yaCentradaRef.current = false; return; }
    if (yaCentradaRef.current || !carrilRef.current) return;
    const actual = carrilRef.current.querySelector('.pdf-tira-item.es-actual');
    if (actual && actual.scrollIntoView) {
      actual.scrollIntoView({ block: 'nearest', inline: 'center' });
    }
    yaCentradaRef.current = true;
  }, [tiraAbierta, hermanos.length]);

  // LA CINTA SE CIERRA AL TOCAR FUERA: en el plano, en el mando o en
  // cualquier sitio que no sea ella misma. Pedido del dueno -- tener que
  // apuntar a la ✕ para quitarla de en medio era un paso de mas.
  useEffect(() => {
    if (!tiraAbierta) return undefined;
    const alPulsarFuera = (e) => {
      const t = e.target;
      if (t && t.closest && (t.closest('.pdf-tira') || t.closest('.pdf-tira-boton'))) return;
      setTiraAbierta(false);
    };
    document.addEventListener('mousedown', alPulsarFuera, true);
    return () => document.removeEventListener('mousedown', alPulsarFuera, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiraAbierta]);

  const irAHermano = (paso) => {
    if (!onAbrirHermano || indiceActual < 0) return;
    const destino = hermanos[indiceActual + paso];
    if (destino) onAbrirHermano(destino);
  };   // menu de presets de zoom
  const [colorOpen, setColorOpen] = useState(false);         // paleta del carril de anotacion

  // ── Búsqueda dentro del documento ──
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [matches, setMatches] = useState([]);      // [{ page, itemIndex }]
  const [matchIdx, setMatchIdx] = useState(0);
  const [searching, setSearching] = useState(false);

  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageDraft, setPageDraft] = useState('1');
  const [scale, setScale] = useState(1.0); // 100% por defecto
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState('page'); // page | width | custom
  
  // UI States
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0); // % de descarga del documento
  const [error, setError] = useState(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pageRendering, setPageRendering] = useState(false);

  // OJO CON EL ORDEN: este bloque usa `loading` y `pageRendering`, asi que
  // TIENE que ir despues de ellos. Estaba doscientas lineas mas arriba y
  // reventaba la vista entera con «Cannot access before initialization» --
  // zona muerta. Es la SEGUNDA vez que este fichero cae en lo mismo (ver el
  // comentario del `const pdf` en renderPage), y las dos veces lo vio el
  // dueno en produccion, no una prueba.
  // LA ESPERA NO APARECE DE GOLPE: espera un cuarto de segundo.
  //
  // Con el almacen de documentos, reabrir un plano ya visto es instantaneo --
  // y ahi la barra y el atenuado salian y desaparecian en un fotograma: un
  // fogonazo. Peor que no avisar, porque el ojo lo lee como un fallo.
  //
  // Con este retardo, lo rapido no parpadea NADA y lo lento avisa igual. Es
  // la misma idea que usa el navegador con su propia barra de carga.
  const [mostrarEspera, setMostrarEspera] = useState(false);
  const ocupado = preparando || loading || pageRendering;
  useEffect(() => {
    if (!ocupado) { setMostrarEspera(false); return undefined; }
    const t = setTimeout(() => setMostrarEspera(true), 250);
    return () => clearTimeout(t);
  }, [ocupado]);
  const [renderError, setRenderError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  
  // Pan States
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, scrollLeft: 0, scrollTop: 0 });

  // Herramientas de ingeniería (overlay)
  const [tool, setTool] = useState('pan');
  const [markupColor, setMarkupColor] = useState(COLORS[0]);
  const [vpInfo, setVpInfo] = useState(null); // { vp, w, h } del render actual
  const userName = (() => {
    try { return JSON.parse(localStorage.getItem('visor_user') || sessionStorage.getItem('visor_user') || '{}').name || ''; }
    catch { return ''; }
  })();

  // CADA DOCUMENTO ADOPTADO LLEVA UN NUMERO NUEVO.
  //
  // EL FALLO QUE ESTO CORRIGE: al reutilizar un documento del almacen, el
  // efecto hacia setLoading(true) y setLoading(false) seguidos -- React los
  // agrupa, asi que `loading` NO CAMBIABA. Y en un plano de una sola pagina
  // tampoco cambiaban `currentPage`, `rotation` ni `renderPage`. Con todas
  // las dependencias del dibujado iguales, EL EFECTO NO VOLVIA A CORRER: el
  // lienzo se quedaba con el plano anterior y no cambiaba nunca.
  //
  // Este contador cambia SIEMPRE que se adopta un documento -- venga del
  // almacen o de la red-- asi que el dibujado no puede saltarselo.
  const [docNonce, setDocNonce] = useState(0);

  // QUE DOCUMENTO ESTA YA ENCUADRADO.
  //
  // EL DEFECTO: al abrir un plano se dibujaba a la escala del ANTERIOR y, un
  // instante despues, el encuadre automatico cambiaba la escala y lo dibujaba
  // OTRA VEZ. De ahi la sensacion de «hace dos veces la carga»: es que la
  // hacia dos veces de verdad, y la primera no servia para nada -- el plano
  // aparecia con el tamano equivocado y saltaba.
  //
  // Con esto el dibujado ESPERA a que la escala este decidida. Se pinta una
  // sola vez, y ya a su tamano.
  const encuadradoRef = useRef(0);
  const [encuadrado, setEncuadrado] = useState(0);

  // Load PDF document
  useEffect(() => {
    if (!url) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setProgress(0);
    setCurrentPage(1);
    setPageDraft('1');
    setScale(1.0);
    setRotation(0);
    baseVpRef.current = {}; // el cache de viewports es por documento
    textCacheRef.current = new Map(); // el texto leído se descarta al cambiar de PDF
    setMatches([]); setMatchIdx(0); setSearchQuery(''); setSearchOpen(false);

    // ¿YA LO TENEMOS INTERPRETADO? Entonces no hay nada que esperar.
    const yaAbierto = documentoEnCache(url);
    if (yaAbierto) {
      pdfDocRef.current = yaAbierto;
      huboDocumentoRef.current = true;
      guardarDocumento(url, yaAbierto);     // pasa a ser el mas reciente
      setNumPages(yaAbierto.numPages);
      setLoading(false);
      setShowSidebar(yaAbierto.numPages > 1);
      setDocNonce(n => n + 1);              // <- sin esto, no se redibuja
      return undefined;                     // sin descarga y sin re-interpretar
    }

    const loadPDF = async () => {
      try {
        // Descarga en streaming continuo (comportamiento por defecto de PDF.js).
        // NO activar `disableAutoFetch`: para PDFs normales dispara decenas de
        // peticiones por rangos y sale MÁS LENTO que bajar el archivo de corrido.
        const loadingTask = pdfjsLib.getDocument({ url, withCredentials: false });
        loadingTaskRef.current = loadingTask;
        loadingTask.onProgress = ({ loaded, total }) => {
          if (!cancelled && total) setProgress(Math.min(99, Math.round((loaded / total) * 100)));
        };
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        huboDocumentoRef.current = true;   // ver el `if (loading)` de abajo
        guardarDocumento(url, pdf);
        setNumPages(pdf.numPages);
        setLoading(false);
        setDocNonce(n => n + 1);
        setShowSidebar(pdf.numPages > 1);
      } catch (err) {
        if (cancelled) return;
        console.error('[PDFViewer] Error loading PDF:', err);
        setError(err.message || 'No se pudo cargar el PDF');
        setLoading(false);
      }
    };

    loadPDF();
    return () => {
      cancelled = true;
      clearTimeout(renderDebounceRef.current);
      renderSequenceRef.current += 1;
      try { renderTaskRef.current?.cancel(); } catch { /* render ya finalizado */ }
      // OJO: destruir la tarea de carga destruye TAMBIEN su documento. Si
      // este esta en el almacen, liberarlo aqui haria que la proxima apertura
      // recibiera un documento muerto -- el fallo clasico de esta clase de
      // cache. Solo se libera lo que NO se guarda.
      const guardado = documentoEnCache(url) === pdfDocRef.current && pdfDocRef.current;
      if (!guardado) {
        try { loadingTaskRef.current?.destroy(); } catch { /* tarea ya finalizada */ }
        try { pdfDocRef.current?.destroy(); } catch { /* documento ya liberado */ }
      }
      renderTaskRef.current = null;
      loadingTaskRef.current = null;
      pdfDocRef.current = null;
    };
  }, [url, retryNonce]);

  // ZOOM INSTANTÁNEO: al cambiar la escala se ajusta el tamaño CSS de una vez
  // (el navegador reescala el bitmap actual → respuesta inmediata) y la
  // rasterización nítida llega ~110 ms después, ya sin la rueda girando.
  const applyPreviewSize = useCallback(async () => {
    const pdf = pdfDocRef.current, canvas = canvasRef.current;
    if (!pdf || !canvas) return;
    const key = `${currentPage}:${rotation}`;
    let base = baseVpRef.current[key];
    if (!base) {
      try {
        const page = await pdf.getPage(currentPage);
        const vp1 = page.getViewport({ scale: 1, rotation: giroDeLaHoja(page, rotation) });
        base = { width: vp1.width, height: vp1.height };
        baseVpRef.current[key] = base;
      } catch { return; }
    }
    if (!canvasRef.current) return;
    canvasRef.current.style.width = `${base.width * (scale || 1)}px`;
    canvasRef.current.style.height = `${base.height * (scale || 1)}px`;

    // ── EL PUNTO BAJO EL CURSOR SE QUEDA BAJO EL CURSOR ──────────────────
    //
    // EL DEFECTO QUE ESTO CORRIGE (reportado mirando un plano de verdad): al
    // acercarse a un detalle, el detalle se escapaba. La versión anterior
    // calculaba el scroll dentro de un `requestAnimationFrame` disparado
    // JUNTO al cambio de escala — es decir, ANTES de que la hoja creciera. El
    // navegador recortaba ese scroll al máximo del tamaño VIEJO y el ancla se
    // perdía; cuanto más se acercaba, más se iba.
    //
    // Ahora la corrección se aplica AQUÍ, en el instante exacto en que la
    // hoja ya tiene su tamaño nuevo, y se mide contra el rectángulo REAL de
    // la página: así funciona igual esté centrada, con relleno o desbordando
    // — que era el otro motivo por el que fallaba.
    const ancla = anclaRef.current;
    if (ancla && wrapRef.current && containerRef.current) {
      const cont = containerRef.current;
      const r = wrapRef.current.getBoundingClientRect();
      const s = scale || 1;
      const faltaX = (r.left + ancla.ux * s) - ancla.clientX;
      const faltaY = (r.top + ancla.uy * s) - ancla.clientY;

      // Primero el scroll, que es lo natural cuando la hoja desborda...
      const antesX = cont.scrollLeft, antesY = cont.scrollTop;
      cont.scrollLeft = Math.max(0, Math.min(cont.scrollWidth - cont.clientWidth, antesX + faltaX));
      cont.scrollTop = Math.max(0, Math.min(cont.scrollHeight - cont.clientHeight, antesY + faltaY));

      // ...y lo que el scroll no pudo cubrir --porque la hoja cabe entera-- se
      // cubre moviendo la hoja. Con tope: nunca se va más allá de media
      // ventana, para que no se pueda perder de vista.
      const restoX = faltaX - (cont.scrollLeft - antesX);
      const restoY = faltaY - (cont.scrollTop - antesY);
      if (Math.abs(restoX) > 0.5 || Math.abs(restoY) > 0.5) {
        const topeX = cont.clientWidth * 0.5, topeY = cont.clientHeight * 0.5;
        setDesplazamiento(d => ({
          x: Math.max(-topeX, Math.min(topeX, d.x - restoX)),
          y: Math.max(-topeY, Math.min(topeY, d.y - restoY)),
        }));
      }
      anclaRef.current = null;
    }
  }, [currentPage, rotation, scale]);

  // Render nítido de la página actual
  const renderPage = useCallback(async () => {
    const pdf = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas) return;

    if (renderTaskRef.current) {
      try { renderTaskRef.current.cancel(); } catch { /* el render ya terminó */ }
    }

    const renderSequence = ++renderSequenceRef.current;
    setVpInfo(null);
    setPageRendering(true);
    setRenderError('');
    try {
      const page = await pdf.getPage(currentPage);

      const effectiveScale = scale || 1.0;
      const viewport = page.getViewport({ scale: effectiveScale, rotation: giroDeLaHoja(page, rotation) });

      // TOPE DE PÍXELES: sin esto, un plano grande a 8× con dpr 2 pedía un
      // canvas de cientos de megapíxeles → memoria disparada y render lentísimo.
      let dpr = window.devicePixelRatio || 1;
      const wanted = viewport.width * viewport.height * dpr * dpr;
      if (wanted > MAX_CANVAS_PIXELS) {
        dpr = Math.max(0.1, dpr * Math.sqrt(MAX_CANVAS_PIXELS / wanted));
      }

      // DOBLE BÚFER: se dibuja en un canvas FUERA de pantalla y se vuelca de un
      // golpe al visible cuando está terminado. Antes se redimensionaba el
      // canvas visible (lo que lo BLANQUEA al instante) y se pintaba encima:
      // cada cambio de página era un fogonazo en blanco hasta acabar el render.
      // En el visor de Autodesk la página anterior se queda hasta que la nueva
      // está lista, y eso es lo que se replica aquí.
      //
      // UN único búfer reutilizado (no OffscreenCanvas, no uno por render): los
      // planos A0 ya rozan el tope de 16 MP y duplicar picos de memoria por
      // gusto es como se muere un portátil de obra.
      if (!bufferCanvasRef.current) bufferCanvasRef.current = document.createElement('canvas');
      const buffer = bufferCanvasRef.current;
      buffer.width = Math.round(viewport.width * dpr);
      buffer.height = Math.round(viewport.height * dpr);

      const bctx = buffer.getContext('2d');
      bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // El búfer no hereda fondo: se pinta blanco para que un PDF con
      // transparencia no se vuelque sobre basura del render anterior.
      bctx.fillStyle = '#fff';
      bctx.fillRect(0, 0, viewport.width, viewport.height);

      const renderContext = { canvasContext: bctx, viewport };
      renderTaskRef.current = page.render(renderContext);
      await renderTaskRef.current.promise;
      if (renderSequence !== renderSequenceRef.current) return;

      // Volcado atómico: recién aquí se toca el canvas visible.
      canvas.width = buffer.width;
      canvas.height = buffer.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(buffer, 0, 0);

      // Calentar las páginas vecinas: getPage dispara el parseo del contenido,
      // que es la parte lenta al avanzar hoja a hoja por un expediente.
      //
      // OJO: se reutiliza el `pdf` de arriba a propósito. Declarar aquí otro
      // `const pdf` metía la variable en zona muerta para TODO el bloque `try`,
      // así que la línea que hace `pdf.getPage(currentPage)` -- centenares de
      // líneas ANTES -- empezaba a lanzar «Cannot access before initialization»
      // y ninguna página se dibujaba. Lo rompí yo y lo vio el usuario en
      // producción, no una prueba: no hay ninguna que abra un PDF de verdad.
      for (const vecina of [currentPage + 1, currentPage - 1]) {
        if (vecina >= 1 && vecina <= pdf.numPages) pdf.getPage(vecina).catch(() => {});
      }
      // El overlay necesita el viewport vigente para transformar coordenadas PDF<->pantalla
      setVpInfo({ vp: viewport, w: viewport.width, h: viewport.height });
    } catch (err) {
      if (renderSequence === renderSequenceRef.current && err?.name !== 'RenderingCancelledException' && err?.name !== 'RenderingCancelled') {
        console.error('[PDFViewer] Render error:', err);
        setRenderError('No se pudo representar esta página.');
      }
    } finally {
      if (renderSequence === renderSequenceRef.current) setPageRendering(false);
    }
  }, [currentPage, scale, rotation]);

  // Render principal. El debounce se aplica SOLO al zoom (para no rasterizar 15
  // veces en un gesto de rueda). Abrir el documento o cambiar de página rinde
  // AL INSTANTE — meter el retardo ahí era lo que se sentía lento.
  const lastSigRef = useRef('');
  useEffect(() => {
    if (loading || !pdfDocRef.current) return undefined;
    // Sin encuadrar todavia: dibujar ahora seria hacerlo a la escala del
    // plano anterior y repetirlo entero medio segundo despues.
    if (encuadrado !== docNonce) return undefined;
    // El numero del documento entra en la firma: dos planos distintos son
    // ambos «pagina 1», y sin esto el segundo se tomaba por «solo cambio el
    // zoom» y se dibujaba con retardo -- o no se dibujaba.
    const sig = `${docNonce}:${currentPage}:${rotation}`;
    const soloCambioElZoom = sig === lastSigRef.current;
    lastSigRef.current = sig;
    // El cartelito «Actualizando pagina N» aparecia en CADA paso de rueda.
    // Como el lienzo ya se escala al instante y solo despues se redibuja
    // nitido, lo unico que aportaba era un parpadeo encima del plano: eso es
    // el «temblor» al acercar y alejar de golpe. En un cambio de pagina si
    // avisa, porque ahi el usuario espera de verdad.
    setAvisoDeRender(!soloCambioElZoom);

    applyPreviewSize();
    clearTimeout(renderDebounceRef.current);
    if (soloCambioElZoom) {
      renderDebounceRef.current = setTimeout(renderPage, 110);
    } else {
      renderPage(); // primera carga / cambio de página → sin esperar
    }
    return () => clearTimeout(renderDebounceRef.current);
  }, [loading, docNonce, encuadrado, currentPage, rotation, applyPreviewSize, renderPage]);

  // Auto-scroll sidebar thumbnail into view when page changes
  useEffect(() => {
    if (!showSidebar || !sidebarRef.current) return;
    const activeThumb = sidebarRef.current.querySelector(`[data-thumb-page="${currentPage}"]`);
    if (activeThumb) {
      activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentPage, showSidebar]);

  // --- Controles de Navegación ---
  const goToPage = useCallback((p) => {
    const clamped = Math.max(1, Math.min(p, numPages));
    setDesplazamiento({ x: 0, y: 0 });   // cada página entra centrada
    setCurrentPage(clamped);
    setPageDraft(String(clamped));
  }, [numPages]);

  useEffect(() => setPageDraft(String(currentPage)), [currentPage]);

  // ── BÚSQUEDA DENTRO DEL DOCUMENTO ─────────────────────────────────────────
  // Lee el texto que el PDF YA trae, al vuelo y en memoria. No extrae, no sube
  // ni guarda nada: al cerrar el documento se descarta.
  const getPageText = useCallback(async (pageNum) => {
    const cached = textCacheRef.current.get(pageNum);
    if (cached) return cached;
    const page = await pdfDocRef.current.getPage(pageNum);
    const tc = await page.getTextContent();
    textCacheRef.current.set(pageNum, tc.items);
    return tc.items;
  }, []);

  const runSearch = useCallback(async (q) => {
    const needle = normalizeText(q);
    if (needle.length < 2 || !pdfDocRef.current) { setMatches([]); setMatchIdx(0); return; }
    setSearching(true);
    const found = [];
    for (let p = 1; p <= numPages; p++) {
      try {
        const items = await getPageText(p);
        items.forEach((it, i) => {
          if (it.str && normalizeText(it.str).includes(needle)) found.push({ page: p, itemIndex: i });
        });
      } catch { /* página ilegible: seguir con las demás */ }
    }
    setMatches(found);
    setMatchIdx(0);
    setSearching(false);
    if (found.length) setCurrentPage(found[0].page);
  }, [numPages, getPageText]);

  const gotoMatch = useCallback((delta) => {
    if (!matches.length) return;
    const next = (matchIdx + delta + matches.length) % matches.length;
    setMatchIdx(next);
    setCurrentPage(matches[next].page);
  }, [matches, matchIdx]);

  // Rectángulos a resaltar en la página visible (se recalculan con el zoom).
  const highlights = React.useMemo(() => {
    if (!vpInfo || !matches.length) return [];
    const items = textCacheRef.current.get(currentPage);
    if (!items) return [];
    return matches
      .map((m, i) => ({ ...m, globalIdx: i }))
      .filter(m => m.page === currentPage)
      .map(m => {
        const it = items[m.itemIndex];
        if (!it) return null;
        const tx = pdfjsLib.Util.transform(vpInfo.vp.transform, it.transform);
        const h = Math.hypot(tx[2], tx[3]) || 10;
        return {
          key: m.globalIdx,
          active: m.globalIdx === matchIdx,
          left: tx[4],
          top: tx[5] - h,
          width: Math.max(4, (it.width || 0) * (vpInfo.vp.scale || 1)),
          height: h,
        };
      })
      .filter(Boolean);
  }, [matches, matchIdx, currentPage, vpInfo]);

  const zoomIn = useCallback(() => { setFitMode('custom'); setScale(prev => Math.min((prev || 1.0) * 1.2, 8.0)); }, []);
  const zoomOut = useCallback(() => { setFitMode('custom'); setScale(prev => Math.max((prev || 1.0) / 1.2, 0.2)); }, []);

  // Zoom anclado al cursor. Aquí solo se ANOTA el punto en unidades de la
  // hoja (sin escala); la corrección del scroll la aplica `applyPreviewSize`
  // cuando la hoja ya creció — ver el comentario largo de allí.
  const zoomAt = useCallback((dir, clientX, clientY) => {
    const cont = containerRef.current, hoja = wrapRef.current;
    if (!cont || !hoja) { dir > 0 ? zoomIn() : zoomOut(); return; }
    const r = hoja.getBoundingClientRect();
    setFitMode('custom');
    setScale(prev => {
      const next = dir > 0 ? Math.min(prev * 1.2, 8.0) : Math.max(prev / 1.2, 0.2);
      if (next !== prev) {
        anclaRef.current = {
          ux: (clientX - r.left) / prev,   // punto en unidades de PDF
          uy: (clientY - r.top) / prev,
          clientX, clientY,
        };
      }
      return next;
    });
  }, [zoomIn, zoomOut]);

  // Ajustar a página / ancho según el tamaño real del contenedor
  const fitTo = useCallback(async (mode) => {
    const pdf = pdfDocRef.current, cont = containerRef.current;
    if (!pdf || !cont) return;
    try {
      const page = await pdf.getPage(currentPage);
      const vp1 = page.getViewport({ scale: 1, rotation: giroDeLaHoja(page, rotation) });
      const sW = (cont.clientWidth - 64) / vp1.width;
      const sH = (cont.clientHeight - 64) / vp1.height;
      setFitMode(mode);
      setDesplazamiento({ x: 0, y: 0 });   // encuadrar re-centra la hoja
      setScale(Math.max(0.2, mode === 'width' ? sW : Math.min(sW, sH)));
    } catch { /* el documento puede estar cerrándose */ }
  }, [currentPage, rotation]);

  // Al abrir un documento, ajustarlo a la vista (no 100% arbitrario).
  //
  // VA POR `docNonce` Y NO POR `loading`: al reutilizar un documento del
  // almacen, `loading` no llega a cambiar (se pone y se quita en el mismo
  // lote), asi que el plano se quedaba con el zoom del anterior. Segundo
  // defecto de lo mismo, y por eso se corrigen juntos.
  useEffect(() => {
    if (loading || !pdfDocRef.current) return undefined;
    if (encuadradoRef.current === docNonce) return undefined;
    encuadradoRef.current = docNonce;
    let vivo = true;
    (async () => {
      // Si el encuadre falla, NO se puede quedar el plano sin dibujar: se
      // marca igual y se pinta a la escala que haya.
      try { await fitTo('page'); } catch { /* se dibuja igual */ }
      if (vivo) setEncuadrado(docNonce);
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, docNonce]);

  // Mantiene "ajustar a página/ancho" al redimensionar la ventana o el panel.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || fitMode === 'custom' || typeof ResizeObserver === 'undefined') return undefined;
    let timer;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => fitTo(fitMode), 120);
    });
    ro.observe(el);
    return () => { clearTimeout(timer); ro.disconnect(); };
  }, [fitMode, fitTo]);
  const rotateRight = () => setRotation(r => (r + 90) % 360);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      viewerRef.current?.requestFullscreen().catch(err => console.log(err));
    } else {
      document.exitFullscreen();
    }
  };
  // LOS BYTES QUE YA TENEMOS.
  //
  // El lector cargo el PDF entero para dibujarlo: `getData()` los devuelve
  // sin tocar la red. Con ellos se hace un blob de NUESTRO origen, y eso
  // desbloquea las dos cosas que antes obligaban a salir a una pestana de
  // Google: imprimir (un iframe de otro origen no deja llamar a print) y
  // descargar con el nombre real (una URL firmada descarga con el nombre
  // del objeto del almacen, o peor, la abre en el visor del navegador).
  const bytesDelDocumento = async () => {
    const pdf = pdfDocRef.current;
    if (!pdf) return null;
    try {
      const datos = await pdf.getData();
      return new Blob([datos], { type: 'application/pdf' });
    } catch {
      return null;
    }
  };

  // Imprimir: iframe oculto con el blob PROPIO. Se llama a print() en el
  // onload -- hacerlo antes imprimia una hoja en blanco.
  const printDocument = async () => {
    const blob = await bytesDelDocumento();
    if (!blob) { window.open(url, '_blank', 'noopener'); return; }
    const objectUrl = URL.createObjectURL(blob);
    const iframe = document.createElement('iframe');
    Object.assign(iframe.style, { position: 'fixed', right: 0, bottom: 0, width: 0, height: 0, border: 0 });
    iframe.src = objectUrl;
    iframe.onload = () => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch { window.open(objectUrl, '_blank', 'noopener'); }
    };
    document.body.appendChild(iframe);
    // El blob y el iframe viven mientras dure el dialogo de impresion.
    setTimeout(() => {
      try { document.body.removeChild(iframe); } catch { /* ya removido */ }
      URL.revokeObjectURL(objectUrl);
    }, 120000);
  };

  // Descargar: el fichero cae con SU nombre, sin pestana intermedia.
  const [descargando, setDescargando] = useState(false);
  const downloadDocument = async () => {
    setDescargando(true);
    try {
      const blob = await bytesDelDocumento();
      if (!blob) { window.open(url, '_blank', 'noopener'); return; }
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName || 'documento.pdf';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
    } finally {
      setDescargando(false);
    }
  };

  // Fullscreen Listener
  useEffect(() => {
    const handleFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!viewerRef.current?.contains(document.activeElement) && document.activeElement !== document.body) return;
      // Ctrl+F / Cmd+F abre la búsqueda del documento (no la del navegador).
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => document.getElementById('pdf-search-input')?.focus(), 0);
        return;
      }
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target?.tagName) || e.target?.isContentEditable) return;
      if (e.key === 'Escape' && searchOpen) { setSearchOpen(false); return; }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
        e.preventDefault(); goToPage(currentPage - 1);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown') {
        e.preventDefault(); goToPage(currentPage + 1);
      } else if (e.key === 'Home') {
        e.preventDefault(); goToPage(1);
      } else if (e.key === 'End') {
        e.preventDefault(); goToPage(numPages);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault(); zoomIn();
      } else if (e.key === '-') {
        e.preventDefault(); zoomOut();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault(); fitTo('page');
      } else if ((e.ctrlKey || e.metaKey) && e.key === '1') {
        e.preventDefault(); setFitMode('custom'); setScale(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage, numPages, searchOpen, fitTo, goToPage, zoomIn, zoomOut]);

  // Scroll handling: Zoom en Canvas / Cambiar Página en Fondo Gris
  useEffect(() => {
    if (loading || error) return;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    let lastPageChange = 0;

    const handleWheel = (e) => {
      // ZOOM CON LA RUEDA A SECAS, COMO EL VISOR DE AUTODESK.
      //
      // Antes la rueda sobre la hoja exigia Ctrl para hacer zoom, y sin Ctrl no
      // hacia nada (la condicion de arriba cortaba). Quien viene de ACC o de
      // cualquier visor CAD espera rueda = zoom, sin teclas: es el gesto que
      // mas veces se hace al leer un plano. El cambio de pagina con la rueda
      // sobre el fondo gris se conserva tal cual.
      if (wrapRef.current && wrapRef.current.contains(e.target)) {
        // Sobre la hoja: zoom anclado al cursor. Con o sin Ctrl -- Ctrl sigue
        // funcionando para no romper el habito de quien ya lo aprendio.
        e.preventDefault();
        zoomAt(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
      } else if (e.target === container) {
        // Sobre el fondo gris: cambiar de pagina, como siempre.
        e.preventDefault();
        const now = Date.now();
        if (now - lastPageChange < 300) return; // Cooldown de 300ms
        lastPageChange = now;

        if (e.deltaY < 0) {
          setCurrentPage(prev => Math.max(1, prev - 1));
        } else if (e.deltaY > 0) {
          setCurrentPage(prev => Math.min(numPages, prev + 1));
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [loading, error, numPages, zoomAt]);

  // El menu de zoom se cierra como se espera de un menu: Escape o clic fuera.
  useEffect(() => {
    if (!zoomMenuOpen) return;
    const alTeclear = (e) => { if (e.key === 'Escape') setZoomMenuOpen(false); };
    const alPulsar = (e) => {
      if (!e.target.closest || !e.target.closest('[role="menu"]')) setZoomMenuOpen(false);
    };
    document.addEventListener('keydown', alTeclear);
    document.addEventListener('mousedown', alPulsar);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.removeEventListener('mousedown', alPulsar);
    };
  }, [zoomMenuOpen]);

  // --- Click & Drag Panning Logic ---
  const handleMouseDown = (e) => {
    // Con una herramienta activa, el clic sobre la hoja es para dibujar, no para panear
    if (tool !== 'pan' && wrapRef.current && wrapRef.current.contains(e.target)) return;
    // 0 = Click Izquierdo, 1 = Click Rueda (Middle Click)
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault(); // Evitar scroll automático al usar click central
    setIsDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: containerRef.current.scrollLeft,
      scrollTop: containerRef.current.scrollTop
    };
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    containerRef.current.scrollLeft = dragStart.current.scrollLeft - dx;
    containerRef.current.scrollTop = dragStart.current.scrollTop - dy;
  };

  const handleMouseUp = () => setIsDragging(false);

  // --- Render ---
  // SOLO LA PRIMERA VEZ SE VACIA LA PANTALLA.
  //
  // Antes esto era `if (loading)` a secas, y al saltar a otra lamina de la
  // carpeta devolvia la pantalla de carga EN LUGAR DE TODO EL LECTOR: se iban
  // la barra, el mando y LA CINTA, y volvian a construirse. Por eso el salto
  // se sentia en toda la ventana en vez de solo en el plano.
  //
  // Con un documento ya abierto, la carga del siguiente ocurre DENTRO del
  // escenario: la cinta no se entera, y el plano anterior se queda a la vista
  // hasta que el nuevo esta listo -- que es como se comporta ACC.
  if (loading && !huboDocumentoRef.current) {
    return (
      <div style={styles.center} role="status" aria-live="polite">
        <div style={styles.spinner} />
        <div style={{ fontSize: 14, color: '#666', marginTop: 16 }}>
          {progress > 0 && progress < 100 ? `Cargando documento… ${progress}%` : 'Cargando documento PDF…'}
        </div>
        {progress > 0 && progress < 100 && (
          <div style={{ width: 200, height: 4, background: '#e0e0e0', borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: 'var(--accent)', transition: 'width .2s' }} />
          </div>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.center} role="alert">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="#d32f2f">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
        <div style={{ fontSize: 14, color: '#666', marginTop: 12 }}>No se pudo cargar el PDF</div>
        <details className="pdf-error-details">
          <summary>Ver detalle técnico</summary>
          <div>{error}</div>
        </details>
        <div className="pdf-error-actions">
          <button type="button" onClick={() => setRetryNonce(n => n + 1)} style={styles.downloadBtn}>Reintentar</button>
          <a href={url} target="_blank" rel="noopener noreferrer" style={styles.downloadBtn}>Descargar archivo</a>
        </div>
      </div>
    );
  }

  // La identidad se enseña aquí SOLO si nadie la enseña fuera (o si estamos en
  // pantalla completa, donde la cabecera del expediente ya no está).
  const mostrarIdentidad = !hideTitle || isFullscreen;

  return (
    <div ref={viewerRef} className="pdf-viewer" tabIndex={-1} aria-busy={pageRendering}>

      <div className="pdf-topbar" role="toolbar" aria-label="Controles del documento">
        <div className="pdf-topbar__left">
          <button className="pdf-ico" onClick={() => setShowSidebar(!showSidebar)}
            aria-label="Panel de miniaturas" aria-pressed={showSidebar} title="Miniaturas de páginas">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <button className="pdf-ico" aria-label="Buscar en el documento" aria-pressed={searchOpen}
            title="Buscar en el documento (Ctrl+F)"
            onClick={() => { setSearchOpen(o => !o); setTimeout(() => document.getElementById('pdf-search-input')?.focus(), 0); }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>
          </button>

          {searchOpen ? (
            <div className="pdf-search">
              <input id="pdf-search-input" value={searchQuery} placeholder="Buscar en el documento…"
                onChange={e => {
                  const v = e.target.value;
                  setSearchQuery(v);
                  if (busquedaVivaRef.current) clearTimeout(busquedaVivaRef.current);
                  busquedaVivaRef.current = setTimeout(() => {
                    if (v.trim().length >= 2) runSearch(v);
                    else { setMatches([]); setMatchIdx(0); }
                  }, 300);
                }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); matches.length ? gotoMatch(e.shiftKey ? -1 : 1) : runSearch(searchQuery); }
                  if (e.key === 'Escape') setSearchOpen(false);
                }} />
              <span className="pdf-search__count">
                {searching ? 'Buscando…'
                  : matches.length ? `${matchIdx + 1} de ${matches.length}`
                  : searchQuery.trim().length >= 2 ? 'Sin resultados' : ''}
              </span>
              <button onClick={() => gotoMatch(-1)} disabled={!matches.length} title="Anterior (Shift+Enter)">‹</button>
              <button onClick={() => gotoMatch(1)} disabled={!matches.length} title="Siguiente (Enter)">›</button>
            </div>
          ) : mostrarIdentidad && (
            <div className="pdf-ident">
              {versionLabel && (onVersionClick ? (
                <button className="pdf-chip-ver pdf-chip-ver--menu" onClick={onVersionClick}
                  title="Ver el historial de versiones">
                  {versionLabel}
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                </button>
              ) : (
                <span className="pdf-chip-ver" title={versionInfo || versionLabel}>{versionLabel}</span>
              ))}
              <span className="pdf-file-title" title={fileName}>{fileName}</span>
              {versionInfo && <span className="pdf-meta">{versionInfo}</span>}
            </div>
          )}
        </div>

        <div className="pdf-topbar__center">
          <div className="pdf-pagenav">
            <button className="pdf-ico" aria-label="Página anterior" title="Página anterior"
              onClick={() => goToPage(currentPage - 1)} disabled={currentPage <= 1}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M15 5l-7 7 7 7"/></svg></button>
            <input aria-label="Número de página" inputMode="numeric" type="number"
              value={pageDraft} min={1} max={numPages}
              onChange={(e) => setPageDraft(e.target.value)}
              onBlur={() => goToPage(Number(pageDraft) || currentPage)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); goToPage(Number(pageDraft) || currentPage); e.currentTarget.blur(); }
                if (e.key === 'Escape') { setPageDraft(String(currentPage)); e.currentTarget.blur(); }
              }} />
            <span>de {numPages}</span>
            <button className="pdf-ico" aria-label="Página siguiente" title="Página siguiente"
              onClick={() => goToPage(currentPage + 1)} disabled={currentPage >= numPages}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7"/></svg></button>
          </div>
        </div>

        <div className="pdf-topbar__right">
          {alEscritorio && (
            <button className="pdf-ico pdf-escritorio" onClick={alEscritorio}
              title={`Abrir en ${appEscritorio?.nombre || 'el escritorio'}`}>
              <span className="pdf-escritorio-sello"
                style={{ background: appEscritorio?.color || '#5B6875' }}>
                {appEscritorio?.letra || 'P'}
              </span>
            </button>
          )}
          <button className="pdf-ico" onClick={printDocument} title="Imprimir"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6"/><rect x="4" y="9" width="16" height="7" rx="1.5"/><path d="M7 16h10v5H7z"/></svg></button>
          <button className="pdf-ico" onClick={downloadDocument} disabled={descargando}
            title={`Descargar ${fileName}`}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4v11M8 12l4 4 4-4"/><path d="M4 19h16"/></svg></button>
          <span className="pdf-sep" />
          <button className="pdf-ico" onClick={toggleFullscreen}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}>
            {isFullscreen ? <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg> : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>}
          </button>

          {onClose && (
            <>
              <span className="pdf-sep" />
              <button className="pdf-ico" onClick={onClose} title="Cerrar documento" aria-label="Cerrar documento">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="1.7" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="pdf-body">
        {showSidebar && (
          <div ref={sidebarRef} className="pdf-sidebar" aria-label="Miniaturas de páginas">
            {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
              <Thumbnail key={pageNum} pdf={pdfDocRef.current} pageNum={pageNum}
                isActive={currentPage === pageNum} onClick={() => goToPage(pageNum)} />
            ))}
          </div>
        )}

        <div className="pdf-stage">
          <div ref={containerRef} className="pdf-canvas-container"
            style={{ cursor: tool === 'pan' ? (isDragging ? 'grabbing' : 'grab') : 'crosshair' }}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

            {/* LA ESPERA, VISIBLE Y CON SUS TRES FASES REALES.
                Abrir un plano no es un paso, son tres, y cada uno se siente
                distinto: pedir el permiso de lectura (corto, sin porcentaje
                posible), bajar el fichero (medible, de ahi la barra que
                avanza) y dibujarlo (el mas largo en un A1, y tampoco medible).
                Ensenar las tres por separado es lo que quita la sensacion de
                que la aplicacion se colgo: se ve que algo pasa Y en que va. */}
            {mostrarEspera && (
              <div className="pdf-progreso" role="status" aria-live="polite">
                <div className={`pdf-progreso-barra${
                  loading && progress > 0 && progress < 100 ? '' : ' es-indefinida'}`}
                  style={loading && progress > 0 && progress < 100
                    ? { width: `${progress}%` } : undefined} />
              </div>
            )}

            {mostrarEspera && (
              <div className="pdf-render-status" role="status" aria-live="polite">
                <span className="pdf-girador" aria-hidden="true" />
                {preparando ? 'Preparando el documento…'
                  : loading ? (progress > 0 && progress < 100
                      ? `Descargando… ${progress}%` : 'Descargando…')
                  : 'Dibujando el plano…'}
              </div>
            )}
            {renderError && (
              <div className="pdf-render-error" role="alert">
                <span>{renderError}</span>
                <button type="button" onClick={renderPage}>Reintentar</button>
              </div>
            )}

            <div className="pdf-page-pad">
              <div ref={wrapRef}
                // ATENUADO HASTA QUE EL PLANO NUEVO ESTA PINTADO, no hasta
                // que termina la descarga. Soltarlo antes hacia lo que el
                // dueno describio: el plano viejo se AVIVABA y un instante
                // despues saltaba al nuevo -- dos movimientos donde deberia
                // haber uno. Ahora se aclara justo cuando aparece el nuevo.
                className={`pdf-page${mostrarEspera && ocupado ? ' esta-vieja' : ''}`}
                style={{ transform: `translate(${desplazamiento.x}px, ${desplazamiento.y}px)` }}>
                <canvas ref={canvasRef} />
                {highlights.map(h => (
                  <div key={h.key} style={{
                    position: 'absolute', pointerEvents: 'none',
                    left: h.left, top: h.top, width: h.width, height: h.height,
                    background: h.active ? 'rgba(255,145,0,0.55)' : 'rgba(255,235,59,0.38)',
                    outline: h.active ? '1px solid #ff6d00' : 'none', borderRadius: 2,
                  }} />
                ))}
                {nodeId && vpInfo && (
                  <PdfToolsOverlay vpInfo={vpInfo} page={currentPage} nodeId={nodeId}
                    projectPrefix={projectPrefix} tool={tool} setTool={setTool}
                    color={markupColor} userName={userName} />
                )}
              </div>
            </div>
          </div>

        {nodeId && (
            <div className="pdf-rail" role="toolbar" aria-label="Herramientas de medición y anotación">
              {GRUPOS_DE_HERRAMIENTAS.map(grupo => (
                <div key={grupo.nombre} className="pdf-rail__group">
                  {grupo.items.map(t => (
                    <button key={t.id} className="pdf-rail-btn" title={t.title}
                      aria-label={t.title} aria-pressed={tool === t.id}
                      onClick={() => setTool(prev => prev === t.id ? 'pan' : t.id)}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
                    </button>
                  ))}
                  {grupo.nombre === 'anotar' && (
                    <span style={{ position: 'relative' }}>
                      <button className="pdf-swatch" title="Color de anotación"
                        aria-haspopup="true" aria-expanded={colorOpen}
                        onClick={() => setColorOpen(o => !o)}>
                        <i style={{ background: markupColor }} />
                      </button>
                      {colorOpen && (
                        <div className="pdf-colors" role="menu">
                          {COLORS.map(c => (
                            <button key={c} style={{ background: c }} aria-pressed={markupColor === c}
                              aria-label={'Color ' + c} title={c}
                              onClick={() => { setMarkupColor(c); setColorOpen(false); }} />
                          ))}
                        </div>
                      )}
                    </span>
                  )}
                </div>
              ))}
            </div>
        )}

          {/* El zoom FLOTA sobre la hoja: no le roba una barra al alto útil. */}
          <div className="pdf-dock">
            {/* SIN CONTROLES DE ZOOM. El dueno los retiro enteros -- lupas,
                porcentaje y menu de saltos fijos: el zoom se hace con la rueda
                y el encuadre con los dos botones de ajuste que siguen abajo.
                Los atajos de teclado y `fitTo` se mantienen intactos. */}
            <div className="pdf-dock__group">
              <button className="pdf-ico" onClick={() => fitTo('page')}
                aria-pressed={fitMode === 'page'} title="Ajustar página (Ctrl+0)"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M9 9l-2 2 2 2M15 9l2 2-2 2"/></svg></button>
              <button className="pdf-ico" onClick={() => fitTo('width')}
                aria-pressed={fitMode === 'width'} title="Ajustar ancho"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/></svg></button>
            {/* Las medidas del papel (841 x 594 mm) tambien se retiraron a
                peticion del dueno: en una carpeta de planos del mismo formato
                repetian el mismo dato en cada uno. */}
            <span className="pdf-sep" />
            {hermanos.length > 1 && onAbrirHermano && (
              <>
                <span className="pdf-sep" />
                <button className="pdf-ico" onClick={() => irAHermano(-1)}
                  disabled={indiceActual <= 0} title="Documento anterior de la carpeta">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                </button>
                <button className="pdf-ico pdf-tira-boton" onClick={() => setTiraAbierta(v => !v)}
                  aria-pressed={tiraAbierta}
                  title={`Documentos de la carpeta (${hermanos.length})`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="3" y="3" width="8" height="8" rx="1.5"/>
                    <rect x="13" y="3" width="8" height="8" rx="1.5"/>
                    <rect x="3" y="13" width="8" height="8" rx="1.5"/>
                    <rect x="13" y="13" width="8" height="8" rx="1.5"/>
                  </svg>
                </button>
                <button className="pdf-ico" onClick={() => irAHermano(1)}
                  disabled={indiceActual < 0 || indiceActual >= hermanos.length - 1}
                  title="Documento siguiente de la carpeta">
                  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                </button>
              </>
            )}
            <span className="pdf-sep" />
            <button className="pdf-ico" onClick={rotateRight} title="Girar 90°">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>
              </svg>
            </button>
            </div>
          </div>

          {tiraAbierta && hermanos.length > 1 && onAbrirHermano && (
            <div className="pdf-tira">
              <div className="pdf-tira-cabecera">
                <span>{hermanos.length} documentos en esta carpeta</span>
                {/* El boton «Preparar las que falten» se retiro a peticion del
                    dueno: las miniaturas ya se generan solas al abrir la
                    carpeta, asi que pedirlas a mano sobraba. */}
                <button className="pdf-tira-cerrar" onClick={() => setTiraAbierta(false)}
                  title="Cerrar la tira">✕</button>
              </div>
              <div className="pdf-tira-carril" ref={carrilRef}>
                {hermanos.map(h => (
                  <button key={h.id || h.name} title={h.name}
                    className={`pdf-tira-item${h.name === fileName ? ' es-actual' : ''}`
                      + (h.name === saltandoA ? ' esta-abriendo' : '')}
                    onClick={() => {
                      if (h.name === fileName) return;
                      // Interpretar un plano lleva segundos. Sin senal, el clic
                      // parecia no hacer nada y la gente pulsaba otra vez.
                      setSaltandoA(h.name);
                      onAbrirHermano(h);
                    }}>
                    <div className="pdf-tira-lienzo">
                      {minisTira[h.gcs_urn]
                        ? <img src={minisTira[h.gcs_urn]} alt="" loading="lazy" />
                        : <div className="pdf-tira-vacio" />}
                    </div>
                    <div className="pdf-tira-nombre">{h.name}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {nodeId && tool !== 'pan' && (
            <div className="pdf-tool-hint">{HINTS[tool]} · Esc cancela</div>
          )}
        </div>
      </div>
    </div>
  );
}

// Estilos en línea: solo los estados SIN chrome (carga y error). Todo lo
// demás vive en PDFViewer.css, con clases.
const styles = {
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', gap: 4, background: 'var(--alephia-mist, #F3F6F8)' },
  spinner: { width: 36, height: 36, border: '3px solid #e0e0e0', borderTop: '3px solid var(--accent)', borderRadius: '50%', animation: 'spin-acc 1s linear infinite' },
  downloadBtn: { marginTop: 16, padding: '8px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, textDecoration: 'none', fontSize: 13, fontWeight: 500 },
};
