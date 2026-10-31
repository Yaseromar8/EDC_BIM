/**
 * PanelIncidencias — «Incidencias» de la paleta izquierda del tablero (fase 3, docs/visor/61), como el de ACC:
 * «Seleccionar incidencias» (tabla con buscador y filtros, como tarjetas o como kanban), «+ Crear incidencia» (la misma
 * ventana de «Issues y punch»; la creada entra al tablero) y «Últimas incidencias», que se JALAN al tablero.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { ChipDeEstado } from '../PunchModule';
import Arrastrable from './Arrastrable';
import { fechaCorta, ultimoMovimiento } from './incidencias';

const GRIS = '#72706B', TINTA = '#141413', BORDE = '#E5E3DA';
const TARJETA = { display: 'flex', flexDirection: 'column', gap: 6, padding: '10px 12px', borderRadius: 6, border: `1px solid ${BORDE}`, background: '#fff',
  fontFamily: 'var(--a-font-sans)', textAlign: 'left', boxSizing: 'border-box' };
const ULTIMAS = 20;

function Ficha({ i }) {
  return (
    <>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: TINTA }}>{i.codigo}</span>
        <ChipDeEstado estado={i.estado} />
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: TINTA, lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{i.titulo}</span>
      <span style={{ fontSize: 12, color: GRIS }}>{i.tipo_etiqueta} · {i.vence_en ? `Vence ${fechaCorta(i.vence_en)}` : 'Sin fecha límite'}</span>
    </>
  );
}

export default function PanelIncidencias({ incidencias, onSeleccionar, onCrear, onSoltar, onCerrar, puedeCrear }) {
  const panel = useRef(null);
  const ultimas = useMemo(() => [...(incidencias || [])].sort((a, b) => ultimoMovimiento(b).localeCompare(ultimoMovimiento(a))).slice(0, ULTIMAS), [incidencias]);

  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onCerrar]);

  const dentroDelPanel = (x, y) => {
    const r = panel.current?.getBoundingClientRect();
    return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  };

  return (
    <div ref={panel} role="dialog" aria-label="Incidencias" onPointerDown={e => e.stopPropagation()} onWheel={e => e.stopPropagation()}
      style={{ position: 'absolute', left: 80, top: 12, width: 280, maxHeight: 'calc(100% - 96px)', zIndex: 8, display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)', fontFamily: 'var(--a-font-sans)', color: TINTA }}>
      <div style={{ padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Añadir incidencias</div>
        <button type="button" className="barra-btn barra-btn--primario" onClick={onSeleccionar} style={{ width: '100%', justifyContent: 'center', height: 34, fontSize: 14 }}>
          Seleccionar incidencias
        </button>
        {puedeCrear && (
          <button type="button" className="barra-btn" onClick={onCrear} style={{ width: '100%', justifyContent: 'center', height: 34, fontSize: 14 }}>
            + Crear incidencia
          </button>
        )}
      </div>
      <div style={{ padding: '6px 14px 8px', fontSize: 13, fontWeight: 600 }}>Últimas incidencias</div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {incidencias === null && <div style={{ padding: '12px 0', color: GRIS, fontSize: 13 }}>Cargando…</div>}
        {incidencias && !incidencias.length && <div style={{ padding: '4px 0 8px', color: GRIS, fontSize: 13, lineHeight: 1.45 }}>La obra aún no tiene incidencias ni observaciones.</div>}
        {ultimas.map(i => (
          <Arrastrable key={i.id} etiqueta={`${i.codigo} ${i.titulo}. Arrástrala al tablero o pulsa Intro para añadirla`} titulo={i.titulo} estilo={TARJETA}
            onSoltar={(en) => onSoltar(i, en)} dentroDelPanel={dentroDelPanel}>
            {() => <Ficha i={i} />}
          </Arrastrable>
        ))}
      </div>
    </div>
  );
}
