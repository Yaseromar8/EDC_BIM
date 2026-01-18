
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
    getPriority() { return 10000; } // SUPER High priority

    activate() {
        this.active = true;
    }

    deactivate() {
        this.active = false;
    }

    update() {
        // If not active or no data yet, let the viewer behave normally
        if (!this.active || !this.extension.currentQuaternion) return false;

        // FORCE CAMERA UPDATE EVERY FRAME
        // This prevents other tools (like First Person) from overwriting our rotation
        const camera = this.viewer.impl.camera;

        // 1. Apply the Quaternion derived from sensors
        // We copy it directly to ensure we are the source of truth for rotation
        camera.quaternion.copy(this.extension.currentQuaternion);

        // 2. Dirty the view so it renders
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
        this.debugEl = null;

        // Gyro Math State
        this.currentQuaternion = null;

        // Tool Instance
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
        this.button.setToolTip('Giroscopio (360)');
        this.button.setIcon('adsk-viewing-icon-orbit');
        this.button.onClick = this.toggleGyro;

        // Visual state sync
        this.button.setState(this.enabled ? Autodesk.Viewing.UI.Button.State.ACTIVE : Autodesk.Viewing.UI.Button.State.INACTIVE);

        let group = this.viewer.toolbar.getControl('modelTools');
        if (!group) group = this.viewer.toolbar.getControl('navTools');

        if (group) {
            group.addControl(this.button);
        } else {
            this.viewer.toolbar.addControl(this.button);
        }
    }

    async toggleGyro() {
        if (this.enabled) {
            this.deactivate();
        } else {
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                try {
                    const response = await DeviceOrientationEvent.requestPermission();
                    if (response !== 'granted') {
                        alert("Permiso denegado.");
                        return;
                    }
                } catch (e) {
                    console.error(e);
                }
            }
            this.activate();
        }
    }

    activate() {
        if (this.enabled) return true;

        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) return false;

        // 1. Math Init
        this.zee = new THREE.Vector3(0, 0, 1);
        this.euler = new THREE.Euler();
        this.q0 = new THREE.Quaternion();
        this.q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
        this.screenOrientation = window.orientation || 0;

        // Initialize currentQuaternion immediately to avoid startup jumps
        if (!this.currentQuaternion) this.currentQuaternion = new THREE.Quaternion();
        this.currentQuaternion.copy(this.viewer.impl.camera.quaternion);

        // 2. Activate Tool
        this.viewer.toolController.activateTool('gyro-tool');

        // 3. Listeners
        window.addEventListener('deviceorientation', this.onOrientationEvent, false);
        window.addEventListener('orientationchange', this.onScreenOrientationChange, false);

        // 4. Debug UI
        if (!this.debugEl) {
            this.debugEl = document.createElement('div');
            this.debugEl.style.cssText = `
                position: absolute; bottom: 80px; left: 10px; 
                padding: 4px 8px; background: rgba(0,0,0,0.5); 
                color: #0f0; font-size: 10px; font-family: monospace; 
                pointer-events: none; border-radius: 4px; z-index: 100;
            `;
            this.viewer.container.appendChild(this.debugEl);
        }
        this.debugEl.innerHTML = "GYRO: ACTIVE";

        this.enabled = true;
        if (this.button) this.button.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);

        return true;
    }

    deactivate() {
        if (!this.enabled) return true;

        window.removeEventListener('deviceorientation', this.onOrientationEvent, false);
        window.removeEventListener('orientationchange', this.onScreenOrientationChange, false);

        if (this.debugEl) {
            this.debugEl.remove();
            this.debugEl = null;
        }

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

        // Debug Data
        if (this.debugEl && event.alpha !== null) {
            this.debugEl.innerHTML = `GYRO: ${event.alpha.toFixed(1)} | ${event.beta.toFixed(1)}`;
        }

        if (event.alpha === null) return;

        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) return;
        const MathUtils = THREE.MathUtils || THREE.Math;

        // --- CALCULATION ---
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

        // --- STORE RESULT ---
        // We do NOT update camera here. We store it.
        // The Tool.update() loop will apply it effectively.
        if (!this.currentQuaternion) this.currentQuaternion = new THREE.Quaternion();
        this.currentQuaternion.copy(this.q0);
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('DeviceOrientationExtension', DeviceOrientationExtension);
