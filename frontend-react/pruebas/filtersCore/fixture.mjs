/**
 * B1 ONLY: synthetic data and a deliberately slow, independent set oracle.
 * Not a product implementation, normalizer, importer, worker, or viewer mock.
 * BIM/Civil/IFC labels describe test data only; no format import is simulated.
 */
export const PROPERTIES = ['G1::Estado', 'G2::Estado', 'Obra::Zona'];
export const elementKey = ({ modelUrn, externalId }) => JSON.stringify([modelUrn, externalId]);
export const ref = (modelUrn, externalId, dbId) => ({ modelUrn, externalId, dbId });

export function fixture() {
    return {
        scopeId: 'synthetic-front', revision: 1,
        schema: [...PROPERTIES], filterProperties: [...PROPERTIES], selections: {},
        models: [
            { modelUrn: 'bim-A', format: 'BIM', loaded: true, ready: true, visible: true,
                declaredProperties: [...PROPERTIES], mapping: { shared: 1, b: 2, c: 3 } },
            { modelUrn: 'civil-B', format: 'Civil', loaded: true, ready: true, visible: true,
                declaredProperties: [...PROPERTIES], mapping: { shared: 1, d: 2 } },
            { modelUrn: 'ifc-C', format: 'IFC', loaded: true, ready: true, visible: true,
                declaredProperties: [...PROPERTIES], mapping: { 'ifc-guid-example': 1 } },
        ],
        rows: [
            { modelUrn: 'bim-A', externalId: 'shared', properties: { 'G1::Estado': 'Ejecutado', 'G2::Estado': 'Aprobado', 'Obra::Zona': 'Norte' } },
            { modelUrn: 'bim-A', externalId: 'b', properties: { 'G1::Estado': 'Ejecutado', 'G2::Estado': 'Pendiente', 'Obra::Zona': 'Sur' } },
            { modelUrn: 'bim-A', externalId: 'c', properties: { 'G1::Estado': 'Pendiente', 'G2::Estado': 'Aprobado', 'Obra::Zona': 'Norte' } },
            { modelUrn: 'civil-B', externalId: 'shared', properties: { 'G1::Estado': 'Pendiente', 'G2::Estado': 'Pendiente', 'Obra::Zona': 'Sur' } },
            { modelUrn: 'civil-B', externalId: 'd', properties: { 'G1::Estado': 'En curso', 'G2::Estado': 'Aprobado', 'Obra::Zona': 'Sur' } },
            { modelUrn: 'ifc-C', externalId: 'ifc-guid-example', properties: { 'G1::Estado': 'Ejecutado', 'G2::Estado': 'Pendiente', 'Obra::Zona': 'Este' } },
        ],
    };
}

export const ALL = [ref('bim-A', 'shared', 1), ref('bim-A', 'b', 2), ref('bim-A', 'c', 3),
    ref('civil-B', 'shared', 1), ref('civil-B', 'd', 2), ref('ifc-C', 'ifc-guid-example', 1)];

/** Keep raw types and absence reasons; selectable tokens remain legacy strings. */
export function inspectCell(row, model, propertyId) {
    if (!Array.isArray(model.declaredProperties)) return { kind: 'unknown', token: null };
    if (!model.declaredProperties.includes(propertyId)) return { kind: 'not-applicable', token: '(No aplica)' };
    if (!Object.hasOwn(row.properties, propertyId)) return { kind: 'missing', token: '(Unassigned)' };
    const raw = row.properties[propertyId];
    if (raw === null) return { kind: 'null', token: '(Unassigned)', raw };
    const token = Array.isArray(raw)
        ? raw.map(value => String(value ?? '').trim()).filter(Boolean).join(', ')
        : String(raw).trim();
    return { kind: token ? 'value' : 'empty', token: token || '(Unassigned)', raw };
}

/**
 * Obvious enumeration and set intersection, independent of aps/utils/model.js.
 * Every oracle assertion below also has hand-written expected identities/counts.
 * No cache, facade, persisted state, field-name flattening or source fallback.
 */
