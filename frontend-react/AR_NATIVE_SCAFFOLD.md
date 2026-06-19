# AR nativo (ARCore) — Scaffold

Sándwich transparente: ARCore nativo dibuja la cámara DETRÁS del WebView
transparente; el modelo de Autodesk flota encima; la pose nativa maneja la
cámara del viewer. Reusa el modelo YA abierto (aislar subconjunto + re-originar
al anchor a escala 1:1).

## Archivos del scaffold
**Nativo (Android):**
- `android/.../ARCorePlugin.java` — plugin Capacitor: `start/stop/createAnchor`, emite `onCameraPose`/`onTracking`.
- `android/.../BackgroundRenderer.java` — quad GL con la textura de cámara de ARCore.
- `android/.../MainActivity.java` — registra el plugin.
- (ya existían) ARCore en `app/build.gradle`, permisos + features AR + `com.google.ar.core` en el manifest, `backgroundColor:#00000000` en `capacitor.config.json`.

**Web (JS):**
- `src/native/arcore.js` — puente: `startSession/stopSession/createAnchor/onCameraPose`. `isNativeAR()` decide nativo vs WebXR.
- `src/native/arViewerBridge.js` — `attachArToViewer(viewer, opts)`: convierte la pose en la cámara de Three/LMV. Devuelve `detach()`.

## Lo que haces tú (en tu máquina, con device)
```
cd frontend-react
npm run build
npx cap sync android
npx cap open android        # Android Studio
```
Compila el APK, instálalo en un celular con ARCore, y reporta qué ves.

## Flujo a cablear en ARView.jsx (pendiente, siguiente paso)
```js
import { isNativeAR, startSession, createAnchor } from '../native/arcore';
import { attachArToViewer } from '../native/arViewerBridge';

if (isNativeAR()) {
  await startSession();                 // arranca cámara nativa
  const off = model.getGlobalOffset();  // re-origen del modelo abierto
  const detach = attachArToViewer(viewer, { modelOffset: off, scale: 1 });
  // botón "Anclar aquí": const { matrix } = await createAnchor();  -> pasar como anchorMatrix
} else {
  // ...camino WebXR actual (navegador)...
}
```

## Puntos que se afinan SOLO en device (marcados [TUNE] en el código)
1. **Ejes/escala**: convención Y-up de ARCore vs Three; escala modelo→metros. Si el modelo sale rotado/gigante/chico, se ajusta en `arViewerBridge.js`.
2. **Re-origen al anchor**: que el modelo quede pegado al punto físico sin drift. Es el problema duro (coords UTM en millones → origen local).
3. **near/far + FOV** de la proyección (en `ARCorePlugin.getProjectionMatrix`).
4. **Fluidez**: si el bridge a 60fps da jank, bajar a 30fps o thinear la pose.

## Realidad
El primer build casi seguro tirará errores (versión ARCore SDK, gradle, imports).
Es normal: pásame el error del compilador y lo corrijo. La alineación fina la
iteramos con tu reporte desde el celular — yo escribo a ciegas, tú eres los ojos.
