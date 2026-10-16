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
import { ConfirmHost } from './utils/confirm';

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
const docIso = (n, tipo, disc, status, ubicacion, entrega) => {
    const name = `500125-CSSP001-000-XX-${tipo}-${disc}-${String(n).padStart(6, '0')}.pdf`;
    return { id: `iso${n}`, type: 'file', name, fullName: `${ubicacion}/${name}`, ubicacion, parent_id: 'x',
             status, size: 2400000, version: 2, codigo_revision: status === 'PUBLISHED' ? 'C01' : 'P02',
             codigo_idoneidad: status === 'PUBLISHED' ? 'A1' : 'S2',
             updated: '2026-10-10T15:00:00Z', updated_by: { name: 'Ana Pérez', initials: 'AP' },
             ...(entrega ? { entrega } : {}) };
};
const VENCIDO = { plan: 'MIDP', hito: 'Etapa 2', fecha: '2026-10-01', estado: 'vinculado', etiqueta: 'Vinculado' };
const PRONTO = { plan: 'MIDP', hito: 'Etapa 3', fecha: '2026-10-18', estado: 'vinculado', etiqueta: 'Vinculado' };
const DOCS_ISO = [
    docIso(4120, 'DR', 'ES', 'SHARED', '02_BIM/Estructuras', VENCIDO),
    docIso(4121, 'DR', 'ES', 'WIP', '02_BIM/Estructuras', VENCIDO),
    docIso(4122, 'DR', 'AR', 'SHARED', '02_BIM/Arquitectura', PRONTO),
    docIso(5001, 'M3', 'ES', 'PUBLISHED', '02_BIM/Modelos'),
    docIso(5002, 'RP', 'GE', 'PUBLISHED', '01_COSTOS'),
    docIso(5003, 'DR', 'ES', 'PUBLISHED', '02_BIM/Estructuras', { plan: 'MIDP', hito: 'Etapa 1', fecha: '2026-09-15', estado: 'entregado', etiqueta: 'Entregado' }),
];
// OTROS FORMATOS (ESTANDAR_LDA, capa 1): el cajetín debe salir igual en un modelo, un DWG, un Excel
// o una foto. Aquí no se abren de verdad (no hay visor de Autodesk ni de Office en el banco): se mira
// la cabecera.
const otroFormato = (n, tipo, disc, ext, ubicacion) => {
    const base = docIso(n, tipo, disc, 'PUBLISHED', ubicacion);
    const name = base.name.replace(/\.pdf$/, ext);
    return { ...base, name, fullName: `${ubicacion}/${name}` };
};
const OTROS_FORMATOS = [
    otroFormato(101, 'M3', 'ES', '.rvt', '02_BIM/Modelos'),
    otroFormato(200, 'DR', 'CV', '.dwg', '02_BIM/Civil'),
    otroFormato(410, 'SH', 'ES', '.xlsx', '01_COSTOS'),
    otroFormato(900, 'PH', 'GN', '.jpg', '03_CAMPO'),
    // El Excel REAL de metrados del propietario (public/_probar/listado-real.xlsx, git lo ignora).
    // Es su VERSIÓN 01: una sola versión (no hay anterior).
    { ...otroFormato(261007, 'SH', 'GN', '.xlsx', '01_COSTOS'), name: '261007-ListadoDeCantidades.xlsx', fullName: '01_COSTOS/261007-ListadoDeCantidades.xlsx', version: 1, codigo_revision: null },
];
const VISTAS_BANCO = {
    me_toca_revisar: [DOCS_ISO[0], DOCS_ISO[2]],
    asignados_mi_empresa: [DOCS_ISO[0], DOCS_ISO[1], DOCS_ISO[2]],
    plazo_vencido: [DOCS_ISO[0], DOCS_ISO[1]],
    vence_pronto: [DOCS_ISO[2]],
    publicados_sin_entrega: [DOCS_ISO[3], DOCS_ISO[4]],
    en_revision: [DOCS_ISO[0], DOCS_ISO[2]],
    publicados: [DOCS_ISO[3], DOCS_ISO[4], DOCS_ISO[5], ...OTROS_FORMATOS],
};

