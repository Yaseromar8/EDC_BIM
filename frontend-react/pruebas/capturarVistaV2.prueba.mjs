/**
 * Banco del capturador v2 — E-6.
 *
 *     node frontend-react/pruebas/capturarVistaV2.prueba.mjs
 *
 * Se ejecuta `capturarVistaV2` de verdad. Lo que es un doble es el VISOR —un
 * objeto con `getAllModels()`— y el estado del LMV, que aquí se escribe a mano
 * con la forma exacta que devuelve `viewer.getState()`.
 *
 * Cada caso mide UNA traducción, porque son las tres traducciones lo que
 * justifica que este módulo exista: urn a linaje, dbId a externalId, y el
 * globalOffset del modelo BASE y no de `viewer.model`.
 */

const C = await import('../src/lib/capturarVistaV2.js');
const V = await import('../src/lib/savedViewV2.js');

let fallos = 0, total = 0;
const ok = (n, c, d = '') => { total++; if (c) console.log(`  ok   ${n}`); else { fallos++; console.log(`  FALLA ${n}${d ? '  → ' + d : ''}`); } };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const titulo = (t) => console.log(`\n${t}\n${'-'.repeat(t.length)}`);

// ── Identificadores con la forma real ──────────────────────────────────────
const b64 = (s) => Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const urnDe = (id, v) => b64(`urn:adsk.wipprod:fs.file:vf.${id}?version=${v}`);
const linDe = (id) => `urn:adsk.wipprod:dm.lineage:${id}`;

const IDS = ['zzAaa', 'zzBbb', 'zzCcc', 'zzDdd', 'zzEee'];
const LIN = IDS.map(linDe);
const URN = IDS.map((i, n) => urnDe(i, n + 1));

const OFFSET_BASE = { x: 469953888.7152726, y: 9496220126.572807, z: 51382.85073776245 };

const modeloDoble = (urn, offset) => ({ getData: () => ({ urn, globalOffset: offset }) });

/** El visor: cinco modelos en su orden de carga, y un `model` que NO vale. */
function visorDoble(urns = URN, offsets = null) {
    return {
        getAllModels: () => urns.map((u, i) => modeloDoble(u, offsets ? offsets[i] : OFFSET_BASE)),
        // A propósito con otro offset: si el capturador leyera de aquí en vez de
        // del modelo base, el caso del globalOffset lo destaparía.
        model: modeloDoble(URN[4], { x: -1, y: -1, z: -1 }),
    };
}

const configDe = (n = 5) => IDS.slice(0, n).map((id, i) => ({
    urn: URN[i], item_id: LIN[i], version_number: i + 1, name: 'M' + i,
}));

const estadoLmvDe = (extra = {}) => ({
    viewport: { eye: [1, 2, 3], target: [0, 0, 0], fieldOfView: 35, isPerspective: false },
    objectSet: [{ id: [101, 102], hidden: [103], isolated: [], idType: 'lmv', seedUrn: URN[0] }],
    renderOptions: { environment: 'Boardwalk' },
    cutplanes: [[0, 0, 1, -5]],
    floorGuid: 'planta-3',
    // Lo que NO está en la allowlist y tiene que quedarse fuera:
    seedURN: URN[0],
    version: '1.4.6',
    autocam: { pivot: [0, 0, 0] },
    ...extra,
});

const rosettaDe = () => ({
    [URN[0]]: { 101: 'ext-A', 102: 'ext-B', 103: 'ext-C' },
});

