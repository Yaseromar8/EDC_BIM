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
  attached: 'Adjuntó',
  detached: 'Quitó un adjunto',
  edited: 'Editó la incidencia',
  // Las nubes (46): el historial de la incidencia cuenta cada paso de cada nube.
  cloud_assigned: 'Asignó una nube',
  cloud_delivered: 'Entregó en una nube',
  cloud_accepted: 'Aceptó lo entregado en una nube',
  cloud_returned: 'Devolvió una nube: faltaba algo',
  cloud_verified: 'Verificó una nube',
  cloud_created: 'Creó una nube de encargo',
};

// UN COLOR POR PERSONA EN CADA PLANO (3-nov-2026, docs/archivos/23). Diez tonos sobrios de la paleta, en el orden en
// que aparece cada persona o empresa en las nubes de la incidencia; la undécima repite desde el primero.
export const COLORES_DE_PERSONA = ['#507294', '#b93535', '#64744e', '#9e5943', '#2f6f6a', '#8a6d1f', '#3d4f66',
  '#7d5a3c', '#5b7f3a', '#6b6a65'];

// El servidor numera a cada persona o empresa en el plano (`color`: 0, 1, 2…): el mismo en la hoja y en el panel.
export const colorDeIndice = (k) => (k == null ? '#b0aea5' : COLORES_DE_PERSONA[k % COLORES_DE_PERSONA.length]);

export function colorDePersona(claves) {
  const orden = [];
  for (const c of claves || []) if (c != null && !orden.includes(c)) orden.push(c);
  return (clave) => {
    const k = orden.indexOf(clave);
    return k < 0 ? '#b0aea5' : COLORES_DE_PERSONA[k % COLORES_DE_PERSONA.length];
  };
}

const VERBO_DE_NUBE = {
  cloud_assigned: 'asignó', cloud_delivered: 'entregó en', cloud_accepted: 'aceptó lo entregado en',
  cloud_returned: 'devolvió',
};

// Una línea del historial en palabras: «edited» dice QUÉ cambió (reasignar, observadores, seguir, clasificación).
export function textoDeEvento(h, numeroDeNube = null) {
  if (!h) return '';
  if (/^cloud_/.test(h.event || '')) {
    const n = numeroDeNube ? numeroDeNube(h.nube) : null;
    const cual = n ? `la nube ${n}` : 'una nube';
    if (h.event === 'cloud_verified') return `dio ${cual} como ${h.estado === 'levantada' ? 'levantada' : 'no levantada'}`;
    if (h.event === 'cloud_created') return n ? `creó la nube de encargo ${n}` : 'creó una nube de encargo';
    const ronda = h.ronda > 1 ? ` (ronda ${h.ronda})` : '';
    return `${VERBO_DE_NUBE[h.event] || 'cambió'} ${cual}${h.event === 'cloud_returned' ? ': faltaba algo' : ''}${ronda}`;
  }
  if (h.event === 'edited') {
    const c = h.cambios || {};
    const partes = [];
    if (c.responsable) partes.push('la reasignó');
    if (c.observadores) partes.push('cambió los observadores');
    if (c.seguir != null) partes.push('empezó a seguirla');
    if (c.dejar_de_seguir != null) partes.push('dejó de seguirla');
    if (c.subtipo !== undefined || c.causa_raiz !== undefined || c.campos !== undefined) partes.push('cambió la clasificación');
    if (partes.length) return partes.join(', ');
  }
  if ((h.event === 'attached' || h.event === 'detached') && h.nombre) {
    return `${h.event === 'attached' ? 'adjuntó' : 'quitó'} ${h.nombre}`;
  }
  return (EVENTOS_DE_ISSUE[h.event] || h.event || '').replace(/^./, (x) => x.toLowerCase());
}

// LOS PASOS DE ESTADO desde el que tiene (el desplegable del estado, como ACC): a qué estado se pasa, con qué acto
// y quién lo da. El panel ofrece los que esta persona puede dar y enseña, apagados, los de otros con su nombre.
export function pasosDeEstado(i, { opcionales = null } = {}) {
  const usa = (c) => usaEstado(c, opcionales);
  switch (i?.estado) {
    case 'Borrador': return [{ a: 'Abierto', acto: 'enviar', quien: 'autor' }, { a: 'Anulado', acto: 'anular', quien: 'autor' }];
    case 'Abierto': case 'Reabierto': case 'En curso': return [
      ...(i.estado !== 'En curso' && usa('En curso') ? [{ a: 'En curso', acto: 'empezar', quien: 'responsable' }] : []),
      { a: 'Corregido', acto: 'corregir', quien: 'responsable' },
      ...(usa('En disputa') ? [{ a: 'En disputa', acto: 'disputar', quien: 'responsable' }] : []),
      { a: 'Anulado', acto: 'anular', quien: 'autor' },
    ];
    case 'En disputa': return [{ a: 'Abierto', acto: 'reafirmar', quien: 'autor' }, { a: 'Anulado', acto: 'anular', quien: 'autor' }];
    case 'Corregido': return [{ a: 'Verificado', acto: 'verificar', quien: 'verificador' }, { a: 'Reabierto', acto: 'reabrir', quien: 'verificador' }];
    default: return [];
  }
}
