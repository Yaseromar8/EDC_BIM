// Banco de la pantalla de las nubes (docs/archivos/25, fases 2 y 3): node frontend-docs/pruebas/nubesDeLaPantalla.prueba.mjs
//
//   · lo elegido en el lector, una sola máquina de estados (seleccionDelLector.js);
//   · las nubes de cada incidencia, una sola copia para toda la pantalla (datosDeNubes.js);
//   · Escape y el clic fuera, como capas (capas.js);
//   · la leyenda cuenta lo que el servidor dice que se debe.
import { SIN_SELECCION, seleccion, pedidoAlPanel, pedidoALaBarra } from '../src/utils/seleccionDelLector.js';
import { genteDeLasNubes } from '../src/utils/leyendaDeNubes.js';
import { cargarNubes, fijarNubes, recargarNubes, alCambiarNubes, leerDe, nubesGuardadas, _olvidarNubes }
  from '../../design/incidencias/datosDeNubes.js';
import { abrirCapa, _capasAbiertas, _paraProbar } from '../../design/ui/capas.js';

let pass = 0, fail = 0;
// Las pruebas comparten la copia de las nubes y la pila de capas: corren UNA tras otra, en orden.
const pruebas = [];
function test(nombre, fn) { pruebas.push([nombre, fn]); }
function igual(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); }
function cierto(c, m) { if (!c) throw new Error(m || 'falso'); }
const aplicar = (...acciones) => acciones.reduce(seleccion, SIN_SELECCION);

// ── Lo elegido ─────────────────────────────────────────────────────────────────────────────────────────────────
test('elegir una nube de una incidencia abre su panel en ella; otra marca lo cierra', () => {
  const a = aplicar({ tipo: 'elegirMarca', id: 7, incidencia: 55 });
  igual([a.marca, a.panel], [7, { vista: '55', pin: null, nube: 7 }]);
  const b = seleccion(a, { tipo: 'elegirMarca', id: 9 });
  igual([b.marca, b.panel], [9, null]);
});

test('el pin de otra incidencia suelta la nube de la primera (antes quedaban las dos)', () => {
  const a = aplicar({ tipo: 'elegirMarca', id: 7, incidencia: 55 }, { tipo: 'abrirIncidencia', id: 60 });
  igual([a.marca, a.panel.vista, a.panel.nube], [null, '60', null]);
});

test('abrir la incidencia de la nube elegida, en ella, deja su barra', () => {
  const a = aplicar({ tipo: 'elegirMarca', id: 7, incidencia: 55, que: 'comentarios' }, { tipo: 'abrirIncidencia', id: 55, nube: 7 });
  igual([a.marca, a.que, a.panel.nube], [7, 'comentarios', 7]);
});

test('cerrar el panel deja la barra; soltar la barra deja el panel', () => {
  const a = aplicar({ tipo: 'elegirMarca', id: 7, incidencia: 55 }, { tipo: 'cerrarPanel' });
  igual([a.marca, a.panel], [7, null]);
  const b = aplicar({ tipo: 'elegirMarca', id: 7, incidencia: 55 }, { tipo: 'soltarMarca' });
  igual([b.marca, b.panel.vista], [null, '55']);
});

test('la lista y el alta con pin sueltan la marca', () => {
  igual(aplicar({ tipo: 'elegirMarca', id: 3 }, { tipo: 'abrirLista' }).marca, null);
  const pin = { pagina: 1, p: [10, 20] };
  const a = aplicar({ tipo: 'elegirMarca', id: 3 }, { tipo: 'nuevaIncidencia', pin });
  igual([a.marca, a.panel], [null, { vista: 'nueva', pin, nube: null }]);
});

test('otro documento empieza vacío, con lo que pida la dirección («Mi trabajo», «Citado en»)', () => {
  const a = aplicar({ tipo: 'elegirMarca', id: 7, incidencia: 55 }, { tipo: 'documento' });
  igual([a.marca, a.panel], [null, null]);
  const b = aplicar({ tipo: 'documento', incidencia: '55', nube: '7' });
  igual(b.panel, { vista: '55', pin: null, nube: 7 });
  igual(aplicar({ tipo: 'documento', marca: '12' }).marca, 12);
});

