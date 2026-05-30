export class DataVizEngine {
    constructor(viewer) {
        this.viewer = viewer;
        this.dataVizExt = null;
        this.active = false;
    }

    async init() {
        if (!this.dataVizExt) {
            this.dataVizExt = await this.viewer.loadExtension('Autodesk.DataVisualization');
        }
    }

    normalizeUrn(urn) {
        if (!urn) return '';
        let decoded = urn;
        try { decoded = atob(urn.replace(/_/g, '/').replace(/-/g, '+')); } catch (e) { }
        const match = decoded.match(/urn:adsk\.wipprod:fs\.file:vf\.([a-zA-Z0-9_-]+)/);
        return match ? match[1] : urn.split('?')[0];
    }

    async applyTandemStripes(idsByUrn) {
        this.clearTandemStripes();
        
        const modelsQueue = this.viewer.impl.modelQueue().getModels();
        this.active = true;

        // Configurar color de selección al estilo Tandem (Amarillo con líneas diagonales nativas)
        // El tipo MIXED o REGULAR con color fuerte produce el tramado diagonal.
        const tandemColor = new THREE.Color(0xFFE500); // Amarillo Tandem
        this.viewer.setSelectionColor(tandemColor, Autodesk.Viewing.SelectionType.MIXED);
        if (typeof this.viewer.setSelectionEdges === 'function') {
            this.viewer.setSelectionEdges(true);
        }

        const aggregateSelection = [];

        modelsQueue.forEach(m => {
            const rawViewerUrn = m.getData()?.urn;
            const vUrnNorm = this.normalizeUrn(rawViewerUrn);
            const matchingUrn = Object.keys(idsByUrn).find(u => this.normalizeUrn(u) === vUrnNorm || u === rawViewerUrn);
            
            if (matchingUrn && idsByUrn[matchingUrn].size > 0) {
                aggregateSelection.push({
                    model: m,
                    selection: Array.from(idsByUrn[matchingUrn])
                });
            }
        });

        if (aggregateSelection.length > 0) {
            this.viewer.setAggregateSelection(aggregateSelection);
        }
    }

    clearTandemStripes() {
        if (!this.active) return;
        this.viewer.clearSelection();
        this.active = false;
    }
}
