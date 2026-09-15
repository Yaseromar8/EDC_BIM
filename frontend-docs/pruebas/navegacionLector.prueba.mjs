// Banco de COMO RESPONDE EL PLANO A LA RUEDA.
//
// Fija las cifras medidas en el lector de planos de ACC el 13-sep-2026
// (docs/archivos/03_LECTOR_PDF_MANIPULACION_COMO_ACC.md): el paso de una
// muesca, la curva del suavizado, los limites y que el punto bajo el cursor
// no se escape. Lo que depende del navegador --fotogramas reales, scroll,
// pdf.js-- se mide aparte en el banco del lector (probar-lector.html).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
    PASO_DE_RUEDA, LN_PASO_DE_RUEDA, TAU_MS, ALEJAR_HASTA, ZOOM_MAXIMO,
    pasoDeRueda, suavizar, limitesDeZoom, objetivoDelZoom, puntoBajoElCursor, desfaseDelPunto, puntoParaElZoom,
    DURACION_DE_HOJA_ENTERA_MS, suaveEntradaSalida, vistaDeHojaEntera, vistaIntermedia,
    areaDelDetalle, detalleSigueValiendo,
} from '../src/utils/navegacionLector.js';

const aqui = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
async function test(name, fn) {
    try { await fn(); pass++; console.log(JSON.stringify({ name, status: 'PASS' })); }
    catch (e) { fail++; console.log(JSON.stringify({ name, status: 'FAIL', error: e.stack })); }
}

