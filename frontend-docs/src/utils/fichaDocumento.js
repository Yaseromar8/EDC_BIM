/**
 * fichaDocumento — las decisiones de la FICHA de un documento (paso 3, 14-oct-2026).
 *
 * Sin React ni DOM, para poder probarlas (`pruebas/fichaDocumento.prueba.mjs`):
 *   · una sola LÍNEA DE TIEMPO con todo lo que le pasó al documento: estados,
 *     versiones, revisiones, envíos, RFI y accesos, del más nuevo al más viejo;
 *   · los ACCESOS, uno por fila;
 *   · COMPROBAR UN ARCHIVO: su huella contra la de cada versión.
 *
 * Todo sale de la respuesta de `/api/docs/trazabilidad`. Lo que no venga no se
 * inventa: un evento del registro dice si está sellado; uno de otra tabla
 * (una revisión, un envío) no lo dice, y no se le pone.
 */

// ── Compartido con el panel de consulta (components/PanelConsulta.jsx) ──

// Fechas en dos medidas: corta bajo el recorrido («20 set.») y con hora, sin
// segundos, en los movimientos. Con la fecha completa de helpers el recorrido
// partía cada fecha en dos líneas.
export const CORTA = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' });
export const CON_HORA = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export const fecha = (f, fmt) => { const d = new Date(f); return isNaN(d) ? '' : fmt.format(d); };

export const RECORRIDO = [['WIP', 'WIP'], ['SHARED', 'Compartido'], ['PUBLISHED', 'Publicado'], ['ARCHIVED', 'Archivado']];


// Qué pasó, dicho en castellano. Lo que no se reconoce se enseña tal cual.
export function queOcurrio(ev) {
  const d = ev.detalle || {};
  switch (ev.accion) {
    case 'cambio_de_estado':
      return `${d.anterior_etiqueta || d.estado_anterior || '—'} → ${d.nuevo_etiqueta || d.estado_nuevo || '—'}`;
    case 'upload': case 'upload_file': return 'Subió una versión';
    case 'rename': return d.old_name ? `Renombrado (antes «${d.old_name}»)` : 'Renombrado';
    case 'move': return 'Desplazado';
    case 'acceso_a_documento': return d.version ? `Recibió acceso a la V${d.version}` : 'Recibió acceso';
    case 'reserva_documento': return 'Reservó para editar';
    case 'reserva_retirada': return d.forzada ? 'Reserva retirada (forzada)' : 'Reserva retirada';
    case 'delete': return 'Suprimido';
    case 'restore': return 'Restaurado';
    default: return ev.accion;
  }
}

/** Fecha de cada paso del recorrido: de las emisiones si el servidor las da, si no
 *  de los cambios de estado del registro. Los eventos llegan del más nuevo al más
 *  viejo, así que el primero que coincide es el último paso por ese estado. */
export function fechasDelRecorrido(datos) {
  const f = {};
  for (const e of [...(datos.emisiones || [])].reverse()) {
    if (e.destino && !f[e.destino]) f[e.destino] = e.cuando;
  }
  for (const ev of datos.eventos || []) {
    const n = ev.accion === 'cambio_de_estado' && ev.detalle && ev.detalle.estado_nuevo;
    if (n && !f[n]) f[n] = ev.cuando;
  }
  const vs = datos.versiones || [];
  if (!f.WIP && vs.length) f.WIP = vs[vs.length - 1].subida_en;
  return f;
}

export const TOPE_COMPROBAR = 1.5 * 1024 * 1024 * 1024;

export const FILTROS_LINEA = [
  ['todo', 'Todo'], ['estado', 'Estados'], ['version', 'Versiones'], ['revision', 'Revisiones'],
  ['envio', 'Envíos'], ['rfi', 'RFI'], ['acceso', 'Accesos'],
];

const ESTADO = { WIP: 'WIP', SHARED: 'Compartido', PUBLISHED: 'Publicado', ARCHIVED: 'Archivado' };
const SUBIDAS = new Set(['upload', 'upload_file', 'nueva_version', 'version_subida', 'promote_version']);