const entornoDe = (extra = {}) => ({
    visor: extra.visor || visorDoble(),
    estadoLmv: extra.estadoLmv !== undefined ? extra.estadoLmv : estadoLmvDe(),
    modelConfig: extra.modelConfig || configDe(),
    ocultosUrn: extra.ocultosUrn || [URN[3]],
    rosettaPorUrn: extra.rosettaPorUrn || rosettaDe(),
    filtros: extra.filtros || {
        properties: ['Standard::Revit Category', V.PROP_SOURCES],
        selections: {
            'Standard::Revit Category': ['Walls', 'Floors'],
            [V.PROP_SOURCES]: [URN[0], URN[2]],          // URNS en runtime
        },
        colors: { 'Standard::Revit Category': true },
        valueColors: { 'Standard::Revit Category::Walls': '#ff0000' },
        sourceColor: { on: true, custom: { [URN[1]]: '#00ff00' } },
    },
    inventario: extra.inventario !== undefined ? extra.inventario
        : { columns: { mode: 'custom', keys: ['A', 'B'] }, groupBy: 'A', totals: ['B'], assetsOnly: true },
    pkHeatmap: extra.pkHeatmap ?? null,
    appVersion: 'e-6',
    reloj: () => '2026-09-06T00:00:00.000Z',
});

// ═══════════════════════════════════════════════════════════════════ CASOS

titulo('1 · UN ESPACIO DE TRABAJO NO TRIVIAL SALE COMO DOCUMENTO PERSISTIBLE');
{
    const { doc, informe, validacion } = C.capturarVistaV2(entornoDe());
    ok('el documento es persistible', validacion.ok, JSON.stringify(validacion.problemas));
    ok('se declara v2', doc.schemaVersion === 2);
    ok('nombra los cinco modelos', doc.models.length === 5);
    ok('todos con linaje de verdad', doc.models.every((m) => V.esLinaje(m.lineage)));
    ok('y en el orden de carga del visor', igual(doc.models.map((m) => m.order), [0, 1, 2, 3, 4]));
    ok('con el linaje que les toca', igual(doc.models.map((m) => m.lineage), LIN));
    ok('el urn del momento se guarda como `urnAtSave`', igual(doc.models.map((m) => m.urnAtSave), URN));
    ok('y su versión', igual(doc.models.map((m) => m.versionAtSave), [1, 2, 3, 4, 5]));
    ok('el modelo apagado se marca invisible',
        doc.models.filter((m) => !m.visible).map((m) => m.lineage).join() === LIN[3]);
    ok('y también sale en hiddenModelLineages', igual(doc.filters.hiddenModelLineages, [LIN[3]]));
    ok('la cámara viaja', doc.lmv.viewport.fieldOfView === 35);
    ok('la sección también', igual(doc.lmv.cutplanes, [[0, 0, 1, -5]]));
    ok('y la planta AEC', doc.lmv.floorGuid === 'planta-3');
    ok('el inventario canónico entero',
        igual(doc.inventory, { columns: { mode: 'custom', keys: ['A', 'B'] }, groupBy: 'A', totals: ['B'], assetsOnly: true }));
    ok('los colores por valor', doc.filters.valueColors['Standard::Revit Category::Walls'] === '#ff0000');
    ok('el coloreado por fuente', doc.filters.sourceColor.on === true);
    ok('y `capturedAt` con la hora inyectada', doc.meta.capturedAt === '2026-09-06T00:00:00.000Z');
    ok('sin apuntes de pérdida más allá de lo esperado',
        informe.every((a) => ['lmv-fuera-de-allowlist'].includes(a.tipo)),
        JSON.stringify(informe.map((a) => a.tipo)));
}

titulo('2 · Standard::Sources SE GUARDA POR LINAJE, NO POR URN');
{
    const { doc } = C.capturarVistaV2(entornoDe());
    const sel = doc.filters.selections[V.PROP_SOURCES];
    ok('la selección de fuentes son linajes', sel.every((v) => V.esLinaje(v)), JSON.stringify(sel));
    ok('y son los de los modelos elegidos', igual(sel, [LIN[0], LIN[2]]));
    ok('ni un urn con versión dentro en TODO el documento',
        !V.contieneUrnDeVersion(JSON.stringify(doc.filters.selections)));
    ok('el resto de propiedades no se toca',
        igual(doc.filters.selections['Standard::Revit Category'], ['Walls', 'Floors']));
}

