/**
 * planillaPerfil — lo que la Planilla DEDUCE de los datos extraídos, sin IA (docs/visor/24 §9).
 *
 * 1. Perfil de cada parámetro: qué forma tienen sus valores (código, unidad, fecha, número,
 *    texto), cuántos elementos lo tienen lleno, cuántos valores distintos, cuánto relleno.
 * 2. Roles deducidos por la FORMA de los valores y por cómo se relacionan, nunca por el
 *    nombre del parámetro (en Latinoamérica cada obra los llama a su manera):
 *      código       la mayoría de sus valores tienen forma de código;
 *      descripción  texto que acompaña al código: a cada código le corresponde casi siempre
 *                   la misma descripción;
 *      unidad       valores de un conjunto pequeño (m, m², m³, kg, und…) que van con el código.
 *    Cada deducción lleva su porqué en números, para que se pueda comprobar.
 *
 * Funciones puras: reciben filas del inventario ({ 'Grupo::Parámetro': valor }), no tocan el DOM.
 */
import { leerValor } from './inventoryTabla.js';
import { esRelleno, normalizarUnidad, diccionarioDSI } from './planillaPartidas.js';
import { compacto } from './inventoryBuscar.js';

// Claves que identifican al elemento: no son parámetros que perfilar.
const NO_PERFILAR = new Set(['dbId', 'db_id', 'externalId', 'external_id', 'element_key', 'source_urn', 'model_urn', 'scope_id', 'source_lineage', '__urn', '__modelo']);
const UNIDADES = new Set(['m', 'm²', 'm³', 'kg', 'und']);
const UNIDADES_ESCRITAS = new Set(['glb', 'gbl', 'pza', 'pto', 'lt', 'l', 'gal', 'hh', 'hm', 'día', 'dia', 'mes', 'est', 'jgo', 'kit', 'par', 'ton', 't', 'cm', 'mm', 'km', 'ha', 'p2', 'pie2']);

const nombreDe = clave => String(clave).split('::').pop();

/** Familia de un parámetro: el nombre sin su número final. «…CodigoDePartida3» → {base:'…CodigoDePartida', sufijo:'3'}. */
export function familia(clave) {
    const m = /^(.*?)(\d{1,2})$/.exec(String(clave));
    return m && !/[\d_.\- ]$/.test(m[1]) ? { base: m[1], sufijo: m[2] } : { base: String(clave), sufijo: '' };
}

/**
 * ¿Tiene forma de código de partida o de ítem?
 *   «06.02.01.03», «1.2.3», «01-02-03», «OE.2.1.1» → sí (dos o más separadores);
 *   «01.01», «OE.2»  → sí (un separador, pero empieza por cero o lleva letras);
 *   «1.522», «0.500», «37.791 m» → no (son números).
 */
export function esCodigo(v) {
    const s = String(v ?? '').trim();
    const m = /^([A-Za-z]{1,4}[.\-_ ]?)?([0-9]{1,4})((?:[.\-_][0-9]{1,4})*)$/.exec(s);
    if (!m) return false;
    // El punto tras las letras («OE.2») también separa niveles.
    const separadores = (m[3].match(/[.\-_]/g) || []).length + (m[1] && /[.\-_ ]$/.test(m[1]) ? 1 : 0);
    if (!separadores) return false;
    if (separadores >= 2) return true;
    return !!m[1] || (m[2].length >= 2 && m[2][0] === '0');
}

/** ¿Es una unidad de medida? Las reconocidas por la Planilla y las habituales de un presupuesto. */
export function esUnidad(v) {
    const s = String(v ?? '').trim();
    if (!s || s.length > 6) return false;
    // Unidades de transporte de un presupuesto: m3-km, m³·km, t-km, ton/km…
    if (/^(m|m2|m3|m²|m³|t|ton|kg)[-/·.]?km$/i.test(s)) return true;
    return UNIDADES.has(normalizarUnidad(s)) || UNIDADES_ESCRITAS.has(s.toLowerCase().replace(/[.]+$/, ''));
}

