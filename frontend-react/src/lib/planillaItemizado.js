/**
 * planillaItemizado — cruzar el modelo con el itemizado de la obra (docs/visor/24, paso 3). Sin IA.
 *
 * El itemizado son 3 columnas: ítem, descripción y unidad (lo que más se parametriza en obra).
 * Las columnas se reconocen por sus VALORES, no por sus encabezados («ÍTEM», «Item», «Partida»…):
 *   ítem         la columna con más valores con forma de código;
 *   unidad       la columna con más valores con forma de unidad;
 *   descripción  la columna de texto con más palabras.
 *
 * Luego se cuenta, para cada parámetro del modelo, cuántos de sus códigos están en el itemizado
 * (exactos), cuántos son SUB-PARTIDAS de un ítem del itemizado (el modelo baja un nivel más:
 * 06.05.02.04.03.08 «FUSTE» dentro de 06.05.02.04.03 «BUZÓN T2») y cuántos no están; y cuántas
 * descripciones del modelo coinciden con las del itemizado (sin tildes, mayúsculas ni espacios
 * de más).
 */
import { esCodigo, esUnidad, formaDeValor } from './planillaPerfil.js';
import { normalizarUnidad, esRelleno } from './planillaPartidas.js';
import { compacto } from './inventoryBuscar.js';

const texto = v => String(v ?? '').trim();
const miles = n => n.toLocaleString('es-PE');
const pct = x => `${Math.round(x * 100)} %`;

/**
 * Lee el itemizado de una o varias hojas (cada hoja = filas de celdas). Elige la hoja con más ítems
 * que tenga las tres columnas. { items: [{item, descripcion, unidad}], hoja, columnas, porque } o null.
 */
export function leerItemizado(hojas) {
    let mejor = null;
    for (const [nombre, filas] of Object.entries(hojas)) {
        const ancho = Math.max(0, ...filas.map(f => f.length));
        const cuenta = Array.from({ length: ancho }, () => ({ codigo: 0, unidad: 0, texto: 0, palabras: 0 }));
        for (const fila of filas) {
            fila.forEach((v, i) => {
                const f = formaDeValor(v);
                if (f === 'codigo') cuenta[i].codigo++;
                else if (f === 'unidad') cuenta[i].unidad++;
                else if (f === 'texto') { cuenta[i].texto++; cuenta[i].palabras += texto(v).split(/\s+/).length; }
            });
        }
        const elegir = (k, excluir = []) => cuenta.reduce((m, c, i) => (!excluir.includes(i) && c[k] > (m < 0 ? 0 : cuenta[m][k]) ? i : m), -1);
        const cItem = elegir('codigo');
        const cUnidad = elegir('unidad', [cItem]);
        const cDesc = elegir('palabras', [cItem, cUnidad]);
        if (cItem < 0 || cDesc < 0) continue;
        const items = [];
        for (const fila of filas) {
            const item = texto(fila[cItem]);
            // En la columna de ítems, un número corto es un capítulo de primer nivel («06»).
            if (!esCodigo(item) && !/^\d{1,3}$/.test(item)) continue;
            items.push({
                item, descripcion: texto(fila[cDesc]).replace(/\s+/g, ' '),
                unidad: cUnidad >= 0 && esUnidad(fila[cUnidad]) ? texto(fila[cUnidad]) : '',
            });
        }
        // La que tiene más ítems con unidad (una hoja de cronograma repite los ítems sin unidad).
        const nota = items.length + items.filter(x => x.unidad).length;
        if (!mejor || nota > mejor.nota) mejor = { nota, items, hoja: nombre, columnas: { item: cItem, descripcion: cDesc, unidad: cUnidad } };
    }
    if (!mejor || !mejor.items.length) return null;
    return { items: mejor.items, hoja: mejor.hoja, columnas: mejor.columnas, porque: explicarOrigen(mejor) };
}

/** «Hoja «CAOV»: ítem en la columna B, descripción en la E, unidad en la F (6 ítems, 4 con unidad)». */
export function explicarOrigen({ hoja, columnas = {}, items = [] }) {
    const letra = i => (i == null || i < 0 ? '—' : String.fromCharCode(65 + i));
    return `Hoja «${hoja || '—'}»: ítem en la columna ${letra(columnas.item)}, descripción en la ${letra(columnas.descripcion)}, unidad en la ${letra(columnas.unidad)} (${miles(items.length)} ítems, ${miles(items.filter(x => x.unidad).length)} con unidad)`;
}

/** El código sin su último tramo: 06.05.02.04.03.08 → 06.05.02.04.03. */
const padreDe = c => { const i = Math.max(c.lastIndexOf('.'), c.lastIndexOf('-'), c.lastIndexOf('_')); return i > 0 ? c.slice(0, i) : ''; };

/**
 * El mismo código escrito con o sin ceros a la izquierda en cada tramo es el mismo ítem:
 * «02.01.01.04» = «2.1.1.4» (26-oct-2026: el itemizado de Interferencias viene sin ceros y el modelo
 * con ellos; comparando el texto tal cual, 3 de 80 códigos casaban, y así casan 50). Solo se tocan
 * los tramos que son números; las letras («OE.2») y los separadores se conservan.
 */
export function normalizarCodigo(c) {
    return String(c ?? '').trim().replace(/\d+/g, n => String(Number(n)));
}

/** Un Map de códigos que compara con `normalizarCodigo`: get/has/set aceptan el código como venga. */
class CodigosDelItemizado extends Map {
    get(k) { return super.get(normalizarCodigo(k)); }
    has(k) { return super.has(normalizarCodigo(k)); }
    set(k, v) { return super.set(normalizarCodigo(k), v); }
}

