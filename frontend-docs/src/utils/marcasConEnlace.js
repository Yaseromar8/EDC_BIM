/**
 * Marcas con enlace (16-oct-2026): FOTO en el plano, REFERENCIAS desde una marca, «CITADO EN» y SELLO.
 * Reglas puras, sin red ni React: las prueba pruebas/marcasConEnlace.prueba.mjs.
 * Estudio y decisiones: docs/ux/ACC_LECTOR_MARCAS_FOTO_REFERENCIA.md.
 */

// El sello es una NOTA sobre la hoja: NO cambia el estado del documento (eso va por Revisiones). Por eso sus
// estados son de revisión de campo y no «Aprobado». Los mismos códigos que el servidor (ESTADOS_DE_SELLO).
// El color codifica el estado (D-24: «color como dato»).
export const ESTADOS_DE_SELLO = [
  { codigo: 'revisado', etiqueta: 'Revisado', color: '#507294' },
  { codigo: 'conforme', etiqueta: 'Conforme', color: '#64744e' },
  { codigo: 'con_observaciones', etiqueta: 'Conforme con observaciones', color: '#734500' },
  { codigo: 'observado', etiqueta: 'Observado', color: '#b93535' },
];

export function estadoDeSello(codigo) {
  return ESTADOS_DE_SELLO.find(e => e.codigo === codigo) || ESTADOS_DE_SELLO[0];
}

// ── OBSERVACIÓN DE DOCUMENTO (20-oct-2026, migración 37) ─────────────────────────────────────────────
// La marca DIBUJA; lo que hay que corregir es una OBSERVACIÓN: una incidencia con responsable, quien verifica,
// fecha límite e historial. Sus estados son los ACTOS de la incidencia (flujo_de_issue.ESTADOS), dichos en
// femenino porque se habla de «la observación». Colores de la lista cerrada D-24.
// Estudio y decisión: docs/ux/MARCAS_REVISION_LO_PROFESIONAL.md (opción A).
export const ESTADOS_DE_OBSERVACION = [
  { codigo: 'Abierto',    etiqueta: 'Abierta',    color: '#d97757' },   // Orange: le toca al responsable
  { codigo: 'Reabierto',  etiqueta: 'Reabierta',  color: '#b93535' },   // Error: se rechazó la corrección
  { codigo: 'Corregido',  etiqueta: 'Corregida',  color: '#6a9bcc' },   // Blue: le toca a quien verifica
  { codigo: 'Verificado', etiqueta: 'Verificada', color: '#64744e' },   // cerrada
  { codigo: 'Anulado',    etiqueta: 'Anulada',    color: '#b0aea5' },   // cerrada sin defecto
];

export function estadoDeObservacion(codigo) {
  return ESTADOS_DE_OBSERVACION.find(e => e.codigo === codigo) || ESTADOS_DE_OBSERVACION[0];
}

export function observacionViva(obs) {
  return !!obs && ['Abierto', 'Reabierto', 'Corregido'].includes(obs.estado);
}

// Qué ACTOS puede hacer esta persona ahora. Lo decide el servidor; esto solo evita ofrecer botones que van a
// devolver 403. Corrige el responsable; verifica (o reabre) quien verifica; anula quien la levantó.
export function accionesDeObservacion(obs, usuarioId) {
  const yo = usuarioId == null ? null : String(usuarioId);
  const es = (id) => yo != null && id != null && String(id) === yo;
  const est = obs?.estado;
  return {
    corregir: es(obs?.responsable_id) && (est === 'Abierto' || est === 'Reabierto'),
    verificar: es(obs?.verificador_id) && !es(obs?.responsable_id) && est === 'Corregido',
    anular: es(obs?.autor_id ?? obs?.verificador_id) && (est === 'Abierto' || est === 'Reabierto'),
  };
}

// A quién le toca: lo que se lee en la tarjeta sin abrir nada.
export function aQuienLeToca(obs) {
  if (!obs) return '';
  if (obs.estado === 'Abierto' || obs.estado === 'Reabierto') return obs.responsable ? `Corregir: ${obs.responsable}` : 'Corregir';
  if (obs.estado === 'Corregido') return obs.verificador ? `Verificar: ${obs.verificador}` : 'Verificar';
  return 'Cerrada';
}

