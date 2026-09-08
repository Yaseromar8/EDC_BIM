// B4: presentation only. Never evaluates element predicates or writes FilterResult.
const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
export const searchText = value => String(value ?? '').trim().toLocaleLowerCase('es');
export function propertyInfo(id, available = new Map()) {
    const known = available.get(id);
    const split = id.indexOf('::');
    return known || { id, category: split < 0 ? 'System' : id.slice(0, split),
        name: split < 0 ? id : id.slice(split + 2), unavailable: true };
}
export function propertyMatches(prop, query) {
    const q = searchText(query);
    return !q || searchText(prop.id).includes(q) || searchText(prop.name).includes(q)
        || searchText(prop.category).includes(q);
}
export function selectedPropertyItems(ids, available, query = '') {
    const byId = new Map(available.map(p => [p.id, p]));
    return ids.map((id, originalIndex) => ({ ...propertyInfo(id, byId), originalIndex }))
        .filter(p => propertyMatches(p, query));
}
export function availablePropertyGroups(properties, query = '') {
    const groups = Object.create(null);
    for (const p of properties) if (propertyMatches(p, query)) {
        const category = p.category || 'Other';
        (groups[category] ||= []).push(p);
    }
    for (const list of Object.values(groups)) list.sort((a, b) => collator.compare(a.name, b.name) || a.id.localeCompare(b.id));
    return groups;
}
export function reorderProperty(ids, sourceId, targetId) {
    const from = ids.indexOf(sourceId), to = ids.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return ids;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, sourceId);
    return next;
}
export function retainPropertyConfig(config, ids) {
    const keep = new Set(ids);
    return Object.fromEntries(Object.entries(config).filter(([id]) => keep.has(id)));
}
const special = new Set(['(Unassigned)', '(No aplica)', '']);
export function facetItems(bucket, selectedValues) {
    const selected = new Set(selectedValues);
    const present = new Set((bucket?.values || []).map(item => item.value));
    return [...(bucket?.values || []), ...selectedValues.filter(v => !present.has(v))
        .map(value => ({ value, count: 0, totalCount: 0, unavailable: true }))]
        .map(item => ({ ...item, selected: selected.has(item.value),
            disabled: item.count === 0 && !selected.has(item.value) }))
        .sort((a, b) => Number(special.has(a.value)) - Number(special.has(b.value))
            || collator.compare(String(a.value), String(b.value)) || String(a.value).localeCompare(String(b.value)));
}
export function searchFacetItems(items, query) {
    const q = searchText(query);
    return q ? items.filter(item => searchText(item.value).includes(q)) : items;
}
// Mirrors the CLOSED B3 driver's stable palette by qualified identity, NOT row order.
// Fitness compares this projection with actual driver output; driver remains unchanged.
export function filterValueColor(propId, value, custom = {}) {
    const key = propId + '::' + value;
    if (custom[key]) return custom[key];
    const palette = ['#7e9bbd','#F97316','#10B981','#F43F5E','#A855F7','#5f7fa3','#EAB308',
        '#EF4444','#8B5CF6','#EC4899','#6366F1','#14B8A6','#84CC16','#F59E0B'];
    let hash = 0;
    for (const c of key) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
    return palette[hash % palette.length];
}
export function filterFeedback(result, progress, scopeId) {
    if (!result || result.scopeId !== scopeId || result.status === 'pending')
        return { state: 'pending', text: 'Actualizando filtros…', ready: false };
    if (result.status !== 'ready') return { state: 'error', ready: false,
        text: 'Filtros no aplicados: ' + (result.diagnostics?.[0]?.message || result.diagnostics?.[0]?.code || result.status) };
    const state = !result.hasActivePredicates ? 'no-filters' : result.matches.length ? 'active' : 'zero';
    const text = state === 'no-filters' ? 'Sin filtros activos · sin restricción'
        : state === 'zero' ? '0 coincidencias · filtros activos' : result.matches.length + ' coincidencias · filtros activos';
    const visual = progress?.revision !== result.revision ? 'Aplicación visual pendiente'
        : progress.phase === 'paused' ? 'Control visual: ' + (progress.owner || 'otra herramienta')
        : progress.phase === 'visually-applied' ? 'Aplicado en el visor' : 'Aplicación visual pendiente';
    return { state, text, visual, ready: true, revision: result.revision };
}
