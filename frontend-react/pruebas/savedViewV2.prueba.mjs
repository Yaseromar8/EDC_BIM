/**
 * Compuerta de E-2 — el contrato de Saved Views v2, entero y sin visor.
 *
 *     node frontend-react/pruebas/savedViewV2.prueba.mjs
 *
 * Cada bloque corresponde a una subparte: E-2a allowlist · E-2b rebind ·
 * E-2c identidad de elemento · E-2d preflight · E-2e compatibilidad v1.
 *
 * Los escenarios no son inventados: reproducen lo que la Auditoría 02 midió
 * sobre las vistas reales de producción.
 */

const V2 = await import('../src/lib/savedViewV2.js');
const PF = await import('../src/lib/preflightFiltros.js');

let fallos = 0, total = 0;
const ok = (n, c, d = '') => { total++; if (c) console.log(`  ok   ${n}`); else { fallos++; console.log(`  FALLA ${n}${d ? '  → ' + d : ''}`); } };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ═════════════════════════════════════════════════ E-2a · ALLOWLIST
console.log('\nE-2a · ALLOWLIST DEL ESTADO DEL LMV');
{
    const completo = {
        viewport: { eye: [1, 2, 3], fieldOfView: 35 },
        objectSet: [{ id: [966], hidden: [], isolated: [] }],
        renderOptions: { ao: true },
        cutplanes: [[0, 0, 1, -5]],
        floorGuid: 'g-1', floorOffsetMin: 0, floorOffsetMax: 3,
        floorLineageUrn: 'urn:x', floorVersionUrn: 'urn:y',
        seedURN: 'urn:viejo', version: '1.0', autocam: { pivot: [0, 0, 0] },
        extensionDelFuturo: { loQueSea: true },
    };
    const { doc, ignorados } = V2.capturarLmv(completo);
    ok('los cutplanes YA NO SE PIERDEN', igual(doc.cutplanes, [[0, 0, 1, -5]]));
    ok('la planta AEC tampoco', doc.floorGuid === 'g-1' && doc.floorOffsetMax === 3);
    ok('viewport, objectSet y renderOptions siguen', !!doc.viewport && !!doc.objectSet && !!doc.renderOptions);
    ok('seedURN, version y autocam quedan FUERA',
        doc.seedURN === undefined && doc.version === undefined && doc.autocam === undefined);
    ok('una extensión futura NO entra sola al contrato', doc.extensionDelFuturo === undefined);
    ok('...pero se REGISTRA, para que añadirla sea una decisión',
        ignorados.includes('extensionDelFuturo') && ignorados.includes('autocam'));
    ok('exactamente 9 campos persistibles', V2.CAMPOS_LMV_PERSISTIBLES.length === 9);
}

