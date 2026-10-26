// Banco de lib/criteriosDeMedida.js — node frontend-react/pruebas/criteriosDeMedida.prueba.mjs
// Casos de varias obras y orígenes (docs/visor/32 §1): no está hecho para una familia ni una obra.
import * as C from '../src/lib/criteriosDeMedida.js';
import * as PP from '../src/lib/planillaPartidas.js';

let total = 0, fallos = 0;
const ok = (nombre, cond) => { total++; if (!cond) fallos++; console.log(`  ${cond ? 'ok  ' : 'FALLA'} ${nombre}`); };
const cerca = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const titulo = t => { console.log(''); console.log(t); };

// Malla de cerco real (Interferencias, 26-oct-2026): sin Longitud nativa, la medida en parámetros de la familia.
const malla = (id, reja, total, tipo = 'Extendido') => ({
    Name: `SP.1.2_MALLA_HDPE_CERCO_SEGURIDAD ${tipo} [${id}]`,
    'Datos de identidad::Nombre de tipo': `SP.1.2_MALLA_HDPE_CERCO_SEGURIDAD ${tipo}`, 'Nombre de tipo': `SP.1.2_MALLA_HDPE_CERCO_SEGURIDAD ${tipo}`,
    'Cotas::Long. Reja': `${reja} m`, 'Long. Reja': `${reja} m`, 'Cotas::Largo Total': `${total} m`, 'Cotas::H1': '0.500 m', 'Cotas::Volumen': '0.055 m^3',
    'Cotas::Pendiente': '2.782 %',
    'Datos::03_05_DSI_CodigoDePartida1': '01.01', 'Datos::03_04_DSI_NombreDePartida1': 'CINTA PLASTICA SEÑALIZADORA', 'Datos::02_01_DSI_Unidad1': 'm',
    'Datos::03_05_DSI_CodigoDePartida2': '01.02', 'Datos::03_04_DSI_NombreDePartida2': 'CERCO DE MALLA HDPE', 'Datos::02_01_DSI_Unidad2': 'm',
});
// Un muro con Longitud NATIVA en la misma partida: la nativa manda.
const muro = { Name: 'Muro básico [77]', 'Datos de identidad::Nombre de tipo': 'Muro 20 cm', 'Cotas::Longitud': '15.200 m', 'Cotas::Long. Reja': '99.000 m',
    'Datos::03_05_DSI_CodigoDePartida2': '01.02', 'Datos::03_04_DSI_NombreDePartida2': 'CERCO DE MALLA HDPE', 'Datos::02_01_DSI_Unidad2': 'm' };
// Un IFC de otro programa: cantidades en un conjunto Qto, sin «Cotas › Volumen».
const ifc = { Name: 'IfcWall [9]', 'Qto_WallBaseQuantities::NetVolume': '2.400 m^3', 'Qto_WallBaseQuantities::Length': '6.000 m',
    'Datos::03_05_DSI_CodigoDePartida1': '05.01', 'Datos::03_04_DSI_NombreDePartida1': 'CONCRETO F\'C 210', 'Datos::02_01_DSI_Unidad1': 'm3' };
// Revit en portugués: «Comprimento».
const tuboPt = { Name: 'Tubo [5]', 'Cotas::Comprimento': '12.500 m',
    'Datos::03_05_DSI_CodigoDePartida1': '2.1.1.4', 'Datos::03_04_DSI_NombreDePartida1': 'TUBERIA', 'Datos::02_01_DSI_Unidad1': 'ml' };
// Encofrado con el área por material volcada a un parámetro (lo que sí viaja).
const encofrado = { Name: 'Encofrado [6]', 'Datos de identidad::Nombre de tipo': 'Encofrado_Plano', 'Otros::Área de encofrado': '3.200 m^2',
    'Datos::03_05_DSI_CodigoDePartida1': '04.02', 'Datos::03_04_DSI_NombreDePartida1': 'ENCOFRADO', 'Datos::02_01_DSI_Unidad1': 'm²', 'Datos::02_04_DSI_Area1': '3.000' };