// Los vínculos del banco se guardan en localStorage: el circuito planilla ↔ plano usa DOS pestañas, y
// cada una tiene su propia memoria (en producción las dos leen del mismo servidor). Para empezar de cero:
// localStorage.removeItem('banco.sustento') y recargar.
const SEMILLAS_DE_SUSTENTO = [
    { id: 'sus1', item: '02.01.03', cantidad: 30.1, unidad: 'm3', file_node_id: 'iso4120', plano: '500125-CSSP001-000-XX-DR-ES-004120.pdf',
      version_number: 2, version_vigente: 2, version_id: 'v2', pagina: 1, zona: [0.3, 0.12, 0.62, 0.32], nota: 'Sección típica, tramo 2', autor: 'Luis Gómez', mio: false, creado: '2026-10-12T15:00:00Z', planilla_node_id: 'iso410' },
    { id: 'sus2', item: '02.01.04', cantidad: 6.85, unidad: 'm3', file_node_id: 'iso4120', plano: '500125-CSSP001-000-XX-DR-ES-004120.pdf',
      version_number: 1, version_vigente: 2, version_id: 'v1', pagina: 1, zona: [0.3, 0.34, 0.62, 0.4], nota: 'Solado', autor: 'Banco', mio: true, creado: '2026-09-25T15:00:00Z' },
    { id: 'sus3', item: '02.01.03', cantidad: 15.2, unidad: 'm3', file_node_id: 'iso4122', plano: '500125-CSSP001-000-XX-DR-AR-004122.pdf',
      version_number: 2, version_vigente: 2, version_id: 'v2', pagina: 1, zona: [0.1, 0.1, 0.3, 0.3], nota: 'Transiciones', autor: 'Luis Gómez', mio: false, creado: '2026-10-12T15:10:00Z', planilla_node_id: 'iso410' },
];
// GRUPOS DE DOCUMENTOS (routes/grupos.py): uno de la obra («Contractuales») y uno mío. El de la obra
// lleva la planilla real (vigente, subida hace 2 días → «nueva versión») y un informe; el mío, un plano fijo en V1.
window.__grupos = [
    { id: 'g-obra', nombre: 'Contractuales', owner: null, docs: [{ node: 'iso261007', fijo: false }, { node: 'iso5002', fijo: false }] },
    { id: 'g-mio', nombre: 'Valorización octubre', owner: 1, docs: [{ node: 'iso4120', fijo: true }] },
];
window.__grupoNuevo = { iso261007: new Date(Date.now() - 2 * 86400000).toISOString() };
window.__sustento = (() => {
    try { const g = JSON.parse(localStorage.getItem('banco.sustento') || 'null'); if (Array.isArray(g)) return g; } catch { /* sin almacenamiento */ }
    return SEMILLAS_DE_SUSTENTO;
})();
const guardarSustento = () => { try { localStorage.setItem('banco.sustento', JSON.stringify(window.__sustento)); } catch { /* sin almacenamiento */ } };
window.__retrasoBusqueda = 300;
window.__retrasoCarpeta = 300;
window.__retrasoMover = 200;
window.__fallarRestore = false;
window.__fallarMover = 0;
window.__registro = [];
window.__decisiones = [];
window.__revisionConCodigo = null;
window.__fallarDecision = false;
window.__estado = { folders: [...CARPETAS], files: [...FICHEROS], borrados: [...BORRADOS] };

const t0 = Date.now();
const anotar = (l) => window.__registro.push(`${String(Date.now() - t0).padStart(5)}ms  ${l}`);
let siguienteId = 1000;

