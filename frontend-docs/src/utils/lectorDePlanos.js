/**
 * lectorDePlanos.js — lo que el lector de planos decide SIN red (paso 3 de
 * docs/ux/PROCORE_*: «selector de versión y ‹ ›», como el visor de Procore).
 *
 * 1. EL CHIP DE VERSIÓN dice lo que Procore dice: «V2 · P02 · Compartido».
 *    - La revisión es la de la versión que se mira (las anteriores traen la
 *      suya desde /api/docs/versions).
 *    - El estado ISO es del DOCUMENTO: solo se pone si se mira la versión
 *      vigente. De una anterior se dice «versión anterior»; ponerle «Publicado»
 *      la haría pasar por vigente.
 *
 * 2. ‹ › Y LA TIRA SIGUEN A LO QUE SE ESTÁ MIRANDO. Abierto desde una vista
 *    («Me toca revisar», «Publicados»…), el siguiente es el siguiente DE LA
 *    VISTA. Antes era el de la carpeta abierta, y desde una vista de toda la
 *    obra el plano ni siquiera estaba en esa lista: ‹ › no hacía nada.
 *
 * Puro: lo prueba pruebas/lectorDePlanos.prueba.mjs.
 */

import { piezasDelCodigo } from './codigoDelNombre.js';

const ES_PDF = /\.pdfx?$/i;

/** Los documentos por los que se mueve el lector (‹ › y la tira). */
export function hermanosDelLector({ enVista = false, filasDeVista = [], archivos = [] } = {}) {
  const lista = enVista ? (filasDeVista || []) : (archivos || []);
  return lista.filter(f => f && ES_PDF.test(f.name || ''));
}

/**
 * El texto del chip. `vv` = versión que se mira (o la primera del historial),
 * `actual` = número de la versión vigente, `etiquetaDeEstado(codigo)` = la
 * etiqueta del estado ISO (la pone quien llama, para no atar esto a React).
 */
export function chipDeVersion({ vv = null, file = {}, actual = null, etiquetaDeEstado = () => '' } = {}) {
  const vigente = actual || file.version || null;
  const n = (vv && vv.version_number) || file.version || 1;
  const esVigente = !vv || !vigente || n === vigente;
  const revision = (vv && vv.codigo_revision) || (esVigente ? file.codigo_revision : null) || null;
  const estado = esVigente ? (etiquetaDeEstado(file.status) || '') : 'versión anterior';
  const partes = [`V${n}`, revision, estado].filter(Boolean);
  return {
    texto: partes.join(' · '),
    esVigente,
    titulo: esVigente
      ? 'Versión vigente. Pulsa para ver el historial de versiones.'
      : `Estás viendo la V${n}, no la vigente (V${vigente}). Pulsa para cambiar de versión.`,
  };
}