titulo('VALIDAR');
{
    const { criterios, errores } = C.validarCriterios([
        { unidad: 'M2', medirCon: ['Otros::Área de encofrado'] },
        { unidad: 'und', medirCon: ['x::y'] },
        { unidad: 'm', partida: '01.02', medirCon: [] },
        { unidad: 'm', partida: '01.02', medirCon: ['Cotas::Long. Reja', 'Cotas::Long. Reja', ' Cotas::Largo Total '] },
        { unidad: 'm', partida: '1.2', medirCon: ['Cotas::Largo Total'] },
        { unidad: 'm', donde: { campo: 'Datos de identidad::Nombre de tipo', op: 'parece', valor: 'MALLA' }, medirCon: ['a::b'] },
        { unidad: 'm', donde: { campo: 'Datos de identidad::Nombre de tipo', op: 'contiene', valor: '' }, medirCon: ['a::b'] },
        { unidad: 'm', medirCon: ['1::a', '2::a', '3::a', '4::a', '5::a', '6::a'] },
    ]);
    ok('la unidad se normaliza (M2 → m²)', criterios[0].unidad === 'm²');
    ok('«und» no se mide con un parámetro', errores.some(e => e.i === 1 && /no medible/.test(e.motivo)));
    ok('sin parámetro, rechazado', errores.some(e => e.i === 2 && /Falta el parámetro/.test(e.motivo)));
    ok('parámetros repetidos y espacios fuera, en su orden', criterios[1].medirCon.join('|') === 'Cotas::Long. Reja|Cotas::Largo Total');
    ok('la misma partida con o sin ceros es el mismo criterio: el segundo se rechaza', errores.some(e => e.i === 4 && /Ya hay/.test(e.motivo)));
    ok('operador desconocido y «solo donde» sin valor, rechazados', errores.some(e => e.i === 5) && errores.some(e => e.i === 6));
    ok('más de 5 parámetros, rechazado', errores.some(e => e.i === 7 && /Como mucho/.test(e.motivo)));
    ok('lo que no es lista no rompe', C.validarCriterios(null).errores.length === 1);
}

titulo('VALORES EN UNA UNIDAD');
{
    ok('«11.983 m» en m', C.valorEnUnidad('11.983 m', 'm')?.valor === 11.983);
    ok('«2.5 m^2» en m: otra unidad, dicha', C.valorEnUnidad('2.5 m^2', 'm')?.unidad === 'm²');
    ok('un número sin unidad no se supone', C.valorEnUnidad('12', 'm')?.unidad === 'sin unidad');
    ok('0 o vacío: nada', C.valorEnUnidad('0.000 m', 'm') === null && C.valorEnUnidad('', 'm') === null);
    ok('texto: nada', C.valorEnUnidad('2.782 %', 'm') === null);
}

titulo('SOLO DONDE');
{
    const d = { campo: 'Datos de identidad::Nombre de tipo', op: 'contiene', valor: 'malla hdpe' };
    ok('contiene, sin mayúsculas ni guiones bajos de más', C.cumpleDonde(malla(1, 1, 1), { ...d, valor: 'MALLA_HDPE' }));
    ok('es: el valor entero', C.cumpleDonde(malla(1, 1, 1), { ...d, op: 'es', valor: 'SP.1.2_MALLA_HDPE_CERCO_SEGURIDAD Extendido' })
        && !C.cumpleDonde(malla(1, 1, 1), { ...d, op: 'es', valor: 'SP.1.2_MALLA_HDPE' }));
    ok('sin el campo: no cumple', !C.cumpleDonde({}, d));
}

