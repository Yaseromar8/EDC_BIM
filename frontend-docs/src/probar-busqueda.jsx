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
import { instalarTooltips } from '../../design/ui/tooltips.js';
import { AvisosHost } from './utils/avisos.jsx';

// Como main.jsx: el banco monta FilesPage sin pasar por él.
instalarTooltips();

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

// Documentos ISO 19650 repartidos por la obra, para las VISTAS (A2-2).
const ISO = (n, tipo, disc, status, ubicacion, entrega) => {
    const name = `500125-CSSP001-000-XX-${tipo}-${disc}-${String(n).padStart(6, '0')}.pdf`;
    return { id: `iso${n}`, type: 'file', name, fullName: `${ubicacion}/${name}`, ubicacion, parent_id: 'x',
             status, size: 2400000, version: 2, codigo_revision: status === 'PUBLISHED' ? 'C01' : 'P02',
             updated: '2026-10-10T15:00:00Z', updated_by: { name: 'Ana Pérez', initials: 'AP' },
             ...(entrega ? { entrega } : {}) };
};
const VENCIDO = { plan: 'MIDP', hito: 'Etapa 2', fecha: '2026-10-01', estado: 'vinculado', etiqueta: 'Vinculado' };
const PRONTO = { plan: 'MIDP', hito: 'Etapa 3', fecha: '2026-10-18', estado: 'vinculado', etiqueta: 'Vinculado' };
const DOCS_ISO = [
    ISO(4120, 'DR', 'ES', 'SHARED', '02_BIM/Estructuras', VENCIDO),
    ISO(4121, 'DR', 'ES', 'WIP', '02_BIM/Estructuras', VENCIDO),
    ISO(4122, 'DR', 'AR', 'SHARED', '02_BIM/Arquitectura', PRONTO),
    ISO(5001, 'M3', 'ES', 'PUBLISHED', '02_BIM/Modelos'),
    ISO(5002, 'RP', 'GE', 'PUBLISHED', '01_COSTOS'),
    ISO(5003, 'DR', 'ES', 'PUBLISHED', '02_BIM/Estructuras', { plan: 'MIDP', hito: 'Etapa 1', fecha: '2026-09-15', estado: 'entregado', etiqueta: 'Entregado' }),
];
const VISTAS_BANCO = {
    me_toca_revisar: [DOCS_ISO[0], DOCS_ISO[2]],
    asignados_mi_empresa: [DOCS_ISO[0], DOCS_ISO[1], DOCS_ISO[2]],
    plazo_vencido: [DOCS_ISO[0], DOCS_ISO[1]],
    vence_pronto: [DOCS_ISO[2]],
    publicados_sin_entrega: [DOCS_ISO[3], DOCS_ISO[4]],
    en_revision: [DOCS_ISO[0], DOCS_ISO[2]],
    publicados: [DOCS_ISO[3], DOCS_ISO[4], DOCS_ISO[5]],
};

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

    // PORTADA: las formas reales de /api/mi-trabajo, /api/reviews y /api/plan.
    // Fechas relativas a hoy, para que los tramos salgan siempre igual.
    const enDias = (n) => new Date(Date.now() + n * 86400000).toISOString();
    if (u.includes('/api/mi-trabajo')) {
        return responder({ total: 3, pendientes: [
            { id: 901, project_id: 'banco', objeto_tipo: 'REVIEW', objeto_id: '41', asunto: 'Revisar: Planos de estructuras (paso 2)', vence_en: enDias(-2) },
            { id: 902, project_id: 'banco', objeto_tipo: 'RFI', objeto_id: 'r7', asunto: 'Responder RFI-009 · Cota de rasante', vence_en: enDias(3) },
            { id: 903, project_id: 'banco', objeto_tipo: 'ASIENTO', objeto_id: '12', asunto: 'Firmar asiento 112 del cuaderno', vence_en: null },
            { id: 904, project_id: 'otra', objeto_tipo: 'REVIEW', objeto_id: '9', asunto: 'De otra obra', vence_en: enDias(-1) },
        ] }, 120);
    }
    if (u.includes('/api/reviews')) {
        return responder({ success: true, siguiente: null, reviews: [
            { id: 41, title: 'Planos de estructuras', status: 'pending', paso_vence_en: enDias(-2) },
            { id: 42, title: 'Memoria de cálculo', status: 'pending', paso_vence_en: enDias(5) },
            { id: 43, title: 'Especificaciones', status: 'pending', paso_vence_en: null },
        ] }, 120);
    }
    if (u.includes('/api/plan?')) {
        return responder({ plan: [
            { id: 1, identificador: 'A', estado: 'vencido', fecha_comprometida: enDias(-9).slice(0, 10), documento: null },
            { id: 2, identificador: 'B', estado: 'vencido', fecha_comprometida: enDias(-4).slice(0, 10), documento: null },
            { id: 3, identificador: 'C', estado: 'vinculado', fecha_comprometida: enDias(-1).slice(0, 10), documento: { node_id: 'iso4120' } },
            { id: 4, identificador: 'D', estado: 'comprometido', fecha_comprometida: enDias(6).slice(0, 10), documento: null },
            { id: 5, identificador: 'E', estado: 'entregado', fecha_comprometida: enDias(-20).slice(0, 10), documento: { node_id: 'iso5003' } },
        ], resumen: {}, requisitos: [] }, 120);
    }

    // FICHA (paso 3): la forma real de `/api/docs/trazabilidad`, con `relacionados`.
    // Las huellas son las de los textos «plano original V2» y «plano original V1»:
    // un fichero con ese contenido debe dar «Coincide» en «Comprobar un archivo».
    if (u.includes('/api/docs/trazabilidad')) {
        anotar('trazabilidad');
        return responder({ success: true,
            documento: { nombre: 'banco', estado: 'SHARED', codigo_idoneidad: 'S2', codigo_revision: 'P02' },
            versiones: [
                { version: 2, revision: 'P02', idoneidad: 'S2', emitida_en: '2026-10-12T16:40:00Z', emitida_por: 'Ana Revisora',
                  subida_en: '2026-10-12T15:10:00Z', subida_por: 'Eva Autora',
                  huella: 'bfcf0a76bb2b671a8b2bf506f094eb8224aa9b2863f9abd7d0d2489acc263bcd', huella_en: '2026-10-12T15:11:00Z' },
                { version: 1, revision: 'P01', idoneidad: null, emitida_en: null, emitida_por: null,
                  subida_en: '2026-09-02T09:15:00Z', subida_por: 'Eva Autora',
                  huella: '2938b4854ed6e73a05b4d76a548a5273ad563cc0d584d3f520fe53c41e4f39e0', huella_en: '2026-09-02T09:16:00Z' },
            ],
            emisiones: [{ destino: 'SHARED', idoneidad: 'S2', revision: 'P02', por: 'Ana Revisora', cuando: '2026-10-12T16:40:00Z', version: 2 }],
            eventos: [
                { accion: 'acceso_a_documento', por: 'supervision@entidad.gob.pe', detalle: { version: 2, via: 'sesión' }, cuando: '2026-10-13T18:02:00Z', sellado: true },
                { accion: 'cambio_de_estado', por: 'Ana Revisora', detalle: { estado_anterior: 'WIP', estado_nuevo: 'SHARED', codigo_idoneidad: 'S2' }, cuando: '2026-10-12T16:40:00Z', sellado: true },
                { accion: 'upload_file', por: 'Eva Autora', detalle: { version: 2 }, cuando: '2026-10-12T15:10:00Z', sellado: true },
                { accion: 'acceso_a_documento', por: 'contratista@obra.pe', detalle: { version: 1, via: 'enlace firmado' }, cuando: '2026-09-21T08:11:00Z', sellado: false },
            ],
            cadena: { eventos: 4, sellados: 3, roturas: [], tramo_integro: true },
            relacionados: {
                revisiones: [{ id: 41, titulo: 'Planos de estructuras · etapa 2', estado: 'pending', resultado: 'SHARED', creada_en: '2026-10-12T17:00:00Z', cerrada_en: null }],
                envios: [{ id: 12, numero: 12, asunto: 'Entrega a Supervisión', por: 'Eva Autora', cuando: '2026-09-22T09:30:00Z', acuses: 1 }],
                rfis: [{ id: 'r7', codigo: 'RFI-007', titulo: 'Cota de fondo en PK 0+650', estado: 'Respondido', fecha: '2026-09-15T08:20:00Z' }],
                plan: [{ plan: 'MIDP', codigo: 'X', hito: 'Etapa 2', fecha: '2026-10-01', estado: 'vinculado', etiqueta: 'Vinculado' }],
                marcas: { publicadas: 2 },
            },
            huellas_en_curso: 0 }, 150);
    }

    // VISTAS (A2-2): la forma real de `vistas_de_obra.py`, con documentos ISO de
    // varias carpetas. El banco no recalcula: responde lo que diría el servidor.
    if (u.includes('/api/docs/search') && /[?&]vista=/.test(u)) {
        const p = new URLSearchParams(u.split('?')[1]);
        const vista = p.get('vista');
        anotar(`vista ${vista}`);
        if (vista === 'recuentos') {
            const r = {};
            for (const k of Object.keys(VISTAS_BANCO)) r[k] = VISTAS_BANCO[k].length;
            return responder({ success: true, recuentos: r, hay_plan: true, vencidos_sin_documento: 5 }, 120);
        }
        let filas;
        if (vista === 'todos') {
            filas = DOCS_ISO.filter(d => (!p.get('estado') || d.status === p.get('estado'))
                && (!p.get('disciplina') || d.name.split('-')[5] === p.get('disciplina'))
                && (!p.get('tipo') || d.name.split('-')[4] === p.get('tipo')));
        } else {
            filas = VISTAS_BANCO[vista] || [];
        }
        return responder({ success: true, data: filas, total: filas.length, limite: 500,
                           ...(vista === 'plazo_vencido' ? { vencidos_sin_documento: 5 } : {}) }, 250);
    }

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
        {/* Como main.jsx: FilesPage ya no monta su propio Toaster. */}
        <AvisosHost />
    </div>
);
