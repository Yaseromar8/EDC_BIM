import React, { useEffect, useMemo, useState } from 'react';
import { analizarPartidas, gruposDePartidas } from '../lib/planillaPartidas';
import { leerItemizado, indiceDeItemizado, cruzarCampos, diferencias } from '../lib/planillaItemizado';
import { formatearNumero } from '../lib/inventoryTabla';
import { compacto } from '../lib/inventoryBuscar';
import { EVENTOS } from '../lib/aislamientoTemporal';

/**
 * Vista «Partidas» de la Planilla: una fila por partida (código + unidad) de los
 * elementos del ámbito, con la cantidad NATIVA de Revit en la unidad de la
 * partida (regla del propietario, docs/visor/23 §7). El criterio sale SOLO del
 * itemizado que sube el usuario: sin itemizado, no hay partidas. Ordenada como un
 * presupuesto: bajo su partida padre (la línea sin número que la contiene) o
 * bajo su capítulo (el código sin su último tramo). Lo manual va aparte. Clic en
 * una partida = sus elementos en el 3D; clic en un grupo = plegar o desplegar.
 */
const celda = { padding: '0 10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const num = { ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const COLUMNAS = [
    { titulo: 'Código', ancho: '170px' },
    { titulo: 'Partida', ancho: 'minmax(260px, 1fr)' },
    { titulo: 'Unidad', ancho: '64px' },
    { titulo: 'Cantidad nativa', ancho: '140px', derecha: true },
    { titulo: 'Elementos', ancho: '84px', derecha: true },
    { titulo: 'Sin medida', ancho: '90px', derecha: true },
    { titulo: 'Manual (aparte)', ancho: '150px', derecha: true },
];
const rejilla = COLUMNAS.map(c => c.ancho).join(' ');
const ROJO = '#9a3b2e';

// Cómo se leyeron las partidas: lo que la Planilla deduce de los datos (docs/visor/24 §9).
function ComoSeLeyo({ roles, itemizado, cruce, onCerrar }) {
    const nombre = c => (c ? String(c).split('::').pop() : '—');
    const n = x => x.toLocaleString('es-PE');
    const linea = { paddingLeft: '12px' };
    return (
        <div style={{ borderBottom: '1px solid #e8e6dc', background: '#faf9f5', padding: '8px 12px', maxHeight: '180px', overflowY: 'auto', fontSize: '11.5px', color: '#52524d', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <strong style={{ color: '#141413', fontWeight: 600 }}>Cómo se leyó</strong>
                <span>· a partir de tu itemizado «{itemizado.archivo}» y de los valores del modelo (no de los nombres de los parámetros)</span>
                <span style={{ flex: 1 }} />
                <button className="v-enlace" style={{ fontSize: '11px' }} onClick={onCerrar}>cerrar</button>
            </div>
            {!roles.lineas.length && <div>Ningún parámetro del modelo contiene los ítems del itemizado.</div>}
            {roles.lineas.map(l => (
                <div key={l.codigo} style={{ marginBottom: '6px' }}>
                    <div style={{ color: '#141413' }}>
                        <strong style={{ fontWeight: 600 }}>Línea {l.sufijo || 'sin número'}</strong>: código «{nombre(l.codigo)}» · descripción «{nombre(l.descripcion)}» · unidad «{nombre(l.unidad)}»
                        {l.dudosa && <span style={{ color: ROJO }}> · por confirmar</span>}
                    </div>
                    {l.porque.map((t, i) => <div key={i} style={{ paddingLeft: '12px' }}>· {t}</div>)}
                    {l.avisos.map((t, i) => <div key={`a${i}`} style={{ paddingLeft: '12px', color: ROJO }}>· {t}</div>)}
                </div>
            ))}
            {cruce && (
                <div style={{ borderTop: '1px solid #e8e6dc', paddingTop: '6px' }}>
                    <div style={{ color: '#141413' }}><strong style={{ fontWeight: 600 }}>Contra el itemizado</strong> «{itemizado.archivo}»</div>
                    <div style={linea}>· {itemizado.porque}</div>
                    {cruce.campos.slice(0, 6).map(c => <div key={c.clave} style={linea}>· {c.porque}</div>)}
                    <div style={{ ...linea, color: cruce.dif.fuera.length ? ROJO : '#52524d' }}>
                        · {n(cruce.dif.fuera.length)} partidas del modelo no están en el itemizado ni son sub-partida de un ítem suyo
                        {cruce.dif.fuera.length ? `: ${cruce.dif.fuera.slice(0, 5).map(p => p.codigo).join(', ')}${cruce.dif.fuera.length > 5 ? '…' : ''}` : ''}
                    </div>
                    <div style={{ ...linea, color: cruce.dif.unidadDistinta.length ? ROJO : '#52524d' }}>
                        · {n(cruce.dif.unidadDistinta.length)} con unidad distinta en el modelo (manda la del itemizado)
                        {cruce.dif.unidadDistinta.length ? `: ${cruce.dif.unidadDistinta.slice(0, 3).map(x => `${x.p.codigo} ${x.p.unidadModelo} → ${x.oficial.unidad}`).join(', ')}` : ''}
                    </div>
                    <div style={linea}>· {n(cruce.dif.descripcionDistinta.length)} con la descripción redactada distinto en el modelo (se muestra la del itemizado)</div>
                    <div style={linea}>· {n(cruce.dif.sinElementos.length)} partidas del itemizado (con unidad) sin ningún elemento en el modelo: lo que no se modela, o falta parametrizar</div>
                </div>
            )}
        </div>
    );
}

const estiloBoton = { display: 'inline-flex', alignItems: 'center', border: '1px solid #cccac0', borderRadius: '3px', background: '#ffffff', color: '#52524d', font: 'inherit', fontSize: '11px', padding: '0 6px', height: '20px', cursor: 'pointer' };

function BotonCargar({ onArchivo, texto = 'Cargar itemizado…' }) {
    return (
        <label title="Excel o CSV con ítem, descripción y unidad. Se lee en tu navegador; no se guarda." style={estiloBoton}>
            {texto}
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onArchivo(f); }} />
        </label>
    );
}

