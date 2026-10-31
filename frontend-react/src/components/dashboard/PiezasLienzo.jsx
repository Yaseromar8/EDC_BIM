// PiezasLienzo — lo que el Tablero toma de los Tableros de ACC (Forma Board, sobre tldraw; docs/visor/54):
// notas adhesivas y texto libre en el lienzo, la barra de herramientas flotante de abajo, la paleta de la
// izquierda (fuentes de datos y deshacer) y la píldora de zoom. Solo presentación: el estado vive en
// DashboardWorkspace.
import React, { useEffect, useRef, useState } from 'react';
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

export function Nota({ nota, editando, refNodo, onPointerDown, onDoubleClick, onCambiar, onTerminar }) {
  const tam = letraNota(nota.texto, nota.w, nota.h);
  return (
    <div ref={refNodo} className="tablero-nodo" onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}
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

export function TextoLibre({ nota, editando, refNodo, onPointerDown, onDoubleClick, onCambiar, onTerminar }) {
  return (
    <div ref={refNodo} className="tablero-nodo" onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}
      style={{ position: 'absolute', left: nota.x, top: nota.y, minWidth: 40, fontFamily: FUENTE, fontSize: 20, lineHeight: '26px',
        color: C.dark, whiteSpace: 'pre', padding: '3px 4px' }}>
      {editando ? <Editable texto={nota.texto} onCambiar={onCambiar} onTerminar={onTerminar} /> : (nota.texto || ' ')}
    </div>
  );
}

// Etiqueta oscura con el atajo (como Forma Board: «Nota  N»), sobre el botón, a los 350 ms.
function Ayuda({ texto, atajo, children }) {
  const [ver, setVer] = useState(false);
  const t = useRef(0);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => { clearTimeout(t.current); t.current = setTimeout(() => setVer(true), 350); }}
      onMouseLeave={() => { clearTimeout(t.current); setVer(false); }} onPointerDown={() => { clearTimeout(t.current); setVer(false); }}>
      {children}
      {ver && (
        <span role="tooltip" style={{ position: 'absolute', bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)', zIndex: 10,
          display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', pointerEvents: 'none',
          background: '#3C3C3C', color: '#fff', borderRadius: 4, padding: '5px 8px', fontFamily: FUENTE, fontSize: 11.5, fontWeight: 600 }}>
          {texto}
          {atajo && <span style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 3, padding: '0 5px', fontSize: 10.5, fontWeight: 500 }}>{atajo}</span>}
        </span>
      )}
    </span>
  );
}

// Botón de barra flotante, con las medidas de Forma Board: 32 × 32, radio 6, icono de 24 a trazo 1;
// activo en azul #006EAF con el icono en blanco.
function Boton({ activo, titulo, atajo, onClick, children, apagado }) {
  return (
    <Ayuda texto={titulo} atajo={atajo}>
      <button onClick={onClick} disabled={apagado} aria-label={titulo} aria-pressed={activo || undefined}
        style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 6, padding: 0,
          background: activo ? '#006EAF' : 'transparent', color: activo ? '#fff' : apagado ? C.midGray : '#3C3C3C', cursor: apagado ? 'default' : 'pointer',
          transition: 'background-color 120ms ease' }}
        onMouseEnter={e => { if (!activo && !apagado) e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
        onMouseLeave={e => { if (!activo) e.currentTarget.style.background = 'transparent'; }}>
        {children}
      </button>
    </Ayuda>
  );
}
// Caja flotante de Forma Board: blanca, radio 8, sin borde y una sombra difusa (0 0 16 px al 12 %).
const cajaFlotante = { background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)', fontFamily: FUENTE };

