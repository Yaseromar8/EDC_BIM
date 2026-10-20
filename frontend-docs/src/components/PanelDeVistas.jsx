/**
 * PanelDeVistas — el bloque «Vistas» encima del árbol de Archivos (A2-2, 14-oct-2026).
 *
 * Patrón estándar del sector (Procore, ACC): las vistas a la izquierda de la
 * lista, por niveles. Lo nuestro son las de serie, que entienden ISO 19650 y el
 * plan de entregas. Ver utils/vistasDeArchivos.js y
 * docs/ux/A2-2_VISTAS_GUARDADAS_PROPUESTA.md.
 *
 * Sobrio a propósito (D-24): texto y una cifra, la raya de lo activo, nada más.
 */
import React, { useState } from 'react';
import { COLECCIONES, VISTAS_DE_SERIE, describirFiltros } from '../utils/vistasDeArchivos';

export default function PanelDeVistas({ recuentos, hayPlan, activa, propias, onElegir, onBorrar }) {
  // SIEMPRE EMPIEZA CONTRAÍDO (20-oct-2026, el propietario): el árbol de carpetas es lo primero. Ya no se
  // recuerda abierto de una visita a otra; se abre y se cierra dentro de la visita.
  const [plegado, setPlegado] = useState(true);
  const plegar = () => setPlegado(p => !p);
  const deSerie = VISTAS_DE_SERIE.filter(v => !v.soloConPlan || hayPlan);
  const esActiva = (tipo, id) => activa && activa.tipo === tipo && activa.id === id;
  const nombreDeLaActiva = !activa ? '' : (activa.nombre || (activa.tipo === 'serie'
    ? VISTAS_DE_SERIE.find(v => v.clave === activa.id)?.etiqueta
    : (propias || []).find(v => v.id === activa.id)?.nombre) || '');

  return (
    <nav className="vistas" aria-label="Vistas">
      <button type="button" className="vistas__titulo" onClick={plegar} aria-expanded={!plegado}>
        <span>Vistas</span>
        {/* Contraído con una vista aplicada: su nombre, para que no se pierda qué está filtrando la tabla. */}
        {plegado && activa && <small className="vistas__activa">{nombreDeLaActiva}</small>}
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
          style={{ rotate: plegado ? '-90deg' : '0deg' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {!plegado && (
        <>
          {/* COLECCIONES (como en Procore): cada vista de serie vive en la suya. */}
          {COLECCIONES.map(col => {
            const vistas = deSerie.filter(v => v.coleccion === col.clave);
            if (!vistas.length) return null;
            return (
              <React.Fragment key={col.clave}>
                <h6 className="vistas__nivel">{col.etiqueta}</h6>
                <ul>
                  {vistas.map(v => {
                    const n = recuentos ? recuentos[v.clave] : null;
                    return (
                      <li key={v.clave}>
                        <button type="button" title={v.ayuda}
                          className={`vistas__op${esActiva('serie', v.clave) ? ' es-activa' : ''}`}
                          aria-current={esActiva('serie', v.clave) ? 'true' : undefined}
                          onClick={() => onElegir({ tipo: 'serie', id: v.clave, nombre: v.etiqueta, ayuda: v.ayuda,
                                                    coleccion: col.etiqueta, criterios: v.criterios })}>
                          <span>{v.etiqueta}</span>
                          <b>{n == null ? '' : n}</b>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </React.Fragment>
            );
          })}
          <h6 className="vistas__nivel">Mías</h6>
          {propias.length === 0 ? (
            <p className="vistas__vacio">Pon filtros en Archivos y pulsa «Guardar como vista».</p>
          ) : (
            <ul>
              {propias.map(v => (
                <li key={v.id} className="vistas__propia">
                  <button type="button"
                    className={`vistas__op${esActiva('propia', v.id) ? ' es-activa' : ''}`}
                    aria-current={esActiva('propia', v.id) ? 'true' : undefined}
                    title={`${describirFiltros(v.filtros)} · ${v.alcance === 'carpeta' ? `solo en ${v.carpeta?.nombre || 'su carpeta'}` : 'toda la obra'}`}
                    onClick={() => onElegir({ tipo: 'propia', id: v.id, nombre: v.nombre, vista: v })}>
                    <span>{v.nombre}</span>
                  </button>
                  <button type="button" className="vistas__borrar" aria-label={`Borrar la vista ${v.nombre}`}
                    title="Borrar esta vista" onClick={() => onBorrar(v)}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </nav>
  );
}

/**
 * «Guardar como vista…»: los filtros que hay puestos, con un nombre. Se ofrece
 * guardarlos para toda la obra o solo para la carpeta abierta (si hay una).
 */
export function GuardarComoVista({ descripcion, carpeta, onGuardar }) {
  const [abierto, setAbierto] = useState(false);
  const [nombre, setNombre] = useState('');
  const [alcance, setAlcance] = useState('obra');
  const guardar = (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    if (onGuardar({ nombre: nombre.trim(), alcance: carpeta ? alcance : 'obra' })) {
      setAbierto(false);
      setNombre('');
      setAlcance('obra');
    }
  };
  return (
    <div className="guardar-vista">
      <button type="button" className="filtros-meta__limpiar" onClick={() => setAbierto(a => !a)}
        aria-expanded={abierto}>
        Guardar como vista…
      </button>
      {abierto && (
        <form className="guardar-vista__caja" onSubmit={guardar}
          onKeyDown={(e) => { if (e.key === 'Escape') setAbierto(false); }}>
          <label>
            Nombre
            <input autoFocus value={nombre} maxLength={60} onChange={e => setNombre(e.target.value)}
              placeholder="p. ej. Estructuras publicadas" />
          </label>
          <p className="guardar-vista__filtros">{descripcion}</p>
          {carpeta && (
            <fieldset>
              <label><input type="radio" name="alcance" checked={alcance === 'obra'}
                onChange={() => setAlcance('obra')} /> En toda la obra</label>
              <label><input type="radio" name="alcance" checked={alcance === 'carpeta'}
                onChange={() => setAlcance('carpeta')} /> Solo en «{carpeta.nombre}»</label>
            </fieldset>
          )}
          <p className="guardar-vista__nota">Se guarda en este navegador.</p>
          <div className="guardar-vista__botones">
            <button type="button" className="barra-btn barra-btn--contorno" onClick={() => setAbierto(false)}>Cancelar</button>
            <button type="submit" className="barra-btn barra-btn--primario" disabled={!nombre.trim()}>Guardar</button>
          </div>
        </form>
      )}
    </div>
  );
}