// ═════════════════════════════════════════════════ E-2b · REBIND
console.log('\nE-2b · LINAJE → URN VIGENTE');
{
    // El caso real: el modelo se guardó en la v50 y hoy va por la v53.
    const modelConfig = [
        { lineage: 'urn:adsk.wipprod:dm.lineage:AAA', urn: 'urn_v53', version_number: 53 },
        { lineage: 'urn:adsk.wipprod:dm.lineage:BBB', urn: 'urn_b', version_number: 7 },
    ];
    const doc = {
        models: [
            { lineage: 'urn:adsk.wipprod:dm.lineage:AAA', urnAtSave: 'urn_v50', versionAtSave: 50 },
            { lineage: 'urn:adsk.wipprod:dm.lineage:BBB', urnAtSave: 'urn_b', versionAtSave: 7 },
            { lineage: 'urn:adsk.wipprod:dm.lineage:ZZZ', urnAtSave: 'urn_z', versionAtSave: 1 },
        ],
        lmv: { objectSet: [{ id: [1], seedUrn: 'urn_v50' }, { id: [2], seedUrn: 'urn_b' }] },
    };
    const plan = V2.planDeRebind(doc, modelConfig);
    ok('el linaje resuelve al URN de hoy', plan.urnPorLinaje.get('urn:adsk.wipprod:dm.lineage:AAA') === 'urn_v53');
    ok('se detecta el cambio de versión', plan.versionCambiada.has('urn:adsk.wipprod:dm.lineage:AAA'));
    ok('el modelo que no cambió no se marca', !plan.versionCambiada.has('urn:adsk.wipprod:dm.lineage:BBB'));
    ok('el modelo que ya no está en el frente se reporta',
        plan.faltan.length === 1 && plan.faltan[0].lineage === 'urn:adsk.wipprod:dm.lineage:ZZZ');

    const { doc: rebindado, cambiados } = V2.aplicarRebind(doc, plan);
    ok('EL seedUrn VIEJO NO LLEGA A restoreObjectSet',
        rebindado.lmv.objectSet[0].seedUrn === 'urn_v53', 'quedó ' + rebindado.lmv.objectSet[0].seedUrn);
    ok('el que no cambió se deja en paz', rebindado.lmv.objectSet[1].seedUrn === 'urn_b');
    ok('el rebind se anota', cambiados.length === 1 && cambiados[0].de === 'urn_v50');
    ok('no muta el documento original', doc.lmv.objectSet[0].seedUrn === 'urn_v50');

    // Vista v1: sin linaje, solo el URN que guardó.
    const v1 = { models: [{ lineage: null, urnAtSave: 'urn_b' }], lmv: { objectSet: [] } };
    ok('una vista v1 se identifica por su URN si aún existe',
        V2.planDeRebind(v1, modelConfig).faltan.length === 0);
    const v1muerta = { models: [{ lineage: null, urnAtSave: 'urn_que_ya_no_existe' }], lmv: { objectSet: [] } };
    ok('y se reporta si ese URN ya no existe',
        V2.planDeRebind(v1muerta, modelConfig).faltan[0].motivo === 'v1-sin-linaje');
}

// ═════════════════════════════════════════════════ E-2c · IDENTIDAD DE ELEMENTO
console.log('\nE-2c · IDENTIDAD DE ELEMENTO ENTRE VERSIONES');
{
    // rosettaToExtId: TODOS los nodos, incluidos los que no son hoja.
    const rosettaV50 = { 100: 'uid-A', 200: 'uid-B', 300: 'uid-C', 400: 'uid-PADRE' };
    const objectSet = { id: [100, 400], hidden: [200], isolated: [300] };

    const elementos = V2.capturarElementos(objectSet, rosettaV50);
    ok('la captura incluye nodos que NO son hoja', igual(elementos.selected, ['uid-A', 'uid-PADRE']));
    ok('ocultos y aislados también se capturan',
        igual(elementos.hidden, ['uid-B']) && igual(elementos.isolated, ['uid-C']));

    // En la v53 los dbIds son otros y uid-C ya no existe.
    const rosettaV53 = { 777: 'uid-A', 888: 'uid-B', 999: 'uid-PADRE' };
    const r = V2.resolverElementos(elementos, rosettaV53);
    ok('los dbIds se resuelven a los de la versión NUEVA', igual(r.selected.sort(), [777, 999]));
    ok('el elemento que ya no existe se pierde y se cuenta',
        r.isolated.length === 0 && igual(r.perdidos.isolated, ['uid-C']));
    ok('el parte cuadra', r.total === 4 && r.resueltos === 3);

    // IFC: un id de ruta NO es identidad persistente.
    const ifc = V2.resolverElementos({ selected: ['0/0/0/12'] }, {}, null);
    ok('un id de ruta IFC se rechaza sin puente', ifc.selected.length === 0 && ifc.perdidos.selected.length === 1);
    const ifcOk = V2.resolverElementos({ selected: ['0/0/0/12'] }, {}, { '0/0/0/12': 55 });
    ok('...y se acepta con el puente a IfcGUID', igual(ifcOk.selected, [55]));

    // La decisión, en un solo sitio.
    ok('misma versión → objectSet nativo',
        V2.politicaDeElementos({ tieneElementos: true, versionCambiada: false }) === 'objectset-nativo');
    ok('versión distinta con externalIds → resolver',
        V2.politicaDeElementos({ tieneElementos: true, versionCambiada: true }) === 'resolver-por-externalid');
    ok('versión distinta SIN externalIds (v1) → DEGRADAR, nunca reusar dbIds',
        V2.politicaDeElementos({ tieneElementos: false, versionCambiada: true }) === 'degradar');
}

