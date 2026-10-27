/**
 * Vista «Partidas» de la Planilla: de elementos a líneas de partida.
 *
 * La parametrización DSI (docs/visor/23) da a cada elemento hasta seis líneas
 * de partida —sin número y del 1 al 5—; la línea i reúne:
 *   03_05_DSI_CodigoDePartida{i} · 03_04_DSI_NombreDePartida{i} · 02_01_DSI_Unidad{i}
 *   cantidad manual: 02_02 Longitud{i} · 02_04 Area{i} · 02_05 Volumen{i} · 02_06 Peso{i}
 *   fechas: 04_17 InicioProgramado{i} · 04_18 InicioReal{i} · 04_19 FinProgramado{i} · 04_20 FinReal{i}
 *
 * Regla del propietario (24-oct-2026): la cantidad es la MEDIDA NATIVA de Revit
 * según la unidad de la línea; lo manual se enseña aparte y nunca se suma con lo
 * nativo.
 *   m  → Cotas › Longitud          m² → Cotas › Área          m³ → Cotas › Volumen
 *   kg → Longitud total de barra (nativa) × kg/m del diámetro de barra (nativo, tabla normativa)
 *   und → 1 por elemento         glb → 1 en total (global), por muchos elementos que lleve
 * Si el elemento NO tiene medida nativa, la dan los criterios de medida de la obra (`dic.criterios`,
 * lib/criteriosDeMedida.js, docs/visor/32): «la partida 01.02 se mide con Cotas › Long. Reja». Solo
 * rellenan lo que falta; la nativa manda siempre.
 * Sin IA: el diccionario se lee de los nombres de los parámetros y las reglas
 * son fijas y visibles.
 */

import { leerValor } from './inventoryTabla.js';

const CAMPOS_DSI = /^\d\d_\d\d_DSI_(CodigoDePartida|NombreDePartida|Unidad|Longitud|Area|Volumen|Peso|InicioProgramado|InicioReal|FinProgramado|FinReal)(\d?)$/;

// Medidas nativas de Revit, en español y en inglés (el nombre, sin el grupo).
const NATIVAS = {
    longitud: ['Longitud', 'Length'],
    area: ['Área', 'Area'],
    volumen: ['Volumen', 'Volume'],
    longitudBarra: ['Longitud total de barra', 'Total Bar Length'],
    diametroBarra: ['Diámetro de barra', 'Bar Diameter'],
};

// Peso nominal del acero corrugado por diámetro (kg/m), en pulgadas.
export const KG_POR_METRO = { 0.25: 0.250, 0.375: 0.560, 0.5: 0.994, 0.625: 1.552, 0.75: 2.235, 0.875: 3.042, 1: 3.973, 1.375: 7.907 };

// Valores de relleno que se ponen donde no hay dato: no son partida ni unidad.
const RELLENOS = new Set(['0', 'na', 'n/a', '-', '--', '—', 'ninguno', '<ninguno>', 'none', 's/n']);
export const esRelleno = v => RELLENOS.has(String(v ?? '').trim().toLowerCase());
const textoDe = v => { const t = String(v ?? '').trim(); return esRelleno(t) ? '' : t; };

const nombreDe = clave => String(clave).split('::').pop();

/** Unidad escrita de cualquier forma («Kg», «m2», «M3», «und») → m · m² · m³ · kg · und · '' */
export function normalizarUnidad(u) {
    const s = String(u ?? '').trim().toLowerCase().replace('^', '').replace(/[.]+$/, '');
    if (!s || esRelleno(s)) return '';
    if (s === 'm' || s === 'ml' || s === 'm.l.') return 'm';
    if (s === 'm2' || s === 'm²') return 'm²';
    if (s === 'm3' || s === 'm³') return 'm³';
    if (s === 'kg' || s === 'kgs') return 'kg';
    // «glb» (global) NO es «und»: vale 1 en total, no 1 por elemento (26-oct-2026: salía como und).
    if (s === 'glb' || s === 'gbl' || s === 'global') return 'glb';
    if (s === 'und' || s === 'u' || s === 'unid' || s === 'pza') return 'und';
    return s; // se enseña tal cual («01», «0»): unidad no reconocida
}

// Números con el mismo lector del motor de la tabla (comas, miles, unidades).
const numero = v => {
    const r = leerValor(v);
    if (r.tipo === 'numero') return r.num;
    // Unidades que el lector no conoce («0.500 fractional-in» del diámetro de barra).
    const m = /^-?[0-9]+([.,][0-9]+)? /.exec(String(v ?? '').trim() + ' ');
    return m ? parseFloat(m[0].replace(',', '.')) : 0;
};

