import { _safeUrn } from '../aps/utils/model.js';

// Filters owns only its isolation mask and its color jobs. External tools win
// until an explicit property-color command claims color ownership again.
export function createFilterVisualDriver({ viewer, models, window: host,
    onExternal = () => {}, yieldFrame = () => new Promise(r => setTimeout(r,0)) }) {
    const base = new Map(), painted = new Set(), modelHooks = new Map();
    let writing = false, colorJob = 0, foreignOwner = null, disposed = false;
    const originalSet = viewer.setThemingColor, originalClear = viewer.clearThemingColors;
    const owned = fn => {
        const previous = writing, flag = host._filterIsolationInProgress;
        writing = true; host._filterIsolationInProgress = true;
        try { return fn(); } finally { writing = previous; host._filterIsolationInProgress = flag; }
    };
    const clearOwned = (current = () => true) => owned(() => {
        const previous = [...painted];
        painted.clear();
        for (const model of previous) {
            if (!current()) break;
            originalClear.call(viewer,model);
        }
    });
    const externalColor = () => {
        if (writing || disposed) return;
        // APAGAR el coloreo por Source pasa por el MISMO camino que encenderlo:
        // `_applySourceTint(urn, null)` tambien levanta `__ecdTintApplying` y
        // llama a clearThemingColors. Mirando solo esa bandera, el dueno seguia
        // siendo 'sources', el `if` de abajo era falso, no se emitia progreso y
        // la linea de estado repetia «Control visual: sources» para siempre --con
        // el coloreo apagado y cero fragmentos tenidos--. `__ecdSourceColorOn` ya
        // esta fijado ANTES de pintar o borrar, asi que dice la verdad aqui.
        const owner = host.__ecdTintApplying
            ? (host.__ecdSourceColorOn ? 'sources' : null)
            : 'external-tool';
        ++colorJob;
        clearOwned();
        if (foreignOwner !== owner) { foreignOwner = owner; onExternal('color',owner); }
    };
    const setHook = function(...args) { externalColor(); return originalSet.apply(this,args); };
    const clearHook = function(...args) { externalColor(); return originalClear.apply(this,args); };
    viewer.setThemingColor = setHook;
    viewer.clearThemingColors = clearHook;
    const bindModels = () => {
        const live = new Set(models());
        let retired = false;
        // A runtime survives Source reloads. Retired LMV instances must not
        // retain this driver or claim ownership through an obsolete hook.
        for (const [model,{original,hook}] of modelHooks) if (!live.has(model)) {
            // El color propio se retira ANTES de soltar la propiedad, igual que
            // en dispose(). Soltarla a secas dejaba tinte de Filters en un modelo
            // que este driver ya no gobierna y que ningun driver posterior puede
            // limpiar: `painted` arranca vacio. Ocurre cuando el consumidor saca
            // de `models()` un modelo que sigue vivo en la escena. El modelo
            // puede estar ya descargado, asi que el intento no puede tumbar el
            // barrido ni dejar los ganchos puestos.
            if (painted.has(model)) {
                try { owned(() => originalClear.call(viewer,model)); } catch { /* modelo ya descargado */ }
            }
            if (model.setThemingColor === hook) model.setThemingColor = original;
            modelHooks.delete(model); base.delete(model); painted.delete(model);
            retired = true;
        }
        for (const model of live) {
            if (modelHooks.has(model) || typeof model.setThemingColor !== 'function') continue;
            const original = model.setThemingColor;
            const hook = function(...args) { externalColor(); return original.apply(this,args); };
            model.setThemingColor = hook;
            modelHooks.set(model,{original,hook});
        }
        return retired;
    };
    // PODAR LA SELECCION A LO QUE SIGUE VISIBLE.
    //
    // El visor dibuja la seleccion POR ENCIMA del fantasma, asi que un elemento
    // seleccionado antes de filtrar se seguia viendo solido y parecia escapar
    // del filtro. El camino viejo --`handleFiltersApply` en Viewer.jsx-- hacia
    // `clearSelection()` entero, pero ese manejador esta muerto: nadie emite ya
    // `filters-apply`. Al pasar el mando al runtime se quedo atras.
    //
    // No se repone el `clearSelection()` a secas: `apply()` corre en cada
    // recalculo --inventario listo, rosetta lista, geometria cargada-- y borrar
    // la seleccion ahi la haria desaparecer al cargar un modelo. Se quita SOLO
    // lo que el filtro se ha llevado, y si no sobra nada no se toca: idempotente,
    // que es lo que permite repetirlo sin efectos.
    const podarSeleccion = visiblePorModelo => {
        if (typeof viewer.getAggregateSelection !== 'function') return;
        let sobra = false;
        const quedan = [];
        for (const entrada of viewer.getAggregateSelection() || []) {
            const ids = entrada.selection || entrada.ids || [];
            const permitidos = visiblePorModelo.get(entrada.model);
            // Modelo oculto por Sources, o que este filtro no gobierna: no se poda.
            if (!permitidos) { if (ids.length) quedan.push({ model: entrada.model, ids: [...ids] }); continue; }
            const dentro = [...ids].filter(id => permitidos.has(Number(id)));
            if (dentro.length !== ids.length) sobra = true;
            if (dentro.length) quedan.push({ model: entrada.model, ids: dentro });
        }
        if (!sobra) return;
        if (quedan.length) viewer.setAggregateSelection(quedan);
        else if (typeof viewer.clearSelection === 'function') viewer.clearSelection();
    };
    const hiddenOf = model => [...(viewer.getAggregateHiddenNodes?.().find(x=>x.model===model)?.selection || [])];
    const capture = model => ({ isolated:[...(viewer.getIsolatedNodes?.(model)||[])], hidden:hiddenOf(model) });
    const nativeVisibility = e => {
        if (writing || host._filterIsolationInProgress || disposed || host.__restaurandoVistaV2) return;
        for (const model of models()) if (base.has(model)) {
            const prior=base.get(model);
            const isIsolation = e.type === host.Autodesk?.Viewing?.ISOLATE_EVENT;
            base.set(model,{isolated:isIsolation ? capture(model).isolated : prior.isolated,hidden:hiddenOf(model)});
        }
        onExternal('visibility');
    };
    const eventNames = ['ISOLATE_EVENT','HIDE_EVENT','SHOW_EVENT'].map(k=>host.Autodesk?.Viewing?.[k]).filter(Boolean);
    for(const name of eventNames) viewer.addEventListener?.(name,nativeVisibility);
    bindModels();

    const allowedByBase = (model, ids, snapshot) => {
        if (!snapshot.isolated.length) return ids;
        const allowed = new Set(snapshot.isolated);
        const tree = model.getInstanceTree?.();
        for (const root of snapshot.isolated) tree?.enumNodeChildren(root,id=>allowed.add(id),true);
        return ids.filter(id=>allowed.has(id));
    };
    const colorFor = value => {
        const palette=['#7e9bbd','#F97316','#10B981','#F43F5E','#A855F7','#5f7fa3','#EAB308',
            '#EF4444','#8B5CF6','#EC4899','#6366F1','#14B8A6','#84CC16','#F59E0B'];
        let hash=0; for(const c of value) hash=(hash*31+c.charCodeAt(0))>>>0;
        return palette[hash%palette.length];
    };
    return {
        syncModels() { if (!disposed && bindModels()) ++colorJob; },
        claimColors() { foreignOwner=null; },
        cancelColors(clear = false) { ++colorJob; if (clear) clearOwned(); },
        resetBase() { ++colorJob; base.clear(); },
        async apply(result,state,isCurrent) {
            const started=performance.now(), job=++colorJob;
            const current=()=>!disposed && isCurrent() && job===colorJob;
            if(!current()) return {paused:true,reason:'superseded'};
            bindModels();
            if(foreignOwner) return {paused:true,owner:foreignOwner,reason:'visual-owned-elsewhere'};
            const hidden=new Set((state.hiddenModelUrns||[]).map(_safeUrn));
            const byModel=new Map(result.matchesByModel.map(g=>[_safeUrn(g.modelUrn),g.matches.map(x=>x.dbId)]));
            const validByModel=new Map([...byModel].map(([urn,ids])=>[urn,new Set(ids)]));
            let displayed=0;
            const visiblePorModelo=new Map();
            owned(()=>{
                for(const model of models()) {
                    if(!current()) return;
                    const urn=_safeUrn(model.getData?.()?.urn);
                    if(hidden.has(urn)) continue; // Sources owns showModel/hideModel.
                    if(result.hasActivePredicates) {
                        if(!base.has(model)) base.set(model,capture(model));
                        const snapshot=base.get(model);
                        const ids=allowedByBase(model,byModel.get(urn)||[],snapshot);
                        visiblePorModelo.set(model,new Set(ids.map(Number)));
                        viewer.impl.visibilityManager.isolate(ids.length?ids:[-1],model);
                        if(!current()) return;
                        if(snapshot.hidden.length) viewer.hide(snapshot.hidden,model);
                        displayed+=ids.length;
                    } else if(base.has(model)) {
                        const snapshot=base.get(model);
                        viewer.isolate(snapshot.isolated,model);
                        if(!current()) return;
                        if(snapshot.hidden.length) viewer.hide(snapshot.hidden,model);
                        base.delete(model);
                    }
                }
                if(current() && result.hasActivePredicates) podarSeleccion(visiblePorModelo);
                if(current()) viewer.impl.invalidate(true,true,true);
            });
            if(!current()) return {paused:true,reason:'superseded'};
            if(foreignOwner) return {paused:true,owner:foreignOwner,reason:'color-owned-elsewhere'};
            const hadOwnedColors=painted.size>0;
            clearOwned(current);
            const active=Object.keys(state.filterColors||{}).filter(p=>state.filterColors[p]).sort();
            const commandsByElement=new Map();
            const links=new Map();
            for(const prop of active) for(const entry of result.facets[prop]?.values||[]) {
                const override=state.customColors?.[prop+'::'+entry.value];
                if(override==='none') continue;
                const hex=override||colorFor(prop+'::'+entry.value);
                if(!/^#[0-9a-f]{6}$/i.test(hex)) continue;
                for(const item of entry.dbIds) {
                    const urn=_safeUrn(item.modelUrn);
                    if(hidden.has(urn)) continue;
                    if(result.hasActivePredicates && !validByModel.get(urn)?.has(Number(item.id))) continue;
                    const model=models().find(m=>_safeUrn(m.getData?.()?.urn)===urn);
                    if(model) commandsByElement.set(JSON.stringify([urn,Number(item.id)]),{model,id:Number(item.id),hex});
                }
            }
            // Multiple enabled properties remain legal; stable property-id order,
            // last color wins for overlap. This does not impose B4 exclusivity.
            const commands=[...commandsByElement.values()];
            for(let i=0;i<commands.length;i+=5000) {
                if(!current()) return {paused:true,reason:'superseded'};
                owned(()=>{
                    for(const {model,id,hex} of commands.slice(i,i+5000)) {
                        if(!current()) break;
                        const rgb=parseInt(hex.slice(1),16);
                        const color=new host.THREE.Vector4(((rgb>>16)&255)/255,((rgb>>8)&255)/255,(rgb&255)/255,0.6);
                        painted.add(model);
                        viewer.setThemingColor(id,color,model,false);
                        if(!links.has(hex)) links.set(hex,new Map());
                        const groups=links.get(hex); if(!groups.has(model)) groups.set(model,[]);
                        groups.get(model).push(id);
                    }
                });
                await yieldFrame();
                if(!current()) return {paused:true,reason:'superseded'};
                viewer.impl.invalidate(true,true,true);
            }
            if(!current()) return {paused:true,reason:'superseded'};
            host.__applyViewerVisualQuality?.();
            const groups=[...links].map(([color,entries])=>({color,
                entries:[...entries].map(([model,dbIds])=>({model,dbIds}))}));
            // Frozen V2 waits for one acknowledgement per enabled property.
            // All acknowledgements describe the actually completed composite job,
            // never an obsolete intermediate job or a fake early completion.
            for(const propId of active.length?active:(hadOwnedColors?[null]:[])) {
                if(!current()) return {paused:true,reason:'superseded'};
                host.dispatchEvent(new CustomEvent('viewer-colors-applied',{detail:{revision:result.revision,propId,groups}}));
            }
            return { visualMs:performance.now()-started,displayed, colorCommands:commands.length,
                owner:'filters',context:result.hasActivePredicates?'isolated/ghost-context':'base-visibility' };
        },
        dispose() {
            disposed=true; ++colorJob;
            // El color propio se retira ANTES de soltar los ganchos. Si no, al
            // desmontar quedaba tinte de Filters sin dueño: este driver ya no
            // existe y el siguiente arranca con `painted` vacio, asi que nada
            // vuelve a poder quitarlo --sobrevive a la revision, al OFF y al
            // remount--. Solo se limpia lo que Filters pinto: si otra
            // herramienta tomo el color, `painted` ya estaba vacio.
            clearOwned();
            for(const name of eventNames) viewer.removeEventListener?.(name,nativeVisibility);
            if(viewer.setThemingColor===setHook) viewer.setThemingColor=originalSet;
            if(viewer.clearThemingColors===clearHook) viewer.clearThemingColors=originalClear;
            for(const [model,{original,hook}] of modelHooks) if(model.setThemingColor===hook) model.setThemingColor=original;
            modelHooks.clear(); base.clear(); painted.clear();
        }
    };
}
