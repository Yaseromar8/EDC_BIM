import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { loadAlignedModels } from '../aps/utils/loadAlignedModels';
import { linajeDeUrn } from '../lib/savedViewV2';

/**
 * CompareView — Comparador (contractual vs avance), estilo ACC Compare pero propio.
 *
 *  - Setup minimalista: modelo/documento + VERSION ACC por lado (como el dialogo
 *    "Comparar documentos" de ACC), con swap A<->B.
 *  - Diff de DATOS en PostgreSQL por external_id. SIN importes: este
 *    comparador responde a que se agrego, que se quito y que cambio.
 *  - Si una version historica no esta extraida, se extrae automaticamente a un
 *    scope temporal ('__cmp__') sin tocar el inventario del frente real.
 *  - Vista: dos visores LMV sincronizados; verde agregado / rojo eliminado /
 *    ambar modificado; hover = identifica el elemento; click = seleccion espejo.
 */

const COLORS = {
    added: [0.22, 0.65, 0.15],     // verde
    removed: [0.89, 0.29, 0.29],   // rojo
    modified: [0.82, 0.20, 0.85],  // magenta — distinto del material naranja de los modelos
};

// ── Design tokens (minimalista profesional, alineado al dark theme de la app) ──
const T = {
    bg: '#15181d', panel: '#1b2026', panelSoft: '#20262d',
    border: '1px solid rgba(255,255,255,0.08)', borderSoft: '1px solid rgba(255,255,255,0.05)',
    text: '#ccd2d9', muted: '#8a93a0', faint: '#5d6672',
    accent: '#3d7eff', green: '#5fbf67', red: '#e06a6a', amber: '#dba94d', magenta: '#cf57d6',
    radius: 8,
};

