/**
 * estadosECD.jsx — el vocabulario visual del expediente, en UN solo sitio.
 *
 * POR QUE ESTO EXISTE
 * En un ECD el color no decora: significa. Alguien aprende en la tabla de
 * archivos que verde = publicado, y ese aprendizaje tiene que valer en todas
 * las pantallas. Si cada módulo se inventa sus colores, el mismo estado se ve
 * distinto según dónde se mire, y entonces el color deja de querer decir nada
 * — que es peor que no usarlo.
 *
 * Medido el 15-ago-2026 en el portal: 868 colores literales, 159 distintos. Los
 * estados del ciclo de vida se definían en un único fichero (`MatrixTable.jsx`)
 * con hexadecimales a mano, fuera del sistema de color y sin contraste medido.
 *
 * Aquí no se inventa ninguna paleta: se usan las familias de tokens que el
 * portal ya tiene, con su contraste medido.
 *
 *   WIP        neutro   — trabajo en curso; no dice nada todavía
 *   SHARED     acento   — compartido para revisión y coordinación
 *   PUBLISHED  éxito    — autorizado para el uso que declare
 *   ARCHIVED   aviso    — registro histórico, superado
 *
 * El acento para SHARED no es capricho: es el azul del portal, y compartido es
 * el estado "en curso normal". El verde queda reservado para lo único con lo
 * que se construye.
 */
import React from 'react';

export const ESTADOS = {
  WIP: {
    etiqueta: 'Borrador',
    corto: 'WIP',
    fondo: 'var(--neutral-100)',
    borde: 'var(--border)',
    texto: 'var(--text-secondary)',
    ayuda: 'Trabajo en curso. No se ha emitido: puede cambiar sin avisar.',
  },
  SHARED: {
    etiqueta: 'Compartido',
    corto: 'SHARED',
    fondo: 'var(--bg-accent)',
    borde: 'var(--border-accent)',
    texto: 'var(--accent)',
    ayuda: 'Emitido para revisión y coordinación. Con esto NO se construye.',
  },
  PUBLISHED: {
    etiqueta: 'Publicado',
    corto: 'PUBLISHED',
    fondo: 'var(--bg-success)',
    borde: 'var(--border-success)',
    texto: 'var(--success)',
    ayuda: 'Autorizado para el uso que declare su código de idoneidad.',
  },
  ARCHIVED: {
    etiqueta: 'Archivado',
    corto: 'ARCHIVED',
    fondo: 'var(--bg-warning)',
    borde: 'var(--border-warning)',
    texto: 'var(--warning)',
    ayuda: 'Registro histórico. Superado por una versión posterior.',
  },
};

// Las familias del catálogo de idoneidad. Mismo criterio: el verde es lo único
// con lo que se construye.
export const FAMILIAS_IDONEIDAD = {
  compartido: { fondo: 'var(--bg-accent)', borde: 'var(--border-accent)', texto: 'var(--accent)' },
  publicado: { fondo: 'var(--bg-success)', borde: 'var(--border-success)', texto: 'var(--success)' },
  registro: { fondo: 'var(--neutral-100)', borde: 'var(--border)', texto: 'var(--text-secondary)' },
  'fuera de vocabulario': { fondo: 'var(--bg-danger)', borde: 'var(--border-danger)', texto: 'var(--danger)' },
};

const NEUTRO = {
  fondo: 'var(--neutral-100)', borde: 'var(--border)', texto: 'var(--text-secondary)',
};

/** El estado en su forma legible. `null` si el estado no se reconoce. */
export function estadoDe(codigo) {
  return ESTADOS[String(codigo || '').toUpperCase()] || null;
}

/**
 * La ficha de estado. Una sola, para que la misma cosa se vea igual en todas
 * las pantallas.
 *
 * Un estado desconocido NO se pinta como si fuera normal: se enseña tal cual y
 * en neutro. Fingir que un valor que no entendemos es un estado válido es como
 * se cuelan los datos rotos sin que nadie los vea.
 */
export function Ficha({ estado, tamano = 'normal', titulo }) {
  const e = estadoDe(estado);
  const c = e || NEUTRO;
  const pequena = tamano === 'pequena';
  return (
    <span
      title={titulo || (e ? e.ayuda : `Estado no reconocido: ${estado}`)}
      style={{
        display: 'inline-block',
        padding: pequena ? '1px 7px' : '2px 9px',
        borderRadius: 999,
        fontSize: pequena ? 10.5 : 11.5,
        fontWeight: 600,
        background: c.fondo,
        border: `1px solid ${c.borde}`,
        color: c.texto,
        whiteSpace: 'nowrap',
      }}
    >
      {e ? e.etiqueta : String(estado || '—')}
    </span>
  );
}

/** La ficha de un código de idoneidad, coloreada por su familia. */
export function FichaIdoneidad({ codigo, familia, etiqueta }) {
  if (!codigo) return null;
  const c = FAMILIAS_IDONEIDAD[familia] || NEUTRO;
  return (
    <span
      title={etiqueta || codigo}
      style={{
        display: 'inline-block', padding: '1px 7px', borderRadius: 6,
        fontSize: 10.5, fontWeight: 700, fontFamily: 'monospace',
        background: c.fondo, border: `1px solid ${c.borde}`, color: c.texto,
        whiteSpace: 'nowrap',
      }}
    >
      {codigo}
    </span>
  );
}
