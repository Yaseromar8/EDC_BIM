import React, { useEffect, useState } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { cajetinDelDocumento } from '../utils/lectorDePlanos';
import { estadoDe } from '../utils/estadosECD';
import { CitadoEn } from './MarcaConEnlace';
import './CajetinDelDocumento.css';

/**
 * EL CAJETÍN DEL LECTOR (docs/ux/LECTOR_ALEPHIA_ESTANDAR.md, LDA-1 §3 y §15).
 *
 * La cabecera del lector ES un cajetín, igual para un plano y para un documento: casillas con su rótulo
 * (Documento · Versión · Estado · Idoneidad · Vigencia), como el rótulo del propio plano o el encabezado
 * de un informe (ISO 7200). Responde siempre a «¿qué es?, ¿qué versión?, ¿para qué sirve?, ¿sigue
 * vigente?». Lo que dice cada casilla lo decide `cajetinDelDocumento`, sin red; aquí solo se pinta.
 */

// La frase de cada código de idoneidad, una vez por obra (el catálogo cambia poco).
const catalogos = new Map();

function useFraseDeIdoneidad(API, obra, codigo) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!codigo || !obra || !API || catalogos.has(obra)) return;
    let vivo = true;
    apiFetch(`${API}/api/docs/idoneidad?model_urn=${encodeURIComponent(obra)}`)
      .then(r => r.json())
      .then(d => {
        if (!d?.success) return;
        catalogos.set(obra, Object.fromEntries((d.codigos || []).map(c => [c.codigo, c.etiqueta || c.descripcion || ''])));
        if (vivo) setVersion(v => v + 1);
      })
      .catch(() => { /* sin catálogo: el código y «(sin descripción)» */ });
    return () => { vivo = false; };
  }, [API, obra, codigo]);
  return (c) => (catalogos.get(obra) || {})[c] || '';
}

function Casilla({ c, clase = '', children, titulo }) {
  return (
    <div className={`cajetin__cas ${clase}`} title={titulo}>
      <span className="cajetin__rot">{c.rotulo}</span>
      {children || <b className="cajetin__val">{c.valor}</b>}
      {c.detalle && <small className="cajetin__det">{c.detalle}</small>}
    </div>
  );
}

export default function CajetinDelDocumento({ API, obra, vv, file, historial, modo, onVersiones, onIrVigente, onIrAnterior }) {
  const fraseDeIdoneidad = useFraseDeIdoneidad(API, obra, file?.codigo_idoneidad);
  const c = cajetinDelDocumento({ vv, file: file || {}, historial, modo, fraseDeIdoneidad,
                                  etiquetaDeEstado: x => estadoDe(x)?.etiqueta || '' });
  const { documento, version, estado, idoneidad, vigencia, alternar } = c;
  const conConmutador = alternar && onIrVigente && onIrAnterior;

  return (
    <div className="cajetin" role="group" aria-label="Cajetín del documento">
      <Casilla c={documento} clase="cajetin__cas--doc" titulo={file?.name}>
        <b className="cajetin__val cajetin__val--codigo">{documento.valor}</b>
      </Casilla>

      {onVersiones ? (
        <button type="button" className={`cajetin__cas cajetin__cas--ver${version.aviso ? ' es-aviso' : ''}`}
          onClick={onVersiones} title="Ver el historial de versiones">
          <span className="cajetin__rot">{version.rotulo}</span>
          <b className="cajetin__val">{version.valor} <span aria-hidden="true" className="cajetin__flecha">▾</span></b>
          <small className="cajetin__det">{version.detalle}</small>
        </button>
      ) : <Casilla c={version} clase={`cajetin__cas--ver${version.aviso ? ' es-aviso' : ''}`} />}

      <Casilla c={estado} clase="cajetin__cas--est" titulo={estado.detalle || undefined} />

      <Casilla c={idoneidad} clase="cajetin__cas--idon">
        <span className="cajetin__idon">
          {idoneidad.codigo && <span className="cajetin__cod">{idoneidad.codigo}</span>}
          <b className="cajetin__val">{idoneidad.valor}</b>
        </span>
      </Casilla>

      <div className={`cajetin__cas cajetin__cas--vig${vigencia.tono === 'aviso' ? ' es-aviso' : ''}`}
        title={[vigencia.huella ? `SHA-256 de esta versión: ${vigencia.huella}` : '', conConmutador ? vigencia.detalle : '']
          .filter(Boolean).join(' · ') || undefined}
        role={vigencia.tono === 'aviso' ? 'status' : undefined}>
        <span className="cajetin__rot">{vigencia.rotulo}</span>
        <b className={`cajetin__val cajetin__vig cajetin__vig--${vigencia.tono || 'nada'}`}>{vigencia.valor}</b>
        {/* EL CONMUTADOR [Vigente | Anterior]: un clic lleva a la versión que la vigente sustituyó, y otro
            vuelve. En la anterior, el sello SUSTITUIDA lo dice sobre el contenido. */}
        {conConmutador ? (
          <span className="cajetin__alternar" role="group" aria-label="Versión que se mira">
            <button type="button" aria-pressed={alternar.enVigente} onClick={alternar.enVigente ? undefined : onIrVigente}
              title={`Ver la vigente (V${alternar.vigente})`}>Vigente</button>
            <button type="button" aria-pressed={alternar.enAnterior} onClick={alternar.enAnterior ? undefined : onIrAnterior}
              title={`Ver la anterior (V${alternar.anterior}), la que sustituyó la vigente`}>Anterior</button>
          </span>
        ) : vigencia.boton && onIrVigente
          ? <button type="button" className="cajetin__ir" onClick={onIrVigente}>{vigencia.boton}</button>
          : vigencia.detalle && <small className="cajetin__det">{vigencia.detalle}</small>}
      </div>

      {/* EL VICEVERSA (16-oct-2026): qué marcas de qué planos citan este documento. Solo aparece si
          alguien lo cita. */}
      <CitadoEn API={API} file={file} />
    </div>
  );
}

/**
 * LAS ACCIONES DEL CAJETÍN (LDA C9): copiar el enlace de lo que se mira (con su versión si no es la
 * vigente) y comparar versiones. Iguales en todos los formatos; quien las monta decide dónde van.
 */
export function AccionesDelCajetin({ onCopiarEnlace, onComparar, claseBoton = 'cajetin__accion' }) {
  return (
    <>
      {onComparar && (
        <button type="button" className={claseBoton} onClick={onComparar}
          title="Comparar versiones" aria-label="Comparar versiones">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="7" height="14" rx="1.5" />
            <rect x="13.5" y="5" width="7" height="14" rx="1.5" /><path d="M12 3v18" strokeDasharray="1.6 2.4" /></svg>
        </button>
      )}
      {onCopiarEnlace && (
        <button type="button" className={claseBoton} onClick={onCopiarEnlace}
          title="Copiar enlace" aria-label="Copiar enlace">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
            <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg>
        </button>
      )}
    </>
  );
}

/** El sello de la oficina técnica, encima de la hoja de una versión anterior (vive dentro de la hoja). */
export function SelloSustituida({ sello, enLaHoja = false }) {
  if (!sello) return null;
  const s = (
    <div className="sello-sustituida" aria-hidden="true">
      {sello.titulo}
      <small>{sello.detalle}</small>
    </div>
  );
  // Sobre la hoja, el sello se mide CON la hoja (unidades de contenedor): al alejar el plano no queda
  // un sello enorme sobre una lámina diminuta.
  return enLaHoja ? <div className="sello-sustituida__hoja">{s}</div> : s;
}
