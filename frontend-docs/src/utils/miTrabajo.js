// frontend-docs/src/utils/miTrabajo.js
//
// EL RESUMEN AL ENTRAR (13-nov-2026) — docs/archivos/31_RESUMEN_AL_ENTRAR_Y_NUBES_RESUELTAS.md.
//
// El dueño: «al inicio, agregar un resumen de cada usuario de lo que está pendiente, vencido y entregado… para que
// cada vez que ingresen sepa qué le falta». «Mi trabajo» ya listaba lo que se debe; faltaban los tres números arriba
// y la otra mitad: lo que la persona YA entregó y espera a que otro lo acepte o lo verifique. Aquí, lo puro, para
// probarlo sin navegador (`pruebas/miTrabajo.prueba.mjs`). El servidor decide qué sale (`GET /api/mi-trabajo`):
// esto solo cuenta y ordena lo que llega.

const DIA = 86400000;

/** Días que faltan para una fecha (negativo: ya pasó). null si no hay fecha o no se entiende. */
export function diasPara(iso, ahora = Date.now()) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : Math.ceil((t - ahora) / DIA);
}

export function estaVencido(pendiente, ahora = Date.now()) {
  const d = diasPara(pendiente?.vence_en, ahora);
  return d !== null && d < 0;
}

/**
 * Los tres números de la portada. `pendiente` y `vencido` no se solapan: lo vencido es lo pendiente que ya pasó su
 * fecha, y se cuenta aparte porque es lo primero que hay que mirar. `entregado`: lo que ya hizo y espera respuesta.
 */
export function resumenDeMiTrabajo(pendientes, entregados, ahora = Date.now()) {
  const lista = Array.isArray(pendientes) ? pendientes : [];
  const vencido = lista.filter(p => estaVencido(p, ahora)).length;
  return { pendiente: lista.length - vencido, vencido, entregado: Array.isArray(entregados) ? entregados.length : 0 };
}

/** Lo pendiente con lo vencido primero (lo más atrasado arriba); el resto, como lo manda el servidor. */
export function pendientesEnOrden(pendientes, ahora = Date.now()) {
  const lista = Array.isArray(pendientes) ? pendientes : [];
  const vencidos = lista.filter(p => estaVencido(p, ahora))
    .sort((a, b) => new Date(a.vence_en).getTime() - new Date(b.vence_en).getTime());
  return [...vencidos, ...lista.filter(p => !estaVencido(p, ahora))];
}

/** «hoy», «ayer», «hace 3 d»: desde cuándo espera lo entregado. '' si no hay fecha. */
export function haceCuanto(iso, ahora = Date.now()) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const dias = Math.floor((ahora - t) / DIA);
  if (dias <= 0) return 'hoy';
  return dias === 1 ? 'ayer' : `hace ${dias} d`;
}

/** Una frase para quien no tiene nada: distingue «nada que hacer» de «todo entregado, esperando a otros». */
export function fraseSinPendientes(resumen) {
  return resumen && resumen.entregado > 0
    ? 'No tienes nada pendiente. Lo que entregaste espera respuesta.'
    : 'No tienes nada pendiente.';
}
