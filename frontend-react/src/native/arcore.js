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

// El nombre 'ARCore' debe coincidir con @CapacitorPlugin(name = "ARCore") en Kotlin/Java.
const ARCore = registerPlugin('ARCore');

export function isNativeAR() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

// ── API de alto nivel ───────────────────────────────────────────────
// startSession: arranca ARCore + cámara transparente. Resuelve cuando la
// sesión está activa (o rechaza si el device no soporta ARCore / sin permiso).
export async function startSession() {
  return ARCore.start();
}

export async function stopSession() {
  try { return await ARCore.stop(); } catch (e) { /* noop */ }
}

// createAnchor: fija el mundo en la pose actual de la cámara (o en un hit-test
// central). Devuelve { anchorId }. El modelo se bloquea contra este anchor.
export async function createAnchor(opts = {}) {
  return ARCore.createAnchor(opts);
}

// onCameraPose: suscribe el stream de poses (matriz de vista + proyección).
// Devuelve una función para desuscribir.
export function onCameraPose(handler) {
  const sub = ARCore.addListener('onCameraPose', handler);
  return () => { sub.then(s => s.remove()).catch(() => {}); };
}

// onTracking: estado del tracking ('tracking' | 'paused' | 'stopped') + razón.
export function onTracking(handler) {
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
  return ARCore.createAnchorAtCamera(opts);
}

export default ARCore;
