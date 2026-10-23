/**
 * El Excel de Inventory: exactamente lo que se ve en la tabla.
 *
 * Antes (hasta el 23-oct-2026) se exportaba lo que dejaba pasar Filters, sin
 * los filtros de la tabla, sin «Solo con metrado», sin el orden y con las
 * sumas antiguas («Σ Totals» a mano). Lo que se entregaba no era lo que se
 * había revisado en pantalla.
 *
 * Aquí no hay librería de Excel: se devuelven las hojas como filas de celdas
 * (números, fechas y textos) y la pantalla las escribe. Así se prueba en node.
 *
 *   Inventario          las filas visibles, en el orden visible (agrupadas si
 *                       hay grupos, con una columna por nivel) y, al final, el
 *                       cálculo de cada columna, el mismo del pie
 *   Totales por grupo   si hay grupos: una fila por grupo, con sus cálculos
 *   Criterios           qué se aplicó para obtenerlo (filtros, orden, grupos…)
 *
 * Números como números, con la unidad en la cabecera («Cotas › Área (m²)»);
 * una celda con otra unidad que la de su columna va como texto, para no
 * mezclar m² con m³ en una suma de Excel. Los códigos con ceros a la
 * izquierda («001») siguen siendo texto. Fechas como fechas.
 */
import * as T from './inventoryTabla.js';

const ANCHO_MAXIMO = 48;

// Una suma de miles de valores arrastra error de coma flotante (45.24500000000001).
// Doce cifras significativas sobran para cualquier metrado y lo quitan.
const limpio = n => (Number.isFinite(n) ? Number(n.toPrecision(12)) : n);

/** «Cotas › Área (m²)» si la columna es numérica con unidad; si no, su etiqueta. */
export function cabeceraDeColumna(columna, tipo) {
    const etiqueta = columna.header || T.etiquetaDeColumna(columna.key);
    return tipo && tipo.tipo === 'numero' && tipo.unidad ? `${etiqueta} (${tipo.unidad})` : etiqueta;
}

