/**
 * PanelDocumentos — «Documentos» de la paleta izquierda del tablero (docs/visor/59 §6.1), como «Añadir archivos de
 * Data Management» de ACC:
 *
 * - «Añadir documento» abre la ventana para explorar, buscar y marcar varios (SelectorDocumentos).
 * - «Visualizados recientemente»: los últimos documentos que ESTA persona abrió en la obra, de cualquier tipo, con
 *   «Cargar más». Cada tarjeta SE JALA al tablero: una copia translúcida sigue al ratón y, al soltar, el documento
 *   aparece donde se soltó, elegido, y el panel se cierra. Un clic (o Intro) lo pone en el centro de la vista.
 *
 * Todo por rutas que ya existen (/api/docs/search?vista=vistos&pagina=N): lo que cada persona no puede ver, el
 * servidor ya no lo devuelve.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API } from '../../utils/helpers';
import { apiFetch } from '../../utils/apiFetch';
import { renderFileIconSop } from '../../utils/fileIcons';
import { fechaHora } from './documentos';
import SelectorDocumentos from './SelectorDocumentos';
import Arrastrable from './Arrastrable';

const GRIS = '#72706B', TINTA = '#141413', BORDE = '#E5E3DA';

function Ficha({ fila, fantasma = false }) {
  return (
    <>
      <span style={{ flexShrink: 0, display: 'inline-flex', marginTop: 1 }}>{renderFileIconSop(fila.name, 18)}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'break-word',
          fontSize: 13, fontWeight: 600, color: TINTA, lineHeight: 1.35 }}>{fila.name}</span>
        <span style={{ display: 'block', marginTop: 4, fontSize: 12, color: fantasma ? '#8A8880' : GRIS, lineHeight: 1.35 }}>
          Última actualización: {fechaHora(fila.updated)}
        </span>
      </span>
    </>
  );
}

const TARJETA = { display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 6, border: `1px solid ${BORDE}`, background: '#fff',
  fontFamily: 'var(--a-font-sans)', textAlign: 'left', boxSizing: 'border-box' };

// Una tarjeta de la lista: se jala con el ratón (o el dedo) y se suelta en el tablero (Arrastrable).
function TarjetaReciente({ fila, onSoltar, dentroDelPanel }) {
  return (
    <Arrastrable etiqueta={`${fila.name}. Arrástralo al tablero o pulsa Intro para añadirlo`} titulo={fila.name} estilo={TARJETA}
      onSoltar={(en) => onSoltar(fila, en)} dentroDelPanel={dentroDelPanel}>
      {(fantasma) => <Ficha fila={fila} fantasma={fantasma} />}
    </Arrastrable>
  );
}

export default function PanelDocumentos({ obra, onAnadir, onSoltar, onCerrar }) {
  const [filas, setFilas] = useState(null);
  const [pagina, setPagina] = useState(0);
  const [hayMas, setHayMas] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState('');
  const [selector, setSelector] = useState(false);
  const panel = useRef(null);

  const cargar = useCallback(async (n) => {
    if (n > 0) setCargandoMas(true);
    try {
      const r = await apiFetch(`${API}/api/docs/search?vista=vistos&pagina=${n}&model_urn=${encodeURIComponent(obra)}`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.success === false) { setError(d.error || 'No se pudo leer la lista.'); setFilas(f => f || []); return; }
      setFilas(f => (n > 0 ? [...(f || []), ...(d.data || [])] : (d.data || [])));
      setPagina(n); setHayMas(!!d.hay_mas); setError('');
    } catch { setError('No se pudo conectar con el servidor.'); setFilas(f => f || []); } finally { setCargandoMas(false); }
  }, [obra]);
  useEffect(() => { cargar(0); }, [cargar]);

  useEffect(() => {
    if (selector) return undefined;
    const tecla = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [selector, onCerrar]);

  const dentroDelPanel = (x, y) => {
    const r = panel.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  return (
    <>
      <div ref={panel} role="dialog" aria-label="Documentos" onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}
        style={{ position: 'absolute', left: 80, top: 12, width: 280, maxHeight: 'calc(100% - 96px)', zIndex: 8, display: 'flex', flexDirection: 'column',
          background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)', fontFamily: 'var(--a-font-sans)', color: TINTA }}>
        <div style={{ padding: '14px 14px 10px' }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Añadir documentos de Archivos</div>
          <button type="button" className="barra-btn barra-btn--primario" onClick={() => setSelector(true)}
            style={{ width: '100%', justifyContent: 'center', height: 34, fontSize: 14 }}>
            + Añadir documento
          </button>
        </div>
        <div style={{ padding: '6px 14px 8px', fontSize: 13, fontWeight: 600 }}>Visualizados recientemente</div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filas === null && <div style={{ padding: '12px 0', color: GRIS, fontSize: 13 }}>Cargando…</div>}
          {filas && error && <div style={{ padding: '12px 0', color: GRIS, fontSize: 13 }}>{error}</div>}
          {filas && !error && !filas.length && (
            <div style={{ padding: '4px 0 8px', color: GRIS, fontSize: 13, lineHeight: 1.45 }}>Los documentos que abras en Archivos aparecerán aquí.</div>
          )}
          {filas && filas.map(f => <TarjetaReciente key={f.id} fila={f} onSoltar={onSoltar} dentroDelPanel={dentroDelPanel} />)}
          {filas && hayMas && (
            <button type="button" onClick={() => cargar(pagina + 1)} disabled={cargandoMas}
              style={{ alignSelf: 'center', marginTop: 4, padding: '6px 12px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: TINTA }}>
              {cargandoMas ? 'Cargando…' : 'Cargar más'}
            </button>
          )}
        </div>
      </div>
      {selector && <SelectorDocumentos obra={obra} onCerrar={() => setSelector(false)} onAnadir={(lista) => { setSelector(false); onAnadir(lista); }} />}
    </>
  );
}
