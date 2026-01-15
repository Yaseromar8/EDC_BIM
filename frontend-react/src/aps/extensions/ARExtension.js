
export class ARExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.onToolbarCreated = this.onToolbarCreated.bind(this);
        this.toggleAR = this.toggleAR.bind(this);
        this.isActive = false;
        this.videoElement = null;
        this.originalClearColor = null;
        this.originalClearAlpha = 1;
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

        // Simple AR Icon (Camera/Eye)
        arButton.onClick = this.toggleAR;
        arButton.setToolTip('Augmented Reality (Beta)');
        arButton.setIcon('adsk-viewing-icon-cam-switch'); // Use existing icon or custom class

        // Create a sub-toolbar
        this.subToolbar = new Autodesk.Viewing.UI.ControlGroup('ar-toolbar-group');
        this.subToolbar.addControl(arButton);
        viewer.toolbar.addControl(this.subToolbar);
    }

    async toggleAR() {
        this.isActive = !this.isActive;
        const button = this.subToolbar.getControl('ar-button');

        if (this.isActive) {
            button.setState(Autodesk.Viewing.UI.Button.State.ACTIVE);
            await this.startAR();
        } else {
            button.setState(Autodesk.Viewing.UI.Button.State.INACTIVE);
            this.stopAR();
        }
    }

    async startAR() {
        try {
            // 1. Request Camera Access (Rear Camera preference)
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });

            // 2. Create Video Background
            this.videoElement = document.createElement('video');
            this.videoElement.srcObject = stream;
            this.videoElement.setAttribute('autoplay', '');
            this.videoElement.setAttribute('playsinline', ''); // Critical for iOS
            this.videoElement.style.position = 'absolute';
            this.videoElement.style.top = '0';
            this.videoElement.style.left = '0';
            this.videoElement.style.width = '100%';
            this.videoElement.style.height = '100%';
            this.videoElement.style.objectFit = 'cover';
            this.videoElement.style.zIndex = '-1'; // Behind viewer
            this.videoElement.style.pointerEvents = 'none'; // Click through

            // Insert into Viewer Container (Before the Canvas)
            const container = this.viewer.container;

            // We need the background to be strictly behind canvas.
            // APS Viewer usually puts canvas absolute. We need to ensure video is behind it.
            // Appending to container usually puts it on top if zIndex is not handled.
            // But canvas usually has zIndex 1.
            container.insertBefore(this.videoElement, container.firstChild);

            await this.videoElement.play();

            // 3. Make Viewer Transparent
            // Access WebGL Renderer directly
            if (this.viewer.impl.renderer) {
                const renderer = this.viewer.impl.renderer();
                if (renderer && renderer.setClearColor) {
                    renderer.setClearColor(0xffffff, 0); // Transparent
                }
            }
            this.viewer.impl.invalidate(true, true, true);

            // Also need to handle CSS background of the container
            this.originalContainerBackground = container.style.background;
            container.style.background = 'transparent';

        } catch (err) {
            console.error('Failed to start AR:', err);
            alert('Could not access camera for AR mode. Please ensure permissions are granted.');
            this.toggleAR(); // Revert
        }
    }

    stopAR() {
        // 1. Stop Camera
        if (this.videoElement) {
            const stream = this.videoElement.srcObject;
            if (stream) {
                const tracks = stream.getTracks();
                tracks.forEach(track => track.stop());
            }
            this.videoElement.remove();
            this.videoElement = null;
        }

        // 2. Restore Viewer Opaque Background
        if (this.viewer.impl.renderer) {
            const renderer = this.viewer.impl.renderer();
            if (renderer && renderer.setClearColor) {
                renderer.setClearColor(0x333333, 1); // Restore Grey Opaque
            }
        }
        this.viewer.impl.invalidate(true, true, true);

        // 3. Restore CSS
        if (this.viewer.container && this.originalContainerBackground !== undefined) {
            this.viewer.container.style.background = ''; // Revert to stylesheet
        }
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('ARExtension', ARExtension);
