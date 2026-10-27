import React, { useEffect, useMemo, useRef, useState } from 'react';
import { analizarPartidas, normalizarUnidad } from '../lib/planillaPartidas';
import { plantillaDelItemizado, filasVisibles } from '../lib/planillaPlantilla';
import { leerItemizado, cruzarCampos, diferencias, normalizarCodigo } from '../lib/planillaItemizado';
import { formatearNumero } from '../lib/inventoryTabla';
import { compacto } from '../lib/inventoryBuscar';
import { EVENTOS } from '../lib/aislamientoTemporal';
import { coberturaDelItemizado, ESTADOS } from '../lib/planillaCobertura';
import { ID_ESTADO, ID_CAPITULO, COLORES_ESTADO } from '../lib/camposDerivados';
import { UNIDADES_MEDIBLES, MAX_MEDIR_CON, candidatosDeMedida, candidatosAMano, camposParaDonde, simularCriterio, validarCriterios,
    claveDeCriterio, describirCriterio, etiquetaDeClave, sinMedidaNativa, usoDeCriterios } from '../lib/criteriosDeMedida';

/**
 * Vista «Partidas» de la Planilla: el ITEMIZADO como plantilla (docs/visor/33). Todas sus
 * filas, en el orden del Excel y desplegadas: títulos con «x de y con dato» y, en cada
 * partida, lo que el modelo tiene de ella (cantidad NATIVA de Revit en la unidad de la
 * partida, docs/visor/23 §7); si no tiene nada, la fila queda vacía, a la vista. Las
 * partidas del modelo fuera del itemizado no van aquí: están en «qué falta». El criterio sale
 * SOLO del itemizado que sube el administrador. Donde no hay medida nativa,
 * la da un criterio de medida de la obra («Medir con…», docs/visor/32), marcado
 * «·crit.». Lo manual va aparte. Clic en
 * una partida = sus elementos en el 3D; clic en un título = plegar o desplegar.
 */
const celda = { padding: '0 8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const num = { ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const COLUMNAS = [
    { titulo: 'Código', ancho: '170px' },
    { titulo: 'Partida', ancho: 'minmax(260px, 1fr)' },
    { titulo: 'Unidad', ancho: '64px' },
    { titulo: 'Cantidad', ancho: '150px', derecha: true },
    { titulo: 'Elementos', ancho: '84px', derecha: true },
    { titulo: 'Sin medida', ancho: '150px', derecha: true },
    { titulo: 'Manual (aparte)', ancho: '150px', derecha: true },
];
const rejilla = COLUMNAS.map(c => c.ancho).join(' ');
const ALTO = 24;   // alto de cada fila de la plantilla (se dibujan solo las que se ven); 24 = más pegadas, como un Excel
// Formato de la plantilla, con la paleta oficial (D-24): el código en gris con cifras alineadas, como en
// un presupuesto; los títulos de nivel 1 en Light 50, los demás solo en negrita; lo vacío en Mid Gray.
const codigoCelda = { fontVariantNumeric: 'tabular-nums', fontSize: '11.5px' };
const GRIS_600 = '#72706b', GRIS_700 = '#52524d', MID_GRAY = '#b0aea5', AVISO = '#734500';
// Bandas de la EDT por nivel, como Primavera (pedido del dueño, 27-oct-2026: «bandas más suaves»): cada
// nivel de título con su color, de más marcado (capítulo) a más claro; todos de la lista cerrada de la
// paleta (D-24): Gris 300, Light Gray, Light 50 y Light. Las partidas, en blanco debajo de su banda.
const BANDAS = [
    { fondo: '#cccac0', texto: '#141413', apoyo: '#52524d', flecha: '#72706b' },   // nivel 1
    { fondo: '#e8e6dc', texto: '#141413', apoyo: '#52524d', flecha: '#72706b' },   // nivel 2
    { fondo: '#f1f0e8', texto: '#141413', apoyo: '#72706b', flecha: '#b0aea5' },   // nivel 3
    { fondo: '#faf9f5', texto: '#141413', apoyo: '#72706b', flecha: '#b0aea5' },   // nivel 4 y más
];
const bandaDe = nivel => BANDAS[Math.min(Math.max(1, nivel), BANDAS.length) - 1];
const sangria = nivel => `${8 + (Math.max(1, nivel) - 1) * 12}px`;
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
                <span>· a partir de tu itemizado «{itemizado.archivo}» y de los valores del modelo (no de los nombres de los parámetros); los códigos se comparan sin ceros a la izquierda («02.01.01.04» = «2.1.1.4»)</span>
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

