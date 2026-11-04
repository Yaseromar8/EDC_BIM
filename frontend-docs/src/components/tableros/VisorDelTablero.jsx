/**
 * VisorDelTablero — doble clic (o «Abrir») en una tarjeta de documento: el lector de Archivos ENCIMA del tablero, en
 * la versión de la tarjeta, como el visor de ACC (docs/visor/59 §9). No es otro visor: es el mismo DocumentViewer de
 * Archivos (PDF con sus marcas, CAD, imágenes, versiones), en marco, con «Abrir en Archivos» junto a sus acciones.
 *
 * Se llega al documento como llega un enlace de Archivos: `/api/docs/ubicacion` dice dónde está HOY y si se puede
 * ver (movido a otra carpeta, sigue abriéndose; borrado o sin permiso, lo mismo para los dos y sin nombres), y la fila
 * es la del listado de su carpeta, la misma que abre el explorador.
 *
 * Mientras está abierto, el tablero no recibe las teclas (un diálogo encima se las queda): Supr en el lector no borra
 * la tarjeta de debajo.
 */
import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API } from '../../utils/helpers';
import { apiFetch } from '../../utils/apiFetch';

const DocumentViewer = lazy(() => import('../DocumentViewer'));
const NO_DISPONIBLE = 'Este documento ya no está disponible o no tienes acceso a él.';

async function leer(url) {
  const r = await apiFetch(url);
  const d = await r.json().catch(() => ({}));
  return r.ok && d.success !== false ? d : null;
}

// La fila del documento y su historial, por las mismas puertas que el explorador.
async function cargar(obra, el) {
  const q = new URLSearchParams({ model_urn: obra, documento: el.nodeId, ...(el.versionId ? { version: el.versionId } : {}) });
  const donde = await leer(`${API}/api/docs/ubicacion?${q}`);
  if (!donde?.documento) return { error: NO_DISPONIBLE };
  const carpeta = donde.carpeta ? `id=${encodeURIComponent(donde.carpeta)}` : `path=${encodeURIComponent(`${obra}/`)}`;
  const [lista, versiones] = await Promise.all([
    leer(`${API}/api/docs/list?${carpeta}&model_urn=${encodeURIComponent(obra)}`),
    leer(`${API}/api/docs/versions?id=${encodeURIComponent(donde.documento)}&model_urn=${encodeURIComponent(obra)}`),
  ]);
  const doc = (lista?.data?.files || []).find(f => String(f.id) === String(donde.documento));
  if (!doc) return { error: NO_DISPONIBLE };
  const historial = versiones?.versions || [];
  const version = donde.version || historial.find(v => String(v.id) === String(el.versionId)) || null;
  return { doc, historial, version };
}

const marco = { position: 'fixed', top: 56, bottom: 40, left: 'max(16px, 6vw)', right: 'max(16px, 6vw)', zIndex: 999999, borderRadius: 8,
  background: '#F1F0E8', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 12px 48px rgba(20,20,19,0.35)',
  fontFamily: 'var(--a-font-sans)', fontSize: 14, color: '#72706B' };

export default function VisorDelTablero({ el, obra, onCerrar, onAbrirEnArchivos }) {
  const [estado, setEstado] = useState({ cargando: true });
  const [version, setVersion] = useState(null);
  const [verVersiones, setVerVersiones] = useState(false);
  const dialogo = useRef(null);

  useEffect(() => {
    let vivo = true;
    setEstado({ cargando: true });
    cargar(obra, el).then(r => { if (vivo) { setEstado(r); setVersion(r.version || null); } })
      .catch(() => { if (vivo) setEstado({ error: 'No se pudo conectar con el servidor.' }); });
    return () => { vivo = false; };
  }, [obra, el.nodeId, el.versionId]);   // eslint-disable-line react-hooks/exhaustive-deps

  // El foco se queda dentro: así las teclas son del lector y no del tablero.
  useEffect(() => { dialogo.current?.focus({ preventScroll: true }); }, []);
  // Escape cierra. Con el lector abierto, solo si el lector no la ha usado (para soltar una herramienta, cerrar un
  // menú…): por eso se escucha al final, en la burbuja, y se respeta `defaultPrevented`.
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); onCerrar(); } };
    window.addEventListener('keydown', tecla, !estado.doc);
    return () => window.removeEventListener('keydown', tecla, !estado.doc);
  }, [estado.doc, onCerrar]);

  const cerrar = (
    <button type="button" onClick={onCerrar} aria-label="Cerrar" title="Cerrar"
      style={{ position: 'absolute', top: 10, right: 12, width: 32, height: 32, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: 18, color: '#72706B' }}>×</button>
  );

  return createPortal(
    <div ref={dialogo} role="dialog" aria-modal="true" aria-label={el.nombre || 'Documento'} tabIndex={-1} style={{ outline: 'none' }}
      onPointerDown={e => e.stopPropagation()}>
      {/* El tablero queda a la vista alrededor, oscurecido; un clic fuera cierra (como ACC). */}
      <div onClick={onCerrar} style={{ position: 'fixed', inset: 0, zIndex: 999998, background: 'rgba(20,20,19,0.45)' }} />
      {estado.doc ? (
        <Suspense fallback={<div style={marco}>Abriendo el documento…</div>}>
          <DocumentViewer file={estado.doc} projectPrefix={obra} API={API} onClose={onCerrar} enMarco
            versionHistory={estado.historial} viewedVersionInfo={version} setViewedVersionInfo={setVersion}
            showVersions={verVersiones} setShowVersions={setVerVersiones}
            accionExtra={(clase) => (
              <button type="button" className={clase} onClick={() => onAbrirEnArchivos(el, version)} title="Abrir en Archivos" aria-label="Abrir en Archivos">
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                </svg>
              </button>
            )} />
        </Suspense>
      ) : (
        <div style={marco}>
          {cerrar}
          {estado.cargando ? 'Abriendo el documento…' : estado.error}
        </div>
      )}
    </div>,
    document.body,
  );
}