titulo('CUÁL MANDA (de más a menos específico)');
{
    const { criterios } = C.validarCriterios([
        { unidad: 'm', medirCon: ['Cotas::Comprimento'] },                                                     // toda la obra
        { unidad: 'm', donde: { campo: 'Datos de identidad::Nombre de tipo', op: 'contiene', valor: 'MALLA' }, medirCon: ['Cotas::Largo Total'] },
        { unidad: 'm', partida: '01.02', medirCon: ['Cotas::Long. Reja'] },
        { unidad: 'm', partida: '01.02', donde: { campo: 'Datos de identidad::Nombre de tipo', op: 'contiene', valor: '1m.' }, medirCon: ['Cotas::H1'] },
    ]);
    const I = C.indiceDeCriterios(criterios);
    const m = malla(1, 23.8098, 24.0098);
    ok('partida 01.02 → Long. Reja', I.cantidad(m, '01.02', 'm').clave === 'Cotas::Long. Reja');
    ok('partida 01.02 + tipo «1m.» → H1 (partida + donde)', I.cantidad(malla(2, 5, 5, '1m.'), '01.02', 'm').clave === 'Cotas::H1');
    ok('partida 01.01 (sin criterio propio) → el de la malla en toda la obra: Largo Total', I.cantidad(m, '01.01', 'm').clave === 'Cotas::Largo Total');
    ok('otro elemento sin condición → el general', I.cantidad(tuboPt, '2.1.1.4', 'm').valor === 12.5);
    ok('el código con o sin ceros encuentra su criterio', I.cantidad(m, '1.2', 'm').clave === 'Cotas::Long. Reja');
    ok('otra unidad: ningún criterio', I.cantidad(m, '01.02', 'm²') === null);
    const dos = C.indiceDeCriterios(C.validarCriterios([
        { unidad: 'm', donde: { campo: 'Datos de identidad::Nombre de tipo', op: 'contiene', valor: 'MALLA' }, medirCon: ['Cotas::Largo Total'] },
        { unidad: 'm', donde: { campo: 'Datos de identidad::Nombre de tipo', op: 'contiene', valor: 'HDPE' }, medirCon: ['Cotas::Long. Reja'] },
    ]).criterios);
    const r = dos.cantidad(m, '01.02', 'm');
    ok('dos del mismo nivel: conflicto, no se elige uno en silencio', r.motivo === 'conflicto' && r.criterios.length === 2 && r.valor === undefined);
    const orden = C.indiceDeCriterios(C.validarCriterios([{ unidad: 'm', medirCon: ['Cotas::No existe', 'Cotas::Largo Total'] }]).criterios);
    ok('varios parámetros: el primero con valor', orden.cantidad(m, '01.02', 'm').clave === 'Cotas::Largo Total');
    const otraUnidad = C.indiceDeCriterios(C.validarCriterios([{ unidad: 'm', medirCon: ['Cotas::Volumen'] }]).criterios);
    const ru = otraUnidad.cantidad(m, '01.02', 'm');
    ok('el parámetro trae otra unidad: no se usa, y se dice cuál', ru.motivo === 'unidad' && ru.unidadEncontrada === 'm³');
    ok('ningún parámetro con valor: sin-valor', C.indiceDeCriterios(C.validarCriterios([{ unidad: 'm', medirCon: ['x::y'] }]).criterios).cantidad(m, '01.02', 'm').motivo === 'sin-valor');
}

