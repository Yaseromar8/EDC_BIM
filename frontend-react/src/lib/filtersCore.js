import { calculateBucketsFromPostgres, _safeUrn } from '../aps/utils/model.js';
import { inventoryRowKey } from './inventoryIdentity.js';

export const activePredicates = selections => Object.values(selections || {}).some(v => Array.isArray(v) && v.length > 0);
export const viewerElementKey = (urn, id) => JSON.stringify([_safeUrn(urn), String(id)]);
const freezeResult = result => {
    for (const match of result.matches || []) Object.freeze(match);
    for (const group of result.matchesByModel || []) { Object.freeze(group.matches); Object.freeze(group); }
    if (result.matches) Object.freeze(result.matches);
    if (result.matchesByModel) Object.freeze(result.matchesByModel);
    return Object.freeze(result);
};

// One calculation, same snapshot, qualified members for both consumers.
// Existing faceting engine remains the sole predicate evaluator.
export function calculateFilterResult(state, snapshot, revision) {
    const result = { revision, scopeId: state.scopeId, status: 'pending',
        hasActivePredicates: activePredicates(state.filterSelections),
        matches: null, matchesByModel: null, facets: {}, coverage: {},
        diagnostics: [], datasetRevision: snapshot?.datasetRevision };
    const finish = (status, code) => freezeResult({ ...result, status,
        diagnostics: code ? [{ code }] : result.diagnostics });
    if (!state.scopeId) return finish('pending', 'SCOPE_PENDING');
    if (!snapshot || snapshot.scopeId !== state.scopeId || !Array.isArray(snapshot.rows))
        return finish('pending', 'INVENTORY_PENDING');
    if (!Array.isArray(state.schema)) return finish('pending', 'SCHEMA_PENDING');
    const hidden = new Set((state.hiddenModelUrns || []).map(_safeUrn));
    const required = snapshot.models || [];
    const visible = required.filter(m => !hidden.has(_safeUrn(m.modelUrn)));
    result.coverage = { rows: snapshot.rows.length, requiredModels: visible.length,
        readyModels: visible.filter(m => m.ready).length };
    if (visible.some(m => !m.ready)) return finish('pending', 'MODEL_COVERAGE_PENDING');
    const known = new Set(state.schema.map(p => typeof p === 'string' ? p : p.id));
    for (const row of snapshot.rows) for (const k of Object.keys(row)) if (k.includes('::')) known.add(k);
    for (const [prop, values] of Object.entries(state.filterSelections || {})) {
        if (values?.length && prop !== 'Standard::Sources' && !known.has(prop))
            return finish('invalid', 'PROPERTY_UNAVAILABLE');
    }
    const rosetta = Object.fromEntries(required.map(m => [m.modelUrn, snapshot.rosetta?.[m.modelUrn] ||
        snapshot.rosetta?.[_safeUrn(m.modelUrn)] || {}]));
    const computed = calculateBucketsFromPostgres(snapshot.rows, state.filterProperties || [],
        state.filterSelections || {}, rosetta, state.hiddenModelUrns || [],
        snapshot.datasetRevision, state.schema);
    result.facets = computed.buckets;
    Object.assign(result.coverage, computed.coverage);
    if (computed.coverage.unresolvedRows) {
        result.facets = {};
        return finish('pending', 'UNRESOLVED_ELEMENTS');
    }
    result.matches = computed.matches;
    result.matchesByModel = visible.map(m => ({ modelUrn: _safeUrn(m.modelUrn),
        matches: computed.matches.filter(x => _safeUrn(x.modelUrn) === _safeUrn(m.modelUrn)) }));
    result.coverage.matches = result.matches.length;
    return finish('ready');
}

export function filterInventoryRows(rows, result, scopeId) {
    if (!result || result.status !== 'ready' || result.scopeId !== scopeId) return [];
    const identities = new Set(result.matches.map(m => m.rowKey));
    return rows.filter(row => identities.has(inventoryRowKey(row)));
}

export function refineInventorySelection(rows, selected, universe = rows) {
    if (!selected) return rows;
    const counts = new Map();
    for (const row of universe) counts.set(String(row.dbId), (counts.get(String(row.dbId)) || 0) + 1);
    return rows.filter(row => selected.has(inventoryRowKey(row))
        || selected.has(viewerElementKey(row.source_urn || row.model_urn, row.dbId))
        || (counts.get(String(row.dbId)) === 1 && selected.has(row.dbId)));
}

// Monotonic revisions survive a viewer remount. No timestamp/cardinality keys.
let nextRevision = 0;
export function createFilterController({ snapshot, publish, apply, progress = () => {},
    compute = calculateFilterResult, schedule = callback => queueMicrotask(callback) }) {
    let state = {}, revision = 0, current = null, disposed = false, queued = false;
    let signature = null, lastSnapshot = null, cancelled = false;
    const metrics = { requested: 0, computed: 0, published: 0, applied: 0, superseded: 0 };
    const isCurrent = r => !disposed && r === revision;
    const run = async () => {
        queued = false;
        if (disposed || cancelled) return;
        const r = revision, intent = state, data = lastSnapshot;
        const started = performance.now();
        try {
            metrics.computed++;
            const result = await compute(intent, data, r);
            if (!isCurrent(r)) { metrics.superseded++; return; }
            current = result;
            metrics.published++;
            publish(result);
            if (!isCurrent(r)) return;
            progress({ revision:r, phase:'calculated', status:result.status, computeMs:performance.now()-started });
            if (result.status !== 'ready' || !isCurrent(r)) return;
            const applied = await apply(result, intent, () => isCurrent(r));
            if (!isCurrent(r)) { metrics.superseded++; return; }
            if (applied?.paused) progress({ revision:r, phase:'paused', ...applied });
            else { metrics.applied++; progress({ revision:r, phase:'visually-applied', ...applied }); }
        } catch (error) {
            if (!isCurrent(r)) return;
            current = freezeResult({ revision:r, scopeId:intent.scopeId, status:'error',
                hasActivePredicates:activePredicates(intent.filterSelections), matches:null,
                matchesByModel:null, facets:{}, coverage:{}, diagnostics:[{code:'FILTER_ERROR', message:String(error.message || error)}] });
            publish(current);
            if (!isCurrent(r)) return;
            progress({revision:r, phase:'error', message:String(error.message || error)});
        }
    };
    return {
        request(patch = {}, { force = false } = {}) {
            if (disposed) return revision;
            state = structuredClone({ ...state, ...patch });
            lastSnapshot = snapshot(state);
            const nextSignature = JSON.stringify([state, lastSnapshot?.datasetRevision,
                lastSnapshot?.scopeId, lastSnapshot?.models, lastSnapshot?.rosetta]);
            if (!force && signature === nextSignature && current?.status === 'ready') return revision;
            signature = nextSignature;
            revision = ++nextRevision;
            cancelled = false;
            const requestedRevision = revision;
            metrics.requested++;
            current = freezeResult({revision,scopeId:state.scopeId,status:'pending',
                hasActivePredicates:activePredicates(state.filterSelections),matches:null,
                matchesByModel:null,facets:{},coverage:{},diagnostics:[]});
            publish(current);
            if (!isCurrent(requestedRevision)) return requestedRevision;
            progress({revision,phase:'requested'});
            if (!queued) { queued = true; schedule(run); }
            return revision;
        },
        getResult: () => current,
        getState: () => state,
        isCurrent,
        metrics,
        cancel(patch = {}) { state = structuredClone({ ...state, ...patch }); revision = ++nextRevision; signature = null; cancelled = true; },
        dispose() { disposed = true; revision = ++nextRevision; current = null; },
    };
}
