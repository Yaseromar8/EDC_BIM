
// DeviceOrientationExtension.js
// Based on: https://github.com/wallabyway/deviceOrientationExt
// Adapted for modern APS Viewer & React

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

        // SAFE ACCESS TO THREE.js
        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) {
            console.error("DeviceOrientationExtension: THREE.js not found!");
            return false;
        }

        // Setup initial math
        this.zee = new THREE.Vector3(0, 0, 1);
        this.euler = new THREE.Euler();
        this.q0 = new THREE.Quaternion();
        this.q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around X

        // Listeners
        window.addEventListener('deviceorientation', this.onOrientationEvent, false);
        window.addEventListener('orientationchange', this.onScreenOrientationChange, false);

        this.enabled = true;
        this.screenOrientation = window.orientation || 0;

        // Force initial update
        this.viewer.impl.invalidate(true, true, true);

        console.log('DeviceOrientationExtension activated');
        return true;
    }

    deactivate() {
        if (!this.enabled) return;
        window.removeEventListener('deviceorientation', this.onOrientationEvent, false);
        window.removeEventListener('orientationchange', this.onScreenOrientationChange, false);
        this.enabled = false;
        return true;
    }

    onScreenOrientationChange() {
        this.screenOrientation = window.orientation || 0;
    }

    onOrientationEvent(event) {
        if (!this.enabled || !this.viewer) return;

        // Access THREE inside loop just in case
        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) return;

        // Validar datos básicos
        if (event.alpha === null || event.beta === null || event.gamma === null) return;

        // Convertir a Radianes
        const alpha = THREE.Math.degToRad(event.alpha); // Z
        const beta = THREE.Math.degToRad(event.beta);   // X'
        const gamma = THREE.Math.degToRad(event.gamma); // Y''

        const orient = this.screenOrientation ? THREE.Math.degToRad(this.screenOrientation) : 0;

        // Matemáticas estándar
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

        // Renderizar
        this.viewer.impl.invalidate(true, false, false);
    }
}

// Registro global
Autodesk.Viewing.theExtensionManager.registerExtension('DeviceOrientationExtension', DeviceOrientationExtension);