const S = {
    overlay: { position: 'fixed', inset: 0, zIndex: 9000, background: T.bg, display: 'flex', flexDirection: 'column', color: T.text, fontFamily: 'inherit', fontSize: 13 },
    // setup
    setupWrap: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
    setupCard: { width: 'min(980px, 94vw)', background: T.panel, border: T.border, borderRadius: 12, padding: '26px 30px' },
    sideCard: { flex: 1, background: T.panelSoft, border: T.borderSoft, borderRadius: T.radius, padding: '16px 18px', minWidth: 0 },
    label: { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.muted, marginBottom: 10, fontWeight: 600 },
    select: { width: '100%', background: T.bg, color: T.text, border: T.border, borderRadius: 6, padding: '8px 10px', fontSize: 13, outline: 'none', marginBottom: 10 },
    btnPrimary: { background: T.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '9px 22px', fontSize: 13, cursor: 'pointer', fontWeight: 600 },
    btnGhost: { background: 'transparent', color: T.muted, border: T.border, borderRadius: 6, padding: '8px 16px', fontSize: 13, cursor: 'pointer' },
    btnIcon: { background: 'transparent', color: T.muted, border: T.border, borderRadius: '50%', width: 34, height: 34, cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    // view
    topBar: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: T.border, background: T.panel },
    chipSide: { fontSize: 12, padding: '4px 10px', borderRadius: 6, background: T.panelSoft, border: T.borderSoft, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 300 },
    viewers: { flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, minHeight: 0, background: 'rgba(255,255,255,0.06)' },
    pane: { position: 'relative', background: '#0e1115', overflow: 'hidden' },
    paneTag: { position: 'absolute', top: 10, left: 12, zIndex: 5, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', padding: '3px 10px', borderRadius: 5, background: 'rgba(13,16,20,0.75)', border: T.borderSoft },
    statusBar: { padding: '5px 14px', fontSize: 12, color: T.muted, borderTop: T.borderSoft, background: T.panel },
    bottom: { borderTop: T.border, padding: '10px 14px', display: 'flex', gap: 16, alignItems: 'flex-start', maxHeight: 230, background: T.panel },
    pill: (color, active) => ({ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontSize: 12.5, padding: '6px 12px', borderRadius: 6, border: active ? `1px solid ${color}` : T.border, color: T.text, background: active ? 'rgba(255,255,255,0.04)' : 'transparent', whiteSpace: 'nowrap' }),
    dot: (color) => ({ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }),
    list: { flex: 1, overflowY: 'auto', maxHeight: 180, fontSize: 12.5 },
    listItem: { padding: '4px 8px', borderBottom: T.borderSoft, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: T.muted },
    detail: { flex: 1.2, overflowY: 'auto', maxHeight: 180, fontSize: 12.5, background: T.panelSoft, borderRadius: T.radius, padding: '10px 12px', border: T.borderSoft },
};

const createEmptySide = () => ({
    pickerSel: '',
    pickerVersions: [],
    pickerVUrn: '',
    pickerLoadingV: false,
    // QUE VISTA DEL MODELO SE MIRA. Vacio = la que marque Autodesk, que es el
    // comportamiento de siempre. No cambia QUE se compara -- el diff lo calcula
    // Postgres sobre los elementos extraidos -- sino desde donde se mira.
    pickerViews: [],
    pickerViewGuid: '',
    pickerLoadingViews: false,
    links: [],
});

// Las vistas 3D de una version, leidas de su manifiesto. Solo 3D a proposito:
// el pintado del diff trabaja sobre dbId de geometria y no esta comprobado que
// una lamina 2D los tenga, asi que ofrecerla seria cargar el dibujo sin colores.
//
// Si algo falla -- sin SDK, sin manifiesto, sin red -- devuelve lista vacia y el
// selector se queda en «Vista por defecto»: nunca deja al usuario sin comparar.
const vistas3DDe = (urn) => new Promise((resolve) => {
    const A = window.Autodesk?.Viewing;
    if (!A?.Document?.load || !urn) return resolve([]);
    const esTresD = (n) => (typeof n.is3D === 'function' ? n.is3D() : n?.data?.role === '3d');
    try {
        A.Document.load(
            String(urn).startsWith('urn:') ? String(urn) : `urn:${urn}`,
            (doc) => {
                try {
                    const geos = doc.getRoot().search({ type: 'geometry' }) || [];
                    resolve(geos.filter(esTresD).map(n => ({
                        guid: n.data.guid,
                        name: n.data.name || 'Sin nombre',
                    })));
                } catch { resolve([]); }
            },
            () => resolve([]),
        );
    } catch { resolve([]); }
});

// Lo que contesta el servidor cuando NO arranca la extraccion, en palabras.
// Antes se perdia: el usuario veia «No se pudo iniciar la extraccion» y el
// motivo real (18-sep-2026: 409 SOURCE_SCOPE_AMBIGUOUS) habia que ir a buscarlo
// a la consola. El codigo se deja entre parentesis para poder buscarlo.
const MOTIVOS_DE_EXTRACCION = {
    SOURCE_SCOPE_AMBIGUOUS: 'este documento está vinculado en más de una obra y no se pudo saber desde cuál comparas',
    SOURCE_NOT_REGISTERED: 'esta versión no pertenece a ningún modelo vinculado',
    FORBIDDEN_SCOPE: 'no tienes acceso a la obra de este modelo',
    AUTH_REQUIRED: 'la sesión ha caducado; vuelve a entrar',
};
const explicarExtraccion = (label, status, cuerpo) => {
    const code = cuerpo && cuerpo.code;
    const motivo = MOTIVOS_DE_EXTRACCION[code] || (cuerpo && cuerpo.error) || `el servidor contestó ${status}`;
    return `No se pudo iniciar la extracción de ${label}: ${motivo}${code ? ` (${code})` : ''}`;
};

// El documento de un modelo, escrito como lo guarda el inventario: base64
// URL-safe sin relleno. Asi se casa con las `fuentes` que devuelve el diff.
const normalizarUrn = (u) => {
    let s = String(u || '').trim();
    if (/^urn:adsk\.[a-z0-9]+:fs\.file:/i.test(s)) {
        try { s = btoa(s); } catch { return ''; }
    }
    return s.replace(/^urn:/i, '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

// De que documento es un modelo cargado. LMV lo lleva en el nodo raiz de su
// documento (`getSeedUrn` no sirve: es la ruta del derivado, no el documento).
const urnDelModelo = (model) => {
    try {
        const raiz = model?.getDocumentNode?.()?.getRootNode?.();
        const u = raiz && (typeof raiz.urn === 'function' ? raiz.urn() : raiz.data?.urn);
        return normalizarUrn(u || model?.getData?.()?.urn || '');
    } catch { return ''; }
};

// DONDE ESTA, EN EL VISOR DE UN LADO, UN ELEMENTO DEL DIFF. `estado` es el de
// los visores (`vs.current`). Con varios documentos en algun lado el diff dice
// de que documento es cada fila (`fa`/`fb`, indices en `fuentes`) y se busca
// SOLO en ese fichero: un derivado como «…-ENCOFRADOS» comparte miles de
// identificadores con su padre (131.833, medido el 18-sep-2026), y el mapa de
// siempre pintaba el elemento en el fichero que se hubiera cargado el ultimo.
const objetivoEn = (estado, k, it) => {
    const { porDocumento, fuentes, docs, maps } = estado;
    if (porDocumento && fuentes) {
        const indice = k === 'a' ? it.fa : it.fb;
        if (indice === undefined || !fuentes[k]) return null;
        const modelo = docs?.[k]?.modeloPorUrn.get(normalizarUrn(fuentes[k][indice]));
        const dbId = modelo ? docs[k].porModelo.get(modelo)?.[it.id] : undefined;
        return dbId === undefined ? null : { id: dbId, model: modelo };
    }
    return maps?.[k]?.[it.id] || null;
};

// El mismo elemento en el otro lado. Por documento: en el fichero del MISMO
// linaje, o en ninguno; nunca en otro que solo comparta el identificador.
const destinoEspejo = (estado, k, otro, modelo, ext) => {
    const { porDocumento, docs, maps } = estado;
    if (porDocumento && docs?.[k] && docs?.[otro]) {
        const linaje = docs[k].linajePorModelo.get(modelo);
        const suyo = linaje ? docs[otro].modeloPorLinaje.get(linaje) : null;
        const dbId = suyo ? docs[otro].porModelo.get(suyo)?.[ext] : undefined;
        return dbId === undefined ? null : { id: dbId, model: suyo };
    }
    return maps?.[otro] ? maps[otro][ext] || null : null;
};

const modelKey = (model) => {
    if (!model) return '__unknown__';
    try {
        return String(model.id || model.getData?.().urn || model.getData?.().guid || '__unknown__');
    } catch (e) {
        return '__unknown__';
    }
};

// EL LADO CON PIEZAS SEMITRANSPARENTES SE DIBUJA ENTERO EN CADA FOTOGRAMA.
// LMV pinta las transparentes solo cuando ha terminado TODAS las opacas, y con
// el dibujo progresivo cada movimiento de camara empieza la hoja de cero: con
// un modelo pesado no termina mientras la camara se mueve, y las transparentes
// no salen hasta que se para. Ese era el parpadeo del lado rojo. Medido el
// 18-sep-2026 en produccion (A = 004120 v2, 304.373 piezas, 2.749 al 50 %;
// B = v58): girando B, A salio SIN ellas en 6 de 6, 7 de 7 y 45 de 74
// fotogramas; dibujandolo entero, en 0 de 8, 9 y 53, y completo ~50 ms despues
// de parar (antes, ~1 s). La transparencia es del modelo y no se toca. Se
// decide con la geometria ya cargada, para no frenar la carga. El ajuste no se
// guarda en el navegador: LMV no lo tiene entre sus preferencias persistentes.
const conPiezasTransparentes = (viewer) => (viewer.getAllModels ? viewer.getAllModels() : []).some(model => {
    const lista = model.getFragmentList && model.getFragmentList();
    if (!lista) return false;
    for (let f = 0, n = lista.getCount(); f < n; f++) {
        const material = lista.getMaterial(f);
        if (material && material.transparent) return true;
    }
    return false;
});
const dibujarEnteroSiHayTransparentes = (viewer) => {
    const evento = window.Autodesk.Viewing.GEOMETRY_LOADED_EVENT;
    const todoCargado = () => viewer.getAllModels().every(m => !m.isLoadDone || m.isLoadDone());
    const decidir = () => {
        if (conPiezasTransparentes(viewer)) viewer.setProgressiveRendering(false);
    };
    if (todoCargado()) { decidir(); return; }
    const alCargar = () => {
        if (!todoCargado()) return;
        viewer.removeEventListener(evento, alCargar);
        decidir();
    };
    viewer.addEventListener(evento, alCargar);
};

export default function CompareView({ BACKEND_URL, projectId, onExit }) {
    const [phase, setPhase] = useState('setup');           // 'setup' | 'view'
    const [models, setModels] = useState([]);
    const [side, setSide] = useState({
        a: createEmptySide(),
        b: createEmptySide(),
    });
    const [status, setStatus] = useState('');
    const [busy, setBusy] = useState(false);
    const [diff, setDiff] = useState(null);
    const [activeList, setActiveList] = useState(null);
    const [detail, setDetail] = useState(null);
    const [tip, setTip] = useState(null);
    const contA = useRef(null);
    const contB = useRef(null);
    const tipEl = useRef(null);
    const scopesRef = useRef(null);
    const vs = useRef({ a: null, b: null, maps: {}, rev: {}, docs: {}, porDocumento: false, fuentes: null, syncing: false, selSyncing: false });

    useEffect(() => {
        // La obra viaja en la peticion. Sin ella, el control de acceso por obra
        // no puede saber de que obra habla esta pantalla, y al encender
        // ENFORCE_PROJECT_AUTHZ responderia 403 a un usuario legitimo. El resto
        // de App.jsx ya la manda asi (`?project=${selectedProject.id}`); esta
        // pantalla era la unica que la omitia.
        const conObra = projectId
            ? `${BACKEND_URL}/api/config/project?project=${encodeURIComponent(projectId)}`
            : `${BACKEND_URL}/api/config/project`;
        apiFetch(conObra)
            .then(r => r.json())
            .then(cfg => setModels(cfg.models || []))
            .catch(() => setStatus('No se pudo cargar la lista de modelos.'));
        // Purgar temporales de sesiones anteriores (por si quedo algo de un crash)
        apiFetch(`${BACKEND_URL}/api/compare/cleanup`, { method: 'POST' }).catch(() => { });
    }, [BACKEND_URL, projectId]);

    // Salir SIEMPRE limpia las extracciones temporales: no queda nada en la BD.
    const doExit = useCallback(() => {
        apiFetch(`${BACKEND_URL}/api/compare/cleanup`, { method: 'POST' }).catch(() => { });
        onExit();
    }, [BACKEND_URL, onExit]);

    // Pausar el visor PRINCIPAL mientras comparamos, por si sigue vivo. Tener 3
    // visores LMV activos satura GPU/RAM. Se para su bucle de dibujo y se
    // reanuda al salir.
    //
    // HOY NO HAY NADA QUE PAUSAR (medido en produccion el 18-sep-2026): App
    // desmonta el visor principal mientras se compara (`{!compareMode &&
    // <Viewer/>}`, desde el 12-jun) y lo vuelve a crear al salir, asi que cuando
    // corre esto ya esta destruido y no se toca. Queda por si algun dia se deja
    // montado. La version anterior llamaba a `viewer.stop()`, que no existe en
    // LMV 7.x: el bucle vive en `viewer.impl` (`run`/`stop` lo ponen y lo quitan
    // del bucle comun). Solo se para el que esta corriendo: `impl.stop()` sobre
    // un visor ya parado quita del bucle a OTRO (LMV hace `splice(indexOf, 1)`
    // con -1). (El parpadeo NO venia de aqui: ver `wireSync`.)
    useEffect(() => {
        const principales = [...new Set([window.__mainViewer, window.NOP_VIEWER].filter(Boolean))];
        const pausados = principales.filter(v => {
            try { return !!(v.impl && v.impl._renderLoopOn); } catch { return false; }
        });
        pausados.forEach(v => { try { v.impl.stop(); } catch { /* noop */ } });
        return () => {
            // Si el visor se destruyo mientras tanto, `impl` ya no esta: no hay
            // nada que reanudar. `run()` ignora al que ya corre.
            pausados.forEach(v => { try { v.impl && v.impl.run(); } catch { /* noop */ } });
        };
    }, []);

    const frentes = useMemo(() => [...new Set(models.map(m => m.appProjectId).filter(Boolean))], [models]);
    const byFrente = useMemo(() => {
        const g = {};
        models.forEach(m => { (g[m.appProjectId || 'otros'] = g[m.appProjectId || 'otros'] || []).push(m); });
        return g;
    }, [models]);

    // ── Seleccion por lado: al elegir modelo, cargar sus versiones ACC ──
    const pickModel = (key, val) => {
        setSide(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                pickerSel: val,
                pickerVersions: [],
                pickerVUrn: '',
                pickerLoadingV: val && !val.startsWith('frente:'),
                // Otro modelo, otras vistas: la lista anterior ya no aplica.
                pickerViews: [],
                pickerViewGuid: '',
                pickerLoadingViews: false
            }
        }));
        if (!val || val.startsWith('frente:')) return;
        const m = models.find(x => String(x.id) === val);
        if (!m) return;
        apiFetch(`${BACKEND_URL}/api/compare/versions?model_id=${encodeURIComponent(val)}`)
            .then(r => r.json())
            .then(d => {
                const versions = d.versions || [{ versionNumber: m.versionNumber, urn: m.urn, isCurrent: true }];
                const current = versions.find(v => v.isCurrent) || versions[0];
                setSide(prev => {
                    // LA RESPUESTA PUEDE LLEGAR TARDE. Pedir versiones tarda, y con
                    // varios modelos por lado se cambia de modelo antes de que
                    // conteste el anterior: esa respuesta caia igual en el selector
                    // y se veian las versiones de OTRO modelo. Si ya no es el modelo
                    // seleccionado, esta respuesta no interesa a nadie.
                    if (prev[key].pickerSel !== val) return prev;
                    return {
                        ...prev,
                        [key]: {
                            ...prev[key],
                            pickerVersions: versions,
                            pickerVUrn: current ? current.urn : m.urn,
                            pickerLoadingV: false
                        }
                    };
                });
                // Se llama siempre: si esta respuesta era tardia, el pestillo de
                // dentro la descarta sola.
                enumerarVistas(key, current ? current.urn : m.urn);
            })
            .catch(() => setSide(prev => (prev[key].pickerSel !== val ? prev : {
                ...prev,
                [key]: {
                    ...prev[key],
                    pickerVersions: [{ versionNumber: m.versionNumber, urn: m.urn, isCurrent: true }],
                    pickerVUrn: m.urn,
                    pickerLoadingV: false
                }
            })));
    };

    // Al cambiar de version, su lista de vistas deja de valer: se borra y se
    // vuelve a leer. Solo la del lado que cambio; el otro lado no se toca.
    const enumerarVistas = (key, urn) => {
        // El pestillo se comprueba contra el ESTADO, no contra una bandera de
        // fuera: el actualizador de `setSide` no corre necesariamente en el
        // instante de llamarlo, asi que cualquier bandera que se lea despues
        // puede estar todavia sin poner. Aqui se decide donde se sabe la verdad.
        setSide(prev => (prev[key].pickerVUrn !== urn ? prev : {
            ...prev,
            [key]: { ...prev[key], pickerViews: [], pickerViewGuid: '', pickerLoadingViews: !!urn },
        }));
        if (!urn) return;
        vistas3DDe(urn).then(vistas => setSide(prev => (
            // La version pudo cambiar otra vez mientras se leia el manifiesto:
            // si ya no es la que se pidio, esta respuesta llega tarde y se tira.
            prev[key].pickerVUrn !== urn
                ? prev
                : { ...prev, [key]: { ...prev[key], pickerViews: vistas, pickerLoadingViews: false } }
        )));
    };

    const pickVersion = (key, vUrn) => {
        setSide(prev => ({ ...prev, [key]: { ...prev[key], pickerVUrn: vUrn } }));
        enumerarVistas(key, vUrn);
    };

    // EMPAREJAR SIN ADIVINAR. Al elegir vista en A, si en B hay UNA sola con ese
    // nombre se selecciona sola. Si no hay ninguna, o hay varias con el mismo
    // nombre, B se deja como estaba: preferimos que el usuario elija a acertar
    // por casualidad y que luego compare dos vistas distintas sin saberlo.
    const pickView = (key, guid) => {
        setSide(prev => {
            const siguiente = { ...prev, [key]: { ...prev[key], pickerViewGuid: guid } };
            if (key !== 'a' || !guid) return siguiente;
            const nombre = (prev.a.pickerViews.find(v => v.guid === guid) || {}).name;
            if (!nombre) return siguiente;
            const candidatas = prev.b.pickerViews.filter(v => v.name === nombre);
            if (candidatas.length !== 1) return siguiente;
            return { ...siguiente, b: { ...siguiente.b, pickerViewGuid: candidatas[0].guid } };
        });
    };
    const addLink = (key) => {
        setSide(prev => {
            const s = prev[key];
            if (!s.pickerSel) return prev;

            let link = null;
            if (s.pickerSel.startsWith('frente:')) {
                const frente = s.pickerSel.slice(7);
                link = { type: 'frente', value: frente, label: `Frente ${frente}` };
            } else {
                const m = models.find(x => String(x.id) === s.pickerSel);
                if (!m || !s.pickerVUrn) return prev;
                const v = s.pickerVersions.find(x => x.urn === s.pickerVUrn);
                // La vista viaja CON el vinculo, no con el selector: el selector
                // se limpia al agregar, y lo que se carga despues es el vinculo.
                const vista = s.pickerViews.find(x => x.guid === s.pickerViewGuid);
                link = {
                    type: 'source',
                    value: s.pickerVUrn,
                    modelId: m.id,
                    viewGuid: vista ? vista.guid : null,
                    label: `${m.name}${v && v.versionNumber ? ` · v${v.versionNumber}` : ''}${vista ? ` · ${vista.name}` : ''}`,
                };
            }

            const currentLinks = link.type === 'frente'
                ? []
                : s.links.filter(item => item.type !== 'frente');
            const exists = currentLinks.some(item => item.type === link.type && item.value === link.value);

            return {
                ...prev,
                [key]: {
                    ...s,
                    links: exists ? currentLinks : [...currentLinks, link],
                    pickerSel: '',
                    pickerVersions: [],
                    pickerVUrn: '',
                    pickerLoadingV: false,
                    pickerViews: [],
                    pickerViewGuid: '',
                    pickerLoadingViews: false,
                }
            };
        });
    };
    const removeLink = (key, idx) => {
        setSide(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                links: prev[key].links.filter((_, i) => i !== idx),
            }
        }));
    };
    const clearLinks = (key) => {
        setSide(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                links: [],
            }
        }));
    };
    const swapSides = () => setSide(prev => ({ a: prev.b, b: prev.a }));

    const scopeOf = (s) => {
        if (!s.links.length) return null;
        const front = s.links.find(item => item.type === 'frente');
        if (front) return { type: 'frente', value: front.value };
        const values = s.links.filter(item => item.type === 'source').map(item => item.value);
        if (!values.length) return null;
        return values.length === 1 ? { type: 'source', value: values[0] } : { type: 'sources', values };
    };
    const labelOf = (s) => {
        if (!s.links.length) return '';
        if (s.links.length === 1) return s.links[0].label;
        return `${s.links.length} vínculos`;
    };

    // ── Visores ──
    const makeViewer = (container) => {
        const ViewerCtor = window.Autodesk.Viewing.Viewer3D || window.Autodesk.Viewing.GuiViewer3D;
        // TEMA DECLARADO, no heredado. El SDK aplica 'dark-theme' por defecto
        // (`this.theme = this.config.theme || "dark-theme"`), asi que el pixel
        // no cambia: cambia que este espacio DECIDA su tema en vez de depender
        // de un defecto ajeno que Autodesk puede mover cuando quiera.
        const v = new ViewerCtor(container, { theme: 'dark-theme' });
        v.start();
        return v;
    };
    const sourceUrnsOf = (scope) => {
        if (!scope) return [];
        if (scope.type === 'source') return [scope.value];
        if (scope.type === 'sources') return scope.values || [];
        return [];
    };
    // `map` es el de siempre: un identificador -> un elemento, y con varios
    // ficheros que compartan identificador gana el ultimo. `docs` guarda lo mismo
    // POR FICHERO, y de que documento (y linaje) es cada uno: es lo que usa el
    // modo por documento para pintar y seleccionar en el fichero que toca.
    const buildExternalLookups = (viewer) => new Promise(resolve => {
        const modelsInViewer = viewer.getAllModels ? viewer.getAllModels() : (viewer.model ? [viewer.model] : []);
        const docs = { porModelo: new Map(), modeloPorUrn: new Map(), modeloPorLinaje: new Map(), linajePorModelo: new Map() };
        if (!modelsInViewer.length) return resolve({ map: {}, rev: { byModel: {}, flat: {} }, docs });

        const map = {};
        const rev = { byModel: {}, flat: {} };
        let pending = modelsInViewer.length;

        modelsInViewer.forEach(model => {
            const key = modelKey(model);
            rev.byModel[key] = rev.byModel[key] || {};
            const urn = urnDelModelo(model);
            const linaje = linajeDeUrn(urn);
            if (urn) docs.modeloPorUrn.set(urn, model);
            if (linaje) { docs.modeloPorLinaje.set(linaje, model); docs.linajePorModelo.set(model, linaje); }
            model.getExternalIdMapping((extMap) => {
                docs.porModelo.set(model, extMap || {});
                Object.entries(extMap || {}).forEach(([ext, dbId]) => {
                    map[ext] = { id: dbId, model };
                    rev.byModel[key][dbId] = ext;
                    if (!rev.flat[dbId]) rev.flat[dbId] = ext;
                });
                pending -= 1;
                if (pending === 0) resolve({ map, rev, docs });
            }, () => {
                pending -= 1;
                if (pending === 0) resolve({ map, rev, docs });
            });
        });
    });


    // ¿Son el mismo punto? Tolerancia relativa: la escena va en milimetros y las
    // coordenadas rondan el millon; un 1e-9 relativo son nanometros.
    const mismoVector = (p, q) => !!(p && q) && ['x', 'y', 'z'].every(k =>
        Number.isFinite(p[k]) && Number.isFinite(q[k])
        && Math.abs(p[k] - q[k]) <= 1e-9 * Math.max(1, Math.abs(p[k])));

    const wireSync = useCallback(() => {
        const { a, b } = vs.current;
        if (!a || !b || vs.current.synced) return;
        // COPIAR SOLO CUANDO HAY ALGO QUE COPIAR. ESTA ERA LA CAUSA DEL PARPADEO.
        // `setView` de LMV marca la camara del destino como cambiada aunque
        // reciba los mismos numeros (pone `dirty` sin comparar), y el evento de
        // camara no sale en el acto: sale en el siguiente tick de ese visor,
        // cuando redibuja la hoja DESDE CERO y avisa. Ese aviso volvia aqui, se
        // copiaba otra vez al primero, y asi sin fin: un pimpon. La bandera
        // `syncing` no lo evitaba porque el rebote es asincrono. Medido en
        // produccion el 18-sep-2026, pestaña visible: con la copia de siempre,
        // tras mover un lado, los DOS visores se redibujaban desde cero ~29
        // veces por segundo sin parar (y el resto de ticks caia de ~100 a ~28);
        // con esta, un redibujado por lado y quietos. Con modelos pesados y el
        // dibujo progresivo, redibujar sin parar es la hoja que parpadea y el
        // lado que «desaparece».
        const sync = (src, dst) => () => {
            if (vs.current.syncing) return;
            vs.current.syncing = true;
            try {
                const nav = src.navigation, destino = dst.navigation;
                const pos = nav.getPosition(), objetivo = nav.getTarget(), arriba = nav.getCameraUpVector();
                const igual = mismoVector(pos, destino.getPosition())
                    && mismoVector(objetivo, destino.getTarget())
                    && mismoVector(arriba, destino.getCameraUpVector());
                if (!igual) {
                    destino.setView(pos, objetivo);
                    destino.setCameraUpVector(arriba);
                }
            } catch (e) { /* montando */ }
            vs.current.syncing = false;
        };
        a.addEventListener(window.Autodesk.Viewing.CAMERA_CHANGE_EVENT, sync(a, b));
        b.addEventListener(window.Autodesk.Viewing.CAMERA_CHANGE_EVENT, sync(b, a));
        vs.current.synced = true;
    }, []);

    const wireHover = useCallback(() => {
        // SIN 5D. Antes cada elemento bajo el raton disparaba una peticion a
        // `/api/compare/element-metrados` para enseñar metrados y precios por
        // partida. Este comparador responde a una sola pregunta -- que se
        // agrego, que se quito y que cambio -- y el dinero y las cantidades no
        // forman parte de ella. El globo solo identifica el elemento; no hay
        // peticion de red al pasar el raton.
        const Av = window.Autodesk.Viewing;
        ['a', 'b'].forEach(k => {
            const v = vs.current[k];
            if (!v || v.__hoverWired) return;
            v.__hoverWired = true;
            v.addEventListener(Av.OBJECT_UNDER_MOUSE_CHANGED, (ev) => {
                const dbId = ev.dbId;
                const rev = vs.current.rev[k];
                const revByModel = rev && ev.model ? rev.byModel?.[modelKey(ev.model)] : null;
                const ext = revByModel?.[dbId] || rev?.flat?.[dbId];
                if (!dbId || dbId <= 0 || !ext) { setTip(null); return; }
                setTip({ side: k, ext });
            });
        });
    }, []);

    const wireMirror = useCallback(() => {
        const Av = window.Autodesk.Viewing;
        ['a', 'b'].forEach(k => {
            const v = vs.current[k];
            if (!v || v.__selWired) return;
            v.__selWired = true;
            v.addEventListener(Av.SELECTION_CHANGED_EVENT, (ev) => {
                if (vs.current.selSyncing) return;
                const dbId = ev.dbIdArray && ev.dbIdArray[0];
                const other = k === 'a' ? 'b' : 'a';
                const ov = vs.current[other];
                vs.current.selSyncing = true;
                try {
                    if (!dbId) { if (ov) ov.clearSelection(); }
                    else {
                        const rev = vs.current.rev[k];
                        const revByModel = rev && ev.model ? rev.byModel?.[modelKey(ev.model)] : null;
                        const ext = revByModel?.[dbId] || rev?.flat?.[dbId] || null;
                        const target = ext ? destinoEspejo(vs.current, k, other, ev.model, ext) : null;
                        if (ov) {
                            if (target) ov.select([target.id], target.model);
                            else ov.clearSelection();
                        }
                        if (ext) {
                            // El detalle, de ESTOS dos ficheros (por documento lo usa;
                            // con un documento por lado se ignora).
                            const propio = urnDelModelo(ev.model) || null;
                            const suyo = target ? urnDelModelo(target.model) || null : null;
                            openDetailRef.current({
                                id: ext, name: 'Elemento …' + String(ext).slice(-10),
                                fuenteA: k === 'a' ? propio : suyo, fuenteB: k === 'a' ? suyo : propio,
                            });
                        }
                    }
                } finally { vs.current.selSyncing = false; }
            });
        });
    }, []);

    const themeSide = (k, list, rgb) => {
        const viewer = vs.current[k];
        if (!viewer || !viewer.model) return;
        const color = new window.THREE.Vector4(rgb[0], rgb[1], rgb[2], 1);
        list.forEach(it => {
            const target = objetivoEn(vs.current, k, it);
            if (target) viewer.setThemingColor(target.id, color, target.model, true);
        });
    };

    // ── Extraccion bajo demanda de versiones historicas (scope temporal) ──
    const ensureExtracted = async (urn, label) => {
        const chk = await apiFetch(`${BACKEND_URL}/api/compare/extracted?urn=${encodeURIComponent(urn)}`).then(r => r.json());
        if (chk.extracted) return;

        // 0) Asegurar que la version este TRADUCIDA en ACC (las versiones viejas
        //    pueden no tener SVF). Disparamos la traduccion UNA sola vez (force) y
        //    luego solo consultamos el estado -> sin bucle de re-disparo.
        let triggered = false;
        for (let i = 0; i < 90; i++) {                        // ~15 min de techo
            const prep = await apiFetch(`${BACKEND_URL}/api/compare/prepare-version`, {
                method: 'POST', body: JSON.stringify({ urn, force: !triggered })
            }).then(r => r.json());
            triggered = true;  // ya disparamos (o consultamos) la primera vez

            if (prep.error) throw new Error(`${label}: ${prep.error}`);
            if (prep.status === 'ready') break;

            if (prep.status === 'translating') {
                const pct = prep.progress ? ` ${prep.progress}` : '';
                setStatus(`Traduciendo ${label} en Autodesk…${pct} (versión histórica; la primera vez puede tardar)`);
            } else {
                // failed / not_translated DESPUES de haber forzado el disparo -> rendirse claro
                throw new Error(
                    `${label}: esa versión no se puede traducir en Autodesk (${prep.detail || 'archivo original no disponible'}). ` +
                    `Suele pasar con versiones muy antiguas cuyo archivo ya fue archivado en ACC. ` +
                    `Prueba con una versión más reciente o la actual.`
                );
            }
            await new Promise(r => setTimeout(r, 8000));
        }

        setStatus(`Extrayendo metadata de ${label} (versión histórica)…`);
        // `scope` es el frente DESDE el que se compara. Un mismo documento de ACC
        // puede estar vinculado en frentes de dos obras (los HD de drenaje: en
        // `1_DRENAJE` y en el de interferencias) y sin esto el servidor no sabia
        // de que obra era la extraccion temporal: 409 SOURCE_SCOPE_AMBIGUOUS y el
        // comparador se paraba (medido en produccion el 18-sep-2026). El servidor
        // solo lo acepta si el frente esta registrado para ese documento.
        const res = await apiFetch(`${BACKEND_URL}/api/inventory/extract`, {
            method: 'POST', body: JSON.stringify({ urn, target_urn: '__cmp__', scope: projectId || undefined })
        });
        const cuerpo = await res.json().catch(() => ({}));
        const { job_id } = cuerpo;
        if (!job_id) throw new Error(explicarExtraccion(label, res.status, cuerpo));
        for (let i = 0; i < 150; i++) {                       // hasta ~7.5 min
            await new Promise(r => setTimeout(r, 3000));
            const st = await apiFetch(`${BACKEND_URL}/api/inventory/extract/status/${job_id}`).then(r => r.json()).catch(() => null);
            if (st && st.status === 'success') return;
            if (st && st.status === 'error') throw new Error(`Extracción de ${label} falló: ${st.message}`);
            if (st && typeof st.progress === 'number') setStatus(`Extrayendo ${label}… ${st.progress}%`);
        }
        throw new Error('La extracción de ' + label + ' tardó demasiado.');
    };

    // ── Comparar ──
    const runCompare = async () => {
        const sa = scopeOf(side.a);
        const sb = scopeOf(side.b);
        if (!sa || !sb) return;
        scopesRef.current = { a: sa, b: sb };
        setBusy(true); setDiff(null);
        setDetail(null); setActiveList(null); setTip(null);
        setPhase('view');
        await new Promise(r => setTimeout(r, 60));            // esperar el render de los panes

        try {
            const urnsA = sourceUrnsOf(sa);
            const urnsB = sourceUrnsOf(sb);
            const both3D = urnsA.length > 0 && urnsB.length > 0;

            // 1) Asegurar que ambas versiones esten extraidas (el diff es en Postgres)
            for (let i = 0; i < urnsA.length; i++) await ensureExtracted(urnsA[i], `lado A · vínculo ${i + 1}`);
            for (let i = 0; i < urnsB.length; i++) await ensureExtracted(urnsB[i], `lado B · vínculo ${i + 1}`);

            // 2) Diff de datos
            setStatus('Comparando datos en PostgreSQL…');
            const res = await apiFetch(`${BACKEND_URL}/api/compare/diff`, { method: 'POST', body: JSON.stringify({ a: sa, b: sb }) });
            const d = await res.json();
            if (!res.ok) throw new Error(d.error || 'Falló el diff');
            setDiff(d);

            // Guard: si un lado quedo SIN datos, avisar y no pintar (todo saldria
            // "agregado"/"eliminado" y el resultado seria enganoso).
            const sideEmpty = d.summary.total_a === 0 ? 'A' : (d.summary.total_b === 0 ? 'B' : null);

            // 3) Vista 3D
            if (both3D) {
                setStatus('Cargando ambas versiones…');
                if (!vs.current.a) vs.current.a = makeViewer(contA.current);
                if (!vs.current.b) vs.current.b = makeViewer(contB.current);
                // Cargar A primero para conocer su globalOffset (cercano al modelo),
                // y cargar B con EL MISMO offset -> alineados y sin perder precision.
                // El GUID de vista se resuelve APARTE del scope: `sa`/`sb` son lo
                // que se manda al backend para calcular el diff y no deben cambiar
                // de forma. Aqui solo se decide desde donde se mira.
                const conVista = (s, urns) => urns.map(u => {
                    const l = (s.links || []).find(x => x.type === 'source' && x.value === u);
                    return { urn: u, viewGuid: (l && l.viewGuid) || null };
                });
                const offset = await loadAlignedModels(vs.current.a, conVista(side.a, urnsA));
                await loadAlignedModels(vs.current.b, conVista(side.b, urnsB), { sharedOffset: offset });
                wireSync();
                dibujarEnteroSiHayTransparentes(vs.current.a);
                dibujarEnteroSiHayTransparentes(vs.current.b);

                const lookupA = await buildExternalLookups(vs.current.a);
                const lookupB = await buildExternalLookups(vs.current.b);
                vs.current.maps = { a: lookupA.map, b: lookupB.map };
                vs.current.rev = { a: lookupA.rev, b: lookupB.rev };
                vs.current.docs = { a: lookupA.docs, b: lookupB.docs };
                // Con varios documentos en algun lado el diff dice de cual es cada
                // fila; si el servidor es anterior, no lo dice y todo sigue como antes.
                vs.current.porDocumento = !!d.por_documento;
                vs.current.fuentes = d.fuentes || null;
                if (!sideEmpty) {
                    setStatus('Pintando diferencias…');
                    themeSide('b', d.added, COLORS.added);
                    themeSide('b', d.modified, COLORS.modified);
                    themeSide('a', d.removed, COLORS.removed);
                    themeSide('a', d.modified, COLORS.modified);
                }
                wireHover();
                wireMirror();
            }

            if (sideEmpty) {
                setStatus(`⚠ El lado ${sideEmpty} no tiene datos extraídos en PostgreSQL — el diff no es representativo (no se pintó). Revisa que esa versión se haya extraído bien.`);
            }

            // SIN IMPORTES. Aqui se pedia `/api/compare/metrados` para pintar un
            // panel valorizado en soles. Por decision del dueno este comparador
            // responde a UNA pregunta -- que elementos se agregaron, se quitaron o
            // cambiaron -- y el dinero no forma parte de ella. El endpoint sigue
            // existiendo en el backend; simplemente ya no se llama desde aqui.

            if (!sideEmpty) {
                setStatus(both3D
                    ? 'Listo. Pasa el mouse por un elemento para identificarlo; haz clic para resaltarlo en ambos lados.'
                    : 'Diff de datos listo. El 3D se activa comparando dos modelos individuales.');
            }
        } catch (e) {
            console.error('[Compare]', e);
            setStatus('Error: ' + e.message);
        }
        setBusy(false);
    };

    const editSelection = () => {
        ['a', 'b'].forEach(k => { try { vs.current[k] && vs.current[k].finish(); } catch (e) { /* noop */ } });
        vs.current = { a: null, b: null, maps: {}, rev: {}, docs: {}, porDocumento: false, fuentes: null, syncing: false, selSyncing: false };
        setDiff(null); setDetail(null); setActiveList(null); setTip(null);
        setStatus('');
        setPhase('setup');
    };

    const isolate = (k, list) => {
        const viewer = vs.current[k];
        if (!viewer || !viewer.model) return;
        const targets = list.map(it => objetivoEn(vs.current, k, it)).filter(Boolean);
        if (!targets.length) return;
        const aggregate = targets.reduce((acc, target) => {
            const key = modelKey(target.model);
            if (!acc[key]) acc[key] = { model: target.model, ids: [] };
            acc[key].ids.push(target.id);
            return acc;
        }, {});
        const groups = Object.values(aggregate);
        const vm = viewer.impl && viewer.impl.visibilityManager;
        if (vm && typeof vm.aggregateIsolate === 'function') {
            vm.aggregateIsolate(groups);
            return;
        }
        viewer.isolate(groups[0].ids, groups[0].model);
    };
    const showAll = () => ['a', 'b'].forEach(k => {
        const v = vs.current[k];
        if (!v) return;
        const modelsInViewer = v.getAllModels ? v.getAllModels() : (v.model ? [v.model] : []);
        modelsInViewer.forEach(model => v.isolate([], model));
    });

    const openDetail = async (item) => {
        try {
            const scopes = scopesRef.current;
            if (!scopes) return;
            // POR DOCUMENTO se pregunta solo por el fichero del elemento, y el
            // lado donde no esta va vacio (null): mandar el lado entero traia la
            // copia de OTRO fichero que comparta el identificador, o nada si hay
            // dos (el servidor no elige). La fila de la lista dice su documento
            // con `fa`/`fb`; la seleccion en 3D, con `fuenteA`/`fuenteB`.
            let a = scopes.a, b = scopes.b;
            const { porDocumento, fuentes } = vs.current;
            if (porDocumento) {
                const fuente = (lado, explicita, indice) => {
                    if (explicita !== undefined) return explicita;
                    return fuentes && fuentes[lado] && indice !== undefined ? fuentes[lado][indice] : null;
                };
                const fuenteA = fuente('a', item.fuenteA, item.fa);
                const fuenteB = fuente('b', item.fuenteB, item.fb);
                a = fuenteA ? { type: 'source', value: fuenteA } : null;
                b = fuenteB ? { type: 'source', value: fuenteB } : null;
                if (!a && !b) { setDetail({ name: item.name || item.id, changes: [] }); return; }
            }
            const res = await apiFetch(`${BACKEND_URL}/api/compare/element`, {
                method: 'POST', body: JSON.stringify({ external_id: item.id, a, b })
            });
            const d = await res.json();
            const flat = (props) => {
                const out = {};
                Object.entries(props || {}).forEach(([g, sub]) => {
                    if (sub && typeof sub === 'object') Object.entries(sub).forEach(([k, v]) => { out[`${g} · ${k}`] = String(v); });
                });
                return out;
            };
            const fa = flat(d.a && d.a.properties);
            const fb = flat(d.b && d.b.properties);
            const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])];
            const changes = keys.filter(k => fa[k] !== fb[k]).map(k => ({ prop: k, a: fa[k] !== undefined ? fa[k] : '—', b: fb[k] !== undefined ? fb[k] : '—' }));
            setDetail({ name: (d.a && d.a.name) || (d.b && d.b.name) || item.name || item.id, changes });
        } catch (e) { console.error('[Compare] detalle:', e); }
    };
    const openDetailRef = useRef(openDetail);
    openDetailRef.current = openDetail;

    useEffect(() => () => {
        ['a', 'b'].forEach(k => { try { vs.current[k] && vs.current[k].finish(); } catch (e) { /* noop */ } });
    }, []);


    const listData = (diff && activeList && Array.isArray(diff[activeList])) ? diff[activeList] : [];

    // ── Render: selector de lado (setup) ──
    const renderSide = (key, title) => {
        const rawSide = side[key];
        const s = {
            ...rawSide,
            sel: rawSide.pickerSel,
            versions: rawSide.pickerVersions,
            vUrn: rawSide.pickerVUrn,
            loadingV: rawSide.pickerLoadingV,
        };
        const linkValues = new Set(s.links.map(link => link.value));
        const duplicateSelected = !!s.pickerSel && !s.pickerSel.startsWith('frente:') && !!s.pickerVUrn && linkValues.has(s.pickerVUrn);
        const addDisabled = !s.pickerSel || (!s.pickerSel.startsWith('frente:') && !s.pickerVUrn) || duplicateSelected;
        const sideName = key.toUpperCase();
        const addLabel = duplicateSelected
            ? 'Ya esta agregado'
            : `${s.links.length ? '+ Agregar otro modelo' : '+ Agregar modelo'} a ${sideName}`;
        return (
            <div style={S.sideCard}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <div style={S.label}>{title}</div>
                    <span style={{ fontSize: 10.5, color: T.accent, border: '1px solid rgba(61,126,255,0.35)', borderRadius: 999, padding: '2px 8px', marginBottom: 10 }}>
                        MULTI-MODELO
                    </span>
                </div>
                <div style={{ fontSize: 11.5, color: T.faint, margin: '-3px 0 10px' }}>
                    Selecciona un modelo, agregalo a la lista y repite para sumar mas vinculos.
                </div>
                <select style={S.select} value={s.pickerSel} onChange={e => pickModel(key, e.target.value)}>
                    <option value="">Seleccionar modelo para agregar...</option>
                    <optgroup label="Frentes completos (reemplaza la lista; solo datos)">
                        {frentes.map(f => <option key={'f' + f} value={'frente:' + f}>Frente {f}</option>)}
                    </optgroup>
                    {Object.entries(byFrente).map(([f, ms]) => (
                        <optgroup key={f} label={f}>
                            {ms.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
                        </optgroup>
                    ))}
                </select>
                <div style={{ ...S.label, marginTop: 4 }}>Versión</div>
                <select
                    style={{ ...S.select, opacity: s.pickerVersions.length ? 1 : 0.5 }}
                    value={s.pickerVUrn}
                    disabled={!s.pickerVersions.length}
                    onChange={e => pickVersion(key, e.target.value)}
                >
                    {s.pickerLoadingV && <option>Cargando versiones...</option>}
                    {!s.pickerLoadingV && !s.pickerVersions.length && <option>{s.pickerSel && !s.pickerSel.startsWith('frente:') ? '-' : 'No aplica (frente completo)'}</option>}
                    {s.pickerVersions.map(v => (
                        <option key={v.urn} value={v.urn}>
                            v{v.versionNumber}{v.isCurrent ? ' · actual' : ''}{v.createTime ? ` · ${String(v.createTime).slice(0, 10)}` : ''}
                        </option>
                    ))}
                </select>
                <div style={{ fontSize: 11.5, color: T.faint, minHeight: 16 }}>
                    {s.pickerVersions.length > 1 && 'Las versiones historicas se extraen automaticamente al comparar.'}
                </div>
                <div style={{ ...S.label, marginTop: 4 }}>Vista 3D</div>
                <select
                    style={{ ...S.select, opacity: s.pickerVUrn ? 1 : 0.5 }}
                    value={s.pickerViewGuid}
                    disabled={!s.pickerVUrn || s.pickerLoadingViews}
                    onChange={e => pickView(key, e.target.value)}
                >
                    <option value="">Vista por defecto</option>
                    {s.pickerViews.map(v => (
                        <option key={v.guid} value={v.guid}>{v.name}</option>
                    ))}
                </select>
                <div style={{ fontSize: 11.5, color: T.faint, minHeight: 16 }}>
                    {s.pickerLoadingViews && 'Leyendo las vistas de esta version...'}
                    {!s.pickerLoadingViews && !!s.pickerVUrn && !s.pickerViews.length && 'Esta version no declara vistas 3D: se usara la de por defecto.'}
                </div>
                <button
                    type="button"
                    style={{
                        ...S.btnGhost,
                        width: '100%',
                        marginTop: 8,
                        background: addDisabled ? 'transparent' : T.accent,
                        color: addDisabled ? T.muted : '#fff',
                        border: addDisabled ? T.border : 'none',
                        fontWeight: 600,
                        opacity: addDisabled ? 0.45 : 1,
                        cursor: addDisabled ? 'default' : 'pointer'
                    }}
                    disabled={addDisabled}
                    onClick={() => addLink(key)}
                >
                    {addLabel}
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10, maxHeight: 118, overflowY: 'auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 11, color: T.faint, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            {s.links.length} vinculo{s.links.length === 1 ? '' : 's'} agregado{s.links.length === 1 ? '' : 's'}
                        </div>
                        {s.links.length > 0 && (
                            <button
                                type="button"
                                style={{ ...S.btnGhost, padding: '2px 7px', fontSize: 11 }}
                                onClick={() => clearLinks(key)}
                            >
                                Limpiar
                            </button>
                        )}
                    </div>
                    {s.links.length === 0 && (
                        <div style={{ padding: '7px 8px', border: T.borderSoft, borderRadius: 6, color: T.faint, background: 'rgba(255,255,255,0.02)' }}>
                            Todavia no hay modelos agregados en este lado.
                        </div>
                    )}
                    {s.links.map((link, idx) => (
                        <div
                            key={`${link.type}-${link.value}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 8px',
                                border: T.borderSoft,
                                borderRadius: 6,
                                background: 'rgba(255,255,255,0.03)',
                                minWidth: 0
                            }}
                        >
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={link.label}>
                                {link.label}
                            </span>
                            <button
                                type="button"
                                style={{ ...S.btnGhost, padding: '2px 7px', fontSize: 12 }}
                                onClick={() => removeLink(key, idx)}
                                title="Quitar vínculo"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // ════════════════════ RENDER ════════════════════
    return (
        <div
            style={S.overlay}
            onMouseMove={(e) => {
                if (tipEl.current) {
                    tipEl.current.style.left = Math.min(e.clientX + 16, window.innerWidth - 290) + 'px';
                    tipEl.current.style.top = Math.min(e.clientY + 14, window.innerHeight - 180) + 'px';
                }
            }}
        >
            {phase === 'setup' && (
                <div style={S.setupWrap}>
                    <div style={S.setupCard}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
                            <span style={{ fontSize: 17, fontWeight: 600 }}>Comparar</span>
                            <button style={{ ...S.btnGhost, border: 'none', fontSize: 16, padding: 4 }} onClick={doExit} title="Cerrar">✕</button>
                        </div>
                        <div style={{ fontSize: 12.5, color: T.muted, marginBottom: 22 }}>
                            Elige el modelo o documento y la versión de cada lado. A es la base (contractual); B el avance actual.
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            {renderSide('a', 'A · Base / contractual')}
                            <button style={S.btnIcon} onClick={swapSides} title="Intercambiar lados">⇄</button>
                            {renderSide('b', 'B · Avance')}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 }}>
                            <button style={S.btnGhost} onClick={doExit}>Cancelar</button>
                            <button
                                style={{ ...S.btnPrimary, opacity: (scopeOf(side.a) && scopeOf(side.b) && !busy) ? 1 : 0.45 }}
                                disabled={!scopeOf(side.a) || !scopeOf(side.b) || busy}
                                onClick={runCompare}
                            >
                                Comparar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {phase === 'view' && (
                <>
                    <div style={S.topBar}>
                        <span style={{ fontWeight: 600, fontSize: 13.5 }}>Comparador</span>
                        <span style={{ ...S.chipSide, color: T.red }} title={labelOf(side.a)}>A · {labelOf(side.a)}</span>
                        <span style={{ color: T.faint }}>→</span>
                        <span style={{ ...S.chipSide, color: T.green }} title={labelOf(side.b)}>B · {labelOf(side.b)}</span>
                        {diff && (
                            <div style={{ display: 'flex', gap: 14, marginLeft: 16, alignItems: 'center' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.muted }}><span style={S.dot(T.green)} />Agregado</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.muted }}><span style={S.dot(T.red)} />Eliminado</span>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: T.muted }}><span style={S.dot(T.magenta)} />Modificado</span>
                            </div>
                        )}
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                            <button style={S.btnGhost} onClick={editSelection}>Editar selección</button>
                            <button style={S.btnGhost} onClick={showAll}>Mostrar todo</button>
                            <button style={S.btnGhost} onClick={doExit}>Salir</button>
                        </div>
                    </div>

                    <div style={S.viewers}>
                        <div style={S.pane}>
                            <span style={{ ...S.paneTag, color: T.red }}>A {diff ? `· ${diff.summary.total_a.toLocaleString()} elem` : ''}</span>
                            <div ref={contA} style={{ position: 'absolute', inset: 0 }} />
                        </div>
                        <div style={S.pane}>
                            <span style={{ ...S.paneTag, color: T.green }}>B {diff ? `· ${diff.summary.total_b.toLocaleString()} elem` : ''}</span>
                            <div ref={contB} style={{ position: 'absolute', inset: 0 }} />
                        </div>
                    </div>

                    <div style={S.statusBar}>{busy && <span style={{ color: T.accent }}>● </span>}{status}</div>

                    {diff && (
                        <div style={S.bottom}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 }}>
                                <button style={S.pill(T.green, activeList === 'added')} onClick={() => { setActiveList('added'); isolate('b', diff.added); }}>
                                    <span style={S.dot(T.green)} />{diff.summary.added.toLocaleString()} agregados
                                </button>
                                <button style={S.pill(T.red, activeList === 'removed')} onClick={() => { setActiveList('removed'); isolate('a', diff.removed); }}>
                                    <span style={S.dot(T.red)} />{diff.summary.removed.toLocaleString()} eliminados
                                </button>
                                <button style={S.pill(T.magenta, activeList === 'modified')} onClick={() => { setActiveList('modified'); isolate('a', diff.modified); isolate('b', diff.modified); }}>
                                    <span style={S.dot(T.magenta)} />{diff.summary.modified.toLocaleString()} modificados
                                </button>
                                <span style={{ fontSize: 11, color: T.faint, paddingLeft: 2 }}>{diff.summary.unchanged.toLocaleString()} sin cambio</span>
                            </div>

                            <div style={S.list}>
                                {activeList === null && <div style={{ color: T.faint, padding: 8 }}>Selecciona una categoría para listar y aislar sus elementos.</div>}
                                {listData.slice(0, 500).map(it => (
                                    <div key={it.id} style={S.listItem} title={it.id} onClick={() => openDetail(it)}>{it.name || it.id}</div>
                                ))}
                                {listData.length > 500 && <div style={{ color: T.faint, padding: 6 }}>… y {listData.length - 500} más</div>}
                            </div>

                            <div style={S.detail}>
                                {!detail && <span style={{ color: T.faint }}>Haz clic en un elemento (lista o 3D) para ver qué propiedades cambiaron.</span>}
                                {detail && (
                                    <>
                                        <div style={{ fontWeight: 600, marginBottom: 6 }}>{detail.name}</div>
                                        {detail.changes.length === 0 && <div style={{ color: T.faint }}>Sin cambios de propiedades (puede ser cambio geométrico).</div>}
                                        {detail.changes.slice(0, 60).map((c, i) => (
                                            <div key={i} style={{ marginBottom: 4, borderBottom: T.borderSoft, paddingBottom: 3 }}>
                                                <div style={{ color: T.muted, fontSize: 11.5 }}>{c.prop}</div>
                                                <div><span style={{ color: T.red }}>{c.a}</span> <span style={{ color: T.faint }}>→</span> <span style={{ color: T.green }}>{c.b}</span></div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Globo de hover: QUE elemento es y en que lado. Nada mas. */}
            <div
                ref={tipEl}
                style={{
                    position: 'fixed', zIndex: 9500, pointerEvents: 'none', display: tip ? 'block' : 'none',
                    background: 'rgba(18,22,27,0.97)', border: T.border, borderRadius: T.radius,
                    padding: '7px 11px', maxWidth: 280, fontSize: 12,
                }}
            >
                {tip && (
                    <div style={{ fontWeight: 600 }}>
                        …{String(tip.ext).slice(-10)} <span style={{ fontWeight: 400, color: T.faint }}>({tip.side === 'a' ? 'A' : 'B'})</span>
                    </div>
                )}
            </div>
        </div>
    );
}
