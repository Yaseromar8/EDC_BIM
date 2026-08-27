/**
 * GAP 07 · LA PRECARGA — lo que hay que llevarse antes de perder la cobertura.
 *
 * QUÉ SE PRECARGA Y QUÉ NO
 * -------------------------
 * Solo lo que hace falta para PODER CAPTURAR:
 *
 *     protocolos    la plantilla, con su versión
 *     issues        los abiertos, para no duplicar y para poder corregir
 *     miembros      a quién se puede designar responsable o verificador
 *     catálogos     tipos, severidades, disciplinas
 *
 * NO se precarga el CDE entero. Un móvil no es un espejo del servidor, y
 * pretenderlo sería un producto que tarda diez minutos en «estar listo» y llena
 * el almacenamiento del teléfono.
 *
 * LA VERSIÓN VIAJA CON EL DATO
 * -----------------------------
 * Cada plantilla se guarda con la `version` que tenía al descargarla. Eso es lo
 * que el inspector tuvo delante, y es lo que se manda al sincronizar. Si el
 * servidor ya va por otra, será él quien lo diga — pero las respuestas no se
 * reinterpretan contra un cuestionario que esa persona nunca vio.
 *
 * LO PRECARGADO ES UNA FOTO, NO LA VERDAD
 * ----------------------------------------
 * Se guarda `descargado_en` y la pantalla lo enseña. Un listado de issues de
 * hace tres días es útil para trabajar, pero no es el estado de la obra, y
 * decir lo contrario haría que alguien tomara una decisión sobre datos viejos
 * creyéndolos frescos.
 */
import { apiFetch } from '../utils/apiFetch';
import * as local from './almacenLocal';

export const PROTOCOLOS = 'protocolos';
export const ISSUES = 'issues';
export const MIEMBROS = 'miembros';
export const CATALOGOS = 'catalogos';

async function traer(API, ruta) {
  const r = await apiFetch(`${API}${ruta}`);
  if (!r.ok) throw new Error(`${ruta} respondió ${r.status}`);
  return r.json();
}

/**
 * Se lleva la obra al bolsillo. Devuelve qué se pudo traer y qué no.
 *
 * Un fallo parcial NO tira la precarga entera: llevarse los protocolos y no los
 * issues es peor que llevárselo todo, pero es muchísimo mejor que no llevarse
 * nada porque una de las cuatro llamadas falló.
 */
export async function precargar(API, ctx, { onProgreso } = {}) {
  // El parámetro se llama `model_urn` en las dos rutas, aunque lo que va dentro
  // sea el alcance de escritura de la obra: el servidor lo resuelve igual
  // (`resolve_project_id`). Se manda el MISMO alcance que usará la cola al
  // sincronizar — si aquí se mandara uno y allí otro, alguien podría llenar un
  // acta contra los protocolos de una obra y sincronizarla en otra.
  const alcance = encodeURIComponent(ctx.project_id);
  const piezas = [
    { tipo: PROTOCOLOS, etiqueta: 'protocolos',
      ruta: `/api/protocolos/plantillas?model_urn=${alcance}` },
    { tipo: ISSUES, etiqueta: 'observaciones',
      // Se traen TODAS y se filtran aquí. La ruta filtra por un estado
      // concreto, no por «abiertas», y pedirle `estado=abiertos` devolvería
      // cero — una precarga vacía que parecería una obra sin observaciones.
      ruta: `/api/issues?model_urn=${alcance}` },
    { tipo: MIEMBROS, etiqueta: 'equipo de obra',
      ruta: `/api/projects/${alcance}/users` },
    { tipo: CATALOGOS, etiqueta: 'catálogos',
      ruta: `/api/issues/catalogo` },
  ];

  // LOS MODULOS TAMBIEN SE LLEVAN. Los chunks se cargan bajo demanda, y el
  // service worker solo cachea lo que alguien pidio: un modulo NUNCA visitado
  // antes de perder la red no puede abrirse sin ella -- paso en la EXP real
  // («Failed to fetch dynamically imported module: ProtocolosModule…»).
  // Importarlos aqui los trae, y el SW los guarda al pasar.
  try {
    await Promise.all([
      import('../components/ProtocolosModule'),
      import('../components/PunchModule'),
      import('../components/SincronizacionModule'),
      import('../components/FotosModule'),
    ]);
    if (onProgreso) onProgreso({ etiqueta: 'pantallas de campo', estado: 'listo' });
  } catch (e) {
    if (onProgreso) onProgreso({ etiqueta: 'pantallas de campo', estado: 'falló' });
  }

  const resultado = { traidas: [], fallidas: [], descargado_en: Date.now() };
  for (const pieza of piezas) {
    if (onProgreso) onProgreso({ etiqueta: pieza.etiqueta, estado: 'trayendo' });
    try {
      const datos = await traer(API, pieza.ruta);
      await local.guardarSnapshot(ctx, pieza.tipo, datos);
      resultado.traidas.push(pieza.tipo);
      if (onProgreso) onProgreso({ etiqueta: pieza.etiqueta, estado: 'listo' });
    } catch (e) {
      // Si es cuota, el mensaje tiene que ser otro: no se arregla reintentando.
      const cuota = local.esFalloDeCuota(e);
      resultado.fallidas.push({
        tipo: pieza.tipo, etiqueta: pieza.etiqueta, cuota,
        motivo: cuota ? 'no cabe en este dispositivo' : (e.message || 'no se pudo traer'),
      });
      if (onProgreso) onProgreso({ etiqueta: pieza.etiqueta, estado: 'falló' });
    }
  }
  return resultado;
}

/**
 * Lee lo precargado. Devuelve también CUÁNDO se trajo, siempre.
 *
 * Devolver solo los datos permitiría enseñarlos como si fueran de ahora, que es
 * exactamente el error que hay que impedir.
 */
export async function leer(ctx, tipo) {
  const fila = await local.leerSnapshot(ctx, tipo);
  if (!fila) return { datos: null, descargado_en: null, hay: false };
  return { datos: fila.datos, descargado_en: fila.descargado_en, hay: true };
}

/**
 * La plantilla TAL COMO SE DESCARGÓ, con su versión.
 *
 * Quien llena un acta en campo lo hace contra esto. Al sincronizar se manda
 * `protocolo_version`, y el servidor decide: si esa versión sigue siendo
 * reconstruible, el acta entra; si no, devuelve CONFLICTO y la persona decide.
 * Lo que no ocurre nunca es que las respuestas se apliquen a otra versión.
 */
export async function plantillaPrecargada(ctx, protocolo_id) {
  const { datos, descargado_en } = await leer(ctx, PROTOCOLOS);
  const lista = (datos && (datos.plantillas || datos)) || [];
  const pl = lista.find(x => String(x.id) === String(protocolo_id));
  if (!pl) return null;
  return {
    ...pl,
    // Explícito: esta es la versión que se usará al sincronizar.
    version_en_campo: pl.version || 1,
    descargado_en,
  };
}

/** ¿Hay lo mínimo para trabajar sin red? */
export async function listaParaCampo(ctx) {
  const p = await leer(ctx, PROTOCOLOS);
  const m = await leer(ctx, MIEMBROS);
  return {
    lista: p.hay && m.hay,
    falta: [!p.hay && 'protocolos', !m.hay && 'equipo de obra'].filter(Boolean),
    descargado_en: p.descargado_en || null,
  };
}

/** Cuánto hace que se trajo, en palabras. */
export function antiguedad(descargado_en) {
  if (!descargado_en) return 'nunca';
  const min = Math.floor((Date.now() - descargado_en) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}
