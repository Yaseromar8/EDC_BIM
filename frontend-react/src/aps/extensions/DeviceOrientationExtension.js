
/* global Autodesk, THREE */
// import { toast } from 'react-toastify'; // Removed to avoid dependency error

export class DeviceOrientationExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.onOrientationEvent = this.onOrientationEvent.bind(this);
        this.onScreenOrientationChange = this.onScreenOrientationChange.bind(this);
        this.enabled = false;
        this.debugEl = null;

        // State Tracking
        this.isCalibrated = false;
        this._updateCount = 0;

        // V23 State
        this.yawOffset = 0;
        this.baseHeight = null;
        this.initialDistance = 10.0;
        this.currentSmoothedQuaternion = null;
    }

    load() {
        console.log('DeviceOrientationExtension loaded (V23 GRAVITY FPS)');
        this.createToolbarButton();
        return true;
    }

    unload() {
        this.disable();
        if (this.button) {
            this.viewer.toolbar.getControl('modelTools').removeControl(this.button);
            this.button = null;
        }
        return true;
    }

    createToolbarButton() {
        this.button = new Autodesk.Viewing.UI.Button('toolbar-device-orientation');
        this.button.onClick = () => {
            this.enabled = !this.enabled;
            if (this.enabled) {
                this.enable();
                this.button.addClass('active');
            } else {
                this.disable();
                this.button.removeClass('active');
            }
        };
        this.button.setToolTip('Giroscopio (Gravity FPS)');
        // Use a simple icon or text
        const icon = this.button.container.querySelector('.adsk-button-icon');
        if (icon) {
            icon.style.backgroundImage = 'none'; // Clear default
            icon.innerHTML = '📱'; // Simple emoji icon
            icon.style.fontSize = '20px';
            icon.style.lineHeight = '24px';
        }

        // Add to toolbar
        const subToolbar = this.viewer.toolbar.getControl('modelTools');
        if (subToolbar) {
            subToolbar.addControl(this.button);
        } else {
            // If toolbar not ready, wait
            this.viewer.addEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, () => {
                this.viewer.toolbar.getControl('modelTools').addControl(this.button);
            });
        }
    }

    enable() {
        console.log('Enabling V23 Gravity FPS Control...');
        this.isCalibrated = false;
        this.currentSmoothedQuaternion = null;
        window.addEventListener('deviceorientation', this.onOrientationEvent, true);
        window.addEventListener('orientationchange', this.onScreenOrientationChange, true);
        this.screenOrientation = window.orientation || 0;

        // Setup Debug Overlay
        if (!this.debugEl) {
            this.debugEl = document.createElement('div');
            this.debugEl.style.position = 'absolute';
            this.debugEl.style.top = '10px';
            this.debugEl.style.left = '10px';
            this.debugEl.style.background = 'rgba(0,0,0,0.7)';
            this.debugEl.style.color = '#fff';
            this.debugEl.style.padding = '10px';
            this.debugEl.style.zIndex = '9999';
            this.debugEl.style.pointerEvents = 'none';
            this.viewer.container.appendChild(this.debugEl);
        }
        this.debugEl.style.display = 'block';

        // Notify user via console or internal hud
        console.log('Giroscopio Activado: V23 Gravity Mode. Apunte al Frente.');
    }

    disable() {
        console.log('Disabling DeviceOrientationExtension...');
        window.removeEventListener('deviceorientation', this.onOrientationEvent, true);
        window.removeEventListener('orientationchange', this.onScreenOrientationChange, true);

        if (this.debugEl) {
            this.debugEl.style.display = 'none';
        }

        // Reset Camera Up to clear any roll
        if (this.viewer.navigation) {
            this.viewer.navigation.setCameraUpVector(new THREE.Vector3(0, 0, 1));
        }
    }

    onScreenOrientationChange() {
        this.screenOrientation = window.orientation || 0;
    }

    onOrientationEvent(event) {
        if (!this.enabled) return;
        if (!event.alpha && event.alpha !== 0) return; // Need data

        const THREE = window.THREE || Autodesk.Viewing.Private.THREE;
        const MathUtils = THREE.MathUtils || THREE.Math;

        // --- MAPPING V23 (GRAVITY FPS - RED) ---
        // 1. Projects rotation onto World Z (Yaw) and Local X (Pitch).
        // 2. Forces Camera Up Vector to always be (0,0,1) - No Roll.
        // 3. Locks Height to 1.74m (Human Eye Level) - Optional.
        // 4. Resolves Gimbal Lock at Nadir (Looking down).

        // A. SENSOR DATA PREP (Standard V17 Logic)
        const alpha = event.alpha ? MathUtils.degToRad(event.alpha) : 0;
        const beta = event.beta ? MathUtils.degToRad(event.beta) : 0;
        const gamma = event.gamma ? MathUtils.degToRad(event.gamma) : 0;
        const orient = this.screenOrientation ? MathUtils.degToRad(this.screenOrientation) : 0;

        const zee = new THREE.Vector3(0, 0, 1);
        const euler = new THREE.Euler();
        const q0 = new THREE.Quaternion();
        const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around X

        // Order YXZ is standard for device orientation
        euler.set(beta, alpha, -gamma, 'YXZ');
        const sensorQ = new THREE.Quaternion().setFromEuler(euler);
        sensorQ.multiply(q1); // Transform to camera frame
        sensorQ.multiply(q0.setFromAxisAngle(zee, -orient)); // Adjust for screen

        // B. CALIBRATION (TARE YAW TO CAMERA)
        if (!this.isCalibrated) {
            // 1. Capture Current Camera Yaw
            // We only care about where the user is looking horizontally (Azimuth)
            const camQ = this.viewer.impl.camera.quaternion.clone();
            const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ);

            // Project onto XY plane to find Yaw angle around Z
            // atan2(y, x) gives angle from X axis
            const camYaw = Math.atan2(camDir.y, camDir.x);

            // 2. Capture Current Sensor Yaw
            const devDir = new THREE.Vector3(0, 0, -1).applyQuaternion(sensorQ);
            const devYaw = Math.atan2(devDir.y, devDir.x);

            // 3. Calculate Offset: Cam = Device + Offset
            this.yawOffset = camYaw - devYaw;

            // 4. Capture Distance & Height for "Walking" feel
            const pos = this.viewer.navigation.getPosition();
            this.baseHeight = pos.z; // Store initial height
            const target = this.viewer.navigation.getTarget();
            this.initialDistance = pos.distanceTo(target) || 5.0; // Use reasonable distance

            this.isCalibrated = true;
            this.currentSmoothedQuaternion = this.viewer.impl.camera.quaternion.clone();
            this.finalQuaternion = new THREE.Quaternion();
        }

        // C. DECOMPOSE SENSOR & RECONSTRUCT GRAVITY-LOCKED VIEW
        // We do *not* use sensorQ directly for the camera because it contains Roll
        // and complex behavior at poles. We extract pure direction.

        // 1. Apply Yaw Offset to sensor
        // This aligns the sensor's "North" with the Camera's current "Forward"
        const offsetQ = new THREE.Quaternion().setFromAxisAngle(zee, this.yawOffset);
        const calibratedQ = new THREE.Quaternion().multiplyQuaternions(offsetQ, sensorQ);

        // 2. Extract LOOK DIRECTION from sensor
        // This vector represents exactly where the back of the phone is pointing in 3D space
        const forwardDir = new THREE.Vector3(0, 0, -1).applyQuaternion(calibratedQ);

        // 3. FORCE UP VECTOR (Gravity Lock)
        // We construct a new View Matrix looking at 'forwardDir' but with Up = (0,0,1)
        // This effectively kills any Roll component.
        // Note: lookAt expects (eye, target, up). 
        // We treat Eye as (0,0,0) and Target as forwardDir.
        const targetMx = new THREE.Matrix4().lookAt(
            new THREE.Vector3(0, 0, 0), // Eye
            forwardDir,               // Target
            new THREE.Vector3(0, 0, 1)  // Up (Global Z)
        );
        this.finalQuaternion.setFromRotationMatrix(targetMx);

        // D. APPLY TO CAMERA (WITH SMOOTHING)
        if (this.viewer.navigation) {

            // 5. SLERP Smoothing (Low Pass Filter)
            const smoothFactor = 0.2; // 0.1=Slow/Heavy, 0.5=Fast
            if (!this.currentSmoothedQuaternion) this.currentSmoothedQuaternion = this.viewer.impl.camera.quaternion.clone();
            this.currentSmoothedQuaternion.slerp(this.finalQuaternion, smoothFactor);

            // 6. Calculate View Vectors
            const pos = this.viewer.navigation.getPosition();

            // OPTIONAL: FORCE HEIGHT
            // Uncomment next line to lock Z height (Walk Mode)
            // pos.z = 1.74; 

            // New Forward based on filtered rotation
            const cleanForward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.currentSmoothedQuaternion);

            // New Target
            const newTarget = pos.clone().add(cleanForward.multiplyScalar(this.initialDistance));

            // New Up (Strictly Global Z)
            const newUp = new THREE.Vector3(0, 0, 1);

            // 7. Apply
            this.viewer.navigation.setView(pos, newTarget);
            this.viewer.navigation.setCameraUpVector(newUp);
            this.viewer.impl.invalidate(true, true, true);
        }

        // E. DEBUG INFO
        this._updateCount = (this._updateCount || 0) + 1;
        if (this.debugEl) {
            const a = event.alpha ? Math.round(event.alpha) : 'null';
            const g = event.gamma ? Math.round(event.gamma) : 'null';

            this.debugEl.innerHTML = `
                <div style="color:red;font-size:16px;">DEBUG MODE: V23 (GRAVITY FPS)</div>
                <b>NO ROLL • PURE Z-UP • NADIR FIX</b><br/>
                Updates: ${this._updateCount}<br/>
                Alpha: ${a}<br/>
                Gamma: ${g}<br/>
             `;
        }
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('DeviceOrientationExtension', DeviceOrientationExtension);
