
// DeviceOrientationExtension.js
/* global Autodesk, THREE */

export class DeviceOrientationExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.enabled = false;
        this.onOrientationEvent = this.onOrientationEvent.bind(this);
        this.onScreenOrientationChange = this.onScreenOrientationChange.bind(this);
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
        const toolController = this.viewer.toolController;
        if (toolController) {
            toolController.deactivateTool('orbit');
            toolController.deactivateTool('pan');
            toolController.deactivateTool('zoom');
            toolController.deactivateTool('bifocal');
            // Lock navigation to prevent touch gestures from overriding gyro
            this.viewer.navigation.setIsLocked(true);
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

        console.log('DeviceOrientationExtension activated (Tools Disabled)');
        return true;
    }

    deactivate() {
        if (!this.enabled) return true;

        // 1. REMOVE LISTENERS
        window.removeEventListener('deviceorientation', this.onOrientationEvent, false);
        window.removeEventListener('orientationchange', this.onScreenOrientationChange, false);

        // 2. RESTORE TOOLS
        const toolController = this.viewer.toolController;
        if (toolController) {
            toolController.activateTool('orbit'); // Default tool
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

        // Access THREE inside loop just in case
        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) return;

        // Check for iOS null event (before permission)
        if (event.alpha === null && event.beta === null && event.gamma === null) return;

        // Convert to Radians
        const alpha = event.alpha ? THREE.Math.degToRad(event.alpha) : 0; // Z
        const beta = event.beta ? THREE.Math.degToRad(event.beta) : 0;   // X'
        const gamma = event.gamma ? THREE.Math.degToRad(event.gamma) : 0; // Y''

        const orient = this.screenOrientation ? THREE.Math.degToRad(this.screenOrientation) : 0;

        // YXZ order is critical for device orientation
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
