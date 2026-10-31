// PanelPresentacion — «Presentar» de la cabecera del tablero (docs/visor/65), como «Editar presentación» de Forma Board:
// las secciones del tablero, en el orden en que se presentarán (de lectura), «Presentar» desde la primera y, con un clic
// en una, desde esa. Sin secciones, explica cómo crearlas.
import React from 'react';

const GRIS = '#72706B', TINTA = '#141413', BORDE = '#E5E3DA', SUAVE = '#f1f0e8';

export default function PanelPresentacion({ secciones, onPresentar, onIr, onCerrar }) {
  return (
    <div role="dialog" aria-label="Presentación" onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar(); } }}
      style={{ position: 'absolute', right: 12, top: 12, width: 320, maxHeight: 'calc(100% - 96px)', zIndex: 8, display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)', fontFamily: 'var(--a-font-sans)', color: TINTA }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px 8px 10px 14px', borderBottom: `1px solid ${BORDE}` }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Presentación</span>
        <button type="button" aria-label="Cerrar la presentación" onClick={onCerrar}
          style={{ width: 30, height: 30, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: TINTA }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button type="button" className="barra-btn barra-btn--primario" disabled={!secciones.length} onClick={() => onPresentar(0)}
          style={{ width: '100%', justifyContent: 'center', height: 34, fontSize: 14 }}>▶ Presentar</button>
        {!secciones.length ? (
          <div style={{ textAlign: 'center', padding: '12px 4px 4px', color: GRIS, fontSize: 13, lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, color: TINTA, marginBottom: 4 }}>Aún no hay secciones</div>
            Cada sección del tablero es una diapositiva. Crea una con la herramienta Sección (F) de la barra de abajo.
          </div>
        ) : (
          <div style={{ fontSize: 12, color: GRIS, lineHeight: 1.45 }}>Las secciones se presentan en orden de lectura: por filas, de arriba abajo y de izquierda a derecha.</div>
        )}
      </div>
      {secciones.length > 0 && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 8px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {secciones.map((f, i) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 4, borderRadius: 6 }}
              onMouseEnter={e => { e.currentTarget.style.background = SUAVE; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
              <button type="button" data-diapositiva={f.id} onClick={() => onIr(f.id)} title="Ver en el tablero"
                style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 6px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', color: TINTA, textAlign: 'left' }}>
                <span style={{ width: 22, fontSize: 12, color: GRIS, textAlign: 'right' }}>{i + 1}</span>
                <span style={{ fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.titulo || 'Sección'}</span>
              </button>
              <button type="button" aria-label={`Presentar desde «${f.titulo || 'Sección'}»`} title="Presentar desde aquí" onClick={() => onPresentar(i)}
                style={{ width: 30, height: 30, flexShrink: 0, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: TINTA, fontSize: 12 }}>▶</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
