/**
 * Banco de pruebas del restaurador v2 — E-5.
 *
 *     node frontend-react/pruebas/restaurarVistaV2.prueba.mjs
 *
 * QUE SE EJECUTA AQUI, Y QUE NO
 * -----------------------------
 * Se ejecuta EL RESTAURADOR DE VERDAD: `restaurarVistaV2` tal cual, con su
 * pipeline, sus esperas, sus generaciones y sus techos. Lo que es un doble es el
 * VISOR: un `EventTarget` que emite `viewerStateRestored`,
 * `cameraTransitionComplete` y `finalFrameRenderedChanged` con los nombres
 * reales del LMV 7.126 —los que la Auditoría 02 verificó en el bundle— y con
 * asincronía real.
 *
 * Eso permite medir lo que importa —el ORDEN, las esperas, la cancelación, el
 * número de `recalculate-filters`— sin un modelo cargado. Lo que NO demuestra es
 * que el LMV real emita esos eventos cuando se espera: eso es la regresión con
 * visor de verdad, previa al despliegue, junto con el smoke de `global` que ya
 * está pendiente.
 *
 * La cronología que imprime cada caso es la que pidió el auditor, y su valor
 * está en lo que NO aparece: ningún tiempo de 500 ni de 1500 ms, porque no hay
 * un solo temporizador de sincronización en el camino.
 */

const R = await import('../src/lib/restaurarVistaV2.js');

let fallos = 0, total = 0;
const ok = (n, c, d = '') => { total++; if (c) console.log(`  ok   ${n}`); else { fallos++; console.log(`  FALLA ${n}${d ? '  → ' + d : ''}`); } };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const titulo = (t) => console.log(`\n${t}\n${'-'.repeat(t.length)}`);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Identificadores con la forma real ──────────────────────────────────────
const b64 = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const urnDe = (id, v) => b64(`urn:adsk.wipprod:fs.file:vf.${id}?version=${v}`);
const linDe = (id) => `urn:adsk.wipprod:dm.lineage:${id}`;

const IDS = ['zzAaa', 'zzBbb', 'zzCcc', 'zzDdd', 'zzEee'];
const LIN = IDS.map(linDe);
const URN = IDS.map((i) => urnDe(i, 1));

// ── Los dobles ─────────────────────────────────────────────────────────────

/**
 * Un modelo del doble. Lleva su urn Y su `globalOffset`, porque el restaurador
 * compara contra el MODELO BASE de la federación y no contra `viewer.model`.
 */
const modeloDoble = (urn, offset = { x: 10, y: 20, z: 0 }, geometria = true) => ({
    getData: () => ({ urn, globalOffset: offset }),
    // Lo que E9 pregunta para saber si un modelo puede entrar en composici\u00f3n
    // final. En el LMV real existe y devuelve `true` cuando la geometr\u00eda est\u00e1
    // completa (verificado en 7.126). Por omisi\u00f3n un modelo del doble ya la
    // tiene: el caso contrario lo prueba B7.
    isLoadDone: () => geometria,
});

/** Rosetta poblada para cada urn: sin ella un modelo está cargado, no preparado. */
const rosettaDe = (urns, extra = {}) =>
    Object.fromEntries(urns.map((u) => [u, { 1: 'uid-' + u.slice(-4), ...(extra[u] || {}) }]));

/** El visor: emite los eventos del LMV con sus nombres reales. */
function visorDoble({ offset = { x: 10, y: 20, z: 0 }, modelos = [], demoraRestore = 1,
    emiteCamara = true, emiteFrame = true } = {}) {
    const et = new EventTarget();
    const v = {
        _modelos: modelos.slice(),
        addEventListener: et.addEventListener.bind(et),
        removeEventListener: et.removeEventListener.bind(et),
        emitir: (n, d) => et.dispatchEvent(Object.assign(new Event(n), { detail: d })),
        getAllModels: () => v._modelos,
        // Se deja a proposito con OTRO offset: si el restaurador volviera a leer
        // `viewer.model` en vez del modelo base, esta prueba lo destaparia.
        model: { getData: () => ({ globalOffset: { x: -1, y: -1, z: -1 } }) },
        _offset: offset,
        fitToView: () => { v._fitToView = (v._fitToView || 0) + 1; },
        _fitToView: 0,
        _restaurado: null,
    };
    v.responderA = (ventana) => {
        ventana.addEventListener(R.EVENTOS.restaurarLmv, async (e) => {
            v._restaurado = e.detail;
            await dormir(demoraRestore);
            v.emitir(R.EVENTOS_LMV.estadoRestaurado, {});
            if (emiteCamara) { await dormir(1); v.emitir(R.EVENTOS_LMV.camaraLista, {}); }
            if (emiteFrame) { await dormir(1); v.emitir(R.EVENTOS_LMV.fotogramaFinal, true); }
        });
    };
    return v;
}

/** La ventana: cuenta los eventos y responde `filters-calculated`. */
function ventanaDoble({ validIds = [1, 2, 3], demoraFiltros = 1, respondeFiltros = true } = {}) {
    const et = new EventTarget();
    const w = {
        addEventListener: et.addEventListener.bind(et),
        removeEventListener: et.removeEventListener.bind(et),
        dispatchEvent: et.dispatchEvent.bind(et),
        cuenta: {},
        vistos: [],
    };
    const contarTodo = (n) => et.addEventListener(n, (e) => {
        w.cuenta[n] = (w.cuenta[n] || 0) + 1;
        w.vistos.push({ n, detail: e.detail });
    });
    for (const n of [...Object.values(R.EVENTOS), 'viewer-show-all', 'viewer-model-visibility']) contarTodo(n);
    if (respondeFiltros) {
        et.addEventListener(R.EVENTOS.recalcular, async () => {
            await dormir(demoraFiltros);
            w.dispatchEvent(Object.assign(new Event(R.EVENTOS.filtrosListos), { detail: { validIds } }));
        });
    }
    return w;
}

const configDe = (n, versiones = null) => IDS.slice(0, n).map((id, i) => ({
    urn: versiones ? urnDe(id, versiones[i]) : URN[i],
    item_id: LIN[i], version_number: versiones ? versiones[i] : 1, name: 'M' + i,
}));

function docV2({ modelos = 1, offset = { x: 10, y: 20, z: 0 }, filtros = null,
    inventory = { columns: { mode: 'all' } }, objectSet = null, versiones = null } = {}) {
    return {
        schemaVersion: 2,
        lmv: {
            viewport: { eye: [1, 2, 3], target: [0, 0, 0], fieldOfView: 35 },
            cutplanes: [[0, 0, 1, -5]],
            objectSet: objectSet || [{ id: [966], hidden: [], isolated: [], seedUrn: URN[0] }],
        },
        models: IDS.slice(0, modelos).map((id, i) => ({
            lineage: LIN[i], urnAtSave: versiones ? urnDe(id, versiones[i]) : URN[i],
            versionAtSave: versiones ? versiones[i] : 1, visible: true, order: i,
        })),
        federation: { activeLineage: LIN[0], globalOffsetAtSave: offset },
        filters: filtros || {
            properties: ['Standard::Revit Category'],
            selections: { 'Standard::Revit Category': ['Walls'] },
            colors: {}, valueColors: {},
            sourceColor: { on: false, custom: {} }, hiddenModelLineages: [],
        },
        inventory,
        extensions: { pkHeatmap: null },
        meta: { appVersion: 'e5', capturedAt: '2026-09-05T00:00:00Z' },
    };
}

