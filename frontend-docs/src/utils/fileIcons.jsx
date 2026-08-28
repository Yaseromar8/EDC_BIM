/**
 * fileIcons.jsx — Motor de íconos SVG de archivos estilo ACC
 * Refactorización Fase 1: Capa de Datos
 * Extraído de App.jsx líneas 1354-1465
 */
import React from 'react';

export function getSopFileIcon(filename) {
  if (!filename) return { color: '#888', type: 'file' };
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'pdf') return { color: '#5C7896', type: 'pdf' };
  if (['doc', 'docx'].includes(ext)) return { color: '#2b579a', type: 'word' };
  if (['xls', 'xlsx', 'csv'].includes(ext)) return { color: '#217346', type: 'excel' };
  if (['ppt', 'pptx'].includes(ext)) return { color: '#d24726', type: 'ppt' };
  if (['jpg', 'jpeg', 'png', 'svg', 'webp', 'gif'].includes(ext)) return { color: '#5C7896', type: 'image' };
  if (ext === 'txt') return { color: '#5C7896', type: 'txt' };
  return { color: '#5C7896', type: 'file' };
}

export function renderFileIconSop(filename, size = 24) {
  const { type } = getSopFileIcon(filename);
  const lowerName = filename?.toLowerCase() || '';

  // EXCEL
  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src="https://res.cdn.office.net/files/fabric-cdn-prod_20251107.003/assets/item-types/16_1.5x/xlsx.svg" style={{ width: '100%', height: '100%' }} alt="xlsx" />
      </div>
    );
  }

  // WORD
  if (lowerName.endsWith('.docx') || lowerName.endsWith('.doc')) {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src="https://res.cdn.office.net/files/fabric-cdn-prod_20251107.003/assets/item-types/16_1.5x/docx.svg" style={{ width: '100%', height: '100%' }} alt="docx" />
      </div>
    );
  }

  // PPT
  if (lowerName.endsWith('.pptx') || lowerName.endsWith('.ppt')) {
    return (
      <div style={{ width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src="https://res.cdn.office.net/files/fabric-cdn-prod_20251107.003/assets/item-types/16_1.5x/pptx.svg" style={{ width: '100%', height: '100%' }} alt="pptx" />
      </div>
    );
  }

  // PDF
  if (type === 'pdf') {
    return (
      <div style={{ width: size, height: size, flexShrink: 0 }}>
        <svg viewBox="0 0 32 32" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <path fill="#5C7896" d="M3 1v30h26V8h-7V1z"></path>
          <path fill="#FFF" d="M4 2v20h24V8h-6V2z"></path>
          <path fill="#1B3F63" d="m29 15-7-7h7z" opacity="0.3"></path>
          <path fill="#769CC2" d="m22 1 7 7h-7z"></path>
          <g fill="#FFF">
            <path d="M10.1 29v-4.7h1.7c1 0 1.9.4 1.9 1.4 0 1.1-.9 1.5-1.9 1.5h-.6V29zm1-2.4h.4c.6 0 1.1-.1 1.1-.8 0-.6-.4-.8-1-.8h-.4v1.6zM14.3 29v-4.7h1.6c1.5 0 2.5.7 2.5 2.3S17.3 29 15.8 29zm1-.7h.3c1.1 0 1.7-.6 1.7-1.7 0-1-.6-1.6-1.5-1.6h-.4v3.3zM19.2 29v-4.7h3v.7h-2v1.3h1.9v.7h-1.9v2z"></path>
          </g>
          <g fill="#5C7896">
            <path d="M16 5h5v2h-5zM16 9h8v2h-8zM8 13h16v2H8zM8 17h12v2H8zM8 5h6v6H8z"></path>
          </g>
        </svg>
      </div>
    );
  }

  // IMAGE
  if (type === 'image') {
    return (
      <div style={{ width: size, height: size }}>
        <svg viewBox="0 0 32 32" width="100%" height="100%">
          <path fill="#5C7896" d="M3 1v30h26V8h-7V1z"></path>
          <path fill="#1B3F63" d="m29 15-7-7h7z" opacity="0.3"></path>
          <path fill="#769CC2" d="m22 1 7 7h-7z"></path>
          <rect fill="#FFF" x="6" y="11" width="18" height="15"></rect>
          <path fill="#5C7896" d="M7 12h16v13H7z"></path>
          <circle fill="#FFF" cx="19.5" cy="15" r="1.5"></circle>
          <path fill="#FFF" d="m9 23 4-4 2 2 3-3 4 4v1H9z"></path>
        </svg>
      </div>
    );
  }

  // TXT
  if (type === 'txt') {
    return (
      <div style={{ width: size, height: size }}>
        <svg viewBox="0 0 32 32" width="100%" height="100%">
          <path fill="#5C7896" d="M3 1v30h26V8h-7V1z"></path>
          <path fill="#FFF" d="M4 2v20h24V8h-6V2z"></path>
          <path fill="#1B3F63" d="m29 15-7-7h7z" opacity="0.3"></path>
          <path fill="#769CC2" d="m22 1 7 7h-7z"></path>
          <g fill="#5C7896">
            <path d="M8 11h16v2H8zM8 15h16v2H8zM8 19h10v2H8z"></path>
          </g>
        </svg>
      </div>
    );
  }

  // CAD / BIM v3 — silueta de DOCUMENTO, la misma del resto de la tabla
  // (PDF, imagen, TXT), con el cuerpo en el color de la familia, el glifo
  // GRANDE en la hoja y la extensión en la banda inferior. v1 (glifo
  // pequeño) no se reconocía; v2 (teja cuadrada) rompía con el resto de la
  // tabla y el dueño la rechazó: «no se parece». Su referencia — el icono
  // DWG clásico — es exactamente esto: hoja con esquina doblada, cruceta de
  // dibujo azul y su banda amarilla.
  const ext = lowerName.split('.').pop();
  const CAD_FAMILIAS = {
    dwg:  { cuerpo: '#D99000', glifo: 'cruceta', tinta: '#1A6FBF' },
    dxf:  { cuerpo: '#D99000', glifo: 'cruceta', tinta: '#1A6FBF' },
    dwf:  { cuerpo: '#D99000', glifo: 'cruceta', tinta: '#1A6FBF' },
    dwfx: { cuerpo: '#D99000', glifo: 'cruceta', tinta: '#1A6FBF' },
    dgn:  { cuerpo: '#2E7D74', glifo: 'cruceta', tinta: '#2E7D74' },
    rvt:  { cuerpo: '#1961A9', glifo: 'letra', letra: 'R', tinta: '#1961A9' },
    rfa:  { cuerpo: '#1961A9', glifo: 'letra', letra: 'R', tinta: '#1961A9' },
    rte:  { cuerpo: '#1961A9', glifo: 'letra', letra: 'R', tinta: '#1961A9' },
    nwd:  { cuerpo: '#134B79', glifo: 'letra', letra: 'N', tinta: '#175A93' },
    nwc:  { cuerpo: '#134B79', glifo: 'letra', letra: 'N', tinta: '#175A93' },
    ifc:  { cuerpo: '#2F7D4F', glifo: 'cubo', tinta: '#2F7D4F' },
    '3dm': { cuerpo: '#5B6875', glifo: 'cubo', tinta: '#5B6875' },
    stl:   { cuerpo: '#5B6875', glifo: 'cubo', tinta: '#5B6875' },
    obj:   { cuerpo: '#5B6875', glifo: 'cubo', tinta: '#5B6875' },
    fbx:   { cuerpo: '#5B6875', glifo: 'cubo', tinta: '#5B6875' },
    step:  { cuerpo: '#5B6875', glifo: 'cubo', tinta: '#5B6875' },
    stp:   { cuerpo: '#5B6875', glifo: 'cubo', tinta: '#5B6875' },
    iges:  { cuerpo: '#5B6875', glifo: 'cubo', tinta: '#5B6875' },
    igs:   { cuerpo: '#5B6875', glifo: 'cubo', tinta: '#5B6875' },
    sat:   { cuerpo: '#5B6875', glifo: 'cubo', tinta: '#5B6875' },
  };
  if (CAD_FAMILIAS[ext]) {
    const f = CAD_FAMILIAS[ext];
    return (
      <div style={{ width: size, height: size, flexShrink: 0 }}>
        <svg viewBox="0 0 32 32" width="100%" height="100%">
          <path fill={f.cuerpo} d="M3 1v30h26V8h-7V1z" />
          <path fill="#FFF" d="M4 2v20h24V8h-6V2z" />
          <path fill="#1B3F63" d="m29 15-7-7h7z" opacity="0.3" />
          <path fill={f.cuerpo} opacity="0.55" d="m22 1 7 7h-7z" />
          {f.glifo === 'cruceta' && (
            <g stroke={f.tinta} strokeWidth="2" fill="none" strokeLinecap="round">
              <circle cx="14" cy="12.5" r="5.6" />
              <path d="M14 4.5v4.4M14 16.1v4.4M5.9 12.5h4.4M17.7 12.5h4.4" />
              <circle cx="14" cy="12.5" r="1.1" fill={f.tinta} stroke="none" />
            </g>
          )}
          {f.glifo === 'letra' && (
            <text x="14" y="18.5" textAnchor="middle" fontSize="17" fontWeight="800"
              fontFamily="'Segoe UI', system-ui, sans-serif" fill={f.tinta}>{f.letra}</text>
          )}
          {f.glifo === 'cubo' && (
            <g stroke={f.tinta} strokeWidth="1.9" fill="none" strokeLinejoin="round">
              <path d="M14 4.8l6.8 3.9v7L14 19.6l-6.8-3.9v-7z" />
              <path d="M7.2 8.7l6.8 3.9 6.8-3.9M14 12.6v7" opacity="0.6" />
            </g>
          )}
          <text x="16" y="28.6" textAnchor="middle" fontSize="6.8" fontWeight="800"
            fontFamily="sans-serif" fill="#FFF" letterSpacing="0.5">
            {ext.slice(0, 4).toUpperCase()}
          </text>
        </svg>
      </div>
    );
  }

  // DEFAULT FALLBACK
  return (
    <div style={{ width: size, height: size }}>
      <svg viewBox="0 0 32 32" width="100%" height="100%">
        <path fill="#769CC2" d="m22 1 7 7h-7z"></path>
        <path fill="#5C7896" d="M3 1v30h26V8h-7V1z"></path>
        <path fill="#1B3F63" d="m29 15-7-7h7z" opacity="0.3"></path>
        <path fill="#FFF" d="M4 2v20h24V8h-6V2z"></path>
        <g fill="#FFF">
          <text x="16" y="28" textAnchor="middle" fontSize="6px" fontWeight="800" fontFamily="sans-serif">{type.toUpperCase()}</text>
        </g>
      </svg>
    </div>
  );
}
