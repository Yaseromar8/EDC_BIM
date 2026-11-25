// LA VALORIZACIÓN DEL MES EN EL 3D (25-nov-2026, docs/visor/71). Panel de la Planilla.
//
// El dueño: «necesito que el formato del Excel se pase ahí y yo seleccione la fila, así como si tuviera mi Excel y
// le haga clic y me lleve a ese grupo de elementos».
//
// Se carga el MISMO Excel de la valorización y se enseña TAL CUAL: sus columnas, sus títulos y sus partidas, con las
// filas en verde que pinta el propio Excel («se valoriza en la Val.» > 0). Clic en una fila:
//   · una partida → sus elementos del modelo, aislados y encuadrados;
//   · un título   → los elementos de sus partidas en verde (lo que se cobra este mes en ese grupo).
// Los elementos de partidas en verde se pintan en dos tonos: verde si la partida entra entera este mes, verde
// amarillento si sólo completa un saldo. Nada se guarda: sólo se lee en este navegador.
//
// La lectura está en lib/valorizacionDelMes.js y el cálculo de fórmulas en lib/formulasDeExcel.js
// (pruebas/valorizacionDelMes.prueba.mjs).
import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { pedirPlanilla } from '../utils/planillaServidor';
import {
    leerValorizacion, avisoDeCalculo, notaDeCalculo, opcionesDeLectura,
    elementosPorPartida, tablaDeLaHoja, clavesDeLaFila, tonosDe,
    COLOR_ENTERO, COLOR_SALDO,
} from '../lib/valorizacionDelMes';

const miles = n => Number(n || 0).toLocaleString('es-PE');
const VERDE_EXCEL = '#c6efce';          // el relleno del formato condicional del propio Excel
const Cuadro = ({ color }) => <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: color, display: 'inline-block', flexShrink: 0, border: '1px solid rgba(0,0,0,.15)' }} />;

