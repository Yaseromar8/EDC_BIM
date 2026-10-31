// Fusión de dos guardados del mismo tablero (docs/visor/57). Cuando el servidor responde 409 —alguien guardó
// después de la versión sobre la que yo trabajaba— no se pisa a nadie: se fusiona POR ELEMENTO, a tres bandas.
//
//   base   = el contenido del servidor sobre el que empecé (mi última versión conocida)
//   mio    = lo que tengo ahora en pantalla
//   suyo   = lo que hay ahora en el servidor
//
// Por cada elemento (nota, texto, sección), por su id:
//   - solo lo cambié yo           → el mío
//   - solo lo cambió el otro      → el suyo
//   - lo cambiamos los dos        → el mío (soy quien guarda ahora; el suyo queda en su versión anterior)
//   - lo borré yo y el otro no lo tocó  → borrado;   lo borré yo y el otro lo cambió → se queda el suyo
//   - lo borró el otro y yo no lo toqué → borrado;   lo borró el otro y yo lo cambié → se queda el mío
//   - nuevo de cualquiera         → se queda
// El orden (que es el orden de dibujo) es el del servidor; lo que él ya no tiene y se queda (lo nuevo mío, o
// lo que él borró y yo cambié) va detrás, encima de todo.
export const LISTAS = ['notas', 'secciones'];

const igual = (a, b) => a === b || JSON.stringify(a) === JSON.stringify(b);
const porId = (lista) => new Map((lista || []).map(x => [x.id, x]));

function fusionarLista(base, mio, suyo) {
  const B = porId(base), M = porId(mio), S = porId(suyo);
  const elegir = (id) => {
    const b = B.get(id), m = M.get(id), s = S.get(id);
    if (!b) return m || s;                              // nuevo (si los dos crearon el mismo id, el mío)
    if (!m && !s) return null;                          // los dos lo borraron
    if (!m) return igual(s, b) ? null : s;              // lo borré yo
    if (!s) return igual(m, b) ? null : m;              // lo borró el otro
    return igual(m, b) ? s : m;                         // cambió uno, el otro o los dos
  };
  const salida = [], vistos = new Set();
  for (const x of suyo || []) { vistos.add(x.id); const e = elegir(x.id); if (e) salida.push(e); }
  for (const x of base || []) if (!vistos.has(x.id)) { vistos.add(x.id); const e = elegir(x.id); if (e) salida.push(e); }
  for (const x of mio || []) if (!vistos.has(x.id)) { vistos.add(x.id); const e = elegir(x.id); if (e) salida.push(e); }
  return salida;
}

export function fusionar(base, mio, suyo) {
  const salida = { ...(suyo || {}) };
  for (const k of LISTAS) salida[k] = fusionarLista(base?.[k], mio?.[k], suyo?.[k]);
  return salida;
}

// ¿Hay algo distinto entre dos contenidos? (para no guardar lo que no cambió)
export const mismoContenido = (a, b) => LISTAS.every(k => igual(a?.[k] || [], b?.[k] || []));
