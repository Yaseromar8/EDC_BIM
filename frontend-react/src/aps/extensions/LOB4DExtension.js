export default class LOB4DExtension extends window.Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.viewer = viewer;
        this.animationId = null;
        this.materialName = 'lob-shader-material';
        this.currentStation = 0;
        this.isPlaying = false;
        this.fragmentsBackup = new Map();
        this.alignmentBaked = false;
        this.overlayName = 'lobAlignmentOverlay';
        this.alignmentTube = null;
        this.alignmentLine = null;
        this.pkMarker = null;
        this.pkMarkerLabel = null;
        this.stationCursorLine = null;
        this.stationAnnotations = [];
        this.showStationAnnotations = true;
        // Hover dinámico (PK en vivo como ACC): muestras del eje + handler de mouse
        this.alignmentSamples = [];   // [{ point: Vector3(viewer), station }]
        this._onCanvasMove = null;
        this._hoverRaf = null;
        this.liveHoverThresholdPx = 60; // tolerancia solo para arrastrar el cursor de estación
        // Etiquetas de progresivas como DOM (patrón fiable de ProgressiveExtension,
        // en vez de THREE.Sprite que no renderiza confiable en el overlay de LMV)
        this._stationLabelGroup = null;
        this._stationLabelElements = [];
        this._stationLabelRaf = null;
        this._pkDomLabel = null;
        this._isStationCursorDragging = false;
        this._onStationCursorPointerMove = this.onStationCursorPointerMove.bind(this);
        this._onStationCursorPointerUp = this.onStationCursorPointerUp.bind(this);
        this.onStationCameraChange = this.onStationCameraChange.bind(this);
        this.directThemedDbIds = new Map();

        this.vertexShader = `
            attribute float aInstancePKOffset;
            attribute float aLocalPK;

            varying float vAbsolutePK;
            varying vec3 vWorldPosition;

            void main() {
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;

                #ifdef USE_INSTANCING
                    vAbsolutePK = aLocalPK + aInstancePKOffset;
                #else
                    vAbsolutePK = aLocalPK;
                #endif

                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        this.fragmentShader = `
            uniform float uCurrentStation;
            uniform bool uUseAlignment;
            uniform vec3 uColorBuilt;
            uniform vec3 uColorPending;

            varying float vAbsolutePK;
            varying vec3 vWorldPosition;

            void main() {
                float pk = uUseAlignment ? vAbsolutePK : vWorldPosition.x;

                if (pk < uCurrentStation) {
                    gl_FragColor = vec4(uColorBuilt, 1.0);
                } else {
                    gl_FragColor = vec4(uColorPending, 0.4);
                }
            }
        `;
    }

    load() {
        console.log('[LOB4D] Extension Loaded');
        this.initShaderMaterial();

        this.handlePlayEvent = (e) => {
            if (e.detail.isPlaying) {
                this.viewer.setCutPlanes([]); // Clear any cut planes
                if (!this.spatialIndex && this.viewer.model) {
                    this.buildSpatialIndex();
                }
                // Stop the spatial PK animation if it was running
                this.stopAnimation();
            }
        };

        this.handleSeekEvent = (e) => {
            this.setStation(e.detail.station);
        };
        
        this.handleTimeUpdate = (e) => {
            const { date, tasks } = e.detail;
            this.simulate4D(date, tasks, e.detail);
        };

        this.handleClear4D = () => {
            this.clear4DTheming();
        };

        window.addEventListener('lob-play', this.handlePlayEvent);
        window.addEventListener('lob-seek', this.handleSeekEvent);
        window.addEventListener('lob-time-update', this.handleTimeUpdate);
        window.addEventListener('lob-clear', this.handleClear4D);


        // Contenedor DOM para las etiquetas de progresivas (fiable, se proyecta con la cámara)
        this._stationLabelGroup = document.createElement('div');
        this._stationLabelGroup.className = 'lob-station-label-group';
        this._stationLabelGroup.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:90;overflow:hidden;';
        this.viewer.container.appendChild(this._stationLabelGroup);
        this.viewer.addEventListener(window.Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.onStationCameraChange);

        return true;
    }

    unload() {
        console.log('[LOB4D] Extension Unloaded');
        this.stopAnimation();
        this.restoreMaterials();
        this.clearAlignmentOverlay();
        this.disableLiveHover();
        this.stopStationCursorDrag();
        this.viewer.removeEventListener(window.Autodesk.Viewing.CAMERA_CHANGE_EVENT, this.onStationCameraChange);
        if (this._stationLabelRaf) {
            cancelAnimationFrame(this._stationLabelRaf);
            this._stationLabelRaf = null;
        }
        if (this._stationLabelGroup) {
            this._stationLabelGroup.remove();
            this._stationLabelGroup = null;
        }

        window.removeEventListener('lob-play', this.handlePlayEvent);
        window.removeEventListener('lob-seek', this.handleSeekEvent);
        window.removeEventListener('lob-time-update', this.handleTimeUpdate);
        window.removeEventListener('lob-clear', this.handleClear4D);
        this.viewer.clearThemingColors();
        this.spatialIndex = null;
        this.alignmentLines = [];
        this.alignmentTubes = [];
        this.alignmentSamples = [];
        this.activeAlignments = [];

        return true;
    }

    // ── Hover dinámico estilo ACC ───────────────────────────────────────────────
    // Al mover el mouse cerca del eje activo, calcula la progresiva (PK) del punto
    // más cercano y actualiza el marcador + emite LOB4D_PK_CONTEXT_CHANGED (el panel
    // React lo renderiza). Throttle a 1 por frame. No consume el evento → orbitar y
    // seleccionar siguen funcionando.
    enableLiveHover() {
        if (this._onCanvasMove) return;
        const canvas = this.viewer?.impl?.canvas || this.viewer?.canvas;
        if (!canvas) return;

        this._onCanvasMove = (ev) => {
            if (!this.activeAlignment || !this.alignmentSamples.length) return;
            if (this._hoverRaf) return; // ya hay uno pendiente este frame
            this._hoverRaf = requestAnimationFrame(() => {
                this._hoverRaf = null;
                const station = this.stationFromCursor(ev.clientX, ev.clientY);
                if (station != null) this.setStation(station);
            });
        };
        canvas.addEventListener('mousemove', this._onCanvasMove);
    }

    disableLiveHover() {
        const canvas = this.viewer?.impl?.canvas || this.viewer?.canvas;
        if (this._onCanvasMove && canvas) {
            canvas.removeEventListener('mousemove', this._onCanvasMove);
        }
        this._onCanvasMove = null;
        if (this._hoverRaf) {
            cancelAnimationFrame(this._hoverRaf);
            this._hoverRaf = null;
        }
    }

    // Proyecta las muestras del eje a pantalla y devuelve la estación de la más
    // cercana al cursor, solo si está dentro del umbral (px). Si no, null.
    stationFromCursor(clientX, clientY) {
        const THREE = window.THREE;
        const canvas = this.viewer?.impl?.canvas || this.viewer?.canvas;
        const camera = this.viewer?.impl?.camera;
        if (!THREE || !canvas || !camera || !this.alignmentSamples.length) return null;

        const rect = canvas.getBoundingClientRect();
        const v = new THREE.Vector3();
        let best = null;
        let bestDist = Infinity;

        for (const sample of this.alignmentSamples) {
            v.copy(sample.point).project(camera);
            if (v.z > 1) continue; // detrás de la cámara
            const sx = rect.left + (v.x * 0.5 + 0.5) * rect.width;
            const sy = rect.top + (-v.y * 0.5 + 0.5) * rect.height;
            const d = (sx - clientX) * (sx - clientX) + (sy - clientY) * (sy - clientY);
            if (d < bestDist) { bestDist = d; best = sample; }
        }

        const threshold = this.liveHoverThresholdPx;
        if (best && bestDist <= threshold * threshold) return best.station;
        return null;
    }

    getDirectionAtStation(station) {
        const THREE = window.THREE;
        if (!THREE || !this.alignmentSamples.length) return null;

        const pk = Number(station);
        let index = 0;
        let bestDelta = Infinity;
        this.alignmentSamples.forEach((sample, i) => {
            const delta = Math.abs(Number(sample.station) - pk);
            if (delta < bestDelta) {
                bestDelta = delta;
                index = i;
            }
        });

        const prev = this.alignmentSamples[Math.max(0, index - 1)];
        const next = this.alignmentSamples[Math.min(this.alignmentSamples.length - 1, index + 1)];
        if (!prev || !next || prev.point.equals(next.point)) return new THREE.Vector3(1, 0, 0);

        return next.point.clone().sub(prev.point).normalize();
    }

    getStationCursorHalfLength(model) {
        const THREE = window.THREE;
        const box = model?.getBoundingBox?.();
        const meterScale = this.getCivilToModelScale(model, 'm');
        if (!THREE || !box) return 18 * meterScale;

        const size = new THREE.Vector3();
        box.getSize(size);
        const extent = Math.max(size.x, size.y, size.z, 1);
        return Math.max(10 * meterScale, Math.min(45 * meterScale, extent / 90));
    }

    drawStationCursor(station) {
        const THREE = window.THREE;
        const model = this.getModelForCoordinates();
        if (!THREE || !model || !this.activeAlignment) return;

        if (this.stationCursorLine) {
            this.viewer.impl.removeOverlay(this.overlayName, this.stationCursorLine);
            this.stationCursorLine.geometry?.dispose?.();
            this.stationCursorLine.material?.dispose?.();
            this.stationCursorLine = null;
        }

        const civilPoint = this.pointAtStation(this.activeAlignment, station);
        const center = this.civilToViewerPoint(civilPoint, model);
        if (!center) return;

        const direction = this.getDirectionAtStation(station) || new THREE.Vector3(1, 0, 0);
        const perp = new THREE.Vector3(-direction.y, direction.x, 0);
        if (perp.lengthSq() < 1e-8) perp.set(0, 1, 0);
        perp.normalize();

        const half = this.getStationCursorHalfLength(model);
        const points = [
            center.clone().add(perp.clone().multiplyScalar(half)),
            center.clone().add(perp.clone().multiplyScalar(-half))
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0xffc400,
            depthTest: false,
            depthWrite: false,
            transparent: true,
            opacity: 1,
            linewidth: 4
        });

        this.stationCursorLine = new THREE.Line(geometry, material);
        this.stationCursorLine.frustumCulled = false;
        this.stationCursorLine.renderOrder = 10005;
        this.viewer.impl.addOverlay(this.overlayName, this.stationCursorLine);
        this.viewer.impl.invalidate(true, true, true);
    }

    activateStationCursor(station) {
        if (!Number.isFinite(Number(station))) return;
        this.drawStationCursor(station);
        this.setStation(station);
    }

    startStationCursorDrag(event) {
        this._isStationCursorDragging = true;
        document.addEventListener('pointermove', this._onStationCursorPointerMove);
        document.addEventListener('pointerup', this._onStationCursorPointerUp);
        event?.preventDefault?.();
        event?.stopPropagation?.();
    }

    stopStationCursorDrag() {
        this._isStationCursorDragging = false;
        document.removeEventListener('pointermove', this._onStationCursorPointerMove);
        document.removeEventListener('pointerup', this._onStationCursorPointerUp);
    }

    onStationCursorPointerMove(event) {
        if (!this._isStationCursorDragging || !this.activeAlignment) return;
        const station = this.stationFromCursor(event.clientX, event.clientY);
        if (station == null) return;
        this.setStation(station);
    }

    onStationCursorPointerUp() {
        this.stopStationCursorDrag();
    }

    buildAlignmentSamples(alignmentData, model) {
        const profilePoints = this.getActiveProfilePoints(alignmentData);
        if (profilePoints.length >= 2) {
            return profilePoints
                .map(point => {
                    const viewerPoint = this.civilToViewerPoint(point, model);
                    return viewerPoint ? { point: viewerPoint, station: point.station } : null;
                })
                .filter(Boolean);
        }

        const samples = [];
        const subEntities = alignmentData?.subEntities || [];
        for (const segment of subEntities) {
            for (const station of this.getSegmentSampleStations(alignmentData, segment)) {
                const civilPoint = this.pointAtStation(alignmentData, station);
                const viewerPoint = this.civilToViewerPoint(civilPoint, model);
                if (viewerPoint) samples.push({ point: viewerPoint, station });
            }
        }
        return samples;
    }

    initShaderMaterial() {
        const THREE = window.THREE;
        const uniforms = {
            uCurrentStation: { type: 'f', value: this.currentStation },
            uUseAlignment: { type: 'b', value: this.alignmentBaked },
            uColorBuilt: { type: 'v3', value: new THREE.Color('#4caf50') },
            uColorPending: { type: 'v3', value: new THREE.Color('#9e9e9e') }
        };

        const material = new THREE.ShaderMaterial({
            vertexShader: this.vertexShader,
            fragmentShader: this.fragmentShader,
            uniforms,
            transparent: true,
            side: THREE.DoubleSide
        });

        material.supportsMrtNormals = true;

        this.shaderMaterial = material;
        this.viewer.impl.matman().addMaterial(this.materialName, material, true);
    }

    applyMaterialToAll() {
        const material = this.shaderMaterial;
        if (!material) return;

        const models = this.viewer.getVisibleModels();
        models.forEach(model => {
            const fragList = model.getFragmentList();
            const fragCount = fragList.fragments.fragId2dbId.length;

            for (let i = 0; i < fragCount; i++) {
                const key = `${model.id}:${i}`;
                if (!this.fragmentsBackup.has(key)) {
                    this.fragmentsBackup.set(key, { model, fragId: i, material: fragList.getMaterial(i) });
                }
                fragList.setMaterial(i, material);
            }
        });
        this.viewer.impl.invalidate(true);
    }

    restoreMaterials() {
        this.fragmentsBackup.forEach(({ model, fragId, material }) => {
            model.getFragmentList().setMaterial(fragId, material);
        });
        this.fragmentsBackup.clear();
        this.viewer.impl.invalidate(true);
    }

    setStation(station) {
        this.currentStation = station;
        const material = this.shaderMaterial;
        if (material) {
            material.uniforms.uCurrentStation.value = this.currentStation;
            material.needsUpdate = true;
        }

        if (this.activeAlignment) {
            if (this.stationCursorLine) {
                this.drawStationCursor(station);
            }
            this.simulatePK(this.activeAlignment, station);
        }

        this.viewer.impl.invalidate(true, true, true);
    }

    async loadAlignment(url) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('Error loading alignment JSON');
            const data = await res.json();
            if (data && data.length > 0) {
                this.alignmentData = data[0]; // Extraemos el primero
                this.drawAlignment(this.alignmentData);
                this.pkMarker = this.createPKMarker();
                this.setStation(this.alignmentData.startStation || 0); // Trigger inicial
            }
        } catch (err) {
            console.error('[LOB4DExtension] Error:', err);
        }
    }

    startAnimation() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this.viewer.setCutPlanes([]); // Clear just in case

        const animate = () => {
            if (!this.isPlaying) return;
            
            const inc = this.activeAlignment?.stationIncrement || 10.0;
            const speed = inc / 20.0; // Dynamic speed based on interval
            let nextStation = this.currentStation + speed;
            
            const maxStation = this.activeAlignment?.endStation || 1000;
            const minStation = this.activeAlignment?.startStation || 0;
            
            if (nextStation > maxStation) {
                nextStation = minStation;
            }
            
            this.setStation(nextStation);
            this.animationId = requestAnimationFrame(animate);
        };
        animate();
    }

    stopAnimation() {
        this.isPlaying = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.viewer.setCutPlanes([]);
    }

    // ── LOB 4D Temporal Simulation ──────────────────────────────────────────────
    
    findClosestStation(point) {
        if (!this.alignmentSamples || !this.alignmentSamples.length) return null;
        let bestDist = Infinity;
        let bestStation = 0;
        for (const sample of this.alignmentSamples) {
            const d = sample.point.distanceToSquared(point);
            if (d < bestDist) {
                bestDist = d;
                bestStation = sample.station;
            }
        }
        return bestStation;
    }

    buildSpatialIndex() {
        // Redefined for backward compatibility, but now we use buildPropertyIndex
    }

    normalize4DKey(value) {
        return String(value || '').trim();
    }

    normalize4DPropName(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '');
    }

    isActivityPropertyName(displayName) {
        const name = this.normalize4DPropName(displayName);
        const keys = [
            'activityid',
            'idactividad',
            'codigoactividad',
            'codigoplaneamiento',
            'planningcode',
            'scheduleid',
            'taskid',
            'wbs',
            'edt',
            'codigodepartida',   // 03_05_DSI_CodigoDePartida{1..4}: llave partida/EDT de los elementos
        ];
        return keys.some((key) => name.includes(key));
    }

    getTaskKeys(task) {
        if (!task) return [];
        const keys = [
            task.id,
            task.activityId,
            task.activityID,
            task.codigoPlaneamiento,
            task.code,
            ...(Array.isArray(task.externalIds) ? task.externalIds : []),
        ];
        return keys
            .map((key) => this.normalize4DKey(key))
            .filter(Boolean);
    }

    getTaskDbIds(task) {
        if (!task) return [];
        const raw = [
            task.dbId,
            task.dbid,
            task.dbIds,
            task.dbids,
        ].flat(Infinity);
        return raw
            .flatMap((value) => String(value || '').split(/[;,|]/))
            .map((value) => Number(value.trim()))
            .filter((value) => Number.isInteger(value) && value > 0);
    }

    getThemingModels() {
        const models = this.viewer.getAllModels?.() || this.viewer.getVisibleModels?.() || [];
        if (models.length) return models;
        return this.viewer.model ? [this.viewer.model] : [];
    }

    modelKey(model) {
        try {
            const data = model?.getData?.() || {};
            return String(data.urn || data.guid || model?.id || model?.getModelId?.() || 'model');
        } catch {
            return String(model?.id || 'model');
        }
    }

    directThemingKey(model, dbId) {
        return `${this.modelKey(model)}:${dbId}`;
    }

    clear4DTheming() {
        if (this.activityToDbIds) {
            for (const items of Object.values(this.activityToDbIds)) {
                for (const item of items) {
                    this.viewer.setThemingColor(item.dbId, null, item.model || this.viewer.model, true);
                    item.state = 'normal';
                }
            }
        }
        if (this.directThemedDbIds) {
            for (const item of this.directThemedDbIds.values()) {
                this.viewer.setThemingColor(item.dbId, null, item.model || this.viewer.model, true);
            }
            this.directThemedDbIds.clear();
        }
        this.viewer.impl.invalidate(true, true, true);
    }

    buildPropertyIndex() {
        return new Promise((resolve) => {
            this.activityToDbIds = {}; // "PQ08_1090" -> [{dbId: 12, state: 'normal'}, ...]

            console.log('[LOB4DExtension] Building property index...');

            const models = this.getThemingModels();
            if (!models.length) return resolve();

            let pending = models.length;
            const done = () => {
                pending -= 1;
                if (pending > 0) return;
                this.propertyIndexBuilt = true;
                const foundIds = Object.keys(this.activityToDbIds);
                console.log(`[LOB4DExtension] Property index built. Found ${foundIds.length} unique Activity IDs.`);
                window.dispatchEvent(new CustomEvent('lob-activities-found', { detail: { ids: foundIds } }));
                resolve();
            };

            models.forEach((model) => {
                const tree = model?.getInstanceTree?.();
                if (!tree) {
                    done();
                    return;
                }

                const leafDbIds = [];
                tree.enumNodeChildren(tree.getRootId(), (dbId) => {
                    let hasFrag = false;
                    tree.enumNodeFragments(dbId, () => { hasFrag = true; });
                    if (hasFrag) leafDbIds.push(dbId);
                }, true);

                if (!leafDbIds.length) {
                    done();
                    return;
                }

                // Sin propFilter para capturar el parametro aunque venga con prefijos/categorias internas.
                model.getBulkProperties(leafDbIds, undefined, (results) => {
                    for (const res of results) {
                        const activityIds = new Set();
                        for (const prop of res.properties || []) {
                            if (!this.isActivityPropertyName(prop.displayName)) continue;
                            const value = this.normalize4DKey(prop.displayValue);
                            if (value && value.length <= 120) {
                                value.split(/[;,|]/).forEach((part) => {
                                    const clean = this.normalize4DKey(part);
                                    if (clean) activityIds.add(clean);
                                });
                            }
                        }
                        for (const activityId of activityIds) {
                            if (!this.activityToDbIds[activityId]) {
                                this.activityToDbIds[activityId] = [];
                            }
                            this.activityToDbIds[activityId].push({ dbId: res.dbId, model, state: 'normal' });
                        }
                    }
                    done();
                }, (err) => {
                    console.error('[LOB4DExtension] Failed to build property index', err);
                    done();
                });
            });
        });
    }

    async simulate4D(date, activeTasks, payload = {}) {
        if (!this.getThemingModels().length) return;
        
        if (!this.propertyIndexBuilt) {
            await this.buildPropertyIndex();
        }
        if (!this.activityToDbIds) return;
        
        const THREE = window.THREE;
        const colorDone = new THREE.Vector4(0.12, 0.62, 0.32, 0.72);
        const colorExecuting = new THREE.Vector4(0.95, 0.62, 0.10, 1);
        const colorProgrammed = new THREE.Vector4(0.18, 0.44, 0.86, 0.38);
        
        let needsUpdate = false;
        
        const activeIds = new Set((activeTasks || []).flatMap((task) => this.getTaskKeys(task)));
        const completedIds = new Set((payload.completedTasks || []).flatMap((task) => this.getTaskKeys(task)));
        const plannedIds = new Set((payload.plannedTasks || []).flatMap((task) => this.getTaskKeys(task)));
        const directStates = new Map();

        const addDirect = (tasks, state) => {
            (tasks || []).forEach((task) => {
                this.getTaskDbIds(task).forEach((dbId) => directStates.set(dbId, state));
            });
        };

        addDirect(payload.completedTasks, 'done');
        addDirect(payload.plannedTasks, 'planned');
        addDirect(activeTasks, 'executing');
        
        for (const [activityId, items] of Object.entries(this.activityToDbIds)) {
            let newState = 'normal';
            if (completedIds.has(activityId)) newState = 'done';
            if (plannedIds.has(activityId)) newState = 'planned';
            if (activeIds.has(activityId)) newState = 'executing';
            
            for (const item of items) {
                if (item.state !== newState) {
                    if (newState === 'executing') {
                        this.viewer.setThemingColor(item.dbId, colorExecuting, item.model || this.viewer.model, true);
                    } else if (newState === 'done') {
                        this.viewer.setThemingColor(item.dbId, colorDone, item.model || this.viewer.model, true);
                    } else if (newState === 'planned') {
                        this.viewer.setThemingColor(item.dbId, colorProgrammed, item.model || this.viewer.model, true);
                    } else {
                        this.viewer.setThemingColor(item.dbId, null, item.model || this.viewer.model, true);
                    }
                    item.state = newState;
                    needsUpdate = true;
                }
            }
        }

        if (this.directThemedDbIds) {
            for (const item of this.directThemedDbIds.values()) {
                if (!directStates.has(item.dbId)) {
                    this.viewer.setThemingColor(item.dbId, null, item.model || this.viewer.model, true);
                    needsUpdate = true;
                }
            }
            this.directThemedDbIds.clear();
        }

        for (const [dbId, state] of directStates) {
            const model = this.viewer.model;
            const color = state === 'executing'
                ? colorExecuting
                : state === 'done'
                    ? colorDone
                    : colorProgrammed;
            this.viewer.setThemingColor(dbId, color, model, true);
            this.directThemedDbIds.set(this.directThemingKey(model, dbId), { dbId, model });
            needsUpdate = true;
        }

        if (needsUpdate) {
            this.viewer.impl.invalidate(true, true, true);
        }
    }

    ensureOverlay() {
        if (!this.viewer.impl.overlayScenes[this.overlayName]) {
            this.viewer.impl.createOverlayScene(this.overlayName);
        }
    }

    clearAlignmentOverlay() {
        this.ensureOverlay();

        this.alignmentSamples = []; // detiene el hover dinámico al deseleccionar
        this.stopStationCursorDrag();
        this.clearStationAnnotations();

        if (this.alignmentTubes && this.alignmentTubes.length) {
            this.alignmentTubes.forEach(tube => {
                if (tube) {
                    this.viewer.impl.removeOverlay(this.overlayName, tube);
                    this.disposeObject3D(tube);
                }
            });
        }
        if (this.alignmentTube) {
            this.viewer.impl.removeOverlay(this.overlayName, this.alignmentTube);
            this.disposeObject3D(this.alignmentTube);
        }

        if (this.alignmentLines && this.alignmentLines.length) {
            this.alignmentLines.forEach(line => {
                if (line) {
                    this.viewer.impl.removeOverlay(this.overlayName, line);
                    line.geometry?.dispose?.();
                    line.material?.dispose?.();
                }
            });
        }
        if (this.alignmentLine) {
            this.viewer.impl.removeOverlay(this.overlayName, this.alignmentLine);
            this.alignmentLine.geometry?.dispose?.();
            this.alignmentLine.material?.dispose?.();
        }

        this.alignmentTube = null;
        this.alignmentLine = null;
        this.alignmentTubes = [];
        this.alignmentLines = [];

        if (this.pkMarker) {
            this.viewer.impl.removeOverlay(this.overlayName, this.pkMarker);
            this.pkMarker.geometry?.dispose?.();
            this.pkMarker.material?.dispose?.();
            this.pkMarker = null;
        }

        if (this.pkMarkerLabel) {
            this.viewer.impl.removeOverlay(this.overlayName, this.pkMarkerLabel);
            this.disposeSprite(this.pkMarkerLabel);
            this.pkMarkerLabel = null;
        }

        if (this.stationCursorLine) {
            this.viewer.impl.removeOverlay(this.overlayName, this.stationCursorLine);
            this.stationCursorLine.geometry?.dispose?.();
            this.stationCursorLine.material?.dispose?.();
            this.stationCursorLine = null;
        }
        this.clearPkDomLabel();

        this.viewer.impl.invalidate(true, true, true);
    }

    disposeObject3D(object) {
        const geometries = new Set();
        const materials = new Set();

        object?.traverse?.(child => {
            if (child.geometry) geometries.add(child.geometry);
            if (Array.isArray(child.material)) {
                child.material.forEach(material => materials.add(material));
            } else if (child.material) {
                materials.add(child.material);
            }
        });

        geometries.forEach(geometry => geometry.dispose?.());
        materials.forEach(material => material.dispose?.());
    }

    getModelForCoordinates() {
        return this.viewer.model || this.viewer.getVisibleModels?.()[0] || null;
    }

    getGlobalOffset(model) {
        return model?.getData?.()?.globalOffset || model?.getGlobalOffset?.() || { x: 0, y: 0, z: 0 };
    }

    getModelTransform(model) {
        const THREE = window.THREE;
        if (!THREE || !model) return null;

        const candidates = [
            model.getModelTransform?.(),
            model.getData?.()?.placementTransform,
            model.getData?.()?.loadOptions?.placementTransform
        ];

        for (const candidate of candidates) {
            if (!candidate) continue;
            if (candidate.isMatrix4) return candidate.clone();
            if (Array.isArray(candidate) && candidate.length === 16) {
                return new THREE.Matrix4().fromArray(candidate);
            }
        }

        return null;
    }

    isIdentityMatrix(matrix) {
        if (!matrix) return true;

        const e = matrix.elements;
        return Math.abs(e[0] - 1) < 1e-9 &&
            Math.abs(e[5] - 1) < 1e-9 &&
            Math.abs(e[10] - 1) < 1e-9 &&
            Math.abs(e[15] - 1) < 1e-9 &&
            Math.abs(e[1]) < 1e-9 &&
            Math.abs(e[2]) < 1e-9 &&
            Math.abs(e[3]) < 1e-9 &&
            Math.abs(e[4]) < 1e-9 &&
            Math.abs(e[6]) < 1e-9 &&
            Math.abs(e[7]) < 1e-9 &&
            Math.abs(e[8]) < 1e-9 &&
            Math.abs(e[9]) < 1e-9 &&
            Math.abs(e[11]) < 1e-9 &&
            Math.abs(e[12]) < 1e-9 &&
            Math.abs(e[13]) < 1e-9 &&
            Math.abs(e[14]) < 1e-9;
    }

    getCivilToModelScale(model, civilUnit = 'm') {
        const unitToMeters = {
            m: 1,
            meter: 1,
            meters: 1,
            metre: 1,
            metres: 1,
            mm: 0.001,
            millimeter: 0.001,
            millimeters: 0.001,
            cm: 0.01,
            centimeter: 0.01,
            centimeters: 0.01,
            ft: 0.3048,
            feet: 0.3048,
            foot: 0.3048,
            in: 0.0254,
            inch: 0.0254,
            inches: 0.0254
        };

        const modelUnit = String(model?.getUnitString?.() || 'm').toLowerCase();
        const from = unitToMeters[String(civilUnit || 'm').toLowerCase()] || 1;
        const to = unitToMeters[modelUnit] || 1;
        return from / to;
    }

    getFallbackGlobalZ(model) {
        const THREE = window.THREE;
        const offset = this.getGlobalOffset(model);
        const box = model?.getBoundingBox?.();

        if (!box) return offset.z || 0;

        const center = new THREE.Vector3();
        box.getCenter(center);
        return center.z;
    }

    civilToViewerPoint(point, model = this.getModelForCoordinates()) {
        const THREE = window.THREE;
        if (!point || !model) return null;

        const scale = this.getCivilToModelScale(model, 'm');
        const offset = this.getGlobalOffset(model);
        const modelTransform = this.getModelTransform(model);
        
        // Civil 3D alignments are often 2D (Z=0). If Z is exactly 0 or missing, we must use the model's fallback Z
        // otherwise it will be drawn kilometers below the terrain.
        const is2D = point.z == null || Math.abs(point.z) < 0.001;
        const localPoint = new THREE.Vector3(
            Number(point.x || 0) * scale,
            Number(point.y || 0) * scale,
            is2D ? (offset.z || 0) : Number(point.z || 0) * scale
        );

        // APS localizes large georeferenced coordinates by subtracting the model's
        // globalOffset first. The model transform, when present, is then applied in
        // localized viewer space. Applying it before subtracting the offset magnifies
        // translations/rotations around the wrong origin and causes large displacements.
        localPoint.sub(new THREE.Vector3(offset.x || 0, offset.y || 0, offset.z || 0));

        if (modelTransform && !this.isIdentityMatrix(modelTransform)) {
            localPoint.applyMatrix4(modelTransform);
        }

        if (is2D) {
            localPoint.z = this.getFallbackGlobalZ(model);
        }

        return localPoint;
    }

    formatStation(stationMeters) {
        if (stationMeters == null || Number.isNaN(Number(stationMeters))) return '0+000.00';
        const value = Number(stationMeters);
        const km = Math.floor(Math.abs(value) / 1000);
        const m = Math.abs(value) % 1000;
        const sign = value < 0 ? '-' : '';
        return `${sign}${km}+${m.toFixed(2).padStart(6, '0')}`;
    }

    disposeSprite(sprite) {
        if (!sprite) return;
        const material = sprite.material;
        material?.map?.dispose?.();
        material?.dispose?.();
    }

    clearStationAnnotations() {
        this.ensureOverlay();
        for (const item of this.stationAnnotations) {
            if (item.marker) {
                this.viewer.impl.removeOverlay(this.overlayName, item.marker);
                item.marker.geometry?.dispose?.();
                item.marker.material?.dispose?.();
            }
        }
        this.stationAnnotations = [];
        this._stationLabelElements.forEach(label => label.el?.remove?.());
        this._stationLabelElements = [];
        if (this._stationLabelGroup) {
            this._stationLabelGroup.style.display = 'none';
        }
    }

    getStationLabelStyle(priority = 0) {
        const isKey = priority >= 3;
        return `
            position:absolute;
            color:${isKey ? '#1f2937' : '#4b5563'};
            background:${isKey ? 'rgba(255,255,255,0.97)' : 'rgba(255,255,255,0.9)'};
            padding:${isKey ? '3px 7px' : '2px 6px'};
            border-radius:3px;
            border:1px solid ${isKey ? 'rgba(107,114,128,0.75)' : 'rgba(180,180,180,0.65)'};
            font:600 ${isKey ? 11 : 10}px Inter, Arial, sans-serif;
            white-space:nowrap;
            pointer-events:auto;
            cursor:pointer;
            box-shadow:0 1px 4px rgba(0,0,0,0.22);
            line-height:1.3;
            transform:translate(-50%, -135%);
            will-change:left, top, opacity, display;
        `;
    }

    createStationDomLabel(item, worldPos) {
        if (!this._stationLabelGroup) return null;

        const el = document.createElement('div');
        el.className = 'lob-station-label';
        el.style.cssText = this.getStationLabelStyle(item.priority);
        el.textContent = item.label;
        el.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.activateStationCursor(item.station);
        });
        el.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            this.activateStationCursor(item.station);
            this.startStationCursorDrag(event);
        });
        this._stationLabelGroup.appendChild(el);

        const label = {
            el,
            worldPos,
            station: Number(item.station),
            priority: item.priority || 0
        };
        this._stationLabelElements.push(label);
        return label;
    }

    updateStationDomLabels() {
        if (!this._stationLabelGroup) return;

        const visible = this.showStationAnnotations && this._stationLabelElements.length > 0;
        this._stationLabelGroup.style.display = (visible || this._pkDomLabel) ? 'block' : 'none';
        if (!visible) {
            return;
        }

        const cameraPos = this.viewer.navigation.getPosition();
        const placed = [];
        const ordered = [...this._stationLabelElements].sort((a, b) => b.priority - a.priority || a.station - b.station);

        for (const label of ordered) {
            const screenPos = this.viewer.worldToClient(label.worldPos);
            const inFront = screenPos.z == null || (screenPos.z >= 0 && screenPos.z <= 1);
            if (!inFront || screenPos.x < -200 || screenPos.y < -100 ||
                screenPos.x > this.viewer.container.clientWidth + 200 ||
                screenPos.y > this.viewer.container.clientHeight + 100) {
                label.el.style.display = 'none';
                continue;
            }

            const dist = cameraPos.distanceTo(label.worldPos);
            const stationInterval = this.getVisibleStationLabelInterval(dist);
            const onInterval = Math.abs(label.station - Math.round(label.station / stationInterval) * stationInterval) < 0.35;
            if (label.priority < 3 && !onInterval) {
                label.el.style.display = 'none';
                continue;
            }

            label.el.style.display = 'block';
            const width = label.el.offsetWidth || (label.priority >= 3 ? 86 : 60);
            const height = label.el.offsetHeight || 20;
            const box = {
                x1: screenPos.x - width / 2 - 4,
                y1: screenPos.y - height - 18,
                x2: screenPos.x + width / 2 + 4,
                y2: screenPos.y + 8
            };
            const overlaps = placed.some(item =>
                box.x1 < item.x2 && box.x2 > item.x1 && box.y1 < item.y2 && box.y2 > item.y1
            );
            if (overlaps && label.priority < 4) {
                label.el.style.display = 'none';
                continue;
            }

            placed.push(box);
            const opacity = label.priority >= 3 ? 1 : Math.max(0.5, Math.min(1, 1 - dist / 3500));
            label.el.style.display = 'block';
            label.el.style.left = `${screenPos.x}px`;
            label.el.style.top = `${screenPos.y}px`;
            label.el.style.opacity = opacity.toFixed(2);
        }
    }

    getVisibleStationLabelInterval(distance) {
        if (distance < 120) return 10;
        if (distance < 280) return 20;
        if (distance < 600) return 40;
        if (distance < 1500) return 80;
        return 160;
    }

    clearPkDomLabel() {
        if (this._pkDomLabel?.el) {
            this._pkDomLabel.el.remove();
        }
        this._pkDomLabel = null;
    }

    setPkDomLabel(text, worldPos) {
        if (!this._stationLabelGroup) return;

        if (!this._pkDomLabel?.el) {
            const el = document.createElement('div');
            el.className = 'lob-pk-label';
            el.style.cssText = `
                position:absolute;
                color:#111827;
                background:rgba(255,255,255,0.98);
                padding:3px 8px;
                border-radius:3px;
                border:1px solid rgba(75,85,99,0.85);
                font:700 11px Inter, Arial, sans-serif;
                white-space:nowrap;
                pointer-events:auto;
                cursor:grab;
                box-shadow:0 2px 7px rgba(0,0,0,0.28);
                line-height:1.3;
                transform:translate(-50%, -155%);
                z-index:2;
                will-change:left, top, display;
            `;
            el.addEventListener('pointerdown', (event) => {
                if (event.button !== 0) return;
                if (!this.stationCursorLine) this.drawStationCursor(this.currentStation);
                this.startStationCursorDrag(event);
            });
            this._stationLabelGroup.appendChild(el);
            this._pkDomLabel = { el, worldPos };
        }

        this._pkDomLabel.el.textContent = text;
        this._pkDomLabel.worldPos = worldPos;
        this.updatePkDomLabel();
    }

    updatePkDomLabel() {
        if (!this._pkDomLabel?.el || !this._pkDomLabel.worldPos) return;
        const screenPos = this.viewer.worldToClient(this._pkDomLabel.worldPos);
        const inFront = screenPos.z == null || (screenPos.z >= 0 && screenPos.z <= 1);
        if (!inFront) {
            this._pkDomLabel.el.style.display = 'none';
            return;
        }

        if (this._stationLabelGroup) this._stationLabelGroup.style.display = 'block';
        this._pkDomLabel.el.style.display = 'block';
        this._pkDomLabel.el.style.left = `${screenPos.x}px`;
        this._pkDomLabel.el.style.top = `${screenPos.y}px`;
    }

    onStationCameraChange() {
        if (this._stationLabelRaf) cancelAnimationFrame(this._stationLabelRaf);
        this._stationLabelRaf = requestAnimationFrame(() => {
            this._stationLabelRaf = null;
            this.updateStationDomLabels();
            this.updatePkDomLabel();
        });
    }

    createTextSprite(text, options = {}) {
        const THREE = window.THREE;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const fontSize = options.fontSize || 34;
        const padX = 18;
        const padY = 10;
        ctx.font = `600 ${fontSize}px Arial, sans-serif`;
        const textWidth = Math.ceil(ctx.measureText(text).width);
        canvas.width = Math.max(128, textWidth + padX * 2);
        canvas.height = fontSize + padY * 2;

        ctx.font = `600 ${fontSize}px Arial, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.fillStyle = options.background || 'rgba(255,255,255,0.92)';
        ctx.strokeStyle = options.border || 'rgba(80,90,105,0.75)';
        ctx.lineWidth = 3;

        const radius = 8;
        const w = canvas.width;
        const h = canvas.height;
        ctx.beginPath();
        ctx.moveTo(radius, 1.5);
        ctx.lineTo(w - radius, 1.5);
        ctx.quadraticCurveTo(w - 1.5, 1.5, w - 1.5, radius);
        ctx.lineTo(w - 1.5, h - radius);
        ctx.quadraticCurveTo(w - 1.5, h - 1.5, w - radius, h - 1.5);
        ctx.lineTo(radius, h - 1.5);
        ctx.quadraticCurveTo(1.5, h - 1.5, 1.5, h - radius);
        ctx.lineTo(1.5, radius);
        ctx.quadraticCurveTo(1.5, 1.5, radius, 1.5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = options.color || '#303846';
        ctx.fillText(text, padX, h / 2);

        const texture = THREE.CanvasTexture ? new THREE.CanvasTexture(canvas) : new THREE.Texture(canvas);
        texture.needsUpdate = true;
        const material = new THREE.SpriteMaterial({
            map: texture,
            depthTest: false,
            depthWrite: false,
            transparent: true
        });
        const sprite = new THREE.Sprite(material);
        const labelHeight = options.height || 8;
        sprite.scale.set((canvas.width / canvas.height) * labelHeight, labelHeight, 1);
        sprite.renderOrder = options.renderOrder || 10000;
        sprite.frustumCulled = false; // LMV cullea los overlays sin esto (igual que el tubo/línea)
        return sprite;
    }

    chooseStationInterval() {
        return 10;
    }

    getAnnotationMetrics(model) {
        const THREE = window.THREE;
        const box = model?.getBoundingBox?.();
        const meterScale = this.getCivilToModelScale(model, 'm');
        if (!THREE || !box) {
            return { labelHeight: 12, labelLift: 1.2 * meterScale, markerRadius: 0.22 * meterScale };
        }

        const size = new THREE.Vector3();
        box.getSize(size);
        const extent = Math.max(size.x, size.y, size.z, 1);
        const labelHeight = 12;
        return {
            labelHeight,
            labelLift: Math.max(0.8 * meterScale, Math.min(2.5 * meterScale, extent / 750)),
            markerRadius: Math.max(0.04 * meterScale, Math.min(0.1 * meterScale, extent / 5000))
        };
    }

    getSegmentStationLabel(segment, station) {
        const type = String(segment?.type || '').toLowerCase();
        const prefix = type.includes('arc') ? 'PC' : type.includes('spiral') ? 'TE' : 'TT';
        return `${prefix} ${this.formatStation(station)}`;
    }

    collectStationAnnotations(alignmentData) {
        const map = new Map();
        const points = this.getActiveProfilePoints(alignmentData);
        if (points.length >= 2) {
            const min = points[0].station;
            const max = points[points.length - 1].station;
            const add = (value, label, priority) => {
                if (value == null || Number.isNaN(Number(value))) return;
                if (value < min - 1e-4 || value > max + 1e-4) return;
                const key = Number(value).toFixed(2);
                if (!map.has(key) || map.get(key).priority < priority) {
                    map.set(key, { station: value, label, priority });
                }
            };

            add(min, `Inicio ${this.formatStation(min)}`, 4);
            add(max, `Fin ${this.formatStation(max)}`, 4);

            const interval = alignmentData?.stationIncrement || this.chooseStationInterval(max - min);
            const firstRounded = Math.ceil(min / interval) * interval;
            for (let station = firstRounded; station <= max + 1e-4; station += interval) {
                add(station, this.formatStation(station), 2);
            }
        }
        
        const subEntities = alignmentData?.subEntities || [];
        let min = Infinity, max = -Infinity;
        for (const segment of subEntities) {
            if (Number.isFinite(Number(segment.startStation))) min = Math.min(min, Number(segment.startStation));
            if (Number.isFinite(Number(segment.endStation))) max = Math.max(max, Number(segment.endStation));
        }

        if (min === Infinity || max === -Infinity) {
            return Array.from(map.values()).sort((a, b) => a.station - b.station).slice(0, 1500);
        }

        const length = max - min;
        const add = (value, label, priority) => {
            if (value == null || Number.isNaN(Number(value))) return;
            if (value < min - 1e-4 || value > max + 1e-4) return;
            const key = Number(value).toFixed(2);
            if (!map.has(key) || map.get(key).priority < priority) {
                map.set(key, { station: value, label, priority });
            }
        };

        add(min, `Inicio ${this.formatStation(min)}`, 4);
        add(max, `Fin ${this.formatStation(max)}`, 4);

        for (const segment of subEntities) {
            add(segment.startStation, this.getSegmentStationLabel(segment, segment.startStation), 3);
            add(segment.endStation, this.getSegmentStationLabel(segment, segment.endStation), 3);
        }

        const interval = alignmentData?.stationIncrement || this.chooseStationInterval(length);
        const firstRounded = Math.ceil(min / interval) * interval;
        for (let station = firstRounded; station <= max + 1e-4; station += interval) {
            add(station, this.formatStation(station), 2);
        }

        return Array.from(map.values())
            .sort((a, b) => a.station - b.station)
            .slice(0, 1500);
    }

    drawStationAnnotations(alignmentData, model = this.getModelForCoordinates()) {
        const THREE = window.THREE;
        if (!this.showStationAnnotations || !alignmentData || !model) return;

        const annotations = this.collectStationAnnotations(alignmentData);
        const metrics = this.getAnnotationMetrics(model);
        for (const item of annotations) {
            const civilPoint = this.pointAtStation(alignmentData, item.station);
            const viewerPoint = this.civilToViewerPoint(civilPoint, model);
            if (!viewerPoint) continue;

            const markerGeom = new THREE.SphereGeometry(item.priority >= 3 ? metrics.markerRadius * 1.15 : metrics.markerRadius, 14, 14);
            const markerMat = new THREE.MeshBasicMaterial({
                color: item.priority >= 3 ? 0xffffff : 0xffc857,
                depthTest: false,
                depthWrite: false
            });
            const marker = new THREE.Mesh(markerGeom, markerMat);
            marker.position.copy(viewerPoint);
            marker.frustumCulled = false; // sin esto LMV puede cullear el overlay
            marker.renderOrder = 9999;

            this.viewer.impl.addOverlay(this.overlayName, marker);
            this.stationAnnotations.push({ marker });

            const labelPos = viewerPoint.clone().add(new THREE.Vector3(0, 0, item.priority >= 3 ? metrics.labelLift : metrics.labelLift * 0.85));
            this.createStationDomLabel(item, labelPos);
        }

        this.updateStationDomLabels();
        this.viewer.impl.invalidate(true, true, true);
    }

    setStationAnnotationsVisible(visible = true) {
        this.showStationAnnotations = !!visible;
        this.clearStationAnnotations();
        if (this.showStationAnnotations && this.activeAlignments && this.activeAlignments.length > 0) {
            this.activeAlignments.forEach(align => this.drawStationAnnotations(align));
        } else {
            this.viewer.impl.invalidate(true, true, true);
        }
    }

    normalizeAngle(angle) {
        const full = Math.PI * 2;
        let result = Number(angle || 0) % full;
        if (result < 0) result += full;
        return result;
    }

    getArcSweep(segment) {
        if (Number.isFinite(segment.sweepAngle) && Math.abs(segment.sweepAngle) > 1e-9) {
            return segment.sweepAngle;
        }

        const start = this.normalizeAngle(segment.startAngle);
        const end = this.normalizeAngle(segment.endAngle);
        let sweep = end - start;

        if (segment.clockwise === true) {
            if (sweep > 0) sweep -= Math.PI * 2;
        } else if (sweep < 0) {
            sweep += Math.PI * 2;
        }

        return sweep;
    }

    getStationContext(alignmentData, station) {
        const context = { 
            station, 
            x: 0, 
            y: 0, 
            z: 0, 
            horizontal: null, 
            vertical: null,
            stationIncrement: alignmentData?.stationIncrement || 10.0
        };
        
        // Coordenadas Exactas
        const point = this.pointAtStation(alignmentData, station);
        if (point) {
            context.x = point.x;
            context.y = point.y;
            context.z = point.z || 0;
        }

        // Contexto Horizontal
        const subEntities = alignmentData?.subEntities || [];
        for (const segment of subEntities) {
            const start = Number(segment.startStation);
            const end = Number(segment.endStation);
            if (station >= start - 1e-4 && station <= end + 1e-4) {
                context.horizontal = {
                    type: segment.type || 'Unknown',
                    startStation: start,
                    endStation: end,
                    length: Math.abs(end - start)
                };
                break;
            }
        }

        // Contexto Vertical
        if (alignmentData?.profiles && alignmentData.profiles.length > 0) {
            const profile = this.getActiveProfile(alignmentData);
            if (profile && profile.entities) {
                for (const ent of profile.entities) {
                    const start = Number(ent.startStation);
                    const end = Number(ent.endStation);
                    if (station >= start - 1e-4 && station <= end + 1e-4) {
                        context.vertical = {
                            type: ent.type || 'Unknown',
                            startStation: start,
                            endStation: end,
                            length: ent.length || Math.abs(end - start),
                            grade: ent.grade // Sólo si es tangente
                        };
                        break;
                    }
                }
            }
        }

        return context;
    }

    getActiveProfile(alignmentData) {
        const profiles = alignmentData?.profiles || [];
        if (profiles.length === 0) return null;

        if (alignmentData?.activeProfileName) {
            const active = profiles.find(profile => profile.name === alignmentData.activeProfileName);
            if (active && !this.isSurfaceProfile(active)) return active;
        }

        return this.getPrimaryProfile(profiles, alignmentData);
    }

    getActiveProfilePoints(alignmentData) {
        const profile = this.getActiveProfile(alignmentData);
        const points = Array.isArray(profile?.points) ? profile.points : [];
        return points
            .filter(point =>
                Number.isFinite(Number(point.station)) &&
                Number.isFinite(Number(point.x)) &&
                Number.isFinite(Number(point.y)) &&
                Number.isFinite(Number(point.z))
            )
            .map(point => ({
                station: Number(point.station),
                x: Number(point.x),
                y: Number(point.y),
                z: Number(point.z)
            }))
            .sort((a, b) => a.station - b.station);
    }

    pointFromProfilePoints(alignmentData, station) {
        const points = this.getActiveProfilePoints(alignmentData);
        if (points.length === 0) return null;

        const pk = Number(station);
        if (!Number.isFinite(pk)) return null;
        if (pk < points[0].station - 1e-4 || pk > points[points.length - 1].station + 1e-4) return null;

        if (pk <= points[0].station) return { ...points[0] };
        if (pk >= points[points.length - 1].station) return { ...points[points.length - 1] };

        let low = 0;
        let high = points.length - 1;
        while (high - low > 1) {
            const mid = Math.floor((low + high) / 2);
            if (points[mid].station <= pk) low = mid;
            else high = mid;
        }

        const p0 = points[low];
        const p1 = points[high];
        const span = p1.station - p0.station;
        const ratio = Math.abs(span) > 1e-9 ? (pk - p0.station) / span : 0;

        return {
            station: pk,
            x: p0.x + (p1.x - p0.x) * ratio,
            y: p0.y + (p1.y - p0.y) * ratio,
            z: p0.z + (p1.z - p0.z) * ratio
        };
    }

    getProfileText(profile) {
        return `${profile?.name || ''} ${profile?.type || ''}`.toLowerCase();
    }

    isSurfaceProfile(profile) {
        const text = this.getProfileText(profile);
        return text.includes('surface') ||
            text.includes('superficie') ||
            text.includes('existing') ||
            text.includes('terreno') ||
            text.includes('natural') ||
            /\beg\b/.test(text);
    }

    isDesignProfile(profile) {
        const text = this.getProfileText(profile);
        return text.includes('design') ||
            text.includes('layout') ||
            text.includes('rasante') ||
            text.includes('finished') ||
            text.includes('proposed') ||
            text.includes('fondo') ||
            text.includes('clave') ||
            /\bfg\b/.test(text);
    }

    normalizeSearchText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    getSearchTokens(value) {
        return this.normalizeSearchText(value).match(/[a-z0-9]+/g) || [];
    }

    getAlignmentTokens(alignmentData) {
        const rawTokens = this.getSearchTokens(alignmentData?.alignmentId || alignmentData?.name || '');
        const generic = new Set(['alignment', 'alineamiento', 'eje', 'col', 'calle', 'colector', 'principal']);
        return rawTokens.filter(token => token.length >= 2 && !generic.has(token));
    }

    getAlignmentKeys(alignmentData) {
        const tokens = this.getAlignmentTokens(alignmentData);
        const keys = new Set(tokens);

        if (tokens.length > 1) {
            keys.add(tokens.map(token => token[0]).join(''));
            keys.add(tokens.join(''));
        }

        return Array.from(keys).filter(key => key.length >= 2);
    }

    getProfileScore(profile, alignmentData) {
        const text = this.getProfileText(profile);
        if (this.isSurfaceProfile(profile)) return -1000;

        let score = 0;
        const profileTokens = new Set(this.getSearchTokens(`${profile?.name || ''} ${profile?.type || ''}`));
        const profileFlat = this.getSearchTokens(profile?.name || '').join('');
        const alignmentKeys = this.getAlignmentKeys(alignmentData);

        for (const key of alignmentKeys) {
            if (profileTokens.has(key)) score += key.length <= 3 ? 170 : 90;
            else if (profileFlat.includes(key)) score += key.length <= 3 ? 120 : 60;
        }

        if (text.includes('layout') || text.includes('design') || /\bfg\b/.test(text)) score += 100;
        if (text.includes('rasante') || text.includes('finished') || text.includes('proposed')) score += 80;
        if (text.includes('metrado') || text.includes('pn-csi')) score += 30;
        if (text.includes('fondo') || text.includes('clave')) score += 20;

        const alignmentText = this.normalizeSearchText(alignmentData?.alignmentId || alignmentData?.name || '');
        if (alignmentText.includes('colector') || alignmentText.includes('tuberia')) {
            if (text.includes('fondo') || text.includes('clave') || text.includes('invert') || alignmentKeys.some(key => profileFlat.includes(key))) {
                score += 80;
            }
            if (text.includes('rasante') && !alignmentKeys.some(key => profileFlat.includes(key))) {
                score -= 70;
            }
        }

        return score;
    }

    getPrimaryProfile(profiles, alignmentData) {
        return profiles
            .map((profile, index) => ({ profile, index, score: this.getProfileScore(profile, alignmentData) }))
            .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.profile || null;
    }

    getProfileBreakStations(alignmentData) {
        const profile = this.getActiveProfile(alignmentData);
        if (!profile?.entities?.length) return [];

        const stations = [];
        const add = (station) => {
            const value = Number(station);
            if (Number.isFinite(value)) stations.push(value);
        };

        for (const entity of profile.entities) {
            add(entity.startStation);
            add(entity.endStation);
            add(entity.pviStation);
        }

        return [...new Set(stations.map(station => station.toFixed(4)))]
            .map(station => Number(station))
            .sort((a, b) => a - b);
    }

    getProfileSampleStations(alignmentData, minStation, maxStation) {
        const profile = this.getActiveProfile(alignmentData);
        if (!profile?.entities?.length) return [];

        const stations = [];
        const add = (station) => {
            const value = Number(station);
            if (Number.isFinite(value) && value >= minStation - 1e-4 && value <= maxStation + 1e-4) {
                stations.push(Math.max(minStation, Math.min(maxStation, value)));
            }
        };

        for (const entity of profile.entities) {
            const start = Number(entity.startStation);
            const end = Number(entity.endStation);
            if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

            const entityMin = Math.min(start, end);
            const entityMax = Math.max(start, end);
            if (entityMax < minStation - 1e-4 || entityMin > maxStation + 1e-4) continue;

            add(start);
            add(end);
            add(entity.pviStation);

            const type = String(entity.type || '').toLowerCase();
            const span = Math.abs(end - start);
            if (span > 1e-6 && (type.includes('parabola') || type.includes('circular'))) {
                const samples = Math.max(8, Math.min(48, Math.ceil(span / 5)));
                for (let i = 1; i < samples; i++) {
                    add(start + (end - start) * (i / samples));
                }
            }
        }

        return [...new Set(stations.map(station => station.toFixed(4)))]
            .map(station => Number(station))
            .sort((a, b) => a - b);
    }

    chooseGeometrySampleInterval(length) {
        if (length <= 1200) return 10;
        if (length <= 3000) return 20;
        if (length <= 7000) return 50;
        return 100;
    }

    getSegmentSampleStations(alignmentData, segment) {
        const start = Number(segment.startStation);
        const end = Number(segment.endStation);
        if (!Number.isFinite(start) || !Number.isFinite(end)) return [];

        const minStation = Math.min(start, end);
        const maxStation = Math.max(start, end);
        const span = Math.abs(end - start);
        const stations = [];
        const add = (station) => {
            const value = Number(station);
            if (Number.isFinite(value) && value >= minStation - 1e-4 && value <= maxStation + 1e-4) {
                stations.push(Math.max(minStation, Math.min(maxStation, value)));
            }
        };

        add(start);
        add(end);

        const type = String(segment.type || '').toLowerCase();
        if (type === 'arc' && segment.center && segment.radius) {
            const sweep = this.getArcSweep(segment);
            const samples = Math.max(12, Math.min(96, Math.ceil(Math.abs(sweep) / (Math.PI / 48))));
            for (let i = 1; i < samples; i++) {
                add(start + (end - start) * (i / samples));
            }
        } else if (span > 1e-6) {
            const interval = this.chooseGeometrySampleInterval(span);
            const firstRounded = Math.ceil(minStation / interval) * interval;
            for (let station = firstRounded; station <= maxStation - 1e-4; station += interval) {
                add(station);
            }
        }

        for (const station of this.getProfileSampleStations(alignmentData, minStation, maxStation)) {
            add(station);
        }

        const unique = [...new Set(stations.map(station => station.toFixed(4)))]
            .map(station => Number(station));

        return unique.sort(start <= end ? (a, b) => a - b : (a, b) => b - a);
    }

    getElevationAtStation(alignmentData, station) {
        if (!alignmentData?.profiles || alignmentData.profiles.length === 0) return undefined;

        // Intentar usar el perfil de diseño ('Design'/'FG'), si no, el primero disponible
        const profile = this.getActiveProfile(alignmentData);

        if (!profile.entities || profile.entities.length === 0) return undefined;

        for (const ent of profile.entities) {
            const start = Number(ent.startStation);
            const end = Number(ent.endStation);
            
            if (station >= start - 1e-4 && station <= end + 1e-4) {
                const type = String(ent.type || '').toLowerCase();
                
                if (type.includes('tangent')) {
                    // Interpolación lineal
                    const s1 = start;
                    const s2 = end;
                    const z1 = Number(ent.startElevation || 0);
                    const z2 = Number(ent.endElevation || 0);
                    if (Math.abs(s2 - s1) < 1e-9) return z1;
                    return z1 + ((station - s1) / (s2 - s1)) * (z2 - z1);
                } 
                else if (type.includes('parabola')) {
                    // Curva vertical parabólica: Y = Elev_PCV + g1*x + (g2 - g1)*x^2 / (2*L)
                    // PCV es el inicio de la entidad. 
                    // Como no guardamos g1 y g2 directamente, la reconstruimos si es simétrica.
                    // Para simplificar y dado que tenemos K, L, y PVI:
                    const pviS = Number(ent.pviStation);
                    const pviE = Number(ent.pviElevation);
                    const L = Number(ent.length);
                    if (!L || isNaN(pviS) || isNaN(pviE)) return undefined;

                    const pcvS = start;
                    const ptvS = end;
                    
                    // Necesitamos g1 y g2. Podemos buscarlos en la tangente anterior/siguiente?
                    // Alternativamente, el API de AutoCAD nos da Parabola, pero es mejor que el 
                    // frontend lo busque en las tangentes vecinas:
                    const prev = profile.entities.find(e => e.endStation >= pcvS - 1e-4 && e.endStation <= pcvS + 1e-4 && e.type.toLowerCase().includes('tangent'));
                    const next = profile.entities.find(e => e.startStation >= ptvS - 1e-4 && e.startStation <= ptvS + 1e-4 && e.type.toLowerCase().includes('tangent'));
                    
                    const g1 = prev ? Number(prev.grade || 0) : 0;
                    const g2 = next ? Number(next.grade || 0) : 0;
                    
                    const pcvE = pviE - g1 * (pviS - pcvS);
                    
                    const x = station - pcvS;
                    const z = pcvE + g1 * x + ((g2 - g1) * x * x) / (2 * L);
                    return z;
                }
                // Si es circular u otro, caerá aquí (omitido por simplicidad extrema, devolvemos undef o fallback)
            }
        }
        return undefined;
    }

    pointAtStation(alignmentData, pk) {
        const realProfilePoint = this.pointFromProfilePoints(alignmentData, pk);
        if (realProfilePoint) return realProfilePoint;

        const subEntities = alignmentData?.subEntities || [];
        const station = Number(pk);

        for (const segment of subEntities) {
            const start = Number(segment.startStation);
            const end = Number(segment.endStation);
            if (!Number.isFinite(start) || !Number.isFinite(end)) continue;

            const minStation = Math.min(start, end);
            const maxStation = Math.max(start, end);
            if (station < minStation || station > maxStation) continue;

            const stationSpan = end - start;
            const ratio = Math.max(0, Math.min(1, Math.abs(stationSpan) > 1e-9 ? (station - start) / stationSpan : 0));
            const type = String(segment.type || '').toLowerCase();

            if (type === 'arc' && segment.center && segment.radius) {
                const sweep = this.getArcSweep(segment);
                const angle = Number(segment.startAngle || 0) + sweep * ratio;
                const z1 = segment.startPoint?.z;
                const z2 = segment.endPoint?.z;

                const z = this.getElevationAtStation(alignmentData, station) ?? (z1 != null && z2 != null ? z1 + (z2 - z1) * ratio : undefined);

                return {
                    x: segment.center.x + segment.radius * Math.cos(angle),
                    y: segment.center.y + segment.radius * Math.sin(angle),
                    z: z
                };
            }

            if (segment.startPoint && segment.endPoint) {
                const p0 = segment.startPoint;
                const p1 = segment.endPoint;
                const z = this.getElevationAtStation(alignmentData, station) ?? (p0.z != null && p1.z != null ? p0.z + (p1.z - p0.z) * ratio : undefined);
                return {
                    x: p0.x + (p1.x - p0.x) * ratio,
                    y: p0.y + (p1.y - p0.y) * ratio,
                    z: z
                };
            }
        }

        return null;
    }

    sampleAlignment(alignmentData, model) {
        const profilePoints = this.getActiveProfilePoints(alignmentData);
        if (profilePoints.length >= 2) {
            return profilePoints
                .map(point => this.civilToViewerPoint(point, model))
                .filter(Boolean);
        }

        const points = [];
        const subEntities = alignmentData?.subEntities || [];

        for (const segment of subEntities) {
            for (const station of this.getSegmentSampleStations(alignmentData, segment)) {
                const civilPoint = this.pointAtStation(alignmentData, station);
                const viewerPoint = this.civilToViewerPoint(civilPoint, model);
                const previous = points[points.length - 1];
                if (viewerPoint && (!previous || previous.distanceTo(viewerPoint) > 1e-6)) {
                    points.push(viewerPoint);
                }
            }
        }

        return points;
    }

    getAlignmentTubeRadius(model) {
        const THREE = window.THREE;
        const box = model?.getBoundingBox?.();
        const meterScale = this.getCivilToModelScale(model, 'm');
        if (!THREE || !box) return 0.03 * meterScale;

        const size = new THREE.Vector3();
        box.getSize(size);
        const extent = Math.max(size.x, size.y, size.z, 1);
        // Línea extremadamente delgada (3cm a 8cm)
        return Math.max(0.03 * meterScale, Math.min(0.08 * meterScale, extent / 5000));
    }

    createAlignmentTube(points, model) {
        const THREE = window.THREE;
        if (!THREE || points.length < 2) return null;

        const group = new THREE.Group();
        const material = new THREE.MeshBasicMaterial({
            color: 0xffff00, // amarillo ultra brillante
            transparent: false,
            opacity: 1,      
            depthTest: false, 
            depthWrite: false
        });
        const radius = this.getAlignmentTubeRadius(model);
        const yAxis = new THREE.Vector3(0, 1, 0);
        const maxSegments = 1400;
        const step = Math.max(1, Math.ceil((points.length - 1) / maxSegments));

        for (let i = 0; i < points.length - 1; i += step) {
            const p0 = points[i];
            const p1 = points[Math.min(i + step, points.length - 1)];
            const direction = new THREE.Vector3().subVectors(p1, p0);
            const length = direction.length();
            if (length < 1e-6) continue;

            const geometry = new THREE.CylinderGeometry(radius, radius, length, 12, 1, false);
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.copy(p0).add(p1).multiplyScalar(0.5);
            mesh.quaternion.setFromUnitVectors(yAxis, direction.normalize());
            mesh.renderOrder = 9997;
            group.add(mesh);
        }

        group.frustumCulled = false;
        return group;
    }

    drawAlignment(alignmentData) {
        const THREE = window.THREE;
        const model = this.getModelForCoordinates();
        if (!model) {
            console.warn('[LOB4D] No model available to draw alignment overlay.');
            return;
        }

        this.ensureOverlay();

        this.ensureOverlay();
        // Removed clearStationAnnotations and line removals from here since bakeAlignment handles them
        const points = this.sampleAlignment(alignmentData, model);
        if (points.length < 2) {
            console.warn('[LOB4D] Not enough alignment points to draw overlay.');
            return;
        }

        // Muestras (punto viewer + estación) para el hover dinámico de PK
        this.alignmentSamples = this.alignmentSamples || [];
        const newSamples = this.buildAlignmentSamples(alignmentData, model);
        this.alignmentSamples.push(...newSamples);

        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({
            color: 0xffffff,        // núcleo blanco para máximo contraste
            depthTest: false,       
            depthWrite: false,
            transparent: true,
            opacity: 1,
            linewidth: 3            
        });

        // "Resaltante como ACC" exige grosor y WebGL ignora linewidth → línea GRUESA
        // sólida (tubo fino), NO la pipa translúcida de antes. Se ve sobre todo el modelo.
        this.alignmentTube = this.createAlignmentTube(points, model);
        if (this.alignmentTube) {
            this.viewer.impl.addOverlay(this.overlayName, this.alignmentTube);
            this.alignmentTubes = this.alignmentTubes || [];
            this.alignmentTubes.push(this.alignmentTube);
        }

        // Línea fina brillante como núcleo/borde crujiente encima de la línea gruesa.
        this.alignmentLine = new THREE.Line(geometry, material);
        this.alignmentLine.frustumCulled = false;
        this.alignmentLine.renderOrder = 10001;

        this.viewer.impl.addOverlay(this.overlayName, this.alignmentLine);
        this.alignmentLines = this.alignmentLines || [];
        this.alignmentLines.push(this.alignmentLine);
        this.drawStationAnnotations(alignmentData, model);
    }

    bakeAlignment(alignmentJSON, selectedIds = 'ALL') {
        if (!this.viewer) {
            console.error('[LOB4D] Viewer not ready to bake alignments.');
            return;
        }

        this.viewer.clearSelection();
        this.viewer.clearThemingColors();
        this.clearAlignmentOverlay();

        if (!selectedIds || selectedIds.length === 0 || selectedIds === 'ALL') {
            this.activeAlignment = null;
            this.activeAlignments = [];
            return;
        }

        const idsArray = Array.isArray(selectedIds) ? selectedIds : [selectedIds];
        this.activeAlignments = (alignmentJSON || []).filter(item => idsArray.includes(item.alignmentId));
        
        if (this.activeAlignments.length === 0) {
            console.warn(`[LOB4D] Alignments not found in extracted JSON.`);
            return;
        }

        this.activeAlignment = this.activeAlignments[this.activeAlignments.length - 1]; // Use last as active for hover

        const allPoints = [];
        const model = this.getModelForCoordinates();

        this.activeAlignments.forEach(alignment => {
            console.log(`[LOB4D] Drawing extracted alignment overlay: ${alignment.alignmentId}`);
            this.drawAlignment(alignment);
            
            const points = this.sampleAlignment(alignment, model);
            allPoints.push(...points);
        });

        this.viewer.impl.invalidate(true, true, true);

        if (allPoints.length > 0) {
            const box = new window.THREE.Box3().setFromPoints(allPoints);
            if (!box.isEmpty()) {
                this.viewer.navigation.fitBounds(false, box, true);
            }
        }
    }

    // Vuela la cámara hasta la progresiva pk del alineamiento (para "ver en el
    // modelo" desde el visualizador 2D de secciones). Mantiene la dirección de
    // vista actual y acerca el objetivo al punto del eje.
    flyToStation(alignmentData, pk) {
        const THREE = window.THREE;
        if (!THREE || !this.viewer || !alignmentData) return false;
        const model = this.getModelForCoordinates();
        const civilPoint = this.pointAtStation(alignmentData, pk);
        const target = this.civilToViewerPoint(civilPoint, model);
        if (!target) return false;

        const nav = this.viewer.navigation;
        const cam = this.viewer.impl.camera;
        const dir = new THREE.Vector3().subVectors(cam.position, cam.target);
        const currentDist = dir.length() || 100;
        dir.normalize();
        // distancia cómoda: ni encima ni lejísimos
        const distance = Math.min(Math.max(currentDist * 0.45, 25), 220);
        const newPos = target.clone().add(dir.multiplyScalar(distance));

        nav.setView(newPos, target);
        nav.setPivotPoint(target);
        try { this.setStation(pk); } catch (e) { /* marcador opcional */ }
        this.viewer.impl.invalidate(true, true, true);
        return true;
    }

    simulatePK(alignmentData, pk) {
        if (!this.viewer || !alignmentData || !alignmentData.subEntities) return;

        const THREE = window.THREE;
        const model = this.getModelForCoordinates();
        this.ensureOverlay();

        if (this.pkMarker) {
            this.viewer.impl.removeOverlay(this.overlayName, this.pkMarker);
            this.pkMarker.geometry?.dispose?.();
            this.pkMarker.material?.dispose?.();
            this.pkMarker = null;
        }

        if (this.pkMarkerLabel) {
            this.viewer.impl.removeOverlay(this.overlayName, this.pkMarkerLabel);
            this.disposeSprite(this.pkMarkerLabel);
            this.pkMarkerLabel = null;
        }

        const civilPoint = this.pointAtStation(alignmentData, pk);
        const foundPt = this.civilToViewerPoint(civilPoint, model);

        if (foundPt) {
            const metrics = this.getAnnotationMetrics(model);
            // Hacer la esfera roja extremadamente pequeña (aprox 10cm a 20cm dependiendo de la escala)
            const radius = Math.max(0.05, metrics.markerRadius * 0.8);
            const geom = new THREE.SphereGeometry(radius, 24, 24);
            const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, depthTest: false, depthWrite: false });
            this.pkMarker = new THREE.Mesh(geom, mat);
            this.pkMarker.position.copy(foundPt);
            this.pkMarker.renderOrder = 9999;

            this.viewer.impl.addOverlay(this.overlayName, this.pkMarker);
            this.setPkDomLabel(this.formatStation(pk), foundPt.clone().add(new THREE.Vector3(0, 0, metrics.labelLift * 1.1)));
            this.viewer.impl.invalidate(true, true, true);
        } else {
            console.warn(`[LOB4D] PK ${pk} is outside extracted alignment geometry.`);
        }

        // Emitir contexto geométrico para la UI de rastreo
        const context = this.getStationContext(alignmentData, pk);
        if (context) {
            window.dispatchEvent(new CustomEvent('LOB4D_PK_CONTEXT_CHANGED', { detail: context }));
        }
    }
}

window.Autodesk.Viewing.theExtensionManager.registerExtension('LOB4DExtension', LOB4DExtension);