const responder = (cuerpo, ms = 0, estado = 200) => new Promise(res => {
    const enviar = () => res(new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } }));
    ms ? setTimeout(enviar, ms) : enviar();
});

// SUBIDA FIRMADA SIMULADA: axios sube con XMLHttpRequest (no con fetch) a la URL firmada de GCS. En el
// banco esa URL es https://banco-subida.local/ y se cambia por un GET al propio banco, que contesta 200.
const xhrOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function (metodo, url, ...resto) {
    if (String(url).startsWith('https://banco-subida.local/')) return xhrOpen.call(this, 'GET', '/probar-busqueda.html', ...resto);
    return xhrOpen.call(this, metodo, url, ...resto);
};

// EL AUTOR DE LAS MARCAS: el lector lo lee de `visor_user` (como en producción, donde coincide con el que
// guarda el servidor). Solo en ESTA pestaña (sessionStorage): no se pisa una sesión real del mismo origen.
const AUTOR_DEL_BANCO = (() => {
    try {
        const real = JSON.parse(localStorage.getItem('visor_user') || 'null');
        if (real?.name) return real.name;
        sessionStorage.setItem('visor_user', JSON.stringify({ name: 'Banco', email: 'banco@local' }));
    } catch { /* sin almacenamiento */ }
    return 'Banco';
})();

