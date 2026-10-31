// Menús del lienzo (docs/visor/58): el menú contextual del clic derecho (con submenús, como el de ACC / tldraw),
// el panel «Buscar» de la paleta izquierda y la ventana «Atajos de teclado». Solo presentación: las acciones
// llegan hechas desde Lienzo.jsx.
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { C, FUENTE, cajaFlotante } from './tema';
import { Icono } from './Icono';
import { COLORES_NOTA } from './notas';

const fila = { display: 'flex', alignItems: 'center', gap: 16, width: '100%', padding: '8px 12px', border: 'none', borderRadius: 5,
  background: 'transparent', fontFamily: FUENTE, fontSize: 14, textAlign: 'left', whiteSpace: 'nowrap', boxSizing: 'border-box' };
const raya = <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '4px 6px' }} />;

// Un menú (o submenú). `items`: [{ texto, atajo, accion, apagado, peligro, hijos }, null = separador].
function Lista({ items, onCerrar, estilo }) {
  const [abierto, setAbierto] = useState(null);
  const t = useRef(0);
  const visibles = items.filter((it, i) => it !== null || (i > 0 && items[i - 1] !== null && i < items.length - 1));
  return (
    <div role="menu" style={{ ...cajaFlotante, minWidth: 240, padding: 6, ...estilo }}>
      {visibles.map((it, i) => (it === null ? <React.Fragment key={`r${i}`}>{raya}</React.Fragment> : (
        <div key={it.texto} style={{ position: 'relative' }}
          onMouseEnter={() => { clearTimeout(t.current); t.current = setTimeout(() => setAbierto(it.hijos ? it.texto : null), it.hijos ? 80 : 120); }}>
          <button role="menuitem" disabled={it.apagado} aria-haspopup={it.hijos ? 'menu' : undefined}
            onClick={() => { if (it.hijos) { setAbierto(it.texto); return; } onCerrar(); it.accion(); }}
            style={{ ...fila, cursor: it.apagado ? 'default' : 'pointer', color: it.apagado ? C.midGray : it.peligro ? C.error : '#3C3C3C',
              background: abierto === it.texto ? 'rgba(0,0,0,0.05)' : 'transparent' }}
            onMouseEnter={e => { if (!it.apagado) e.currentTarget.style.background = 'rgba(0,0,0,0.05)'; }}
            onMouseLeave={e => { if (abierto !== it.texto) e.currentTarget.style.background = 'transparent'; }}>
            <span style={{ flex: 1 }}>{it.texto}</span>
            {it.atajo && <span style={{ color: it.apagado ? C.midGray : C.gris600, fontSize: 13 }}>{it.atajo}</span>}
            {it.hijos && <Icono nombre="derecha" tam={12} />}
          </button>
          {it.hijos && abierto === it.texto && (
            <Lista items={it.hijos} onCerrar={onCerrar} estilo={{ position: 'absolute', left: 'calc(100% + 2px)', top: -5, zIndex: 1 }} />
          )}
        </div>
      )))}
    </div>
  );
}

// Menú contextual en (x, y) del panel; se recoloca para no salirse.
export function MenuContextual({ x, y, items, onCerrar }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y });
  useLayoutEffect(() => {
    const el = ref.current, padre = el?.offsetParent;
    if (!el || !padre) return;
    const W = padre.clientWidth, H = padre.clientHeight, w = el.offsetWidth, h = el.offsetHeight;
    // con sitio para un submenú a la derecha
    setPos({ left: Math.max(8, Math.min(x, W - w - 8 - 230)), top: Math.max(8, Math.min(y, H - h - 8)) });
  }, [x, y]);
  useEffect(() => {
    const fuera = (e) => { if (!ref.current?.contains(e.target)) onCerrar(); };
    const tecla = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCerrar(); } };
    window.addEventListener('pointerdown', fuera, true);
    window.addEventListener('keydown', tecla, true);
    window.addEventListener('wheel', onCerrar, { passive: true });
    window.addEventListener('resize', onCerrar);
    return () => {
      window.removeEventListener('pointerdown', fuera, true); window.removeEventListener('keydown', tecla, true);
      window.removeEventListener('wheel', onCerrar); window.removeEventListener('resize', onCerrar);
    };
  }, [onCerrar]);
  return (
    <div ref={ref} onPointerDown={e => e.stopPropagation()} onContextMenu={e => e.preventDefault()}
      style={{ position: 'absolute', left: pos.left, top: pos.top, zIndex: 20 }}>
      <Lista items={items} onCerrar={onCerrar} />
    </div>
  );
}

