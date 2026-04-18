import { BaseExtension } from './BaseExtension';

class ProgressiveExtension extends BaseExtension {
    constructor(viewer, options) {
        super(viewer, options);
        this.options = options || {};
        this._markers = [];
        this._visible = false;
        this._overlayName = 'progressive-overlay';
        this._meshes = [];
        this._labelGroup = null;    // DOM container for text labels
        this._labelElements = [];   // { el, worldPos }
        this.onCameraChange = this.onCameraChange.bind(this);
        this._rafId = null;
    }

    load() {
        super.load();
        console.log('ProgressiveExtension loaded');

        // THREE.js overlay scene for line + ticks (GPU-native, zero lag)
        if (!this.viewer.overlays.hasScene(this._overlayName)) {
            this.viewer.overlays.addScene(this._overlayName);
        }

        // DOM container for text labels only (~15 elements, negligible cost)
        this._labelGroup = document.createElement('div');
        this._labelGroup.className = 'progressive-label-group';
        this._labelGroup.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:90;display:none;';
        this.viewer.container.appendChild(this._labelGroup);

        this.viewer.addEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.onCameraChange);

        return true;
    }

    unload() {
        super.unload();
        this._clearOverlay();
        try { this.viewer.overlays.removeScene(this._overlayName); } catch (e) {}
        if (this._labelGroup) { this._labelGroup.remove(); this._labelGroup = null; }
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this.viewer.removeEventListener(Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.onCameraChange);
        return true;
    }

    toggleVisibility(isVisible) {
        this._visible = isVisible;
        this._meshes.forEach(mesh => { mesh.visible = isVisible; });
        if (this._labelGroup) this._labelGroup.style.display = isVisible ? 'block' : 'none';
        this.viewer.impl.invalidate(true, true, true);
        if (isVisible) this._updateLabels();
    }

    _clearOverlay() {
        this._meshes.forEach(mesh => {
            try { this.viewer.overlays.removeMesh(mesh, this._overlayName); } catch (e) {}
        });
        this._meshes = [];
        this._labelElements = [];
        if (this._labelGroup) this._labelGroup.innerHTML = '';
    }

    setWorkfronts(data) {
        this._workfronts = data || [];
    }

    setMarkers(markersData) {
        this._markers = markersData || [];
        this._clearOverlay();

        if (this._markers.length < 2) return;

        // --- Coordinate Transformation ---
        const model = this.viewer.getAllModels()[0];
        let globalOffset = { x: 0, y: 0, z: 0 };
        if (model && model.getData().globalOffset) {
            globalOffset = model.getData().globalOffset;
        }

        // Civil 3D meters → viewer mm
        const viewerPoints = this._markers.map(m => new THREE.Vector3(
            m.x * 1000 - globalOffset.x,
            m.y * 1000 - globalOffset.y,
            m.z * 1000 - globalOffset.z
        ));

        console.log('[ProgressiveExtension] 🎯 Renderizando', viewerPoints.length, 'vértices');

        // ═══════════════════════════════════════════
        // 1. MAIN ALIGNMENT LINE (THREE.js — zero lag)
        // ═══════════════════════════════════════════
        const lineGeom = new THREE.BufferGeometry().setFromPoints(viewerPoints);
        const lineMat = new THREE.LineBasicMaterial({
            color: 0x3b82f6,
            linewidth: 2,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.9
        });
        const mainLine = new THREE.Line(lineGeom, lineMat);
        this.viewer.overlays.addMesh(mainLine, this._overlayName);
        this._meshes.push(mainLine);

        // ═══════════════════════════════════════════
        // 2. TICK MARKS (THREE.js — zero lag)
        // ═══════════════════════════════════════════
        const tickVertices = [];
        const tickLength = 3000; // 3m per side

        viewerPoints.forEach((pt, i) => {
            let dir;
            if (i < viewerPoints.length - 1) {
                dir = viewerPoints[i + 1].clone().sub(pt).normalize();
            } else {
                dir = pt.clone().sub(viewerPoints[i - 1]).normalize();
            }
            const perp = new THREE.Vector3(-dir.y, dir.x, 0).normalize();
            tickVertices.push(
                pt.clone().add(perp.clone().multiplyScalar(tickLength)),
                pt.clone().add(perp.clone().multiplyScalar(-tickLength))
            );
        });

        const tickGeom = new THREE.BufferGeometry().setFromPoints(tickVertices);
        const tickMat = new THREE.LineBasicMaterial({
            color: 0x3b82f6,
            linewidth: 1,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 0.7
        });
        const ticks = new THREE.LineSegments(tickGeom, tickMat);
        this.viewer.overlays.addMesh(ticks, this._overlayName);
        this._meshes.push(ticks);

        // ═══════════════════════════════════════════
        // 2.5 WORKFRONTS RIBBON (3D TINT)
        // ═══════════════════════════════════════════
        if (this._workfronts && this._workfronts.length > 0) {
            const width = 14000; // 14m wide ribbon (7m each side)
            const pts = [];
            const colors = [];
            
            // Loop through all segments
            for (let i = 0; i < viewerPoints.length - 1; i++) {
                const ptA = viewerPoints[i];
                const ptB = viewerPoints[i+1];
                const stationA = this._markers[i].station;
                const stationB = this._markers[i+1].station;
                const midStation = (stationA + stationB) / 2;

                // Find if this segment belongs to a workfront
                const wf = this._workfronts.find(w => midStation >= w.start && Math.floor(midStation) <= w.end);
                
                if (wf) {
                    const color = new THREE.Color(wf.color);
                    
                    const dirA = (i === 0) ? ptB.clone().sub(ptA).normalize() : ptA.clone().sub(viewerPoints[i-1]).normalize();
                    const perpA = new THREE.Vector3(-dirA.y, dirA.x, 0).normalize();
                    const dirB = (i === viewerPoints.length-2) ? ptB.clone().sub(ptA).normalize() : viewerPoints[i+2].clone().sub(ptB).normalize();
                    const perpB = new THREE.Vector3(-dirB.y, dirB.x, 0).normalize();

                    // 4 vertices of the quad
                    const vA_left = ptA.clone().add(perpA.clone().multiplyScalar(width/2));
                    const vA_right = ptA.clone().add(perpA.clone().multiplyScalar(-width/2));
                    const vB_left = ptB.clone().add(perpB.clone().multiplyScalar(width/2));
                    const vB_right = ptB.clone().add(perpB.clone().multiplyScalar(-width/2));

                    // Tri 1: vA_left, vA_right, vB_left
                    pts.push(vA_left, vA_right, vB_left);
                    colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);

                    // Tri 2: vB_left, vA_right, vB_right
                    pts.push(vB_left, vA_right, vB_right);
                    colors.push(color.r, color.g, color.b, color.r, color.g, color.b, color.r, color.g, color.b);
                }
            }

            if (pts.length > 0) {
                const ribbonGeom = new THREE.BufferGeometry().setFromPoints(pts);
                ribbonGeom.addAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
                
                const ribbonMat = new THREE.MeshBasicMaterial({
                    vertexColors: THREE.VertexColors,
                    transparent: true,
                    opacity: 0.55,
                    depthWrite: false,
                    depthTest: true,
                    side: THREE.DoubleSide
                });

                const ribbonMesh = new THREE.Mesh(ribbonGeom, ribbonMat);
                // Elevate exactly 0.8 meters to hover cleanly over the surface without crashing
                ribbonMesh.position.z += 800; 
                this.viewer.overlays.addMesh(ribbonMesh, this._overlayName);
                this._meshes.push(ribbonMesh);
            }
        }

        // ═══════════════════════════════════════════
        // 3. TEXT LABELS (DOM — all stations, LOD density)
        //    - Always horizontal
        //    - Close: every 10m, Medium: every 20m, Far: every 50m
        // ═══════════════════════════════════════════
        this._labelElements = [];

        viewerPoints.forEach((pt, i) => {
            const el = document.createElement('div');
            el.style.cssText = `
                position: absolute;
                color: white;
                padding: 1px 4px;
                font: bold 10px Inter, Arial, sans-serif;
                white-space: nowrap;
                pointer-events: auto;
                cursor: pointer;
                text-shadow: 0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6);
                transform-origin: center center;
                transition: color 0.2s, transform 0.2s;
            `;
            el.textContent = this._markers[i].label;

            el.onmouseenter = () => el.style.color = '#7bf2ff';
            el.onmouseleave = () => el.style.color = 'white';

            const worldPos = pt.clone();
            const worldDir = new THREE.Vector3(this._markers[i].dx || 0, this._markers[i].dy || 0, this._markers[i].dz || 0);

            el.onclick = () => {
                // 1. Calculate infinite slicing plane perpendicular to the progressive
                // The road direction is worldDir. We want to cut across it. 
                // So the normal of the clipping plane is worldDir itself.
                const normal = worldDir.clone().normalize();
                const d = -normal.dot(worldPos);
                const plane = new THREE.Vector4(normal.x, normal.y, normal.z, d);
                
                // 2. Pass plane to Native APS Viewer
                this.viewer.setCutPlanes([plane]);
                
                // 3. Move camera to look perfectly at the cross-section!
                // The plane removes geometry on the POSITIVE side of normal.
                // So we must place the camera on the positive side, looking back at the section.
                const upVec = this.viewer.navigation.getCameraUpVector();
                const camPos = worldPos.clone()
                    .add(normal.clone().multiplyScalar(40000)) // 40m away in the empty space
                    .add(upVec.clone().multiplyScalar(15000)); // 15m elevated
                    
                this.viewer.navigation.setRequestTransition(true, camPos, worldPos, upVec);

                // 4. Show Clear Button
                if (!this._clearSectionBtn) {
                    this._clearSectionBtn = document.createElement('button');
                    this._clearSectionBtn.innerText = '✖ Terminar Sección';
                    this._clearSectionBtn.style.cssText = `
                        position: absolute; bottom: 40px; left: 50%; transform: translateX(-50%);
                        background: #3b82f6; color: white; border: none; padding: 10px 20px;
                        border-radius: 20px; font-weight: bold; cursor: pointer;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.4); pointer-events: auto;
                        z-index: 1000; font-family: Inter, sans-serif; transition: background 0.2s;
                    `;
                    this._clearSectionBtn.onmouseenter = () => this._clearSectionBtn.style.background = '#2563eb';
                    this._clearSectionBtn.onmouseleave = () => this._clearSectionBtn.style.background = '#3b82f6';
                    
                    this._clearSectionBtn.onclick = () => {
                        this.viewer.setCutPlanes([]); // Remove cuts
                        this._clearSectionBtn.style.display = 'none';
                        // Viewer default reset view or let user keep exploring
                    };
                    this.viewer.container.appendChild(this._clearSectionBtn);
                }
                this._clearSectionBtn.style.display = 'block';
            };

            this._labelGroup.appendChild(el);
            this._labelElements.push({
                el,
                worldPos: worldPos,
                worldDir: worldDir,
                station: this._markers[i].station || 0
            });
        });

        // Visibility
        if (!this._visible) {
            this._meshes.forEach(mesh => { mesh.visible = false; });
        }

        this.viewer.impl.invalidate(true, true, true);
        if (this._visible) this._updateLabels();
    }

    // Update ALL labels: position + LOD density + Rotation aligned to track
    _updateLabels() {
        if (!this._visible || this._labelElements.length === 0) return;

        const cameraPos = this.viewer.navigation.getPosition();

        this._labelElements.forEach(({ el, worldPos, worldDir, station }) => {
            const dist = cameraPos.distanceTo(worldPos);

            // LOD density based on zoom PER LABEL (stations are every 10m)
            let stationInterval;
            if (dist < 80000) {         // < 80m → every 10m
                stationInterval = 10;
            } else if (dist < 200000) { // < 200m → every 20m
                stationInterval = 20;
            } else {                        // > 200m → every 50m
                stationInterval = 50;
            }

            // LOD: show only labels at current interval
            if (Math.round(station) % stationInterval !== 0) {
                el.style.display = 'none';
                return;
            }

            const screenPos = this.viewer.worldToClient(worldPos);

            if (screenPos.z < 0 || screenPos.z > 1) {
                el.style.display = 'none';
                return;
            }

            // The text should align with the tick mark (perpendicular to the progressive line)
            const perpDir = new THREE.Vector3(-worldDir.y, worldDir.x, 0).normalize();

            // Transform perpendicular direction to screen space to get 2D angle
            const ptNext = worldPos.clone().add(perpDir.clone().multiplyScalar(5));
            const screenPosNext = this.viewer.worldToClient(ptNext);
            
            let angle = Math.atan2(screenPosNext.y - screenPos.y, screenPosNext.x - screenPos.x);

            // LOD Opacity: Fade out when zooming out, but without exaggerating (minimum 0.4)
            // distances usually go up to 350000
            let targetOpacity = 1;
            if (dist > 50000) {
                targetOpacity = Math.max(0.4, 1 - ((dist - 50000) / 300000));
            }

            el.style.display = 'block';
            el.style.left = screenPos.x + 'px';
            el.style.top = screenPos.y + 'px';
            el.style.opacity = targetOpacity.toFixed(2);
            // Translate: Center perfectly on the intersection line
            el.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
        });
    }

    onCameraChange() {
        if (!this._visible) return;
        // Debounce label updates with rAF (only ~15 elements, fast)
        if (this._rafId) cancelAnimationFrame(this._rafId);
        this._rafId = requestAnimationFrame(() => this._updateLabels());
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('ProgressiveExtension', ProgressiveExtension);
export default ProgressiveExtension;
