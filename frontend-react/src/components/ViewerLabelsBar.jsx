import React, { useEffect, useRef, useState } from 'react';
import { ProfileIcon, ZoneTagIcon, ExcavationIcon, HeatmapIcon, HoverInfoIcon } from './TandemIcons';

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
        if (!next) setHoverData(null);
        window.dispatchEvent(new CustomEvent('lob-zone-hover', { detail: { visible: next } }));
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

    // Apagar al recargar modelo
    useEffect(() => {
        const off = () => { setZonesOn(false); setProfileOn(false); setExcavOn(false); };
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

    const Chip = ({ on, onClick, label, icon, color }) => (
        <button
            type="button"
            onClick={onClick}
            style={{
                display: 'inline-flex', alignItems: 'center', gap: 7, height: 26,
                background: on ? `${color}22` : 'transparent',
                border: `1px solid ${on ? color : '#2a323d'}`,
                color: on ? color : '#9aa4b2',
                borderRadius: 6, padding: '0 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'all .12s',
            }}
        >
            <span style={{
                width: 13, height: 13, borderRadius: 3, flexShrink: 0,
                border: `1.5px solid ${on ? color : '#4a5361'}`,
                background: on ? color : 'transparent',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: '#0d1117', fontSize: 10, fontWeight: 900, lineHeight: 1,
            }}>{on ? '✓' : ''}</span>
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>{icon}</span>
            {label}
        </button>
    );

    // Footer full-width (estilo Tandem): ocupa su propia franja; el visor de
    // arriba se adecúa. El toast se ancla por encima sin empujar el layout.
    return (
        <div style={{
            position: 'relative', flexShrink: 0, width: '100%', height: 40,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '0 14px', boxSizing: 'border-box',
            background: '#12151b', borderTop: '1px solid #262d38',
        }}>
            <span style={{ color: '#6b7686', fontSize: 10.5, fontWeight: 700, letterSpacing: '.5px', textTransform: 'uppercase' }}>Capas</span>
            <Chip on={profileOn} onClick={toggleProfile} label="Perfil" icon={<ProfileIcon />} color="#3aa0ff" />
            <Chip on={zonesOn} onClick={toggleZones} label="SubZonas" icon={<ZoneTagIcon />} color="#2d8fa5" />
            <Chip on={excavOn} onClick={toggleExcav} label="Excavación" icon={<ExcavationIcon />} color="#c08a4a" />
            <Chip on={heatConfig.on} onClick={toggleHeat} label="Heatmap" icon={<HeatmapIcon />} color="#e0559b" />
            <Chip on={hoverOn} onClick={toggleHover} label="Ejecución" icon={<HoverInfoIcon />} color="#fbbf24" />
            {heatConfig.on && (
                <button
                    type="button"
                    onClick={openHeatPanel}
                    title="Configurar tramos del heatmap"
                    style={{ background: 'transparent', border: 'none', color: heatOpen ? '#e0559b' : '#8d98a8', cursor: 'pointer', fontSize: 13, padding: '0 2px' }}
                >⚙</button>
            )}

            {/* Slot derecho: acciones globales (Revit Link, AR) integradas a la barra */}
            {rightSlot && (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {rightSlot}
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
                    {(hoverData.zona || hoverData.paquete) && (
                        <div style={{ fontSize: 10.5, color: '#7d8896', marginTop: 2 }}>
                            {[hoverData.zona, hoverData.paquete].filter(Boolean).join(' · ')}
                        </div>
                    )}

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

                    {hoverData.partidas?.length > 0 && (
                        <div style={{ marginTop: 12, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 9 }}>
                            <div style={{ fontSize: 9.5, color: '#6b7686', textTransform: 'uppercase', letterSpacing: '.6px', marginBottom: 6 }}>
                                Partidas ({hoverData.partidas.length})
                            </div>
                            {hoverData.partidas.map((p, i) => (
                                <div key={i} style={{ display: 'flex', gap: 8, fontSize: 11, marginBottom: 4, alignItems: 'baseline' }}>
                                    <span style={{ flex: 1, color: '#c3ccd8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>{p.name}</span>
                                    <span style={{ color: p.done === p.total ? '#34d399' : '#9aa4b2', fontFamily: 'Consolas, monospace', fontWeight: 700 }}>
                                        {p.done}/{p.total}
                                    </span>
                                </div>
                            ))}
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
