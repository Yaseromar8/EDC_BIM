/**
 * TarjetaDocumento — un documento de Docs dentro de un tablero (fase 2, docs/visor/59), como las tarjetas de ACC.
 *
 * El elemento guarda el DOCUMENTO (`nodeId`, el linaje) y la VERSIÓN que se eligió (`versionId`, `version`): la tarjeta
 * no cambia sola cuando se sube otra; dice «Hay una versión nueva» y se actualiza solo si alguien lo pide (botón de
 * su barra). La imagen es la vista previa legible de esa versión (PDF, 2.000 px) o la imagen misma (fotos y planos
 * en JPG/PNG), siempre por las puertas de Docs: quien no tiene permiso ve «Sin acceso», sin nombre ni imagen.
 *
 * Solo componentes: lo compartido está en documentos.js y el registro para el Lienzo en tipoDocumento.js.
 */
import React, { useContext, useEffect, useState } from 'react';
import { API } from '../../utils/helpers';
import { apiFetch } from '../../utils/apiFetch';
import { renderFileIconSop } from '../../utils/fileIcons';
import { DocumentosDelTablero, hayVersionNueva } from './documentos';

const CABECERA = 34;

// Las URL firmadas caducan: se guardan 40 minutos por versión y se piden otra vez después.
const cache = new Map();
const VIDA_MS = 40 * 60 * 1000;

async function urlDeLaImagen(el) {
  const clave = el.versionId || el.nodeId;
  const guardada = cache.get(clave);
  if (guardada && Date.now() - guardada.t < VIDA_MS) return guardada.r;
  let r;
  try {
    if (el.ext === 'pdf') {
      const resp = await apiFetch(`${API}/api/docs/vista-previa/url`, { method: 'POST', body: JSON.stringify({ node_id: el.nodeId, version_id: el.versionId || '' }) });
      const d = await resp.json().catch(() => ({}));
      r = resp.status === 403 || resp.status === 404 ? { estado: 'sinAcceso' } : d.url ? { estado: 'lista', url: d.url } : { estado: 'sinVista' };
    } else {
      const q = new URLSearchParams({ id: el.nodeId, ...(el.versionId ? { version_id: el.versionId } : {}) });
      const resp = await apiFetch(`${API}/api/docs/signed-url?${q}`);
      const d = await resp.json().catch(() => ({}));
      r = resp.status === 403 || resp.status === 404 ? { estado: 'sinAcceso' } : d.url ? { estado: 'lista', url: d.url } : { estado: 'sinVista' };
    }
  } catch {
    return { estado: 'error' };
  }
  cache.set(clave, { t: Date.now(), r });
  return r;
}

const aviso = (texto, sub) => (
  <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#72706B', fontSize: 13, textAlign: 'center', padding: 16 }}>
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" />
    </svg>
    <span>{texto}</span>
    {sub && <span style={{ fontSize: 12, color: '#8A8880' }}>{sub}</span>}
  </div>
);

export function TarjetaDocumento({ elemento: el, elegido }) {
  const { vigentes } = useContext(DocumentosDelTablero);
  const [imagen, setImagen] = useState({ estado: 'cargando' });
  const [cargada, setCargada] = useState(false);
  const vigente = vigentes[el.nodeId];
  const sinAcceso = imagen.estado === 'sinAcceso' || vigente?.sinAcceso;
  const hayNueva = hayVersionNueva(el, vigente);

  useEffect(() => {
    let vivo = true;
    setImagen({ estado: 'cargando' }); setCargada(false);
    urlDeLaImagen(el).then(r => { if (vivo) setImagen(r); });
    return () => { vivo = false; };
  }, [el.nodeId, el.versionId, el.ext]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 6, overflow: 'hidden',
      border: '1px solid #D9D7CD', boxShadow: elegido ? 'none' : '0 1px 2px rgba(20,20,19,0.06), 0 4px 12px rgba(20,20,19,0.06)', fontFamily: 'var(--a-font-sans)' }}>
      <div style={{ height: CABECERA, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderBottom: '1px solid #ECEAE2', background: '#FAF9F5' }}>
        {sinAcceso ? null : renderFileIconSop(el.nombre, 18)}
        <span title={sinAcceso ? '' : el.nombre} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13, color: '#141413' }}>
          {sinAcceso ? 'Documento sin acceso' : el.nombre}
        </span>
        {!sinAcceso && el.version ? (
          <span title={hayNueva ? `Esta tarjeta muestra la V${el.version}; en Docs ya está la V${vigente.version}` : `Versión ${el.version}`}
            style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, padding: '1px 6px', borderRadius: 4,
              color: hayNueva ? 'var(--a-status-warning)' : '#3C3C3C', border: `1px solid ${hayNueva ? 'var(--a-status-warning-border)' : '#D9D7CD'}`,
              background: hayNueva ? 'var(--a-status-warning-surface)' : '#fff' }}>
            V{el.version}{hayNueva ? ' · hay V' + vigente.version : ''}
          </span>
        ) : null}
      </div>
      <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#F4F3EE' }}>
        {sinAcceso ? aviso('No tienes acceso a este documento')
          : imagen.estado === 'cargando' ? <div style={{ position: 'absolute', inset: 10, borderRadius: 4, background: '#ECEAE2' }} />
            : imagen.estado === 'lista' ? (
              <>
                {!cargada && <div style={{ position: 'absolute', inset: 10, borderRadius: 4, background: '#ECEAE2' }} />}
                <img src={imagen.url} alt="" draggable={false} onLoad={() => setCargada(true)} onError={() => setImagen({ estado: 'error' })}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', opacity: cargada ? 1 : 0, transition: 'opacity 160ms ease', pointerEvents: 'none' }} />
              </>
            )
              : imagen.estado === 'sinVista' ? aviso('Vista previa en preparación', 'Doble clic para abrirlo')
                : aviso('No se pudo cargar la imagen', 'Doble clic para abrirlo')}
      </div>
    </div>
  );
}

export function BarraDocumento({ el, actualizar, abrir }) {
  const { vigentes } = useContext(DocumentosDelTablero);
  const vigente = vigentes[el.nodeId];
  const hayNueva = hayVersionNueva(el, vigente);
  const boton = { height: 30, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 10px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.14)',
    background: '#fff', cursor: 'pointer', fontFamily: 'var(--a-font-sans)', fontSize: 13, color: '#3C3C3C', whiteSpace: 'nowrap' };
  if (vigente?.sinAcceso) return null;
  return (
    <>
      {hayNueva && (
        <button type="button" style={{ ...boton, color: 'var(--a-status-warning)', borderColor: 'var(--a-status-warning-border)', background: 'var(--a-status-warning-surface)' }}
          title={`La tarjeta muestra la V${el.version}. Pasarla a la V${vigente.version}`}
          onClick={() => actualizar({ versionId: vigente.versionId, version: vigente.version })}>
          Actualizar a V{vigente.version}
        </button>
      )}
      <button type="button" style={boton} title="Abrir el documento en otra pestaña (doble clic también)" onClick={() => abrir(el)}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M14 4h6v6" /><path d="M20 4 11 13" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
        </svg>
        Abrir
      </button>
    </>
  );
}
