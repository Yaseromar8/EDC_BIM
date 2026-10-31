/**
 * El registro de la tarjeta de documento para el Lienzo (design/lienzo/Lienzo.jsx, `tipos`): pieza, barra, doble
 * clic, buscar y pegar. Recibe `abrir(el)`, que sabe llevar al documento en Archivos.
 */
import { createElement } from 'react';
import { TarjetaDocumento, BarraDocumento } from './TarjetaDocumento';
import { META_POR_OMISION } from './documentos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FECHA = /^\d{4}-\d{2}-\d{2}T[\d:.+\-Z]{2,40}$/;
const texto = (v, max = 400) => (typeof v === 'string' ? v.slice(0, max) : '');

export function tipoDocumento({ abrir, extraer }) {
  return {
    Pieza: TarjetaDocumento,
    redimensionable: true,
    proporcion: true,
    minimo: [180, 140],
    etiqueta: 'Documento',
    texto: (el) => (el.pagina > 1 ? `${el.nombre} · hoja ${el.pagina}` : el.nombre),
    alDobleClic: (el) => abrir(el),
    barra: (el, { actualizar }) => createElement(BarraDocumento, { el, actualizar, abrir, extraer }),
    // Al pegar (de otro tablero o de otra pestaña): solo lo que una tarjeta de documento necesita, y válido.
    limpiar: (n) => (UUID.test(String(n.nodeId || '')) ? {
      nodeId: n.nodeId,
      versionId: UUID.test(String(n.versionId || '')) ? n.versionId : null,
      version: Number.isInteger(n.version) ? n.version : null,
      parentId: UUID.test(String(n.parentId || '')) ? n.parentId : null,
      nombre: texto(n.nombre) || 'Documento',
      ext: texto(n.ext, 10).toLowerCase(),
      ...(Number.isInteger(n.pagina) && n.pagina > 1 && n.pagina <= 100000 ? { pagina: n.pagina } : {}),
      fecha: FECHA.test(String(n.fecha || '')) ? n.fecha : null,
      ar: Number.isFinite(n.ar) && n.ar > 0.05 && n.ar < 20 ? n.ar : null,
      sombra: n.sombra !== false,
      meta: Object.fromEntries(Object.keys(META_POR_OMISION).map(k => [k, typeof n.meta?.[k] === 'boolean' ? n.meta[k] : META_POR_OMISION[k]])),
    } : null),
  };
}
