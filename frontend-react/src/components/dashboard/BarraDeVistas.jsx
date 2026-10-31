// BarraDeVistas — una sola barra para las vistas del Tablero (docs/visor/52): pestañas («Lienzo» y una
// por vista, la activa subrayada) y, en una vista, sus acciones en el menú «⋯» (compartir y gestionar).
// En el modo de elegir tarjetas, la misma barra pide el título y fija la vista.
// `data-escape-propio`: el visor corta Escape en la ventana (Viewer.jsx); con él, Escape llega a la barra.
import React, { useEffect, useRef, useState } from 'react';
import { C, FUENTE } from './tema';

const pestaña = (activa) => ({
  background: 'none', border: 'none', borderBottom: `2px solid ${activa ? C.dark : 'transparent'}`,
  color: activa ? C.dark : C.gris600, fontWeight: activa ? 600 : 500, fontSize: 13, fontFamily: FUENTE,
  padding: '9px 10px 7px', cursor: 'pointer', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
});
const boton = (principal = false, apagado = false) => ({
  padding: '5px 12px', borderRadius: 6, fontSize: 13, fontFamily: FUENTE, cursor: apagado ? 'default' : 'pointer',
  border: `1px solid ${principal && !apagado ? C.dark : C.gris300}`,
  background: apagado ? C.light50 : principal ? C.dark : C.blanco, color: apagado ? C.midGray : principal ? C.light : C.dark,
});

function Icono({ d }) {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
}
const ICONOS = {
  enlace: <><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" /><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" /></>,
  imagen: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
  pdf: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" /></>,
  renombrar: <><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" /></>,
  quitar: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></>,
};