titulo('3 · globalOffsetAtSave SALE DEL MODELO BASE order=0');
{
    // Cada modelo con un offset distinto: si se leyera el de otro, se ve.
    const offsets = [OFFSET_BASE, { x: 1, y: 1, z: 1 }, { x: 2, y: 2, z: 2 }, { x: 3, y: 3, z: 3 }, { x: 4, y: 4, z: 4 }];
    const { doc } = C.capturarVistaV2(entornoDe({ visor: visorDoble(URN, offsets) }));
    ok('es exactamente el del primero cargado', igual(doc.federation.globalOffsetAtSave, OFFSET_BASE),
        JSON.stringify(doc.federation.globalOffsetAtSave));
    ok('y NO el de `viewer.model`',
        doc.federation.globalOffsetAtSave.x !== -1);
    ok('el modelo base es el que lleva order 0', doc.models[0].order === 0 && doc.models[0].lineage === LIN[0]);

    const sinOffset = C.capturarVistaV2(entornoDe({
        visor: { getAllModels: () => [{ getData: () => ({ urn: URN[0] }) }], model: null },
        modelConfig: configDe(1),
    }));
    ok('si el base no declara offset se dice, no se coge el de otro',
        sinOffset.doc.federation.globalOffsetAtSave === null
        && sinOffset.informe.some((a) => a.tipo === 'sin-global-offset'));
}

titulo('4 · IDENTIDAD ESTABLE DE LOS ELEMENTOS');
{
    const { doc } = C.capturarVistaV2(entornoDe());
    const e = doc.lmv.objectSet[0];
    ok('el objectSet nativo se conserva', igual(e.id, [101, 102]) && igual(e.hidden, [103]));
    ok('y ademas lleva su traducción a externalId',
        igual(e.elements, { selected: ['ext-A', 'ext-B'], hidden: ['ext-C'], isolated: [] }),
        JSON.stringify(e.elements));

    const sinRosetta = C.capturarVistaV2(entornoDe({ rosettaPorUrn: {} }));
    ok('sin Rosetta no se inventa identidad: se conserva el objectSet y se dice',
        sinRosetta.doc.lmv.objectSet[0].elements === undefined
        && sinRosetta.informe.some((a) => a.tipo === 'elementos-sin-rosetta'));

    const parcial = C.capturarVistaV2(entornoDe({ rosettaPorUrn: { [URN[0]]: { 101: 'ext-A' } } }));
    ok('y si sólo se puede traducir una parte, se anota',
        parcial.informe.some((a) => a.tipo === 'elementos-parcialmente-identificados'));
}

titulo('5 · LO QUE NUNCA SE PERSISTE');
{
    const { doc, informe } = C.capturarVistaV2(entornoDe());
    ok('nada de `hiddenModelUrnsV1`',
        !Object.prototype.hasOwnProperty.call(doc.filters, 'hiddenModelUrnsV1'));
    ok('nada de `urnActual` en los modelos', doc.models.every((m) => m.urnActual === undefined));
    ok('las claves del LMV fuera de la allowlist NO entran',
        doc.lmv.seedURN === undefined && doc.lmv.version === undefined && doc.lmv.autocam === undefined);
    ok('pero se REGISTRAN, para que añadirlas sea una decisión',
        informe.some((a) => a.tipo === 'lmv-fuera-de-allowlist'
            && a.claves.includes('seedURN') && a.claves.includes('autocam')),
        JSON.stringify(informe.find((a) => a.tipo === 'lmv-fuera-de-allowlist')));
    ok('sólo salen claves de la allowlist',
        Object.keys(doc.lmv).every((k) => C.CLAVES_LMV.includes(k)), Object.keys(doc.lmv).join());
}

