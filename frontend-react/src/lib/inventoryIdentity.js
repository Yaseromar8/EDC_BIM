// Inventory boundary only. dbId remains the legacy externalId display field;
// never substitute an LMV session id for the canonical server identity.
export const INVENTORY_IDENTITY_FORMAT = 1;
export const INVENTORY_INTERNAL_KEYS = new Set([
    'dbId', 'name', 'model_urn', 'source_urn', '_nodeType', 'scope_id',
    'source_lineage', 'external_id', 'element_key', '_isSaving', '_saveError',
]);

const text = value => typeof value === 'string' && value.trim().length > 0;

export function inventoryIdentity(row) {
    if (!row || !['scope_id', 'source_lineage', 'external_id'].every(key => text(row[key]))) return null;
    if (!/^urn:adsk\.[a-z0-9]+:dm\.lineage:[A-Za-z0-9_-]+$/.test(row.source_lineage)) return null;
    const identity = { scope_id: row.scope_id, source_lineage: row.source_lineage, external_id: row.external_id };
    const key = JSON.stringify(Object.values(identity));
    if (row.element_key !== undefined && row.element_key !== null && row.element_key !== key) return null;
    return identity;
}

export function inventoryRowKey(row) {
    const identity = inventoryIdentity(row);
    return identity ? JSON.stringify(Object.values(identity))
        : JSON.stringify(['legacy-readonly', row?.source_urn || row?.model_urn || '', row?.dbId || row?.external_id || '']);
}

export function withInventoryIdentity(node, row) {
    // Apply last: a BIM property named scope_id/external_id cannot replace metadata.
    const result = { ...row, dbId: node.external_id, external_id: node.external_id,
        scope_id: node.scope_id, source_lineage: node.source_lineage,
        source_urn: node.source_urn || node.model_urn, model_urn: node.model_urn,
        element_key: node.element_key };
    const identity = inventoryIdentity(result);
    if (identity) result.element_key = JSON.stringify(Object.values(identity));
    return result;
}

export function requireInventoryIdentity(row) {
    const identity = inventoryIdentity(row);
    if (!identity) throw new Error('La fila no tiene identidad verificable. Recargue el inventario; no se guardó ningún cambio.');
    return identity;
}

export function inventoryEditPayload(row, fieldName, fieldValue) {
    requireEditableField(fieldName);
    return { identity: requireInventoryIdentity(row), fieldName, fieldValue };
}

function requireEditableField(fieldName) {
    if (!text(fieldName) || INVENTORY_INTERNAL_KEYS.has(fieldName) || ['properties', 'project_id', 'native_metadata', 'EXT ID'].includes(fieldName)) {
        throw new Error('Ese campo es metadato reservado y no puede editarse.');
    }
}

export function inventoryRowForViewer(rows, externalId, sourceUrn) {
    const normalized = urn => String(urn || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const matches = rows.filter(row => row.dbId === externalId && normalized(row.source_urn || row.model_urn) === normalized(sourceUrn));
    return matches.length === 1 ? matches[0] : null;
}

export function resolveInventoryTargets(rows, selected, { legacyExternalIds = false } = {}) {
    const targets = [];
    for (const key of selected || []) {
        const matches = rows.filter(row => legacyExternalIds ? row.dbId === key : inventoryRowKey(row) === key);
        if (matches.length !== 1) {
            throw new Error('Selección ambigua o desactualizada. Marque las filas del inventario que desea editar; no se guardó ningún cambio.');
        }
        requireInventoryIdentity(matches[0]);
        targets.push(matches[0]);
    }
    if (!targets.length) throw new Error('No hay filas verificables seleccionadas.');
    return targets;
}

export function inventoryBulkPayload(rows, fieldName, fieldValue) {
    requireEditableField(fieldName);
    if (!rows.length || new Set(rows.map(inventoryRowKey)).size !== rows.length) throw new Error('La selección contiene identidades duplicadas o está vacía.');
    return { identities: rows.map(requireInventoryIdentity), fieldName, fieldValue };
}

export function updateInventoryRows(rows, targets, fieldName, fieldValue) {
    const keys = new Set(targets.map(row => JSON.stringify(Object.values(requireInventoryIdentity(row)))));
    return rows.map(row => keys.has(inventoryRowKey(row)) ? { ...row, [fieldName]: fieldValue } : row);
}

export async function requireInventoryResponse(response) {
    if (response.ok) return response;
    let detail = '';
    try { const body = await response.json(); detail = body.message || body.error || body.code || ''; } catch { /* HTTP status stays visible */ }
    throw new Error(`Inventario HTTP ${response.status}${detail ? ': ' + detail : ''}`);
}
