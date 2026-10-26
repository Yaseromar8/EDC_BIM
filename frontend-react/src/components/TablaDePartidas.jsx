import React, { useEffect, useMemo, useState } from 'react';
import { analizarPartidas, gruposDePartidas } from '../lib/planillaPartidas';
import { leerItemizado, cruzarCampos, diferencias } from '../lib/planillaItemizado';
import { formatearNumero } from '../lib/inventoryTabla';
import { compacto } from '../lib/inventoryBuscar';
import { EVENTOS } from '../lib/aislamientoTemporal';
import { coberturaDelItemizado, ESTADOS } from '../lib/planillaCobertura';
import { ID_ESTADO, ID_CAPITULO, COLORES_ESTADO } from '../lib/camposDerivados';

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

const miles = x => x.toLocaleString('es-PE');
const Cuadro = ({ color }) => <span aria-hidden style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '2px', background: color, flexShrink: 0 }} />;
const filaLista = { display: 'grid', gridTemplateColumns: '150px minmax(160px, 1fr) 110px 80px', gap: '8px', alignItems: 'center', height: '22px', padding: '0 6px', borderRadius: '3px' };
const recorte = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

// «Qué falta» (docs/visor/25, P1): lo que el total de Partidas NO incluye, recorrible y aislable.
function QueFalta({ cobertura, dif, ambito, activa, onAlternar, onCerrar }) {
    const titulo = { color: '#141413', fontWeight: 600, margin: '6px 0 2px', display: 'flex', alignItems: 'center', gap: '6px' };
    const clic = (clave, claves) => ({
        role: 'button', tabIndex: 0, onClick: () => onAlternar(clave, claves),
        onKeyDown: e => { if (e.key === 'Enter') onAlternar(clave, claves); },
        className: `inv-fila${activa === clave ? ' resaltada' : ''}`,
        title: activa === clave ? 'clic: mostrar todo' : `clic: aislar sus ${miles(new Set(claves).size)} elementos en el 3D`,
        style: { ...filaLista, cursor: 'pointer' },
    });
    const MAX = 100;
    return (
        <div style={{ borderBottom: '1px solid #e8e6dc', background: '#faf9f5', padding: '8px 12px', maxHeight: '220px', overflowY: 'auto', fontSize: '11.5px', color: '#52524d', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ color: '#141413', fontWeight: 600 }}>Qué falta</strong>
                <span>· en los {miles(cobertura.total)} elementos {ambito}: lo que el total de Partidas no incluye o no cuadra con el itemizado. Clic en una línea: aislar en el 3D.</span>
                <span style={{ flex: 1 }} />
                <button className="v-enlace" style={{ fontSize: '11px' }} onClick={onCerrar}>cerrar</button>
            </div>

            <div style={titulo}><Cuadro color={ESTADOS[3].color} />{miles(cobertura.porEstado.sin.length)} elementos sin partida, por categoría</div>
            {cobertura.sinPorCategoria.slice(0, 20).map(c => (
                <div key={c.categoria} {...clic(`sin:${c.categoria}`, c.claves)}>
                    <span style={recorte}>{c.categoria}</span><span /><span /><span style={{ textAlign: 'right' }}>{miles(c.claves.length)}</span>
                </div>
            ))}
            {cobertura.sinPorCategoria.length > 20 && <div style={{ paddingLeft: '6px' }}>y {cobertura.sinPorCategoria.length - 20} categorías más</div>}

            <div style={titulo}><Cuadro color={ESTADOS[2].color} />{miles(dif.fuera.length)} partidas del modelo fuera del itemizado (ni ítem ni sub-partida de un ítem)</div>
            {dif.fuera.slice(0, MAX).map(p => (
                <div key={p.clave} {...clic(`fuera:${p.clave}`, p.claves)}>
                    <span style={{ ...recorte, color: ROJO }}>{p.codigo}</span><span style={recorte}>{p.nombreModelo || p.nombre || '—'}</span>
                    <span>{p.unidad || '—'}</span><span style={{ textAlign: 'right' }}>{miles(p.elementos)}</span>
                </div>
            ))}
            {dif.fuera.length > MAX && <div style={{ paddingLeft: '6px' }}>y {miles(dif.fuera.length - MAX)} más</div>}
            {cobertura.porEstado.fuera.length > 0 && (
                <div {...clic('estado:fuera', cobertura.porEstado.fuera)}>
                    <span>todos</span><span style={recorte}>elementos con partida fuera del itemizado o sin código</span><span /><span style={{ textAlign: 'right' }}>{miles(cobertura.porEstado.fuera.length)}</span>
                </div>
            )}

            <div style={titulo}>{miles(dif.unidadDistinta.length)} partidas con unidad distinta en el modelo (manda la del itemizado)</div>
            {dif.unidadDistinta.slice(0, MAX).map(({ p, oficial }) => (
                <div key={p.clave} {...clic(`unidad:${p.clave}`, p.claves)}>
                    <span style={recorte}>{p.codigo}</span><span style={recorte}>{oficial.descripcion}</span>
                    <span style={{ color: ROJO }}>{p.unidadModelo} → {oficial.unidad}</span><span style={{ textAlign: 'right' }}>{miles(p.elementos)}</span>
                </div>
            ))}

            <div style={titulo}>{miles(dif.sinElementos.length)} partidas del itemizado (con unidad) sin ningún elemento {ambito}: lo que no se modela, o falta parametrizar</div>
            {dif.sinElementos.slice(0, MAX).map(x => (
                <div key={x.item} style={filaLista}>
                    <span style={recorte}>{x.item}</span><span style={recorte}>{x.descripcion}</span><span>{x.unidad}</span><span />
                </div>
            ))}
            {dif.sinElementos.length > MAX && <div style={{ paddingLeft: '6px' }}>y {miles(dif.sinElementos.length - MAX)} más</div>}
        </div>
    );
}

