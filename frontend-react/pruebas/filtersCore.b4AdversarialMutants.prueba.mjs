/**
 * Mutantes de la revisión independiente B4.
 * Ejecutar: node frontend-react/pruebas/filtersCore.b4AdversarialMutants.prueba.mjs
 *
 * Cubren los dos ataques que `filtersCore.b4Mutants` no cubría: mutar la
 * configuración antes de Confirmar, y dejar vigente el resultado viejo mientras
 * la revisión nueva está pendiente. Producto sano: PASS. Mutante: FAIL contra el
 * MISMO oráculo, sin tocar el oráculo. Las mutaciones son en memoria; ningún
 * fichero de producción se modifica.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentHost, nodes, text, label, event, modalFile } from './filtersCore.b4.prueba.mjs';
import { makeRuntimeFixture, tick } from './filtersRuntime/fixture.mjs';

const url = rel => new URL(rel, import.meta.url);
const leer = rel => readFileSync(url(rel), 'utf8');
const dataUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const unaVez = (texto, antes, despues) => {
    assert.equal(texto.split(antes).length, 2, 'ancla de mutación no única: ' + antes);
    return texto.replace(antes, despues);
};

// ── ORÁCULO 1 · el configurador no aplica hasta Confirmar ────────────────────
// Es el caso A3 del banco adversarial, ejecutado aquí contra el producto sano y
// contra el mutante. El oráculo es el mismo en las dos pasadas.
function oraculoConfigurador(mutar) {
    const ui = componentHost(modalFile, { transform: mutar });
    let updates = 0, closes = 0;
    const p = { open: true, selectedProperties: ['G::A', 'G::B'], filterSelections: {},
        availableProperties: ['G::A', 'G::B'].map(id => ({ id, name: id.slice(3), category: 'G' })),
        onUpdate() { updates++; }, onClose() { closes++; } };
    let tree = ui.render(p);
    label(tree, 'Quitar G::B').props.onClick(event());
    tree = ui.render(p);
    assert.deepEqual(nodes(tree, n => n.props.draggable).map(n => n.props.key), ['G::A'], 'la edición es local');
    nodes(tree, n => n.type === 'button' && text(n) === 'Cancelar')[0].props.onClick(event());
    ui.dispose();
    assert.equal(updates, 0, 'Cancelar tras editar NO puede haber aplicado nada');
    assert.equal(closes, 1);
}

// ── ORÁCULO 2 · abrir una revisión no deja vigente el resultado anterior ─────
// Recorre el runtime REAL. Para el mutante se reescribe `filtersCore` en memoria
// y se apunta ahí el import del puente, sin tocar el disco.
async function oraculoPending(mutarCore) {
    let bridgeUrl = url('../src/lib/filterRuntimeBridge.js').href;
    if (mutarCore) {
        let core = leer('../src/lib/filtersCore.js');
        core = unaVez(core, "from './inventoryIdentity.js'", `from ${JSON.stringify(url('../src/lib/inventoryIdentity.js').href)}`);
        core = unaVez(core, "from '../aps/utils/model.js'", `from ${JSON.stringify(url('../src/aps/utils/model.js').href)}`);
        core = mutarCore(core);
        let bridge = leer('../src/lib/filterRuntimeBridge.js');
        bridge = unaVez(bridge, "from './filtersCore.js'", `from ${JSON.stringify(dataUrl(core))}`);
        for (const dep of ['filterVisualDriver', 'inventoryIdentity'])
            bridge = unaVez(bridge, `from './${dep}.js'`, `from ${JSON.stringify(url('../src/lib/' + dep + '.js').href)}`);
        bridgeUrl = dataUrl(bridge);
    }
    const { mountFiltersRuntime } = await import(bridgeUrl);
    const f = makeRuntimeFixture({ count: 4 });
    const publicados = [];
    f.host.addEventListener('filter-result', e => publicados.push(e.detail));
    const runtime = mountFiltersRuntime({ host: f.host, viewer: f.viewer, getIntent: () => f.state,
        models: () => f.models, ready: () => true });
    await tick();
    f.state.filterSelections = { 'G::Estado': ['NoExisteEnElDataset'] };
    runtime.request(f.state); await tick();
    const a = runtime.controller.getResult();
    assert.equal(a.status, 'ready');
    assert.equal(a.matches.length, 0, 'A debe ser un zero real');
    const antes = publicados.length;
    f.state.filterSelections = { 'G::Estado': ['Ejecutado'] };
    runtime.request(f.state);
    const primeroDeB = publicados[antes];
    runtime.dispose();
    assert.ok(primeroDeB, 'abrir una revisión debe publicar algo de inmediato');
    assert.notEqual(primeroDeB.revision, a.revision);
    assert.equal(primeroDeB.status, 'pending', 'el zero de A no puede seguir vigente al abrir B');
}

// El mutante SÍ construye la instantánea pending: sólo deja de publicarla. Es el
// defecto realista —la UI se queda con el último ready, el zero de A— y no una
// excepción que enmascare el oráculo.
const PENDING_PUBLICADO = [
    '                matchesByModel:null,facets:{},coverage:{},diagnostics:[]});',
    '            publish(current);',
].join('\n');

const mutaciones = [
    { id: 'configurator-mutates-before-confirm',
      oraculo: 'Cancelar tras editar no aplica',
      sano: () => oraculoConfigurador(s => s),
      roto: () => oraculoConfigurador(s => unaVez(s,
          '        setCurrentSelection(prev => prev.filter(id => id !== propId));',
          '        setCurrentSelection(prev => { const next = prev.filter(id => id !== propId); onUpdate(next); return next; });')) },
    { id: 'stale-result-stays-current-during-pending',
      oraculo: 'abrir B publica pending, no el ready de A',
      sano: () => oraculoPending(null),
      roto: () => oraculoPending(core => unaVez(core, PENDING_PUBLICADO, PENDING_PUBLICADO.split('\n')[0])) },
];

const resultados = [];
for (const m of mutaciones) {
    let sano = 'PASS', errorSano = null;
    try { await m.sano(); } catch (e) { sano = 'FAIL'; errorSano = e.message; }
    let roto = 'PASS', errorRoto = null;
    try { await m.roto(); } catch (e) { roto = 'FAIL'; errorRoto = e.message; }
    resultados.push({ mutacion: m.id, oraculo: m.oraculo, productoSano: sano, mutante: roto,
        muerto: sano === 'PASS' && roto === 'FAIL', errorSano, fallaPor: errorRoto?.split('\n')[0] });
}
const muertos = resultados.filter(r => r.muerto).length;
console.log(JSON.stringify({ suite: 'filtersCore.b4AdversarialMutants', total: mutaciones.length, muertos,
    supervivientes: mutaciones.length - muertos, resultados,
    limits: 'Mutación en memoria del JSX y del núcleo B3; ningún fichero de producción se altera.' }, null, 2));
assert.ok(resultados.every(r => r.muerto), 'un mutante sobrevivió al oráculo sano');
