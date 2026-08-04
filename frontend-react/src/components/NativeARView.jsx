import React, { useEffect, useRef, useState } from 'react';
import {
  createAnchor, createAnchorAtCamera, getLastGeoPose,
  esSimulado, getDiagLog,
  onArStats, onGeoPose, onReticle, onTracking, setAimPoint, setPlanesVisible,
  startSession, stopSession,
} from '../native/arcore';
import { attachArToViewer } from '../native/arViewerBridge';
import ArCornerPanel, { useTeclasSimulador } from './ArCornerPanel';
import { showArStake, clearArStake } from '../native/arStake';
import ArAdjustPanel from './ArAdjustPanel';
import { geoToViewer, seedYawFromHeading } from '../native/geoAnchor';
import './ARTransparent.css';


// Ocultar/mostrar TODOS los modelos de forma robusta: la API cambia entre
// versiones de LMV y `hideModel` no siempre existe (por eso el modelo seguía
// visible al entrar en AR). Se prueban las tres vías conocidas.
// Devuelve al visor su aspecto de siempre: iluminación, entorno, sombras y
// fondo. La usan tanto la salida del AR como el paso ATRÁS desde la cámara al
// modelo — el AR es un modo temporal y no puede dejar el visor peor de como
// lo encontró.
function restaurarAspecto(viewer, saved, estilos) {
  if (!viewer) return;
  const intenta = (fn) => { try { fn(); } catch { /* siguiente */ } };
  intenta(() => { viewer.container.style.background = estilos?.viewer || ''; });
  const renderer = viewer.impl.renderer();
  if (!renderer || !saved) return;
  intenta(() => renderer.setClearColor(saved.color || 0x000000, saved.alpha));
  intenta(() => renderer.setClearAlpha?.(saved.alpha));
  intenta(() => renderer.useOverlayAlpha?.(1));
  if (saved.lightPreset != null) intenta(() => viewer.setLightPreset(saved.lightPreset));
  intenta(() => viewer.impl.toggleEnvMapBackground(saved.envMap !== false));
  intenta(() => viewer.setGroundShadow(saved.groundShadow !== false));
  intenta(() => viewer.setGroundReflection(saved.groundReflection !== false));
  intenta(() => { const cv = viewer.impl.canvas || viewer.canvas; if (cv) cv.style.background = ''; });
  intenta(() => viewer.impl.invalidate(true, true, true));
}

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