const fechaCorta = iso => { try { return new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; } };

// Cargar otra versión o quitar el itemizado de la OBRA. Solo quien la administra; quitar pide confirmación
// porque cambia lo que ve todo el equipo (la versión no se borra: queda en el historial del servidor).
function AccionesDelItemizado({ estado, hay, onArchivo, onQuitar }) {
    const deLaObra = estado.modo !== 'navegador';
    const [confirmar, setConfirmar] = useState(false);
    if (estado.cargando) return <span>Cargando el itemizado de la obra…</span>;
    if (!estado.puedeEditar) return <span style={{ color: '#72706b' }}>Solo un administrador de la obra carga o cambia el itemizado.</span>;
    if (estado.guardando) return <span>Guardando…</span>;
    if (confirmar) {
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                {deLaObra ? '¿Quitar el itemizado de toda la obra?' : '¿Quitar el itemizado?'}
                <button style={{ ...estiloBoton, color: ROJO, borderColor: ROJO }} onClick={() => { setConfirmar(false); onQuitar(); }}>Sí, quitar</button>
                <button style={estiloBoton} onClick={() => setConfirmar(false)}>No</button>
            </span>
        );
    }
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <BotonCargar onArchivo={onArchivo} texto={hay ? 'Cargar otra versión…' : 'Cargar itemizado…'} />
            {hay && <button onClick={() => setConfirmar(true)} title={deLaObra ? 'Deja la obra sin itemizado (la versión queda en el historial)' : 'Deja de usar el itemizado en este navegador'} style={estiloBoton}>✕ Quitar itemizado</button>}
        </span>
    );
}


const estiloBoton = { display: 'inline-flex', alignItems: 'center', border: '1px solid #cccac0', borderRadius: '3px', background: '#ffffff', color: '#52524d', font: 'inherit', fontSize: '11px', padding: '0 6px', height: '20px', cursor: 'pointer' };

