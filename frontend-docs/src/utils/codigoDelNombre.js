/**
 * codigoDelNombre — las piezas del código ISO 19650 leídas del NOMBRE del fichero.
 *
 * La Guía Nacional BIM (2023, nomenclatura de contenedores) fija QUÉ campos lleva
 * el nombre y en qué orden: proyecto · autor (originador) · volumen o sistema ·
 * nivel · tipo de documento · disciplina · número. NO fija qué significa cada
 * código: eso lo decide cada obra en su plan. Por eso aquí se devuelven los
 * códigos tal cual («DR»), sin inventarles un nombre.
 *
 * Solo se desmonta si el nombre trae exactamente las siete piezas, todas con
 * algo. Un nombre que no sigue la convención devuelve null: decir que se ha
 * «leído» lo que no está sería inventar.
 *
 * Es la misma regla de base que usa el backend para cotejar el plan de entregas
 * (cotejar_midp.base): el nombre sin extensión.
 */

export const PIEZAS = ['proyecto', 'originador', 'volumen', 'nivel', 'tipo', 'disciplina', 'numero'];

export const ETIQUETAS_DE_PIEZA = {
  proyecto: 'Proyecto', originador: 'Originador', volumen: 'Volumen', nivel: 'Nivel',
  tipo: 'Tipo', disciplina: 'Disciplina', numero: 'Numeración',
};

/** El nombre sin extensión, en mayúsculas: la clave con la que se coteja. */
export function baseDelNombre(nombre) {
  return String(nombre || '').trim().replace(/\.[^.]+$/, '').toUpperCase();
}

/** {proyecto, originador, volumen, nivel, tipo, disciplina, numero} o null. */
export function piezasDelCodigo(nombre) {
  const partes = String(nombre || '').trim().replace(/\.[^.]+$/, '').split('-');
  if (partes.length !== PIEZAS.length || !partes.every(p => p.trim())) return null;
  return Object.fromEntries(PIEZAS.map((k, i) => [k, partes[i].trim()]));
}