// ── Pintar en el visor (sin tocar Viewer.jsx: se usa el visor global, como Filters) ──
const normalizarUrn = u => String(u || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function dbIdEnVisor(extId, urn) {
    const r = window.rosettaToDbId;
    if (!r || !urn) return null;
    const n = normalizarUrn(urn);
    const dic = r[urn] || Object.entries(r).find(([k]) => normalizarUrn(k) === n)?.[1];
    return dic && dic[extId] != null ? dic[extId] : null;
}
function modelosDelVisor() {
    const v = window.NOP_VIEWER;
    try { return v?.impl?.modelQueue()?.getModels() || []; } catch { return []; }
}
function quitarColores() {
    const v = window.NOP_VIEWER;
    if (!v) return;
    for (const m of modelosDelVisor()) { try { v.clearThemingColors(m); } catch { /* noop */ } }
}
function pintar(tonoDe, filaDe) {
    const v = window.NOP_VIEWER;
    const THREE = window.THREE;
    quitarColores();
    if (!v || !THREE) return;
    const modelos = modelosDelVisor();
    const porUrn = new Map(modelos.map(m => [normalizarUrn(m.getData?.()?.urn), m]));
    const color = hex => { const c = new THREE.Color(hex); return new THREE.Vector4(c.r, c.g, c.b, 1); };
    const colores = { entero: color(COLOR_ENTERO), saldo: color(COLOR_SALDO) };
    for (const [k, tono] of tonoDe) {
        const f = filaDe.get(k);
        if (!f) continue;
        const urn = f.source_urn || f.model_urn;
        const id = dbIdEnVisor(f.dbId, urn);
        const modelo = porUrn.get(normalizarUrn(urn)) || (modelos.length === 1 ? modelos[0] : null);
        if (id == null || !modelo) continue;
        try { v.setThemingColor(id, colores[tono], modelo, true); } catch { /* noop */ }
    }
    v.impl?.invalidate?.(true, true, true);
}
// CONTEXTO (25-nov-2026): el dueño, al ver sólo el solado aislado: «se necesita tener referencia de los otros
// elementos… más disimulados, que se entienda el contexto». Lo que queda fuera de la fila sigue siendo el fantasma
// del visor, pero mientras se elige en la valorización ese fantasma es GRIS MEDIO y MÁS VISIBLE (opacidad 0,3 en vez
// de 0,1 casi negro). Al cerrar el panel o volver a todo el modelo, el fantasma vuelve a como estaba.
const FANTASMA_DE_CONTEXTO = { opacidad: 0.3, color: 0x8f8f8a, aristas: { x: 0.42, y: 0.42, z: 0.42, w: 0.4 } };
let fantasmaOriginal = null;
// El visor dibuja el fantasma PUNTEADO (modo ACC, Viewer.jsx `enforceACCGhosting`): con el punteado no se usa el
// material transparente y su opacidad no cambia nada (visto por el dueño el 25-nov: «¿y el contexto?»). Mientras la
// valorización elige, el fantasma pasa a transparente de verdad; al terminar, se devuelve el punteado tal cual.
function contexto(encender) {
    const impl = window.NOP_VIEWER?.impl;
    const fm = impl?.fadeMaterial;
    if (!impl || !fm) return;
    const renderer = impl.renderer?.();
    const viewer = window.NOP_VIEWER;
    if (encender) {
        if (!fantasmaOriginal) {
            const pref = n => { try { return viewer.prefs?.get?.(n); } catch { return undefined; } };
            fantasmaOriginal = { opacidad: fm.opacity, color: fm.color?.getHex?.(), aristas: impl._edgeColorGhosted, punteado: true,
                sombra: pref('ambientShadows'), suavizado: pref('antialiasing'), bordes: pref('edgeRendering') };
        }
        // ACERO Y PIEZAS DENSAS (25-nov-2026): una jaula de barras salía gris oscuro, «como muro», no del color. Lo
        // oscurecen la sombra ambiental (en un armado todo es rincón) y las aristas negras de cada barra. Mientras se
        // elige en la valorización se apagan las dos; al terminar vuelven como estaban.
        try { viewer.setQualityLevel?.(false, fantasmaOriginal.suavizado !== false); } catch { /* noop */ }
        try { viewer.setDisplayEdges?.(false); } catch { /* noop */ }
        try { renderer?.setDitheredGhosting?.(false); } catch { /* noop */ }
        fm.opacity = FANTASMA_DE_CONTEXTO.opacidad;
        fm.color?.setHex?.(FANTASMA_DE_CONTEXTO.color);
        impl._edgeColorGhosted = { ...FANTASMA_DE_CONTEXTO.aristas };
    } else if (fantasmaOriginal) {
        fm.opacity = fantasmaOriginal.opacidad;
        if (fantasmaOriginal.color != null) fm.color?.setHex?.(fantasmaOriginal.color);
        if (fantasmaOriginal.aristas) impl._edgeColorGhosted = fantasmaOriginal.aristas;
        try { renderer?.setDitheredGhosting?.(fantasmaOriginal.punteado); } catch { /* noop */ }
        if (fantasmaOriginal.sombra !== undefined) { try { viewer.setQualityLevel?.(fantasmaOriginal.sombra !== false, fantasmaOriginal.suavizado !== false); } catch { /* noop */ } }
        if (fantasmaOriginal.bordes !== undefined) { try { viewer.setDisplayEdges?.(fantasmaOriginal.bordes !== false); } catch { /* noop */ } }
        fantasmaOriginal = null;
    } else return;
    fm.needsUpdate = true;
    impl.invalidate?.(true, true, true);
}

// Rótulos de la capa Agrupación sólo de lo elegido (docs/visor/71 §7.3): se le dice a la extensión 4D qué elementos
// hay seleccionados, por modelo; con null vuelve a dibujarlos todos.
function filtrarRotulos(claves, filaDe) {
    let porModelo = null;
    if (claves && claves.length) {
        const modelos = modelosDelVisor();
        const porUrn = new Map(modelos.map(m => [normalizarUrn(m.getData?.()?.urn), m]));
        const ids = new Map();
        for (const k of claves) {
            const f = filaDe.get(k);
            if (!f) continue;
            const urn = f.source_urn || f.model_urn;
            const id = dbIdEnVisor(f.dbId, urn);
            const modelo = porUrn.get(normalizarUrn(urn)) || (modelos.length === 1 ? modelos[0] : null);
            if (id == null || !modelo) continue;
            if (!ids.has(modelo)) ids.set(modelo, []);
            ids.get(modelo).push(id);
        }
        porModelo = [...ids].map(([model, dbIds]) => ({ model, dbIds }));
    }
    window.dispatchEvent(new CustomEvent('lob-zone-labels-filter', { detail: { porModelo } }));
}

// ── Guardada para todos (migración 52, docs/visor/71 §8): el Excel TAL CUAL, por obra y frente ──
// El frente abierto, como lo nombra el itemizado: '<obra>_<FRENTE>' (window.postgresInventoryUrn).
const ambitoDelVisor = () => (typeof window !== 'undefined' ? window.postgresInventoryUrn : null) || null;
function aBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
}
function deBase64(b64) {
    const s = atob(b64);
    const bytes = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
}
const fechaCorta = v => { try { return new Date(v).toLocaleDateString('es-PE'); } catch { return ''; } };

