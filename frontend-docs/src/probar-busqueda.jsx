/**
 * BANCO · la pantalla de Archivos, con un servidor de mentira.
 *
 * Monta la `FilesPage` REAL y le pone delante un `fetch` falso QUE RECUERDA:
 * crear una carpeta la anade al listado, desplazar un fichero lo saca,
 * restaurar lo devuelve de la papelera. Sin esa memoria el banco mentiria
 * justo donde importa -- el refresco de fondo borraria lo que la pantalla
 * acaba de pintar.
 *
 * Lo util de este banco es que aqui SI se pueden provocar las cosas que en
 * produccion no se piden a voluntad:
 *
 *   window.__retrasoBusqueda   una respuesta que llega tarde (la carrera)
 *   window.__retrasoCarpeta    un servidor lento creando
 *   window.__retrasoMover      lo mismo al desplazar
 *   window.__fallarRestore     un restaurar que el servidor rechaza
 *   window.__fallarMover       cuantos desplazamientos deben fallar
 *
 * Y los PERMISOS por elemento, que es lo que decide si la interfaz ofrece o
 * apaga cada accion. El nivel viaja en cada fila igual que en produccion.
 *
 * No entra en produccion: `vite.config.js` no lo conoce.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import FilesPage from './pages/FilesPage';
import './index.css';

// 400 documentos, 37 de ellos con CALA en el nombre: es lo que hace falta para
// comprobar que «seleccionar todo» abarca el conjunto resultante y no las doce
// filas dibujadas.
const TOTAL = 400;
const CON_CALA = 37;
const NIVELES = ['admin', 'edit', 'viewer'];

const CARPETAS = [
    { id: 'f1', name: '01_COSTOS', fullName: 'banco/01_COSTOS/', permission_level: 'admin', has_access: true, updated: '2026-09-01T10:00:00Z', updated_by: 'ADMIN' },
    { id: 'f2', name: '02_BIM', fullName: 'banco/02_BIM/', permission_level: 'edit', has_access: true, updated: '2026-09-02T10:00:00Z', updated_by: 'ADMIN' },
    { id: 'f3', name: '03_CALIDAD', fullName: 'banco/03_CALIDAD/', permission_level: 'viewer', has_access: true, updated: '2026-09-03T10:00:00Z', updated_by: 'ADMIN' },
];

const FICHEROS = Array.from({ length: TOTAL }, (_, i) => {
    const cala = i < CON_CALA;
    const nombre = cala
        ? `CALA_${String(i + 1).padStart(3, '0')}_ensayo.pdf`
        : `Val_${String(i + 1).padStart(3, '0')}_Paq_08.pdf`;
    return {
        id: `a${i + 1}`, name: nombre, fullName: `banco/${nombre}`,
        // Los tres niveles repartidos: asi una seleccion de varios puede ser
        // mixta de permisos, que es justo el caso que hay que apagar.
        permission_level: NIVELES[i % NIVELES.length], has_access: true,
        size: 1200000, version: 1, status: 'SHARED', gcs_urn: null,
        updated: '2026-09-04T10:00:00Z', updated_by: 'ADMIN',
    };
});

// LA FORMA REAL DEL SERVIDOR, no una simplificada. `list_deleted_contents`
// arma `fullName` con un `string_agg(name, ' / ')` que ARRANCA EN EL NODO RAÍZ,
// y ese nodo tiene nombre: «Archivos de proyecto» (ROOT_NAME). El banco anterior
// omitía ese primer tramo, así que probaba mi suposición en vez del servidor:
// «Ver en Archivos» pasó la prueba y en producción habría navegado a
// «banco/Archivos de proyecto/01_COSTOS/», que no existe.
const RAIZ = 'Archivos de proyecto';
const BORRADOS = [
    { id: 'p1', name: 'BORRADO_1.pdf', fullName: `${RAIZ} / 01_COSTOS / BORRADO_1.pdf`, node_type: 'FILE', deleted_by: 'ADMIN', deleted_at: '2026-09-05T10:00:00Z' },
    { id: 'p2', name: 'BORRADO_2.pdf', fullName: `${RAIZ} / 01_COSTOS / BORRADO_2.pdf`, node_type: 'FILE', deleted_by: 'ADMIN', deleted_at: '2026-09-05T11:00:00Z' },
    // De OTRA carpeta: con destinos distintos no puede ofrecerse enlace.
    { id: 'p3', name: 'BORRADO_3.pdf', fullName: `${RAIZ} / 02_BIM / BORRADO_3.pdf`, node_type: 'FILE', deleted_by: 'ADMIN', deleted_at: '2026-09-05T12:00:00Z' },
    // Directamente en la raíz: vuelve a «Archivos de proyecto», sin subcarpeta.
    { id: 'p4', name: 'BORRADO_4.pdf', fullName: `${RAIZ} / BORRADO_4.pdf`, node_type: 'FILE', deleted_by: 'ADMIN', deleted_at: '2026-09-05T13:00:00Z' },
];

window.__retrasoBusqueda = 300;
window.__retrasoCarpeta = 300;
window.__retrasoMover = 200;
window.__fallarRestore = false;
window.__fallarMover = 0;
window.__registro = [];
window.__estado = { folders: [...CARPETAS], files: [...FICHEROS], borrados: [...BORRADOS] };

const t0 = Date.now();
const anotar = (l) => window.__registro.push(`${String(Date.now() - t0).padStart(5)}ms  ${l}`);
let siguienteId = 1000;

const responder = (cuerpo, ms = 0, estado = 200) => new Promise(res => {
    const enviar = () => res(new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } }));
    ms ? setTimeout(enviar, ms) : enviar();
});

const original = window.fetch.bind(window);
window.fetch = (url, opciones = {}) => {
    const u = String(typeof url === 'string' ? url : url.url);
    if (!u.includes('/api/')) return original(url, opciones);
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : {};

    if (u.includes('/mi-administracion')) return responder({ es_admin_de_obra: true, es_entity_admin: true });

    if (u.includes('/api/docs/search')) {
        const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || '');
        anotar(`sale busqueda "${q}"`);
        return responder({ success: true, data: [] }, window.__retrasoBusqueda)
            .then(r => { anotar(`LLEGA busqueda "${q}"`); return r; });
    }

    if (u.includes('/api/docs/folder') && (opciones.method || 'GET').toUpperCase() === 'POST') {
        const ruta = String(cuerpo.path || '');
        const id = `id-${++siguienteId}`;
        anotar(`sale crear carpeta "${ruta}"`);
        return responder({ success: true, id }, window.__retrasoCarpeta).then(r => {
            window.__estado.folders.push({ id, name: ruta.replace(/\/$/, '').split('/').pop(), fullName: ruta, permission_level: 'admin', has_access: true, updated: new Date().toISOString(), updated_by: 'ADMIN' });
            anotar(`LLEGA crear carpeta -> ${id}`);
            return r;
        });
    }

    if (u.includes('/api/docs/move')) {
        const id = String(cuerpo.node_id);
        anotar(`sale desplazar ${id}`);
        return responder({}, window.__retrasoMover).then(() => {
            if (window.__fallarMover > 0) {
                window.__fallarMover -= 1;
                anotar(`LLEGA desplazar ${id} -> RECHAZADO`);
                return new Response(JSON.stringify({ success: false, error: 'Sin permiso en el destino' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }
            window.__estado.files = window.__estado.files.filter(f => String(f.id) !== id);
            window.__estado.folders = window.__estado.folders.filter(f => String(f.id) !== id);
            anotar(`LLEGA desplazar ${id} -> OK`);
            return new Response(JSON.stringify({ success: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        });
    }

    if (u.includes('/api/docs/restore')) {
        const id = String(cuerpo.id);
        // `__fallarRestore` admite `true` (rechaza todo) o una lista de ids:
        // hace falta para el fallo PARCIAL, que es donde se ve si la papelera
        // conserva lo rechazado.
        const rechazado = Array.isArray(window.__fallarRestore)
            ? window.__fallarRestore.map(String).includes(id)
            : !!window.__fallarRestore;
        window.__cabecerasRestore = window.__cabecerasRestore || [];
        window.__cabecerasRestore.push({ id, headers: { ...(opciones.headers || {}) } });
        if (rechazado) {
            anotar(`restaurar ${id} -> RECHAZADO`);
            return responder({ success: false, error: 'Sin permiso para restaurar.' }, 150, 403);
        }
        window.__estado.borrados = window.__estado.borrados.filter(b => String(b.id) !== id);
        anotar(`restaurar ${id} -> OK`);
        return responder({ success: true }, 150);
    }

    if (u.includes('/api/docs/batch')) {
        const ids = (cuerpo.items || []).map(String);
        window.__estado.files = window.__estado.files.filter(f => !ids.includes(String(f.id)));
        window.__estado.folders = window.__estado.folders.filter(f => !ids.includes(String(f.id)));
        anotar(`lote ${cuerpo.action} sobre ${ids.length}`);
        return responder({ success: true, processed: ids.length });
    }

    if (u.includes('/api/docs/deleted')) {
        return responder({ success: true, data: { folders: [], files: [...window.__estado.borrados] } });
    }

    if (u.includes('/api/docs/list')) {
        // EL ARBOL TIENE FONDO. Antes se devolvian las MISMAS carpetas para
        // cualquier ruta, asi que el panel lateral se podia expandir hasta el
        // infinito y el navegador se quedaba colgado. Eso era del banco, no del
        // producto: una carpeta real tiene hijos distintos, y a partir de cierto
        // nivel no tiene ninguno.
        const ruta = decodeURIComponent((u.match(/[?&]path=([^&]*)/) || [])[1] || '');
        const esRaiz = !ruta || /^banco\/?$/.test(ruta);
        const nivel = ruta.split('/').filter(Boolean).length;
        const hijas = esRaiz
            ? [...window.__estado.folders]
            : (nivel <= 2 ? [{ id: `sub-${nivel}-${ruta}`, name: `SUB_${nivel}`, fullName: `${ruta.replace(/\/$/, '')}/SUB_${nivel}/`,
                               permission_level: 'admin', has_access: true,
                               updated: '2026-09-01T10:00:00Z', updated_by: 'ADMIN' }]
                          : []);
        return responder({ success: true, data: {
            folders: hijas, files: esRaiz ? [...window.__estado.files] : [], current_node_id: esRaiz ? 'raiz' : `n-${ruta}`,
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
