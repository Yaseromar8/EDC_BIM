// frontend-docs/src/utils/revisiones.js
//
// Lo que la pantalla de Revisiones decide SIN servidor: el enlace de una revisión,
// cómo se llaman los estados, los papeles y los botones, cómo se cuenta el
// historial y qué se dice ante cada error. Todo puro, para probarlo sin navegador
// (`pruebas/revisiones.prueba.mjs`).
//
// LA AUTORIDAD NO ESTÁ AQUÍ. Qué puede hacer cada persona lo calcula el servidor
// con las mismas reglas que `/act` y llega en `revision.acciones`. Este módulo
// sólo le pone nombre a lo que el servidor ya decidió.

// Los mismos identificadores que `FILTROS_DEL_LISTADO` en backend/routes/reviews.py.
export const FILTROS = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'me_toca', etiqueta: 'Me toca' },
  { id: 'en_curso', etiqueta: 'En curso' },
  { id: 'bloqueadas', etiqueta: 'Bloqueadas' },
  { id: 'terminadas', etiqueta: 'Terminadas' },
  { id: 'iniciadas_por_mi', etiqueta: 'Iniciadas por mí' },
];

// Donde se guarda un enlace pendiente mientras se inicia sesión: el login puede
// limpiar la URL, y el enlace no tiene que perderse por eso.
export const CLAVE_DEL_ENLACE_PENDIENTE = 'ecd_enlace_revision';

// ── ENLACE DE UNA REVISIÓN: /?obra=<id de la obra>&revision=<id> ──────────────

export function leerEnlace(search) {
  const p = new URLSearchParams(search || '');
  const texto = (p.get('revision') || '').trim();
  if (!/^\d+$/.test(texto)) return null;
  const revision = Number(texto);
  if (!Number.isSafeInteger(revision) || revision < 1) return null;
  const obra = (p.get('obra') || '').trim();
  return { obra: obra || null, revision };
}

export function enlaceDeRevision(obra, revision, origen = '') {
  const p = new URLSearchParams();
  if (obra) p.set('obra', String(obra));
  p.set('revision', String(revision));
  return `${origen}/?${p.toString()}`;
}

