import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { readFile } from 'node:fs/promises';
import { calculateFilterResult } from '../src/lib/filtersCore.js';
import { makeRuntimeFixture } from './filtersRuntime/fixture.mjs';
import { makePopoutDom } from './filtersRuntime/popoutDom.mjs';
import { openInventoryFilterPopout } from '../src/lib/inventoryFilterPopout.js';

// Import an in-memory mutant with absolute dependencies, without editing product files.
const mutant=process.argv.includes('--mutant');
let open=openInventoryFilterPopout;
if(mutant) {
    const path=new URL('../src/lib/inventoryFilterPopout.js',import.meta.url);
    let code=await readFile(path,'utf8');
    const first='const first=Math.max(0,Math.floor(scroll/ROW_HEIGHT)-OVERSCAN);';
    const end='const end=Math.min(rows.length,first+Math.ceil(height()/ROW_HEIGHT)+OVERSCAN*2+1);';
    assert.ok(code.includes(first)&&code.includes(end),'mutant locator drift');
    code=code.replace(first,'const first=0;').replace(end,'const end=rows.length;')
        .replaceAll("'./filtersCore.js'",JSON.stringify(new URL('./filtersCore.js',path).href))
        .replaceAll("'./inventoryIdentity.js'",JSON.stringify(new URL('./inventoryIdentity.js',path).href));
    open=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).openInventoryFilterPopout;
}
const reports=[];
for(const count of [13783,50000]) {
    const f=makeRuntimeFixture({count:Math.ceil(count/5),sources:['m1','m2','m3','m4','m5']});
    f.host.postgresInventory=f.host.postgresInventory.slice(0,count).map(row=>({...row,
        scope_id:'front',source_lineage:'urn:adsk.wipprod:dm.lineage:'+row.source_urn,
        external_id:row.dbId,element_key:JSON.stringify(['front','urn:adsk.wipprod:dm.lineage:'+row.source_urn,row.dbId])}));
    const result=revision=>calculateFilterResult(f.state,f.snapshot(),revision);
    f.host.__filterResult=result(1);
    assert.equal(f.host.__filterResult.matches.length,count);
    assert.ok(f.host.__filterResult.matches.every(m=>JSON.parse(m.rowKey)[0]==='front'),'canonical scope/lineage/external identity');
    const baseline=getEventListeners(f.host,'filter-result').length;
    let dom=makePopoutDom(f.host);
    const columns=Array.from({length:40},(_,i)=>({key:i?'G::Estado':'dbId',header:'C'+i}));
    const start=performance.now();
    open({host:f.host,scopeId:'front',columns});
    const initialMs=performance.now()-start;
    let viewport=dom.find('div'),tbody=dom.find('tbody');
    const bounded=()=>{
        assert.ok(dom.dataRows().length<=103,'BOUNDED_DOM: render-all is forbidden');
        assert.ok(dom.liveNodes()<4400,'BOUNDED_DOM: cells must scale with viewport, not logical rows');
    };
    bounded();assert.equal(viewport.dataset.logicalRows,String(count));
    assert.equal(dom.find('table').dataset.revision,'1');
    assert.equal(getEventListeners(tbody,'click').length,1);
    assert.ok(dom.dataRows().every(n=>getEventListeners(n,'click').length===0));
    const keys=f.host.__filterResult.matches.map(m=>m.rowKey);
    const scrollStart=performance.now();
    for(const index of [0,Math.floor(count/2),count-1]) {
        viewport.scrollTop=index*28;viewport.dispatchEvent(new Event('scroll'));dom.flush();bounded();
        assert.ok(dom.dataRows().some(n=>n.dataset.rowKey===keys[index]),'region must be reachable');
    }
    const scrollMs=performance.now()-scrollStart;
    viewport.clientHeight=900;dom.popup.dispatchEvent(new Event('resize'));dom.flush();bounded();
    assert.ok(dom.dataRows().some(n=>n.dataset.rowKey===keys[count-1]));
    const target=f.host.__filterResult.matches.find(m=>m.modelUrn==='m2'&&m.dbId===1);
    f.host.dispatchEvent(new CustomEvent('inventory-highlight-row',{detail:{urn:'m2',dbId:1}}));
    const marked=dom.dataRows().filter(n=>n.style.background==='#2a4a8a');
    assert.deepEqual(marked.map(n=>n.dataset.rowKey),[target.rowKey]);
    let selected=null;const select=e=>selected=e.detail;f.host.addEventListener('viewer-select',select);
    marked[0].children[0].dispatchEvent(new Event('click',{bubbles:true}));
    assert.deepEqual(selected,{urn:'m2',dbIds:[1]});
    const oldRow=marked[0],a=f.host.__filterResult;
    viewport.scrollTop=(count-1)*28;viewport.dispatchEvent(new Event('scroll'));dom.flush();
    assert.ok(!dom.dataRows().some(n=>n.style.background==='#2a4a8a'),'off-window selected row is not materialized');
    f.host.dispatchEvent(new CustomEvent('inventory-highlight-row',{detail:{urn:'m2',dbId:1}}));
    assert.equal(dom.dataRows().filter(n=>n.style.background==='#2a4a8a').length,1);
    viewport.scrollTop=8000;viewport.dispatchEvent(new Event('scroll'));
    f.host.__filterResult=calculateFilterResult({...f.state,filterSelections:{'G::Estado':['Pendiente']}},f.snapshot(),2);
    const updateStart=performance.now();f.host.dispatchEvent(new Event('filter-result'));dom.flush();
    const updateMs=performance.now()-updateStart;
    assert.equal(dom.find('table').dataset.revision,'2');bounded();
    const expectedKeys=new Set(f.host.__filterResult.matches.map(m=>m.rowKey));
    assert.equal(Number(viewport.dataset.logicalRows),expectedKeys.size,'same logical B membership as FilterResult');
    assert.ok(dom.dataRows().every(n=>expectedKeys.has(n.dataset.rowKey)));
    selected=null;oldRow.dispatchEvent(new Event('click',{bubbles:true}));assert.equal(selected,null);
    const b=f.host.__filterResult;
    f.host.__filterResult=a;f.host.dispatchEvent(new Event('filter-result'));dom.flush();
    assert.equal(dom.dataRows().length,0,'late A cannot replace B');
    f.host.__filterResult=b;f.host.dispatchEvent(new Event('filter-result'));
    // Late A cannot draw or select while B owns the host, even with pending scroll.
    viewport.dispatchEvent(new Event('scroll'));
    f.host.__filterResult={revision:3,scopeId:'front',status:'pending'};f.host.dispatchEvent(new Event('filter-result'));dom.flush();
    assert.equal(dom.dataRows().length,0);assert.ok(!dom.find('p').textContent.includes('0 coincidencias'));
    f.host.__filterResult=calculateFilterResult({...f.state,filterSelections:{'G::Estado':['missing']}},f.snapshot(),4);
    f.host.dispatchEvent(new Event('filter-result'));assert.equal(dom.dataRows().length,0);assert.match(dom.find('p').textContent,/Filtros activos.*0 coincidencias/);
    f.host.__filterResult=result(5);f.host.dispatchEvent(new Event('filter-result'));assert.match(dom.find('p').textContent,/Sin filtros/);
    const nodes=dom.liveNodes();
    viewport.dispatchEvent(new Event('scroll'));
    f.host.__filterResult={...a,revision:1,scopeId:'other'};f.host.dispatchEvent(new Event('filter-result'));dom.flush();
    assert.equal(dom.dataRows().length,0);assert.equal(viewport.dataset.logicalRows,'0');
    assert.match(dom.find('p').textContent,/frente cambió/);
    f.host.__filterResult=result(6);f.host.dispatchEvent(new Event('filter-result'));
    assert.equal(dom.dataRows().length,0,'retired scope cannot be resurrected by late events');
    f.host.dispatchEvent(new Event('ecd-frente-reset'));assert.equal(dom.dataRows().length,0);
    const closeStart=performance.now();dom.popup.close();const closeMs=performance.now()-closeStart;
    assert.equal(getEventListeners(f.host,'filter-result').length,baseline);
    for(const event of ['inventory-highlight-row','inventory-isolation-sync','ecd-frente-reset'])assert.equal(getEventListeners(f.host,event).length,0);
    for(const [node,event] of [[viewport,'scroll'],[tbody,'click'],[dom.find('button'),'click'],[dom.popup,'resize'],[dom.popup,'beforeunload']])
        assert.equal(getEventListeners(node,event).length,0);
    assert.equal(dom.frames.size,0);assert.equal(f.host.__inventoryPopup,null);assert.equal(viewport.dataset.logicalRows,'0');
    const reopenStart=performance.now();
    for(let cycle=0;cycle<3;cycle++){
        dom=makePopoutDom(f.host);open({host:f.host,scopeId:'front',columns});
        assert.equal(getEventListeners(f.host,'filter-result').length,baseline+1);
        dom.popup.close();assert.equal(getEventListeners(f.host,'filter-result').length,baseline);
    }
    const reopenMs=performance.now()-reopenStart;
    f.host.removeEventListener('viewer-select',select);
    reports.push({logicalRows:count,columns:40,liveNodes:nodes,rowClickListeners:0,ownedListeners:9,initialMs,scrollMs,updateMs,closeMs,reopen3Ms:reopenMs});
}
console.log(JSON.stringify({suite:'popoutScale',status:'PASS',mutant,reports,limits:'DOM/event doubles: structural and lifecycle oracle; timings are not browser frame timings.'},null,2));
