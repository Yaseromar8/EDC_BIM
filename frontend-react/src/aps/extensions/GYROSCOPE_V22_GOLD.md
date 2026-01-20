---
name: Giroscopio AR V22 (Slerp Smooth)
description: Documentación técnica de la versión estable del control por giroscopio.
---

# 📱 Giroscopio AR V22: "Zenith Robust + Slerp Smooth"

Esta versión es el "Gold Standard" actual del proyecto. 
Resuelve el problema del **Gimbal Lock** (bloqueo al mirar arriba/abajo) manteniendo una navegación fluida y alineada con el Norte Magnético.

## 🏗️ Arquitectura Técnica

### 1. Núcleo Matemático (Canonical Quaternion)
A diferencia de las versiones antiguas que intentaban mapear ejes manualmente (`camera.x = device.beta`), esta versión usa **Matemáticas de Cuaterniones Puros**.

*   **¿Por qué?** Los ángulos de Euler (grados X, Y, Z) sufren de "Bloqueo de Gimbal" cuando dos ejes se alinean (ej. al mirar totalmente arriba). Los cuaterniones son vectores de 4 dimensiones que no sufren este problema.
*   **Proceso:**
    1.  Leemos `Alpha` (Brújula), `Beta` (Inclinación), `Gamma` (Rotación).
    2.  Creamos un Cuaternión de Dispositivo (`sensorQ`) en orden `YXZ`.
    3.  Rotamos -90° en X para adaptar el sistema de coordenadas del móvil al de la cámara 3D.
    4.  Ajustamos la rotación de pantalla (Landscape/Portrait).

### 2. Sistema de Calibración ("Tare Logic")
Para que el usuario pueda usar el giroscopio cómodamente sin tener que girar físicamente todo su cuerpo para alinearse con el modelo, implementamos un **"Tare" (Tara)** inteligente al activar.

*   **¿Cómo funciona?**
    *   Al activar, calculamos la **Diferencia (Delta)** entre:
        *   Dónde está mirando la cámara actualmente (Mundo Virtual).
        *   Dónde está apuntando el móvil (Mundo Físico).
    *   Guardamos esa diferencia en `this.alignmentQ`.
    *   En cada frame posterior, aplicamos: `RotaciónFinal = Delta * RotaciónSensor`.
*   **Resultado:** El usuario mantiene su horizonte y su norte relativo sin saltos bruscos al activar.

### 3. Filtro de Suavizado (V22 Slerp)
Esta es la clave de la sensación "Premium" y la estabilidad.

*   **Problema:** Los sensores del móvil son ruidosos. Al mirar totalmente abajo (Nadir), la brújula se vuelve loca, causando saltos rápidos.
*   **Solución:** Usamos **SLERP (Spherical Linear Interpolation)** con un factor de `0.2` (donde 1.0 es instantáneo).
*   **Efecto:** La cámara no "salta" a la nueva posición, sino que se "desliza" hacia ella rápidamente. Esto actúa como un **Filtro Paso Bajo**, eliminando el ruido del sensor y dando peso cinematográfico al movimiento.

## 📝 Resumen de Código Clave

```javascript
// A. Obtener Cuaternión Puro del Sensor
euler.set(beta, alpha, -gamma, 'YXZ');
const sensorQ = new THREE.Quaternion().setFromEuler(euler);

// B. Aplicar Calibración (Alignment)
// Final = DiferenciaInicial * SensorActual
this.finalQuaternion.multiplyQuaternions(this.alignmentQ, sensorQ);

// C. Suavizado (La Magia de V22)
// Interpolamos suavemente (20% por frame) hacia el objetivo
const smoothFactor = 0.2; 
this.currentSmoothedQuaternion.slerp(this.finalQuaternion, smoothFactor);

// D. Aplicar a Cámara
this.viewer.navigation.setCameraUpVector(up); // Up vector derivado del cuaternión
this.viewer.navigation.setView(pos, target);
```

## ✅ Qué Logra Esta Versión
1.  **Mirar al Techo (Zenith):** Perfecto. No hay saltos ni inversiones de ejes.
2.  **Alineación Norte:** Respeta el norte magnético relativo al inicio.
3.  **Estabilidad:** El filtro SLERP elimina el temblor natural de la mano y los errores del sensor al mirar al suelo.
4.  **Recuperación:** Si el sensor falla momentáneamente, el suavizado esconde el error.

---
**ESTADO:** 🟡 **GOLD / PRODUCCIÓN**
**COMMIT ID:** `ef53b09` (aproximado)
