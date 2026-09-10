/**
 * anchosColumnas — ANCHOS DE LA TABLA DE FICHEROS.
 *
 * Preferencia del USUARIO, no dato de la obra: las columnas son las mismas en
 * todas, así que quien ensancha «Descripción» para poder leerla la quiere ancha
 * en todas. Por eso se guarda una sola vez y no una por proyecto.
 *
 * Vive aparte del hook a propósito. Aquí no hay React ni DOM, sólo decisiones
 * —qué se acepta del almacén, qué se recorta, qué se descarta—, y eso se puede
 * probar de verdad. La regla que protege es sencilla: NADA de lo que venga del
 * almacén puede dejar la tabla inservible.
 */

export const ANCHOS_POR_DEFECTO = {
  checkbox: 40, name: 400, description: 150, version: 80,
  indicators: 150, markup: 100, issues: 80, size: 100,
  updated: 180, user: 150, status: 120, action: 60
};

export const LLAVE_ANCHOS = 'ecd.docs.anchosColumnas';
export const ANCHO_MINIMO = 40;
// Tope de CORDURA, no de uso: nadie arrastra hasta aquí a mano. Existe para que
// un valor corrupto no deje una tabla de un millón de píxeles que ya no haya
// forma de volver a estrechar.
export const ANCHO_MAXIMO = 2000;

/** Deja un ancho dentro de lo utilizable. Devuelve null si no es un número. */
export function limitarAncho(valor) {
  // `Number('')`, `Number(null)` y `Number([])` valen CERO. Sin este filtro un
  // hueco en el almacén se colaba como «40 px» —la columna encogida al mínimo—
  // en vez de dejar el ancho de fábrica, que es lo que un hueco significa.
  if (typeof valor !== 'number' && typeof valor !== 'string') return null;
  if (typeof valor === 'string' && valor.trim() === '') return null;
  const n = Number(valor);
  if (!Number.isFinite(n)) return null;
  return Math.min(Math.max(n, ANCHO_MINIMO), ANCHO_MAXIMO);
}

/**
 * Lee los anchos guardados. Ante CUALQUIER duda, los de siempre.
 *
 * `almacen` se inyecta para poder probar esto sin navegador; en la aplicación
 * es `localStorage`.
 */
export function leerAnchos(almacen) {
  try {
    const deposito = almacen || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!deposito) return { ...ANCHOS_POR_DEFECTO };

    const crudo = deposito.getItem(LLAVE_ANCHOS);
    if (!crudo) return { ...ANCHOS_POR_DEFECTO };

    const guardado = JSON.parse(crudo);
    if (!guardado || typeof guardado !== 'object' || Array.isArray(guardado)) {
      return { ...ANCHOS_POR_DEFECTO };
    }

    // Se parte SIEMPRE de las columnas de hoy y sólo se aceptan números suyos.
    // Así un ajuste viejo no resucita una columna retirada ni deja sin ancho a
    // una recién añadida, y basura en el almacén no rompe la pantalla.
    const anchos = { ...ANCHOS_POR_DEFECTO };
    for (const clave of Object.keys(ANCHOS_POR_DEFECTO)) {
      const limitado = limitarAncho(guardado[clave]);
      if (limitado !== null) anchos[clave] = limitado;
    }
    return anchos;
  } catch {
    // Navegación privada, almacenamiento desactivado o JSON corrupto: la tabla
    // se dibuja con los anchos de siempre. La pantalla no se cae por esto.
    return { ...ANCHOS_POR_DEFECTO };
  }
}

/** Guarda los anchos. Que no se pueda es un contratiempo, no un error. */
export function guardarAnchos(anchos, almacen) {
  try {
    const deposito = almacen || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!deposito) return false;
    deposito.setItem(LLAVE_ANCHOS, JSON.stringify(anchos));
    return true;
  } catch {
    return false;   // sin almacén o lleno: se pierde la preferencia, no la sesión
  }
}
