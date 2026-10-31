// PanelComentarios — «Comentarios» de la paleta izquierda del tablero (docs/visor/64): los abiertos y los resueltos,
// el más reciente arriba. Un clic lleva la cámara al alfiler y abre su hilo.
import React, { useEffect, useMemo, useState } from 'react';
import { colorDe, iniciales, cuando } from './comentarios';

const GRIS = '#72706B', TINTA = '#141413', BORDE = '#E5E3DA', SUAVE = '#f1f0e8';
const ultimo = (c) => (c.mensajes?.length ? c.mensajes[c.mensajes.length - 1].fecha : c.creadoEn) || '';

export default function PanelComentarios({ comentarios, abiertoId, onIr, onCerrar }) {
  const [pestana, setPestana] = useState('abiertos');
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);
  const conTexto = useMemo(() => comentarios.filter(c => c.mensajes?.length), [comentarios]);
  const abiertos = conTexto.filter(c => !c.resuelto), resueltos = conTexto.filter(c => c.resuelto);
  const lista = [...(pestana === 'abiertos' ? abiertos : resueltos)].sort((a, b) => ultimo(b).localeCompare(ultimo(a)));
  const tab = (clave, texto, n) => (
    <button type="button" role="tab" aria-selected={pestana === clave} onClick={() => setPestana(clave)}
      style={{ flex: 1, height: 32, border: 'none', borderBottom: `2px solid ${pestana === clave ? TINTA : 'transparent'}`, background: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: pestana === clave ? 600 : 400, fontFamily: 'inherit', color: TINTA }}>{texto} ({n})</button>
  );
  return (
    <div role="dialog" aria-label="Comentarios" onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}
      style={{ position: 'absolute', left: 80, top: 12, width: 300, maxHeight: 'calc(100% - 96px)', zIndex: 8, display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)', fontFamily: 'var(--a-font-sans)', color: TINTA }}>
      <div style={{ padding: '14px 14px 4px', fontSize: 13, fontWeight: 600 }}>Comentarios</div>
      <div role="tablist" style={{ display: 'flex', padding: '0 8px', borderBottom: `1px solid ${BORDE}` }}>
        {tab('abiertos', 'Abiertos', abiertos.length)}
        {tab('resueltos', 'Resueltos', resueltos.length)}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {!lista.length && (
          <div style={{ padding: '8px 6px', color: GRIS, fontSize: 13, lineHeight: 1.5 }}>
            {pestana === 'abiertos'
              ? 'No hay comentarios abiertos. Pulsa C (o el bocadillo de la barra de abajo) y haz clic en el tablero para comentar.'
              : 'Aún no hay comentarios resueltos.'}
          </div>
        )}
        {lista.map(c => {
          const primero = c.mensajes[0], respuestas = c.mensajes.length - 1;
          return (
            <button key={c.id} type="button" data-comentario-lista={c.id} onClick={() => onIr(c.id)}
              style={{ display: 'flex', gap: 10, padding: '8px 8px', border: 'none', borderRadius: 6, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: TINTA,
                background: abiertoId === c.id ? SUAVE : 'transparent' }}
              onMouseEnter={e => { e.currentTarget.style.background = SUAVE; }} onMouseLeave={e => { e.currentTarget.style.background = abiertoId === c.id ? SUAVE : 'transparent'; }}>
              <span aria-hidden="true" style={{ width: 24, height: 24, flexShrink: 0, borderRadius: '12px 12px 12px 2px', background: c.resuelto ? '#b0aea5' : colorDe(c.autorId), color: '#fff',
                fontSize: 10, fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{iniciales(c.autor)}</span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{primero.autor}</span>
                  <span style={{ fontSize: 12, color: GRIS, whiteSpace: 'nowrap' }}>{cuando(primero.fecha)}</span>
                </span>
                <span style={{ fontSize: 13, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{primero.texto}</span>
                {respuestas > 0 && <span style={{ fontSize: 12, color: GRIS }}>{respuestas === 1 ? '1 respuesta' : `${respuestas} respuestas`}</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