function delRegistro(ev) {
  const d = ev.detalle || {};
  const base = { cuando: ev.cuando, por: ev.por || 'Sistema', sellado: ev.sellado };
  switch (ev.accion) {
    case 'cambio_de_estado': {
      const de = d.anterior_etiqueta || ESTADO[d.estado_anterior] || d.estado_anterior || '—';
      const a = d.nuevo_etiqueta || ESTADO[d.estado_nuevo] || d.estado_nuevo || '—';
      const extra = [d.codigo_idoneidad && `idoneidad ${d.codigo_idoneidad}`, d.codigo_revision && `rev. ${d.codigo_revision}`,
        d.motivo && `motivo: ${d.motivo}`].filter(Boolean).join(' · ');
      return { ...base, tipo: 'estado', icono: 'revisiones', texto: `${de} → ${a}`, detalle: extra || null };
    }
    case 'acceso_a_documento':
      return { ...base, tipo: 'acceso', icono: 'descargar',
        texto: d.version ? `Recibió acceso a la V${d.version}` : 'Recibió acceso', detalle: d.via || null };
    case 'rename':
      return { ...base, tipo: 'otro', icono: 'archivos', texto: 'Renombrado', detalle: d.old_name ? `antes «${d.old_name}»` : null };
    case 'move': return { ...base, tipo: 'otro', icono: 'archivos', texto: 'Desplazado', detalle: null };
    case 'reserva_documento': return { ...base, tipo: 'otro', icono: 'configuracion', texto: 'Reservado para editar', detalle: null };
    case 'reserva_retirada':
      return { ...base, tipo: 'otro', icono: 'configuracion', texto: d.forzada ? 'Reserva retirada (forzada)' : 'Reserva retirada', detalle: null };
    case 'delete': case 'batch_delete': return { ...base, tipo: 'otro', icono: 'archivos', texto: 'Suprimido', detalle: null };
    case 'update_description': return { ...base, tipo: 'otro', icono: 'comentario', texto: 'Descripción cambiada', detalle: null };
    case 'vincular_compromiso':
      return { ...base, tipo: 'otro', icono: 'plan', texto: d.automatico ? 'Vinculado al plan de entregas (automático)' : 'Vinculado al plan de entregas', detalle: d.identificador || null };
    case 'desvincular_compromiso': return { ...base, tipo: 'otro', icono: 'plan', texto: 'Desvinculado del plan de entregas', detalle: null };
    case 'restore': return { ...base, tipo: 'otro', icono: 'archivos', texto: 'Restaurado', detalle: null };
    case 'comprobacion_integridad':
      return { ...base, tipo: 'otro', icono: 'triaje', texto: 'Comprobado contra un archivo', detalle: d.veredicto || null };
    default:
      if (SUBIDAS.has(ev.accion)) {
        return { ...base, tipo: 'version', icono: 'subir', texto: d.version ? `Subió la V${d.version}` : 'Subió una versión', detalle: null };
      }
      return { ...base, tipo: 'otro', icono: 'actividad', texto: ev.accion, detalle: null };
  }
}

/** Todo junto, del más nuevo al más viejo. */
export function lineaDeTiempo(datos) {
  const d = datos || {};
  const salida = (d.eventos || []).map(delRegistro);
  // Las versiones dicen cuándo se subió cada una aunque el registro de entonces no
  // lo anotara (subidas anteriores al registro por documento). Si el registro ya
  // trae una subida con esa versión, no se repite.
  const subidasAnotadas = new Set(salida.filter(e => e.tipo === 'version').map(e => e.texto));
  for (const v of d.versiones || []) {
    const texto = `Subió la V${v.version}`;
    if (!v.subida_en || subidasAnotadas.has(texto)) continue;
    salida.push({ tipo: 'version', icono: 'subir', cuando: v.subida_en, por: v.subida_por || '—',
      texto: v.version === 1 ? 'Creado · V1' : texto,
      detalle: [v.revision && `rev. ${v.revision}`, v.huella && `huella ${v.huella.slice(0, 8)}…`].filter(Boolean).join(' · ') || null });
  }
  const r = d.relacionados || {};
  for (const rv of r.revisiones || []) {
    const n = `RV-${String(rv.id).padStart(3, '0')}`;
    if (rv.creada_en) salida.push({ tipo: 'revision', icono: 'revisiones', cuando: rv.creada_en, por: '', texto: `Entró en la revisión ${n}`, detalle: rv.titulo || null });
    if (rv.cerrada_en) {
      const como = rv.estado === 'approved' ? 'aprobada' : rv.estado === 'rejected' ? 'rechazada' : 'cerrada';
      salida.push({ tipo: 'revision', icono: 'revisiones', cuando: rv.cerrada_en, por: '', texto: `Revisión ${n} ${como}`, detalle: rv.titulo || null });
    }
  }
  for (const t of r.envios || []) {
    salida.push({ tipo: 'envio', icono: 'transmittals', cuando: t.cuando, por: t.por || '',
      texto: `Enviado en TR-${String(t.numero).padStart(4, '0')}`,
      detalle: [t.asunto, t.acuses ? `${t.acuses} acuse${t.acuses === 1 ? '' : 's'} de recibo` : 'sin acuse'].filter(Boolean).join(' · ') });
  }
  for (const q of r.rfis || []) {
    salida.push({ tipo: 'rfi', icono: 'rfi', cuando: q.fecha, por: '', texto: `Adjunto en ${q.codigo}`,
      detalle: [q.titulo, q.estado].filter(Boolean).join(' · ') || null });
  }
  const t = (x) => { const v = new Date(x.cuando || 0).getTime(); return Number.isFinite(v) ? v : 0; };
  return salida.sort((a, b) => t(b) - t(a));
}

/** Los accesos del registro, uno por fila. Los denegados se dicen como tales. */
export function accesosDe(datos) {
  return ((datos && datos.eventos) || [])
    .filter(e => e.accion === 'acceso_a_documento')
    .map(e => {
      const d = e.detalle || {};
      return { cuando: e.cuando, por: e.por || 'Sistema', version: d.version ?? null, via: d.via || null,
        denegado: /^DENEGADO/i.test(String(d.via || '')) };
    });
}

/**
 * ¿Coincide una huella con alguna versión? Devuelve
 *   { huella, coincide, version, esVigente, conHuella, sinHuella }.
 * `versiones` llega de la más nueva a la más vieja (la primera es la vigente).
 */
export function comprobarHuella(huella, versiones) {
  const h = String(huella || '').toLowerCase();
  const vs = versiones || [];
  const conHuella = vs.filter(v => v.huella).length;
  const i = vs.findIndex(v => v.huella && String(v.huella).toLowerCase() === h);
  return {
    huella: h, coincide: i >= 0, version: i >= 0 ? vs[i] : null, esVigente: i === 0,
    conHuella, sinHuella: vs.length - conHuella,
  };
}
