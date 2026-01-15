
export class ARExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.onToolbarCreated = this.onToolbarCreated.bind(this);
        this.toggleAR = this.toggleAR.bind(this);
        this.update = this.update.bind(this);
        this.onDeviceOrientation = this.onDeviceOrientation.bind(this);

        this.isActive = false;
        this.videoElement = null;
        this.originalClearColor = null;

        // Gyro Data
        this.deviceOrientation = null;
        this.screenOrientation = 0;
        this.isEnabled = false;
    }

    load() {
        console.log('ARExtension loaded.');
        if (this.viewer.toolbar) {
            this.createUI();
        } else {
            this.viewer.addEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, this.onToolbarCreated);
        }
        return true;
    }

    unload() {
        console.log('ARExtension unloaded.');
        this.stopAR();
        if (this.subToolbar) {
            this.viewer.toolbar.removeControl(this.subToolbar);
            this.subToolbar = null;
        }
        return true;
    }

    onToolbarCreated() {
        this.viewer.removeEventListener(Autodesk.Viewing.TOOLBAR_CREATED_EVENT, this.onToolbarCreated);
        this.createUI();
    }

    createUI() {
        const viewer = this.viewer;
        const arButton = new Autodesk.Viewing.UI.Button('ar-button');

        arButton.onClick = this.toggleAR;
        arButton.setToolTip('AR Mode (Gyroscope)');
        arButton.setIcon('adsk-viewing-icon-cam-switch');

        this.subToolbar = new Autodesk.Viewing.UI.ControlGroup('ar-toolbar-group');
        this.subToolbar.addControl(arButton);
        viewer.toolbar.addControl(this.subToolbar);
    }

    async toggleAR() {
        const button = this.subToolbar.getControl('ar-button');

        if (!this.isActive) {
            // Request Gyro Permission (iOS 13+)
            if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
                try {
                    const permission = await DeviceOrientationEvent.requestPermission();
                    if (permission !== 'granted') {
                        alert('Permiso de giroscopio denegado. El movimiento no funcionará.');
                    }
                } catch (e) {
                    console.error('Error asking gyro permission:', e);
                }
            }

            this.isActive = true;
            button.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
            await this.startAR();

            // Start Gyro Loop
            window.addEventListener('deviceorientation', this.onDeviceOrientation);
            window.addEventListener('orientationchange', this.onScreenOrientationChange.bind(this));
            this.onScreenOrientationChange(); // Init
            this.isEnabled = true;
            this.update(); // Start Loop

        } else {
            this.isActive = false;
            button.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);

            this.isEnabled = false;
            window.removeEventListener('deviceorientation', this.onDeviceOrientation);
            this.stopAR();
        }
    }

    onDeviceOrientation(event) {
        this.deviceOrientation = event;
    }

    onScreenOrientationChange() {
        this.screenOrientation = window.orientation || 0;
    }

    update() {
        if (!this.isEnabled) return;

        if (this.deviceOrientation && this.viewer.impl.camera) {
            this.updateCameraFromGyro(this.deviceOrientation);
        }

        requestAnimationFrame(this.update);
    }

    updateCameraFromGyro(device) {
        // Basic Math to map alpha/beta/gamma to Camera Quaternion
        // Note: This is a simplified version. For production 'Augin-like' quality,
        // we normally use a robust 'DeviceOrientationControls' lib.
        // Here we map directly to look direction.

        if (!device.alpha) return;

        const alpha = device.alpha ? THREE.Math.degToRad(device.alpha) : 0; // Z
        const beta = device.beta ? THREE.Math.degToRad(device.beta) : 0; // X'
        const gamma = device.gamma ? THREE.Math.degToRad(device.gamma) : 0; // Y''
        const orient = this.screenOrientation ? THREE.Math.degToRad(this.screenOrientation) : 0;

        // The math below converts device Euler angles to a Quaternion
        // Source: Three.js DeviceOrientationControls logic adapted
        const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // - PI/2 around X

        const zee = new THREE.Vector3(0, 0, 1);
        const euler = new THREE.Euler();
        const q0 = new THREE.Quaternion();

        euler.set(beta, alpha, -gamma, 'YXZ'); // 'ZXY' for the device, but we map carefully
        q0.setFromEuler(euler);
        q0.multiply(q1); // Fix camera orientation (phones looking 'out' of back)

        // Adjust for screen orientation
        const q2 = new THREE.Quaternion();
        q2.setFromAxisAngle(zee, -orient);
        q0.multiply(q2);

        // Apply to viewer camera
        // We set the camera quaternion directly.
        // First, we need to ensure the camera is perspective.
        const camera = this.viewer.impl.camera;

        // Smooth interpolation could be added here, but direct set for responsiveness
        camera.quaternion.copy(q0);

        // Mark as dirty to render
        this.viewer.impl.invalidate(true, false, false);
    }

    async startAR() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });

            this.videoElement = document.createElement('video');
            this.videoElement.srcObject = stream;
            this.videoElement.setAttribute('autoplay', '');
            this.videoElement.setAttribute('playsinline', '');
            this.videoElement.style.position = 'absolute';
            this.videoElement.style.width = '100%';
            this.videoElement.style.height = '100%';
            this.videoElement.style.top = '0';
            this.videoElement.style.left = '0';
            this.videoElement.style.objectFit = 'cover';
            this.videoElement.style.zIndex = '0'; // Base layer
            this.videoElement.style.pointerEvents = 'none';

            const container = this.viewer.container;
            container.insertBefore(this.videoElement, container.firstChild);

            await this.videoElement.play();

            if (this.viewer.impl.renderer) {
                const renderer = this.viewer.impl.renderer();
                if (renderer && renderer.setClearColor) {
                    renderer.setClearColor(0xffffff, 0);
                }
            }
            this.viewer.impl.invalidate(true, true, true);

            this.originalContainerBackground = container.style.background;
            container.style.background = 'transparent';
            container.classList.add('ar-mode');

            if (!document.getElementById('ar-css-injection')) {
                const style = document.createElement('style');
                style.id = 'ar-css-injection';
                style.innerHTML = `
                    .ar-mode canvas { z-index: 5 !important; background: transparent !important; background-color: transparent !important; }
                    .ar-mode .adsk-viewing-viewer { background: transparent !important; }
                    .adsk-viewing-viewer.ar-mode { background: transparent !important; }
                `;
                document.head.appendChild(style);
            }

        } catch (err) {
            console.error('Failed to start AR:', err);
            alert('Could not access camera (or Gyro). Ensure HTTPS.');
            this.toggleAR(); // Revert
        }
    }

    stopAR() {
        if (this.videoElement) {
            const stream = this.videoElement.srcObject;
            if (stream) {
                const tracks = stream.getTracks();
                tracks.forEach(track => track.stop());
            }
            this.videoElement.remove();
            this.videoElement = null;
        }

        if (this.viewer.impl.renderer) {
            const renderer = this.viewer.impl.renderer();
            if (renderer && renderer.setClearColor) {
                renderer.setClearColor(0x333333, 1);
            }
        }
        this.viewer.impl.invalidate(true, true, true);

        if (this.viewer.container && this.originalContainerBackground !== undefined) {
            this.viewer.container.style.background = '';
            this.viewer.container.classList.remove('ar-mode');
        }
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('ARExtension', ARExtension);
