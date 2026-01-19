
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
        // --- MAPPING V11 (HYBRID RELATIVE - BLUE) ---
        // Vertical (Pitch/Roll) = ABSOLUTE (Gravity)
        // Horizontal (Yaw) = RELATIVE (Calibration Offset)

        const zee = new THREE.Vector3(0, 0, 1);
        const euler = new THREE.Euler();
        const q0 = new THREE.Quaternion();
        const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -PI/2 around X
        const orient = this.screenOrientation ? MathUtils.degToRad(this.screenOrientation) : 0;

        // 1. Build Device Quaternion (Standard Math)
        const alpha = MathUtils.degToRad(event.alpha);
        const beta = MathUtils.degToRad(event.beta);
        const gamma = MathUtils.degToRad(event.gamma);
        euler.set(beta, alpha, -gamma, 'YXZ');
        this.deviceQuaternion.setFromEuler(euler);
        this.deviceQuaternion.multiply(q1);
        this.deviceQuaternion.multiply(q0.setFromAxisAngle(zee, -orient));

        // 2. Calibration (First Frame Only)
        if (!this.isCalibrated) {
            // Capture Initial Camera State
            this.initialCameraQ = this.viewer.impl.camera.quaternion.clone();

            // Setup distance
            const pos = this.viewer.navigation.getPosition();
            const target = this.viewer.navigation.getTarget();
            this.initialDistance = pos.distanceTo(target) || 10.0;
            if (this.initialDistance < 0.1) this.initialDistance = 10.0;

            this.isCalibrated = true;
            this.finalQuaternion = new THREE.Quaternion();
        }

        // 3. Calculate Delta Quaternion
        // deltaQ represents the rotation from initialDevice to currentDevice
        const deltaQ = new THREE.Quaternion();
        deltaQ.copy(this.deviceQuaternion);

        // We need the rotation that takes us from initial device to current device
        // Since we didn't store initialDeviceQ, we use the camera's initial state as reference
        // deltaQ = currentDevice (already computed above)

        // 4. Decompose Delta into Yaw and Pitch
        // Extract Euler angles from deltaQ
        const deltaEuler = new THREE.Euler().setFromQuaternion(deltaQ, 'ZXY');
        const deltaYaw = deltaEuler.z;   // Rotation around World Z
        const deltaPitch = deltaEuler.x; // Rotation around Local X

        // 5. Apply Rotations
        // Start with Initial Camera Quaternion
        const camQ = this.initialCameraQ.clone();

        // Apply Yaw (World Space - around Z)
        const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), deltaYaw);

        // Apply Pitch (Local Space - around X)
        const pitchQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), deltaPitch);

        // Combine: Yaw * Camera * Pitch
        // Use multiplyQuaternions for Three.js r71 compatibility
        const tempQ = new THREE.Quaternion();
        tempQ.multiplyQuaternions(yawQ, camQ);
        this.finalQuaternion.multiplyQuaternions(tempQ, pitchQ);





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
                <div style="color:blue;font-size:16px;">DEBUG MODE: V11 (AZUL)</div>
                <b>HYBRID RELATIVE (PITCH ABS / YAW REL)</b><br/>
                Updates: ${this._updateCount}<br/>
                Alpha: ${a}<br/>
                Dist: ${dist}<br/>
             `;
        }
    }
}


Autodesk.Viewing.theExtensionManager.registerExtension('DeviceOrientationExtension', DeviceOrientationExtension);
