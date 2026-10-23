import React, { useEffect, useMemo, useRef, useState } from 'react';
import { buscarCampos, seccionesDeCampos, notaDeCampo } from '../lib/inventoryCatalogo';

/**
 * Elegir un campo de la Planilla: buscador, nombre limpio, grupo y cuánto dato
 * tiene. Sustituye a la lista nativa del navegador (oscura, con la clave
 * interna «Construcción::Partición» y sin orden). Ver lib/inventoryCatalogo.
 *
 *   enLinea   la lista va dentro del contenedor (menú Agrupar); si no, es un
 *             botón que la abre en un desplegable (filtro, «Añadir nivel»).
 */
const SIN_EXCLUIR = [];
const fila = { display: 'block', width: '100%', textAlign: 'left', padding: '5px 10px', lineHeight: 1.25, height: 'auto', whiteSpace: 'normal' };

function Ficha({ f, activa, elegida, onElegir, onEncima }) {
    const tenue = f.clase === 'raro' || f.clase === 'constante';
    return (
        <button type="button" role="option" aria-selected={elegida} className="v-menu__item"
            onMouseDown={e => e.preventDefault()} onClick={() => onElegir(f.clave)} onMouseEnter={onEncima}
            style={{ ...fila, opacity: tenue ? 0.6 : 1, ...(activa ? { background: 'var(--v-superficie-2)' } : {}), ...(elegida ? { color: 'var(--v-accion)' } : {}) }}>
            <span style={{ display: 'block', fontSize: '12.5px', color: elegida ? 'var(--v-accion)' : 'var(--v-texto)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.nombre}{f.unidad ? <span style={{ color: 'var(--v-texto-3)' }}> ({f.unidad})</span> : null}
            </span>
            <span style={{ display: 'block', fontSize: '11px', color: 'var(--v-texto-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.grupo} · {notaDeCampo(f)}
            </span>
        </button>
    );
}

export function ListaDeCampos({ catalogo, valor, onElegir, excluir = SIN_EXCLUIR, alto = 320, autoFocus = true, onEscape }) {
    const [texto, setTexto] = useState('');
    const [activa, setActiva] = useState(0);
    const caja = useRef(null);
    const lista = useRef(null);
    const fichas = useMemo(() => [...catalogo.values()].filter(f => !excluir.includes(f.clave)), [catalogo, excluir]);
    const secciones = useMemo(() => texto.trim()
        ? [{ titulo: null, fichas: buscarCampos(fichas, texto) }]
        : seccionesDeCampos(fichas), [fichas, texto]);
    const planas = useMemo(() => secciones.flatMap(s => s.fichas), [secciones]);
    useEffect(() => { setActiva(0); }, [texto]);
    useEffect(() => { if (autoFocus) caja.current?.focus(); }, [autoFocus]);
    useEffect(() => {
        lista.current?.querySelector(`[data-indice="${activa}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [activa]);

    const alPulsar = e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); setActiva(i => Math.min(planas.length - 1, i + 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActiva(i => Math.max(0, i - 1)); }
        else if (e.key === 'Enter') { e.preventDefault(); if (planas[activa]) onElegir(planas[activa].clave); }
        else if (e.key === 'Escape' && onEscape) { e.stopPropagation(); onEscape(); }
    };

    let indice = -1;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <input ref={caja} className="v-campo" placeholder={`Buscar entre ${fichas.length} campos…`} aria-label="Buscar campo"
                value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={alPulsar}
                role="combobox" aria-expanded="true" aria-controls="lista-de-campos"
                style={{ height: '30px', fontSize: '12.5px', margin: '0 0 6px' }} />
            <div ref={lista} id="lista-de-campos" role="listbox" style={{ maxHeight: `${alto}px`, overflowY: 'auto' }}>
                {planas.length === 0 && <div className="v-menu__nota" style={{ padding: '8px 10px' }}>Ningún campo coincide.</div>}
                {secciones.map((s, si) => (
                    <div key={s.titulo ?? si} role="group" aria-label={s.titulo || 'Resultados'}>
                        {s.titulo && (
                            <div className="v-menu__nota" style={{ textTransform: 'uppercase', letterSpacing: '.5px', padding: '8px 10px 2px', fontSize: '10.5px' }}>
                                {s.titulo} <span style={{ textTransform: 'none', letterSpacing: 0 }}>· {s.fichas.length}</span>
                            </div>
                        )}
                        {s.fichas.map(f => {
                            indice++;
                            const i = indice;
                            return (
                                <div key={f.clave} data-indice={i}>
                                    <Ficha f={f} activa={i === activa} elegida={f.clave === valor} onElegir={onElegir} onEncima={() => setActiva(i)} />
                                </div>
                            );
                        })}
                    </div>
                ))}
            </div>
        </div>
    );
}

/** Botón con el campo elegido; al pulsarlo, la lista en un desplegable. */
export default function SelectorDeCampo({ catalogo, valor, onElegir, excluir, placeholder = 'Campo', etiqueta = 'Campo', ancho = 360, disabled = false }) {
    const [abierto, setAbierto] = useState(false);
    const [arriba, setArriba] = useState(false);
    const boton = useRef(null);
    const f = valor ? catalogo.get(valor) : null;
    const abrir = () => {
        if (disabled) return;
        const r = boton.current.getBoundingClientRect();
        setArriba(window.innerHeight - r.bottom < 380 && r.top > window.innerHeight - r.bottom);
        setAbierto(true);
    };
    return (
        <div style={{ position: 'relative', minWidth: 0 }}>
            <button ref={boton} type="button" className="v-campo" aria-label={etiqueta} aria-haspopup="listbox" aria-expanded={abierto} disabled={disabled}
                onClick={() => (abierto ? setAbierto(false) : abrir())}
                style={{ width: '100%', height: '28px', fontSize: '12px', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', cursor: disabled ? 'default' : 'pointer' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: f || valor ? 'var(--v-texto)' : 'var(--v-texto-3)' }}>
                    {f ? <>{f.nombre} <span style={{ color: 'var(--v-texto-3)' }}>· {f.grupo}</span></> : (valor || placeholder)}
                </span>
                <span aria-hidden="true" style={{ color: 'var(--v-texto-3)', fontSize: '10px' }}>▾</span>
            </button>
            {abierto && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 70 }} onClick={() => setAbierto(false)} />
                    <div className="v-menu" data-desplegable-de-campo style={{ position: 'absolute', left: 0, zIndex: 71, width: `${ancho}px`, maxWidth: '80vw', padding: '8px', ...(arriba ? { bottom: '32px' } : { top: '32px' }) }}>
                        <ListaDeCampos catalogo={catalogo} valor={valor} excluir={excluir}
                            onElegir={c => { onElegir(c); setAbierto(false); boton.current?.focus(); }}
                            onEscape={() => { setAbierto(false); boton.current?.focus(); }} />
                    </div>
                </>
            )}
        </div>
    );
}