/** Valor de una celda para Excel: número, fecha (Date local) o texto. */
export function celdaParaExcel(raw, tipo) {
    const v = T.leerValor(raw);
    if (v.tipo === 'vacio') return '';
    if (v.tipo === 'numero') {
        const codigo = /^-?0\d/.test(v.texto) && !/[.,]/.test(v.texto);
        if (!codigo && tipo && tipo.tipo === 'numero' && v.unidad === (tipo.unidad || '')) return v.num;
        return T.textoDeCelda(raw).texto;
    }
    if (v.tipo === 'fecha') {
        // A medianoche LOCAL: un Date en UTC se escribiría el día anterior en Perú.
        const d = new Date(v.fecha);
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    return v.texto;
}

/** Resultado de un cálculo como celda: número si es de una sola unidad (la de la columna). */
function celdaDeResultado(resultado, tipo) {
    if (!resultado) return '';
    const unidades = Object.keys(resultado.porUnidad);
    if (!unidades.length) return '';
    const unidadColumna = tipo && tipo.tipo === 'numero' ? (tipo.unidad || '') : '';
    if (unidades.length === 1 && (unidades[0] === unidadColumna || resultado.calculo === 'recuento' || resultado.calculo === 'distintos')) {
        return limpio(resultado.porUnidad[unidades[0]]);
    }
    return T.textoDeResultado(resultado);
}

function anchos(filas) {
    const w = [];
    for (const fila of filas.slice(0, 400)) {
        fila.forEach((c, i) => {
            const largo = c instanceof Date ? 10 : String(c ?? '').length;
            w[i] = Math.min(ANCHO_MAXIMO, Math.max(w[i] || 8, largo + 2));
        });
    }
    return w;
}

/** Filas en el orden de la pantalla, con el valor de cada nivel de grupo delante. */
function filasEnOrden(filas, niveles) {
    if (!niveles.length) return filas.map(fila => ({ fila, grupos: [] }));
    const out = [];
    const recorrer = (grupos, ruta) => {
        for (const g of grupos) {
            const r = [...ruta, g.valor];
            if (g.hijos.length) recorrer(g.hijos, r);
            else for (const fila of g.filas) out.push({ fila, grupos: r });
        }
    };
    recorrer(T.agrupar(filas, niveles), []);
    return out;
}

/**
 * entrada = {
 *   filas, columnas: [{key, header}], tipos: {campo: {tipo, unidad}}, calculos: {campo: calculo},
 *   niveles: [campo…], criterios: { filtroTabla, soloConMetrado, camposSuma, orden, totalTrasFilters, ambito, fecha }
 * }
 * Devuelve [{ nombre, filas: [[celda…]], anchos, filtroHasta }] (filtroHasta = última fila con datos
 * para el autofiltro de Excel, 1-based; null si no aplica).
 */
export function libroDeLaTabla({ filas, columnas, tipos = {}, calculos = {}, niveles = [], criterios = {} }) {
    const hojas = [];

    // ── Inventario ──
    const cabeceraGrupos = niveles.map(n => `Grupo · ${T.etiquetaDeColumna(n)}`);
    const cabecera = [...cabeceraGrupos, ...columnas.map(c => cabeceraDeColumna(c, tipos[c.key]))];
    const cuerpo = filasEnOrden(filas, niveles).map(({ fila, grupos }) =>
        [...grupos, ...columnas.map(c => celdaParaExcel(fila[c.key], tipos[c.key]))]);
    const inventario = [cabecera, ...cuerpo];
    const conCalculo = columnas.filter(c => calculos[c.key]);
    if (conCalculo.length) {
        const nombres = [...niveles.map(() => ''), ...columnas.map(c => calculos[c.key] ? T.NOMBRE_CALCULO_LARGO[calculos[c.key]] : '')];
        const valores = [...niveles.map(() => ''), ...columnas.map(c => calculos[c.key] ? celdaDeResultado(T.calcular(filas, c.key, calculos[c.key]), tipos[c.key]) : '')];
        // La etiqueta de las dos filas va en la primera celda libre de la izquierda.
        const libre = nombres.findIndex(n => n === '');
        if (libre >= 0) { nombres[libre] = 'Cálculo'; valores[libre] = `Resultado (${filas.length} filas)`; }
        inventario.push([], nombres, valores);
    }
    hojas.push({ nombre: 'Inventario', filas: inventario, anchos: anchos(inventario), filtroHasta: cuerpo.length + 1 });

    // ── Totales por grupo ──
    if (niveles.length) {
        const cab = [...niveles.map(n => T.etiquetaDeColumna(n)), 'Elementos',
            ...conCalculo.map(c => `${T.NOMBRE_CALCULO_LARGO[calculos[c.key]]} · ${cabeceraDeColumna(c, tipos[c.key])}`)];
        const grupos = [];
        const recorrer = (lista, ruta) => {
            for (const g of lista) {
                const r = [...ruta, g.valor];
                grupos.push([...r, ...niveles.slice(r.length).map(() => ''), g.n,
                    ...conCalculo.map(c => celdaDeResultado(g.totales[c.key], tipos[c.key]))]);
                recorrer(g.hijos, r);
            }
        };
        recorrer(T.agrupar(filas, niveles, Object.fromEntries(conCalculo.map(c => [c.key, calculos[c.key]]))), []);
        const hoja = [cab, ...grupos];
        hojas.push({ nombre: 'Totales por grupo', filas: hoja, anchos: anchos(hoja), filtroHasta: grupos.length + 1 });
    }

    // ── Criterios ──
    const c = criterios;
    const filtroTexto = T.describirFiltro(c.filtroTabla);
    const lineas = [
        ['Criterio', 'Valor'],
        ['Exportado', c.fecha instanceof Date ? c.fecha : new Date()],
        ...(c.ambito ? [['Ámbito', c.ambito]] : []),
        ['Filas exportadas', Number.isFinite(c.totalTrasFilters) ? `${filas.length} de ${c.totalTrasFilters} (tras Filters)` : filas.length],
        ['Filtros de la tabla', filtroTexto || 'ninguno'],
        ['Solo con metrado', c.soloConMetrado ? `sí · cantidad ≠ 0 en ${(c.camposSuma || []).map(T.etiquetaDeColumna).join(', ')}` : 'no'],
        ['Orden', (c.orden || []).length ? c.orden.map(o => `${T.etiquetaDeColumna(o.campo)} ${o.dir === 'desc' ? '↓' : '↑'}`).join(', ') : 'el del modelo'],
        ['Agrupado por', niveles.length ? niveles.map(T.etiquetaDeColumna).join(' › ') : 'sin agrupar'],
        ['Columnas', columnas.length],
        // Una línea por tipo de cálculo, no una por columna (con cientos de columnas no se lee).
        ...T.CALCULOS.map(calc => {
            const cols = conCalculo.filter(col => calculos[col.key] === calc);
            return cols.length ? [`Cálculo · ${T.NOMBRE_CALCULO_LARGO[calc]}`, `${cols.length} ${cols.length === 1 ? 'columna' : 'columnas'}: ${cols.map(col => cabeceraDeColumna(col, tipos[col.key])).join('; ')}`] : null;
        }).filter(Boolean),
        ['Nota', 'Números sin unidad: la unidad está en la cabecera. Una celda con otra unidad que la de su columna va como texto y no entra en las sumas de Excel.'],
    ];
    hojas.push({ nombre: 'Criterios', filas: lineas, anchos: [28, 90], filtroHasta: null });
    return hojas;
}