// ═════════════════════════════════════════════════ E-2d · PREFLIGHT
console.log('\nE-2d · PREFLIGHT PURO DE FILTERS');
{
    const filas = [
        { dbId: 'uid-A', model_urn: 'urn_a', 'Revit Category': 'Walls', 'Zona': 'Z1' },
        { dbId: 'uid-B', model_urn: 'urn_a', 'Revit Category': 'Floors', 'Zona': 'Z2' },
        { dbId: 'uid-C', model_urn: 'urn_b', 'Revit Category': 'Walls' },
    ];
    const modelos = [{ urn: 'urn_a' }, { urn: 'urn_b' }];

    // EL CASO DE `03_AVANCE_MARZO01`, tal como se midió: propId obsoleto y
    // valores en español que el inventario de hoy tiene en inglés.
    const r = PF.resolverSeleccion({
        filas,
        propiedades: ['__category__::Category'],
        selecciones: { '__category__::Category': ['Revit Muros', 'Revit Suelos'] },
        alias: V2.ALIAS_PROPID,
        modelos,
    });
    ok('el alias traduce el propId obsoleto', r.propiedades.includes('Standard::Revit Category'));
    ok('y se anota que hubo traducción', r.descartes.some((d) => d.tipo === 'alias'));
    ok('NINGUN valor en español casa', r.descartes.some((d) => d.tipo === 'valores-ninguno-casa'));
    ok('LA SELECCION QUEDA VACIA — no hay conjunto que aislar',
        Object.keys(r.selecciones).length === 0, JSON.stringify(r.selecciones));
    ok('y por tanto NUNCA se llega a isolate([-1])', !PF.sePuedeAislar([]) && !PF.sePuedeAislar([-1]));

    // Coincidencia parcial: se aplican los que existen, se reportan los que no.
    const p = PF.resolverSeleccion({
        filas, propiedades: ['Standard::Revit Category'],
        selecciones: { 'Standard::Revit Category': ['Walls', 'Ceilings'] },
        alias: V2.ALIAS_PROPID, modelos,
    });
    ok('coincidencia parcial: sobrevive lo que existe', igual(p.selecciones['Standard::Revit Category'], ['Walls']));
    ok('y se reporta lo perdido', p.descartes.some((d) => d.tipo === 'valores-parcial' && igual(d.perdidos, ['Ceilings'])));

    // Propiedad que no existe en ninguna fila.
    const q = PF.resolverSeleccion({
        filas, propiedades: ['Standard::Inventada'],
        selecciones: { 'Standard::Inventada': ['X'] }, alias: {}, modelos,
    });
    ok('una propiedad inexistente se descarta entera',
        q.propiedades.length === 0 && q.descartes.some((d) => d.tipo === 'propiedad-inexistente'));

    // SIN INVENTARIO NO SE PODA NADA — el error más peligroso sería este.
    const s = PF.resolverSeleccion({
        filas: [], propiedades: ['Standard::Revit Category'],
        selecciones: { 'Standard::Revit Category': ['Walls'] }, alias: {}, modelos,
    });
    ok('sin inventario cargado NO se poda nada', igual(s.selecciones['Standard::Revit Category'], ['Walls']));
    ok('y se dice que no se decidió', s.seDecidio === false && s.descartes.some((d) => d.tipo === 'sin-inventario'));

    // Conservadurismo con los valores sintéticos del motor de facetas.
    const t = PF.resolverSeleccion({
        filas, propiedades: ['Standard::Zona'],
        selecciones: { 'Standard::Zona': ['Z1', '(Unassigned)', '(No aplica)'] }, alias: {}, modelos,
    });
    ok('los valores sintéticos se conservan (no se puede probar su ausencia)',
        t.selecciones['Standard::Zona'].length === 3);

    // Sources: sus valores son modelos, no columnas.
    const u = PF.resolverSeleccion({
        filas, propiedades: ['Standard::Sources'],
        selecciones: { 'Standard::Sources': ['urn_a', 'urn_fantasma'] }, alias: {}, modelos,
    });
    ok('Sources valida contra la federación', igual(u.selecciones['Standard::Sources'], ['urn_a']));

    // Pureza: llamarlo dos veces con los mismos datos da lo mismo, y no muta.
    const antes = JSON.stringify({ filas, sel: { 'Standard::Revit Category': ['Walls'] } });
    PF.resolverSeleccion({ filas, propiedades: ['Standard::Revit Category'], selecciones: { 'Standard::Revit Category': ['Walls'] }, alias: {}, modelos });
    ok('no muta sus entradas', JSON.stringify({ filas, sel: { 'Standard::Revit Category': ['Walls'] } }) === antes);
}

