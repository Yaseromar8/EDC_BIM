export class LoggerExtension extends Autodesk.Viewing.Extension {
    constructor(viewer, options) {
        super(viewer, options);
        this.onModelLoaded = this.onModelLoaded.bind(this);
        this.onSelectionChanged = this.onSelectionChanged.bind(this);
        this.onIsolationChanged = this.onIsolationChanged.bind(this);
    }

    load() {
        this.viewer.addEventListener('model.loaded', this.onModelLoaded);
        this.viewer.addEventListener('selection.changed', this.onSelectionChanged);
        this.viewer.addEventListener('isolation.changed', this.onIsolationChanged);
        console.log('LoggerExtension loaded.');
        return true;
    }

    unload() {
        this.viewer.removeEventListener('model.loaded', this.onModelLoaded);
        this.viewer.removeEventListener('selection.changed', this.onSelectionChanged);
        this.viewer.removeEventListener('isolation.changed', this.onIsolationChanged);
        console.log('LoggerExtension unloaded.');
        return true;
    }

    onModelLoaded(ev) {
        console.log('Model loaded event received by LoggerExtension.');
        const allProps = ev.model.allProps;
        const propNames = new Set();
        for (const prop of allProps) {
            for (const p of prop.properties) {
                propNames.add(p.displayName);
            }
        }
        console.log('Available properties:', Array.from(propNames).sort());
    }

    onSelectionChanged(ev) {
        console.log('Selection changed:', ev.selection);
    }

    onIsolationChanged(ev) {
        console.log('Isolation changed:', ev.isolation);
    }
}

Autodesk.Viewing.theExtensionManager.registerExtension('LoggerExtension', LoggerExtension);
