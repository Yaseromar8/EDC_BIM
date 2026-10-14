/**
 * FiltrosDeArchivos — «Añadir filtro ▾» y las fichas de los filtros activos (A2, 14-oct-2026).
 *
 * Patrón estándar del sector (Procore, ACC): se elige un campo y un valor, y el
 * filtro queda como una ficha que se quita con ✕. Lo propio de ALEPHIA es de
 * dónde salen los valores: el TIPO y la DISCIPLINA se leen del código ISO 19650
 * del nombre (utils/codigoDelNombre), y la ENTREGA, del plan de entregas
 * (MIDP/TIDP). No hay que haber rellenado ningún campo para poder filtrar.
 *
 * Los valores que se ofrecen son los que hay en la carpeta, con su recuento. El
 * buscador y el desplegable de estado no cambian: estos filtros se suman a ellos.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { piezasDelCodigo } from '../utils/codigoDelNombre';

const ETIQUETA_ENTREGA = {
  entregado: 'Entregado', vinculado: 'Vinculado', vencido: 'Vencido',
  comprometido: 'Comprometido', fuera: 'Fuera del plan',
};
const CAMPOS = [
  ['tipo', 'Tipo'],
  ['disciplina', 'Disciplina'],
  ['entrega', 'Entrega'],
];

function cuenta(files) {
  const c = { tipo: new Map(), disciplina: new Map(), entrega: new Map() };
  for (const f of files) {
    const p = piezasDelCodigo(f.name);
    if (p) {
      c.tipo.set(p.tipo, (c.tipo.get(p.tipo) || 0) + 1);
      c.disciplina.set(p.disciplina, (c.disciplina.get(p.disciplina) || 0) + 1);
    }
    const e = f.entrega?.estado || 'fuera';
    c.entrega.set(e, (c.entrega.get(e) || 0) + 1);
  }
  return c;
}

export default function FiltrosDeArchivos({ files, filtros, setFiltros }) {
  const [abierto, setAbierto] = useState(false);
  const caja = useRef(null);
  const valores = useMemo(() => cuenta(files || []), [files]);

  useEffect(() => {
    if (!abierto) return undefined;
    const fuera = (e) => { if (caja.current && !caja.current.contains(e.target)) setAbierto(false); };
    const esc = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', esc); };
  }, [abierto]);

  const etiquetaDe = (campo, v) => (campo === 'entrega' ? ETIQUETA_ENTREGA[v] || v : v);
  const poner = (campo, valor) => { setFiltros(f => ({ ...f, [campo]: valor })); setAbierto(false); };

  return (
    <>
      <div className="filtros-meta" ref={caja}>
        <button type="button" className="barra-campo filtros-meta__boton" aria-haspopup="true"
                aria-expanded={abierto} onClick={() => setAbierto(a => !a)}>
          Añadir filtro <span aria-hidden="true">▾</span>
        </button>
        {abierto && (
          <div className="filtros-meta__menu" role="menu">
            {CAMPOS.map(([k, nombre]) => {
              const lista = [...valores[k].entries()].sort((a, b) => b[1] - a[1]);
              return (
                <div key={k} className="filtros-meta__grupo">
                  <h6>{nombre}{k !== 'entrega' && <small> · del código</small>}</h6>
                  {lista.length === 0 && <p className="filtros-meta__vacio">Ningún documento de esta carpeta lo trae en el nombre.</p>}
                  {lista.map(([v, n]) => (
                    <button key={v} type="button" role="menuitem"
                            className={`filtros-meta__op ${filtros[k] === v ? 'es-activo' : ''}`}
                            onClick={() => poner(k, v)}>
                      <span className={k === 'entrega' ? '' : 'codigo-leido-celda'}>{etiquetaDe(k, v)}</span>
                      <b>{n}</b>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/** Las fichas de los filtros activos, en su propia línea bajo la barra. */
export function FichasDeFiltros({ filtros, setFiltros }) {
  const quitar = (campo) => setFiltros(f => ({ ...f, [campo]: null }));
  const activos = CAMPOS.filter(([k]) => filtros[k]);
  const etiquetaDe = (campo, v) => (campo === 'entrega' ? ETIQUETA_ENTREGA[v] || v : v);
  if (!activos.length) return null;
  return (
        <div className="filtros-meta__fichas" aria-label="Filtros activos">
          {activos.map(([k, nombre]) => (
            <span key={k} className="filtros-meta__ficha">
              {nombre}: <b>{etiquetaDe(k, filtros[k])}</b>
              <button type="button" onClick={() => quitar(k)} aria-label={`Quitar el filtro ${nombre}`}>✕</button>
            </span>
          ))}
          {activos.length > 1 && (
            <button type="button" className="filtros-meta__limpiar"
                    onClick={() => setFiltros({ tipo: null, disciplina: null, entrega: null })}>
              Quitar todos
            </button>
          )}
        </div>
  );
}