// ═════════════════════════════════════════════════ E-2e · COMPATIBILIDAD v1
console.log('\nE-2e · NORMALIZACION v1 → v2');
{
    // La forma real de las 7 vistas de producción: 3 con config {} y 4 con
    // {"inventoryColumns": null}. Ninguna guardó nunca una lista de columnas.
    const filaV1 = {
        schema_version: 1,
        viewer_state: {
            viewport: { eye: [1, 2, 3] },
            objectSet: [{ id: [966], hidden: [], isolated: [1968], seedUrn: 'urn_a' },
            { id: [], hidden: [], isolated: [], seedUrn: 'urn_b' }],
            renderOptions: {},
        },
        filter_state: {
            filterProperties: ['Standard::Sources', '__category__::Category'],
            filterSelections: { '__category__::Category': ['Revit Muros'] },
            filterColors: {}, customValueColors: { 'x::y': '#fff' },
            sourceColorOn: true, sourceCustomColors: { urn_a: '#000' },
            hiddenModelUrns: ['urn_b'], pkHeatmap: { marca: 'x' },
        },
        config: { inventoryColumns: null },
    };
    const { doc, informe } = V2.normalizarV1aV2(filaV1);
    ok('se reconoce como v1', !V2.esDocumentoV2(filaV1));
    ok('el documento sale en v2', doc.schemaVersion === 2);
    ok('el viewport y el objectSet se conservan', !!doc.lmv.viewport && doc.lmv.objectSet.length === 2);
    ok('se avisa de que v1 no traía cutplanes', informe.some((i) => i.tipo === 'v1-sin-cutplanes'));
    ok('ni planta AEC', informe.some((i) => i.tipo === 'v1-sin-planta-aec'));
    ok('la federación se deduce de los seedUrn', doc.models.length === 2 && doc.models[0].urnAtSave === 'urn_a');
    ok('los filtros migran enteros',
        igual(doc.filters.properties, ['Standard::Sources', '__category__::Category'])
        && doc.filters.sourceColor.on === true && igual(doc.filters.hiddenModelUrnsV1, ['urn_b']));
    ok('el heatmap PK se conserva', doc.extensions.pkHeatmap.marca === 'x');

    ok('inventoryColumns: null es SIN DATO, no «todas visibles»',
        doc.inventory === undefined && informe.some((i) => i.tipo === 'v1-inventario-sin-dato'));

    const conColumnas = V2.normalizarV1aV2({ ...filaV1, config: { inventoryColumns: ['A', 'B'] } });
    ok('una lista real sí se traduce a custom, con su orden',
        igual(conColumnas.doc.inventory.columns, { mode: 'custom', keys: ['A', 'B'] }));

    const configVacia = V2.normalizarV1aV2({ ...filaV1, config: {} });
    ok('config {} también es SIN DATO', configVacia.doc.inventory === undefined);

    // Un modelo único: v1 no pudo guardar seedUrn (regla del LMV: solo si >1).
    const unSoloModelo = V2.normalizarV1aV2({
        viewer_state: { objectSet: [{ id: [1] }] }, filter_state: {}, config: {},
    });
    ok('con un solo modelo, v1 no sabe a qué modelo pertenecía',
        unSoloModelo.doc.models.length === 0 && unSoloModelo.informe.some((i) => i.tipo === 'v1-federacion-desconocida'));

    ok('una fila v2 se reconoce como tal', V2.esDocumentoV2({ schema_version: 2, state: {} }));
}

