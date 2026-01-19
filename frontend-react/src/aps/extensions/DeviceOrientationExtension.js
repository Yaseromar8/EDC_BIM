
// DeviceOrientationExtension.js
/* global Autodesk, THREE */

// --- INTERNAL TOOL CLASS ---
class GyroTool {
    constructor(viewer, extension) {
        this.viewer = viewer;
        this.extension = extension;
        this.names = ['gyro-tool'];
        this.active = false;
    }

    getNames() { return this.names; }
    getName() { return this.names[0]; }
    getPriority() { return 10000; }

    activate() { this.active = true; }
    deactivate() { this.active = false; }

    update() {
        if (!this.active || !this.extension.currentQuaternion) return false;

        // Force Camera Update
        this.viewer.impl.camera.quaternion.copy(this.extension.currentQuaternion);
        return true;
    }
}

// --- MAIN EXTENSION CLASS ---
export class DeviceOrientationExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.onOrientationEvent = this.onOrientationEvent.bind(this);
        this.onScreenOrientationChange = this.onScreenOrientationChange.bind(this);
        this.toggleGyro = this.toggleGyro.bind(this);
        this.onToolbarCreated = this.onToolbarCreated.bind(this);

        this.enabled = false;
        this.button = null;
        this.currentQuaternion = null;
        this.tool = new GyroTool(viewer, this);
    }

    load() {
        this.viewer.toolController.registerTool(this.tool);
        if (this.viewer.toolbar) {
            this.createUI();
        } else {
            this.viewer.addEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, this.onToolbarCreated);
        }
        return true;
    }

    unload() {
        this.deactivate();
        this.viewer.toolController.deregisterTool(this.tool);
        if (this.button) {
            const group = this.viewer.toolbar.getControl('modelTools') || this.viewer.toolbar.getControl('navTools');
            if (group) group.removeControl(this.button);
            this.button = null;
        }
        return true;
    }

    onToolbarCreated() {
        this.viewer.removeEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, this.onToolbarCreated);
        this.createUI();
    }

    createUI() {
        if (this.button) return;

        this.button = new Autodesk.Viewing.UI.Button('gyro-toggle-button');
        this.button.setToolTip('Giroscopio (Look Around)');
        // Using 'adsk-viewing-icon-eye' which looks like the "Look Around" eye/circle
        this.button.setIcon('adsk-viewing-icon-eye');
        this.button.onClick = this.toggleGyro;

        this.button.setState(this.enabled ? Autodesk.Viewing.UI.Button.State.ACTIVE : Autodesk.Viewing.UI.Button.State.INACTIVE);

        let group = this.viewer.toolbar.getControl('modelTools');
        if (!group) group = this.viewer.toolbar.getControl('navTools');
        if (group) group.addControl(this.button);
        else this.viewer.toolbar.addControl(this.button);
    }

    async toggleGyro() {
        if (this.enabled) {
            this.deactivate();
            alert("Giroscopio Desactivado");
        } else {
            alert("Intentando activar Giroscopio..."); // DEBUG ALERT

            // iOS Permission Check
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                try {
                    const response = await DeviceOrientationEvent.requestPermission();
                    if (response !== 'granted') {
                        alert("ERROR: Permiso denegado por el usuario.");
                        return;
                    }
                } catch (e) {
                    alert("ERROR solicitando permiso: " + e.message);
                    return;
                }
            }

            this.activate();
        }
    }

    activate() {
        if (this.enabled) return true;

        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) {
            alert("ERROR CRITICO: THREE.js no encontrado");
            return false;
        }

        // 1. Math Init
        this.zee = new THREE.Vector3(0, 0, 1);
        this.euler = new THREE.Euler();
        this.q0 = new THREE.Quaternion();
        this.q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
        this.screenOrientation = window.orientation || 0;

        if (!this.currentQuaternion) this.currentQuaternion = new THREE.Quaternion();
        this.currentQuaternion.copy(this.viewer.impl.camera.quaternion);

        // 2. Activate Tool
        this.viewer.toolController.activateTool('gyro-tool');

        // 3. Listeners
        window.addEventListener('deviceorientation', this.onOrientationEvent, false);
        window.addEventListener('orientationchange', this.onScreenOrientationChange, false);

        this.enabled = true;
        if (this.button) this.button.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);

        alert("Giroscopio ACTIVADO. Mueve tu dispositivo."); // DEBUG ALERT
        return true;
    }

    deactivate() {
        if (!this.enabled) return true;

        window.removeEventListener('deviceorientation', this.onOrientationEvent, false);
        window.removeEventListener('orientationchange', this.onScreenOrientationChange, false);

        this.viewer.toolController.deactivateTool('gyro-tool');

        this.enabled = false;
        if (this.button) this.button.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);

        return true;
    }

    onScreenOrientationChange() {
        this.screenOrientation = window.orientation || 0;
    }

    onOrientationEvent(event) {
        if (!this.enabled) return;

        // Check if we are receiving data
        if (event.alpha === null || event.alpha === undefined) {
            // Only alert ONCE to avoid spamming
            if (!this.hasWarnedNoData) {
                console.warn("Evento recibido pero sin datos (Alpha is null)");
                this.hasWarnedNoData = true;
            }
            return;
        }

        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) return;
        const MathUtils = THREE.MathUtils || THREE.Math;

        const alpha = MathUtils.degToRad(event.alpha);
        const beta = MathUtils.degToRad(event.beta);
        const gamma = MathUtils.degToRad(event.gamma);
        const orient = MathUtils.degToRad(this.screenOrientation);

        this.euler.set(beta, alpha, -gamma, 'YXZ');
        this.q0.setFromEuler(this.euler);
        this.q0.multiply(this.q1);

        const q2 = new THREE.Quaternion();
        q2.setFromAxisAngle(this.zee, -orient);
        this.q0.multiply(q2);

        if (!this.currentQuaternion) this.currentQuaternion = new THREE.Quaternion();
        this.currentQuaternion.copy(this.q0);
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('DeviceOrientationExtension', DeviceOrientationExtension);
