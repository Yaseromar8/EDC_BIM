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

  // CAD / BIM v7 — dos lenguajes A PROPOSITO, por orden del dueno:
  //   · La familia DWG lleva la anatomia del icono clasico que el puso de
  //     referencia: pagina azul profunda, cruceta CIAN y cinta amarilla EN
  //     DIAGONAL cruzando la esquina («ese icono, asi deberia ser»).
  //   · El resto (Revit, Navisworks, IFC, intercambio) vuelve a la v5 que
  //     ya le gustaba — pagina saturada, glifo blanco, banda horizontal —
  //     porque extender la cinta diagonal a todos fue iniciativa mia y la
  //     rechazo: «no te pedi que cambien el icono de Revit».
  const ext = lowerName.split('.').pop();
  const CAD_FAMILIAS = {
    dwg:  { pagina: '#14539F', pliegue: '#4D85C6', glifo: 'cruceta', tintaGlifo: '#7CCBF0', cinta: '#F7B60D', tintaCinta: '#1F2937', diagonal: true },
    dxf:  { pagina: '#14539F', pliegue: '#4D85C6', glifo: 'cruceta', tintaGlifo: '#7CCBF0', cinta: '#F7B60D', tintaCinta: '#1F2937', diagonal: true },
    dwf:  { pagina: '#14539F', pliegue: '#4D85C6', glifo: 'cruceta', tintaGlifo: '#7CCBF0', cinta: '#F7B60D', tintaCinta: '#1F2937', diagonal: true },
    dwfx: { pagina: '#14539F', pliegue: '#4D85C6', glifo: 'cruceta', tintaGlifo: '#7CCBF0', cinta: '#F7B60D', tintaCinta: '#1F2937', diagonal: true },
    dgn:  { pagina: '#2E7D74', pliegue: '#5FA39B', glifo: 'cruceta', banda: '#153F3A' },
    rvt:  { pagina: '#1961A9', pliegue: '#4E8AC8', glifo: 'letra', letra: 'R', banda: '#0F3F73' },
    rfa:  { pagina: '#1961A9', pliegue: '#4E8AC8', glifo: 'letra', letra: 'R', banda: '#0F3F73' },
    rte:  { pagina: '#1961A9', pliegue: '#4E8AC8', glifo: 'letra', letra: 'R', banda: '#0F3F73' },
    nwd:  { pagina: '#F4F8FB', pliegue: '#D4E2EE', borde: '#AFC6DA', glifo: 'letra', letra: 'N', tintaGlifo: '#175A93', banda: '#175A93' },
    nwc:  { pagina: '#F4F8FB', pliegue: '#D4E2EE', borde: '#AFC6DA', glifo: 'letra', letra: 'N', tintaGlifo: '#175A93', banda: '#175A93' },
    ifc:  { pagina: '#2F7D4F', pliegue: '#5EA37C', glifo: 'cubo', banda: '#1E5537' },
    '3dm': { pagina: '#5B6875', pliegue: '#88939E', glifo: 'cubo', banda: '#3F4A55' },
    stl:   { pagina: '#5B6875', pliegue: '#88939E', glifo: 'cubo', banda: '#3F4A55' },
    obj:   { pagina: '#5B6875', pliegue: '#88939E', glifo: 'cubo', banda: '#3F4A55' },
    fbx:   { pagina: '#5B6875', pliegue: '#88939E', glifo: 'cubo', banda: '#3F4A55' },
    step:  { pagina: '#5B6875', pliegue: '#88939E', glifo: 'cubo', banda: '#3F4A55' },
    stp:   { pagina: '#5B6875', pliegue: '#88939E', glifo: 'cubo', banda: '#3F4A55' },
    iges:  { pagina: '#5B6875', pliegue: '#88939E', glifo: 'cubo', banda: '#3F4A55' },
    igs:   { pagina: '#5B6875', pliegue: '#88939E', glifo: 'cubo', banda: '#3F4A55' },
    sat:   { pagina: '#5B6875', pliegue: '#88939E', glifo: 'cubo', banda: '#3F4A55' },
  };
  if (CAD_FAMILIAS[ext]) {
    const f = CAD_FAMILIAS[ext];
    const tinta = f.tintaGlifo || '#FFFFFF';
    // La familia con cinta diagonal sube el glifo a la derecha para dejarle
    // sitio; la de banda horizontal lo lleva centrado, como en v5.
    const cx = f.diagonal ? 17.5 : 15;
    const cy = f.diagonal ? 11 : 11.5;
    return (
      <div style={{ width: size, height: size, flexShrink: 0 }}>
        <svg viewBox="0 0 32 32" width="100%" height="100%">
          <path fill={f.pagina} stroke={f.borde || 'none'} strokeWidth={f.borde ? 1 : 0}
            d="M3 1v30h26V8h-7V1z" />
          <path fill="#0D2438" d="m29 15-7-7h7z" opacity="0.25" />
          <path fill={f.pliegue} d="m22 1 7 7h-7z" />
          {f.glifo === 'cruceta' && (
            <g stroke={tinta} strokeWidth={f.diagonal ? 2 : 2.2} fill="none" strokeLinecap="round">
              <circle cx={cx} cy={cy} r={f.diagonal ? 4.8 : 5.2} />
              <path d={`M${cx} ${cy - 6.8}v3.4M${cx} ${cy + 3.4}v3.4M${cx - 6.8} ${cy}h3.4M${cx + 3.4} ${cy}h3.4`} />
              <circle cx={cx} cy={cy} r="1" fill={tinta} stroke="none" />
            </g>
          )}
          {f.glifo === 'letra' && (
            <text x="15" y="16.5" textAnchor="middle" fontSize="15.5" fontWeight="800"
              fontFamily="'Segoe UI', system-ui, sans-serif" fill={tinta}>{f.letra}</text>
          )}
          {f.glifo === 'cubo' && (
            <g stroke={tinta} strokeWidth="2" fill="none" strokeLinejoin="round">
              <path d="M15 4.5l6.3 3.6v6.6L15 18.3l-6.3-3.6V8.1z" />
              <path d="M8.7 8.1l6.3 3.6 6.3-3.6M15 11.7v6.6" opacity="0.65" />
            </g>
          )}
          {f.diagonal ? (
            <g transform="rotate(-33 9 24.5)">
              <rect x="-7" y="20.7" width="33" height="7.6" fill={f.cinta} />
              <text x="9" y="26.3" textAnchor="middle" fontSize="6.6" fontWeight="800"
                fontFamily="sans-serif" fill={f.tintaCinta || '#FFFFFF'} letterSpacing="0.5">
                {ext.slice(0, 4).toUpperCase()}
              </text>
            </g>
          ) : (
            <>
              <rect x="3" y="21.5" width="26" height="9.5" fill={f.banda} />
              <text x="16" y="28.6" textAnchor="middle" fontSize="7" fontWeight="800"
                fontFamily="sans-serif" fill="#FFFFFF" letterSpacing="0.6">
                {ext.slice(0, 4).toUpperCase()}
              </text>
            </>
          )}
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