export default function TablaDePartidas({ filas, filasObra, dic, roles, claveDeFila, ambito, onUsarTodo, onSeleccionar, onMostrarTodo, itemizado, onItemizado }) {
    const [activa, setActiva] = useState(null);
    const [paso, setPaso] = useState(null);     // paso del recorrido de la partida activa
    // Cuántos pasos tiene el recorrido: lo dice el visor (piezas sueltas, o tramos si son miles).
    const [recorrido, setRecorrido] = useState(null);
    useEffect(() => {
        const al = e => setRecorrido(e.detail);
        window.addEventListener(EVENTOS.RECORRIDO, al);
        return () => window.removeEventListener(EVENTOS.RECORRIDO, al);
    }, []);
    const [plegados, setPlegados] = useState(() => new Set());
    const [verComo, setVerComo] = useState(false);
    const [errorItemizado, setErrorItemizado] = useState('');
    const indice = itemizado?.indice || null;
    const { partidas, calidad } = useMemo(() => (dic ? analizarPartidas(filas, dic, claveDeFila) : { partidas: [], calidad: { repetidas: 0, intercambiadas: 0 } }),
        [filas, dic, claveDeFila]);
    const grupos = useMemo(() => gruposDePartidas(partidas, indice), [partidas, indice]);
    // El cruce se calcula sobre toda la obra y solo con el panel abierto.
    const cruce = useMemo(() => {
        if (!verComo || !dic || !roles) return null;
        return {
            campos: cruzarCampos(filasObra, roles.perfiles, indice),
            dif: diferencias(analizarPartidas(filasObra, dic, claveDeFila).partidas, indice, itemizado.items),
        };
    }, [verComo, dic, roles, indice, filasObra, claveDeFila, itemizado]);
    const cargarItemizado = async (archivo) => {
        setErrorItemizado('');
        try {
            const XLSX = await import('xlsx');
            const libro = XLSX.read(await archivo.arrayBuffer());
            // sheet_to_json empieza en la primera columna usada: se rellena por delante para que las
            // letras que se citan («ítem en la columna B») sean las del Excel.
            const hojas = Object.fromEntries(libro.SheetNames.map(n => {
                const hoja = libro.Sheets[n];
                const desde = hoja['!ref'] ? XLSX.utils.decode_range(hoja['!ref']).s.c : 0;
                return [n, XLSX.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '' }).map(f => [...Array(desde).fill(''), ...f])];
            }));
            const leido = leerItemizado(hojas);
            if (!leido) { setErrorItemizado('No se encontró una columna de ítems (códigos como 06.02.01) con su descripción.'); return; }
            onItemizado({ ...leido, indice: indiceDeItemizado(leido.items), archivo: archivo.name });
        } catch (e) {
            setErrorItemizado(`No se pudo leer el archivo: ${e.message}`);
        }
    };
    const sinMedida = partidas.reduce((s, p) => s + p.sinMedida, 0);
    const lineas = partidas.reduce((s, p) => s + p.elementos, 0);

    // Sin itemizado no hay criterio: se pide, no se supone.
    if (!dic) {
        return (
            <div style={{ padding: '24px', color: '#52524d', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                {itemizado
                    ? <span>Ningún parámetro del modelo contiene los ítems de «{itemizado.archivo}».</span>
                    : <span>Carga el itemizado de la obra (ítem, descripción y unidad) para armar las partidas con tu criterio.
                        La Planilla buscará en el modelo los parámetros donde están tus ítems.</span>}
                <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                    {itemizado
                        ? <button style={estiloBoton} onClick={() => onItemizado(null)}>✕ Quitar itemizado</button>
                        : <BotonCargar onArchivo={cargarItemizado} />}
                    {errorItemizado && <span style={{ color: ROJO }}>{errorItemizado}</span>}
                </span>
            </div>
        );
    }
    const plegar = clave => setPlegados(prev => { const n = new Set(prev); if (n.has(clave)) n.delete(clave); else n.add(clave); return n; });
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#ffffff', fontSize: '12px', color: '#333330' }}>
            <div style={{ padding: '0 12px', height: '28px', flexShrink: 0, fontSize: '11px', color: '#72706b', borderBottom: '1px solid #e8e6dc', display: 'flex', gap: '8px', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <span><strong style={{ color: '#141413', fontWeight: 600 }}>{partidas.length}</strong> partidas en {grupos.length} grupos · {lineas.toLocaleString('es-PE')} líneas de {filas.length.toLocaleString('es-PE')} elementos {ambito}</span>
                {onUsarTodo && <button className="v-enlace" style={{ fontSize: '11px' }} onClick={onUsarTodo}>usar toda la tabla</button>}
                {sinMedida > 0 && <span style={{ color: ROJO }}>· {sinMedida.toLocaleString('es-PE')} sin medida nativa</span>}
                {calidad.repetidas > 0 && <span title="La misma partida en varias líneas del mismo elemento (p. ej. línea sin número y línea 2): se cuenta una vez">· {calidad.repetidas.toLocaleString('es-PE')} repetidas contadas una vez</span>}
                {calidad.intercambiadas > 0 && <span style={{ color: ROJO }} title="En Revit, la descripción está en CodigoDePartida y el código en NombreDePartida: se leen al derecho">· {calidad.intercambiadas} con código y nombre intercambiados</span>}
                <button className="v-enlace" style={{ fontSize: '11px' }} onClick={() => setVerComo(v => !v)} aria-expanded={verComo}
                    title="Qué parámetros se leyeron como código, descripción y unidad, y por qué">
                    cómo se leyó
                </button>
                <span style={{ width: '1px', height: '12px', background: '#e8e6dc' }} />
                <span title={itemizado.porque} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    itemizado «{itemizado.archivo}» · {itemizado.items.length.toLocaleString('es-PE')} ítems
                    <button onClick={() => onItemizado(null)} title="Dejar de usar el itemizado (no se guarda en ningún sitio)" style={estiloBoton}>
                        ✕ Quitar itemizado
                    </button>
                </span>
                {errorItemizado && <span style={{ color: ROJO }}>{errorItemizado}</span>}
                <span style={{ flex: 1 }} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title="m → Longitud · m² → Área · m³ → Volumen de Revit; kg → longitud total de barra × kg/m del diámetro de barra; und → 1 por elemento">Cantidad = medida nativa de Revit según la unidad</span>
            </div>
            {verComo && roles && <ComoSeLeyo roles={roles} itemizado={itemizado} cruce={cruce} onCerrar={() => setVerComo(false)} />}
            <div role="table" aria-label="Partidas" style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <div role="row" style={{ display: 'grid', gridTemplateColumns: rejilla, position: 'sticky', top: 0, zIndex: 1, background: '#f5f4ef', borderBottom: '1px solid #cccac0', height: '28px', alignItems: 'center', fontWeight: 600, fontSize: '11.5px', color: '#52524d' }}>
                    {COLUMNAS.map(c => <div key={c.titulo} role="columnheader" style={c.derecha ? num : celda}>{c.titulo}</div>)}
                </div>
                {grupos.map(g => {
                    const abierto = !plegados.has(g.clave);
                    const elementos = new Set(g.partidas.flatMap(p => p.claves)).size;
                    return (
                        <React.Fragment key={g.clave}>
                            <div role="row" onClick={() => plegar(g.clave)} title={g.tipo === 'padre' ? 'Partida padre (línea sin número del elemento)' : g.tipo === 'capitulo' ? 'Capítulo: el código sin su último tramo' : ''}
                                style={{ display: 'grid', gridTemplateColumns: rejilla, height: '26px', alignItems: 'center', background: '#f1f0e8', borderBottom: '1px solid #e8e6dc', cursor: 'pointer', fontWeight: 600, color: '#141413' }}>
                                <div style={celda}><span style={{ display: 'inline-block', width: '12px', color: '#72706b' }}>{abierto ? '▾' : '▸'}</span>{g.codigo || '—'}</div>
                                <div style={{ ...celda, fontWeight: g.nombre ? 600 : 400, color: g.nombre ? '#141413' : '#72706b' }}>
                                    {g.nombre || (g.tipo === 'capitulo' ? `capítulo ${g.codigo}` : '')}
                                    <span style={{ fontWeight: 400, color: '#72706b' }}> · {g.partidas.length} partida{g.partidas.length === 1 ? '' : 's'}</span>
                                </div>
                                <div />
                                {/* Sin total: las partidas de un grupo son actividades distintas sobre las
                                    mismas piezas (suministro, instalación, prueba); sumarlas multiplica. */}
                                <div />
                                <div style={num}>{elementos.toLocaleString('es-PE')}</div>
                                <div /><div />
                            </div>
                            {abierto && g.partidas.map(p => {
                                const sel = activa === p.clave;
                                const calculada = p.origenes.includes('calculada');
                                const donde = indice && p.codigo ? indice.ubicar(p.codigo) : null;
                                // Una sub-partida de verdad tiene SU descripción (el FUSTE del buzón). Si la
                                // del modelo es la de OTROS ítems del itemizado, el código está mal puesto
                                // (Canal: 04.02.03.05 bajo «ACARREO…» con «INSTALACION DE ACERO…»).
                                const otrosItems = donde?.tipo === 'subpartida' ? (indice.porDescripcion.get(compacto(p.nombreModelo || p.nombre)) || []) : [];
                                return (
                                    <div key={p.clave} role="row" aria-selected={sel} className={`inv-fila${sel ? ' resaltada' : ''}`}
                                        onClick={() => {
                                            // Un clic aísla la partida; otro clic en la MISMA, muestra todo (como estaba).
                                            setPaso(null); setRecorrido(null);
                                            if (sel) { setActiva(null); onMostrarTodo?.(); return; }
                                            setActiva(p.clave);
                                            onSeleccionar([...new Set(p.claves)], { clave: p.clave });
                                        }}
                                        title={`${p.codigo || '(sin código)'} · ${p.nombre || '(sin nombre)'} — ${sel ? 'clic: mostrar todo' : `clic: aislar sus ${p.elementos} elementos en el 3D`}`}
                                        style={{ display: 'grid', gridTemplateColumns: rejilla, height: '28px', alignItems: 'center', borderBottom: '1px solid #e8e6dc', cursor: 'pointer' }}>
                                        <div style={{ ...celda, paddingLeft: '22px', color: p.codigo ? '#141413' : ROJO }}>
                                            {p.codigo || 'sin código'}
                                            {p.intercambiadas ? <span title="En Revit el código estaba en NombreDePartida" style={{ color: ROJO }}> ⇄</span> : null}
                                            {donde?.tipo === 'subpartida' && !otrosItems.length && <span title={`Sub-partida de ${donde.item}: el itemizado no baja a este nivel`} style={{ color: '#72706b' }}> ↳</span>}
                                            {otrosItems.length > 0 && <span title={`¿Código equivocado? Su descripción es la de ${otrosItems.slice(0, 3).join(', ')}${otrosItems.length > 3 ? '…' : ''} en el itemizado, no la de una sub-partida de ${donde.item}`} style={{ color: ROJO }}> ⚠</span>}
                                            {donde?.tipo === 'fuera' && <span title="No está en el itemizado" style={{ color: ROJO }}> ∉</span>}
                                        </div>
                                        <div style={{ ...celda, color: p.nombre ? '#141413' : ROJO }}
                                            title={p.oficial && p.nombreModelo && p.nombreModelo !== p.nombre ? `En el modelo: ${p.nombreModelo}` : undefined}>{p.nombre || 'sin nombre'}</div>
                                        <div style={{ ...celda, color: p.unidad ? '#52524d' : ROJO }}>{p.unidad || 'sin unidad'}</div>
                                        <div style={{ ...num, fontWeight: 600, color: p.conMedida ? '#141413' : '#b0aea5' }} title={calculada ? 'calculada: longitud total de barra × kg/m del diámetro' : ''}>
                                            {p.conMedida ? `${formatearNumero(p.cantidad)} ${p.unidad}` : '—'}{calculada ? <span style={{ fontWeight: 400, color: '#72706b' }}> ·calc.</span> : null}
                                        </div>
                                        <div style={{ ...num, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '4px' }}>
                                            {sel && new Set(p.claves).size > 1 && recorrido?.pasos > 1 ? (() => {
                                                // Recorrer pieza a pieza o, con miles (el acero), tramo a tramo.
                                                const piezas = [...new Set(p.claves)];
                                                const n = recorrido.pasos;
                                                const que = recorrido.porTramos ? 'Tramo' : 'Pieza';
                                                const ir = (k, ev) => { ev.stopPropagation(); setPaso(k); onSeleccionar(piezas, { enfocar: k, clave: p.clave }); };
                                                const k = paso ?? -1;
                                                return (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px' }} title={recorrido.porTramos ? `${piezas.length.toLocaleString('es-PE')} piezas en ${n} tramos de terreno` : undefined}>
                                                        <button className="v-enlace" title={`${que} anterior`} onClick={ev => ir((k - 1 + n) % n, ev)}>◀</button>
                                                        <span style={{ minWidth: '34px', textAlign: 'center' }}>{k >= 0 ? `${recorrido.porTramos ? 'T' : ''}${k + 1}/${n}` : `${n}${recorrido.porTramos ? ' T' : ''}`}</span>
                                                        <button className="v-enlace" title={`${que} siguiente`} onClick={ev => ir((k + 1) % n, ev)}>▶</button>
                                                    </span>
                                                );
                                            })() : p.elementos.toLocaleString('es-PE')}
                                        </div>
                                        <div style={{ ...num, color: p.sinMedida ? ROJO : '#b0aea5' }}>{p.sinMedida ? p.sinMedida.toLocaleString('es-PE') : '0'}</div>
                                        <div style={{ ...num, color: '#72706b' }} title={p.conManual ? `valor puesto a mano en el parámetro de la línea, en ${p.conManual} elementos; no se suma con lo nativo` : ''}>
                                            {p.conManual ? `${formatearNumero(p.manual)} ${p.unidad} (${p.conManual})` : ''}
                                        </div>
                                    </div>
                                );
                            })}
                        </React.Fragment>
                    );
                })}
                {!partidas.length && <div style={{ padding: '24px', color: '#72706b' }}>Ningún elemento del ámbito tiene partida asignada.</div>}
            </div>
        </div>
    );
}
