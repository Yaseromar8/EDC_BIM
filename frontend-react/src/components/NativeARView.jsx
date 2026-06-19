// NativeARView.jsx — Overlay de AR nativo (ARCore vía plugin Capacitor).
// Arranca la cámara nativa, conecta la pose a la cámara del viewer abierto, y
// da los controles "Anclar aquí" / "Salir". El modelo de Autodesk flota sobre
// la cámara real gracias al WebView transparente.
import React, { useEffect, useRef, useState } from 'react';
import { startSession, stopSession, createAnchor } from '../native/arcore';
import { attachArToViewer } from '../native/arViewerBridge';

export default function NativeARView({ onExit }) {
  const [status, setStatus] = useState('Iniciando cámara…');
  const [tracking, setTracking] = useState('paused');
  const [anchored, setAnchored] = useState(false);
  const detachRef = useRef(null);
  const prevBodyBg = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const viewer = window.NOP_VIEWER;
      if (!viewer || !viewer.model) { setStatus('No hay un modelo abierto para ver en AR.'); return; }
      try {
        // Fondo transparente para que se vea la cámara nativa por detrás
        prevBodyBg.current = document.body.style.background;
        document.body.style.background = 'transparent';
        try { viewer.setBackgroundColor && viewer.setBackgroundColor(0, 0, 0, 0, 0, 0); } catch (e) {}

        await startSession();
        if (cancelled) { stopSession(); return; }

        const off = (viewer.model.getGlobalOffset && viewer.model.getGlobalOffset()) || { x: 0, y: 0, z: 0 };
        detachRef.current = attachArToViewer(viewer, {
          modelOffset: off,
          scale: 1,
          onStatus: (s) => setTracking(s.state),
        });
        setStatus('Mueve el celular para que reconozca el espacio, luego pulsa "Anclar aquí".');
      } catch (e) {
        setStatus('No se pudo iniciar AR: ' + (e?.message || e));
      }
    })();

    return () => {
      cancelled = true;
      if (detachRef.current) { try { detachRef.current(); } catch (e) {} }
      stopSession();
      document.body.style.background = prevBodyBg.current || '';
    };
  }, []);

  const handleAnchor = async () => {
    try {
      const res = await createAnchor();
      setAnchored(true);
      setStatus('Anclado. El modelo está fijo en ese punto físico.');
      // El detach previo se reemplaza con uno re-originado al anchor
      const viewer = window.NOP_VIEWER;
      if (res?.matrix && viewer) {
        if (detachRef.current) detachRef.current();
        const off = (viewer.model.getGlobalOffset && viewer.model.getGlobalOffset()) || { x: 0, y: 0, z: 0 };
        detachRef.current = attachArToViewer(viewer, {
          modelOffset: off, scale: 1, anchorMatrix: res.matrix,
          onStatus: (s) => setTracking(s.state),
        });
      }
    } catch (e) {
      setStatus('No se pudo anclar: ' + (e?.message || e));
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9000, pointerEvents: 'none' }}>
      {/* Barra de estado superior */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, pointerEvents: 'auto' }}>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10, background: tracking === 'tracking' ? 'rgba(126,168,143,0.9)' : 'rgba(194,168,120,0.9)', color: '#15181d' }}>
          {tracking === 'tracking' ? 'Tracking OK' : 'Reconociendo…'}
        </span>
        <span style={{ flex: 1, fontSize: 12, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{status}</span>
      </div>

      {/* Controles inferiores */}
      <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 12, pointerEvents: 'auto' }}>
        <button onClick={handleAnchor} disabled={tracking !== 'tracking'}
          style={{ padding: '12px 22px', borderRadius: 24, border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            background: tracking === 'tracking' ? '#7e9bbd' : '#555', color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
          {anchored ? 'Re-anclar aquí' : 'Anclar aquí'}
        </button>
        <button onClick={onExit}
          style={{ padding: '12px 22px', borderRadius: 24, border: '1px solid rgba(255,255,255,0.4)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            background: 'rgba(20,22,26,0.7)', color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
          Salir AR
        </button>
      </div>
    </div>
  );
}
