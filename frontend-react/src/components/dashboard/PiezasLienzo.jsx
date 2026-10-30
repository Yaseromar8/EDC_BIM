// PiezasLienzo — lo que el Tablero toma de los Tableros de ACC (Forma Board, sobre tldraw; docs/visor/54):
// notas adhesivas y texto libre en el lienzo, la barra de herramientas flotante de abajo, la paleta de la
// izquierda (fuentes de datos y deshacer) y la píldora de zoom. Solo presentación: el estado vive en
// DashboardWorkspace.
import React, { useEffect, useRef } from 'react';
import { C, FUENTE } from './tema';
import { Icono } from './Herramienta';
import { COLORES_NOTA, letraNota } from './notas';

// Texto editable en el sitio (contentEditable de texto plano): Escape o salir del campo termina.
function Editable({ texto, onCambiar, onTerminar, estilo }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerText = texto || '';
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={ref} contentEditable="plaintext-only" suppressContentEditableWarning
      onInput={e => onCambiar(e.currentTarget.innerText.replace(/\n$/, ''))}
      onBlur={onTerminar}
      onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); e.currentTarget.blur(); } }}
      onPointerDown={e => e.stopPropagation()}
      style={{ outline: 'none', cursor: 'text', minWidth: 8, ...estilo }} />
  );
}

export function Nota({ nota, editando, onPointerDown, onDoubleClick, onCambiar, onTerminar }) {
  const tam = letraNota(nota.texto, nota.w, nota.h);
  return (
    <div className="tablero-nodo" onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}
      style={{
        position: 'absolute', left: nota.x, top: nota.y, width: nota.w, height: nota.h, boxSizing: 'border-box',
        background: COLORES_NOTA[nota.color] || COLORES_NOTA.amarillo, borderRadius: 2, padding: 16,
        boxShadow: '0 1px 1px rgba(20,20,19,0.10), 0 6px 14px rgba(20,20,19,0.10)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        fontFamily: FUENTE, fontSize: tam, lineHeight: 1.25, color: C.dark, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflow: 'hidden',
      }}>
      {editando
        ? <Editable texto={nota.texto} onCambiar={onCambiar} onTerminar={onTerminar} estilo={{ width: '100%', textAlign: 'center' }} />
        : nota.texto}
    </div>
  );
}

export function TextoLibre({ nota, editando, onPointerDown, onDoubleClick, onCambiar, onTerminar }) {
  return (
    <div className="tablero-nodo" onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}
      style={{ position: 'absolute', left: nota.x, top: nota.y, minWidth: 40, fontFamily: FUENTE, fontSize: 20, lineHeight: '26px',
        color: C.dark, whiteSpace: 'pre', padding: '3px 4px' }}>
      {editando ? <Editable texto={nota.texto} onCambiar={onCambiar} onTerminar={onTerminar} /> : (nota.texto || ' ')}
    </div>
  );
}

// Botón de barra flotante: icono fino, fondo azul cuando está activo (como en Forma Board).
function Boton({ activo, titulo, onClick, children, apagado }) {
  return (
    <button onClick={onClick} disabled={apagado} title={titulo} aria-label={titulo} aria-pressed={activo || undefined}
      style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 7,
        background: activo ? '#0D66B4' : 'transparent', color: activo ? '#fff' : apagado ? C.midGray : C.dark, cursor: apagado ? 'default' : 'pointer',
        transition: 'background-color 120ms ease' }}
      onMouseEnter={e => { if (!activo && !apagado) e.currentTarget.style.background = C.light50; }}
      onMouseLeave={e => { if (!activo) e.currentTarget.style.background = 'transparent'; }}>
      {children}
    </button>
  );
}
const cajaFlotante = {
  background: '#fff', borderRadius: 10, boxShadow: '0 1px 3px rgba(20,20,19,0.10), 0 6px 18px rgba(20,20,19,0.08)',
  border: '1px solid rgba(20,20,19,0.06)', fontFamily: FUENTE,
};