const inventarioDe = (valores = ['Walls', 'Floors']) =>
    valores.map((v, i) => ({ 'Revit Category': v, source_urn: URN[0], external_id: 'e' + i }));

function entornoDe(extra = {}) {
    const ventana = extra.ventana || ventanaDoble(extra.opcionesVentana);
    // Por omision el modelo del documento YA esta cargado: casi todos los casos
    // prueban otra cosa, y arrancar en frio les meteria la espera de E2 en medio.
    // Los que quieren el frio (CASO 2) pasan su propio visor.
    const visor = extra.visor || visorDoble({
        modelos: [modeloDoble(URN[0])], ...(extra.opcionesVisor || {}),
    });
    visor.responderA(ventana);
    // Por omisión, TODO lo que está cargado tiene su Rosetta: un modelo sin ella
    // está cargado pero no preparado, y eso lo prueba su propio caso.
    const urnsCargados = (visor._modelos || []).map((m) => m.getData?.()?.urn).filter(Boolean);
    return {
        ventana, visor,
        modelConfig: extra.modelConfig || configDe(1),
        inventario: extra.inventario !== undefined ? extra.inventario : inventarioDe(),
        rosettaPorUrn: extra.rosettaPorUrn || rosettaDe(urnsCargados),
        viewId: extra.viewId || 'v-1',
        cargarModelos: extra.cargarModelos || (() => { }),
        aplicarFiltros: extra.aplicarFiltros || (() => { }),
        aplicarInventario: extra.aplicarInventario || (() => ({})),
        documentoOculto: extra.documentoOculto || (() => false),
        ...(extra.techos ? { techos: extra.techos } : {}),
    };
}

const cronologia = (r) => Object.entries(r.cronologia)
    .map(([k, v]) => `${k}=${v}ms`).join('  ');

// ═══════════════════════════════════════════════════════════════════ CASOS

titulo('CASO 1 · BASICO: un modelo, camara, filtros, inventario');
{
    R._reiniciarGeneraciones();
    let inv = null;
    const e = entornoDe({
        aplicarInventario: (c) => { inv = c; return {}; },
        opcionesVisor: { modelos: [modeloDoble(URN[0])] },
    });
    const r = await R.restaurarVistaV2(docV2(), e);
    ok('termina COMPLETA', r.estado === 'completa', JSON.stringify(r.parte.avisos));
    ok('emite begin y complete una vez cada uno',
        e.ventana.cuenta[R.EVENTOS.inicio] === 1 && e.ventana.cuenta[R.EVENTOS.fin] === 1);
    ok('el estado LMV llegó al visor', !!e.visor._restaurado?.viewport);
    ok('con los cutplanes puestos (el marco no cambió)', !!e.visor._restaurado?.cutplanes);
    ok('el inventario se aplicó', igual(inv?.columns, { mode: 'all' }));
    ok('las 11 etapas están en la cronología',
        R.ETAPAS.every((x) => r.cronologia[x] !== undefined), Object.keys(r.cronologia).join(','));
    console.log('       ' + cronologia(r));
}

titulo('CASO 2 · FEDERACION DE 5, EN FRIO');
{
    R._reiniciarGeneraciones();
    const visor = visorDoble({ modelos: [] });
    const ventana = ventanaDoble();
    let pedidos = null;
    const rosetta = {};
    const e = entornoDe({
        ventana, visor, modelConfig: configDe(5), rosettaPorUrn: rosetta,
        cargarModelos: (faltan) => {
            pedidos = faltan.slice();
            // Llegan DESORDENADOS y con retraso, como en la medición real de E-3.
            [3, 0, 4, 1, 2].forEach((i, k) => setTimeout(() => {
                visor._modelos.push(modeloDoble(URN[i]));
                rosetta[URN[i]] = { 1: 'uid-' + i };      // E-3 emite CON la Rosetta ya puesta
                ventana.dispatchEvent(Object.assign(new Event(R.EVENTOS.modeloListo),
                    { detail: { urn: URN[i], lineage: LIN[i], index: i, total: 5 } }));
            }, 2 + k * 2));
        },
    });
    const r = await R.restaurarVistaV2(docV2({ modelos: 5 }), e);
    ok('se piden los 5 que faltan', pedidos?.length === 5, JSON.stringify(pedidos?.length));
    ok('NO restaura al primer modelo: espera a los cinco',
        r.cronologia.modelsReady !== undefined && visor._modelos.length === 5);
    ok('el estado LMV se aplicó DESPUES de tener los modelos',
        r.cronologia.viewerStateRestored >= r.cronologia.modelsReady);
    ok('termina completa', r.estado === 'completa', JSON.stringify(r.parte.avisos));
    const av = r.parte.avisos.find((a) => a.tipo === 'modelos');
    ok('el parte dice 5 requeridos / 0 preparados / 5 faltantes',
        av.requeridos === 5 && av.preparados === 0 && av.faltantes === 5, JSON.stringify(av));
    console.log('       ' + cronologia(r));
}

titulo('CASO 3 · LOS 5 YA ESTABAN CARGADOS');
{
    R._reiniciarGeneraciones();
    const visor = visorDoble({ modelos: URN.map((u) => modeloDoble(u)) });
    let llamadas = 0;
    const e = entornoDe({ visor, modelConfig: configDe(5), cargarModelos: () => { llamadas++; } });
    const r = await R.restaurarVistaV2(docV2({ modelos: 5 }), e);
    ok('no se pide cargar nada', llamadas === 0);
    ok('no se espera ningún `viewer-model-loaded`',
        e.ventana.cuenta[R.EVENTOS.modeloListo] === undefined);
    const av = r.parte.avisos.find((a) => a.tipo === 'modelos');
    ok('5 requeridos, 5 preparados, 0 faltantes',
        av.requeridos === 5 && av.preparados === 5 && av.faltantes === 0, JSON.stringify(av));
    ok('completa', r.estado === 'completa');
    console.log('       ' + cronologia(r));
}

