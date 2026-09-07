/**
 * B1: baseline sintético del motor REAL, sin navegador, DB ni cambios en src.
 * Ejecutar desde la raíz: node frontend-react/pruebas/filtersCore.baseline.mjs
 * Cada caso usa un proceso nuevo con --expose-gc: 1 frío + 7 calientes.
 * La preparación del fixture se mide aparte. El frío INCLUYE normalización
 * interna/_buildFacetIndex; no se instrumenta ni se extrae código productivo.
 * Sólo stdout JSON. No umbrales, percentiles ni afirmaciones sobre GPU/FPS.
 */
import { spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { cpus, totalmem } from 'node:os';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { setImmediate as nextTurn } from 'node:timers/promises';

const scriptPath = fileURLToPath(import.meta.url);
const repositoryPath = fileURLToPath(new URL('../../', import.meta.url));
const engineUrl = new URL('../src/aps/utils/model.js', import.meta.url);
const warmRepetitions = 7;
const cases = [
    { id: '1x20000', models: 1, perModel: 20000, highCardinality: false },
    { id: '5x20000', models: 5, perModel: 20000, highCardinality: false },
    { id: '1x100000', models: 1, perModel: 100000, highCardinality: false },
    { id: '1x100000-high-cardinality', models: 1, perModel: 100000, highCardinality: true },
];

async function retainedHeap() {
    // Un nuevo turno vacía referencias temporales del stack antes de medir.
    await nextTurn();
    global.gc();
    return process.memoryUsage().heapUsed;
}

function describeResult(result) {
    let bucketReferences = 0;
    let buckets = 0;
    const valuesByProperty = {};
    for (const [property, facet] of Object.entries(result.buckets)) {
        valuesByProperty[property] = facet.values.length;
        buckets += facet.values.length;
        for (const value of facet.values) bucketReferences += value.dbIds.length;
    }
    return {
        bucketReferences,
        matchReferences: result.globalValidDbIds.length,
        totalMaterializedReferences: bucketReferences + result.globalValidDbIds.length,
        buckets,
        valuesByProperty,
    };
}

async function runCase(definition) {
    if (typeof global.gc !== 'function') throw new Error('El worker necesita --expose-gc');
    const { calculateBucketsFromPostgres } = await import(engineUrl.href);
    const properties = Array.from({ length: 10 }, (_, index) => `G::P${index}`);
    const selections = { 'G::P0': ['v0'] };
    const data = [];
    const rosetta = {};
    const heapBeforeFixture = await retainedHeap();

    const datasetStarted = performance.now();
    for (let model = 0; model < definition.models; model++) {
        const urn = `model-${model}`;
        for (let index = 0; index < definition.perModel; index++) {
            const row = { dbId: `ext-${index}`, source_urn: urn };
            for (let property = 0; property < properties.length; property++) {
                row[`P${property}`] = definition.highCardinality && property === 9
                    ? `unique-${model}-${index}`
                    : `v${(index + property) % 20}`;
            }
            data.push(row);
        }
    }
    const datasetMs = performance.now() - datasetStarted;

    const rosettaStarted = performance.now();
    for (let model = 0; model < definition.models; model++) {
        const urn = `model-${model}`;
        rosetta[urn] = {};
        for (let index = 0; index < definition.perModel; index++) {
            rosetta[urn][`ext-${index}`] = index + 1;
        }
    }
    const rosettaMs = performance.now() - rosettaStarted;
    const heapFixtureOnly = await retainedHeap();
    let invocationCount = 0;

    function invoke() {
        invocationCount++;
        const started = performance.now();
        const result = calculateBucketsFromPostgres(data, properties, selections, rosetta);
        const calculationMs = performance.now() - started;
        return { result, calculationMs };
    }

    let measured = invoke();
    const coldMs = measured.calculationMs;
    const coldResult = describeResult(measured.result);
    const heapColdResultAndCache = await retainedHeap();
    measured = null;
    const heapColdCacheOnly = await retainedHeap();
    const warm = [];
    for (let repetition = 1; repetition <= warmRepetitions; repetition++) {
        measured = invoke();
        warm.push({ repetition, calculationMs: measured.calculationMs, ...describeResult(measured.result) });
        measured = null;
    }
    const heapWarmCacheOnly = await retainedHeap();
    const sortedWarm = warm.map(sample => sample.calculationMs).sort((a, b) => a - b);

    return {
        ...definition,
        N: data.length,
        P: properties.length,
        rosettaKeys: definition.models * definition.perModel,
        inputCardinality: Object.fromEntries(properties.map((property, index) => [
            property, definition.highCardinality && index === 9 ? data.length : 20,
        ])),
        selections,
        hiddenSources: [],
        preparation: { datasetMs, rosettaMs, totalMs: datasetMs + rosettaMs },
        cold: { calculationMs: coldMs, repetitions: 1, ...coldResult },
        warm,
        warmSummary: {
            repetitions: warmRepetitions,
            minimumMs: sortedWarm[0],
            medianMs: sortedWarm[Math.floor(sortedWarm.length / 2)],
            maximumMs: sortedWarm.at(-1),
        },
        invocationCount,
        retainedHeapBytesAfterForcedGc: {
            heapBeforeFixture,
            heapFixtureOnly,
            heapColdResultAndCache,
            heapColdCacheOnly,
            heapWarmCacheOnly,
            fixtureDelta: heapFixtureOnly - heapBeforeFixture,
            coldCacheAndResultDelta: heapColdResultAndCache - heapFixtureOnly,
            coldCacheDeltaAfterRelease: heapColdCacheOnly - heapFixtureOnly,
            coldResultReleaseDelta: heapColdResultAndCache - heapColdCacheOnly,
            warmCacheDeltaAfterRelease: heapWarmCacheOnly - heapFixtureOnly,
        },
    };
}

const caseArgument = process.argv.find(argument => argument.startsWith('--case='));
if (caseArgument) {
    const caseId = caseArgument.slice('--case='.length);
    const definition = cases.find(candidate => candidate.id === caseId);
    if (!definition) throw new Error(`Caso desconocido: ${caseId}`);
    console.log(JSON.stringify(await runCase(definition)));
} else {
    const git = (...args) => execFileSync('git', args, { cwd: repositoryPath, encoding: 'utf8' }).trim();
    const startedAt = new Date().toISOString();
    const results = [];
    for (const definition of cases) {
        const worker = spawnSync(process.execPath, ['--expose-gc', scriptPath, `--case=${definition.id}`], {
            cwd: repositoryPath,
            encoding: 'utf8',
            maxBuffer: 8 * 1024 * 1024,
        });
        if (worker.error || worker.status !== 0) {
            console.log(JSON.stringify({ startedAt, completedCases: results, failedCase: definition.id,
                exitCode: worker.status, error: worker.error?.message, stderr: worker.stderr }));
            process.exitCode = 1;
            break;
        }
        results.push(JSON.parse(worker.stdout));
    }
    if (!process.exitCode) console.log(JSON.stringify({
        benchmark: 'FILTERS CORE B1 - Node synthetic baseline',
        startedAt,
        finishedAt: new Date().toISOString(),
        git: { head: git('rev-parse', 'HEAD'), branch: git('branch', '--show-current'),
            worktreeShort: git('status', '--short') },
        sourceSha256: createHash('sha256').update(readFileSync(engineUrl)).digest('hex'),
        harnessSha256: createHash('sha256').update(readFileSync(scriptPath)).digest('hex'),
        environment: { node: process.version, platform: process.platform, architecture: process.arch,
            cpuModel: cpus()[0]?.model, logicalCpus: cpus().length, ramBytes: totalmem() },
        protocol: {
            processIsolation: 'Un proceso nuevo por caso, --expose-gc, ejecución secuencial',
            cold: 'Una invocación incluye _rosettaFingerprint, normalización interna y facets; excluye import y preparación del fixture',
            warm: 'Siete invocaciones con las mismas referencias; sin GC forzado entre ellas; no p95',
            preparation: 'Creación de filas y Rosetta medidas separadamente, fuera del cálculo',
            references: 'Suma de dbIds de todos los buckets; matches se cuentan aparte y se suman en totalMaterializedReferences',
            heap: 'heapUsed tras cambio de turno y GC; deltas contra fixture preparado. CacheOnly suelta el resultado y termina su stack, no el dataset retenido por el motor. Incluye ruido del runtime y metadatos mínimos del banco, no un heap snapshot atribuible exactamente a una clase',
            highCardinality: 'Igual a 1x100000 salvo P9: 100000 valores únicos. Misma selección P0=v0 (5000 matches)',
            limits: 'Sintético Node; no red, DB, geometría, navegador, pintura, pico de memoria, FPS, debounce ni número de cálculos por gesto de UI. Máquina compartida; sin umbrales',
        },
        results,
    }, null, 2));
}
