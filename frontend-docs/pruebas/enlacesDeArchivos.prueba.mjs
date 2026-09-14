// Banco de los ENLACES DE ARCHIVOS (14-sep-2026): obra, carpeta y documento en la dirección.
//
// Lo que fija:
//   · el enlace se lee y se escribe con identificadores sin perder el resto de la URL, y
//     una dirección con `revision` sigue siendo de Revisiones;
//   · «Copiar enlace» da el documento vigente con su carpeta, no una versión congelada;
//   · la ruta del explorador sale de la cadena que devuelve el servidor;
//   · Atrás y Adelante: cuándo la app cambia de obra, de lista o de portada, y cuándo el
//     explorador vuelve a la vista de carpetas;
//   · la app, el explorador, el lector y el menú usan lo anterior (forma del código);
//   · el aviso neutro es la misma frase que da el servidor.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  leerEnlaceDeArchivos, conArchivos, sinCarpetaNiDocumento, enlaceDeArchivos, mismoEnlace,
  rutaDeLaCadena, estadoDeArchivos, pideLaVistaDeCarpetas, destinoDeArchivosTrasNavegar,
  esIdentificador, ENLACE_NO_DISPONIBLE, CLAVE_DEL_ENLACE_DE_ARCHIVOS,
} from '../src/utils/enlacesDeArchivos.js';
import { leerEnlace, conRevision, CLAVE_DEL_ENLACE_PENDIENTE } from '../src/utils/revisiones.js';

let pass = 0, fail = 0;
async function test(name, fn) {
  try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const aqui = dirname(fileURLToPath(import.meta.url));
const fuente = (ruta) => readFileSync(join(aqui, '..', 'src', ruta), 'utf8');

const OBRA = 'b.proj_x1';
const C = '3f1c2a4e-9b7d-4c1e-8f2a-1234567890ab';
const D = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const V = 'ffffffff-1111-4222-8333-444444444444';

await test('se leen obra, carpeta, documento y version', () => {
  assert.deepEqual(leerEnlaceDeArchivos(`?obra=${OBRA}&carpeta=${C}&documento=${D}&version=${V}`),
                   { obra: OBRA, carpeta: C, documento: D, version: V });
  assert.deepEqual(leerEnlaceDeArchivos(`?obra=${OBRA}`),
                   { obra: OBRA, carpeta: null, documento: null, version: null });
});

await test('sin obra no hay enlace, y sin documento no hay version', () => {
  assert.equal(leerEnlaceDeArchivos(''), null);
  assert.equal(leerEnlaceDeArchivos(`?carpeta=${C}&documento=${D}`), null);
  assert.equal(leerEnlaceDeArchivos(`?obra=${OBRA}&carpeta=${C}&version=${V}`).version, null);
});

await test('una direccion con revision sigue siendo de Revisiones, igual que antes', () => {
  const s = `?obra=${OBRA}&revision=5`;
  assert.equal(leerEnlaceDeArchivos(s), null);
  assert.deepEqual(leerEnlace(s), { obra: OBRA, revision: 5 });
  assert.equal(conRevision(s, null, null), '');
});

await test('el enlace se escribe sin perder el resto de la URL y quita la revision', () => {
  assert.equal(conArchivos('?hub=1', { obra: OBRA, carpeta: C }), `?hub=1&obra=${OBRA}&carpeta=${C}`);
  assert.equal(conArchivos(`?obra=${OBRA}&revision=5`, { obra: OBRA }), `?obra=${OBRA}`);
  assert.equal(conArchivos(`?obra=${OBRA}&carpeta=${C}&documento=${D}&version=${V}`, { obra: OBRA, carpeta: C }),
               `?obra=${OBRA}&carpeta=${C}`);
  assert.equal(conArchivos(`?obra=${OBRA}&carpeta=${C}&documento=${D}`, null), '');
  assert.equal(conArchivos('', { obra: OBRA, version: V }), `?obra=${OBRA}`);
  const ida = { obra: OBRA, carpeta: C, documento: D, version: V };
  assert.deepEqual(leerEnlaceDeArchivos(conArchivos('', ida)), ida);
});

await test('fuera de Carpetas se quedan la obra y la revision', () => {
  assert.equal(sinCarpetaNiDocumento(`?obra=${OBRA}&carpeta=${C}&documento=${D}&version=${V}`), `?obra=${OBRA}`);
  assert.equal(sinCarpetaNiDocumento(`?obra=${OBRA}&revision=5`), `?obra=${OBRA}&revision=5`);
});

await test('Copiar enlace da el documento vigente con su carpeta', () => {
  const url = enlaceDeArchivos('https://alephia.com.pe', { obra: OBRA, carpeta: C, documento: D });
  assert.equal(url, `https://alephia.com.pe/?obra=${OBRA}&carpeta=${C}&documento=${D}`);
  assert.ok(!url.includes('version='));
  assert.equal(enlaceDeArchivos('https://x', { obra: OBRA }), `https://x/?obra=${OBRA}`);
});

await test('solo identificadores: un nombre o un id provisional no son enlace', () => {
  assert.ok(esIdentificador(C) && esIdentificador(D.toUpperCase()));
  for (const malo of ['', null, undefined, 'Planos', '02_SHA/Planos', 'temp_1726300000', '12345']) {
    assert.equal(esIdentificador(malo), false, String(malo));
  }
});

await test('la ruta del explorador sale de la cadena del servidor', () => {
  assert.equal(rutaDeLaCadena('obra-x', []), 'obra-x/');
  assert.equal(rutaDeLaCadena('obra-x', [{ id: 'a', name: '01_WIP' }, { id: 'b', name: 'Planos' }]),
               'obra-x/01_WIP/Planos/');
});

await test('dos enlaces son el mismo si coinciden las cuatro partes', () => {
  assert.ok(mismoEnlace({ obra: OBRA, carpeta: C }, { obra: OBRA, carpeta: C, documento: null }));
  assert.ok(!mismoEnlace({ obra: OBRA, carpeta: C }, { obra: OBRA, carpeta: C, documento: D }));
  assert.ok(mismoEnlace(null, null) && !mismoEnlace(null, { obra: OBRA }));
});

await test('la entrada del historial lleva el enlace y si el paso lo dio abrir aqui', () => {
  assert.deepEqual(estadoDeArchivos({ obra: OBRA, carpeta: C }, { abiertoAqui: true }),
                   { alephia: 'archivos', obra: OBRA, carpeta: C, documento: null, version: null, abiertoAqui: true });
});

await test('Atras y Adelante vuelven a Carpetas solo con carpeta o documento de esta obra', () => {
  assert.equal(pideLaVistaDeCarpetas({ obra: OBRA, carpeta: C }, OBRA), true);
  assert.equal(pideLaVistaDeCarpetas({ obra: OBRA, documento: D }, OBRA), true);
  assert.equal(pideLaVistaDeCarpetas({ obra: OBRA }, OBRA), false);
  assert.equal(pideLaVistaDeCarpetas({ obra: 'otra', carpeta: C }, OBRA), false);
});

await test('Atras y Adelante en la app: otra obra, la lista y la portada', () => {
  const dentro = { enDocumentos: true, obraActual: OBRA };
  assert.deepEqual(destinoDeArchivosTrasNavegar(`?obra=${OBRA}&carpeta=${C}`, null, dentro), { tipo: 'nada' });
  assert.equal(destinoDeArchivosTrasNavegar(`?obra=otra&carpeta=${C}`, null, dentro).tipo, 'enlace');
  assert.equal(destinoDeArchivosTrasNavegar(`?obra=${OBRA}`, null, { enDocumentos: false }).tipo, 'enlace');
  assert.deepEqual(destinoDeArchivosTrasNavegar('', { alephia: 'lista' }, dentro), { tipo: 'lista' });
  assert.deepEqual(destinoDeArchivosTrasNavegar('', { alephia: 'hub' }, dentro), { tipo: 'hub' });
  // Una dirección vacía SIN marca la escribe también Revisiones al cerrar un detalle.
  assert.deepEqual(destinoDeArchivosTrasNavegar('', null, dentro), { tipo: 'nada' });
  assert.deepEqual(destinoDeArchivosTrasNavegar(`?obra=${OBRA}&revision=5`, { alephia: 'lista' }, dentro),
                   { tipo: 'nada' });
});

await test('el aviso neutro es la misma frase que el servidor', () => {
  const servidor = readFileSync(join(aqui, '..', '..', 'backend', 'enlaces_de_archivos.py'), 'utf8');
  const frase = servidor.match(/MENSAJE_NO_DISPONIBLE = '([^']+)'/);
  assert.ok(frase, 'no se encuentra MENSAJE_NO_DISPONIBLE en el backend');
  assert.equal(ENLACE_NO_DISPONIBLE, frase[1]);
});

