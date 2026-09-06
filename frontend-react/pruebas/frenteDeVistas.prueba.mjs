/**
 * Compuerta del contexto SIN FRENTE.
 *
 *     node frontend-react/pruebas/frenteDeVistas.prueba.mjs
 *
 * Ejecuta LA MISMA función que llama App.jsx —`cargarVistasDelFrente`— con un
 * `apiFetch` que cuenta peticiones. No es una réplica de la lógica: es la
 * lógica, y por eso se sacó del componente.
 *
 * Lo que se comprueba es la secuencia que importa:
 *
 *     entrar sin frente   ->  0 peticiones
 *     entrar en 1_CANAL   ->  1 petición, a la URL correcta
 *     volver sin frente   ->  0 peticiones Y la lista se vacía
 *
 * La tercera es la que se olvida: sin vaciar, las vistas de Canal se quedan en
 * pantalla al salir del frente, y parecen del sitio donde estás.
 */

const { frenteDeVistas, cargarVistasDelFrente } = await import('../src/lib/frenteDeVistas.js');

let fallos = 0, total = 0;
const ok = (n, c, d = '') => { total++; if (c) console.log(`  ok   ${n}`); else { fallos++; console.log(`  FALLA ${n}${d ? '  → ' + d : ''}`); } };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Un `apiFetch` que anota a dónde se le llama y devuelve lo que se le diga.
function espia(respuesta = []) {
    const urls = [];
    const fn = (url) => { urls.push(url); return Promise.resolve({ json: () => Promise.resolve(respuesta) }); };
    fn.urls = urls;
    return fn;
}

const BACKEND = 'https://backend.ejemplo';

console.log('\nQUÉ CUENTA COMO «SIN FRENTE» (los estados que existen en App.jsx)');
ok('null — todavía en la pantalla de proyectos', frenteDeVistas(null) === null);
ok('undefined', frenteDeVistas(undefined) === null);
ok('un objeto sin id ni name — lo produce la rama de vista compartida',
    frenteDeVistas({ baseName: 'x' }) === null);
ok('id y name a null — vista compartida sin obra (las tres de marzo)',
    frenteDeVistas({ id: null, name: null, baseName: null }) === null);
ok('el marcador `global`', frenteDeVistas({ id: 'global' }) === null);
ok('`global` llegando por `name`', frenteDeVistas({ name: 'global' }) === null);

console.log('\nQUÉ SÍ ES UN FRENTE');
ok('un frente real', frenteDeVistas({ id: '1_CANAL' }) === '1_CANAL');
ok('el id manda sobre el name', frenteDeVistas({ id: '1_DRENAJE', name: '1' }) === '1_DRENAJE');
ok('con name pero sin id, vale el name', frenteDeVistas({ name: '1_CANAL' }) === '1_CANAL');
ok('un frente con acentos o espacios se codifica, no se rechaza',
    frenteDeVistas({ id: 'obra ñ' }) === 'obra ñ');

console.log('\nLA SECUENCIA: global → 1_CANAL → global');
{
    let lista = ['restos', 'del', 'frente', 'anterior'];
    const onVistas = (v) => { lista = v; };

    // 1 · entrar sin frente
    let fetch1 = espia();
    const pidio1 = cargarVistasDelFrente({
        frente: frenteDeVistas({ id: 'global' }), apiFetch: fetch1,
        backendUrl: BACKEND, onVistas,
    });
    ok('1 · en global NO se pide nada', fetch1.urls.length === 0 && pidio1 === false,
        JSON.stringify(fetch1.urls));
    ok('1 · y la lista queda vacía, no con lo de antes', igual(lista, []));

    // 2 · entrar en un frente real
    const fetch2 = espia([{ id: 'v1', name: 'AVANCE_CANAL' }, { id: 'v2', name: 'SEMANA_29' }]);
    const pidio2 = cargarVistasDelFrente({
        frente: frenteDeVistas({ id: '1_CANAL' }), apiFetch: fetch2,
        backendUrl: BACKEND, onVistas,
    });
    ok('2 · en 1_CANAL se pide UNA vez', fetch2.urls.length === 1 && pidio2 === true);
    ok('2 · a la URL del contrato',
        fetch2.urls[0] === `${BACKEND}/api/views?project=1_CANAL`, fetch2.urls[0]);
    await new Promise((r) => setTimeout(r, 0));
    ok('2 · y la lista se carga', lista.length === 2 && lista[0].name === 'AVANCE_CANAL');

    // 3 · volver a un contexto sin frente
    const fetch3 = espia();
    cargarVistasDelFrente({
        frente: frenteDeVistas(null), apiFetch: fetch3, backendUrl: BACKEND, onVistas,
    });
    ok('3 · al volver a global NO se pide nada', fetch3.urls.length === 0);
    ok('3 · Y NO SE CONSERVAN las vistas de 1_CANAL', igual(lista, []),
        JSON.stringify(lista));

    ok('en total, 1 petición en los tres pasos',
        fetch1.urls.length + fetch2.urls.length + fetch3.urls.length === 1);
}

console.log('\nEL FRENTE VIAJA CODIFICADO');
{
    const f = espia();
    cargarVistasDelFrente({ frente: 'b.proj_pqt8_x/y z', apiFetch: f, backendUrl: BACKEND, onVistas: () => { } });
    ok('un frente con caracteres raros no rompe la URL',
        f.urls[0] === `${BACKEND}/api/views?project=b.proj_pqt8_x%2Fy%20z`, f.urls[0]);
}

console.log('\nUN ERROR DE RED NO TUMBA EL PANEL');
{
    const roto = () => Promise.reject(new Error('sin red'));
    let visto = null;
    cargarVistasDelFrente({
        frente: '1_CANAL', apiFetch: roto, backendUrl: BACKEND,
        onVistas: () => { }, onError: (e) => { visto = e.message; },
    });
    await new Promise((r) => setTimeout(r, 0));
    ok('el fallo se entrega a quien lo pidió, no se traga', visto === 'sin red');
}

console.log(`\n${total - fallos} de ${total} pasan.`);
process.exit(fallos ? 1 : 0);
