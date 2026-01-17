
// DeviceOrientationExtension.js
// Based on: https://github.com/wallabyway/deviceOrientationExt
// Adapted for modern APS Viewer & React

/* global Autodesk, THREE */

export class DeviceOrientationExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.enabled = false;
        this.onOrientationEvent = this.onOrientationEvent.bind(this);
        this.onScreenOrientationChange = this.onScreenOrientationChange.bind(this);
    }

    load() {
        console.log('DeviceOrientationExtension loaded');
        return true;
    }

    unload() {
        this.deactivate();
        return true;
    }

    activate() {
        if (this.enabled) return;

        // Setup initial math
        this.zee = new THREE.Vector3(0, 0, 1);
        this.euler = new THREE.Euler();
        this.q0 = new THREE.Quaternion();
        this.q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around X

        window.addEventListener('deviceorientation', this.onOrientationEvent, false);
        window.addEventListener('orientationchange', this.onScreenOrientationChange, false);

        this.enabled = true;

        // Force a screen orientation check
        this.screenOrientation = window.orientation || 0;

        console.log('DeviceOrientationExtension activated');
        return true;
    }

    deactivate() {
        if (!this.enabled) return;

        window.removeEventListener('deviceorientation', this.onOrientationEvent, false);
        window.removeEventListener('orientationchange', this.onScreenOrientationChange, false);
        this.enabled = false;
        console.log('DeviceOrientationExtension deactivated');
        return true;
    }

    onScreenOrientationChange() {
        this.screenOrientation = window.orientation || 0;
    }

    onOrientationEvent(event) {
        if (!this.enabled || !this.viewer) return;

        // Validar datos
        if (!event.alpha && !event.beta && !event.gamma) return;

        // Convertir a Radianes
        const alpha = event.alpha ? THREE.Math.degToRad(event.alpha) : 0; // Z
        const beta = event.beta ? THREE.Math.degToRad(event.beta) : 0;   // X'
        const gamma = event.gamma ? THREE.Math.degToRad(event.gamma) : 0; // Y''

        const orient = this.screenOrientation ? THREE.Math.degToRad(this.screenOrientation) : 0;

        // Matemáticas estándar de DeviceOrientation (WallabyWay Implementation)
        this.euler.set(beta, alpha, -gamma, 'YXZ');
        this.q0.setFromEuler(this.euler);
        this.q0.multiply(this.q1);

        // Compensar rotación de pantalla
        const q2 = new THREE.Quaternion();
        q2.setFromAxisAngle(this.zee, -orient);
        this.q0.multiply(q2);

        // Aplicar a la cámara
        const camera = this.viewer.impl.camera;
        camera.quaternion.copy(this.q0);

        // Importante: No mover la posición, solo rotación
        this.viewer.impl.invalidate(true, false, false);
    }
}

// Registro global para que el Viewer la encuentre
Autodesk.Viewing.theExtensionManager.registerExtension('DeviceOrientationExtension', DeviceOrientationExtension);
