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
        this.persistentLinksLoaded = false;

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
            this.clearExcavationCut();
        };

        // ── Modo prueba por parámetro (p.ej. Vaciado_Nro → FASE 01..07) ──
        this.handleParamScan = async (e) => {
            const idx = await this.buildParamPhaseIndex(e.detail?.propName);
            window.dispatchEvent(new CustomEvent('lob-param-scanned', {
                detail: idx ? { propName: idx.propName, phases: idx.phases, total: idx.total } : null
            }));
        };
        this.handleParamStep = (e) => {
            this.paramMode = true;
            this.simulateParamPhase(Number(e.detail?.phaseIndex || 0));
        };
        this.handleParamClear = () => {
            this.paramMode = false;
            this.clearParamSimulation();
        };

        // Resaltar por estado 4D: aísla los elementos del estado clickeado (null = limpiar)
        this.handleIsolateState = (e) => {
            const state = e.detail?.state || null;
            if (!state) this.clearStateIsolation();
            else this.isolateByState(state);
        };

        // LOB → 3D: aísla y VUELA a los elementos de una partida (codes exactos)
        // o de una rama del EDT (prefix, ej. '06.02.'). El puente visual que
        // TILOS no tiene: del diagrama tiempo-distancia al modelo real.
        this.handleFocusElements = async (e) => {
            const { codes, prefix } = e.detail || {};
            if (!this.getThemingModels().length) return;
            await this.ensurePropertyIndex();
            const wantPrefix = String(prefix || '').trim();
            const wanted = new Set((codes || []).map((c) => String(c).trim()).filter(Boolean));
            const targets = [];
            for (const [code, items] of Object.entries(this.partidaCodeToDbIds || {})) {
                if (wanted.has(code) || (wantPrefix && code.startsWith(wantPrefix))) targets.push(...items);
            }
            if (!targets.length) {
                console.warn('[LOB4D] Ver en 3D: sin elementos con CodigoDePartida para', e.detail);
                return;
            }
            const perModel = new Map();
            targets.forEach(({ dbId, model }) => {
                const m = model || this.viewer.model;
                if (!perModel.has(m)) perModel.set(m, []);
                perModel.get(m).push(dbId);
            });
            this.getThemingModels().forEach((m) => {
                const ids = perModel.get(m);
                try { this.viewer.isolate(ids && ids.length ? ids : [-999], m); } catch (err) { /* noop */ }
            });
            // volar a la caja unión de los elementos
            const THREE = window.THREE;
            if (THREE) {
                const acc = new THREE.Box3(); acc.makeEmpty();
                const tmp = new THREE.Box3();
                perModel.forEach((ids, m) => {
                    const frags = m.getFragmentList?.();
                    const tree = m.getInstanceTree?.();
                    if (!frags || !tree) return;
                    ids.forEach((dbId) => {
                        tree.enumNodeFragments(dbId, (f) => { frags.getWorldBounds(f, tmp); acc.union(tmp); }, true);
                    });
                });
                if (!acc.isEmpty()) {
                    try { this.viewer.navigation.fitBounds(false, acc, false); } catch (err) { /* noop */ }
                }
            }
            this.scopeActive = true; // reutiliza el clear de alcance para restaurar
            this.viewer.impl.invalidate(true, true, true);
            console.log(`[LOB4D] Ver en 3D: ${targets.length} elementos aislados (${wantPrefix || [...wanted].join(',')})`);
        };

        // Derivar PROGRESIVAS desde el eje: proyecta cada elemento (centro de su
        // caja) al alineamiento activo → PK por elemento → rango por partida.
        this.handleDeriveStations = async () => {
            const result = await this.computeElementStations();
            window.dispatchEvent(new CustomEvent('lob-stations-derived', { detail: result }));
        };

        // Frente/alcance por rama del EDT: aísla los elementos de la rama dada
        // (planeamiento mapeado primero, CodigoDePartida como respaldo).
        this.handleScopeChange = async (e) => {
            const { codes, activityIds, mappedActivityIds } = e.detail || {};
            if (!this.getThemingModels().length) return;
            await this.ensurePropertyIndex();
            if (!codes || !codes.length) this.clearScopeIsolation();
            else this.isolateScope(codes, activityIds, mappedActivityIds);
        };

        window.addEventListener('lob-play', this.handlePlayEvent);
        window.addEventListener('lob-seek', this.handleSeekEvent);
        window.addEventListener('lob-time-update', this.handleTimeUpdate);
        window.addEventListener('lob-clear', this.handleClear4D);
        window.addEventListener('lob-param-scan', this.handleParamScan);
        window.addEventListener('lob-param-step', this.handleParamStep);
        window.addEventListener('lob-param-clear', this.handleParamClear);
        window.addEventListener('lob-isolate-state', this.handleIsolateState);
        window.addEventListener('lob-scope-change', this.handleScopeChange);
        window.addEventListener('lob-derive-stations', this.handleDeriveStations);
        window.addEventListener('lob-focus-elements', this.handleFocusElements);

        // Toggle de rótulos flotantes por SubZona (desde la UI del visor)
        this.handleZoneLabels = (e) => {
            const on = e?.detail?.visible;
            this.setZoneLabelsVisible(on !== false, 'subzona');
        };
        window.addEventListener('lob-zone-labels', this.handleZoneLabels);

        // Capa Agrupación: los mismos rótulos, pero la clave es el PAR
        // (SubZona + Ubicacion). Solo caen juntos los que coinciden en los dos.
        this.handleGroupLabels = (e) => {
            const on = e?.detail?.visible;
            this.setZoneLabelsVisible(on !== false, 'grupo');
        };
        window.addEventListener('lob-group-labels', this.handleGroupLabels);

        // Toggle de excavación fantasma (DWG de sólidos → "ya no existe")
        this.handleGhostExcav = (e) => this.ghostExcavation(e?.detail?.visible !== false);
        window.addEventListener('lob-ghost-excavation', this.handleGhostExcav);

        // Heatmap de avance por PK: pinta tramos de alineamientos por estado
        // (Ejecutado / En ejecución). Config: { on, ranges: { [alignmentId]: [{from,to,state}] } }
        this.handlePkHeatmap = (e) => this.applyPkHeatmap(e?.detail || null);
        window.addEventListener('lob-pk-heatmap', this.handlePkHeatmap);

        // Panel de ejecución por SubZona al pasar el mouse (toggle desde la barra)
        this.handleZoneHover = (e) => this.setZoneHoverEnabled(e?.detail?.visible !== false);
        window.addEventListener('lob-zone-hover', this.handleZoneHover);


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
        this.clearExcavationCut();
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
        window.removeEventListener('lob-param-scan', this.handleParamScan);
        window.removeEventListener('lob-param-step', this.handleParamStep);
        window.removeEventListener('lob-param-clear', this.handleParamClear);
        window.removeEventListener('lob-isolate-state', this.handleIsolateState);
        window.removeEventListener('lob-scope-change', this.handleScopeChange);
        window.removeEventListener('lob-derive-stations', this.handleDeriveStations);
        window.removeEventListener('lob-focus-elements', this.handleFocusElements);
        window.removeEventListener('lob-zone-labels', this.handleZoneLabels);
        window.removeEventListener('lob-group-labels', this.handleGroupLabels);
        window.removeEventListener('lob-ghost-excavation', this.handleGhostExcav);
        window.removeEventListener('lob-pk-heatmap', this.handlePkHeatmap);
        window.removeEventListener('lob-zone-hover', this.handleZoneHover);
        this.setZoneHoverEnabled(false);
        this.clearPkHeatmap();
        if (this._excavGhostOn) this.ghostExcavation(false);
        this.clearZoneLabels();
        if (this._zoneLabelGroup) { this._zoneLabelGroup.remove(); this._zoneLabelGroup = null; }
        this.clearParamSimulation();
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
                const sample = this.sampleFromCursor(ev.clientX, ev.clientY);
                if (sample != null) {
                    if (sample.alignment) this.activeAlignment = sample.alignment;
                    this.setStation(sample.station);
                }
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

    // Proyecta las muestras del eje a pantalla y devuelve la MUESTRA más
    // cercana al cursor ({station, alignment}), solo si está dentro del umbral.
    sampleFromCursor(clientX, clientY) {
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
        if (best && bestDist <= threshold * threshold) return best;
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

    // ── Corte del MODELO 3D en una progresiva ─────────────────────────────
    // Rebana los triángulos de TODOS los modelos cargados con el plano
    // perpendicular al eje en la estación dada. Devuelve, por modelo, los
    // segmentos de intersección en coordenadas de sección REALES:
    // [offset(m, izq−/der+), cota(m)]. Es REFERENCIA VISUAL (malla teselada);
    // los números oficiales siguen viniendo del JSON del extractor.
    sliceModelsAtStation(station, maxOffsetMeters = 30, minSolidDimMeters = 0.06) {
        const THREE = window.THREE;
        const refModel = this.getModelForCoordinates();
        if (!THREE || !refModel || !this.activeAlignment) return [];

        const civilPoint = this.pointAtStation(this.activeAlignment, station);
        const P0 = this.civilToViewerPoint(civilPoint, refModel);
        if (!P0) return [];

        // Tangente LOCAL exacta (diferencia finita ±0.5m sobre el eje). La de
        // muestras (nearest-sample) desvía el plano en CURVAS → el corte salía
        // desfasado en algunos tramos.
        let dir = null;
        try {
            const pA = this.civilToViewerPoint(this.pointAtStation(this.activeAlignment, Number(station) - 0.5), refModel);
            const pB = this.civilToViewerPoint(this.pointAtStation(this.activeAlignment, Number(station) + 0.5), refModel);
            if (pA && pB) dir = new THREE.Vector3(pB.x - pA.x, pB.y - pA.y, 0);
        } catch (e) { /* cae a la tangente por muestras */ }
        if (!dir || dir.lengthSq() < 1e-10) {
            const d = this.getDirectionAtStation(station) || new THREE.Vector3(1, 0, 0);
            dir = new THREE.Vector3(d.x, d.y, 0);
        }
        if (dir.lengthSq() < 1e-10) dir.set(1, 0, 0);
        dir.normalize();
        // Civil 3D: mirando en sentido de avance, DERECHA = offset positivo.
        // Rotación 90° CW del vector de dirección → coincide con esa convención.
        const perp = new THREE.Vector3(dir.y, -dir.x, 0);
        // Silueta principal: fuera aceros/refuerzos por nombre
        const steelRe = /acero|rebar|refuerzo|reinf|varilla|estribo|dowel|malla|armadur/i;

        const enumTri = window.Autodesk?.Viewing?.Private?.VertexEnumerator?.enumMeshTriangles;
        if (!enumTri) return [];

        const models = this.viewer.getAllModels ? this.viewer.getAllModels() : this.viewer.impl.modelQueue().getModels();
        const out = [];
        const box = new THREE.Box3();
        const mtx = new THREE.Matrix4();
        const c = new THREE.Vector3();
        const half = new THREE.Vector3();
        const w = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

        models.forEach((model) => {
            try {
                if (model.getData()?.is2d) return;
                const mpu = (model.getUnitScale && model.getUnitScale()) || 1; // metros por unidad
                const go = model.getData()?.globalOffset || { x: 0, y: 0, z: 0 };
                const frags = model.getFragmentList();
                const count = frags?.getCount ? frags.getCount() : 0;
                if (!count) return;

                const maxOffU = maxOffsetMeters / mpu; // a unidades del visor
                const minDimU = minSolidDimMeters / mpu; // silueta: fuera elementos delgados (aceros)
                const it = model.getData()?.instanceTree;
                const frag2db = frags.fragments?.fragId2dbId;
                const segs = [];

                for (let f = 0; f < count && segs.length < 20000; f += 1) {
                    frags.getWorldBounds(f, box);
                    box.getCenter(c); box.getSize(half);
                    // SILUETA PRINCIPAL: descarta barras/estribos/mallas — su
                    // dimensión mínima (diámetro/espesor) es de centímetros.
                    if (Math.min(half.x, half.y, half.z) < minDimU) continue;
                    half.multiplyScalar(0.5);
                    // rechazo rápido: la caja no cruza el plano, o queda lejos del eje
                    const dC = (c.x - P0.x) * dir.x + (c.y - P0.y) * dir.y;
                    const dExt = Math.abs(half.x * dir.x) + Math.abs(half.y * dir.y);
                    if (Math.abs(dC) > dExt) continue;
                    const oC = (c.x - P0.x) * perp.x + (c.y - P0.y) * perp.y;
                    const oExt = Math.abs(half.x * perp.x) + Math.abs(half.y * perp.y);
                    if (Math.abs(oC) - oExt > maxOffU) continue;

                    // Refuerzo por NOMBRE (por si un acero viene agrupado en un
                    // fragmento grande): acero/rebar/estribo/malla… no es silueta.
                    if (it && frag2db) {
                        try {
                            const nodeName = it.getNodeName(frag2db[f]) || '';
                            if (steelRe.test(nodeName)) continue;
                        } catch (e) { /* sin nombre: se dibuja */ }
                    }

                    const proxy = frags.getVizmesh(f);
                    if (!proxy?.geometry) continue;
                    frags.getWorldMatrix(f, mtx);

                    enumTri(proxy.geometry, (vA, vB, vC) => {
                        w[0].copy(vA).applyMatrix4(mtx);
                        w[1].copy(vB).applyMatrix4(mtx);
                        w[2].copy(vC).applyMatrix4(mtx);
                        const d0 = (w[0].x - P0.x) * dir.x + (w[0].y - P0.y) * dir.y;
                        const d1 = (w[1].x - P0.x) * dir.x + (w[1].y - P0.y) * dir.y;
                        const d2 = (w[2].x - P0.x) * dir.x + (w[2].y - P0.y) * dir.y;
                        const ds = [d0, d1, d2];
                        const pts = [];
                        for (let e = 0; e < 3; e += 1) {
                            const a = w[e]; const b = w[(e + 1) % 3];
                            const da = ds[e]; const db = ds[(e + 1) % 3];
                            if ((da <= 0 && db > 0) || (da > 0 && db <= 0)) {
                                const t = da / (da - db);
                                const qx = a.x + t * (b.x - a.x);
                                const qy = a.y + t * (b.y - a.y);
                                const qz = a.z + t * (b.z - a.z);
                                const off = ((qx - P0.x) * perp.x + (qy - P0.y) * perp.y) * mpu;
                                const cota = (qz + go.z) * mpu;
                                pts.push([off, cota]);
                            }
                        }
                        if (pts.length === 2 && Math.abs(pts[0][0]) <= maxOffsetMeters && Math.abs(pts[1][0]) <= maxOffsetMeters) {
                            segs.push([pts[0][0], pts[0][1], pts[1][0], pts[1][1]]);
                        }
                    });
                }

                if (segs.length) {
                    out.push({ name: model.getData()?.loadOptions?.modelNameOverride || model.getDocumentNode?.()?.getModelName?.() || `Modelo ${model.id}`, segs });
                }
            } catch (e) {
                console.warn('[LOB4D] slice modelo:', e);
            }
        });

        return out;
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
        this.viewer.impl.invalidate(false, false, true); // overlay-only: sin reiniciar el render de escena
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
        const sample = this.sampleFromCursor(event.clientX, event.clientY);
        if (sample == null) return;
        if (sample.alignment) this.activeAlignment = sample.alignment;
        this.setStation(sample.station);
    }

    onStationCursorPointerUp() {
        this.stopStationCursorDrag();
    }

    buildAlignmentSamples(alignmentData, model) {
        // cada muestra recuerda SU alineamiento: con 2+ ejes activos, el hover y
        // el clic en etiquetas deben operar sobre el eje correcto, no el último.
        const profilePoints = this.getActiveProfilePoints(alignmentData);
        if (profilePoints.length >= 2) {
            return profilePoints
                .map(point => {
                    const viewerPoint = this.civilToViewerPoint(point, model);
                    return viewerPoint ? { point: viewerPoint, station: point.station, alignment: alignmentData } : null;
                })
                .filter(Boolean);
        }

        const samples = [];
        const subEntities = alignmentData?.subEntities || [];
        for (const segment of subEntities) {
            for (const station of this.getSegmentSampleStations(alignmentData, segment)) {
                const civilPoint = this.pointAtStation(alignmentData, station);
                const viewerPoint = this.civilToViewerPoint(civilPoint, model);
                if (viewerPoint) samples.push({ point: viewerPoint, station, alignment: alignmentData });
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

        // ANTI-PARPADEO: esto corre en CADA pixel del arrastre de la progresiva.
        // El cursor/marcador son OVERLAYS → basta invalidar overlays (barato).
        // Invalidar la escena completa reiniciaba el render progresivo → los
        // modelos pesados (aceros) parpadeaban. Escena solo si el shader de
        // corte de excavación está aplicado (usa uCurrentStation).
        const cutActive = !!(this.shaderMaterial && this.fragmentsBackup && this.fragmentsBackup.size > 0);
        this.viewer.impl.invalidate(cutActive, false, true);
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

    // Llave de CRONOGRAMA: código de planeamiento = actividad/paño real del P6.
    // Es la única que da fechas correctas por elemento (04_29_DSI_CodigoPlaneamiento).
    isPlanningPropertyName(displayName) {
        const name = this.normalize4DPropName(displayName);
        const keys = [
            'codigoplaneamiento',
            'planningcode',
            'activityid',
            'idactividad',
            'codigoactividad',
            'scheduleid',
            'taskid',
        ];
        return keys.some((key) => name.includes(key));
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

    async setElementLinks(links = []) {
        this.clear4DTheming();
        this.activityToDbIds = {};
        this.propertyIndexBuilt = false;
        this.persistentLinksLoaded = true;

        const models = this.getThemingModels();
        if (!models.length) return;

        const mappings = await Promise.all(models.map((model) => new Promise((resolve) => {
            const done = (mapping) => resolve({ model, mapping: mapping || {} });
            try {
                model.getExternalIdMapping(done, () => done({}));
            } catch {
                done({});
            }
        })));
        const byUrn = new Map();
        mappings.forEach(({ model, mapping }) => {
            const urn = this.normalizeUrnKey(model?.getData?.()?.urn);
            if (urn) byUrn.set(urn, { model, mapping });
        });

        const seen = new Set();
        const add = (key, dbId, model) => {
            const cleanKey = this.normalize4DKey(key);
            if (!cleanKey || !Number.isInteger(dbId) || dbId <= 0) return;
            const unique = `${cleanKey}:${this.modelKey(model)}:${dbId}`;
            if (seen.has(unique)) return;
            seen.add(unique);
            if (!this.activityToDbIds[cleanKey]) this.activityToDbIds[cleanKey] = [];
            this.activityToDbIds[cleanKey].push({ dbId, model, state: 'normal' });
        };

        (links || []).forEach((link) => {
            const sourceUrn = this.normalizeUrnKey(link.source_urn || link.sourceUrn);
            let target = byUrn.get(sourceUrn);
            if (!target) {
                target = mappings.find(({ mapping }) => mapping[link.external_id || link.externalId] != null);
            }
            if (!target) return;
            const externalId = String(link.external_id || link.externalId || '');
            const dbId = Number(target.mapping[externalId]);
            add(link.codigo || link.code, dbId, target.model);
            add(link.activity_id || link.activityId, dbId, target.model);
        });

        this.propertyIndexBuilt = true;
        const keys = Object.keys(this.activityToDbIds);
        window.dispatchEvent(new CustomEvent('lob-activities-found', {
            detail: { ids: keys, source: 'postgres', links: links.length, mappedKeys: keys.length }
        }));
        this.viewer.impl.invalidate(true, true, true);
    }

    buildPropertyIndex() {
        return new Promise((resolve) => {
            if (this.persistentLinksLoaded) {
                this.propertyIndexBuilt = true;
                resolve();
                return;
            }
            this.activityToDbIds = {}; // "PQ08_1090" -> [{dbId: 12, state: 'normal'}, ...]
            this.partidaCodeToDbIds = {}; // "05.02.03.08" -> [{dbId, model}] (alcance por rama EDT)
            this.elementScopeInfo = new Map(); // "modelId:dbId" -> {dbId, model, planning:Set, partidas:Set}

            console.log('[LOB4DExtension] Building property index...');

            const models = this.getThemingModels();
            if (!models.length) return resolve();

            let pending = models.length;
            const done = () => {
                pending -= 1;
                if (pending > 0) return;
                this.propertyIndexBuilt = true;
                const foundIds = Object.keys(this.activityToDbIds);
                const totalDb = Object.values(this.activityToDbIds).reduce((n, arr) => n + arr.length, 0);
                console.log(`[4D-DIAG] Índice construido: ${foundIds.length} llaves, ${totalDb} elementos. Muestra:`, foundIds.slice(0, 12));
                window.__lob4dDiag = { indexKeys: foundIds.length, indexElems: totalDb, sample: foundIds.slice(0, 12) };
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
                        const planningIds = new Set();
                        const partidaIds = new Set();
                        for (const prop of res.properties || []) {
                            const isPlan = this.isPlanningPropertyName(prop.displayName);
                            const isPart = !isPlan && this.isActivityPropertyName(prop.displayName);
                            if (!isPlan && !isPart) continue;
                            const value = this.normalize4DKey(prop.displayValue);
                            if (value && value.length <= 120) {
                                value.split(/[;,|]/).forEach((part) => {
                                    const clean = this.normalize4DKey(part);
                                    if (clean) (isPlan ? planningIds : partidaIds).add(clean);
                                });
                            }
                        }
                        // Índice por CodigoDePartida (siempre): alimenta el alcance por
                        // rama del EDT (aislar frente 05.06, etc.), NO el coloreo.
                        // Solo valores con forma de código EDT (fuera basura tipo
                        // '["", ""]' o 'NO METRAR' que vienen en algunos parámetros).
                        const codeLike = (v) => /^\d{1,3}(\.\d{1,3})+$/.test(v);
                        const partidaCodes = [...partidaIds].filter(codeLike);
                        for (const code of partidaCodes) {
                            if (!this.partidaCodeToDbIds[code]) this.partidaCodeToDbIds[code] = [];
                            this.partidaCodeToDbIds[code].push({ dbId: res.dbId, model });
                        }
                        if (planningIds.size || partidaCodes.length) {
                            this.elementScopeInfo.set(`${model.id}:${res.dbId}`, {
                                dbId: res.dbId,
                                model,
                                planning: new Set(planningIds),
                                partidas: new Set(partidaCodes),
                            });
                        }
                        // Prioridad: si el elemento tiene código de PLANEAMIENTO (actividad/
                        // paño real del P6), se colorea SOLO por ese → fechas correctas. El
                        // ITEM (CodigoDePartida) se colapsa a un paño arbitrario y desfasa,
                        // así que solo se usa como respaldo si no hay planeamiento.
                        const activityIds = planningIds.size ? planningIds : partidaIds;
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

    // Guard anti-carrera: el scan es lento (miles de elementos). Sin esto,
    // en Play se dispara varias veces en paralelo, cada una hace
    // activityToDbIds={} a medio construir → índice parcial → parpadeo
    // y "algunos se pintan, otros no". Todas comparten la MISMA promesa.
    async ensurePropertyIndex() {
        if (this.propertyIndexBuilt) return;
        if (!this._indexBuilding) this._indexBuilding = this.buildPropertyIndex();
        await this._indexBuilding;
        this._indexBuilding = null;
    }

    async simulate4D(date, activeTasks, payload = {}) {
        if (this.paramMode) return; // el modo prueba por parámetro tiene el control del coloreado
        if (!this.getThemingModels().length) return;
        
        await this.ensurePropertyIndex();
        if (!this.activityToDbIds) return;
        
        const THREE = window.THREE;
        const colorDone = new THREE.Vector4(0.12, 0.62, 0.32, 0.72);
        const colorExecuting = new THREE.Vector4(0.95, 0.62, 0.10, 1);
        const colorProgrammed = new THREE.Vector4(0.18, 0.44, 0.86, 0.38);
        const colorPending = new THREE.Vector4(0.28, 0.31, 0.36, 0.32);
        
        let needsUpdate = false;
        
        const activeIds = new Set((activeTasks || []).flatMap((task) => this.getTaskKeys(task)));
        const completedIds = new Set((payload.completedTasks || []).flatMap((task) => this.getTaskKeys(task)));
        const plannedIds = new Set((payload.plannedTasks || []).flatMap((task) => this.getTaskKeys(task)));
        const pendingIds = new Set((payload.pendingTasks || []).flatMap((task) => this.getTaskKeys(task)));
        const directStates = new Map();

        const addDirect = (tasks, state) => {
            (tasks || []).forEach((task) => {
                this.getTaskDbIds(task).forEach((dbId) => directStates.set(dbId, state));
            });
        };

        addDirect(payload.completedTasks, 'done');
        addDirect(payload.plannedTasks, 'planned');
        addDirect(activeTasks, 'executing');

        // ── DIAGNÓSTICO: ¿cruzan las llaves del índice con las de las tareas? ──
        const _idxKeys = Object.keys(this.activityToDbIds);
        let _matched = 0;
        for (const k of _idxKeys) {
            if (activeIds.has(k) || completedIds.has(k) || plannedIds.has(k) || pendingIds.has(k)) _matched += 1;
        }
        const _diag = {
            fecha: date,
            indiceLlaves: _idxKeys.length,
            indiceMuestra: _idxKeys.slice(0, 3),
            tareasActivas: activeIds.size,
            tareasHechas: completedIds.size,
            tareasFuturas: plannedIds.size,
            tareasMuestra: [...activeIds].slice(0, 3),
            llavesQueCRUZAN: _matched,
        };
        window.__lob4dDiag = { ...(window.__lob4dDiag || {}), ..._diag };
        console.log('[4D-DIAG] simulate4D:', _diag);
        window.dispatchEvent(new CustomEvent('LOB4D_DIAG', { detail: _diag }));

        for (const [activityId, items] of Object.entries(this.activityToDbIds)) {
            let newState = 'normal';
            if (pendingIds.has(activityId)) newState = 'pending';
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
                    } else if (newState === 'pending') {
                        this.viewer.setThemingColor(item.dbId, colorPending, item.model || this.viewer.model, true);
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

        this.updateExcavationSimulation(payload);
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
            if (item.alignment) this.activeAlignment = item.alignment; // multi-eje: activa SU eje
            this.activateStationCursor(item.station);
        });
        el.addEventListener('pointerdown', (event) => {
            if (event.button !== 0) return;
            if (item.alignment) this.activeAlignment = item.alignment;
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
            this.updateZoneLabels();
        });
    }

    // ── Rótulos flotantes por SubZona (estilo Tandem) ───────────────────────
    // Detecta el parámetro DSI_SYP_SubZona del inventario, calcula el centro
    // 3D de cada subzona (unión de bounding boxes de sus elementos) y ancla un
    // rótulo flotante ahí. Independiente de las progresivas.
    detectZoneKey(inv) {
        // Unir claves de una muestra amplia (la primera fila puede ser del terreno,
        // que no trae el parámetro de subzona).
        const keys = new Set();
        const sample = Array.isArray(inv) ? inv.slice(0, 400) : [inv];
        for (const row of sample) {
            if (row) for (const k of Object.keys(row)) keys.add(k);
        }
        const arr = Array.from(keys);
        return arr.find(k => /sub[\s_]*zona/i.test(k))
            || arr.find(k => /_SYP_.*zona/i.test(k))
            || arr.find(k => /\bzona\b/i.test(k))
            || null;
    }

    // Campo de AGRUPACIÓN para la capa Ejecución: ÚNICAMENTE el LOCALIZADOR
    // (01_02_DSI_Localizador, valores tipo BP-10), por decisión del usuario.
    // Sin cadena de respaldo. Otro parámetro solo si él lo elige en el ⚙.
    detectHoverKey(inv) {
        const keys = new Set();
        const sample = Array.isArray(inv) ? inv.slice(0, 400) : [inv];
        for (const row of sample) {
            if (row) for (const k of Object.keys(row)) keys.add(k);
        }
        // SOLO Localizador: coincidencia EXACTA del nombre primero, y sin
        // cadena de respaldo. Si el inventario no lo trae, la capa avisa
        // "sin parámetro" en vez de agrupar por otra cosa y dar un avance
        // que no es el que se pidió.
        const arr = Array.from(keys);
        return arr.find(k => k.toLowerCase() === '01_02_dsi_localizador')
            || arr.find(k => /(^|_)localizador$/i.test(k))
            || null;
    }

    // Campo de AVANCE (sí/no por elemento). Determinista y por prioridad: sin
    // esto se tomaba "el primero que contuviera 'ejecutad'", que en el
    // inventario real podía ser "VAL_Sin Ejecutar" (¡significado INVERTIDO!)
    // o "VAL_Paños ejecutados" (numérico) → porcentajes sin sentido.
    detectExecKey(cols) {
        const arr = Array.from(cols);
        const banned = /^VAL_|sin[\s_]*ejecut|paños|panos|mes[\s_]*ejecut|fecha/i;
        const cand = arr.filter(k => /ejecutad/i.test(k) && !banned.test(k));
        return cand.find(k => /acumulad/i.test(k))          // avance acumulado
            || cand.find(k => /_SYP_Ejecutado$/i.test(k))   // marca de la SubZona
            || cand.find(k => /actual/i.test(k))            // avance del periodo
            || cand.find(k => /^EJECUTADO$/i.test(k))
            || cand[0]
            || null;
    }

    zoneMapForModel(model) {
        const raw = model?.getData?.()?.urn;
        if (!raw) return null;
        const safe = String(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const std = String(raw).replace(/-/g, '+').replace(/_/g, '/');
        const R = window.rosettaToDbId || {};
        return R[raw] || R[safe] || R[std] || null;
    }

    ensureZoneGroup() {
        if (this._zoneLabelGroup) return;
        const g = document.createElement('div');
        g.className = 'lob-zone-label-group';
        g.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:91;overflow:hidden;';
        // SVG para las líneas guía (leader lines) hacia el punto real de cada zona
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'lob-zone-leaders');
        svg.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;';
        g.appendChild(svg);
        this.viewer.container.appendChild(g);
        this._zoneLabelGroup = g;
        this._zoneLeaderSvg = svg;
        if (!this._zoneLabelElements) this._zoneLabelElements = [];
    }

    // Color de marca (teal de la interfaz), NO verde. Coherente con el acento
    // activo del panel de filtros (.tandem-cb-box.checked.active #2d8fa5).
    createZoneLabel(text, worldPos, zone, worldBase = null) {
        const active = this._activeZone === zone;
        // Línea guía (SVG)
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('stroke-width', '1');
        this._zoneLeaderSvg.appendChild(line);
        // Un ANILLO, no un punto relleno. Un punto opaco se lee como "aquí hay algo
        // encima"; un anillo se lee como una chincheta clavada EN la pieza, que es
        // lo que hace sentir que la etiqueta pertenece a ese volumen y no que está
        // suelta por delante. El relleno oscuro le da el hueco del centro.
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('r', '3.4');
        dot.setAttribute('fill', 'rgba(20,28,38,0.55)');
        dot.setAttribute('stroke-width', '1.4');
        this._zoneLeaderSvg.appendChild(dot);

        // Píldora
        const el = document.createElement('div');
        el.className = 'lob-zone-label';
        el.style.cssText = this.zoneLabelStyle(active);

        const txt = document.createElement('span');
        txt.textContent = text;
        el.appendChild(txt);

        // La × de salir del aislamiento. Solo se ve cuando este grupo ES el
        // aislado: volver a pulsar la píldora también funcionaba, pero eso no se
        // adivina, y estando aislado el resto de píldoras no está para recordarte
        // cómo salir. Con la × la salida se ve.
        const cerrar = document.createElement('span');
        cerrar.className = 'lob-zone-close';
        cerrar.textContent = '×';
        cerrar.title = 'Salir y ver todo';
        cerrar.style.cssText = 'margin-left:7px;font-size:14px;line-height:1;opacity:0.85;'
            + 'display:none;cursor:pointer;font-weight:900;';
        cerrar.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.clearZoneIsolation();
        });
        el.appendChild(cerrar);

        el.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.handleZoneClick(zone);
        });
        this._zoneLabelGroup.appendChild(el);

        this._zoneLabelElements.push({
            el, line, dot, zone, cerrar,
            worldPos: worldPos.clone ? worldPos.clone() : worldPos,
            worldBase: worldBase ? (worldBase.clone ? worldBase.clone() : worldBase) : null,
        });
    }

    zoneLabelStyle(active) {
        // Con un grupo aislado, los DEMÁS rótulos se atenúan en vez de desaparecer:
        // siguen diciendo dónde está el resto -que es la referencia que uno necesita
        // para situarse- pero dejan de competir con el que estás mirando.
        const atenuada = !!this._activeZone && !active;
        // Colores planos, no gradientes: un panel de ingeniería es plano. El
        // activo lleva el teal de marca sólido; el inactivo, un grafito frío casi
        // opaco. Peso 600 en vez de 700 (menos "grito"), y una sombra más baja y
        // difusa que asienta la píldora sobre el modelo en vez de despegarla.
        const bg = active ? '#1f6f82' : 'rgba(24,32,42,0.92)';
        const border = active ? '#3fa7bd' : 'rgba(126,155,189,0.28)';
        const color = active ? '#eafcff' : '#c3d2e2';
        const atenuar = atenuada ? 'opacity:0.28;' : '';
        return `position:absolute;display:inline-flex;align-items:center;${atenuar}color:${color};background:${bg};padding:5px 12px;border-radius:7px;border:1px solid ${border};font:600 11.5px Inter,-apple-system,'Segoe UI',Arial,sans-serif;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.28);transform:translate(-50%,-50%);letter-spacing:0.2px;cursor:pointer;pointer-events:auto;will-change:left,top,display;transition:opacity .18s;backdrop-filter:blur(2px);`;
    }

    // La clave de un elemento. Es lo ÚNICO que cambia entre la capa SubZonas y la
    // capa Agrupación: el resto del mecanismo -cajas envolventes, centroide,
    // rótulo flotante, línea guía, aislar al pulsar- es el mismo.
    claveDeAgrupacion(row, campo) {
        if (!campo) return '';
        let v = row[campo];
        if (Array.isArray(v)) v = v.filter(Boolean).join(', ');
        return (v === null || v === undefined) ? '' : String(v).trim();
    }

    reportZoneResult(count, reason, extra = {}) {
        const evento = this._labelMode === 'grupo' ? 'lob-group-labels-result' : 'lob-zone-labels-result';
        window.dispatchEvent(new CustomEvent(evento, { detail: { count, reason, ...extra } }));
        return count;
    }

    buildSubZoneLabels(modo = 'subzona') {
        const THREE = window.THREE;
        const inv = window.postgresInventory;
        this._labelMode = modo;
        const esGrupo = modo === 'grupo';
        const etiq = esGrupo ? 'Agrupación' : 'SubZonas';
        if (!THREE || !Array.isArray(inv) || !inv.length) {
            console.warn(`[LOB4D] ${etiq}: sin postgresInventory cargado.`);
            return this.reportZoneResult(0, 'sin-inventario');
        }
        // Agrupación usa el LOCALIZADOR (01_02_DSI_Localizador), el mismo campo
        // con el que ya agrupa la capa Ejecución — así que se reutiliza su
        // detector, que busca ese nombre exacto y no tiene cadena de respaldo.
        // Combinar SubZona + Ubicación se probó y quedó confuso; se retomará
        // cuando esté claro cómo se comportan los casos reales.
        const zoneKey = esGrupo ? this.detectHoverKey(inv) : this.detectZoneKey(inv);
        if (!zoneKey) {
            console.warn(`[LOB4D] ${etiq}: no se detectó el parámetro de agrupación en el inventario.`);
            return this.reportZoneResult(0, 'sin-parametro',
                esGrupo ? { faltan: 'Localizador' } : {});
        }

        this.clearZoneLabels();
        this.ensureZoneGroup();

        const models = this.viewer.impl?.modelQueue?.().getModels?.()
            || [this.viewer.model].filter(Boolean);

        // extId → zona (una vez)
        const extZone = new Map();
        for (const row of inv) {
            const v = this.claveDeAgrupacion(row, zoneKey);
            if (v) extZone.set(row.dbId, v);
        }
        if (!extZone.size) {
            console.warn(`[LOB4D] ${etiq}: el parámetro ${zoneKey} existe pero está vacío en todos los elementos.`);
            return this.reportZoneResult(0, 'parametro-vacio', { key: zoneKey });
        }

        // Acumular por zona: centroide, cota superior, caja global y los dbIds
        // por modelo (para poder AISLAR al hacer click, estilo Tandem).
        const agg = new Map();
        const tmp = new THREE.Box3();
        for (const model of models) {
            const map = this.zoneMapForModel(model);
            if (!map) continue;
            const tree = model.getInstanceTree?.();
            const fragList = model.getFragmentList?.();
            if (!tree || !fragList) continue;

            extZone.forEach((zone, extId) => {
                const dbId = map[extId];
                if (dbId === undefined || dbId === null) return;
                const box = new THREE.Box3();
                let has = false;
                tree.enumNodeFragments(dbId, (fragId) => {
                    fragList.getWorldBounds(fragId, tmp);
                    if (tmp && !tmp.isEmpty()) { box.union(tmp); has = true; }
                }, true);
                if (!has) return;
                const center = box.getCenter(new THREE.Vector3());
                let a = agg.get(zone);
                if (!a) { a = { sum: new THREE.Vector3(), n: 0, top: -Infinity, bbox: new THREE.Box3(), byModel: new Map(), centers: [] }; agg.set(zone, a); }
                a.centers.push(center);
                a.sum.add(center);
                a.n += 1;
                if (box.max.z > a.top) a.top = box.max.z;
                a.bbox.union(box);
                let ids = a.byModel.get(model);
                if (!ids) { ids = []; a.byModel.set(model, ids); }
                ids.push(dbId);
            });
        }

        this._zoneMembers = new Map();
        let created = 0;
        agg.forEach((a, zone) => {
            if (!a.n) return;
            const c = a.sum.clone().multiplyScalar(1 / a.n);
            // DOS puntos, no uno.
            //
            // Antes el rótulo se anclaba en `top + 2` -justo encima del elemento más
            // alto- y la línea guía salía de ahí: quedaba tan corta que no se veía, y
            // la píldora parecía flotar sin pertenecer a nada. Ahora la línea ARRANCA
            // EN LA BASE del grupo y sube hasta la píldora, que se queda por encima
            // de su punto más alto. Así se lee de un vistazo a qué volumen pertenece
            // la etiqueta, que es justo para lo que está.
            // El anclaje va al ELEMENTO más cercano al centroide, no a ningún
            // centro geométrico. Ya se probó dos veces lo otro: la cota mínima
            // fallaba en piezas largas inclinadas, y el centro de la caja falla en
            // grupos en L o escalonados (una gradería): ambos son puntos de una
            // CAJA imaginaria, y la caja de un grupo no es el grupo. El centro del
            // elemento más próximo al centroide es, por definición, una pieza
            // construida: la chincheta queda clavada EN el grupo, siempre.
            let base = a.centers[0];
            let mejor = Infinity;
            for (const p of a.centers) {
                const d = p.distanceToSquared(c);
                if (d < mejor) { mejor = d; base = p; }
            }
            const alto = c.clone();
            alto.z = a.top + 2;         // por encima de lo más alto: aquí va la píldora
            this._zoneMembers.set(zone, { byModel: a.byModel, bbox: a.bbox });
            this.createZoneLabel(zone, alto, zone, base);
            created += 1;
        });

        this._zoneLabelsVisible = true;
        this.updateZoneLabels();
        console.log(`[LOB4D] ${etiq}: ${created} grupo(s) rotulados (parámetro "${zoneKey}"). Elementos con clave: ${extZone.size}`);
        if (!created) {
            // El parámetro tiene valores pero ningún elemento cruzó con geometría
            // del visor (mapeo rosetta o bounding boxes vacíos).
            return this.reportZoneResult(0, 'sin-geometria', { key: zoneKey, extWithZone: extZone.size });
        }
        return this.reportZoneResult(created, 'ok', { key: zoneKey, zones: created });
    }

    updateZoneLabels() {
        if (!this._zoneLabelGroup || !this._zoneLabelElements) return;
        const visible = this._zoneLabelsVisible !== false && this._zoneLabelElements.length > 0;
        this._zoneLabelGroup.style.display = visible ? 'block' : 'none';
        if (!visible) return;

        const W = this.viewer.container.clientWidth;
        const H = this.viewer.container.clientHeight;
        const OFFSET = 34; // px que la píldora sube sobre su punto de anclaje
        for (const label of this._zoneLabelElements) {
            const s = this.viewer.worldToClient(label.worldPos);
            const inFront = s.z == null || (s.z >= 0 && s.z <= 1);
            const off = !inFront || s.x < -200 || s.y < -100 || s.x > W + 200 || s.y > H + 100;
            if (off) {
                label.el.style.display = 'none';
                label.line.style.display = 'none';
                label.dot.style.display = 'none';
                continue;
            }
            const lx = s.x;
            const ly = s.y - OFFSET; // píldora un poco arriba del punto alto
            label.el.style.display = 'inline-flex';
            label.el.style.left = `${lx}px`;
            label.el.style.top = `${ly}px`;
            // La × solo en el grupo que está aislado ahora mismo.
            if (label.cerrar) {
                label.cerrar.style.display = (this._activeZone === label.zone) ? 'inline' : 'none';
            }
            // Línea guía: arranca en la BASE del grupo (si la tenemos) y sube hasta
            // la píldora, atravesando el volumen. Es lo que hace que la etiqueta se
            // lea como "de este grupo" y no como una pegatina flotando encima.
            const anclaje = label.worldBase ? this.viewer.worldToClient(label.worldBase) : s;
            // El activo lleva trazo continuo y del color de la píldora; el resto,
            // discontinuo y atenuado. Igual que los rótulos: siguen ahí de
            // referencia, pero no compiten con el que estás mirando.
            const activo = this._activeZone === label.zone;
            const atenuado = !!this._activeZone && !activo;
            const trazo = activo ? '#43b3cc' : '#7e9bbd';
            const alfa = atenuado ? 0.28 : (activo ? 0.95 : 0.7);
            label.dot.style.display = 'block';
            label.dot.setAttribute('cx', anclaje.x);
            label.dot.setAttribute('cy', anclaje.y);
            label.dot.setAttribute('stroke', trazo);
            label.dot.setAttribute('opacity', alfa);
            label.dot.setAttribute('r', activo ? '4.2' : '3.4');
            label.line.style.display = 'block';
            label.line.setAttribute('x1', anclaje.x);
            label.line.setAttribute('y1', anclaje.y);
            label.line.setAttribute('x2', lx);
            label.line.setAttribute('y2', ly + 9);
            label.line.setAttribute('stroke', trazo);
            label.line.setAttribute('opacity', alfa);
            label.line.setAttribute('stroke-width', activo ? '1.6' : '1');
            // Continua cuando es el activo: una línea sólida "sujeta"; una
            // discontinua sugiere que solo apunta.
            if (activo) label.line.removeAttribute('stroke-dasharray');
            else label.line.setAttribute('stroke-dasharray', '3 3');
        }
    }

    clearZoneLabels() {
        // Si se reconstruyen las etiquetas (cambio de capa, inventario nuevo),
        // el resaltado viejo apuntaría a grupos que ya no existen: fuera con él,
        // tanto el rayado (guardado para otra vez) como el teñido gris/teal.
        this.clearZoneHatch();
        this._limpiarTenido();
        this._activeZone = null;
        if (this._zoneLabelElements) {
            for (const l of this._zoneLabelElements) {
                try { l.el.remove(); l.line.remove(); l.dot.remove(); } catch { /* noop */ }
            }
        }
        this._zoneLabelElements = [];
    }

    setZoneLabelsVisible(v, modo = 'subzona') {
        this._zoneLabelsVisible = v;
        // SubZonas y Agrupación comparten los mismos rótulos, así que son
        // excluyentes: encender una reconstruye y apaga la otra. Dejarlas
        // convivir superpondría dos píldoras en el mismo punto del modelo.
        const cambioDeModo = v && this._labelMode && this._labelMode !== modo;
        if (v && (cambioDeModo || !this._zoneLabelElements || !this._zoneLabelElements.length)) {
            if (this._activeZone) this.clearZoneIsolation();
            this.buildSubZoneLabels(modo);
        } else {
            if (!v && this._activeZone) this.clearZoneIsolation(); // apagar libera el aislamiento
            this.updateZoneLabels();
        }
    }

    // ── PANEL DE EJECUCIÓN POR SUBZONA (hover) ──────────────────────────────
    // Al pasar el mouse por CUALQUIER elemento, se resuelve su SubZona y se
    // informa del GRUPO COMPLETO (pueden ser 20, 200 o 2000 elementos), nunca
    // de la pieza suelta. Todo sale de postgresInventory (ya en memoria) →
    // sin llamadas al servidor.
    // Huella para invalidar el índice: cambia si cambia el inventario, el
    // mapeo rosetta (modelo que terminó de indexar) o el campo de agrupación.
    _zoneHoverFingerprint(groupField) {
        const inv = window.postgresInventory;
        const R = window.rosettaToDbId || {};
        let mapped = 0;
        for (const urn in R) { for (const _k in R[urn]) mapped++; }
        // el campo de AVANCE también entra: cambiarlo debe reconstruir el índice
        let resolved = null;
        try { resolved = this.detectHoverKey(inv); } catch { /* sin inventario */ }
        return `${inv?.length || 0}|${mapped}|${resolved || 'none'}|${window.__zoneHoverExecField || 'auto'}`;
    }

    buildZoneHoverIndex(groupField) {
        const inv = window.postgresInventory;
        if (!Array.isArray(inv) || !inv.length) return null;
        // El agrupador es FIJO (01_02_DSI_Localizador): ningún ajuste guardado
        // puede cambiarlo — así la capa nunca agrupa por otro parámetro.
        const zoneKey = this.detectHoverKey(inv);
        if (!zoneKey) return null;

        // Esquema: detectar columnas por nombre (el prefijo numérico varía)
        const cols = new Set();
        inv.slice(0, 400).forEach(r => { if (r) Object.keys(r).forEach(k => cols.add(k)); });
        const find = (re) => Array.from(cols).find(k => re.test(k)) || null;
        const kEjec = window.__zoneHoverExecField || this.detectExecKey(cols);
        // visible en consola: con qué parámetros se calculó el avance
        console.log(`[LOB4D] Ejecución → agrupa por "${zoneKey}" · avance por "${kEjec || '(ninguno)'}"`);

        // Mapas rosetta POR MODELO, resueltos UNA vez (antes se recorrían todos
        // los modelos en cada hover → O(elementos × modelos) por movimiento).
        const models = this.viewer.impl?.modelQueue?.().getModels?.() || [];
        const modelMaps = models
            .map(m => ({ model: m, map: this.zoneMapForModel(m) }))
            .filter(x => !!x.map);
        // Índice de modelos por URN normalizado: cada fila del inventario se
        // resuelve contra SU PROPIO modelo. Sin esto, los IDs externos que se
        // repiten entre modelos (versiones del mismo Revit conviviendo en el
        // frente) hacían que un elemento leyera la fila de otro modelo — de
        // ahí que un buzón de drenaje mostrara el localizador de otro archivo.
        const _nu = (u) => String(u || '').replace(/^urn:/i, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const mapByUrn = new Map();
        for (const mm of modelMaps) {
            try { mapByUrn.set(_nu(mm.model.getData()?.urn), mm); } catch { /* modelo sin urn */ }
        }

        const norm = (v) => Array.isArray(v) ? v.filter(Boolean).join(', ') : String(v ?? '').trim();
        const groups = new Map();       // zona -> stats
        const extToZone = new Map();    // extId -> zona
        const membersByZone = new Map(); // zona -> [{model, dbId}]  ← PRE-RESUELTO

        for (const row of inv) {
            const zone = norm(row[zoneKey]);
            if (!zone) continue;
            const srcKey = _nu(row.source_urn || row.model_urn);
            extToZone.set(srcKey + '|' + row.dbId, zone);

            let g = groups.get(zone);
            if (!g) {
                g = { zone, total: 0, done: 0 };
                groups.set(zone, g);
                membersByZone.set(zone, []);
            }
            g.total += 1;

            const ejecRaw = kEjec ? norm(row[kEjec]).toLowerCase() : '';
            const isDone = ejecRaw === '1' || ejecRaw === 'si' || ejecRaw === 'sí' || ejecRaw === 'true' || ejecRaw === 'x';
            if (isDone) g.done += 1;

            // Resolver dbId del visor AQUÍ (una sola vez por elemento), en
            // el modelo al que la fila REALMENTE pertenece
            const own = mapByUrn.get(srcKey);
            if (own) {
                const dbId = own.map[row.dbId];
                if (dbId != null) membersByZone.get(zone).push({ model: own.model, dbId });
            } else {
                for (const { model, map } of modelMaps) {
                    const dbId = map[row.dbId];
                    if (dbId != null) { membersByZone.get(zone).push({ model, dbId }); break; }
                }
            }
        }

        console.log(`[LOB4D] Hover: ${groups.size} grupos por "${zoneKey}" · avance="${kEjec || '—'}" · ${extToZone.size} elementos indexados.`);
        return { zoneKey, kEjec, groups, extToZone, membersByZone, schema: { kEjec } };
    }

    setZoneHoverEnabled(on) {
        this._zoneHoverOn = !!on;
        const canvas = this.viewer?.impl?.canvas || this.viewer?.canvas;

        if (!on) {
            if (this._onZoneHoverMove && canvas) canvas.removeEventListener('mousemove', this._onZoneHoverMove);
            this._onZoneHoverMove = null;
            this._zoneHoverIndex = null;
            this._zoneHoverCurrent = null;
            this.clearZoneHoverHighlight();
            window.dispatchEvent(new CustomEvent('lob-zone-hover-data', { detail: null }));
            return;
        }

        // Índice CACHEADO: no se reconstruye al apagar/encender; solo si cambió
        // el inventario, la rosetta (modelo tardío) o el campo de agrupación.
        window.__zoneHoverField = null;   // sin override de agrupación
        const field = null;
        const fp = this._zoneHoverFingerprint(field);
        if (this._zoneHoverIndex && this._zoneHoverFp === fp) {
            console.log('[LOB4D] Hover: índice reutilizado (sin recalcular).');
        } else {
            this._zoneHoverIndex = this.buildZoneHoverIndex(field);
            this._zoneHoverFp = fp;
        }
        if (!this._zoneHoverIndex) {
            window.dispatchEvent(new CustomEvent('lob-zone-hover-error', {
                detail: { reason: window.postgresInventory?.length ? 'sin-parametro' : 'sin-inventario' }
            }));
            this._zoneHoverOn = false;
            return;
        }
        if (!canvas) return;

        this._onZoneHoverMove = (ev) => {
            if (this._zoneHoverRaf) return;         // 1 lectura por frame
            this._zoneHoverRaf = requestAnimationFrame(() => {
                this._zoneHoverRaf = null;
                this.resolveZoneUnderCursor(ev.clientX, ev.clientY);
            });
        };
        canvas.addEventListener('mousemove', this._onZoneHoverMove);
    }

    resolveZoneUnderCursor(clientX, clientY) {
        const idx = this._zoneHoverIndex;
        const viewer = this.viewer;
        if (!idx || !viewer) return;
        const canvas = viewer.impl?.canvas || viewer.canvas;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();

        let zone = null;
        try {
            const hit = viewer.impl.hitTest(clientX - rect.left, clientY - rect.top, true);
            if (hit && hit.dbId != null && hit.model) {
                // dbId (viewer) → externalId (postgres) vía rosetta inversa
                const raw = hit.model.getData()?.urn;
                const safe = String(raw || '').replace(/^urn:/i, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                const R = window.rosettaToExtId || {};
                const dict = R[raw] || R[safe] || Object.entries(R).find(([k]) =>
                    String(k).replace(/^urn:/i, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === safe)?.[1];
                const extId = dict && dict[hit.dbId];
                if (extId) {
                    const nu = (u) => String(u || '').replace(/^urn:/i, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
                    zone = idx.extToZone.get(nu(raw) + '|' + extId)
                        || idx.extToZone.get(safe + '|' + extId)
                        || null;
                }
            }
        } catch { /* hitTest puede fallar en bordes: se trata como "sin zona" */ }

        if (zone === this._zoneHoverCurrent) return; // mismo grupo → no recalcular ni parpadear
        this._zoneHoverCurrent = zone;

        if (!zone) {
            this.clearZoneHoverHighlight();
            window.dispatchEvent(new CustomEvent('lob-zone-hover-data', { detail: null }));
            return;
        }

        const g = idx.groups.get(zone);
        if (!g) return;

        this.highlightZoneGroup(zone);
        window.dispatchEvent(new CustomEvent('lob-zone-hover-data', {
            detail: {
                zone: g.zone,
                total: g.total, done: g.done,
                pct: g.total ? Math.round((g.done / g.total) * 100) : 0,
                hasEjecutado: !!idx.kEjec,
                // trazabilidad: con qué parámetros se calculó lo que se ve
                groupField: idx.zoneKey, execField: idx.kEjec,
            }
        }));
    }

    // Cambiar el color del resaltado en caliente (para calibrar sin recompilar):
    //   NOP_VIEWER.getExtension('LOB4DExtension').setZoneHoverColor('#00d9ff')
    setZoneHoverColor(hex) {
        window.__zoneHoverColor = hex;
        const zone = this._zoneHoverCurrent;
        if (zone) { this.clearZoneHoverHighlight(); this.highlightZoneGroup(zone); }
        console.log(`[LOB4D] Color de resaltado = ${hex}`);
    }

    // Tinte suave del grupo completo: se ve HASTA DÓNDE llega la SubZona.
    // O(tamaño del grupo) gracias a membersByZone pre-resuelto (antes era
    // O(elementos × modelos) EN CADA hover → no escalaba).
    highlightZoneGroup(zone) {
        const idx = this._zoneHoverIndex;
        if (!idx) return;
        this.clearZoneHoverHighlight();

        const members = idx.membersByZone?.get(zone);
        if (!members?.length) return;

        // Techo de seguridad: pintar decenas de miles de elementos congelaría
        // el frame. Sobre el tope, el panel sigue informando pero sin tinte.
        const CAP = window.__zoneHoverHighlightCap ?? 6000;
        if (members.length > CAP) {
            console.warn(`[LOB4D] Hover: grupo "${zone}" con ${members.length} elementos supera el tope de resaltado (${CAP}); solo panel.`);
            return;
        }

        const THREE = window.THREE;
        // ÁMBAR/DORADO: hay que esquivar TODO lo que ya existe en escena —
        // azul (selección del visor), verde/naranja (estados del heatmap),
        // rojo (excavación), teal (SubZonas) y MORADO (color nativo de las
        // tuberías del modelo). Cambiable en vivo: ext.setZoneHoverColor('#00d9ff').
        const hex = window.__zoneHoverColor || '#fbbf24';
        const n = parseInt(String(hex).replace('#', ''), 16);
        const color = new THREE.Vector4(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 0.55);
        for (const { model, dbId } of members) {
            this.viewer.setThemingColor(dbId, color, model, true);
        }
        this._zoneHoverTinted = members;
        this.viewer.impl.invalidate(false, false, true);
    }

    clearZoneHoverHighlight() {
        if (!this._zoneHoverTinted?.length) return;
        for (const { dbId, model } of this._zoneHoverTinted) {
            try { this.viewer.setThemingColor(dbId, null, model, true); } catch { /* noop */ }
        }
        this._zoneHoverTinted = [];
        try { this.viewer.impl.invalidate(false, false, true); } catch { /* noop */ }
    }

    // ── HEATMAP DE AVANCE POR PK ────────────────────────────────────────────
    // Pinta tramos [from,to] de cada alineamiento con el color de su estado,
    // como tubos overlay SOBRE el eje (siempre visibles). La matemática de la
    // geometría viene del JSON de extracción (pointAtStation) — regla de casa.
    static PK_HEAT_COLORS = {
        ejecutado: 0x10b981,     // verde
        en_ejecucion: 0xf97316,  // naranja
    };

    clearPkHeatmap() {
        if (this._heatmapMeshes?.length) {
            for (const obj of this._heatmapMeshes) {
                try { this.viewer.impl.removeOverlay(this.overlayName, obj); } catch { /* noop */ }
                try {
                    obj.traverse?.((child) => { child.geometry?.dispose?.(); });
                    obj.geometry?.dispose?.();
                    (obj.children?.[0]?.material || obj.material)?.dispose?.();
                } catch { /* noop */ }
            }
            try { this.viewer.impl.invalidate(false, false, true); } catch { /* noop */ }
        }
        this._heatmapMeshes = [];
        if (this._heatmapRetryTimer) { clearTimeout(this._heatmapRetryTimer); this._heatmapRetryTimer = null; }
    }

    // Localiza la data de un alineamiento por id: primero los activos (baked),
    // luego el catálogo global de extracciones compartido por App/Civil.
    findAlignmentData(alignmentId) {
        const match = (a) => a && ((a.alignmentId || a.name) === alignmentId);
        const active = (this.activeAlignments || []).find(match);
        if (active) return active;
        const globals = Array.isArray(window.__lobCivilAlignments) ? window.__lobCivilAlignments : [];
        return globals.find(match) || null;
    }

    applyPkHeatmap(config, attempt = 0) {
        this.clearPkHeatmap();
        this._pkHeatmapConfig = config;
        if (!config || config.on === false || !config.ranges) return;

        const THREE = window.THREE;
        const model = this.getModelForCoordinates();
        if (!THREE || !model) {
            // La vista puede restaurarse ANTES de que carguen los modelos:
            // reintentar hasta ~36s (igual que el auto-dibujo del eje base).
            if (attempt < 40) {
                this._heatmapRetryTimer = setTimeout(() => this.applyPkHeatmap(config, attempt + 1), 900);
            }
            return;
        }

        this.ensureOverlay();
        // HEAT MAP = FRANJA (cinta) de ancho real en METROS siguiendo el camino
        // del eje — no un tubo. Se construye como triangle-strip: en cada muestra
        // del eje se desplaza ±ancho/2 en la perpendicular HORIZONTAL.
        const widthMeters = Number(config.width) > 0 ? Number(config.width) : 5;
        let painted = 0;

        for (const [alignmentId, ranges] of Object.entries(config.ranges)) {
            if (!Array.isArray(ranges) || !ranges.length) continue;
            const data = this.findAlignmentData(alignmentId);
            if (!data) { console.warn(`[LOB4D] Heatmap: alineamiento "${alignmentId}" sin extracción cargada.`); continue; }

            // Muestras {point, station} con la conversión civil→viewer PROBADA
            const samples = this.buildAlignmentSamples(data, model);
            if (!samples || samples.length < 2) {
                console.warn(`[LOB4D] Heatmap: "${alignmentId}" sin geometría muestreable.`);
                continue;
            }

            // Escala unidades-viewer por metro, derivada del PROPIO eje
            // (distancia entre muestras / delta de estación): así "5 m" son 5 m
            // reales sin importar la escala del modelo.
            let upm = 1;
            for (let i = 1; i < samples.length; i++) {
                const dSt = Math.abs(Number(samples[i].station) - Number(samples[0].station));
                if (dSt > 0.5) { upm = samples[i].point.distanceTo(samples[0].point) / dSt; break; }
            }
            const halfW = Math.max(0.01, (widthMeters / 2) * upm);

            for (const r of ranges) {
                const s0 = Math.min(Number(r.from), Number(r.to));
                const s1 = Math.max(Number(r.from), Number(r.to));
                if (!Number.isFinite(s0) || !Number.isFinite(s1) || s1 - s0 < 0.05) continue;

                let pts = samples
                    .filter(s => Number(s.station) >= s0 - 1e-6 && Number(s.station) <= s1 + 1e-6)
                    .map(s => s.point);
                if (pts.length < 2) {
                    console.warn(`[LOB4D] Heatmap: tramo ${s0}-${s1} de "${alignmentId}" sin puntos (¿fuera del rango del eje?).`);
                    continue;
                }
                // Límite del strip (índices Uint16): más que suficiente resolución
                if (pts.length > 4000) {
                    const dec = Math.ceil(pts.length / 4000);
                    pts = pts.filter((_, i) => i % dec === 0 || i === pts.length - 1);
                }

                // Vértices izquierda/derecha con perpendicular horizontal suavizada
                const n = pts.length;
                const positions = new Float32Array(n * 2 * 3);
                const tmpPrev = new THREE.Vector3();
                const tmpNext = new THREE.Vector3();
                const dir = new THREE.Vector3();
                for (let i = 0; i < n; i++) {
                    if (i > 0) tmpPrev.subVectors(pts[i], pts[i - 1]); else tmpPrev.set(0, 0, 0);
                    if (i < n - 1) tmpNext.subVectors(pts[i + 1], pts[i]); else tmpNext.set(0, 0, 0);
                    dir.addVectors(tmpPrev, tmpNext);
                    dir.z = 0; // franja HORIZONTAL (planta), como un mapa de calor
                    if (dir.lengthSq() < 1e-12) dir.set(1, 0, 0);
                    dir.normalize();
                    const px = -dir.y * halfW;
                    const py = dir.x * halfW;
                    const base = i * 6;
                    positions[base + 0] = pts[i].x + px;
                    positions[base + 1] = pts[i].y + py;
                    positions[base + 2] = pts[i].z;
                    positions[base + 3] = pts[i].x - px;
                    positions[base + 4] = pts[i].y - py;
                    positions[base + 5] = pts[i].z;
                }
                const indices = new Uint16Array((n - 1) * 6);
                for (let i = 0, k = 0; i < n - 1; i++) {
                    const a = i * 2; const b = a + 1; const c = a + 2; const d = a + 3;
                    indices[k++] = a; indices[k++] = b; indices[k++] = c;
                    indices[k++] = b; indices[k++] = d; indices[k++] = c;
                }

                const geom = new THREE.BufferGeometry();
                const posAttr = new THREE.BufferAttribute(positions, 3);
                const idxAttr = new THREE.BufferAttribute(indices, 1);
                if (geom.setAttribute) geom.setAttribute('position', posAttr); else geom.addAttribute('position', posAttr);
                if (geom.setIndex) geom.setIndex(idxAttr); else geom.addAttribute('index', idxAttr);

                const colorHex = LOB4DExtension.PK_HEAT_COLORS[r.state] ?? 0x9ca3af;
                const mat = new THREE.MeshBasicMaterial({
                    color: colorHex,
                    transparent: true,
                    opacity: 0.5,       // translúcido: se ve el terreno debajo (look heat map)
                    depthTest: false,   // legible aunque el terreno lo tape
                    depthWrite: false,
                    side: THREE.DoubleSide,
                });
                const mesh = new THREE.Mesh(geom, mat);
                mesh.frustumCulled = false;
                mesh.renderOrder = 9995; // bajo el eje/etiquetas, sobre el modelo
                this.viewer.impl.addOverlay(this.overlayName, mesh);
                this._heatmapMeshes.push(mesh);
                painted += 1;
            }
        }

        this.viewer.impl.invalidate(false, false, true);
        console.log(`[LOB4D] Heatmap PK: ${painted} franja(s) de ${widthMeters}m pintada(s).`);
    }

    // Click en un rótulo de grupo → RESALTAR ese grupo:
    //   · el grupo elegido se tiñe de color,
    //   · TODO lo demás pasa a gris apagado (no se oculta ni se pone fantasma).
    // Es más legible que aislar: el resto sigue en su sitio, de referencia, pero
    // en gris para que el grupo activo salte. Todo por setThemingColor, que es
    // gratis (tiñe el dibujo que ya existe), así que aguanta a cualquier escala.
    // Volver a pulsar el mismo grupo lo suelta.
    handleZoneClick(zone) {
        if (this._activeZone === zone) { this.clearZoneIsolation(); return; }
        const info = this._zoneMembers?.get(zone);
        if (!info) return;
        this._activeZone = zone;
        this._limpiarTenido();   // quita cualquier resaltado anterior

        const THREE = window.THREE;
        const models = this.viewer.impl?.modelQueue?.().getModels?.() || [this.viewer.model].filter(Boolean);
        // EL RESTO: gris neutro frío CON MEZCLA (alfa 0.62). La cuarta componente
        // mezcla el gris con el color ya sombreado de cada pieza -no la vuelve
        // translúcida-, así que el claroscuro y las aristas sobreviven: se ve la
        // forma, apagada. Un neutro ligeramente frío (más azul que verde) lee más
        // "técnico" que un gris cálido; es un matiz, pero es de los que hacen que
        // una interfaz parezca de ingeniería y no de maqueta.
        const gris = new THREE.Vector4(0.60, 0.62, 0.66, 0.62);

        // EL ELEGIDO: teal de la marca, pero TAMBIÉN mezclado (alfa 0.72), no
        // plano. Un relleno opaco aplastaba la pieza a una mancha de color y le
        // quitaba el volumen; con la mezcla el elemento conserva su sombreado y
        // sus caras, y encima el color. Se resalta la PIEZA, no una silueta. El
        // tono es el de la píldora (#2d8fa5) para que etiqueta y modelo se lean
        // como una sola cosa.
        const activo = new THREE.Vector4(0.18, 0.56, 0.65, 0.72);

        // Coste CERO por escala: no se recorre nada elemento a elemento. Se tiñe
        // el MODELO ENTERO de gris con una sola llamada recursiva (desde la raíz)
        // y encima se tiñe el grupo de teal, también recursivo. setThemingColor
        // no añade geometría: cambia el color del dibujo que ya existe, así que da
        // igual que la obra tenga 14.000 elementos o 200.000.
        this._modelosTenidos = models.slice();
        for (const m of models) {
            const tree = m.getInstanceTree?.();
            const root = tree && (tree.getRootId ? tree.getRootId() : tree.nodeAccess?.rootId);
            try {
                if (root !== undefined && root !== null) {
                    this.viewer.setThemingColor(root, gris, m, true);   // todo gris
                }
            } catch { /* noop */ }
            const ids = info.byModel.get(m) || [];
            for (const dbId of ids) {
                try { this.viewer.setThemingColor(dbId, activo, m, true); } catch { /* noop */ }
            }
        }

        // Encuadre SUAVE al grupo: la cámara se desliza hasta encuadrarlo en vez
        // del salto seco de fitBounds. Conserva el ÁNGULO actual (solo se acerca y
        // centra), que es lo que hace que no maree: girar la vista de golpe
        // desorienta; acercarse en la misma dirección, no.
        try { this._encuadrarSuave(info.bbox); } catch { /* noop */ }
        this.viewer.impl.invalidate(true, true, true);
        this.refreshZoneLabelStyles();
    }

    _encuadrarSuave(bbox) {
        const THREE = window.THREE;
        const nav = this.viewer?.navigation;
        if (!THREE || !nav || !bbox || bbox.isEmpty()) return;

        const centro = bbox.getCenter(new THREE.Vector3());
        const radio = 0.5 * bbox.getSize(new THREE.Vector3()).length();
        const posIni = nav.getPosition().clone();
        const objIni = nav.getTarget().clone();
        let dir = posIni.clone().sub(objIni);
        if (dir.length() < 1e-6) dir.set(0.3, -1, 0.6);
        dir.normalize();

        const fov = ((nav.getVerticalFov && nav.getVerticalFov()) || 45) * Math.PI / 180;
        const dist = radio / Math.sin(Math.min(Math.max(fov / 2, 0.1), 1.4)) * 1.15;
        const objFin = centro.clone();
        const posFin = centro.clone().add(dir.multiplyScalar(dist));

        // Cancelar cualquier animación anterior antes de arrancar otra.
        this._animEncuadre = (this._animEncuadre || 0) + 1;
        const miId = this._animEncuadre;
        const t0 = window.performance.now();
        const dur = 650;
        const suave = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

        const paso = () => {
            if (miId !== this._animEncuadre) return;   // otra animación tomó el relevo
            const t = Math.min(1, (window.performance.now() - t0) / dur);
            const e = suave(t);
            const p = posIni.clone().lerp(posFin, e);
            const g = objIni.clone().lerp(objFin, e);
            try { nav.setView(p, g); } catch { /* noop */ }
            this.viewer.impl.invalidate(true, true, false);
            if (t < 1) requestAnimationFrame(paso);
        };
        requestAnimationFrame(paso);
    }

    // Quita TODO el teñido (gris del resto + teal del grupo) de una vez por modelo.
    _limpiarTenido() {
        const models = this._modelosTenidos
            || this.viewer.impl?.modelQueue?.().getModels?.() || [this.viewer.model].filter(Boolean);
        for (const m of models) {
            try { this.viewer.clearThemingColors(m); } catch { /* noop */ }
        }
        this._modelosTenidos = null;
    }

    clearZoneIsolation() {
        this._activeZone = null;
        this._limpiarTenido();
        this.viewer.impl.invalidate(true, true, true);
        this.refreshZoneLabelStyles();
    }

    refreshZoneLabelStyles() {
        if (!this._zoneLabelElements) return;
        for (const l of this._zoneLabelElements) {
            l.el.style.cssText = this.zoneLabelStyle(this._activeZone === l.zone);
        }
        this.updateZoneLabels(); // re-posicionar (cssText borra left/top)
    }

    // ── Rayado estilo Tandem para el grupo AISLADO ──────────────────────────
    // El efecto de la captura de Tandem: rayas diagonales amarillas sobre las
    // caras visibles del grupo. No es un material nuevo sobre el modelo (eso es
    // lo que en su día descartamos por caro): son MALLAS ESPEJO en una escena
    // overlay que REUTILIZAN la geometría ya cargada de cada fragmento
    // (getRenderProxy no copia nada) con un shader de rayas en espacio de
    // pantalla. Coste real: un draw call por fragmento del grupo y cero
    // geometría nueva. Por eso es viable para EL GRUPO ACTIVO y seguiría sin
    // serlo para el modelo entero.

    ensureHatchMaterial() {
        if (this._hatchMaterial) return this._hatchMaterial;
        const THREE = window.THREE;
        this._hatchMaterial = new THREE.ShaderMaterial({
            uniforms: {
                // El teal del grupo activo, el mismo de la píldora y la línea guía.
                //
                // CON TIPO ('c' = color, 'f' = float), obligatorio: el three.js del
                // visor de Autodesk es un r71 y, sin el tipo, NO SUBE el uniforme a
                // la GPU — solo escupe "Unknown uniform type: undefined" en cada
                // frame. El color quedaba en negro y el paso en 0 (→ NaN en el
                // mod), así que "las rayas teal" se pintaron siempre NEGRAS y al
                // final todo salía como una cobertura oscura. Tres iteraciones de
                // ajustar colores y densidades eran esto.
                // El amarillo de Tandem, pedido por el usuario viendo el grano fino
                // (el teal de la píldora se probó primero y prefirió este).
                uRaya: { type: 'c', value: new THREE.Color(0xdfd83a) },
                uPaso: { type: 'f', value: 0.5 },   // separación entre rayas, en unidades del modelo
            },
            // Las rayas van pintadas SOBRE LA SUPERFICIE, en coordenadas de mundo,
            // no en pantalla. La primera versión usaba gl_FragCoord: la trama se
            // quedaba quieta en el monitor y el modelo giraba por debajo, así que
            // las líneas "nadaban" sobre las caras y mareaban al orbitar. Un rayado
            // de plano gira CON la pieza; eso exige calcularlo del punto 3D real.
            vertexShader: [
                'varying vec3 vW;',
                'void main(){',
                '  vec4 w = modelMatrix * vec4(position, 1.0);',
                '  vW = w.xyz;',
                '  gl_Position = projectionMatrix * viewMatrix * w;',
                '}',
            ].join('\n'),
            // OJO: nada de poner '#extension' aquí dentro. Esa directiva tiene que
            // ser lo PRIMERO del programa, y el visor antepone su propia cabecera
            // (precision, uniforms) al fragmento: quedaba en medio, el shader no
            // compilaba, y un shader roto no dibuja nada — las rayas desaparecieron
            // por completo. La directiva la inyecta el material (derivatives=true)
            // en el sitio correcto; en WebGL2, fwidth ya es del núcleo.
            fragmentShader: [
                'uniform vec3 uRaya;',
                'uniform float uPaso;',
                'varying vec3 vW;',
                'void main(){',
                // OPACO, no transparente. Antes esto era transparente y a doble
                // cara: la GPU mezclaba cada píxel -incluidas las caras traseras y
                // las tapadas- sobre 2,7 M de triángulos en cada frame, sin descarte
                // por profundidad. Con el canal entero llenando la pantalla se
                // sentía "muy pesado". Opaco = una escritura, descarte temprano de
                // lo oculto, cero mezcla: es como Tandem lo hace ligero. A cambio,
                // el cuerpo se repinta con un tono claro uniforme (el look Tandem),
                // no queda el gris original.
                //
                // Sombra suave desde la normal de cara (derivadas del punto de
                // mundo): da volumen sin necesitar el atributo normal del modelo.
                '  vec3 N = normalize(cross(dFdx(vW), dFdy(vW)));',
                '  float dif = 0.55 + 0.45 * abs(dot(N, normalize(vec3(0.35,0.45,0.82))));',
                '  vec3 base = vec3(0.88, 0.89, 0.85) * dif;',   // claro neutro, apenas cálido
                // Rayas: planos paralelos con normal (1,1,1), pintadas SOBRE la
                // superficie (giran con la pieza). El paso se mide contra el píxel
                // (fwidth) y se duplica si baja de ~5 px, así la trama es igual de
                // fina de cerca que de lejos y nunca se funde en una mancha.
                '  float s = (vW.x + vW.y + vW.z) * 0.57735;',
                '  float w = fwidth(s);',
                '  float paso = max(uPaso, 1e-4);',
                '  float minPer = 5.0 * max(w, 1e-6);',
                '  if (paso < minPer) { paso *= exp2(ceil(log2(minPer / paso))); }',
                '  float d = mod(s, paso);',
                '  float grosor = paso * 0.35;',
                '  float line = 1.0 - smoothstep(grosor - w, grosor + w, d);',
                '  gl_FragColor = vec4(mix(base, uRaya, line), 1.0);',
                '}',
            ].join('\n'),
            // Opaco: descarte por profundidad, sin mezcla. La malla se dibuja
            // ligeramente hacia la cámara para tapar el gris original del grupo
            // (que sigue aislado debajo) sin pelearse a z con él.
            transparent: false,
            depthTest: true,
            depthWrite: true,
            polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
            side: THREE.DoubleSide,
        });
        // fwidth() necesita las derivadas estándar. El three.js que trae el visor
        // de Autodesk es antiguo y usa la bandera vieja (material.derivatives);
        // las versiones modernas usan extensions.derivatives. Se ponen las dos:
        // la que sobre se ignora, y en WebGL2 la propia directiva del shader es
        // solo un aviso porque fwidth ya es parte del núcleo.
        this._hatchMaterial.derivatives = true;
        this._hatchMaterial.extensions = { derivatives: true };
        return this._hatchMaterial;
    }

    // Triángulos de un grupo, YA en coordenadas de mundo, en un solo Float32Array
    // (no indexado). Es la pieza que hace que el rayado no dependa del número de
    // elementos: se leen las posiciones de cada fragmento de la geometría ya
    // cargada (getRenderProxy, sin copiar el modelo), se transforman por su matriz
    // y se vuelcan en un único buffer. Con eso el grupo entero se pinta con UN
    // draw call, tenga 500 fragmentos o 30.000 — que es como ACC/Tandem aguantan
    // sin sufrir: no duplican una malla por pieza.
    _trianglesDelGrupo(info, maxVerts) {
        const THREE = window.THREE;
        const impl = this.viewer?.impl;
        const partes = [];
        let total = 0;
        const p = new THREE.Vector3();

        const leerFragmento = (proxy) => {
            const g = proxy.geometry;
            const m = proxy.matrixWorld;
            if (!g) return null;
            // Índices del triángulo (LMV suele traer ib; si no, secuencial).
            const idx = g.ib
                || (g.index && g.index.array)
                || (g.attributes && g.attributes.index && g.attributes.index.array)
                || null;
            // Posiciones: geometría LMV interleaved (vb + vbstride) o atributo llano.
            let leer;
            if (g.vb && g.vbstride) {
                const off = (g.attributes && g.attributes.position
                    && (g.attributes.position.itemOffset || 0)) || 0;
                const s = g.vbstride, vb = g.vb;
                leer = (i) => p.set(vb[i * s + off], vb[i * s + off + 1], vb[i * s + off + 2]);
            } else if (g.attributes && g.attributes.position && g.attributes.position.array) {
                const arr = g.attributes.position.array;
                leer = (i) => p.set(arr[i * 3], arr[i * 3 + 1], arr[i * 3 + 2]);
            } else {
                return null;
            }
            const n = idx ? idx.length : ((g.vb && g.vbstride) ? g.vb.length / g.vbstride
                : (g.attributes.position.array.length / 3));
            const out = new Float32Array(n * 3);
            for (let k = 0; k < n; k++) {
                leer(idx ? idx[k] : k);
                p.applyMatrix4(m);
                out[k * 3] = p.x; out[k * 3 + 1] = p.y; out[k * 3 + 2] = p.z;
            }
            return { out, n };
        };

        info.byModel.forEach((ids, model) => {
            const tree = model.getInstanceTree?.();
            if (!tree || total > maxVerts) return;
            for (const dbId of ids) {
                if (total > maxVerts) break;
                tree.enumNodeFragments(dbId, (fragId) => {
                    if (total > maxVerts) return;
                    const proxy = impl.getRenderProxy(model, fragId);
                    if (!proxy) return;
                    const r = leerFragmento(proxy);
                    if (!r || !r.n) return;
                    partes.push(r.out);
                    total += r.n;
                }, true);
            }
        });

        if (!total) return null;
        if (total > maxVerts) return { over: true, total };
        const merged = new Float32Array(total * 3);
        let o = 0;
        for (const a of partes) { merged.set(a, o); o += a.length; }
        return { array: merged, count: total };
    }

    applyZoneHatch(zone) {
        const THREE = window.THREE;
        const impl = this.viewer?.impl;
        const info = this._zoneMembers?.get(zone);
        if (!THREE || !impl || !info) return;
        this.clearZoneHatch();

        if (!this._hatchOverlayReady) {
            impl.createOverlayScene('lob-zone-hatch');
            this._hatchOverlayReady = true;
        }
        const mat = this.ensureHatchMaterial();

        // El paso base es MINÚSCULO a propósito, y quien manda es el ajuste por
        // píxel del shader: el paso se duplica hasta medir al menos ~7 px, así
        // que partiendo de una base pequeña la trama queda siempre entre 7 y
        // 14 px en pantalla — hilos finos y densos como los de Tandem, a
        // cualquier zoom, y pegados a la superficie.
        const tam = info.bbox && !info.bbox.isEmpty()
            ? info.bbox.getSize(new THREE.Vector3()).length() : 0;
        mat.uniforms.uPaso.value = Math.max(tam / 2000, 0.005);

        // CAMINO RÁPIDO: fundir el grupo en UNA malla (1 draw call). Solo es
        // posible si la geometría sigue en memoria de CPU; LMV, para ahorrar RAM,
        // sube muchos modelos a la GPU y libera esa copia — y entonces no hay
        // vértices que leer. Por eso NO se puede confiar en este camino: se
        // intenta, y si no hay datos se cae al camino que sí pinta.
        // ADAPTABLE, por tamaño del grupo:
        //   · grupo manejable  → RAYADO fundido en una malla (bonito y fluido).
        //   · grupo gigante    → TEÑIDO plano con setThemingColor (gratis: no
        //                         añade geometría, tiñe el dibujo que ya existe,
        //                         que es como ACC/Tandem aguantan a cualquier
        //                         escala). Pierde la trama, pero orbita instantáneo.
        //
        // El corte va en vértices: el rayado cuesta rasterizar la malla entera cada
        // frame, y por encima de ~2,5 M eso se sentía "muy pesado" (el canal son
        // 8 M). Por debajo, va suelto.
        const HATCH_MAX_VERTS = 2500000;
        const tris = this._trianglesDelGrupo(info, HATCH_MAX_VERTS);

        if (tris && !tris.over && tris.count) {
            const geom = new THREE.BufferGeometry();
            geom.addAttribute('position', new THREE.BufferAttribute(tris.array, 3));
            const mesh = new THREE.Mesh(geom, mat);
            mesh.frustumCulled = false;
            impl.addOverlay('lob-zone-hatch', mesh);
            this._hatchMeshes = [mesh];
            this._hatchGeom = geom;
            impl.invalidate(false, false, true);
            console.log(`[LOB4D] Rayado FUNDIDO: ${tris.count} vértices en 1 malla.`);
            return;
        }

        // Grupo demasiado grande para rayar: teñido plano, coste cero.
        const tinte = new THREE.Vector4(0.26, 0.70, 0.80, 1.0);   // teal de la píldora
        this._hatchTintados = [];
        info.byModel.forEach((ids, model) => {
            for (const dbId of ids) {
                try {
                    this.viewer.setThemingColor(dbId, tinte, model, true);
                    this._hatchTintados.push({ dbId, model });
                } catch { /* noop */ }
            }
        });
        impl.invalidate(false, false, true);
        console.log(`[LOB4D] Grupo grande (${tris?.total || '?'} v): teñido plano (sin trama, fluido).`);
    }

    clearZoneHatch() {
        const impl = this.viewer?.impl;
        if (this._hatchMeshes?.length && impl) {
            try { impl.clearOverlay('lob-zone-hatch'); } catch { /* noop */ }
        }
        this._hatchMeshes = [];
        if (this._hatchGeom) {
            try { this._hatchGeom.dispose(); } catch { /* noop */ }
            this._hatchGeom = null;
        }
        // Quitar el teñido plano de los grupos grandes (la otra rama del adaptable).
        if (this._hatchTintados?.length) {
            for (const { dbId, model } of this._hatchTintados) {
                try { this.viewer.setThemingColor(dbId, null, model); } catch { /* noop */ }
            }
            this._hatchTintados = [];
        }
        impl?.invalidate(false, false, true);
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
        let min = Infinity;
        let max = -Infinity;

        // 1. Obtener min/max de la geometría horizontal
        const subEntities = alignmentData?.subEntities || [];
        for (const segment of subEntities) {
            if (Number.isFinite(Number(segment.startStation))) min = Math.min(min, Number(segment.startStation));
            if (Number.isFinite(Number(segment.endStation))) max = Math.max(max, Number(segment.endStation));
        }

        // 2. Extender con el rango del perfil vertical (si existe)
        const points = this.getActiveProfilePoints(alignmentData);
        if (points.length >= 2) {
            min = Math.min(min, points[0].station);
            max = Math.max(max, points[points.length - 1].station);
        }

        if (min === Infinity || max === -Infinity) {
            return [];
        }

        const add = (value, label, priority) => {
            if (value == null || Number.isNaN(Number(value))) return;
            // Tolerancia de 1mm para evitar problemas de flotantes
            if (value < min - 1e-3 || value > max + 1e-3) return;
            // Usamos round a 2 decimales EXACTOS para evitar llaves duplicadas
            const key = Math.round(value * 100).toString();
            if (!map.has(key) || map.get(key).priority < priority) {
                map.set(key, { station: value, label, priority });
            }
        };

        // Extremos (prioridad máxima)
        add(min, `Inicio ${this.formatStation(min)}`, 4);
        add(max, `Fin ${this.formatStation(max)}`, 4);

        // Geometría horizontal (prioridad alta)
        for (const segment of subEntities) {
            add(segment.startStation, this.getSegmentStationLabel(segment, segment.startStation), 3);
            add(segment.endStation, this.getSegmentStationLabel(segment, segment.endStation), 3);
        }

        // Intervalos regulares (prioridad normal)
        const length = max - min;
        const interval = alignmentData?.stationIncrement || this.chooseStationInterval(length);
        const firstRounded = Math.ceil(min / interval) * interval;
        for (let station = firstRounded; station <= max + 1e-3; station += interval) {
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
            this.createStationDomLabel({ ...item, alignment: alignmentData }, labelPos);
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

    // Aplica planos de corte de forma compatible: LMV moderno usa cut-plane SETS
    // (nuestro set propio no pisa el de la herramienta de sección del toolbar);
    // fallback al API clásico viewer.setCutPlanes.
    _applyCutPlanes(planes) {
        return this._applyCutPlaneSet('LOB4D_SECTION', planes);
    }

    _applyCutPlaneSet(name, planes) {
        const impl = this.viewer?.impl;
        try {
            if (impl && typeof impl.setCutPlaneSet === 'function') {
                impl.setCutPlaneSet(name, planes && planes.length ? planes : undefined);
                impl.invalidate(true, true, true);
                return true;
            }
        } catch (e) { console.warn('[LOB4D] setCutPlaneSet falló:', e); }
        try {
            this.viewer.setCutPlanes(planes || []);
            return true;
        } catch (e) {
            console.error('[LOB4D] setCutPlanes falló:', e);
            return false;
        }
    }

    // Corte REAL en el modelo: plano vertical perpendicular al eje en la
    // progresiva pk (como InfraWorks). La tangente se toma del propio JSON.
    setSectionCutPlane(alignmentData, pk) {
        const THREE = window.THREE;
        if (!THREE || !this.viewer || !alignmentData) return false;
        const model = this.getModelForCoordinates();
        const p1 = this.civilToViewerPoint(this.pointAtStation(alignmentData, pk), model);
        const step = 1.0;
        // Tangente robusta: hacia adelante; en el EXTREMO del eje (pk+1 cae
        // fuera o coincide) se toma hacia atrás y se invierte — antes el corte
        // fallaba silenciosamente en la última progresiva.
        let p2 = this.civilToViewerPoint(this.pointAtStation(alignmentData, pk + step), model);
        let invert = false;
        if (!p1) {
            console.warn('[LOB4D] corte: progresiva fuera del eje extraído', pk);
            return false;
        }
        if (!p2 || p2.distanceToSquared(p1) < 1e-9) {
            p2 = this.civilToViewerPoint(this.pointAtStation(alignmentData, pk - step), model);
            invert = true;
        }
        if (!p2) {
            console.warn('[LOB4D] corte: sin tangente en PK', pk);
            return false;
        }

        // El 4D de excavaciones deja modelos EXENTOS de corte (setDoNotCut);
        // si esa exención sobrevive, este plano no corta NADA. Un corte manual
        // del usuario siempre manda: se limpia la exención antes de aplicar.
        (this.viewer.getAllModels?.() || []).forEach((m) => {
            try { m.setDoNotCut?.(false); } catch (e) { /* LMV viejo */ }
        });

        const normal = new THREE.Vector3().subVectors(p2, p1);
        if (invert) normal.negate();
        normal.z = 0; // corte vertical (perpendicular al eje en planta)
        if (normal.lengthSq() < 1e-9) return false;
        normal.normalize();
        const d = -normal.dot(p1);
        const ok = this._applyCutPlanes([new THREE.Vector4(normal.x, normal.y, normal.z, d)]);
        this.sectionCutActive = ok;
        console.log(`[LOB4D] corte 3D @PK ${pk}:`, ok ? 'aplicado' : 'FALLÓ', { normal, d });
        return ok;
    }

    clearSectionCutPlane() {
        if (!this.viewer) return;
        this._applyCutPlanes(null);
        this.sectionCutActive = false;
    }

    // ── Simulación 4D de EXCAVACIONES/RELLENOS ──────────────────────────────
    // Los sólidos de movimiento de tierras (marcados con ⛏ en el picker del 4D)
    // se recortan con un plano perpendicular al eje en la progresiva que dicta
    // el cronograma: al avanzar la fecha, el corte avanza y el sólido "crece"
    // siguiendo la línea de balance. El resto de modelos queda exento del corte
    // vía setDoNotCut (terreno/estructuras se ven completos siempre).

    normalizeUrnKey(urn) {
        return String(urn || '').replace(/^urn:/i, '');
    }

    getExcavationModels(excavationUrns) {
        const wanted = new Set((excavationUrns || []).map((urn) => this.normalizeUrnKey(urn)).filter(Boolean));
        if (!wanted.size) return [];
        const models = this.viewer.getAllModels?.() || [];
        return models.filter((model) => wanted.has(this.normalizeUrnKey(model.getData?.()?.urn)));
    }

    // % de avance del frente de movimiento de tierras a la fecha simulada:
    // promedio ponderado por costo (metrado×pu) del plannedPct de las partidas
    // de excavación/relleno/corte. Sin partidas de tierras → avance global.
    computeEarthworksPct(taskRows, fallbackPct) {
        const earthRe = /excav|relleno|corte\b|mov(?:imiento)?[\s._-]*de[\s._-]*tierra|earthwork/i;
        let weightSum = 0;
        let acc = 0;
        (taskRows || []).forEach((row) => {
            if (!earthRe.test(String(row.descripcion || ''))) return;
            const pct = Number(row.simulationPct ?? row.realPct ?? row.percent ?? row.plannedPct ?? (row.status === 'done' ? 100 : 0));
            if (!Number.isFinite(pct)) return;
            const weight = (Number(row.metrado) || 0) * (Number(row.pu) || 0) || Number(row.metrado) || 1;
            weightSum += weight;
            acc += weight * pct;
        });
        if (weightSum > 0) return acc / weightSum;
        const fallback = Number(fallbackPct);
        return Number.isFinite(fallback) ? fallback : 0;
    }

    getAlignmentStationDomain(alignmentData) {
        let min = Number(alignmentData?.startStation);
        let max = Number(alignmentData?.endStation);
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
            min = Infinity;
            max = -Infinity;
            (alignmentData?.subEntities || []).forEach((segment) => {
                const s = Number(segment.startStation);
                const e = Number(segment.endStation);
                if (Number.isFinite(s)) { min = Math.min(min, s); max = Math.max(max, s); }
                if (Number.isFinite(e)) { min = Math.min(min, e); max = Math.max(max, e); }
            });
            const points = this.getActiveProfilePoints(alignmentData);
            if (points.length >= 2) {
                min = Math.min(min, points[0].station);
                max = Math.max(max, points[points.length - 1].station);
            }
        }
        return Number.isFinite(min) && Number.isFinite(max) && max > min ? { min, max } : null;
    }

    updateExcavationSimulation(payload = {}) {
        const THREE = window.THREE;
        const excavModels = this.getExcavationModels(payload.excavationUrns);
        if (!THREE || !excavModels.length) {
            this.clearExcavationCut();
            return;
        }
        if (!this.activeAlignment) {
            if (!this._excavNoAxisWarned) {
                console.warn('[LOB4D] Excavación 4D: no hay eje activo (selecciona un alineamiento en Civil).');
                this._excavNoAxisWarned = true;
            }
            this.clearExcavationCut();
            return;
        }

        const domain = this.getAlignmentStationDomain(this.activeAlignment);
        if (!domain) {
            this.clearExcavationCut();
            return;
        }

        const pct = this.computeEarthworksPct(payload.taskRows, payload.progress);
        if (pct >= 99.95) {
            // Frente terminado: el sólido se muestra completo, sin corte.
            this.clearExcavationCut();
            return;
        }

        const ratio = Math.max(0, Math.min(1, pct / 100));
        const station = domain.min + (domain.max - domain.min) * ratio;

        const refModel = this.getModelForCoordinates();
        const p1 = this.civilToViewerPoint(this.pointAtStation(this.activeAlignment, station), refModel);
        const pFwd = this.civilToViewerPoint(this.pointAtStation(this.activeAlignment, Math.min(domain.max, station + 1)), refModel);
        const pBack = this.civilToViewerPoint(this.pointAtStation(this.activeAlignment, Math.max(domain.min, station - 1)), refModel);
        if (!p1 || (!pFwd && !pBack)) return;

        const normal = new THREE.Vector3();
        if (pFwd && pBack) normal.subVectors(pFwd, pBack);
        else if (pFwd) normal.subVectors(pFwd, p1);
        else normal.subVectors(p1, pBack);
        normal.z = 0; // corte vertical, perpendicular al eje en planta
        if (normal.lengthSq() < 1e-9) return;
        normal.normalize();
        const d = -normal.dot(p1);

        // Solo los sólidos de tierras se cortan; el resto queda exento.
        const excavSet = new Set(excavModels);
        (this.viewer.getAllModels?.() || []).forEach((model) => {
            try { model.setDoNotCut?.(!excavSet.has(model)); } catch (e) { /* LMV viejo sin setDoNotCut */ }
        });

        this._applyCutPlaneSet('LOB4D_EXCAV', [new THREE.Vector4(normal.x, normal.y, normal.z, d)]);
        this.excavationCutActive = true;
        this.excavationFrontStation = station;
        window.dispatchEvent(new CustomEvent('LOB4D_EXCAV_FRONT_CHANGED', {
            detail: { station, pct, label: this.formatStation(station) }
        }));
    }

    clearExcavationCut() {
        if (!this.excavationCutActive) return;
        this._applyCutPlaneSet('LOB4D_EXCAV', null);
        (this.viewer.getAllModels?.() || []).forEach((model) => {
            try { model.setDoNotCut?.(false); } catch (e) { /* noop */ }
        });
        this.excavationCutActive = false;
        this.excavationFrontStation = null;
        window.dispatchEvent(new CustomEvent('LOB4D_EXCAV_FRONT_CHANGED', { detail: null }));
        this.viewer.impl.invalidate(true, true, true);
    }

    // ── MODO PRUEBA POR PARÁMETRO ───────────────────────────────────────────
    // Anima el 4D usando un parámetro custom del visor (p.ej. "Vaciado_Nro" con
    // valores FASE 01..FASE 07), independiente de P6. Escanea el parámetro,
    // descubre las fases ordenadas y colorea por fase relativo a un cursor:
    // fase < actual = ejecutado, = actual = en ejecución, > actual = programado.
    // Sirve para VER cómo anima el 4D con un dataset controlado.

    // Escanea el parámetro y arma el índice de fases. Los parámetros CUSTOM de la
    // app (Vaciado_Nro, Status…) viven en PostgreSQL (window.postgresInventory),
    // NO en el derivado APS — así que se leen del inventario y se mapean por
    // external_id → dbId del visor. Si no está ahí, cae a propiedades APS.
    async buildParamPhaseIndex(propName) {
        const target = this.normalize4DPropName(propName);
        const models = this.getThemingModels();
        if (!target || !models.length) { this.phaseIndex = null; return null; }

        // 1) Valores por external_id desde el inventario de la app.
        const inv = Array.isArray(window.postgresInventory) ? window.postgresInventory : [];
        const extIdToValue = new Map();
        let matchedKey = null;
        for (const row of inv) {
            if (!row) continue;
            if (!matchedKey) {
                matchedKey = Object.keys(row).find((k) => this.normalize4DPropName(k) === target) || null;
            }
            if (!matchedKey) continue;
            const value = String(row[matchedKey] ?? '').trim();
            const extId = String(row.dbId ?? row.external_id ?? '').trim();
            if (value && extId) extIdToValue.set(extId, value);
        }

        // Sin datos en inventario → intentar como propiedad APS (fallback).
        if (!extIdToValue.size) {
            return this.buildParamPhaseIndexFromProps(propName);
        }

        // 2) external_id → dbId del visor, por modelo.
        const byPhaseRaw = new Map(); // valorFase -> [{ dbId, model }]
        for (const model of models) {
            const mapping = await new Promise((res) => {
                try { model.getExternalIdMapping((m) => res(m || {}), () => res({})); }
                catch (e) { res({}); }
            });
            for (const [extId, value] of extIdToValue) {
                const dbId = mapping[extId];
                if (dbId == null) continue;
                if (!byPhaseRaw.has(value)) byPhaseRaw.set(value, []);
                byPhaseRaw.get(value).push({ dbId, model });
            }
        }

        return this._finalizePhaseIndex(propName, byPhaseRaw, 'inventario');
    }

    // Fallback: leer el parámetro como propiedad del derivado APS.
    buildParamPhaseIndexFromProps(propName) {
        return new Promise((resolve) => {
            const target = this.normalize4DPropName(propName);
            const models = this.getThemingModels();
            const byPhaseRaw = new Map();
            let pending = models.length;
            const finish = () => {
                pending -= 1;
                if (pending > 0) return;
                resolve(this._finalizePhaseIndex(propName, byPhaseRaw, 'APS'));
            };
            models.forEach((model) => {
                const tree = model?.getInstanceTree?.();
                if (!tree) return finish();
                const leafDbIds = [];
                tree.enumNodeChildren(tree.getRootId(), (dbId) => {
                    let hasFrag = false;
                    tree.enumNodeFragments(dbId, () => { hasFrag = true; });
                    if (hasFrag) leafDbIds.push(dbId);
                }, true);
                if (!leafDbIds.length) return finish();
                model.getBulkProperties(leafDbIds, undefined, (results) => {
                    for (const res of results) {
                        for (const prop of res.properties || []) {
                            if (this.normalize4DPropName(prop.displayName) !== target) continue;
                            const value = String(prop.displayValue ?? '').trim();
                            if (!value) continue;
                            if (!byPhaseRaw.has(value)) byPhaseRaw.set(value, []);
                            byPhaseRaw.get(value).push({ dbId: res.dbId, model });
                            break;
                        }
                    }
                    finish();
                }, () => finish());
            });
        });
    }

    // ── Resaltar por estado 4D: aísla los elementos del estado dado ──────────
    isolateByState(state) {
        if (!this.activityToDbIds) return;
        const perModel = new Map();
        const push = (dbId, model) => {
            const m = model || this.viewer.model;
            if (!perModel.has(m)) perModel.set(m, new Set());
            perModel.get(m).add(dbId);
        };
        for (const items of Object.values(this.activityToDbIds)) {
            for (const it of items) if (it.state === state) push(it.dbId, it.model);
        }
        const models = this.getThemingModels();
        models.forEach((m) => {
            const ids = perModel.get(m);
            try {
                // Con coincidencias → aislar esas; sin ninguna → ocultar todo el modelo
                this.viewer.isolate(ids && ids.size ? [...ids] : [-999], m);
            } catch (e) { /* noop */ }
        });
        this.isolatedState = state;
        this.viewer.impl.invalidate(true, true, true);
    }

    clearStateIsolation() {
        const models = this.getThemingModels();
        models.forEach((m) => { try { this.viewer.isolate([], m); } catch (e) { /* noop */ } });
        this.isolatedState = null;
        this.viewer.impl.invalidate(true, true, true);
    }

    // ── Alcance por rama del EDT ─────────────────────────────────────────────
    // Pertenencia de un elemento a la rama, en orden de confianza:
    // 1) Su CodigoPlaneamiento, SI está mapeado a partidas en Duraciones →
    //    pertenece a la rama de ESAS partidas (activityIds del alcance). Esto
    //    corrige elementos con CodigoDePartida cruzado de otro canal (hay 844
    //    con 05.03.x + 05.04.x a la vez por error de etiquetado).
    // 2) Sin planeamiento mapeado → por prefijo de su CodigoDePartida.
    isolateScope(codes, activityIds, mappedActivityIds) {
        const prefixes = (codes || []).map((c) => String(c).trim()).filter(Boolean);
        if (!prefixes.length || !this.elementScopeInfo) return;

        const allowed = new Set((activityIds || []).map((k) => this.normalize4DKey(k)).filter(Boolean));
        const mapped = new Set((mappedActivityIds || []).map((k) => this.normalize4DKey(k)).filter(Boolean));

        const perModel = new Map();
        let total = 0;
        for (const info of this.elementScopeInfo.values()) {
            let inScope = false;
            const knownPlans = [...info.planning].filter((p) => mapped.has(p));
            if (knownPlans.length) {
                inScope = knownPlans.some((p) => allowed.has(p));
            } else {
                inScope = [...info.partidas].some((c) => prefixes.some((pre) => c.startsWith(pre)));
            }
            if (!inScope) continue;
            const m = info.model || this.viewer.model;
            if (!perModel.has(m)) perModel.set(m, []);
            perModel.get(m).push(info.dbId);
            total += 1;
        }

        if (!total) {
            console.warn('[LOB4D] Alcance sin elementos bajo', prefixes);
            this.clearScopeIsolation();
            return;
        }

        this.getThemingModels().forEach((m) => {
            const ids = perModel.get(m);
            try { this.viewer.isolate(ids && ids.length ? ids : [-999], m); } catch (e) { /* noop */ }
        });
        this.scopeActive = true;
        console.log(`[LOB4D] Alcance EDT ${prefixes.join(',')}: ${total} elementos aislados`);
        this.viewer.impl.invalidate(true, true, true);
    }

    clearScopeIsolation() {
        if (!this.scopeActive) return;
        this.getThemingModels().forEach((m) => { try { this.viewer.isolate([], m); } catch (e) { /* noop */ } });
        this.scopeActive = false;
        this.viewer.impl.invalidate(true, true, true);
    }

    // ── PROGRESIVAS DESDE EL EJE ─────────────────────────────────────────────
    // El visor conoce la posición 3D de cada elemento Y el eje con estaciones
    // (alineamiento de Civil): proyectando el centro del elemento al eje se
    // obtiene su PK — sin llenar DSI_Progresiva a mano. El resultado por
    // partida (rango min..max) se persiste al backend (lob_locations).

    // Marco del EJE en el punto 3D dado: tangente horizontal + PK. Lo usa la
    // herramienta de Corte para que "transversal/longitudinal" signifiquen
    // SIEMPRE lo mismo (respecto al eje de la obra), sin depender de qué cara
    // se tocó. Devuelve null si aún no hay eje muestreado.
    axisFrameAtPoint(point) {
        const THREE = window.THREE;
        const S = this.alignmentSamples;
        if (!THREE || !Array.isArray(S) || S.length < 2 || !point) return null;
        let bi = -1;
        let bd = Infinity;
        for (let i = 0; i < S.length; i++) {
            const d = S[i].point.distanceToSquared(point);
            if (d < bd) { bd = d; bi = i; }
        }
        if (bi < 0) return null;
        const a = S[Math.max(0, bi - 1)];
        const b = S[Math.min(S.length - 1, bi + 1)];
        const t = new THREE.Vector3().subVectors(b.point, a.point);
        t.z = 0;                       // tangente en planta: el corte es vertical
        if (t.lengthSq() < 1e-9) return null;
        t.normalize();
        const mpu = (this.viewer?.model?.getUnitScale && this.viewer.model.getUnitScale()) || 1;
        return { tangent: t, station: Number(S[bi].station), dist: Math.sqrt(bd) * mpu };
    }

    _nearestStationWithDist(point) {
        let best = null;
        let bestD = Infinity;
        for (const sample of this.alignmentSamples) {
            const d = sample.point.distanceToSquared(point);
            if (d < bestD) { bestD = d; best = sample; }
        }
        return best ? { station: Number(best.station), dist: Math.sqrt(bestD) } : null;
    }

    async computeElementStations(maxDistMeters = 150) {
        const THREE = window.THREE;
        if (!THREE) return { ok: false, reason: 'THREE no disponible' };
        if (!this.activeAlignment || !this.alignmentSamples?.length) {
            return { ok: false, reason: 'no hay eje activo (selecciona un alineamiento en Civil y reabre el 4D)' };
        }
        await this.ensurePropertyIndex();
        if (!this.elementScopeInfo?.size) {
            return { ok: false, reason: 'sin elementos con CodigoDePartida en los modelos cargados' };
        }

        const box = new THREE.Box3();
        const acc = new THREE.Box3();
        const center = new THREE.Vector3();
        const ranges = new Map(); // codigo -> {min, max, n}
        this.elementStations = new Map(); // "modelId:dbId" -> PK (m)
        let elements = 0;

        for (const [key, info] of this.elementScopeInfo) {
            if (!info.partidas.size) continue;
            const model = info.model || this.viewer.model;
            const frags = model.getFragmentList?.();
            const tree = model.getInstanceTree?.();
            if (!frags || !tree) continue;

            acc.makeEmpty();
            tree.enumNodeFragments(info.dbId, (fragId) => {
                frags.getWorldBounds(fragId, box);
                acc.union(box);
            }, true);
            if (acc.isEmpty()) continue;
            acc.getCenter(center);

            const near = this._nearestStationWithDist(center);
            if (!near) continue;
            const mpu = (model.getUnitScale && model.getUnitScale()) || 1; // metros por unidad
            if (near.dist * mpu > maxDistMeters) continue; // lejos del eje → PK sin sentido

            this.elementStations.set(key, near.station);
            elements += 1;
            for (const code of info.partidas) {
                const r = ranges.get(code) || { min: near.station, max: near.station, n: 0 };
                r.min = Math.min(r.min, near.station);
                r.max = Math.max(r.max, near.station);
                r.n += 1;
                ranges.set(code, r);
            }
        }

        const out = [...ranges.entries()]
            .filter(([, r]) => r.max > r.min)
            .map(([codigo, r]) => ({ codigo, station_start: r.min, station_end: r.max, elems: r.n }));

        console.log(`[LOB4D] Progresivas desde el eje: ${elements} elementos con PK → ${out.length} partidas con rango`);
        return {
            ok: true,
            alignmentId: this.activeAlignment.alignmentId || this.activeAlignment.name || null,
            elements,
            ranges: out,
        };
    }

    _finalizePhaseIndex(propName, byPhaseRaw, source) {
        const phases = [...byPhaseRaw.keys()]
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        const byPhase = new Map();
        let total = 0;
        phases.forEach((p) => { byPhase.set(p, byPhaseRaw.get(p)); total += byPhaseRaw.get(p).length; });
        this.phaseIndex = { propName, phases, byPhase, total };
        console.log(`[LOB4D] Param "${propName}" (${source}): ${phases.length} fases, ${total} elementos`, phases);
        return this.phaseIndex;
    }

    // Material translúcido compartido para el estado "ejecutado" (transparencia
    // REAL: el theming solo tiñe, no hace ver a través → hay que cambiar material).
    _ensureDoneMaterial() {
        if (this._doneMaterial) return this._doneMaterial;
        const THREE = window.THREE;
        const mat = new THREE.MeshPhongMaterial({
            color: new THREE.Color(0x2fbf55),
            transparent: true,
            opacity: 0.28,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        mat.packedNormals = true; // requerido por el render de LMV
        this.viewer.impl.matman().addMaterial('lob-phase-done', mat, true);
        this._doneMaterial = mat;
        return mat;
    }

    _forEachFragment(dbId, model, cb) {
        const it = model.getInstanceTree?.();
        const frags = model.getFragmentList?.();
        if (!it || !frags) return;
        it.enumNodeFragments(dbId, (fragId) => cb(fragId, frags), true);
    }

    _setElementTransparent(dbId, model) {
        const mat = this._ensureDoneMaterial();
        if (!this._matBackup) this._matBackup = new Map();
        this._forEachFragment(dbId, model, (fragId, frags) => {
            const key = `${model.id}:${fragId}`;
            if (!this._matBackup.has(key)) {
                this._matBackup.set(key, { model, fragId, material: frags.getMaterial(fragId) });
            }
            frags.setMaterial(fragId, mat);
        });
    }

    _restoreElementMaterial(dbId, model) {
        if (!this._matBackup) return;
        this._forEachFragment(dbId, model, (fragId, frags) => {
            const key = `${model.id}:${fragId}`;
            const bak = this._matBackup.get(key);
            if (bak) { frags.setMaterial(fragId, bak.material); this._matBackup.delete(key); }
        });
    }

    // ── Excavación fantasma ("ya no existe") ────────────────────────────────
    // Rojo terroso TRANSLÚCIDO: se lee como "volumen excavado/corte" (código de
    // color de movimiento de tierras) sin tapar lo construido. NO es theming,
    // es transparencia real. Ajustable en vivo:
    //   window.__excavGhostStyle = { color: 0xa93226, opacity: 0.24 }
    _ensureExcavMaterial() {
        if (this._excavMaterial) return this._excavMaterial;
        const THREE = window.THREE;
        const cfg = window.__excavGhostStyle || {};
        // OJO con el lavado óptico: translúcido = color×opacidad + fondo×(1-op).
        // Sobre la topo de corte BLANCA, un rojo al 30% se ve rosa pálido casi
        // invisible. Rojo PROFUNDO + opacidad 0.45 gana sobre fondo claro y
        // sigue dejando ver lo construido a través.
        const mat = new THREE.MeshPhongMaterial({
            color: new THREE.Color(cfg.color ?? 0x8e2418),        // rojo profundo
            emissive: new THREE.Color(cfg.emissive ?? 0x511009),  // presencia en sombra
            specular: new THREE.Color(0x000000),
            transparent: true,
            opacity: cfg.opacity ?? 0.45,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        mat.packedNormals = true;
        this.viewer.impl.matman().addMaterial('lob-excav-ghost', mat, true);
        this._excavMaterial = mat;
        return mat;
    }

    // Re-crear el material con otro estilo (para calibrar en vivo)
    restyleExcavation(style) {
        window.__excavGhostStyle = { ...(window.__excavGhostStyle || {}), ...(style || {}) };
        const wasOn = this._excavGhostOn;
        if (wasOn) this.ghostExcavation(false);
        this._excavMaterial = null; // forzar re-creación con el nuevo estilo
        if (wasOn) this.ghostExcavation(true);
    }

    // Nombre del modelo desde varias fuentes (para DWG el registro puede no traerlo)
    getModelName(model) {
        const norm = (u) => String(u || '').replace(/^urn:/i, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const data = model?.getData?.() || {};
        const nRaw = norm(data.urn);
        // 0) mapa fiable urn→nombre que expone App (el más confiable en el visor principal)
        const byUrn = window.__modelLabelByUrn || {};
        for (const k in byUrn) {
            if (norm(k) === nRaw) return byUrn[k];
        }
        // 1) registro live del visor (lo llena el loader del 4D)
        const reg = window.__viewerLiveModels || {};
        for (const k in reg) {
            if (norm(k) === nRaw || norm(reg[k].urn) === nRaw) {
                if (reg[k].name) return reg[k].name;
            }
        }
        // 2) fuentes internas del propio Model / documento
        const candidates = [
            data.loadOptions?.modelNameOverride,
            data.loadOptions?.bubbleNode?.name?.(),
            model.getDocumentNode?.()?.name?.(),
            model.myData?.loadOptions?.modelNameOverride,
            data.name,
            data.urn,
        ];
        return candidates.find(Boolean) || '';
    }

    // ¿Es este modelo el DWG de sólidos de excavación? (por nombre de archivo)
    isExcavationModel(model) {
        const name = this.getModelName(model);
        const pattern = window.__excavModelPattern || /solid|excav|corte/i;
        return !!name && pattern.test(name);
    }

    ghostExcavation(on) {
        this._excavGhostOn = !!on;
        const models = this.viewer.impl?.modelQueue?.().getModels?.() || [this.viewer.model].filter(Boolean);
        if (!this._excavBackup) this._excavBackup = new Map();

        // Diagnóstico: qué modelos ve, con nombre, URN y nº de fragmentos, y si matchea
        const allNames = models.map(m => this.getModelName(m));
        models.forEach(m => {
            const nm = this.getModelName(m);
            const urnTail = String(m.getData?.()?.urn || '').slice(-14);
            const nf = m.getFragmentList?.()?.getCount?.() ?? '?';
            console.log(`[LOB4D] Excavación · modelo "${nm}" (…${urnTail}) frags=${nf} → ${this.isExcavationModel(m) ? 'SE PINTA' : 'no'}`);
        });

        if (on) {
            const mat = this._ensureExcavMaterial();
            let count = 0; let matched = 0;
            for (const model of models) {
                if (!this.isExcavationModel(model)) continue;
                matched += 1;

                // LMV CONSOLIDA fragmentos en buffers combinados (HLOD) para
                // rendir; los consolidados IGNORAN setMaterial → solo algunos
                // sólidos se pintaban. Des-consolidar de forma robusta:
                try { model.unconsolidate?.(); } catch { /* noop */ }
                try { this.viewer.impl.unconsolidateModel?.(model); } catch { /* noop */ }
                try { model.getConsolidation?.()?.dispose?.(); } catch { /* noop */ }
                try { if (model.getData?.()?.loadOptions) model.getData().loadOptions.useConsolidation = false; } catch { /* noop */ }

                const frags = model.getFragmentList?.();
                if (!frags) continue;
                const total = frags.getCount ? frags.getCount() : (frags.fragments?.length || 0);
                for (let i = 0; i < total; i++) {
                    const key = `${model.id}:${i}`;
                    if (!this._excavBackup.has(key)) {
                        this._excavBackup.set(key, { model, fragId: i, material: frags.getMaterial(i) });
                    }
                    frags.setMaterial(i, mat);
                    frags.setMaterialId?.(i, mat.id); // algunas versiones requieren el id
                    count += 1;
                }
            }
            // Forzar re-render completo de escena + consolidación
            try { this.viewer.impl.invalidate(true, true, true); } catch { /* noop */ }
            try { this.viewer.impl.sceneUpdated?.(true); } catch { /* noop */ }
            console.log(`[LOB4D] Excavación fantasma: ${count} fragmentos en ${matched} modelo(s).`);
            window.dispatchEvent(new CustomEvent('lob-ghost-excavation-result', { detail: { matched, count, names: allNames } }));
        } else {
            this._excavBackup.forEach(({ model, fragId, material }) => {
                try { model.getFragmentList()?.setMaterial(fragId, material); } catch { /* noop */ }
            });
            this._excavBackup.clear();
            this.viewer.impl.invalidate(true, true, true);
        }
    }


    // Phasing sin parpadeo: los sólidos están SIEMPRE presentes (nunca se ocultan).
    // Estado por elemento — futuro: natural · ejecutando: naranja sólido (theming)
    // · ejecutado: verde TRANSLÚCIDO (material real). Solo se tocan los elementos
    // cuyo estado cambió respecto al paso anterior → transición fluida.
    simulateParamPhase(currentIndex) {
        if (!this.phaseIndex) return;
        const THREE = window.THREE;
        const { phases, byPhase } = this.phaseIndex;
        const orange = new THREE.Vector4(0.98, 0.45, 0.10, 1.0);
        if (!this._phaseElemState) this._phaseElemState = new Map();

        phases.forEach((phase, i) => {
            const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'future';
            (byPhase.get(phase) || []).forEach(({ dbId, model }) => {
                const key = `${model.id}:${dbId}`;
                if (this._phaseElemState.get(key) === state) return; // sin cambio → no tocar

                // reset del estado anterior
                this.viewer.setThemingColor(dbId, null, model, true);
                this._restoreElementMaterial(dbId, model);

                if (state === 'current') {
                    this.viewer.setThemingColor(dbId, orange, model, true);
                } else if (state === 'done') {
                    this._setElementTransparent(dbId, model);
                }
                // future → natural (ya reseteado)
                this._phaseElemState.set(key, state);
            });
        });

        this.viewer.impl.invalidate(true, true, true);
        const label = phases[currentIndex] || '';
        window.dispatchEvent(new CustomEvent('LOB4D_PARAM_PHASE_CHANGED', {
            detail: { index: currentIndex, label, count: byPhase.get(label)?.length || 0 }
        }));
    }

    clearParamSimulation() {
        if (!this.viewer) return;
        if (this.phaseIndex) {
            const { phases, byPhase } = this.phaseIndex;
            phases.forEach((p) => (byPhase.get(p) || []).forEach(({ dbId, model }) => {
                this.viewer.setThemingColor(dbId, null, model, true);
                this._restoreElementMaterial(dbId, model);
            }));
        }
        this._phaseElemState = new Map();
        this.viewer.impl.invalidate(true, true, true);
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
            // overlay-only: corre en cada pixel del arrastre — invalidar escena
            // completa reiniciaba el render progresivo (parpadeo de modelos)
            this.viewer.impl.invalidate(false, false, true);
        } else {
            console.warn(`[LOB4D] PK ${pk} is outside extracted alignment geometry.`);
        }

        // Emitir contexto geométrico para la UI de rastreo
        const context = this.getStationContext(alignmentData, pk);
        if (context) {
            window.dispatchEvent(new CustomEvent('LOB4D_PK_CONTEXT_CHANGED', {
                detail: { ...context, alignmentId: alignmentData?.alignmentId || alignmentData?.name || null }
            }));
        }
    }
}

window.Autodesk.Viewing.theExtensionManager.registerExtension('LOB4DExtension', LOB4DExtension);