test('«Llevar a la vigente»: la marca se elige al llegar a la otra versión, y solo esa vez', () => {
  const a = aplicar({ tipo: 'llevarA', id: 40 }, { tipo: 'documento' });
  igual([a.marca, a.trasCambiar], [40, null]);
  igual(seleccion(a, { tipo: 'documento' }).marca, null);
});

test('cada pedido al panel es nuevo aunque pida lo mismo (el panel lo atiende otra vez)', () => {
  const a = aplicar({ tipo: 'abrirIncidencia', id: 55 });
  const b = seleccion(a, { tipo: 'abrirIncidencia', id: 55 });
  cierto(pedidoAlPanel(b).n > pedidoAlPanel(a).n, 'mismo número');
  igual(pedidoAlPanel(aplicar({ tipo: 'cerrarPanel' })), null);
  igual(pedidoALaBarra(aplicar({ tipo: 'elegirMarca', id: 1, que: 'referencias' })).que, 'referencias');
});

// ── La copia única de las nubes ────────────────────────────────────────────────────────────────────────────────
test('dos que piden a la vez esperan la misma lectura; la segunda lectura no se repite', async () => {
  _olvidarNubes();
  let lecturas = 0;
  const leer = (id) => { lecturas++; return Promise.resolve({ nubes: [{ id: 1, issue: id }] }); };
  const [a, b] = await Promise.all([cargarNubes(leer, 55), cargarNubes(leer, '55')]);
  igual([lecturas, a === b], [1, true]);
  await cargarNubes(leer, 55);
  igual(lecturas, 1);
  await cargarNubes(leer, 55, { fresco: true });
  igual(lecturas, 2);
});

test('un acto (fijarNubes) llega a quien lee esa incidencia y a quien escucha cambios', () => {
  _olvidarNubes();
  const leido = [], cambios = [];
  const dejar = leerDe(55, (d) => leido.push(d.nubes.length));
  alCambiarNubes((id) => cambios.push(id));
  fijarNubes(55, { nubes: [{ id: 1 }, { id: 2 }] });
  fijarNubes(60, { nubes: [] });
  igual([leido, cambios], [[2], ['55', '60']]);
  dejar();
  fijarNubes(55, { nubes: [] });
  igual(leido, [2]);
  igual(nubesGuardadas(55).nubes.length, 0);
});

test('cargar no cuenta como cambio; recargar (cambió la incidencia) sí', async () => {
  _olvidarNubes();
  const cambios = [];
  alCambiarNubes((id) => cambios.push(id));
  await cargarNubes(() => Promise.resolve({ nubes: [] }), 55);
  igual(cambios, []);
  await recargarNubes(() => Promise.resolve({ nubes: [{ id: 3 }] }), 55);
  igual(cambios, ['55']);
});

// ── Capas: Escape y el clic fuera ──────────────────────────────────────────────────────────────────────────────
// Un «elemento» de prueba: sabe si está dentro de otro y si es un campo de texto.
function elemento(nombre, { padre = null, campo = false, modal = false } = {}) {
  const el = {
    nombre, padre,
    contains(otro) { for (let x = otro; x; x = x.padre) if (x === el) return true; return false; },
    closest(sel) {
      for (let x = el; x; x = x.padre) {
        if (/input/.test(sel) && x.campo) return x;
        if (/alertdialog|aria-modal/.test(sel) && x.modal) return x;
      }
      return null;
    },
  };
  el.campo = campo; el.modal = modal;
  return el;
}
const tecla = (target) => { const e = { key: 'Escape', target, prevenido: false, preventDefault() { this.prevenido = true; } }; _paraProbar.alTeclear(e); return e; };
const clic = (target, mover = 0) => { _paraProbar.alPulsar({ clientX: 0, clientY: 0, target }); _paraProbar.alClicar({ clientX: mover, clientY: 0, target }); };

test('Escape cierra solo la capa de arriba, aunque el foco esté en otra pieza', () => {
  const cerradas = [];
  const barra = elemento('barra'), nota = elemento('nota', { padre: barra }), panel = elemento('panel');
  const q1 = abrirCapa({ nivel: 2, contiene: t => barra.contains(t), cerrar: () => cerradas.push('barra') });
  const q2 = abrirCapa({ nivel: 3, contiene: t => nota.contains(t), cerrar: () => cerradas.push('nota'), alPulsarFuera: false });
  tecla(panel);                                    // el foco en el panel (que antes paraba las teclas)
  igual(cerradas, ['nota']);
  q2(); tecla(panel);
  igual(cerradas, ['nota', 'barra']);
  q1();
});

