// Banco de «Comparar versiones» (3-nov-2026): node frontend-docs/pruebas/compararVersiones.prueba.mjs
// Hojas sintéticas en tinta (0 papel, 255 negro): lo que se mueve medio píxel no es un cambio; lo que aparece o
// desaparece, sí; y las zonas salen en el orden en que se lee una lámina.
import {
  tintaDe, dilatar, componer, detectarCambios, tipoDeCambio, lugarEnLaHoja, nubeDeCaja, encuadrar, zoomEn,
  cambiosDeTexto, juntarConTexto, textoDelCambio, detectarAfinando,
  COLOR_QUITADO, COLOR_ANADIDO,
} from '../src/utils/compararVersiones.js';

let pass = 0, fail = 0;
function test(nombre, fn) {
  try { fn(); pass++; console.log(JSON.stringify({ name: nombre, status: 'PASS' })); }
  catch (e) { fail++; console.log(JSON.stringify({ name: nombre, status: 'FAIL', error: String(e) })); }
}
function igual(a, b) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); }
function cierto(v, msg) { if (!v) throw new Error(msg || 'falso'); }

const W = 300, H = 200;
const hoja = () => new Uint8Array(W * H);
function rect(t, x, y, w, h, v = 255) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) t[j * W + i] = v; }
function comparar(a, b, extra = {}) {
  const salida = new Uint8ClampedArray(W * H * 4);
  const cambios = componer({ a, b, dilA: dilatar(a, W, H, 1), dilB: dilatar(b, W, H, 1), w: W, h: H, salida, ...extra });
  return { salida, cambios, zonas: detectarCambios(cambios, W, H) };
}
const px = (salida, x, y) => Array.from(salida.slice((y * W + x) * 4, (y * W + x) * 4 + 3));

test('la tinta es 255 menos la luminancia, y lo transparente es papel', () => {
  igual(Array.from(tintaDe(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 0]))), [0, 255, 0]);
});

test('dos hojas iguales: ningún cambio, y lo común en gris atenuado', () => {
  const a = hoja(); rect(a, 20, 20, 100, 3); rect(a, 200, 100, 3, 60);
  const { zonas, salida } = comparar(a, a.slice());
  igual(zonas.length, 0);
  const [r] = px(salida, 50, 21);
  igual(r, 161);                                             // 255 + (20 − 255) × 0,4: Dark al 40 % sobre blanco
});

test('una línea movida un píxel NO es un cambio (tolerancia)', () => {
  const a = hoja(); rect(a, 20, 50, 200, 2);
  const b = hoja(); rect(b, 20, 51, 200, 2);
  igual(comparar(a, b).zonas.length, 0);
});

test('lo que aparece es azul y lo que desaparece rojo; cada uno es una zona con su tipo', () => {
  const a = hoja(); rect(a, 20, 20, 60, 30);                 // solo en la anterior
  const b = hoja(); rect(b, 200, 140, 50, 40);               // solo en la nueva
  const { salida, zonas } = comparar(a, b);
  igual(px(salida, 40, 30), COLOR_QUITADO);
  igual(px(salida, 220, 160), COLOR_ANADIDO);
  igual(zonas.map(z => [z.n, z.tipo]), [[1, 'quitado'], [2, 'añadido']]);
  cierto(zonas[0].x <= 20 && zonas[0].x2 >= 80, 'la caja abarca el cambio');
  igual(zonas[0].lugar, 'arriba a la izquierda');
  igual(zonas[1].lugar, 'abajo a la derecha');
});

test('una cota que cambia de valor (quita y pone en el mismo sitio) es UNA zona «modificado»', () => {
  const a = hoja(); rect(a, 100, 90, 20, 12);
  const b = hoja(); rect(b, 124, 90, 20, 12);
  const { zonas } = comparar(a, b);
  igual(zonas.length, 1);
  igual(zonas[0].tipo, 'modificado');
});

test('alinear: con el desplazamiento correcto, la hoja corrida deja de tener cambios', () => {
  const a = hoja(); rect(a, 30, 30, 120, 3); rect(a, 30, 30, 3, 120);
  const b = hoja(); rect(b, 45, 38, 120, 3); rect(b, 45, 38, 3, 120);
  cierto(comparar(a, b).zonas.length > 0, 'sin alinear hay cambios');
  igual(comparar(a, b, { dx: 15, dy: 8 }).zonas.length, 0);
});

test('apagar los colores o una versión dibuja en Dark lo que queda', () => {
  const a = hoja(); rect(a, 20, 20, 60, 30);
  const b = hoja(); rect(b, 200, 140, 50, 40);
  igual(px(comparar(a, b, { colores: false }).salida, 40, 30), [20, 20, 19]);
  const soloB = comparar(a, b, { verA: false }).salida;
  igual(px(soloB, 40, 30), [255, 255, 255]);
  igual(px(soloB, 220, 160), [20, 20, 19]);
});

test('las zonas se ordenan por bandas de arriba abajo y de izquierda a derecha', () => {
  const a = hoja();
  const b = hoja(); rect(b, 250, 10, 20, 15); rect(b, 10, 12, 20, 15); rect(b, 120, 170, 20, 15);
  igual(comparar(a, b).zonas.map(z => z.lugar), ['arriba a la izquierda', 'arriba a la derecha', 'abajo, al centro']);
});

