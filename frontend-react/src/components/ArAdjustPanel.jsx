// ArAdjustPanel — la herramienta "Ajustar" del AR: mover, elevar y girar.
//
// Está copiada en intención de Revizto AR, que la ofrece en DOS de sus tres
// modos de calibración y la usa además para corregir la deriva sin recalibrar
// entero. Sin ella, el modo "sin calibración" no sirve para nada — y ese modo
// es el único que funciona en un canal a cielo abierto, donde no hay rincones
// que escanear.
//
// Decisiones de campo:
//   · Se mueve RESPECTO A LO QUE MIRAS, no en ejes del modelo. El operario
//     piensa "medio metro a mi derecha".
//   · Paso elegible (1 cm · 10 cm · 1 m): la primera colocación es a metros,
//     el afinado a centímetros. Con un solo paso, o desesperas o no acabas.
//   · Botones grandes: esto se usa de pie, con guantes y a pleno sol.
//   · Se muestra cuánto llevas movido. Un ajuste de 3 m no es afinar: es que
//     la calibración estaba mal y conviene repetirla.
import React, { useState } from 'react';

const PASOS = [
  { etiqueta: '1 cm', metros: 0.01, giro: 0.5 },
  { etiqueta: '10 cm', metros: 0.10, giro: 2 },
  { etiqueta: '1 m', metros: 1.00, giro: 10 },
];

const btn = {
  minWidth: 52, minHeight: 48, border: '1px solid rgba(255,255,255,0.22)',
  borderRadius: 10, background: 'rgba(20,22,26,0.82)', color: '#fff',
  fontSize: 17, fontWeight: 700, cursor: 'pointer',
};

export default function ArAdjustPanel({ bridge, onClose }) {
  const [paso, setPaso] = useState(1);
  const [, forzar] = useState(0);
  const p = PASOS[paso];

  const mover = (dDerecha, dAdelante, dArriba) => {
    bridge?.nudgeMeters?.(dDerecha * p.metros, dAdelante * p.metros, dArriba * p.metros);
    forzar((n) => n + 1);
  };
  const girar = (signo) => {
    const actual = bridge?.getYawDegrees?.() ?? 0;
    bridge?.setYawDegrees?.(actual + signo * p.giro);
    forzar((n) => n + 1);
  };

  const d = bridge?.getAdjustMeters?.() || { x: 0, y: 0, z: 0, giro: 0 };
  const desplazado = Math.hypot(d.x, d.y);

  return (
    <div style={{
      position: 'absolute', left: 12, right: 12, bottom: 96, zIndex: 20,
      display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center',
      pointerEvents: 'auto',
    }}>
      {/* Cuánto llevas movido: si es mucho, el problema no es el afinado. */}
      <div style={{
        background: 'rgba(13,17,23,0.86)', color: '#e6edf5', borderRadius: 12,
        padding: '6px 14px', fontSize: 12.5, display: 'flex', gap: 14,
      }}>
        <span>movido {desplazado.toFixed(2)} m</span>
        <span>alto {d.z >= 0 ? '+' : ''}{d.z.toFixed(2)} m</span>
        <span>giro {d.giro >= 0 ? '+' : ''}{Math.round(d.giro)}°</span>
        {desplazado > 3 && <span style={{ color: '#f0b429' }}>· conviene recalibrar</span>}
      </div>

      <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        {/* Mover en el plano, relativo a tu vista */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: 6 }}>
          <span />
          <button style={btn} onClick={() => mover(0, 1, 0)} aria-label="alejar">▲</button>
          <span />
          <button style={btn} onClick={() => mover(-1, 0, 0)} aria-label="izquierda">◀</button>
          <button style={{ ...btn, fontSize: 11, fontWeight: 600 }}
                  onClick={() => { bridge?.resetAdjust?.(); forzar((n) => n + 1); }}>
            deshacer
          </button>
          <button style={btn} onClick={() => mover(1, 0, 0)} aria-label="derecha">▶</button>
          <span />
          <button style={btn} onClick={() => mover(0, -1, 0)} aria-label="acercar">▼</button>
          <span />
        </div>

        {/* Elevación y giro */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, auto)', gap: 6 }}>
          <button style={btn} onClick={() => mover(0, 0, 1)} aria-label="subir">⤒</button>
          <button style={btn} onClick={() => girar(-1)} aria-label="girar a la izquierda">↺</button>
          <button style={btn} onClick={() => mover(0, 0, -1)} aria-label="bajar">⤓</button>
          <button style={btn} onClick={() => girar(1)} aria-label="girar a la derecha">↻</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {PASOS.map((x, i) => (
          <button
            key={x.etiqueta}
            onClick={() => setPaso(i)}
            style={{
              minHeight: 36, padding: '0 16px', borderRadius: 18, cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.22)', fontSize: 13, fontWeight: 700,
              background: i === paso ? '#6287b4' : 'rgba(20,22,26,0.82)', color: '#fff',
            }}
          >
            {x.etiqueta}
          </button>
        ))}
        <button
          onClick={onClose}
          style={{
            minHeight: 36, padding: '0 18px', borderRadius: 18, cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.35)', fontSize: 13, fontWeight: 700,
            background: 'rgba(20,22,26,0.82)', color: '#fff', marginLeft: 6,
          }}
        >
          Listo
        </button>
      </div>
    </div>
  );
}
