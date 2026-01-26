import { findLeafNodes, getBulkProperties } from '../utils/model.js';

export class BaseExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.onObjectTreeCreated = this.onObjectTreeCreated.bind(this);
        this.onSelectionChanged = this.onSelectionChanged.bind(this);
        this.onIsolationChanged = this.onIsolationChanged.bind(this);
    }

    load() {
        this.viewer.addEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, this.onObjectTreeCreated);
        this.viewer.addEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.onSelectionChanged);
        this.viewer.addEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.onIsolationChanged);
        console.log('BaseExtension loaded.');
        return true;
    }

    unload() {
        this.viewer.removeEventListener(Autodesk.Viewing.OBJECT_TREE_CREATED_EVENT, this.onObjectTreeCreated);
        this.viewer.removeEventListener(Autodesk.Viewing.SELECTION_CHANGED_EVENT, this.onSelectionChanged);
        this.viewer.removeEventListener(Autodesk.Viewing.ISOLATE_EVENT, this.onIsolationChanged);
        console.log('BaseExtension unloaded.');
        return true;
    }

    async onObjectTreeCreated(ev) {
        console.log('Object tree created.');
        const model = ev.model;
        // OPTIMIZATION: Property extraction moved to Viewer.jsx "On-Demand" logic.
        // This prevents double-processing and race conditions.
        /*
        const leafIds = await findLeafNodes(model);
        model.leafIds = leafIds;
        try {
            model.allProps = await getBulkProperties(model, leafIds);
        } catch (error) {
            console.error('Bulk property extraction failed', error);
            model.allProps = [];
        }
        const detail = model.allProps || [];
        window.dispatchEvent(new CustomEvent('viewer-model-properties', { detail }));
        */
        this.viewer.dispatchEvent({ type: 'model.loaded', model: model });
    }

    onSelectionChanged(ev) {
        this.viewer.dispatchEvent({ type: 'selection.changed', selection: ev.dbIdArray });
    }

    onIsolationChanged(ev) {
        this.viewer.dispatchEvent({ type: 'isolation.changed', isolation: ev.nodeIdArray });
    }
}
