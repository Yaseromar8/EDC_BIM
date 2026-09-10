/**
 * BANCO · la busqueda que tapaba las carpetas.
 *
 * Monta la `FilesPage` REAL y le pone delante un `fetch` de mentira. Existe
 * para reproducir una CARRERA, que es lo unico que no se demuestra leyendo el
 * codigo: la respuesta de una busqueda ya cancelada llegando tarde y volviendo
 * a escribir el estado.
 *
 * La busqueda del banco tarda a proposito (`window.__retrasoBusqueda`), para
 * que quepa el hueco entre «he borrado la caja» y «llega lo de antes».
 *
 * No entra en produccion: `vite.config.js` no lo conoce.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import FilesPage from './pages/FilesPage';
import './index.css';

const CARPETAS = [
    { id: 'f1', name: '01_COSTOS', path: 'banco/01_COSTOS', updated: '2026-09-01T10:00:00Z', updated_by: 'ADMIN' },
    { id: 'f2', name: '02_BIM', path: 'banco/02_BIM', updated: '2026-09-02T10:00:00Z', updated_by: 'ADMIN' },
    { id: 'f3', name: '03_CALIDAD', path: 'banco/03_CALIDAD', updated: '2026-09-03T10:00:00Z', updated_by: 'ADMIN' },
];
const FICHEROS = [
    { id: 'a1', name: 'PROTOCOLO_LIBERACION_R02.pdf', path: 'banco/PROTOCOLO_LIBERACION_R02.pdf', size: 2400000, version: 2, status: 'SHARED', updated: '2026-09-04T10:00:00Z', updated_by: 'ADMIN' },
];

window.__retrasoBusqueda = 1500;
window.__registro = [];

const responder = (cuerpo, ms = 0) => new Promise(res => {
    const enviar = () => res(new Response(JSON.stringify(cuerpo), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    ms ? setTimeout(enviar, ms) : enviar();
});

const original = window.fetch.bind(window);
window.fetch = (url, opciones) => {
    const u = String(typeof url === 'string' ? url : url.url);
    if (!u.includes('/api/')) return original(url, opciones);

    if (u.includes('/api/docs/search')) {
        const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || '');
        window.__registro.push(`sale busqueda "${q}"`);
        return responder({ success: true, data: [] }, window.__retrasoBusqueda)
            .then(r => { window.__registro.push(`LLEGA busqueda "${q}" (0 resultados)`); return r; });
    }
    if (u.includes('/api/docs/list')) {
        return responder({ success: true, data: { folders: CARPETAS, files: FICHEROS, current_node_id: 'raiz' } });
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
