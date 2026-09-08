import { createFilterController } from './filtersCore.js';
import { createFilterVisualDriver } from './filterVisualDriver.js';
import { inventoryRevision } from './inventoryIdentity.js';

export function mountFiltersRuntime({ host, viewer, getIntent, models, ready }) {
    let controller, snapshotRows, sourceRows, sourceRevision;
    const emit=(name,detail)=>host.dispatchEvent(new CustomEvent(name,{detail}));
    const progress=detail=>emit('filter-progress',detail);
    const driver=createFilterVisualDriver({ viewer, models, window:host,
        onExternal:(kind,owner)=>{
            if(kind==='visibility') controller?.request({}, {force:true});
            else { controller?.request({}, {force:true}); progress({revision:controller?.getResult()?.revision,phase:'paused',owner}); }
        }});
    const snapshot=state=>{
        const revision=inventoryRevision();
        if(sourceRows!==host.postgresInventory || sourceRevision!==revision) {
            sourceRows=host.postgresInventory;sourceRevision=revision;
            snapshotRows=Array.isArray(sourceRows)?structuredClone(sourceRows):null;
        }
        return {
        scopeId:host.postgresInventoryUrn,
        rows:snapshotRows,
        datasetRevision:revision,
        rosetta:structuredClone(host.rosettaToDbId || {}),
        models:(state.models || []).map(m=>({modelUrn:m.urn,ready:ready(m.urn)}))
    };};
    controller=createFilterController({ snapshot, progress,
        publish:result=>{
            host.__filterResult=result;
            emit('filter-result',result);
            // Legacy globals are output-only compatibility mirrors.
            host._lastHasActiveFilters=result.hasActivePredicates;
            host._lastValidDbIds=result.status==='ready'?Object.fromEntries(result.matchesByModel.map(
                group=>[group.modelUrn,new Set(group.matches.map(x=>x.dbId))])):null;
            host._lastCalculatedBuckets=result.status==='ready'?result.facets:null;
            if(result.status==='ready') emit('filters-calculated',result.facets);
        },
        apply:(result,state,isCurrent)=>driver.apply(result,state,isCurrent)
    });
    const request=patch=>controller.request(patch || getIntent());
    const recalculate=e=>{
        // V2 supplies a partial intent after readiness; read current schema/Sources.
        if(e.detail?.generacion) request({...getIntent(),...e.detail,filterColors:{}});
        else if(e.detail) request(e.detail);
        else controller.request({}, {force:true}); // live edit: retain authoritative intent
    };
    const refresh=()=>{if(!host.__restaurandoVistaV2) controller.request({}, {force:true});};
    const theme=e=>{
        const {propId,active,customColors}=e.detail || {};
        if(!propId) return;
        driver.cancelColors(!active);
        if(active) driver.claimColors();
        const intent=controller.getState();
        request({filterColors:{...intent.filterColors,[propId]:!!active},
            customColors:customColors || host._customValueColors || {}});
    };
    const reset=()=>{
        driver.cancelColors(true);
        request({filterSelections:{},filterColors:{}});
        emit('filter-intent-reset',{});
    };
    const isolate=e=>{
        const {propId,values}=e.detail || {};
        if(!propId) return;
        const selections={...controller.getState().filterSelections,[propId]:values || []};
        request({filterSelections:selections});
        emit('filter-intent-selection',selections);
    };
    const beforeRestore=()=>{controller.cancel({filterColors:{}});driver.cancelColors(true);driver.resetBase();};
    const scopeReset=()=>{
        controller.cancel();driver.resetBase();driver.cancelColors(true);
        request({filterSelections:{},filterColors:{}});
    };
    const listeners=[
        ['recalculate-filters',recalculate],['inventory-ready',refresh],
        ['rosetta-ready',refresh],['viewer-geometry-loaded',refresh],['viewer-model-loaded',refresh],
        ['theme-property-bucket',theme],['filters-reset-all',reset],
        ['isolate-property-bucket',isolate],['viewer-restore-state',beforeRestore],
        ['ecd-frente-reset',scopeReset]
    ];
    for(const [name,handler] of listeners) host.addEventListener(name,handler);
    request();
    return {request,controller,driver,dispose(){
        controller.dispose();driver.dispose();
        for(const [name,handler] of listeners) host.removeEventListener(name,handler);
        // No stale result survives this runtime's lifetime.
        if(host.__filterResult?.scopeId===getIntent()?.scopeId) {
            host.__filterResult=null;emit('filter-result',null);
        }
    }};
}
