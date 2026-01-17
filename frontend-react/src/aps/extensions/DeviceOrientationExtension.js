
// DeviceOrientationExtension.js
/* global Autodesk, THREE */

// --- INTERNAL TOOL CLASS ---
// This ensures our camera updates happen INSIDE the Viewer's render loop.
class GyroTool {
    constructor(viewer, extension) {
        this.viewer = viewer;
        this.extension = extension;
        this.names = ['gyro-tool'];
        this.active = false;
    }

    getNames() {
        return this.names;
    }

    getName() {
        return this.names[0];
    }

    activate() {
        this.active = true;
    }

    deactivate() {
        this.active = false;
    }

    // This runs EVERY FRAME (60fps)
    update() {
        if (!this.active || !this.extension.currentQuaternion) return false;

        // Apply the latest quaternion calculated from sensors
        const camera = this.viewer.impl.camera;
        camera.quaternion.copy(this.extension.currentQuaternion);

        // Mark scene as dirty so it redraws
        this.viewer.impl.invalidate(false, false, false); // Light update

        return true; // We handled the update
    }
}

// --- MAIN EXTENSION CLASS ---
export class DeviceOrientationExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.tool = new GyroTool(viewer, this);
        this.onOrientationEvent = this.onOrientationEvent.bind(this);
        this.onScreenOrientationChange = this.onScreenOrientationChange.bind(this);

        this.currentQuaternion = null; // Store latest rotation here
        this.enabled = false;
        this.debugEl = null;
    }

    load() {
        // Register the tool with the viewer's controller
        this.viewer.toolController.registerTool(this.tool);
        return true;
    }

    unload() {
        this.deactivate();
        this.viewer.toolController.deregisterTool(this.tool);
        return true;
    }

    activate() {
        if (this.enabled) return true;

        // 1. SAFE ACCESS TO THREE
        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) {
            console.error("DeviceOrientationExtension: THREE.js not found!");
            return false;
        }

        // 2. ACTIVATE OUR TOOL
        // This puts us in the driver's seat
        this.viewer.toolController.activateTool('gyro-tool');

        // 3. DISABLE STANDARD NAVIGATION TOOLS
        // We deactivate them to prevent fighting
        const toolController = this.viewer.toolController;
        if (toolController) {
            toolController.deactivateTool('orbit');
            toolController.deactivateTool('pan');
            toolController.deactivateTool('zoom');
            toolController.deactivateTool('bifocal');
        }

        // 4. SETUP HELPERS
        this.zee = new THREE.Vector3(0, 0, 1);
        this.euler = new THREE.Euler();
        this.q0 = new THREE.Quaternion();
        this.q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around X
        this.currentQuaternion = new THREE.Quaternion(); // Init container

        // 5. DEBUG OVERLAY
        if (!document.getElementById('gyro-debug')) {
            const d = document.createElement('div');
            d.id = 'gyro-debug';
            d.style.cssText = 'position:absolute; top:80px; left:10px; color:yellow; font-weight:bold; font-size:14px; z-index:99999; background:rgba(0,0,0,0.6); padding:8px; border-radius:4px; pointer-events:none; font-family:monospace;';
            d.innerHTML = 'Giroscopio: ACTIVO (Tool Mode)';
            this.viewer.container.appendChild(d);
            this.debugEl = d;
        }

        // 6. LISTENERS
        window.addEventListener('deviceorientation', this.onOrientationEvent, false);
        window.addEventListener('orientationchange', this.onScreenOrientationChange, false);

        this.enabled = true;
        this.screenOrientation = window.orientation || 0;

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

        // Deactivate Tool
        this.viewer.toolController.deactivateTool('gyro-tool');

        // Reactivate Orbit
        const toolController = this.viewer.toolController;
        if (toolController) {
            toolController.activateTool('orbit');
        }

        this.enabled = false;
        return true;
    }

    onScreenOrientationChange() {
        this.screenOrientation = window.orientation || 0;
    }

    onOrientationEvent(event) {
        if (!this.enabled) return;

        // Debug Update
        if (this.debugEl) {
            const a = event.alpha ? Math.round(event.alpha) : 'N';
            const b = event.beta ? Math.round(event.beta) : 'N';
            const g = event.gamma ? Math.round(event.gamma) : 'N';
            this.debugEl.innerHTML = `Alpha:${a}<br>Beta:${b}<br>Gamma:${g}<br>Tool:${this.tool.active}`;
        }

        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) return;
        if (event.alpha === null) return;

        const MathUtils = THREE.MathUtils || THREE.Math;

        // Calculate Rotation
        const alpha = event.alpha ? MathUtils.degToRad(event.alpha) : 0;
        const beta = event.beta ? MathUtils.degToRad(event.beta) : 0;
        const gamma = event.gamma ? MathUtils.degToRad(event.gamma) : 0;

        const orient = this.screenOrientation ? MathUtils.degToRad(this.screenOrientation) : 0;

        this.euler.set(beta, alpha, -gamma, 'YXZ');
        this.q0.setFromEuler(this.euler);
        this.q0.multiply(this.q1);

        const q2 = new THREE.Quaternion();
        q2.setFromAxisAngle(this.zee, -orient);
        this.q0.multiply(q2);

        // STORE result in 'currentQuaternion'
        // The Tool.update() loop will apply this to the camera on the next frame
        if (this.currentQuaternion) {
            this.currentQuaternion.copy(this.q0);
        }
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('DeviceOrientationExtension', DeviceOrientationExtension);
