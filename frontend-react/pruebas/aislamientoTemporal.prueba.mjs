// Banco de lib/aislamientoTemporal.js — node frontend-react/pruebas/aislamientoTemporal.prueba.mjs
import { crearAislamientoTemporal, conVisibilidadProgramada, EVENTOS } from '../src/lib/aislamientoTemporal.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const titulo = t => { console.log(''); console.log(t); };

// Visor simulado: modelos con aislados/ocultos y un registro de llamadas que anota si la marca de
// «cambio programado» estaba puesta (lo que necesitan Filters y la sincronización del visor).
function visorFalso(estado) {
    const modelos = Object.keys(estado).map(nombre => ({ nombre }));
    const de = m => estado[m.nombre];
    const llamadas = [];
    const anota = (op, m, ids) => llamadas.push({ op, modelo: m?.nombre ?? '*', ids: ids ? [...ids] : null, silencio: globalThis._filterIsolationInProgress === true });
    const viewer = {
        modelos, llamadas,
        impl: {
            modelQueue: () => ({ getModels: () => modelos }),
            invalidate: () => anota('invalidate'),
            visibilityManager: {
                isolate(ids, m) { anota('vm.isolate', m, ids); de(m).aislados = ids[0] === -1 ? [] : [...ids]; de(m).todoOculto = ids[0] === -1; },
                aggregateIsolate(lista) { anota('aggregateIsolate', null, lista); for (const m of modelos) Object.assign(de(m), { aislados: [], ocultos: [], todoOculto: false }); },
            },
        },
        getIsolatedNodes: m => [...de(m).aislados],
        getHiddenNodes: m => [...de(m).ocultos],
        isolate(ids, m) { anota('isolate', m, ids); Object.assign(de(m), { aislados: [...ids], ocultos: [], todoOculto: false }); },
        hide(ids, m) { anota('hide', m, ids); de(m).ocultos.push(...ids); },
    };
    return viewer;
}
const estadoLimpio = () => ({ A: { aislados: [], ocultos: [] }, B: { aislados: [], ocultos: [] } });

titulo('AISLAR Y VOLVER (lo normal: nada aislado ni oculto antes)');
{
    const est = estadoLimpio();
    const v = visorFalso(est);
    const [A, B] = v.modelos;
    const ais = crearAislamientoTemporal(v);
    ais.aislar(new Map([[A, [1, 2, 3]]]), 'p1');
    ok('aísla las piezas en su modelo y oculta el otro modelo', est.A.aislados.join() === '1,2,3' && est.B.todoOculto === true);
    ok('activo, con su clave', ais.activo() && ais.clave() === 'p1');
    v.llamadas.length = 0;
    ais.restaurar();
    ok('volver = UNA operación para todos los modelos (la del menú «Mostrar todos los objetos»)', v.llamadas.filter(c => c.op !== 'invalidate').map(c => c.op).join() === 'aggregateIsolate');
    ok('todo visible otra vez', !est.A.aislados.length && !est.B.todoOculto);
    ok('ya no está activo; restaurar otra vez no hace nada', !ais.activo() && ais.restaurar() === false);
}

titulo('VOLVER CON FILTROS U OCULTOS PREVIOS (p. ej. Sources)');
{
    const est = { A: { aislados: [7, 8], ocultos: [] }, B: { aislados: [], ocultos: [99] } };
    const v = visorFalso(est);
    const [A] = v.modelos;
    const ais = crearAislamientoTemporal(v);
    ais.aislar(new Map([[A, [1]]]), 'p1');
    ais.restaurar();
    ok('cada modelo vuelve a su aislamiento previo', est.A.aislados.join() === '7,8' && !est.B.aislados.length);
    ok('lo oculto vuelve a quedar oculto', est.B.ocultos.join() === '99');
}