// ── Criterios de medida de la obra («Medir con…», docs/visor/32) ──────────────────────────────
const panel = { borderBottom: '1px solid #e8e6dc', background: '#faf9f5', padding: '8px 12px', maxHeight: '260px', overflowY: 'auto', fontSize: '11.5px', color: '#52524d', flexShrink: 0 };
const fmt = (n, u) => `${formatearNumero(n)} ${u}`;
const campoForm = { font: 'inherit', fontSize: '11.5px', height: '22px', border: '1px solid #cccac0', borderRadius: '3px', background: '#ffffff', color: '#333330', padding: '0 4px' };
const etiquetaRadio = { display: 'inline-flex', gap: '4px', alignItems: 'center', cursor: 'pointer' };

// Para una partida con elementos sin medida nativa: elegir con qué parámetro se miden (sin preselección),
// a qué alcanza y, si hace falta, limitarlo con «solo donde». Se ve el resultado antes de guardar.
function MedirCon({ partida, codigoOficial, sinNativa, obra, claveNativa, juego, estado, onGuardar, onCerrar }) {
    const unidad = partida.unidad;
    const claves = useMemo(() => [...new Set(sinNativa.flatMap(Object.keys))], [sinNativa]);
    const candidatos = useMemo(() => candidatosDeMedida(sinNativa, unidad, claves), [sinNativa, unidad, claves]);
    const campos = useMemo(() => camposParaDonde(sinNativa, claves, { obra }), [sinNativa, claves, obra]);
    // Escritos a mano (números sin unidad): solo los PROBABLES, con su razón; el resto, a pedido.
    const aMano = useMemo(() => candidatosAMano(sinNativa, unidad, claves, { obra, claveNativa }), [sinNativa, unidad, claves, obra, claveNativa]);
    const [verTodosAMano, setVerTodosAMano] = useState(false);
    const clavesAMano = useMemo(() => new Set([...aMano.probables, ...aMano.otros].map(c => c.clave)), [aMano]);
    const [elegidos, setElegidos] = useState([]);
    const [alcance, setAlcance] = useState('partida');
    const [conDonde, setConDonde] = useState(false);
    const [campo, setCampo] = useState('');
    const [op, setOp] = useState('es');
    const [valor, setValor] = useState('');
    const [factorTexto, setFactorTexto] = useState('1');
    const [error, setError] = useState('');
    // «× 0,5» para «ambas caras ÷ 2», «× 2», conversiones: un número fijo, no una fórmula.
    const factor = (() => { const n = Number(String(factorTexto).replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; })();
    const fichaCampo = campos.find(c => c.campo === campo) || null;
    const donde = conDonde && campo && valor.trim() ? { campo, op, valor: valor.trim() } : null;
    const conAMano = elegidos.some(k => clavesAMano.has(k));
    const criterio = useMemo(() => (elegidos.length
        ? { unidad, ...(alcance === 'partida' ? { partida: codigoOficial } : {}), ...(donde ? { donde } : {}), medirCon: elegidos,
            ...(factor && factor !== 1 ? { factor } : {}), ...(conAMano ? { aMano: true } : {}) }
        : null), [unidad, alcance, codigoOficial, donde?.campo, donde?.op, donde?.valor, elegidos, conAMano, factor]); // eslint-disable-line react-hooks/exhaustive-deps
    const sim = useMemo(() => (criterio ? simularCriterio(sinNativa, criterio) : null), [sinNativa, criterio]);
    const actuales = juego?.criterios || [];
    const reemplaza = criterio ? actuales.find(c => claveDeCriterio(c) === claveDeCriterio(criterio)) : null;
    // Los criterios que ya tiene ESTA partida: se ven arriba y se pueden quitar para volver a lo detectado.
    const deEstaPartida = actuales.filter(c => c.unidad === unidad && c.partida && normalizarCodigo(c.partida) === normalizarCodigo(codigoOficial));
    const quitar = async c => {
        setError('');
        const r = await onGuardar(actuales.filter(x => x !== c));
        if (r && !r.ok) setError(r.error || 'No se pudo quitar.');
        else onCerrar();
    };
    const guardar = async () => {
        setError('');
        const lista = [...actuales.filter(c => c !== reemplaza), criterio];
        const { errores } = validarCriterios(lista);
        if (errores.length) { setError(errores[0].motivo); return; }
        const r = await onGuardar(lista);
        if (r && !r.ok) setError(r.error || 'No se pudo guardar.');
        else onCerrar();
    };
    const etiqueta = clave => candidatos.find(c => c.clave === clave)?.etiqueta || etiquetaDeClave(clave);
    const filaCandidato = (c, extra = null) => (
        <div key={c.clave} role="button" tabIndex={0} className="inv-fila" onClick={() => setElegidos([...elegidos, c.clave])}
            onKeyDown={e => { if (e.key === 'Enter') setElegidos([...elegidos, c.clave]); }} title={c.porque || undefined}
            style={{ ...filaLista, gridTemplateColumns: 'minmax(180px, 1fr) 150px 130px', cursor: 'pointer' }}>
            <span style={{ ...recorte, color: '#141413' }}>{c.etiqueta}{extra}</span>
            <span>{miles(c.conDato)} de {miles(sinNativa.length)} con dato</span>
            <span style={{ textAlign: 'right' }}>Σ {fmt(c.suma, unidad)}</span>
        </div>
    );
    const hayAlgo = candidatos.length > 0 || aMano.probables.length > 0 || aMano.otros.length > 0;
    return (
        <div style={panel}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <strong style={{ color: '#141413', fontWeight: 600 }}>Medir con…</strong>
                <span>· {codigoOficial} {partida.nombre} ({unidad}) · {miles(sinNativa.length)} elementos de la obra sin medida nativa. Solo se rellenan esos: la medida nativa manda siempre.</span>
                <span style={{ flex: 1 }} />
                <button className="v-enlace" style={{ fontSize: '11px' }} onClick={onCerrar}>cerrar</button>
            </div>
            {deEstaPartida.map((c, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '22px', marginBottom: '4px', color: '#141413' }}>
                    <span>Criterio actual: <strong style={{ fontWeight: 600 }}>{describirCriterio(c)}</strong></span>
                    <button style={estiloBoton} disabled={estado.guardando} onClick={() => quitar(c)}
                        title="Quita este criterio: la partida vuelve a la medida detectada (la nativa de Revit) y lo que no la tenga queda «sin medida»">
                        quitar: volver a la medida detectada
                    </button>
                </div>
            ))}
            {!hayAlgo && <div>Ningún parámetro de esos elementos trae valores en {unidad}, ni números escritos a mano. La medida no llega al visor: hay que volcarla en Revit a un parámetro del elemento.</div>}
            {hayAlgo && (
                <>
                    <div style={{ color: '#141413', fontWeight: 600, margin: '2px 0' }}>Medir con (en orden: se usa el primero que tenga valor)</div>
                    {elegidos.map((k, i) => (
                        <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '22px', paddingLeft: '6px' }}>
                            <span style={{ color: '#141413' }}>{i + 1}. {etiqueta(k)}</span>
                            <button className="v-enlace" style={{ fontSize: '11px' }} onClick={() => setElegidos(elegidos.filter(x => x !== k))}>quitar</button>
                        </div>
                    ))}
                    {elegidos.length < MAX_MEDIR_CON && (
                        <div style={{ paddingLeft: '6px' }}>
                            <span>{elegidos.length ? 'si falta, con:' : 'elige un parámetro:'}</span>
                            {candidatos.filter(c => !elegidos.includes(c.clave)).slice(0, 12).map(c => filaCandidato(c))}
                            {(aMano.probables.length > 0 || aMano.otros.length > 0) && (
                                <>
                                    <div style={{ color: '#141413', fontWeight: 600, margin: '6px 0 2px' }}>
                                        Escritos a mano (números sin unidad, se leen en {unidad})
                                    </div>
                                    {!aMano.probables.length && <div style={{ paddingLeft: '6px', color: '#72706b' }}>Ninguno parece corresponder (ni coincide con la medida de Revit ni está lleno solo donde falta).</div>}
                                    {aMano.probables.filter(c => !elegidos.includes(c.clave)).map(c => filaCandidato(c, <span style={{ color: '#72706b', fontWeight: 400 }}> · {c.porque}</span>))}
                                    {aMano.otros.length > 0 && (
                                        <button className="v-enlace" style={{ fontSize: '11px', marginLeft: '6px' }} onClick={() => setVerTodosAMano(v => !v)}>
                                            {verTodosAMano ? 'ocultar los demás' : `ver todos (${aMano.otros.length} más)`}
                                        </button>
                                    )}
                                    {verTodosAMano && aMano.otros.filter(c => !elegidos.includes(c.clave)).map(c => filaCandidato(c))}
                                </>
                            )}
                        </div>
                    )}
                    {conAMano && <div style={{ color: '#9e5943', marginTop: '4px' }}>Con un parámetro escrito a mano: su número se toma en {unidad} y la cantidad sale marcada «a mano» (lo declaró quien modeló; no es geometría).</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '6px', flexWrap: 'wrap' }}>
                        <label style={etiquetaRadio} title="El valor del parámetro se multiplica por este número. Ej.: 0,5 para «ambas caras» (÷ 2), 2 para el doble. Queda escrito en el criterio.">
                            multiplicar por
                            <input style={{ ...campoForm, width: '56px', textAlign: 'right', borderColor: factor ? '#cccac0' : ROJO }} value={factorTexto}
                                onChange={e => setFactorTexto(e.target.value)} inputMode="decimal" />
                        </label>
                        <span>Vale para:</span>
                        <label style={etiquetaRadio}><input type="radio" checked={alcance === 'partida'} onChange={() => setAlcance('partida')} />esta partida</label>
                        <label style={etiquetaRadio}><input type="radio" checked={alcance === 'obra'} onChange={() => setAlcance('obra')} />todas las partidas en {unidad} de la obra</label>
                        <label style={etiquetaRadio}>
                            <input type="checkbox" checked={conDonde} onChange={e => setConDonde(e.target.checked)} disabled={!campos.length} />solo donde
                        </label>
                        {conDonde && (
                            <>
                                <select style={campoForm} value={campo} onChange={e => { setCampo(e.target.value); setValor(''); }}>
                                    <option value="">campo…</option>
                                    {campos.map(c => <option key={c.campo} value={c.campo}>{c.etiqueta}{c.enObra != null ? ` · ${miles(c.enObra)} en la obra` : ''}</option>)}
                                </select>
                                <select style={campoForm} value={op} onChange={e => setOp(e.target.value)}>
                                    <option value="es">es</option>
                                    <option value="contiene">contiene</option>
                                </select>
                                {op === 'es' && fichaCampo
                                    ? (
                                        <select style={{ ...campoForm, maxWidth: '320px' }} value={valor} onChange={e => setValor(e.target.value)}>
                                            <option value="">valor…</option>
                                            {fichaCampo.valores.map(v => <option key={v.valor} value={v.valor}>{v.valor} ({miles(v.n)})</option>)}
                                        </select>
                                    )
                                    : <input style={{ ...campoForm, width: '200px' }} value={valor} onChange={e => setValor(e.target.value)} placeholder="texto" />}
                            </>
                        )}
                    </div>
                    {sim && (
                        <div style={{ marginTop: '6px', color: '#141413' }}>
                            En esta partida: <strong style={{ fontWeight: 600 }}>{miles(sim.medidos)}</strong> elementos medidos · Σ {fmt(sim.suma, unidad)}
                            {sim.sinValor > 0 && <span style={{ color: ROJO }}> · {miles(sim.sinValor)} siguen sin medida (sin valor)</span>}
                            {sim.unidadDistinta > 0 && <span style={{ color: ROJO }}> · {miles(sim.unidadDistinta)} con el valor en otra unidad (no se usan)</span>}
                            {sim.fueraDeDonde > 0 && <span> · {miles(sim.fueraDeDonde)} fuera de «solo donde»</span>}
                        </div>
                    )}
                    {reemplaza && <div style={{ color: '#9e5943' }}>Reemplaza al criterio actual: {describirCriterio(reemplaza)}</div>}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                        <button style={{ ...estiloBoton, ...(criterio && factor && !estado.guardando ? {} : { opacity: 0.5, pointerEvents: 'none' }) }} onClick={guardar}>
                            {estado.guardando ? 'Guardando…' : 'Guardar criterio'}
                        </button>
                        <button style={estiloBoton} onClick={onCerrar}>Cancelar</button>
                        <span style={{ color: '#72706b' }}>{estado.modo === 'navegador' ? estado.aviso : 'Se guarda para toda la obra (una versión nueva de sus criterios de medida).'}</span>
                        {error && <span style={{ color: ROJO }}>{error}</span>}
                    </div>
                </>
            )}
        </div>
    );
}

