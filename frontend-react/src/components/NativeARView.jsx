import React, { useEffect, useRef, useState } from 'react';
import {
  createAnchor, createAnchorAtCamera, getLastGeoPose,
  onGeoPose, onReticle, onTracking, setAimPoint, setPlanesVisible,
  startSession, stopSession,
} from '../native/arcore';
import { attachArToViewer } from '../native/arViewerBridge';
import { showArStake, clearArStake } from '../native/arStake';
import { geoToViewer, seedYawFromHeading } from '../native/geoAnchor';
import './ARTransparent.css';


// Ocultar/mostrar TODOS los modelos de forma robusta: la API cambia entre
// versiones de LMV y `hideModel` no siempre existe (por eso el modelo seguía
// visible al entrar en AR). Se prueban las tres vías conocidas.
function setModelsVisible(viewer, visible) {
  if (!viewer) return 0;
  let hechos = 0;
  const modelos = (viewer.getAllModels?.() || viewer.impl?.modelQueue?.().getModels?.() || []);
  modelos.forEach((m) => {
    let ok = false;
    try {
      if (visible ? viewer.showModel : viewer.hideModel) {
        (visible ? viewer.showModel : viewer.hideModel).call(viewer, m.id);
        ok = true;
      }
    } catch { /* siguiente vía */ }
    if (!ok) { try { m.setAllVisibility?.(visible); ok = true; } catch { /* siguiente */ } }
    if (!ok) {
      try {
        const it = m.getInstanceTree?.();
        if (it) { viewer.impl.visibilityManager.setNodeOff(it.getRootId(), !visible, m); ok = true; }
      } catch { /* sin vías */ }
    }
    if (ok) hechos++;
  });
  try { viewer.impl.invalidate(true, true, true); } catch { /* noop */ }
  return hechos;
}

// Cuántos avisos seguidos del retículo (llegan a 10 Hz) hacen falta sobre un
// PLANO para dar la superficie por buena y colocar solo. Medio segundo: menos
// dispara con un reflejo pasajero, más se siente lento en campo.
const AUTO_PLACE_TICKS = 5;