/** Forma de un valor: 'vacio' | 'relleno' | 'codigo' | 'unidad' | 'fecha' | 'numero' | 'texto'. */
export function formaDeValor(v) {
    if (v === null || v === undefined) return 'vacio';
    if (typeof v === 'number') return Number.isFinite(v) ? 'numero' : 'vacio';
    const s = String(v).trim();
    if (!s) return 'vacio';
    if (esRelleno(s)) return 'relleno';
    if (esCodigo(s)) return 'codigo';
    if (esUnidad(s)) return 'unidad';
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return 'fecha';
    const r = leerValor(s);
    return r.tipo === 'fecha' ? 'fecha' : r.tipo === 'numero' ? 'numero' : 'texto';
}

const MAX_DISTINTOS = 20000;

/**
 * Perfil de cada parámetro sobre las filas dadas.
 * [{ clave, nombre, llenos, cobertura, relleno, distintos, formas, forma, fraccion, largoMedio, ejemplos }]
 *   forma     la que tienen ≥ 80 % de los valores con dato (sin contar el relleno), o 'mixto';
 *   fraccion  la parte de los valores con dato que tiene esa forma.
 */
export function perfilarCampos(filas, claves = null) {
    let lista = claves;
    if (!lista) {
        // Sin construir un arreglo con todas las claves de todas las filas (millones en una obra grande).
        const vistas = new Set();
        for (const f of filas) for (const k in f) vistas.add(k);
        lista = [...vistas];
    }
    // El inventario trae cada parámetro dos veces: «Datos::X» y «X». Se perfila el que lleva grupo.
    const conGrupo = new Set(lista.filter(c => String(c).includes('::')).map(nombreDe));
    const total = filas.length || 1;
    const perfiles = [];
    // La forma de un valor solo depende del valor, y en una obra se repiten muchísimo («NA», los
    // mismos códigos, las mismas unidades): se calcula una vez por valor distinto. Mismo resultado,
    // medido: 14.000 elementos × 330 parámetros, de 2,5 s a una fracción.
    const memoria = new Map();
    const MAX_MEMORIA = 200000;
    const analizar = v => {
        const f = formaDeValor(v);
        if (f === 'vacio' || f === 'relleno') return { f };
        const s = String(v).trim();
        return { f, s, palabras: f === 'texto' ? s.split(/\s+/).length : 0 };
    };
    // Un acumulador por parámetro, y UNA pasada por las filas mirando solo las claves que cada fila
    // tiene: un elemento no paga por los parámetros que no lleva. El orden de las filas se respeta,
    // así que los ejemplos (los tres primeros valores distintos) son los mismos que antes.
    const acumuladores = new Map();
    for (const clave of lista) {
        if (NO_PERFILAR.has(clave) || NO_PERFILAR.has(nombreDe(clave))) continue;
        if (!String(clave).includes('::') && conGrupo.has(clave)) continue;
        acumuladores.set(clave, { formas: { codigo: 0, unidad: 0, fecha: 0, numero: 0, texto: 0 }, distintos: new Set(), ejemplos: [], llenos: 0, relleno: 0, largo: 0, palabras: 0 });
    }
    for (const fila of filas) {
        for (const clave in fila) {
            const acc = acumuladores.get(clave);
            if (!acc) continue;
            const v = fila[clave];
            let a;
            if (typeof v === 'string') {
                a = memoria.get(v);
                if (!a) { a = analizar(v); if (memoria.size < MAX_MEMORIA) memoria.set(v, a); }
            } else a = analizar(v);
            const f = a.f;
            if (f === 'vacio') continue;
            if (f === 'relleno') { acc.relleno++; continue; }
            acc.llenos++;
            acc.formas[f]++;
            const s = a.s;
            if (f === 'texto') { acc.largo += s.length; acc.palabras += a.palabras; }
            if (acc.distintos.size < MAX_DISTINTOS && !acc.distintos.has(s)) {
                acc.distintos.add(s);
                if (acc.ejemplos.length < 3) acc.ejemplos.push(s);
            }
        }
    }
    for (const [clave, { formas, distintos, ejemplos, llenos, relleno, largo, palabras }] of acumuladores) {
        if (!llenos && !relleno) continue;
        const [forma, n] = Object.entries(formas).sort((a, b) => b[1] - a[1])[0];
        const fraccion = llenos ? n / llenos : 0;
        perfiles.push({
            clave, nombre: nombreDe(clave), llenos, cobertura: llenos / total, relleno,
            distintos: distintos.size, formas, forma: fraccion >= 0.8 ? forma : 'mixto', fraccion,
            largoMedio: formas.texto ? largo / formas.texto : 0, palabrasMedia: formas.texto ? palabras / formas.texto : 0, ejemplos,
        });
    }
    return perfiles;
}