titulo('CASO 4 · EL MODELO CAMBIO DE VERSION');
{
    R._reiniciarGeneraciones();
    // Guardada en la v1; el frente sirve hoy la v7.
    const urnHoy = urnDe(IDS[0], 7);
    const visor = visorDoble({ modelos: [modeloDoble(urnHoy)] });
    const e = entornoDe({
        visor,
        modelConfig: [{ urn: urnHoy, item_id: LIN[0], version_number: 7 }],
        rosettaPorUrn: { [urnHoy]: { 4321: 'uid-A', 4322: 'uid-B' } },
    });
    const doc = docV2();
    doc.models[0].elements = { selected: ['uid-A'], hidden: [], isolated: ['uid-B'] };
    doc.lmv.objectSet = [{ id: [966], hidden: [], isolated: [111], seedUrn: URN[0] }];
    const r = await R.restaurarVistaV2(doc, e);
    const os = e.visor._restaurado.objectSet[0];
    ok('el seedUrn se reescribe al URN vigente', os.seedUrn === urnHoy, os.seedUrn);
    ok('NO se aplican los dbId históricos', !igual(os.id, [966]) && !igual(os.isolated, [111]));
    ok('se resuelven por identidad estable: uid-A -> 4321', igual(os.id, [4321]), JSON.stringify(os.id));
    ok('y uid-B -> 4322 en el aislamiento', igual(os.isolated, [4322]), JSON.stringify(os.isolated));
    ok('completa', r.estado === 'completa', JSON.stringify(r.parte.avisos));
    console.log('       ' + cronologia(r));
}

titulo('CASO 5 · UN externalId QUE YA NO ESTA');
{
    R._reiniciarGeneraciones();
    const urnHoy = urnDe(IDS[0], 7);
    const visor = visorDoble({ modelos: [modeloDoble(urnHoy)] });
    const e = entornoDe({
        visor, modelConfig: [{ urn: urnHoy, item_id: LIN[0], version_number: 7 }],
        rosettaPorUrn: { [urnHoy]: { 4321: 'uid-A' } },   // uid-B ya no existe
    });
    const doc = docV2();
    doc.models[0].elements = { selected: ['uid-A', 'uid-B'], hidden: [], isolated: [] };
    const r = await R.restaurarVistaV2(doc, e);
    const os = e.visor._restaurado.objectSet[0];
    ok('se aplica el que resuelve', igual(os.id, [4321]), JSON.stringify(os.id));
    ok('y NUNCA un elemento equivocado en su lugar', os.id.length === 1);
    ok('degradada, no completa', r.estado === 'degradada');
    const av = r.parte.avisos.find((a) => a.tipo === 'elementos-parcial');
    ok('el parte dice 1 de 2', av && av.resueltos === 1 && av.total === 2, JSON.stringify(av));
    console.log('       ' + cronologia(r));
}

titulo('CASO 6 · FILTRO OBSOLETO: NI UN isolate VACIO');
{
    R._reiniciarGeneraciones();
    const ventana = ventanaDoble({ validIds: [] });        // el filtro no casa con nada
    const e = entornoDe({
        ventana,
        inventario: inventarioDe(['Walls']),
        // Propiedad que ya no existe y valores que tampoco.
        // (el propId obsoleto se poda en el preflight; el guardián cubre el resto)
    });
    const doc = docV2({
        filtros: {
            properties: ['Tandem Category', 'Standard::Revit Category'],
            selections: { 'Tandem Category': ['Revit Muros'], 'Standard::Revit Category': ['Vegetación'] },
            colors: {}, valueColors: {}, sourceColor: { on: false, custom: {} }, hiddenModelLineages: [],
        },
    });
    const r = await R.restaurarVistaV2(doc, e);
    ok('el propId obsoleto se poda', r.parte.avisos.some((a) => a.tipo === 'preflight-propiedad-inexistente'));
    ok('los valores que no existen también',
        r.parte.avisos.some((a) => a.tipo?.startsWith('preflight-valores')));
    ok('NO se aísla el conjunto vacío',
        r.parte.avisos.some((a) => a.tipo === 'aislamiento-vacio-evitado'));
    ok('se manda MOSTRAR TODO en su lugar', e.ventana.cuenta['viewer-show-all'] === 1);
    ok('degradada, y la escena no queda fantasma', r.estado === 'degradada');
    console.log('       ' + cronologia(r));
}

titulo('CASO 7 · Standard::Sources: linaje guardado -> urn de hoy');
{
    R._reiniciarGeneraciones();
    const urnHoy = urnDe(IDS[0], 9);           // el modelo subió de versión
    const visor = visorDoble({ modelos: [modeloDoble(urnHoy)] });
    let aplicados = null;
    const e = entornoDe({
        visor, modelConfig: [{ urn: urnHoy, item_id: LIN[0], version_number: 9 }],
        inventario: [{ 'Revit Category': 'Walls', source_urn: urnHoy }],
        aplicarFiltros: (f) => { aplicados = f; },
    });
    const doc = docV2({
        filtros: {
            properties: ['Standard::Sources'],
            selections: { 'Standard::Sources': [LIN[0]] },   // POR LINAJE, como se persiste
            colors: {}, valueColors: {},
            sourceColor: { on: true, custom: { [LIN[0]]: '#00ff00' } },
            hiddenModelLineages: [],
        },
    });
    const r = await R.restaurarVistaV2(doc, e);
    ok('la selección de Sources llega como URN VIGENTE',
        igual(aplicados?.selections['Standard::Sources'], [urnHoy]),
        JSON.stringify(aplicados?.selections));
    ok('...que no es el URN con el que se guardó', urnHoy !== URN[0]);
    const tintes = e.ventana.vistos.find((v) => v.n === R.EVENTOS.coloresFuente);
    ok('el color por fuente también se traduce a URN vigente',
        igual(Object.keys(tintes.detail.customColors), [urnHoy]),
        JSON.stringify(tintes.detail.customColors));
    ok('sigue filtrando con la versión nueva', !!aplicados?.selections['Standard::Sources']);
    ok('degradada por el objectSet, NO por el filtro de Sources',
        r.estado === 'degradada'
        && r.parte.avisos.some((a) => a.tipo === 'objectset-descartado')
        && !r.parte.avisos.some((a) => a.tipo?.includes('Sources')),
        JSON.stringify(r.parte.avisos.map((a) => a.tipo)));
    console.log('       ' + cronologia(r));
}

titulo('CASO 8 · INVENTARIO: custom, all, y con el panel cerrado');
{
    R._reiniciarGeneraciones();
    let recibido = null;
    const e1 = entornoDe({ aplicarInventario: (c) => { recibido = c; return {}; } });
    await R.restaurarVistaV2(docV2({
        inventory: { columns: { mode: 'custom', keys: ['Area', 'Volumen'] }, groupBy: 'Zona', totals: ['Area'], assetsOnly: true },
    }), e1);
    ok('custom llega con su orden', igual(recibido.columns, { mode: 'custom', keys: ['Area', 'Volumen'] }));
    ok('y el resto del estado de vista también',
        recibido.groupBy === 'Zona' && igual(recibido.totals, ['Area']) && recibido.assetsOnly === true);

    R._reiniciarGeneraciones();
    const e2 = entornoDe({ aplicarInventario: (c) => { recibido = c; return {}; } });
    await R.restaurarVistaV2(docV2({ inventory: { columns: { mode: 'all' } } }), e2);
    ok('«todas» es un valor que se aplica, no una ausencia', igual(recibido.columns, { mode: 'all' }));

    // El panel cerrado = nadie escucha el evento. La configuración se aplica igual
    // porque va por el dueño canónico, no por el componente.
    R._reiniciarGeneraciones();
    let aplicadoSinPanel = false;
    const e3 = entornoDe({ aplicarInventario: () => { aplicadoSinPanel = true; return {}; } });
    const r3 = await R.restaurarVistaV2(docV2(), e3);
    ok('con el panel desmontado la configuración se aplica igualmente', aplicadoSinPanel);
    ok('y la restauración no depende de que alguien conteste', r3.estado === 'completa');

    R._reiniciarGeneraciones();
    const e4 = entornoDe({ aplicarInventario: () => ({ columnasPerdidas: ['Volumen'] }) });
    const r4 = await R.restaurarVistaV2(docV2(), e4);
    ok('si una columna desapareció, se degrada y se dice',
        r4.estado === 'degradada'
        && r4.parte.avisos.some((a) => a.tipo === 'inventario-columnas-desaparecidas'));
}