export default function NativeARView({ onExit }) {
  const [status, setStatus] = useState('Iniciando camara...');
  const [tracking, setTracking] = useState('paused');
  const [anchored, setAnchored] = useState(false);
  // RETÍCULO: qué ve ARCore bajo el punto de mira. Sin esto el usuario ancla a
  // ciegas y por eso el modelo caía en cualquier lado.
  const [reticle, setReticle] = useState({ found: false, type: null, planes: 0 });
  // COLOCACIÓN AUTOMÁTICA (estilo Augin): apuntas al piso, aparece la malla y en
  // cuanto la superficie es estable el modelo se ancla solo. Los refs evitan el
  // cierre obsoleto: el manejador del retículo se registra UNA vez al montar.
  const autoPlaceRef = useRef(true);
  const stableTicksRef = useRef(0);
  const placingRef = useRef(false);
  const anchoredRef = useRef(false);
  const anchorFnRef = useRef(null);
  // El panel técnico aparece SOLO cuando algo va mal: si a los 6 segundos no
  // ha llegado ninguna pose de ARCore, o el tracking no arranca. En un APK
  // empaquetado no se puede añadir ?ardebug=1 a mano, y sin estos numeros
  // diagnosticar el AR desde lejos es adivinar. Con ?ardebug=1 sigue saliendo
  // siempre, para desarrollo.
  const forzarDebug = typeof window !== 'undefined' && /(\?|&)ardebug=1/.test(window.location.search);
  const [algoVaMal, setAlgoVaMal] = useState(false);
  const showDebug = forzarDebug || algoVaMal;
  const reticleCleanupRef = useRef(null);
  const [yawDegrees, setYawDegrees] = useState(0);
  const [unitsPerMeter, setUnitsPerMeter] = useState(1000);
  const [aligning, setAligning] = useState(false);
  const [hud, setHud] = useState({ src: '?', poseEvents: 0, applied: 0, upm: 1000, yaw: 0, aligning: false, err: '' });
  // Espejo del HUD para leerlo desde temporizadores sin arrastrar valores viejos.
  const hudRef = useRef({ poseEvents: 0, applied: 0 });
  // Diagnostico de TRANSPARENCIA: que pasos se aplicaron y, sobre todo, si el
  // contexto WebGL se creo con canal alfa. Sin alfa en el contexto, ninguna
  // llamada de limpieza puede hacer transparente el lienzo: se compone opaco
  // siempre, y por eso el area del visor sale negra aunque la camara este ahi.
  const [transp, setTransp] = useState({ pasos: '', alpha: null });
  const oneToOneRef = useRef(1000); // unidades/metro para escala 1:1 real (según unidades del modelo)
  const [geo, setGeo] = useState(null); // última pose GPS { lat, lon, accuracy, heading, hasHeading }
  const georefRef = useRef({ globalOffset: { x: 0, y: 0, z: 0 }, metersPerUnit: 0.001 });
  const geoCleanupRef = useRef(null);
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

        // Georreferencia del modelo para el anclaje por GPS: globalOffset (lo que
        // APS resta a las coords reales) + metros por unidad. Con esto, geoToViewer
        // convierte tu lat/lon a un punto exacto del visor.
        try {
          const go = viewer.model.getData?.()?.globalOffset
            || viewer.model.getGlobalOffset?.() || { x: 0, y: 0, z: 0 };
          const mpu = (viewer.model.getUnitScale && viewer.model.getUnitScale()) || 0.001;
          georefRef.current = {
            globalOffset: { x: go.x || 0, y: go.y || 0, z: go.z || 0 },
            metersPerUnit: mpu > 0 ? mpu : 0.001,
          };
        } catch { /* usa el default */ }

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
          // TRANSPARENCIA REAL: no basta con el clear del canvas. LMV pinta
          // ADEMÁS su propio fondo (el gris claro del visor y el env-map), y
          // eso es lo que tapaba la cámara. Se apagan todas las capas.
          const aplicado = [];
          try { renderer.setClearColor(0x000000, 0); renderer.setClearAlpha?.(0); aplicado.push('renderCtx'); } catch { /* siguiente */ }
          try {
            const gl = viewer.impl.glrenderer?.();
            if (gl) { gl.setClearColor(0x000000, 0); gl.setClearAlpha?.(0); aplicado.push('glrenderer'); }
          } catch { /* siguiente */ }
          // fondo propio del visor (setBackgroundColor) y entorno
          try { viewer.impl.toggleEnvMapBackground?.(false); aplicado.push('envMap'); } catch { /* noop */ }
          try { viewer.setLightPreset?.(0); aplicado.push('lightPreset'); } catch { /* noop */ }
          try { viewer.impl.setClearColors?.(0, 0, 0, 0, 0, 0); aplicado.push('clearColors'); } catch { /* noop */ }
          // sombra de suelo y reflejo: se dibujan sobre el fondo y estorban
          try { viewer.setGroundShadow?.(false); viewer.setGroundReflection?.(false); aplicado.push('ground'); } catch { /* noop */ }
          // el canvas y su contenedor, transparentes
          try {
            const cv = viewer.impl.canvas || viewer.canvas;
            if (cv) cv.style.background = 'transparent';
          } catch { /* noop */ }
          viewer.container.style.background = 'transparent';
          // ¿El lienzo puede ser transparente siquiera? Lo decide el contexto.
          let glAlpha = null;
          try {
            const gl = (viewer.impl.glrenderer?.() || {}).getContext?.()
              || viewer.impl.canvas?.getContext?.('webgl2')
              || viewer.impl.canvas?.getContext?.('webgl');
            glAlpha = gl?.getContextAttributes?.().alpha ?? null;
          } catch { /* noop */ }
          setTransp({ pasos: aplicado.join(',') || 'NADA', alpha: glAlpha });
          console.log('[AR] transparencia aplicada:', aplicado.join(', ') || 'NADA', '| gl.alpha =', glAlpha);
          viewer.impl.invalidate(true, true, true);
        } catch (e) {
          console.warn('[NativeAR] No se pudo transparentar el renderer:', e);
        }

        // Subscribe before start: ARCore only emits when the tracking state changes.
        trackingCleanupRef.current = onTracking((next) => setTracking(next.state));
        // GPS + rumbo: se guarda la última pose para orientar al instante.
        geoCleanupRef.current = onGeoPose((g) => setGeo(g));

        await startSession();
        if (cancelled) {
          stopSession();
          return;
        }

        detachRef.current = attachArToViewer(viewer, {
          modelOrigin: modelOriginRef.current,
          unitsPerMeter,
          onFrame: (h) => { hudRef.current = h; setHud(h); },
        });
        // El modelo ARRANCA OCULTO: primero se ve el terreno real y el
        // retículo; el modelo aparece SOLO cuando lo colocas. Antes entraba
        // visible y quedaba pegado a la cámara tapando todo.
        const ocultados = setModelsVisible(viewer, false);
        console.log('[AR] modelos ocultos al entrar:', ocultados);

        reticleCleanupRef.current = onReticle((r) => {
          const found = !!r?.found;
          const type = r?.type || null;
          setReticle({ found, type, planes: r?.planes || 0 });

          // Ya colocado, colocando ahora mismo, o en modo manual: no auto-anclar.
          if (anchoredRef.current || placingRef.current || !autoPlaceRef.current) {
            stableTicksRef.current = 0;
            return;
          }
          // Solo un PLANO cuenta. Los 'point' son nubes sueltas: anclar ahí es
          // lo que hacía caer el modelo en cualquier lado.
          if (found && type === 'plane') {
            stableTicksRef.current += 1;
            if (stableTicksRef.current >= AUTO_PLACE_TICKS) {
              stableTicksRef.current = 0;
              placingRef.current = true;
              anchorFnRef.current?.();
            }
          } else {
            stableTicksRef.current = 0;
          }
        });
        setStatus('Apunta la camara al piso y muevete despacio…');
        // Si en 6 segundos no llega ni una pose, el AR no esta vivo: se
        // enseña el panel tecnico en vez de dejar al operario mirando negro.
        setTimeout(() => {
          if (!cancelled) setAlgoVaMal((prev) => prev || (hudRef.current.poseEvents === 0));
        }, 6000);
      } catch (error) {
        setStatus('No se pudo iniciar AR: ' + (error?.message || error));
        setAlgoVaMal(true);
      }
    })();

    return () => {
      cancelled = true;
      try { setModelsVisible(window.NOP_VIEWER, true); } catch { /* Cleanup is best effort. */ }
      try { reticleCleanupRef.current?.(); } catch { /* Cleanup is best effort. */ }
      try { clearArStake(window.NOP_VIEWER); } catch { /* Cleanup is best effort. */ }
      try { detachRef.current?.(); } catch { /* Cleanup is best effort. */ }
      try { trackingCleanupRef.current?.(); } catch { /* Cleanup is best effort. */ }
      try { geoCleanupRef.current?.(); } catch { /* Cleanup is best effort. */ }
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

  // TOCAR PARA COLOCAR: el punto que tocas pasa a ser el punto de mira y el
  // anclaje se crea justo ahí (como Augin/Dalux), no en el centro fijo.
  const handleTapPlace = async (ev) => {
    if (anchored || placingRef.current) return;   // ya colocado: no re-anclar por roce
    placingRef.current = true;                    // el auto no debe pisar este intento
    const x = ev.clientX;
    const y = ev.clientY;
    const dpr = window.devicePixelRatio || 1;
    await setAimPoint(x * dpr, y * dpr);      // ARCore trabaja en px físicos
    await handleAnchor();
    await setAimPoint(-1, -1);                // vuelve al centro para el retículo
  };

  const handleAnchor = async () => {
    try {
      setStatus('Colocando el modelo sobre la superficie…');
      const result = await createAnchor();
      if (result?.matrix && detachRef.current?.setAnchorMatrix) {
        detachRef.current.setAnchorMatrix(result.matrix);
      }
      setModelsVisible(window.NOP_VIEWER, true);
      anchoredRef.current = true;
      setAnchored(true);
      // La malla de escaneo cumplió: apagarla deja la obra limpia (como Augin).
      setPlanesVisible(false);
      // ESTACA de verificación en el punto anclado: si se queda clavada en el
      // piso real mientras caminas, el anclaje y la escala son correctos.
      showArStake(window.NOP_VIEWER, modelOriginRef.current,
                  detachRef.current?.getUnitsPerMeter?.() || unitsPerMeter);
      setStatus('Anclado. Camina alrededor: la estaca roja (1 m) debe quedarse clavada en el piso.');
    } catch (error) {
      // Falló el anclaje: se vuelve a intentar solo en cuanto haya superficie
      // estable otra vez. No hace falta que el operario haga nada.
      setStatus('Buscando una superficie mejor… sigue apuntando al piso.');
    } finally {
      placingRef.current = false;
    }
  };

  // El manejador del retículo se registró al montar y no ve los renders
  // siguientes: se le deja SIEMPRE la versión vigente por ref.
  anchorFnRef.current = handleAnchor;

  // ── Orientación por GPS (el modo "referenciarse en campo") ──────────────────
  // Coloca el modelo sobre el terreno real según TU posición GPS, sin anclar ni
  // alinear a mano. La posición la naila el GPS; el norte lo siembra la brújula
  // (afinable con el dial, porque el magnetómetro tiene error).
  const handleGpsOrient = async () => {
    const gp = getLastGeoPose();
    if (!gp) {
      setStatus('Esperando senal GPS… sal a cielo abierto y espera unos segundos.');
      return;
    }
    if (!detachRef.current) { setStatus('El AR aun no esta listo.'); return; }
    try {
      setStatus('Orientando por GPS…');
      // 1) Punto del visor que corresponde a tu posicion real (UTM 17S → visor).
      const p = geoToViewer(gp.lat, gp.lon, georefRef.current);
      const z = modelOriginRef.current?.z ?? 0;
      // 2) Ancla en la pose actual de la camara (robusto en terreno abierto).
      const res = await createAnchorAtCamera();
      if (res?.matrix) detachRef.current.setAnchorMatrix(res.matrix);
      // 3) Coloca tu posicion real como origen del modelo.
      detachRef.current.setModelOrigin({ x: p.x, y: p.y, z });
      // 4) Siembra el norte con la brujula (afinable con el dial).
      if (gp.hasHeading) {
        const arH = detachRef.current.getArHeading?.() || 0;
        const yaw = seedYawFromHeading(gp.heading, arH);
        detachRef.current.setYawDegrees?.(yaw);
        setYawDegrees(((Math.round(yaw) % 360) + 360) % 360);
      }
      setModelsVisible(window.NOP_VIEWER, true);
      setAnchored(true);
      showArStake(window.NOP_VIEWER, { x: p.x, y: p.y, z },
                  detachRef.current?.getUnitsPerMeter?.() || unitsPerMeter);
      const acc = gp.accuracy ? `±${Math.round(gp.accuracy)} m` : '';
      setStatus(`Orientado por GPS ${acc}. Si el norte no calza, ajustalo con el dial o "Alinear".`);
    } catch (error) {
      setStatus('No se pudo orientar por GPS: ' + (error?.message || error));
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
      <div
        className="native-ar-status"
        onClick={() => setAlgoVaMal((v) => !v)}
        title="Tocar para ver el diagnóstico técnico"
      >
        <span className={tracking === 'tracking' ? 'tracking-ok' : 'tracking-wait'}>
          {tracking === 'tracking' ? 'Tracking OK' : 'Reconociendo...'}
        </span>
        <span>{status}</span>
      </div>

      {/* Panel de diagnóstico (temporal) para ver por qué el modelo no responde. */}
      {showDebug && <div style={{ position: 'absolute', top: 74, left: 8, background: 'rgba(0,0,0,0.7)', color: '#3ee87a', font: '12px monospace', padding: '6px 9px', borderRadius: 6, zIndex: 9999, lineHeight: 1.5, pointerEvents: 'none' }}>
        <div>eventos pose: {hud.poseEvents} {hud.poseEvents === 0 ? '❌ NO llegan' : '✓'}</div>
        <div>aplicados: {hud.applied} {hud.applied === 0 && hud.poseEvents > 0 ? '⚠ apply FALLA' : ''}</div>
        <div>THREE: {hud.src} · track: {tracking}</div>
        <div>planos: {reticle.planes} · mira: {reticle.found ? (reticle.type || 'si') : 'no'}</div>
        <div style={{ color: transp.alpha === false ? '#ff6b6b' : '#3ee87a' }}>
          gl.alpha: {String(transp.alpha)} {transp.alpha === false ? '❌ lienzo OPACO' : ''}
        </div>
        <div style={{ maxWidth: 260, wordBreak: 'break-word' }}>transp: {transp.pasos || '—'}</div>
        <div>upm: {hud.upm} · giro: {hud.yaw}°{hud.aligning ? ' ·ALIN' : ''}</div>
        <div>GPS: {geo ? `${geo.lat?.toFixed(6)}, ${geo.lon?.toFixed(6)} ±${Math.round(geo.accuracy || 0)}m` : 'sin senal'}{geo?.hasHeading ? ` · N ${Math.round(geo.heading)}°` : ''}</div>
        {hud.err ? <div style={{ color: '#ff6b6b', maxWidth: 260, wordBreak: 'break-word' }}>err: {hud.err}</div> : null}
      </div>}

      {/* RETÍCULO: verde = piso detectado (puedes colocar) · ámbar = solo
          puntos sueltos (sigue escaneando) · gris = nada aún. Además toda la
          zona superior es zona de TOQUE para colocar el modelo ahí. */}
      {!anchored && (
        <div
          className="native-ar-tap-layer"
          onClick={handleTapPlace}
          style={{ position: 'fixed', inset: 0, bottom: 190, zIndex: 8 }}
          aria-label="Toca el piso para colocar el modelo"
        />
      )}
      <div
        className={`native-ar-reticle${reticle.found ? ' is-found' : ''}`}
        data-kind={reticle.type || 'none'}
        aria-hidden="true"
      />
      {!anchored && (
        <div className="native-ar-hint">
          {reticle.found && reticle.type === 'plane'
            ? (autoPlaceRef.current ? 'Superficie detectada · colocando…' : 'Superficie detectada · toca para colocar')
            : reticle.planes > 0
              ? 'Apunta el centro a la malla del piso'
              : 'Mueve el equipo despacio apuntando al piso…'}
        </div>
      )}

      {/* AR SIMPLE: solo lo que funciona y hace falta en campo.
          Escanear el piso → tocar para colocar → caminar. Se quitaron los
          controles de GPS, giro, dial y escala: sobrecargaban la pantalla y
          estorbaban el flujo básico. Vuelven cuando cada uno esté probado. */}
      <div className="native-ar-controls">
        {!anchored ? (
          <div className="native-ar-primary" style={{ background: '#1f2937', textAlign: 'center' }}>
            {reticle.planes > 0
              ? `${reticle.planes} superficie${reticle.planes === 1 ? '' : 's'} detectada${reticle.planes === 1 ? '' : 's'}`
              : 'Buscando superficies…'}
          </div>
        ) : (
          <button
            className="native-ar-primary"
            onClick={() => {
              // Recolocar: vuelve el escaneo, pero en MANUAL. Si siguiera
              // automático volvería a anclarse solo en el mismo sitio y no
              // habría forma de elegir otro punto.
              setModelsVisible(window.NOP_VIEWER, false);
              clearArStake(window.NOP_VIEWER);
              setPlanesVisible(true);
              autoPlaceRef.current = false;
              anchoredRef.current = false;
              stableTicksRef.current = 0;
              setAnchored(false);
              setStatus('Toca el punto del piso donde quieres el modelo.');
            }}
            style={{ background: '#334155' }}
          >
            Recolocar en otro punto
          </button>
        )}

        <button className="native-ar-exit" onClick={onExit}>Salir AR</button>
      </div>
    </div>
  );
}