/**
 * Cómo se relacionan dos parámetros en las filas:
 *   dependencia  para cada valor de A, la parte de sus filas con el valor de B más frecuente
 *                (1 = a cada A le corresponde siempre la misma B);
 *   juntos       de los elementos que tienen A o B, la parte que tiene los dos (1 = se llenan
 *                exactamente en los mismos elementos).
 */
function relacion(filas, claveA, claveB, aceptaA = () => true, aceptaB = () => true) {
    const mapa = new Map();
    let pares = 0, conA = 0, conB = 0;
    for (const fila of filas) {
        const a = String(fila[claveA] ?? '').trim();
        const b = String(fila[claveB] ?? '').trim();
        const hayA = !!a && !esRelleno(a) && aceptaA(a);
        const hayB = !!b && !esRelleno(b) && aceptaB(b);
        if (hayA) conA++;
        if (hayB) conB++;
        if (!hayA || !hayB) continue;
        pares++;
        let m = mapa.get(a);
        if (!m) mapa.set(a, m = new Map());
        m.set(b, (m.get(b) || 0) + 1);
    }
    let dominantes = 0, conVarios = 0, ejemplo = null;
    for (const [a, m] of mapa) {
        dominantes += Math.max(...m.values());
        if (m.size > 1) {
            conVarios++;
            // El ejemplo: el valor minoritario más repetido (lo que probablemente está mal).
            const [, segundo] = [...m.entries()].sort((x, y) => y[1] - x[1]);
            if (!ejemplo || segundo[1] > ejemplo.n) ejemplo = { a, b: segundo[0], n: segundo[1] };
        }
    }
    const union = conA + conB - pares;
    return { pares, dependencia: pares ? dominantes / pares : 0, juntos: union ? pares / union : 0, conVarios, ejemplo };
}

const pct = x => `${Math.round(x * 100)} %`;
const miles = n => n.toLocaleString('es-PE');
const grupoDe = clave => (String(clave).includes('::') ? String(clave).split('::')[0] : '');

// Una lista de partidas tiene al menos este número de códigos distintos (con menos, es una
// clasificación, un tipo o una fecha con forma de código).
const MIN_CODIGOS = 5;

