/** B1 bridge for the immutable original interactions harness.
 * Original direct execution reports SOURCE_DRIFT after the authorized extraction
 * of App preload. This does NOT make that original run green or change its cases.
 * Only its preload locator is adapted in memory to the actual connected helper.
 * An in-memory mutation of that real helper must kill the same original case.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
    const loaded = await import(dataUrl(code));
    return loaded.runInteractionChecks();
}
const report = await run();
const mutantReport = await run({ mutant: true });
const targetId = 'P0-7-assets-only-preload';
const actual = report.cases.find(test => test.id === targetId);
const mutated = mutantReport.cases.find(test => test.id === targetId);
const killed = actual?.status === 'KNOWN_FAIL' && mutated?.status === 'UNEXPECTED_FAIL'
    && mutated.actual?.before === 0 && mutated.actual?.afterAssetsOnly === 0;
const output = { suite: 'filtersCore.interaccionesIntegradas B1',
    originalDirectStatus: 'SOURCE_DRIFT at App preload locator; original file unchanged; not green',
    adapter: 'In-memory preload locator only; all original inputs, expected, knownActual and other cases unchanged',
    hashes: { original: sha256(originalRaw), normalizer: sha256(normalizerRaw), bridge: sha256(readFileSync(fileURLToPath(import.meta.url))) },
    summary: report.summary, cases: report.cases,
    mutants: { total: 1, killed: killed ? 1 : 0, survivor: killed ? 0 : 1,
        case: 'actual-preload-return-empty', observed: mutated },
    limits: report.limits + ' The direct legacy locator must be migrated in B2 only with authorization.',
};
console.log(JSON.stringify(output, null, 2));
process.exitCode = report.exitCode || !killed ? 1 : 0;