test('en un campo de texto el Escape es del campo, salvo en una capa que dice lo contrario', () => {
  const cerradas = [];
  const barra = elemento('barra'), campoDeLaBarra = elemento('in', { padre: barra, campo: true });
  const comentario = elemento('comentario', { campo: true });
  const q = abrirCapa({ nivel: 2, escapeDesdeCampos: true, contiene: t => barra.contains(t), cerrar: () => cerradas.push('barra') });
  const e = tecla(comentario);
  igual([cerradas, e.prevenido], [[], false]);
  tecla(campoDeLaBarra);
  igual(cerradas, ['barra']);
  q();
});

test('escribir en el panel que la barra cuenta como suyo y pulsar Escape no suelta la barra (es del campo)', () => {
  const cerradas = [];
  const barra = elemento('barra'), panel = elemento('panel'), comentario = elemento('ta', { padre: panel, campo: true });
  const q = abrirCapa({ nivel: 2, escapeDesdeCampos: true, contiene: t => barra.contains(t) || panel.contains(t),
    propios: t => barra.contains(t), cerrar: () => cerradas.push('barra') });
  tecla(comentario);
  igual(cerradas, []);
  tecla(panel);                                   // fuera de un campo, Escape sí la suelta
  igual(cerradas, ['barra']);
  q();
});

test('un clic fuera cierra lo que queda fuera, hasta lo que lo contiene; arrastrar no cuenta', () => {
  const cerradas = [];
  const barra = elemento('barra'), nota = elemento('nota', { padre: barra }), hoja = elemento('hoja');
  const q1 = abrirCapa({ nivel: 2, contiene: t => barra.contains(t), cerrar: () => cerradas.push('barra') });
  const q2 = abrirCapa({ nivel: 3, contiene: t => nota.contains(t), cerrar: () => cerradas.push('nota'), alPulsarFuera: false });
  clic(hoja, 40);                                  // arrastrar la hoja
  igual(cerradas, []);
  clic(barra);                                     // dentro de la barra: no la cierra (la nota no se cierra por fuera)
  igual(cerradas, []);
  clic(hoja);
  igual(cerradas, ['barra']);
  q1(); q2();
});

test('un diálogo encima para el clic fuera; dentro de una confirmación modal nada cuenta como fuera', () => {
  const cerradas = [];
  const hoja = elemento('hoja'), confirmar = elemento('confirmar', { modal: true });
  const q1 = abrirCapa({ nivel: 2, contiene: () => false, cerrar: () => cerradas.push('barra') });
  const q2 = abrirCapa({ nivel: 4, bloquea: true, alPulsarFuera: false, contiene: () => false, cerrar: () => cerradas.push('dialogo') });
  clic(hoja);
  igual(cerradas, []);
  q2();
  clic(confirmar);
  igual(cerradas, []);
  clic(hoja);
  igual(cerradas, ['barra']);
  q1();
  igual(_capasAbiertas().length, 0);
});

test('las propiedades de una capa se leen al usarse (pueden cambiar sin volver a registrarla)', () => {
  let fuera = false;
  const cerradas = [];
  const q = abrirCapa({ nivel: 1, contiene: () => false, cerrar: () => cerradas.push(1), get alPulsarFuera() { return fuera; } });
  clic(elemento('hoja'));
  fuera = true;
  clic(elemento('hoja'));
  igual(cerradas, [1]);
  q();
});

// ── La leyenda ─────────────────────────────────────────────────────────────────────────────────────────────────
test('la leyenda cuenta «por entregar» lo que dice el servidor, una fila por persona y color', () => {
  const nube = (nombre, color, por_entregar) => ({ nube: { destino_nombre: nombre, color, por_entregar } });
  const g = genteDeLasNubes([nube('Mario', 1, true), nube('Mario', 1, false), nube('Luis', 0, false), { nube: null }]);
  igual(g.map(x => [x.nombre, x.nubes, x.deben]), [['Luis', 1, 0], ['Mario', 2, 1]]);
});

for (const [nombre, fn] of pruebas) {
  try { await fn(); pass++; console.log(JSON.stringify({ name: nombre, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name: nombre, status: 'FAIL', error: String(e?.stack || e) })); }
}
console.log(`\n${pass} pasan, ${fail} fallan`);
process.exit(fail ? 1 : 0);
