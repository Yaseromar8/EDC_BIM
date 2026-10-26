/**
 * planillaPlantilla — la vista Partidas en el ORDEN DEL ITEMIZADO, como una plantilla (docs/visor/33).
 * Sin IA.
 *
 * El itemizado que sube el administrador es la plantilla: todas sus filas, en el orden del Excel,
 * con sus títulos. Cada partida lleva lo que el modelo tiene de ella; si no tiene nada, la fila queda
 * VACÍA y visible (para el revisor eso es información: ese metrado no sale del modelo).
 *
 *   título    fila sin unidad. Enseña «x de y con dato» de las partidas que contiene, no una suma
 *             (mezclaría m, m³ y kg).
 *   partida   fila con unidad. Sus datos = las partidas del modelo con ese código (con o sin ceros a la
 *             izquierda) y, debajo, las SUB-PARTIDAS del modelo (un nivel más que el itemizado).
 *   fuera     partidas del modelo que no están en el itemizado: un bloque aparte, al final.
 *
 * El nivel de cada fila sale de los tramos de su código (01 · 01.01 · 01.01.01), y lo que contiene un
 * título, del ORDEN: las filas que le siguen hasta el próximo título de su nivel o superior. Nada
 * depende de la obra ni del idioma; un itemizado sin títulos es una lista plana en su orden.
 */
import { normalizarCodigo } from './planillaItemizado.js';
import { compacto } from './inventoryBuscar.js';

/** 1 para «01», 2 para «01.01»… (sin tramos: 1). */
export const nivelDe = item => Math.max(1, String(normalizarCodigo(item)).split(/[.\-_\s]+/).filter(Boolean).length);

const limpio = n => Number(Number(n).toPrecision(12));

/** Varias partidas del modelo que son el mismo ítem (p. ej. «02.01.01.04» y «2.1.1.4»): una sola suma. */
export function unirPartidas(lista) {
    if (!lista.length) return null;
    if (lista.length === 1) return lista[0];
    const claves = [...new Set(lista.flatMap(p => p.claves))];
    const medidoCon = new Map();
    for (const p of lista) for (const m of p.medidoCon || []) {
        const e = medidoCon.get(m.clave) || { clave: m.clave, n: 0, suma: 0 };
        e.n += m.n; e.suma += m.suma; medidoCon.set(m.clave, e);
    }
    const suma = k => lista.reduce((s, p) => s + (p[k] || 0), 0);
    return {
        ...lista[0],
        clave: lista.map(p => p.clave).join('+'),
        elementos: suma('elementos'), conMedida: suma('conMedida'), sinMedida: suma('sinMedida'),
        cantidad: limpio(suma('cantidad')), manual: limpio(suma('manual')), conManual: suma('conManual'),
        porCriterio: suma('porCriterio'), conflictos: suma('conflictos'), unidadDistinta: suma('unidadDistinta'),
        intercambiadas: suma('intercambiadas'),
        origenes: [...new Set(lista.flatMap(p => p.origenes))],
        medidoCon: [...medidoCon.values()].map(e => ({ ...e, suma: limpio(e.suma) })).sort((a, b) => b.n - a.n),
        claves, unidas: lista.length,
    };
}

/**
 * La plantilla. `items` = el itemizado en su orden; `partidas` = las del modelo (planillaPartidas);
 * `indice` = indiceDeItemizado(items).
 * { filas: [titulo|partida], fuera: [partida], resumen: { partidas, conDato, titulos, fuera } }
 *   titulo  { tipo:'titulo', item, descripcion, nivel, total, conDato, hasta }  (hasta = índice exclusivo)
 *   partida { tipo:'partida', item, descripcion, unidad, nivel, datos (o null), sub: [partida], conDato }
 */