await test('la app guarda el enlace durante el login y sigue Atras y Adelante entre obras', () => {
  assert.notEqual(CLAVE_DEL_ENLACE_DE_ARCHIVOS, CLAVE_DEL_ENLACE_PENDIENTE);
  const app = fuente('App_Refactor.jsx');
  assert.ok(app.includes('sessionStorage.setItem(CLAVE_DEL_ENLACE_DE_ARCHIVOS'), 'no se guarda el enlace durante el login');
  assert.ok(app.includes("window.addEventListener('popstate', alNavegarEntreObras)"), 'no sigue Atrás y Adelante entre obras');
  assert.ok(app.includes('onSelectProject={elegirObra}'), 'elegir obra no escribe la dirección');
  assert.ok(app.includes("onBack={() => salirDeLaObra('lista')}"), 'salir de la obra no escribe la dirección');
});

await test('el explorador escribe, valida y restaura la direccion', () => {
  const ex = fuente('hooks/useFileExplorer.js');
  assert.ok(ex.includes("window.addEventListener('popstate', alNavegarEnArchivos)"), 'no sigue Atrás y Adelante');
  assert.ok(ex.includes('window.history.pushState(estado'), 'no añade pasos');
  assert.ok(ex.includes('window.history.replaceState(estado'), 'no corrige sin pasos');
  assert.ok(ex.includes('/api/docs/ubicacion?'), 'no valida el enlace en el servidor');
  // Lo que exigen las pruebas de E1.2 sigue ahí.
  assert.ok(ex.includes("window.addEventListener('popstate', alNavegar)"));
  assert.ok(ex.includes('destinoTrasNavegar(window.location.search'));
});

await test('el lector y el menu usan el enlace', () => {
  const pagina = fuente('pages/FilesPage.jsx');
  assert.ok(pagina.includes('fe.anotarDocumento(f)'), 'abrir un documento no añade su paso');
  assert.ok(pagina.includes('onClose={fe.cerrarDocumento}'), 'cerrar no vuelve a la dirección de la carpeta');
  assert.ok(pagina.includes('setViewedVersionInfo={fe.verVersion}'), 'la versión elegida no va a la dirección');
  assert.ok(pagina.includes('onCopiarEnlace={fe.copiarEnlace}'), 'el menú no recibe «Copiar enlace»');
  const menu = fuente('components/ContextMenu.jsx');
  assert.ok(menu.includes('Copiar enlace') && menu.includes('onCopiarEnlace(item)'), 'falta «Copiar enlace»');
});

console.log(JSON.stringify({ banco: 'enlacesDeArchivos', pass, fail }));
if (fail) process.exit(1);
