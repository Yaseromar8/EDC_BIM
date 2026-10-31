// Colores y letra del lienzo compartido (Docs y View). Paleta oficial D-24: los mismos valores que
// frontend-react/src/components/dashboard/tema.js, que la usa para las gráficas.
export const C = Object.freeze({
  dark: '#141413',
  light: '#faf9f5',
  blanco: '#ffffff',
  midGray: '#b0aea5',
  lightGray: '#e8e6dc',
  light50: '#f1f0e8',
  gris300: '#cccac0',
  gris600: '#72706b',
  gris700: '#52524d',
  blue: '#6a9bcc',
  blue30D: '#507294',
  orange: '#d97757',
  orange30D: '#9e5943',
  green: '#788c5d',
  error: '#b93535',
});
export const FUENTE = "'IBM Plex Sans', system-ui, -apple-system, sans-serif";
export const RADIO = 8;
// La raya de color del título de cada sección, por turnos.
export const COLORES_SECCION = Object.freeze([C.orange, C.blue, C.green, C.gris700]);
// Caja flotante de Forma Board: blanca, radio 8, sin borde y una sombra difusa (0 0 16 px al 12 %).
export const cajaFlotante = { background: '#fff', borderRadius: 8, boxShadow: '0 0 16px rgba(0,0,0,0.12)', fontFamily: FUENTE };
