import { filterInventoryRows, refineInventorySelection, viewerElementKey } from './filtersCore.js';
import { inventoryRowKey } from './inventoryIdentity.js';

// Presentation bounds, not a limit on the authoritative FilterResult or Inventory.
const ROW_HEIGHT = 28;
const MAX_VIEWPORT_HEIGHT = 2400;
const OVERSCAN = 8;

// Same-origin presentation of the SAME FilterResult. No predicate engine,
// global externalId lookup, or interpolated row HTML.
export function openInventoryFilterPopout({host,scopeId,columns,assetsOnly,selection,onClose}) {
    const popup=host.open('', 'InventoryPopout', 'width=1100,height=600,menubar=no,toolbar=no,location=no,status=no');
    if(!popup) { host.alert('Permite ventanas emergentes para abrir Inventory.'); return null; }
    host.__inventoryPopupCleanup?.();
    host.__inventoryPopup=popup;
    const doc=popup.document;
    doc.open();
    doc.write('<!doctype html><html><head><title>Inventory — BIM Visor</title><style>html,body{height:100%;overflow:hidden}body{margin:0;background:#16161a;color:#eee;font:13px system-ui;display:flex;flex-direction:column}header{display:flex;justify-content:space-between;padding:10px;flex:none}p{padding:0 10px;flex:none}.inventory-scroll{overflow:auto;overflow-anchor:none;flex:1;min-height:0;max-height:2400px}table{border-spacing:0;table-layout:fixed;min-width:100%}th,td{box-sizing:border-box;height:28px;padding:0 10px;border-right:1px solid #333;border-bottom:1px solid #333;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:27px}th{position:sticky;top:0;background:#24242a;z-index:1}tr[data-row-key]:hover{background:#303b50}tr.spacer td{padding:0;border:0;line-height:0}button{cursor:pointer}</style></head><body></body></html>');
    doc.close();
    const header=doc.createElement('header'),title=doc.createElement('strong'),dock=doc.createElement('button');
    title.textContent='Inventory';dock.textContent='Volver al visor';header.append(title,dock);
    const status=doc.createElement('p');status.setAttribute('role','status');
    const viewport=doc.createElement('div');viewport.className='inventory-scroll';
    viewport.setAttribute('tabindex','0');viewport.setAttribute('aria-label','Filas de Inventory');
    const table=doc.createElement('table'),thead=doc.createElement('thead'),head=doc.createElement('tr'),tbody=doc.createElement('tbody');
    table.style.width=Math.max(1,columns.length)*180+'px';
    for(const column of columns) { const th=doc.createElement('th');th.textContent=column.header;head.append(th); }
    thead.append(head);table.append(thead,tbody);viewport.append(table);doc.body.append(header,status,viewport);
    let currentSelection=selection,disposed=false,lastRevision=-1,highlightedKey=null,frame=null,scopeRetired=false;
    // Derived presentation references, replaced atomically on result/isolation changes.
    // Scroll never recomputes matching or scans the complete Inventory.
    let rows=[],targets=new Map(),rowIndices=new Map(),renderedResult=null;
    const height=()=>Math.min(MAX_VIEWPORT_HEIGHT,Math.max(ROW_HEIGHT*2,viewport.clientHeight||480));
    const current=()=>!disposed && !scopeRetired && !popup.closed && renderedResult &&
        host.__filterResult===renderedResult && renderedResult.scopeId===scopeId && renderedResult.status==='ready';
    const cancelFrame=()=>{
        if(frame!==null) popup.cancelAnimationFrame(frame);
        frame=null;
    };
    const paintHighlight=()=>{
        for(const row of tbody.children) row.style.background=row.dataset.rowKey===highlightedKey?'#2a4a8a':'';
    };
    const clearRows=()=>{
        cancelFrame();rows=[];targets.clear();rowIndices.clear();renderedResult=null;
        tbody.replaceChildren();viewport.dataset.logicalRows='0';delete table.dataset.revision;
        table.setAttribute('aria-rowcount','1');
    };
    const drawWindow=()=>{
        frame=null;
        if(!current()) { clearRows();return; }
        const maxScroll=Math.max(0,(rows.length+1)*ROW_HEIGHT-height());
        const scroll=Math.max(0,Math.min(viewport.scrollTop||0,maxScroll));
        if(viewport.scrollTop!==scroll) viewport.scrollTop=scroll;
        const first=Math.max(0,Math.floor(scroll/ROW_HEIGHT)-OVERSCAN);
        const end=Math.min(rows.length,first+Math.ceil(height()/ROW_HEIGHT)+OVERSCAN*2+1);
        const fragment=doc.createDocumentFragment();
        const spacer=pixels=>{
            if(!pixels) return;
            const tr=doc.createElement('tr'),td=doc.createElement('td');
            tr.className='spacer';tr.setAttribute('aria-hidden','true');td.colSpan=Math.max(1,columns.length);
            td.style.height=pixels+'px';tr.append(td);fragment.append(tr);
        };
        spacer(first*ROW_HEIGHT);
        for(let index=first;index<end;index++) {
            const row=rows[index],tr=doc.createElement('tr');tr.dataset.rowKey=inventoryRowKey(row);
            tr.setAttribute('aria-rowindex',String(index+2));
            for(const column of columns) {
                const td=doc.createElement('td');td.textContent=String(row[column.key]??'');td.title=td.textContent;tr.append(td);
            }
            fragment.append(tr);
        }
        spacer((rows.length-end)*ROW_HEIGHT);
        tbody.replaceChildren(fragment);
        paintHighlight();
    };
    const scheduleWindow=()=>{
        if(disposed || frame!==null) return;
        if(popup.requestAnimationFrame) frame=popup.requestAnimationFrame(drawWindow);
        else drawWindow(); // DOM-only harnesses; browsers always provide rAF.
    };
    const render=()=>{
        if(disposed || scopeRetired || popup.closed) return;
        const result=host.__filterResult;
        // A different scope must release references even when its revision is smaller.
        if(result?.scopeId===scopeId && result.revision<lastRevision) {
            clearRows();status.textContent='Filtros: esperando la revisión vigente.';return;
        }
        clearRows();
        if(!result || result.scopeId!==scopeId || result.status!=='ready') {
            if(result?.scopeId!==scopeId) {
                currentSelection=null;highlightedKey=null;
                if(result?.scopeId) scopeRetired=true;
            }
            if(result?.scopeId===scopeId) lastRevision=result.revision;
            status.textContent=result?.scopeId && result.scopeId!==scopeId ? 'El frente cambió. Vuelve al visor para abrir su inventario.'
                : result?.status==='error'||result?.status==='invalid' ? 'Filtros: '+(result.diagnostics?.[0]?.message||result.diagnostics?.[0]?.code||result.status)
                    : 'Filtros: esperando datos o cálculo; no se muestran coincidencias antiguas.';
            return;
        }
        lastRevision=result.revision;renderedResult=result;
        const universe=host.postgresInventory||[];
        rows=refineInventorySelection(filterInventoryRows(universe,result,scopeId),currentSelection,universe);
        if(assetsOnly) rows=rows.filter(row=>(row._nodeType??row['__node__::__node_type__']??row.__node_type__??'instance')==='instance');
        status.textContent=(result.hasActivePredicates?'Filtros activos · ':'Sin filtros · ')+result.matches.length+' coincidencias globales · '+rows.length+' filas locales · revisión '+result.revision;
        targets=new Map(result.matches.map(m=>[m.rowKey,m]));
        rowIndices=new Map(rows.map((row,index)=>[inventoryRowKey(row),index]));
        if(!rowIndices.has(highlightedKey)) highlightedKey=null;
        viewport.dataset.logicalRows=String(rows.length);table.dataset.revision=String(result.revision);
        table.setAttribute('aria-rowcount',String(rows.length+1));
        viewport.scrollTop=0;
        drawWindow();
    };
    const click=e=>{
        if(!current()) return;
        let row=e.target;
        while(row && row!==tbody && !row.dataset?.rowKey) row=row.parentNode;
        if(!row?.dataset?.rowKey || !tbody.contains(row)) return;
        const target=targets.get(row.dataset.rowKey);
        if(!target) return;
        highlightedKey=row.dataset.rowKey;paintHighlight();
        host.dispatchEvent(new CustomEvent('viewer-select',{detail:{urn:target.modelUrn,dbIds:[target.dbId]}}));
    };
    const highlight=e=>{
        if(!current()) return;
        const key=viewerElementKey(e.detail?.urn,e.detail?.dbId);
        const matches=renderedResult.matches.filter(m=>viewerElementKey(m.modelUrn,m.dbId)===key);
        highlightedKey=matches.length===1?matches[0].rowKey:null;
        const index=rowIndices.get(highlightedKey);
        if(index!==undefined) {
            const top=index*ROW_HEIGHT,bottom=(index+2)*ROW_HEIGHT;
            const scroll=viewport.scrollTop||0;
            if(top<scroll) viewport.scrollTop=top;
            else if(bottom>scroll+height()) viewport.scrollTop=bottom-height();
            cancelFrame();drawWindow();
        } else paintHighlight();
    };
    const isolation=e=>{
        if(scopeRetired) return;
        const ids=e.detail?.elementKeys||e.detail?.isolatedExtIds;
        currentSelection=ids?.length?new Set(ids):null;render();
    };
    const reset=()=>{scopeRetired=true;clearRows();currentSelection=null;highlightedKey=null;status.textContent='El frente cambió. Vuelve al visor para abrir su inventario.';};
    const dockClick=()=>{popup.opener?.postMessage({type:'inventory-dock'},host.location.origin);cleanup();popup.close();};
    const cleanup=()=>{
        if(disposed) return;
        disposed=true;clearRows();currentSelection=null;highlightedKey=null;
        host.removeEventListener('filter-result',render);host.removeEventListener('inventory-isolation-sync',isolation);
        host.removeEventListener('inventory-highlight-row',highlight);host.removeEventListener('ecd-frente-reset',reset);
        viewport.removeEventListener('scroll',scheduleWindow);tbody.removeEventListener('click',click);dock.removeEventListener('click',dockClick);
        popup.removeEventListener('resize',scheduleWindow);popup.removeEventListener('beforeunload',cleanup);
        if(host.__inventoryPopup===popup) host.__inventoryPopup=null;
        if(host.__inventoryPopupCleanup===cleanup) host.__inventoryPopupCleanup=null;
    };
    host.__inventoryPopupCleanup=cleanup;
    host.addEventListener('filter-result',render);host.addEventListener('inventory-isolation-sync',isolation);
    host.addEventListener('inventory-highlight-row',highlight);host.addEventListener('ecd-frente-reset',reset);
    viewport.addEventListener('scroll',scheduleWindow,{passive:true});tbody.addEventListener('click',click);
    popup.addEventListener('resize',scheduleWindow);popup.addEventListener('beforeunload',cleanup);
    dock.addEventListener('click',dockClick);
    render();onClose?.();return popup;
}
