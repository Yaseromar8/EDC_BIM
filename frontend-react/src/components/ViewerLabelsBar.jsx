import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ProfileIcon, ZoneTagIcon, ExcavationIcon, EarthworksGhostIcon, HeatmapIcon, HoverInfoIcon } from './TandemIcons';

// "0+125.50" o "125.5" → metros
const parsePk = (txt) => {
    const s = String(txt ?? '').trim();
    if (!s) return NaN;
    if (s.includes('+')) {
        const [k, m] = s.split('+');
        return (Number(k) || 0) * 1000 + (Number(m) || 0);
    }
    return Number(s);
};
const fmtPk = (v) => Number.isFinite(v) ? `${Math.floor(v / 1000)}+${(v % 1000).toFixed(2).padStart(6, '0')}` : '';

const HEAT_STATES = [
    { id: 'ejecutado', label: 'Ejecutado', color: '#10b981' },
    { id: 'en_ejecucion', label: 'En ejecución', color: '#f97316' },
];

// Barra inferior compacta (estilo Tandem "Ab / Labels") para marcar/desmarcar
// capas del visor SIN distorsionar el layout: flota sobre el canvas, no ocupa
// espacio. Hoy controla: Perfil longitudinal y Rótulos de SubZona.
const REASON_TEXT = {
    'sin-inventario': 'Inventario aún no cargado — espera unos segundos y reintenta.',
    'sin-parametro': 'No se encontró el parámetro SubZona/Zona en el inventario.',
    'parametro-vacio': 'El parámetro de SubZona existe pero está vacío en los elementos.',
    'sin-geometria': 'Hay SubZonas pero no cruzaron con geometría del visor (revisar mapeo).',
};