titulo('5b · LOS MAPAS INDEXADOS POR URN SE REINDEXAN POR LINAJE');
{
    // Es el defecto que destapó este banco: `sourceColor.custom` viaja en
    // runtime indexado por URN, y un mapa así hace el documento NO persistible.
    const { doc, informe, validacion } = C.capturarVistaV2(entornoDe());
    ok('el mapa de colores por fuente queda indexado por linaje',
        igual(Object.keys(doc.filters.sourceColor.custom), [LIN[1]]),
        JSON.stringify(Object.keys(doc.filters.sourceColor.custom)));
    ok('conservando el color', doc.filters.sourceColor.custom[LIN[1]] === '#00ff00');
    ok('y el documento pasa la regla del servidor', validacion.ok,
        JSON.stringify(validacion.problemas));
    ok('ninguna clave del documento lleva un urn con versión',
        !V.contieneUrnDeVersion(Object.keys(doc.filters.sourceColor.custom).join('|')));

    // Un color por valor bajo `Standard::Sources` lleva un URN en la clave.
    const conColorDeFuente = C.capturarVistaV2(entornoDe({
        filtros: {
            ...entornoDe().filtros,
            valueColors: { 'Standard::Revit Category::Walls': '#ff0000', [`${V.PROP_SOURCES}::${URN[0]}`]: '#123456' },
        },
    }));
    ok('un color por valor con urn dentro NO se persiste',
        Object.keys(conColorDeFuente.doc.filters.valueColors).length === 1);
    ok('y se dice cuál se deja fuera',
        conColorDeFuente.informe.some((a) => a.tipo === 'color-de-valor-con-urn'));
    ok('el que no caduca sigue ahí',
        conColorDeFuente.doc.filters.valueColors['Standard::Revit Category::Walls'] === '#ff0000');
    ok('y el documento sigue siendo persistible', V.esPersistibleV2(conColorDeFuente.doc).ok);
}

titulo('5c Â· LOS MODELOS OCULTOS SE ACOTAN A LOS DE ESTA CAPTURA');
{
    // `hiddenModelUrns` se arrastra entre vistas y puede traer modelos de otro
    // frente. Persistirlos no oculta nada al restaurar --no hay urn que darles--
    // y hace que el restaurador degrade con `linajes-sin-urn`.
    const ajeno = urnDe('zzZZZ', 3);
    const { doc, informe } = C.capturarVistaV2(entornoDe({ ocultosUrn: [URN[3], ajeno] }));
    ok('el oculto que SÃ estÃ¡ en la captura se guarda',
        igual(doc.filters.hiddenModelLineages, [LIN[3]]),
        JSON.stringify(doc.filters.hiddenModelLineages));
    ok('el ajeno no se persiste',
        doc.filters.hiddenModelLineages.every((l) => doc.models.some((m) => m.lineage === l)));
    ok('y se dice cuÃ¡l se dejÃ³ fuera',
        informe.some((a) => a.tipo === 'ocultos-fuera-de-la-captura' && a.lineages.length === 1));
    ok('todo linaje oculto estÃ¡ en models[]',
        doc.filters.hiddenModelLineages.every((l) => doc.models.map((m) => m.lineage).includes(l)));
    ok('el documento sigue siendo persistible', V.esPersistibleV2(doc).ok);

    const repetido = C.capturarVistaV2(entornoDe({ ocultosUrn: [URN[3], URN[3]] }));
    ok('y no se repite si el mismo urn viene dos veces',
        repetido.doc.filters.hiddenModelLineages.length === 1);
}