// SELLO DE VERSIÓN DEL AR. Se muestra en el panel y se sube con cada cambio.
// Existe porque llevamos varias rondas discutiendo si el navegador tenía o no
// el último código: sin un sello visible, un panel idéntico puede ser el de
// hace tres arreglos y nadie lo sabe. Con esto se ve de un vistazo.
const AR_BUILD = 'ar-29';

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
  const eligiendoModoRef = useRef(true);
  // El estado `reticle` solo guarda lo justo para pintar el anillo; la
  // calibración necesita la POSE completa de la superficie apuntada.
  const reticuloRef = useRef(null);
  const calibrandoRef = useRef(false);
  const modoCamaraRef = useRef(null);
  const enCamaraRef = useRef(false);
  const [enCamara, setEnCamara] = useState(false);
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
  // MODOS DE CALIBRACION, como los ofrece Revizto:
  //   'esquina'    dos muros y el piso — el mas preciso, exige un rincon real
  //   'piso'       alinea el suelo y abre Ajustar
  //   'ninguna'    coloca y ajustas a mano — el UNICO que funciona en canal
  //                a cielo abierto, donde no hay rincones que escanear
  // Se arranca por el mas simple: el que nunca falla.
  const [modo, setModo] = useState(null);        // null = aun eligiendo
  const [ajustando, setAjustando] = useState(false);
  // El AR abre PREGUNTANDO el metodo, como Revizto: nada se coloca solo hasta
  // que el operario elige. Antes se buscaban planos y se anclaba por su cuenta,
  // y el operario no sabia que estaba pasando ni podia decidir.
  const [eligiendoModo, setEligiendoModo] = useState(true);
  const [calibrandoEsquina, setCalibrandoEsquina] = useState(false);
  const [hud, setHud] = useState({ src: '?', poseEvents: 0, applied: 0, upm: 1000, yaw: 0, aligning: false, err: '' });
  // Espejo del HUD para leerlo desde temporizadores sin arrastrar valores viejos.
  const hudRef = useRef({ poseEvents: 0, applied: 0 });
  // Diagnostico de TRANSPARENCIA: que pasos se aplicaron y, sobre todo, si el
  // contexto WebGL se creo con canal alfa. Sin alfa en el contexto, ninguna
  // llamada de limpieza puede hacer transparente el lienzo: se compone opaco
  // siempre, y por eso el area del visor sale negra aunque la camara este ahi.
  const [transp, setTransp] = useState({ pasos: '', alpha: null });
  const [diagLog, setDiagLog] = useState('');
  const [arStats, setArStats] = useState({ frames: 0, state: '?', reason: '?', ts: 0, cam: false, tex: -1, glError: '', resumes: 0, resumeError: '', camCfgs: -1 });
  const statsCleanupRef = useRef(null);
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
        // EL AR ARRANCA COMO EL VISOR DE SIEMPRE.
        //
        // Antes se oscurecía todo de golpe al entrar: fondo negro, modelo
        // apagado y geometría oculta, sin que nadie lo hubiera pedido. Así no
        // trabaja Revizto y así no se puede trabajar: primero navegas el modelo
        // NORMAL hasta plantarte donde vas a referenciarte —reconociendo el
        // sitio, buscando el rincón— y solo entonces arranca la cámara.
        //
        // Por eso todo lo que apaga el visor vive aquí dentro y no se ejecuta
        // hasta que se pide el modo cámara.
        const entrarModoCamara = () => {
        if (enCamaraRef.current) return;      // ya estamos; no repetir
        enCamaraRef.current = true;
        setEnCamara(true);
        document.body.classList.add('ar-active');
        document.documentElement.classList.add('ar-active');
        document.body.style.background = 'transparent';
        document.documentElement.style.background = 'transparent';

        try {
          const renderer = viewer.impl.renderer();
          // Se guarda TODO lo que el AR va a apagar. Antes solo se guardaba el
          // color de limpiado, asi que al salir de AR el modelo se quedaba
          // descolorido para siempre: sin mapa de entorno, sin iluminacion y
          // sin sombras. El AR es un modo temporal; no puede dejar el visor
          // peor de como lo encontro.
          // Solo la PRIMERA vez: si se entra y se sale de la cámara varias
          // veces, volver a guardar aquí capturaría el estado ya apagado y el
          // visor no recuperaría nunca su aspecto.
          if (!rendererStateRef.current) rendererStateRef.current = {
            color: renderer.getClearColor?.().clone?.() || null,
            alpha: renderer.getClearAlpha?.() ?? 1,
            lightPreset: (() => {
              try { return viewer.impl.currentLightPreset?.() ?? viewer.prefs?.get?.('lightPreset'); }
              catch { return null; }
            })(),
            envMap: (() => {
              try { return viewer.prefs?.get?.('envMapBackground'); } catch { return null; }
            })(),
            groundShadow: (() => {
              try { return viewer.prefs?.get?.('groundShadow'); } catch { return null; }
            })(),
            groundReflection: (() => {
              try { return viewer.prefs?.get?.('groundReflection'); } catch { return null; }
            })(),
          };
          // TRANSPARENCIA REAL: no basta con el clear del canvas. LMV pinta
          // ADEMÁS su propio fondo (el gris claro del visor y el env-map), y
          // eso es lo que tapaba la cámara. Se apagan todas las capas.
          //
          // CADA PASO VA EN SU PROPIO try. Antes dos llamadas compartian uno, y
          // como el RenderContext de LMV NO tiene setClearColor —solo
          // setClearAlpha—, la primera reventaba y se llevaba por delante a la
          // segunda, que era justo LA que hace transparente el lienzo.
          const aplicado = [];
          const paso = (nombre, fn) => {
            try { fn(); aplicado.push(nombre); } catch { /* el resto sigue */ }
          };

          // EL PASO DECISIVO: alfa 0 en el limpiado del RenderContext. Es lo
          // que deja ver la camara detras del modelo. Verificado en el codigo
          // de LMV: RenderContext expone setClearAlpha(a) y guarda _clearAlpha.
          paso('renderCtxAlpha', () => renderer.setClearAlpha(0));
          // useOverlayAlpha(0): que las capas de overlay tampoco rellenen alfa.
          paso('overlayAlpha', () => renderer.useOverlayAlpha?.(0));
          paso('glrenderer', () => {
            const gl = viewer.impl.glrenderer?.();
            if (!gl) throw new Error('sin glrenderer');
            gl.setClearColor(0x000000, 0);
            gl.setClearAlpha?.(0);
          });
          // fondo propio del visor (setBackgroundColor) y entorno
          paso('envMap', () => viewer.impl.toggleEnvMapBackground(false));
          paso('lightPreset', () => viewer.setLightPreset(0));
          paso('clearColors', () => viewer.impl.setClearColors(0, 0, 0, 0, 0, 0));
          // sombra de suelo y reflejo: se dibujan sobre el fondo y estorban
          paso('ground', () => { viewer.setGroundShadow(false); viewer.setGroundReflection(false); });
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
          setModelsVisible(viewer, false);
          try { detachRef.current?.setPausado?.(false); } catch { /* noop */ }
        };

        // Volver del modo cámara al visor normal, sin salir del AR ni perder
        // la sesión de seguimiento.
        const salirModoCamara = () => {
          if (!enCamaraRef.current) return;
          enCamaraRef.current = false;
          setEnCamara(false);
          try { detachRef.current?.setPausado?.(true); } catch { /* noop */ }
          document.body.classList.remove('ar-active');
          document.documentElement.classList.remove('ar-active');
          document.body.style.background = previousStylesRef.current?.body || '';
          document.documentElement.style.background = previousStylesRef.current?.html || '';
          restaurarAspecto(viewer, rendererStateRef.current, previousStylesRef.current);
          setModelsVisible(viewer, true);
        };
        modoCamaraRef.current = { entrar: entrarModoCamara, salir: salirModoCamara };

        // Subscribe before start: ARCore only emits when the tracking state changes.
        trackingCleanupRef.current = onTracking((next) => setTracking(next.state));
        statsCleanupRef.current = onArStats((st) => setArStats(st));
        // GPS + rumbo: se guarda la última pose para orientar al instante.
        geoCleanupRef.current = onGeoPose((g) => setGeo(g));

        const sesion = await startSession();
        if (cancelled) {
          // Con el testigo, este efecto ya obsoleto solo puede apagar SU
          // sesión. Antes apagaba la del montaje siguiente y el AR quedaba
          // mudo: sin poses, sin latido y sin una sola pista del motivo.
          stopSession(sesion);
          return;
        }

        detachRef.current = attachArToViewer(viewer, {
          modelOrigin: modelOriginRef.current,
          unitsPerMeter,
          onFrame: (h) => { hudRef.current = h; setHud(h); },
        });
        // El puente queda enganchado pero EN PAUSA: recibe las poses y
        // mantiene viva la sesión de ARCore, pero no toca la cámara del visor.
        // Así el operario navega el modelo con normalidad mientras el
        // seguimiento ya está calentando por debajo — cuando pida la cámara,
        // no habrá que esperar al reconocimiento.
        try { detachRef.current.setPausado?.(true); } catch { /* noop */ }

        reticleCleanupRef.current = onReticle((r) => {
          reticuloRef.current = r;
          const found = !!r?.found;
          const type = r?.type || null;
          setReticle({ found, type, planes: r?.planes || 0 });

          // Ya colocado, colocando ahora mismo, o en modo manual: no auto-anclar.
          if (anchoredRef.current || placingRef.current || !autoPlaceRef.current
              || eligiendoModoRef.current || calibrandoRef.current) {
            stableTicksRef.current = 0;
            return;
          }
          // Solo un PLANO cuenta. Los 'point' son nubes sueltas: anclar ahí es
          // lo que hacía caer el modelo en cualquier lado. Y desde que el
          // retículo también reporta muros (los pide la esquina), colocar
          // sigue siendo cosa de PISOS: un modelo auto-colocado sobre un muro
          // no tiene ningún sentido.
          const esPiso = !r?.kind || r.kind === 'floor';
          if (found && type === 'plane' && esPiso) {
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
        setStatus('Navega hasta donde vayas a referenciarte y elige cómo calibrar.');
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
      try { statsCleanupRef.current?.(); } catch { /* Cleanup is best effort. */ }
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
            const restaurar = (fn) => { try { fn(); } catch { /* siguiente */ } };
            restaurar(() => renderer.setClearColor(saved.color || 0x000000, saved.alpha));
            restaurar(() => renderer.setClearAlpha?.(saved.alpha));
            restaurar(() => renderer.useOverlayAlpha?.(1));
            // Devolver el aspecto: iluminacion, entorno y sombras. Sin esto el
            // modelo se quedaba gris y apagado despues de cada visita al AR.
            if (saved.lightPreset != null) restaurar(() => viewer.setLightPreset(saved.lightPreset));
            restaurar(() => viewer.impl.toggleEnvMapBackground(saved.envMap !== false));
            restaurar(() => viewer.setGroundShadow(saved.groundShadow !== false));
            restaurar(() => viewer.setGroundReflection(saved.groundReflection !== false));
            restaurar(() => viewer.impl.invalidate(true, true, true));
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

  // MODO "SIN CALIBRACION": el modelo aparece donde estas y lo colocas a mano.
  // Es el que Revizto ofrece como salida cuando no hay superficies utiles, y en
  // obra lineal a cielo abierto es directamente el modo principal.
  const colocarSinCalibrar = async () => {
    try {
      setStatus('Colocando el modelo…');
      const res = await createAnchorAtCamera();
      if (res?.matrix) detachRef.current?.setAnchorMatrix(res.matrix);
      setModelsVisible(window.NOP_VIEWER, true);
      anchoredRef.current = true;
      setAnchored(true);
      setPlanesVisible(false);
      setModo('ninguna');
      setAjustando(true);
      setStatus('Colócalo con las flechas hasta que calce con la obra.');
    } catch (error) {
      setStatus('No se pudo colocar: ' + (error?.message || error));
    }
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
      setModo((m) => m || 'piso');
      // Revizto abre Ajustar automáticamente tras calibrar por piso: el
      // aterrizaje casi nunca es perfecto y el afinado es parte del método.
      setAjustando(true);
      setStatus('Colocado. Afina con las flechas hasta que calce con la obra.');
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
  eligiendoModoRef.current = eligiendoModo;
  useTeclasSimulador(calibrandoEsquina);

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
        {/* En el navegador no hay camara ni sensores: el flujo se puede
            ENSAYAR entero, pero no vale para replantear nada. Decirlo aqui y
            no en una nota al pie, que es donde no se lee. */}
        {esSimulado() && (
          <span style={{
            marginRight: 8, padding: '2px 8px', borderRadius: 999,
            background: '#7a5b12', color: '#ffe08a', fontSize: 11.5, fontWeight: 700,
          }}>
            ENSAYO · sin cámara real
          </span>
        )}
        <span className={tracking === 'tracking' ? 'tracking-ok' : 'tracking-wait'}>
          {tracking === 'tracking' ? 'Tracking OK' : 'Reconociendo...'}
        </span>
        <span>{status}</span>
      </div>

      {/* Panel de diagnóstico (temporal) para ver por qué el modelo no responde. */}
      {showDebug && <div style={{ position: 'absolute', top: 74, left: 8, background: 'rgba(0,0,0,0.7)', color: '#3ee87a', font: '12px monospace', padding: '6px 9px', borderRadius: 6, zIndex: 9999, lineHeight: 1.5, pointerEvents: 'none' }}>
        <div style={{ color: '#8ab4f8' }}>build: {AR_BUILD}</div>
        <div>eventos pose: {hud.poseEvents} {hud.poseEvents === 0 ? '❌ NO llegan' : '✓'}</div>
        <div>aplicados: {hud.applied} {hud.applied === 0 && hud.poseEvents > 0 ? '⚠ apply FALLA' : ''}</div>
        <div>THREE: {hud.src} · track: {tracking}</div>
        <div>planos: {reticle.planes} · mira: {reticle.found ? (reticle.type || 'si') : 'no'}</div>
        <div style={{ color: arStats.frames === 0 ? '#ff6b6b' : '#3ee87a' }}>
          frames AR: {arStats.frames} {arStats.frames === 0 ? '❌ el bucle NO corre' : ''}
        </div>
        <div>motivo ARCore: {arStats.reason}</div>
        <div style={{ color: arStats.ts ? '#3ee87a' : '#ff6b6b' }}>
          camara ts: {String(arStats.ts)} · pinta: {String(arStats.cam)}
          {!arStats.ts ? ' ❌ SIN IMAGEN' : ''}
        </div>
        <div style={{ color: arStats.tex > 0 ? '#3ee87a' : '#ff6b6b' }}>
          textura camara: {String(arStats.tex)} {arStats.tex > 0 ? '' : '❌ no creada'}
        </div>
        {/* 'sesiones' debe ser 1 SIEMPRE. 2 = dos Session de ARCore peleandose
            la camara: es la firma exacta de 'ts 0 sin error'. */}
        {/* SONDA: fotogramas que Camera2 entrego a ESTA app antes de ARCore.
            >0 = el sistema si nos da imagen; <=0 = nos la niega a nosotros. */}
        <div style={{ color: (arStats.probe ?? 0) > 0 ? '#3ee87a' : '#ff6b6b' }}>
          sonda camara directa: {arStats.probe ?? '?'} fotogramas
          {(arStats.probe ?? 0) > 0 ? ' ✓ el sistema SI entrega' : ' ❌'}
        </div>
        <div>
          <button
            onClick={async () => {
              const l = await getDiagLog();
              setDiagLog(l || '(vacio)');
              console.log('[AR][LOG NATIVO] ' + l);
            }}
            style={{ marginTop: 4, padding: '3px 10px', borderRadius: 6, border: '1px solid #3a3f45', background: '#1b1f24', color: '#8ab4f8', fontSize: 11, pointerEvents: 'auto' }}
          >
            Ver log nativo
          </button>
        </div>
        {diagLog && (
          <pre style={{ maxHeight: 180, maxWidth: 300, overflow: 'auto', fontSize: 9, whiteSpace: 'pre-wrap', background: '#0008', padding: 6, borderRadius: 6, pointerEvents: 'auto' }}>
            {diagLog}
          </pre>
        )}
        <div style={{ color: (arStats.sesiones ?? 1) > 1 ? '#ff6b6b' : arStats.resumes > 1 ? '#f0b429' : '#3ee87a' }}>
          sesiones ARCore: {arStats.sesiones ?? '?'}{(arStats.sesiones ?? 1) > 1 ? ' ❌ DOBLE' : ''}
          {' '}· reanudada: {arStats.resumes} · camaras: {arStats.camCfgs}
        </div>
        {arStats.resumeError ? (
          <div style={{ color: '#ff6b6b', maxWidth: 260, wordBreak: 'break-word' }}>
            resume: {arStats.resumeError}
          </div>
        ) : null}
        {arStats.glError ? (
          <div style={{ color: '#ff6b6b', maxWidth: 260, wordBreak: 'break-word' }}>
            GL: {arStats.glError}
          </div>
        ) : null}
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
      {!anchored && !eligiendoModo && !calibrandoEsquina && (
        <div
          className="native-ar-tap-layer"
          onClick={handleTapPlace}
          style={{ position: 'fixed', inset: 0, bottom: 190, zIndex: 8 }}
          aria-label="Toca el piso para colocar el modelo"
        />
      )}
      {enCamara && (
        <div
          className={`native-ar-reticle${reticle.found ? ' is-found' : ''}`}
          data-kind={reticle.type || 'none'}
          aria-hidden="true"
        />
      )}
      {enCamara && !anchored && !calibrandoEsquina && (
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
      {/* ELEGIR MÉTODO — es lo primero que hace Revizto al entrar en AR, y es lo
          correcto: el operario decide, nada se coloca a sus espaldas. */}
      {eligiendoModo && !anchored && (
        /* Barra ABAJO y no un panel a pantalla completa: mientras se elige hay
           que poder girar y acercar el modelo para reconocer el sitio y buscar
           el rincon. Un modal encima lo impide, que es justo lo que estorbaba. */
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 8, background: 'linear-gradient(transparent, rgba(8,10,14,0.92) 38%)',
          pointerEvents: 'none', padding: '48px 16px 14px',
        }}>
          <div style={{ color: '#e9ecf1', fontSize: 15, fontWeight: 600 }}>
            Navega hasta tu punto y elige cómo referenciarte
          </div>
          {[
            {
              id: 'esquina', titulo: 'Por esquina',
              texto: 'Dos muros y el piso que se corten. El más preciso.',
              nota: 'Necesita superficies de 1 m × 1 m.',
            },
            {
              id: 'piso', titulo: 'Por piso',
              texto: 'Apunta al suelo y el modelo se apoya en él.',
              nota: 'Luego lo afinas con las flechas.',
            },
            {
              id: 'ninguna', titulo: 'Sin calibrar',
              texto: 'Colócalo a mano donde estás.',
              nota: 'En terreno abierto, sin rincones, es el único que funciona.',
            },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setModo(m.id);
                setEligiendoModo(false);
                // Por esquina NO se coloca solo: lo guía el asistente, que
                // primero pide las caras en el modelo y luego en la obra.
                autoPlaceRef.current = (m.id === 'piso');
                calibrandoRef.current = (m.id === 'esquina');
                setCalibrandoEsquina(m.id === 'esquina');
                // Por esquina se sigue EN EL MODELO: el asistente pide primero
                // las tres caras ahi. Los otros dos van directos a la camara.
                if (m.id !== 'esquina') modoCamaraRef.current?.entrar();
                if (m.id === 'ninguna') colocarSinCalibrar();
                else setStatus(m.id === 'esquina'
                  ? 'Escanea el rincón en la obra y luego señálalo en el modelo.'
                  : 'Apunta al piso y muévete despacio…');
              }}
              style={{
                width: 'min(420px, 92vw)', textAlign: 'left', cursor: 'pointer',
                background: 'rgba(20,23,28,0.94)', color: '#e9ecf1', pointerEvents: 'auto',
                border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12,
                padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{m.titulo}</div>
              <div style={{ fontSize: 12.5, color: '#aab3bf', marginTop: 2 }}>{m.texto}</div>
            </button>
          ))}
          <div style={{ color: '#7f8894', fontSize: 11, maxWidth: 420, textAlign: 'center' }}>
            El AR es una ayuda visual. Para medir o replantear, usa los métodos de siempre.
          </div>
          <button onClick={onExit} style={{
            pointerEvents: 'auto',
            marginTop: 2, background: 'none', border: 'none', color: '#98a1ad',
            fontSize: 13, cursor: 'pointer',
          }}>Salir</button>
        </div>
      )}

      {/* AJUSTAR: mover, elevar y girar. Vale tanto para colocar de cero como
          para corregir la deriva sin recalibrar entero. */}
      {calibrandoEsquina && !anchored && (
        <ArCornerPanel
          viewer={window.NOP_VIEWER}
          puente={detachRef.current}
          upm={unitsPerMeter}
          reticuloRef={reticuloRef}
          modoCamara={(v) => {
            if (v) modoCamaraRef.current?.entrar();
            else modoCamaraRef.current?.salir();
          }}
          mostrarModelo={(v) => { try { setModelsVisible(window.NOP_VIEWER, v); } catch { /* noop */ } }}
          onAplicar={(r) => {
            calibrandoRef.current = false;
            setCalibrandoEsquina(false);
            anchoredRef.current = true;
            setAnchored(true);
            setAjustando(true);
            const cm = (r.errorA10m * 100).toFixed(0);
            const extra = r.avisos && r.avisos.length ? ` ⚠ ${r.avisos[0]}.` : '';
            setStatus(`Modelo acomodado (≈ ${cm} cm de desvío a 10 m).${extra} Afina con las flechas si hace falta.`);
          }}
          onCancelar={() => {
            calibrandoRef.current = false;
            setCalibrandoEsquina(false);
            // Cancelar devuelve al visor normal, no a una pantalla negra.
            modoCamaraRef.current?.salir();
            setEligiendoModo(true);
            setModo(null);
            setStatus('Navega hasta donde vayas a referenciarte y elige cómo calibrar.');
          }}
        />
      )}

      {ajustando && anchored && (
        <ArAdjustPanel bridge={detachRef.current} onClose={() => setAjustando(false)} />
      )}

      {/* El pie tambien es del modo camara: mientras se navega el modelo, el
          selector y el asistente ya traen sus propios botones de salida, y
          "Colocar sin calibrar" seria un duplicado del selector. */}
      {enCamara && !calibrandoEsquina && <div className="native-ar-controls">
        {!anchored ? (
          <>
            <div className="native-ar-primary" style={{ background: '#1f2937', textAlign: 'center' }}>
              {reticle.planes > 0
                ? `${reticle.planes} superficie${reticle.planes === 1 ? '' : 's'} detectada${reticle.planes === 1 ? '' : 's'}`
                : 'Buscando superficies…'}
            </div>
            {/* Salida que SIEMPRE funciona: en terreno abierto puede no haber
                ni un plano que detectar, y sin esto el operario se queda
                mirando "buscando superficies" para siempre. */}
            <button className="native-ar-exit" onClick={colocarSinCalibrar}>
              Colocar sin calibrar
            </button>
          </>
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
              setEligiendoModo(true);      // vuelve a preguntar el método
              setStatus('¿Cómo quieres calibrar?');
            }}
            style={{ background: '#334155' }}
          >
            Calibrar
          </button>
        )}

        {/* Ajustar queda a mano SIEMPRE que haya modelo colocado: la deriva del
            SLAM aparece al caminar, y Revizto insiste en recalibrar/afinar al
            cambiar de zona. */}
        {anchored && !ajustando && (
          <button className="native-ar-exit" onClick={() => setAjustando(true)}>
            Ajustar
          </button>
        )}

        <button className="native-ar-exit" onClick={onExit}>Salir AR</button>
      </div>}
    </div>
  );
}
