// arcore.js — Puente JS hacia el plugin nativo de ARCore (Capacitor).
//
// Arquitectura "sándwich transparente":
//   - El plugin nativo (Kotlin/Java) arranca ARCore, dibuja la cámara a 60fps
//     en una GLSurfaceView DETRÁS del WebView, y emite la pose por frame.
//   - El WebView (esta app) tiene fondo transparente: el modelo de Autodesk se
//     renderiza en su canvas FLOTANDO sobre la cámara real.
//   - Aquí recibimos la pose y sobreescribimos la cámara del viewer de Autodesk.
//
// En navegador (no nativo) el plugin no existe: el llamador debe caer al camino
// WebXR. Usa `isNativeAR()` para decidir.

import { registerPlugin, Capacitor } from '@capacitor/core';
import { simActivo, simSubscribe, simStart, simStop, simAnchor } from './arSim';

// MODO SIMULADO (?arsim=1): el plugin nativo se sustituye por una fuente de
// datos sintéticos con la MISMA forma. Sirve para desarrollar y probar todo el
// flujo de AR —calibración, ajuste, interfaz, residuos— en la laptop, sin
// tablet y sin compilar un APK por cada cambio. La capa nativa es un sensor;
// todo lo demás es lógica que no tiene por qué depender de él para probarse.
// Sin plataforma nativa NO EXISTE otra fuente de poses, así que el simulador
// no es un modo de pruebas escondido: es lo único que puede alimentar el AR en
// un navegador. Antes, no darse cuenta de esto obligaba a mantener un segundo
// AR web —vídeo de la webcam detrás del modelo, sin seguimiento— que no era
// realidad aumentada sino un fondo de foto: al girar la cámara no se movía
// nada. Con esto hay UN SOLO AR.
const SIM = simActivo() || !isNativeAR();

/** ¿Las poses vienen del simulador y no de un sensor real? */
export function esSimulado() { return SIM; }

// Se re-exporta para que App decida montar el AR nativo en el navegador.
export { simActivo };

// El nombre 'ARCore' debe coincidir con @CapacitorPlugin(name = "ARCore") en Kotlin/Java.
const ARCore = registerPlugin('ARCore');

export function isNativeAR() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

// TESTIGO DE SESIÓN. En desarrollo React monta los efectos DOS veces
// (montar → limpiar → montar). El efecto del PRIMER montaje se queda dormido
// en su `await startSession()`, despierta DESPUÉS de que el segundo ya arrancó
// su sesión, ve su propio `cancelled` y llama a stopSession() — apagando una
// sesión que no es la suya. Síntoma: cero poses y cero latidos, con el estado
// de seguimiento en 'tracking' porque ese llega por otra vía.
//
// startSession devuelve un testigo; stopSession(testigo) solo apaga si ese
// testigo sigue siendo el de la sesión viva. Sin testigo, apaga siempre — que
// es lo que quiere quien sale del AR a propósito.
let sesionActual = 0;
// UNA sola sesion nativa. En desarrollo React monta los efectos dos veces y
// ambos montajes llaman a startSession; sin esto llegaban DOS start() al
// plugin y se creaban dos Session de ARCore peleandose la camara.
let arranqueNativo = null;

// ── API de alto nivel ───────────────────────────────────────────────
// startSession: arranca ARCore + cámara transparente. Resuelve cuando la
// sesión está activa (o rechaza si el device no soporta ARCore / sin permiso).
export async function startSession() {
  const testigo = ++sesionActual;
  if (SIM) { simStart(); return { simulado: true, testigo }; }
  if (!arranqueNativo) arranqueNativo = ARCore.start();
  const r = await arranqueNativo;
  return { ...(r || {}), testigo };
}

export async function stopSession(testigo) {
  // Acepta el testigo suelto o el objeto que devolvió startSession.
  const t = (testigo && typeof testigo === 'object') ? testigo.testigo : testigo;
  if (t != null && t !== sesionActual) return;   // no es mi sesión: no la toco
  if (SIM) { simStop(); return; }
  arranqueNativo = null;
  try { return await ARCore.stop(); } catch (e) { /* noop */ }
}

// createAnchor: fija el mundo en la pose actual de la cámara (o en un hit-test
// central). Devuelve { anchorId }. El modelo se bloquea contra este anchor.
export async function createAnchor(opts = {}) {
  if (SIM) return simAnchor();
  return ARCore.createAnchor(opts);
}

