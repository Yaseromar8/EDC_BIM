// ─────────────────────────────────────────────────────────────────────────
// LAS URLS FIRMADAS, PEDIDAS UNA VEZ Y COMPARTIDAS.
//
// EL PROBLEMA QUE RESUELVE. La cinta existe para revisar varios planos de una
// carpeta DEPRISA. Pero cada clic pagaba una autorizacion completa contra el
// backend antes de empezar siquiera a descargar. Medido en produccion, en la
// maquina del dueño:
//
//   url-firmada   793ms
//   url-firmada  2170ms
//   url-firmada  8046ms   <- ocho segundos ANTES de empezar a bajar el plano
//   url-firmada  1767ms
//
// Firmar es barato (se hace sin tocar la red); lo caro es comprobar el
// permiso y dejar rastro, y eso se pagaba en el camino critico del clic.
//
// Aqui se guarda lo ya autorizado y se comparte entre quien lo prepara de
// antemano (el lector, mientras miras una lamina) y quien lo necesita (el
// expediente, cuando pulsas otra). Si estaba preparada, el clic no espera
// NADA en esta fase.
//
// NO ES UN ATAJO A LA SEGURIDAD: la autorizacion se pide igual, solo que
// ANTES y una sola vez. Nada se guarda entre sesiones ni sale del navegador.
// ─────────────────────────────────────────────────────────────────────────
import { apiFetch } from './apiFetch';
import { API } from './helpers';

// El backend firma para mucho mas, pero conviene no arrastrar autorizaciones
// viejas: si el permiso cambia, que se vuelva a pedir en un rato razonable.
const VIDA_MS = 15 * 60 * 1000;
const TOPE = 60;

const enMano = new Map();    // urn -> { url, caduca }
const enVuelo = new Map();   // urn -> Promise  (dos peticiones a la vez, no)

function vigente(urn) {
  const e = enMano.get(urn);
  if (!e) return null;
  if (Date.now() > e.caduca) { enMano.delete(urn); return null; }
  return e.url;
}

/** La URL si ya se autorizo; null si hay que pedirla. Sin efectos. */
export function urlFirmadaEnMano(urn) {
  return urn ? vigente(urn) : null;
}

/** Pide la URL (o devuelve la que ya habia). Nunca lanza dos veces la misma. */
export function pedirUrlFirmada(urn, obra) {
  if (!urn) return Promise.reject(new Error('Sin identificador de fichero'));
  const ya = vigente(urn);
  if (ya) return Promise.resolve(ya);
  const enCurso = enVuelo.get(urn);
  if (enCurso) return enCurso;

  const peticion = apiFetch(
    `${API}/api/docs/signed-url?urn=${encodeURIComponent(urn)}`
    + `&model_urn=${encodeURIComponent(obra || '')}`)
    .then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.success || !d.url) {
        throw new Error(d.error || 'No se pudo autorizar la vista previa');
      }
      if (enMano.size >= TOPE) enMano.delete(enMano.keys().next().value);
      enMano.set(urn, { url: d.url, caduca: Date.now() + VIDA_MS });
      return d.url;
    })
    .finally(() => enVuelo.delete(urn));

  enVuelo.set(urn, peticion);
  return peticion;
}