titulo('EN LAS PARTIDAS: LA NATIVA MANDA, EL CRITERIO RELLENA');
{
    const filas = [malla(1, 23.8098, 24.0098), malla(2, 11.983, 12.183), muro, ifc, tuboPt, encofrado];
    const claves = [...new Set(filas.flatMap(Object.keys))];
    const base = PP.diccionarioDSI(claves);
    const sin = PP.partidasDe(filas, base, f => f.Name);
    const p0 = sin.find(p => p.codigo === '01.02');
    ok('sin criterios: el cerco solo mide el muro (nativa) y deja 2 sin medida', p0.conMedida === 1 && p0.sinMedida === 2 && cerca(p0.cantidad, 15.2));
    const { criterios } = C.validarCriterios([
        { unidad: 'm', partida: '01.02', medirCon: ['Cotas::Long. Reja'] },
        { unidad: 'm', partida: '01.01', medirCon: ['Cotas::Largo Total'] },
        { unidad: 'm³', medirCon: ['Qto_WallBaseQuantities::NetVolume'] },
        { unidad: 'm', medirCon: ['Cotas::Comprimento'] },
        { unidad: 'm²', donde: { campo: 'Datos de identidad::Nombre de tipo', op: 'contiene', valor: 'encofrado' }, medirCon: ['Otros::Área de encofrado'] },
    ]);
    const dic = { ...base, criterios: C.indiceDeCriterios(criterios) };
    const ps = PP.partidasDe(filas, dic, f => f.Name);
    const cerco = ps.find(p => p.codigo === '01.02');
    ok('cerco: muro nativo 15,2 + mallas por Long. Reja (el muro NO usa su Long. Reja de 99)', cerco.sinMedida === 0 && cerca(cerco.cantidad, 15.2 + 23.8098 + 11.983));
    ok('…cuenta cuántos midió el criterio y con qué', cerco.porCriterio === 2 && cerco.medidoCon[0].clave === 'Cotas::Long. Reja' && cerca(cerco.medidoCon[0].suma, 35.7928));
    ok('…y los orígenes son nativa y criterio', cerco.origenes.includes('nativa') && cerco.origenes.includes('criterio'));
    const cinta = ps.find(p => p.codigo === '01.01');
    ok('cinta: los mismos elementos, otro parámetro (Largo Total)', cerca(cinta.cantidad, 24.0098 + 12.183) && cinta.medidoCon[0].clave === 'Cotas::Largo Total');
    ok('IFC: m³ con el conjunto Qto, en toda la obra', cerca(ps.find(p => p.codigo === '05.01').cantidad, 2.4));
    ok('Revit en portugués, unidad «ml»: Comprimento', cerca(ps.find(p => p.codigo === '2.1.1.4').cantidad, 12.5));
    const enc = ps.find(p => p.codigo === '04.02');
    ok('encofrado: el área volcada a un parámetro; lo manual DSI sigue aparte', cerca(enc.cantidad, 3.2) && cerca(enc.manual, 3.0));
    const conflicto = { ...base, criterios: C.indiceDeCriterios(C.validarCriterios([
        { unidad: 'm', donde: { campo: 'Datos de identidad::Nombre de tipo', op: 'contiene', valor: 'MALLA' }, medirCon: ['Cotas::Largo Total'] },
        { unidad: 'm', donde: { campo: 'Datos de identidad::Nombre de tipo', op: 'contiene', valor: 'CERCO' }, medirCon: ['Cotas::Long. Reja'] },
    ]).criterios) };
    const pc = PP.partidasDe(filas, conflicto, f => f.Name).find(p => p.codigo === '01.02');
    ok('un conflicto deja sin medida y se cuenta', pc.sinMedida === 2 && pc.conflictos === 2);
    const hojas = PP.hojasDePartidas(ps, { criterios: criterios.map(C.describirCriterio) });
    const fila = hojas[0].filas.find(f => f[2] === '01.02');
    ok('Excel: el origen dice el parámetro del criterio', /criterio: Long\. Reja/.test(fila[6]) && /nativa/.test(fila[6]));
    ok('Excel: la hoja Criterios lista los criterios de medida', hojas[1].filas.some(f => f[0] === 'Criterio de medida 1' && /Long\. Reja/.test(f[1])));
}

