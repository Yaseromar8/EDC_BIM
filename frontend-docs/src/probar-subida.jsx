/**
 * BANCO · la subida de archivos, con un almacén de mentira.
 *
 * Monta el `UploadModal` REAL sobre el `useChunkedUpload` REAL. No se replica
 * nada del motor: se le pone delante un backend y un almacén falsos, y se le
 * dan palancas para provocar lo que en producción no se pide a voluntad.
 *
 * QUÉ SE FALSEA
 *   window.fetch              /api/uploads/init · /progress · /complete
 *   XMLHttpRequest            el PUT de cada trozo al «almacén», con sus
 *                             eventos de progreso reales (xhr.upload.onprogress)
 *
 * PALANCAS
 *   window.__msPorTrozo       cuánto tarda cada trozo (ms)
 *   window.__eventosPorTrozo  en cuántos avisos de progreso se parte un trozo
 *   window.__fallarTrozos     cuántos PUT deben fallar (dispara el REINTENTO
 *                             real del motor: paused → espera → uploading)
 *   window.__fallarInit       el backend rechaza la sesión
 *   window.__fallarComplete   la confirmación falla tras transferir
 *   window.__tamTrozo         tamaño de trozo que devuelve el init
 *
 * No entra en producción: `vite.config.js` no lo conoce.
 */
/* eslint-disable react-refresh/only-export-components -- banco: se construye
   como produccion, sin HMR ni React Refresh (ver vite.banco.config.js). */
import React from 'react';
import { createRoot } from 'react-dom/client';
import UploadModal from './components/modals/UploadModal';
import { useChunkedUpload } from './hooks/useChunkedUpload';
import './index.css';

window.__msPorTrozo = 900;
window.__eventosPorTrozo = 6;
window.__fallarTrozos = 0;
window.__fallarInit = false;
window.__fallarComplete = false;
window.__tamTrozo = 2 * 1024 * 1024;      // 2 MB: varios trozos con ficheros pequeños
window.__registro = [];

const t0 = Date.now();
const anotar = (l) => window.__registro.push(`${String(Date.now() - t0).padStart(6)}ms  ${l}`);

// ── Backend de mentira ────────────────────────────────────────────────────────
const responder = (cuerpo, estado = 200) => Promise.resolve(
  new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } })
);

let nSesion = 0;
const original = window.fetch.bind(window);
window.fetch = (url, opciones = {}) => {
  const u = String(typeof url === 'string' ? url : url.url);

  if (u.includes('/api/uploads/init')) {
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : {};
    if (window.__fallarInit) {
      anotar(`init "${cuerpo.filename}" -> RECHAZADO`);
      return responder({ success: false, error: 'No tienes permiso para subir aquí.', code: 'FORBIDDEN' }, 403);
    }
    const uploadId = `up-${++nSesion}`;
    anotar(`init "${cuerpo.filename}" -> ${uploadId}`);
    return responder({ success: true, uploadId, sessionUri: `https://almacen.demento/${uploadId}`,
                       chunkSize: window.__tamTrozo, filename: cuerpo.filename });
  }

  if (u.includes('/api/uploads/progress')) return responder({ success: true });

  if (u.includes('/api/uploads/complete')) {
    if (window.__fallarComplete) {
      anotar('complete -> RECHAZADO');
      return responder({ success: false, error: 'El servidor no pudo registrar el archivo.' }, 500);
    }
    anotar('complete -> OK');
    return responder({ success: true, node_id: 'n-1', version: 1, gcsUrn: 'gcs://banco/x' });
  }

  // LA CONSULTA DE REANUDACIÓN. Tras un trozo fallido el motor pregunta al
  // almacén por `fetch` (no por XHR) cuántos bytes tiene confirmados, con
  // `Content-Range: bytes */total`. Si el banco la deja salir a la red de
  // verdad, la petición muere, el motor no aprende nada y la reanudación NO se
  // está probando: se prueba el camino de error.
  if (/almacen\.demento/.test(u)) {
    const rango = (opciones.headers || {})['Content-Range'] || '';
    const confirmado = window.__confirmado[u] || 0;
    if (/^bytes \*\//.test(rango)) {
      anotar(`consulta de reanudación -> confirmados ${confirmado} B`);
      return Promise.resolve(new Response('', { status: 308, headers: { Range: `bytes=0-${Math.max(0, confirmado - 1)}` } }));
    }
    return Promise.resolve(new Response('', { status: 308 }));
  }

  if (!u.includes('/api/')) return original(url, opciones);
  return responder({ success: true, data: [] });
};
window.__confirmado = {};

