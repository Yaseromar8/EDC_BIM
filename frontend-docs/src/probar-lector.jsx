/**
 * BANCO DE PRUEBAS DEL LECTOR DE PLANOS.
 *
 * Monta el PDFViewer DE VERDAD con planos reales de obra y reproduce la
 * cadena completa que ocurre al saltar de lamina: primero el padre pide la
 * URL firmada (unos cientos de milisegundos en los que `preparando` esta
 * encendido y la URL sigue siendo la anterior) y luego la entrega.
 *
 * POR QUE EXISTE: el portal no tiene banco de pruebas, y en una sola sesion se
 * colaron tres fallos que el `npm run build` da por buenos porque solo
 * aparecen al EJECUTAR -- una variable en zona muerta que reventaba el
 * explorador entero, un plano que no se redibujaba nunca, y un doble
 * dibujado. Esta pagina no entra en produccion: vite solo construye
 * index.html.
 *
 * Se abre con el servidor de desarrollo en /probar-lector.html
 * (necesita planos en public/_probar/: plano-A.pdf, plano-B.pdf, plano-C.pdf).
 */
import React, { useState, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import PDFViewer from './components/PDFViewer';
import './index.css';

const PLANOS = [
  { id: 'a', name: 'plano-A.pdf', gcs_urn: 'urn-a', url: '/_probar/plano-A.pdf' },
  { id: 'b', name: 'plano-B.pdf', gcs_urn: 'urn-b', url: '/_probar/plano-B.pdf' },
  { id: 'c', name: 'plano-C.pdf', gcs_urn: 'urn-c', url: '/_probar/plano-C.pdf' },
  { id: 'd', name: 'plano-D.pdf', gcs_urn: 'urn-d', url: '/_probar/plano-D.pdf' },
  { id: 'e', name: 'plano-E.pdf', gcs_urn: 'urn-e', url: '/_probar/plano-E.pdf' },
  { id: 'f', name: 'plano-F.pdf', gcs_urn: 'urn-f', url: '/_probar/plano-F.pdf' },
  { id: 'g', name: 'plano-G.pdf', gcs_urn: 'urn-g', url: '/_probar/plano-G.pdf' },
  { id: 'h', name: 'plano-H.pdf', gcs_urn: 'urn-h', url: '/_probar/plano-H.pdf' },
  // DOS PAGINAS (A y G juntos): para comprobar que la rueda no cambia de pagina.
  { id: 'i', name: 'plano-I.pdf', gcs_urn: 'urn-i', url: '/_probar/plano-I.pdf' },
  // LA LAMINA PESADA de verdad (paisajismo 004120, 71,9 MB): la que tarda
  // 33-43 s en produccion. Es la que mide P1.
  { id: 'p', name: 'plano-P.pdf', gcs_urn: 'urn-p', url: '/_probar/plano-P.pdf' },
];

// P1 · que vista previa sirve el banco: ?vista=2000 (por defecto), 1600, 2600,
// 3200, 2000webp, o `off` para medir el lector tal como esta hoy.
const VISTA = new URLSearchParams(window.location.search).get('vista') || '2000';
const FICHERO_DE_VISTA = {
  1600: '/_probar/vista-p-1600.jpg',
  2000: '/_probar/vista-p-2000.jpg',
  2600: '/_probar/vista-p-2600.jpg',
  3200: '/_probar/vista-p-3200.jpg',
  '2000webp': '/_probar/vista-p-2000.webp',
}[VISTA] || null;

// Lo que tarda el backend en devolver la URL firmada. Medido en produccion
// entre 300 y 800 ms; se usa el punto medio.
const MS_URL_FIRMADA = 500;

// P1 · `?inicial=vacio` arranca SIN lector, como el explorador antes de abrir
// un documento: asi la primera apertura se mide con el lienzo limpio y no con
// la lamina anterior todavia puesta (que falsea «primera tinta» y los bordes).
const EMPIEZA_VACIO = new URLSearchParams(window.location.search).get('inicial') === 'vacio';

function Banco() {
  const [i, setI] = useState(0);
  const [abierto, setAbierto] = useState(!EMPIEZA_VACIO);
  const [url, setUrl] = useState(EMPIEZA_VACIO ? null : PLANOS[0].url);
  const [preparando, setPreparando] = useState(false);
  const t0 = useRef(0);

  const saltar = useCallback((destino) => {
    // P1 · `irA(-1)` cierra el documento, como el aspa del explorador: asi se
    // puede medir la reapertura sin añadir otra variable global al banco.
    if (destino < 0) { setAbierto(false); setUrl(null); return; }
    if (destino === i && abierto) return;
    t0.current = performance.now();
    document.getElementById('reloj').textContent = 'pedido…';
    setI(destino);
    setAbierto(true);
    // EL PADRE NO BORRA LA URL: mantiene la anterior mientras pide la nueva,
    // que es lo que evita que el lector se desmonte (y con el, la cinta).
    setPreparando(true);
    setTimeout(() => {
      setUrl(PLANOS[destino].url);
      setPreparando(false);
    }, MS_URL_FIRMADA);
  }, [i, abierto]);

  window.irA = saltar;

  if (!abierto) return <div className="banco-vacio" />;

  return (
    <PDFViewer
      url={url}
      fileName={PLANOS[i].name}
      preparando={preparando}
      hermanos={PLANOS}
      onAbrirHermano={(d) => saltar(PLANOS.findIndex(p => p.name === d.name))}
      obraDelDocumento="banco"
      // Con nodo, el lector monta su capa de marcas: asi se ve si siguen a la
      // hoja durante el zoom. Las marcas las sirve el fetch simulado de abajo.
      nodeId={'banco-' + PLANOS[i].id}
      projectPrefix="banco"
      onClose={() => {}}
      versionLabel="V1"
    />
  );
}

// El reloj mide desde el clic hasta que el lienzo tiene contenido nuevo.
let ultimoTrazo = '';
setInterval(() => {
  const c = document.querySelector('.pdf-page canvas');
  if (!c || !c.width) return;
  const firma = `${c.width}x${c.height}`;
  if (firma !== ultimoTrazo) {
    ultimoTrazo = firma;
    const r = document.getElementById('reloj');
    if (r && r.textContent === 'pedido…') r.textContent = 'dibujado';
  }
}, 60);

// EL ENDPOINT DE MINIATURAS, SIMULADO.
//
// El banco no tiene backend, y la silueta se alimenta de las URLs firmadas que
// devuelve /api/docs/miniaturas/urls. Aqui se responde con imagenes locales
// generadas EXACTAMENTE como las genera el servidor (primera pagina a 420 px),
// asi que lo que se prueba es el camino REAL del componente y no un atajo.
// MARCAS DE MENTIRA, en coordenadas PDF de la hoja A1 (2384 x 1684 pt): un
// marco, un conteo en el centro, una medida y una nube.
const MARCAS_DEL_BANCO = [
  { id: 'm1', page: 1, kind: 'rect', geometry: { x: 1000, y: 700, w: 300, h: 200 }, style: { color: '#e53935' } },
  { id: 'm2', page: 1, kind: 'count', geometry: { p: [1192, 842] }, style: { color: '#1e88e5' } },
  { id: 'm3', page: 1, kind: 'measure', geometry: { points: [[200, 200], [800, 200], [800, 500]] }, style: { color: '#43a047' } },
  { id: 'm4', page: 1, kind: 'cloud', geometry: { x: 1600, y: 1100, w: 400, h: 250 }, style: { color: '#fb8c00' } },
];

const fetchReal = window.fetch.bind(window);
window.fetch = (entrada, opciones) => {
  const dir = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
  if (dir.includes('/api/pdf/markups')) {
    return Promise.resolve(new Response(JSON.stringify({ success: true, markups: MARCAS_DEL_BANCO }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  if (dir.includes('/api/pdf/calibration')) {
    return Promise.resolve(new Response(JSON.stringify({ success: true, calibrations: {} }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  // P1 · LA VISTA PREVIA LEGIBLE, simulada con la misma espera que la URL
  // firmada (500 ms, medido en produccion). Solo la lamina pesada tiene.
  if (dir.includes('/api/docs/vista-previa/url')) {
    const nodo = (() => { try { return JSON.parse(opciones && opciones.body).node_id; } catch { return null; } })();
    const url = nodo === 'banco-p' ? FICHERO_DE_VISTA : null;
    return new Promise(resolve => setTimeout(() => resolve(new Response(
      JSON.stringify({ success: true, url, pendiente: false }),
      { status: 200, headers: { 'Content-Type': 'application/json' } })), MS_URL_FIRMADA));
  }
  if (dir.includes('/api/docs/miniaturas/urls')) {
    return Promise.resolve(new Response(JSON.stringify({
      success: true,
      urls: {
        'urn-a': '/_probar/thumb-a.jpg',
        'urn-b': '/_probar/thumb-b.jpg',
        'urn-c': '/_probar/thumb-c.jpg',
        'urn-d': '/_probar/thumb-d.jpg',
        'urn-e': '/_probar/thumb-e.jpg',
        'urn-f': '/_probar/thumb-f.jpg',
        'urn-g': '/_probar/thumb-g.jpg',
        'urn-h': '/_probar/thumb-h.jpg',
        'urn-p': '/_probar/thumb-p.jpg',
      },
      pendientes: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return fetchReal(entrada, opciones);
};

createRoot(document.getElementById('raiz')).render(<Banco />);
