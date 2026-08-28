// Cola compartida para pedir miniaturas de documentos.
//
// Generar la miniatura de un PDF obliga al servidor a bajar el fichero entero
// y rasterizar su primera página. Pedirlas todas de golpe fue justo lo que
// dejó la tira del lector EN BLANCO con 45 planos. De dos en dos entran
// igual y se van pintando según llegan.
//
// Vive aquí, y no dentro de una pantalla, porque ahora hay DOS sitios que
// las piden: la tira del lector y la vista de cuadrícula del explorador.
// Compartir la cola es lo que impide que abrir las dos a la vez duplique la
// avalancha que ya costó un incidente.

const cola = [];
let enCurso = 0;
const LIMITE = 2;

function servir() {
  while (enCurso < LIMITE && cola.length) {
    const { tarea, resolve, reject } = cola.shift();
    enCurso += 1;
    tarea().then(resolve, reject).finally(() => { enCurso -= 1; servir(); });
  }
}

export function pedirMiniatura(tarea) {
  return new Promise((resolve, reject) => {
    cola.push({ tarea, resolve, reject });
    servir();
  });
}

// La dirección de la miniatura de un documento. Se pide con apiFetch (que
// manda la cabecera de sesión) y se vuelve un blob local: una etiqueta <img>
// no puede mandar cabeceras, y meter el token en la URL es el defecto que ya
// se corrigió en el menú del clic derecho.
export function urlDeMiniatura(API, gcsUrn) {
  return `${API}/api/docs/view?urn=${encodeURIComponent(gcsUrn)}&thumb=1&gen=1`;
}
