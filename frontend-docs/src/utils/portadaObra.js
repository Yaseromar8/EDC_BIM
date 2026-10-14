/**
 * portadaObra — la PORTADA de una obra por plazos (14-oct-2026).
 *
 * Patrón estándar del sector (la portada de Procore): por herramienta, cuánto
 * va atrasado, cuánto vence en los próximos 7 días y cuánto después, y «mis
 * pendientes». Lo nuestro es de dónde sale cada número: del plazo que guarda el
 * propio objeto (el paso de una revisión, el RFI, el compromiso del plan de
 * entregas), no de una fecha que alguien escribe aparte.
 *
 * Sin React ni DOM, para poder probarlo (`pruebas/portadaObra.prueba.mjs`). Las
 * fechas se comparan por DÍA (calendario de Lima), no por instante: algo que
 * vence hoy a las 18:00 no está «atrasado» a las 10:00.
 */

export const TRAMOS = [
  ['atrasado', 'Atrasado'], ['semana', 'Próximos 7 días'], ['despues', 'Más adelante'], ['sin_plazo', 'Sin plazo'],
];

const DIA = 86400000;

/** 'AAAA-MM-DD' del día de `fecha` en Lima (UTC−5, sin horario de verano). */
export function diaDeLima(fecha) {
  const t = new Date(fecha).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t - 5 * 3600000).toISOString().slice(0, 10);
}

/** Días de calendario de `hoy` a `fecha` (negativo = ya pasó). */
export function diasHasta(fecha, hoy = new Date()) {
  if (!fecha) return null;
  // Una fecha sola ('2026-10-01') ES un día; un instante se lleva al día de Lima.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(fecha)) ? String(fecha) : diaDeLima(fecha);
  const h = diaDeLima(hoy);
  if (!d || !h) return null;
  return Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${h}T00:00:00Z`)) / DIA);
}

export function tramoDe(fecha, hoy = new Date()) {
  const n = diasHasta(fecha, hoy);
  if (n === null) return 'sin_plazo';
  if (n < 0) return 'atrasado';
  if (n <= 7) return 'semana';
  return 'despues';
}

function contar(items, hoy) {
  const c = { atrasado: 0, semana: 0, despues: 0, sin_plazo: 0, total: 0 };
  for (const it of items) { c[tramoDe(it.vence, hoy)] += 1; c.total += 1; }
  return c;
}

/** Revisiones en curso: el plazo es el del PASO actual. */
export function deRevisiones(reviews) {
  return (reviews || []).filter(r => (r.status || 'pending') === 'pending')
    .map(r => ({ id: r.id, titulo: r.title, vence: r.paso_vence_en || null }));
}

/** RFI sin responder: los respondidos o cerrados ya no deben nada. */
export function deRfis(rfis) {
  return (rfis || []).filter(r => !['Respondido', 'Cerrado'].includes(r.estado))
    .map(r => ({ id: r.id, titulo: `${r.codigo || ''} ${r.titulo || ''}`.trim(), vence: r.vence_en || null }));
}

/** Compromisos del plan que aún no están entregados (publicados). */
export function dePlan(filas) {
  return (filas || []).filter(p => p.estado !== 'entregado')
    .map(p => ({ id: p.id, titulo: p.identificador, vence: p.fecha_comprometida || null, sinDocumento: !p.documento }));
}

/** El resumen por herramienta: [{ clave, nombre, ...cuentas }]. */
export function resumenPorHerramienta({ reviews, rfis, plan }, hoy = new Date()) {
  const filas = [];
  if (reviews) filas.push({ clave: 'reviews', nombre: 'Revisiones en curso', ...contar(deRevisiones(reviews), hoy) });
  if (rfis) filas.push({ clave: 'rfis', nombre: 'RFI sin responder', ...contar(deRfis(rfis), hoy) });
  if (plan) {
    const p = dePlan(plan);
    filas.push({ clave: 'plan', nombre: 'Plan de entregas (sin entregar)', ...contar(p, hoy),
      atrasadosSinDocumento: p.filter(x => x.sinDocumento && tramoDe(x.vence, hoy) === 'atrasado').length });
  }
  return filas;
}

const TIPO = {
  REVIEW: 'Revisión', RFI: 'RFI', REDLINE: 'Observación', TRANSMITTAL: 'Emisión', SUBMITTAL: 'Submittal',
  ISSUE: 'Issue', PROTOCOLO: 'Protocolo', PARTE: 'Parte diario', ASIENTO: 'Asiento', AVANCE: 'Avance',
  INSTRUCCION: 'Instrucción',
};

/** «Mis pendientes» repartidos por tramo, cada tramo del más urgente al menos. */
export function misPendientes(pendientes, hoy = new Date()) {
  const salida = { atrasado: [], semana: [], despues: [], sin_plazo: [] };
  for (const p of pendientes || []) {
    salida[tramoDe(p.vence_en, hoy)].push({
      id: p.id, tipo: p.objeto_tipo, etiqueta: TIPO[p.objeto_tipo] || p.objeto_tipo,
      objeto: p.objeto_id, asunto: p.asunto, vence: p.vence_en, dias: diasHasta(p.vence_en, hoy),
    });
  }
  for (const k of Object.keys(salida)) salida[k].sort((a, b) => (a.dias ?? 1e9) - (b.dias ?? 1e9));
  return salida;
}

/** «vence hoy», «venció hace 3 días», «vence en 5 días». */
export function textoDePlazo(dias) {
  if (dias === null || dias === undefined) return 'sin plazo';
  if (dias === 0) return 'vence hoy';
  if (dias < 0) return `venció hace ${-dias} día${dias === -1 ? '' : 's'}`;
  return `vence en ${dias} día${dias === 1 ? '' : 's'}`;
}
