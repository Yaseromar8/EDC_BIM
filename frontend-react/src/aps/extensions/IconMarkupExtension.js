
import { BaseExtension } from './BaseExtension';

class IconMarkupExtension extends BaseExtension {
    constructor(viewer, options) {
        super(viewer, options);
        this.options = options || {};
        this._group = null;
        this._icons = [];
        this.onCameraChange = this.onCameraChange.bind(this);
    }

    load() {
        super.load();
        console.log('IconMarkupExtension loaded');
        this._group = document.createElement('div');
        this._group.className = 'icon-markup-group';
        this._group.style.position = 'absolute';
        this._group.style.top = '0';
        this._group.style.left = '0';
        this._group.style.width = '100%';
        this._group.style.height = '100%';
        this._group.style.pointerEvents = 'none'; // Clicks pass through container
        this._group.style.zIndex = '100';

        const container = this.viewer.container;
        container.appendChild(this._group);

        this.viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.onCameraChange);
        this.viewer.addEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.onCameraChange);
        this.viewer.addEventListener(Autodesk.Viewing.HIDE_EVENT, this.onCameraChange);
        this.viewer.addEventListener(Autodesk.Viewing.SHOW_EVENT, this.onCameraChange);
        this.viewer.addEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, this.onCameraChange);

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
        this.viewer.removeEventListener(Autodesk.Viewing.GEOMETRY_LOADED_EVENT, this.onCameraChange);
        return true;
    }

    setIcons(icons) {
        this._icons = icons || [];
        this.renderIcons();
        // Force an update on next frame to ensure positions are calculated after DOM insertion
        requestAnimationFrame(() => {
            this.onCameraChange();
        });
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

            // Base styles
            el.style.position = 'absolute';
            el.style.top = '0';
            el.style.left = '0';
            el.style.pointerEvents = 'auto'; // Enable clicks on the icon itself
            el.style.cursor = 'pointer';
            el.style.transform = 'translate(-50%, -50%)'; // Center pivot
            el.style.display = 'none'; // Hidden initially until camera update

            // Custom styling based on type
            if (iconData.type === 'text') {
                const valStr = iconData.val || "0";
                const valNum = parseInt(valStr.replace(/\D/g, ''), 10) || 0;

                // Determine Dynamic Color
                let dynamicColor = '#ef4444'; // Red (< 50)
                if (valNum >= 100) dynamicColor = '#22c55e'; // Green
                else if (valNum >= 50) dynamicColor = '#eab308'; // Yellow

                el.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display: block;">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                        <polyline points="17 6 23 6 23 12"></polyline>
                    </svg>
                    <span style="font-weight: 800; font-family: Inter, sans-serif;">${valStr}</span>
                `;

                // Wrapper Styles (Reverted to Box/Arrow style)
                el.style.color = dynamicColor;
                el.style.backgroundColor = 'rgba(20, 20, 20, 0.8)'; // Darker bg
                el.style.padding = '4px 8px';
                el.style.borderRadius = '6px';
                el.style.border = `1px solid ${dynamicColor}`;
                el.style.display = 'flex';
                el.style.alignItems = 'center';
                el.style.gap = '6px';
                el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.5)';
                // Note: transform is handled in onCameraChange for performance
            } else if (iconData.type === 'doc') {
                // Document Icon (Purple)
                el.innerHTML = `
                    <div style="
                        width: 32px;
                        height: 32px;
                        background: rgba(139, 92, 246, 0.7);
                        backdrop-filter: blur(4px);
                        border: 1.5px solid rgba(196, 181, 253, 0.6);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 0 12px rgba(139, 92, 246, 0.3);
                        transition: all 0.2s ease;
                        cursor: pointer;
                    ">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <line x1="16" y1="17" x2="8" y2="17"></line>
                        </svg>
                    </div>
                `;

                el.onmouseenter = () => {
                    const div = el.firstElementChild;
                    if (div) {
                        div.style.transform = 'scale(1.15)';
                        div.style.background = 'rgba(139, 92, 246, 0.9)';
                        div.style.border = '1.5px solid rgba(255, 255, 255, 0.8)';
                        div.style.boxShadow = '0 4px 12px rgba(139, 92, 246, 0.5)';
                    }
                };
                el.onmouseleave = () => {
                    const div = el.firstElementChild;
                    if (div) {
                        div.style.transform = 'scale(1)';
                        div.style.background = 'rgba(139, 92, 246, 0.7)';
                        div.style.border = '1.5px solid rgba(196, 181, 253, 0.6)';
                        div.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 0 12px rgba(139, 92, 246, 0.3)';
                    }
                };
                el.onmouseleave = () => {
                    const div = el.firstElementChild;
                    if (div) {
                        div.style.transform = 'scale(1)';
                        div.style.background = 'rgba(30, 30, 30, 0.6)';
                        div.style.border = '1px solid rgba(255, 255, 255, 0.3)';
                    }
                };
            } else if (iconData.type === 'rfi') {
                // RFI Icon (Red)
                el.innerHTML = `
                    <div style="
                        width: 32px;
                        height: 32px;
                        background: rgba(239, 68, 68, 0.8);
                        backdrop-filter: blur(4px);
                        border: 1.5px solid rgba(252, 165, 165, 0.7);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 0 12px rgba(239, 68, 68, 0.4);
                        transition: all 0.2s ease;
                        cursor: pointer;
                    ">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="16" x2="12" y2="12"></line>
                            <line x1="12" y1="8" x2="12.01" y2="8"></line>
                        </svg>
                    </div>
                `;

                el.onmouseenter = () => {
                    const div = el.firstElementChild;
                    if (div) {
                        div.style.transform = 'scale(1.15)';
                        div.style.background = 'rgba(239, 68, 68, 1)';
                        div.style.border = '1.5px solid rgba(255, 255, 255, 0.8)';
                        div.style.boxShadow = '0 6px 12px rgba(239, 68, 68, 0.6)';
                    }
                };
                el.onmouseleave = () => {
                    const div = el.firstElementChild;
                    if (div) {
                        div.style.transform = 'scale(1)';
                        div.style.background = 'rgba(239, 68, 68, 0.8)';
                        div.style.border = '1.5px solid rgba(252, 165, 165, 0.7)';
                        div.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 0 12px rgba(239, 68, 68, 0.3)';
                    }
                };
            } else if (iconData.type === 'restriction') {
                // Restriction / Warning Icon (Orange/Yellow)
                el.innerHTML = `
                    <div style="
                        width: 32px;
                        height: 32px;
                        background: rgba(245, 158, 11, 0.8);
                        backdrop-filter: blur(4px);
                        border: 1.5px solid rgba(254, 215, 170, 0.7);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 0 12px rgba(245, 158, 11, 0.4);
                        transition: all 0.2s ease;
                        cursor: pointer;
                    ">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                            <line x1="12" y1="9" x2="12" y2="13"></line>
                            <line x1="12" y1="17" x2="12.01" y2="17"></line>
                        </svg>
                    </div>
                `;

                el.onmouseenter = () => {
                    const div = el.firstElementChild;
                    if (div) {
                        div.style.transform = 'scale(1.15)';
                        div.style.background = 'rgba(245, 158, 11, 1)';
                        div.style.border = '1.5px solid rgba(255, 255, 255, 0.8)';
                        div.style.boxShadow = '0 6px 12px rgba(245, 158, 11, 0.6)';
                    }
                };
                el.onmouseleave = () => {
                    const div = el.firstElementChild;
                    if (div) {
                        div.style.transform = 'scale(1)';
                        div.style.background = 'rgba(245, 158, 11, 0.8)';
                        div.style.border = '1.5px solid rgba(254, 215, 170, 0.7)';
                        div.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.2), 0 0 12px rgba(245, 158, 11, 0.4)';
                    }
                };
            } else {
                // Photo Icon (Minimalist)
                el.innerHTML = `
                    <div style="
                        width: 32px;
                        height: 32px;
                        background: rgba(30, 30, 30, 0.6);
                        backdrop-filter: blur(4px);
                        border: 1px solid rgba(255, 255, 255, 0.3);
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                        transition: all 0.2s ease;
                        cursor: pointer;
                    ">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                            <circle cx="12" cy="13" r="4"></circle>
                        </svg>
                    </div>
                `;

                // Add hover effect via JS since inline styles are tricky for pseudo-classes
                el.onmouseenter = () => {
                    const div = el.firstElementChild;
                    if (div) {
                        div.style.transform = 'scale(1.1)';
                        div.style.background = 'rgba(30, 30, 30, 0.8)';
                        div.style.border = '1px solid rgba(255, 255, 255, 0.8)';
                    }
                };
                el.onmouseleave = () => {
                    const div = el.firstElementChild;
                    if (div) {
                        div.style.transform = 'scale(1)';
                        div.style.background = 'rgba(30, 30, 30, 0.6)';
                        div.style.border = '1px solid rgba(255, 255, 255, 0.3)';
                    }
                };
            }

            // Click Handler
            el.onclick = (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (this.options && this.options.onClick) {
                    this.options.onClick(iconData);
                }
            };

            this._group.appendChild(el);
            iconData._element = el;
        });

        // Trigger update
        this.onCameraChange();
        // Double Tap: Request animation frame to catch race conditions in initial mount
        requestAnimationFrame(() => this.onCameraChange());
    }

    onCameraChange() {
        if (!this._group) return;

        const viewer = this.viewer;

        // Safety check for model or navigation availability
        if (!viewer.model || !viewer.navigation) return;

        const camera = viewer.navigation.getCamera();
        const nav = viewer.navigation;

        this._icons.forEach(icon => {
            if (!icon._element) return;

            // 1. Get World Point
            const p = new THREE.Vector3(icon.x, icon.y, icon.z);

            // 2. Project to Screen
            let pos = viewer.worldToClient(p);

            // 3. Visibility Check (Behind Camera?)
            const camPos = camera.position;
            const camDir = camera.getWorldDirection(new THREE.Vector3());
            const sub = new THREE.Vector3().subVectors(p, camPos); // Vector from Cam to Point
            const dist = sub.length();

            // Dot product: if > 0, point is roughly in front (angle < 90 deg)
            let isFront = camDir.dot(sub) > 0;

            // Fallback for APS Near-Clipping frustration:
            // APS Viewer dynamically scales the Camera Near Plane based on the entire building size.
            // In large models, walls closer than 50 meters might get "clipped" by the near plane, 
            // returning !pos. We manually bypass the projection matrix if it's physically in front.
            if (!pos && isFront) {
                // 1. Transform to Camera Space
                const pLocal = p.clone().applyMatrix4(camera.matrixWorldInverse);

                // 2. Check if in front (ThreeJS camera looks down -Z)
                if (pLocal.z < 0) {
                    if (camera.isPerspectiveCamera) {
                        // 3. Manual Perspective Divide (Bypassing Projection Matrix Near Clip)
                        const fovRad = camera.fov * (Math.PI / 180);
                        const scale = 1 / Math.tan(fovRad / 2);

                        const ndcX = (pLocal.x / -pLocal.z) * scale / camera.aspect;
                        const ndcY = (pLocal.y / -pLocal.z) * scale;

                        pos = new THREE.Vector3(
                            (ndcX + 1) / 2 * viewer.container.clientWidth,
                            (-ndcY + 1) / 2 * viewer.container.clientHeight,
                            0
                        );
                    } else {
                        // Orthographic fallback (Standard project)
                        const pClone = p.clone();
                        pClone.project(camera);
                        pos = new THREE.Vector3(
                            (pClone.x + 1) / 2 * viewer.container.clientWidth,
                            (-pClone.y + 1) / 2 * viewer.container.clientHeight,
                            0
                        );
                    }
                }
            }

            if (isFront && pos) {
                // 4. Bounds check (optional, but good to hide if way off screen)
                // Note: CSS absolute pos handles off-screen gracefully, but 'display: none' performs better.
                const x = pos.x;
                const y = pos.y;

                // Display if somewhat within bounds (allow partial visibility)
                // Relaxed bounds (-100 instead of -50) to catch edge cases
                if (x > -100 && y > -100 && x < viewer.container.clientWidth + 100 && y < viewer.container.clientHeight + 100) {
                    icon._element.style.display = icon.type === 'text' ? 'flex' : 'block';
                    icon._element.style.left = Math.floor(x) + 'px';
                    icon._element.style.top = Math.floor(y) + 'px';
                } else {
                    icon._element.style.display = 'none';
                }
            } else {
                icon._element.style.display = 'none';
            }
        });
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('IconMarkupExtension', IconMarkupExtension);
export default IconMarkupExtension;
