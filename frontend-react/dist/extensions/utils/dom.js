/**
 * Carga un script de forma asíncrona.
 * @param {string} url La URL del script.
 * @returns {Promise} Promesa que se resuelve cuando el script se ha cargado.
 */
export function loadScript(url) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Carga una hoja de estilos de forma asíncrona.
 * @param {string} url La URL de la hoja de estilos.
 * @returns {Promise} Promesa que se resuelve cuando la hoja de estilos se ha cargado.
 */
export function loadStylesheet(url) {
    return new Promise((resolve, reject) => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        link.onload = resolve;
        link.onerror = reject;
        document.head.appendChild(link);
    });
}

/**
 * Crea una barra de herramientas del visor.
 * @param {Autodesk.Viewing.GuiViewer3D} viewer El objeto del visor.
 * @param {string} title El título de la barra de herramientas.
 * @returns {Autodesk.Viewing.UI.ControlGroup} El grupo de controles de la barra de herramientas.
 */
export function createToolbar(viewer, title) {
    const toolbar = new Autodesk.Viewing.UI.ControlGroup(title);
    viewer.toolbar.addControl(toolbar);
    return toolbar;
}