titulo('CASO 9 · globalOffset DISTINTO');
{
    R._reiniciarGeneraciones();
    let aplicados = null;
    const visor = visorDoble({ modelos: [modeloDoble(URN[0], { x: 999, y: 20, z: 0 })] });
    const e = entornoDe({ visor, aplicarFiltros: (f) => { aplicados = f; } });
    const r = await R.restaurarVistaV2(docV2({ offset: { x: 10, y: 20, z: 0 } }), e);
    ok('se detecta y se anota', r.parte.avisos.some((a) => a.tipo === 'MARCO_ESPACIAL_CAMBIADO'));
    const est = visor._restaurado;
    ok('la cámara guardada NO se aplica', est.viewport.eye === undefined && est.viewport.target === undefined);
    ok('los cutplanes tampoco', est.cutplanes === undefined);
    ok('pero projection/fieldOfView sí siguen', est.viewport.fieldOfView === 35);
    ok('se encuadra con fitToView en su lugar', visor._fitToView === 1);
    ok('el estado llegó YA PODADO: no se aplica y se corrige después',
        !JSON.stringify(est).includes('"eye"'));
    ok('los filtros sí se aplican', !!aplicados);
    ok('degradada', r.estado === 'degradada');

    // Dentro de tolerancia (1 mm) NO se considera cambio.
    R._reiniciarGeneraciones();
    const e2 = entornoDe({
        visor: visorDoble({ modelos: [modeloDoble(URN[0], { x: 10.0005, y: 20, z: 0 })] }),
    });
    const r2 = await R.restaurarVistaV2(docV2({ offset: { x: 10, y: 20, z: 0 } }), e2);
    ok('medio milímetro no es un marco distinto', r2.estado === 'completa',
        JSON.stringify(r2.parte.avisos));
    console.log('       ' + cronologia(r));
}

titulo('CASO 10 · CANCELACION A -> B');
{
    R._reiniciarGeneraciones();
    // UN solo visor, como en la aplicación: dos dobles escuchando la misma
    // ventana recibirían los dos el `viewer-restore-state` de B, y eso sería un
    // artefacto del banco, no del producto.
    const ventana = ventanaDoble();
    const visor = visorDoble({ demoraRestore: 30, modelos: [modeloDoble(URN[0])] });
    visor.responderA(ventana);

    const eA = { ...entornoDe({ ventana, visor }), viewId: 'A' };
    const pA = R.restaurarVistaV2(docV2(), eA);

    await dormir(5);                                      // A está a medias
    const eB = { ...entornoDe({ ventana, visor }), viewId: 'B' };
    const rB = await R.restaurarVistaV2(docV2(), eB);
    const rA = await pA;

    ok('A queda cancelada', rA.estado === 'cancelada', rA.estado);
    ok('B termina', rB.estado === 'completa', rB.estado + ' ' + JSON.stringify(rB.parte.avisos.map((x) => x.tipo)));
    ok('SOLO B emite complete', ventana.cuenta[R.EVENTOS.fin] === 1, ventana.cuenta[R.EVENTOS.fin]);
    const finales = ventana.vistos.filter((v) => v.n === R.EVENTOS.fin);
    ok('y el complete que se emite es el de B', finales[0].detail.viewId === 'B');
    ok('hubo dos begin y un solo complete', ventana.cuenta[R.EVENTOS.inicio] === 2);
    // Lo que de verdad importa: A no llegó a NINGUNA etapa posterior a su
    // cancelación. Se cortó en la espera del `viewerStateRestored`, así que no
    // recalculó filtros, no aplicó tema y no tocó el inventario.
    ok('A NO recalculó filtros: sólo hay un recalculate-filters, el de B',
        ventana.cuenta[R.EVENTOS.recalcular] === 1, ventana.cuenta[R.EVENTOS.recalcular]);
    ok('A no aplicó tema', ventana.cuenta[R.EVENTOS.coloresValor] === 1);
    ok('A no aplicó inventario', ventana.cuenta[R.EVENTOS.inventario] === 1);
    ok('A no dejó a B sin guardia', ventana.__restaurandoVistaV2 === 0);
    ok('la cronología de A se detiene donde la cancelaron',
        rA.cronologia.restoreComplete === undefined && rA.cronologia.filtersCalculated === undefined,
        JSON.stringify(rA.cronologia));
    const antes = { ...ventana.cuenta };
    await dormir(80);                                     // pasa el tiempo de A
    ok('y pasado su tiempo A sigue sin emitir nada', igual(ventana.cuenta, antes));
}

titulo('CASO 11 · PESTAÑA OCULTA');
{
    R._reiniciarGeneraciones();
    // El visor NO emitirá cámara ni fotograma: la pestaña no dibuja.
    const visor = visorDoble({ emiteCamara: false, emiteFrame: false,
        modelos: [modeloDoble(URN[0])] });
    const e = entornoDe({ visor, documentoOculto: () => true, techos: { ...R.TECHOS, barreraVisual: 3000 } });
    const t = Date.now();
    const r = await R.restaurarVistaV2(docV2(), e);
    const ms = Date.now() - t;
    ok('no se cuelga esperando la cámara', ms < 500, ms + 'ms');
    ok('y NO se marca como fallo de cámara',
        !r.parte.avisos.some((a) => a.tipo === 'camara-sin-asentar'));
    ok('el parte dice que la barrera visual se omitió',
        r.parte.avisos.some((a) => a.tipo === 'barrera-visual-omitida'));
    ok('sigue siendo completa: una pestaña oculta no es un daño', r.estado === 'completa');
    console.log('       ' + cronologia(r) + `   (total ${ms}ms)`);

    // Y con la pestaña visible pero sin señales, el techo degrada en vez de colgar.
    R._reiniciarGeneraciones();
    const visor2 = visorDoble({ emiteCamara: false, emiteFrame: false,
        modelos: [modeloDoble(URN[0])] });
    const e2 = entornoDe({ visor: visor2, techos: { ...R.TECHOS, barreraVisual: 60 } });
    const r2 = await R.restaurarVistaV2(docV2(), e2);
    // La barrera es el FOTOGRAMA FINAL, no la cámara: medido en el visor real,
    // `cameraTransitionComplete` no se emite cuando no hay transición.
    ok('visible y sin señales: degrada por techo, no se cuelga',
        r2.estado === 'degradada' && r2.parte.avisos.some((a) => a.tipo === 'sin-fotograma-final'),
        JSON.stringify(r2.parte.avisos.map((a) => a.tipo)));
}

