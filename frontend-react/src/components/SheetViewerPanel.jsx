// SheetViewerPanel — visor 2D de LÁMINAS de Revit (hojas del RVT ya traducidas).
//
// Abre la vista 2D (guid) del mismo URN ya cargado en el visor principal, en un
// panel dividido a la derecha, con su PROPIA instancia de GuiViewer3D. No toca
// el visor 3D ni su cámara/georreferenciación. Autodesk.Viewing ya está
// inicializado por el visor principal (token incluido), así que aquí solo se
// crea el visor y se carga el nodo 2D.
import React, { useEffect, useRef, useState } from 'react';

export default function SheetViewerPanel({ sheet, onClose }) {
  const divRef = useRef(null);
  const viewerRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error

  useEffect(() => {
    if (!sheet || !divRef.current) return undefined;
    const Av = window.Autodesk?.Viewing;
    if (!Av) { setStatus('error'); return undefined; }
    let cancelled = false;
    setStatus('loading');

    // Visor liviano: sin extensiones — una lámina 2D no las necesita.
    const viewer = new Av.GuiViewer3D(divRef.current, { extensions: [] });
    viewer.start();
    viewer.setTheme?.('dark-theme');
    viewerRef.current = viewer;

    Av.Document.load(
      `urn:${String(sheet.modelUrn).replace(/^urn:/i, '')}`,
      (doc) => {
        if (cancelled) return;
        const root = doc.getRoot();
        let node = null;
        try {
          node = root.findByGuid?.(sheet.id) || root.search({ guid: sheet.id })[0] || null;
        } catch { /* fallback abajo */ }
        if (!node) node = root.search({ type: 'geometry', role: '2d' })[0] || null;
        if (!node) { setStatus('error'); return; }
        viewer.loadDocumentNode(doc, node)
          .then(() => { if (!cancelled) setStatus('ready'); })
          .catch(() => { if (!cancelled) setStatus('error'); });
      },
      (err) => { console.error('[Láminas] Error cargando documento:', err); if (!cancelled) setStatus('error'); }
    );

    return () => {
      cancelled = true;
      try { viewer.finish(); } catch { /* ya desmontado */ }
      viewerRef.current = null;
    };
    // Reabrir solo si cambia LA lámina (guid) o el modelo
  }, [sheet?.id, sheet?.modelUrn]);

  if (!sheet) return null;

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0, width: '46%', minWidth: 430,
      zIndex: 40, background: '#1a1b1e', borderLeft: '1px solid #3a3f47',
      display: 'flex', flexDirection: 'column', boxShadow: '-6px 0 24px rgba(0,0,0,0.35)',
    }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderBottom: '1px solid #2a2b30', flexShrink: 0 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#7e9bbd" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="9" y1="21" x2="9" y2="9" />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, color: '#7e9bbd' }}>LÁMINA</span>
        <span style={{ flex: 1, fontSize: 13, color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${sheet.name} — ${sheet.modelName}`}>
          {sheet.name}
        </span>
        <button onClick={onClose} title="Cerrar lámina"
          style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 16, padding: '2px 6px', borderRadius: 4 }}>✕</button>
      </div>

      {/* Visor 2D */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={divRef} style={{ position: 'absolute', inset: 0 }} />
        {status === 'loading' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', fontSize: 13, pointerEvents: 'none' }}>
            Cargando lámina…
          </div>
        )}
        {status === 'error' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', fontSize: 13 }}>
            No se pudo cargar la lámina (¿la traducción del RVT incluye vistas 2D?)
          </div>
        )}
      </div>
    </div>
  );
}
