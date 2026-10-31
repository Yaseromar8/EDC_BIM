/**
 * El registro de la tarjeta de documento para el Lienzo (design/lienzo/Lienzo.jsx, `tipos`): pieza, barra, doble
 * clic, buscar y pegar. Recibe `abrir(el)`, que sabe llevar al documento en Archivos.
 */
import { createElement } from 'react';
import { TarjetaDocumento, BarraDocumento } from './TarjetaDocumento';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const texto = (v, max = 400) => (typeof v === 'string' ? v.slice(0, max) : '');

export function tipoDocumento({ abrir }) {
  return {
    Pieza: TarjetaDocumento,
    redimensionable: true,
    proporcion: true,
    minimo: [180, 140],
    etiqueta: 'Documento',
    texto: (el) => el.nombre,
    alDobleClic: (el) => abrir(el),
    barra: (el, { actualizar }) => createElement(BarraDocumento, { el, actualizar, abrir }),
    // Al pegar (de otro tablero o de otra pestaña): solo lo que una tarjeta de documento necesita, y válido.
    limpiar: (n) => (UUID.test(String(n.nodeId || '')) ? {
      nodeId: n.nodeId,
      versionId: UUID.test(String(n.versionId || '')) ? n.versionId : null,
      version: Number.isInteger(n.version) ? n.version : null,
      parentId: UUID.test(String(n.parentId || '')) ? n.parentId : null,
      nombre: texto(n.nombre) || 'Documento',
      ext: texto(n.ext, 10).toLowerCase(),
    } : null),
  };
}