// Los criterios de medida vigentes de la obra, con lo que mide cada uno en lo cargado.
function ListaDeCriterios({ juego, uso, estado, onGuardar, onCerrar }) {
    const [error, setError] = useState('');
    const quitar = async c => {
        setError('');
        const r = await onGuardar(juego.criterios.filter(x => x !== c));
        if (r && !r.ok) setError(r.error || 'No se pudo quitar.');
    };
    return (
        <div style={panel}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <strong style={{ color: '#141413', fontWeight: 600 }}>Criterios de medida de la obra</strong>
                <span>
                    · dan la cantidad solo donde el elemento no trae medida nativa
                    {juego?.version ? ` · versión ${juego.version}${juego.creadoPor ? `, de ${juego.creadoPor}` : ''}${juego.creadoEn ? ` el ${fechaCorta(juego.creadoEn)}` : ''}` : ''}
                    {juego?.local ? ' · solo en este navegador' : ''}
                </span>
                <span style={{ flex: 1 }} />
                <button className="v-enlace" style={{ fontSize: '11px' }} onClick={onCerrar}>cerrar</button>
            </div>
            {!juego?.criterios.length && <div>No hay criterios. En una partida con elementos «sin medida», «medir con…» los crea.</div>}
            {(juego?.criterios || []).map((c, i) => {
                const u = uso?.get(c);
                return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '22px', paddingLeft: '6px' }}>
                        <span style={{ color: '#141413' }}>{describirCriterio(c)}</span>
                        {u && (u.medidos
                            ? <span>· mide {miles(u.medidos)} · Σ {fmt(u.suma, c.unidad)}</span>
                            : <span style={{ color: ROJO }}>· sin efecto en lo cargado</span>)}
                        {u?.sinValor > 0 && <span style={{ color: ROJO }}>· {miles(u.sinValor)} sin valor</span>}
                        {u?.unidadDistinta > 0 && <span style={{ color: ROJO }}>· {miles(u.unidadDistinta)} en otra unidad</span>}
                        {u?.conflictos > 0 && <span style={{ color: ROJO }} title="Otro criterio del mismo nivel aplica a los mismos elementos: no se elige uno en silencio">· {miles(u.conflictos)} en conflicto</span>}
                        {estado.puedeEditar && <button className="v-enlace" style={{ fontSize: '11px' }} disabled={estado.guardando} onClick={() => quitar(c)}>quitar</button>}
                    </div>
                );
            })}
            {!estado.puedeEditar && <div style={{ color: '#72706b', marginTop: '4px' }}>Solo un administrador de la obra pone o quita criterios de medida.</div>}
            {estado.aviso && <div style={{ color: '#72706b', marginTop: '4px' }}>{estado.aviso}</div>}
            {(error || estado.error) && <div style={{ color: ROJO }}>{error || estado.error}</div>}
        </div>
    );
}

