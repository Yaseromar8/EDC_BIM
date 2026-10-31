// Notas y textos libres del Tablero (docs/visor/54): datos y medidas, sin componentes.
// Colores de las notas: suaves, como las de Forma Board.
export const COLORES_NOTA = Object.freeze({
  amarillo: '#FBE8A6', naranja: '#FBCB8F', verde: '#CFE6B9', azul: '#C6DCF1', rosa: '#F4CBD5', gris: '#E4E2D9',
});
// Los mismos colores como tinta, para el texto libre (el gris es el negro de la paleta: el color por omisión).
export const COLORES_TINTA = Object.freeze({
  amarillo: '#8A6D0B', naranja: '#B5562F', verde: '#55703A', azul: '#2F5F8F', rosa: '#A33D5C', gris: '#141413',
});
export const NOTA_LADO = 200;            // como tldraw: las notas miden 200 × 200
export const NOTA_HUECO = 10;            // y la de al lado nace a 10 px
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
// Letra de la nota: tan grande como quepa (las notas cortas se leen de lejos).
export const letraNota = (texto, w, h) => Math.round(clamp(Math.sqrt((w * h * 0.42) / Math.max(1, (texto || '').length)), 13, 40));

// Estilo de notas y textos (barra contextual, como la de ACC): letra, tamaño y alineación.
export const FUENTES = Object.freeze({
  sans: { nombre: 'IBM Plex Sans', css: "'IBM Plex Sans', system-ui, -apple-system, sans-serif", ancho: 0.55 },
  mono: { nombre: 'IBM Plex Mono', css: "'IBM Plex Mono', ui-monospace, monospace", ancho: 0.6 },
});
export const TAMANOS = Object.freeze([
  ['auto', 'Automático'], ['s', 'Pequeño'], ['m', 'Mediano'], ['l', 'Grande'], ['xl', 'Extragrande'],
]);
const LETRA_NOTA = { s: 14, m: 18, l: 24, xl: 32 };
const LETRA_TEXTO = { auto: 20, s: 14, m: 20, l: 28, xl: 40 };
export const fuenteDe = (n) => (FUENTES[n?.fuente] || FUENTES.sans);
// La automática se calcula sobre el ancho (la nota es cuadrada al nacer): así, cuando la nota crece hacia abajo
// porque el texto no cabe, la letra no crece con ella.
export const letraDeNota = (n) => LETRA_NOTA[n.tamano] || letraNota(n.texto, n.w, n.w);
export const letraDeTexto = (n) => LETRA_TEXTO[n?.tamano] || LETRA_TEXTO.auto;
export const ALINEAR = Object.freeze({ izquierda: 'flex-start', centro: 'center', derecha: 'flex-end' });
export const VERTICAL = Object.freeze({ arriba: 'flex-start', centro: 'center', abajo: 'flex-end' });

// Tamaño de un texto libre (para seleccionarlo y encuadrarlo), según su letra y su tamaño.
export const medidaTexto = (texto, estilo) => {
  const tam = letraDeTexto(estilo), alto = Math.round(tam * 1.3);
  const lineas = (texto || ' ').split('\n');
  return { w: Math.max(40, Math.round(Math.max(...lineas.map(l => l.length)) * tam * fuenteDe(estilo).ancho) + 8), h: lineas.length * alto + 6 };
};