test('motas sueltas (ruido) no hacen zona', () => {
  const a = hoja();
  const b = hoja(); rect(b, 50, 50, 2, 2); rect(b, 200, 120, 3, 2);
  igual(comparar(a, b).zonas.length, 0);
});

test('tipo y lugar', () => {
  igual(tipoDeCambio({ quitados: 0, anadidos: 0 }), 'modificado');
  igual(tipoDeCambio({ quitados: 1, anadidos: 99 }), 'añadido');
  igual(lugarEnLaHoja({ x: 140, y: 90, x2: 160, y2: 110 }, W, H), 'al centro');
});

test('la nube cierra y lleva festones en los cuatro lados', () => {
  const d = nubeDeCaja(10, 10, 100, 50, 10);
  cierto(d.startsWith('M10.0 10.0') && d.endsWith('Z'));
  igual((d.match(/A/g) || []).length, 5 + 3 + 5 + 3);
});

test('encuadrar centra la caja y zoomEn deja quieto el punto del cursor', () => {
  const v = encuadrar({ x: 100, y: 100, w: 50, h: 50 }, 400, 400, { aire: 0, maximo: 10 });
  igual(v, { s: 8, x: 400 / 2 - 125 * 8, y: 400 / 2 - 125 * 8 });
  const z = zoomEn({ s: 1, x: 0, y: 0 }, 100, 50, 2);
  igual([(100 - z.x) / z.s, (50 - z.y) / z.s], [100, 50]);
});

test('texto: una cota que cambia de valor es «modificado» con antes → después; lo igual no cuenta', () => {
  const A = [{ s: 'L = 21.35 m', x: 100, y: 100, w: 60, h: 12 }, { s: 'PLANTA', x: 10, y: 10, w: 40, h: 12 },
             { s: 'N.T.', x: 200, y: 150, w: 20, h: 10 }];
  const B = [{ s: 'L = 24.60 m', x: 101, y: 100, w: 60, h: 12 }, { s: 'PLANTA', x: 12, y: 11, w: 40, h: 12 },
             { s: 'CAMARA CR-05', x: 250, y: 20, w: 50, h: 10 }];
  const t = cambiosDeTexto(A, B);
  igual(t.map(c => [c.tipo, textoDelCambio(c)]), [['modificado', 'L = 21.35 m → L = 24.60 m'], ['quitado', '− N.T.'],
    ['añadido', '+ CAMARA CR-05']]);
});

test('texto: el mismo texto movido más que la tolerancia es quitado + añadido… salvo que quede junto (modificado)', () => {
  const lejos = cambiosDeTexto([{ s: 'A-1', x: 0, y: 0, w: 20, h: 10 }], [{ s: 'A-1', x: 150, y: 100, w: 20, h: 10 }]);
  igual(lejos.map(c => c.tipo), ['quitado', 'añadido']);
});

test('juntar: el texto dentro de una zona se le apunta y la vuelve «modificado»; el suelto es zona propia', () => {
  const zonas = [{ x: 90, y: 90, x2: 170, y2: 120, pixeles: 50, quitados: 0, anadidos: 50, tipo: 'añadido' }];
  const textos = [{ x: 100, y: 100, x2: 160, y2: 112, tipo: 'modificado', antes: '21.35', despues: '24.60' },
                  { x: 250, y: 20, x2: 290, y2: 30, tipo: 'añadido', antes: null, despues: 'CR-05' }];
  const j = juntarConTexto(zonas, textos, W, H);
  igual(j.map(z => [z.n, z.tipo, z.textos.length]), [[1, 'añadido', 1], [2, 'modificado', 1]]);
});

test('afinar: un trazo que se corre un píxel (como un dígito que cambia) solo lo ve la pasada fina, y sale «modificado»', () => {
  // Una hoja con tinta como un plano (el resto, igual en las dos) y un trazo que se corre 1 px: como un 1 que pasa a 4.
  const a = hoja(); rect(a, 150, 60, 140, 120); rect(a, 100, 60, 2, 60);
  const b = hoja(); rect(b, 150, 60, 140, 120); rect(b, 101, 60, 2, 60);
  const salida = new Uint8ClampedArray(W * H * 4);
  const mapa = componer({ a, b, dilA: dilatar(a, W, H, 1), dilB: dilatar(b, W, H, 1), w: W, h: H, salida });
  igual(detectarCambios(mapa, W, H).length, 0);
  const r = detectarAfinando({ mapa, a, b, w: W, h: H });
  igual([r.afinado, r.zonas.map(z => [z.tipo, z.fina])], [true, [['modificado', true]]]);
});

test('afinar: con la hoja corrida (fuera de registro) la pasada fina se apaga y no inventa cambios', () => {
  const a = hoja(), b = hoja();
  for (let k = 0; k < 12; k++) { rect(a, 10 + k * 22, 10, 2, 170); rect(b, 11 + k * 22, 10, 2, 170); }
  const mapa = componer({ a, b, dilA: dilatar(a, W, H, 1), dilB: dilatar(b, W, H, 1), w: W, h: H, salida: null });
  const r = detectarAfinando({ mapa, a, b, w: W, h: H });
  igual([r.afinado, r.zonas.length], [false, 0]);
});

console.log(JSON.stringify({ total: pass + fail, pass, fail }));
process.exit(fail ? 1 : 0);