const sinTildes = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Buscar en el tablero: notas, textos y títulos de sección. Elegir un resultado lleva la cámara a él.
export function PanelBuscar({ elementos, onIr, onCerrar }) {
  const [q, setQ] = useState('');
  const [activo, setActivo] = useState(0);
  const entrada = useRef(null);
  useEffect(() => { entrada.current?.focus(); }, []);
  const consulta = sinTildes(q.trim());
  const resultados = !consulta ? [] : elementos
    .map(x => ({ x, texto: x.titulo ?? x.texto ?? '' }))
    .filter(r => sinTildes(r.texto).includes(consulta))
    .slice(0, 50);
  const ir = (r) => r && onIr(r.x);
  return (
    <div onPointerDown={e => e.stopPropagation()} role="search"
      style={{ ...cajaFlotante, position: 'absolute', left: 80, top: 12, zIndex: 6, width: 320, maxHeight: 'calc(100% - 120px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: `1px solid ${C.light50}` }}>
        <Icono nombre="buscar" tam={16} grosor={1.3} />
        <input ref={entrada} className="lienzo-sin-anillo" value={q} onChange={e => { setQ(e.target.value); setActivo(0); }} placeholder="Buscar en el tablero" aria-label="Buscar en el tablero"
          onKeyDown={e => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onCerrar(); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); setActivo(a => Math.min(a + 1, resultados.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActivo(a => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); ir(resultados[activo]); }
          }}
          style={{ flex: 1, border: 'none', outline: 'none', fontFamily: FUENTE, fontSize: 14, color: C.dark, background: 'transparent' }} />
        <button onClick={onCerrar} aria-label="Cerrar la búsqueda" title="Cerrar"
          style={{ width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', color: C.gris600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <Icono nombre="cerrar" tam={14} />
        </button>
      </div>
      <div style={{ overflowY: 'auto', padding: consulta ? 5 : 0 }}>
        {consulta && !resultados.length && <div style={{ padding: '14px 12px', fontSize: 14, color: C.gris600 }}>Nada en el tablero dice «{q.trim()}».</div>}
        {resultados.map((r, i) => {
          const tipo = r.x.titulo !== undefined ? 'Sección' : r.x.tipo === 'texto' ? 'Texto' : 'Nota';
          return (
            <button key={r.x.id} onClick={() => ir(r)} onMouseEnter={() => setActivo(i)}
              style={{ ...fila, alignItems: 'flex-start', padding: '7px 8px', cursor: 'pointer', color: C.dark, background: i === activo ? 'rgba(0,110,175,0.08)' : 'transparent' }}>
              <span style={{ width: 12, height: 12, marginTop: 2, flexShrink: 0, borderRadius: tipo === 'Nota' ? 2 : 6, boxSizing: 'border-box',
                background: tipo === 'Nota' ? (COLORES_NOTA[r.x.color] || COLORES_NOTA.amarillo) : 'transparent',
                border: tipo === 'Nota' ? '1px solid rgba(0,0,0,0.12)' : `1.5px solid ${C.gris600}` }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ whiteSpace: 'normal', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{r.texto.replace(/\s+/g, ' ')}</span>
                <span style={{ fontSize: 12, color: C.gris600 }}>{tipo}</span>
              </span>
            </button>
          );
        })}
      </div>
      {consulta && resultados.length > 0 && (
        <div style={{ padding: '6px 12px 8px', fontSize: 11, color: C.gris600, borderTop: `1px solid ${C.light50}` }}>
          {resultados.length === 50 ? 'Los 50 primeros' : `${resultados.length} ${resultados.length === 1 ? 'resultado' : 'resultados'}`} · ↑ ↓ e Intro para ir
        </div>
      )}
    </div>
  );
}

const ATAJOS = [
  ['Herramientas', [['Seleccionar', 'V'], ['Mano', 'H'], ['Nota', 'N'], ['Texto', 'T'], ['Sección', 'F'], ['Mover el lienzo', 'Espacio + arrastrar'], ['Mover el lienzo', 'Clic derecho + arrastrar']]],
  ['Edición', [['Deshacer', 'Ctrl Z'], ['Rehacer', 'Ctrl Y'], ['Cortar', 'Ctrl X'], ['Copiar', 'Ctrl C'], ['Pegar', 'Ctrl V'], ['Duplicar', 'Ctrl D'],
    ['Eliminar', 'Supr'], ['Seleccionar todo', 'Ctrl A'], ['Bloquear', '⇧ L'], ['Editar el texto', 'Doble clic · Intro'], ['Mover', 'Flechas (⇧ ×10)']]],
  ['Orden', [['Traer al frente', '⇧ ]'], ['Traer adelante', ']'], ['Enviar atrás', '['], ['Enviar al fondo', '⇧ [']]],
  ['Vista', [['Acercar', 'Ctrl +'], ['Alejar', 'Ctrl −'], ['Zoom a 100 %', '⇧ 0'], ['Ajustar a todo', '⇧ 1'], ['Zoom a la selección', '⇧ 2'], ['Buscar', 'Ctrl F'], ['Atajos de teclado', '?']]],
];

export function VentanaAtajos({ onCerrar }) {
  useEffect(() => {
    const tecla = (e) => { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); e.stopPropagation(); onCerrar(); } };
    window.addEventListener('keydown', tecla, true);
    return () => window.removeEventListener('keydown', tecla, true);
  }, [onCerrar]);
  return (
    <div onPointerDown={e => { e.stopPropagation(); if (e.target === e.currentTarget) onCerrar(); }}
      style={{ position: 'absolute', inset: 0, zIndex: 30, background: 'rgba(20,20,19,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div role="dialog" aria-label="Atajos de teclado"
        style={{ ...cajaFlotante, width: 'min(760px, calc(100% - 48px))', maxHeight: 'calc(100% - 48px)', overflowY: 'auto', padding: '18px 22px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: C.dark }}>Atajos de teclado</span>
          <button onClick={onCerrar} aria-label="Cerrar" title="Cerrar"
            style={{ width: 28, height: 28, border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', color: C.gris600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icono nombre="cerrar" tam={15} />
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '6px 32px' }}>
          {ATAJOS.map(([grupo, lista]) => (
            <div key={grupo} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.gris600, textTransform: 'uppercase', letterSpacing: 0.4, margin: '6px 0 4px' }}>{grupo}</div>
              {lista.map(([que, tecla]) => (
                <div key={que + tecla} style={{ display: 'flex', alignItems: 'center', padding: '4px 0', borderBottom: `1px solid ${C.light50}`, fontSize: 14, color: C.dark }}>
                  <span style={{ flex: 1 }}>{que}</span>
                  <span style={{ fontSize: 13, color: '#3C3C3C', background: C.light50, borderRadius: 4, padding: '1px 7px' }}>{tecla}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
