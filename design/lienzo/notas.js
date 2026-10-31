// Notas y textos libres del Tablero (docs/visor/54): datos y medidas, sin componentes.
// Colores de las notas: suaves, como las de Forma Board.
export const COLORES_NOTA = Object.freeze({
  amarillo: '#FBE8A6', naranja: '#FBCB8F', verde: '#CFE6B9', azul: '#C6DCF1', rosa: '#F4CBD5', gris: '#E4E2D9',
});
export const NOTA_LADO = 200;            // como tldraw: las notas miden 200 × 200
export const NOTA_HUECO = 10;            // y la de al lado nace a 10 px
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
// Letra de la nota: tan grande como quepa (las notas cortas se leen de lejos).
export const letraNota = (texto, w, h) => Math.round(clamp(Math.sqrt((w * h * 0.42) / Math.max(1, (texto || '').length)), 13, 40));
// Tamaño de un texto libre (para seleccionarlo y encuadrarlo).
export const medidaTexto = (texto) => {
  const lineas = (texto || ' ').split('\n');
  return { w: Math.max(40, Math.max(...lineas.map(l => l.length)) * 11 + 8), h: lineas.length * 26 + 6 };
};
