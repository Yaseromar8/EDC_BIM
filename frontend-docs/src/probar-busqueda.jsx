/**
 * BANCO · la pantalla de Archivos, con un servidor de mentira.
 *
 * Monta la `FilesPage` REAL y le pone delante un `fetch` falso QUE RECUERDA:
 * crear una carpeta la anade al listado, desplazar un fichero lo saca. Sin esa
 * memoria el banco mentiria justo donde importa -- el refresco de fondo
 * borraria lo que la pantalla acaba de pintar.
 *
 * Cada respuesta tarda lo que se le diga (`window.__retrasoBusqueda`,
 * `__retrasoCarpeta`, `__retrasoMover`). Eso es lo que hace util este banco:
 * los tres fallos que cubre son de TIEMPO -- una respuesta que llega tarde, un
 * dialogo que se queda mudo mientras espera, peticiones que van en fila -- y
 * eso no se ve leyendo el codigo, hay que ejecutarlo.
 *
 * `window.__registro` deja constancia de cada peticion con su instante, para
 * poder demostrar que las de desplazar salen a la vez y no una detras de otra.
 *
 * No entra en produccion: `vite.config.js` no lo conoce.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import FilesPage from './pages/FilesPage';
import './index.css';

// `fullName` de una carpeta lleva BARRA FINAL, como en el servidor de verdad:
// es lo que el arbol de destino usa para decir donde se mueve algo.
const CARPETAS = [
    { id: 'f1', name: '01_COSTOS', fullName: 'banco/01_COSTOS/', updated: '2026-09-01T10:00:00Z', updated_by: 'ADMIN' },
    { id: 'f2', name: '02_BIM', fullName: 'banco/02_BIM/', updated: '2026-09-02T10:00:00Z', updated_by: 'ADMIN' },
    { id: 'f3', name: '03_CALIDAD', fullName: 'banco/03_CALIDAD/', updated: '2026-09-03T10:00:00Z', updated_by: 'ADMIN' },
];
const FICHEROS = [
    { id: 'a1', name: 'PROTOCOLO_LIBERACION_R02.pdf', fullName: 'banco/PROTOCOLO_LIBERACION_R02.pdf', size: 2400000, version: 2, status: 'SHARED', updated: '2026-09-04T10:00:00Z', updated_by: 'ADMIN' },
    // Seis mas, para poder seleccionar varios y ver si las peticiones de
    // desplazar salen a la vez o siguen haciendo cola. `fullName` importa: es
    // la clave con la que la tabla marca lo seleccionado.
    ...Array.from({ length: 6 }, (_, i) => ({
        id: `a${i + 2}`,
        name: `1_Val_01_Paq_08_S1_Sinohydro_CNT-${i + 1}.pdf`,
        fullName: `banco/1_Val_01_Paq_08_S1_Sinohydro_CNT-${i + 1}.pdf`,
        size: 1200000, version: 1, status: 'SHARED',
        updated: '2026-09-09T08:00:00Z', updated_by: 'ADMIN',
    })),
];

window.__retrasoBusqueda = 1500;
window.__retrasoCarpeta = 1500;
window.__retrasoMover = 800;
window.__registro = [];
const t0 = Date.now();
const anotar = (linea) => window.__registro.push(`${String(Date.now() - t0).padStart(5)}ms  ${linea}`);

// El servidor falso RECUERDA. `window.__estado` es su base de datos.
window.__estado = { folders: [...CARPETAS], files: [...FICHEROS] };
let siguienteId = 1000;

const responder = (cuerpo, ms = 0) => new Promise(res => {
    const enviar = () => res(new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    ms ? setTimeout(enviar, ms) : enviar();
});

const original = window.fetch.bind(window);
window.fetch = (url, opciones = {}) => {
    const u = String(typeof url === 'string' ? url : url.url);
    if (!u.includes('/api/')) return original(url, opciones);
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : {};

    // Sin esto `esAdminDeObra` es false y no hay ni boton de crear carpeta.
    if (u.includes('/mi-administracion')) {
        return responder({ es_admin_de_obra: true, es_entity_admin: true });
    }

    if (u.includes('/api/docs/search')) {
        const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || '');
        anotar(`sale busqueda "${q}"`);
        return responder({ success: true, data: [] }, window.__retrasoBusqueda)
            .then(r => { anotar(`LLEGA busqueda "${q}" (0 resultados)`); return r; });
    }

    if (u.includes('/api/docs/folder') && (opciones.method || 'GET').toUpperCase() === 'POST') {
        const ruta = String(cuerpo.path || '');
        anotar(`sale crear carpeta "${ruta}"`);
        const id = `id-${++siguienteId}`;
        return responder({ success: true, id }, window.__retrasoCarpeta).then(r => {
            window.__estado.folders.push({
                id, name: ruta.replace(/\/$/, '').split('/').pop(), fullName: ruta,
                updated: new Date().toISOString(), updated_by: 'ADMIN',
            });
            anotar(`LLEGA crear carpeta "${ruta}" -> ${id}`);
            return r;
        });
    }

    if (u.includes('/api/docs/move')) {
        const id = String(cuerpo.node_id);
        anotar(`sale desplazar ${id}`);
        return responder({ success: true }, window.__retrasoMover).then(r => {
            window.__estado.files = window.__estado.files.filter(f => String(f.id) !== id);
            window.__estado.folders = window.__estado.folders.filter(f => String(f.id) !== id);
            anotar(`LLEGA desplazar ${id}`);
            return r;
        });
    }

    if (u.includes('/api/docs/list')) {
        return responder({ success: true, data: {
            folders: [...window.__estado.folders], files: [...window.__estado.files], current_node_id: 'raiz',
        } });
    }
    if (u.includes('/api/projects')) return responder({ success: true, data: [] });
    return responder({ success: true, data: [] });
};

const PROYECTO = { id: 'banco', scope_escritura: 'banco', name: 'Banco' };
const USUARIO = { id: 1, name: 'Banco', email: 'banco@local', rol: 'admin', role: 'admin' };

const nodo = document.getElementById('raiz');
if (!nodo.__raiz) nodo.__raiz = createRoot(nodo);
nodo.__raiz.render(
    <div style={{ height: '100vh' }}>
        <FilesPage project={PROYECTO} user={USUARIO} onBack={() => {}} onLogout={() => {}} onBackToHub={() => {}} />
    </div>
);
