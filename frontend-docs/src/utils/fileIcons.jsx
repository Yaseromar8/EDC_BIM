/**
 * fileIcons.jsx — iconos de archivo de ALEPHIA (estilo B, 13-oct-2026)
 *
 * POR QUÉ SE REHICIERON
 * Los anteriores no eran nuestros: los de Excel, Word y PowerPoint se cargaban
 * DESDE EL SERVIDOR DE MICROSOFT (res.cdn.office.net) -- sus iconos oficiales,
 * y una dependencia ajena: sin ese servidor, sin icono --, y los de DWG y Revit
 * imitaban los de Autodesk (página azul con cruceta cian y cinta amarilla; la
 * «R» blanca). El propietario eligió el estilo B de la hoja
 * docs/ux/maquetas/iconos_alephia_v1.html: formas sólidas y geométricas.
 *
 * EL SISTEMA
 * Una sola forma para todos: la página rellena del color de su FAMILIA, con la
 * esquina doblada en claro y la EXTENSIÓN escrita en blanco. El tipo se
 * reconoce por la extensión, no por imitar el logo de otro programa. Los
 * colores son variables de index.css (`--archivo-*`), así que cambiarlos es
 * cambiar una línea.
 *
 * La firma no cambia: `renderFileIconSop(nombre, tamaño)` sigue devolviendo un
 * bloque del tamaño pedido, y todos los sitios que lo usan (tabla, cuadrícula,
 * subida, versiones, papelera, cuarentena) cambian a la vez.
 */
import React from 'react';

const FAMILIAS = [
  ['pdf', ['pdf']],
  ['cad', ['dwg', 'dxf', 'dwf', 'dwfx', 'dgn']],
  ['bim', ['rvt', 'rfa', 'rte', 'nwd', 'nwc', 'ifc']],
  ['3d', ['3dm', 'stl', 'obj', 'fbx', 'step', 'stp', 'iges', 'igs', 'sat', 'skp', 'glb', 'gltf']],
  ['hoja', ['xls', 'xlsx', 'xlsm', 'csv']],
  ['texto', ['doc', 'docx', 'txt', 'rtf', 'odt', 'md']],
  ['pres', ['ppt', 'pptx', 'odp']],
  ['imagen', ['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif', 'tif', 'tiff', 'bmp', 'heic', 'ecw']],
  ['video', ['mp4', 'mov', 'avi', 'mkv', 'webm']],
  ['comprimido', ['zip', 'rar', '7z', 'tar', 'gz']],
];
const FAMILIA_DE = Object.fromEntries(FAMILIAS.flatMap(([f, exts]) => exts.map(e => [e, f])));

/** Compatibilidad: algunos sitios preguntaban el «tipo» y un color. */
export function getSopFileIcon(filename) {
  const ext = (filename || '').split('.').pop().toLowerCase();
  const familia = FAMILIA_DE[ext] || 'otro';
  return { color: `var(--archivo-${familia})`, type: familia };
}

export function renderFileIconSop(filename, size = 24) {
  const nombre = (filename || '').toLowerCase();
  const tieneExt = nombre.includes('.');
  const ext = tieneExt ? nombre.split('.').pop() : '';
  const familia = FAMILIA_DE[ext] || 'otro';
  // Hasta cuatro letras caben; una extensión rara y larga se recorta.
  const rotulo = (ext || 'arch').slice(0, 4).toUpperCase();
  const letra = rotulo.length > 3 ? 7.4 : 8.8;
  return (
    <div style={{ width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">
        <path fill={`var(--archivo-${familia})`} d="M5 1.5h15.5l7 7v22H5z" />
        <path fill="white" opacity=".38" d="M20.5 1.5v7h7z" />
        <text x="16.25" y="25.2" textAnchor="middle" fontSize={letra} fontWeight="700"
          fontFamily="Inter, system-ui, sans-serif" letterSpacing=".2" fill="white">
          {rotulo}
        </text>
      </svg>
    </div>
  );
}
