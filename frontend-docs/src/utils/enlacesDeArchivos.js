// frontend-docs/src/utils/enlacesDeArchivos.js
//
// ENLACES DE ARCHIVOS (14-sep-2026): la obra, la carpeta y el documento van en la
// dirección, como en ACC (`folderUrn` + `entityId`). Todo puro, para probarlo sin
// navegador (`pruebas/enlacesDeArchivos.prueba.mjs`).
//
//   /?obra=<obra>                                        la obra, en su carpeta raíz
//   /?obra=<obra>&carpeta=<carpeta>                      una carpeta
//   /?obra=<obra>&carpeta=<carpeta>&documento=<doc>      un documento, en su versión vigente
//   ...&documento=<doc>&version=<versión>                una versión fija de ese documento
//
// Identificadores, nunca nombres: renombrar o mover no rompe el enlace. La raíz de la
// obra no lleva `carpeta`. Una dirección con `revision` es de Revisiones
// (`utils/revisiones.js`) y aquí no se toca.
//
// LA AUTORIDAD NO ESTÁ AQUÍ. Un enlace no concede nada: dónde está hoy lo que nombra, y
// si quien lo abre puede verlo, lo dice el servidor (`GET /api/docs/ubicacion`).

// Donde espera un enlace mientras se inicia sesión: el login puede limpiar la URL.
export const CLAVE_DEL_ENLACE_DE_ARCHIVOS = 'ecd_enlace_archivos';

// La misma frase que `backend/enlaces_de_archivos.MENSAJE_NO_DISPONIBLE`: inexistente, de
// otra obra, en la papelera o sin permiso se dicen igual, sin nombre ni ubicación.
export const ENLACE_NO_DISPONIBLE = 'No tienes acceso a ese elemento o ya no existe.';

const PARAMETROS = ['obra', 'carpeta', 'documento', 'version'];
const DEL_EXPLORADOR = ['carpeta', 'documento', 'version'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function esIdentificador(valor) {
  return UUID.test(String(valor ?? '').trim());
}

function cadena(p) {
  const s = p.toString();
  return s ? `?${s}` : '';
}

// El enlace de Archivos de una dirección, o null. Sin documento no hay versión.
export function leerEnlaceDeArchivos(search) {
  const p = new URLSearchParams(search || '');
  if (p.has('revision')) return null;
  const valor = (clave) => (p.get(clave) || '').trim() || null;
  const obra = valor('obra');
  if (!obra) return null;
  const documento = valor('documento');
  return { obra, carpeta: valor('carpeta'), documento, version: documento ? valor('version') : null };
}

// La `search` con este enlace, o sin ninguno (null), conservando lo demás. Quita también
// `revision`: la dirección no puede decir dos cosas a la vez.
export function conArchivos(search, enlace) {
  const p = new URLSearchParams(search || '');
  p.delete('revision');
  for (const clave of PARAMETROS) p.delete(clave);
  if (enlace?.obra) {
    p.set('obra', String(enlace.obra));
    if (enlace.carpeta) p.set('carpeta', String(enlace.carpeta));
    if (enlace.documento) {
      p.set('documento', String(enlace.documento));
      if (enlace.version) p.set('version', String(enlace.version));
    }
  }
  return cadena(p);
}

// Fuera de la vista de carpetas la dirección no dice carpeta ni documento: se quedan la
// obra y lo demás, `revision` incluida.
export function sinCarpetaNiDocumento(search) {
  const p = new URLSearchParams(search || '');
  for (const clave of DEL_EXPLORADOR) p.delete(clave);
  return cadena(p);
}

// «Copiar enlace»: la dirección completa. Por omisión, el documento vigente y no una
// versión congelada.
export function enlaceDeArchivos(origen, enlace) {
  return `${origen || ''}/${conArchivos('', enlace)}`;
}

export function mismoEnlace(a, b) {
  if (!a || !b) return !a && !b;
  return PARAMETROS.every(clave => String(a[clave] ?? '') === String(b[clave] ?? ''));
}

// La ruta del explorador (`obra/Carpeta/Sub/`) a partir de la cadena del servidor. Los
// nombres solo sirven para pintar: el enlace va por identificador.
export function rutaDeLaCadena(prefijo, ruta) {
  const nombres = (ruta || []).map(c => c.name);
  return `${prefijo}/${nombres.length ? `${nombres.join('/')}/` : ''}`;
}

// Lo que se guarda en `history.state` en las entradas de Archivos.
export function estadoDeArchivos(enlace, extra = {}) {
  return { alephia: 'archivos', obra: enlace?.obra ?? null, carpeta: enlace?.carpeta ?? null,
           documento: enlace?.documento ?? null, version: enlace?.version ?? null, ...extra };
}

// ¿Lo que trae Atrás/Adelante saca al explorador de otra sección y lo lleva a la vista de
// carpetas? Solo si nombra una carpeta o un documento de ESTA obra: `?obra=` a secas es
// también la dirección de Revisiones y del resto de la obra.
export function pideLaVistaDeCarpetas(enlace, obraActual) {
  return Boolean(enlace && obraActual != null && String(enlace.obra) === String(obraActual)
                 && (enlace.carpeta || enlace.documento));
}

// ATRÁS Y ADELANTE FUERA DEL EXPLORADOR (`App_Refactor`):
//   · 'enlace': la dirección es de Archivos y de una obra que no se está viendo;
//   · 'lista' / 'hub': la entrada es la de la lista de obras o la de la portada;
//   · 'nada': lo resuelve el explorador, o no es de Archivos.
// La lista y la portada solo se reconocen por su marca en `history.state`: una dirección
// vacía también la escribe Revisiones al cerrar un detalle, dentro de la obra.
export function destinoDeArchivosTrasNavegar(search, estado, { enDocumentos = false, obraActual = null } = {}) {
  const enlace = leerEnlaceDeArchivos(search);
  if (enlace) {
    const dentro = enDocumentos && obraActual != null && String(enlace.obra) === String(obraActual);
    return dentro ? { tipo: 'nada' } : { tipo: 'enlace', enlace };
  }
  if (new URLSearchParams(search || '').has('revision')) return { tipo: 'nada' };
  if (estado?.alephia === 'hub') return { tipo: 'hub' };
  if (estado?.alephia === 'lista') return { tipo: 'lista' };
  return { tipo: 'nada' };
}
