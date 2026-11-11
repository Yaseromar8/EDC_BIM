// Banco: la identidad de inventario de un modelo de ALEPHIA Docs — node frontend-react/pruebas/identidadDeDocs.prueba.mjs
//
// docs/archivos/29, F4. El servidor (B1) y las vistas guardadas ya aceptaban el linaje de Docs; el inventario del
// visor no: sus filas salían «sin identidad verificable», no se podían editar y su clave no era la del servidor.
import { inventoryIdentity, inventoryRowKey, requireInventoryIdentity, inventoryEditPayload, withInventoryIdentity } from '../src/lib/inventoryIdentity.js';
import { esLinaje } from '../src/lib/savedViewV2.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const lanza = f => { try { f(); return false; } catch { return true; } };

const DOCS = 'urn:alephia:docs.lineage:11111111-2222-4333-8444-555566667777';
const ACC = 'urn:adsk.wipprod:dm.lineage:ub2xfjDiRByamkMzvCD7zg';
const fila = (linaje, mas = {}) => ({ scope_id: '1_DRENAJE', source_lineage: linaje, external_id: 'ext-1', dbId: 'ext-1',
    source_urn: 'dXJuOmFkc2s', element_key: JSON.stringify(['1_DRENAJE', linaje, 'ext-1']), Status: '', ...mas });

console.log('');
console.log('IDENTIDAD DE UN MODELO DE DOCS');
const identidad = inventoryIdentity(fila(DOCS));
ok('una fila de un modelo de Docs tiene identidad', !!identidad && identidad.source_lineage === DOCS && identidad.external_id === 'ext-1');
ok('su clave es la del servidor: [frente, linaje, externalId]', inventoryRowKey(fila(DOCS)) === JSON.stringify(['1_DRENAJE', DOCS, 'ext-1']));
ok('se puede editar', !lanza(() => requireInventoryIdentity(fila(DOCS)))
    && inventoryEditPayload(fila(DOCS), 'Status', 'Ejecutado').identity.source_lineage === DOCS);
ok('la de ACC sigue igual', inventoryRowKey(fila(ACC)) === JSON.stringify(['1_DRENAJE', ACC, 'ext-1']));
ok('si la clave que manda el servidor no cuadra, no hay identidad', inventoryIdentity(fila(DOCS, { element_key: '["otro","x","y"]' })) === null);
const normalizada = withInventoryIdentity({ scope_id: '1_DRENAJE', source_lineage: DOCS, external_id: 'ext-9', source_urn: 'u', model_urn: 'u', element_key: null }, { Name: 'x' });
ok('al normalizar se le pone su clave', normalizada.element_key === JSON.stringify(['1_DRENAJE', DOCS, 'ext-9']));

console.log('');
console.log('LO QUE SIGUE SIN SER UN LINAJE');
for (const [nombre, valor] of [
    ['un id de documento sin el prefijo', '11111111-2222-4333-8444-555566667777'],
    ['el id en mayúsculas', 'urn:alephia:docs.lineage:11111111-2222-4333-8444-55556666777A'.toUpperCase()],
    ['un id que no es un UUID', 'urn:alephia:docs.lineage:123'],
    ['otro esquema de alephia', 'urn:alephia:otra.cosa:11111111-2222-4333-8444-555566667777'],
    ['una versión de ACC', 'urn:adsk.wipprod:fs.file:vf.abc?version=3'],
    ['con espacios alrededor', ' ' + DOCS + ' '],
    ['una versión de Docs (el objeto, no el documento)', 'urn:adsk.objects:os.object:bucket/docs-11111111-2222-4333-8444-555566667777.rvt'],
]) {
    ok(`${nombre}: sin identidad, fila de solo lectura`, inventoryIdentity(fila(valor, { element_key: null })) === null
        && inventoryRowKey(fila(valor, { element_key: null })).startsWith('["legacy-readonly"') && lanza(() => requireInventoryIdentity(fila(valor, { element_key: null }))));
}

console.log('');
console.log('LA MISMA REGLA QUE LAS VISTAS GUARDADAS');
for (const valor of [DOCS, ACC, 'urn:adsk.wipemea:dm.lineage:A_b-9', 'urn:alephia:docs.lineage:123', 'urn:adsk.wipprod:fs.file:vf.abc?version=3', 'x']) {
    ok(`inventario y vistas coinciden sobre «${valor.slice(0, 44)}»`, (inventoryIdentity(fila(valor, { element_key: null })) !== null) === esLinaje(valor));
}

console.log('');
console.log(fallos ? `${fallos} de ${total} FALLAN` : `${total}/${total} en verde`);
process.exit(fallos ? 1 : 0);
