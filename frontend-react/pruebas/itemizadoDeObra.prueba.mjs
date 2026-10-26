// Banco de lib/itemizadoDeObra.js — node frontend-react/pruebas/itemizadoDeObra.prueba.mjs
import { crearAlmacenDeItemizado, itemizadoDesdeServidor } from '../src/lib/itemizadoDeObra.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const titulo = t => { console.log(''); console.log(t); };

const ITEMS = [
    { item: '06', descripcion: 'DRENAJE URBANO', unidad: '' },
    { item: '06.02.01.03.05', descripcion: 'INSTALACION DE TUBERIA HDPE', unidad: 'm' },
];
// Servidor simulado con las reglas de routes/planilla.py: obra por frente, versiones, una vigente.
function servidor({ admin = true, obraDe = s => s.split('_').slice(0, 2).join('_') } = {}) {
    const filas = [];
    const llamadas = [];
    const pedir = async (metodo, ruta, cuerpo) => {
        llamadas.push({ metodo, ruta, cuerpo });
        const scope = cuerpo?.project ?? decodeURIComponent((ruta.split('project=')[1] || ''));
        const obra = obraDe(scope);
        const vig = filas.find(f => f.obra === obra && f.vigente);
        if (metodo === 'GET') {
            return { ok: true, status: 200, json: { success: true, puede_editar: admin, vigente: vig ? { ...vig } : null,
                versiones: filas.filter(f => f.obra === obra).map(f => ({ version: f.version, vigente: f.vigente })).reverse() } };
        }
        if (!admin) return { ok: false, status: 403, json: { error: 'Solo un administrador de la obra cambia el itemizado.', code: 'NOT_PROJECT_ADMIN' } };
        if (metodo === 'POST') {
            if (!cuerpo.items?.length) return { ok: false, status: 400, json: { error: 'El itemizado no trae ítems.', code: 'ITEMS_VACIOS' } };
            const huella = JSON.stringify(cuerpo.items);
            if (vig && vig.huella === huella) return { ok: true, status: 200, json: { success: true, version: vig.version, sin_cambios: true } };
            if (vig) vig.vigente = false;
            const version = filas.filter(f => f.obra === obra).length + 1;
            filas.push({ obra, version, vigente: true, huella, items: cuerpo.items, archivo: cuerpo.archivo, hoja: cuerpo.hoja, columnas: cuerpo.columnas, creado_por: 'Ana' });
            return { ok: true, status: 201, json: { success: true, version, sin_cambios: false } };
        }
        if (metodo === 'DELETE') {
            if (vig) vig.vigente = false;
            return { ok: true, status: 200, json: { success: true, retirada: vig ? vig.version : null } };
        }
        throw new Error(metodo);
    };
    return { pedir, filas, llamadas };
}
const leido = { items: ITEMS, hoja: 'CAOV', columnas: { item: 1, descripcion: 4, unidad: 5 }, archivo: 'Presupuesto_Rv00.xlsx' };

titulo('DE LO QUE DEVUELVE EL SERVIDOR A LO QUE USA LA PLANILLA');
{
    const it = itemizadoDesdeServidor({ version: 3, archivo: 'P.xlsx', hoja: 'CAOV', columnas: { item: 1, descripcion: 4, unidad: 5 }, items: ITEMS, creado_por: 'Ana' });
    ok('trae el índice para ubicar códigos', it.indice.ubicar('06.02.01.03.05').tipo === 'exacto');
    ok('y explica de dónde salió, con las columnas del Excel', /Hoja «CAOV»: ítem en la columna B/.test(it.porque) && it.version === 3 && it.creadoPor === 'Ana');
    ok('sin vigente → null', itemizadoDesdeServidor(null) === null && itemizadoDesdeServidor({ items: [] }) === null);
}

titulo('CARGAR, GUARDAR, QUITAR');
{
    const s = servidor();
    const a = crearAlmacenDeItemizado({ pedir: s.pedir });
    const vistos = [];
    a.suscribir(e => vistos.push(e));
    await a.cargar('PQT8_TALARA_CANAL');
    ok('una obra sin itemizado: vigente null, puede editar', a.estado().vigente === null && a.estado().puedeEditar && !a.estado().cargando);
    ok('avisa al empezar y al terminar de cargar', vistos.some(e => e.cargando) && !vistos.at(-1).cargando);
    const r = await a.guardar(leido);
    ok('guardar crea la versión 1 y vuelve a pedir lo guardado', r.ok && r.version === 1 && a.estado().vigente.version === 1 && s.llamadas.at(-1).metodo === 'GET');
    ok('manda la obra del frente abierto y el origen', s.llamadas.find(l => l.metodo === 'POST').cuerpo.project === 'PQT8_TALARA_CANAL' && s.llamadas.find(l => l.metodo === 'POST').cuerpo.hoja === 'CAOV');
    const r2 = await a.guardar(leido);
    ok('la misma lista: sin cambios, sigue la 1', r2.ok && r2.sinCambios && a.estado().vigente.version === 1);
    await a.cargar('PQT8_TALARA_DRENAJE');
    ok('otro frente de la misma obra ve el mismo itemizado', a.estado().vigente?.version === 1);
    const q = await a.quitar();
    ok('quitar deja la obra sin vigente', q.ok && q.retirada === 1 && a.estado().vigente === null);
    ok('los estados avisados son nuevos objetos (no se mutan)', vistos.length > 3 && new Set(vistos).size === vistos.length && Object.isFrozen(vistos[0]));
}