/**
 * Diccionario a partir de las claves de las filas («Datos::02_01_DSI_Unidad1»…):
 * { lineas: { '': {codigo, nombre, unidad, …}, '1': {…} }, nativas: {longitud: clave…} }
 */
export function diccionarioDSI(claves) {
    const lineas = {};
    for (const clave of claves) {
        const m = CAMPOS_DSI.exec(nombreDe(clave));
        if (!m) continue;
        const [, campo, i] = m;
        const l = lineas[i] || (lineas[i] = {});
        const k = { CodigoDePartida: 'codigo', NombreDePartida: 'nombre', Unidad: 'unidad', Longitud: 'manualM', Area: 'manualM2', Volumen: 'manualM3', Peso: 'manualKg', InicioProgramado: 'inicioProgramado', InicioReal: 'inicioReal', FinProgramado: 'finProgramado', FinReal: 'finReal' }[campo];
        if (!l[k]) l[k] = clave;
    }
    const nativas = {};
    for (const [rol, nombres] of Object.entries(NATIVAS)) {
        nativas[rol] = claves.find(c => c.includes('::') && nombres.includes(nombreDe(c)) && /^(Cotas|Dimensions)::/.test(c))
            || claves.find(c => c.includes('::') && nombres.includes(nombreDe(c))) || null;
    }
    // El kg/m declarado por elemento (02_06_DSI_Peso sin número) solo se usa para avisar.
    const kgPorMetroDeclarado = claves.find(c => nombreDe(c) === '02_06_DSI_Peso') || null;
    return { lineas, nativas, kgPorMetroDeclarado, hayDSI: Object.values(lineas).some(l => l.codigo || l.nombre) };
}

/** Cantidad nativa de una línea según su unidad. { valor, origen, detalle } o null si no hay. */
export function cantidadNativa(fila, unidad, nativas) {
    if (unidad === 'und') return { valor: 1, origen: 'conteo', detalle: '1 por elemento' };
    // Global: cada elemento «tiene» la partida; la partida vale 1 en total (se ajusta al sumar).
    if (unidad === 'glb') return { valor: 1, origen: 'global', detalle: 'global' };
    const de = rol => (nativas[rol] ? numero(fila[nativas[rol]]) : 0);
    if (unidad === 'm') { const v = de('longitud'); return v > 0 ? { valor: v, origen: 'nativa', detalle: 'Longitud' } : null; }
    if (unidad === 'm²') { const v = de('area'); return v > 0 ? { valor: v, origen: 'nativa', detalle: 'Área' } : null; }
    if (unidad === 'm³') { const v = de('volumen'); return v > 0 ? { valor: v, origen: 'nativa', detalle: 'Volumen' } : null; }
    if (unidad === 'kg') {
        const L = de('longitudBarra');
        const d = de('diametroBarra');
        const kgm = KG_POR_METRO[d];
        return L > 0 && kgm ? { valor: L * kgm, origen: 'calculada', detalle: `long. total ${L} m × ${kgm} kg/m (Ø ${d}")` } : null;
    }
    return null;
}

const MANUAL_POR_UNIDAD = { m: 'manualM', 'm²': 'manualM2', 'm³': 'manualM3', kg: 'manualKg' };

// Un código de partida: «06.02.01.03.07» (pares de cifras separados por puntos).
export const esCodigoDePartida = c => /^[0-9]{2}([.][0-9]{2})+$/.test(String(c ?? '').trim());

