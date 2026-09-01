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
];

// Lo que tarda el backend en devolver la URL firmada. Medido en produccion
// entre 300 y 800 ms; se usa el punto medio.
const MS_URL_FIRMADA = 500;

function Banco() {
  const [i, setI] = useState(0);
  const [url, setUrl] = useState(PLANOS[0].url);
  const [preparando, setPreparando] = useState(false);
  const t0 = useRef(0);

  const saltar = useCallback((destino) => {
    if (destino === i) return;
    t0.current = performance.now();
    document.getElementById('reloj').textContent = 'pedido…';
    setI(destino);
    // EL PADRE NO BORRA LA URL: mantiene la anterior mientras pide la nueva,
    // que es lo que evita que el lector se desmonte (y con el, la cinta).
    setPreparando(true);
    setTimeout(() => {
      setUrl(PLANOS[destino].url);
      setPreparando(false);
    }, MS_URL_FIRMADA);
  }, [i]);

  window.irA = saltar;

  return (
    <PDFViewer
      url={url}
      fileName={PLANOS[i].name}
      preparando={preparando}
      hermanos={PLANOS}
      onAbrirHermano={(d) => saltar(PLANOS.findIndex(p => p.name === d.name))}
      obraDelDocumento="banco"
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
const fetchReal = window.fetch.bind(window);
window.fetch = (entrada, opciones) => {
  const dir = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
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
      },
      pendientes: [],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  }
  return fetchReal(entrada, opciones);
};

createRoot(document.getElementById('raiz')).render(<Banco />);