titulo('PERMISOS Y ERRORES');
{
    const s = servidor({ admin: false });
    const a = crearAlmacenDeItemizado({ pedir: s.pedir });
    await a.cargar('PQT8_TALARA_CANAL');
    ok('quien no administra: puede leer, no editar', a.estado().puedeEditar === false);
    const r = await a.guardar(leido);
    ok('guardar sin permiso: el error del servidor, tal cual', !r.ok && r.code === 'NOT_PROJECT_ADMIN' && /administrador/.test(a.estado().error));
    const caido = crearAlmacenDeItemizado({ pedir: async () => { throw new Error('sin red'); } });
    await caido.cargar('PQT8_TALARA_CANAL');
    ok('sin red: error dicho, nada inventado', /sin red/.test(caido.estado().error) && caido.estado().vigente === null);
    // Sin la migración la Planilla NO deja de funcionar: modo navegador, como antes del guardado.
    const llamadas = [];
    const sinMigracion = crearAlmacenDeItemizado({ pedir: async (metodo) => { llamadas.push(metodo); return { ok: false, status: 503, json: { error: 'Falta la migración 40 (planilla_itemizados) en esta base.', code: 'MIGRATION_MISSING' } }; } });
    await sinMigracion.cargar('PQT8_TALARA_CANAL');
    const e0 = sinMigracion.estado();
    ok('sin la migración: modo navegador, sin error, con aviso que lo dice', e0.modo === 'navegador' && !e0.error && /migración 40/.test(e0.aviso) && e0.puedeEditar);
    const g = await sinMigracion.guardar(leido);
    ok('…y cargar el Excel funciona en el navegador, sin pedir al servidor', g.ok && g.local && sinMigracion.estado().vigente?.local && sinMigracion.estado().vigente.indice.ubicar('06.02.01.03.05').tipo === 'exacto' && !llamadas.includes('POST'));
    ok('…con una huella para que los campos derivados sepan si cambió', /^local-/.test(sinMigracion.estado().vigente.huella));
    await sinMigracion.cargar('PQT8_TALARA_CANAL');
    ok('…volver a pedir la misma obra conserva lo cargado', sinMigracion.estado().vigente?.local === true);
    await sinMigracion.cargar('OTRA_OBRA_X');
    ok('…otra obra empieza sin itemizado', sinMigracion.estado().vigente === null);
    await sinMigracion.cargar('PQT8_TALARA_CANAL');
    await sinMigracion.guardar(leido);
    ok('…y quitar lo deja sin itemizado', (await sinMigracion.quitar()).ok && sinMigracion.estado().vigente === null && !llamadas.includes('DELETE'));
    // Un backend anterior (sin la ruta): 404 → también modo navegador.
    const antiguo = crearAlmacenDeItemizado({ pedir: async () => ({ ok: false, status: 404, json: {} }) });
    await antiguo.cargar('PQT8_TALARA_CANAL');
    ok('backend sin la ruta (404): modo navegador', antiguo.estado().modo === 'navegador' && /aún no guarda/.test(antiguo.estado().aviso));
    // La tabla se pierde entre el GET y el POST: se queda en el navegador, no falla.
    let fase = 0;
    const aMedias = crearAlmacenDeItemizado({ pedir: async (metodo) => (metodo === 'GET' && fase++ === 0
        ? { ok: true, json: { vigente: null, versiones: [], puede_editar: true } }
        : { ok: false, status: 503, json: { code: 'MIGRATION_MISSING' } }) });
    await aMedias.cargar('PQT8_TALARA_CANAL');
    const g2 = await aMedias.guardar(leido);
    ok('si el guardado responde «falta la migración», queda en el navegador', g2.ok && g2.local && aMedias.estado().modo === 'navegador' && aMedias.estado().vigente?.local);
    const limpio = servidor();
    const vacio = crearAlmacenDeItemizado({ pedir: limpio.pedir });
    ok('sin obra abierta no se guarda nada', !(await vacio.guardar(leido)).ok && limpio.llamadas.length === 0);
    await vacio.cargar('global');
    ok('«global» no es una obra: no se pide nada', vacio.estado().scope === 'global' && vacio.estado().vigente === null);
}

titulo('UNA RESPUESTA QUE LLEGA TARDE NO PISA LA OBRA NUEVA');
{
    let soltar;
    const lento = { ok: true, json: { vigente: { version: 9, items: ITEMS }, versiones: [], puede_editar: true } };
    const pedir = (metodo, ruta) => ruta.includes('OBRA_VIEJA') ? new Promise(res => { soltar = () => res(lento); })
        : Promise.resolve({ ok: true, json: { vigente: null, versiones: [], puede_editar: true } });
    const a = crearAlmacenDeItemizado({ pedir });
    const viejo = a.cargar('OBRA_VIEJA_X');
    await a.cargar('OBRA_NUEVA_X');
    soltar();
    await viejo;
    ok('se queda con la obra nueva', a.estado().scope === 'OBRA_NUEVA_X' && a.estado().vigente === null);
}

console.log('');
console.log(fallos ? `${fallos} de ${total} FALLAN` : `${total}/${total} en verde`);
process.exit(fallos ? 1 : 0);