titulo('CASO 12 · VISTA COMPARTIDA: EL MISMO RESTAURADOR');
{
    R._reiniciarGeneraciones();
    // Una vista compartida no tiene sesión ni panel: sólo cambia QUIEN llama.
    // El pipeline es el mismo, sin ruta paralela.
    const e = entornoDe({ viewId: 'compartida', aplicarInventario: () => ({}) });
    const r = await R.restaurarVistaV2(docV2(), e);
    ok('mismo pipeline, mismas etapas',
        R.ETAPAS.every((x) => r.cronologia[x] !== undefined));
    ok('mismo evento de fin, con su viewId',
        e.ventana.vistos.find((v) => v.n === R.EVENTOS.fin).detail.viewId === 'compartida');
    ok('completa', r.estado === 'completa');
    console.log('       ' + cronologia(r));
}

titulo('CONTRATO DE ENTRADA · UN DOCUMENTO AMBIGUO NO TOCA EL VISOR');
{
    const malos = [
        ['schemaVersion 1', { ...docV2(), schemaVersion: 1 }],
        ['lineage null', (() => { const d = docV2(); d.models[0].lineage = null; return d; })()],
        ['hiddenModelUrnsV1', (() => { const d = docV2(); d.filters.hiddenModelUrnsV1 = []; return d; })()],
        ['Sources por URN', (() => { const d = docV2(); d.filters.selections['Standard::Sources'] = [URN[0]]; return d; })()],
        ['inventory inválido', docV2({ inventory: { columns: { mode: 'lo-que-sea' } } })],
        ['migradoDeV1', (() => { const d = docV2(); d.meta.migradoDeV1 = true; return d; })()],
    ];
    for (const [nombre, doc] of malos) {
        R._reiniciarGeneraciones();
        const e = entornoDe();
        const r = await R.restaurarVistaV2(doc, e);
        ok(`${nombre} -> FALLIDA sin tocar el visor`,
            r.estado === 'fallida' && e.visor._restaurado === null,
            `${r.estado}, restaurado=${e.visor._restaurado !== null}`);
    }
    R._reiniciarGeneraciones();
    const e = entornoDe({ modelConfig: [{ urn: 'otro', item_id: linDe('zzZzz'), version_number: 1 }] });
    const r = await R.restaurarVistaV2(docV2(), e);
    ok('una vista de OTRO frente -> fallida, no degradada',
        r.estado === 'fallida' && r.parte.avisos.some((a) => a.motivo === 'contexto-incorrecto'));
}

titulo('UN SOLO recalculate-filters POR RESTAURACION');
{
    for (const [nombre, doc, extra] of [
        ['básica', docV2(), {}],
        ['federación de 5', docV2({ modelos: 5 }), { modelConfig: configDe(5), opcionesVisor: { modelos: URN.map((u) => modeloDoble(u)) } }],
        ['con filtro degradado', docV2({ filtros: { properties: ['Tandem Category'], selections: { 'Tandem Category': ['x'] }, colors: {}, valueColors: {}, sourceColor: { on: false, custom: {} }, hiddenModelLineages: [] } }), { opcionesVentana: { validIds: [] } }],
    ]) {
        R._reiniciarGeneraciones();
        const e = entornoDe(extra);
        await R.restaurarVistaV2(doc, e);
        ok(`${nombre}: exactamente 1`, e.ventana.cuenta[R.EVENTOS.recalcular] === 1,
            'fueron ' + e.ventana.cuenta[R.EVENTOS.recalcular]);
    }
}

titulo('B2 · CARGADO NO ES PREPARADO: LA VENTANA GEOMETRY -> ROSETTA');
{
    R._reiniciarGeneraciones();
    // El modelo YA está en `getAllModels()` --geometry loaded-- pero su Rosetta
    // todavía no existe. Es la ventana que midió E-3: `getExternalIdMapping` es
    // asíncrono y en IFC hay un `getBulkProperties` detrás.
    const ventana = ventanaDoble();
    const visor = visorDoble({ modelos: [modeloDoble(URN[0])] });
    visor.responderA(ventana);
    const rosetta = {};                                    // vacía: no hay Rosetta
    let pedidosDeCarga = 0;
    const e = {
        ...entornoDe({ ventana, visor, rosettaPorUrn: rosetta }),
        rosettaPorUrn: rosetta,
        cargarModelos: () => { pedidosDeCarga++; },
    };
    const p = R.restaurarVistaV2(docV2(), e);

    await dormir(20);
    ok('B2 · NO se restaura el estado mientras falte la Rosetta',
        visor._restaurado === null, JSON.stringify(visor._restaurado));
    ok('B2 · y NO se vuelve a pedir la carga: ya está cargado',
        pedidosDeCarga === 0, pedidosDeCarga);

    // Ahora llega la Rosetta y con ella el `viewer-model-loaded` de E-3.
    rosetta[URN[0]] = { 966: 'uid-A' };
    ventana.dispatchEvent(Object.assign(new Event(R.EVENTOS.modeloListo),
        { detail: { urn: URN[0], lineage: LIN[0], index: 0, total: 1 } }));
    const r = await p;
    ok('B2 · en cuanto llega la Rosetta, sigue', visor._restaurado !== null);
    ok('B2 · termina completa', r.estado === 'completa', JSON.stringify(r.parte.avisos));
    const av = r.parte.avisos.find((a) => a.tipo === 'modelos');
    ok('B2 · el parte distingue «falta» de «cargado sin Rosetta»',
        av.faltantes === 0 && av.cargadosSinRosetta === 1, JSON.stringify(av));
    console.log('       ' + cronologia(r));
}