// ═══════════════════════════════ E-4B · `Standard::Sources` DE UNA v1
//
// Una v1 guardó los modelos filtrados por su URN de aquel día. El URN lleva la
// versión dentro, así que al leerla hay que traducirlo a linaje contra
// `model_config`. Lo que no se pueda traducir NO se arrastra al documento v2:
// se cae de la selección y se dice.
console.log('\nE-4B · `Standard::Sources` DE UNA v1 (urn → linaje)');
{
    const URN_50 = Buffer.from('urn:adsk.wipprod:fs.file:vf.zzCcC?version=50')
        .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const URN_51 = Buffer.from('urn:adsk.wipprod:fs.file:vf.zzCcC?version=51')
        .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const URN_OTRO = Buffer.from('urn:adsk.wipprod:fs.file:vf.zzBorrado?version=3')
        .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const LIN = 'urn:adsk.wipprod:dm.lineage:zzCcC';

    // El frente de HOY: el modelo va por la 51; la vista se guardó en la 50.
    const modelConfig = [{ urn: URN_51, item_id: LIN, version_number: 51 }];

    const filaConSources = (sources, seed) => ({
        schema_version: 1,
        viewer_state: { objectSet: [{ id: [1], seedUrn: seed }, { id: [], seedUrn: seed }] },
        filter_state: {
            filterProperties: ['Standard::Sources'],
            filterSelections: { 'Standard::Sources': sources },
        },
        config: {},
    });

    // C · RESOLUBLE. El urn de la vista es el de la 50 y `model_config` tiene la
    //     51: se traducen por LINAJE, que es lo único común a las dos.
    //     (el índice se construye con el urn VIGENTE, así que aquí se usa el
    //     vigente para demostrar la traducción; el caso del urn viejo va abajo)
    const c = V2.normalizarV1aV2(filaConSources([URN_51], URN_51), modelConfig);
    ok('C · una v1 con Sources por URN vigente se traduce a linaje',
        igual(c.doc.filters.selections['Standard::Sources'], [LIN]),
        JSON.stringify(c.doc.filters.selections));
    ok('C · y el modelo del objectSet también gana su linaje',
        c.doc.models.length === 2 && c.doc.models.every((m) => m.lineage === LIN));
    ok('C · el documento normalizado ya no contiene ningún URN en Sources',
        !V2.esPersistibleV2(c.doc).problemas.some((p) => p.campo.includes('Sources')));

    // D · IRRESOLUBLE. El modelo ya no está en el frente: no hay linaje que
    //     ponerle. Se DEGRADA —se cae de la selección— y se anota.
    const d = V2.normalizarV1aV2(filaConSources([URN_OTRO], URN_OTRO), modelConfig);
    ok('D · un Source que ya no está en el frente se cae de la selección',
        d.doc.filters.selections['Standard::Sources'] === undefined,
        JSON.stringify(d.doc.filters.selections));
    ok('D · y se dice cuál se perdió, en vez de callarlo',
        d.informe.some((i) => i.tipo === 'v1-source-sin-linaje' && i.perdidos[0] === URN_OTRO));
    ok('D · el modelo sin linaje también se anota',
        d.informe.some((i) => i.tipo === 'v1-modelo-sin-linaje'));
    ok('D · y el documento NO es persistible como v2',
        V2.esPersistibleV2(d.doc).ok === false);
    ok('D · el URN irresoluble NO aparece por ningún lado del documento',
        !JSON.stringify(d.doc.filters.selections).includes(URN_OTRO));

    // Mezcla: uno resuelve y otro no. Se conserva el que sí.
    const mezcla = V2.normalizarV1aV2(filaConSources([URN_51, URN_OTRO], URN_51), modelConfig);
    ok('mezcla · se conserva el que resuelve y se pierde el que no',
        igual(mezcla.doc.filters.selections['Standard::Sources'], [LIN])
        && mezcla.informe.some((i) => i.tipo === 'v1-source-sin-linaje'));

    // SIN `model_config` no se inventa nada.
    const aCiegas = V2.normalizarV1aV2(filaConSources([URN_51], URN_51));
    ok('sin model_config no se traduce nada y el documento no es persistible',
        aCiegas.doc.models.every((m) => m.lineage === null)
        && V2.esPersistibleV2(aCiegas.doc).ok === false);

    // Un propId normal no se toca.
    const normal = V2.normalizarV1aV2({
        viewer_state: { objectSet: [{ id: [1], seedUrn: URN_51 }] },
        filter_state: { filterSelections: { 'Standard::Revit Category': ['Walls'] } },
        config: {},
    }, modelConfig);
    ok('la traducción es SOLO de Sources: los demás propId pasan intactos',
        igual(normal.doc.filters.selections['Standard::Revit Category'], ['Walls']));

    // EL CASO QUE DE VERDAD IMPORTA: la vista es de marzo y guardó el urn de la
    // v50; el frente sirve hoy la v51. `model_config` indexa por el urn VIGENTE,
    // así que buscar por urn no encuentra nada — pero el linaje va DENTRO del
    // urn, y ese sí está en el frente.
    const viejo = V2.normalizarV1aV2(filaConSources([URN_50], URN_50), modelConfig);
    ok('un urn de una versión ANTERIOR resuelve por el linaje que lleva dentro',
        igual(viejo.doc.filters.selections['Standard::Sources'], [LIN]),
        JSON.stringify(viejo.doc.filters.selections));
    ok('...y ese es el motivo de deducir el linaje en vez de buscar el urn',
        viejo.doc.models.every((m) => m.lineage === LIN)
        && !viejo.informe.some((i) => i.tipo === 'v1-source-sin-linaje'));

    ok('linajeDeUrn decodifica el urn real de APS',
        V2.linajeDeUrn(URN_50) === LIN && V2.linajeDeUrn(URN_51) === LIN);
    ok('...y en claro también', V2.linajeDeUrn('urn:adsk.wipprod:fs.file:vf.zzCcC?version=9') === LIN);
    ok('lo que no es un urn de versión no da linaje',
        V2.linajeDeUrn('cualquier cosa') === null && V2.linajeDeUrn(LIN) === null);

    // DEDUCIR NO ES INVENTAR: un linaje deducido que NO está en el frente se cae.
    const fuera = V2.normalizarV1aV2(filaConSources([URN_OTRO], URN_OTRO), modelConfig);
    ok('un linaje deducido que no está en el frente NO se acepta',
        fuera.doc.filters.selections['Standard::Sources'] === undefined
        && V2.linajeDeUrn(URN_OTRO) !== null,
        'el urn decodifica, pero ese modelo ya no está cargado: se degrada igual');
}