// ── Almacén de mentira: el PUT de cada trozo, con progreso real ───────────────
const XHROriginal = window.XMLHttpRequest;
class XHRDeBanco {
  constructor() {
    this.upload = {};
    this.status = 0; this.responseText = ''; this._cabeceras = {};
    this._abortado = false; this._temporizadores = [];
  }
  open(metodo, uri) { this._metodo = metodo; this._uri = String(uri); }
  setRequestHeader(k, v) { this._cabeceras[k] = v; }
  getResponseHeader(k) { return k === 'Range' ? this._range || null : null; }
  abort() {
    this._abortado = true;
    this._temporizadores.forEach(clearTimeout);
    anotar('PUT abortado');
    this.onabort && this.onabort();
  }
  send(trozo) {
    // Un PUT al almacén de verdad va por XHR, no por fetch: si no se falsea
    // aquí, el banco no ve pasar ni un byte.
    if (!/almacen\.demento/.test(this._uri)) {
      const real = new XHROriginal();
      real.open(this._metodo, this._uri);
      real.onload = () => { this.status = real.status; this.responseText = real.responseText; this.onload && this.onload(); };
      real.onerror = () => this.onerror && this.onerror();
      real.send(trozo);
      return;
    }
    const bytes = trozo?.size ?? 0;
    const rango = this._cabeceras['Content-Range'] || '';
    const fallar = window.__fallarTrozos > 0;
    if (fallar) window.__fallarTrozos -= 1;
    anotar(`PUT ${rango}${fallar ? ' -> FALLARÁ' : ''}`);

    const avisos = Math.max(1, window.__eventosPorTrozo | 0);
    const paso = window.__msPorTrozo / avisos;
    for (let i = 1; i <= avisos; i++) {
      this._temporizadores.push(setTimeout(() => {
        if (this._abortado) return;
        // Los mismos eventos que emite el navegador: bytes entregados, a saltos.
        this.upload.onprogress && this.upload.onprogress({ lengthComputable: true, loaded: Math.round(bytes * i / avisos), total: bytes });
      }, paso * i));
    }
    this._temporizadores.push(setTimeout(() => {
      if (this._abortado) return;
      if (fallar) { anotar('PUT -> ERROR DE RED'); this.onerror && this.onerror(); return; }
      const m = rango.match(/bytes (\d+)-(\d+)\/(\d+)/);
      const fin = m ? m[2] : null, total = m ? m[3] : null;
      const esUltimo = fin && total && (Number(fin) + 1 >= Number(total));
      // El almacén recuerda lo confirmado: es lo que contestará a la consulta
      // de reanudación.
      if (fin) window.__confirmado[this._uri] = Number(fin) + 1;
      this.status = esUltimo ? 200 : 308;
      this._range = `bytes=0-${fin || 0}`;
      anotar(`PUT -> ${this.status}`);
      this.onload && this.onload();
    }, window.__msPorTrozo + 20));
  }
}
window.XMLHttpRequest = XHRDeBanco;

// ── La pantalla ───────────────────────────────────────────────────────────────
function Banco() {
  const [abierto, setAbierto] = React.useState(true);
  const [minimizado, setMinimizado] = React.useState(false);
  const subida = useChunkedUpload('', 'banco', { name: 'Banco' }, {});
  const refFichero = React.useRef(null);

  // Enganche para las pruebas: crear un fichero de N MB y soltarlo al motor.
  React.useEffect(() => {
    window.__subir = (mb = 6, nombre = 'PLANO_GENERAL.pdf') => {
      const f = new File([new Uint8Array(mb * 1024 * 1024)], nombre, { type: 'application/pdf' });
      subida.addFiles([f], 'banco/01_COSTOS/');
      return nombre;
    };
    window.__estadoSubidas = () => subida.uploads.map(u => ({
      id: u.id, estado: u.status, pct: u.progress, texto: u.statusText,
      bytes: u.bytesUploaded, total: u.sizeBytes, needsFile: !!u.needsFile,
    }));
    window.__cancelar = (id) => subida.cancelUpload(id);
    // Una sesión de una visita anterior: el motor la deja en `paused` con
    // `needsFile`, esperando a que la persona vuelva a elegir el fichero.
    window.__reanudarSinFichero = () => subida.resumeUpload({
      uploadId: 'up-r', filename: 'REANUDAR.pdf', sizeBytes: 6 * 1024 * 1024,
      bytesUploaded: 2 * 1024 * 1024, sessionUri: 'https://almacen.demento/up-r',
      folderPath: 'banco/01_COSTOS/', mimeType: 'application/pdf', chunkSize: window.__tamTrozo,
    });
    window.__adjuntarYReanudar = (id, mb = 6) => subida.attachFileAndResume(
      id, new File([new Uint8Array(mb * 1024 * 1024)], 'REANUDAR.pdf', { type: 'application/pdf' }));
  }, [subida]);

  return (
    <div style={{ height: '100vh', background: '#f4f6f9' }}>
      <UploadModal
        isOpen={abierto} sopMinimized={minimizado} setSopMinimized={setMinimizado}
        currentPath="banco/01_COSTOS/" chunkedUpload={subida} fileRef={refFichero}
        dragOver={false} onDragOver={() => {}} onDragLeave={() => {}} onDrop={() => {}}
        onUpload={(ficheros) => subida.addFiles([...ficheros], 'banco/01_COSTOS/')}
        onListo={() => setAbierto(false)} onOpenUploaded={() => {}}
        onClose={() => setAbierto(false)} />
    </div>
  );
}

const nodo = document.getElementById('raiz');
if (!nodo.__raiz) nodo.__raiz = createRoot(nodo);
nodo.__raiz.render(<Banco />);
