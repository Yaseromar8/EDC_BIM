// Una ventana del navegador para un panel del visor (docs/visor/37).
//
// El panel NO se copia ni se vuelve a crear: su nodo vivo se muda a la ventana
// nueva y React lo sigue dibujando desde la ventana principal, con el mismo
// estado y los mismos datos. Esta pieza solo prepara la ventana — estilos,
// tamaño y cierre — y no sabe nada de lo que se muda a ella.

const PREFIJO_MEDIDAS = 'alephia.ventanaAparte.';
const RASGOS_FIJOS = 'menubar=no,toolbar=no,location=no,status=no';

function leerMedidas(host, nombre) {
    try {
        const m = JSON.parse(host.localStorage.getItem(PREFIJO_MEDIDAS + nombre) || 'null');
        return m && [m.ancho, m.alto].every(n => Number.isFinite(n) && n >= 320) ? m : null;
    } catch {
        return null;
    }
}

function medidasDe(ventana) {
    try {
        const m = { ancho: ventana.outerWidth, alto: ventana.outerHeight, x: ventana.screenX, y: ventana.screenY };
        return [m.ancho, m.alto].every(n => Number.isFinite(n) && n >= 320) ? m : null;
    } catch {
        return null;
    }
}

function guardarMedidas(host, nombre, m) {
    try {
        if (m) host.localStorage.setItem(PREFIJO_MEDIDAS + nombre, JSON.stringify(m));
    } catch { /* sin almacenamiento: la próxima vez abre con el tamaño de siempre */ }
}

// Copia de una hoja de estilo de la ventana principal. Los `link` van con su
// dirección absoluta: la ventana nueva es about:blank y no comparte la base.
function copiarEstilo(doc, nodo) {
    if (nodo.nodeName === 'LINK' && /\bstylesheet\b/i.test(nodo.rel || '')) {
        const l = doc.createElement('link');
        l.rel = 'stylesheet';
        l.href = nodo.href;
        if (nodo.media) l.media = nodo.media;
        return l;
    }
    if (nodo.nodeName === 'STYLE') {
        const s = doc.createElement('style');
        s.textContent = nodo.textContent;
        return s;
    }
    return null;
}

/**
 * Abre (o reutiliza) la ventana `nombre` vacía, con los estilos de la principal.
 * Devuelve `null` si el navegador la bloquea. `alCerrar` se llama UNA vez, venga
 * de donde venga el cierre (la X de la ventana, `cerrar()` o la recarga de la
 * principal), y antes de que el documento de la ventana desaparezca: es el
 * momento de devolver lo que se mudó a ella.
 */
export function abrirVentanaAparte({ host = window, nombre, titulo, alCerrar, ancho = 1280, alto = 760 }) {
    const m = leerMedidas(host, nombre);
    const rasgos = [
        `width=${m ? m.ancho : ancho}`, `height=${m ? m.alto : alto}`,
        ...(m && Number.isFinite(m.x) && Number.isFinite(m.y) ? [`left=${m.x}`, `top=${m.y}`] : []),
        RASGOS_FIJOS,
    ].join(',');
    const ventana = host.open('', nombre, rasgos);
    if (!ventana) return null;

    const doc = ventana.document;
    doc.open();
    doc.write('<!doctype html><html lang="es"><head><meta charset="utf-8"></head><body></body></html>');
    doc.close();
    doc.title = titulo;
    const origen = host.document;
    for (const a of ['class', 'style', 'data-theme']) {
        const v = origen.documentElement.getAttribute(a);
        if (v != null) doc.documentElement.setAttribute(a, v);
    }
    if (origen.body.className) doc.body.className = origen.body.className;

    // Las hojas de la principal, en su orden, y al día: Vite añade hojas al
    // cargar módulos diferidos y las reescribe al recargar en caliente.
    const copias = new Map();
    const base = doc.createElement('style');
    base.textContent = 'html,body{height:100%;margin:0;overflow:hidden}body{display:flex;flex-direction:column;background:#faf9f5}';
    const anadir = nodo => {
        const c = copiarEstilo(doc, nodo);
        if (!c) return;
        copias.set(nodo, c);
        doc.head.insertBefore(c, base);
    };
    doc.head.appendChild(base);
    for (const nodo of origen.head.children) anadir(nodo);
    const observador = new host.MutationObserver(cambios => {
        for (const c of cambios) {
            for (const n of c.addedNodes) if (!copias.has(n)) anadir(n);
            for (const n of c.removedNodes) { copias.get(n)?.remove(); copias.delete(n); }
            const estilo = c.target.nodeName === 'STYLE' ? c.target : c.target.parentNode;
            if (copias.has(estilo)) copias.get(estilo).textContent = estilo.textContent;
        }
    });
    observador.observe(origen.head, { childList: true, subtree: true, characterData: true });

    // Tamaño y sitio, apuntados mientras vive: al cerrarse ya no se pueden leer.
    let medidas = medidasDe(ventana);
    let cerrada = false;
    const terminar = () => {
        if (cerrada) return;
        cerrada = true;
        host.clearInterval(vigia);
        observador.disconnect();
        host.removeEventListener('pagehide', alSalirLaPrincipal);
        guardarMedidas(host, nombre, (!ventana.closed && medidasDe(ventana)) || medidas);
        alCerrar?.();
    };
    // `pagehide` llega con el documento aún vivo; el vigía cubre al navegador
    // que no lo manda al cerrar una ventana emergente.
    ventana.addEventListener('pagehide', terminar);
    const vigia = host.setInterval(() => {
        if (ventana.closed) terminar();
        else medidas = medidasDe(ventana) || medidas;
    }, 500);
    // Si se recarga o se cierra la principal, la de aparte se queda sin quien
    // la dibuje: se cierra con ella.
    const alSalirLaPrincipal = () => { terminar(); ventana.close(); };
    host.addEventListener('pagehide', alSalirLaPrincipal);

    return {
        ventana,
        cuerpo: doc.body,
        cerrar() { terminar(); ventana.close(); },
    };
}