titulo('B3 · EL THEMING SE ACUSA, Y EL ACUSE LLEGA ANTES DE E9');
{
    R._reiniciarGeneraciones();
    // `handleTheme` de Viewer.jsx difiere el pintado: `processGPUBuffer()` trocea
    // en lotes de 5.000 con `await setTimeout(0)` y AL TERMINAR emite
    // `viewer-colors-applied`. El doble hace lo mismo, con retraso.
    const ventana = ventanaDoble();
    const pintados = [];
    ventana.addEventListener(R.EVENTOS.temaPropiedad, async (ev) => {
        await dormir(6);                                   // el troceo de la GPU
        pintados.push(ev.detail.propId);
        ventana.dispatchEvent(new Event(R.EVENTOS.coloresAplicados));
    });
    const visor = visorDoble({ modelos: [modeloDoble(URN[0])] });
    visor.responderA(ventana);
    let tintes = null;
    const e = entornoDe({
        ventana, visor,
        inventario: inventarioDe(['Walls', 'Floors']),
        aplicarTintesDeFuente: (t) => { tintes = t; },
    });
    e.aplicarTintesDeFuente = (t) => { tintes = t; };
    const doc = docV2({
        filtros: {
            properties: ['Standard::Revit Category'],
            selections: { 'Standard::Revit Category': ['Walls', 'Floors'] },
            colors: { 'Standard::Revit Category': true },
            valueColors: { 'Standard::Revit Category::Walls': '#ff0000' },
            sourceColor: { on: true, custom: { [LIN[0]]: '#00ff00' } },
            hiddenModelLineages: [],
        },
    });
    const r = await R.restaurarVistaV2(doc, e);
    ok('B3 · el color se pintó', pintados.length === 1 && pintados[0] === 'Standard::Revit Category');
    ok('B3 · y ANTES de la barrera final',
        r.cronologia.colorsApplied <= r.cronologia.cameraComplete,
        `colors=${r.cronologia.colorsApplied} camera=${r.cronologia.cameraComplete}`);
    ok('B3 · el pintor SINCRONO de tintes por fuente se llamó',
        tintes && tintes.on === true, JSON.stringify(tintes));
    ok('B3 · ya NO se apunta «sin señal de confirmación»',
        !r.parte.avisos.some((a) => a.tipo === 'theming-sin-senal-de-confirmacion'));
    ok('B3 · completa', r.estado === 'completa', JSON.stringify(r.parte.avisos));
    console.log('       ' + cronologia(r));

    // Y si el acuse no llega --`handleTheme` sale sin pintar cuando no encuentra
    // el bucket-- se degrada y se nombra, en vez de llamar COMPLETE a la vista.
    R._reiniciarGeneraciones();
    const ventana2 = ventanaDoble();                        // nadie contesta al tema
    const visor2 = visorDoble({ modelos: [modeloDoble(URN[0])] });
    visor2.responderA(ventana2);
    const e2 = entornoDe({
        ventana: ventana2, visor: visor2, inventario: inventarioDe(['Walls']),
        techos: { ...R.TECHOS, theming: 60 },
    });
    const r2 = await R.restaurarVistaV2(docV2({
        filtros: {
            properties: ['Standard::Revit Category'],
            selections: { 'Standard::Revit Category': ['Walls'] },
            colors: { 'Standard::Revit Category': true }, valueColors: {},
            sourceColor: { on: false, custom: {} }, hiddenModelLineages: [],
        },
    }), e2);
    ok('B3 · sin acuse -> degradada, no completa', r2.estado === 'degradada');
    ok('B3 · y el parte dice qué propiedad se quedó sin pintar',
        r2.parte.avisos.some((a) => a.tipo === 'theming-sin-acuse'
            && a.propiedades.includes('Standard::Revit Category')));
}

titulo('B5 · EL MARCO SE COMPARA CONTRA EL MODELO BASE');
{
    R._reiniciarGeneraciones();
    // Federación de 3. El base (order 0) tiene el offset de la vista; los otros
    // dos, otro distinto. `viewer.model` del doble tiene un tercer offset a
    // propósito: si el restaurador lo leyera, esto fallaría.
    const visor = visorDoble({
        modelos: [
            modeloDoble(URN[0], { x: 10, y: 20, z: 0 }),      // BASE, coincide
            modeloDoble(URN[1], { x: 77, y: 77, z: 77 }),
            modeloDoble(URN[2], { x: 88, y: 88, z: 88 }),
        ],
    });
    const e = entornoDe({ visor, modelConfig: configDe(3) });
    const r = await R.restaurarVistaV2(docV2({ modelos: 3, offset: { x: 10, y: 20, z: 0 } }), e);
    ok('B5 · con el BASE coincidiendo, el marco es válido',
        !r.parte.avisos.some((a) => a.tipo === 'MARCO_ESPACIAL_CAMBIADO'),
        JSON.stringify(r.parte.avisos.map((a) => a.tipo)));
    ok('B5 · y NO se leyó `viewer.model` (que tiene otro offset)', r.estado === 'completa');
    ok('B5 · la cámara guardada sí se aplica', !!visor._restaurado.viewport.eye);

    // Si el BASE es el que cambió, da igual que los demás coincidan.
    R._reiniciarGeneraciones();
    const visor2 = visorDoble({
        modelos: [
            modeloDoble(URN[0], { x: 999, y: 20, z: 0 }),    // BASE, distinto
            modeloDoble(URN[1], { x: 10, y: 20, z: 0 }),
        ],
    });
    const e2 = entornoDe({ visor: visor2, modelConfig: configDe(2) });
    const r2 = await R.restaurarVistaV2(docV2({ modelos: 2, offset: { x: 10, y: 20, z: 0 } }), e2);
    const av = r2.parte.avisos.find((a) => a.tipo === 'MARCO_ESPACIAL_CAMBIADO');
    ok('B5 · manda el BASE, no el que coincida', !!av);
    ok('B5 · y el aviso dice qué urn se comparó y con qué epsilon',
        av.urnBase === URN[0] && av.epsilon === 0.001, JSON.stringify({ u: av.urnBase, e: av.epsilon }));

    // El epsilon sale de la escala del modelo cuando el modelo la declara.
    ok('B5 · 1 mm en un modelo en metros = 0.001', R.epsilonDelModelo(null) === 0.001);
    ok('B5 · 1 mm en un modelo en pies = 0.00328...',
        Math.abs(R.epsilonDelModelo({ getUnitScale: () => 0.3048 }) - 0.0032808) < 1e-6);
    ok('B5 · el valor por defecto NO está congelado: se deriva de la escala',
        R.epsilonDelModelo({ getUnitScale: () => 0.001 }) === 1);

    // Y si el modelo base no está cargado, no se coge otro en su lugar.
    R._reiniciarGeneraciones();
    const visor3 = visorDoble({ modelos: [modeloDoble(URN[1], { x: 10, y: 20, z: 0 })] });
    const e3 = entornoDe({
        visor: visor3, modelConfig: configDe(2),
        rosettaPorUrn: rosettaDe([URN[1]]),
    });
    const r3 = await R.restaurarVistaV2(docV2({ modelos: 2, offset: { x: 10, y: 20, z: 0 } }), e3);
    const av3 = r3.parte.avisos.find((a) => a.tipo === 'MARCO_ESPACIAL_CAMBIADO');
    ok('B5 · sin el modelo base cargado, el marco NO se da por bueno',
        !!av3 && /base/.test(av3.motivo), JSON.stringify(av3?.motivo));
}

