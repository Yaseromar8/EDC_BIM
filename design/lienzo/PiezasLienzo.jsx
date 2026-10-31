// PiezasLienzo — lo que el Tablero toma de los Tableros de ACC (Forma Board, sobre tldraw; docs/visor/54):
// notas adhesivas y texto libre en el lienzo, la barra de herramientas flotante de abajo, la paleta de la
// izquierda (fuentes de datos y deshacer) y la píldora de zoom. Solo presentación: el estado vive en
// DashboardWorkspace.
import React, { useEffect, useRef, useState } from 'react';
import { C, FUENTE, cajaFlotante } from './tema';
import { Icono } from './Icono';
import { COLORES_NOTA, COLORES_TINTA, NOTA_LADO, ALINEAR, VERTICAL, fuenteDe, letraDeNota, letraDeTexto } from './notas';
import { trazadoDe, colorForma, grosorForma, discontinuo, rellenoForma, opacidadRelleno, FORMAS, NOMBRE_FORMA, GROSORES, TRAZOS, RELLENOS } from './formas';

// El dibujo de una forma como icono (barra inferior y su desplegable). Se dibuja a 44 y se reduce: a 20 px la nube
// saldría con festones de un píxel y parecería un círculo.
export function IconoForma({ forma, tam = 24 }) {
  return (
    <svg width={tam} height={tam} viewBox="0 0 48 48" aria-hidden="true">
      <path d={trazadoDe(forma, 40, 40, 2.6)} transform="translate(4 4)" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

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
      style={{ outline: 'none', cursor: 'text', minWidth: 8, userSelect: 'text', WebkitUserSelect: 'text', ...estilo }} />
  );
}

// Nota: color, letra, tamaño (automático = tan grande como quepa) y alineación horizontal y vertical.
export function Nota({ nota, editando, refNodo, onPointerDown, onDoubleClick, onCambiar, onTerminar }) {
  const alinear = nota.alinear || 'centro';
  const texto = { izquierda: 'left', centro: 'center', derecha: 'right' }[alinear] || 'center';
  return (
    <div ref={refNodo} className="tablero-nodo" onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}
      style={{
        position: 'absolute', left: nota.x, top: nota.y, width: nota.w, height: nota.h, boxSizing: 'border-box',
        background: COLORES_NOTA[nota.color] || COLORES_NOTA.amarillo, borderRadius: 2, padding: Math.round(16 * nota.w / NOTA_LADO),
        boxShadow: '0 1px 1px rgba(20,20,19,0.10), 0 6px 14px rgba(20,20,19,0.10)',
        display: 'flex', alignItems: VERTICAL[nota.vertical] || 'center', justifyContent: ALINEAR[alinear] || 'center', textAlign: texto,
        fontFamily: fuenteDe(nota).css, fontSize: letraDeNota(nota), lineHeight: 1.25, color: C.dark,
        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflow: 'hidden',
      }}>
      {editando
        ? <Editable texto={nota.texto} onCambiar={onCambiar} onTerminar={onTerminar} estilo={{ width: '100%', textAlign: texto }} />
        : nota.texto}
    </div>
  );
}

