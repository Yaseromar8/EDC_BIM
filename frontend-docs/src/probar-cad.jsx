/**
 * BANCO · la ESPERA del visor CAD, con Autodesk de mentira.
 *
 * ALCANCE — y su límite, declarado por delante:
 *
 *   SE MIDE DE VERDAD  el envoltorio real de `CadViewer`: fases, textos,
 *                      porcentajes, contador, reintentos del sondeo, error con
 *                      detalle y botón de reintentar, y el selector de vistas.
 *
 *   NO SE MIDE AQUÍ    nada del motor LMV -- zoom, encuadre, órbita, ViewCube,
 *                      selección, propiedades, capas. `window.Autodesk` es un
 *                      SUSTITUTO. Para medir eso hace falta un modelo traducido
 *                      de verdad y un token de APS, que no salen de un banco.
 *
 * Esa frontera es el motivo de este fichero: la mitad que SÍ se puede ejecutar
 * sin credenciales se ejecuta, y la otra queda marcada como no medida en vez de
 * deducida leyendo código.
 *
 * PALANCAS
 *   window.__guionEstado   la secuencia que devolverá /api/docs/cad/status
 *   window.__msPorSondeo   cuánto tarda cada respuesta del backend
 *   window.__vistas        las vistas que traerá el «documento»
 *   window.__fallarStatus  cuántas consultas de estado mueren (prueba el aguante)
 *
 * No entra en producción: `vite.config.js` no lo conoce.
 */
/* eslint-disable react-refresh/only-export-components -- banco: se construye
   como produccion, sin HMR ni React Refresh (ver vite.banco.config.js). */
import React from 'react';
import { createRoot } from 'react-dom/client';
import CadViewer from './components/CadViewer';
import './index.css';

const t0 = Date.now();
window.__registro = [];
const anotar = (l) => window.__registro.push({ ms: Date.now() - t0, l });

window.__msPorSondeo = 300;
window.__fallarStatus = 0;
window.__guionEstado = [
  { status: 'pending', progress: '5% complete' },
  { status: 'pending', progress: '25% complete' },
  { status: 'pending', progress: '60% complete' },
  { status: 'pending', progress: '90% complete' },
  { status: 'success', urn: 'dXJuOmJhbmNv' },
];
// LA FORMA REAL DE LOS DOCUMENTOS, volcada de producción. Lo importante es que
// en un DWG la vista del espacio modelo NO se llama «Model»: se llama «2D View»
// y lo que la identifica es `viewableID`. Un banco con una vista llamada «Model»
// probaría mi suposición en lugar del servidor.
const FIXTURES = {
  dwg: [
    { guid: 'g-2d', name: '2D View', role: '2d', viewableID: 'Model', padre: 'Model' },
    { guid: 'g-3d', name: '3D View', role: '3d', viewableID: 'Model-3D', padre: 'Model' },
    { guid: 'g-l1', name: 'PLANTA GENERAL', role: '2d', viewableID: 'Layout1', padre: 'Layout1' },
    { guid: 'g-l2', name: 'PERFIL LONGITUDINAL', role: '2d', viewableID: 'Layout2', padre: 'Layout2' },
  ],
  rvt: [
    { guid: 'r-3d', name: '{3D}', role: '3d', viewableID: '77904b78-0005c7fa', padre: 'Vista 3D' },
    { guid: 'r-3db', name: 'ESTRUCTURAS 3D', role: '3d', viewableID: '77904b78-0005c800', padre: 'Vista 3D' },
  ],
};
window.__archivo = 'dwg';
window.__vistas = FIXTURES.dwg;
window.__FIXTURES = FIXTURES;
// El sentido que declara el visor: `false` = perfil Default (DWG),
// `true` = perfil AEC (Revit). Es la bandera que decide si hay que corregir.
window.__reverseZoom = false;