titulo('CANDIDATOS, «SOLO DONDE» Y SIMULAR');
{
    const filas = [malla(1, 23.8098, 24.0098), malla(2, 11.983, 12.183), malla(3, 5, 5, '1m.')];
    const claves = [...new Set(filas.flatMap(Object.keys)), 'Datos::02_02_DSI_Longitud1'];
    filas[0]['Datos::02_02_DSI_Longitud1'] = '24.000 m';
    const c = C.candidatosDeMedida(filas, 'm', claves);
    const etiquetas = c.map(x => x.etiqueta);
    ok('solo parámetros en m: Long. Reja, Largo Total, H1', etiquetas.includes('Cotas › Long. Reja') && etiquetas.includes('Cotas › Largo Total') && etiquetas.includes('Cotas › H1') && !etiquetas.includes('Cotas › Volumen'));
    ok('sin la clave plana repetida; un parámetro con unidad es candidato aunque sea «manual» por su nombre (nada se decide por nombres)', !c.some(x => x.clave === 'Long. Reja') && c.some(x => x.clave === 'Datos::02_02_DSI_Longitud1'));
    ok('con cuántos tienen dato y la suma', cerca(c.find(x => x.clave === 'Cotas::Long. Reja').suma, 23.8098 + 11.983 + 5) && c[0].conDato === 3);
    const d = C.camposParaDonde(filas, claves);
    const tipo = d.find(x => x.campo === 'Datos de identidad::Nombre de tipo');
    ok('«solo donde» propone el nombre de tipo con sus valores y cuántos', tipo && tipo.valores[0].n === 2 && tipo.valores.length === 2);
    ok('…y no propone números', !d.some(x => x.campo === 'Cotas::Long. Reja'));
    // Con la obra: primero lo que más distingue (Canal, 26-oct: 47 campos iguales en todos tapaban el tipo).
    const conAutor = filas.map(f => ({ ...f, 'Datos de identidad::Autor': 'CONSORCIO', 'Revit Category': 'Structural Framing' }));
    const obra = [...conAutor, ...Array.from({ length: 20 }, (_, i) => ({ 'Datos de identidad::Autor': 'CONSORCIO', 'Datos de identidad::Nombre de tipo': `Muro ${i}`, 'Revit Category': 'Walls' }))];
    const dObra = C.camposParaDonde(conAutor, [...new Set(conAutor.flatMap(Object.keys))], { obra });
    const pos = campo => dObra.findIndex(x => x.campo === campo);
    ok('con la obra: el nombre de tipo (3 en la obra) antes que el autor (23)', pos('Datos de identidad::Nombre de tipo') < pos('Datos de identidad::Autor')
        && dObra[pos('Datos de identidad::Nombre de tipo')].enObra === 3 && dObra[pos('Datos de identidad::Autor')].enObra === 23);
    ok('la clave plana sin grupo («Revit Category») sí se propone; la repetida («Nombre de tipo») no', pos('Revit Category') >= 0 && pos('Nombre de tipo') < 0);
    const s = C.simularCriterio(filas, { unidad: 'm', donde: { campo: 'Datos de identidad::Nombre de tipo', op: 'contiene', valor: 'Extendido' }, medirCon: ['Cotas::Long. Reja'] });
    ok('simular: 2 medidos, 1 fuera de la condición, con la suma', s.medidos === 2 && s.fueraDeDonde === 1 && cerca(s.suma, 35.7928));
}

