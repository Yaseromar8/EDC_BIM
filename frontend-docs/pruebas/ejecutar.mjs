/**
 * Ejecutor de las pruebas de `frontend-docs`.
 *
 * Descubre por si mismo cualquier `*.prueba.mjs` de esta carpeta: anadir una
 * prueba manana no obliga a tocar `package.json`.
 *
 * Cada banco corre en su PROPIO proceso a proposito. Fijan cosas globales
 * -- temporizadores, el almacen simulado -- y compartir proceso los haria
 * depender del orden, que es la forma mas tonta de tener una suite que miente.
 *
 *     npm test
 */
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const aqui = dirname(fileURLToPath(import.meta.url));
const bancos = readdirSync(aqui).filter(f => f.endsWith('.prueba.mjs')).sort();

if (!bancos.length) {
    console.error('No hay ningun *.prueba.mjs en pruebas/.');
    process.exit(1);
}

const fallaron = [];
for (const banco of bancos) {
    console.log(`\n── ${banco} ${'─'.repeat(Math.max(0, 60 - banco.length))}`);
    const r = spawnSync(process.execPath, [join(aqui, banco)], { stdio: 'inherit' });
    if (r.status !== 0) fallaron.push(banco);
}

console.log('');
if (fallaron.length) {
    console.error(`FALLAN ${fallaron.length} de ${bancos.length}: ${fallaron.join(', ')}`);
    process.exit(1);
}
console.log(`OK · ${bancos.length} bancos, todos en verde.`);