// onCameraPose: suscribe el stream de poses (matriz de vista + proyección).
// Devuelve una función para desuscribir.
export function onCameraPose(handler) {
  if (SIM) return simSubscribe('onCameraPose', handler);
  const sub = ARCore.addListener('onCameraPose', handler);
  return () => { sub.then(s => s.remove()).catch(() => {}); };
}

// onTracking: estado del tracking ('tracking' | 'paused' | 'stopped') + razón.
export function onTracking(handler) {
  if (SIM) return simSubscribe('onTracking', handler);
  const sub = ARCore.addListener('onTracking', handler);
  return () => { sub.then(s => s.remove()).catch(() => {}); };
}

// ── GPS + brújula (AR geoespacial) ──────────────────────────────────────────
// El plugin nativo emite 'onGeoPose' con la posición y el rumbo del celular:
//   { lat, lon, alt, accuracy (m), heading (grados norte verdadero), hasHeading }
// Guardamos SIEMPRE la última pose para poder anclar al instante cuando el
// operario toca "Orientarme por GPS", sin esperar el siguiente tick del GPS.
let _lastGeoPose = null;

export function onGeoPose(handler) {
  // Era la ÚNICA suscripción sin guarda de simulador, y en web el plugin no
  // existe: Capacitor rechazaba la promesa y el error subía sin catch a la
  // consola. El simulador no emite GPS a propósito —una laptop no tiene— y el
  // panel lo dice honesto: "GPS: sin señal".
  if (SIM) return () => {};
  const sub = ARCore.addListener('onGeoPose', (data) => {
    _lastGeoPose = data;
    handler(data);
  });
  return () => { sub.then(s => s.remove()).catch(() => {}); };
}

// Última pose GPS conocida (o null si aún no llega ninguna).
export function getLastGeoPose() {
  return _lastGeoPose;
}

// Ancla en la POSE ACTUAL de la cámara (sin hit-test de superficie). Robusto en
// terreno abierto —tierra/pasto del canal— donde la detección de plano falla.
export async function createAnchorAtCamera(opts = {}) {
  if (SIM) return simAnchor();
  return ARCore.createAnchorAtCamera(opts);
}

// onReticle: hit-test del punto de mira, 10 veces por segundo.
//   { found: bool, matrix?: number[16] (pose del piso), type?: 'plane'|'point',
//     planes: número de superficies de PISO reconocidas y dibujadas }
// Con esto la web dibuja el anillo sobre la superficie detectada — el usuario
// ve DÓNDE va a caer el modelo antes de anclar — y sabe si ARCore ya reconoció
// terreno suficiente como para colocar el modelo sin que nadie toque nada.
export function onReticle(handler) {
  if (SIM) return simSubscribe('onReticle', handler);
  const sub = ARCore.addListener('onReticle', handler);
  return () => { sub.then(s => s.remove()).catch(() => {}); };
}

// setAimPoint: punto de pantalla (px) al que apunta el retículo y donde
// anclará createAnchor. Negativo = centro de la pantalla.
export async function setAimPoint(x = -1, y = -1) {
  try { return await ARCore.setAimPoint({ x, y }); } catch { return null; }
}

// setPlanesVisible: enciende/apaga la MALLA DE ESCANEO — la rejilla cian que el
// plugin dibuja sobre las superficies que ARCore va reconociendo. Se apaga al
// colocar el modelo: ya cumplió su función y solo ensuciaría la vista de obra.
export async function setPlanesVisible(visible) {
  try { return await ARCore.setPlanesVisible({ visible: !!visible }); } catch { return null; }
}

// onArStats: latido 1 Hz con { frames, state, reason }. `frames` dice si el
// bucle de dibujo corre siquiera; `reason` es el motivo que da ARCore para no
// rastrear (poca luz, poca textura, movimiento excesivo, camara ocupada...).
export function onArStats(handler) {
  if (SIM) return simSubscribe('onArStats', handler);
  const sub = ARCore.addListener('onArStats', handler);
  return () => { sub.then(s => s.remove()).catch(() => {}); };
}

// Últimas líneas del log del propio proceso: ahí ARCore escribe el motivo
// real de un fallo de cámara que su API no reporta.
export async function getDiagLog() {
  if (SIM) return 'ensayo: sin log nativo (no hay plugin en el navegador)';
  try {
    const r = await ARCore.getDiagLog();
    return (r && r.log) || '';
  } catch (e) {
    return 'sin log: ' + String((e && e.message) || e);
  }
}

export default ARCore;
