
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
    getPriority() { return 10000; } // SUPER Priority

    activate() { this.active = true; }
    deactivate() { this.active = false; }

    update() {
        if (!this.active || !this.extension.currentQuaternion) return false;

        // DIRECT CONTROL: We overwrite the camera rotation every single frame
        const camera = this.viewer.impl.camera;
        camera.quaternion.copy(this.extension.currentQuaternion);
        camera.updateMatrixWorld(true); // Force update

        return true;
    }
}

// --- MAIN EXTENSION CLASS ---
export class DeviceOrientationExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.tool = new GyroTool(viewer, this);
        this.onOrientationEvent = this.onOrientationEvent.bind(this);
        this.onScreenOrientationChange = this.onScreenOrientationChange.bind(this);
        this.toggleGyro = this.toggleGyro.bind(this);
        this.onToolbarCreated = this.onToolbarCreated.bind(this);

        this.enabled = false;
        this.button = null;
        this.currentQuaternion = null;
        this.debugEl = null;

        // THREE.js objects
        this.zee = null;
        this.euler = null;
        this.q0 = null;
        this.q1 = null;
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
        this.viewer.toolController.deregisterTool(this.tool); // Unregister tool
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
        this.button.setIcon('adsk-viewing-icon-eye');
        this.button.onClick = this.toggleGyro;

        // Add to toolbar
        let group = this.viewer.toolbar.getControl('modelTools');
        if (!group) group = this.viewer.toolbar.getControl('navTools');
        if (group) group.addControl(this.button);
        else this.viewer.toolbar.addControl(this.button);
    }

    async toggleGyro() {
        if (this.enabled) {
            this.deactivate();
            // Restore default tool
            this.viewer.toolController.activateTool('orbit');
            // alert("Giroscopio OFF"); // Removing spam alerts
        } else {
            // alert("Activando modo inmersivo..."); 

            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                try {
                    const response = await DeviceOrientationEvent.requestPermission();
                    if (response !== 'granted') {
                        alert("Permiso de sensores denegado.");
                        return;
                    }
                } catch (e) {
                    // console.error(e);
                }
            }

            if (this.activate()) {
                // alert("Giroscopio ON"); // Confirm
            }
        }
    }

    activate() {
        if (this.enabled) return true;
        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) return false;

        // 1. Init Math
        if (!this.zee) {
            this.zee = new THREE.Vector3(0, 0, 1);
            this.euler = new THREE.Euler();
            this.q0 = new THREE.Quaternion();
            this.q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
        }

        // Initialize currentQuaternion from CURRENT camera view so it doesn't jump wildly
        if (!this.currentQuaternion) this.currentQuaternion = new THREE.Quaternion();
        this.currentQuaternion.copy(this.viewer.impl.camera.quaternion);

        // 2. EXCLUSIVE MODE: Deactivate other navigation tools to avoid conflict
        const tc = this.viewer.toolController;
        tc.deactivateTool('orbit');
        tc.deactivateTool('pan');
        tc.deactivateTool('zoom');
        tc.deactivateTool('bimwalk'); // Deactivate First Person too!

        // 3. Activate Gyro Tool
        tc.activateTool('gyro-tool');

        // 4. Listeners
        window.addEventListener('deviceorientation', this.onOrientationEvent, false);
        window.addEventListener('orientationchange', this.onScreenOrientationChange, false);

        // Debug Overlay (Optional, keeping it small)
        if (!this.debugEl) {
            this.debugEl = document.createElement('div');
            this.debugEl.style.cssText = 'position:absolute;bottom:80px;left:10px;color:lime;background:rgba(0,0,0,0.5);padding:2px;font-size:10px;pointer-events:none;';
            this.viewer.container.appendChild(this.debugEl);
        }
        this.debugEl.innerHTML = "GYRO: ON";
        this.debugEl.style.display = 'block';

        this.enabled = true;
        this.button.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
        return true;
    }

    deactivate() {
        if (!this.enabled) return true;

        window.removeEventListener('deviceorientation', this.onOrientationEvent, false);
        window.removeEventListener('orientationchange', this.onScreenOrientationChange, false);

        this.viewer.toolController.deactivateTool('gyro-tool');

        if (this.debugEl) this.debugEl.style.display = 'none';

        this.enabled = false;
        if (this.button) this.button.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);

        return true;
    }

    onScreenOrientationChange() {
        this.screenOrientation = window.orientation || 0;
    }

    onOrientationEvent(event) {
        if (!this.enabled) return;

        if (event.alpha === null) return;

        // Update Debug
        if (this.debugEl) this.debugEl.innerHTML = `Alpha: ${Math.round(event.alpha)}`;

        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
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

        // Store for the tool to apply
        this.currentQuaternion.copy(this.q0);
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('DeviceOrientationExtension', DeviceOrientationExtension);