titulo('B4 Â· LA BANDERA: AHORA APAGA, Y EN PRODUCCION NI CON DevTools');
{
    const DEV = { DEV: true, MODE: 'development' };
    const PROD = { PROD: true, MODE: 'production' };
    const APAGADA = { PROD: true, MODE: 'production', VITE_SAVED_VIEWS_V2_RESTORE: 'false' };
    // Lo que puede escribir cualquiera desde la consola del navegador.
    const devTools = { [R.BANDERA]: false, localStorage: { getItem: () => 'false' } };

    // E-7: v2 es el camino normal. La bandera pasÃ³ a ser un interruptor de
    // APAGADO, y lo peor que consigue quien la toca desde la consola de un build
    // desplegado es volver al camino v1.
    ok('sin nada configurado, ENCENDIDA', R.restauradorV2Activo({}, DEV) === true);
    ok('PROD sin nada configurado, tambiÃ©n', R.restauradorV2Activo({}, PROD) === true);
    ok('la bandera de BUILD la apaga en cualquier modo',
        R.restauradorV2Activo({}, APAGADA) === false);
    ok('y con la de build en false, lo demÃ¡s da igual',
        R.restauradorV2Activo({ [R.BANDERA]: true }, APAGADA) === false);

    ok('DEV Â· window la apaga', R.restauradorV2Activo({ [R.BANDERA]: false }, DEV) === false);
    ok('DEV Â· localStorage tambiÃ©n',
        R.restauradorV2Activo({ localStorage: { getItem: (k) => (k === R.BANDERA ? 'false' : null) } }, DEV) === false);
    ok('DEV Â· un valor que no es Â«falseÂ» no la apaga',
        R.restauradorV2Activo({ localStorage: { getItem: () => 'no' } }, DEV) === true);

    ok('PROD Â· window NO la apaga', R.restauradorV2Activo(devTools, PROD) === true);
    ok('PROD Â· localStorage TAMPOCO',
        R.restauradorV2Activo({ localStorage: { getItem: () => 'false' } }, PROD) === true);

    ok('sin saber en quÃ© modo se estÃ¡, se trata como PRODUCCION',
        R.restauradorV2Activo(devTools, null) === true && R.esProduccion(null) === true);
    ok('MODE production sin PROD/DEV tambiÃ©n cuenta como producciÃ³n',
        R.restauradorV2Activo(devTools, { MODE: 'production' }) === true);
}

titulo('B6 · EL INVENTARIO SE ESPERA EN E5, NO EN EL ARRANQUE');
{
    // El restaurador empieza en `viewer-ready`, o sea antes de que terminen de
    // bajar los ~7 MB del inventario. Sin esta espera el preflight se encontraba
    // la mesa vacía y declaraba degradada una restauración correcta.

    // (a) YA ESTÁ -> no se espera nada
    {
        const e = entornoDe();
        const r = await R.restaurarVistaV2(docV2(), e);
        ok('B6a · con inventario ya cargado la vista sale completa', r.estado === 'completa',
            JSON.stringify(r.parte.avisos.map((x) => x.tipo)));
        ok('B6a · y `inventoryReady` queda en la cronología',
            r.cronologia.inventoryReady !== undefined);
        ok('B6a · antes de calcular los filtros',
            r.cronologia.inventoryReady <= r.cronologia.filtersCalculated);
    }

    // (b) LLEGA TARDE -> se espera su señal REAL y se relee FRESCO
    {
        const ventana = ventanaDoble();
        const visor = visorDoble({ modelos: [modeloDoble(URN[0])] });
        visor.responderA(ventana);
        let vivo = null;                                   // el snapshot todavía no existe
        const e = {
            ...entornoDe({ ventana, visor }),
            inventario: null,
            inventarioFresco: () => vivo,
        };
        const p = R.restaurarVistaV2(docV2(), e);
        await dormir(30);
        ok('B6b · mientras no hay inventario, la vista no ha terminado',
            ventana.cuenta[R.EVENTOS.fin] === undefined || ventana.cuenta[R.EVENTOS.fin] === 0);
        ok('B6b · y todavía no ha recalculado filtros',
            !ventana.cuenta[R.EVENTOS.recalcular]);
        vivo = inventarioDe(['Walls', 'Floors']);          // ahora sí
        ventana.dispatchEvent(new Event(R.EVENTOS.inventarioListo));
        const r = await p;
        ok('B6b · al llegar la señal, la vista termina completa', r.estado === 'completa',
            JSON.stringify(r.parte.avisos.map((x) => x.tipo)));
        ok('B6b · SIN preflight-sin-inventario',
            !r.parte.avisos.some((a) => a.tipo === 'preflight-sin-inventario'));
        ok('B6b · y con un solo recalculate-filters',
            ventana.cuenta[R.EVENTOS.recalcular] === 1, ventana.cuenta[R.EVENTOS.recalcular]);
    }

    // (c) NO LLEGA -> techo, y el comportamiento seguro de siempre
    {
        const ventana = ventanaDoble();
        const visor = visorDoble({ modelos: [modeloDoble(URN[0])] });
        visor.responderA(ventana);
        const e = {
            ...entornoDe({ ventana, visor }),
            inventario: null,
            inventarioFresco: () => null,
            techos: { ...R.TECHOS, inventario: 20 },
        };
        const r = await R.restaurarVistaV2(docV2(), e);
        ok('B6c · si el inventario no llega, se dice por qué',
            r.parte.avisos.some((a) => a.tipo === 'inventario-no-llego'));
        ok('B6c · y degrada por preflight-sin-inventario, como antes',
            r.estado === 'degradada'
            && r.parte.avisos.some((a) => a.tipo === 'preflight-sin-inventario'), r.estado);
        ok('B6c · pero NO poda: las selecciones guardadas se aplican igual',
            ventana.cuenta[R.EVENTOS.recalcular] === 1);
        ok('B6c · y nunca se aisló en vacío',
            !ventana.vistos.some((v) => v.n === 'viewer-show-all'));
    }
}

titulo('B6 · CANCELACION DURANTE LA ESPERA DEL INVENTARIO');
{
    // A se queda esperando el inventario. Entra B. A tiene que morir AHÍ: sin
    // preflight, sin filtros y sin recalculate-filters.
    const ventana = ventanaDoble();
    const visor = visorDoble({ modelos: [modeloDoble(URN[0])] });
    visor.responderA(ventana);
    let vivo = null;

    const eA = { ...entornoDe({ ventana, visor }), viewId: 'A', inventario: null, inventarioFresco: () => vivo };
    const pA = R.restaurarVistaV2(docV2(), eA);
    await dormir(20);                                      // A espera el inventario
    ok('A está esperando: no ha recalculado nada', !ventana.cuenta[R.EVENTOS.recalcular]);

    vivo = inventarioDe(['Walls', 'Floors']);              // B sí lo tendrá
    const eB = { ...entornoDe({ ventana, visor }), viewId: 'B', inventario: null, inventarioFresco: () => vivo };
    const rB = await R.restaurarVistaV2(docV2(), eB);
    const rA = await pA;

    ok('A queda cancelada en la espera del inventario', rA.estado === 'cancelada', rA.estado);
    ok('A no llegó al preflight: sin `inventoryReady` en su cronología',
        rA.cronologia.inventoryReady === undefined, JSON.stringify(rA.cronologia));
    ok('A NO recalculó filtros: el único recalculate-filters es el de B',
        ventana.cuenta[R.EVENTOS.recalcular] === 1, ventana.cuenta[R.EVENTOS.recalcular]);
    ok('sólo B emite complete', ventana.cuenta[R.EVENTOS.fin] === 1, ventana.cuenta[R.EVENTOS.fin]);
    ok('y el complete es el de B',
        ventana.vistos.filter((v) => v.n === R.EVENTOS.fin)[0].detail.viewId === 'B');
    ok('B termina completa', rB.estado === 'completa',
        JSON.stringify(rB.parte.avisos.map((x) => x.tipo)));
    ok('la guardia queda suelta', ventana.__restaurandoVistaV2 === 0);
    const antes = { ...ventana.cuenta };
    await dormir(60);
    ok('y A, pasado su tiempo, sigue sin emitir nada', igual(ventana.cuenta, antes));
}

