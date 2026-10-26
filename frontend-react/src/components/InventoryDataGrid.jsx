import { INVENTORY_IDENTITY_FORMAT, INVENTORY_INTERNAL_KEYS, withInventoryIdentity, inventoryRowKey, inventoryRowForViewer, inventoryEditPayload, inventoryBulkPayload, resolveInventoryTargets, updateInventoryRows, requireInventoryResponse, markInventoryRevision } from '../lib/inventoryIdentity';
import React, { useState, useEffect, useRef, useCallback, memo, useMemo, useSyncExternalStore } from 'react';
import { urlInventario, enlaceCompartido } from '../utils/enlaceCompartido';
import { filterInventoryRows, refineInventorySelection } from '../lib/filtersCore.js';
import { openInventoryFilterPopout } from '../lib/inventoryFilterPopout.js';
import { apiFetch } from '../utils/apiFetch';
import ColumnConfiguratorModal from './ColumnConfiguratorModal';
import { leerInventoryConfig, fijarInventoryConfig, columnasParaElGrid, columnasDesdeElGrid } from '../lib/inventoryConfig';
import * as Tabla from '../lib/inventoryTabla';
import { libroDeLaTabla } from '../lib/inventoryExport';
import { catalogoDeCampos } from '../lib/inventoryCatalogo';
import * as Buscador from '../lib/inventoryBuscar';
import * as Partidas from '../lib/planillaPartidas';
import { deducirRoles, diccionarioDeducido } from '../lib/planillaPerfil';
import { EVENTOS } from '../lib/aislamientoTemporal';
import { itemizadoDeObra } from '../utils/itemizadoDeObraVisor';
import { criteriosDeMedida } from '../utils/criteriosDeMedidaVisor';
import { describirCriterio } from '../lib/criteriosDeMedida';
import { contextoDerivado, suscribirDerivados } from '../utils/camposDerivadosVisor';
import TablaDePartidas from './TablaDePartidas';
import SelectorDeCampo, { ListaDeCampos } from './SelectorDeCampo';
import { Capacitor } from '@capacitor/core';

const ROW_HEIGHT = 25; // Tandem SlickGrid: 25px per row (from DOM top:25px)
const OVERSCAN = 10;

const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'https://visor-ecd-backend-va.onrender.com' : (import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : (typeof window !== 'undefined' && window.location.hostname.match(/^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/) ? `http://${window.location.hostname}:3000` : 'https://visor-ecd-backend-va.onrender.com')));

// ─── Fractional-Inch Formatter ───────────────────────────────────────────
// Autodesk Model Derivative API almacena diámetros y medidas como
// "0.375 fractional-in", pero el visor 3D los muestra como "3/8\"".
// Este formateador replica esa conversión para consistencia visual.
const formatFractionalInch = (raw) => {
    if (typeof raw !== 'string') return raw;
    const match = raw.match(/^(-?\d+\.?\d*)\s+fractional-in$/i);
    if (!match) return raw;
    
    const decimal = parseFloat(match[1]);
    if (isNaN(decimal)) return raw;
    
    const sign = decimal < 0 ? '-' : '';
    const abs = Math.abs(decimal);
    const whole = Math.floor(abs);
    const frac = abs - whole;
    
    // Resolución máxima de Revit: 1/128"
    const denom = 128;
    let num = Math.round(frac * denom);
    
    if (num === 0) {
        return `${sign}${whole}"`;
    }
    
    // Reducir fracción con GCD
    const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
    const divisor = gcd(num, denom);
    num = num / divisor;
    const den = denom / divisor;
    
    if (whole === 0) {
        return `${sign}${num}/${den}"`;
    }
    return `${sign}${whole}-${num}/${den}"`;
};

// Iconos SVGs extraidos de Autodesk Tandem
const Icons = {
    Filter: () => (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M21.5,3.54a1.53,1.53,0,0,0-1.4-.73H3.91a1.52,1.52,0,0,0-1.4.73A1.77,1.77,0,0,0,2.7,5.43c.5.82,5.34,8.2,6.2,9.51v4.72c0,1.82,1.11,2.06,2.07,2.06h.91a.25.25,0,0,0,.12,0,.25.25,0,0,0,.12,0H13c1,0,2.07-.24,2.07-2.06V14.94c.86-1.31,5.7-8.69,6.2-9.51A1.81,1.81,0,0,0,21.5,3.54ZM20,4.65c-.52.85-6.24,9.57-6.29,9.66a.74.74,0,0,0-.13.41v4.94a1.23,1.23,0,0,1-.06.5,1.15,1.15,0,0,1-.51.06h-.91a.25.25,0,0,0-.12,0,.25.25,0,0,0-.12,0H11c-.45,0-.5,0-.5,0a1.05,1.05,0,0,1-.07-.51V14.72a.73.73,0,0,0-.12-.41C10.22,14.22,4.5,5.5,4,4.65a1.19,1.19,0,0,1-.15-.34H20.17A1,1,0,0,1,20,4.65Z" /></svg>
    ),
    Columns: () => (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19,2.29H5A2.75,2.75,0,0,0,2.28,5V19A2.75,2.75,0,0,0,5,21.72H19A2.75,2.75,0,0,0,21.72,19V5A2.75,2.75,0,0,0,19,2.29ZM3.78,19V5A1.25,1.25,0,0,1,5,3.79H8.26V20.22H5A1.25,1.25,0,0,1,3.78,19Zm6-15.18h4.48V20.22H9.76ZM20.22,19A1.25,1.25,0,0,1,19,20.22H15.74V3.79H19A1.25,1.25,0,0,1,20.22,5Z" /></svg>
    ),
    Group: () => (
        <svg width="16" height="16" viewBox="0 0 17 17" fill="currentColor"><path d="M10.729 10.3363L12.0623 10.3351C12.3716 10.3344 12.6681 10.2111 12.8866 9.99222C13.1051 9.7733 13.2278 9.47664 13.2279 9.16733L13.2267 7.834C13.225 7.52501 13.1013 7.2292 12.8826 7.01091C12.6639 6.79263 12.3679 6.66954 12.0589 6.66843L10.7256 6.66968C10.4162 6.67033 10.1198 6.79364 9.90131 7.01256C9.6828 7.23148 9.56005 7.52814 9.55998 7.83745L9.56014 8.00412L5.22214 8.0082L5.22057 6.34154L5.38724 6.34138C5.54049 6.34159 5.69228 6.31153 5.83388 6.25293C5.97549 6.19433 6.10413 6.10835 6.21243 5.99991C6.32072 5.89148 6.40653 5.76272 6.46495 5.62104C6.52336 5.47935 6.55322 5.32753 6.55281 5.17428L6.55155 3.84095C6.55091 3.53164 6.4276 3.23521 6.20868 3.0167C5.98976 2.79819 5.6931 2.67544 5.38379 2.67538L4.05046 2.67664C3.74147 2.67833 3.44565 2.80197 3.22737 3.02067C3.00909 3.23936 2.886 3.53541 2.88489 3.8444L2.88614 5.17773C2.88679 5.48704 3.0101 5.78347 3.22902 6.00198C3.44794 6.22049 3.7446 6.34324 4.05391 6.3433L4.22058 6.34314L4.22563 11.7098C4.22667 12.8165 4.92081 13.6758 5.80081 13.675L9.56748 13.6714L9.56764 13.8381C9.56752 13.9912 9.5976 14.1428 9.65615 14.2842C9.7147 14.4257 9.80058 14.5542 9.90887 14.6624C10.0172 14.7706 10.1457 14.8564 10.2872 14.9148C10.4287 14.9733 10.5803 15.0032 10.7334 15.003L12.0667 15.0018C12.376 15.0011 12.6725 14.8778 12.891 14.6589C13.1095 14.44 13.2322 14.1433 13.2323 13.834L13.231 12.5007C13.2294 12.1917 13.1057 11.8959 12.887 11.6776C12.6683 11.4593 12.3723 11.3362 12.0633 11.3351L10.7299 11.3363C10.4206 11.337 10.1242 11.4603 9.9057 11.6792C9.68719 11.8981 9.56444 12.1948 9.56438 12.5041L9.56454 12.6708L5.79787 12.6743C5.52454 12.6746 5.22415 12.2615 5.22363 11.7082L5.22109 9.0082L9.56108 9.00412L9.56124 9.17078C9.56103 9.32409 9.59111 9.47593 9.64975 9.61758C9.70839 9.75923 9.79444 9.8879 9.90294 9.9962C10.0115 10.1045 10.1403 10.1903 10.282 10.2487C10.4238 10.3071 10.5757 10.3368 10.729 10.3363Z" /></svg>
    ),
    MoreVertical: () => (
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M8 14a1.2 1.2 0 0 1 0-2.4A1.2 1.2 0 0 1 8 14Zm1.2-6a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0Zm0-4.8a1.2 1.2 0 1 0-2.4 0 1.2 1.2 0 1 0 2.4 0Z" /></svg>
    ),
    Close: () => (
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M3.46967 3.46967C3.76256 3.17678 4.23744 3.17678 4.53033 3.46967L8 6.93934L11.4697 3.46967C11.7626 3.17678 12.2374 3.17678 12.5303 3.46967C12.8232 3.76256 12.8232 4.23744 12.5303 4.53033L9.06066 8L12.5303 11.4697C12.8232 11.7626 12.8232 12.2374 12.5303 12.5303C12.2374 12.8232 11.7626 12.8232 11.4697 12.5303L8 9.06066L4.53033 12.5303C4.23744 12.8232 3.76256 12.8232 3.46967 12.5303C3.17678 12.2374 3.17678 11.7626 3.46967 11.4697L6.93934 8L3.46967 4.53033C3.17678 4.23744 3.17678 3.76256 3.46967 3.46967Z" /></svg>
    ),
    Undock: () => (
        <svg viewBox="0 0 17 15" width="15" height="13" fill="currentColor"><path fillRule="evenodd" d="M5.166 0h9.35a2.07 2.07 0 012.07 2v9.3a.75.75 0 01-.75.75h-12a.76.76 0 01-.75-.75V2a2.08 2.08 0 012.08-2zm-.404 1.6a.59.59 0 00-.176.4v1.25h10.5V2a.559.559 0 00-.57-.57h-9.35a.59.59 0 00-.404.17zm-.176 8.92h10.5V4.75h-10.5v5.77zm-3-6.02a.75.75 0 00-1.5 0V13c0 .966.783 1.75 1.75 1.75h11a.75.75 0 100-1.5h-11a.25.25 0 01-.25-.25V4.5z" clipRule="evenodd" /></svg>
    ),
    ExportAction: () => (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
    ),
    ImportAction: () => (
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/></svg>
    ),
    Sync: () => (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
    ),
    Sigma: () => (
        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M18 6H8.83l6 6-6 6H18v2H6v-2l6-6-6-6V4h12v2z" /></svg>
    )
};

