/**
 * IlustracionesPlanas — los dibujos de los ESTADOS VACÍOS, en el registro que el
 * propietario capturó de ACC (16-oct-2026): UN objeto sencillo (documento,
 * carpeta, plano, portapapeles…), relleno plano muy claro, contorno fino y un
 * círculo de acento con el gesto que toca (visto, más, enviar, reloj).
 *
 * Paleta D-24, sin derivados nuevos: papel Blanco, rellenos Light 50 y Light Gray,
 * contorno Mid Gray, y el acento en Blue tinte con el glifo en Blue (icono
 * informativo, nunca texto). Sin sombras, degradados, brillos ni caras.
 *
 * Decorativas: `aria-hidden`, sin eventos. Todas en una caja de 160 × 120.
 */
import React from 'react';

const C = {
  papel: '#ffffff',
  claro: '#f1f0e8',     // Light 50
  medio: '#e8e6dc',     // Light Gray
  trazo: '#b0aea5',     // Mid Gray
  tinte: '#ecf0f1',     // Blue tinte
  acento: '#6a9bcc',    // Blue
};

const TRAZO = { stroke: C.trazo, strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' };

/** Renglones de texto: barras llenas, sin contorno. */
function Renglones({ x, y, anchos, paso = 9 }) {
  return anchos.map((w, i) => (
    <rect key={i} x={x} y={y + i * paso} width={w} height={3} rx={1.5} fill={C.medio} stroke="none" />
  ));
}

/** El círculo de acento, abajo a la derecha del objeto, con su glifo. */
function Acento({ cx, cy, glifo }) {
  const g = { stroke: C.acento, strokeWidth: 2, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' };
  return (
    <g>
      <circle cx={cx} cy={cy} r={15} fill={C.tinte} />
      {glifo === 'visto' && <path d={`M${cx - 6} ${cy} l4 4 l8 -8`} {...g} />}
      {glifo === 'mas' && <path d={`M${cx} ${cy - 6} v12 M${cx - 6} ${cy} h12`} {...g} />}
      {glifo === 'enviar' && <path d={`M${cx - 6} ${cy} h11 M${cx + 1} ${cy - 5} l5 5 l-5 5`} {...g} />}
      {glifo === 'reloj' && (
        <>
          <circle cx={cx} cy={cy} r={7} {...g} strokeWidth={1.6} />
          <path d={`M${cx} ${cy - 4} v4 l3 2`} {...g} strokeWidth={1.6} />
        </>
      )}
      {glifo === 'lapiz' && <path d={`M${cx - 6} ${cy + 6} l2 -6 l8 -8 l4 4 l-8 8 z`} {...g} strokeWidth={1.6} />}
    </g>
  );
}

const OBJETOS = {
  /** Revisiones: un documento con su hoja detrás y el visto bueno. */
  revision: (
    <>
      <rect x={58} y={18} width={58} height={76} rx={4} fill={C.claro} />
      <path d="M46 12 h40 l14 14 v64 a4 4 0 0 1 -4 4 h-50 a4 4 0 0 1 -4 -4 v-74 a4 4 0 0 1 4 -4 z" fill={C.papel} />
      <path d="M86 12 v10 a4 4 0 0 0 4 4 h10" fill={C.claro} />
      <Renglones x={52} y={36} anchos={[30, 38, 34, 38, 22]} />
      <Acento cx={102} cy={88} glifo="visto" />
    </>
  ),
  /** Carpeta vacía: la carpeta con una hoja asomando y el «añadir». */
  carpeta: (
    <>
      <path d="M30 30 a4 4 0 0 1 4 -4 h26 l8 8 h56 a4 4 0 0 1 4 4 v52 a4 4 0 0 1 -4 4 h-90 a4 4 0 0 1 -4 -4 z" fill={C.medio} />
      <rect x={44} y={26} width={58} height={40} rx={3} fill={C.papel} />
      <Renglones x={51} y={34} anchos={[26, 40]} />
      <path d="M30 48 a4 4 0 0 1 4 -4 h90 a4 4 0 0 1 4 4 v42 a4 4 0 0 1 -4 4 h-90 a4 4 0 0 1 -4 -4 z" fill={C.claro} />
      <Acento cx={118} cy={90} glifo="mas" />
    </>
  ),
  /** Planos: una lámina apaisada con la sección de un canal y su cajetín. */
  plano: (
    <>
      <rect x={24} y={20} width={104} height={72} rx={3} fill={C.papel} />
      <rect x={30} y={26} width={92} height={60} rx={1} fill="none" strokeWidth={1} />
      <path d="M38 48 h12 l10 20 h28 l10 -20 h12" fill="none" />
      <path d="M60 68 h28" fill="none" strokeDasharray="2 3" />
      <path d="M50 48 v-8 M98 48 v-8 M50 42 h48" fill="none" strokeWidth={1} />
      <rect x={92} y={72} width={30} height={14} fill={C.claro} strokeWidth={1} />
      <rect x={96} y={76} width={16} height={2.5} rx={1.25} fill={C.medio} stroke="none" />
      <rect x={96} y={80.5} width={22} height={2.5} rx={1.25} fill={C.medio} stroke="none" />
      <Acento cx={122} cy={92} glifo="mas" />
    </>
  ),
  /** Sin resultados: un documento y la lupa encima. */
  busqueda: (
    <>
      <path d="M40 16 h38 l14 14 v56 a4 4 0 0 1 -4 4 h-48 a4 4 0 0 1 -4 -4 v-66 a4 4 0 0 1 4 -4 z" fill={C.papel} />
      <path d="M78 16 v10 a4 4 0 0 0 4 4 h10" fill={C.claro} />
      <Renglones x={46} y={40} anchos={[30, 36, 24]} />
      <path d="M109 93 l14 14" strokeWidth={5} stroke={C.trazo} />
      <circle cx={96} cy={80} r={18} fill={C.tinte} />
      <circle cx={96} cy={80} r={18} fill="none" stroke={C.acento} strokeWidth={2} />
      <path d="M87 74 a11 11 0 0 1 9 -5" fill="none" stroke={C.acento} strokeWidth={1.6} />
    </>
  ),
  /** Cuaderno de obra: el cuaderno con su espiral, renglones y la anotación. */
  cuaderno: (
    <>
      <rect x={42} y={18} width={66} height={80} rx={4} fill={C.claro} />
      <rect x={50} y={18} width={58} height={80} rx={3} fill={C.papel} />
      {[30, 44, 58, 72, 86].map(y => (
        <path key={y} d={`M38 ${y} h14`} fill="none" strokeWidth={2.2} />
      ))}
      <Renglones x={58} y={32} anchos={[40, 34, 40, 28, 36, 20]} />
      <Acento cx={106} cy={92} glifo="lapiz" />
    </>
  ),
  /** Protocolos: el portapapeles con su lista de verificación. */
  protocolo: (
    <>
      <rect x={42} y={16} width={68} height={84} rx={5} fill={C.medio} />
      <rect x={49} y={24} width={54} height={70} rx={2} fill={C.papel} />
      <rect x={63} y={11} width={26} height={11} rx={3} fill={C.claro} />
      {[34, 48, 62].map((y, i) => (
        <g key={y}>
          <rect x={55} y={y} width={8} height={8} rx={1.5} fill={i === 0 ? C.tinte : C.papel} strokeWidth={1.2} />
          {i === 0 && <path d={`M57 ${y + 4} l2 2 l3.5 -3.5`} fill="none" stroke={C.acento} strokeWidth={1.4} />}
          <rect x={67} y={y + 2.5} width={i === 1 ? 22 : 30} height={3} rx={1.5} fill={C.medio} stroke="none" />
        </g>
      ))}
      <Acento cx={104} cy={92} glifo="visto" />
    </>
  ),
  /** Transmittals: el sobre con el documento dentro y el «enviar». */
  envio: (
    <>
      <rect x={54} y={14} width={50} height={52} rx={3} fill={C.papel} />
      <Renglones x={61} y={23} anchos={[30, 36, 24]} />
      <path d="M34 46 l44 26 l44 -26 v42 a4 4 0 0 1 -4 4 h-80 a4 4 0 0 1 -4 -4 z" fill={C.claro} />
      <path d="M34 88 l32 -24 M122 88 l-32 -24" fill="none" strokeWidth={1.2} />
      <Acento cx={118} cy={90} glifo="enviar" />
    </>
  ),
  /** Plan de entrega: el calendario con un día marcado y el reloj de los plazos. */
  cronograma: (
    <>
      <rect x={34} y={20} width={84} height={72} rx={4} fill={C.papel} />
      <path d="M34 24 a4 4 0 0 1 4 -4 h76 a4 4 0 0 1 4 4 v12 h-84 z" fill={C.medio} />
      <path d="M52 14 v12 M100 14 v12" fill="none" strokeWidth={2.2} />
      {[0, 1, 2].map(f => [0, 1, 2, 3, 4].map(c => (
        <rect key={`${f}${c}`} x={42 + c * 14.5} y={44 + f * 14} width={9} height={8} rx={1.5}
          fill={f === 1 && c === 2 ? C.tinte : C.claro}
          stroke={f === 1 && c === 2 ? C.acento : 'none'} strokeWidth={1.2} />
      )))}
      <Acento cx={114} cy={88} glifo="reloj" />
    </>
  ),
};

/** Una ilustración plana por nombre: revision, carpeta, plano, busqueda, cuaderno, protocolo, envio, cronograma. */
export function IlustracionPlana({ nombre, tamano = 120 }) {
  return (
    <svg viewBox="0 0 160 120" width={Math.round(tamano * 4 / 3)} height={tamano}
      aria-hidden="true" focusable="false" style={{ display: 'block', margin: '0 auto', overflow: 'visible' }}>
      <g {...TRAZO}>{OBJETOS[nombre] || OBJETOS.revision}</g>
    </svg>
  );
}

export const NOMBRES_DE_ILUSTRACION = Object.keys(OBJETOS);
