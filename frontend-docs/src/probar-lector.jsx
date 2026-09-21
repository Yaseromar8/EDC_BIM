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
import React, { useState, useCallback, useEffect, useRef } from 'react';
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

// MOSAICOS (paso 2, docs/archivos/15): `?mosaico=1` da mosaico a TODAS las
// laminas del banco por el camino de produccion (la ruta /api/docs/mosaico,
// simulada abajo sobre el servidor de mosaicos local, puerto 5190). Sin el
// parametro, el banco es exactamente el lector de hoy, que es contra lo que hay
// que compararlo.
const MOSAICO = new URLSearchParams(window.location.search).get('mosaico') === '1';
// `?frio=1`: la PRIMERA VEZ de verdad (20-sep-2026, el propietario: «ese link es de un
// archivo ya cargado»). Cada URL --teselas y PDF-- lleva una marca unica, asi el navegador
// no puede sacar nada de su cache y lo baja todo como si nunca hubiera visto la lamina.
const FRIO = new URLSearchParams(window.location.search).get('frio') === '1';
const MARCA_FRIA = FRIO ? `?frio=${Date.now()}` : '';

// Lo que tarda el backend en devolver la URL firmada. Medido en produccion
// entre 300 y 800 ms; se usa el punto medio.
//
// `?pdf=<ms>` lo alarga a proposito: en el banco el PDF es local y llega en un
// suspiro, asi que no se ve lo que de verdad pasa en produccion, donde la
// lamina de 71,9 MB tarda decenas de segundos (20-sep-2026, el propietario:
// «¿que pasa si abro recien el archivo?»). Con `?pdf=30000` el lector se queda
// sin PDF 30 segundos: lo que se vea en ese rato es lo que dan los mosaicos.
const MS_URL_FIRMADA = Number(new URLSearchParams(window.location.search).get('pdf')) || 500;

// P1 · `?inicial=vacio` arranca SIN lector, como el explorador antes de abrir
// un documento: asi la primera apertura se mide con el lienzo limpio y no con
// la lamina anterior todavia puesta (que falsea «primera tinta» y los bordes).
const EMPIEZA_VACIO = new URLSearchParams(window.location.search).get('inicial') === 'vacio';

// Con `?mosaico=1` el banco arranca YA en la lamina pesada (plano-P): es la
// unica que tiene mosaico preparado y es la que se quiere mirar.
const INICIAL = MOSAICO ? PLANOS.findIndex(p => p.id === 'p') : 0;

const PDF_RETRASADO = MS_URL_FIRMADA > 1500;   // apertura en frio simulada

function Banco() {
  const [i, setI] = useState(INICIAL);
  const [abierto, setAbierto] = useState(!EMPIEZA_VACIO);
  const [url, setUrl] = useState(EMPIEZA_VACIO || PDF_RETRASADO ? null : PLANOS[INICIAL].url);
  // Con `?pdf=<ms>` la URL del PDF se entrega tarde, como en produccion.
  useEffect(() => {
    if (!PDF_RETRASADO || EMPIEZA_VACIO) return undefined;
    const t = setTimeout(() => setUrl(PLANOS[INICIAL].url + MARCA_FRIA), MS_URL_FIRMADA);
    return () => clearTimeout(t);
  }, []);
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
      // Paso B: el mosaico llega por el MISMO camino que en produccion (la ruta
      // /api/docs/mosaico, simulada abajo sobre el servidor de mosaicos local).
      alEstadoMosaico={(e) => {
        window.__mosaico = e;
        const r = document.getElementById('mosaico');
        if (r) r.textContent = `mosaico z${e.nivel}/${e.niveles - 1} · ${e.pxPorMm} px/mm reales`
          + (e.pxPorMm > e.tope ? ` · POR ENCIMA DEL ULTIMO NIVEL (${e.tope})` : '')
          + ` · ${e.teselas} teselas` + (e.faltan ? ` · ${e.faltan} pedidas` : '');
      }}
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

// PASO B · LA RUTA DEL MOSAICO (/api/docs/mosaico), SIMULADA sobre el servidor
// de mosaicos local (backend/herramientas/servidor_mosaicos_local.py, puerto
// 5190). El lector va por el MISMO camino que en produccion
// (utils/mosaicoRemoto.js): pide el manifiesto --con las URL de los niveles
// preparados-- y las de los profundos al llegar a ellos. Sin `?mosaico=1`
// contesta «sin mosaico» y el banco es el lector de hoy.
//
//   ?api=<ms>     ida y vuelta al servidor (por defecto 300: Lima-Render).
//   ?dibujo=<ms>  lo que tarda el servidor en dibujar CADA tesela profunda la
//                 primera vez, de una en una por lamina, como en produccion
//                 (1 CPU). Por defecto 0: el servidor local dibuja con cuatro
//                 procesos y mucho mas rapido que Render.
const SERVIDOR_MOSAICOS = 'http://127.0.0.1:5190/mosaico';
const MS_API = Number(new URLSearchParams(window.location.search).get('api')) || 300;
const MS_DIBUJO = Number(new URLSearchParams(window.location.search).get('dibujo')) || 0;
const manifiestos = {};
const yaDibujadas = new Set();
let turnoDeDibujo = Promise.resolve();
const esperar = (ms) => new Promise(listo => setTimeout(listo, ms));
const comoJson = (d) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });

async function rutaDelMosaico(opciones) {
  let cuerpo = {};
  try { cuerpo = JSON.parse(opciones && opciones.body) || {}; } catch { /* sin cuerpo */ }
  // Cada llamada, apuntada: asi se cuentan las peticiones que haria el lector.
  const apunte = { t: Math.round(performance.now()), z: cuerpo.z ?? null, n: (cuerpo.teselas || []).length };
  (window.__rutaMosaico = window.__rutaMosaico || []).push(apunte);
  const respuesta = await rutaDelMosaicoSimulada(cuerpo);
  apunte.ms = Math.round(performance.now()) - apunte.t;
  return respuesta;
}

async function rutaDelMosaicoSimulada(cuerpo) {
  const plano = PLANOS.find(p => 'banco-' + p.id === cuerpo.node_id);
  const sin = { success: true, manifiesto: null, urls: {}, pendiente: false };
  if (!MOSAICO || !plano) { await esperar(MS_API); return comoJson(sin); }
  const carpeta = `${SERVIDOR_MOSAICOS}/${plano.name.replace(/\.pdf$/i, '')}`;
  const url = (z, x, y) => `${carpeta}/z${z}/${x}_${y}.webp${MARCA_FRIA}`;

  if (cuerpo.z === undefined || cuerpo.z === null) {
    const [man] = await Promise.all([
      fetchReal(`${carpeta}/mosaico.json${MARCA_FRIA}`).then(r => (r.ok ? r.json() : null)).catch(() => null),
      esperar(MS_API),
    ]);
    if (!man) return comoJson(sin);
    manifiestos[plano.id] = man;
    // Como el servidor (mosaicos_almacen.teselas_preparadas): solo los niveles
    // preparados que caben ENTEROS en 64 teselas -- z0 y z1; las de z2 se
    // piden al llegar a el.
    const urls = {};
    let cuantas = 0;
    for (const z of [...(man.preparados || [])].sort((a, b) => a - b)) {
      const n = man.niveles[z];
      if (cuantas + n.columnas * n.filas > 64) break;
      cuantas += n.columnas * n.filas;
      for (let y = 0; y < n.filas; y += 1) for (let x = 0; x < n.columnas; x += 1) urls[`${z}/${x}_${y}`] = url(z, x, y);
    }
    return comoJson({ success: true, manifiesto: man, urls, pendiente: false });
  }

  // Las teselas de un nivel: como el servidor, contesta cuando ya estan
  // dibujadas (las profundas, la primera vez, de una en una por lamina).
  const z = Number(cuerpo.z);
  const teselas = (cuerpo.teselas || []).slice(0, 64);
  const man = manifiestos[plano.id];
  const preparado = man && (man.preparados || []).includes(z);
  const nuevas = preparado ? [] : teselas.filter(([x, y]) => !yaDibujadas.has(`${plano.id}/${z}/${x}_${y}`));
  const turno = turnoDeDibujo.then(() => esperar(nuevas.length * MS_DIBUJO));
  turnoDeDibujo = turno;
  await Promise.all([
    turno,
    ...teselas.map(([x, y]) => fetchReal(url(z, x, y)).then(r => r.blob()).catch(() => null)),
    esperar(MS_API),
  ]);
  nuevas.forEach(([x, y]) => yaDibujadas.add(`${plano.id}/${z}/${x}_${y}`));
  const urls = {};
  teselas.forEach(([x, y]) => { urls[`${z}/${x}_${y}`] = url(z, x, y); });
  return comoJson({ success: true, urls, pendiente: false });
}

window.fetch = (entrada, opciones) => {
  const dir = typeof entrada === 'string' ? entrada : (entrada && entrada.url) || '';
  if (dir.includes('/api/docs/mosaico')) return rutaDelMosaico(opciones);
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