function BotonCargar({ onArchivo, texto = 'Cargar itemizado…', ocupado = false }) {
    return (
        <label title="Excel o CSV con ítem, descripción y unidad. Se guarda como itemizado de la OBRA (una versión nueva) y lo usan todos sus frentes."
            style={{ ...estiloBoton, ...(ocupado ? { opacity: 0.5, pointerEvents: 'none' } : {}) }}>
            {texto}
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} disabled={ocupado}
                onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onArchivo(f); }} />
        </label>
    );
}

export default function TablaDePartidas({ filas, filasObra, dic, roles, claveDeFila, ambito, onUsarTodo, onSeleccionar, onMostrarTodo, onVerEnFilters, itemizado, estadoItemizado, onItemizado }) {
    const estadoObra = estadoItemizado || { cargando: false, guardando: false, puedeEditar: true, error: '' };
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
    // Cobertura frente al itemizado, sobre los mismos elementos que la tabla (docs/visor/25, P1).
    const cobertura = useMemo(() => (dic && indice ? coberturaDelItemizado(filas, dic, indice, claveDeFila) : null),
        [filas, dic, indice, claveDeFila]);
    const [verFalta, setVerFalta] = useState(false);
    const dif = useMemo(() => (verFalta && indice ? diferencias(partidas, indice, itemizado.items) : null), [verFalta, partidas, indice, itemizado]);
    // Un clic aísla (una partida, un estado, una categoría…); otro clic en lo MISMO muestra todo como estaba.
    const alternar = (clave, claves) => {
        setPaso(null); setRecorrido(null);
        if (activa === clave) { setActiva(null); onMostrarTodo?.(); return; }
        setActiva(clave);
        onSeleccionar([...new Set(claves)], { clave });
    };
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
            // Se guarda como itemizado de la obra; lo que se usa después es lo que devuelve el servidor.
            const r = await onItemizado({ items: leido.items, hoja: leido.hoja, columnas: leido.columnas, archivo: archivo.name });
            if (r && !r.ok) setErrorItemizado(r.error);
        } catch (e) {
            setErrorItemizado(`No se pudo leer el archivo: ${e.message}`);
        }
    };
    const quitarItemizado = async () => {
        setErrorItemizado('');
        const r = await onItemizado(null);
        if (r && !r.ok) setErrorItemizado(r.error);
    };
    const error = errorItemizado || estadoObra.error;
    const sinMedida = partidas.reduce((s, p) => s + p.sinMedida, 0);
    const lineas = partidas.reduce((s, p) => s + p.elementos, 0);

    // Sin itemizado no hay criterio: se pide, no se supone.
    if (!dic) {
        return (
            <div style={{ padding: '24px', color: '#52524d', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-start' }}>
                {itemizado
                    ? <span>Ningún parámetro del modelo contiene los ítems de «{itemizado.archivo}»{itemizado.version ? ` (versión ${itemizado.version})` : ''}.</span>
                    : <span>Carga el itemizado de la obra (ítem, descripción y unidad) para armar las partidas con tu criterio.
                        Se guarda para toda la obra, y la Planilla buscará en el modelo los parámetros donde están tus ítems.</span>}
                <span style={{ display: 'inline-flex', gap: '8px', alignItems: 'center' }}>
                    <AccionesDelItemizado estado={estadoObra} hay={!!itemizado} onArchivo={cargarItemizado} onQuitar={quitarItemizado} />
                    {error && <span style={{ color: ROJO }}>{error}</span>}
                </span>
                {estadoObra.aviso && <span style={{ color: '#72706b', fontSize: '12px' }}>{estadoObra.aviso}</span>}
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
                <span title={itemizado.local
                    ? `${itemizado.porque}. ${estadoObra.aviso || 'Solo en este navegador.'}`
                    : `${itemizado.porque}. Versión ${itemizado.version}${itemizado.creadoPor ? `, cargada por ${itemizado.creadoPor}` : ''}${itemizado.creadoEn ? ` el ${fechaCorta(itemizado.creadoEn)}` : ''}. Es el itemizado de la obra: lo usan todos sus frentes.`}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    {itemizado.local
                        ? <>itemizado «{itemizado.archivo}» · {itemizado.items.length.toLocaleString('es-PE')} ítems · <span style={{ color: '#9e5943' }}>solo en este navegador</span></>
                        : <>itemizado de la obra «{itemizado.archivo}» · v{itemizado.version} · {itemizado.items.length.toLocaleString('es-PE')} ítems</>}
                    <AccionesDelItemizado estado={estadoObra} hay onArchivo={cargarItemizado} onQuitar={quitarItemizado} />
                </span>
                {error && <span style={{ color: ROJO }}>{error}</span>}
                <span style={{ flex: 1 }} />
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title="m → Longitud · m² → Área · m³ → Volumen de Revit; kg → longitud total de barra × kg/m del diámetro de barra; und → 1 por elemento">Cantidad = medida nativa de Revit según la unidad</span>
            </div>
            {cobertura && (
                <div style={{ padding: '0 12px', height: '28px', flexShrink: 0, fontSize: '11px', color: '#52524d', borderBottom: '1px solid #e8e6dc', display: 'flex', gap: '10px', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                    <span title="Elementos con alguna línea cuyo código es un ítem del itemizado o sub-partida de uno, sobre los elementos de la tabla">
                        Cobertura del itemizado <strong style={{ color: '#141413', fontWeight: 600 }}>{cobertura.porcentaje.toLocaleString('es-PE')} %</strong>
                    </span>
                    {ESTADOS.map(e => {
                        const claves = cobertura.porEstado[e.id];
                        const clave = `estado:${e.id}`;
                        return (
                            <button key={e.id} disabled={!claves.length} onClick={() => alternar(clave, claves)}
                                title={activa === clave ? 'clic: mostrar todo' : `clic: aislar los ${miles(claves.length)} elementos ${e.etiqueta}`}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', border: 'none', borderRadius: '3px', padding: '0 5px', height: '20px', font: 'inherit', fontSize: '11px',
                                    background: activa === clave ? 'var(--alephia-selected-bg, #ECF0F1)' : 'transparent', color: claves.length ? '#52524d' : '#b0aea5', cursor: claves.length ? 'pointer' : 'default' }}>
                                <Cuadro color={e.color} />{miles(claves.length)} {e.etiqueta}
                            </button>
                        );
                    })}
                    <button className="v-enlace" style={{ fontSize: '11px' }} onClick={() => setVerFalta(v => !v)} aria-expanded={verFalta}
                        title="Lo que el total no incluye: elementos sin partida, partidas fuera del itemizado, unidades distintas y partidas sin elementos">
                        qué falta
                    </button>
                    <span style={{ flex: 1 }} />
                    {/* El color que se queda (y se guarda en las vistas) es de Filters: estos botones abren
                        Filters con el campo derivado arriba y coloreado (docs/visor/27 §6). */}
                    {onVerEnFilters && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            Colorear en Filters
                            <button style={estiloBoton} onClick={() => onVerEnFilters(ID_ESTADO, COLORES_ESTADO)}
                                title="Abre Filters con «Planilla › Estado frente al itemizado» y lo colorea con estos mismos colores">por estado</button>
                            <button style={estiloBoton} onClick={() => onVerEnFilters(ID_CAPITULO)}
                                title="Abre Filters con «Planilla › Capítulo» y lo colorea, un color por capítulo">por capítulo</button>
                        </span>
                    )}
                </div>
            )}
            {verFalta && cobertura && dif && <QueFalta cobertura={cobertura} dif={dif} ambito={ambito} activa={activa} onAlternar={alternar} onCerrar={() => setVerFalta(false)} />}
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
                                        onClick={() => alternar(p.clave, p.claves)}
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
