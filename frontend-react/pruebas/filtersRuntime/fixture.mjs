export function makeRuntimeFixture({ count = 3, sources = ['m1'] } = {}) {
    const host = new EventTarget();
    host.Autodesk={Viewing:{ISOLATE_EVENT:'isolate',HIDE_EVENT:'hide',SHOW_EVENT:'show'}};
    host.THREE={Vector4:class {constructor(x,y,z,w){Object.assign(this,{x,y,z,w});}}};
    const events=[], calls=[];
    for(const name of ['filter-result','filter-progress','filters-calculated','viewer-colors-applied'])
        host.addEventListener(name,e=>events.push({name,detail:e.detail}));
    const models=sources.map((urn,index)=>({
        id:index+1,isolated:[],hidden:[],colors:new Map(),
        getData:()=>({urn,globalOffset:{x:0,y:0,z:0}}),
        isLoadDone:()=>true,
        getInstanceTree:()=>({getChildCount:()=>0,enumNodeChildren(){}}),
        setThemingColor(id,color){this.colors.set(id,color);}
    }));
    const viewer=new EventTarget();
    viewer.getAllModels=()=>models;
    viewer.getIsolatedNodes=m=>m.isolated;
    viewer.getAggregateHiddenNodes=()=>models.map(model=>({model,selection:[...model.hidden]}));
    viewer.isolate=(ids,m)=>{calls.push({op:'isolate',urn:m.getData().urn,ids:[...ids]});m.isolated=[...ids];m.hidden=[];
        viewer.dispatchEvent(new Event('isolate'));};
    viewer.hide=(ids,m)=>{m.hidden=[...new Set([...m.hidden,...ids])];viewer.dispatchEvent(new Event('hide'));};
    viewer.setThemingColor=(id,color,m)=>{calls.push({op:'color',id,urn:m.getData().urn});m.setThemingColor(id,color);};
    viewer.clearThemingColors=m=>{calls.push({op:'clearColor',urn:m.getData().urn});m.colors.clear();};
    viewer.fitToView=()=>{throw new Error('Filters must not touch camera');};
    viewer.impl={modelQueue:()=>({getModels:()=>models}),visibilityManager:{isolate:viewer.isolate},invalidate(){}};
    host.postgresInventory=sources.flatMap(source_urn=>Array.from({length:count},(_,i)=>({
        dbId:'e'+i,source_urn,'G::Estado':i%2?'Pendiente':'Ejecutado','G::Tipo':i%3?'B':'A'
    })));
    host.postgresInventoryUrn='front';
    host.rosettaToDbId=Object.fromEntries(sources.map(urn=>[urn,Object.fromEntries(Array.from({length:count},(_,i)=>['e'+i,i+1]))]));
    const state={scopeId:'front',models:sources.map(urn=>({urn})),schema:['G::Estado','G::Tipo'],
        filterProperties:['G::Estado','G::Tipo'],filterSelections:{},filterColors:{},hiddenModelUrns:[]};
    const snapshot=()=>({scopeId:'front',rows:host.postgresInventory,rosetta:host.rosettaToDbId,
        datasetRevision:1,models:sources.map(modelUrn=>({modelUrn,ready:true}))});
    return {host,viewer,models,events,calls,state,snapshot};
}
export const microtasks = async () => {for(let i=0;i<12;i++) await Promise.resolve();};
export const tick = () => new Promise(resolve=>setTimeout(resolve,5));
export function gate(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