// Tool Button Component
const ToolBtn = ({ icon, onClick, active, title, badge }) => (
    <button
        onClick={onClick}
        title={title}
        aria-label={title}
        style={{
            background: active ? '#e8e6dc' : 'transparent',
            border: 'none',
            color: active ? '#507294' : '#72706b',
            cursor: 'pointer',
            padding: '4px 6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            transition: 'color 0.15s, background 0.15s'
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#141413'; e.currentTarget.style.background = '#e8e6dc'; }}
        onMouseLeave={(e) => {
            e.currentTarget.style.color = active ? '#507294' : '#72706b';
            e.currentTarget.style.background = active ? '#e8e6dc' : 'transparent';
        }}
    >
        {icon}
        {badge ? <span style={{ marginLeft: '3px', fontSize: '11px', fontWeight: 600 }}>({badge})</span> : null}
    </button>
);

// ── Filtros avanzados del embudo ────────────────────────────────────────────
const { NOMBRE_OPERADOR, NOMBRE_CALCULO_LARGO } = Tabla;
const GRUPO_NO_AGRUPABLE = ['Name'];
// Campos compactos con los tokens de la ventana (tema-claude.css: --v-*).
const campoInput = { font: 'inherit', fontSize: '12px', height: '28px', border: '1px solid var(--v-linea-campo)', borderRadius: 'var(--v-radio-control)', padding: '0 6px', background: 'var(--v-superficie)', color: 'var(--v-texto)', minWidth: 0 };

const FiltroAvanzado = ({ filtro, setFiltro, catalogo, muestra, onClose }) => {
    const tipoDe = useCallback((campo) => campo ? Tabla.tipoDeColumna(muestra, campo).tipo : 'texto', [muestra]);
    const poner = (i, cambio) => setFiltro(f => ({ ...f, reglas: f.reglas.map((r, j) => j === i ? { ...r, ...cambio } : r) }));
    const quitar = (i) => setFiltro(f => ({ ...f, reglas: f.reglas.filter((_, j) => j !== i) }));
    const añadir = () => setFiltro(f => ({ ...f, reglas: [...f.reglas, { campo: '', op: 'contiene', valor: '' }] }));
    const reglas = filtro.reglas.length ? filtro.reglas : [{ campo: '', op: 'contiene', valor: '' }];
    const textoFecha = '(AAAAMMDD)';
    return (
        <div role="dialog" aria-label="Filtros de la tabla" className="v-menu" style={{ position: 'absolute', top: '34px', left: 0, zIndex: 61, width: '660px', maxWidth: '90vw', padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px', color: 'var(--v-texto-2)' }}
            onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <strong style={{ fontSize: '13px', color: 'var(--v-texto)' }}>Filtros de la tabla</strong>
                <span className="v-menu__nota">Cumplir</span>
                <select aria-label="Cómo se combinan las condiciones" className="v-campo" value={filtro.modo} onChange={e => setFiltro(f => ({ ...f, modo: e.target.value }))} style={{ width: 'auto', height: '28px' }}>
                    <option value="y">todas (Y)</option>
                    <option value="o">alguna (O)</option>
                </select>
                <span style={{ flex: 1 }} />
                <button onClick={onClose} aria-label="Cerrar" className="v-cerrar"><Icons.Close /></button>
            </div>
            {reglas.map((r, i) => {
                const tipo = tipoDe(r.campo);
                const ops = Tabla.OPERADORES[tipo] || Tabla.OPERADORES.texto;
                const op = ops.includes(r.op) ? r.op : ops[0];
                const sinValor = op === 'vacio' || op === 'no_vacio';
                return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.6fr) 150px minmax(0,1fr) 24px', gap: '6px', alignItems: 'center' }}>
                        <SelectorDeCampo catalogo={catalogo} valor={r.campo} etiqueta="Campo"
                            onElegir={c => { if (!filtro.reglas.length) setFiltro(f => ({ ...f, reglas: [{ campo: c, op: 'contiene', valor: '' }] })); else poner(i, { campo: c }); }} />
                        <select aria-label="Operador" value={op} onChange={e => poner(i, { op: e.target.value })} style={campoInput} disabled={!filtro.reglas.length}>
                            {ops.map(o => <option key={o} value={o}>{NOMBRE_OPERADOR[o]}</option>)}
                        </select>
                        {sinValor ? <span style={{ color: '#72706b' }}>—</span> : (
                            <div style={{ display: 'flex', gap: '4px', minWidth: 0 }}>
                                <input aria-label="Valor" placeholder={tipo === 'fecha' ? textoFecha : 'Valor'} value={r.valor ?? ''} onChange={e => poner(i, { valor: e.target.value })} style={{ ...campoInput, flex: 1 }} disabled={!filtro.reglas.length} />
                                {op === 'entre' && <input aria-label="Hasta" placeholder="y" value={r.valor2 ?? ''} onChange={e => poner(i, { valor2: e.target.value })} style={{ ...campoInput, flex: 1 }} />}
                            </div>
                        )}
                        <button onClick={() => quitar(i)} aria-label="Quitar condición" className="v-cerrar" style={{ width: '24px', height: '24px' }} disabled={!filtro.reglas.length}><Icons.Close /></button>
                    </div>
                );
            })}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={añadir} className="v-enlace" style={{ fontSize: '12px' }}>+ Condición</button>
                <button onClick={() => setFiltro({ modo: 'y', reglas: [] })} className="v-enlace" style={{ fontSize: '12px' }}>Quitar filtros</button>
                <span style={{ flex: 1 }} />
                <span className="v-menu__nota">Sin tildes ni mayúsculas · números con su unidad · fechas {textoFecha}</span>
            </div>
        </div>
    );
};

// Del external_id de una fila al dbId de esta sesión del visor (rosettaToDbId,
// con el URN en sus tres escrituras: tal cual, base64 URL y base64 estándar).
function dbIdEnVisor(extId, urn) {
    const r = window.rosettaToDbId;
    if (!r || !urn) return null;
    const seguro = String(urn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const estandar = String(urn).replace(/-/g, '+').replace(/_/g, '/');
    const dic = r[urn] || r[seguro] || r[estandar]
        || Object.entries(r).find(([k]) => k.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === seguro)?.[1];
    return dic && dic[extId] != null ? dic[extId] : null;
}

// Barra del modo búsqueda: dónde se busca (todo o lo seleccionado), qué se
// encontró y dónde, los parecidos para confirmar y las medidas que se suman.
const chipBusqueda = { border: '1px solid var(--v-linea-campo, #cccac0)', borderRadius: '3px', padding: '1px 7px', background: '#ffffff', font: 'inherit', fontSize: '11px', cursor: 'pointer', color: '#52524d', whiteSpace: 'nowrap' };
const chipActivo = { ...chipBusqueda, borderColor: 'var(--v-accion, #507294)', background: 'var(--alephia-selected-bg, #ECF0F1)', color: 'var(--v-accion, #507294)' };

// «Datos › 03_05_DSI_CodigoDePartida» → «03_05_DSI_CodigoDePartida»: el grupo va en el título.
const nombreCorto = clave => String(Tabla.etiquetaDeColumna(clave)).split(' › ').pop();

const BarraDeBusqueda = ({ resultado, campo, onCampo, seleccion, seleccionCongelada, onSeleccion, parecidos, confirmados, onConfirmados, verParecidos, onVerParecidos, medidas, activas, onMedidas, sumas }) => {
    const n = resultado.filas.size;
    const modos = new Set(resultado.lineas.map(l => l.modo));
    const modo = modos.has('completo') && !modos.has('contiene') ? 'valor completo' : modos.has('contiene') && !modos.has('completo') ? 'contiene' : modos.has('completo') ? 'valor completo o contiene' : '';
    const tamSel = seleccion ? seleccion.size : 0;
    const alternarMedida = (clave) => onMedidas(activas.includes(clave) ? activas.filter(k => k !== clave) : [...activas, clave]);
    const alternarConfirmado = (clave) => onConfirmados(confirmados.includes(clave) ? confirmados.filter(k => k !== clave) : [...confirmados, clave]);
    return (
        <div style={{ background: '#ffffff', borderBottom: '1px solid #e8e6dc', padding: '0 12px', display: 'flex', flexDirection: 'column', flexShrink: 0, fontSize: '11.5px', color: '#52524d' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', height: '30px', whiteSpace: 'nowrap' }}>
            {/* Izquierda: dónde y qué se encontró; si no cabe, se desvanece en el borde (nada se sale). */}
            <div style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden',
                maskImage: 'linear-gradient(to right, #000 calc(100% - 28px), transparent)', WebkitMaskImage: 'linear-gradient(to right, #000 calc(100% - 28px), transparent)' }}>
                <span>Buscar en</span>
                <button style={seleccionCongelada ? chipBusqueda : chipActivo} onClick={() => onSeleccion(null)}>todo</button>
                <button style={seleccionCongelada ? chipActivo : chipBusqueda} disabled={!seleccionCongelada && tamSel < 1}
                    onClick={() => onSeleccion(seleccionCongelada || (tamSel ? new Set(seleccion) : null))}
                    title="Solo entre los elementos que tenías seleccionados al empezar a buscar">
                    lo seleccionado ({(seleccionCongelada || seleccion || new Set()).size})
                </button>
                <span style={{ width: '1px', height: '14px', background: '#e8e6dc' }} />
                <strong style={{ color: n ? 'var(--v-accion, #507294)' : '#9a3b2e', fontWeight: 600 }}>
                    {n ? `${n.toLocaleString('es-PE')} elemento${n === 1 ? '' : 's'}` : 'Sin coincidencias'}
                </strong>
                {modo && <span>· {modo}</span>}
                {resultado.confirmados > 0 && <span>· {confirmados.length} parecido{confirmados.length === 1 ? '' : 's'} confirmado{confirmados.length === 1 ? '' : 's'}</span>}
                {resultado.lineas.length > 1 && resultado.lineas.map((l, i) => (
                    <span key={i} title={l.texto} style={{ color: l.n ? '#52524d' : '#9a3b2e' }}>· línea {i + 1}: {l.n}</span>
                ))}
                {campo
                    ? <button style={chipActivo} onClick={() => onCampo(null)} title={`${Tabla.etiquetaDeColumna(campo)} · buscar en todos los parámetros`}>en {nombreCorto(campo)} ✕</button>
                    : resultado.porCampo.slice(0, 4).map(([c, k]) => (
                        <button key={c} style={chipBusqueda} onClick={() => onCampo(c)} title={`${Tabla.etiquetaDeColumna(c)} · buscar solo en este parámetro`}>{nombreCorto(c)} · {k}</button>
                    ))}
                {parecidos.length > 0 && (
                    <button style={verParecidos ? chipActivo : chipBusqueda} onClick={() => onVerParecidos(!verParecidos)}>
                        Parecidos ({parecidos.length})
                    </button>
                )}
            </div>
                {/* Derecha: las sumas, siempre a la vista. */}
                {n > 0 && medidas.length > 0 && (
                    <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>Sumar</span>
                        {medidas.map(m => {
                            const activa = activas.includes(m.clave);
                            return (
                                <button key={m.clave} style={activa ? chipActivo : chipBusqueda} onClick={() => alternarMedida(m.clave)}
                                    title={`${Tabla.etiquetaDeColumna(m.clave)} · dato en el ${Math.round(m.cobertura * 100)} % de lo encontrado`}>
                                    {m.nombre} ({m.unidad}){activa && sumas[m.clave] ? <strong style={{ marginLeft: '6px', fontWeight: 600 }}>{sumas[m.clave]}</strong> : null}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
            {verParecidos && parecidos.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', border: '1px solid #e8e6dc', borderRadius: '4px', padding: '6px 8px', margin: '0 0 6px', background: '#faf9f5', maxHeight: '120px', overflowY: 'auto' }}>
                    <span className="v-menu__nota">Se parecen a lo buscado (los números coinciden). Marca los que valen:</span>
                    {parecidos.map(p => (
                        <label key={p.clave} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: '2px 0' }} title={p.valor}>
                            <input type="checkbox" checked={confirmados.includes(p.clave)} onChange={() => alternarConfirmado(p.clave)} style={{ accentColor: 'var(--v-accion, #507294)' }} />
                            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#141413' }}>{p.valor}</span>
                            <span style={{ whiteSpace: 'nowrap' }}>{Tabla.etiquetaDeColumna(p.campo)} · {p.n} elem. · {p.puntos} %</span>
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
};

// Componente Row estable
const InventoryRow = memo(({ row, columns, index, onRowClick, isHighlighted, top, onCellEdit, isChecked, onToggleCheck }) => {
    const [editingCol, setEditingCol] = useState(null);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef(null);

    useEffect(() => {
        if (editingCol && inputRef.current) inputRef.current.focus();
    }, [editingCol]);

    if (!row) return null;
    return (
        <div
            className={`inv-fila${index % 2 === 0 ? ' par' : ''}${row._isSaving ? ' guardando' : ''}${isHighlighted ? ' resaltada' : ''}${isChecked ? ' marcada' : ''}`}
            data-inventory-dbid={row.dbId}
            data-inventory-key={inventoryRowKey(row)}
            style={{
                position: 'absolute', top, left: 0, display: 'inline-flex', 
                minWidth: '100%',
                borderBottom: '1px solid #e8e6dc', alignItems: 'center',
                fontSize: '12px', height: `${ROW_HEIGHT}px`,
                // El fondo NO va aquí: un estilo en línea gana siempre a una
                // hoja, y sin hoja no hay `:hover`. Vive en App.css, por clases,
                // para que pasar el ratón sombree la fila y se sepa dónde estás.
                color: isHighlighted ? '#141413' : '#52524d',
                cursor: 'pointer', userSelect: 'none', transition: 'background 0.1s ease',
                opacity: row._isSaving ? 0.6 : 1
            }}
            onClick={e => { if(!editingCol) onRowClick(row.dbId, row.source_urn || row.model_urn, inventoryRowKey(row), { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey }); }}
        >
            <div style={{ width: '40px', flexShrink: 0, padding: '0 4px', color: '#72706b', borderRight: '1px solid #e8e6dc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                <input type="checkbox" checked={!!isChecked} onChange={() => {}} onClick={e => { e.stopPropagation(); onToggleCheck(inventoryRowKey(row), { shift: e.shiftKey }); }} style={{ accentColor: '#6a9bcc', cursor: 'pointer', width: '13px', height: '13px', margin: 0 }} />
                <span style={{ fontSize: '10px', minWidth: '18px', textAlign: 'right' }}>{index + 1}</span>
            </div>
            {columns.map(col => {
                let cellVal = row[col.key];
                let isEditing = editingCol === col.key;
                let displayText = (cellVal !== undefined && cellVal !== null && cellVal !== '(Unassigned)') ? String(cellVal) : '';
                // Solo el aspecto (m², m³, fechas, números a la derecha); el valor no cambia.
                const celda = col.key === 'dbId' || col.key === 'Name' ? { texto: displayText, numero: false } : Tabla.textoDeCelda(displayText);
                return (
                    <div
                        key={col.key}
                        title={celda.texto !== displayText ? displayText : undefined}
                        style={{ width: col.width, flexShrink: 0, padding: isEditing?'0':'0 12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderRight: '1px solid #e8e6dc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: celda.numero ? 'flex-end' : 'flex-start', fontVariantNumeric: celda.numero ? 'tabular-nums' : undefined }}
                        onDoubleClick={(e) => {
                            // TANDEM PARITY: Solo permitimos editar propiedades extendidas de Facility (Data gemelo), los datos Nativos de Revit son READ-ONLY (Volumen, Area, etc).
                            // Por enlace compartido se MIRA, no se edita. Sin esto la
                            // celda entraba en edicion y el guardado moria con 401:
                            // el invitado creeria que la plataforma falla.
                            if (enlaceCompartido()) return;
                            const EDITABLE_COLUMNS = ['Material', 'Status', 'Costo', 'Notas', 'Proveedor', 'Fase'];
                            if (!EDITABLE_COLUMNS.includes(col.key)) return;
                            
                            e.stopPropagation();
                            setEditValue(displayText);
                            setEditingCol(col.key);
                        }}
                    >
                        {isEditing ? (
                            <input ref={inputRef} type="text" style={{ width: '100%', height: '100%', background: '#507294', color: '#ffffff', border: 'none', padding: '0 12px', outline: 'none', fontSize: '12.5px' }}
                                value={editValue} onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => { if(editValue !== displayText) onCellEdit(row, col.key, editValue); setEditingCol(null); }}
                                onKeyDown={(e) => {
                                    if(e.key==='Enter') e.currentTarget.blur();
                                    else if(e.key==='Escape') setEditingCol(null);
                                }} onClick={e => e.stopPropagation()} />
                        ) : celda.texto}
                    </div>
                )
            })}
        </div>
    );
});
InventoryRow.displayName = 'InventoryRow';

const InventoryDataGrid = ({ activeModelUrn = 'global', filterResult, filterProgress, isolatedExtIds: initialIsolatedExtIds = null, onClose }) => {
    const [flattenedData, setFlattenedData] = useState([]);
    const [rawData, setRawData] = useState([]); // Unfiltered data from DB
    const [columns, setColumns] = useState([]);
    const [allPropertyKeys, setAllPropertyKeys] = useState([]); // All available column keys
    // El grid es CLIENTE de la configuracion, no su dueno: arranca leyendola.
    // Internamente sigue usando `null` = todas, que es lo que su render espera;
    // la traduccion al triestado vive en un solo sitio, en lib/inventoryConfig.
    const [selectedColumnKeys, setSelectedColumnKeys] = useState(() => columnasParaElGrid(null)); // null = auto (show all)
    const [columnConfigOpen, setColumnConfigOpen] = useState(false);
    const [highlightedDbId, setHighlightedDbId] = useState(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [containerHeight, setContainerHeight] = useState(0);
    // Sin pestañas: «Tickets» (mantenimiento en Tandem) no tenía contenido aquí y
    // se retiró el 23-oct; las observaciones no están ligadas a elementos.
    const [followSelection, setFollowSelection] = useState(true);
    const [editarAbierto, setEditarAbierto] = useState(false);
    // Itemizado de la OBRA (ítem, descripción, unidad): guardado en el servidor con versiones y
    // cargado al abrir la obra (docs/visor/27 §6). La Planilla lo lee y lo cambia por el almacén.
    const obraItemizado = useSyncExternalStore(itemizadoDeObra.suscribir, itemizadoDeObra.estado);
    const itemizado = obraItemizado.vigente;
    // Criterios de medida de la OBRA («Medir con…», docs/visor/32): dan la cantidad donde el elemento
    // no trae medida nativa. Mismo almacén y mismas reglas que el itemizado.
    const obraCriterios = useSyncExternalStore(criteriosDeMedida.suscribir, criteriosDeMedida.estado);
    const juegoCriterios = obraCriterios.vigente;
    const [showAssetsOnly, setShowAssetsOnly] = useState(() => leerInventoryConfig().assetsOnly);
    // «Solo con metrado» sustituye a «Assets only» en la barra: en un modelo de
    // Revit todo es ejemplar y aquel no quitaba nada. assetsOnly sigue leyéndose
    // de las vistas guardadas (inventoryConfig, CLOSED) y solo se enseña si viene
    // marcado, para poder desmarcarlo. Este, como el resto de la Fase T, es de sesión.
    const [soloConMetrado, setSoloConMetrado] = useState(false);
    // Vista: 'elementos' (una fila por elemento) o 'partidas' (una fila por
    // partida DSI, con su cantidad nativa; lib/planillaPartidas, docs/visor/23).
    const [vista, setVista] = useState('elementos');
    // Buscador de la Planilla (lib/inventoryBuscar): lo escrito, lo buscado (con
    // un respiro de 250 ms al teclear) y, si se elige, un solo parámetro.
    const [textoBusqueda, setTextoBusqueda] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [campoBusqueda, setCampoBusqueda] = useState(null);
    useEffect(() => { const t = setTimeout(() => setBusqueda(textoBusqueda), 250); return () => clearTimeout(t); }, [textoBusqueda]);
    // Parecidos que el usuario confirma, búsqueda dentro de lo seleccionado (la
    // selección se congela al empezar a buscar: pulsar un resultado no la cambia)
    // y las medidas que se suman en modo búsqueda (null = las de más cobertura).
    const [confirmados, setConfirmados] = useState([]);
    const [verParecidos, setVerParecidos] = useState(false);
    const [seleccionCongelada, setSeleccionCongelada] = useState(null);
    const [medidasElegidas, setMedidasElegidas] = useState(null);
    useEffect(() => { setConfirmados([]); setVerParecidos(false); setMedidasElegidas(null); }, [busqueda]);
    const [isLoading, setIsLoading] = useState(true);
    const [inventoryError, setInventoryError] = useState(null);
    const [inventoryRevision, setInventoryRevision] = useState(0);
    useEffect(() => {
        setRawData([]);
        setFlattenedData([]);
        setCheckedIds(new Set());
        setLocalSelIds(null);
        setIsolatedExtIds(initialIsolatedExtIds);
        setActiveSelectionFilter(null);
        setHighlightedDbId(null);
        setInventoryError(null);
        const ready = e => { if (e.detail?.obra === activeModelUrn) setInventoryRevision(v => v + 1); };
        window.addEventListener('inventory-ready', ready);
        return () => window.removeEventListener('inventory-ready', ready);
    }, [activeModelUrn]);
    const [totalsPickerOpen, setTotalsPickerOpen] = useState(false);
    const [totalColumns, setTotalColumns] = useState(() => new Set(leerInventoryConfig().totals)); // Set of column keys
    const [checkedIds, setCheckedIds] = useState(new Set()); // BULK SELECTION
    const [bulkAssigning, setBulkAssigning] = useState(false);
    const [bulkField, setBulkField] = useState('Status'); // Default column for bulk edit ('__new__' = crear campo propio)
    const [bulkNewField, setBulkNewField] = useState(''); // Nombre del parámetro NUEVO (campo propio)
    const [bulkValue, setBulkValue] = useState('');

    // ── Agrupación por parámetro (estilo Tandem "Group rows") ──────────────
    const [groupByKey, setGroupByKey] = useState(() => leerInventoryConfig().groupBy); // null = sin agrupar
    const [groupMenuOpen, setGroupMenuOpen] = useState(false);
    const [collapsedGroups, setCollapsedGroups] = useState(() => new Set());
    const groupInitRef = useRef(false); // auto-activar SubZona una sola vez
    const displayListRef = useRef([]); // para el scroll de "follow selection"

    // ── Tabla (lib/inventoryTabla, 23-oct-2026) ─────────────────────────────
    // Filtros avanzados del embudo (antes no hacía nada), orden por cabecera,
    // niveles de agrupación y el cálculo de cada columna en el pie. Refinan lo
    // que ya deja pasar Filters; no lo sustituyen. Por ahora viven en la
    // sesión: guardarlos en la vista toca Saved Views (CLOSED) y va aparte.
    const [filtroTabla, setFiltroTabla] = useState({ modo: 'y', reglas: [] });
    const [filtroAbierto, setFiltroAbierto] = useState(false);
    const [orden, setOrden] = useState([]); // [{campo, dir}]
    const [nivelesExtra, setNivelesExtra] = useState([]); // niveles 2, 3… (el 1 es groupByKey)
    const [totalesPorGrupo, setTotalesPorGrupo] = useState(false);
    const [calculosElegidos, setCalculosElegidos] = useState({}); // campo → cálculo | 'ninguno'
    const [menuCabecera, setMenuCabecera] = useState(null); // {campo, x, y}
    const [menuPie, setMenuPie] = useState(null); // {campo, x, y}
    // Escape cierra el menú abierto de la Planilla. Se atiende en la raíz del
    // panel (data-escape-propio): Viewer.jsx corta todos los Escape de la página
    // para que Autodesk no vuelva a mostrar lo oculto, salvo los que nacen aquí.
    // Aquí se consumen, así que tampoco llegan al visor.
    const alPulsarEscape = useCallback(e => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        setMenuCabecera(null); setMenuPie(null); setFiltroAbierto(false); setGroupMenuOpen(false);
    }, []);

    const parseNumericCell = (val) => {
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
            const num = parseFloat(val.replace(/,/g, ''));
            return isNaN(num) ? null : num;
        }
        return null;
    };

    // AQUI ESTABA R-07b. Un efecto copiaba `selectedColumnKeys` a la global
    // `__inventoryCacheSelectedColumns` SOLO cuando no era null, con una rama
    // `else` vacia para no pisarla al montar. Consecuencia: volver a «todas las
    // columnas» no se escribia nunca y la global se quedaba con la ultima
    // seleccion parcial -- medido, 473 columnas guardadas con 476 en pantalla.
    //
    // Ya no hay efecto. La configuracion se escribe EN EL PUNTO DE DECISION
    // (`onUpdate` del configurador, y la restauracion de una vista), que es el
    // unico sitio donde el usuario decide algo. `lib/inventoryConfig` mantiene
    // el espejo v1 derivado del triestado.

    // Agrupacion, totales y «solo activos» tambien pertenecen a la vista.
    // Estos tres SI pueden ir por efecto: ninguno tiene el problema de los dos
    // significados que tenia `null` en las columnas, y su estado inicial sale
    // ya de la configuracion, asi que el primer disparo no borra nada.
    useEffect(() => {
        fijarInventoryConfig({
            groupBy: groupByKey,
            totals: Array.from(totalColumns),
            assetsOnly: showAssetsOnly,
        });
    }, [groupByKey, totalColumns, showAssetsOnly]);

    // Restore column config from App.jsx (Saved Views)
    useEffect(() => {
        const handleRestoreConfig = (e) => {
            const d = e.detail;
            if (!d) return;
            // v1 manda un array; v2 manda el triestado. Se aceptan los dos: una
            // vista vieja no tiene por que saber del contrato nuevo.
            if (Array.isArray(d)) {
                setSelectedColumnKeys(d);
                fijarInventoryConfig({ columns: { mode: 'custom', keys: d } });
            } else if (d.mode === 'all') {
                setSelectedColumnKeys(null);
                fijarInventoryConfig({ columns: { mode: 'all' } });
            } else if (d.mode === 'custom') {
                setSelectedColumnKeys(d.keys || null);
                fijarInventoryConfig({ columns: { mode: 'custom', keys: d.keys || [] } });
            }
        };
        window.addEventListener('restore-inventory-config', handleRestoreConfig);
        return () => window.removeEventListener('restore-inventory-config', handleRestoreConfig);
    }, []);
    
    const containerRef = useRef(null);
    const headerRef = useRef(null);

    // Auto-resize observer
    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            const entry = entries[0];
            if (entry) setContainerHeight(entry.contentRect.height);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
        // La rejilla se desmonta en la vista Partidas: al volver hay que medir la nueva.
    }, [vista]);

    // (B) Visor 3D -> Tabla
    useEffect(() => {
        const handleHighlight = (e) => {
            const { dbId, urn } = e.detail; // El visor dispara clicks enviando 'dbId' y el 'urn' del modelo federado
            if (!dbId || !urn) return;
            
            // Traducción Rosetta INVERSA (Multi-Modelo): ¿Qué fila de Postgres le pertenece a este clic 3D?
            // Normalización Multi-Formato: probar raw, URL-safe base64, y standard base64
            let targetExtId = null;
            const safeUrn = String(urn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            const stdUrn = String(urn).replace(/-/g, '+').replace(/_/g, '/');
            const urnDict = window.rosettaToExtId?.[urn]
                || window.rosettaToExtId?.[safeUrn]
                || window.rosettaToExtId?.[stdUrn]
                || Object.values(window.rosettaToExtId || {}).find((_, i) => {
                    const k = Object.keys(window.rosettaToExtId)[i];
                    return k.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === safeUrn;
                });
            if (urnDict && urnDict[dbId]) {
                 targetExtId = urnDict[dbId];
            }

            if (targetExtId) {
                // Hacemos brillar la fila basándonos en nuestra UUID de base de datos
                const targetRow = inventoryRowForViewer(flattenedData, targetExtId, urn);
                const targetKey = targetRow ? inventoryRowKey(targetRow) : null;
                setHighlightedDbId(targetKey);
                
                // Efecto Tandem: Scrollear automáticamente hacia el dato en la grilla virtual.
                // Con agrupación activa el índice visual incluye las cabeceras de grupo,
                // por eso buscamos en displayList (no en flattenedData).
                if (followSelection) {
                    const list = displayListRef.current;
                    const idx = list.findIndex(it => it.type === 'data' && inventoryRowKey(it.row) === targetKey);
                    if (idx >= 0 && containerRef.current) {
                        const targetTop = idx * ROW_HEIGHT;
                        containerRef.current.scrollTop = targetTop - (containerHeight / 2) + ROW_HEIGHT;
                    }
                }
            }
        };

        window.addEventListener('inventory-highlight-row', handleHighlight);
        return () => window.removeEventListener('inventory-highlight-row', handleHighlight);
    }, [flattenedData, containerHeight, followSelection]);

    // (C) Visor 3D Isolation → Tabla (multi-select / isolate sync)
    const [isolatedExtIds, setIsolatedExtIds] = useState(() => initialIsolatedExtIds); // null = no isolation active
    const [localSelIds, setLocalSelIds] = useState(null); // RAW selection from 3D (no filter yet)
    const [activeSelectionFilter, setActiveSelectionFilter] = useState(null); // The actual filter applied by the button

    useEffect(() => {
        const handleIsolationSync = (e) => {
            const ids = e.detail.elementKeys || e.detail.isolatedExtIds;
            if (!ids || ids.length === 0) {
                // Isolation cleared — restore full view
                setIsolatedExtIds(null);
                setActiveSelectionFilter(null); // MASTER RESET: Clear sync selection
                console.log('[Inventory] Isolation cleared — showing all items & clearing sync');
            } else {
                setIsolatedExtIds(new Set(ids));
                console.log(`[Inventory] Isolation sync: ${ids.length} elements isolated`);
            }
        };

        const handleSelectionSync = (e) => {
            const ids = e.detail.elementKeys || e.detail.selectedExtIds;
            if (!ids || ids.length === 0) {
                setLocalSelIds(null);
            } else {
                setLocalSelIds(new Set(ids));
            }
        };

        window.addEventListener('inventory-isolation-sync', handleIsolationSync);
        window.addEventListener('inventory-selection-sync', handleSelectionSync);
        return () => {
            window.removeEventListener('inventory-isolation-sync', handleIsolationSync);
            window.removeEventListener('inventory-selection-sync', handleSelectionSync);
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        const processDbData = (dbData) => {
            const allProps = new Set(['Name', 'Material', 'Status', 'Vaciado_Nro']);
            
            const mappedData = dbData.map(node => {
                let row = {
                    dbId: node.external_id,
                    model_urn: node.model_urn,
                    source_urn: node.source_urn || node.model_urn,
                    Name: node.name,
                    Material: node.material || '',
                    Status: node.installation_status || '',
                    Vaciado_Nro: node.vaciado_nro || '',
                    // Preservar node_type para filtro "Assets only" (safety net legacy)
                    _nodeType: node.properties?.__node__?.__node_type__ || 'instance'
                };
                
                if (node.properties && typeof node.properties === 'object') {
                    Object.entries(node.properties).forEach(([catName, cat]) => {
                        if (typeof cat === 'object' && cat !== null) {
                            Object.entries(cat).forEach(([rawPName, pVal]) => {
                                // Civil 3D: strip redundant group prefix
                                let pName = rawPName;
                                if (pName.startsWith(catName)) {
                                    let cleaned = pName.slice(catName.length).replace(/^[\s\-\_\.]+/, '');
                                    if (cleaned.length > 0) pName = cleaned;
                                } else if (catName.toUpperCase() === 'PROPERTY SETS' && pName.match(/^.*?\s*[\-\u2013\u2014]\s*(.+)$/)) {
                                    pName = pName.match(/^.*?\s*[\-\u2013\u2014]\s*(.+)$/)[1];
                                }
                                const rawVal = (pVal === null || pVal === undefined) ? '' : (Array.isArray(pVal) ? pVal.map(x => String(x ?? '').trim()).filter(Boolean).join(', ') : String(pVal).trim());
                                const val = formatFractionalInch(rawVal);
                                if (val !== '' || !row.hasOwnProperty(pName) || row[pName] === '') {
                                    row[pName] = val;
                                }
                                // Igual que lib/inventoryNormalizers: la clave con
                                // categoría es la identidad y nunca se pisa.
                                row[catName + '::' + pName] = val;
                                allProps.add(catName + '::' + pName);
                            });
                        }
                    });
                }
                return withInventoryIdentity(node, row);
            });

            let preferredOrder = ['Name', 'Material', 'Status', 'Vaciado_Nro', 'Level', 'Tandem Category', 'Rooms', 'Dimensions', 'Categoría', 'Nivel base'];
            const cols = [{ key: 'dbId', header: 'Id. elemento', width: 280 }];
            
            const extractedCols = Array.from(allProps);
            const orderedCols = [];
            preferredOrder.forEach(p => {
                 const idx = extractedCols.indexOf(p);
                 if (idx > -1) {
                     orderedCols.push(p);
                     extractedCols.splice(idx, 1);
                 }
            });
            extractedCols.forEach(p => orderedCols.push(p));
            
            orderedCols.forEach(p => {
                cols.push({ key: p, header: p, width: p === 'Name' ? 240 : 160 });
            });

            const validExtIds = new Set();
            mappedData.forEach(r => {
                if(r.dbId) validExtIds.add(String(r.dbId).trim());
            });
            window.rosettaValidExtIds = validExtIds;

            return { mappedData, cols, orderedCols };
        };

        const loadInventoryFromDB = async () => {
            setInventoryError(null);
            // CACHÉ TANDEM: Si ya tenemos datos en memoria para EL FRENTE ACTUAL, usarlos al instante
            if (!window.__inventoryCache) window.__inventoryCache = {};
            if (window.__inventoryCache[activeModelUrn]?.identityFormat === INVENTORY_IDENTITY_FORMAT) {
                const { mappedData, cols, orderedCols } = window.__inventoryCache[activeModelUrn];
                console.log(`[Inventory] ⚡ Cache hit for ${activeModelUrn} — ${mappedData.length} items loaded instantly`);
                if (!isMounted) return;
                setAllPropertyKeys(Tabla.columnasSinDuplicados(orderedCols));
                setColumns(cols);
                setRawData(mappedData);
                setFlattenedData(mappedData);
                setIsLoading(false);
                setScrollTop(0);
                return;
            }

            setIsLoading(true);
            setInventoryError(null);
            try {
                let result;
                // Si el preload de App está en curso, ESPERARLO en vez de bajar
                // una SEGUNDA copia del inventario en paralelo (73MB duplicados
                // era la mitad de la lentitud). El preload resuelve y deja
                // window.postgresInventory listo.
                // El global solo sirve si es DE ESTE frente. Antes bastaba con
                // que estuviera lleno: al abrir Inventory en Drenaje Urbano se
                // mostraban las filas de Canal que habia dejado una descarga
                // anterior, sin llegar a pedir nunca las propias.
                const globalEsDeEsteFrente = () =>
                    window.postgresInventoryUrn === activeModelUrn
                    && Array.isArray(window.postgresInventory)
                    && window.postgresInventory.length > 0;

                if (!globalEsDeEsteFrente() && window.__inventoryPreloadPromise) {
                    console.log('[Inventory] ⏳ Esperando preload compartido (sin descarga duplicada)…');
                    try { await window.__inventoryPreloadPromise; } catch { /* cae al fetch propio */ }
                    if (!isMounted) return;
                }
                if (globalEsDeEsteFrente()) {
                    console.log(`[Inventory] 📦 Using offline window.postgresInventory — ${window.postgresInventory.length} items`);
                    
                    const allProps = new Set(['Name', 'Material', 'Status', 'Vaciado_Nro']);
                    const mappedData = window.postgresInventory.map(row => {
                         const newRow = { ...row };
                         if (!newRow.Name && newRow.name) newRow.Name = newRow.name;
                         Object.keys(newRow).forEach(k => {
                             if (!INVENTORY_INTERNAL_KEYS.has(k)) {
                                 allProps.add(k);
                             }
                         });
                         return newRow;
                    });
                    
                    const preferredOrder = ['Name', 'Material', 'Status', 'Vaciado_Nro', 'Level', 'Tandem Category', 'Rooms', 'Dimensions', 'Categoría', 'Nivel base'];
                    const cols = [{ key: 'dbId', header: 'Id. elemento', width: 280 }];
                    
                    const extractedCols = Array.from(allProps);
                    const orderedCols = [];
                    preferredOrder.forEach(p => {
                         const idx = extractedCols.indexOf(p);
                         if (idx > -1) {
                             orderedCols.push(p);
                             extractedCols.splice(idx, 1);
                         }
                    });
                    extractedCols.forEach(p => orderedCols.push(p));
                    
                    orderedCols.forEach(p => {
                        cols.push({ key: p, header: p, width: p === 'Name' ? 240 : 160 });
                    });

                    result = { mappedData, cols, orderedCols };
                } else {
                    const res = await apiFetch(urlInventario(BACKEND_URL, activeModelUrn));
                    await requireInventoryResponse(res);
                    
                    const dbData = await res.json();
                    result = processDbData(dbData);
                }
                
                if (!isMounted) return;

                // Guardar en caché global PARTICIONADO POR FRENTE para que no haya conflictos
                window.__inventoryCache[activeModelUrn] = { ...result, identityFormat: INVENTORY_IDENTITY_FORMAT };
                console.log(`[Inventory] 📦 First load for ${activeModelUrn} — ${result.mappedData.length} items cached for instant re-open`);

                setAllPropertyKeys(Tabla.columnasSinDuplicados(result.orderedCols));
                setColumns(result.cols);
                setRawData(result.mappedData);
                setFlattenedData(result.mappedData);
                setIsLoading(false);
                setScrollTop(0);

            } catch(e) {
                console.error('[InventoryDataGrid] Error al extraer PostgreSQL Data:', e);
                if (!isMounted) return;
                setInventoryError(e.message);
                setIsLoading(false);
            }
        };

        loadInventoryFromDB();

        return () => { isMounted = false; };
    }, [activeModelUrn, inventoryRevision]);

    // Global membership comes from FilterResult, even with the panel closed.
    // Sin predicados se conservan las hojas comprobadas sin fragmentos; un
    // unresolved real sigue pendiente. Sync y Assets only refinan localmente.
    useEffect(() => {
        const applyAssetsFilter = (data) => {
            if (!showAssetsOnly) return data;
            return data.filter(row => (row._nodeType ?? row['__node__::__node_type__']
                ?? row.__node_type__ ?? 'instance') === 'instance');
        };

        // PRIORIDAD: Isolation activa is a local refinement, never global truth.
        const isolationTarget = activeSelectionFilter || isolatedExtIds;
        const globalRows = filterInventoryRows(rawData, filterResult, activeModelUrn);
        const localRows = refineInventorySelection(globalRows, isolationTarget, rawData);
        setFlattenedData(applyAssetsFilter(localRows));
    }, [rawData, filterResult, activeModelUrn, isolatedExtIds, activeSelectionFilter, showAssetsOnly]);

    // React to column selection changes
    useEffect(() => {
        if (allPropertyKeys.length === 0) return;
        const keysToShow = selectedColumnKeys || allPropertyKeys;
        // Primero el nombre legible; el identificador interno va al final.
        const cols = [];
        keysToShow.forEach(p => {
            cols.push({ key: p, header: Tabla.etiquetaDeColumna(p), width: p === 'Name' ? 240 : 170 });
        });
        cols.push({ key: 'dbId', header: 'Id. elemento', width: 280 });
        setColumns(cols);
    }, [selectedColumnKeys, allPropertyKeys]);


    // (A) Tabla -> Visor
    // Selección de varias filas: Mayús + clic = tramo, Ctrl + clic = añadir o
    // quitar. Con refs para no rehacer el manejador de cada fila en cada cambio.
    const anclaRef = useRef(null);
    const checkedRef = useRef(checkedIds);
    checkedRef.current = checkedIds;
    const ordenVisibleRef = useRef([]);
    const filaPorClaveRef = useRef(new Map());
    // Lo último que la propia Planilla pidió seleccionar en el 3D (Mayús/Ctrl en la
    // tabla, clic en una partida): cuando el 3D lo devuelve, es un eco, no una
    // selección nueva del usuario.
    const ultimaProgramadaRef = useRef(null);
    // Claves de fila → [{ urn, dbIds }] del visor (las que no están cargadas en el visor se saltan).
    const itemsDelVisor = useCallback((claves) => {
        const porUrn = new Map();
        for (const k of claves) {
            const fila = filaPorClaveRef.current.get(k);
            if (!fila) continue;
            const urn = fila.source_urn || fila.model_urn;
            const id = dbIdEnVisor(fila.dbId, urn);
            if (id == null) continue;
            if (!porUrn.has(urn)) porUrn.set(urn, []);
            porUrn.get(urn).push(id);
        }
        return [...porUrn].map(([urn, dbIds]) => ({ urn, dbIds }));
    }, []);
    const seleccionarEn3D = useCallback((claves, { encuadrar = false, enfocar = null, clave = null } = {}) => {
        ultimaProgramadaRef.current = new Set(claves);
        window.dispatchEvent(new CustomEvent('viewer-select', { detail: { items: itemsDelVisor(claves), encuadrar, enfocar, clave } }));
    }, [itemsDelVisor]);
    // El color que se queda es de Filters: la Planilla le pide abrir uno de sus campos derivados.
    const verEnFilters = useCallback((propId, colores = null) => {
        window.dispatchEvent(new CustomEvent(EVENTOS.VER_EN_FILTERS, { detail: { propId, colores } }));
    }, []);
    const alternarCasilla = useCallback((clave, mods = {}) => {
        const ancla = anclaRef.current;
        setCheckedIds(prev => {
            if (mods.shift && ancla) return new Set([...prev, ...Tabla.tramo(ordenVisibleRef.current, ancla, clave)]);
            const next = new Set(prev);
            if (next.has(clave)) next.delete(clave); else next.add(clave);
            return next;
        });
        if (!mods.shift) anclaRef.current = clave;
    }, []);

    const handleRowClick = useCallback((rowExtId, rowUrn, rowKey, mods = {}) => {
        if ((mods.shift && anclaRef.current) || mods.ctrl) {
            const actual = checkedRef.current;
            let next;
            if (mods.shift && anclaRef.current) {
                const t = Tabla.tramo(ordenVisibleRef.current, anclaRef.current, rowKey);
                next = mods.ctrl ? new Set([...actual, ...t]) : new Set(t);
            } else {
                next = new Set(actual.size ? actual : [anclaRef.current].filter(Boolean));
                if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey);
                anclaRef.current = rowKey;
            }
            setCheckedIds(next);
            setHighlightedDbId(rowKey);
            seleccionarEn3D(next);
            return;
        }
        // Clic simple: una fila (como antes) y el punto de partida del próximo Mayús.
        anclaRef.current = rowKey;
        if (checkedRef.current.size) setCheckedIds(new Set());
        // En nuestro estado visual (React), la fila brilla usando el external_id
        setHighlightedDbId(rowKey);

        if (!rowUrn) {
            console.warn(`[Inventory] El elemento ${rowExtId} no tiene model_urn en la base de datos.`);
            return;
        }

        // Traducción Rosetta Bidimensional: Buscamos qué dbId efímero le toca a esta sesión 3D
        // Normalización Multi-Formato: probar raw, URL-safe base64, y standard base64
        const safeUrn = String(rowUrn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const stdUrn = String(rowUrn).replace(/-/g, '+').replace(/_/g, '/');
        const urnDict = window.rosettaToDbId?.[rowUrn]
            || window.rosettaToDbId?.[safeUrn]
            || window.rosettaToDbId?.[stdUrn]
            || Object.values(window.rosettaToDbId || {}).find((_, i) => {
                const k = Object.keys(window.rosettaToDbId)[i];
                return k.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === safeUrn;
            });
        
        if (window.rosettaToDbId && urnDict && urnDict[rowExtId]) {
            const realDbId = urnDict[rowExtId];
            
            // Disparamos el aislamiento. ¡El visor cree que le mandamos un dbId nativo y su URN!
            window.dispatchEvent(new CustomEvent('viewer-select', {
                detail: { dbIds: [realDbId], urn: rowUrn }
            }));
        } else {
            console.warn(`[Inventory] No se encontró malla 3D cargada para el Elemento: ${rowExtId} en la capa modelo ${rowUrn}`);
        }
    }, [seleccionarEn3D]);

    const handleCellEdit = useCallback(async (row, colKey, newValue) => {
        setInventoryError(null);
        try {
            const payload = inventoryEditPayload(row, colKey, newValue);
            const key = inventoryRowKey(row);
            setFlattenedData(prev => prev.map(r => inventoryRowKey(r) === key ? { ...r, _isSaving: true } : r));
            const res = await apiFetch(`${BACKEND_URL}/api/inventory`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
            });
            await requireInventoryResponse(res);
            const apply = rows => updateInventoryRows(rows, [row], colKey, newValue)
                .map(r => inventoryRowKey(r) === key ? { ...r, _isSaving: false } : r);
            setFlattenedData(apply);
            setRawData(apply);
            window.__inventoryCache = null;
            if (Array.isArray(window.postgresInventory)) {
                window.postgresInventory = apply(window.postgresInventory);
                markInventoryRevision();   // edicion EN SITIO: la cache de facetas caduca
                window.dispatchEvent(new CustomEvent('recalculate-filters'));
            }
        } catch (error) {
            console.error('[LIVE EDIT] Error:', error);
            setInventoryError(error.message);
            setFlattenedData(prev => prev.map(r => inventoryRowKey(r) === inventoryRowKey(row) ? { ...r, _isSaving: false } : r));
        }
    }, []);

    const handleScroll = useCallback((e) => {
        setScrollTop(e.target.scrollTop);
        if (headerRef.current) {
            headerRef.current.scrollLeft = e.target.scrollLeft;
        }
    }, []);

    // Auto-detectar el parámetro de SubZona del cadista (00_05_DSI_SYP_SubZona).
    // Prioriza "SubZona"; si no, cualquier parámetro DSI_SYP de zona.
    const detectedGroupKey = useMemo(() => {
        const keys = allPropertyKeys || [];
        return keys.find(k => /sub[\s_]*zona/i.test(k))
            || keys.find(k => /_SYP_.*zona/i.test(k))
            || keys.find(k => /\bzona\b/i.test(k))
            || null;
    }, [allPropertyKeys]);

    // Al cargar propiedades por primera vez y detectar SubZona, agrupar por ella.
    useEffect(() => {
        if (!groupInitRef.current && detectedGroupKey) {
            groupInitRef.current = true;
            setGroupByKey(detectedGroupKey);
        }
    }, [detectedGroupKey]);

    // Filtros del embudo y orden, sobre lo que ya deja pasar Filters.
    // Búsqueda primero (pegar un valor de Revit), luego los filtros del embudo.
    const hayBusqueda = Buscador.lineasDeBusqueda(busqueda).length > 0;
    const indiceBusqueda = useMemo(() => (hayBusqueda ? Buscador.crearIndice(flattenedData, allPropertyKeys || []) : null),
        [hayBusqueda, flattenedData, allPropertyKeys]);
    const permitidas = useMemo(() => {
        if (!seleccionCongelada) return null;
        const s = new Set();
        flattenedData.forEach((f, i) => { if (seleccionCongelada.has(inventoryRowKey(f))) s.add(i); });
        return s;
    }, [seleccionCongelada, flattenedData]);
    const resultadoBusqueda = useMemo(() => (indiceBusqueda ? Buscador.buscar(indiceBusqueda, busqueda, { soloCampo: campoBusqueda, permitidas, confirmados }) : null),
        [indiceBusqueda, busqueda, campoBusqueda, permitidas, confirmados]);
    const listaParecidos = useMemo(() => (indiceBusqueda ? Buscador.parecidos(indiceBusqueda, busqueda, { soloCampo: campoBusqueda, permitidas }) : []),
        [indiceBusqueda, busqueda, campoBusqueda, permitidas]);
    const filasBuscadas = useMemo(() => (resultadoBusqueda ? flattenedData.filter((_, i) => resultadoBusqueda.filas.has(i)) : flattenedData),
        [resultadoBusqueda, flattenedData]);
    const filasFiltradas = useMemo(
        () => Tabla.filtrar(filasBuscadas, filtroTabla),
        [filasBuscadas, filtroTabla]);
    const filaPorClave = useMemo(() => new Map(flattenedData.map(f => [inventoryRowKey(f), f])), [flattenedData]);
    // El criterio de la vista Partidas sale SOLO del itemizado que sube el usuario: sin itemizado no
    // hay criterio (ni uno escrito en el código). Con él, se buscan en el modelo los parámetros donde
    // están sus ítems, y su descripción y su unidad son las oficiales (docs/visor/24 §11-12).
    // La deducción ya la hizo la capa de campos derivados al cargar la obra, sobre TODO el inventario
    // (utils/camposDerivadosVisor.js): se reutiliza, así no se deduce dos veces ni cambia según lo que
    // filtre Filters. Solo si no la hay (p. ej. otro itemizado aún llegando) se deduce aquí.
    const derivado = useSyncExternalStore(suscribirDerivados, contextoDerivado);
    const derivadoVale = !!(derivado && itemizado && derivado.huella === itemizado.huella && derivado.scope === activeModelUrn);
    const rolesPartidas = useMemo(() => {
        if (derivadoVale) return derivado.roles;
        return itemizado && flattenedData.length ? deducirRoles(flattenedData, undefined, { itemizado: itemizado.indice }) : null;
    }, [derivadoVale, derivado, itemizado, flattenedData]);
    const dicDeducido = useMemo(() => {
        if (!rolesPartidas || !rolesPartidas.lineas.length) return null;
        if (derivadoVale) return derivado.dic;
        return { ...diccionarioDeducido(rolesPartidas, allPropertyKeys || []), itemizado: itemizado.indice };
    }, [rolesPartidas, derivadoVale, derivado, allPropertyKeys, itemizado]);
    const dicPartidas = useMemo(() => (dicDeducido ? { ...dicDeducido, criterios: juegoCriterios?.indice || null } : null),
        [dicDeducido, juegoCriterios]);
    const [ambitoPartidas, setAmbitoPartidas] = useState(null); // Set de claves elegidas, o null = la tabla
    // Manda la ÚLTIMA selección del usuario, sea en la tabla o en el 3D.
    useEffect(() => { if (checkedIds.size) setAmbitoPartidas(new Set(checkedIds)); }, [checkedIds]);
    useEffect(() => {
        if (!localSelIds || !localSelIds.size) {
            if (!checkedRef.current.size) setAmbitoPartidas(null);
            return;
        }
        const claves = new Set(refineInventorySelection(flattenedData, localSelIds, rawData).map(inventoryRowKey));
        const pedida = ultimaProgramadaRef.current;
        if (pedida && claves.size === pedida.size && [...claves].every(k => pedida.has(k))) return; // eco
        // Selección hecha por el usuario en el 3D: sustituye a las casillas de la tabla.
        ultimaProgramadaRef.current = null;
        if (checkedRef.current.size) setCheckedIds(new Set());
        setAmbitoPartidas(claves);
    }, [localSelIds]); // eslint-disable-line react-hooks/exhaustive-deps
    filaPorClaveRef.current = filaPorClave;

    // Qué es cada campo y cuánto dato tiene (filtro, agrupar, columnas). Sobre
    // todas las filas cargadas, no sobre las filtradas: no cambia al filtrar.
    const catalogo = useMemo(() => catalogoDeCampos(rawData, allPropertyKeys || []), [rawData, allPropertyKeys]);

    // Medidas que se pueden sumar en lo encontrado (numéricas con unidad que se
    // suman), por cobertura; por defecto las que tienen dato en la mitad o más.
    const medidasPosibles = useMemo(() => {
        if (!resultadoBusqueda || !filasBuscadas.length) return [];
        const out = [];
        for (const f of catalogo.values()) {
            if (f.tipo !== 'numero' || !f.unidad || f.clase === 'interno') continue;
            if (Tabla.calculoPorDefecto(f.clave, 'numero', f.unidad) !== 'suma') continue;
            let con = 0;
            for (const fila of filasBuscadas) { const v = fila[f.clave]; if (v !== undefined && v !== null && String(v).trim() !== '') con++; }
            if (con) out.push({ clave: f.clave, nombre: f.nombre, unidad: f.unidad, cobertura: con / filasBuscadas.length });
        }
        return out.sort((a, b) => b.cobertura - a.cobertura).slice(0, 8);
    }, [resultadoBusqueda, filasBuscadas, catalogo]);
    const medidasActivas = useMemo(() => medidasElegidas
        ?? medidasPosibles.filter(m => m.cobertura >= 0.5).slice(0, 3).map(m => m.clave), [medidasElegidas, medidasPosibles]);
    const columnasVista = useMemo(() => {
        if (!resultadoBusqueda || !filasBuscadas.length) return columns;
        const delante = [];
        const poner = (clave, ancho) => {
            if (!clave || delante.some(c => c.key === clave)) return;
            // Delante y con anchura para leer lo encontrado (lo pegado suele ser una descripción larga).
            const c = columns.find(x => x.key === clave);
            delante.push(c ? { ...c, width: Math.max(c.width || 0, ancho) } : { key: clave, header: Tabla.etiquetaDeColumna(clave), width: ancho });
        };
        // Nombre, dónde se encontró, lo que se suma y después los demás campos donde también aparece:
        // así la cantidad queda a la vista aunque el valor salga en varios parámetros.
        poner('Name', 240);
        poner(resultadoBusqueda.porCampo[0]?.[0], 320);
        for (const m of medidasActivas) poner(m, 150);
        for (const [campo] of resultadoBusqueda.porCampo) poner(campo, 320);
        return [...delante, ...columns.filter(c => !delante.some(d => d.key === c.key))];
    }, [resultadoBusqueda, filasBuscadas, columns, medidasActivas]);
    const reglasActivas = Tabla.contarReglas(filtroTabla);
    const niveles = useMemo(() => [groupByKey, ...nivelesExtra].filter(Boolean), [groupByKey, nivelesExtra]);

    // Tipo de cada columna visible, por muestra (con 700 columnas y 20.000
    // filas, leerlo todo cada vez sería caro y el tipo no cambia por eso).
    const tiposColumna = useMemo(() => {
        const paso = Math.max(1, Math.ceil(flattenedData.length / 1500));
        const muestra = paso === 1 ? flattenedData : flattenedData.filter((_, i) => i % paso === 0);
        const t = {};
        for (const col of columnasVista) if (col.key !== 'dbId') t[col.key] = Tabla.tipoDeColumna(muestra, col.key);
        return t;
    }, [flattenedData, columnasVista]);

    // El cálculo de cada columna: el elegido, o «Σ» si estaba en los totales
    // de la vista guardada, o el de por defecto según el dato.
    const calculos = useMemo(() => {
        const c = {};
        for (const col of columnasVista) {
            if (col.key === 'dbId') continue;
            const elegido = calculosElegidos[col.key];
            if (elegido === 'ninguno') continue;
            const t = tiposColumna[col.key] || {};
            const calc = elegido || (totalColumns.has(col.key) ? 'suma' : Tabla.calculoPorDefecto(col.key, t.tipo, t.unidad));
            if (calc) c[col.key] = calc;
        }
        return c;
    }, [columnasVista, calculosElegidos, tiposColumna, totalColumns]);

    // «Solo con metrado»: fuera lo que no tiene cantidad en ninguna columna Σ.
    const camposSuma = useMemo(() => Object.keys(calculos).filter(k => calculos[k] === 'suma'), [calculos]);
    const filasTabla = useMemo(
        () => Tabla.ordenar(soloConMetrado ? Tabla.conMetrado(filasFiltradas, camposSuma) : filasFiltradas, orden),
        [filasFiltradas, soloConMetrado, camposSuma, orden]);

    // Elementos de la vista Partidas: lo seleccionado por el usuario (tabla o 3D) o, si no hay, la tabla.
    const filasDePartidas = useMemo(() => (ambitoPartidas ? refineInventorySelection(flattenedData, ambitoPartidas, rawData) : filasTabla),
        [ambitoPartidas, flattenedData, rawData, filasTabla]);
    // Clic en una partida: selecciona sus elementos y VUELA a ellos, a distancia prudente.
    // Clic en una partida: aísla sus elementos y vuela a ellos. `clave` = la partida (con la misma,
    // el visor no vuelve a aislar); `enfocar` = paso del recorrido «◀ 1/4 ▶».
    const seleccionarPartida = useCallback((claves, { enfocar = null, clave = null } = {}) => seleccionarEn3D(claves, { encuadrar: true, enfocar, clave }), [seleccionarEn3D]);

    // Excel = lo que se ve: mismas filas (Filters + filtros de la tabla + «Solo
    // con metrado»), mismo orden y grupos, mismas columnas y los cálculos del pie.
    // Las hojas las prepara lib/inventoryExport.js (probado sin navegador).
    const handleExportExcel = useCallback(async () => {
        if (!filasTabla.length || !columnasVista.length) return;
        // Solo al exportar: la librería de Excel (~95 KB) no viaja en cada apertura de View.
        const XLSX = await import('xlsx');
        const hojas = vista === 'partidas' && dicPartidas ? Partidas.hojasDePartidas(
            Partidas.partidasDe(filasDePartidas, dicPartidas, inventoryRowKey),
            { ambito: ambitoPartidas ? `${filasDePartidas.length} elementos seleccionados` : `${filasDePartidas.length} filas de la tabla`,
                criterios: (juegoCriterios?.criterios || []).map(describirCriterio) }
        ) : libroDeLaTabla({
            filas: filasTabla, columnas: columnasVista, tipos: tiposColumna, calculos, niveles,
            criterios: { filtroTabla, soloConMetrado, camposSuma, orden, totalTrasFilters: flattenedData.length, busqueda: hayBusqueda ? busqueda : '', campoBusqueda },
        });
        const workbook = XLSX.utils.book_new();
        for (const hoja of hojas) {
            const ws = XLSX.utils.aoa_to_sheet(hoja.filas, { cellDates: true, dateNF: 'dd/mm/yyyy' });
            ws['!cols'] = hoja.anchos.map(wch => ({ wch }));
            if (hoja.filtroHasta) {
                ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: hoja.filtroHasta - 1, c: hoja.filas[0].length - 1 } }) };
            }
            XLSX.utils.book_append_sheet(workbook, ws, hoja.nombre);
        }
        const ahora = new Date();
        const fileName = `Inventario_${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}.xlsx`;

        // CAPACITOR NATIVE: Guardar en carpeta Descargas usando Filesystem
        if (Capacitor.isNativePlatform()) {
            try {
                const { Filesystem, Directory } = await import('@capacitor/filesystem');
                const xlsxData = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64', cellDates: true });
                await Filesystem.writeFile({
                    path: fileName,
                    data: xlsxData,
                    directory: Directory.Documents,
                    recursive: true
                });
                alert(`Archivo guardado: ${fileName}`);
            } catch (err) {
                console.error('[Export] Error guardando en dispositivo:', err);
                // Fallback: intentar descarga web
                XLSX.writeFile(workbook, fileName, { cellDates: true });
            }
        } else {
            XLSX.writeFile(workbook, fileName, { cellDates: true });
        }
    }, [vista, filasDePartidas, dicPartidas, juegoCriterios, ambitoPartidas, filasTabla, columnasVista, tiposColumna, calculos, niveles, filtroTabla, soloConMetrado, camposSuma, orden, flattenedData.length, hayBusqueda, busqueda, campoBusqueda]);

    // Lo seleccionado que está en la tabla: casillas / Mayús / Ctrl, o si no, lo elegido en el 3D.
    const [copiado, setCopiado] = useState(null);
    const seleccionParaSumar = checkedIds.size ? checkedIds : (localSelIds && localSelIds.size && !followSelection ? localSelIds : null);
    const filasSeleccionadas = useMemo(() => (seleccionParaSumar ? filasTabla.filter(f => seleccionParaSumar.has(inventoryRowKey(f))) : []),
        [seleccionParaSumar, filasTabla]);
    const totalesSeleccion = useMemo(() => {
        const r = {};
        if (filasSeleccionadas.length) for (const [campo, calc] of Object.entries(calculos)) r[campo] = Tabla.calcular(filasSeleccionadas, campo, calc);
        return r;
    }, [filasSeleccionadas, calculos]);

    const totalesPie = useMemo(() => {
        const r = {};
        for (const [campo, calc] of Object.entries(calculos)) r[campo] = Tabla.calcular(filasTabla, campo, calc);
        return r;
    }, [filasTabla, calculos]);

    // Lista de render: grupos (varios niveles, plegables), filas y, si se
    // piden, los totales de cada grupo.
    // Lo elegido EN EL MODELO va arriba, en su propio grupo con subtotal (con
    // «Seguir el 3D»). La selección hecha en la tabla con Mayús/Ctrl no mueve
    // filas: el siguiente clic caería en otra.
    const seleccionDelModelo = useMemo(() => {
        if (!followSelection || checkedIds.size || !localSelIds || !localSelIds.size) return [];
        return refineInventorySelection(filasTabla, localSelIds, rawData);
    }, [followSelection, checkedIds, localSelIds, filasTabla, rawData]);
    const clavesSeleccionModelo = useMemo(() => new Set(seleccionDelModelo.map(inventoryRowKey)), [seleccionDelModelo]);

    const displayList = useMemo(() => {
        const cabeza = [];
        const resto = clavesSeleccionModelo.size ? filasTabla.filter(f => !clavesSeleccionModelo.has(inventoryRowKey(f))) : filasTabla;
        if (seleccionDelModelo.length) {
            const grupo = {
                clave: '__seleccion_del_modelo__', campo: 'Selección', nivel: 0,
                // Lo elegido que no tiene fila (no está en el inventario extraído) se dice, no se calla.
                valor: localSelIds.size > seleccionDelModelo.length
                    ? `Seleccionado en el modelo — ${localSelIds.size - seleccionDelModelo.length} sin fila en la planilla`
                    : 'Seleccionado en el modelo', n: seleccionDelModelo.length, seleccion: true,
                totales: Object.fromEntries(Object.entries(calculos).map(([c, k]) => [c, Tabla.calcular(seleccionDelModelo, c, k)])),
            };
            cabeza.push({ type: 'group', grupo });
            if (!collapsedGroups.has(grupo.clave)) for (const row of seleccionDelModelo) cabeza.push({ type: 'data', row, nivel: 1 });
            // Si lo seleccionado es todo lo que hay, el pie ya dice lo mismo.
            if (resto.length) cabeza.push({ type: 'groupTotals', grupo });
        }
        if (!niveles.length) return [...cabeza, ...resto.map(row => ({ type: 'data', row, nivel: 0 }))];
        const grupos = Tabla.agrupar(resto, niveles, totalesPorGrupo ? calculos : {});
        return [...cabeza, ...Tabla.aplanar(grupos, collapsedGroups, totalesPorGrupo).map(it => (
            it.tipo === 'fila' ? { type: 'data', row: it.fila, nivel: it.nivel }
                : { type: it.tipo === 'grupo' ? 'group' : 'groupTotals', grupo: it.grupo }))];
    }, [filasTabla, niveles, collapsedGroups, totalesPorGrupo, calculos, seleccionDelModelo, clavesSeleccionModelo, localSelIds]);
    displayListRef.current = displayList;
    const ordenVisible = useMemo(() => displayList.filter(i => i.type === 'data').map(i => inventoryRowKey(i.row)), [displayList]);
    ordenVisibleRef.current = ordenVisible;

    const alternarOrden = useCallback((campo, añadir) => {
        setOrden(prev => {
            const actual = prev.find(o => o.campo === campo);
            const siguiente = !actual ? { campo, dir: 'asc' } : actual.dir === 'asc' ? { campo, dir: 'desc' } : null;
            if (!añadir) return siguiente ? [siguiente] : [];
            const resto = prev.filter(o => o.campo !== campo);
            return siguiente ? (actual ? prev.map(o => o.campo === campo ? siguiente : o) : [...resto, siguiente]) : resto;
        });
    }, []);

    const visibleRows = useMemo(() => {
        if (displayList.length === 0 || containerHeight === 0) return [];
        const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
        const endIdx = Math.min(displayList.length, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);

        const rows = [];
        for (let i = startIdx; i < endIdx; i++) {
            rows.push({ index: i, item: displayList[i], top: i * ROW_HEIGHT });
        }
        return rows;
    }, [displayList, scrollTop, containerHeight]);
    const totalHeight = displayList.length * ROW_HEIGHT;

    // Compute total content width for horizontal scroll sync
    const totalContentWidth = useMemo(() => {
        const checkboxColWidth = 40;
        const colsWidth = columnasVista.reduce((sum, col) => sum + col.width, 0);
        return checkboxColWidth + colsWidth;
    }, [columnasVista]);

    const textoDeFilas = `${filasTabla.length.toLocaleString('es-PE')} filas${reglasActivas || soloConMetrado || resultadoBusqueda ? ` de ${flattenedData.length.toLocaleString('es-PE')}` : ''}${reglasActivas ? ` (filtros de la tabla: ${reglasActivas})` : ''}${soloConMetrado ? ' · solo con metrado' : ''}${orden.length ? ` · ordenado por ${orden.map(o => o.campo + (o.dir === 'asc' ? ' ▲' : ' ▼')).join(', ')}` : ''}`;
    // Edición masiva: sobre las casillas o, si no hay, sobre lo elegido en el 3D. Se abre a petición.
    const objetivoEdicion = enlaceCompartido() ? null : (checkedIds.size ? checkedIds : (localSelIds && localSelIds.size ? localSelIds : null));

    // ESTILO GENERAL DE LA APP:
    return (
        <div data-escape-propio onKeyDown={alPulsarEscape} style={{ height: '100%', flex: '1 1 0', minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: '#faf9f5', color: '#333330', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
            
            {/* Header / Tabs - Top Level (Como Tandem) */}
            <div style={{ display: 'flex', background: '#ffffff', height: '30px', flexShrink: 0, alignItems: 'center', padding: '0 12px 0 16px', borderBottom: '1px solid #e8e6dc', gap: '16px' }}>
                <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#52524d', fontWeight: 600, letterSpacing: '0.8px', flexShrink: 0 }}>
                    Planilla
                </div>
                <div role="status" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', color: '#72706b' }}>
                    {!filterResult || filterResult.scopeId !== activeModelUrn || filterResult.status === 'pending'
                        ? 'Filtros: esperando datos o cálculo'
                        : filterResult.status !== 'ready'
                            ? 'Filtros: ' + (filterResult.diagnostics?.[0]?.message || filterResult.diagnostics?.[0]?.code || filterResult.status)
                            : filterResult.matches.length + ' coincidencias globales · ' + flattenedData.length + ' filas locales'}
                    {filterProgress?.phase === 'paused' ? ' · Aplicación visual pausada: ' + filterProgress.owner : ''}
                </div>

                {/* Window Controls (Undock / Close) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    <button style={{ background:'none', border:'none', color:'#72706b', cursor:'pointer' }} title="Abrir en otra ventana" onClick={() => {
                        openInventoryFilterPopout({ host:window,scopeId:activeModelUrn,columns,
                            assetsOnly:showAssetsOnly,selection:activeSelectionFilter||isolatedExtIds,onClose });
                    }}><Icons.Undock/></button>
                    <button style={{ background:'none', border:'none', color:'#72706b', cursor:'pointer' }} onClick={() => onClose ? onClose() : window.dispatchEvent(new CustomEvent('close-inventory'))} title="Cerrar"><Icons.Close/></button>
                </div>
            </div>

            {inventoryError && <div role="alert" style={{ color: '#fecaca', background: '#4c1d24', padding: '8px 12px', fontSize: '12px' }}>{inventoryError}</div>}
            {/* Toolbar (Filters, Columns, Group rows...) */}
            <div style={{ display: 'flex', background: '#ffffff', minHeight: '36px', flexShrink: 0, minWidth: 0, alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #e8e6dc', gap: '12px' }}>
                <div role="radiogroup" aria-label="Vista de la planilla" style={{ display: 'flex', border: '1px solid var(--v-linea-campo, #cccac0)', borderRadius: 'var(--v-radio-control, 4px)', overflow: 'hidden', marginRight: '10px' }}>
                    {[['elementos', 'Elementos'], ['partidas', 'Partidas']].map(([v, t]) => (
                        <button key={v} role="radio" aria-checked={vista === v} onClick={() => setVista(v)}
                            title={v === 'partidas' ? 'Una fila por partida, con la cantidad nativa de Revit en su unidad' : 'Una fila por elemento'}
                            style={{ border: 'none', padding: '0 10px', height: '26px', font: 'inherit', fontSize: '12px', cursor: 'pointer',
                                background: vista === v ? 'var(--alephia-selected-bg, #ECF0F1)' : '#ffffff', color: vista === v ? 'var(--v-accion, #507294)' : '#52524d', fontWeight: vista === v ? 600 : 400 }}>{t}</button>
                    ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div style={{ position: 'relative' }}>
                        <ToolBtn icon={<Icons.Filter />} onClick={() => setFiltroAbierto(o => !o)} active={reglasActivas > 0 || filtroAbierto}
                            badge={reglasActivas || null} title={reglasActivas ? `Filtros de la tabla (${reglasActivas})` : 'Filtros de la tabla'} />
                        {filtroAbierto && (
                            <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setFiltroAbierto(false)} />
                                <FiltroAvanzado filtro={filtroTabla} setFiltro={setFiltroTabla} catalogo={catalogo}
                                    muestra={flattenedData.length > 1500 ? flattenedData.filter((_, i) => i % Math.ceil(flattenedData.length / 1500) === 0) : flattenedData}
                                    onClose={() => setFiltroAbierto(false)} />
                            </>
                        )}
                    </div>
                    <ToolBtn icon={<Icons.Columns />} onClick={() => setColumnConfigOpen(true)} title="Columnas" />
                    <div style={{ position: 'relative' }}>
                        <ToolBtn
                            icon={<Icons.Group />}
                            onClick={e => {
                                // Abre hacia donde haya sitio: con el panel bajo, hacia arriba.
                                const r = e.currentTarget.getBoundingClientRect();
                                const abajo = window.innerHeight - r.bottom - 12, arriba = r.top - 12;
                                setGroupMenuOpen(o => o ? false : (abajo >= 380 || abajo >= arriba ? { arriba: false, alto: Math.min(380, abajo) } : { arriba: true, alto: Math.min(380, arriba) }));
                            }}
                            active={!!groupByKey}
                            badge={niveles.length > 1 ? niveles.length : null}
                            title={groupByKey ? `Agrupado por ${niveles.join(' › ')}` : 'Agrupar filas'}
                        />
                        {groupMenuOpen && (
                            <>
                                <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setGroupMenuOpen(false)} />
                                <div className="v-menu" role="menu" aria-label="Agrupar filas" style={{
                                    position: 'absolute', ...(groupMenuOpen.arriba ? { bottom: '30px' } : { top: '30px' }), left: 0, zIndex: 61, minWidth: '260px', maxHeight: `${groupMenuOpen.alto}px`, overflowY: 'auto'
                                }}>
                                    {groupByKey && (
                                        <div style={{ padding: '4px 6px 8px', borderBottom: '1px solid var(--v-linea)', marginBottom: '4px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--v-texto-2)' }}>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
                                                {niveles.map((k, i) => (
                                                    <span key={k} style={{ display: 'flex', alignItems: 'center', gap: '2px', padding: '0 2px 0 8px', height: '24px', border: '1px solid var(--v-linea)', borderRadius: 'var(--v-radio-control)', background: 'var(--v-superficie-2)', color: 'var(--v-texto)' }}>
                                                        {i + 1} · {Tabla.etiquetaDeColumna(k)}
                                                        <button aria-label={`Quitar el nivel ${k}`} className="v-cerrar" style={{ width: '20px', height: '20px' }} onClick={() => {
                                                            if (i === 0) { setGroupByKey(nivelesExtra[0] || null); setNivelesExtra(nivelesExtra.slice(1)); }
                                                            else setNivelesExtra(nivelesExtra.filter((_, j) => j !== i - 1));
                                                            setCollapsedGroups(new Set());
                                                        }}><Icons.Close /></button>
                                                    </span>
                                                ))}
                                            </div>
                                            <SelectorDeCampo catalogo={catalogo} valor="" placeholder="+ Añadir nivel…" etiqueta="Añadir un nivel de agrupación" excluir={niveles} ancho={340}
                                                onElegir={c => { setNivelesExtra(n => [...n, c]); setCollapsedGroups(new Set()); }} />
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', color: 'var(--v-texto)' }}>
                                                <input type="checkbox" checked={totalesPorGrupo} onChange={e => setTotalesPorGrupo(e.target.checked)} style={{ accentColor: 'var(--v-accion)' }} />
                                                Totales en cada grupo
                                            </label>
                                        </div>
                                    )}
                                    <div className="v-menu__nota" style={{ textTransform: 'uppercase', letterSpacing: '.5px', padding: '4px 10px' }}>Agrupar por</div>
                                    <button role="menuitemradio" aria-checked={!groupByKey} className="v-menu__item"
                                        onClick={() => { setGroupByKey(null); setNivelesExtra([]); setGroupMenuOpen(false); }}
                                        style={!groupByKey ? { background: 'var(--alephia-selected-bg, #ECF0F1)', color: 'var(--v-accion)' } : undefined}
                                    >Sin agrupar</button>
                                    {detectedGroupKey && (
                                        <button role="menuitemradio" aria-checked={groupByKey === detectedGroupKey} className="v-menu__item"
                                            onClick={() => { setGroupByKey(detectedGroupKey); setNivelesExtra([]); setCollapsedGroups(new Set()); setGroupMenuOpen(false); }}
                                            style={groupByKey === detectedGroupKey ? { background: 'var(--alephia-selected-bg, #ECF0F1)', color: 'var(--v-accion)' } : undefined}
                                        >
                                            <span className="v-menu__nota" style={{ border: '1px solid var(--v-linea-campo)', borderRadius: '3px', padding: '0 4px' }}>sugerido</span>
                                            {Tabla.etiquetaDeColumna(detectedGroupKey)}
                                        </button>
                                    )}
                                    <div style={{ height: '1px', background: 'var(--v-linea)', margin: '4px 0' }} />
                                    <div style={{ padding: '4px 2px 0' }}>
                                        <ListaDeCampos catalogo={catalogo} valor={groupByKey} excluir={GRUPO_NO_AGRUPABLE} alto={230} autoFocus={!groupByKey}
                                            onElegir={k => { setGroupByKey(k); setNivelesExtra([]); setCollapsedGroups(new Set()); setGroupMenuOpen(false); }} />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
                
                <div style={{ width: '1px', height: '16px', background: '#cccac0' }} />
                
                {/* Buscador: pegar un valor parametrizado en Revit (o varios, uno por línea). */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <textarea rows={1} wrap="off" className="v-campo" aria-label="Buscar en la planilla"
                        placeholder="Buscar o pegar un valor…" value={textoBusqueda}
                        onChange={e => {
                            const v = e.target.value;
                            if (!textoBusqueda.trim() && v.trim()) {
                                const sel = checkedIds.size ? checkedIds : (localSelIds || new Set());
                                setSeleccionCongelada(sel.size >= 2 ? new Set(sel) : null);
                            }
                            if (!v.trim()) setSeleccionCongelada(null);
                            setTextoBusqueda(v);
                        }}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) e.preventDefault(); if (e.key === 'Escape' && textoBusqueda) { e.stopPropagation(); setTextoBusqueda(''); setCampoBusqueda(null); setSeleccionCongelada(null); } }}
                        title={textoBusqueda || 'Sin tildes, mayúsculas, comas ni espacios de más. Varias líneas = cualquiera de ellas. De una fila de Excel se busca la descripción.'}
                        style={{ width: textoBusqueda ? 'min(560px, 34vw)' : '280px', transition: 'width .15s ease', height: '28px', resize: 'none', overflow: 'hidden', padding: '5px 26px 5px 8px', fontSize: '12px', lineHeight: '16px' }} />
                    {textoBusqueda && (
                        <button aria-label="Quitar la búsqueda" className="v-cerrar" onClick={() => { setTextoBusqueda(''); setCampoBusqueda(null); setSeleccionCongelada(null); }}
                            style={{ position: 'absolute', right: '2px', width: '24px', height: '24px' }}><Icons.Close /></button>
                    )}
                </div>

                <div style={{ width: '1px', height: '16px', background: '#cccac0' }} />

                {/* View Options */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12.5px', color: '#52524d' }}>
                    {showAssetsOnly && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={showAssetsOnly} onChange={(e) => setShowAssetsOnly(e.target.checked)} style={{ accentColor: '#6a9bcc' }} />
                            Assets only
                        </label>
                    )}
                    <label
                        title={camposSuma.length
                            ? `Oculta las filas sin cantidad (distinta de 0) en ninguna de las columnas que se suman: ${camposSuma.map(Tabla.etiquetaDeColumna).join(', ')}`
                            : 'No hay columnas que se sumen (Σ) en la tabla: añade una columna de cantidad para usarlo'}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: camposSuma.length ? 'pointer' : 'default', opacity: camposSuma.length ? 1 : 0.5 }}>
                        <input type="checkbox" checked={soloConMetrado} disabled={!camposSuma.length} onChange={(e) => setSoloConMetrado(e.target.checked)} style={{ accentColor: '#6a9bcc' }} />
                        Solo con metrado
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={followSelection} onChange={(e) => setFollowSelection(e.target.checked)} style={{ accentColor: '#6a9bcc' }} />
                        Seguir el 3D
                    </label>
                </div>

                {/* Cuántas filas y por qué: en la barra, no en una franja propia. */}
                <span title={textoDeFilas} style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '11px', color: '#72706b' }}>
                    {vista === 'elementos' ? textoDeFilas : ''}
                </span>

                {/* Right Actions — ALWAYS VISIBLE */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* MANUAL SYNC FROM SELECTION, ISOLATION, OR CHECKBOXES */}
                    {(() => {
                        // Merge: checkedIds from table + localSelIds from 3D viewer
                        const mergedSyncIds = (() => {
                            const merged = new Set();
                            if (checkedIds.size > 0) checkedIds.forEach(id => merged.add(id));
                            if (localSelIds) localSelIds.forEach(id => merged.add(id));
                            return merged.size > 0 ? merged : null;
                        })();

                        const hasSyncSource = mergedSyncIds || activeSelectionFilter || isolatedExtIds;
                        if (!hasSyncSource) return null;

                        const isFiltered = activeSelectionFilter !== null || isolatedExtIds !== null;
                        const filterSize = activeSelectionFilter ? activeSelectionFilter.size : (isolatedExtIds ? isolatedExtIds.size : 0);
                        const isSyncDisabled = mergedSyncIds && isFiltered && mergedSyncIds.size === filterSize
                            && [...mergedSyncIds].every(id => (activeSelectionFilter || isolatedExtIds)?.has(id));

                        return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginRight: '4px', borderRight: '1px solid #e8e6dc', paddingRight: '8px' }}>
                                {!isFiltered ? (
                                    <button
                                        onClick={() => setActiveSelectionFilter(mergedSyncIds)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#72706b',
                                            padding: '4px 8px',
                                            borderRadius: '4px',
                                            fontSize: '11.5px',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseEnter={e => { e.currentTarget.style.color = '#141413'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                                        onMouseLeave={e => { e.currentTarget.style.color = '#72706b'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                        title="Dejar en la tabla solo lo seleccionado (3D y casillas)"
                                    >
                                        <Icons.Sync /> Filtrar selección ({mergedSyncIds.size})
                                    </button>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => {
                                                if (mergedSyncIds) setActiveSelectionFilter(mergedSyncIds);
                                            }}
                                            disabled={!mergedSyncIds || isSyncDisabled}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: (!mergedSyncIds || isSyncDisabled) ? '#507294' : '#72706b',
                                                padding: '4px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11.5px',
                                                cursor: (!mergedSyncIds || isSyncDisabled) ? 'default' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                transition: 'all 0.2s'
                                            }}
                                            onMouseEnter={e => { 
                                                if (mergedSyncIds && !isSyncDisabled) {
                                                    e.currentTarget.style.color = '#141413';
                                                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)';
                                                }
                                            }}
                                            onMouseLeave={e => { 
                                                if (mergedSyncIds && !isSyncDisabled) {
                                                    e.currentTarget.style.color = '#72706b';
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                }
                                            }}
                                            title={(mergedSyncIds && !isSyncDisabled) ? "Actualizar con la selección nueva" : "La tabla está filtrada por la selección"}
                                        >
                                            {(mergedSyncIds && !isSyncDisabled) ? <Icons.Sync /> : <Icons.Filter />} Filtrado ({filterSize})
                                        </button>
                                        {activeSelectionFilter !== null && (
                                            <button
                                                onClick={() => setActiveSelectionFilter(null)}
                                                style={{ background: 'none', border: 'none', color: '#72706b', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px', transition: 'all 0.2s' }}
                                                title="Quitar el filtro de selección"
                                                onMouseEnter={e => { e.currentTarget.style.color = '#ef5350'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                                                onMouseLeave={e => { e.currentTarget.style.color = '#72706b'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                                            >
                                                <Icons.Close />
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })()}
                    {objetivoEdicion && vista === 'elementos' && (
                        <button onClick={() => setEditarAbierto(o => !o)} aria-expanded={editarAbierto}
                            title="Asignar un valor a un parámetro en los elementos seleccionados"
                            style={{ background: editarAbierto ? 'var(--alephia-selected-bg, #ECF0F1)' : 'none', border: '1px solid #cccac0', color: editarAbierto ? '#507294' : '#52524d', padding: '4px 10px', fontSize: '11.5px', borderRadius: '4px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            Editar ({objetivoEdicion.size}{checkedIds.size ? '' : ' en 3D'})
                        </button>
                    )}
                    <button 
                        onClick={handleExportExcel}
                        style={{ background: 'none', border: '1px solid #cccac0', color: '#52524d', padding: '4px 10px', fontSize: '11.5px', borderRadius: '4px', cursor: 'pointer', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '6px' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#141413'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = '#52524d'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                    >
                        <Icons.ExportAction /> Exportar Excel
                    </button>
                    <button 
                        onClick={() => setTotalsPickerOpen(true)}
                        style={{ background: 'none', border: '1px solid #cccac0', color: totalColumns.size > 0 ? '#507294' : '#52524d', padding: '4px 10px', fontSize: '11.5px', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#141413'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = totalColumns.size > 0 ? '#6a9bcc' : '#cccac0'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                        title="Elegir las columnas que se suman"
                    >
                        <Icons.Sigma /> Sumas {totalColumns.size > 0 ? `(${totalColumns.size})` : ''}
                    </button>
                    {totalColumns.size > 0 && (
                        <button 
                            onClick={() => setTotalColumns(new Set())}
                            style={{ background: 'none', border: 'none', color: '#72706b', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px', transition: 'all 0.2s' }}
                            title="Quitar las sumas"
                            onMouseEnter={e => { e.currentTarget.style.color = '#ef5350'; e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.08)'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = '#72706b'; e.currentTarget.style.backgroundColor = 'transparent'; }}
                        >
                            <Icons.Close />
                        </button>
                    )}
                </div>
            </div>

            {/* BULK EDIT TOOLBAR — opera sobre los checks del grid Y/O la selección 3D */}
            {(() => {
                if (enlaceCompartido()) return null;
                const bulkTargetIds = checkedIds.size > 0
                    ? checkedIds
                    : (localSelIds && localSelIds.size > 0 ? localSelIds : null);
                if (!bulkTargetIds || !editarAbierto || vista !== 'elementos') return null;
                return (
                <div style={{
                    display: 'flex', background: '#ffffff', minHeight: '34px', flexShrink: 0, alignItems: 'center',
                    padding: '0 12px', borderBottom: '1px solid #e8e6dc', gap: '8px',
                    animation: 'fadeIn 0.15s ease-out'
                }}>
                    <span style={{ fontSize: '11px', color: '#507294', fontWeight: 600, whiteSpace: 'nowrap' }}>{bulkTargetIds.size} sel.{checkedIds.size === 0 ? ' (3D)' : ''}</span>
                    <div style={{ width: '1px', height: '16px', background: '#e8e6dc' }} />
                    <select
                        value={bulkField}
                        onChange={e => setBulkField(e.target.value)}
                        style={{
                            background: '#f1f0e8', border: '1px solid #cccac0', color: '#333330',
                            padding: '3px 6px', fontSize: '11px', borderRadius: '3px', outline: 'none',
                            maxWidth: '120px', cursor: 'pointer'
                        }}
                    >
                        {columns.filter(c => c.key !== 'dbId').map(c => (
                            <option key={c.key} value={c.key}>{c.header}</option>
                        ))}
                        <option disabled>──────────</option>
                        <option value="__new__">+ Nuevo campo…</option>
                    </select>
                    {bulkField === '__new__' && (
                        <input
                            type="text"
                            value={bulkNewField}
                            onChange={e => setBulkNewField(e.target.value)}
                            placeholder="Nombre del campo"
                            title="Crea tu propio parámetro (ej. Responsable, Frente, Prioridad)"
                            style={{
                                background: '#ffffff', border: '1px solid #6a9bcc', color: '#141413',
                                padding: '3px 8px', fontSize: '11px', borderRadius: '3px', outline: 'none',
                                width: '120px'
                            }}
                        />
                    )}
                    <input
                        type="text"
                        value={bulkValue}
                        onChange={e => setBulkValue(e.target.value)}
                        placeholder="Valor..."
                        onKeyDown={e => { if (e.key === 'Enter' && bulkValue.trim()) document.getElementById('bulk-apply-btn')?.click(); }}
                        style={{
                            background: '#ffffff', border: '1px solid #cccac0', color: '#141413',
                            padding: '3px 8px', fontSize: '11px', borderRadius: '3px', outline: 'none',
                            width: '120px'
                        }}
                    />
                    <button
                        id="bulk-apply-btn"
                        disabled={bulkAssigning || !bulkValue.trim() || (bulkField === '__new__' && !bulkNewField.trim())}
                        onClick={async () => {
                            const isNew = bulkField === '__new__';
                            const fieldName = (isNew ? bulkNewField : bulkField).trim();
                            const fieldValue = bulkValue.trim();
                            if (bulkAssigning || !fieldValue || !fieldName) return;
                            if (isNew && (fieldName.toLowerCase() === 'dbId'.toLowerCase() || fieldName === 'EXT ID' || fieldName === 'Id. elemento')) {
                                alert('Ese nombre está reservado. Elige otro.');
                                return;
                            }
                            setBulkAssigning(true);
                            setInventoryError(null);
                            try {
                                const targets = resolveInventoryTargets(rawData, bulkTargetIds, { legacyExternalIds: checkedIds.size === 0 });
                                const payload = inventoryBulkPayload(targets, fieldName, fieldValue);
                                const response = await apiFetch(`${BACKEND_URL}/api/inventory/bulk`, {
                                    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
                                });
                                await requireInventoryResponse(response);
                                const apply = rows => updateInventoryRows(rows, targets, fieldName, fieldValue);
                                setFlattenedData(apply);
                                setRawData(apply);
                                if (Array.isArray(window.postgresInventory)) {
                                    window.postgresInventory = apply(window.postgresInventory);
                                    markInventoryRevision();   // edicion EN SITIO
                                    window.dispatchEvent(new CustomEvent('recalculate-filters'));
                                }
                                window.__inventoryCache = null;
                                // Campo PROPIO nuevo: mostrarlo como columna al instante y refrescar
                                // por la vía canónica para que aparezca como facet de filtro.
                                if (isNew) {
                                    setColumns(prev => prev.some(c => c.key === fieldName) ? prev : [...prev, { key: fieldName, header: fieldName, width: 160 }]);
                                    setAllPropertyKeys(prev => prev.includes(fieldName) ? prev : [...prev, fieldName]);
                                    setBulkField(fieldName);
                                    setBulkNewField('');
                                    window.dispatchEvent(new CustomEvent('inventory-needs-refresh'));
                                }
                                setCheckedIds(new Set());
                                setBulkValue('');
                            } catch (e) {
                                console.error('[BULK] Error:', e);
                                setInventoryError('Error en asignación masiva: ' + e.message);
                            } finally {
                                setBulkAssigning(false);
                            }
                        }}
                        style={{
                            background: (bulkAssigning || !bulkValue.trim()) ? '#444' : 'linear-gradient(135deg, #7e9bbd, #2d8fa5)',
                            border: 'none', color: '#fff', padding: '3px 10px', fontSize: '11px', borderRadius: '3px',
                            cursor: (bulkAssigning || !bulkValue.trim()) ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px',
                            fontWeight: 600, transition: 'all 0.2s', whiteSpace: 'nowrap',
                            boxShadow: (bulkAssigning || !bulkValue.trim()) ? 'none' : '0 2px 8px rgba(106,155,204,0.3)'
                        }}
                    >
                        {bulkAssigning ? '...' : '▶'} Aplicar
                    </button>
                    <button
                        onClick={() => setEditarAbierto(false)}
                        style={{ background: 'none', border: 'none', color: '#72706b', cursor: 'pointer', padding: '4px', display: 'flex', borderRadius: '4px' }}
                        title="Cerrar la edición"
                    >
                        <Icons.Close />
                    </button>
                </div>
                );
            })()}

            {resultadoBusqueda && (
                <BarraDeBusqueda
                    resultado={resultadoBusqueda} campo={campoBusqueda} onCampo={setCampoBusqueda}
                    seleccion={checkedIds.size ? checkedIds : localSelIds} seleccionCongelada={seleccionCongelada} onSeleccion={setSeleccionCongelada}
                    parecidos={listaParecidos} confirmados={confirmados} onConfirmados={setConfirmados}
                    verParecidos={verParecidos || (!resultadoBusqueda.filas.size && listaParecidos.length > 0)} onVerParecidos={setVerParecidos}
                    medidas={medidasPosibles} activas={medidasActivas} onMedidas={setMedidasElegidas}
                    sumas={Object.fromEntries(medidasActivas.map(k => [k, Tabla.textoDeResultado(Tabla.calcular(filasTabla, k, 'suma'))]))}
                />
            )}
            
            {vista === 'partidas' ? (
                <TablaDePartidas filas={filasDePartidas} filasObra={flattenedData} dic={dicPartidas} roles={rolesPartidas} claveDeFila={inventoryRowKey}
                    itemizado={itemizado} estadoItemizado={obraItemizado}
                    onItemizado={leido => (leido ? itemizadoDeObra.guardar(leido) : itemizadoDeObra.quitar())}
                    criterios={juegoCriterios} estadoCriterios={obraCriterios}
                    onCriterios={lista => criteriosDeMedida.guardar({ criterios: lista })}
                    ambito={ambitoPartidas ? 'seleccionados' : 'de la tabla'}
                    onUsarTodo={ambitoPartidas ? () => setAmbitoPartidas(null) : null}
                    onSeleccionar={seleccionarPartida}
                    onVerEnFilters={derivadoVale ? verEnFilters : null}
                    onMostrarTodo={() => window.dispatchEvent(new CustomEvent(EVENTOS.MOSTRAR_TODO))} />
            ) : (
            /* ═══ UNIFIED SCROLL CONTAINER (horizontal + vertical) ═══ */
            <div 
                ref={containerRef} 
                onScroll={handleScroll}
                style={{ 
                    flex: 1, 
                    minHeight: 0, 
                    overflow: 'auto',
                    position: 'relative'
                }}
            >
                {/* Inner wrapper forces minWidth for horizontal scroll */}
                <div style={{ minWidth: `${totalContentWidth}px` }}>
                    {/* Column Headers (sticky top) */}
                    <div 
                        ref={headerRef}
                        style={{ 
                            // La cabecera NO puede ser más apagada que el dato que rotula.
                            // Estaba en #918f88 con las celdas en #cccac0, o sea al revés que
                            // en Tandem (cabecera #e8e6dc sobre celdas #918f88).
                            display: 'flex', background: '#ffffff', height: '34px', alignItems: 'center',
                            fontSize: '12px', fontWeight: 600, color: '#333330', flexShrink: 0,
                            borderBottom: '1px solid #e8e6dc',
                            position: 'sticky', top: 0, zIndex: 2
                        }}
                    >
                        <div style={{ width: '40px', flexShrink: 0, borderRight: '1px solid #e8e6dc', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <input 
                                type="checkbox" 
                                checked={checkedIds.size > 0 && checkedIds.size === flattenedData.length}
                                ref={el => { if (el) el.indeterminate = checkedIds.size > 0 && checkedIds.size < flattenedData.length; }}
                                onChange={() => {
                                    if (checkedIds.size === flattenedData.length) {
                                        setCheckedIds(new Set());
                                    } else {
                                        setCheckedIds(new Set(flattenedData.map(inventoryRowKey)));
                                    }
                                }}
                                style={{ accentColor: '#6a9bcc', cursor: 'pointer', width: '13px', height: '13px', margin: 0 }}
                                title={checkedIds.size === flattenedData.length ? 'Deselect all' : `Select all ${flattenedData.length} items`}
                            />
                        </div>
                        {columnasVista.map(col => {
                            const o = orden.findIndex(x => x.campo === col.key);
                            const dir = o >= 0 ? orden[o].dir : null;
                            return (
                                <button
                                    key={col.key}
                                    onClick={e => alternarOrden(col.key, e.shiftKey)}
                                    onContextMenu={e => { e.preventDefault(); setMenuCabecera({ campo: col.key, x: e.clientX, y: e.clientY }); }}
                                    title={`${col.header} · clic: ordenar · Mayús+clic: añadir criterio · clic derecho: más`}
                                    style={{
                                        width: col.width, flexShrink: 0, padding: '0 12px', overflow: 'hidden', whiteSpace: 'nowrap',
                                        textAlign: 'left', height: '100%', display: 'flex', alignItems: 'center', gap: '4px',
                                        borderRight: '1px solid #e8e6dc', position: 'relative', background: 'transparent', border: 'none',
                                        borderRightStyle: 'solid', borderRightWidth: '1px', borderRightColor: '#e8e6dc',
                                        font: 'inherit', fontWeight: 600, color: dir ? '#507294' : '#333330', cursor: 'pointer'
                                    }}
                                >
                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.header}</span>
                                    {dir && <span aria-hidden="true">{dir === 'asc' ? '▲' : '▼'}{orden.length > 1 ? o + 1 : ''}</span>}
                                </button>
                            );
                        })}
                    </div>

                    {/* Virtualised Data Grid */}
                    {isLoading ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', gap: '16px' }}>
                            {/* Tandem-style orbital spinner */}
                            <div style={{ width: '40px', height: '40px', position: 'relative' }}>
                                <svg viewBox="0 0 40 40" width="40" height="40" style={{ animation: 'inv-spin 1.2s linear infinite' }}>
                                    {[0,1,2,3,4,5,6,7].map(i => (
                                        <circle
                                            key={i}
                                            cx={20 + 14 * Math.cos((i * Math.PI * 2) / 8)}
                                            cy={20 + 14 * Math.sin((i * Math.PI * 2) / 8)}
                                            r={2.2 + (i * 0.35)}
                                            fill="#6a9bcc"
                                            opacity={0.25 + (i * 0.1)}
                                        />
                                    ))}
                                </svg>
                                <style>{`@keyframes inv-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
                            </div>
                            <span style={{ color: '#72706b', fontSize: '12px', letterSpacing: '0.5px' }}>Loading inventory data...</span>
                        </div>
                    ) : flattenedData.length > 0 && displayList.length === 0 ? (
                        <div style={{ padding: '40px 20px', color: '#52524d', textAlign: 'center', fontSize: '13px' }}>
                            Ninguna fila cumple los filtros de la tabla. <button onClick={() => setFiltroTabla({ modo: 'y', reglas: [] })} style={{ background: 'none', border: 'none', color: '#507294', cursor: 'pointer', font: 'inherit' }}>Quitar filtros</button>
                        </div>
                    ) : flattenedData.length > 0 ? (
                        <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
                            {visibleRows.map(({ index, item, top }) => item.type === 'group' ? (
                                <div
                                    key={`grp-${item.grupo.clave}`}
                                    onClick={() => setCollapsedGroups(prev => {
                                        const next = new Set(prev);
                                        if (next.has(item.grupo.clave)) next.delete(item.grupo.clave); else next.add(item.grupo.clave);
                                        return next;
                                    })}
                                    style={{
                                        position: 'absolute', top: `${top}px`, left: 0, height: `${ROW_HEIGHT}px`,
                                        width: `${totalContentWidth}px`, display: 'flex', alignItems: 'center', gap: '8px',
                                        padding: `0 12px 0 ${12 + item.grupo.nivel * 18}px`, boxSizing: 'border-box', cursor: 'pointer',
                                        background: item.grupo.seleccion ? 'var(--alephia-selected-bg, #ECF0F1)' : item.grupo.nivel ? '#fdfdfb' : '#ffffff', borderBottom: '1px solid #e8e6dc', borderTop: '1px solid #e8e6dc',
                                        color: '#52524d', fontSize: '12px', fontWeight: 700, zIndex: 1
                                    }}
                                    title={`${item.grupo.campo}: ${item.grupo.valor}`}
                                >
                                    <span style={{ display: 'inline-block', transform: collapsedGroups.has(item.grupo.clave) ? 'rotate(-90deg)' : 'none', transition: 'transform .1s', color: '#507294' }}>▾</span>
                                    <span style={{ color: '#507294' }}>{item.grupo.valor}</span>
                                    <span style={{ color: '#72706b', fontWeight: 500 }}>· {item.grupo.n}</span>
                                </div>
                            ) : item.type === 'groupTotals' ? (
                                <div key={`tot-${item.grupo.clave}`} style={{
                                    position: 'absolute', top: `${top}px`, left: 0, height: `${ROW_HEIGHT}px`, width: `${totalContentWidth}px`,
                                    display: 'flex', alignItems: 'center', boxSizing: 'border-box', background: item.grupo.seleccion ? 'var(--alephia-selected-bg, #ECF0F1)' : '#f5f4ef',
                                    borderBottom: item.grupo.seleccion ? '2px solid #cccac0' : '1px solid #e8e6dc', fontSize: '11.5px', fontWeight: 600, color: '#333330'
                                }}>
                                    <div style={{ width: '40px', flexShrink: 0, boxSizing: 'border-box', borderRight: '1px solid #e8e6dc', textAlign: 'center', color: '#72706b' }}>{item.grupo.n}</div>
                                    {columnasVista.map(col => (
                                        <div key={col.key} style={{ width: col.width, flexShrink: 0, boxSizing: 'border-box', padding: '0 12px', borderRight: '1px solid #e8e6dc', textAlign: 'right', fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {Tabla.textoDeResultado(item.grupo.totales[col.key])}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <InventoryRow
                                    key={inventoryRowKey(item.row)}
                                    row={item.row}
                                    columns={columnasVista}
                                    index={index}
                                    onRowClick={handleRowClick}
                                    isHighlighted={highlightedDbId === inventoryRowKey(item.row) || clavesSeleccionModelo.has(inventoryRowKey(item.row))}
                                    top={top}
                                    onCellEdit={handleCellEdit}
                                    isChecked={checkedIds.has(inventoryRowKey(item.row))}
                                    onToggleCheck={alternarCasilla}
                                />
                            ))}
                        </div>
                    ) : (
                        <div style={{ padding: '60px 20px', color: '#52524d', textAlign: 'center', fontSize: '14px' }}>
                            {window._lastHasActiveFilters ? 'No items match the current filter.' : 'Seleccione propiedades en Filters para poblar la tabla...'}
                        </div>
                    )}

                    {/* FOOTER TOTALS ROW (inside scroll container so it scrolls horizontally with data) */}
                    {/* Σ SELECCIÓN: lo elegido (Mayús/Ctrl, casillas o 3D), mismo cálculo y unidad que el pie; clic = copiar */}
                    {filasSeleccionadas.length > 0 && (
                        <div style={{
                            display: 'flex', background: 'var(--alephia-selected-bg, #ECF0F1)', borderTop: '1px solid #cccac0',
                            alignItems: 'center', fontSize: '12px', fontWeight: 600, color: '#141413', flexShrink: 0, height: '28px',
                            position: 'sticky', bottom: '30px', zIndex: 2
                        }}>
                            <div title={`${filasSeleccionadas.length} elementos seleccionados en la tabla`} style={{ width: '40px', flexShrink: 0, borderRight: '1px solid #e8e6dc', textAlign: 'center', fontSize: '11px', color: 'var(--v-accion, #507294)' }}>
                                {filasSeleccionadas.length}
                            </div>
                            {columnasVista.map((col, i) => {
                                const r = totalesSeleccion[col.key];
                                const texto = Tabla.textoDeResultado(r);
                                const unico = r && Object.keys(r.porUnidad).length === 1 ? Object.values(r.porUnidad)[0] : null;
                                const copia = unico != null ? String(Number(unico.toPrecision(12))) : texto;
                                return (
                                    <button key={col.key} disabled={!texto && i > 0}
                                        onClick={() => { if (texto) { navigator.clipboard?.writeText(copia); setCopiado(col.key); setTimeout(() => setCopiado(c => (c === col.key ? null : c)), 1200); } }}
                                        title={texto ? `Selección · ${col.header}: ${texto} · clic para copiar ${copia}` : ''}
                                        style={{
                                            width: col.width, flexShrink: 0, padding: '0 12px', height: '100%', textAlign: texto ? 'right' : 'left', fontVariantNumeric: 'tabular-nums',
                                            background: 'transparent', border: 'none', borderRight: '1px solid #e8e6dc', font: 'inherit', fontWeight: 600,
                                            color: texto ? 'var(--v-accion, #507294)' : '#72706b', cursor: texto ? 'copy' : 'default',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                        }}>
                                        {copiado === col.key ? 'Copiado' : (texto || (i === 0 ? 'Σ selección' : ''))}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* PIE: recuento y el cálculo de cada columna (clic para cambiarlo) */}
                    {flattenedData.length > 0 && (
                        <div style={{
                            display: 'flex', background: '#f5f4ef', borderTop: '1px solid #cccac0',
                            alignItems: 'center', fontSize: '12px', fontWeight: 600, color: '#333330', flexShrink: 0, height: '30px',
                            position: 'sticky', bottom: 0, zIndex: 2
                        }}>
                            <div title="Filas en la tabla" style={{ width: '40px', flexShrink: 0, borderRight: '1px solid #e8e6dc', textAlign: 'center', fontSize: '11px' }}>
                                {filasTabla.length.toLocaleString('es-PE')}
                            </div>
                            {columnasVista.map(col => {
                                const r = totalesPie[col.key];
                                const texto = Tabla.textoDeResultado(r);
                                const aviso = r && r.sinDato && r.calculo !== 'recuento' && r.calculo !== 'distintos' ? `${r.sinDato} sin dato numérico` : '';
                                return (
                                    <button key={col.key}
                                        onClick={e => col.key !== 'dbId' && setMenuPie({ campo: col.key, x: e.clientX, y: e.clientY })}
                                        title={col.key === 'dbId' ? '' : `${col.header}: ${texto || 'sin cálculo'}${aviso ? ' · ' + aviso : ''} · clic para cambiar el cálculo`}
                                        style={{
                                            width: col.width, flexShrink: 0, padding: '0 12px', height: '100%', textAlign: texto ? 'right' : 'left', fontVariantNumeric: 'tabular-nums',
                                            background: 'transparent', border: 'none', borderRight: '1px solid #e8e6dc', font: 'inherit', fontWeight: 600,
                                            color: texto ? '#141413' : '#b0aea5', cursor: col.key === 'dbId' ? 'default' : 'pointer',
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                        }}>
                                        {texto}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>{/* close inner minWidth wrapper */}
            </div>
            )}{/* close outer scroll container */}

            {/* Menú de la cabecera (clic derecho) */}
            {menuCabecera && (() => {
                const c = menuCabecera.campo;
                const item = (texto, accion, deshabilitado = false) => (
                    <button key={texto} role="menuitem" disabled={deshabilitado} className="v-menu__item" onClick={() => { accion(); setMenuCabecera(null); }}
                        style={deshabilitado ? { color: 'var(--v-texto-3)', opacity: .6, cursor: 'default' } : undefined}>{texto}</button>
                );
                return (
                    <>
                        <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} onClick={() => setMenuCabecera(null)} onContextMenu={e => { e.preventDefault(); setMenuCabecera(null); }} />
                        <div role="menu" aria-label={`Columna ${Tabla.etiquetaDeColumna(c)}`} className="v-menu" style={{ position: 'fixed', left: Math.min(menuCabecera.x, window.innerWidth - 240), top: Math.min(menuCabecera.y, window.innerHeight - 300), zIndex: 301, width: '230px' }}>
                            {item('Ordenar ascendente', () => setOrden([{ campo: c, dir: 'asc' }]))}
                            {item('Ordenar descendente', () => setOrden([{ campo: c, dir: 'desc' }]))}
                            {item('Quitar el orden', () => setOrden(o => o.filter(x => x.campo !== c)), !orden.some(x => x.campo === c))}
                            <div style={{ height: '1px', background: 'var(--v-linea)', margin: '4px 0' }} />
                            {item('Agrupar por esta columna', () => { setGroupByKey(c); setNivelesExtra([]); setCollapsedGroups(new Set()); }, c === 'dbId')}
                            {item('Añadir como subnivel', () => { setNivelesExtra(n => [...n, c]); setCollapsedGroups(new Set()); }, !groupByKey || niveles.includes(c) || c === 'dbId')}
                            {item('Filtrar por esta columna', () => { setFiltroTabla(f => ({ ...f, reglas: [...f.reglas, { campo: c, op: 'contiene', valor: '' }] })); setFiltroAbierto(true); }, c === 'dbId')}
                            <div style={{ height: '1px', background: 'var(--v-linea)', margin: '4px 0' }} />
                            {item('Ocultar columna', () => {
                                const actuales = (selectedColumnKeys || allPropertyKeys).filter(k => k !== c);
                                setSelectedColumnKeys(actuales);
                                fijarInventoryConfig({ columns: columnasDesdeElGrid(actuales, allPropertyKeys) });
                            }, c === 'dbId')}
                        </div>
                    </>
                );
            })()}

            {/* Menú del pie: el cálculo de la columna */}
            {menuPie && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 300 }} onClick={() => setMenuPie(null)} />
                    <div role="menu" aria-label="Cálculo de la columna" className="v-menu" style={{ position: 'fixed', left: Math.min(menuPie.x, window.innerWidth - 210), top: Math.max(8, menuPie.y - 270), zIndex: 301, width: '200px' }}>
                        <div className="v-menu__nota" style={{ textTransform: 'uppercase', letterSpacing: '.5px', padding: '4px 10px' }}>Cálculo</div>
                        {[...Tabla.CALCULOS, 'ninguno'].map(calc => {
                            const actual = (calculos[menuPie.campo] || 'ninguno') === calc;
                            return (
                                <button key={calc} role="menuitemradio" aria-checked={actual} className="v-menu__item" onClick={() => { setCalculosElegidos(p => ({ ...p, [menuPie.campo]: calc })); setMenuPie(null); }}
                                    style={actual ? { background: 'var(--alephia-selected-bg, #ECF0F1)', color: 'var(--v-accion)' } : undefined}>
                                    {calc === 'ninguno' ? 'Sin cálculo' : NOMBRE_CALCULO_LARGO[calc]}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}

            {/* Column Editor Modal */}
            <ColumnConfiguratorModal
                open={columnConfigOpen}
                onClose={() => setColumnConfigOpen(false)}
                availableColumns={allPropertyKeys}
                catalogo={catalogo}
                selectedColumns={selectedColumnKeys || allPropertyKeys}
                onUpdate={(newCols) => {
                    const todas = newCols.length === allPropertyKeys.length;
                    setSelectedColumnKeys(todas ? null : newCols);
                    // El triestado se escribe AQUI, donde el usuario decide.
                    // `{mode:'all'}` es un valor, no una ausencia: por eso
                    // volver a todas las columnas ya no se pierde.
                    fijarInventoryConfig({ columns: columnasDesdeElGrid(todas ? null : newCols, allPropertyKeys) });
                }}
            />

            {/* ═══════ TOTALS COLUMN PICKER MODAL ═══════ */}
            {totalsPickerOpen && (
                <div className="v-velo" role="dialog" aria-modal="true" aria-label="Totales por columna"
                    style={{ zIndex: 200, alignItems: 'flex-start', paddingTop: '10vh' }}
                    onClick={(e) => { if (e.target === e.currentTarget) setTotalsPickerOpen(false); }}
                >
                    <div className="v-caja" style={{ width: '380px', maxHeight: '70vh' }}>
                        {/* Header */}
                        <div className="v-cabecera">
                            <div>
                                <h2 className="v-titulo">Totales por columna</h2>
                                <div style={{ fontSize: '12px', color: '#72706b', marginTop: '2px' }}>Elige las columnas que se suman al pie</div>
                            </div>
                            <button className="v-cerrar" aria-label="Cerrar"
                                onClick={() => setTotalsPickerOpen(false)}
                            ><Icons.Close /></button>
                        </div>

                        {/* Column List */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                            {columns.filter(c => c.key !== 'dbId').map(col => {
                                const isSelected = totalColumns.has(col.key);
                                // Verificar si la columna tiene datos numéricos
                                const sampleValues = flattenedData.slice(0, 20).map(r => parseNumericCell(r[col.key])).filter(n => n !== null);
                                const hasNumericData = sampleValues.length > 0;
                                
                                return (
                                    <div 
                                        key={col.key}
                                        onClick={() => {
                                            if (!hasNumericData) return;
                                            setTotalColumns(prev => {
                                                const next = new Set(prev);
                                                if (next.has(col.key)) next.delete(col.key);
                                                else next.add(col.key);
                                                return next;
                                            });
                                        }}
                                        style={{ 
                                            padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '12px',
                                            cursor: hasNumericData ? 'pointer' : 'not-allowed',
                                            opacity: hasNumericData ? 1 : 0.35,
                                            borderBottom: '1px solid rgba(20, 20, 19,0.04)',
                                            background: isSelected ? '#ecf0f1' : 'transparent',
                                            transition: 'background 0.15s'
                                        }}
                                        onMouseEnter={e => { if (hasNumericData) e.currentTarget.style.background = isSelected ? '#ecf0f1' : '#f1f0e8'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = isSelected ? '#ecf0f1' : 'transparent'; }}
                                    >
                                        <div style={{
                                            width: '18px', height: '18px', borderRadius: '3px',
                                            border: isSelected ? '2px solid #507294' : '2px solid #b0aea5',
                                            background: isSelected ? '#507294' : 'transparent',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0, transition: 'all 0.15s'
                                        }}>
                                            {isSelected && (
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3">
                                                    <polyline points="20 6 9 17 4 12"></polyline>
                                                </svg>
                                            )}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontSize: '13px', color: '#141413', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{col.header}</div>
                                            {hasNumericData && (
                                                <div style={{ fontSize: '10px', color: '#72706b', marginTop: '1px' }}>
                                                    {sampleValues.length} {sampleValues.length !== 1 ? 'valores numéricos' : 'valor numérico'}
                                                </div>
                                            )}
                                            {!hasNumericData && (
                                                <div style={{ fontSize: '10px', color: '#52524d', marginTop: '1px' }}>Columna no numérica</div>
                                            )}
                                        </div>
                                        {isSelected && (
                                            <div style={{ fontSize: '11px', color: '#507294', fontWeight: 600 }}>Σ</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Footer */}
                        <div className="v-pie" style={{ justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '12px', color: '#72706b' }}>
                                {totalColumns.size} {totalColumns.size !== 1 ? 'columnas elegidas' : 'columna elegida'}
                            </span>
                            <button className="v-boton v-boton--principal"
                                onClick={() => setTotalsPickerOpen(false)}
                            >Listo</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InventoryDataGrid;