export function oracle(input) {
    const active = Object.entries(input.selections).filter(([, values]) => values.length > 0);
    const coverage = { inputRows: input.rows?.length ?? null, eligibleUniqueElements: 0,
        duplicateRows: 0, hiddenRows: 0, outOfScopeRows: 0, unloadedRows: 0, notReadyRows: 0, unresolvedRows: 0 };
    const diagnostics = [];
    const result = { revision: input.revision, scopeId: input.scopeId, status: 'ready',
        hasActivePredicates: active.length > 0, matches: null, matchesByModel: null,
        facets: null, coverage, diagnostics };
    if (input.error) { result.status = 'error'; diagnostics.push({ code: 'DATA_ERROR' }); return result; }
    if (!Number.isInteger(input.revision) || input.revision < 0 || typeof input.scopeId !== 'string' || !input.scopeId) {
        result.status = 'error'; diagnostics.push({ code: 'INVALID_REQUEST_IDENTITY' }); return result;
    }
    if (input.rows === null) { result.status = 'pending'; diagnostics.push({ code: 'INVENTORY_PENDING' }); return result; }
    if (input.schema === null) { result.status = 'pending'; diagnostics.push({ code: 'SCHEMA_PENDING' }); return result; }
    const unknownProperties = [...new Set([...input.filterProperties, ...active.map(([p]) => p)])]
        .filter(propertyId => !input.schema.includes(propertyId));
    if (unknownProperties.length) {
        result.status = 'invalid'; diagnostics.push({ code: 'PROPERTY_UNAVAILABLE', properties: unknownProperties }); return result;
    }
    const eligible = new Map();
    for (const row of input.rows) {
        const model = input.models.find(m => m.modelUrn === row.modelUrn);
        if (!model) { coverage.outOfScopeRows++; continue; }
        if (model && !model.visible) { coverage.hiddenRows++; continue; }
        if (!model?.loaded) { coverage.unloadedRows++; continue; }
        if (!model.ready) { coverage.notReadyRows++; continue; }
        if (!Object.hasOwn(model.mapping, row.externalId)) { coverage.unresolvedRows++; continue; }
        const key = elementKey(row);
        if (eligible.has(key)) {
            coverage.duplicateRows++;
            if (JSON.stringify(eligible.get(key).row.properties) !== JSON.stringify(row.properties)) {
                result.status = 'invalid'; diagnostics.push({ code: 'CONFLICTING_DUPLICATE' });
            }
            continue;
        }
        eligible.set(key, { row, model, element: ref(row.modelUrn, row.externalId, model.mapping[row.externalId]) });
    }
    coverage.eligibleUniqueElements = eligible.size;
    if (coverage.duplicateRows) diagnostics.push({ code: 'DUPLICATE_ROWS', count: coverage.duplicateRows });
    if (coverage.outOfScopeRows) diagnostics.push({ code: 'OUT_OF_SCOPE_ROWS', count: coverage.outOfScopeRows });
    if (result.status === 'invalid') return result;
    if (coverage.unloadedRows || coverage.notReadyRows || coverage.unresolvedRows
        || input.models.some(m => m.visible && (!m.loaded || !m.ready))) {
        result.status = 'pending'; diagnostics.push({ code: 'MODEL_COVERAGE_PENDING' }); return result;
    }
    const allKeys = new Set(eligible.keys());
    const intersection = sets => sets.reduce((acc, set) => new Set([...acc].filter(key => set.has(key))), allKeys);
    const forValue = (propertyId, value) => new Set([...eligible].filter(([, { row, model }]) =>
        inspectCell(row, model, propertyId).token === String(value).trim()).map(([key]) => key));
    const predicateSets = active.map(([propertyId, values]) => ({ propertyId,
        keys: new Set(values.flatMap(value => [...forValue(propertyId, value)])) }));
    const elements = keys => [...keys].sort().map(key => eligible.get(key).element);
    result.matches = elements(intersection(predicateSets.map(p => p.keys)));
    result.matchesByModel = input.models.filter(m => m.visible).map(m => ({ modelUrn: m.modelUrn,
        matches: result.matches.filter(element => element.modelUrn === m.modelUrn) }));
    result.matchesByModel.sort((a, b) => a.modelUrn < b.modelUrn ? -1 : a.modelUrn > b.modelUrn ? 1 : 0);
    result.facets = input.filterProperties.map(propertyId => {
        const domain = new Set([...(input.selections[propertyId] || []).map(value => String(value).trim()),
            ...[...eligible.values()].map(({ row, model }) => inspectCell(row, model, propertyId).token)]);
        domain.delete(null);
        const contextual = intersection(predicateSets.filter(p => p.propertyId !== propertyId).map(p => p.keys));
        return { propertyId, values: [...domain].sort().map(value => {
            const total = forValue(propertyId, value);
            const matches = elements(new Set([...total].filter(key => contextual.has(key))));
            return { value, count: matches.length, totalCount: total.size, matches };
        }) };
    });
    return result;
}