titulo('A MANO: NÚMEROS SIN UNIDAD (genérico con 02_02_DSI_Longitud = 33.725, captura del 26-oct)');
{
    const generico = (id, lon) => ({ Name: `Modelo genérico [${id}]`, 'Datos::02_02_DSI_Longitud': String(lon), 'Datos::04_20_DSI_FinReal1': '20260924',
        'Datos::Costo': '0', 'Datos::03_05_DSI_CodigoDePartida1': '08.01', 'Datos::02_01_DSI_Unidad1': 'm' });
    const muro = (id, lon, declarado) => ({ Name: `Muro [${id}]`, 'Cotas::Longitud': `${lon} m`, 'Datos::04_20_DSI_FinReal1': '20260924',
        ...(declarado ? { 'Datos::Largo declarado': String(declarado) } : {}) });
    const sin = [generico(1, 33.725), generico(2, 12.5), generico(3, 7)];
    const obra = [...sin, ...Array.from({ length: 30 }, (_, i) => muro(10 + i, 5 + i, i < 6 ? 5 + i : null))];
    sin[0]['Datos::Largo declarado'] = '33.725'; sin[1]['Datos::Largo declarado'] = '12.5';
    const claves = [...new Set(obra.flatMap(Object.keys))];
    const { probables, otros } = C.candidatosAMano(sin, 'm', claves, { obra, claveNativa: 'Cotas::Longitud' });
    const p = probables.map(x => x.clave);
    ok('propone el que coincide con la medida de Revit donde la hay, primero', p[0] === 'Datos::Largo declarado' && /el mismo/.test(probables[0].porque));
    ok('…y el que solo está lleno donde falta (02_02_DSI_Longitud), con su razón', p.includes('Datos::02_02_DSI_Longitud') && /lleno donde falta/.test(probables.find(x => x.clave === 'Datos::02_02_DSI_Longitud').porque));
    const todos = [...p, ...otros.map(x => x.clave)];
    ok('ni la fecha (20260924 se lee como fecha), ni el 0, ni el código «08.01» son candidatos', !todos.includes('Datos::04_20_DSI_FinReal1') && !todos.includes('Datos::Costo') && !todos.includes('Datos::03_05_DSI_CodigoDePartida1'));
    ok('pocos probables, no los 50', probables.length === 2);
    const conTramo = sin.map((f, i) => ({ ...f, 'Construcción::DAT_Tramo': String(i + 1), 'Datos::02_02_DSI_Longitud': ['33.725', '12.5', '7.25'][i] }));
    const t = C.candidatosAMano(conTramo, 'm', [...claves, 'Construcción::DAT_Tramo'], { obra: [...conTramo, ...obra.slice(3)], claveNativa: 'Cotas::Longitud' });
    ok('solo enteros (número de tramo): no es probable, queda en «ver todos»', !t.probables.some(x => x.clave === 'Construcción::DAT_Tramo') && t.otros.some(x => x.clave === 'Construcción::DAT_Tramo'));
    const crit = C.validarCriterios([{ unidad: 'm', partida: '08.01', medirCon: ['Datos::02_02_DSI_Longitud'], aMano: true }]).criterios[0];
    ok('el criterio guarda «a mano»', crit.aMano === true && /\(a mano\)/.test(C.describirCriterio(crit)));
    const sinFlag = C.indiceDeCriterios(C.validarCriterios([{ unidad: 'm', partida: '08.01', medirCon: ['Datos::02_02_DSI_Longitud'] }]).criterios);
    ok('sin «a mano», un número sin unidad NO se usa (se dice por qué)', sinFlag.cantidad(sin[0], '08.01', 'm').motivo === 'unidad');
    const I = C.indiceDeCriterios([crit]);
    const r = I.cantidad(sin[0], '08.01', 'm');
    ok('con «a mano»: 33,725 m, origen «a mano»', r.valor === 33.725 && r.origen === 'a mano');
    ok('…pero un valor con OTRA unidad sigue sin usarse', I.cantidad({ 'Datos::02_02_DSI_Longitud': '2.5 m^2' }, '08.01', 'm').motivo === 'unidad');
    const base = PP.diccionarioDSI([...new Set(sin.flatMap(Object.keys))]);
    const ps = PP.partidasDe(sin, { ...base, criterios: I }, f => f.Name);
    const pa = ps.find(x => x.codigo === '08.01');
    ok('en las partidas: 53,225 m «a mano», 0 sin medida', cerca(pa.cantidad, 53.225) && pa.sinMedida === 0 && pa.origenes.includes('a mano'));
    const fila = PP.hojasDePartidas(ps)[0].filas.find(f => f[2] === '08.01');
    ok('Excel: el origen dice «a mano: 02_02_DSI_Longitud»', /a mano: 02_02_DSI_Longitud/.test(fila[6]));
}

titulo('QUÉ FALTA MEDIR Y QUÉ HACE CADA CRITERIO');
{
    const filas = [malla(1, 23.8098, 24.0098), malla(2, 0, 12.183), muro, tuboPt];
    const base = PP.diccionarioDSI([...new Set(filas.flatMap(Object.keys))]);
    const sin = C.sinMedidaNativa(filas, base, '1.2', 'm');
    ok('sin medida nativa en 01.02 (pedido como «1.2»): las dos mallas, no el muro', sin.length === 2 && !sin.includes(muro));
    const { criterios } = C.validarCriterios([
        { unidad: 'm', partida: '01.02', medirCon: ['Cotas::Long. Reja'] },
        { unidad: 'm', partida: '9.9', medirCon: ['Cotas::Largo Total'] },
    ]);
    const dic = { ...base, criterios: C.indiceDeCriterios(criterios) };
    ok('con criterios puestos, sinMedidaNativa sigue mirando la nativa', C.sinMedidaNativa(filas, dic, '01.02', 'm').length === 2);
    const uso = C.usoDeCriterios(filas, dic);
    ok('el criterio de 01.02 mide 1 y deja 1 sin valor (Long. Reja = 0)', uso.get(criterios[0]).medidos === 1 && uso.get(criterios[0]).sinValor === 1 && cerca(uso.get(criterios[0]).suma, 23.8098));
    ok('un criterio de una partida que no está: sin efecto', uso.get(criterios[1]).medidos === 0 && uso.get(criterios[1]).sinValor === 0);
}

