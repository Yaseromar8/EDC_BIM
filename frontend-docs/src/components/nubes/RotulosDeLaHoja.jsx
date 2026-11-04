/**
 * LOS RÓTULOS DE LA HOJA (docs/archivos/25, P7 y B1): el de una NUBE de una incidencia (su número y, asignada, las
 * iniciales de quien aporta en su color) y el de una marca que no es nube (el código de su incidencia y su estado).
 *
 * Se dibujan en la capa SVG de la hoja, a escala `esc` (encogen al alejar), y su caja se ajusta al texto MEDIDO con su
 * fuente (design/ui/medirTexto.js), no a «letras × 7». Lo que dicen sale del servidor: el número es el de la nube (47),
 * el color el de su persona en el plano. Al pasar el ratón, el sistema común de tooltips (`data-tip`).
 */
import React from 'react';
import { anchoDeTexto } from '../../../../design/ui/medirTexto.js';
import { colorDeIndice, iniciales } from '../../../../design/incidencias/reglas.js';
import { estadoDeObservacion } from '../../utils/marcasConEnlace';

const FUENTE_NUBE = "600 9.5px 'IBM Plex Mono', monospace";
const FUENTE_CODIGO = "500 10.5px 'IBM Plex Sans', sans-serif";
const FUENTE_QUIEN = "600 9px 'IBM Plex Mono', monospace";
const ALTO_NUBE = 16;
const ALTO_CODIGO = 18;
const MARGEN = 2;                 // px del borde de la hoja

const anchoDe = (texto, fuente, relleno) => Math.ceil(anchoDeTexto(texto, fuente)) + relleno;

/** El rótulo de una NUBE de una incidencia: encima de ella o, si no cabe (borde de la hoja), dentro de su esquina. */
export function RotuloDeNube({ caja, esc, ancho, alto, numero, nube, tocable, cursor, onTocar }) {
  const asignada = !!nube?.destino_nombre;
  if (numero == null && !asignada) return null;
  const texto = [numero, asignada ? iniciales(nube.destino_nombre) : null].filter(x => x != null && x !== '').join(' ');
  const w = anchoDe(texto, FUENTE_NUBE, 8);
  const fueraArriba = caja.y - ALTO_NUBE * esc - MARGEN;
  const y = fueraArriba >= MARGEN ? fueraArriba : Math.min(caja.y + MARGEN, alto - ALTO_NUBE * esc - MARGEN);
  const x = Math.max(MARGEN, Math.min(caja.x, ancho - w * esc - MARGEN));
  const encargo = nube?.clase === 'encargo';
  return (
    <g transform={`translate(${x} ${y}) scale(${esc})`} style={{ pointerEvents: tocable ? 'all' : 'none', cursor }}
      onClick={tocable ? onTocar : undefined}
      data-tip={asignada ? `${nube.destino_nombre} · ${nube.estado_etiqueta}` : 'Sin asignar'}>
      <rect width={w} height={ALTO_NUBE} rx="2" fill={colorDeIndice(asignada ? nube.color : null)}
        strokeDasharray={encargo ? '3 2' : undefined} stroke={encargo ? '#fff' : 'none'} />
      <text x={w / 2} y="11.6" fontSize="9.5" fontWeight="600" fill="#fff" textAnchor="middle"
        fontFamily="'IBM Plex Mono', monospace" style={{ pointerEvents: 'none' }}>{texto}</text>
    </g>
  );
}

/** El rótulo de una marca que NO es nube pero es de una incidencia: «ISS-012 · Abierta», bajo la marca. */
export function RotuloDeIncidencia({ caja, esc, ancho, alto, obs, nube, tocable, cursor, onTocar }) {
  const est = estadoDeObservacion(obs.estado);
  const texto = `${obs.codigo} · ${obs.vencida ? 'Vencida' : est.etiqueta}`;
  const quien = nube?.destino_nombre ? iniciales(nube.destino_nombre) : null;
  const anchoQ = quien ? anchoDe(quien, FUENTE_QUIEN, 10) : 0;
  const anchoT = anchoDe(texto, FUENTE_CODIGO, 16);
  const w = anchoT + anchoQ;
  const x = Math.max(4, Math.min(caja.x, ancho - w * esc - 4));
  const y = caja.y2 + (ALTO_CODIGO + 4) * esc > alto ? Math.max(4, caja.y - (ALTO_CODIGO + 4) * esc) : caja.y2 + 4 * esc;
  const encargo = nube?.clase === 'encargo' || obs.encargo;
  return (
    <g transform={`translate(${x} ${y}) scale(${esc})`} style={{ pointerEvents: tocable ? 'all' : 'none', cursor }}
      onClick={tocable ? onTocar : undefined}
      data-tip={[obs.titulo, obs.responsable].filter(Boolean).join(' · ') || obs.codigo}>
      <rect width={w} height={ALTO_CODIGO} rx="3" fill="#fff" stroke={obs.vencida ? '#b93535' : encargo ? '#8a877f' : '#cccac0'}
        strokeWidth="1" strokeDasharray={encargo ? '3 2' : undefined} />
      <rect x="0.5" y="0.5" width="4" height={ALTO_CODIGO - 1} rx="2" fill={est.color} />
      <text x="10" y="12.6" fontSize="10.5" fontWeight="500" fill={obs.vencida ? '#b93535' : '#141413'}
        fontFamily="'IBM Plex Sans', sans-serif" style={{ pointerEvents: 'none' }}>{texto}</text>
      {quien && <>
        <rect x={anchoT - 2} y="3" width={anchoQ - 2} height="12" rx="2" fill={colorDeIndice(nube.color)} />
        <text x={anchoT + 3} y="12.2" fontSize="9" fontWeight="600" fill="#fff"
          fontFamily="'IBM Plex Mono', monospace" style={{ pointerEvents: 'none' }}>{quien}</text>
      </>}
    </g>
  );
}