// La fecha límite que se propone: dentro de 7 días, en AAAA-MM-DD (lo que pide <input type="date">).
export function fechaLimitePorDefecto(hoy = new Date(), dias = 7) {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + dias);
  const dos = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
}

// «15 ene 2099» desde AAAA-MM-DD sin que la zona horaria la corra un día.
export function fechaDeDia(aaaammdd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(aaaammdd || ''));
  if (!m) return '';
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    .toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Una línea del historial, en palabras. Los comentarios se pintan aparte, con su texto.
const EVENTOS = {
  detected: 'Levantó la observación',
  corrected: 'La declaró corregida',
  verified: 'Verificó la corrección y la cerró',
  reopened: 'Rechazó la corrección y la reabrió',
  voided: 'La anuló',
  commented: 'Comentó',
  self_verify_allowed: 'Autorizó la autoverificación',
};
export function textoDelEvento(h) {
  return EVENTOS[h?.event] || 'Cambio';
}

// Las fotos se suben a la carpeta de medios de la obra (la misma que usa Multimedia): son DOCUMENTOS, con
// versión, permisos y auditoría, y la marca las cita.
export const CARPETA_DE_FOTOS = 'MULTIMEDIA/';
export const TOPE_FOTOS = 12;
export const TOPE_CITAS = 20;

const EXT_FOTO = /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i;
export function esFoto(nombre) {
  return EXT_FOTO.test(String(nombre || ''));
}

// Dos fotos del móvil se llaman igual («IMG_0001.jpg») y subir con el mismo nombre crearía una VERSIÓN de la
// otra. Se antepone el momento de la subida, que además ordena la carpeta por fecha.
export function nombreParaSubir(nombre, ahora = new Date()) {
  const dos = n => String(n).padStart(2, '0');
  const sello = `${ahora.getFullYear()}${dos(ahora.getMonth() + 1)}${dos(ahora.getDate())}`
    + `-${dos(ahora.getHours())}${dos(ahora.getMinutes())}${dos(ahora.getSeconds())}`;
  const limpio = String(nombre || 'foto.jpg').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'foto.jpg';
  return `${sello}_${limpio}`;
}

// Lo que se ve en la etiqueta de una marca con referencias.
export function textoDeCitas(n) {
  if (!n) return 'Sin referencias';
  return n === 1 ? '1 referencia' : `${n} referencias`;
}

// «Citado en»: agrupa por plano para decir «3 marcas en DR-803.pdf» y no repetir el plano.
export function citasPorPlano(citas) {
  const grupos = new Map();
  for (const c of citas || []) {
    const id = c?.plano?.id;
    if (!id) continue;
    if (!grupos.has(id)) grupos.set(id, { plano: c.plano, marcas: [] });
    grupos.get(id).marcas.push(c);
  }
  return [...grupos.values()];
}

// Lo que el panel dice de una cita según lo que el servidor deja ver.
export function etiquetaDeCita(c) {
  if (!c) return '';
  if (c.eliminado) return 'Documento eliminado';
  if (c.restringido) return 'Documento sin acceso para ti';
  return c.nombre || 'Documento';
}

// La dirección para abrir un documento en su pestaña, con la página y la marca a las que ir.
// `base` es la `search` de Archivos con obra y documento (conArchivos).
export function conMarca(base, { pagina, marca } = {}) {
  const p = new URLSearchParams(base || '');
  p.delete('pagina');
  p.delete('marca');
  if (Number(pagina) >= 1) p.set('pagina', String(Math.floor(Number(pagina))));
  if (marca != null && String(marca) !== '') p.set('marca', String(marca));
  const s = p.toString();
  return s ? `?${s}` : '';
}

// La página y la marca que pide la dirección al abrir (o null).
export function marcaDeLaDireccion(search) {
  const p = new URLSearchParams(search || '');
  const pagina = Number(p.get('pagina'));
  const marca = (p.get('marca') || '').trim();
  return {
    pagina: Number.isInteger(pagina) && pagina >= 1 ? pagina : null,
    marca: marca || null,
  };
}

// Orientación de la foto: el marcador apunta hacia donde se tomó. Se gira de 45° en 45° con la rueda o
// los botones, como una brújula de 8 rumbos.
export function siguienteAngulo(angulo, paso = 45) {
  const a = (Number(angulo) || 0) + paso;
  return ((a % 360) + 360) % 360;
}

// «16 oct 2026»: la fecha de una marca, corta.
export function fechaCorta(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}
