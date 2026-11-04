/**
 * LA LEYENDA DEL PLANO (3-nov-2026, doc 23 §6.4): quién es cada color. Una fila por persona o empresa con nubes
 * asignadas en el plano y cuántas le faltan por entregar. Plegada, solo sus iniciales en su color.
 *
 * Va en el MARCO de la hoja (que no se mueve con ella), el que da el lector por contexto (docs/archivos/25, P6): antes
 * lo buscaba con `document.querySelector` mientras se dibujaba. Lo que cuenta «por entregar» lo dice el servidor
 * (`nube.por_entregar`): la pantalla no decide qué estados se deben.
 */
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { colorDeIndice, iniciales } from '../../../../design/incidencias/reglas.js';
import { useMarcoDelLector } from '../../utils/contextoDelLector';
import { genteDeLasNubes } from '../../utils/leyendaDeNubes';

export default function LeyendaDeNubes({ marcas }) {
  const [abierta, setAbierta] = useState(false);
  const marco = useMarcoDelLector();
  const lista = genteDeLasNubes(marcas);
  if (!lista.length) return null;
  const leyenda = (
    <div className={`leyenda-nubes${abierta ? ' es-abierta' : ''}`} onPointerDown={e => e.stopPropagation()}>
      <button type="button" className="leyenda-nubes__cab" aria-expanded={abierta} onClick={() => setAbierta(v => !v)}
        data-tip={abierta ? 'Plegar' : 'Quién es cada color'}>
        <span>Nubes</span>
        {!abierta && lista.map(g => (
          <i key={`${g.color}|${g.nombre}`} style={{ background: colorDeIndice(g.color) }}>{iniciales(g.nombre)}</i>
        ))}
      </button>
      {abierta && (
        <ul>
          {lista.map(g => (
            <li key={`${g.color}|${g.nombre}`}>
              <i style={{ background: colorDeIndice(g.color) }}>{iniciales(g.nombre)}</i>
              <span className="leyenda-nubes__quien">{g.nombre}{g.empresa ? ' · empresa' : ''}</span>
              <small>{g.deben ? `${g.deben} por entregar` : g.nubes === 1 ? '1 nube' : `${g.nubes} nubes`}</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return marco ? createPortal(leyenda, marco) : leyenda;
}