titulo('B7 · INVENTARIO DE CERO FILAS: CARGADO, NO AUSENTE');
{
    // `null` es «todavía no sé»; `[]` es «ya sé: no hay ninguno». Confundirlos
    // hacía esperar el techo entero por algo que ya había llegado.
    const ventana = ventanaDoble();
    const visor = visorDoble({ modelos: [modeloDoble(URN[0])] });
    visor.responderA(ventana);
    let vivo = null;
    const t0 = Date.now();
    const e = {
        ...entornoDe({ ventana, visor }),
        inventario: null,
        inventarioFresco: () => vivo,
        techos: { ...R.TECHOS, inventario: 30000 },
    };
    const p = R.restaurarVistaV2(docV2(), e);
    await dormir(20);
    ok('B7 · con el inventario ausente, la vista espera', !ventana.cuenta[R.EVENTOS.recalcular]);
    vivo = [];                                          // CARGADO, y vacío
    ventana.dispatchEvent(new CustomEvent('inventory-ready', { detail: { filas: 0 } }));
    const r = await p;
    const tardo = Date.now() - t0;
    ok('B7 · un inventario vacío termina la espera: no se agotan los 30 s', tardo < 2000, tardo + ' ms');
    ok('B7 · el preflight recibió el snapshot vacío, no `null`',
        r.parte.avisos.some((a) => a.tipo === 'preflight-inventario-vacio'));
    ok('B7 · y NO se confunde con «no cargado»',
        !r.parte.avisos.some((a) => a.tipo === 'preflight-sin-inventario'));
    ok('B7 · vacío no degrada: no hay nada que verificar, no hay nada roto',
        r.estado === 'completa', r.estado + ' ' + JSON.stringify(r.parte.avisos.map((x) => x.tipo)));
    ok('B7 · tampoco poda: la selección guardada se aplica igual',
        ventana.cuenta[R.EVENTOS.recalcular] === 1);
    ok('B7 · y no aisló en vacío', !ventana.vistos.some((v) => v.n === 'viewer-show-all'));
}

titulo('B8 · E9: LA GEOMETRIA PRIMERO, EL FOTOGRAMA DESPUES');
{
    // (a) con la geometría ya hecha, E9 no espera nada de más
    {
        const r = await R.restaurarVistaV2(docV2(), entornoDe());
        ok('B8a · `geometryReady` queda en la cronología', r.cronologia.geometryReady !== undefined);
        ok('B8a · y va antes del fotograma final',
            r.cronologia.geometryReady <= r.cronologia.finalFrame);
        ok('B8a · la vista sale completa', r.estado === 'completa',
            JSON.stringify(r.parte.avisos.map((x) => x.tipo)));
    }

    // (b) geometría a medias: E9 espera al REQUERIDO que falta, y el techo del
    //     fotograma NO se gasta mientras tanto
    {
        const ventana = ventanaDoble();
        let hecho = false;
        const modelo = { getData: () => ({ urn: URN[0], globalOffset: { x: 10, y: 20, z: 0 } }), isLoadDone: () => hecho };
        const visor = visorDoble({ modelos: [modelo], emiteFrame: false });
        visor.responderA(ventana);
        const e = { ...entornoDe({ ventana, visor }), techos: { ...R.TECHOS, barreraVisual: 60, modelos: 4000 } };
        const p = R.restaurarVistaV2(docV2(), e);
        await dormir(150);            // MUCHO más que el techo del fotograma
        ok('B8b · mientras falta geometría, la vista no ha terminado',
            !ventana.cuenta[R.EVENTOS.fin]);
        hecho = true;
        visor.emitir(R.EVENTOS_LMV.geometriaModelo, {});
        visor.emitir(R.EVENTOS_LMV.fotogramaFinal, { finalFrame: true });
        const r = await p;
        ok('B8b · al completarse la geometría llega el fotograma y cierra completa',
            r.estado === 'completa', r.estado + ' ' + JSON.stringify(r.parte.avisos.map((x) => x.tipo)));
        ok('B8b · SIN sin-fotograma-final: el techo de 8 s no corrió durante la geometría',
            !r.parte.avisos.some((a) => a.tipo === 'sin-fotograma-final'));
    }

    // (c) el techo del fotograma SÍ actúa una vez la geometría está
    {
        const ventana = ventanaDoble();
        const visor = visorDoble({ modelos: [modeloDoble(URN[0])], emiteFrame: false, emiteCamara: false });
        visor.responderA(ventana);
        const e = { ...entornoDe({ ventana, visor }), techos: { ...R.TECHOS, barreraVisual: 40 } };
        const r = await R.restaurarVistaV2(docV2(), e);
        ok('B8c · con geometría lista y sin fotograma, vence su techo',
            r.parte.avisos.some((a) => a.tipo === 'sin-fotograma-final'), r.estado);
        ok('B8c · y la cámara ausente NO degrada por sí misma',
            r.parte.avisos.some((a) => a.tipo === 'camara-sin-transicion'));
    }

    // (d) sólo se esperan los REQUERIDOS: un modelo del frente que la vista no
    //     nombra puede seguir cargando sin bloquear nada
    {
        const ventana = ventanaDoble();
        const ajeno = { getData: () => ({ urn: URN[1], globalOffset: { x: 10, y: 20, z: 0 } }), isLoadDone: () => false };
        const visor = visorDoble({ modelos: [modeloDoble(URN[0]), ajeno] });
        visor.responderA(ventana);
        const e = {
            ...entornoDe({ ventana, visor }),
            modelConfig: configDe(2),
            rosettaPorUrn: rosettaDe([URN[0], URN[1]]),
            techos: { ...R.TECHOS, modelos: 300 },
        };
        const r = await R.restaurarVistaV2(docV2({ modelos: 1 }), e);
        ok('B8d · un modelo NO requerido sin geometría no detiene E9',
            r.estado === 'completa', r.estado + ' ' + JSON.stringify(r.parte.avisos.map((x) => x.tipo)));
        ok('B8d · y no se anotó geometría incompleta',
            !r.parte.avisos.some((a) => a.tipo === 'geometria-incompleta'));
    }
}

titulo('NI UN TEMPORIZADOR DE SINCRONIZACION');
{
    const fuente = await (await import('node:fs/promises'))
        .readFile(new URL('../src/lib/restaurarVistaV2.js', import.meta.url), 'utf8');
    ok('no hay ningún 500 ni 1500 ms en el restaurador',
        !/setTimeout\([^,]+,\s*(500|1500)\s*\)/.test(fuente));
    const techos = [...fuente.matchAll(/^\s{4}(\w+):\s*(\d+),/gm)].map((m) => m[1]);
    ok('los únicos plazos declarados son techos de seguridad',
        igual(techos, ['modelos', 'estadoLmv', 'inventario', 'filtros', 'theming', 'barreraVisual']),
        JSON.stringify(techos));
}

console.log(`\n${total - fallos} de ${total} pasan.`);
process.exit(fallos ? 1 : 0);
