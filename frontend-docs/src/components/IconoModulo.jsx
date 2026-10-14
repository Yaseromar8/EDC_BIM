/**
 * IconoModulo — los iconos de las herramientas de ALEPHIA Docs.
 *
 * Desde el 14-oct-2026 son los ICONOS DE OBRA aprobados por el propietario
 * («sí, queda así por ahora»; D-24 en docs/AI_DECISIONS.md): línea de 1,5 sobre
 * retícula 24, puntas redondas, sin relleno y un solo color (el del texto), en
 * el estilo de los iconos de Claude. La fuente única es
 * design/iconos/iconos-obra.json, la misma que usará View; lámina en
 * docs/ux/maquetas/iconos_obra_v1.html.
 *
 * Sustituyen a los sólidos «estilo B» del 13-oct-2026. Los nombres son los
 * mismos, así que ningún uso cambia. Los SVG del JSON son nuestros y fijos (no
 * vienen del usuario), por eso se insertan tal cual.
 */
import React from 'react';
import JUEGO from '../../../design/iconos/iconos-obra.json';

const ICONOS = JUEGO.iconos;

export default function IconoModulo({ nombre, tamano = 20, style, className }) {
  const icono = ICONOS[nombre];
  if (!icono) return null;
  return (
    <svg width={tamano} height={tamano} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ flexShrink: 0, ...style }} className={className}
      dangerouslySetInnerHTML={{ __html: icono.svg }} />
  );
}