const original = window.fetch.bind(window);
window.fetch = (url, opciones = {}) => {
    const u = String(typeof url === 'string' ? url : url.url);
    if (!u.includes('/api/')) return original(url, opciones);
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : {};

    if (u.includes('/mi-administracion')) return responder({ es_admin_de_obra: true, es_entity_admin: true });
    // SUSTENTO DE METRADOS (ESTANDAR_LDA §6): GET/POST/DELETE /api/docs/sustento, con la forma real.
    // 004120 trae dos zonas: una medida sobre su V2 (vigente) y otra sobre la V1 (aviso de versión).
    if (u.includes('/api/docs/sustento')) {
        const metodo = (opciones.method || 'GET').toUpperCase();
        // Lo que guardó la otra pestaña del circuito (como leer del servidor).
        try { const g = JSON.parse(localStorage.getItem('banco.sustento') || 'null'); if (Array.isArray(g)) window.__sustento = g; } catch { /* sin almacenamiento */ }
        if (metodo === 'DELETE') {
            const id = decodeURIComponent(u.split('/api/docs/sustento/')[1] || '');
            window.__sustento = window.__sustento.filter(v => v.id !== id);
            guardarSustento();
            return responder({ success: true }, 60);
        }
        if (metodo === 'POST') {
            const doc = [...DOCS_ISO, ...OTROS_FORMATOS, ...window.__estado.files].find(d => d.id === cuerpo.node_id);
            const nuevo = { id: 'sus' + Date.now().toString(36) + (siguienteId++), item: cuerpo.item, cantidad: cuerpo.cantidad === '' || cuerpo.cantidad == null ? null : Number(String(cuerpo.cantidad).replace(',', '.')),
                unidad: cuerpo.unidad || null, file_node_id: cuerpo.node_id, plano: doc ? doc.name : 'plano.pdf',
                version_number: cuerpo.version_id === 'v1' ? 1 : 2, version_vigente: 2, version_id: cuerpo.version_id || 'v2',
                pagina: cuerpo.pagina || 1, zona: cuerpo.zona, nota: cuerpo.nota || null, autor: 'Banco', mio: true, creado: new Date().toISOString(),
                planilla_node_id: cuerpo.planilla_node_id || null };
            window.__sustento.push(nuevo);
            guardarSustento();
            return responder({ success: true, id: nuevo.id, version_number: nuevo.version_number }, 80, 201);
        }
        const nodo = decodeURIComponent((u.match(/[?&]node_id=([^&]+)/) || [])[1] || '');
        const ambito = (u.match(/[?&]ambito=([^&]+)/) || [])[1] || 'documento';
        const lista = ambito === 'obra' ? window.__sustento : window.__sustento.filter(v => v.file_node_id === nodo);
        return responder({ success: true, ambito, vinculos: lista }, 80);
    }


    // GRUPOS: GET/POST /api/docs/grupos, DELETE /grupos/<id>, GET/POST /grupos/<id>/documentos,
    // PATCH/DELETE /grupos/<id>/documentos/<nodo>. Con la forma real (ruta sin la raíz y carpeta_id).
    if (u.includes('/api/docs/grupos')) {
        const metodo = (opciones.method || 'GET').toUpperCase();
        const partes = u.split('?')[0].split('/api/docs/grupos')[1].split('/').filter(Boolean).map(decodeURIComponent);
        const todos = [...DOCS_ISO, ...OTROS_FORMATOS, ...window.__estado.files];
        const nuevo = (d) => !d.fijo && !!window.__grupoNuevo[d.node];
        if (!partes.length) {
            if (metodo === 'POST') {
                const nombre = String(cuerpo.nombre || '').trim().replace(/\s+/g, ' ');
                if (!nombre) return responder({ success: false, error: 'Pon un nombre al grupo.' }, 60, 400);
                if (window.__grupos.some(g => g.nombre.toLowerCase() === nombre.toLowerCase() && (g.owner === null) === !!cuerpo.de_la_obra))
                    return responder({ success: false, error: `Ya tienes un grupo «${nombre}».` }, 60, 409);
                const g = { id: 'g' + (siguienteId++), nombre, owner: cuerpo.de_la_obra ? null : 1, docs: [] };
                window.__grupos.push(g);
                return responder({ success: true, id: g.id, nombre, de_la_obra: g.owner === null }, 80, 201);
            }
            return responder({ success: true, puede_crear_de_la_obra: true, grupos: window.__grupos.map(g => ({
                id: g.id, nombre: g.nombre, de_la_obra: g.owner === null, documentos: g.docs.length,
                con_version_nueva: g.docs.filter(nuevo).length })) }, 80);
        }
        const g = window.__grupos.find(x => x.id === partes[0]);
        if (!g) return responder({ success: false, error: 'Grupo no encontrado.' }, 60, 404);
        if (partes.length === 1 && metodo === 'DELETE') {
            window.__grupos = window.__grupos.filter(x => x !== g);
            return responder({ success: true }, 60);
        }
        if (partes.length === 2 && metodo === 'POST') {
            if (g.docs.some(d => d.node === cuerpo.node_id)) return responder({ success: true, ya_estaba: true }, 60);
            g.docs.push({ node: cuerpo.node_id, fijo: !!cuerpo.fijar });
            return responder({ success: true, ya_estaba: false }, 80, 201);
        }
        if (partes.length === 3) {
            const d = g.docs.find(x => x.node === partes[2]);
            if (!d) return responder({ success: false, error: 'Ese documento no está en el grupo.' }, 60, 404);
            if (metodo === 'DELETE') g.docs = g.docs.filter(x => x !== d);
            else d.fijo = !!cuerpo.fijar;
            return responder({ success: true }, 60);
        }
        const documentos = g.docs.map(d => {
            const f = todos.find(x => x.id === d.node);
            if (!f) return null;
            const ruta = (f.ubicacion || (f.fullName || '').split('/').slice(0, -1).join('/')).split('/').filter(x => x && x !== 'banco');   // sin la raíz, como el servidor
            const fijo = d.fijo ? { id: 'v1', version_number: 1, gcs_urn: `banco/${f.name}@v1`, codigo_revision: 'C00',
                                    updated: '2026-09-20T15:00:00Z', updated_by: 'Ana Pérez' } : null;
            return { file: { ...f, fullName: ['banco', ...ruta, f.name].join('/') }, ruta, carpeta_id: null,
                     version_vigente: f.version || 1, fijo, nueva_version: nuevo(d), vigente_desde: window.__grupoNuevo[d.node] || null };
        }).filter(Boolean);
        return responder({ success: true, grupo: { id: g.id, nombre: g.nombre, de_la_obra: g.owner === null }, documentos }, 120);
    }

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
    // DECIDIR DESDE EL LECTOR (C2): la forma real de GET /api/reviews/<id> y de
    // POST /api/reviews/<id>/act. La RV-041 incluye 4120 y 4122; la 9 es de otra
    // obra (404). Palancas: __revisionConCodigo ('B1' o null), __decisiones (lo
    // que se envió) y __fallarDecision (409 con el mensaje del servidor).
    const deRevision = u.match(/\/api\/reviews\/(\d+)(\/act)?(?:\?|$)/);
    if (deRevision) {
        const [, rid, act] = deRevision;
        if (rid !== '41') return responder({ success: false, error: 'No encontrada' }, 60, 404);
        if (act) {
            if (window.__fallarDecision) {
                return responder({ success: false, error: 'La versión cambió: vuelve a mandarlo a revisión.' }, 150, 409);
            }
            window.__decisiones.push(cuerpo);
            return responder({ success: true }, 150);
        }
        const decidida = window.__decisiones.length > 0;
        return responder({ success: true, revision: {
            id: 41, codigo: 'RV-041', title: 'Planos de estructuras', status: decidida ? 'approved' : 'pending',
            items: [{ node_id: 'iso4120', name: DOCS_ISO[0].name }, { node_id: 'iso4122', name: DOCS_ISO[2].name }],
            steps: [{ name: 'Eva Autora' }, { name: 'Ana Revisora' }], current_step: 1,
            codigo_idoneidad: window.__revisionConCodigo || null, paso_vence_en: enDias(-2),
            acciones: decidida ? { aprobar: { disponible: false }, rechazar: { disponible: false } } : {
                aprobar: { disponible: true, tipo: 'aprobar_y_cerrar', destino: 'PUBLISHED' },
                rechazar: { disponible: true },
            },
        } }, 120);
    }
    // EL LECTOR CON UN PLANO DE VERDAD: los PDF de public/_probar (no van a git).
    // Cada documento, siempre el mismo plano. Y su historial con la REVISIÓN de
    // cada versión (V2 · P02 vigente, V1 · P01 anterior), como /api/docs/versions.
    if (u.includes('/api/docs/signed-url')) {
        const ruta = decodeURIComponent((u.match(/[?&](?:path|urn)=([^&]+)/) || [])[1] || '');
        // Un informe (tipo RP) abre un DOCUMENTO de varias páginas con índice (LDA-1, modo Documento).
        if (/-RP-/i.test(ruta)) return responder({ success: true, url: '/_probar/informe-RP.pdf' }, 60);
        // Una planilla (tipo SH) abre un EXCEL de verdad (LDA, modo Tabla).
        // Su Excel real de metrados, versión 01 (la única).
        if (/261007/.test(ruta)) return responder({ success: true, url: '/_probar/listado-real.xlsx' }, 60);
        if (/-SH-/i.test(ruta)) return responder({ success: true, url: '/_probar/planilla-SH.xlsx' }, 60);
        const letra = 'ABCDEFGHI'[[...ruta].reduce((a, c) => a + c.charCodeAt(0), 0) % 9];
        return responder({ success: true, url: `/_probar/plano-${letra}.pdf` }, 60);
    }
    if (u.includes('/api/docs/versions')) {
        // Cada versión apunta al archivo DE SU documento (como en producción): antes todas decían
        // «banco/v2.pdf», y al pulsar Vigente/Anterior una planilla recibía un PDF (15-oct-2026).
        const idDoc = decodeURIComponent((u.match(/[?&]id=([^&]+)/) || [])[1] || '');
        const doc = [...DOCS_ISO, ...OTROS_FORMATOS].find(d => d.id === idDoc);
        const urn = (v) => `banco/${doc ? doc.name : idDoc}@v${v}`;
        // Un documento con una sola versión (el Excel real del propietario, versión 01) no inventa una anterior.
        if (doc && doc.version === 1) {
            return responder({ success: true, versions: [{ id: 'v1', version_number: 1, codigo_revision: null, updated: '2026-10-15T21:00:00Z', updated_by: 'Propietario', gcs_urn: urn(1) }] }, 60);
        }
        return responder({ success: true, versions: [
            { id: 'v2', version_number: 2, codigo_revision: 'P02', updated: '2026-10-10T15:00:00Z', updated_by: 'Ana Pérez', gcs_urn: urn(2), sha256: 'a3f29c1e54b0d2e80f17c6aa9e31b7d4c2a8e19f6b3d5a7c9e0f1a2b3c4d7d40' },
            { id: 'v1', version_number: 1, codigo_revision: 'P01', updated: '2026-09-20T15:00:00Z', updated_by: 'Ana Pérez', gcs_urn: urn(1) },
        ] }, 60);
    }
    // MARCAS DEL PLANO (Medir, Nube, Flecha…) y su ESCALA, con la forma real de routes/pdf_tools.py. Se
    // guardan en localStorage para que sobrevivan a cerrar y reabrir el plano, como en producción una vez
    // aplicada la migración 32. Para empezar de cero: localStorage.removeItem('banco.marcas').
    // ── FOTO, SELLO Y REFERENCIAS (16-oct-2026) ─────────────────────────────────
    // Las fotos subidas viven en localStorage 'banco.fotos' (como documentos de MULTIMEDIA/). La subida
    // firmada a GCS la contesta el parche de XMLHttpRequest de más abajo.
    const fotosDelBanco = () => { try { return JSON.parse(localStorage.getItem('banco.fotos') || '[]'); } catch { return []; } };
    const docsConocidos = () => [...DOCS_ISO, ...OTROS_FORMATOS, ...window.__estado.files, ...fotosDelBanco()];
    const conEnlaces = (m) => {
        const docs = docsConocidos();
        const una = (id) => { const d = docs.find(x => x.id === id); return d ? { id, nombre: d.name } : { id, eliminado: true }; };
        return { ...m, citas: ((m.style || {}).citas || []).map(una), fotos: ((m.style || {}).fotos || []).map(una) };
    };
    if (u.includes('/api/docs/upload-url')) {
        return responder({ success: true, uploadUrl: 'https://banco-subida.local/put', gcs_urn: `banco/MULTIMEDIA/${cuerpo.filename}` }, 50);
    }
    if (u.includes('/api/docs/upload-confirm')) {
        const fotos = fotosDelBanco();
        const f = { id: 'foto-' + Date.now().toString(36) + (siguienteId++), name: cuerpo.filename, type: 'file', ubicacion: 'MULTIMEDIA' };
        fotos.push(f);
        try { localStorage.setItem('banco.fotos', JSON.stringify(fotos)); } catch { /* sin almacenamiento */ }
        anotar(`subida confirmada en ${cuerpo.path}: ${cuerpo.filename}`);
        return responder({ success: true, file: { id: f.id, name: f.name } }, 80);
    }
    if (u.includes('/api/docs/proxy')) {
        // Una «foto» dibujada: fondo de obra, el nombre y si es miniatura.
        const id = decodeURIComponent((u.match(/[?&]id=([^&]+)/) || [])[1] || '');
        const f = docsConocidos().find(x => x.id === id);
        const mini = u.includes('thumb=1');
        const c = document.createElement('canvas');
        c.width = mini ? 240 : 1200; c.height = mini ? 180 : 900;
        const g = c.getContext('2d');
        const grad = g.createLinearGradient(0, 0, 0, c.height);
        grad.addColorStop(0, '#9fb7c9'); grad.addColorStop(0.55, '#c9c2b0'); grad.addColorStop(1, '#8a7a5c');
        g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
        g.fillStyle = '#5b5b55'; g.fillRect(c.width * 0.2, c.height * 0.55, c.width * 0.6, c.height * 0.12);
        g.fillStyle = '#fff'; g.font = `${mini ? 14 : 40}px sans-serif`; g.fillText(f ? f.name : id, 12, mini ? 24 : 60);
        return new Promise(res => c.toBlob(b => res(new Response(b, { status: 200, headers: { 'Content-Type': 'image/png' } })), 'image/png'));
    }
    if (u.includes('/api/pdf/citado-en')) {
        const nodo = decodeURIComponent((u.match(/[?&]node_id=([^&]+)/) || [])[1] || '');
        let todas = []; try { todas = JSON.parse(localStorage.getItem('banco.marcas') || '[]'); } catch { /* vacío */ }
        const docs = docsConocidos();
        const citas = todas.filter(m => ((m.style || {}).citas || []).includes(nodo) || ((m.style || {}).fotos || []).includes(nodo))
            .map(m => ({ marca: m.id, tipo: m.kind, pagina: m.page, plano: { id: m.node_id, nombre: (docs.find(d => d.id === m.node_id) || {}).name || 'plano.pdf' },
                         autor: m.created_by, fecha: m.created_at, publicado: !!m.publicado,
                         como: ((m.style || {}).fotos || []).includes(nodo) ? 'foto' : 'referencia' }));
        return responder({ success: true, citas }, 40);
    }
    if (u.includes('/api/pdf/markups')) {
        const metodo = (opciones.method || 'GET').toUpperCase();
        let todas = []; try { todas = JSON.parse(localStorage.getItem('banco.marcas') || '[]'); } catch { /* vacío */ }
        const guardar = () => { try { localStorage.setItem('banco.marcas', JSON.stringify(todas)); } catch { /* sin almacenamiento */ } };
        // Antes que el alta: también es un POST.
        if (u.includes('/publicar')) {
            const id = Number((u.match(/\/api\/pdf\/markups\/(\d+)/) || [])[1]);
            const m = todas.find(x => x.id === id);
            if (!m) return responder({ success: false, error: 'La marca no existe.' }, 30, 404);
            m.publicado = cuerpo.publicado !== false; guardar();
            return responder({ success: true, publicado: m.publicado }, 40);
        }
        if (metodo === 'POST') {
            const m = { id: Date.now(), node_id: cuerpo.node_id, page: cuerpo.page, kind: cuerpo.kind, geometry: cuerpo.geometry,
                        style: cuerpo.style, text: cuerpo.text, created_by: AUTOR_DEL_BANCO, created_at: new Date().toISOString() };
            todas.push(m); guardar();
            return responder({ success: true, id: m.id }, 40);
        }
        if (metodo === 'DELETE') {
            const id = Number((u.match(/\/api\/pdf\/markups\/(\d+)/) || [])[1]);
            todas = todas.filter(m => m.id !== id); guardar();
            return responder({ success: true }, 30);
        }
        if (metodo === 'PATCH') {
            const id = Number((u.match(/\/api\/pdf\/markups\/(\d+)/) || [])[1]);
            const m = todas.find(x => x.id === id);
            if (!m) return responder({ success: false, error: 'La marca no existe.' }, 30, 404);
            m.style = { ...(m.style || {}) };
            m.geometry = { ...(m.geometry || {}) };
            if (cuerpo.citas) m.style.citas = [...new Set(cuerpo.citas)];
            if (cuerpo.fotos) m.style.fotos = [...new Set(cuerpo.fotos)];
            if (cuerpo.sello) m.style.sello = cuerpo.sello;
            if (cuerpo.angulo != null) m.geometry.ang = ((Number(cuerpo.angulo) % 360) + 360) % 360;
            guardar();
            anotar(`marca ${id} editada: ${Object.keys(cuerpo).join(', ')}`);
            return responder({ success: true, markup: conEnlaces(m) }, 50);
        }
        const nodo = decodeURIComponent((u.match(/[?&]node_id=([^&]+)/) || [])[1] || '');
        return responder({ success: true, markups: todas.filter(m => m.node_id === nodo).map(conEnlaces) }, 30);
    }
    if (u.includes('/api/pdf/calibration')) {
        const metodo = (opciones.method || 'GET').toUpperCase();
        let cal = {}; try { cal = JSON.parse(localStorage.getItem('banco.escalas') || '{}'); } catch { /* vacío */ }
        if (metodo === 'PUT') {
            cal[cuerpo.node_id] = { ...(cal[cuerpo.node_id] || {}), [String(cuerpo.page)]: { units_per_pdf: cuerpo.units_per_pdf, display_unit: cuerpo.display_unit } };
            try { localStorage.setItem('banco.escalas', JSON.stringify(cal)); } catch { /* sin almacenamiento */ }
            return responder({ success: true }, 30);
        }
        const nodo = decodeURIComponent((u.match(/[?&]node_id=([^&]+)/) || [])[1] || '');
        return responder({ success: true, calibrations: cal[nodo] || {} }, 30);
    }
    if (u.includes('/api/docs/vista-previa/url') || u.includes('/api/docs/mosaico')) {
        return responder({ success: true, url: null, manifiesto: null, urls: {}, pendiente: false }, 30);
    }
    if (u.includes('/api/docs/idoneidad')) {
        return responder({ success: true, codigos: [
            { codigo: 'A1', etiqueta: 'Apto para construir', familia: 'publicado' },
            { codigo: 'B1', etiqueta: 'Apto con observaciones', familia: 'publicado' },
            { codigo: 'S2', etiqueta: 'Apto para información', familia: 'compartido' },
        ] }, 80);
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

    // ABRIR POR ENLACE (`?documento=…`): la forma real de GET /api/docs/ubicacion (enlaces_de_archivos.ubicar):
    // { carpeta, ruta: [{id, name}] sin la raíz, documento, version }. Sin esto, «+ Vincular un plano» abría
    // Archivos sin el plano y la intención de vincular se perdía.
    if (u.includes('/api/docs/ubicacion')) {
        const q = new URLSearchParams(u.split('?')[1] || '');
        const doc = q.get('documento');
        if (!doc) return responder({ success: true, carpeta: null, ruta: [], documento: null, version: null }, 60);
        const f = [...DOCS_ISO, ...OTROS_FORMATOS, ...window.__estado.files].find(x => x.id === doc);
        if (!f) return responder({ success: false, error: 'Enlace no disponible' }, 60, 404);
        const nombres = (f.ubicacion || '').split('/').filter(Boolean);
        const ruta = nombres.map((n, i) => ({ id: `n-banco/${nombres.slice(0, i + 1).join('/')}/`, name: n }));
        const v = q.get('version');
        return responder({ success: true, carpeta: ruta.length ? ruta[ruta.length - 1].id : null, ruta, documento: doc,
            version: v ? { id: v, version_number: v === 'v1' ? 1 : (f.version || 1), gcs_urn: `banco/${f.name}@${v}` } : null }, 80);
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
        // Los documentos ISO y de otros formatos viven en su carpeta (`ubicacion`), como en una obra real.
        const aqui = [...DOCS_ISO, ...OTROS_FORMATOS].filter(f => !esRaiz && `banco/${f.ubicacion}/` === (ruta.endsWith('/') ? ruta : ruta + '/'));
        return responder({ success: true, data: {
            folders: hijas, files: esRaiz ? [...window.__estado.files] : aqui, current_node_id: esRaiz ? 'raiz' : `n-${ruta}`,
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
        {/* Y las confirmaciones, como main.jsx (decidir desde el lector las usa). */}
        <ConfirmHost />
    </div>
);