export default function ViewerLabelsBar({ rightSlot = null }) {
    const [profileOn, setProfileOn] = useState(false);
    const [zonesOn, setZonesOn] = useState(false);
    const [excavOn, setExcavOn] = useState(false);
    const [ghostSecOn, setGhostSecOn] = useState(false); // holograma corte/relleno desde secciones
    // 'sections' = lámina del cadista lofteada · 'topo' = sólidos por
    // topografías (recetas QTO evaluadas en continuo sobre las superficies)
    const [ghostMode, setGhostMode] = useState('sections');
    const [ghostBodies, setGhostBodies] = useState([]);  // leyenda: cuerpos {id,kind,label,color,volume}
    const [ghostHidden, setGhostHidden] = useState(() => new Set()); // ids ocultos desde la leyenda
    const [toast, setToast] = useState(null);

    // ── Panel de ejecución por SubZona (hover) ──────────────────────────────
    const [hoverOn, setHoverOn] = useState(false);
    const [hoverData, setHoverData] = useState(null);
    useEffect(() => {
        const onData = (e) => setHoverData(e?.detail || null);
        const onErr = (e) => {
            setHoverOn(false);
            const r = e?.detail?.reason;
            setToast({ ok: false, text: r === 'sin-inventario'
                ? 'Inventario aún no cargado — espera unos segundos y reintenta.'
                : 'No se encontró el parámetro de SubZona en el inventario.' });
            if (toastTimer.current) clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setToast(null), 5000);
        };
        window.addEventListener('lob-zone-hover-data', onData);
        window.addEventListener('lob-zone-hover-error', onErr);
        return () => {
            window.removeEventListener('lob-zone-hover-data', onData);
            window.removeEventListener('lob-zone-hover-error', onErr);
        };
    }, []);
    const toggleHover = () => {
        const next = !hoverOn;
        setHoverOn(next);
        if (!next) { setHoverData(null); setExecCfgOpen(false); }
        window.dispatchEvent(new CustomEvent('lob-zone-hover', { detail: { visible: next } }));
    };

    // ── Parámetros de la capa Ejecución (agrupación + avance) ───────────────
    // El inventario DSI trae varios candidatos ("01_02_DSI_Localizador",
    // "00_05_DSI_SYP_SubZona"; "04_27_DSI_EjecutadoAcumulado", "EJECUTADO"…).
    // La detección automática ya prioriza bien, pero aquí se puede fijar cuál
    // manda — sin tocar código y por proyecto.
    const [execCfgOpen, setExecCfgOpen] = useState(false);
    const [execFields, setExecFields] = useState({
        group: window.__zoneHoverField || '',
        exec: window.__zoneHoverExecField || '',
    });
    const execFieldOpts = useMemo(() => {
        const keys = new Set();
        (window.postgresInventory || []).slice(0, 400).forEach(r => {
            if (r) Object.keys(r).forEach(k => keys.add(k));
        });
        const arr = Array.from(keys).sort();
        const banned = /^VAL_|sin[\s_]*ejecut|paños|panos|mes[\s_]*ejecut|fecha/i;
        return {
            group: arr.filter(k => /clasificaci|localizador|zona|paquete|sector|frente|tramo|nivel/i.test(k)),
            exec: arr.filter(k => /ejecutad|estado|avance/i.test(k) && !banned.test(k)),
        };
    }, [hoverOn, execCfgOpen]);
    const applyExecField = (which, value) => {
        setExecFields(prev => ({ ...prev, [which]: value }));
        window.__zoneHoverExecField = value || null;   // solo el campo de avance
        // reconstruir el índice con el parámetro nuevo (off → on)
        if (hoverOn) {
            window.dispatchEvent(new CustomEvent('lob-zone-hover', { detail: { visible: false } }));
            setTimeout(() => window.dispatchEvent(new CustomEvent('lob-zone-hover', { detail: { visible: true } })), 30);
        }
    };

    // ── Heatmap de avance por PK ────────────────────────────────────────────
    // Config global (persistida en Vistas): { on, ranges: { [alignId]: [{from,to,state}] } }
    const [heatOpen, setHeatOpen] = useState(false);
    const [heatConfig, setHeatConfig] = useState(() => window.__pkHeatmap || { on: false, ranges: {} });
    const [heatAlign, setHeatAlign] = useState(null);
    const [heatAligns, setHeatAligns] = useState([]);

    const pushHeatmap = (next) => {
        window.__pkHeatmap = next;
        setHeatConfig(next);
        window.dispatchEvent(new CustomEvent('lob-pk-heatmap', { detail: next }));
    };

    // Si una VISTA restaura el heatmap (App dispara el evento), reflejarlo aquí
    useEffect(() => {
        const onApply = (e) => { if (e?.detail) setHeatConfig(e.detail); };
        window.addEventListener('lob-pk-heatmap', onApply);
        return () => window.removeEventListener('lob-pk-heatmap', onApply);
    }, []);

    const openHeatPanel = () => {
        const list = Array.isArray(window.__lobCivilAlignments) ? window.__lobCivilAlignments : [];
        setHeatAligns(list);
        setHeatAlign((prev) => prev && list.some(a => (a.alignmentId || a.name) === prev) ? prev : (list[0] ? (list[0].alignmentId || list[0].name) : null));
        setHeatOpen(o => !o);
    };

    const toggleHeat = () => {
        const next = { ...heatConfig, on: !heatConfig.on };
        pushHeatmap(next);
        if (next.on && !Object.keys(next.ranges || {}).length) openHeatPanel();
    };

    const heatRanges = (heatConfig.ranges || {})[heatAlign] || [];
    const heatAlignData = heatAligns.find(a => (a.alignmentId || a.name) === heatAlign) || null;
    const setRanges = (rows) => {
        const ranges = { ...(heatConfig.ranges || {}) };
        if (rows.length) ranges[heatAlign] = rows; else delete ranges[heatAlign];
        pushHeatmap({ on: true, ranges });
    };
    const toastTimer = useRef(null);

    // Perfil: reflejar el estado real del panel
    useEffect(() => {
        const onState = (e) => setProfileOn(!!e?.detail?.open);
        window.addEventListener('viewer-profile-state', onState);
        return () => window.removeEventListener('viewer-profile-state', onState);
    }, []);

    // SubZonas: resultado del build (para avisar por qué no aparecen)
    useEffect(() => {
        const onResult = (e) => {
            const d = e?.detail || {};
            if (d.reason === 'ok') {
                setToast({ ok: true, text: `${d.zones} SubZona${d.zones === 1 ? '' : 's'} rotulada${d.zones === 1 ? '' : 's'}` });
            } else {
                setZonesOn(false);
                setToast({ ok: false, text: REASON_TEXT[d.reason] || 'No se pudieron generar los rótulos de SubZona.' });
            }
            if (toastTimer.current) clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setToast(null), 5000);
        };
        window.addEventListener('lob-zone-labels-result', onResult);
        return () => window.removeEventListener('lob-zone-labels-result', onResult);
    }, []);

    // Aviso del resultado de excavación fantasma (si no encontró el DWG de sólidos)
    useEffect(() => {
        const onExcav = (e) => {
            const d = e?.detail || {};
            if (!d.matched) {
                setExcavOn(false);
                const vistos = Array.isArray(d.names) ? d.names.filter(Boolean).join(' · ') : '';
                setToast({ ok: false, text: `No identifiqué el DWG de sólidos. Modelos vistos: ${vistos || '—'}` });
                if (toastTimer.current) clearTimeout(toastTimer.current);
                toastTimer.current = setTimeout(() => setToast(null), 8000);
            }
        };
        window.addEventListener('lob-ghost-excavation-result', onExcav);
        return () => window.removeEventListener('lob-ghost-excavation-result', onExcav);
    }, []);

    // Resultado del holograma de mov. de tierras (volúmenes o motivo del fallo)
    useEffect(() => {
        const GHOST_REASON = {
            'sin-secciones': 'Este frente no tiene secciones extraídas (Civil → Secciones).',
            'sin-eje': 'Este frente no tiene alineamientos extraídos.',
            'sin-estaciones': 'Las secciones guardadas no traen estaciones (re-extraer con la versión v2).',
            'sin-geometria-eje': 'El eje no trae geometría x/y por estación (re-extraer alineamientos).',
            'sin-materiales': 'Las estaciones no traen lazos cerrados de desmonte/terraplén.',
            'sin-dibujo': 'La malla llegó vacía — no se pudo dibujar.',
            'contrato-viejo': 'El backend corre una versión anterior — reinícialo (python server.py) y re-marca la capa.',
            'red': 'Sin conexión con el backend.',
        };
        const fmtVol = (v) => Number.isFinite(Number(v)) ? Number(v).toLocaleString('es-PE', { maximumFractionDigits: 0 }) : '—';
        const onGhostSec = (e) => {
            const d = e?.detail || {};
            if (d.ok) {
                setGhostBodies(Array.isArray(d.bodies) ? d.bodies : []);
                setGhostHidden(new Set());
                const parts = [];
                if (d.volumes?.corte != null) parts.push(`Corte ${fmtVol(d.volumes.corte)} m³`);
                if (d.volumes?.relleno != null) parts.push(`Relleno ${fmtVol(d.volumes.relleno)} m³`);
                // Avisos del generador (dibujo del cadista ↔ cuadro de Civil):
                // se anuncian aquí y el detalle queda en la consola.
                const warns = Array.isArray(d.warnings) ? d.warnings : [];
                if (warns.length) {
                    parts.push(`⚠ ${warns.length} aviso${warns.length > 1 ? 's' : ''} de lámina (ver consola)`);
                    console.warn('[Holograma] Avisos dibujo↔cuadro:\n' + warns.map(w => ` · ${w}`).join('\n'));
                }
                setToast({ ok: true, text: `Holograma ${d.alignmentId || ''}: ${parts.join(' · ') || 'dibujado'}` });
            } else {
                setGhostSecOn(false);
                setGhostBodies([]);
                setToast({ ok: false, text: d.detail || GHOST_REASON[d.reason] || 'No se pudo generar el holograma.' });
            }
            if (toastTimer.current) clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setToast(null), 7000);
        };
        window.addEventListener('ghost-earthworks-result', onGhostSec);
        return () => window.removeEventListener('ghost-earthworks-result', onGhostSec);
    }, []);

    // Apagar al recargar modelo
    useEffect(() => {
        const off = () => { setZonesOn(false); setProfileOn(false); setExcavOn(false); setGhostSecOn(false); setGhostBodies([]); };
        window.addEventListener('lob-clear', off);
        return () => window.removeEventListener('lob-clear', off);
    }, []);

    const toggleProfile = () => {
        const next = !profileOn;
        setProfileOn(next);
        window.dispatchEvent(new CustomEvent('viewer-toggle-profile', { detail: { open: next } }));
    };
    const toggleZones = () => {
        const next = !zonesOn;
        setZonesOn(next);
        window.dispatchEvent(new CustomEvent('lob-zone-labels', { detail: { visible: next } }));
    };
    const toggleExcav = () => {
        const next = !excavOn;
        setExcavOn(next);
        window.dispatchEvent(new CustomEvent('lob-ghost-excavation', { detail: { visible: next } }));
    };
    const toggleGhostSec = () => {
        const next = !ghostSecOn;
        setGhostSecOn(next);
        if (!next) setGhostBodies([]);
        if (next) {
            // feedback inmediato: la primera generación puede tardar unos
            // segundos (baja secciones de la nube); el resultado lo reemplaza
            setToast({ ok: true, text: 'Generando holograma de movimiento de tierras…' });
            if (toastTimer.current) clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setToast(null), 15000);
        }
        window.dispatchEvent(new CustomEvent('ghost-earthworks', { detail: { visible: next, mode: ghostMode } }));
    };
    // Cambiar la FUENTE del holograma con la capa encendida: redibuja con la otra
    const switchGhostMode = (mode) => {
        if (mode === ghostMode) return;
        setGhostMode(mode);
        if (!ghostSecOn) return;
        setGhostBodies([]);
        setGhostHidden(new Set());
        setToast({ ok: true, text: mode === 'topo' ? 'Generando sólidos por topografía…' : 'Generando holograma por secciones…' });
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 15000);
        window.dispatchEvent(new CustomEvent('ghost-earthworks', { detail: { visible: true, mode } }));
    };
    const toggleGhostBody = (id) => {
        setGhostHidden(prev => {
            const next = new Set(prev);
            const nowHidden = !next.has(id);
            if (nowHidden) next.add(id); else next.delete(id);
            window.dispatchEvent(new CustomEvent('ghost-earthworks-body', { detail: { id, visible: !nowHidden } }));
            return next;
        });
    };
    // Doble clic = AISLAR ese cuerpo (flujo de revisión: verlo limpio, solo);
    // doble clic otra vez = vuelven todos.
    const soloGhostBody = (id) => {
        setGhostHidden(prev => {
            const allIds = ghostBodies.map(b => b.id);
            const yaSolo = !prev.has(id) && prev.size >= allIds.length - 1 && allIds.length > 1;
            const next = new Set();
            if (!yaSolo) allIds.forEach(x => { if (x !== id) next.add(x); });
            allIds.forEach(x => {
                window.dispatchEvent(new CustomEvent('ghost-earthworks-body', { detail: { id: x, visible: !next.has(x) } }));
            });
            return next;
        });
    };

    // ── Menú "Capas": las 5 capas agrupadas en UNA columna desplegable ───────
    const [layersOpen, setLayersOpen] = useState(false);
    const layersRef = useRef(null);
    useEffect(() => {
        if (!layersOpen) return undefined;
        const onDown = (e) => { if (layersRef.current && !layersRef.current.contains(e.target)) setLayersOpen(false); };
        window.addEventListener('pointerdown', onDown);
        return () => window.removeEventListener('pointerdown', onDown);
    }, [layersOpen]);
    const activeLayers = [profileOn, zonesOn, excavOn, ghostSecOn, heatConfig.on, hoverOn].filter(Boolean).length;

    const LayersIcon = () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 12 12 17 22 12" /><polyline points="2 17 12 22 22 17" />
        </svg>
    );

    // Fila de capa dentro de la columna (checkbox + icono + nombre)
    const LayerRow = ({ on, onClick, label, icon, color, trailing }) => (
        <button
            type="button"
            onClick={onClick}
            style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%', height: 32,
                padding: '0 10px', background: 'transparent', border: 'none', borderRadius: 6,
                cursor: 'pointer', color: on ? color : '#d8d8d8', fontSize: 12, fontWeight: 600,
                transition: 'background .1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
            <span style={{
                width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                border: `1.5px solid ${on ? color : '#8a8a8a'}`,
                background: on ? color : 'transparent',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: '#1f1f1f', fontSize: 10, fontWeight: 900, lineHeight: 1,
            }}>{on ? '✓' : ''}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
            <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
            {trailing}
        </button>
    );

    // Footer full-width (estilo Tandem): ocupa su propia franja; el visor de
    // arriba se adecúa. Mismo color que TopBar/rail (#3A3A3A) para coherencia.
    return (
        <div className="viewer-labels-bar" style={{
            position: 'relative', flexShrink: 0, width: '100%', height: 40,
            display: 'flex', alignItems: 'center', gap: 10,
            boxSizing: 'border-box',
            background: '#3A3A3A', borderTop: '1px solid rgba(255,255,255,0.10)',
        }}>
            {/* Botón único "Capas" → columna con todas las capas */}
            <div ref={layersRef} style={{ position: 'relative' }}>
                <button
                    type="button"
                    onClick={() => setLayersOpen(o => !o)}
                    title="Capas del visor (perfil, subzonas, excavación, mov. tierras 3D, heatmap, ejecución)"
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: 7, height: 26,
                        background: layersOpen ? 'rgba(255,255,255,0.12)' : 'transparent',
                        border: '1px solid rgba(255,255,255,0.22)', color: '#d8d8d8',
                        borderRadius: 6, padding: '0 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    }}
                >
                    <LayersIcon />
                    Capas
                    {activeLayers > 0 && (
                        <span style={{ background: '#3AA0FF', color: '#fff', borderRadius: 8, fontSize: 9.5, fontWeight: 800, padding: '1px 6px', lineHeight: 1.3 }}>{activeLayers}</span>
                    )}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: layersOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><polyline points="18 15 12 9 6 15" /></svg>
                </button>

                {layersOpen && (
                    <div style={{
                        position: 'absolute', left: 0, bottom: 34, zIndex: 55, minWidth: 200,
                        background: '#3A3A3A', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9,
                        padding: 6, boxShadow: '0 10px 28px rgba(0,0,0,.5)',
                        display: 'flex', flexDirection: 'column', gap: 2,
                    }}>
                        <LayerRow on={profileOn} onClick={toggleProfile} label="Perfil" icon={<ProfileIcon />} color="#3aa0ff" />
                        <LayerRow on={zonesOn} onClick={toggleZones} label="SubZonas" icon={<ZoneTagIcon />} color="#43b3cc" />
                        <LayerRow on={excavOn} onClick={toggleExcav} label="Excavación" icon={<ExcavationIcon />} color="#d9a35e" />
                        <LayerRow on={ghostSecOn} onClick={toggleGhostSec} label="Mov. tierras 3D" icon={<EarthworksGhostIcon />} color="#e8b56a" />
                        <LayerRow on={heatConfig.on} onClick={toggleHeat} label="Heatmap" icon={<HeatmapIcon />} color="#e0559b"
                            trailing={heatConfig.on ? (
                                <span
                                    onClick={(e) => { e.stopPropagation(); openHeatPanel(); }}
                                    title="Configurar tramos del heatmap"
                                    style={{ color: heatOpen ? '#e0559b' : '#b9b9b9', fontSize: 13, padding: '0 2px' }}
                                >⚙</span>
                            ) : null} />
                        <LayerRow on={hoverOn} onClick={toggleHover} label="Ejecución" icon={<HoverInfoIcon />} color="#fbbf24"
                            trailing={hoverOn ? (
                                <span
                                    onClick={(e) => { e.stopPropagation(); setExecCfgOpen(v => !v); }}
                                    title="Elegir el parámetro que agrupa y el que marca el avance"
                                    style={{ color: execCfgOpen ? '#fbbf24' : '#b9b9b9', fontSize: 13, padding: '0 2px' }}
                                >⚙</span>
                            ) : null} />
                    </div>
                )}

                {/* Configuración de la capa Ejecución: de qué parámetro salen
                    los grupos y de cuál el avance (el inventario trae varios
                    "Ejecutado" y elegir mal invierte el porcentaje). */}
                {layersOpen && hoverOn && execCfgOpen && (
                    <div style={{
                        position: 'absolute', left: 208, bottom: 34, zIndex: 56, width: 268,
                        background: '#3A3A3A', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9,
                        padding: '9px 10px', boxShadow: '0 10px 28px rgba(0,0,0,.5)',
                    }}>
                        <div style={{ color: '#e8e8e8', fontWeight: 800, fontSize: 11.5, marginBottom: 7 }}>Capa Ejecución</div>
                        <div style={{ color: '#7d8896', fontSize: 10, marginBottom: 7 }}>
                            Agrupa por <b style={{ color: '#c8cdd6' }}>01_02_DSI_Localizador</b> (fijo)
                        </div>
                        {[
                            { lbl: 'Avance (sí/no)', key: 'exec', cur: execFields.exec, opts: execFieldOpts.exec },
                        ].map(({ lbl, key, cur, opts }) => (
                            <div key={key} style={{ marginBottom: 8 }}>
                                <div style={{ color: '#9a9a9a', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{lbl}</div>
                                <select
                                    value={cur || ''}
                                    onChange={(e) => applyExecField(key, e.target.value)}
                                    style={{
                                        width: '100%', height: 26, background: '#2a2d31', color: '#e2e2e2',
                                        border: '1px solid #555', borderRadius: 5, fontSize: 11, padding: '0 5px',
                                    }}
                                >
                                    <option value="">(automático)</option>
                                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>
                            </div>
                        ))}
                        <div style={{ color: '#7d8896', fontSize: 9.5, lineHeight: 1.35 }}>
                            Cuenta como ejecutado: Sí / 1 / X / true
                        </div>
                    </div>
                )}
            </div>

            {/* Slot derecho: acciones globales (Revit Link, AR) integradas a la barra */}
            {rightSlot && (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {rightSlot}
                </div>
            )}

            {/* Leyenda del holograma de mov. de tierras: un cuerpo por lista de
                material de Civil, con su color, volumen y ojo para ocultarlo.
                Sin esto el holograma es una masa verde ilegible. */}
            {ghostSecOn && ghostBodies.length > 0 && (
                <div style={{
                    position: 'absolute', right: 12, bottom: 48, zIndex: 55, minWidth: 232,
                    background: '#3A3A3A', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 9,
                    padding: '8px 10px', boxShadow: '0 10px 28px rgba(0,0,0,.5)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                        <EarthworksGhostIcon />
                        <span style={{ color: '#e8e8e8', fontWeight: 800, fontSize: 11.5, flex: 1 }}>Movimiento de tierras</span>
                        <span
                            onClick={toggleGhostSec}
                            title="Apagar la capa"
                            style={{ color: '#b9b9b9', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px' }}
                        >✕</span>
                    </div>
                    {/* Fuente del holograma: la lámina lofteada o las topografías
                        del cadista (recetas QTO en continuo). Mismo canal, misma
                        leyenda — se comparan alternando. */}
                    <div style={{ display: 'flex', gap: 4, padding: '0 2px 5px' }}>
                        {[['sections', 'Secciones'], ['topo', 'Topografía']].map(([m, lbl]) => (
                            <button
                                key={m}
                                type="button"
                                onClick={() => switchGhostMode(m)}
                                title={m === 'topo'
                                    ? 'Sólidos continuos evaluando las recetas QTO sobre las superficies del DWG'
                                    : 'Loft de los hatch de las secciones del cadista (lámina)'}
                                style={{
                                    flex: 1, height: 20, borderRadius: 5, cursor: 'pointer',
                                    border: `1px solid ${ghostMode === m ? '#e8b56a' : 'rgba(255,255,255,0.18)'}`,
                                    background: ghostMode === m ? 'rgba(232,181,106,0.16)' : 'transparent',
                                    color: ghostMode === m ? '#e8b56a' : '#b9b9b9',
                                    fontSize: 10, fontWeight: 700,
                                }}
                            >{lbl}</button>
                        ))}
                    </div>
                    <div style={{ color: '#9a9a9a', fontSize: 9.5, padding: '0 2px 4px' }}>
                        clic = ocultar · doble clic = ver solo ese cuerpo
                    </div>
                    {['corte', 'relleno'].map((kind) => {
                        const rows = ghostBodies.filter(b => b.kind === kind);
                        if (!rows.length) return null;
                        const total = rows.reduce((s, b) => s + (Number(b.volume) || 0), 0);
                        return (
                            <div key={kind} style={{ marginBottom: 4 }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, padding: '3px 2px 2px' }}>
                                    <span style={{ color: kind === 'corte' ? '#d9a35e' : '#3fb27f', fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                                        {kind === 'corte' ? 'Corte (excavación)' : 'Relleno'}
                                    </span>
                                    <span style={{ marginLeft: 'auto', color: '#cfcfcf', fontSize: 10.5, fontWeight: 700 }}>
                                        {Math.round(total).toLocaleString('es-PE')} m³
                                    </span>
                                </div>
                                {rows.map((b) => {
                                    const hidden = ghostHidden.has(b.id);
                                    return (
                                        <button
                                            key={b.id}
                                            type="button"
                                            onClick={() => toggleGhostBody(b.id)}
                                            onDoubleClick={() => soloGhostBody(b.id)}
                                            title={`${hidden ? 'Mostrar' : 'Ocultar'} este cuerpo · doble clic = verlo SOLO`}
                                            style={{
                                                display: 'flex', alignItems: 'center', gap: 7, width: '100%', height: 24,
                                                padding: '0 4px', background: 'transparent', border: 'none', borderRadius: 5,
                                                cursor: 'pointer', opacity: hidden ? 0.42 : 1, transition: 'opacity .1s, background .1s',
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                                        >
                                            <span style={{
                                                width: 11, height: 11, borderRadius: 3, flexShrink: 0,
                                                background: hidden ? 'transparent' : b.color,
                                                border: `1.5px solid ${b.color}`,
                                            }} />
                                            <span style={{ flex: 1, textAlign: 'left', color: '#e2e2e2', fontSize: 11, fontWeight: 600, textDecoration: hidden ? 'line-through' : 'none' }}>
                                                {b.label}
                                            </span>
                                            <span style={{ color: '#bdbdbd', fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>
                                                {Number.isFinite(Number(b.volume)) ? Number(b.volume).toLocaleString('es-PE', { maximumFractionDigits: 0 }) : '—'} m³
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Panel de tramos del Heatmap (flota sobre la barra) */}
            {heatOpen && (
                <div style={{
                    position: 'absolute', left: 12, bottom: 48, zIndex: 60,
                    background: 'rgba(15,18,22,0.98)', border: '1px solid #2a323d', borderRadius: 9,
                    padding: '10px 12px', minWidth: 430, boxShadow: '0 8px 28px rgba(0,0,0,.5)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ color: '#e0559b', fontWeight: 800, fontSize: 12 }}>Heatmap de avance por PK</span>
                        <select
                            value={heatAlign || ''}
                            onChange={(e) => setHeatAlign(e.target.value)}
                            style={{ background: '#0f1216', border: '1px solid #2a323d', color: '#dce3ee', borderRadius: 4, padding: '3px 8px', fontSize: 11, maxWidth: 190 }}
                        >
                            {heatAligns.map(a => {
                                const id = a.alignmentId || a.name;
                                return <option key={id} value={id}>{id}</option>;
                            })}
                        </select>
                        <span style={{ color: '#6b7686', fontSize: 10.5 }}>Ancho</span>
                        <input
                            type="number" min="0.5" step="0.5"
                            defaultValue={heatConfig.width || 5}
                            onBlur={(e) => { const w = Number(e.target.value); if (w > 0) pushHeatmap({ ...heatConfig, on: true, width: w }); }}
                            title="Ancho de la franja en metros"
                            style={{ width: 46, background: '#0f1216', border: '1px solid #2a323d', color: '#dce3ee', borderRadius: 4, padding: '3px 5px', fontSize: 11 }}
                        />
                        <span style={{ color: '#6b7686', fontSize: 10.5 }}>m</span>
                        <button type="button" onClick={() => setHeatOpen(false)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: '#8d98a8', cursor: 'pointer', fontSize: 15 }}>×</button>
                    </div>

                    {!heatAligns.length ? (
                        <div style={{ color: '#8d98a8', fontSize: 12 }}>Sin alineamientos extraídos: usa Civil → Extraer (o fija el eje base 📌).</div>
                    ) : (
                        <>
                            {heatRanges.map((r, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                                    <span style={{ color: '#6b7686', fontSize: 10.5, width: 34 }}>Tramo</span>
                                    <input
                                        defaultValue={fmtPk(r.from)}
                                        onBlur={(e) => { const v = parsePk(e.target.value); if (Number.isFinite(v)) setRanges(heatRanges.map((x, j) => j === i ? { ...x, from: v } : x)); }}
                                        style={{ width: 86, background: '#0f1216', border: '1px solid #2a323d', color: '#dce3ee', borderRadius: 4, padding: '3px 6px', fontSize: 11, fontFamily: 'Consolas, monospace' }}
                                    />
                                    <span style={{ color: '#6b7686' }}>→</span>
                                    <input
                                        defaultValue={fmtPk(r.to)}
                                        onBlur={(e) => { const v = parsePk(e.target.value); if (Number.isFinite(v)) setRanges(heatRanges.map((x, j) => j === i ? { ...x, to: v } : x)); }}
                                        style={{ width: 86, background: '#0f1216', border: '1px solid #2a323d', color: '#dce3ee', borderRadius: 4, padding: '3px 6px', fontSize: 11, fontFamily: 'Consolas, monospace' }}
                                    />
                                    <select
                                        value={r.state}
                                        onChange={(e) => setRanges(heatRanges.map((x, j) => j === i ? { ...x, state: e.target.value } : x))}
                                        style={{ background: '#0f1216', border: `1px solid ${HEAT_STATES.find(s => s.id === r.state)?.color || '#2a323d'}`, color: HEAT_STATES.find(s => s.id === r.state)?.color || '#dce3ee', borderRadius: 4, padding: '3px 6px', fontSize: 11, fontWeight: 700 }}
                                    >
                                        {HEAT_STATES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                    </select>
                                    <button type="button" onClick={() => setRanges(heatRanges.filter((_, j) => j !== i))} title="Quitar tramo"
                                        style={{ background: 'transparent', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 13 }}>🗑</button>
                                </div>
                            ))}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 }}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const s0 = Number(heatAlignData?.startStation) || 0;
                                        const s1 = Number(heatAlignData?.endStation) || (s0 + 100);
                                        setRanges([...heatRanges, { from: heatRanges.length ? heatRanges[heatRanges.length - 1].to : s0, to: s1, state: 'en_ejecucion' }]);
                                    }}
                                    style={{ background: 'rgba(224,85,155,.14)', border: '1px solid #e0559b', color: '#e0559b', borderRadius: 5, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
                                >＋ Tramo</button>
                                <span style={{ color: '#5b6570', fontSize: 10 }}>
                                    PK como 0+125.50 o 125.5 · {HEAT_STATES.map(s => s.label).join(' / ')} · guarda la Vista para fijarlo
                                </span>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* PANEL DE EJECUCIÓN POR SUBZONA — informa del GRUPO completo bajo
                el cursor (20, 200 o 2000 elementos), no de la pieza suelta. */}
            {hoverOn && hoverData && (
                <div style={{
                    position: 'fixed', right: 18, bottom: 58, zIndex: 55, width: 320,
                    background: 'rgba(13,17,23,0.82)', backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(251,191,36,0.42)', borderRadius: 10,
                    padding: '13px 15px', color: '#e6edf5',
                    boxShadow: '0 8px 30px rgba(0,0,0,.45)', pointerEvents: 'none',
                    animation: 'fadeIn .12s ease-out',
                }}>
                    <div style={{ fontSize: 13.5, fontWeight: 800, color: '#fcd34d', letterSpacing: '.3px' }}>{hoverData.zone}</div>

                    {hoverData.hasEjecutado ? (
                        <>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 11 }}>
                                <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{hoverData.pct}%</span>
                                <span style={{ fontSize: 11, color: '#9aa4b2' }}>
                                    {hoverData.done} de {hoverData.total} elementos
                                </span>
                            </div>
                            <div style={{ height: 6, background: 'rgba(255,255,255,.09)', borderRadius: 3, marginTop: 7, overflow: 'hidden' }}>
                                <div style={{ width: `${hoverData.pct}%`, height: '100%', background: 'linear-gradient(90deg,#10b981,#34d399)', transition: 'width .18s' }} />
                            </div>
                        </>
                    ) : (
                        <div style={{ fontSize: 11.5, color: '#9aa4b2', marginTop: 10 }}>
                            {hoverData.total} elementos · sin campo de avance en el inventario
                        </div>
                    )}

                </div>
            )}

            {toast && (
                <div style={{
                    position: 'absolute', left: '50%', bottom: 48, transform: 'translateX(-50%)',
                    background: toast.ok ? 'rgba(45,143,165,0.96)' : 'rgba(40,45,54,0.98)',
                    border: `1px solid ${toast.ok ? '#43b3cc' : '#3a4442'}`,
                    color: toast.ok ? '#eafcff' : '#e6b8b8',
                    borderRadius: 7, padding: '6px 12px', fontSize: 11.5, fontWeight: 600, maxWidth: 460, textAlign: 'center',
                    boxShadow: '0 4px 16px rgba(0,0,0,.4)', whiteSpace: 'normal', zIndex: 50,
                }}>
                    {toast.text}
                </div>
            )}
        </div>
    );
}
