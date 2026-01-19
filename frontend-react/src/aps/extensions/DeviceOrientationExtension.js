
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
        if (!this.active || !this.extension.finalQuaternion) return false;

        // DIRECT CONTROL: Overwrite camera rotation
        const camera = this.viewer.impl.camera;
        camera.quaternion.copy(this.extension.finalQuaternion);
        camera.updateMatrixWorld(true);

        // Force Viewer Update
        this.viewer.impl.invalidate(false, false, false);
        return true;
    }

    // Consume all inputs to prevent conflicts
    handleSingleClick() { return true; }
    handleDoubleClick() { return true; }
    handleMouseMove() { return true; }
    handleGesture() { return true; }
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
        this.debugEl = null;

        // Math state
        this.finalQuaternion = null;
        this.deviceQuaternion = new THREE.Quaternion();
        this.initialCameraQuaternion = new THREE.Quaternion();
        this.initialDeviceQuaternion = new THREE.Quaternion(); // The 'Tare' or Offset
        this.isCalibrated = false;

        // THREE reusable objects
        this.zee = new THREE.Vector3(0, 0, 1);
        this.euler = new THREE.Euler();
        this.q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
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
            this.viewer.toolController.activateTool('orbit'); // Restore default
        } else {
            // iOS Init
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                try {
                    const response = await DeviceOrientationEvent.requestPermission();
                    if (response !== 'granted') {
                        alert("Permiso denegado.");
                        return;
                    }
                } catch (e) { }
            }
            this.activate();
        }
    }

    activate() {
        if (this.enabled) return true;
        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        if (!THREE) return false;

        // 1. Reset Calibration
        this.isCalibrated = false;

        // 2. EXCLUSIVE MODE: Deactivate others
        const tc = this.viewer.toolController;
        tc.deactivateTool('orbit');
        tc.deactivateTool('pan');
        tc.deactivateTool('zoom');
        tc.deactivateTool('bimwalk');

        // 3. Activate Gyro Tool
        tc.activateTool('gyro-tool');

        // --- LOCK DEFAULT NAVIGATION ---
        // This stops Orbit/Pan from resetting the camera every frame
        if (this.viewer.navigation) {
            this.viewer.navigation.setIsLocked(true);
        }

        // 4. Listeners
        if (window.DeviceOrientationEvent) {
            window.addEventListener('deviceorientation', this.onOrientationEvent, false);
        }
        window.addEventListener('orientationchange', this.onScreenOrientationChange, false);
        this.screenOrientation = window.orientation || 0;

        // Debug Overlay - Enhanced
        if (!this.debugEl) {
            this.debugEl = document.createElement('div');
            this.debugEl.style.cssText = `
                position: absolute;
                bottom: 150px;
                left: 20px;
                color: #FF00FF; /* MAGENTA - VISUAL CONFIRMATION OF NEW VERSION */
                background: rgba(255, 255, 255, 0.9);
                padding: 10px;
                font-family: monospace;
                font-size: 14px;
                font-weight: bold;
                pointer-events: none;
                z-index: 1000;
                border-radius: 8px;
                min-width: 200px;
                border: 2px solid #FF00FF;
            `;
            this.viewer.container.appendChild(this.debugEl);
        }
        this.debugEl.style.display = 'block';

        // Initial Debug State
        const apiStatus = window.DeviceOrientationEvent ? "AVAILABLE" : "MISSING";
        const httpsStatus = window.isSecureContext ? "SECURE" : "NOT SECURE";
        this.debugEl.innerHTML = `
            <b>GYRO DEBUG</b><br/>
            API: ${apiStatus}<br/>
            Context: ${httpsStatus}<br/>
            Waiting for data...
        `;

        this.enabled = true;
        this.button.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
        return true;
    }

    deactivate() {
        if (!this.enabled) return true;

        window.removeEventListener('deviceorientation', this.onOrientationEvent, false);
        window.removeEventListener('orientationchange', this.onScreenOrientationChange, false);

        this.viewer.toolController.deactivateTool('gyro-tool');

        // --- UNLOCK DEFAULT NAVIGATION ---
        if (this.viewer.navigation) {
            this.viewer.navigation.setIsLocked(false);
        }

        if (this.debugEl) this.debugEl.style.display = 'none';

        this.enabled = false;
        if (this.button) this.button.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);
        return true;
    }

    onScreenOrientationChange() {
        this.screenOrientation = window.orientation || 0;
        this.isCalibrated = false; // Recalibrate on screen rotation
    }

    onOrientationEvent(event) {
        if (!this.enabled) return;

        if (this.debugEl) {
            const a = event.alpha ? Math.round(event.alpha) : 'null';
            const b = event.beta ? Math.round(event.beta) : 'null';
            const g = event.gamma ? Math.round(event.gamma) : 'null';
            this.debugEl.innerHTML = `
                <b>GYRO ACTIVE</b><br/>
                Alpha: ${a}<br/>
                Beta:  ${b}<br/>
                Gamma: ${g}<br/>
                Calibrated: ${this.isCalibrated ? 'YES' : 'NO'}
             `;
        }

        if (event.alpha === null) return;

        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        const MathUtils = THREE.MathUtils || THREE.Math;

        // --- 1. Compute Device Quaternion from Sensors ---
        // --- MAPPING V18 (ACC STYLE - DIRECT MAPPING) ---
        // Mimics Autodesk Cloud Construction behavior.
        // Explicitly swaps axes based on orientation to match human perception.

        // 1. Data Prep
        const alphaRad = event.alpha ? MathUtils.degToRad(event.alpha) : 0;
        const betaRad = event.beta ? MathUtils.degToRad(event.beta) : 0;
        const gammaRad = event.gamma ? MathUtils.degToRad(event.gamma) : 0;

        // 2. Calibration (Tare)
        if (!this.isCalibrated) {
            this.startAlpha = alphaRad;
            this.startBeta = betaRad;
            this.startGamma = gammaRad;

            // Capture Camera Initial State (Euler YXZ)
            const camQ = this.viewer.impl.camera.quaternion.clone();
            const camEuler = new THREE.Euler().setFromQuaternion(camQ, 'YXZ');
            this.startCamYaw = camEuler.y; // World Up (Y in Three.js standard, but Viewer uses Z-up usually) ... wait.
            // APS Viewer is usually Z-Up. Let's check.
            // If Z is up, then Yaw is rotation around Z. Pitch is rotation around X or Y.
            // Let's assume Z-Up for APS.
            const eulerZUp = new THREE.Euler().setFromQuaternion(camQ, 'ZXY');
            this.startCamYaw = eulerZUp.z;
            this.startCamPitch = eulerZUp.x;

            this.isCalibrated = true;
            this.finalQuaternion = new THREE.Quaternion();

            // Distance
            const pos = this.viewer.navigation.getPosition();
            const target = this.viewer.navigation.getTarget();
            this.initialDistance = pos.distanceTo(target) || 10.0;
        }

        // 3. Calculate Deltas
        let dAlpha = alphaRad - this.startAlpha;
        let dBeta = betaRad - this.startBeta;
        let dGamma = gammaRad - this.startGamma;

        // Handle Alpha wrapping
        // (Not strictly necessary for small movements but good practice)

        // 4. Map Sensors to Camera Axes (The "Real Feel" Logic)
        let deltaYaw = 0;
        let deltaPitch = 0;

        // Check Orientation
        const isLandscape = Math.abs(this.screenOrientation) === 90;

        if (isLandscape) {
            // LANDSCAPE MAPPING:
            // Holding tablet sideways:
            // - Turning left/right (Yaw) = Rotate around gravity Z = Alpha
            // - Tilting up/down (Pitch) = Rotate around tablet long axis = Gamma

            deltaYaw = dAlpha;  // Standard

            // Fix directionality if needed. Usually Gamma needs inversion depending on side.
            // If rotation is -90 (button right), Gamma might be inverted vs 90 (button left).
            const sign = (this.screenOrientation === 90) ? -1 : 1;
            deltaPitch = dGamma * sign;

        } else {
            // PORTRAIT MAPPING:
            // Holding tablet upright:
            // - Turning left/right (Yaw) = Alpha
            // - Tilting up/down (Pitch) = Beta

            deltaYaw = dAlpha;
            deltaPitch = dBeta;
        }

        // 5. Apply to Camera
        // New Yaw = StartYaw + DeltaYaw (Around World Z)
        // New Pitch = StartPitch + DeltaPitch (Around Local X)

        // We reconstruct the quaternion from scratch to avoid "drift"
        const newYaw = this.startCamYaw + deltaYaw;
        const newPitch = this.startCamPitch + deltaPitch; // Clamp this if needed to avoid flipping

        const qYaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), newYaw);
        const qPitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), newPitch);

        // Final = Yaw * Pitch (Order matters: Yaw happens globally, Pitch happens locally)
        this.finalQuaternion.multiplyQuaternions(qYaw, qPitch);





        // --- DIRECT APPLY (Sync Navigation) ---
        if (this.viewer.navigation) {
            const THREE = window.THREE || Autodesk.Viewing.Private.THREE;

            // 1. Get current position
            const pos = this.viewer.navigation.getPosition();

            // 2. Calculate new Forward and Up from Quaternion
            const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.finalQuaternion);
            const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.finalQuaternion);

            // 3. Project new Target using STORED DISTANCE (Fix "Zoom" issue)
            // Use 100 units if calibration failed, or the real distance
            const dist = this.initialDistance || 100.0;
            const target = pos.clone().add(forward.multiplyScalar(dist));

            // 4. Update View (Position stays same, Target & Up change)
            this.viewer.navigation.setView(pos, target);
            this.viewer.navigation.setCameraUpVector(up);

            // 5. Force Redraw
            this.viewer.impl.invalidate(true, true, true);
        }
        // --- DEBUG UPDATE COUNTER + QUATERNION ---
        this._updateCount = (this._updateCount || 0) + 1;

        if (this.debugEl) {
            const a = event.alpha ? Math.round(event.alpha) : 'null';
            const q = this.finalQuaternion || { x: 0, y: 0, z: 0, w: 0 };
            const dist = this.initialDistance ? this.initialDistance.toFixed(1) : 'N/A';

            this.debugEl.innerHTML = `
                <div style="color:orange;font-size:16px;">DEBUG MODE: V18 (ACC STYLE)</div>
                <b>DIRECT MAPPING (REAL FEEL)</b><br/>
                Updates: ${this._updateCount}<br/>
                Alpha: ${a}<br/>
                Dist: ${dist}<br/>
             `;
        }
    }
}


Autodesk.Viewing.theExtensionManager.registerExtension('DeviceOrientationExtension', DeviceOrientationExtension);