// La `search` de la URL con la revisión abierta, o sin ella, conservando lo demás.
export function conRevision(search, obra, revision) {
  const p = new URLSearchParams(search || '');
  if (revision) {
    if (obra) p.set('obra', String(obra));
    p.set('revision', String(revision));
  } else {
    p.delete('revision');
    p.delete('obra');
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

// ATRÁS Y ADELANTE (E1.2 · H5). El navegador puede devolver a la dirección el enlace de
// una revisión estando en otra pantalla. Esto dice qué tiene que verse entonces, para
// que la dirección y la pantalla digan lo mismo:
//   · 'revisiones': la revisión es de la obra que se está viendo → su sección;
//   · 'enlace': es de otra obra, o no se está dentro de Documentos → se abre como un enlace;
//   · 'nada': la dirección no trae ninguna revisión.
export function destinoTrasNavegar(search, { enDocumentos = false, obraActual = null } = {}) {
  const enlace = leerEnlace(search);
  if (!enlace) return { tipo: 'nada' };
  const mismaObra = !enlace.obra
    || (obraActual != null && String(enlace.obra) === String(obraActual));
  if (enDocumentos && mismaObra) return { tipo: 'revisiones', revision: enlace.revision };
  if (enlace.obra) return { tipo: 'enlace', enlace };
  return { tipo: 'nada' };
}

// «A», «A y B», «A, B y C».
function enumerar(lista) {
  if (lista.length < 2) return lista.join('');
  return `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;
}

export function codigoDe(id) {
  return `RV-${String(id).padStart(3, '0')}`;
}

// ── ESTADOS, PAPELES Y BOTONES ──────────────────────────────────────────────────

export function chipDeEstado(rev) {
  if (rev?.status === 'pending' && rev?.flujo === 'BLOQUEADA') {
    return { etiqueta: 'Bloqueada', tono: 'peligro' };
  }
  if (rev?.status === 'approved') return { etiqueta: 'Aprobada', tono: 'exito' };
  if (rev?.status === 'rejected') return { etiqueta: 'Rechazada', tono: 'peligro' };
  return { etiqueta: 'En revisión', tono: 'aviso' };
}

// El papel lo DECLARA el paso. Una revisión PRE histórica puede no decirlo, y
// entonces no se inventa: sólo se dice si es el último.
export function papelDelPaso(paso) {
  if (paso?.decision === 'REVISA') return 'Revisa';
  if (paso?.decision === 'APRUEBA') return paso.terminal ? 'Aprueba y cierra' : 'Aprueba';
  return paso?.terminal ? 'Último paso' : 'Paso intermedio';
}

export const ESTADO_DEL_PASO = {
  hecho: 'Hecho',
  actual: 'En curso',
  rechazado: 'Rechazó',
  pendiente: 'Pendiente',
  no_alcanzado: 'No alcanzado',
};

export const DESTINO = { SHARED: 'Compartido', PUBLISHED: 'Publicado' };

const ESTADO_DEL_DOCUMENTO = {
  WIP: 'Trabajo en curso', SHARED: 'Compartido', PUBLISHED: 'Publicado', ARCHIVED: 'Archivado',
};

const BOTON_APROBAR = {
  conformidad: 'Dar conformidad',
  aprobar: 'Aprobar',
  aprobar_y_cerrar: 'Aprobar y cerrar',
};

export function botonAprobar(tipo) {
  return BOTON_APROBAR[tipo] || 'Aprobar';
}

export function consecuenciaDeAprobar(aprobar) {
  const datos = aprobar || {};
  const { tipo, siguiente_paso: siguiente, destino } = datos;
  if (tipo === 'aprobar_y_cerrar') {
    const a = DESTINO[destino] || destino || 'su estado final';
    // Lo que YA pasó con los documentos, dicho antes de confirmar (E1.2 · H7-A): otra
    // revisión pudo emitirlos, o cerrar esta puede devolver alguno atrás.
    const ya = datos.ya_en_destino || [];
    const atras = (datos.retroceden || []).map(r => (
      `${r.name} está en ${ESTADO_DEL_DOCUMENTO[r.estado] || r.estado} y volverá a ${a}`));
    let texto = datos.todos_en_destino
      ? `La revisión se cierra como aprobada. Los documentos ya están en ${a}, así que su estado no cambia.`
      : `La revisión se cierra como aprobada y los documentos pasan a ${a}.`;
    if (!datos.todos_en_destino && ya.length) {
      texto += ` ${enumerar(ya)} ya ${ya.length === 1 ? 'lo está' : 'lo están'}.`;
    }
    if (atras.length) texto += ` Atención: ${enumerar(atras)}.`;
    return `${texto} Antes se comprueban la versión, la autoridad sobre la carpeta y las reglas de emisión.`;
  }
  const hacia = siguiente ? ` al paso ${siguiente.numero} (${siguiente.persona})` : ' al paso siguiente';
  const que = tipo === 'conformidad' ? 'tu conformidad' : 'tu aprobación';
  return `Queda registrada ${que} y la revisión pasa${hacia}. Los documentos no cambian de estado.`;
}

// DOCUMENTOS QUE ESTÁN EN OTRA REVISIÓN EN CURSO (E1.2 · H7-A). El servidor solo manda
// las que esta persona puede abrir: las demás no se nombran.
export function avisoDeOtrasRevisiones(otras, { enElAlta = false } = {}) {
  const lista = (otras || []).filter(o => o && o.id);
  if (!lista.length) return '';
  const codigos = lista.map(o => o.codigo || codigoDe(o.id));
  return `${enElAlta ? 'Ya está' : 'También está'} en ${enumerar(codigos)}, en curso.`;
}

export const AVISO_DOCUMENTOS_EN_CURSO =
  'Cada documento tiene un solo estado: si esa otra revisión se cierra antes, cambiará el estado de lo que esta revisa.';

export const CONSECUENCIA_DE_RECHAZAR =
  'La revisión termina como rechazada. Los documentos no cambian de estado y la revisión no se puede reabrir.';

export function exitoDe(accion, tipo) {
  if (accion === 'reject') return 'Revisión rechazada';
  return {
    conformidad: 'Conformidad registrada',
    aprobar: 'Paso aprobado',
    aprobar_y_cerrar: 'Revisión aprobada y cerrada',
  }[tipo] || 'Acción registrada';
}

// ── HISTORIAL ──────────────────────────────────────────────────────────────────

const VERBO_EMITIDO = { CONFORME: 'dio su conformidad en', APRUEBA: 'aprobó', RECHAZA: 'rechazó en' };

function nombreDe(x) {
  if (!x) return '—';
  return x.name || x.email || (x.user_id ? `usuario ${x.user_id}` : '—');
}

// Un evento del historial contado en una frase. Las fechas se devuelven tal cual:
// las formatea la pantalla.
export function describirEvento(h) {
  const n = Number.isInteger(h?.step) ? h.step + 1 : '?';
  const quien = h?.by || 'Alguien';
  switch (h?.event) {
    case 'created':
      return { texto: `${quien} creó la revisión`, detalle: '', at: h.at, vence: null, tono: 'neutro' };
    case 'step_started':
      return { texto: `Empieza el paso ${n}: le toca a ${h.to || '—'}`, detalle: '', at: h.at,
               vence: h.due || null, tono: 'neutro' };
    case 'approve': {
      const verbo = VERBO_EMITIDO[h.emitido] || 'aprobó';
      return { texto: `${quien} ${verbo} el paso ${n}`, detalle: h.comment || '', at: h.at,
               vence: null, tono: h.emitido === 'CONFORME' ? 'neutro' : 'exito' };
    }
    case 'reject':
      return { texto: `${quien} rechazó la revisión en el paso ${n}`, detalle: h.comment || '',
               at: h.at, vence: null, tono: 'peligro' };
    case 'step_reassigned':
      return { texto: `${quien} sustituyó al revisor del paso ${n}: ${nombreDe(h.from)} → ${nombreDe(h.to)}`,
               detalle: h.reason ? `Motivo: ${h.reason}` : '', at: h.at, vence: null, tono: 'aviso' };
    default:
      return { texto: h?.event || 'Evento', detalle: '', at: h?.at, vence: null, tono: 'neutro' };
  }
}

// ── MENSAJES DE ERROR ──────────────────────────────────────────────────────────

// `recargar` dice si lo que se tiene en pantalla puede estar viejo y conviene
// volver a pedir la revisión.
export function mensajeDeError(status, cuerpo) {
  const texto = cuerpo?.error;
  const code = cuerpo?.code;
  if (!status) {
    return { texto: 'No se pudo conectar con el servidor. Revisa la conexión e inténtalo de nuevo.',
             recargar: false };
  }
  if (status === 409) {
    if (!texto || /^La revisión ya está/.test(texto)) {
      return { texto: 'Otra persona actuó antes: la revisión ya no está en curso. Se ha vuelto a cargar.',
               recargar: true };
    }
    return { texto, recargar: true };
  }
  if (code === 'SIN_PERMISO_DOCUMENTAL') {
    return { texto: texto || 'No tienes acceso a todos los documentos de esta revisión.', recargar: true };
  }
  if (status === 403) return { texto: texto || 'No puedes hacer esto en esta revisión.', recargar: true };
  if (status === 404) return { texto: texto || 'Esa revisión no existe.', recargar: false };
  return { texto: texto || 'No se pudo completar la acción.', recargar: false };
}