function Menu({ onCerrar, grupos }) {
  const ref = useRef(null);
  // «Fuera» es fuera del menú Y de su botón (el padre): si no, pulsar «⋯» para cerrarlo lo cierra y lo
  // vuelve a abrir. En fase de captura: el visor se queda con las teclas y Escape no llegaba.
  useEffect(() => {
    const fuera = (e) => { const caja = ref.current?.parentElement; if (caja && !caja.contains(e.target)) onCerrar(); };
    const tecla = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onCerrar(); } };
    document.addEventListener('pointerdown', fuera, true);
    document.addEventListener('keydown', tecla, true);
    return () => { document.removeEventListener('pointerdown', fuera, true); document.removeEventListener('keydown', tecla, true); };
  }, [onCerrar]);
  return (
    <div ref={ref} role="menu" style={{
      position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50, minWidth: 230, padding: '6px 0',
      background: C.blanco, border: `1px solid ${C.lightGray}`, borderRadius: 8, boxShadow: '0 6px 20px rgba(20,20,19,0.12)', fontFamily: FUENTE,
    }}>
      {grupos.map((g, i) => (
        <div key={g.titulo} style={{ borderTop: i ? `1px solid ${C.light50}` : 'none', paddingTop: i ? 4 : 0, marginTop: i ? 4 : 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.gris600, textTransform: 'uppercase', letterSpacing: 0.4, padding: '4px 14px 2px' }}>{g.titulo}</div>
          {g.items.map(it => (
            <button key={it.texto} role="menuitem" onClick={() => { onCerrar(); it.accion(); }} title={it.ayuda || ''}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 14px', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 13, fontFamily: FUENTE, color: it.peligro ? C.error : C.dark, textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.background = C.light50; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}>
              <span style={{ color: it.peligro ? C.error : C.gris600, display: 'flex' }}><Icono d={ICONOS[it.icono]} /></span>
              {it.texto}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function BarraDeVistas({
  vistas, vistaActiva, onIr, eligiendo, nElegidas, nombreVista, onNombre, onFijar, onCancelar, onNuevaVista, puedeNueva,
  vistaVisible, nGraficas, ocupado, aviso, listo, onGuardar, onDescartar, onCopiarEnlace, onExportar, onRenombrar, onQuitar,
}) {
  const [menu, setMenu] = useState(false);
  const [renombrando, setRenombrando] = useState(null);   // id de la vista cuyo nombre se edita
  const [texto, setTexto] = useState('');
  const empezarRenombrar = (v) => { setRenombrando(v.id); setTexto(v.titulo); };
  const terminarRenombrar = () => { const t = texto.trim(); if (renombrando && t) onRenombrar(renombrando, t); setRenombrando(null); };

  const barra = { display: 'flex', alignItems: 'center', gap: 2, padding: '0 14px', minHeight: 38, borderBottom: `1px solid ${C.lightGray}`,
    background: C.blanco, flexShrink: 0, fontFamily: FUENTE };

  if (eligiendo) {
    return (
      <div data-escape-propio style={{ ...barra, gap: 8, flexWrap: 'wrap', padding: '6px 14px' }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>Nueva vista</span>
        <span style={{ fontSize: 13, color: C.gris600 }}>{nElegidas ? `${nElegidas} ${nElegidas === 1 ? 'gráfica elegida' : 'gráficas elegidas'}` : 'Haz clic en las gráficas que quieres mostrar'}</span>
        <input autoFocus value={nombreVista} onChange={e => onNombre(e.target.value)} placeholder="Título de la vista"
          onKeyDown={e => { if (e.key === 'Enter' && nElegidas) onFijar(); if (e.key === 'Escape') onCancelar(); }}
          style={{ flex: '1 1 200px', minWidth: 160, padding: '5px 9px', borderRadius: 6, border: `1px solid ${C.gris300}`, fontFamily: FUENTE, fontSize: 13, outline: 'none' }} />
        <button onClick={onCancelar} style={boton()}>Cancelar</button>
        <button onClick={onFijar} disabled={!nElegidas} style={boton(true, !nElegidas)}>Fijar como vista</button>
      </div>
    );
  }

  return (
    <div data-escape-propio style={barra}>
      <button onClick={() => onIr(null)} style={pestaña(!vistaActiva)}>Lienzo</button>
      {vistas.map(v => (renombrando === v.id ? (
        <input key={v.id} autoFocus value={texto} onChange={e => setTexto(e.target.value)} onBlur={terminarRenombrar}
          onKeyDown={e => { if (e.key === 'Enter') terminarRenombrar(); if (e.key === 'Escape') setRenombrando(null); }}
          style={{ fontSize: 13, fontWeight: 600, fontFamily: FUENTE, border: `1px solid ${C.blue}`, borderRadius: 4, padding: '3px 6px', outline: 'none', width: 220, margin: '0 4px' }} />
      ) : (
        <button key={v.id} onClick={() => onIr(v.id)} onDoubleClick={() => empezarRenombrar(v)}
          title={`${v.titulo} · ${v.cards.length} gráficas · doble clic: cambiar el nombre`} style={pestaña(vistaActiva === v.id)}>{v.titulo}</button>
      )))}
      <button onClick={onNuevaVista} disabled={!puedeNueva} title="Elige en el lienzo las gráficas que quieres mostrar juntas y fíjalas con un nombre"
        style={{ ...pestaña(false), color: puedeNueva ? C.blue30D : C.midGray, cursor: puedeNueva ? 'pointer' : 'default' }}>+ Nueva vista</button>
      <span style={{ flex: 1 }} />
      {aviso && <span style={{ fontSize: 12, color: C.blue30D, marginRight: 8 }}>{aviso}</span>}
      {listo && (
        // El archivo ya está hecho, pero el navegador no lo dejó bajar solo (el clic caducó mientras se
        // creaba): «Guardar» lo baja con un clic nuevo.
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8, fontSize: 12, color: C.gris600 }}>
          {listo.tipo === 'pdf' ? 'PDF listo' : 'Imagen lista'}
          <button onClick={onGuardar} style={{ ...boton(true), padding: '3px 10px', fontSize: 12 }}>Guardar</button>
          <button onClick={onDescartar} aria-label="Descartar" title="Descartar"
            style={{ background: 'none', border: 'none', color: C.gris600, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '0 2px' }}>×</button>
        </span>
      )}
      {vistaVisible && (
        <>
          <span style={{ fontSize: 12, color: C.gris600, marginRight: 6 }}>{ocupado || `${nGraficas} ${nGraficas === 1 ? 'gráfica' : 'gráficas'}`}</span>
          <div style={{ position: 'relative' }}>
            <button onClick={() => setMenu(m => !m)} aria-label="Más acciones de la vista" aria-haspopup="menu" aria-expanded={menu}
              title="Compartir y gestionar la vista"
              style={{ width: 30, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, cursor: 'pointer',
                border: `1px solid ${menu ? C.gris300 : 'transparent'}`, background: menu ? C.light50 : 'transparent', color: C.dark }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
            </button>
            {menu && (
              <Menu onCerrar={() => setMenu(false)} grupos={[
                { titulo: 'Compartir', items: [
                  { texto: 'Copiar enlace', icono: 'enlace', ayuda: 'Para la gente de la obra: abre el visor en esta vista con su usuario', accion: onCopiarEnlace },
                  { texto: 'Descargar imagen (PNG)', icono: 'imagen', accion: () => onExportar('png') },
                  { texto: 'Descargar PDF', icono: 'pdf', ayuda: 'A4 apaisado, con título, obra, frente y fecha', accion: () => onExportar('pdf') },
                ] },
                { titulo: 'Vista', items: [
                  { texto: 'Renombrar', icono: 'renombrar', accion: () => empezarRenombrar(vistaVisible) },
                  { texto: 'Quitar vista', icono: 'quitar', peligro: true, ayuda: 'Las gráficas siguen en el lienzo', accion: onQuitar },
                ] },
              ]} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
