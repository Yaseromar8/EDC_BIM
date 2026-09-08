// Shared identity rule for Filters and the V2 preflight. The schema/dataset,
// never the visible panel alone, decides whether a legacy alias is ambiguous.
export const propertyName = id => String(id).split('::')[1] || String(id);

export function knownPropertyNames(rows = [], schema = []) {
    const owners = new Map();
    const add = id => {
        if (typeof id !== 'string' || !id.includes('::')) return;
        const name = propertyName(id);
        if (!owners.has(name)) owners.set(name, new Set());
        owners.get(name).add(id);
    };
    for (const item of schema || []) add(typeof item === 'string' ? item : item?.id);
    for (const row of rows || []) for (const key of Object.keys(row || {})) add(key);
    return owners;
}

export function legacyAliasAllowed(propId, owners) {
    const ids = owners.get(propertyName(propId));
    return !ids || (ids.size === 1 && ids.has(propId));
}

export function readFilterProperty(row, propId, owners) {
    if (Object.hasOwn(row, propId)) return row[propId];
    const name = propertyName(propId);
    return legacyAliasAllowed(propId, owners) && Object.hasOwn(row, name) ? row[name] : undefined;
}
