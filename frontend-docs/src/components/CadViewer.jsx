// CadViewer — ver DWG / Civil 3D / RVT / IFC dentro del CDE, con el visor de
// Autodesk que ya usamos en el Visor 3D.
//
// El visor es una librería JS gratuita: se carga desde el CDN de Autodesk y no
// cuesta nada embeberla. Lo que sí cuesta es la TRADUCCIÓN (Model Derivative),
// porque el visor no sabe leer un DWG — solo lee el SVF2 que produce esa
// traducción. Por eso se lanza al pulsar "Ver" y no al subir el archivo.
//
// El componente sólo orquesta: pide la traducción, espera mostrando progreso, y
// cuando hay URN monta el visor. Toda la lógica de APS vive en el backend.
import React, { useEffect, useRef, useState } from 'react';
import { API } from '../utils/helpers';
import { apiFetch } from '../utils/apiFetch';
import toast from 'react-hot-toast';

const VIEWER_JS = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/viewer3D.min.js';
const VIEWER_CSS = 'https://developer.api.autodesk.com/modelderivative/v2/viewers/7.*/style.min.css';

// El script del visor pesa; se carga UNA vez y sólo cuando alguien abre un CAD.
let viewerScriptPromise = null;

// Una única petición de traducción por archivo en esta pestaña. Sin esto, un
// remontaje del visor lanzaba dos a la vez y Autodesk devolvía 409 Conflict a
// la segunda: la primera traducía bien y la segunda escribía "falló" encima.
const traduccionesEnCurso = new Map();
function pedirTraduccion(fileId, hacer) {
  if (!traduccionesEnCurso.has(fileId)) {
    traduccionesEnCurso.set(fileId, hacer().finally(() => traduccionesEnCurso.delete(fileId)));
  }
  return traduccionesEnCurso.get(fileId);
}
function loadViewerScript() {
  if (window.Autodesk?.Viewing) return Promise.resolve();
  if (viewerScriptPromise) return viewerScriptPromise;
  viewerScriptPromise = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = VIEWER_CSS;
    document.head.appendChild(css);

    const script = document.createElement('script');
    script.src = VIEWER_JS;
    script.onload = () => resolve();
    script.onerror = () => { viewerScriptPromise = null; reject(new Error('No se pudo cargar el visor de Autodesk.')); };
    document.head.appendChild(script);
  });
  return viewerScriptPromise;
}

// Autodesk devuelve el avance como texto ("35% complete", "complete"). Se saca
// el numero para poder pintar una barra; si no hay numero, se devuelve null y se
// vuelve al giro.
function porcentajeDe(texto) {
  if (!texto) return null;
  if (/complete/i.test(texto) && !/\d/.test(texto)) return 100;
  const m = String(texto).match(/(\d{1,3})\s*%/);
  if (!m) return null;
  return Math.min(100, Math.max(0, parseInt(m[1], 10)));
}