// Forma (nube de revisión, rectángulo, elipse…; formas.js): la línea, el relleno y, si se escribe, su texto dentro.
// Sin relleno solo se coge por el contorno (una franja de 14 px alrededor de la línea), como en ACC: lo que queda
// dentro —una lámina, una nota— se sigue pudiendo elegir.
export function Forma({ nota, editando, refNodo, onPointerDown, onDoubleClick, onCambiar, onTerminar }) {
  const g = grosorForma(nota), d = trazadoDe(nota.forma, nota.w, nota.h, g), color = colorForma(nota);
  const hueca = (nota.relleno || 'nada') === 'nada';
  const alinear = nota.alinear || 'centro';
  const textoAl = { izquierda: 'left', centro: 'center', derecha: 'right' }[alinear] || 'center';
  const hayTexto = editando || !!nota.texto;
  return (
    <div ref={refNodo} className="tablero-nodo tablero-forma" onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}
      style={{ position: 'absolute', left: nota.x, top: nota.y, width: nota.w, height: nota.h, pointerEvents: hueca ? 'none' : 'auto', opacity: nota.opacidad ?? 1 }}>
      <svg width={nota.w} height={nota.h} viewBox={`0 0 ${nota.w} ${nota.h}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden="true">
        <path d={d} fill={rellenoForma(nota)} fillOpacity={opacidadRelleno(nota)} stroke={color} strokeWidth={g}
          strokeDasharray={discontinuo(nota)} strokeLinecap="round" strokeLinejoin="round" style={{ pointerEvents: hueca ? 'none' : 'auto' }} />
        {hueca && <path d={d} fill="none" stroke="transparent" strokeWidth={g + 14} style={{ pointerEvents: 'stroke', cursor: 'move' }} />}
      </svg>
      {hayTexto && (
        <div style={{ position: 'absolute', inset: '12%', display: 'flex', alignItems: VERTICAL[nota.vertical] || 'center', justifyContent: ALINEAR[alinear] || 'center',
          textAlign: textoAl, fontFamily: fuenteDe(nota).css, fontSize: letraDeTexto(nota), lineHeight: 1.25, color, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
          pointerEvents: 'auto' }}>
          {editando
            ? <Editable texto={nota.texto} onCambiar={onCambiar} onTerminar={onTerminar} estilo={{ width: '100%', textAlign: textoAl }} />
            : nota.texto}
        </div>
      )}
    </div>
  );
}

export function TextoLibre({ nota, editando, refNodo, onPointerDown, onDoubleClick, onCambiar, onTerminar }) {
  return (
    <div ref={refNodo} className="tablero-nodo" onPointerDown={onPointerDown} onDoubleClick={onDoubleClick}
      style={{ position: 'absolute', left: nota.x, top: nota.y, minWidth: 40, fontFamily: fuenteDe(nota).css, fontSize: letraDeTexto(nota),
        lineHeight: `${Math.round(letraDeTexto(nota) * 1.3)}px`, color: COLORES_TINTA[nota.color] || C.dark, whiteSpace: 'pre', padding: '3px 4px',
        textAlign: { izquierda: 'left', centro: 'center', derecha: 'right' }[nota.alinear] || 'left' }}>
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
          background: '#3C3C3C', color: '#fff', borderRadius: 4, padding: '5px 8px', fontFamily: FUENTE, fontSize: 12, fontWeight: 600 }}>
          {texto}
          {atajo && <span style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 3, padding: '0 5px', fontSize: 11, fontWeight: 500 }}>{atajo}</span>}
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
// La caja flotante (cajaFlotante) vive en tema.js: la usan también los menús.

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
export function BarraInferior({ herramienta, onHerramienta, colorNota, onColorNota, onSeccionTamano, forma = 'nube', onForma }) {
  const color = COLORES_NOTA[colorNota] || COLORES_NOTA.amarillo;
  const [menuSeccion, setMenuSeccion] = useState(false);
  const [menuFormas, setMenuFormas] = useState(false);
  const formasRef = useRef(null);
  useEffect(() => {
    if (!menuFormas) return undefined;
    const fuera = (e) => { if (!formasRef.current?.contains(e.target)) setMenuFormas(false); };
    window.addEventListener('pointerdown', fuera, true);
    return () => window.removeEventListener('pointerdown', fuera, true);
  }, [menuFormas]);
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
      {/* Formas: la última elegida y, en el desplegable, todas (como Forma Board) */}
      {onForma && (
        <div ref={formasRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Boton activo={herramienta === 'forma'} titulo={NOMBRE_FORMA[forma] || 'Forma'} atajo="R" onClick={() => onForma(forma)}><IconoForma forma={forma} /></Boton>
          <button onClick={() => setMenuFormas(m => !m)} aria-label="Formas" aria-expanded={menuFormas}
            style={{ width: 12, height: 32, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: '#3C3C3C', display: 'flex', alignItems: 'center' }}>
            <Icono nombre="abajo" tam={12} grosor={1.5} />
          </button>
          {menuFormas && (
            <div role="menu" aria-label="Formas" style={{ ...cajaFlotante, position: 'absolute', bottom: 'calc(100% + 14px)', left: -120, padding: 8,
              display: 'grid', gridTemplateColumns: 'repeat(5, 36px)', gap: 4 }}>
              {FORMAS.map(([k, nombre]) => (
                <Ayuda key={k} texto={nombre}>
                  <button role="menuitem" aria-label={nombre} aria-current={k === forma || undefined} onClick={() => { setMenuFormas(false); onForma(k); }}
                    style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', borderRadius: 6, padding: 0, cursor: 'pointer',
                      background: k === forma ? 'rgba(0,110,175,0.10)' : 'transparent', color: k === forma ? '#006EAF' : '#3C3C3C' }}
                    onMouseEnter={e => { if (k !== forma) e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = k === forma ? 'rgba(0,110,175,0.10)' : 'transparent'; }}>
                    <IconoForma forma={k} tam={22} />
                  </button>
                </Ayuda>
              ))}
            </div>
          )}
        </div>
      )}
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
                    background: 'transparent', cursor: 'pointer', fontFamily: FUENTE, fontSize: 14, color: '#3C3C3C', textAlign: 'left' }}
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

// Paleta de la izquierda: lo que trae DATOS al tablero y, aparte, deshacer/rehacer. `items` = [[icono, texto,
// onClick, apagado], …]; sin `items`, los del Tablero de View (gráfico y parámetros).
export function PaletaIzquierda({ items, onGrafico, onParametros, parametrosApagado, onDeshacer, onRehacer }) {
  const lista = items || [['grafico', 'Gráfico', onGrafico], ['parametros', 'Parámetros', onParametros, parametrosApagado]];
  const item = (icono, texto, onClick, apagado) => (
    <button onClick={onClick} disabled={apagado} title={texto}
      style={{ width: 52, padding: '7px 0 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, border: 'none', borderRadius: 7,
        background: 'transparent', color: apagado ? C.midGray : C.dark, cursor: apagado ? 'default' : 'pointer', fontFamily: FUENTE, fontSize: 11, lineHeight: 1.15 }}
      onMouseEnter={e => { if (!apagado) e.currentTarget.style.background = C.light50; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
      <Icono nombre={icono} tam={22} grosor={1} />
      <span>{texto}</span>
    </button>
  );
  return (
    <div onPointerDown={e => e.stopPropagation()} style={{ position: 'absolute', left: 12, top: 12, zIndex: 4, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {lista.length > 0 && (
        <div style={{ ...cajaFlotante, padding: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {lista.map(([icono, texto, onClick, apagado]) => <React.Fragment key={texto}>{item(icono, texto, onClick, apagado)}</React.Fragment>)}
        </div>
      )}
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
          background: 'transparent', cursor: 'pointer', fontFamily: FUENTE, fontSize: 13, color: C.dark, fontVariantNumeric: 'tabular-nums' }}>
        <span ref={textoRef}>{porcentaje}</span><Icono nombre="abajo" tam={12} />
      </button>
      <Boton titulo="Acercar" atajo="Ctrl +" onClick={onMas}><Icono nombre="mas" tam={18} grosor={1} /></Boton>
    </div>
  );
}

// ── Barra contextual de la selección (como la de ACC: encima de lo elegido) ─────────────────────────────
// Bloquear · color · letra · tamaño · alineación horizontal y vertical · ⋮ (duplicar, orden, eliminar).
// Solo presentación: `estilo` es el de lo elegido y cada cambio sube con onEstilo.
const OPCIONES_ALINEAR = [['izquierda', 'alinearIzquierda', 'Izquierda'], ['centro', 'alinearCentro', 'Centro'], ['derecha', 'alinearDerecha', 'Derecha']];
const OPCIONES_VERTICAL = [['arriba', 'verticalArriba', 'Arriba'], ['centro', 'verticalCentro', 'Centro'], ['abajo', 'verticalAbajo', 'Abajo']];
const separadorBarra = <span style={{ width: 1, height: 24, background: 'rgba(0,0,0,0.12)', flexShrink: 0 }} />;

function Desplegable({ texto, ancho, abierto, onClick, titulo }) {
  return (
    <button onClick={onClick} aria-label={titulo} title={titulo} aria-expanded={abierto}
      style={{ height: 30, width: ancho, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, padding: '0 8px 0 10px',
        border: `1px solid ${abierto ? '#006EAF' : 'rgba(0,0,0,0.18)'}`, borderRadius: 4, background: '#fff', cursor: 'pointer',
        fontFamily: FUENTE, fontSize: 13, color: '#3C3C3C', whiteSpace: 'nowrap', overflow: 'hidden' }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{texto}</span><Icono nombre="abajo" tam={12} />
    </button>
  );
}

function Lista({ children, ancho = 180 }) {
  return (
    <div role="menu" style={{ ...cajaFlotante, position: 'absolute', top: 'calc(100% + 8px)', left: 0, minWidth: ancho, padding: 6, zIndex: 2 }}>
      {children}
    </div>
  );
}

function Opcion({ elegida, onClick, children, peligro, atajo }) {
  const fondo = elegida ? 'rgba(0,110,175,0.08)' : 'transparent';
  return (
    <button role="menuitem" aria-current={elegida || undefined} onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '8px 10px', border: 'none', borderRadius: 5,
        background: fondo, cursor: 'pointer', fontFamily: FUENTE, fontSize: 14,
        color: peligro ? C.error : '#3C3C3C', textAlign: 'left', whiteSpace: 'nowrap' }}
      onMouseEnter={e => { if (!elegida) e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = fondo; }}>
      <span style={{ flex: 1, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{children}</span>
      {atajo && <span style={{ color: C.gris600, fontSize: 13 }}>{atajo}</span>}
    </button>
  );
}

// La opacidad se arrastra en vivo pero se apunta una vez, al soltar (un solo paso de deshacer).
function Opacidad({ valor, onSoltar }) {
  const [v, setV] = useState(Math.round((valor ?? 1) * 100));
  useEffect(() => { setV(Math.round((valor ?? 1) * 100)); }, [valor]);
  const soltar = () => { if (v / 100 !== (valor ?? 1)) onSoltar(v / 100); };
  return (
    <label style={{ display: 'block', padding: '4px 4px 8px' }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', fontFamily: FUENTE, fontSize: 13, color: '#3C3C3C', marginBottom: 6 }}>
        <span>Opacidad</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{v} %</span>
      </span>
      <input type="range" min={10} max={100} step={5} value={v} aria-label="Opacidad" onChange={e => setV(Number(e.target.value))}
        onPointerUp={(e) => { soltar(); e.currentTarget.blur(); }} onKeyUp={soltar} onBlur={soltar} style={{ width: '100%' }} />
    </label>
  );
}

const etiquetaPequena = (t) => <div style={{ fontFamily: FUENTE, fontSize: 13, color: '#3C3C3C', padding: '6px 4px' }}>{t}</div>;
const casilla = (elegida) => ({ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'pointer', padding: 0,
  border: `1px solid ${elegida ? '#006EAF' : 'transparent'}`, background: elegida ? 'rgba(0,110,175,0.08)' : 'transparent' });

export function BarraContextual({ estilo = {}, conNotas, conTextos, conEstilo, bloqueado, onEstilo, onBloquear, acciones, colores, fuentes, tamanos, extra = null,
  formas = null, coloresForma = {}, formasConTexto = false, onTextoForma }) {
  const [abierto, setAbierto] = useState(null);
  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = () => setAbierto(null);
    window.addEventListener('pointerdown', cerrar);
    return () => window.removeEventListener('pointerdown', cerrar);
  }, [abierto]);
  const alternar = (k) => setAbierto(a => (a === k ? null : k));
  const elegir = (patch) => { setAbierto(null); onEstilo(patch); };
  const alineado = estilo.alinear || (conNotas || formas ? 'centro' : 'izquierda');
  const vertical = estilo.vertical || 'centro';
  const muestra = conNotas ? colores.nota : colores.tinta;
  const desplegado = (k, boton, lista) => (
    <div style={{ position: 'relative', display: 'flex' }}>{boton}{abierto === k && lista}</div>
  );
  // Letra · tamaño · | · alineación (y la vertical en notas y formas): notas, textos y formas.
  const controlesDeTexto = (conVertical) => (
    <>
      {desplegado('fuente', <Desplegable titulo="Letra" texto={(fuentes[estilo.fuente] || fuentes.sans).nombre} ancho={136} abierto={abierto === 'fuente'} onClick={() => alternar('fuente')} />, (
        <Lista>{Object.entries(fuentes).map(([k, f]) => (
          <Opcion key={k} elegida={(estilo.fuente || 'sans') === k} onClick={() => elegir({ fuente: k })}><span style={{ fontFamily: f.css }}>{f.nombre}</span></Opcion>
        ))}</Lista>
      ))}
      {desplegado('tamano', <Desplegable titulo="Tamaño de la letra" texto={(tamanos.find(t => t[0] === (estilo.tamano || 'auto')) || tamanos[0])[1]} ancho={112} abierto={abierto === 'tamano'} onClick={() => alternar('tamano')} />, (
        <Lista ancho={150}>{tamanos.map(([k, t]) => (
          <Opcion key={k} elegida={(estilo.tamano || 'auto') === k} onClick={() => elegir({ tamano: k })}>{t}</Opcion>
        ))}</Lista>
      ))}
      {separadorBarra}
      {desplegado('alinear', (
        <Boton titulo="Alineación" activo={abierto === 'alinear'} onClick={() => alternar('alinear')}>
          <Icono nombre={(OPCIONES_ALINEAR.find(o => o[0] === alineado) || OPCIONES_ALINEAR[1])[1]} tam={20} grosor={1.2} />
        </Boton>
      ), (
        <Lista ancho={150}>{OPCIONES_ALINEAR.map(([k, ic, t]) => (
          <Opcion key={k} elegida={alineado === k} onClick={() => elegir({ alinear: k })}><Icono nombre={ic} tam={16} grosor={1.2} />{t}</Opcion>
        ))}</Lista>
      ))}
      {conVertical && desplegado('vertical', (
        <Boton titulo="Alineación vertical" activo={abierto === 'vertical'} onClick={() => alternar('vertical')}>
          <Icono nombre={(OPCIONES_VERTICAL.find(o => o[0] === vertical) || OPCIONES_VERTICAL[1])[1]} tam={20} grosor={1.2} />
        </Boton>
      ), (
        <Lista ancho={150}>{OPCIONES_VERTICAL.map(([k, ic, t]) => (
          <Opcion key={k} elegida={vertical === k} onClick={() => elegir({ vertical: k })}><Icono nombre={ic} tam={16} grosor={1.2} />{t}</Opcion>
        ))}</Lista>
      ))}
    </>
  );
  return (
    <div onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
      style={{ ...cajaFlotante, height: 48, boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', whiteSpace: 'nowrap' }}>
      <Boton titulo={bloqueado ? 'Desbloquear' : 'Bloquear'} atajo="Ctrl ⇧ L" activo={bloqueado} onClick={onBloquear}>
        <Icono nombre={bloqueado ? 'candado' : 'candadoAbierto'} tam={20} grosor={1.2} />
      </Boton>
      {/* Lo propio del tipo elegido (un documento: su versión y «Abrir»), entre el candado y el estilo. */}
      {extra && <>{separadorBarra}{extra}</>}
      {conEstilo && !bloqueado && (
        <>
          {separadorBarra}
          {desplegado('color', (
            <Boton titulo="Color" activo={abierto === 'color'} onClick={() => alternar('color')}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', boxSizing: 'border-box', border: '1px solid rgba(0,0,0,0.18)',
                background: muestra[estilo.color] || (conNotas ? muestra.amarillo : muestra.gris) }} />
            </Boton>
          ), (
            <div role="menu" style={{ ...cajaFlotante, position: 'absolute', top: 'calc(100% + 8px)', left: -4, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(3, 28px)', gap: 6, zIndex: 2 }}>
              {Object.entries(muestra).map(([k, v]) => (
                <button key={k} onClick={() => elegir({ color: k })} aria-label={k} title={k[0].toUpperCase() + k.slice(1)}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: v, cursor: 'pointer', padding: 0, boxSizing: 'border-box',
                    border: k === estilo.color ? '2px solid #006EAF' : '1px solid rgba(0,0,0,0.15)' }} />
              ))}
            </div>
          ))}
          {separadorBarra}
          {controlesDeTexto(conNotas && !conTextos)}
        </>
      )}
      {formas && !bloqueado && (
        <>
          {separadorBarra}
          {desplegado('linea', (
            <Boton titulo="Línea" activo={abierto === 'linea'} onClick={() => alternar('linea')}>
              <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth={1.3}
                strokeDasharray={formas.trazo === 'discontinuo' ? '4 3' : formas.trazo === 'punteado' ? '0 3' : undefined} strokeLinecap="round" /></svg>
            </Boton>
          ), (
            <div role="menu" aria-label="Línea" style={{ ...cajaFlotante, position: 'absolute', top: 'calc(100% + 8px)', left: -4, padding: 8, zIndex: 2, width: 196 }}>
              {etiquetaPequena('Grosor')}
              <div style={{ display: 'flex', gap: 4 }}>
                {Object.entries(GROSORES).map(([k, g]) => (
                  <button key={k} onClick={() => elegir({ grosor: k })} aria-label={`Grosor ${k.toUpperCase()}`} aria-current={formas.grosor === k || undefined}
                    style={{ ...casilla(formas.grosor === k), width: 44 }}>
                    <span style={{ width: Math.min(14, g + 2), height: Math.min(14, g + 2), borderRadius: '50%', background: '#3C3C3C' }} />
                  </button>
                ))}
              </div>
              {etiquetaPequena('Trazo')}
              <div style={{ display: 'flex', gap: 4 }}>
                {TRAZOS.map(([k, t]) => (
                  <button key={k} onClick={() => elegir({ trazo: k })} aria-label={t} title={t} aria-current={(formas.trazo || 'continuo') === k || undefined}
                    style={{ ...casilla((formas.trazo || 'continuo') === k), width: 58 }}>
                    <svg width="36" height="8" viewBox="0 0 36 8" aria-hidden="true"><path d="M3 4h30" stroke="#3C3C3C" strokeWidth="2.2" strokeLinecap="round"
                      strokeDasharray={k === 'discontinuo' ? '6 4' : k === 'punteado' ? '0 4.5' : undefined} /></svg>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {desplegado('colorForma', (
            <Boton titulo="Color" activo={abierto === 'colorForma'} onClick={() => alternar('colorForma')}>
              <span style={{ width: 18, height: 18, borderRadius: '50%', boxSizing: 'border-box', border: '1px solid rgba(0,0,0,0.18)',
                background: coloresForma[formas.color] || '#fff' }} />
            </Boton>
          ), (
            <div role="menu" aria-label="Color" style={{ ...cajaFlotante, position: 'absolute', top: 'calc(100% + 8px)', left: -4, padding: 8, display: 'grid', gridTemplateColumns: 'repeat(5, 28px)', gap: 6, zIndex: 2 }}>
              {Object.entries(coloresForma).map(([k, v]) => (
                <button key={k} onClick={() => elegir({ color: k })} aria-label={k} title={k[0].toUpperCase() + k.slice(1)}
                  style={{ width: 28, height: 28, borderRadius: '50%', background: v, cursor: 'pointer', padding: 0, boxSizing: 'border-box',
                    border: k === formas.color ? '2px solid #006EAF' : '1px solid rgba(0,0,0,0.15)' }} />
              ))}
            </div>
          ))}
          {desplegado('relleno', (
            <Boton titulo="Relleno" activo={abierto === 'relleno'} onClick={() => alternar('relleno')}>
              <span style={{ width: 16, height: 16, borderRadius: 3, boxSizing: 'border-box', border: `1.5px solid ${coloresForma[formas.color] || '#3C3C3C'}`,
                background: formas.relleno === 'solido' ? coloresForma[formas.color] : formas.relleno === 'suave' ? `${coloresForma[formas.color]}33` : 'transparent' }} />
            </Boton>
          ), (
            <div role="menu" aria-label="Relleno" style={{ ...cajaFlotante, position: 'absolute', top: 'calc(100% + 8px)', left: -4, padding: 8, zIndex: 2, width: 196 }}>
              <Opacidad valor={formas.opacidad} onSoltar={(o) => onEstilo({ opacidad: o })} />
              {etiquetaPequena('Relleno')}
              <div style={{ display: 'flex', gap: 4 }}>
                {RELLENOS.map(([k, t]) => (
                  <button key={k} onClick={() => elegir({ relleno: k })} aria-label={t} title={t} aria-current={(formas.relleno || 'nada') === k || undefined}
                    style={{ ...casilla((formas.relleno || 'nada') === k), width: 58 }}>
                    <span style={{ width: 20, height: 20, borderRadius: 4, boxSizing: 'border-box', border: `1.5px solid ${coloresForma[formas.color] || '#3C3C3C'}`,
                      background: k === 'solido' ? coloresForma[formas.color] : k === 'suave' ? `${coloresForma[formas.color]}33` : 'transparent' }} />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {separadorBarra}
          {/* El texto de una forma, como en ACC: «Añadir texto» y, cuando lo hay, su letra, tamaño y alineación. */}
          {formasConTexto ? controlesDeTexto(true) : (
            <Boton titulo="Añadir texto" onClick={onTextoForma}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                <path d="M3 4.5h9M7.5 4.5v11M13 12h5M15.5 9.5v5" /></svg>
            </Boton>
          )}
        </>
      )}
      {separadorBarra}
      {desplegado('mas', <Boton titulo="Más" activo={abierto === 'mas'} onClick={() => alternar('mas')}><Icono nombre="puntos" tam={20} grosor={1.4} /></Boton>, (
        <Lista ancho={220}>{acciones.map((a, i) => (a === null
          ? <div key={`s${i}`} style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '5px 4px' }} />
          : <Opcion key={a[0]} atajo={a[1]} peligro={a[3]} onClick={() => { setAbierto(null); a[2](); }}>{a[0]}</Opcion>
        ))}</Lista>
      ))}
    </div>
  );
}