// ── 3. LA BANDA DE VERDAD (docs/ux/LECTOR_IDENTIDAD_PROPIA.md) ─────────────────
// Lo propio del lector: el plano dice, siempre a la vista, si es la versión
// vigente, para qué sirve y si su archivo está registrado. Y una versión
// anterior lo dice ENCIMA («SUSTITUIDA»), para que nadie construya con ella.

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «10-oct-2026». Sin hora: en obra la fecha basta. */
export function fechaCorta(iso) {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}-${MESES[d.getMonth()]}-${d.getFullYear()}`;
}

// Para qué sirve, cuando el documento no trae código de idoneidad.
const USO_POR_ESTADO = {
  WIP: 'no emitido · puede cambiar sin avisar',
  SHARED: 'para revisión y coordinación · no es para construir',
  PUBLISHED: 'autorizado para el uso de su código',
  ARCHIVED: 'registro histórico',
};

/**
 * Lo que dice la banda. `vv` = versión que se mira; `historial` = /api/docs/versions
 * (de la más nueva a la más vieja); `etiquetaDeEstado(c)` y `fraseDeIdoneidad(c)`
 * los pone quien llama. Devuelve `null` si no hay nada que decir todavía.
 */
export function verdadDelPlano({ vv = null, file = {}, historial = [], etiquetaDeEstado = () => '',
                                 fraseDeIdoneidad = () => '' } = {}) {
  const lista = Array.isArray(historial) ? historial : [];
  const vigente = (lista[0] && lista[0].version_number) || file.version || null;
  const n = (vv && vv.version_number) || vigente || 1;
  if (!vigente) return null;

  if (n !== vigente) {
    // La que la sustituyó es la siguiente; su fecha es la de la sustitución.
    const sig = lista.filter(v => v.version_number > n)
      .sort((a, b) => a.version_number - b.version_number)[0] || lista[0] || null;
    const numSig = (sig && sig.version_number) || vigente;
    const cuando = fechaCorta(sig && sig.updated);
    return {
      tipo: 'anterior',
      sustituta: numSig,
      cuando,
      aviso: `V${n} · sustituida${cuando ? ` el ${cuando}` : ''} por V${numSig}.`,
      consejo: 'No construyas con esta versión.',
      boton: `Ir a la vigente (V${vigente})`,
      sello: { titulo: 'SUSTITUIDA', detalle: `por V${numSig}${cuando ? ` el ${cuando}` : ''}` },
    };
  }

  const estado = String(file.status || '').toUpperCase();
  const archivado = estado === 'ARCHIVED';
  const codigo = file.codigo_idoneidad || null;
  const total = lista.length || vigente;
  const huella = (vv && vv.sha256) || (lista[0] && lista[0].sha256) || null;
  return {
    tipo: 'vigente',
    vigencia: archivado
      ? { titulo: 'Archivado', detalle: 'registro histórico', tono: 'aviso' }
      : { titulo: 'Versión vigente', detalle: `V${n} de ${total}`, tono: 'bien' },
    uso: codigo
      ? { codigo, titulo: fraseDeIdoneidad(codigo) || codigo, detalle: etiquetaDeEstado(estado) || '' }
      : { codigo: null, titulo: etiquetaDeEstado(estado) || 'Sin estado', detalle: USO_POR_ESTADO[estado] || '' },
    // Con el historial aún sin llegar no se sabe: no se dice nada (ni «registrada» ni «sin huella»).
    huella: !lista.length ? null : huella
      ? { titulo: 'Huella registrada', detalle: `${huella.slice(0, 4)}…${huella.slice(-4)}`, completa: huella }
      : { titulo: 'Sin huella', detalle: 'se subió antes del registro de huellas', completa: null },
  };
}

// ── 4. EL CAJETÍN COMÚN (docs/ux/LECTOR_ALEPHIA_ESTANDAR.md, LDA-1 §3 y §15) ────────────────
// Un solo lector para planos y documentos. La cabecera es un cajetín: casillas con su rótulo,
// iguales en los dos modos. Lo que dice cada casilla se decide aquí, sin red.

// LOS MODOS DE LECTURA (ESTANDAR_LDA.md §5): el FORMATO limita qué modos son posibles (un RVT no se
// lee como texto) y, entre ellos, elige el TIPO del código (Guía Nacional BIM, convención del UK BIM
// Framework); si el código no lo dice, decide la forma de la hoja o el modo por defecto del formato.
const POSIBLES = [
  [/\.pdfx?$/i,                                   ['plano', 'documento']],
  [/\.(dwg|dxf|dwf|dwfx|dgn)$/i,                  ['plano', 'modelo']],
  [/\.(rvt|rfa|ifc|nwd|nwc|3dm|sat|step|stp|iges|igs|obj|fbx|stl)$/i, ['modelo']],
  [/\.(xlsx|xlsm|xls|ods|csv)$/i,                 ['tabla']],
  [/\.(docx?|odt|rtf|txt|pptx?|odp)$/i,           ['documento']],
  [/\.(jpe?g|png|gif|webp|heic|bmp|tiff?|mp4|webm|ogg|mov)$/i, ['imagen']],
];
const MODO_DEL_TIPO = { DR: 'plano', M2: 'plano', M3: 'modelo', MS: 'modelo', SH: 'tabla', VS: 'imagen', PH: 'imagen' };

export const ROTULO_DEL_MODO = {
  plano: 'Plano', documento: 'Documento', tabla: 'Planilla', modelo: 'Modelo', imagen: 'Imagen', archivo: 'Archivo',
};

/** 'plano' | 'documento' | 'tabla' | 'modelo' | 'imagen' | 'archivo'. `apaisada`: la primera hoja es más ancha que alta. */
export function modoDelDocumento({ nombre = '', apaisada = null } = {}) {
  const posibles = (POSIBLES.find(([re]) => re.test(nombre)) || [null, ['archivo']])[1];
  if (posibles.length === 1) return posibles[0];
  const piezas = piezasDelCodigo(nombre);
  const delCodigo = piezas && MODO_DEL_TIPO[piezas.tipo.toUpperCase()];
  if (delCodigo && posibles.includes(delCodigo)) return delCodigo;
  if (piezas && posibles.includes('documento') && !delCodigo) return 'documento';
  if (posibles.includes('documento')) return apaisada ? 'plano' : 'documento';
  return posibles[0];
}

/** El título del documento, si la obra lo guarda en sus atributos. Nunca se inventa. */
function tituloDe(file = {}) {
  const m = file.metadata || {};
  return m.titulo || m.Titulo || m.TITULO || m.title || m.Title || '';
}

/**
 * Las casillas del cajetín. Mismos argumentos que `verdadDelPlano`, más `modo`.
 * Cada casilla: { rotulo, valor, detalle } (+ extras). Sin dato, «—» (R-C3: la forma no cambia).
 */
export function cajetinDelDocumento({ vv = null, file = {}, historial = [], modo = 'documento',
                                      etiquetaDeEstado = () => '', fraseDeIdoneidad = () => '' } = {}) {
  const lista = Array.isArray(historial) ? historial : [];
  const nombre = file.name || '';
  const codigo = nombre.replace(/\.[^.]+$/, '');
  const piezas = piezasDelCodigo(nombre);
  const titulo = tituloDe(file);
  const verdad = verdadDelPlano({ vv, file, historial: lista, etiquetaDeEstado, fraseDeIdoneidad });
  const vigente = (lista[0] && lista[0].version_number) || file.version || null;
  const n = (vv && vv.version_number) || vigente || 1;
  const esVigente = !vigente || n === vigente;
  const revision = (vv && vv.codigo_revision) || (esVigente ? file.codigo_revision : null) || null;
  const cuando = fechaCorta((vv && vv.updated) || (esVigente ? file.updated : null));
  const quien = (vv && vv.updated_by) || '';
  const estado = String(file.status || '').toUpperCase();
  const idon = file.codigo_idoneidad || null;

  // EL CONMUTADOR [Vigente | Anterior] de la casilla Vigencia: «Anterior» es la versión a la que
  // sustituyó la vigente (la segunda del historial). Solo si hay al menos dos versiones.
  const alternar = lista.length >= 2 && lista[1] && lista[1].version_number
    ? { vigente: vigente, anterior: lista[1].version_number, enVigente: esVigente,
        enAnterior: n === lista[1].version_number }
    : null;

  return {
    modo,
    alternar,
    documento: {
      rotulo: ROTULO_DEL_MODO[modo] || 'Documento',
      valor: codigo || '—',
      detalle: [titulo, piezas ? `Tipo ${piezas.tipo} · Disciplina ${piezas.disciplina}` : ''].filter(Boolean).join(' · ') || '—',
    },
    version: {
      rotulo: 'Versión · rev.',
      valor: [`V${n}`, revision].filter(Boolean).join(' · '),
      detalle: [cuando, quien].filter(Boolean).join(' · ') || '—',
      aviso: !esVigente,
    },
    // R-C1: el estado y la idoneidad son del DOCUMENTO; en una versión anterior no se pintan.
    estado: esVigente
      ? { rotulo: 'Estado', valor: etiquetaDeEstado(estado) || '—', detalle: USO_POR_ESTADO[estado] || '' }
      : { rotulo: 'Estado', valor: '—', detalle: 'de la versión vigente' },
    idoneidad: esVigente && idon
      ? { rotulo: 'Idoneidad', codigo: idon, valor: fraseDeIdoneidad(idon) || '(sin descripción)', detalle: '' }
      : { rotulo: 'Idoneidad', codigo: null, valor: '—', detalle: esVigente ? 'sin código' : 'de la versión vigente' },
    vigencia: !verdad ? { rotulo: 'Vigencia', valor: '—', detalle: '', tono: null }
      : verdad.tipo === 'anterior'
        ? { rotulo: 'Vigencia', valor: `Sustituida por V${verdad.sustituta}`,
            detalle: [verdad.cuando ? `el ${verdad.cuando}` : '', 'no la uses'].filter(Boolean).join(' · '),
            tono: 'aviso', boton: verdad.boton,
            sello: verdad.sello }
        : { rotulo: 'Vigencia', valor: `${verdad.vigencia.titulo === 'Archivado' ? 'Archivado' : 'Vigente'} · ${verdad.vigencia.detalle}`,
            detalle: verdad.huella ? (verdad.huella.completa ? `huella ${verdad.huella.detalle} registrada` : verdad.huella.titulo.toLowerCase()) : '',
            huella: verdad.huella && verdad.huella.completa, tono: verdad.vigencia.tono },
  };
}

/**
 * El ÍNDICE del documento a partir de los marcadores del PDF (pdf.js `getOutline`). `paginaDe(dest)`
 * resuelve el destino a un número de página (1…n) o null. Devuelve [{ titulo, nivel, pagina }].
 */
export async function aplanarIndice(items, paginaDe, nivel = 0, tope = 400) {
  const salida = [];
  for (const it of items || []) {
    if (salida.length >= tope) break;
    let pagina = null;
    try { pagina = await paginaDe(it.dest); } catch { pagina = null; }
    salida.push({ titulo: String(it.title || '').trim() || '(sin título)', nivel, pagina });
    if (it.items && it.items.length && nivel < 3) {
      salida.push(...await aplanarIndice(it.items, paginaDe, nivel + 1, tope - salida.length));
    }
  }
  return salida;
}