// El taco de notas: una ilustración que sobresale de la barra y se levanta al pasar el ratón (o con la
// herramienta elegida), del color de la próxima nota.
function TacoDeNotas({ color, activo, onClick }) {
  const [encima, setEncima] = useState(false);
  const arriba = encima || activo;
  return (
    <Ayuda texto="Nota" atajo="N">
      <button onClick={onClick} aria-label="Nota" aria-pressed={activo || undefined}
        onMouseEnter={() => setEncima(true)} onMouseLeave={() => setEncima(false)}
        style={{ position: 'relative', width: 64, height: 32, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' }}>
        <svg width="66" height="62" viewBox="0 0 66 62" aria-hidden="true"
          style={{ position: 'absolute', left: -1, bottom: -8, transition: 'transform 160ms ease', transform: arriba ? 'translateY(-7px)' : 'none' }}>
          <g transform="rotate(-9 30 36)"><rect x="9" y="14" width="42" height="42" rx="1.5" fill={color} style={{ filter: 'brightness(0.92)' }} /></g>
          <g transform="rotate(-3 34 32)"><rect x="13" y="9" width="42" height="42" rx="1.5" fill={color} style={{ filter: 'brightness(0.96)' }} /></g>
          <rect x="17" y="5" width="42" height="42" rx="1.5" fill={color} style={{ filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.18))' }} />
        </svg>
      </button>
    </Ayuda>
  );
}

// Tamaños de sección (como los marcos de Forma Board), en px del lienzo; A4 y Carta a 96 ppp.
const TAMANOS_SECCION = [
  ['Personalizado', null], null,
  ['16:9', [1600, 900]], ['4:3', [1200, 900]], ['1:1', [1000, 1000]], null,
  ['A4', [794, 1123]], ['A4 horizontal', [1123, 794]], null,
  ['Carta', [816, 1056]], ['Carta horizontal', [1056, 816]],
];

// Barra de herramientas de abajo, con las medidas de Forma Board (48 px de alto, 12 px entre botones):
// seleccionar, mano · nota (taco), texto, sección ▾ (tamaños).
export function BarraInferior({ herramienta, onHerramienta, colorNota, onColorNota, onSeccionTamano }) {
  const color = COLORES_NOTA[colorNota] || COLORES_NOTA.amarillo;
  const [menuSeccion, setMenuSeccion] = useState(false);
  const separador = <span style={{ width: 1, height: 24, background: 'rgba(0,0,0,0.12)' }} />;
  return (
    <div onPointerDown={e => e.stopPropagation()}
      style={{ ...cajaFlotante, position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)', zIndex: 4,
        height: 48, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12, padding: '0 12px' }}>
      <Boton activo={herramienta === 'seleccionar'} titulo="Seleccionar" atajo="V" onClick={() => onHerramienta('seleccionar')}><Icono nombre="puntero" tam={24} grosor={1} /></Boton>
      <Boton activo={herramienta === 'mano'} titulo="Mano" atajo="H" onClick={() => onHerramienta('mano')}><Icono nombre="mano" tam={24} grosor={1} /></Boton>
      {separador}
      <TacoDeNotas color={color} activo={herramienta === 'nota'} onClick={() => onHerramienta('nota')} />
      {herramienta === 'nota' && (
        <div style={{ display: 'flex', gap: 5 }}>
          {Object.entries(COLORES_NOTA).map(([k, v]) => (
            <button key={k} onClick={() => onColorNota(k)} title={k} aria-label={`Nota ${k}`}
              style={{ width: 16, height: 16, borderRadius: '50%', background: v, cursor: 'pointer', padding: 0,
                border: k === colorNota ? '2px solid #3C3C3C' : '1px solid rgba(0,0,0,0.15)' }} />
          ))}
        </div>
      )}
      <Boton activo={herramienta === 'texto'} titulo="Texto" atajo="T" onClick={() => onHerramienta('texto')}><Icono nombre="texto" tam={24} grosor={1} /></Boton>
      {/* Sección y su desplegable de tamaños */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2 }}>
        <Boton activo={herramienta === 'seccion'} titulo="Sección" atajo="F" onClick={() => onHerramienta('seccion')}><Icono nombre="marco" tam={24} grosor={1} /></Boton>
        <button onClick={() => setMenuSeccion(m => !m)} aria-label="Tamaños de sección" aria-expanded={menuSeccion}
          style={{ width: 12, height: 32, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: '#3C3C3C', display: 'flex', alignItems: 'center' }}>
          <Icono nombre="abajo" tam={12} grosor={1.5} />
        </button>
        {menuSeccion && (
          <div role="menu" style={{ ...cajaFlotante, position: 'absolute', bottom: 'calc(100% + 14px)', left: -8, minWidth: 176, padding: 6 }}>
            {TAMANOS_SECCION.map((t, i) => (t === null
              ? <div key={`s${i}`} style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '5px 4px' }} />
              : (
                <button key={t[0]} role="menuitem" onClick={() => { setMenuSeccion(false); if (t[1]) onSeccionTamano(t[0], t[1]); else onHerramienta('seccion'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 8px', border: 'none', borderRadius: 5,
                    background: 'transparent', cursor: 'pointer', fontFamily: FUENTE, fontSize: 12.5, color: '#3C3C3C', textAlign: 'left' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  <span style={{ width: 14, height: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ border: '1px solid #3C3C3C', borderRadius: 1,
                      width: t[1] ? Math.round(12 * Math.min(1, t[1][0] / t[1][1])) : 12, height: t[1] ? Math.round(12 * Math.min(1, t[1][1] / t[1][0])) : 12 }} />
                  </span>
                  {t[0]}
                </button>
              )))}
          </div>
        )}
      </div>
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
      <Icono nombre={icono} tam={22} grosor={1} />
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
        <Boton titulo="Deshacer" atajo="Ctrl+Z" onClick={onDeshacer}><Icono nombre="deshacer" tam={22} grosor={1} /></Boton>
        <Boton titulo="Rehacer" atajo="Ctrl+Y" onClick={onRehacer}><Icono nombre="rehacer" tam={22} grosor={1} /></Boton>
      </div>
    </div>
  );
}

// Píldora de zoom de abajo a la derecha: − · porcentaje ▾ (menú) · +
export function PildoraZoom({ textoRef, porcentaje, onMenos, onMas, onMenu }) {
  return (
    <div onPointerDown={e => e.stopPropagation()}
      style={{ ...cajaFlotante, position: 'absolute', right: 14, bottom: 14, zIndex: 4, display: 'flex', alignItems: 'center', padding: 3, gap: 2 }}>
      <Boton titulo="Alejar" atajo="Ctrl −" onClick={onMenos}><Icono nombre="menos" tam={18} grosor={1} /></Boton>
      <button onClick={onMenu} title="Opciones de zoom"
        style={{ height: 30, minWidth: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, border: 'none', borderRadius: 6,
          background: 'transparent', cursor: 'pointer', fontFamily: FUENTE, fontSize: 12, color: C.dark, fontVariantNumeric: 'tabular-nums' }}>
        <span ref={textoRef}>{porcentaje}</span><Icono nombre="abajo" tam={12} />
      </button>
      <Boton titulo="Acercar" atajo="Ctrl +" onClick={onMas}><Icono nombre="mas" tam={18} grosor={1} /></Boton>
    </div>
  );
}