titulo('CAMBIAR DE PARTIDA Y RECORRER «◀ ▶» SIN RESTAURAR ENTRE MEDIAS');
{
    const est = { A: { aislados: [5], ocultos: [] }, B: { aislados: [], ocultos: [] } };
    const v = visorFalso(est);
    const [A, B] = v.modelos;
    const ais = crearAislamientoTemporal(v);
    ais.aislar(new Map([[A, [1]]]), 'p1');
    v.llamadas.length = 0;
    ok('la misma partida otra vez (un paso «▶») no toca la visibilidad', ais.aislar(new Map([[A, [1]]]), 'p1') === false && v.llamadas.length === 0);
    ais.aislar(new Map([[B, [40, 41]]]), 'p2');
    ok('otra partida se aísla directamente, sin restaurar antes', !v.llamadas.some(c => c.op === 'aggregateIsolate' || c.op === 'isolate') && est.B.aislados.join() === '40,41' && est.A.todoOculto);
    ais.restaurar();
    ok('al final vuelve al estado de ANTES de la primera partida (no al de la primera)', est.A.aislados.join() === '5' && !est.B.aislados.length);
}

titulo('UN MODELO QUE YA NO ESTÁ CARGADO');
{
    const est = { A: { aislados: [3], ocultos: [] }, B: { aislados: [], ocultos: [] } };
    const v = visorFalso(est);
    const [A, B] = v.modelos;
    const ais = crearAislamientoTemporal(v);
    ais.aislar(new Map([[A, [1]]]), 'p1');
    v.modelos.splice(1, 1);                 // se descarga B
    let error = null;
    try { ais.restaurar(); } catch (e) { error = e; }
    ok('restaurar no falla y no toca el modelo que falta', !error && !v.llamadas.some(c => c.modelo === 'B' && c.op === 'isolate') && est.A.aislados.join() === '3');
    void B;
}

titulo('SILENCIO: NADIE REACCIONA A UN CAMBIO QUE SE DESHACE');
{
    const est = estadoLimpio();
    const v = visorFalso(est);
    const [A] = v.modelos;
    globalThis._filterIsolationInProgress = false;
    const ais = crearAislamientoTemporal(v);
    ais.aislar(new Map([[A, [1]]]), 'p1');
    ais.restaurar();
    ok('todas las operaciones de visibilidad con la marca puesta', v.llamadas.filter(c => c.op !== 'invalidate').every(c => c.silencio));
    ok('y la marca vuelve a su valor anterior', globalThis._filterIsolationInProgress === false);
    globalThis._filterIsolationInProgress = true;
    conVisibilidadProgramada(() => {});
    ok('anidable: si Filters ya estaba aislando, la marca sigue puesta al salir', globalThis._filterIsolationInProgress === true);
    globalThis._filterIsolationInProgress = false;
    let marcaExtra = false;
    try { conVisibilidadProgramada(() => { throw new Error('x'); }, { extra: () => { marcaExtra = true; return () => { marcaExtra = false; }; } }); } catch { /* esperado */ }
    ok('ante un error, las marcas (la de Filters y la extra) se quitan igual', globalThis._filterIsolationInProgress === false && marcaExtra === false);
}

titulo('SI AISLAR FALLA A MEDIAS, VUELVE A COMO ESTABA');
{
    const est = { A: { aislados: [9], ocultos: [] }, B: { aislados: [], ocultos: [] } };
    const v = visorFalso(est);
    const [A] = v.modelos;
    const original = v.impl.visibilityManager.isolate;
    let n = 0;
    v.impl.visibilityManager.isolate = function (ids, m) { if (++n === 2) throw new Error('fallo del visor'); return original.call(this, ids, m); };
    const ais = crearAislamientoTemporal(v);
    let error = null;
    try { ais.aislar(new Map([[A, [1]]]), 'p1'); } catch (e) { error = e; }
    ok('el error sube', error && error.message === 'fallo del visor');
    ok('y el visor queda como estaba, sin aislamiento a medias', est.A.aislados.join() === '9' && !ais.activo());
}

titulo('EVENTOS CON NOMBRE PROPIO');
ok('nombres fijos y congelados', EVENTOS.MOSTRAR_TODO === 'planilla-mostrar-todo' && EVENTOS.RECORRIDO === 'partida-recorrido' && Object.isFrozen(EVENTOS));

console.log('');
console.log(fallos ? `${fallos} de ${total} FALLAN` : `${total}/${total} en verde`);
process.exit(fallos ? 1 : 0);