export default function TablaDePartidas({ filas, filasObra, dic, roles, claveDeFila, ambito, onUsarTodo, onSeleccionar, onMostrarTodo, onVerEnFilters, itemizado, estadoItemizado, onItemizado, criterios, estadoCriterios, onCriterios, busqueda = '' }) {
    const estadoObra = estadoItemizado || { cargando: false, guardando: false, puedeEditar: true, error: '' };
    const estadoCrit = estadoCriterios || { cargando: false, guardando: false, puedeEditar: false, error: '', modo: 'obra', aviso: '' };
    const [medirCon, setMedirCon] = useState(null);         // clave de la partida cuyo «Medir con…» está abierto
    const [verCriterios, setVerCriterios] = useState(false);
    const [activa, setActiva] = useState(null);
    const [paso, setPaso] = useState(null);     // paso del recorrido de la partida activa
    // Cuántos pasos tiene el recorrido: lo dice el visor (piezas sueltas, o tramos si son miles).
    const [recorrido, setRecorrido] = useState(null);
    useEffect(() => {
        const al = e => setRecorrido(e.detail);
        window.addEventListener(EVENTOS.RECORRIDO, al);
        return () => window.removeEventListener(EVENTOS.RECORRIDO, al);
    }, []);
    const [verComo, setVerComo] = useState(false);
    const [errorItemizado, setErrorItemizado] = useState('');
    const indice = itemizado?.indice || null;
    const { partidas, calidad } = useMemo(() => (dic ? analizarPartidas(filas, dic, claveDeFila) : { partidas: [], calidad: { repetidas: 0, intercambiadas: 0 } }),
        [filas, dic, claveDeFila]);
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
    const porCriterio = partidas.reduce((s, p) => s + p.porCriterio, 0);
    // «Medir con…» mira toda la obra (no solo el ámbito): el criterio es de la obra.
    const partidaAMedir = medirCon ? partidas.find(p => p.clave === medirCon) || null : null;
    const sinNativa = useMemo(() => (partidaAMedir && dic ? sinMedidaNativa(filasObra, dic, partidaAMedir.codigo, partidaAMedir.unidad) : []),
        [partidaAMedir, dic, filasObra]);
    const uso = useMemo(() => (verCriterios && dic?.criterios ? usoDeCriterios(filasObra, dic) : null), [verCriterios, dic, filasObra]);
    const codigoOficial = p => {
        const d = indice && p.codigo ? indice.ubicar(p.codigo) : null;
        return d?.tipo === 'exacto' ? d.item : p.codigo;
    };
    const medible = p => !!(p.codigo && UNIDADES_MEDIBLES.includes(p.unidad) && onCriterios && estadoCrit.puedeEditar);

    // ── La plantilla: el itemizado en su orden, todo desplegado (docs/visor/33) ──
    const plantilla = useMemo(() => (dic && itemizado ? plantillaDelItemizado(itemizado.items, partidas, indice) : null), [dic, itemizado, partidas, indice]);
    const [plegados, setPlegados] = useState(() => new Set());     // índices de títulos plegados A MANO
    useEffect(() => { setPlegados(new Set()); }, [itemizado?.huella]);
    const [soloConDato, setSoloConDato] = useState(false);
    const texto = String(busqueda || '');
    const visibles = useMemo(() => (plantilla ? filasVisibles(plantilla, { plegados, soloConDato, texto }) : []), [plantilla, plegados, soloConDato, texto]);
    // Lo que se dibuja, fila a fila: títulos, partidas y sus sub-partidas. Solo lo del itemizado: las
    // partidas del modelo que no están en él NO van en la plantilla (confundía, dijo el dueño el 26-oct);
    // siguen en «qué falta» y en la cobertura.
    const lista = useMemo(() => {
        if (!plantilla) return [];
        const out = [];
        for (const i of visibles) {
            const f = plantilla.filas[i];
            if (f.tipo === 'titulo') { out.push({ tipo: 'titulo', clave: `t${i}`, i, f }); continue; }
            out.push({ tipo: 'partida', clave: `p${i}`, f });
            for (const p of f.sub) out.push({ tipo: 'sub', clave: `s${i}|${p.clave}`, p, f });
        }
        return out;
    }, [plantilla, visibles]);
    const plegarTitulo = i => setPlegados(prev => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
    const cuerpoRef = useRef(null);
    const [scroll, setScroll] = useState(0);
    const [altoVista, setAltoVista] = useState(600);
    useEffect(() => {
        const el = cuerpoRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(() => setAltoVista(el.clientHeight));
        ro.observe(el);
        return () => ro.disconnect();
    }, [!!plantilla]); // eslint-disable-line react-hooks/exhaustive-deps
    const desde = Math.max(0, Math.floor(scroll / ALTO) - 10);
    const hasta = Math.min(lista.length, Math.ceil((scroll + altoVista) / ALTO) + 10);
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
    // Una partida CON elementos en el modelo (la misma fila de siempre). `codigo` y `nombre` son los del
    // itemizado cuando la fila es de la plantilla; las sub-partidas llevan los del modelo.
    const filaConDato = (p, { codigo = p.codigo, nombre = p.nombre, nivel = 1 } = {}) => {
        const sel = activa === p.clave;
        const calculada = p.origenes.includes('calculada');
        const conCriterio = p.origenes.includes('criterio');
        const aManoP = p.origenes.includes('a mano');
        const donde = indice && p.codigo ? indice.ubicar(p.codigo) : null;
        // Una sub-partida de verdad tiene SU descripción (el FUSTE del buzón). Si la
        // del modelo es la de OTROS ítems del itemizado, el código está mal puesto
        // (Canal: 04.02.03.05 bajo «ACARREO…» con «INSTALACION DE ACERO…»).
        const otrosItems = donde?.tipo === 'subpartida' ? (indice.porDescripcion.get(compacto(p.nombreModelo || p.nombre)) || []) : [];
        return (
            <div role="row" aria-selected={sel} className={`inv-fila${sel ? ' resaltada' : ''}`}
                onClick={() => alternar(p.clave, p.claves)}
                title={`${codigo || '(sin código)'} · ${nombre || '(sin nombre)'} — ${sel ? 'clic: mostrar todo' : `clic: aislar sus ${p.elementos} elementos en el 3D`}`}
                style={{ display: 'grid', gridTemplateColumns: rejilla, height: `${ALTO}px`, alignItems: 'center', borderBottom: '1px solid #e8e6dc', cursor: 'pointer', background: '#ffffff' }}>
                <div style={{ ...celda, ...codigoCelda, paddingLeft: sangria(nivel), color: codigo ? GRIS_700 : ROJO }}>
                    {codigo || 'sin código'}
                    {p.intercambiadas ? <span title="En Revit el código estaba en NombreDePartida" style={{ color: ROJO }}> ⇄</span> : null}
                    {p.unidas > 1 && <span title={`El mismo ítem escrito de ${p.unidas} formas en el modelo (con y sin ceros a la izquierda): se suman`} style={{ color: '#72706b' }}> ×{p.unidas}</span>}
                    {donde?.tipo === 'subpartida' && !otrosItems.length && <span title={`Sub-partida de ${donde.item}: el itemizado no baja a este nivel`} style={{ color: '#72706b' }}> ↳</span>}
                    {otrosItems.length > 0 && <span title={`¿Código equivocado? Su descripción es la de ${otrosItems.slice(0, 3).join(', ')}${otrosItems.length > 3 ? '…' : ''} en el itemizado, no la de una sub-partida de ${donde.item}`} style={{ color: ROJO }}> ⚠</span>}
                    {donde?.tipo === 'fuera' && <span title="No está en el itemizado" style={{ color: ROJO }}> ∉</span>}
                </div>
                <div style={{ ...celda, color: nombre ? '#141413' : ROJO }}
                    title={p.oficial && p.nombreModelo && p.nombreModelo !== nombre ? `En el modelo: ${p.nombreModelo}` : undefined}>{nombre || 'sin nombre'}</div>
                <div style={{ ...celda, color: p.unidad ? '#52524d' : ROJO }}>{p.unidad || 'sin unidad'}</div>
                <div style={{ ...num, fontWeight: 500, color: p.conMedida ? '#141413' : MID_GRAY }}
                    title={[calculada ? 'calculada: longitud total de barra × kg/m del diámetro' : '',
                        conCriterio || aManoP ? `${p.medidoCon.map(m => `${miles(m.n)} medidos con ${etiquetaDeClave(m.clave)} (Σ ${fmt(m.suma, p.unidad)})`).join('; ')}: criterio de medida de la obra, porque no traen medida nativa${aManoP ? '; «a mano» = número escrito a mano en Revit, no sale de la geometría' : ''}${p.conMedida > p.porCriterio ? `; ${miles(p.conMedida - p.porCriterio)} con su medida nativa` : ''}` : ''].filter(Boolean).join(' · ')}>
                    {p.conMedida ? <>{formatearNumero(p.cantidad)} <span style={{ fontWeight: 400, color: GRIS_600 }}>{p.unidad}</span></> : '—'}
                    {calculada ? <span style={{ fontWeight: 400, color: '#72706b' }}> ·calc.</span> : null}
                    {p.unidad === 'glb' && p.conMedida ? <span style={{ fontWeight: 400, color: '#72706b' }} title={`Partida global: vale 1 en total, aunque la lleven ${miles(p.elementos)} elementos`}> ·global</span> : null}
                    {conCriterio ? <span style={{ fontWeight: 400, color: '#72706b' }}> ·crit.</span> : null}
                    {aManoP ? <span style={{ fontWeight: 400, color: AVISO }}> ·man.</span> : null}
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
                <div style={{ ...num, color: p.sinMedida ? ROJO : '#b0aea5', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '6px' }}>
                    {p.conflictos > 0 && <span title={`${miles(p.conflictos)} con dos criterios de medida del mismo nivel: no se elige uno en silencio (ver «criterios de medida»)`}>⚠</span>}
                    {p.sinMedida ? p.sinMedida.toLocaleString('es-PE') : ''}
                    {(p.sinMedida > 0 || conCriterio || aManoP) && medible(p) && (
                        <button className="v-enlace" style={{ fontSize: '11px' }}
                            title="Elegir con qué parámetro se miden los elementos de esta partida que no traen medida nativa"
                            onClick={ev => { ev.stopPropagation(); const k = String(p.clave).split('+')[0]; setMedirCon(medirCon === k ? null : k); }}>
                            medir con…
                        </button>
                    )}
                </div>
                <div style={{ ...num, color: '#72706b' }} title={p.conManual ? `valor puesto a mano en el parámetro de la línea, en ${p.conManual} elementos; no se suma con lo nativo` : ''}>
                    {p.conManual ? `${formatearNumero(p.manual)} ${p.unidad} (${p.conManual})` : ''}
                </div>
            </div>
        );
    };
    // Una partida del itemizado SIN elementos en el modelo: queda, vacía y a la vista.
    const filaVacia = f => (
        <div role="row" title={`${f.item} · ${f.descripcion} — ${f.sub.length ? 'sin elementos con este código exacto; los tiene en sus sub-partidas, debajo' : 'sin elementos en el modelo: este metrado no sale del modelo'}`}
            style={{ display: 'grid', gridTemplateColumns: rejilla, height: `${ALTO}px`, alignItems: 'center', borderBottom: '1px solid #e8e6dc', background: '#ffffff', color: MID_GRAY }}>
            <div style={{ ...celda, ...codigoCelda, paddingLeft: sangria(f.nivel) }}>{f.item}</div>
            <div style={celda}>{f.descripcion}</div>
            <div style={celda}>{normalizarUnidad(f.unidad) || f.unidad}</div>
            <div style={num}>—</div>
            <div style={num}>{f.sub.length ? '↓' : '0'}</div>
            <div /><div />
        </div>
    );
    const filaTitulo = r => {
        const { f, i } = r;
        const plegado = plegados.has(i);
        const banda = bandaDe(f.nivel);
        return (
            <div role="row" onClick={() => plegarTitulo(i)} title={`${f.item} · ${f.descripcion} — ${f.conDato} de ${f.total} partidas con elementos en el modelo · clic: ${plegado ? 'desplegar' : 'plegar'}`}
                style={{ display: 'grid', gridTemplateColumns: rejilla, height: `${ALTO}px`, alignItems: 'center', cursor: 'pointer',
                    borderBottom: '1px solid #e8e6dc', background: banda.fondo, fontWeight: 600, color: banda.texto }}>
                <div style={{ ...celda, ...codigoCelda, fontWeight: 600, paddingLeft: sangria(f.nivel), color: banda.texto }}>
                    <span style={{ display: 'inline-block', width: '12px', color: banda.flecha }}>{plegado ? '▸' : '▾'}</span>{f.item}
                </div>
                <div style={celda}>{f.descripcion}</div>
                <div />
                <div />
                {/* «x de y con dato» en la columna de elementos: se lee de un vistazo, alineado. */}
                <div style={{ ...num, fontWeight: 400, fontSize: '11px', color: banda.apoyo }}
                    title={`${f.conDato} de ${f.total} partidas de este título tienen elementos en el modelo`}>
                    {f.total > 0 ? `${miles(f.conDato)}/${miles(f.total)}` : ''}
                </div>
                <div /><div />
            </div>
        );
    };
    const dibujar = r => {
        if (r.tipo === 'titulo') return filaTitulo(r);
        if (r.tipo === 'partida') return r.f.datos ? filaConDato(r.f.datos, { codigo: r.f.item, nombre: r.f.descripcion, nivel: r.f.nivel }) : filaVacia(r.f);
        return filaConDato(r.p, { nivel: r.f.nivel + 1 });   // 'sub'
    };
    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: '#ffffff', fontSize: '12px', color: '#333330' }}>
            <div style={{ padding: '0 12px', height: '28px', flexShrink: 0, fontSize: '11px', color: '#72706b', borderBottom: '1px solid #e8e6dc', display: 'flex', gap: '8px', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden' }}>
                <span title="Partidas del itemizado (filas con unidad) que tienen elementos en el modelo, sobre todas las del itemizado">
                    <strong style={{ color: '#141413', fontWeight: 600 }}>{miles(plantilla.resumen.conDato)}</strong> de {miles(plantilla.resumen.partidas)} partidas del itemizado con dato
                    {' · '}{lineas.toLocaleString('es-PE')} líneas de {filas.length.toLocaleString('es-PE')} elementos {ambito}
                </span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }} title="Oculta las partidas sin elementos en el modelo y los títulos sin ninguna">
                    <input type="checkbox" checked={soloConDato} onChange={e => setSoloConDato(e.target.checked)} />solo con dato
                </label>
                {plegados.size > 0 && <button className="v-enlace" style={{ fontSize: '11px' }} onClick={() => setPlegados(new Set())}>desplegar todo</button>}
                {onUsarTodo && <button className="v-enlace" style={{ fontSize: '11px' }} onClick={onUsarTodo}>usar toda la tabla</button>}
                {porCriterio > 0 && <span title="Líneas sin medida nativa medidas con un criterio de medida de la obra">· {porCriterio.toLocaleString('es-PE')} medidas con criterio</span>}
                {sinMedida > 0 && <span style={{ color: ROJO }}>· {sinMedida.toLocaleString('es-PE')} sin medida</span>}
                {(onCriterios || criterios?.criterios.length > 0) && (
                    <button className="v-enlace" style={{ fontSize: '11px' }} onClick={() => setVerCriterios(v => !v)} aria-expanded={verCriterios}
                        title="Con qué parámetro se mide lo que no trae medida nativa, para toda la obra">
                        criterios de medida ({criterios?.criterios.length || 0})
                    </button>
                )}
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
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }} title="m → Longitud · m² → Área · m³ → Volumen de Revit; kg → longitud total de barra × kg/m del diámetro de barra; und → 1 por elemento. Si el elemento no la trae: el criterio de medida de la obra (·crit.)">Cantidad = medida nativa; si falta, criterio de la obra</span>
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
            {verCriterios && <ListaDeCriterios juego={criterios} uso={uso} estado={estadoCrit} onGuardar={onCriterios} onCerrar={() => setVerCriterios(false)} />}
            {partidaAMedir && (
                <MedirCon key={partidaAMedir.clave} partida={partidaAMedir} codigoOficial={codigoOficial(partidaAMedir)} sinNativa={sinNativa} obra={filasObra}
                    claveNativa={dic.nativas?.[{ m: 'longitud', 'm²': 'area', 'm³': 'volumen' }[partidaAMedir.unidad]] || null}
                    juego={criterios} estado={estadoCrit} onGuardar={onCriterios} onCerrar={() => setMedirCon(null)} />
            )}
            {verComo && roles && <ComoSeLeyo roles={roles} itemizado={itemizado} cruce={cruce} onCerrar={() => setVerComo(false)} />}
            <div ref={cuerpoRef} role="table" aria-label="Partidas" onScroll={e => setScroll(e.currentTarget.scrollTop)} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
                <div role="row" style={{ display: 'grid', gridTemplateColumns: rejilla, position: 'sticky', top: 0, zIndex: 1, background: '#f5f4ef', borderBottom: '1px solid #cccac0', height: `${ALTO}px`, alignItems: 'center', fontWeight: 600, fontSize: '11.5px', color: '#52524d' }}>
                    {COLUMNAS.map(c => <div key={c.titulo} role="columnheader" style={c.derecha ? num : celda}>{c.titulo}</div>)}
                </div>
                {/* Solo se dibujan las filas que se ven (una plantilla puede tener miles). */}
                <div style={{ position: 'relative', height: `${lista.length * ALTO}px` }}>
                    {lista.slice(desde, hasta).map((r, k) => (
                        <div key={r.clave} style={{ position: 'absolute', top: `${(desde + k) * ALTO}px`, left: 0, right: 0 }}>{dibujar(r)}</div>
                    ))}
                </div>
                {!lista.length && <div style={{ padding: '24px', color: '#72706b' }}>{texto || soloConDato ? 'Ninguna fila de la plantilla cumple lo pedido.' : 'El itemizado no tiene filas.'}</div>}
            </div>
        </div>
    );
}
