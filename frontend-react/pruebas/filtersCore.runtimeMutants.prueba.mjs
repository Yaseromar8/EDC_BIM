import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateFilterResult } from '../src/lib/filtersCore.js';
import { makeRuntimeFixture,microtasks,gate } from './filtersRuntime/fixture.mjs';

const core=new URL('../src/lib/filtersCore.js',import.meta.url),driver=new URL('../src/lib/filterVisualDriver.js',import.meta.url);
const data=text=>'data:text/javascript;base64,'+Buffer.from(text).toString('base64');
async function moduleAt(url,mutation) {
    let source=readFileSync(url,'utf8').replace(/\r\n/g,'\n');
    if(mutation){assert.ok(source.includes(mutation[0]),'mutant marker missing');source=source.replace(...mutation);}
    source=source.replace(/from\s+(['"])(\.[^'"]+)\1/g,(_all,_q,path)=>'from '+JSON.stringify(new URL(path,url).href));
    return import(data(source));
}
async function stale(m) {
    const f=makeRuntimeFixture(),A=gate(),published=[];
    const c=m.createFilterController({snapshot:f.snapshot,publish:r=>published.push(r),apply:()=>({}),
        compute:async(s,d,r)=>{if(s.label==='A') await A.promise;return calculateFilterResult(s,d,r);}});
    c.request({...f.state,label:'A'});await microtasks();const rev=c.request({label:'B'});await microtasks();
    A.resolve();await microtasks();c.dispose();
    assert.ok(published.filter(r=>r.status==='ready').every(r=>r.revision===rev),'stale result published');
}
async function cancel(m) {
    const f=makeRuntimeFixture({count:5001}),pause=gate();
    const d=m.createFilterVisualDriver({viewer:f.viewer,models:()=>f.models,window:f.host,yieldFrame:()=>pause.promise});
    const job=d.apply(calculateFilterResult(f.state,f.snapshot(),1),{...f.state,filterColors:{'G::Estado':true}},()=>true);
    assert.equal(f.models[0].colors.size,5000);d.cancelColors(true);pause.resolve();await job;
    // La cola se mide ANTES de dispose: lo que se afirma es que CANCELAR mata el
    // trabajo en vuelo, no que la limpieza del desmontaje acabe tapandolo.
    // Medirlo despues dejaba pasar un `cancelColors` que no cancelaba nada.
    assert.equal(f.models[0].colors.size,0,'late color tail');d.dispose();
}
async function zero(m) {
    const f=makeRuntimeFixture(),d=m.createFilterVisualDriver({viewer:f.viewer,models:()=>f.models,window:f.host});
    const state={...f.state,filterSelections:{'G::Estado':['missing']}};
    await d.apply(calculateFilterResult(state,f.snapshot(),1),state,()=>true);d.dispose();
    assert.deepEqual(f.models[0].isolated,[-1],'zero incorrectly released isolation');
}
async function disposeColors(m) {
    // El color de Filters no puede sobrevivir al desmontaje: el driver siguiente
    // arranca con `painted` vacio y ya nadie podria quitarlo.
    const f=makeRuntimeFixture(),d=m.createFilterVisualDriver({viewer:f.viewer,models:()=>f.models,window:f.host});
    const state={...f.state,filterColors:{'G::Estado':true}};
    await d.apply(calculateFilterResult(state,f.snapshot(),1),state,()=>true);
    assert.ok(f.models[0].colors.size>0,'el caso no llego a pintar nada');
    d.dispose();
    assert.equal(f.models[0].colors.size,0,'color propio huerfano tras dispose');
}
const cases=[
    ['stale-publication',core,['if (!isCurrent(r)) { metrics.superseded++; return; }','/* mutant: publish stale calculation */'],stale],
    ['color-cancellation',driver,['cancelColors(clear = false) { ++colorJob;','cancelColors(clear = false) {'],cancel],
    ['zero-means-show-all',driver,['ids.length?ids:[-1]','ids'],zero],
    ['dispose-leaves-orphan-color',driver,['            clearOwned();','            /* mutant: orphan color */'],disposeColors],
];
let killed=0,fail=0;
for(const [name,url,mutation,check] of cases){
    try{
        await check(await moduleAt(url));
        let error;try{await check(await moduleAt(url,mutation));}catch(e){error=e;}
        assert.ok(error instanceof assert.AssertionError,'mutant must die by the unchanged behavioural assertion, not setup/import');
        killed++;console.log(JSON.stringify({name,status:'KILLED',reason:error.message}));
    }catch(e){fail++;console.log(JSON.stringify({name,status:'FAIL',error:e.stack}));}
}
console.log(JSON.stringify({suite:'filtersCore.runtimeMutants',killed,fail,total:cases.length}));process.exitCode=fail?1:0;