const cerca = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} frente a ${b} (±${tol})`);

// Recorre el suavizado fotograma a fotograma, como lo haria el navegador.
function recorrer(lnObjetivo, msPorFotograma, lnDesde = 0) {
    const muestras = [];
    let ln = lnDesde, t = 0;
    for (let i = 0; i < 1000; i++) {
        t += msPorFotograma;
        const r = suavizar(ln, lnObjetivo, msPorFotograma);
        ln = r.ln;
        muestras.push({ t, fraccion: (ln - lnDesde) / (lnObjetivo - lnDesde), llegado: r.llegado });
        if (r.llegado) break;
    }
    return muestras;
}

// ── EL PASO DE UNA MUESCA ───────────────────────────────────────────────────

await test('una muesca hacia arriba acerca ×1,10 y hacia abajo aleja ×0,91, como ACC', () => {
    cerca(Math.exp(pasoDeRueda({ deltaY: -100 })), 1.10, 1e-12, 'acercar');
    cerca(Math.exp(pasoDeRueda({ deltaY: 100 })), 1 / 1.10, 1e-12, 'alejar');
    cerca(Math.exp(pasoDeRueda({ deltaY: 100 })), 0.91, 0.001, 'alejar redondeado como se midio');
});

await test('un evento con varias muescas juntas da el mismo paso que una (medido en ACC)', () => {
    for (const deltaY of [-120, -240, -300, -360, -1000]) {
        cerca(pasoDeRueda({ deltaY }), LN_PASO_DE_RUEDA, 1e-12, `deltaY ${deltaY}`);
    }
});

await test('Firefox en lineas y en paginas: una muesca sigue siendo una muesca', () => {
    cerca(pasoDeRueda({ deltaY: 3, deltaMode: 1 }), -LN_PASO_DE_RUEDA, 1e-12, '3 lineas');
    cerca(pasoDeRueda({ deltaY: -1, deltaMode: 2 }), LN_PASO_DE_RUEDA, 1e-12, 'una pagina');
});

await test('panel tactil: los eventos finos cuentan en proporcion, no como muescas enteras', () => {
    // Deslizar dos dedos da decenas de eventos pequeños por segundo. Si cada
    // uno valiera ×1,10, medio segundo de gesto serian ×17.
    const uno = pasoDeRueda({ deltaY: -10 });
    cerca(uno, LN_PASO_DE_RUEDA * 10 / 50, 1e-12, 'un evento de 10 px');
    const cinco = [1, 2, 3, 4, 5].reduce(acc => acc + pasoDeRueda({ deltaY: -10 }), 0);
    cerca(cinco, LN_PASO_DE_RUEDA, 1e-12, 'cinco eventos de 10 px = una muesca');
});

await test('pellizco (Ctrl con eventos finos) sigue a los dedos; Ctrl con la rueda de verdad es una muesca', () => {
    cerca(pasoDeRueda({ deltaY: -10, ctrlKey: true }), 0.1, 1e-12, 'pellizco');
    cerca(pasoDeRueda({ deltaY: -100, ctrlKey: true }), LN_PASO_DE_RUEDA, 1e-12, 'Ctrl + muesca');
});

await test('sin movimiento vertical o con datos rotos, la rueda no hace nada', () => {
    assert.equal(pasoDeRueda({ deltaY: 0 }), 0);
    assert.equal(pasoDeRueda({}), 0);
    assert.equal(pasoDeRueda({ deltaY: Number.NaN }), 0);
    assert.equal(pasoDeRueda(), 0);
});

// ── LA CURVA DEL SUAVIZADO ──────────────────────────────────────────────────

await test('a 60 Hz: la mitad hacia los 12 ms, el 90 % hacia los 44 ms, terminado hacia los 60 ms', () => {
    // La curva exponencial en tiempo continuo, que es la que se compara con ACC.
    const fraccion = (t) => 1 - Math.exp(-t / TAU_MS);
    cerca(fraccion(12), 0.5, 0.03, 'mitad a los 12 ms');
    cerca(fraccion(44), 0.9, 0.02, '90 % a los 44 ms');
    // Y fotograma a fotograma, como lo pinta el navegador.
    const m = recorrer(LN_PASO_DE_RUEDA, 1000 / 60);
    const fin = m[m.length - 1];
    assert.ok(fin.llegado, 'tiene que terminar');
    assert.ok(fin.t >= 49 && fin.t <= 67, `termina a los ${fin.t.toFixed(1)} ms`);
    assert.equal(fin.fraccion, 1, 'termina EXACTAMENTE en el objetivo');
});

await test('a 144 Hz termina a la misma hora: la curva va por tiempo, no por fotogramas', () => {
    const m = recorrer(LN_PASO_DE_RUEDA, 1000 / 144);
    const fin = m[m.length - 1];
    assert.ok(fin.t >= 50 && fin.t <= 65, `termina a los ${fin.t.toFixed(1)} ms`);
});

await test('nunca se pasa del objetivo ni vuelve atras', () => {
    for (const [objetivo, desde] of [[LN_PASO_DE_RUEDA, 0], [-LN_PASO_DE_RUEDA, 0], [5 * LN_PASO_DE_RUEDA, 0], [0, 2]]) {
        let anterior = 0;
        for (const { fraccion } of recorrer(objetivo, 1000 / 60, desde)) {
            assert.ok(fraccion >= anterior - 1e-12, 'no retrocede');
            assert.ok(fraccion <= 1 + 1e-12, 'no se pasa');
            anterior = fraccion;
        }
    }
});

await test('un fotograma atascado no deja el zoom a camara lenta: recupera lo perdido', () => {
    const r = suavizar(0, LN_PASO_DE_RUEDA, 250);
    assert.equal(r.llegado, true);
    assert.equal(r.ln, LN_PASO_DE_RUEDA);
    // Y un reloj que va hacia atras no mueve nada.
    assert.equal(suavizar(0.3, 0.5, -40).ln, 0.3);
});

await test('un paso minusculo (pellizco lento) llega en el mismo fotograma, sin arrastrar una cola', () => {
    const r = suavizar(0, 0.002, 1000 / 60);
    assert.equal(r.llegado, true);
});

// ── LIMITES ─────────────────────────────────────────────────────────────────

await test('un A1 (2384 × 1684 pt) en una vista de 1600 × 900: se aleja hasta 3,5 veces menos que encuadrado', () => {
    const { minimo, maximo } = limitesDeZoom({ anchoHoja: 2384, altoHoja: 1684, anchoVista: 1600, altoVista: 900 });
    const encaje = Math.min((1600 - 64) / 2384, (900 - 64) / 1684);
    cerca(minimo, encaje / ALEJAR_HASTA, 1e-12, 'minimo');
    assert.equal(maximo, ZOOM_MAXIMO);
});

await test('una vista sin tamaño (lector aun sin maquetar) no da limites absurdos', () => {
    const { minimo } = limitesDeZoom({ anchoHoja: 2384, altoHoja: 1684, anchoVista: 0, altoVista: 0 });
    assert.ok(minimo > 0 && minimo < 1, `minimo ${minimo}`);
});

await test('el objetivo respeta los limites, pero no devuelve de golpe una escala que ya estaba fuera', () => {
    const lim = { minimo: 0.2, maximo: 8 };
    cerca(objetivoDelZoom(Math.log(9), Math.log(7.9), lim), Math.log(8), 1e-12, 'no pasa del maximo');
    cerca(objetivoDelZoom(Math.log(0.1), Math.log(0.21), lim), Math.log(0.2), 1e-12, 'no baja del minimo');
    // La ventana se estrecho y la escala quedo por debajo del minimo:
    cerca(objetivoDelZoom(Math.log(0.15 / PASO_DE_RUEDA), Math.log(0.15), lim), Math.log(0.15), 1e-12,
        'alejar mas no se deja, pero tampoco salta al minimo');
    cerca(objetivoDelZoom(Math.log(0.15 * PASO_DE_RUEDA), Math.log(0.15), lim), Math.log(0.165), 1e-12,
        'acercar si se deja, desde donde estaba');
});

// ── EL PUNTO BAJO EL CURSOR ─────────────────────────────────────────────────

await test('el punto bajo el cursor se recupera exactamente tras escalar y desplazar', () => {
    const rect = { left: 140, top: 90 };
    const punto = puntoBajoElCursor(rect, 700, 400, 0.5);
    // La hoja crece ×1,10 desde su esquina: sin corregir, el punto se va.
    const s2 = 0.5 * PASO_DE_RUEDA;
    const { dx, dy } = desfaseDelPunto(rect, punto, s2);
    cerca(dx, (700 - 140) * (PASO_DE_RUEDA - 1), 1e-9, 'lo que se escapa en x');
    cerca(dy, (400 - 90) * (PASO_DE_RUEDA - 1), 1e-9, 'lo que se escapa en y');
    // Desplazando la vista esa cantidad, la hoja se mueve al reves y el punto vuelve.
    const corregido = desfaseDelPunto({ left: rect.left - dx, top: rect.top - dy }, punto, s2);
    cerca(corregido.dx, 0, 1e-9, 'x corregida');
    cerca(corregido.dy, 0, 1e-9, 'y corregida');
});

await test('fuera de la hoja el ancla funciona igual (en ACC la rueda amplia tambien sobre el margen)', () => {
    const rect = { left: 300, top: 200 };
    const punto = puntoBajoElCursor(rect, 50, 20, 1);
    assert.ok(punto.ux < 0 && punto.uy < 0, 'el punto cae a la izquierda y encima de la hoja');
    const { dx, dy } = desfaseDelPunto(rect, punto, 1 / PASO_DE_RUEDA);
    const corregido = desfaseDelPunto({ left: rect.left - dx, top: rect.top - dy }, punto, 1 / PASO_DE_RUEDA);
    cerca(corregido.dx, 0, 1e-9, 'x');
    cerca(corregido.dy, 0, 1e-9, 'y');
});

await test('con el cursor quieto se conserva el punto ANOTADO y no se mide otra vez: el redondeo no se acumula', () => {
    const anotado = puntoBajoElCursor({ left: 100, top: 50 }, 640, 360, 0.5);
    // A escala 0,55 la hoja tendria que estar en (46, 19); el scroll la dejo 0,4 px corrida.
    const r = puntoParaElZoom(anotado, { left: 46.4, top: 18.7 }, 640, 360, 0.55);
    assert.equal(r, anotado, 'tiene que ser el MISMO punto, no uno medido de nuevo');
});

await test('si se movio el cursor, o la vista por otro lado, el punto se anota de nuevo', () => {
    const anotado = puntoBajoElCursor({ left: 100, top: 50 }, 640, 360, 0.5);
    const otroSitio = puntoParaElZoom(anotado, { left: 46, top: 19 }, 641, 360, 0.55);
    assert.notEqual(otroSitio, anotado);
    assert.equal(otroSitio.clientX, 641);
    const arrastrada = puntoParaElZoom(anotado, { left: 86, top: 19 }, 640, 360, 0.55);
    assert.notEqual(arrastrada, anotado, 'tras arrastrar 40 px, el punto anotado ya no esta bajo el cursor');
    cerca(arrastrada.ux, (640 - 86) / 0.55, 1e-9, 'se anota el que hay ahora');
    const sinAnterior = puntoParaElZoom(null, { left: 46, top: 19 }, 640, 360, 0.55);
    cerca(sinAnterior.ux, (640 - 46) / 0.55, 1e-9, 'sin punto anterior');
});

// ── DOBLE CLIC: LA HOJA ENTERA ──────────────────────────────────────────────

await test('el viaje dura lo medido en ACC (~0,5 s) y su curva sale y llega suave', () => {
    assert.equal(DURACION_DE_HOJA_ENTERA_MS, 500);
    assert.equal(suaveEntradaSalida(0), 0);
    assert.equal(suaveEntradaSalida(1), 1);
    cerca(suaveEntradaSalida(0.5), 0.5, 1e-12, 'mitad');
    assert.ok(suaveEntradaSalida(0.1) < 0.1, 'sale despacio');
    assert.ok(suaveEntradaSalida(0.9) > 0.9, 'llega despacio');
    let anterior = 0;
    for (let i = 1; i <= 100; i++) {
        const v = suaveEntradaSalida(i / 100);
        assert.ok(v >= anterior, 'no retrocede');
        anterior = v;
    }
    assert.equal(suaveEntradaSalida(-1), 0);
    assert.equal(suaveEntradaSalida(2), 1);
});

await test('la hoja entera es la misma vista que deja «Ajustar pagina»: escala y centro con el relleno real', () => {
    // A1 en el banco: contenedor 1585 × 837; relleno 26/74 a los lados y 26/84 arriba/abajo.
    const v = vistaDeHojaEntera({
        anchoHoja: 2384, altoHoja: 1684,
        vista: { left: 0, top: 58, ancho: 1585, alto: 837 },
        relleno: { izquierda: 26, derecha: 74, arriba: 26, abajo: 84 },
    });
    const escala = Math.min((1585 - 64) / 2384, (837 - 64) / 1684);
    cerca(v.escala, escala, 1e-12, 'escala de fitTo');
    // fitTo centra el scroll: la hoja queda desplazada la mitad de la diferencia de relleno.
    cerca(v.left, (1585 - 2384 * escala) / 2 - 24, 1e-9, 'left');
    cerca(v.top, 58 + (837 - 1684 * escala) / 2 - 29, 1e-9, 'top');
});

await test('una vista diminuta no deja la hoja por debajo de 0,2, igual que fitTo', () => {
    const v = vistaDeHojaEntera({ anchoHoja: 2384, altoHoja: 1684,
        vista: { left: 0, top: 0, ancho: 200, alto: 150 }, relleno: { izquierda: 0, derecha: 0, arriba: 0, abajo: 0 } });
    assert.equal(v.escala, 0.2);
});

await test('el viaje empieza y termina EXACTAMENTE en las dos vistas', () => {
    const desde = { escala: 3.2, left: -2400, top: -900 };
    const hasta = { escala: 0.46, left: 221, top: 61 };
    const a = vistaIntermedia(desde, hasta, 0);
    const b = vistaIntermedia(desde, hasta, 1);
    cerca(a.escala, desde.escala, 1e-9, 'escala inicial');
    cerca(a.left, desde.left, 1e-9, 'left inicial');
    cerca(a.top, desde.top, 1e-9, 'top inicial');
    cerca(b.escala, hasta.escala, 1e-9, 'escala final');
    cerca(b.left, hasta.left, 1e-9, 'left final');
    cerca(b.top, hasta.top, 1e-9, 'top final');
});

await test('en todo el viaje hay un punto del plano que no se mueve: se ve como un zoom, no como un deslizamiento torcido', () => {
    const desde = { escala: 3.2, left: -2400, top: -900 };
    const hasta = { escala: 0.46, left: 221, top: 61 };
    const ux = (hasta.left - desde.left) / (desde.escala - hasta.escala);
    const uy = (hasta.top - desde.top) / (desde.escala - hasta.escala);
    const fijo = [desde.left + desde.escala * ux, desde.top + desde.escala * uy];
    for (const f of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const v = vistaIntermedia(desde, hasta, f);
        cerca(v.left + v.escala * ux, fijo[0], 1e-6, `x del punto fijo a ${f}`);
        cerca(v.top + v.escala * uy, fijo[1], 1e-6, `y del punto fijo a ${f}`);
        assert.ok(v.escala < desde.escala && v.escala > hasta.escala, 'la escala va de una a otra');
    }
});

await test('con la misma escala el viaje es un deslizamiento recto, sin dividir por cero', () => {
    const desde = { escala: 0.46, left: 900, top: 400 };
    const hasta = { escala: 0.46, left: 221, top: 61 };
    const v = vistaIntermedia(desde, hasta, 0.5);
    assert.ok(Number.isFinite(v.left) && Number.isFinite(v.top));
    cerca(v.left, (900 + 221) / 2, 1e-9, 'a mitad de camino en x');
    cerca(v.top, (400 + 61) / 2, 1e-9, 'a mitad de camino en y');
    cerca(v.escala, 0.46, 1e-12, 'escala quieta');
});

// ── NITIDEZ: EL DETALLE DE LO VISIBLE ───────────────────────────────────────

await test('se puede acercar hasta 64 (1 pt del plano = 64 px)', () => {
    assert.equal(ZOOM_MAXIMO, 64);
});

await test('el detalle cubre lo visible con margen y sin pasar del presupuesto de pixeles', () => {
    const area = areaDelDetalle({
        vista: { left: 0, top: 0, right: 1500, bottom: 800 },
        hoja: { left: -4000, top: -3000, width: 10000, height: 7000 },
        anchoVp: 10000, altoVp: 7000, dpr: 1, presupuesto: 8e6,
    });
    assert.deepEqual(area.visible, { minX: 4000, maxX: 5500, minY: 3000, maxY: 3800 });
    assert.ok(area.minX < 4000 && area.maxX > 5500 && area.minY < 3000 && area.maxY > 3800, 'con margen alrededor');
    const pixeles = (area.maxX - area.minX) * (area.maxY - area.minY) * area.resolucion ** 2;
    assert.ok(pixeles <= 8e6 * (1 + 1e-9), `no pasa del presupuesto: ${pixeles}`);
    cerca(area.resolucion, 1, 1e-6, 'a la resolucion de la pantalla');
});

await test('con la hoja a otro tamaño que su viewport (a medio zoom), las cuentas van en unidades del viewport', () => {
    const area = areaDelDetalle({
        vista: { left: 0, top: 0, right: 1500, bottom: 800 },
        hoja: { left: -2000, top: -1500, width: 5000, height: 3500 },
        anchoVp: 10000, altoVp: 7000, dpr: 1, presupuesto: 8e6,
    });
    assert.deepEqual(area.visible, { minX: 4000, maxX: 7000, minY: 3000, maxY: 4600 });
});

await test('en el borde de la hoja el detalle no se sale de ella', () => {
    const area = areaDelDetalle({
        vista: { left: 0, top: 0, right: 1500, bottom: 800 },
        hoja: { left: 200, top: 100, width: 10000, height: 7000 },
        anchoVp: 10000, altoVp: 7000, dpr: 1.25, presupuesto: 8e6,
    });
    assert.equal(area.minX, 0);
    assert.equal(area.minY, 0);
    assert.deepEqual(area.visible, { minX: 0, maxX: 1300, minY: 0, maxY: 700 });
});

await test('si la hoja no se ve, no hay detalle que dibujar', () => {
    assert.equal(areaDelDetalle({
        vista: { left: 0, top: 0, right: 1500, bottom: 800 },
        hoja: { left: 2000, top: 100, width: 500, height: 300 },
        anchoVp: 500, altoVp: 300, dpr: 1, presupuesto: 8e6,
    }), null);
});

await test('en una pantalla enorme lo visible entero cabe, bajando la resolucion lo justo', () => {
    const area = areaDelDetalle({
        vista: { left: 0, top: 0, right: 4000, bottom: 2000 },
        hoja: { left: -10000, top: -10000, width: 50000, height: 40000 },
        anchoVp: 50000, altoVp: 40000, dpr: 2, presupuesto: 8e6,
    });
    assert.deepEqual([area.minX, area.maxX, area.minY, area.maxY], [10000, 14000, 10000, 12000], 'sin margen: no cabe');
    cerca(area.resolucion, 1, 1e-9, 'de 2 baja a 1 para caber en 8 MP');
});

await test('mientras el detalle dibujado cubre lo visible con margen a ambos lados, no se redibuja', () => {
    const dibujado = { minX: 2800, maxX: 6700, minY: 2400, maxY: 4400 };
    const hoja = { anchoVp: 10000, altoVp: 7000 };
    assert.equal(detalleSigueValiendo(dibujado, { minX: 4000, maxX: 5500, minY: 3000, maxY: 3800 }, hoja), true, 'centrado');
    assert.equal(detalleSigueValiendo(dibujado, { minX: 2700, maxX: 4200, minY: 3000, maxY: 3800 }, hoja), false, 'se sale por la izquierda');
    // 100 px de margen a la izquierda y 2400 a la derecha: se redibuja centrado ya.
    assert.equal(detalleSigueValiendo(dibujado, { minX: 2900, maxX: 4300, minY: 3000, maxY: 3800 }, hoja), false, 'casi en el borde');
    assert.equal(detalleSigueValiendo(null, { minX: 0, maxX: 1, minY: 0, maxY: 1 }, hoja), false, 'sin detalle');
});

await test('pegado al borde de la HOJA no hace falta redibujar: alli no hay mas plano', () => {
    const dibujado = { minX: 0, maxX: 3000, minY: 0, maxY: 2000 };
    assert.equal(detalleSigueValiendo(dibujado, { minX: 0, maxX: 1300, minY: 0, maxY: 700 }, { anchoVp: 10000, altoVp: 7000 }), true);
});

// ── EL LECTOR USA ESTAS CUENTAS ─────────────────────────────────────────────

await test('el lector aplica estas cuentas y la rueda ya no cambia de pagina', () => {
    const fuente = readFileSync(join(aqui, '../src/components/PDFViewer.jsx'), 'utf8');
    assert.match(fuente, /from '\.\.\/utils\/navegacionLector'/, 'PDFViewer tiene que importar navegacionLector');
    const rueda = fuente.slice(fuente.indexOf('const alGirarLaRueda'), fuente.indexOf("addEventListener('wheel'"));
    assert.ok(rueda.length > 0, 'no se encontro el manejador de la rueda');
    assert.ok(rueda.includes('pasoDeRueda('), 'la rueda tiene que pasar por pasoDeRueda');
    assert.ok(!/setCurrentPage/.test(rueda), 'la rueda no puede cambiar de pagina');
});

await test('el doble clic del lector usa el viaje probado aqui, y solo con la herramienta Mover', () => {
    const fuente = readFileSync(join(aqui, '../src/components/PDFViewer.jsx'), 'utf8');
    assert.ok(fuente.includes('onDoubleClick={alHacerDobleClic}'), 'el escenario tiene que escuchar el doble clic');
    assert.ok(fuente.includes('vistaIntermedia(') && fuente.includes('vistaDeHojaEntera('), 'el viaje tiene que pasar por estas cuentas');
    const manejador = fuente.slice(fuente.indexOf('const alHacerDobleClic'), fuente.indexOf('verHojaEntera();', fuente.indexOf('const alHacerDobleClic')));
    assert.ok(manejador.includes("tool !== 'pan'"), 'con una herramienta de medir o marcar, el doble clic es de la herramienta');
});

await test('la nitidez: el lector dibuja aparte lo visible con estas cuentas', () => {
    const fuente = readFileSync(join(aqui, '../src/components/PDFViewer.jsx'), 'utf8');
    assert.ok(fuente.includes('areaDelDetalle(') && fuente.includes('detalleSigueValiendo('), 'el detalle tiene que pasar por estas cuentas');
    assert.ok(fuente.includes('className="pdf-detalle"'), 'falta el lienzo del detalle');
});

console.log(JSON.stringify({ banco: 'navegacionLector', pass, fail }));
if (fail) process.exit(1);
