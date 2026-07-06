import React, { useEffect, useRef, useState } from 'react';
import { createAnchor, onTracking, startSession, stopSession } from '../native/arcore';
import { attachArToViewer } from '../native/arViewerBridge';
import './ARTransparent.css';

export default function NativeARView({ onExit }) {
  const [status, setStatus] = useState('Iniciando camara...');
  const [tracking, setTracking] = useState('paused');
  const [anchored, setAnchored] = useState(false);
  const [yawDegrees, setYawDegrees] = useState(0);
  const [unitsPerMeter, setUnitsPerMeter] = useState(1000);
  const [aligning, setAligning] = useState(false);
  const [hud, setHud] = useState({ frames: 0, upm: 1000, yaw: 0, aligning: false });
  const oneToOneRef = useRef(1000); // unidades/metro para escala 1:1 real (según unidades del modelo)
  const detachRef = useRef(null);
  const trackingCleanupRef = useRef(null);
  const modelOriginRef = useRef(null);
  const previousStylesRef = useRef(null);
  const rendererStateRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const viewer = window.NOP_VIEWER;
      if (!viewer || !viewer.model) {
        setStatus('No hay un modelo abierto para ver en AR.');
        return;
      }

      try {
        const target = viewer.navigation.getTarget();
        modelOriginRef.current = { x: target.x, y: target.y, z: target.z };

        // Unidades reales del modelo -> escala 1:1 verdadera. getUnitScale() da
        // METROS por unidad del visor (modelo en metros -> 1; en mm -> 0.001).
        // unidades/metro para 1:1 = 1/getUnitScale. Antes se asumía 1000 (mm) fijo,
        // por eso un modelo en metros se veía 1000x más chico = maqueta.
        try {
          const mpu = viewer.model.getUnitScale && viewer.model.getUnitScale();
          if (mpu && mpu > 0) oneToOneRef.current = 1 / mpu;
        } catch { /* usa el default 1000 */ }

        previousStylesRef.current = {
          body: document.body.style.background,
          html: document.documentElement.style.background,
          viewer: viewer.container.style.background,
        };
        document.body.classList.add('ar-active');
        document.documentElement.classList.add('ar-active');
        document.body.style.background = 'transparent';
        document.documentElement.style.background = 'transparent';

        try {
          const renderer = viewer.impl.renderer();
          rendererStateRef.current = {
            color: renderer.getClearColor?.().clone?.() || null,
            alpha: renderer.getClearAlpha?.() ?? 1,
          };
          renderer.setClearColor(0x000000, 0);
          renderer.setClearAlpha?.(0);
          viewer.container.style.background = 'transparent';
          viewer.impl.invalidate(true, true, true);
        } catch (e) {
          console.warn('[NativeAR] No se pudo transparentar el renderer:', e);
        }

        // Subscribe before start: ARCore only emits when the tracking state changes.
        trackingCleanupRef.current = onTracking((next) => setTracking(next.state));

        await startSession();
        if (cancelled) {
          stopSession();
          return;
        }

        detachRef.current = attachArToViewer(viewer, {
          modelOrigin: modelOriginRef.current,
          unitsPerMeter,
          onFrame: setHud,
        });
        setStatus('Escanea el suelo y apunta el reticulo al punto fisico equivalente al punto BIM que estabas mirando.');
      } catch (error) {
        setStatus('No se pudo iniciar AR: ' + (error?.message || error));
      }
    })();

    return () => {
      cancelled = true;
      try { detachRef.current?.(); } catch { /* Cleanup is best effort. */ }
      try { trackingCleanupRef.current?.(); } catch { /* Cleanup is best effort. */ }
      stopSession();

      document.body.classList.remove('ar-active');
      document.documentElement.classList.remove('ar-active');
      const previous = previousStylesRef.current;
      document.body.style.background = previous?.body || '';
      document.documentElement.style.background = previous?.html || '';

      try {
        const viewer = window.NOP_VIEWER;
        if (viewer) {
          viewer.container.style.background = previous?.viewer || '';
          const renderer = viewer.impl.renderer();
          const saved = rendererStateRef.current;
          if (renderer && saved) {
            renderer.setClearColor(saved.color || 0x000000, saved.alpha);
            renderer.setClearAlpha?.(saved.alpha);
            viewer.impl.invalidate(true, true, true);
          }
        }
      } catch {
        // The viewer may already be disposed while the React tree unmounts.
      }
    };
  }, []);

  const handleAnchor = async () => {
    try {
      setStatus('Buscando superficie en el reticulo...');
      const result = await createAnchor();
      if (result?.matrix && detachRef.current?.setAnchorMatrix) {
        detachRef.current.setAnchorMatrix(result.matrix);
      }
      setAnchored(true);
      setStatus('Anclado sobre la superficie. Ajusta el giro hasta alinear el modelo con la obra.');
    } catch (error) {
      setStatus('No se pudo anclar: ' + (error?.message || error));
    }
  };

  const changeYaw = (delta) => {
    setYawDegrees((current) => {
      const next = current + delta;
      detachRef.current?.setYawDegrees?.(next);
      return next;
    });
  };

  // Escala EN VIVO (sin recompilar). Menos unidades/metro = modelo más grande.
  const applyUpm = (value) => {
    const clamped = Math.max(0.05, Math.min(200000, value));
    detachRef.current?.setUnitsPerMeter?.(clamped);
    setUnitsPerMeter(clamped);
  };

  // Giro ABSOLUTO del modelo (dial continuo 0–359°) para alinearlo con la obra.
  const setYawAbsolute = (deg) => {
    const norm = ((Math.round(Number(deg)) % 360) + 360) % 360;
    detachRef.current?.setYawDegrees?.(norm);
    setYawDegrees(norm);
  };

  // Alinear girando el celular (gesto estilo Dalux/Augin).
  const toggleAlign = () => {
    const d = detachRef.current;
    if (!d) return;
    if (aligning) {
      d.stopAlign?.();
      const locked = Math.round(d.getYawDegrees?.() ?? yawDegrees);
      setYawDegrees(((locked % 360) + 360) % 360);
      setAligning(false);
      setStatus('Orientacion fijada. Afina con el dial si hace falta.');
    } else {
      if (d.startAlign?.() === false) { setStatus('Espera a "Tracking OK" antes de alinear.'); return; }
      setAligning(true);
      setStatus('Gira tu cuerpo hasta que el modelo calce con la obra, luego toca Fijar.');
    }
  };

  // Reflejar el giro en vivo mientras alineas (el puente es el dueño del valor).
  useEffect(() => {
    if (!aligning) return undefined;
    const id = setInterval(() => {
      const y = detachRef.current?.getYawDegrees?.();
      if (typeof y === 'number') setYawDegrees(((Math.round(y) % 360) + 360) % 360);
    }, 120);
    return () => clearInterval(id);
  }, [aligning]);

  return (
    <div className="native-ar-overlay">
      <div className="native-ar-status">
        <span className={tracking === 'tracking' ? 'tracking-ok' : 'tracking-wait'}>
          {tracking === 'tracking' ? 'Tracking OK' : 'Reconociendo...'}
        </span>
        <span>{status}</span>
      </div>

      {/* Panel de diagnóstico (temporal) para ver por qué el modelo no responde. */}
      <div style={{ position: 'absolute', top: 74, left: 8, background: 'rgba(0,0,0,0.7)', color: '#3ee87a', font: '12px monospace', padding: '6px 9px', borderRadius: 6, zIndex: 9999, lineHeight: 1.5, pointerEvents: 'none' }}>
        <div>poses ARCore: {hud.frames} {hud.frames === 0 ? '❌ NO llegan' : '✓ ok'}</div>
        <div>tracking: {tracking}</div>
        <div>escala (upm): {hud.upm}</div>
        <div>giro: {hud.yaw}° {hud.aligning ? '· ALINEANDO' : ''}</div>
      </div>

      <div className="native-ar-reticle" aria-hidden="true" />

      <div className="native-ar-controls">
        <button
          className="native-ar-primary"
          onClick={handleAnchor}
          disabled={tracking !== 'tracking'}
        >
          {anchored ? 'Re-anclar aqui' : 'Anclar aqui'}
        </button>

        {/* Escala: maqueta <-> 1:1 real. Se ajusta en vivo desde el celular. */}
        <div className="native-ar-yaw">
          <button onClick={() => applyUpm(oneToOneRef.current * 500)} aria-label="Ver como maqueta">Maqueta</button>
          <button onClick={() => applyUpm(unitsPerMeter * 1.25)} aria-label="Mas chico">− chico</button>
          <span>1:{Math.max(1, Math.round(unitsPerMeter / oneToOneRef.current))}</span>
          <button onClick={() => applyUpm(unitsPerMeter / 1.25)} aria-label="Mas grande">+ grande</button>
          <button onClick={() => applyUpm(oneToOneRef.current)} aria-label="Escala real uno a uno">1:1</button>
        </div>

        {anchored && (
          <div className="native-ar-yaw" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <button
              className="native-ar-primary"
              onClick={toggleAlign}
              style={{ background: aligning ? '#ef4444' : undefined }}
            >
              {aligning ? '✔ Fijar orientacion' : '🧭 Alinear con mi direccion'}
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => changeYaw(-5)} aria-label="Girar cinco grados a la izquierda">-5</button>
              <span style={{ minWidth: 92, textAlign: 'center' }}>Giro {yawDegrees}°</span>
              <button onClick={() => changeYaw(5)} aria-label="Girar cinco grados a la derecha">+5</button>
              <button onClick={() => changeYaw(90)} aria-label="Girar noventa grados">+90</button>
            </div>
            {/* Dial continuo: alinea el modelo con la obra sin ir de a 5°. */}
            <input
              type="range"
              min="0"
              max="359"
              step="1"
              value={yawDegrees}
              onChange={(e) => setYawAbsolute(e.target.value)}
              aria-label="Giro del modelo en grados"
              style={{ width: '100%' }}
            />
          </div>
        )}

        <button className="native-ar-exit" onClick={onExit}>Salir AR</button>
      </div>
    </div>
  );
}