export function plantillaDelItemizado(items, partidas, indice) {
    const exactas = new Map(), sub = new Map(), fuera = [];
    for (const p of partidas) {
        const u = p.codigo ? indice.ubicar(p.codigo) : { tipo: 'fuera' };
        if (u.tipo === 'fuera') { fuera.push(p); continue; }
        const m = u.tipo === 'exacto' ? exactas : sub;
        if (!m.has(u.item)) m.set(u.item, []);
        m.get(u.item).push(p);
    }
    const filas = items.map(x => {
        const nivel = nivelDe(x.item);
        if (!x.unidad) return { tipo: 'titulo', item: x.item, descripcion: x.descripcion, nivel, total: 0, conDato: 0, hasta: 0 };
        const datos = unirPartidas(exactas.get(x.item) || []);
        const hijas = sub.get(x.item) || [];
        return { tipo: 'partida', item: x.item, descripcion: x.descripcion, unidad: x.unidad, nivel, datos, sub: hijas, conDato: !!(datos || hijas.length) };
    });
    // Un título contiene lo que le sigue hasta el próximo título de su nivel o superior.
    const abiertos = [];
    filas.forEach((f, i) => {
        if (f.tipo === 'titulo') {
            while (abiertos.length && abiertos.at(-1).nivel >= f.nivel) abiertos.pop().hasta = i;
            abiertos.push(f);
            return;
        }
        for (const t of abiertos) { t.total++; if (f.conDato) t.conDato++; }
    });
    for (const t of abiertos) t.hasta = filas.length;
    const deUnidad = filas.filter(f => f.tipo === 'partida');
    return {
        filas, fuera,
        resumen: { partidas: deUnidad.length, conDato: deUnidad.filter(f => f.conDato).length, titulos: filas.length - deUnidad.length, fuera: fuera.length },
    };
}

/**
 * Qué filas se ven. Por defecto TODAS, desplegadas, como en un Excel.
 *   plegados   Set de índices de títulos plegados a mano (se ocultan sus filas);
 *   soloConDato  oculta las partidas sin dato y los títulos sin ninguna;
 *   texto      con texto en el buscador, las partidas cuyo código o descripción lo contienen, o con
 *              dato en lo buscado, y sus títulos.
 * Devuelve los índices visibles, en orden.
 */
export function filasVisibles(plantilla, { plegados = new Set(), soloConDato = false, texto = '' } = {}) {
    const { filas } = plantilla;
    const lineas = String(texto || '').split(/\r?\n/).map(compacto).filter(Boolean);
    const casa = f => !lineas.length || f.conDato || lineas.some(q => compacto(`${f.item} ${f.descripcion}`).includes(q));
    const pasa = f => f.tipo === 'partida' && (!soloConDato || f.conDato) && casa(f);
    // Un título se ve si alguna de sus partidas se ve (o, sin filtros, siempre).
    const hayFiltro = soloConDato || lineas.length > 0;
    const visible = new Array(filas.length).fill(false);
    filas.forEach((f, i) => { if (f.tipo === 'partida') visible[i] = pasa(f); });
    filas.forEach((f, i) => {
        if (f.tipo !== 'titulo') return;
        if (!hayFiltro) { visible[i] = true; return; }
        for (let j = i + 1; j < f.hasta; j++) if (visible[j] && filas[j].tipo === 'partida') { visible[i] = true; break; }
        if (!visible[i] && lineas.length && !soloConDato && lineas.some(q => compacto(`${f.item} ${f.descripcion}`).includes(q))) visible[i] = true;
    });
    const out = [];
    for (let i = 0; i < filas.length; i++) {
        if (!visible[i]) continue;
        out.push(i);
        if (filas[i].tipo === 'titulo' && plegados.has(i)) {
            // Plegado a mano: se salta lo que contiene.
            i = filas[i].hasta - 1;
        }
    }
    return out;
}

/** Todos los elementos de las partidas bajo un título (para aislarlos en 3D). */
export function clavesDelTitulo(plantilla, i) {
    const t = plantilla.filas[i];
    const s = new Set();
    for (let j = i + 1; j < t.hasta; j++) {
        const f = plantilla.filas[j];
        if (f.tipo !== 'partida') continue;
        for (const k of f.datos?.claves || []) s.add(k);
        for (const p of f.sub) for (const k of p.claves) s.add(k);
    }
    return [...s];
}
