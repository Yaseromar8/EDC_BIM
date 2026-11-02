/**
 * Los estados de una incidencia (migración 45, docs/archivos/18 §3): los de ACC, en español.
 * Los CÓDIGOS son los que guarda el servidor (`flujo_de_issue.ESTADOS`) y no cambian; lo que se lee es la ETIQUETA.
 * Una sola lista para TODAS las herramientas (docs/archivos/19): Docs (lector, Issues y punch, tableros, planos,
 * revisiones…) y View. Vive en design/ porque las dos aplicaciones la comparten, como el lienzo de los tableros.
 * Reglas puras, sin red ni React: las prueba frontend-docs/pruebas/estadosDeIssue.prueba.mjs.
 */

// En el orden del flujo. Colores de la lista cerrada D-24 («color como dato»).
export const ESTADOS_DE_ISSUE = [
  { codigo: 'Borrador',   etiqueta: 'Borrador',    color: '#72706b', vivo: false },  // solo la ve quien la levanta
  { codigo: 'Abierto',    etiqueta: 'Abierta',     color: '#d97757', vivo: true },   // le toca al responsable
  { codigo: 'En curso',   etiqueta: 'En curso',    color: '#507294', vivo: true },   // el responsable ya está en ello
  { codigo: 'En disputa', etiqueta: 'En disputa',  color: '#734500', vivo: true },   // decide quien la levantó
  { codigo: 'Corregido',  etiqueta: 'En revisión', color: '#6a9bcc', vivo: true },   // le toca a quien verifica
  { codigo: 'Reabierto',  etiqueta: 'No aprobada', color: '#b93535', vivo: true },   // se rechazó la corrección
  { codigo: 'Verificado', etiqueta: 'Cerrada',     color: '#64744e', vivo: false },
  { codigo: 'Anulado',    etiqueta: 'Anulada',     color: '#b0aea5', vivo: false },  // cerrada sin defecto
];

// Los que el administrador de cada obra puede apagar, como en ACC. Sin configurar: todos encendidos.
export const OPCIONALES = ['Borrador', 'En curso', 'En disputa'];

export const CODIGOS_VIVOS = ESTADOS_DE_ISSUE.filter(e => e.vivo).map(e => e.codigo);

export function estadoDeIssue(codigo) {
  return ESTADOS_DE_ISSUE.find(e => e.codigo === codigo)
    || { codigo, etiqueta: codigo || '', color: '#72706b', vivo: false };
}

export function issueViva(i) {
  return !!i && CODIGOS_VIVOS.includes(i.estado);
}

// Ese estado opcional, ¿lo usa la obra? `opcionales` = los encendidos (null: todos).
export function usaEstado(codigo, opcionales) {
  return !OPCIONALES.includes(codigo) || opcionales == null || opcionales.includes(codigo);
}

// Qué ACTOS puede hacer esta persona ahora. Lo decide el servidor; esto solo evita ofrecer botones que van a devolver
// 403. Responsable: empezar, corregir o decir que no procede. Quien la levantó: enviar el borrador, reafirmar o anular.
// Verificar va aparte (puede autorizarse la autoverificación): `puedeVerificar`.
// Asignada a una EMPRESA (migración 45): es responsable cualquiera de ella (`miEmpresa`, de los miembros de la obra).
export function esDelResponsable(i, usuarioId, miEmpresa = null) {
  if (usuarioId == null || !i) return false;
  if (i.responsable_id != null) return String(i.responsable_id) === String(usuarioId);
  return i.responsable_empresa != null && miEmpresa != null && String(i.responsable_empresa) === String(miEmpresa);
}

export function actosDeIssue(i, usuarioId, { opcionales = null, esAdmin = false, miEmpresa = null } = {}) {
  const yo = usuarioId == null ? null : String(usuarioId);
  const es = (id) => yo != null && id != null && String(id) === yo;
  const est = i?.estado;
  const responsable = esDelResponsable(i, usuarioId, miEmpresa);
  const autor = es(i?.autor_id);
  const enSusManos = ['Abierto', 'En curso', 'Reabierto'].includes(est);
  return {
    enviar: autor && est === 'Borrador',
    empezar: responsable && (est === 'Abierto' || est === 'Reabierto') && usaEstado('En curso', opcionales),
    corregir: responsable && enSusManos,
    disputar: responsable && enSusManos && usaEstado('En disputa', opcionales),
    reafirmar: (autor || esAdmin) && est === 'En disputa',
    anular: (autor || esAdmin) && ['Borrador', 'Abierto', 'En curso', 'En disputa', 'Reabierto'].includes(est),
  };
}

// El espejo de `flujo_de_issue.puede_verificar`: si diverge, el servidor gana.
export function puedeVerificar(i, usuarioId, esAdmin = false, miEmpresa = null) {
  if (!i || i.estado !== 'Corregido' || usuarioId == null) return false;
  const yo = String(usuarioId);
  if (esDelResponsable(i, usuarioId, miEmpresa)) return !!i.autoverificacion;
  if (i.verificador_id != null) return String(i.verificador_id) === yo;
  return !!esAdmin;
}

// A quién le toca, en palabras: lo que se lee en la tarjeta sin abrir nada.
export function aQuienLeTocaIssue(i, { responsable, verificador, autor } = {}) {
  if (!i) return '';
  const r = responsable ?? i.responsable;
  const v = verificador ?? i.verificador;
  const a = autor ?? i.autor;
  switch (i.estado) {
    case 'Borrador': return 'Sin enviar';
    case 'Abierto': case 'Reabierto': return r ? `Corregir: ${r}` : 'Corregir';
    case 'En curso': return r ? `Corrigiendo: ${r}` : 'Corrigiendo';
    case 'En disputa': return a ? `Decide: ${a}` : 'Decide quien la levantó';
    case 'Corregido': return v ? `Verificar: ${v}` : 'Verificar';
    default: return 'Cerrada';
  }
}

// Los eventos del historial (`flujo_de_registro.entrada`), en palabras. Se traducen al LEER.
export const EVENTOS_DE_ISSUE = {
  detected: 'Levantada',
  sent: 'Enviada',
  started: 'En curso',
  disputed: 'No procede, según el responsable',
  reaffirmed: 'Reafirmada: vuelve al responsable',
  corrected: 'Declarada corregida',
  verified: 'Verificada y cerrada',
  reopened: 'No aprobada: vuelve al responsable',
  voided: 'Anulada',
  self_verification_allowed: 'Autoverificación autorizada',
};