function formatoReloj(segundos) {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// EL ZOOM INVERTIDO, resuelto leyendo el codigo del visor de Autodesk
// (bundle 7.126): su perfil "AEC" -- el que activa para modelos de
// construccion, o sea NUESTROS DWG y RVT -- trae DE FABRICA
// reverseMouseZoomDir = true (OB.settings[REVERSE_MOUSE_ZOOM_DIR]=!0) y lo
// aplica DESPUES de cargar la vista, pisando cualquier ajuste temprano.
// Historia de esta funcion: la v1 ponia false una vez (el perfil la pisaba),
// la v2 puso true en 2D (reforzo la inversion). La verdad: FALSE SIEMPRE
// -- rueda adentro acerca, como el visor 3D principal y como ACC -- fijado
// por la via autoritativa (la preferencia, que la navegacion escucha) y
// reafirmado tarde para ganarle la carrera al perfil.
function ajustarSentidoDelZoom(viewer, _node) {
  try {
    const aplicar = () => {
      try {
        viewer.prefs?.set('reverseMouseZoomDir', false);
        viewer.getNavigation?.()?.setReverseZoomDirection(false);
      } catch { /* noop */ }
    };
    aplicar();
    setTimeout(aplicar, 1200);
    setTimeout(aplicar, 3500);
  } catch { /* noop */ }
}

export default function CadViewer({ file, projectPrefix = '' }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [phase, setPhase] = useState('preparando');   // preparando | traduciendo | listo | error
  const [progress, setProgress] = useState('');
  const [transcurrido, setTranscurrido] = useState(0);
  const [puedeReintentar, setPuedeReintentar] = useState(false);
  // Subirlo vuelve a lanzar el efecto de preparacion. Es la forma de
  // reintentar sin duplicar la logica de arranque fuera del efecto.
  const [intento, setIntento] = useState(0);
  const [detalle, setDetalle] = useState('');
  const [vistas, setVistas] = useState([]);
  const [vistaActiva, setVistaActiva] = useState(null);
  const documentoRef = useRef(null);

  // Un reloj que corre. Aunque Autodesk no de porcentaje durante el envio, ver
  // el tiempo avanzar es la diferencia entre "esta trabajando" y "se colgo".
  useEffect(() => {
    if (phase === 'listo' || phase === 'error') return undefined;
    const t = setInterval(() => setTranscurrido(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const pct = porcentajeDe(progress);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const fail = (msg) => {
      if (cancelled) return;
      setError(msg);
      setPhase('error');
    };

    // Monta el visor con el URN ya traducido.
    const mount = async (urn) => {
      try {
        await loadViewerScript();
      } catch (e) {
        return fail(e.message);
      }
      if (cancelled || !containerRef.current) return;

      const Autodesk = window.Autodesk;
      Autodesk.Viewing.Initializer({
        env: 'AutodeskProduction2',
        api: 'streamingV2',
        // El token lo sirve nuestro backend (2-legged). El navegador nunca ve
        // las credenciales de APS.
        getAccessToken: (onToken) => {
          apiFetch(`${API}/api/token`)
            .then(r => r.json())
            .then(d => onToken(d.access_token, 3000))
            .catch(() => fail('No se pudo obtener el token de Autodesk.'));
        },
      }, () => {
        if (cancelled || !containerRef.current) return;
        const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current);
        viewer.start();
        viewerRef.current = viewer;
        Autodesk.Viewing.Document.load(
          `urn:${urn}`,
          (doc) => {
            if (cancelled) return;

            // TODAS las vistas del modelo, no solo la primera. Un Revit trae
            // dentro sus laminas y sus vistas 3D, y el visor cargaba la que
            // Autodesk marca por defecto — que en un plano de obra suele ser la
            // CARATULA. Se abria el modelo y lo que se veia era el membrete.
            // ACC ofrece un selector; aqui no habia ninguno.
            const raiz = doc.getRoot();
            const todas = raiz.search({ type: 'geometry' }) || [];
            documentoRef.current = doc;
            setVistas(todas.map(v => ({
              guid: v.data.guid,
              nombre: v.data.name || 'Sin nombre',
              tipo: v.data.role === '3d' ? '3D' : 'Lámina',
            })));

            // Se prefiere una vista 3D si la hay: es lo que se espera al abrir un
            // modelo. Si el Revit no publica ninguna —pasa mas de lo que parece,
            // depende de que vistas marque el modelador— se cae a la de siempre.
            const node = todas.find(v => v.data.role === '3d') || raiz.getDefaultGeometry();
            if (!node) return fail('La traducción no produjo ninguna vista visible.');
            setVistaActiva(node.data.guid);
            viewer.loadDocumentNode(doc, node).then(() => {
              if (cancelled) return;
              ajustarSentidoDelZoom(viewer, node);
              setPhase('listo');
            });
          },
          (code, msg) => fail(`No se pudo abrir el modelo (${code}): ${msg || ''}`)
        );
      });
    };

    // Consulta el estado hasta que la traducción termine.
    //
    // EL PRIMER 502 NO ES EL FINAL. La instancia gratuita de Render se
    // reinicia y se despierta a su ritmo, y justo durante una traducción
    // larga es cuando más se nota (el dueño lo vio: dos 502, un 503 y la
    // pantalla rendida — mientras el trabajo seguía vivo en Autodesk). El
    // sondeo aguanta ~2 minutos de fallos seguidos antes de rendirse.
    let fallosSeguidos = 0;
    const reintentarPoll = (motivo) => {
      if (cancelled) return;
      fallosSeguidos += 1;
      if (fallosSeguidos > 20) return fail(motivo);
      if (fallosSeguidos > 2) setProgress('reconectando con el servidor…');
      timer = setTimeout(poll, 6000);
    };
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await apiFetch(`${API}/api/docs/cad/status?node_id=${encodeURIComponent(file.id)}`);
        const d = await r.json();
        if (cancelled) return;
        if (!d.success) return reintentarPoll(d.error || 'No se pudo consultar el estado.');
        fallosSeguidos = 0;
        if (d.status === 'success') return mount(d.urn);
        if (d.status === 'retry_plain') {
          // El paquete con la imagen adjunta fracasó; el backend ya se rindió
          // con ella. Se pide de nuevo, ahora del dibujo suelto.
          setAviso(d.aviso || '');
          setPhase('preparando');
          return arrancar();
        }
        if (d.status === 'failed' || d.status === 'timeout') {
          // El mensaje anterior acusaba SIEMPRE al archivo ("puede estar dañado"),
          // y eso deja al usuario sin salida y buscando donde no es. Pasó de
          // verdad con un Revit de 159 MB: Autodesk respondió "Tr worker fail to
          // download", el fichero estaba intacto (mismo tamaño y misma firma que
          // el original) y al reintentar tradujo sin tocar nada. Era un fallo
          // suyo, transitorio.
          setDetalle(d.detalle || '');
          setPuedeReintentar(true);
          return fail(d.detalle && /download|internal|timeout/i.test(d.detalle)
            ? 'Autodesk no pudo procesarlo esta vez. Suele ser temporal: vuelve a intentarlo.'
            : 'Autodesk no pudo traducir este dibujo: puede estar dañado o guardado en un formato que su traductor no admite.');
        }
        if (d.status === 'none') {
          // APS no tiene nada de este archivo: la subida no llegó a cuajar.
          // Se pide una vez más en lugar de sondear un trabajo inexistente.
          return fail('La preparación no llegó a iniciarse. Cierra y vuelve a abrir el archivo.');
        }
        setProgress(d.progress || '');
        timer = setTimeout(poll, 4000);
      } catch {
        reintentarPoll('Se perdió la conexión mientras se preparaba el archivo.');
      }
    };

    const arrancar = async () => {
      try {
        const d = await pedirTraduccion(file.id + ':' + Date.now(), async () => {
          const r = await apiFetch(`${API}/api/docs/cad/translate`, {
            method: 'POST',
            body: JSON.stringify({ node_id: file.id }),
          });
          return r.json();
        });
        if (cancelled) return;
        if (!d.success) return fail(d.error || 'No se pudo preparar el archivo.');
        if (d.status === 'success') return mount(d.urn);
        setPhase('traduciendo');
        poll();
      } catch {
        fail('No se pudo contactar con el servidor.');
      }
    };

    arrancar();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      try { viewerRef.current?.finish(); } catch { /* el visor ya podría estar destruido */ }
      viewerRef.current = null;
    };
  }, [file.id, intento]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#2b2f36' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* Aviso discreto: el plano se ve, solo faltó algo accesorio. No es un
          error y no debe ocupar la pantalla como si lo fuera. */}
      {aviso && phase === 'listo' && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          maxWidth: '80%', background: 'rgba(20,22,26,0.92)', color: '#dfe3e9',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8,
          padding: '8px 14px', fontSize: 12.5, lineHeight: 1.45, zIndex: 5,
        }}>
          {aviso}
          <button onClick={() => setAviso('')} style={{
            marginLeft: 12, background: 'none', border: 'none', color: '#98a1ad',
            cursor: 'pointer', fontSize: 13,
          }}>✕</button>
        </div>
      )}

      {/* Selector de vista. Solo aparece si hay mas de una: en un plano suelto
          estorbaria. */}
      {phase === 'listo' && vistas.length > 1 && (
        <select
          value={vistaActiva || ''}
          onChange={(e) => {
            const v = vistas.find(x => x.guid === e.target.value);
            const doc = documentoRef.current;
            const viewer = viewerRef.current;
            if (!v || !doc || !viewer) return;
            const node = (doc.getRoot().search({ type: 'geometry' }) || [])
              .find(n => n.data.guid === v.guid);
            if (!node) return;
            setVistaActiva(v.guid);
            viewer.loadDocumentNode(doc, node).then(() => ajustarSentidoDelZoom(viewer, node));
          }}
          style={{
            position: 'absolute', top: 12, left: 12, zIndex: 20, maxWidth: 380,
            padding: '6px 10px', fontSize: 13, borderRadius: 5,
            border: '1px solid rgba(255,255,255,0.25)', background: 'rgba(28,32,38,0.94)',
            color: '#dfe3e9', cursor: 'pointer',
          }}
        >
          {vistas.map(v => (
            <option key={v.guid} value={v.guid}>{v.tipo} · {v.nombre}</option>
          ))}
        </select>
      )}

      {phase !== 'listo' && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          background: '#2b2f36', color: '#dfe3e9', textAlign: 'center', padding: 24,
        }}>
          {phase === 'error' ? (
            <>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#e57373" strokeWidth="1.5" strokeLinecap="round">
                <circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="13" /><line x1="12" y1="16" x2="12" y2="16" />
              </svg>
              <div style={{ fontSize: 14, maxWidth: 460, lineHeight: 1.5 }}>{error}</div>
              {detalle && (
                <div style={{ fontSize: 12, color: '#8b939e', maxWidth: 460, fontFamily: 'monospace' }}>
                  {detalle}
                </div>
              )}
              {puedeReintentar && (
                <button
                  onClick={() => { setPuedeReintentar(false); setDetalle(''); setError(''); setTranscurrido(0); setPhase('preparando'); setIntento(n => n + 1); }}
                  style={{ marginTop: 6, padding: '7px 18px', fontSize: 13, cursor: 'pointer',
                           background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 5 }}>
                  Volver a intentarlo
                </button>
              )}
              {/* Este enlace apuntaba a una ruta de descarga que NUNCA existio
                  en el backend: llevaba roto desde que se escribio, y nadie lo
                  noto porque solo aparece cuando la traduccion CAD falla.
                  Y despues llevaba el TOKEN DE SESION en la direccion, que es
                  la llave escrita en el historial del navegador. Ahora se pide
                  una URL FIRMADA -- misma via que el lector y el menu del clic
                  derecho -- que caduca sola y no lleva identidad dentro. */}
              <button type="button"
                onClick={async () => {
                  const ventana = window.open('', '_blank', 'noopener');
                  try {
                    const r = await apiFetch(`${API}/api/docs/signed-url?urn=${encodeURIComponent(file.gcs_urn || '')}&model_urn=${encodeURIComponent(projectPrefix || '')}`);
                    const d = await r.json().catch(() => ({}));
                    if (!r.ok || !d.success || !d.url) throw new Error(d.error || 'No se pudo preparar la descarga.');
                    if (ventana) ventana.location = d.url; else window.open(d.url, '_blank', 'noopener');
                  } catch (e) {
                    if (ventana) ventana.close();
                    toast.error(e.message || 'No se pudo descargar el archivo original.');
                  }
                }}
                style={{ fontSize: 13, color: '#7fb3d5', marginTop: 4, background: 'none',
                         border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>
                Descargar el archivo original
              </button>
            </>
          ) : (
            <>
              {/* Un giro sin numeros no dice si avanza o si se colgo, y es lo que
                  desespera al que espera. Aqui hay siempre algo que se mueve:
                  durante el envio, el reloj y el tamano; durante la traduccion,
                  el porcentaje real que da Autodesk. */}
              {pct === null ? <div className="adsk-spinner" /> : (
                <div style={{ width: 260, height: 6, background: '#3a3f47', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: '#7fb3d5', transition: 'width .4s' }} />
                </div>
              )}
              <div style={{ fontSize: 14 }}>
                {phase === 'preparando' ? 'Enviando el archivo a Autodesk…' : 'Traduciendo el modelo…'}
                {pct !== null ? ` ${pct}%` : (progress ? ` ${progress}` : '')}
              </div>
              <div style={{ fontSize: 12, color: '#98a1ad', display: 'flex', gap: 14 }}>
                <span>{formatoReloj(transcurrido)}</span>
                {file?.size ? <span>{(file.size / 1048576).toFixed(0)} MB</span> : null}
              </div>
              <div style={{ fontSize: 12, color: '#98a1ad', maxWidth: 430, lineHeight: 1.5 }}>
                {phase === 'preparando'
                  ? 'Todavía no hay porcentaje: Autodesk no conoce el archivo hasta que termina el envío. Va por tamaño.'
                  : 'La primera vez tarda unos minutos según el tamaño. Las siguientes aperturas son inmediatas.'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
