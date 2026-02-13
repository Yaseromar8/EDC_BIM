
import { BaseExtension } from './BaseExtension';

class IconMarkupExtension extends BaseExtension {
    constructor(viewer, options) {
        super(viewer, options);
        // Ensure options is set
        this.options = options || {};
        this._group = null;
        this._icons = [];
        this._button = null;
        this.onCameraChange = this.onCameraChange.bind(this);
    }

    load() {
        super.load();
        console.log('IconMarkupExtension loaded');
        this._group = document.createElement('div');
        this._group.className = 'icon-markup-group';
        // Ensure the container covers the viewer and allows clicks to pass through
        this._group.style.position = 'absolute';
        this._group.style.top = '0';
        this._group.style.left = '0';
        this._group.style.width = '100%';
        this._group.style.height = '100%';
        this._group.style.pointerEvents = 'none'; // Crucial: clicks pass through container
        this._group.style.zIndex = '100'; // High z-index to sit on top

        const container = this.viewer.container;
        // Append to viewer container
        container.appendChild(this._group);

        this.viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.onCameraChange);
        this.viewer.addEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.onCameraChange);
        this.viewer.addEventListener(Autodesk.Viewing.HIDE_EVENT, this.onCameraChange);
        this.viewer.addEventListener(Autodesk.Viewing.SHOW_EVENT, this.onCameraChange);

        return true;
    }

    unload() {
        super.unload();
        if (this._group) {
            this._group.remove();
            this._group = null;
        }
        this.viewer.removeEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.onCameraChange);
        this.viewer.removeEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.onCameraChange);
        this.viewer.removeEventListener(Autodesk.Viewing.HIDE_EVENT, this.onCameraChange);
        this.viewer.removeEventListener(Autodesk.Viewing.SHOW_EVENT, this.onCameraChange);
        return true;
    }

    setIcons(icons) {
        this._icons = icons || [];
        this.renderIcons();
    }

    addIcon(iconData) {
        this._icons.push(iconData);
        this.renderIcons();
    }

    clearIcons() {
        this._icons = [];
        if (this._group) {
            this._group.innerHTML = '';
        }
    }

    renderIcons() {
        if (!this._group) return;
        this._group.innerHTML = ''; // Clear current

        this._icons.forEach(iconData => {
            const el = document.createElement('div');
            el.className = 'icon-markup';
            el.id = `markup-${iconData.id}`;
            // Base styles
            el.style.position = 'absolute';
            el.style.pointerEvents = 'auto'; // Enable clicks on the icon itself
            el.style.cursor = 'pointer';
            el.style.transform = 'translate(-50%, -50%)'; // Center pivot

            // Custom styling based on type (Progress text vs Photo icon)
            if (iconData.type === 'text') {
                // Parse percentage
                const valStr = iconData.val || "0";
                const valNum = parseInt(valStr.replace(/\D/g, ''), 10) || 0;

                // Determine Dynamic Color
                let dynamicColor = '#ef4444'; // Red (< 50)
                if (valNum >= 100) {
                    dynamicColor = '#22c55e'; // Green (100+)
                } else if (valNum >= 50) {
                    dynamicColor = '#eab308'; // Yellow (50-99)
                }

                el.innerHTML = `<span>📈 ${iconData.val}</span>`;

                // Transparent Background Style
                el.style.color = dynamicColor;
                el.style.backgroundColor = 'transparent'; // No background
                el.style.padding = '2px 6px';
                // Remove border for cleaner look, or keep it subtle? Let's keep it minimal like the thermometer example.
                // el.style.border = `2px solid ${dynamicColor}`; 
                el.style.fontWeight = '900';
                el.style.fontSize = '18px'; // Slightly larger for visibility
                el.style.fontFamily = 'Inter, sans-serif';
                el.style.whiteSpace = 'nowrap';
                // Strong text shadow for contrast against 3D model
                el.style.textShadow = '0 2px 4px rgba(0,0,0,0.8), 0 0 10px rgba(0,0,0,0.5)';
                el.style.display = 'flex';
                el.style.alignItems = 'center';
                el.style.gap = '6px';
            } else {
                // Photo Icon - Camera Only (No Background)
                el.innerHTML = '<div style="font-size:36px; filter: drop-shadow(0 4px 4px rgba(0,0,0,0.5)); transition: transform 0.2s;">📷</div>';

                // Add hover effect via JS since inline styles are tricky for hover
                el.onmouseenter = () => el.firstChild.style.transform = 'scale(1.2)';
                el.onmouseleave = () => el.firstChild.style.transform = 'scale(1)';
            }

            // Click Handler
            el.onclick = (e) => {
                console.log('[IconMarkupExtension] Icon clicked:', iconData);
                e.stopPropagation(); // Stop viewer selection
                e.preventDefault();

                // Try this.options.onClick
                if (this.options && this.options.onClick) {
                    console.log('[IconMarkupExtension] Triggering options.onClick');
                    this.options.onClick(iconData);
                } else {
                    console.warn('[IconMarkupExtension] No onClick handler in options', this.options);
                }
            };

            // Store element reference in data for update loop? 
            // Better to re-find or pass via closure? 
            // Let's create the element and attach it.
            this._group.appendChild(el);
            iconData._element = el; // Cache element
        });

        this.onCameraChange(); // Initial position update
    }

    onCameraChange() {
        if (!this._group || !this.viewer.model) return;

        const viewer = this.viewer;
        const camera = viewer.navigation.getCamera();
        const containerBytes = viewer.container.getBoundingClientRect(); // Use bounds if needed, or simple clientWidth/Height

        this._icons.forEach(icon => {
            if (!icon._element) return;

            // Convert to THREE.Vector3
            const p = new THREE.Vector3(icon.x, icon.y, icon.z);

            // Check if behind camera
            // We can project and check z
            const pos = viewer.worldToClient(p);

            // Visibility Check
            // 1. Behind camera?
            // worldToClient returns z as [0, 1] for visible? No, it returns screen Z.
            // Actually, for worldToClient:
            // "Note that the z component of the returned vector is 0.0 if the point is in front of the camera, and 1.0 if it is behind." - wait, need to verify docs or test.
            // Actually, in Viewer implementation:
            // var p = new THREE.Vector3();
            // p.copy(point);
            // p.project(camera); 
            // p.x = ( p.x + 1 ) / 2 * width;
            // p.y = - ( p.y - 1 ) / 2 * height;
            // The result of `project` puts z in [-1, 1] (NDC). 
            // If z > 1, it's behind far plane? If z < -1, behind near plane?
            // `viewer.worldToClient` internally handles projection.
            // Let's rely on standard practice: check if `point` is in front of camera plane.

            // Simple check: direction from camera to point vs camera lookat
            const camPos = camera.position;
            const camDir = camera.getWorldDirection(new THREE.Vector3());
            const pointDir = new THREE.Vector3().subVectors(p, camPos).normalize();
            const dot = camDir.dot(pointDir);

            // Robust specific check for occlusion or behind camera
            // If dot < 0, point is roughly behind camera.
            // However, wide FOV might show points slightly "behind" the look vector but still in frustum.
            // Better to trust `worldToClient` bounding or write a specific frustum check.

            // Let's try utilizing the viewer's built-in occlusion if we want, but for now just placement.

            // If explicit z check logic failed before, let's keep it simple:
            // Just use bounds check on screen X/Y. 
            // BUT we must hide if behind camera.

            // Using `viewer.impl.isPointVisible(p)`? No public API.

            // Fallback:
            // `worldToClient` generally returns valid screen coords. If z > 1 (NDC), it's bad?

            if (pos.z > 1) { // Behind far plane or handling weirdness
                icon._element.style.display = 'none';
            } else {
                if (pos.x >= 0 && pos.x <= viewer.container.clientWidth &&
                    pos.y >= 0 && pos.y <= viewer.container.clientHeight) {
                    icon._element.style.display = 'block';
                    icon._element.style.left = Math.floor(pos.x) + 'px';
                    icon._element.style.top = Math.floor(pos.y) + 'px';
                } else {
                    icon._element.style.display = 'none'; // Off screen
                }
            }

            // Extra: Occlusion culling (optional)
            // if (viewer.model.rayIntersect(...)) ...
        });
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('IconMarkupExtension', IconMarkupExtension);
export default IconMarkupExtension;
