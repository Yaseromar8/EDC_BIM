
// DeviceOrientationExtension.js
/* global Autodesk, THREE */

export class DeviceOrientationExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.enabled = false;
        this.onOrientationEvent = this.onOrientationEvent.bind(this);
        this.onScreenOrientationChange = this.onScreenOrientationChange.bind(this);
        this.debugEl = null;
    }

    load() {
        return true;
    }

    unload() {
        this.deactivate();
        return true;
    }

    activate() {
        if (this.enabled) return true;

        // 1. SAFE ACCESS TO THREE.js
        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) {
            console.error("DeviceOrientationExtension: THREE.js not found!");
            return false;
        }

        // 2. DISABLE CONFLICTING TOOLS (CRITICAL)
        // Note: We do NOT set setIsLocked(true) because it freezes programmatic updates too.
        // We only deactivate the specific tools.
        const toolController = this.viewer.toolController;
        if (toolController) {
            toolController.deactivateTool('orbit');
            toolController.deactivateTool('pan');
            toolController.deactivateTool('zoom');
            toolController.deactivateTool('bifocal');
        }

        // 2.5 CREATE DEBUG OVERLAY (Vital for diagnosing sensor issues)
        if (!document.getElementById('gyro-debug')) {
            const d = document.createElement('div');
            d.id = 'gyro-debug';
            d.style.cssText = 'position:absolute; top:80px; left:10px; color:yellow; font-weight:bold; font-size:14px; z-index:99999; background:rgba(0,0,0,0.6); padding:8px; border-radius:4px; pointer-events:none; font-family:monospace;';
            d.innerHTML = 'Giroscopio: ESPERANDO DATOS...';
            this.viewer.container.appendChild(d);
            this.debugEl = d;
        }

        // 3. SETUP MATH
        this.zee = new THREE.Vector3(0, 0, 1);
        this.euler = new THREE.Euler();
        this.q0 = new THREE.Quaternion();
        this.q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around X

        // 4. ADD LISTENERS
        window.addEventListener('deviceorientation', this.onOrientationEvent, false);
        window.addEventListener('orientationchange', this.onScreenOrientationChange, false);

        this.enabled = true;
        this.screenOrientation = window.orientation || 0;

        // Force initial update
        this.viewer.impl.invalidate(true, true, true);

        console.log('DeviceOrientationExtension activated (Tools Disabled, Debug On)');
        return true;
    }

    deactivate() {
        if (!this.enabled) return true;

        // 1. REMOVE LISTENERS
        window.removeEventListener('deviceorientation', this.onOrientationEvent, false);
        window.removeEventListener('orientationchange', this.onScreenOrientationChange, false);

        // Remove debug
        if (this.debugEl) {
            this.debugEl.remove();
            this.debugEl = null;
        }

        // 2. RESTORE TOOLS
        const toolController = this.viewer.toolController;
        if (toolController) {
            toolController.activateTool('orbit'); // Default tool
            // Ensure lock is off
            this.viewer.navigation.setIsLocked(false);
        }

        this.enabled = false;
        console.log('DeviceOrientationExtension deactivated');
        return true;
    }

    onScreenOrientationChange() {
        this.screenOrientation = window.orientation || 0;
        this.viewer.impl.invalidate(true, true, true);
    }

    onOrientationEvent(event) {
        if (!this.enabled || !this.viewer) return;

        // Debug Update: If numbers change here, sensors work.
        if (this.debugEl) {
            const a = event.alpha ? Math.round(event.alpha) : 'null';
            const b = event.beta ? Math.round(event.beta) : 'null';
            const g = event.gamma ? Math.round(event.gamma) : 'null';
            this.debugEl.innerHTML = `Alpha:${a}<br>Beta:${b}<br>Gamma:${g}`;
        }

        // Access THREE inside loop just in case
        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) return;

        // Check for iOS null event (before permission)
        if (event.alpha === null && event.beta === null && event.gamma === null) return;

        // Robust Math Util (Some viewers utilize MathUtils, others Math)
        const MathUtils = THREE.MathUtils || THREE.Math;

        // Convert to Radians
        const alpha = event.alpha ? MathUtils.degToRad(event.alpha) : 0; // Z
        const beta = event.beta ? MathUtils.degToRad(event.beta) : 0;   // X'
        const gamma = event.gamma ? MathUtils.degToRad(event.gamma) : 0; // Y''

        const orient = this.screenOrientation ? MathUtils.degToRad(this.screenOrientation) : 0;

        // YXZ order is critical for device orientation logic
        this.euler.set(beta, alpha, -gamma, 'YXZ');
        this.q0.setFromEuler(this.euler);
        this.q0.multiply(this.q1);

        // Compensate for screen rotation
        const q2 = new THREE.Quaternion();
        q2.setFromAxisAngle(this.zee, -orient);
        this.q0.multiply(q2);

        // Apply to Camera
        const camera = this.viewer.impl.camera;
        camera.quaternion.copy(this.q0);

        // Render
        this.viewer.impl.invalidate(true, false, false);
    }
}

// Global Register
Autodesk.Viewing.theExtensionManager.registerExtension('DeviceOrientationExtension', DeviceOrientationExtension);