titulo('5d Â· EL seedUrn SE NORMALIZA AL URN EXACTO DEL MODELO CARGADO');
{
    // De este string depende que E-5 tome el camino NATIVO --misma versiÃ³n, los
    // dbIds tal cual-- o el de resolver por externalId. Si el serializador lo
    // escribiera con otra codificaciÃ³n, E-5 no encontrarÃ­a el modelo y asumirÃ­a
    // versiÃ³n cambiada.
    const otraForma = URN[0].replace(/-/g, '+').replace(/_/g, '/') + '==';
    const { doc, informe } = C.capturarVistaV2(entornoDe({
        estadoLmv: estadoLmvDe({
            objectSet: [{ id: [101], hidden: [], isolated: [], idType: 'lmv', seedUrn: otraForma }],
        }),
    }));
    ok('el seedUrn guardado es el del modelo cargado, carÃ¡cter a carÃ¡cter',
        doc.lmv.objectSet[0].seedUrn === URN[0], doc.lmv.objectSet[0].seedUrn);
    ok('y con Ã©l E-5 encuentra su modelo',
        doc.models.some((m) => m.urnAtSave === doc.lmv.objectSet[0].seedUrn));
    ok('sin inventar nada: si la entrada no casa con ningÃºn modelo, se dice',
        C.capturarVistaV2(entornoDe({
            estadoLmv: estadoLmvDe({ objectSet: [{ id: [1], hidden: [], isolated: [], seedUrn: 'urn-que-no-existe' }] }),
        })).informe.some((a) => a.tipo === 'objectset-sin-modelo-cargado'));
    ok('el resto de la entrada no se toca', doc.lmv.objectSet[0].id.length === 1);
    ok('y no se anota nada raro cuando ya venia exacto',
        !C.capturarVistaV2(entornoDe()).informe.some((a) => a.tipo === 'objectset-sin-modelo-cargado'));
}

titulo('6 · UN MODELO SIN LINAJE HACE EL DOCUMENTO NO PERSISTIBLE, Y SE DICE');
{
    // Un modelo cargado que no está en la configuración del frente y cuyo urn no
    // decodifica: no hay forma honesta de nombrarlo.
    const raro = 'no-es-un-urn-de-aps';
    const { doc, informe, validacion } = C.capturarVistaV2(entornoDe({
        visor: { getAllModels: () => [modeloDoble(raro, OFFSET_BASE)], model: null },
        modelConfig: [],
        ocultosUrn: [],
        rosettaPorUrn: {},
    }));
    ok('el capturador lo dice', informe.some((a) => a.tipo === 'modelo-sin-linaje'));
    ok('y la validación lo bloquea, con la misma regla que el servidor',
        !validacion.ok && validacion.problemas.some((p) => p.motivo === 'LINAJE_AUSENTE'),
        JSON.stringify(validacion.problemas.map((p) => p.motivo)));
    ok('no se «arregla» poniendo cualquier cosa', doc.models[0].lineage === null);
}

titulo('7 · SIN INVENTARIO NO SE INVENTA UNO');
{
    const { doc, informe } = C.capturarVistaV2(entornoDe({ inventario: null }));
    ok('la clave `inventory` no aparece', doc.inventory === undefined);
    ok('y se anota que no había dato', informe.some((a) => a.tipo === 'inventario-sin-dato'));
    ok('el documento sigue siendo persistible', V.esPersistibleV2(doc).ok);
}

titulo('8 · EL DOCUMENTO CAPTURADO ENTRA EN EL RESTAURADOR');
{
    // El contrato de entrada del restaurador es MÁS estricto que el del
    // servidor: comprueba además el inventario triestado y la forma del lmv.
    const R = await import('../src/lib/restaurarVistaV2.js');
    const { doc } = C.capturarVistaV2(entornoDe());
    const contrato = R.contratoDeEntrada(doc);
    ok('lo acepta sin una sola objeción', contrato.ok, JSON.stringify(contrato.problemas));

    const plan = V.planDeRebind(doc, configDe());
    ok('y el rebind reencuentra los cinco modelos por linaje',
        [...plan.urnPorLinaje.keys()].length === 5);
    ok('sin ninguno perdido', (plan.faltantes || []).length === 0);
}

console.log(`\n${total - fallos} de ${total} pasan.`);
process.exit(fallos ? 1 : 0);