/** Las líneas tal como están en el elemento (con código y nombre puestos al derecho). */
function lineasCrudas(fila, dic) {
    const out = [];
    for (const [i, l] of Object.entries(dic.lineas)) {
        let codigo = l.codigo ? textoDe(fila[l.codigo]) : '';
        let nombre = l.nombre ? textoDe(fila[l.nombre]) : '';
        if (!codigo && !nombre) continue;
        // Medido en Drenaje: 67 líneas con la descripción en CodigoDePartida y el
        // código en NombreDePartida. Se leen al derecho y quedan marcadas.
        const intercambiado = !esCodigoDePartida(codigo) && esCodigoDePartida(nombre) && !!codigo;
        if (intercambiado) [codigo, nombre] = [nombre, codigo];
        // Con itemizado cargado, la unidad y la descripción OFICIALES son las suyas; las del
        // modelo se guardan para compararlas (docs/visor/24, paso 3).
        const unidadModelo = normalizarUnidad(l.unidad ? fila[l.unidad] : '');
        const oficial = dic.itemizado && codigo ? dic.itemizado.porCodigo.get(codigo) : null;
        const unidad = oficial?.unidad || unidadModelo;
        const nombreModelo = nombre;
        if (oficial?.descripcion) nombre = oficial.descripcion;
        let medida = cantidadNativa(fila, unidad, dic.nativas);
        // Sin medida nativa: el criterio de medida de la obra, si hay uno para esta línea.
        let sinMedidaPor = null;
        if (!medida && dic.criterios) {
            const r = dic.criterios.cantidad(fila, codigo, unidad);
            if (r?.valor != null) medida = r;
            else if (r) sinMedidaPor = r;
        }
        const claveManual = l[MANUAL_POR_UNIDAD[unidad]];
        const manual = claveManual ? numero(fila[claveManual]) : 0;
        out.push({
            linea: i || '0', codigo, nombre, unidad, intercambiado, unidadModelo, nombreModelo, oficial: !!oficial,
            cantidad: medida ? medida.valor : null, origen: medida ? medida.origen : null, detalle: medida ? medida.detalle : '',
            medidoCon: medida?.origen === 'criterio' || medida?.origen === 'a mano' ? (medida.medido || medida.clave) : null, sinMedidaPor,
            criterio: medida?.criterio || sinMedidaPor?.criterio || null,
            manual: manual > 0 ? manual : null,
            inicioReal: l.inicioReal ? fila[l.inicioReal] ?? '' : '', finReal: l.finReal ? fila[l.finReal] ?? '' : '',
            inicioProgramado: l.inicioProgramado ? fila[l.inicioProgramado] ?? '' : '', finProgramado: l.finProgramado ? fila[l.finProgramado] ?? '' : '',
        });
    }
    return out;
}

/**
 * Las líneas de un elemento, ordenadas como manda el estándar (medido en Drenaje):
 *   - la línea sin número que es PREFIJO de las numeradas es la partida PADRE
 *     (06.05.02.04.03 «BUZON TIPO T2» → 06.05.02.04.03.08 «FUSTE…»): encabeza,
 *     no suma (151 elementos);
 *   - si repite una numerada (576 elementos) o se repite cualquier partida
 *     dentro del mismo elemento (589 líneas), cuenta UNA vez;
 *   - si está sola, es una línea más.
 * { lineas, padre, repetidas, intercambiadas }
 */
export function analizarElemento(fila, dic) {
    const crudas = lineasCrudas(fila, dic);
    const sinNumero = crudas.find(l => l.linea === '0');
    const numeradas = crudas.filter(l => l.linea !== '0');
    let padre = null;
    let candidatas = numeradas;
    if (sinNumero) {
        const esPadre = esCodigoDePartida(sinNumero.codigo) && numeradas.some(h => h.codigo.startsWith(sinNumero.codigo + '.'));
        if (esPadre) padre = { codigo: sinNumero.codigo, nombre: sinNumero.nombre };
        else candidatas = [sinNumero, ...numeradas];
    }
    const vistas = new Map();
    const lineas = [];
    let repetidas = 0;
    for (const l of candidatas) {
        const k = l.codigo ? `c|${l.codigo}` : `n|${l.nombre}|${l.unidad}`;
        const previa = vistas.get(k);
        if (previa) {
            repetidas++;
            // Se completa lo que le falte a la primera (unidad y cantidad, nombre).
            if (!previa.unidad && l.unidad) Object.assign(previa, { unidad: l.unidad, cantidad: l.cantidad, origen: l.origen, detalle: l.detalle, manual: l.manual,
                medidoCon: l.medidoCon, sinMedidaPor: l.sinMedidaPor, criterio: l.criterio });
            if (!previa.nombre && l.nombre) previa.nombre = l.nombre;
            continue;
        }
        vistas.set(k, l);
        lineas.push(l);
    }
    if (padre) for (const l of lineas) if (l.codigo.startsWith(padre.codigo + '.')) l.padre = padre;
    return { lineas, padre, repetidas, intercambiadas: crudas.filter(l => l.intercambiado).length };
}

/** Las líneas de partida de un elemento (ya ordenadas: sin padre ni repetidas). */
export function lineasDePartida(fila, dic) {
    return analizarElemento(fila, dic).lineas;
}

// Primero los códigos de partida (06.02…), luego los que son texto y al final las sin código.
const rangoDeCodigo = c => (!c ? 2 : /^[0-9]/.test(c) ? 0 : 1);

const limpio = n => Number(Number(n).toPrecision(12));

