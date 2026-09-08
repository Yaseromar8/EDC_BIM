import { filterInventoryRows, refineInventorySelection, viewerElementKey } from './filtersCore.js';
import { inventoryRowKey } from './inventoryIdentity.js';

// Same-origin presentation of the SAME FilterResult. No predicate engine,
// isolated copy of matches, global externalId lookup, or interpolated row HTML.
export function openInventoryFilterPopout({host,scopeId,columns,assetsOnly,selection,onClose}) {
    const popup=host.open('', 'InventoryPopout', 'width=1100,height=600,menubar=no,toolbar=no,location=no,status=no');
    if(!popup) { host.alert('Permite ventanas emergentes para abrir Inventory.'); return null; }
    host.__inventoryPopupCleanup?.();
    host.__inventoryPopup=popup;
    const doc=popup.document;
    doc.open();
    doc.write('<!doctype html><html><head><title>Inventory — BIM Visor</title><style>body{margin:0;background:#16161a;color:#eee;font:13px system-ui}header{display:flex;justify-content:space-between;padding:10px}p{padding:0 10px}table{border-collapse:collapse;width:100%}th,td{padding:4px 10px;border:1px solid #333;text-align:left}th{position:sticky;top:0;background:#24242a}tr:hover{background:#303b50}button{cursor:pointer}</style></head><body></body></html>');
    doc.close();
    const header=doc.createElement('header'),title=doc.createElement('strong'),dock=doc.createElement('button');
    title.textContent='Inventory';dock.textContent='Volver al visor';header.append(title,dock);
    const status=doc.createElement('p');status.setAttribute('role','status');
    const table=doc.createElement('table'),thead=doc.createElement('thead'),head=doc.createElement('tr'),tbody=doc.createElement('tbody');
    for(const column of columns) { const th=doc.createElement('th');th.textContent=column.header;head.append(th); }
    thead.append(head);table.append(thead,tbody);doc.body.append(header,status,table);
    let currentSelection=selection,disposed=false,lastRevision=-1,highlightedKey=null;
    const paintHighlight=()=>{
        for(const row of tbody.children) row.style.background=row.dataset.rowKey===highlightedKey?'#2a4a8a':'';
    };
    const render=()=>{
        if(disposed || popup.closed) return;
        const result=host.__filterResult;
        if(result && result.revision<lastRevision) return;
        if(result) lastRevision=result.revision;
        tbody.replaceChildren();
        if(!result || result.scopeId!==scopeId || result.status!=='ready') {
            status.textContent=result?.scopeId && result.scopeId!==scopeId ? 'El frente cambió. Vuelve al visor para abrir su inventario.'
                : result?.status==='error'||result?.status==='invalid' ? 'Filtros: '+(result.diagnostics?.[0]?.message||result.diagnostics?.[0]?.code||result.status)
                    : 'Filtros: esperando datos o cálculo; no se muestran coincidencias antiguas.';
            return;
        }
        const universe=host.postgresInventory||[];
        let rows=refineInventorySelection(filterInventoryRows(universe,result,scopeId),currentSelection,universe);
        if(assetsOnly) rows=rows.filter(row=>(row._nodeType??row['__node__::__node_type__']??row.__node_type__??'instance')==='instance');
        status.textContent=result.matches.length+' coincidencias globales · '+rows.length+' filas locales · revisión '+result.revision;
        const targets=new Map(result.matches.map(m=>[m.rowKey,m]));
        const fragment=doc.createDocumentFragment();
        for(const row of rows) {
            const tr=doc.createElement('tr');tr.dataset.rowKey=inventoryRowKey(row);
            for(const column of columns) {const td=doc.createElement('td');td.textContent=String(row[column.key]??'');tr.append(td);}
            tr.addEventListener('click',()=>{
                if(host.__filterResult!==result) return;
                highlightedKey=inventoryRowKey(row);paintHighlight();
                const target=targets.get(inventoryRowKey(row));
                if(target) host.dispatchEvent(new CustomEvent('viewer-select',{detail:{urn:target.modelUrn,dbIds:[target.dbId]}}));
            });
            fragment.append(tr);
        }
        tbody.append(fragment);
        paintHighlight();
    };
    const highlight=e=>{
        const result=host.__filterResult;
        if(result?.scopeId!==scopeId || result.status!=='ready') return;
        const key=viewerElementKey(e.detail?.urn,e.detail?.dbId);
        const matches=result.matches.filter(m=>viewerElementKey(m.modelUrn,m.dbId)===key);
        highlightedKey=matches.length===1?matches[0].rowKey:null;paintHighlight();
        for(const row of tbody.children) if(row.dataset.rowKey===highlightedKey) row.scrollIntoView({block:'nearest'});
    };
    const isolation=e=>{const ids=e.detail?.elementKeys||e.detail?.isolatedExtIds;currentSelection=ids?.length?new Set(ids):null;render();};
    const cleanup=()=>{
        disposed=true;host.removeEventListener('filter-result',render);host.removeEventListener('inventory-isolation-sync',isolation);
        host.removeEventListener('inventory-highlight-row',highlight);
        popup.removeEventListener('beforeunload',cleanup);
        if(host.__inventoryPopup===popup) host.__inventoryPopup=null;
        if(host.__inventoryPopupCleanup===cleanup) host.__inventoryPopupCleanup=null;
    };
    host.__inventoryPopupCleanup=cleanup;
    host.addEventListener('filter-result',render);host.addEventListener('inventory-isolation-sync',isolation);
    host.addEventListener('inventory-highlight-row',highlight);
    popup.addEventListener('beforeunload',cleanup);
    dock.addEventListener('click',()=>{popup.opener?.postMessage({type:'inventory-dock'},host.location.origin);popup.close();});
    render();onClose?.();return popup;
}
