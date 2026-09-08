// Isolated synthetic browser fitness. No owner profile, APS, backend or HOST data.
// Optional paths: POPOUT_PLAYWRIGHT_MODULE, POPOUT_BROWSER_EXECUTABLE.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.POPOUT_PLAYWRIGHT_MODULE||'playwright');
const server=createServer(async(req,res)=>{
    const path=new URL(req.url,'http://local').pathname;
    if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Isolated popout fitness</title>');return;}
    if(!/^\/(src\/lib\/[A-Za-z0-9]+\.js|src\/aps\/utils\/model\.js|pruebas\/filtersRuntime\/fixture\.mjs)$/.test(path)){res.writeHead(404);res.end();return;}
    try{res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('..'+path,import.meta.url)));}
    catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
    browser=await chromium.launch({headless:true,...(process.env.POPOUT_BROWSER_EXECUTABLE?{executablePath:process.env.POPOUT_BROWSER_EXECUTABLE}:{})});
    const context=await browser.newContext({viewport:{width:1100,height:600}});
    const page=await context.newPage();
    await page.goto('http://127.0.0.1:'+server.address().port);
    const reports=await page.evaluate(async()=>{
        const {openInventoryFilterPopout}=await import('/src/lib/inventoryFilterPopout.js');
        const {calculateFilterResult}=await import('/src/lib/filtersCore.js');
        const {makeRuntimeFixture}=await import('/pruebas/filtersRuntime/fixture.mjs');
        const check=(ok,message)=>{if(!ok)throw new Error(message);};
        const frame=popup=>new Promise(resolve=>popup.requestAnimationFrame(()=>popup.requestAnimationFrame(resolve)));
        const reports=[];
        for(const count of [13783,50000]){
            const f=makeRuntimeFixture({count:Math.ceil(count/5),sources:['m1','m2','m3','m4','m5']});
            f.host.postgresInventory=f.host.postgresInventory.slice(0,count).map(row=>({...row,
                scope_id:'front',source_lineage:'urn:adsk.wipprod:dm.lineage:'+row.source_urn,
                external_id:row.dbId,element_key:JSON.stringify(['front','urn:adsk.wipprod:dm.lineage:'+row.source_urn,row.dbId])}));
            const listeners=new Set();
            const track=target=>{
                const add=target.addEventListener.bind(target),remove=target.removeEventListener.bind(target);
                target.addEventListener=(type,fn,opts)=>{listeners.add({target,type,fn});add(type,fn,opts);};
                target.removeEventListener=(type,fn,opts)=>{for(const item of listeners)if(item.target===target&&item.type===type&&item.fn===fn)listeners.delete(item);remove(type,fn,opts);};
            };
            track(f.host);
            f.host.location={origin:location.origin};
            f.host.open=()=>{
                const popup=window.open('','scale-fitness','width=1100,height=600');
                track(popup);
                const create=popup.document.createElement.bind(popup.document);
                popup.document.createElement=tag=>{const node=create(tag);track(node);return node;};
                return popup;
            };
            const calculate=(revision,patch={})=>calculateFilterResult({...f.state,...patch},f.snapshot(),revision);
            f.host.__filterResult=calculate(1);
            const columns=Array.from({length:80},(_,i)=>({key:i?'G::Estado':'dbId',header:'Col '+i}));
            let start=performance.now();
            let popup=openInventoryFilterPopout({host:f.host,scopeId:'front',columns});
            await frame(popup);
            const initialMs=performance.now()-start;
            const doc=popup.document,viewport=doc.querySelector('.inventory-scroll');
            const rows=()=>[...doc.querySelectorAll('tbody tr[data-row-key]')];
            const domNodes=()=>{
                let count=1;const walker=doc.createTreeWalker(doc,popup.NodeFilter.SHOW_ALL);
                while(walker.nextNode())count++;
                return count;
            };
            let peakPhysicalRows=0,peakLiveElements=0,peakConnectedNodes=0;
            const bounded=()=>{
                peakPhysicalRows=Math.max(peakPhysicalRows,rows().length);
                peakLiveElements=Math.max(peakLiveElements,doc.querySelectorAll('*').length);
                peakConnectedNodes=Math.max(peakConnectedNodes,domNodes());
                check(rows().length<=103,'BOUNDED_DOM');check(doc.querySelectorAll('*').length<8500,'BOUNDED_CELLS');
            };
            bounded();
            const initialPhysicalRows=rows().length,initialLiveElements=doc.querySelectorAll('*').length;
            const initialConnectedNodes=domNodes();
            check(Number(viewport.dataset.logicalRows)===count,'logical count');
            check(doc.querySelector('table').dataset.revision==='1','revision');
            check(rows().every(row=>Math.abs(row.getBoundingClientRect().height-28)<0.1),'fixed row layout');
            const logicalKeys=f.host.__filterResult.matches.map(m=>m.rowKey);
            check(logicalKeys.every(key=>JSON.parse(key)[0]==='front'),'canonical qualified identity');
            const scrollMetrics=[];
            for(const index of [0,Math.floor(count/2),count-1]){
                start=performance.now();viewport.scrollTop=index*28;
                viewport.dispatchEvent(new Event('scroll'));await frame(popup);bounded();
                const found=rows().find(row=>row.dataset.rowKey===logicalKeys[index]);
                check(found,'reachable region '+index);
                const rect=found.getBoundingClientRect(),view=viewport.getBoundingClientRect();
                check(rect.bottom>view.top&&rect.top<view.bottom,'region visually in viewport '+index);
                scrollMetrics.push(performance.now()-start);
            }
            // Rapid scroll coalesces; final position is authoritative.
            for(let i=0;i<40;i++){viewport.scrollTop=(i%2?count-1:0)*28;viewport.dispatchEvent(new Event('scroll'));}
            await frame(popup);bounded();check(rows().some(row=>row.dataset.rowKey===logicalKeys[count-1]),'rapid scroll last');
            viewport.style.flex='none';viewport.style.height='260px';
            popup.dispatchEvent(new Event('resize'));await frame(popup);bounded();
            check(rows().some(row=>row.dataset.rowKey===logicalKeys[count-1]),'resize preserves last');
            // Exercise the actual CSS maximum, not only a mocked clientHeight.
            doc.body.style.height='2700px';viewport.style.height='2500px';
            popup.dispatchEvent(new Event('resize'));await frame(popup);bounded();
            check(viewport.clientHeight===2400,'CSS viewport bound');
            check(rows().some(row=>row.dataset.rowKey===logicalKeys[count-1]),'large resize preserves last');
            viewport.scrollTop=Math.floor(count/2)*28;viewport.dispatchEvent(new Event('scroll'));
            await frame(popup);bounded();
            check(rows().some(row=>row.dataset.rowKey===logicalKeys[Math.floor(count/2)]),'large middle region');
            doc.body.style.height='100%';viewport.style.height='260px';
            popup.dispatchEvent(new Event('resize'));await frame(popup);
            const target=f.host.__filterResult.matches.find(m=>m.modelUrn==='m2'&&m.dbId===1);
            f.host.dispatchEvent(new CustomEvent('inventory-highlight-row',{detail:{urn:'m2',dbId:1}}));
            const marked=rows().filter(row=>row.style.background==='rgb(42, 74, 138)');
            check(marked.length===1&&marked[0].dataset.rowKey===target.rowKey,'qualified offscreen highlight');
            let selected;
            const select=e=>selected=e.detail;
            f.host.addEventListener('viewer-select',select);
            marked[0].firstElementChild.click();check(selected?.urn==='m2'&&selected.dbIds[0]===1,'delegated qualified click');
            const oldRow=marked[0];
            viewport.scrollTop=8000;viewport.dispatchEvent(new Event('scroll'));
            f.host.__filterResult=calculate(2,{filterSelections:{'G::Estado':['Pendiente']}});
            start=performance.now();f.host.dispatchEvent(new Event('filter-result'));await frame(popup);
            const updateMs=performance.now()-start;
            const expected=new Set(f.host.__filterResult.matches.map(m=>m.rowKey));
            check(Number(viewport.dataset.logicalRows)===expected.size,'same logical B membership as FilterResult');
            check(rows().every(row=>expected.has(row.dataset.rowKey)),'B membership');
            check(doc.querySelector('table').dataset.revision==='2','B revision');
            selected=null;oldRow.click();check(selected===null,'detached A click');
            f.host.__filterResult=calculate(3,{filterSelections:{'G::Estado':['missing']}});f.host.dispatchEvent(new Event('filter-result'));
            check(rows().length===0&&doc.querySelector('p').textContent.includes('Filtros activos'),'zero active');
            f.host.__filterResult={scopeId:'front',revision:4,status:'pending'};f.host.dispatchEvent(new Event('filter-result'));
            check(rows().length===0&&!doc.querySelector('p').textContent.includes('0 coincidencias'),'pending not old zero');
            f.host.__filterResult=calculate(5);f.host.dispatchEvent(new Event('filter-result'));
            check(doc.querySelector('p').textContent.includes('Sin filtros'),'no-filter');
            const liveElements=doc.querySelectorAll('*').length,physicalRows=rows().length;
            f.host.removeEventListener('viewer-select',select);
            check(listeners.size===9,'constant own listeners');
            f.host.__filterResult={scopeId:'other',revision:1,status:'pending'};
            f.host.dispatchEvent(new Event('filter-result'));await frame(popup);
            check(rows().length===0&&viewport.dataset.logicalRows==='0','scope release');
            start=performance.now();f.host.__inventoryPopupCleanup();const closeMs=performance.now()-start;
            check(listeners.size===0,'dispose listeners');
            popup.close();
            f.host.__filterResult=calculate(6);
            start=performance.now();
            popup=openInventoryFilterPopout({host:f.host,scopeId:'front',columns});await frame(popup);
            const reopenMs=performance.now()-start;
            check(listeners.size===9,'reopen listeners');
            popup.close();
            await new Promise(resolve=>setTimeout(resolve,0));
            check(listeners.size===0&&f.host.__inventoryPopup===null,'native close cleanup');
            reports.push({logicalRows:count,columns:80,initialPhysicalRows,initialLiveElements,
                initialConnectedNodes,peakPhysicalRows,peakLiveElements,peakConnectedNodes,
                physicalRows,liveElements,ownedListeners:9,initialMs,scrollMs:scrollMetrics,updateMs,closeMs,reopenMs});
        }
        return reports;
    });
    assert.equal(reports.length,2);
    console.log(JSON.stringify({suite:'popoutBrowser',status:'PASS',browser:browser.version(),reports,limits:'Headless real browser with synthetic rows and models; no APS/GPU or real HOST campaign.'},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