/**
 * Una fila por partida (código + nombre + unidad) sobre las filas dadas.
 * [{ clave, codigo, nombre, unidad, elementos, conMedida, sinMedida, cantidad, manual, conManual, claves: [clave de fila…] }]
 * `claveDeFila(fila)` identifica el elemento (para seleccionarlo en 3D).
 */
export function analizarPartidas(filas, dic, claveDeFila) {
    const mapa = new Map();
    const calidad = { intercambiadas: 0, repetidas: 0, conPadre: 0 };
    for (const fila of filas) {
        const a = analizarElemento(fila, dic);
        calidad.intercambiadas += a.intercambiadas;
        calidad.repetidas += a.repetidas;
        if (a.padre) calidad.conPadre++;
        for (const l of a.lineas) {
            // Una partida = su código y su unidad (sin código: su nombre y su unidad). Las
            // variantes de redacción del nombre no la parten: se enseña el más usado.
            const clave = l.codigo ? `${l.codigo}|${l.unidad}` : `|${l.nombre}|${l.unidad}`;
            const p = mapa.get(clave) || mapa.set(clave, {
                clave, codigo: l.codigo, nombre: l.nombre, unidad: l.unidad, nombres: new Map(), padres: new Map(), intercambiadas: 0,
                unidadesModelo: new Map(), nombresModelo: new Map(), oficial: false,
                elementos: 0, conMedida: 0, sinMedida: 0, cantidad: 0, manual: 0, conManual: 0, origenes: new Set(), claves: [],
                porCriterio: 0, medidoCon: new Map(), conflictos: 0, unidadDistinta: 0, criterioSinValor: 0,
            }).get(clave);
            if (l.nombre) p.nombres.set(l.nombre, (p.nombres.get(l.nombre) || 0) + 1);
            if (l.padre) { const kp = l.padre.codigo; const e = p.padres.get(kp) || { ...l.padre, n: 0 }; e.n++; p.padres.set(kp, e); }
            if (l.intercambiado) p.intercambiadas++;
            if (l.oficial) p.oficial = true;
            if (l.unidadModelo) p.unidadesModelo.set(l.unidadModelo, (p.unidadesModelo.get(l.unidadModelo) || 0) + 1);
            if (l.nombreModelo) p.nombresModelo.set(l.nombreModelo, (p.nombresModelo.get(l.nombreModelo) || 0) + 1);
            p.elementos++;
            p.claves.push(claveDeFila(fila));
            if (l.cantidad != null) { p.conMedida++; p.cantidad += l.cantidad; p.origenes.add(l.origen); } else p.sinMedida++;
            if (l.medidoCon) {
                p.porCriterio++;
                const e = p.medidoCon.get(l.medidoCon) || { n: 0, suma: 0 };
                e.n++; e.suma += l.cantidad; p.medidoCon.set(l.medidoCon, e);
            }
            if (l.sinMedidaPor?.motivo === 'conflicto') p.conflictos++;
            else if (l.sinMedidaPor?.motivo === 'unidad') p.unidadDistinta++;
            else if (l.sinMedidaPor?.motivo === 'sin-valor') p.criterioSinValor++;
            if (l.manual != null) { p.conManual++; p.manual += l.manual; }
        }
    }
    const masUsado = m => [...m].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    const partidas = [...mapa.values()].map(({ nombres, padres, unidadesModelo, nombresModelo, medidoCon, ...p }) => {
        const padre = [...padres.values()].sort((x, y) => y.n - x.n)[0] || null;
        return {
            medidoCon: [...medidoCon].map(([clave, e]) => ({ clave, n: e.n, suma: limpio(e.suma) })).sort((a, b) => b.n - a.n),
            unidadModelo: masUsado(unidadesModelo), nombreModelo: masUsado(nombresModelo),
            ...p, cantidad: p.unidad === 'glb' ? (p.conMedida ? 1 : 0) : limpio(p.cantidad), manual: limpio(p.manual), origenes: [...p.origenes],
            nombre: [...nombres].sort((a, b) => b[1] - a[1])[0]?.[0] || p.nombre, variantesDeNombre: nombres.size,
            padre: padre ? { codigo: padre.codigo, nombre: padre.nombre } : null,
        };
    }).sort((a, b) => (rangoDeCodigo(a.codigo) - rangoDeCodigo(b.codigo))
        || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }) || a.nombre.localeCompare(b.nombre, 'es'));
    return { partidas, calidad };
}

export function partidasDe(filas, dic, claveDeFila) {
    return analizarPartidas(filas, dic, claveDeFila).partidas;
}