titulo('DEL SERVIDOR Y DEL NAVEGADOR');
{
    const j = C.criteriosDesdeServidor({ version: 2, huella: 'a'.repeat(64), criterios: [{ unidad: 'm', partida: '01.02', medirCon: ['Cotas::Long. Reja'] }], creado_por: 'Ana' });
    ok('del servidor: índice listo, versión y autor', j.version === 2 && j.creadoPor === 'Ana' && j.indice.cantidad(malla(1, 3, 4), '01.02', 'm').valor === 3);
    ok('sin vigente → null', C.criteriosDesdeServidor(null) === null);
    const l = C.criteriosLocales({ criterios: [{ unidad: 'm', medirCon: ['Cotas::Largo Total'] }] });
    ok('en el navegador: huella local que cambia con los criterios', l.local && /^local-/.test(l.huella)
        && l.huella !== C.criteriosLocales({ criterios: [{ unidad: 'm', medirCon: ['Cotas::Long. Reja'] }] }).huella);
    // El almacén es el del itemizado (lib/almacenDeObra.js, su banco: itemizadoDeObra.prueba.mjs).
    const enviados = [];
    const a = C.crearAlmacenDeCriterios({ pedir: async (metodo, ruta, cuerpo) => {
        enviados.push({ metodo, ruta, cuerpo });
        if (metodo === 'GET') return { ok: true, json: { vigente: enviados.some(e => e.metodo === 'POST') ? { version: 1, huella: 'b'.repeat(64), criterios: enviados.at(-1).cuerpo?.criterios || enviados.find(e => e.metodo === 'POST').cuerpo.criterios } : null, versiones: [], puede_editar: true } };
        return { ok: true, status: 201, json: { version: 1 } };
    } });
    await a.cargar('OBRA_X');
    const g = await a.guardar({ criterios: [{ unidad: 'm', medirCon: ['Cotas::Largo Total'] }] });
    ok('almacén: guarda en la ruta de criterios con la obra y vuelve a leer lo guardado', g.ok && enviados.find(e => e.metodo === 'POST').ruta === '/api/planilla/criterios-medida'
        && enviados.find(e => e.metodo === 'POST').cuerpo.project === 'OBRA_X' && a.estado().vigente?.indice.total === 1);
    const sinMig = C.crearAlmacenDeCriterios({ pedir: async () => ({ ok: false, status: 503, json: { code: 'MIGRATION_MISSING' } }) });
    await sinMig.cargar('OBRA_X');
    await sinMig.guardar({ criterios: [{ unidad: 'm', medirCon: ['Cotas::Largo Total'] }] });
    ok('almacén sin la migración 41: en el navegador, con aviso', sinMig.estado().modo === 'navegador' && /migración 41/.test(sinMig.estado().aviso) && sinMig.estado().vigente?.local);
    ok('describir', C.describirCriterio({ unidad: 'm', partida: '01.02', donde: { campo: 'Datos de identidad::Nombre de tipo', op: 'contiene', valor: 'MALLA' }, medirCon: ['Cotas::Long. Reja', 'Cotas::Largo Total'] })
        === 'm · partida 01.02 · donde Nombre de tipo contiene «MALLA» · Long. Reja, si no Largo Total');
}

console.log('');
console.log(fallos ? `${fallos} de ${total} FALLAN` : `${total}/${total} en verde`);
process.exit(fallos ? 1 : 0);