// ═════════════════════════════════════════════════ PARTE DE DAÑOS
console.log('\nPARTE DE DAÑOS');
{
    const i = V2.nuevoInforme();
    ok('empieza completa', i.estado === 'completa');
    V2.anotar(i, 'alias', { propId: 'x' });
    ok('un alias NO degrada: es una traducción esperada', i.estado === 'completa');
    V2.anotar(i, 'valores-ninguno-casa', { propId: 'x' });
    ok('perder valores sí degrada', i.estado === 'degradada');
    V2.fallar(i, 'sin viewer_state');
    ok('y un fallo es fallo', i.estado === 'fallida');
}

// ═════════════════════════════════════ E-4B · ¿SE PUEDE GUARDAR?
//
// EL MISMO CORPUS QUE LA BATERÍA DE PYTHON. `backend/vistas_v2.py` es la
// autoridad y esto es la comprobación de cortesía que se hace antes de gastar
// una petición; que las dos digan lo mismo no se confía a la memoria de nadie:
// las dos recorren `backend/tests/corpus_persistibilidad_v2.json` entero, y una
// regla cambiada en un solo lado rompe una de las dos.
console.log('\nE-4B · INVARIANTE DE PERSISTIBILIDAD (corpus compartido con el backend)');
{
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const { dirname, join } = await import('node:path');
    const aqui = dirname(fileURLToPath(import.meta.url));
    const corpus = JSON.parse(
        readFileSync(join(aqui, '..', '..', 'backend', 'tests', 'corpus_persistibilidad_v2.json'), 'utf8'));

    for (const caso of corpus.casos) {
        const { ok: veredicto, problemas } = V2.esPersistibleV2(caso.state);
        const motivos = [...new Set(problemas.map((p) => p.motivo))].sort();
        ok(`${caso.esperado ? 'guarda' : 'rechaza'}: ${caso.nombre}`,
            veredicto === caso.esperado && igual(motivos, caso.motivos),
            `esperado ok=${caso.esperado} motivos=${JSON.stringify(caso.motivos)}; ` +
            `obtenido ok=${veredicto} motivos=${JSON.stringify(motivos)}`);
    }
    ok(`el corpus tiene casos de los dos signos (${corpus.casos.filter((c) => c.esperado).length} sí / ` +
        `${corpus.casos.filter((c) => !c.esperado).length} no)`,
        corpus.casos.some((c) => c.esperado) && corpus.casos.some((c) => !c.esperado));

    // Un rechazo tiene que decir DÓNDE, o no se puede arreglar.
    const malo = corpus.casos.find((c) => !c.esperado);
    const { problemas: ps } = V2.esPersistibleV2(malo.state);
    ok('cada problema dice campo y motivo', ps.length > 0 && ps.every((x) => x.campo && x.motivo));

    // Y no puede corregir el documento por su cuenta.
    const antes = JSON.stringify(malo.state);
    V2.esPersistibleV2(malo.state);
    ok('validar NO modifica el documento', JSON.stringify(malo.state) === antes);

    // Las dos formas reales de identificador de APS.
    const urnReal = Buffer.from('urn:adsk.wipprod:fs.file:vf.ub2xfjDiRByamkMzvQ?version=50')
        .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const linajeReal = 'urn:adsk.wipprod:dm.lineage:ub2xfjDiRByamkMzvQ';
    ok('un urn de APS se reconoce como identidad de VERSIÓN', V2.contieneUrnDeVersion(urnReal));
    ok('...también escondido en la cola de una clave `propId::valor`',
        V2.contieneUrnDeVersion('Standard::Sources::' + urnReal));
    ok('y un linaje NO lo es', !V2.contieneUrnDeVersion(linajeReal) && V2.esLinaje(linajeReal));
}

console.log(`\n${total - fallos} de ${total} pasan.`);
process.exit(fallos ? 1 : 0);
