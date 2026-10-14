// STATUS CHIP — un estado, con nombre y no con color.
//
// `tono` dice QUÉ es (éxito, peligro, aviso, info, neutro); el color lo pone
// el canon, en los dos temas. Quien lo usa no elige hex: así un «Rechazada»
// se ve igual en Revisiones, en Mi Trabajo y en lo que venga.
import React from 'react';
import './StatusChip.css';

const TONOS = new Set(['exito', 'peligro', 'aviso', 'info', 'neutro']);

export default function StatusChip({ tono = 'neutro', className = '', children, ...resto }) {
  const t = TONOS.has(tono) ? tono : 'neutro';
  return (
    <span {...resto} className={`a-chip a-chip--${t} ${className}`.trim()}>
      {children}
    </span>
  );
}
