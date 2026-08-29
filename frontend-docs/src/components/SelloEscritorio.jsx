import React from 'react';

/**
 * El sello de la aplicación a la que va el documento.
 *
 * VIVE EN UN SOLO SITIO A PROPÓSITO. Este sello se dibuja en dos lugares —la
 * cabecera del expediente y la barra del lector— y hoy mismo un ayudante
 * duplicado en dos ficheros causó que la rejilla del inventario siguiera
 * pidiendo la ruta vieja. Un componente compartido es lo que impide que los
 * dos dibujos se separen con el tiempo.
 *
 * EL PDF NO LLEVA LETRA, LLEVA SU ICONO. Un cuadrado con una «P» no le dice
 * nada a nadie; el documento rojo con la banda PDF lo reconoce cualquiera sin
 * leer, y es justo lo que se busca: que quien lo vea entienda «esto me lo abre
 * en mi lector de PDF». El dibujo es propio —el convenio del icono de tipo de
 * fichero es genérico, pero las ilustraciones de banco tienen licencia y no se
 * copian.
 */
export default function SelloEscritorio({ app, tamano = 16 }) {
  const esPdf = app?.letra === 'P';

  if (esPdf) {
    return (
      <svg width={tamano} height={tamano} viewBox="0 0 24 24" aria-hidden="true"
        style={{ display: 'block', flexShrink: 0 }}>
        {/* La hoja, con la esquina doblada */}
        <path d="M6 2.5h7.2L19 8.3V20a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4A1.5 1.5 0 0 1 6.5 2.5Z"
          fill="#fff" stroke="#D93025" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M13 2.6V8h5.3" fill="none" stroke="#D93025" strokeWidth="1.8" strokeLinejoin="round" />
        {/* La banda roja: es lo que hace reconocible el icono a tamaño pequeño */}
        <rect x="3" y="11.6" width="17" height="7.6" rx="1.2" fill="#D93025" />
        <text x="11" y="17.2" textAnchor="middle" fill="#fff"
          fontSize="6.1" fontWeight="700" fontFamily="Inter, Arial, sans-serif"
          letterSpacing="0.2">PDF</text>
      </svg>
    );
  }

  // Revit, Civil 3D, Navisworks: su sello de letra, como estaba.
  return (
    <span style={{
      width: tamano, height: tamano, borderRadius: 3,
      background: app?.color || '#5B6875', color: '#fff',
      fontSize: Math.round(tamano * 0.66), fontWeight: 800,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      lineHeight: 1, flexShrink: 0,
    }}>
      {app?.letra || '?'}
    </span>
  );
}