/**
 * Roles deducidos de los datos. Devuelve las LÍNEAS de partida encontradas (un elemento puede
 * llevar varias: el mismo parámetro con número 1, 2, 3…), cada una con su evidencia:
 * { lineas: [{ sufijo, codigo, descripcion, unidad, porque: [texto…], avisos: [texto…], confianza }], perfiles }
 *
 * Reglas (todas sobre los valores, ninguna sobre el nombre):
 *   código       ≥ 80 % de sus valores con forma de código, ≥ 5 códigos distintos, y que se
 *                repitan (de media ≥ 2 elementos por código: una marca o un Id no se repiten);
 *   descripción  texto (≥ 12 letras de media, ≥ 3 palabras, ≥ 3 textos distintos) que cada código
 *                lleva igual en ≥ 75 % de los casos (lo que no, se avisa) Y que está lleno en los mismos elementos que el código
 *                (≥ 50 %): el nombre del proyecto o el material están en todos, no solo en los
 *                que tienen partida. Una descripción puede servir a varios códigos (el «FUSTE»
 *                de cada buzón). Entre los que pasan, el MÁS ESPECÍFICO (más textos distintos):
 *                una zona también va con el código, pero agrupa muchos;
 *   unidad       valores con forma de unidad (aunque haya otros mezclados, que se avisan), la
 *                misma por código en ≥ 90 % de los casos.
 *   Entre candidatos válidos gana el que más coincide y, a igualdad, el del mismo número de
 *   línea y el del mismo grupo de parámetros.
 */
