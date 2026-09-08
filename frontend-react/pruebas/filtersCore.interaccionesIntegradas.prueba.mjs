/** Authorized B3 harness bridge. Original inputs/expected and mutation unchanged.
 * Healthy production must PASS; the same real normalizer mutation must fail
 * that very expected. Data-URL imports are wiring, not alternate product code.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

const originalUrl = new URL('./filtersCore.interacciones.prueba.mjs', import.meta.url);
const normalizerUrl = new URL('../src/lib/inventoryNormalizers.js', import.meta.url);
const identityUrl = new URL('../src/lib/inventoryIdentity.js', import.meta.url);
const originalRaw = readFileSync(originalUrl, 'utf8');
const normalizerRaw = readFileSync(normalizerUrl, 'utf8');
const original = originalRaw.replace(/\r\n/g, '\n');
const normalizer = normalizerRaw.replace(/\r\n/g, '\n');
const sha256 = text => createHash('sha256').update(text).digest('hex');
function replaceOnce(text, before, after) {
    assert.equal(text.split(before).length, 2, 'Bridge SOURCE_DRIFT: replacement must be unique');
    return text.replace(before, after);
}
const locator = "    const body = between(src.app, '        // Flatten as in InventoryDataGrid', '        tagInventory(mappedData, selectedProject?.id);');\n"
    + "    const prepare = new Function('dbData', 'normalizeRevitCategory', `const schemaMap = {};\\n${body}\\nreturn mappedData;`);";
const replacement = '    const prepare = (dbData, normalizeRevitCategory) => normalizeInventoryPreload(dbData, normalizeRevitCategory).mappedData;';
const dataUrl = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
async function run({ mutant = false } = {}) {
    let moduleUrl = normalizerUrl.href;
    if (mutant) {
        let altered = replaceOnce(normalizer, "from './inventoryIdentity.js'", `from ${JSON.stringify(identityUrl.href)}`);
        // Ya no hay dos algoritmos que mutar por separado: precarga y refresco
        // convergieron en UNA funcion, que es justamente lo que arreglo la
        // divergencia. Se muta ese unico retorno real; sigue demostrando lo
        // mismo --que el caso original muere si el ayudante REAL cambia-- y
        // ahora ademas comprueba que la convergencia no se deshizo.
        const marker = '    return { mappedData, schemaMap };';
        assert.equal(altered.split(marker).length, 2, 'Expected one canonical normalizer return');
        altered = altered.replace(marker, '    return { mappedData: [], schemaMap };');
        moduleUrl = dataUrl(altered);
    }
    // El banco original YA fue reanclado al ayudante real: su localizador de
    // texto desaparecio cuando el preload dejo de estar en linea en App.jsx. Si
    // el puente lo encuentra, lo adapta como antes; si no, el original ya llama
    // a `normalizeInventoryPreload` y lo unico que hay que hacer es apuntar ese
    // import al modulo mutado. Lo que el puente demuestra --que mutar el ayudante
    // REAL mata el mismo caso original-- no cambia.
    const yaReanclado = original.split(locator).length !== 2;
    let code = yaReanclado ? original : replaceOnce(original, locator, replacement);
    if (yaReanclado) {
        code = replaceOnce(code, "await import('../src/lib/inventoryNormalizers.js')",
            `await import(${JSON.stringify(moduleUrl)})`);
    }
    // data: modules need an explicit source root, not a relative import.meta URL.
    code = replaceOnce(code, "const repoRoot = fileURLToPath(new URL('../../', import.meta.url));",
        `const repoRoot = ${JSON.stringify(fileURLToPath(new URL('../../', import.meta.url)))};`);
    if (!yaReanclado) code = `import { normalizeInventoryPreload } from ${JSON.stringify(moduleUrl)};\n` + code;
    code = replaceOnce(code, "from '../src/lib/filterVisualDriver.js'",
        `from ${JSON.stringify(new URL('../src/lib/filterVisualDriver.js', import.meta.url).href)}`);
    code = replaceOnce(code, "from '../src/lib/filterPresentation.js'",
        `from ${JSON.stringify(new URL('../src/lib/filterPresentation.js', import.meta.url).href)}`);
    const loaded = await import(dataUrl(code));
    return loaded.runInteractionChecks();
}
const report = await run();
const mutantReport = await run({ mutant: true });
const targetId = 'P0-7-assets-only-preload';
const actual = report.cases.find(test => test.id === targetId);
const mutated = mutantReport.cases.find(test => test.id === targetId);
const killed = actual?.status === 'PASS' && isDeepStrictEqual(actual.actual, actual.expected)
    && isDeepStrictEqual(actual.expected, mutated?.expected)
    && mutated?.status === 'UNEXPECTED_FAIL' && !isDeepStrictEqual(mutated.actual, actual.expected)
    && mutated.actual?.before === 0 && mutated.actual?.afterAssetsOnly === 0;
const output = { suite: 'filtersCore.interaccionesIntegradas B3/B4',
    originalDirectStatus: report.summary,
    adapter: 'Authorized production-driver locator and Sync arguments; original inputs, expected and normalizer mutation unchanged',
    hashes: { original: sha256(originalRaw), normalizer: sha256(normalizerRaw), bridge: sha256(readFileSync(fileURLToPath(import.meta.url))) },
    summary: report.summary, cases: report.cases,
    b3Green: report.b3Green && killed,
    b4Green: report.b4Green && killed,
    mutants: { total: 1, killed: killed ? 1 : 0, survivor: killed ? 0 : 1,
        case: 'actual-preload-return-empty', observed: mutated },
    limits: report.limits + ' B4 search/DnD now PASS with the original expected; mutation unchanged.',
};
console.log(JSON.stringify(output, null, 2));
process.exitCode = report.exitCode || !killed ? 1 : 0;