// ── Backend de mentira ────────────────────────────────────────────────────────
let paso = 0;
const responder = (cuerpo, ms = 0, estado = 200) => new Promise(res => {
  const enviar = () => res(new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } }));
  ms ? setTimeout(enviar, ms) : enviar();
});
const original = window.fetch.bind(window);
window.fetch = (url, opciones = {}) => {
  const u = String(typeof url === 'string' ? url : url.url);
  if (u.includes('/api/docs/cad/translate')) { paso = 0; anotar('POST translate'); return responder({ success: true, status: 'pending' }, 200); }
  if (u.includes('/api/docs/cad/status')) {
    if (window.__fallarStatus > 0) { window.__fallarStatus -= 1; anotar('status -> CAÍDO'); return Promise.reject(new Error('red')); }
    const d = window.__guionEstado[Math.min(paso, window.__guionEstado.length - 1)];
    paso += 1;
    anotar(`status -> ${d.status}${d.progress ? ' ' + d.progress : ''}`);
    return responder({ success: true, ...d }, window.__msPorSondeo);
  }
  if (u.includes('/api/token')) return responder({ access_token: 'de-mentira' });
  if (!u.includes('/api/')) return original(url, opciones);
  return responder({ success: true });
};

// ── Autodesk de mentira. SUSTITUTO DECLARADO: no representa al motor. ─────────
// Los nodos traen los MISMOS métodos que los reales: `is2D()`/`is3D()` existen
// en el bubble de LMV y son lo que usa la clasificación.
const nodos = () => window.__vistas.map(v => ({
  data: { guid: v.guid, name: v.name, role: v.role, viewableID: v.viewableID },
  parent: { data: { name: v.padre } },
  is2D: () => v.role === '2d',
  is3D: () => v.role === '3d',
  isGeometry: () => true,
}));
window.Autodesk = {
  Viewing: {
    Initializer: (cfg, cb) => { anotar('Initializer'); cfg.getAccessToken?.(() => {}); setTimeout(cb, 30); },
    GuiViewer3D: function (contenedor) {
      anotar('GuiViewer3D creado');
      // La única parte del motor que este banco necesita imitar de verdad: la
      // bandera que decide el sentido de la rueda.
      this.navigation = { getReverseZoomDirection: () => window.__reverseZoom };
      this.start = () => { anotar('viewer.start()'); const c = document.createElement('div'); c.className = 'sustituto-lmv'; c.textContent = 'MOTOR SUSTITUIDO (el banco no mide navegación)'; c.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#6b7480;font-size:12px;'; contenedor.appendChild(c); };
      this.loadDocumentNode = (doc, node) => { anotar(`loadDocumentNode ${node.data.name}`); window.__vistaMontada = node.data.name; window.__cargas = (window.__cargas || 0) + 1; return Promise.resolve(); };
      this.finish = () => anotar('viewer.finish()');
    },
    Document: {
      load: (urn, ok) => {
        anotar(`Document.load ${urn}`);
        const todas = nodos();
        setTimeout(() => ok({
          getRoot: () => ({ search: () => todas, getDefaultGeometry: () => todas[todas.length - 1] }),
        }), 30);
      },
    },
  },
};

// ── La pantalla ───────────────────────────────────────────────────────────────
const FICHERO = { id: 'n-1', name: 'PLANO_GENERAL_R03.dwg', gcs_urn: 'gcs://banco/plano.dwg' };
function Banco() {
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => {
    window.__abrir = (cual) => {
      if (cual) { window.__archivo = cual; window.__vistas = window.__FIXTURES[cual];
                  window.__reverseZoom = cual === 'rvt'; }   // Revit -> perfil AEC
      window.__cargas = 0; window.__tClic = performance.now(); setMontado(true);
    };
    window.__cerrar = () => setMontado(false);
  }, []);
  return (
    <div style={{ height: '100vh', background: '#11141a' }}>
      {montado
        ? <CadViewer file={FICHERO} projectPrefix="banco" />
        : <div style={{ color: '#7b8494', padding: 24, fontSize: 13 }}>Pulsa window.__abrir() para abrir el archivo.</div>}
    </div>
  );
}

const nodo = document.getElementById('raiz');
if (!nodo.__raiz) nodo.__raiz = createRoot(nodo);
nodo.__raiz.render(<Banco />);