// ¿Cuántos de esos elementos están cargados en el 3D ahora mismo?
const enElVisor = (claves, filaDe) => claves.filter(k => { const f = filaDe.get(k); return f && dbIdEnVisor(f.dbId, f.source_urn || f.model_urn) != null; }).length;

export default function ValorizacionDelMes({ filasObra, dic, claveDeFila, onSeleccionar, onMostrarTodo, onCerrar }) {
    const [libro, setLibro] = useState(null);       // { archivo, hojas, error }
    const [hojaElegida, setHojaElegida] = useState(null);
    const [activa, setActiva] = useState(null);     // fila (r) seleccionada
    const [estado, setEstado] = useState('');
    // Lo guardado en el servidor: { cargando, puedeEditar, modo: 'obra' | 'navegador', vigente, aviso, guardando }
    const [servidor, setServidor] = useState({ cargando: true, puedeEditar: false, modo: 'obra', vigente: null, aviso: '', guardando: false });
    const ambito = ambitoDelVisor();

    const abrirLibro = (nombre, buffer, extra = {}) => {
        try {
            const r = leerValorizacion(XLSX, XLSX.read(buffer, opcionesDeLectura()));
            setLibro({ archivo: nombre, ...r, ...extra });
            setHojaElegida(null);
            setActiva(null);
            setEstado('');
            return r;
        } catch (e) {
            setLibro({ archivo: nombre, hojas: [], error: `No se pudo leer el Excel: ${e.message}` });
            return null;
        }
    };

    // Al abrir: la valorización vigente del frente, la misma para todos.
    useEffect(() => {
        let vivo = true;
        (async () => {
            if (!ambito) { setServidor(s => ({ ...s, cargando: false, modo: 'navegador', aviso: 'Sin obra abierta: sólo en este navegador.' })); return; }
            const r = await pedirPlanilla('GET', `/api/planilla/valorizacion?project=${encodeURIComponent(ambito)}`);
            if (!vivo) return;
            if (r.status === 503) {
                // Sin la migración 52: se puede cargar, pero sólo queda en este navegador.
                setServidor({ cargando: false, puedeEditar: true, modo: 'navegador', vigente: null, guardando: false,
                    aviso: 'La base aún no guarda valorizaciones (falta la migración 52): lo que cargues queda sólo en este navegador.' });
                return;
            }
            if (!r.ok) { setServidor(s => ({ ...s, cargando: false, aviso: r.json.error || 'No se pudo leer la valorización guardada.' })); return; }
            const v = r.json.vigente;
            setServidor({ cargando: false, puedeEditar: !!r.json.puede_editar, modo: 'obra', vigente: v, aviso: '', guardando: false });
            if (v?.contenido_b64) abrirLibro(v.archivo, deBase64(v.contenido_b64), { version: v.version, creadoPor: v.creado_por, creadoEn: v.creado_en });
        })();
        return () => { vivo = false; };
    }, [ambito]);

    // Subir (sólo un administrador de la obra): se lee aquí primero; si no es una valorización, no se guarda.
    const cargar = async (archivo) => {
        if (!archivo) return;
        const buffer = await archivo.arrayBuffer();
        const r = abrirLibro(archivo.name, buffer);
        if (!r || r.error || servidor.modo !== 'obra') return;
        setServidor(s => ({ ...s, guardando: true, aviso: '' }));
        const g = await pedirPlanilla('POST', '/api/planilla/valorizacion', { project: ambito, archivo: archivo.name, contenido_b64: aBase64(buffer) });
        if (!g.ok) {
            setServidor(s => ({ ...s, guardando: false, aviso: `No se guardó para todos: ${g.json.error || 'error del servidor'}. Lo ves sólo tú, en este navegador.` }));
            return;
        }
        const version = g.json.version;
        setLibro(l => (l ? { ...l, version, creadoPor: 'tú', creadoEn: new Date().toISOString() } : l));
        setServidor(s => ({ ...s, guardando: false, vigente: { ...(s.vigente || {}), version, archivo: archivo.name },
            aviso: g.json.sin_cambios ? 'Es el mismo Excel que ya estaba: no se creó otra versión.' : `Guardado como versión ${version}: ya lo ve toda la obra.` }));
    };

    const quitarDeLaObra = async () => {
        if (!window.confirm('¿Quitar la valorización de este frente? Dejará de verse para todos (queda en el historial).')) return;
        const r = await pedirPlanilla('DELETE', `/api/planilla/valorizacion?project=${encodeURIComponent(ambito)}`);
        if (!r.ok) { setServidor(s => ({ ...s, aviso: r.json.error || 'No se pudo quitar.' })); return; }
        quitar();
        setLibro(null);
        setServidor(s => ({ ...s, vigente: null, aviso: 'Quitada: el frente ya no tiene valorización.' }));
    };

    // Cada hoja con sus elementos; se abre la que más elementos del modelo encuentra (la del frente abierto).
    const cruces = useMemo(() => {
        if (!libro?.hojas?.length || !dic) return [];
        return libro.hojas.map(h => ({ hoja: h, e: elementosPorPartida(filasObra, dic, claveDeFila, h.partidas) }));
    }, [libro, filasObra, dic, claveDeFila]);
    const actual = useMemo(() => {
        if (!cruces.length) return null;
        if (hojaElegida) return cruces.find(c => c.hoja.nombre === hojaElegida) || cruces[0];
        const con = c => c.hoja.verdes.reduce((n, p) => n + (c.e.clavesDe.get(p.codigo)?.length ? 1 : 0), 0);
        return [...cruces].sort((a, b) => con(b) - con(a))[0];
    }, [cruces, hojaElegida]);
    const tabla = useMemo(() => (actual ? tablaDeLaHoja(XLSX, actual.hoja) : null), [actual]);
    const elementosDe = useMemo(() => {
        const m = new Map();
        if (!actual || !tabla) return m;
        for (const f of tabla.filas) m.set(f.r, clavesDeLaFila(f, actual.hoja.partidas, actual.e.clavesDe));
        return m;
    }, [actual, tabla]);

    // Al cerrar el panel (o desmontarse), el 3D vuelve a como estaba.
    useEffect(() => () => { quitarColores(); contexto(false); filtrarRotulos(null); }, []);

    const quitar = () => { quitarColores(); contexto(false); filtrarRotulos(null); setActiva(null); setEstado(''); onMostrarTodo?.(); };
    const elegir = (f) => {
        if (activa === f.r) { quitar(); return; }
        const claves = elementosDe.get(f.r) || [];
        setActiva(f.r);
        const que = f.partida ? `${f.codigo}` : `${f.codigo} (sus partidas en verde)`;
        if (!claves.length) {
            quitarColores();
            contexto(false);
            filtrarRotulos(null);
            onMostrarTodo?.();
            setEstado(f.partida
                ? `${que}: ningún elemento del modelo tiene esta partida (no está modelada, o su código no coincide).`
                : `${que}: ninguna partida en verde de este grupo tiene elementos en el modelo.`);
            return;
        }
        contexto(true);
        filtrarRotulos(claves, actual.e.filaDe);
        onSeleccionar?.([...new Set(claves)], { clave: `valorizacion:${actual.hoja.nombre}:${f.r}` });
        // El aislamiento lo aplica el visor al recibir el evento; el color, justo después.
        setTimeout(() => { pintar(tonosDe(claves, actual.hoja.partidas, actual.e.clavesDe), actual.e.filaDe); contexto(true); }, 60);
        const cargados = enElVisor(claves, actual.e.filaDe);
        setEstado(`${que}: ${miles(claves.length)} elementos${cargados < claves.length ? ` (${miles(cargados)} cargados en el 3D; abre los modelos que falten)` : ''}.`);
    };

    const nota = actual ? notaDeCalculo(actual.hoja) : '';
    const aviso = actual ? avisoDeCalculo(actual.hoja) : '';
    const titulo = { color: '#141413', fontWeight: 600 };
    const celda = { padding: '2px 6px', borderRight: '1px solid #e8e6dc', borderBottom: '1px solid #e8e6dc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '360px' };
    const esNumero = t => /^-?[\d.,]+%?$/.test(String(t).trim());

    return (
        <div style={{ borderBottom: '1px solid #e8e6dc', background: '#faf9f5', padding: '8px 12px', fontSize: '12px', color: '#52524d', flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <strong style={titulo}>Valorización del mes</strong>
                {actual && (
                    <span title={libro.version ? `Versión ${libro.version}${libro.creadoPor ? `, subida por ${libro.creadoPor}` : ''}${libro.creadoEn ? ` el ${fechaCorta(libro.creadoEn)}` : ''}` : 'Sólo en este navegador'}>
                        «{libro.archivo}»{libro.version ? ` · v${libro.version}` : ' · sólo en este navegador'}
                    </span>
                )}
                {actual && cruces.length > 1 && (
                    <select value={actual.hoja.nombre} onChange={e => { quitar(); setHojaElegida(e.target.value); }} style={{ font: 'inherit', fontSize: '12px' }}>
                        {cruces.map(c => <option key={c.hoja.nombre} value={c.hoja.nombre}>{c.hoja.nombre}</option>)}
                    </select>
                )}
                {actual?.hoja.numero && <span>Val. {actual.hoja.numero} · {miles(actual.hoja.verdes.length)} partidas en verde</span>}
                {actual && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Cuadro color={COLOR_ENTERO} />entra entera este mes</span>}
                {actual && <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Cuadro color={COLOR_SALDO} />sólo completa un saldo</span>}
                <span style={{ flex: 1 }} />
                {servidor.guardando && <span>guardando para toda la obra…</span>}
                {libro && servidor.puedeEditar && !servidor.guardando && (
                    <label className="v-enlace" style={{ fontSize: '12px', cursor: 'pointer' }}
                        title={servidor.modo === 'obra' ? 'Sube un Excel nuevo: queda como versión nueva y lo ve toda la obra' : 'Sólo en este navegador'}>
                        subir otra versión
                        <input type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }} onChange={e => { cargar(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                )}
                {libro?.version && servidor.puedeEditar && servidor.modo === 'obra' && (
                    <button className="v-enlace" style={{ fontSize: '12px' }} onClick={quitarDeLaObra}
                        title="Deja el frente sin valorización (la versión queda en el historial)">quitar</button>
                )}
                <button className="v-enlace" style={{ fontSize: '12px' }} onClick={() => { quitar(); onCerrar?.(); }}>cerrar</button>
            </div>

            {servidor.cargando && <div style={{ marginTop: '6px' }}>Abriendo la valorización del frente…</div>}
            {servidor.aviso && <div style={{ marginTop: '4px', color: '#9e5943' }}>{servidor.aviso}</div>}
            {!libro && !servidor.cargando && !servidor.puedeEditar && (
                <div style={{ marginTop: '6px' }}>Este frente aún no tiene valorización. La sube un administrador de la obra.</div>
            )}
            {!libro && !servidor.cargando && servidor.puedeEditar && (
                <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', border: '1px solid #cccac0', borderRadius: '3px', background: '#ffffff', color: '#141413', fontSize: '12px', padding: '0 10px', height: '24px', cursor: 'pointer', flexShrink: 0 }}>
                        Subir el Excel
                        <input type="file" accept=".xlsx,.xlsm,.xls" style={{ display: 'none' }} onChange={e => { cargar(e.target.files?.[0]); e.target.value = ''; }} />
                    </label>
                    <span>de la valorización (p. ej. «VAL13_PARTIDA_POR_PARTIDA…»), tal como esté. {servidor.modo === 'obra' ? 'Queda guardado para toda la obra; los demás lo ven sin poder cambiarlo.' : 'Queda sólo en este navegador.'} Clic en una fila para ir a sus elementos.</span>
                </div>
            )}
            {libro?.error && <div style={{ marginTop: '6px', color: '#b3261e' }}>{libro.error}</div>}
            {aviso && <div style={{ marginTop: '4px', color: '#9e5943' }}>{aviso}</div>}
            {actual && (
                // Una sola línea: lo que se hizo con el Excel (en el título, completo) y lo que hay seleccionado.
                <div style={{ marginTop: '4px', display: 'flex', gap: '10px', alignItems: 'center', minWidth: 0 }}>
                    <span style={{ color: '#141413', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {estado || 'Clic en una fila: va a sus elementos (en un título, a los de sus partidas en verde). Otro clic en la misma fila: todo el modelo.'}
                    </span>
                    {(nota || actual.e.desfase > 0) && (
                        <span style={{ color: '#72706b', flexShrink: 0 }}
                            title={[nota, actual.e.desfase > 0 ? `Los códigos del Excel llevan ${actual.e.desfase === 1 ? 'un nivel' : `${actual.e.desfase} niveles`} más delante que los del modelo: se comparan sin ${actual.e.desfase === 1 ? 'él' : 'ellos'}.` : ''].filter(Boolean).join(' ')}>
                            {nota ? `fórmulas calculadas por el visor (${miles(actual.hoja.calculadasPorElVisor)})` : 'códigos sin el primer nivel'} ⓘ
                        </span>
                    )}
                </div>
            )}

            {tabla && (
                <div style={{ marginTop: '6px', overflow: 'auto', minHeight: '120px', flex: 1, border: '1px solid #e8e6dc', background: '#ffffff' }}>
                    <table style={{ borderCollapse: 'collapse', fontSize: '12px', width: 'max-content', minWidth: '100%' }}>
                        <thead>
                            <tr>
                                {tabla.columnas.map(col => (
                                    <th key={col.c} style={{ ...celda, position: 'sticky', top: 0, background: '#f5f4ef', color: '#52524d', fontWeight: 600, textAlign: 'left', whiteSpace: 'normal', minWidth: '60px', maxWidth: '180px', zIndex: 1 }}>{col.titulo}</th>
                                ))}
                                <th style={{ ...celda, position: 'sticky', top: 0, background: '#f5f4ef', fontWeight: 600, textAlign: 'right', zIndex: 1 }} title="Elementos del modelo de esta fila (en un título: los de sus partidas en verde)">Elementos</th>
                            </tr>
                        </thead>
                        <tbody>
                            {tabla.filas.map(f => {
                                const n = elementosDe.get(f.r)?.length || 0;
                                const verde = !!f.partida?.verde;
                                const fondo = activa === f.r ? '#cfe3f7' : verde ? VERDE_EXCEL : f.tipo === 'T' ? '#f5f4ef' : '#ffffff';
                                return (
                                    // Sin elementos en el modelo (no está en Revit): atenuada y sin clic, por ahora
                                    // (pedido del dueño el 25-nov-2026; más adelante llevará a su sustento de metrado).
                                    <tr key={f.r} onClick={n ? () => elegir(f) : undefined} className={n ? 'inv-fila' : undefined}
                                        title={n ? `Fila ${f.r + 1} · clic: ir a sus ${miles(n)} elementos` : `Fila ${f.r + 1} · no está en el modelo`}
                                        style={{ background: fondo, cursor: n ? 'pointer' : 'default', opacity: n ? 1 : 0.42, fontWeight: f.tipo === 'T' ? 600 : 400, color: f.tipo === 'T' ? '#141413' : '#3d3d3a' }}>
                                        {f.celdas.map((t, i) => (
                                            <td key={i} style={{ ...celda, textAlign: esNumero(t) ? 'right' : 'left', fontVariantNumeric: 'tabular-nums' }}>{t}</td>
                                        ))}
                                        <td style={{ ...celda, textAlign: 'right', color: n ? '#141413' : '#b0aea5' }}>{n ? miles(n) : '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