/**
 * Encabezados para ordenar la tabla como un presupuesto:
 *   - si la partida tiene padre (línea sin número que la contiene): el padre;
 *   - si no, su capítulo = el código sin su último tramo (06.02.01.03.07 → 06.02.01.03);
 *   - sin código: «Sin código».
 * [{ clave, codigo, nombre, tipo: 'padre'|'capitulo'|'sin', partidas }]
 */
export function grupoDe(p, nombresPorCodigo = new Map()) {
    if (p.padre) return { clave: `p|${p.padre.codigo}`, codigo: p.padre.codigo, nombre: p.padre.nombre, tipo: 'padre' };
    if (esCodigoDePartida(p.codigo) && p.codigo.includes('.')) {
        const cap = p.codigo.slice(0, p.codigo.lastIndexOf('.'));
        return { clave: `c|${cap}`, codigo: cap, nombre: nombresPorCodigo.get(cap) || '', tipo: 'capitulo' };
    }
    return { clave: 's|', codigo: '', nombre: 'Sin código', tipo: 'sin' };
}

export function gruposDePartidas(partidas, itemizado = null) {
    const nombresPorCodigo = new Map();
    for (const p of partidas) if (p.padre?.nombre) nombresPorCodigo.set(p.padre.codigo, p.padre.nombre);
    const grupos = new Map();
    for (const p of partidas) {
        const g = grupoDe(p, nombresPorCodigo);
        // Con itemizado, el capítulo o el padre llevan su descripción oficial.
        const oficial = itemizado?.porCodigo.get(g.codigo)?.descripcion;
        if (oficial) g.nombre = oficial;
        if (!grupos.has(g.clave)) grupos.set(g.clave, { ...g, partidas: [] });
        grupos.get(g.clave).partidas.push(p);
    }
    return [...grupos.values()].sort((a, b) => ((a.tipo === 'sin') - (b.tipo === 'sin'))
        || a.codigo.localeCompare(b.codigo, 'es', { numeric: true }));
}

/**
 * Hojas de Excel de la vista Partidas: la tabla (cantidades como números) y los
 * criterios (ámbito y regla de cantidad). Mismo formato que lib/inventoryExport.
 */
export function hojasDePartidas(partidas, { ambito = '', fecha = new Date(), criterios: deMedida = [] } = {}) {
    const cab = ['Grupo', 'Nombre del grupo', 'Código', 'Partida', 'Unidad', 'Cantidad', 'Origen', 'Elementos', 'Sin medida', 'Manual (aparte)', 'Elementos con manual'];
    const origen = p => p.origenes.map(o => (o === 'criterio' || o === 'a mano'
        ? `${o}: ${p.medidoCon.map(m => String(m.clave).split('::').pop()).join(', ')}` : o)).join(', ');
    const filas = gruposDePartidas(partidas).flatMap(g => g.partidas.map(p => [
        g.codigo, g.nombre, p.codigo, p.nombre, p.unidad, p.conMedida ? p.cantidad : '', origen(p),
        p.elementos, p.sinMedida, p.conManual ? p.manual : '', p.conManual,
    ]));
    const tabla = [cab, ...filas];
    const anchos = [16, 40, 18, 60, 8, 16, 12, 11, 17, 16, 20];
    const criterios = [
        ['Criterio', 'Valor'],
        ['Exportado', fecha],
        ['Ámbito', ambito || 'filas de la tabla'],
        ['Partidas', partidas.length],
        ['Cantidad', 'Medida nativa de Revit según la unidad de la partida: m → Longitud, m² → Área, m³ → Volumen; kg → longitud total de barra × kg/m del diámetro de barra; und → 1 por elemento; glb → 1 en total (global).'],
        ['Manual', 'Valor puesto a mano en el parámetro DSI de la línea (Longitud/Area/Volumen/Peso{i}). Se informa aparte; no se suma con lo nativo.'],
        ['Criterio de medida', 'Solo donde el elemento NO trae medida nativa: el parámetro que la obra eligió para esa unidad o partida (Planilla › Medir con…). La nativa manda siempre.'],
        ['A mano', 'Criterio de medida con un número escrito a mano en Revit, sin unidad, leído en la unidad de la partida: lo declaró quien modeló, no sale de la geometría.'],
        ['Sin medida', 'Líneas sin medida nativa ni criterio de medida que las mida (p. ej. encofrados modelados como muros).'],
        ...deMedida.map((c, i) => [`Criterio de medida ${i + 1}`, c]),
    ];
    return [
        { nombre: 'Partidas', filas: tabla, anchos, filtroHasta: tabla.length },
        { nombre: 'Criterios', filas: criterios, anchos: [20, 100], filtroHasta: null },
    ];
}
