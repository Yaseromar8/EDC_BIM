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

export default function CadViewer({ file }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const [phase, setPhase] = useState('preparando');   // preparando | traduciendo | listo | error
  const [progress, setProgress] = useState('');
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
            const node = doc.getRoot().getDefaultGeometry();
            if (!node) return fail('La traducción no produjo ninguna vista visible.');
            viewer.loadDocumentNode(doc, node).then(() => {
              if (cancelled) return;
              // Mismo sentido de scroll que el Visor 3D. El visor de Autodesk
              // trae invertido el zoom con rueda por defecto, y tener dos
              // comportamientos distintos entre productos desconcierta más que
              // cualquiera de los dos. Ver Viewer.jsx:2520 — allí es lo mismo.
              try { viewer.getNavigation?.()?.setReverseZoomDirection(false); } catch { /* noop */ }
              setPhase('listo');
            });
          },
          (code, msg) => fail(`No se pudo abrir el modelo (${code}): ${msg || ''}`)
        );
      });
    };

    // Consulta el estado hasta que la traducción termine.
    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await apiFetch(`${API}/api/docs/cad/status?node_id=${encodeURIComponent(file.id)}`);
        const d = await r.json();
        if (cancelled) return;
        if (!d.success) return fail(d.error || 'No se pudo consultar el estado.');
        if (d.status === 'success') return mount(d.urn);
        if (d.status === 'retry_plain') {
          // El paquete con la imagen adjunta fracasó; el backend ya se rindió
          // con ella. Se pide de nuevo, ahora del dibujo suelto.
          setAviso(d.aviso || '');
          setPhase('preparando');
          return arrancar();
        }
        if (d.status === 'failed' || d.status === 'timeout') {
          return fail('Autodesk no pudo traducir este dibujo: puede estar dañado o guardado en un formato que su traductor no admite.');
        }
        if (d.status === 'none') {
          // APS no tiene nada de este archivo: la subida no llegó a cuajar.
          // Se pide una vez más en lugar de sondear un trabajo inexistente.
          return fail('La preparación no llegó a iniciarse. Cierra y vuelve a abrir el archivo.');
        }
        setProgress(d.progress || '');
        timer = setTimeout(poll, 4000);
      } catch {
        fail('Se perdió la conexión mientras se preparaba el archivo.');
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
  }, [file.id]);

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
              <a href={`${API}/api/docs/content/${file.id}`} download={file.name}
                 style={{ fontSize: 13, color: '#7fb3d5', marginTop: 4 }}>
                Descargar el archivo original
              </a>
            </>
          ) : (
            <>
              <div className="adsk-spinner" />
              <div style={{ fontSize: 14 }}>
                {phase === 'preparando' ? 'Preparando el archivo…' : 'Traduciendo el CAD…'}
                {progress ? ` ${progress}` : ''}
              </div>
              <div style={{ fontSize: 12, color: '#98a1ad', maxWidth: 420, lineHeight: 1.5 }}>
                La primera vez tarda unos minutos según el tamaño. Las siguientes
                aperturas son inmediatas.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