// Barra de herramientas de abajo: seleccionar, mano · nota (con su color), texto, sección.
export function BarraInferior({ herramienta, onHerramienta, colorNota, onColorNota }) {
  const color = COLORES_NOTA[colorNota] || COLORES_NOTA.amarillo;
  return (
    <div onPointerDown={e => e.stopPropagation()}
      style={{ ...cajaFlotante, position: 'absolute', left: '50%', bottom: 14, transform: 'translateX(-50%)', zIndex: 4,
        display: 'flex', alignItems: 'center', gap: 4, padding: 5 }}>
      <Boton activo={herramienta === 'seleccionar'} titulo="Seleccionar (V)" onClick={() => onHerramienta('seleccionar')}><Icono nombre="puntero" tam={18} /></Boton>
      <Boton activo={herramienta === 'mano'} titulo="Mano: mover el lienzo (H)" onClick={() => onHerramienta('mano')}><Icono nombre="mano" tam={18} /></Boton>
      <span style={{ width: 1, height: 22, background: C.lightGray, margin: '0 4px' }} />
      {/* El taco de notas, del color que saldrá la próxima */}
      <button onClick={() => onHerramienta('nota')} title="Nota (N)" aria-label="Nota" aria-pressed={herramienta === 'nota' || undefined}
        style={{ position: 'relative', width: 52, height: 34, border: 'none', background: herramienta === 'nota' ? C.light50 : 'transparent', borderRadius: 7, cursor: 'pointer' }}>
        <span style={{ position: 'absolute', left: 13, top: 7, width: 22, height: 22, background: color, filter: 'brightness(0.94)', transform: 'rotate(-8deg)', borderRadius: 1 }} />
        <span style={{ position: 'absolute', left: 16, top: 5, width: 22, height: 22, background: color, boxShadow: '0 1px 2px rgba(20,20,19,0.18)', borderRadius: 1 }} />
      </button>
      {herramienta === 'nota' && (
        <div style={{ display: 'flex', gap: 4, padding: '0 4px' }}>
          {Object.entries(COLORES_NOTA).map(([k, v]) => (
            <button key={k} onClick={() => onColorNota(k)} title={k} aria-label={`Nota ${k}`}
              style={{ width: 16, height: 16, borderRadius: '50%', background: v, cursor: 'pointer',
                border: k === colorNota ? `2px solid ${C.dark}` : '1px solid rgba(20,20,19,0.15)' }} />
          ))}
        </div>
      )}
      <Boton activo={herramienta === 'texto'} titulo="Texto (T)" onClick={() => onHerramienta('texto')}><Icono nombre="texto" tam={18} /></Boton>
      <Boton activo={herramienta === 'seccion'} titulo="Sección: arrastra para dibujarla (F)" onClick={() => onHerramienta('seccion')}><Icono nombre="marco" tam={18} /></Boton>
    </div>
  );
}

// Paleta de la izquierda: lo que trae DATOS al tablero (gráfico, parámetros) y, aparte, deshacer/rehacer.
export function PaletaIzquierda({ onGrafico, onParametros, parametrosApagado, onDeshacer, onRehacer }) {
  const item = (icono, texto, onClick, apagado) => (
    <button onClick={onClick} disabled={apagado} title={texto}
      style={{ width: 52, padding: '7px 0 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, border: 'none', borderRadius: 7,
        background: 'transparent', color: apagado ? C.midGray : C.dark, cursor: apagado ? 'default' : 'pointer', fontFamily: FUENTE, fontSize: 10, lineHeight: 1.15 }}
      onMouseEnter={e => { if (!apagado) e.currentTarget.style.background = C.light50; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
      <Icono nombre={icono} tam={19} />
      <span>{texto}</span>
    </button>
  );
  return (
    <div onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', left: 12, top: 12, zIndex: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ ...cajaFlotante, padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
        {item('grafico', 'Gráfico', onGrafico)}
        {item('parametros', 'Parámetros', onParametros, parametrosApagado)}
      </div>
      <div style={{ ...cajaFlotante, padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Boton titulo="Deshacer (Ctrl+Z)" onClick={onDeshacer}><Icono nombre="deshacer" tam={17} /></Boton>
        <Boton titulo="Rehacer (Ctrl+Y)" onClick={onRehacer}><Icono nombre="rehacer" tam={17} /></Boton>
      </div>
    </div>
  );
}

// Píldora de zoom de abajo a la derecha: − · porcentaje ▾ (menú) · +
export function PildoraZoom({ textoRef, porcentaje, onMenos, onMas, onMenu }) {
  return (
    <div onPointerDown={e => e.stopPropagation()}
      style={{ ...cajaFlotante, position: 'absolute', right: 14, bottom: 14, zIndex: 4, display: 'flex', alignItems: 'center', padding: 3, gap: 2 }}>
      <Boton titulo="Alejar (Ctrl −)" onClick={onMenos}><Icono nombre="menos" tam={16} /></Boton>
      <button onClick={onMenu} title="Opciones de zoom"
        style={{ height: 30, minWidth: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, border: 'none', borderRadius: 6,
          background: 'transparent', cursor: 'pointer', fontFamily: FUENTE, fontSize: 12, color: C.dark, fontVariantNumeric: 'tabular-nums' }}>
        <span ref={textoRef}>{porcentaje}</span><Icono nombre="abajo" tam={12} />
      </button>
      <Boton titulo="Acercar (Ctrl +)" onClick={onMas}><Icono nombre="mas" tam={16} /></Boton>
    </div>
  );
}