/** Índice del itemizado: por código (sin ceros a la izquierda) y por descripción compacta. */
export function indiceDeItemizado(items) {
    const porCodigo = new CodigosDelItemizado();
    const porDescripcion = new Map();
    for (const x of items) {
        porCodigo.set(x.item, { item: x.item, descripcion: x.descripcion, unidad: normalizarUnidad(x.unidad), unidadEscrita: x.unidad });
        const k = compacto(x.descripcion);
        if (k) { if (!porDescripcion.has(k)) porDescripcion.set(k, []); porDescripcion.get(k).push(x.item); }
    }
    /**
     * ¿Dónde está un código del modelo? { tipo: 'exacto'|'subpartida'|'fuera', item }
     * Sub-partida = su PADRE INMEDIATO está en el itemizado (el modelo baja un nivel: el FUSTE
     * dentro del buzón). Antes valía cualquier antecesor, y `04.15.03.05` pasaba por sub-partida
     * solo porque el capítulo `04` existe (24-oct-2026, acero del Canal).
     */
    // `item` es el código COMO LO ESCRIBE EL ITEMIZADO («2.1.1.4» aunque el modelo diga «02.01.01.04»):
    // así se compara con la lista del itemizado (partidas sin elementos) y se enseña el oficial.
    const ubicar = codigo => {
        const exacto = porCodigo.get(codigo);
        if (exacto) return { tipo: 'exacto', item: exacto.item };
        const p = padreDe(String(codigo ?? '').trim());
        const padre = p ? porCodigo.get(p) : null;
        if (padre) return { tipo: 'subpartida', item: padre.item };
        return { tipo: 'fuera', item: null };
    };
    return { porCodigo, porDescripcion, ubicar, total: items.length };
}

/**
 * Cuánto de cada parámetro del modelo está en el itemizado (sobre valores distintos).
 * [{ clave, nombre, tipo: 'codigo'|'descripcion', distintos, exactos, subpartidas, fuera, porque }]
 * ordenado de más a menos coincidencia.
 */
export function cruzarCampos(filas, perfiles, indice) {
    const out = [];
    for (const p of perfiles) {
        const esCampoCodigo = p.formas.codigo >= 3 && p.formas.codigo >= p.llenos * 0.5;
        const esCampoTexto = p.formas.texto >= 3 && p.palabrasMedia >= 3;
        if (!esCampoCodigo && !esCampoTexto) continue;
        const valores = new Set();
        for (const f of filas) { const v = texto(f[p.clave]); if (v && !esRelleno(v)) valores.add(v); }
        let exactos = 0, subpartidas = 0, fuera = 0;
        if (esCampoCodigo) {
            for (const v of valores) {
                if (!esCodigo(v)) continue;
                const u = indice.ubicar(v);
                if (u.tipo === 'exacto') exactos++; else if (u.tipo === 'subpartida') subpartidas++; else fuera++;
            }
            const n = exactos + subpartidas + fuera;
            if (!(exactos + subpartidas)) continue;
            out.push({
                clave: p.clave, nombre: p.nombre, tipo: 'codigo', distintos: n, exactos, subpartidas, fuera,
                porque: `«${p.nombre}»: de sus ${miles(n)} códigos, ${miles(exactos)} están en el itemizado y ${miles(subpartidas)} son sub-partidas de un ítem suyo (${pct((exactos + subpartidas) / n)})`,
            });
        } else {
            for (const v of valores) { if (indice.porDescripcion.has(compacto(v))) exactos++; else fuera++; }
            if (!exactos) continue;
            out.push({
                clave: p.clave, nombre: p.nombre, tipo: 'descripcion', distintos: valores.size, exactos, subpartidas: 0, fuera,
                porque: `«${p.nombre}»: ${miles(exactos)} de sus ${miles(valores.size)} textos son descripciones del itemizado (${pct(exactos / valores.size)})`,
            });
        }
    }
    return out.sort((a, b) => (b.exactos + b.subpartidas) / b.distintos - (a.exactos + a.subpartidas) / a.distintos || b.distintos - a.distintos);
}

/**
 * Lo que no cuadra entre el modelo (las partidas ya analizadas) y el itemizado:
 *   fuera            códigos del modelo que no están en el itemizado ni son sub-partida de un ítem;
 *   unidadDistinta   la unidad del modelo no es la del itemizado;
 *   descripcionDistinta  la descripción del modelo no es la del itemizado (sin tildes ni espacios);
 *   sinElementos     ítems del itemizado con unidad (partidas de verdad, no títulos) sin ningún
 *                    elemento en el modelo. Muchos son normales (lo que no se modela); se cuentan.
 */
export function diferencias(partidas, indice, items) {
    const fuera = [], unidadDistinta = [], descripcionDistinta = [];
    const enModelo = new Set();
    for (const p of partidas) {
        if (!p.codigo) continue;
        const u = indice.ubicar(p.codigo);
        if (u.tipo === 'fuera') { fuera.push(p); continue; }
        enModelo.add(u.item);
        if (u.tipo !== 'exacto') continue;
        const oficial = indice.porCodigo.get(p.codigo);
        if (oficial.unidad && p.unidadModelo && p.unidadModelo !== oficial.unidad) unidadDistinta.push({ p, oficial });
        if (oficial.descripcion && p.nombreModelo && compacto(p.nombreModelo) !== compacto(oficial.descripcion)) descripcionDistinta.push({ p, oficial });
    }
    const sinElementos = items.filter(x => x.unidad && !enModelo.has(x.item));
    return { fuera, unidadDistinta, descripcionDistinta, sinElementos };
}