export function deducirRoles(filas, perfiles = perfilarCampos(filas), { itemizado = null } = {}) {
    const minimo = Math.max(3, Math.round(filas.length * 0.001));
    // Con itemizado (paso 3), un parámetro cuyos códigos están en él es de partidas aunque tenga
    // pocos códigos distintos: la prueba es el itemizado, no el número.
    const enItemizado = new Map();
    if (itemizado) {
        for (const p of perfiles) {
            if (p.forma !== 'codigo') continue;
            const valores = new Set();
            for (const f of filas) { const v = String(f[p.clave] ?? '').trim(); if (esCodigo(v)) valores.add(v); }
            const dentro = [...valores].filter(v => itemizado.ubicar(v).tipo !== 'fuera').length;
            if (valores.size) enItemizado.set(p.clave, dentro / valores.size);
        }
    }
    // Con itemizado, MANDA el itemizado: solo es de partidas el parámetro cuyos códigos están en
    // él (≥ 50 %, exactos o sub-partidas de un ítem suyo). Otro parámetro con forma de código (en
    // el Canal, `03_03_01_DSI_CodigoDePartida` con 04.15.03.05) contaba las mismas barras en
    // otras partidas. Sin itemizado, la regla de forma (≥ 5 códigos que se repiten).
    let codigos = perfiles.filter(p => p.forma === 'codigo' && p.llenos >= minimo && p.distintos * 2 <= p.llenos
        && (itemizado ? (enItemizado.get(p.clave) || 0) >= 0.5 : p.distintos >= MIN_CODIGOS));
    // LA FAMILIA ES EL MISMO PAPEL (26-oct-2026, Interferencias): si `CodigoDePartida1` es de
    // partidas por el itemizado, `CodigoDePartida2`, `3` y el sin número también lo son, aunque
    // menos de la mitad de sus códigos estén en ESTE itemizado (el modelo mezcla partidas de varios
    // presupuestos: 10 de 24 en Partida2). Basta con que alguno esté. Otra familia
    // (`03_03_01_…CodigoDePartida` en el Canal) sigue con la regla de la mitad.
    const hermanas = new Map();
    if (itemizado && codigos.length) {
        const familias = new Map(codigos.map(p => [familia(p.clave).base, p]));
        for (const p of perfiles) {
            if (codigos.includes(p) || p.forma !== 'codigo' || p.llenos < minimo || !(enItemizado.get(p.clave) > 0)) continue;
            const reconocida = familias.get(familia(p.clave).base);
            if (reconocida) hermanas.set(p.clave, reconocida);
        }
        codigos = [...codigos, ...perfiles.filter(p => hermanas.has(p.clave))];
    }
    // Una descripción está hecha de palabras: un Id o un GUID largo no lo es.
    const textos = perfiles.filter(p => (p.forma === 'texto' || p.forma === 'mixto') && p.largoMedio >= 12 && p.palabrasMedia >= 3);
    const unidades = perfiles.filter(p => p.formas.unidad >= minimo && p.formas.unidad >= p.llenos * 0.3);
    // 1ª pasada: para cada lista de códigos, sus candidatos a descripción y a unidad.
    const lineas = codigos.map(c => {
        const { sufijo } = familia(c.clave);
        // Lo que se llama igual salvo el número va junto (CodigoDePartida2 ↔ NombreDePartida2).
        const afinidad = x => (familia(x.clave).sufijo === sufijo ? 0.1 : 0) + (grupoDe(x.clave) === grupoDe(c.clave) ? 0.01 : 0);
        const descripciones = [];
        for (const t of textos) {
            // ≥ 3 textos distintos (un texto igual en toda la obra no describe nada), salvo que el
            // propio parámetro de códigos tenga menos (solo con itemizado puede pasar).
            if (t.clave === c.clave || t.llenos < c.llenos * 0.3 || t.distintos < Math.min(3, c.distintos)) continue;
            const r = relacion(filas, c.clave, t.clave, esCodigo);
            if (r.pares < minimo || r.dependencia < 0.75 || r.juntos < 0.35) continue;
            // La descripción es el texto MÁS ESPECÍFICO que acompaña al código: una zona o una
            // tipología también van con el código, pero agrupan muchos (Drenaje: 7 subzonas para
            // 191 códigos, 23 descripciones).
            const especificidad = Math.sqrt(Math.min(1, t.distintos / c.distintos));
            // Con itemizado: lo que más pesa es que sus textos SEAN descripciones del itemizado.
            let oficiales = 0;
            if (itemizado) {
                const vistos = new Set();
                for (const f of filas) { const v = String(f[t.clave] ?? '').trim(); if (v && !vistos.has(v)) { vistos.add(v); if (itemizado.porDescripcion.has(compacto(v))) oficiales++; } }
                oficiales /= vistos.size || 1;
            }
            descripciones.push({ p: t, r, oficiales, nota: r.dependencia * r.juntos * especificidad + afinidad(t) + oficiales });
        }
        const unidadesC = [];
        for (const x of unidades) {
            const r = relacion(filas, c.clave, x.clave, esCodigo, esUnidad);
            if (r.pares < minimo || r.dependencia < 0.9) continue;
            unidadesC.push({ p: x, r, nota: r.dependencia * r.juntos + afinidad(x) });
        }
        descripciones.sort((a, b) => b.nota - a.nota);
        unidadesC.sort((a, b) => b.nota - a.nota);
        const avisos = [];
        if (c.formas.texto) avisos.push(`«${c.nombre}»: ${miles(c.formas.texto)} valores son texto, no código (¿código y descripción cambiados de sitio?)`);
        const porque = [`«${c.nombre}»: ${pct(c.fraccion)} de sus ${miles(c.llenos)} valores tienen forma de código y se repiten (${miles(c.distintos)} códigos distintos)`];
        if (enItemizado.has(c.clave)) porque.push(`el ${pct(enItemizado.get(c.clave))} de sus códigos están en el itemizado (o son sub-partidas de un ítem suyo)`);
        if (hermanas.has(c.clave)) porque.push(`es de la misma familia que «${hermanas.get(c.clave).nombre}», reconocida por el itemizado: el mismo papel`);
        return {
            c, sufijo, codigo: c.clave, descripcion: null, unidad: null, avisos, dudosa: false, porque,
            _d: descripciones, _u: unidadesC,
            candidatosDescripcion: descripciones.slice(0, 3).map(x => ({ clave: x.p.clave, distintos: x.p.distintos, dependencia: x.r.dependencia, juntos: x.r.juntos })),
        };
    });
    // 2ª pasada: reparto entre TODAS las líneas a la vez; cada parámetro sirve a una sola, y
    // va primero el emparejamiento que mejor encaja.
    const repartir = (lista, campo) => {
        const pares = lineas.flatMap(l => l[lista].map(x => ({ l, x })));
        pares.sort((a, b) => b.x.nota - a.x.nota);
        const usados = new Set();
        for (const { l, x } of pares) {
            if (l[campo] || usados.has(x.p.clave)) continue;
            l[campo] = x.p.clave;
            l[`_${campo}`] = x;
            usados.add(x.p.clave);
        }
    };
    repartir('_d', 'descripcion');
    repartir('_u', 'unidad');
    for (const l of lineas) {
        const d = l._descripcion, u = l._unidad;
        if (d) {
            l.porque.push(`«${d.p.nombre}» es su descripción: cada código lleva la misma en el ${pct(d.r.dependencia)} de ${miles(d.r.pares)} casos, se llenan en los mismos elementos (${pct(d.r.juntos)}) y es el texto más específico (${miles(d.p.distintos)} textos distintos)${d.oficiales ? `; el ${pct(d.oficiales)} de sus textos son descripciones del itemizado` : ''}`);
            // Otro candidato casi igual y libre: se elige el mejor, pero queda POR CONFIRMAR.
            const otro = l._d.find(x => x !== d && x.nota >= d.nota * 0.8 && !lineas.some(o => o.descripcion === x.p.clave));
            if (otro) {
                l.dudosa = true;
                l.avisos.push(`Descripción por confirmar: también encaja «${otro.p.nombre}» (${miles(otro.p.distintos)} textos distintos, en los mismos elementos el ${pct(otro.r.juntos)})`);
            }
            if (d.r.conVarios) l.avisos.push(`«${d.p.nombre}»: ${miles(d.r.conVarios)} códigos llevan más de una descripción (p. ej. ${d.r.ejemplo.a} también aparece como «${d.r.ejemplo.b}» en ${miles(d.r.ejemplo.n)} elementos)`);
        }
        if (u) {
            l.porque.push(`«${u.p.nombre}» es su unidad: la misma por código en el ${pct(u.r.dependencia)} de ${miles(u.r.pares)} casos`);
            const otraU = l._u.find(x => x !== u && x.nota >= u.nota * 0.8 && !lineas.some(o => o.unidad === x.p.clave));
            if (otraU) {
                l.dudosa = true;
                l.avisos.push(`Unidad por confirmar: también encaja «${otraU.p.nombre}»`);
            }
            const otros = u.p.llenos - u.p.formas.unidad;
            if (otros) l.avisos.push(`«${u.p.nombre}»: ${miles(otros)} de ${miles(u.p.llenos)} valores no son una unidad (${u.p.formas.numero ? `${miles(u.p.formas.numero)} son números` : 'otros textos'})`);
        }
        l.confianza = Math.min(l.c.fraccion, d ? d.r.dependencia : 1, u ? u.r.dependencia : 1);
        for (const k of ['c', '_d', '_u', '_descripcion', '_unidad']) delete l[k];
    }
    lineas.sort((a, b) => (a.sufijo === '' ? -1 : b.sufijo === '' ? 1 : Number(a.sufijo) - Number(b.sufijo)));
    return { lineas, perfiles };
}

/**
 * Diccionario para el motor de partidas (misma forma que `diccionarioDSI`), a partir de lo
 * deducido. Las medidas nativas de Revit (Longitud, Área, Volumen…) se buscan como siempre.
 */
export function diccionarioDeducido(roles, claves) {
    const lineas = {};
    for (const l of roles.lineas) {
        // Dos listas de códigos con el mismo número de línea no se pisan: la segunda va aparte.
        let k = l.sufijo;
        for (let n = 2; k in lineas; n++) k = `${l.sufijo}#${n}`;
        lineas[k] = { codigo: l.codigo, ...(l.descripcion ? { nombre: l.descripcion } : {}), ...(l.unidad ? { unidad: l.unidad } : {}) };
    }
    return { lineas, nativas: diccionarioDSI(claves).nativas, hayDSI: Object.keys(lineas).length > 0, deducido: true };
}
