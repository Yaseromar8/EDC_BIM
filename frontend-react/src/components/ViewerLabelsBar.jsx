import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ProfileIcon, ZoneTagIcon, ExcavationIcon, EarthworksGhostIcon, HeatmapIcon, HoverInfoIcon } from './TandemIcons';
import { iniciarPredict, resumenPredict, detallePredict, soles } from '../lib/predictBim';

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
    const [groupOn, setGroupOn] = useState(false);
    const [groupCount, setGroupCount] = useState(0);
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

    // ── PREDICT: partidas del expediente para el grupo bajo el cursor ───────
    // El catálogo se precarga una vez; el hover luego es instantáneo (memoria,
    // cero red). Si PREDICT está apagado, esto no afecta al visor en nada.
    useEffect(() => { iniciarPredict(); }, []);
    const predict = useMemo(
        () => resumenPredict(hoverData?.zone),
        [hoverData?.zone]
    );
    // La LISTA de partidas se pide aparte (es más pesada). Con un respiro de
    // 180 ms: al barrer el modelo con el mouse no se dispara en cada pieza.
    const [predictDet, setPredictDet] = useState(null);
    useEffect(() => {
        const cod = hoverData?.zone;
        if (!cod || !predict) { setPredictDet(null); return; }
        let vivo = true;
        const t = setTimeout(async () => {
            const d = await detallePredict(cod);
            if (vivo) setPredictDet(d);
        }, 180);
        return () => { vivo = false; clearTimeout(t); };
    }, [hoverData?.zone, predict]);

    // ── El panel se QUEDA ──────────────────────────────────────────────────
    // Un panel que desaparece al mover el mouse no se puede leer ni desplazar.
    // Al entrar con el cursor al panel se congela lo que está mostrando; con 📌
    // se fija aunque vuelvas al modelo. La × lo suelta.
    const [fijado, setFijado] = useState(false);      // explícito, con el 📌
    const [congelado, setCongelado] = useState(null); // instantánea al entrar
    const vista = congelado || (hoverData ? { hoverData, predict, predictDet } : null);
    const congelar = () => { if (hoverData) setCongelado({ hoverData, predict, predictDet }); };
    const soltar = () => { setFijado(false); setCongelado(null); };
    // mientras no esté fijado con 📌, salir del panel lo suelta
    const salirPanel = () => { if (!fijado) setCongelado(null); };
    // si el detalle llega después de congelar, se actualiza la instantánea
    useEffect(() => {
        if (congelado && predictDet && congelado.hoverData?.zone === hoverData?.zone) {
            setCongelado(c => c ? { ...c, predictDet } : c);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [predictDet]);

    // RESUMEN: dónde está lo que falta CONSTRUIR. Ordenado por soles pendientes,
    // no por código — el código te dice el orden del presupuesto, los soles te
    // dicen qué mover primero.
    //
    // Se mide contra lo ejecutado, no contra lo valorizado: una partida que ya
    // está hecha y aún no se paga no es trabajo pendiente, es plata por cobrar,
    // y mezclarlas mandaba a la cuadrilla a un frente que ya estaba terminado.
    // El backend publica avance_ref (el % más fino que existe: tramo, si no
    // partida, si no valorizado) y valor_tramo (lo que le toca a este tramo).
    const faltante = useMemo(() => {
        const ps = vista?.predictDet?.partidas;
        if (!ps?.length) return null;
        const total = ps.reduce((s, p) => s + (p.parcial || 0), 0);
        const filas = ps
            .map(p => {
                const base = p.valor_tramo != null ? p.valor_tramo : (p.parcial || 0);
                const pct = p.avance_ref != null ? p.avance_ref : (p.valorizado_pct ?? 0);
                return {
                    id: p.id,
                    nombre: (p.nombre || '').replace(/^[\d.]+\s*-\s*/, ''),
                    pct,
                    base: p.avance_base,
                    falta: base * (1 - pct / 100),
                };
            })
            .filter(f => f.falta > 1)
            .sort((a, b) => b.falta - a.falta);
        // TODAS las que faltan, no las 5 más caras. Lo que el gerente pregunta
        // parado frente al modelo es "¿qué falta aquí?", y una lista recortada a
        // cinco con un "resto (12 partidas)" no responde eso. La lista completa
        // cabe: son pocas por frente y el contenedor ya tiene scroll propio.
        const faltaTotal = filas.reduce((s, f) => s + f.falta, 0);
        return {
            total, faltaTotal, top: filas, restoMonto: 0, restoN: 0,
            maxFalta: filas.length ? filas[0].falta : 1,
        };
    }, [vista?.predictDet]);
    const [verTodas, setVerTodas] = useState(false);
    // qué etapa del expediente se está viendo. Arranca en ejecución porque es
    // lo que se pregunta parado frente al modelo.
    const [etapa, setEtapa] = useState('ejecucion');

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

    // Agrupación: mismo aviso que SubZonas, diciendo qué parámetro falta cuando
    // falta. La capa se apaga y lo dice en vez de agrupar por otra cosa.
    useEffect(() => {
        const onGroupResult = (e) => {
            const d = e?.detail || {};
            if (d.reason === 'ok') {
                setGroupCount(d.zones || 0);
                setToast({ ok: true, text: `${d.zones} grupo${d.zones === 1 ? '' : 's'} por Localizador` });
            } else {
                setGroupOn(false);
                setGroupCount(0);
                const txt = d.reason === 'sin-parametro' && d.faltan
                    ? `Falta el parámetro ${d.faltan} en el modelo: no se puede agrupar.`
                    : (REASON_TEXT[d.reason] || 'No se pudo agrupar por Localizador.');
                setToast({ ok: false, text: txt });
            }
            if (toastTimer.current) clearTimeout(toastTimer.current);
            toastTimer.current = setTimeout(() => setToast(null), 5000);
        };
        window.addEventListener('lob-group-labels-result', onGroupResult);
        return () => window.removeEventListener('lob-group-labels-result', onGroupResult);
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
        // Excluyentes: comparten los mismos rótulos (ver setZoneLabelsVisible).
        if (next && groupOn) setGroupOn(false);
        window.dispatchEvent(new CustomEvent('lob-zone-labels', { detail: { visible: next } }));
    };
    // Capa Agrupación: el mismo rótulo flotante que SubZonas, pero agrupando por
    // Localizador (el campo con el que ya agrupa Ejecución).
    const toggleGroup = () => {
        const next = !groupOn;
        setGroupOn(next);
        if (next && zonesOn) setZonesOn(false);
        window.dispatchEvent(new CustomEvent('lob-group-labels', { detail: { visible: next } }));
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

    // Dos conjuntos que se cruzan: el grupo es la intersección, que es justo lo
    // que hace esta capa (coincidir en SubZona Y en Ubicación).
    const GroupPairIcon = () => (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="9" cy="12" r="6" /><circle cx="15" cy="12" r="6" />
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

                {/* Capa Agrupación — botón propio al costado de Capas, no dentro de
                    la lista, porque es una vista de contraste de metrados y no una
                    capa más del modelo. Reutiliza ENTERO el mecanismo de SubZonas
                    (rótulo flotante, línea guía, aislar al pulsar); lo único que
                    cambia es la clave: el PAR (SubZona + Ubicación). */}
                <button
                    type="button"
                    onClick={toggleGroup}
                    title="Agrupar por Localizador (01_02_DSI_Localizador), el mismo campo con el que agrupa la capa Ejecución."
                    style={{
                        position: 'absolute', left: '100%', marginLeft: 10, top: 0,
                        display: 'inline-flex', alignItems: 'center', gap: 7, height: 26,
                        background: groupOn ? 'rgba(67,179,204,0.20)' : 'transparent',
                        border: `1px solid ${groupOn ? '#43b3cc' : 'rgba(255,255,255,0.22)'}`,
                        color: groupOn ? '#9fe4f2' : '#d8d8d8',
                        borderRadius: 6, padding: '0 11px', fontSize: 12, fontWeight: 700,
                        cursor: 'pointer', whiteSpace: 'nowrap',
                    }}
                >
                    <GroupPairIcon />
                    Agrupación
                    {groupOn && groupCount > 0 && (
                        <span style={{ background: '#43b3cc', color: '#08222a', borderRadius: 8, fontSize: 9.5, fontWeight: 800, padding: '1px 6px', lineHeight: 1.3 }}>{groupCount}</span>
                    )}
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
            {hoverOn && vista && (
                <div
                    onMouseEnter={congelar}
                    onMouseLeave={salirPanel}
                    style={{
                    position: 'fixed', right: 18, bottom: 58, zIndex: 55, width: 340,
                    // crece hacia arriba SOLO lo que necesite, sin pasarse de pantalla
                    maxHeight: 'calc(100vh - 130px)', display: 'flex', flexDirection: 'column',
                    background: 'rgba(13,17,23,0.82)', backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(251,191,36,0.42)', borderRadius: 10,
                    padding: '13px 15px', color: '#e6edf5',
                    boxShadow: '0 8px 30px rgba(0,0,0,.45)',
                    // 'auto' para poder desplazar la lista con la rueda cuando
                    // el grupo tiene muchas partidas (PAISAJISMO tiene 58)
                    pointerEvents: 'auto',
                    animation: 'fadeIn .12s ease-out',
                }}>
                    {/* Encabezado con el control para FIJAR el panel */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: '#fcd34d', letterSpacing: '.3px',
                                       flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {vista.hoverData.zone}
                        </span>
                        <button type="button" title={fijado ? 'Soltar' : 'Fijar el panel'}
                            onClick={() => { if (fijado) soltar(); else { congelar(); setFijado(true); } }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12,
                                     opacity: fijado ? 1 : 0.45, padding: 0, lineHeight: 1 }}>📌</button>
                        {fijado && (
                            <button type="button" title="Cerrar" onClick={soltar}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15,
                                         color: '#6b7684', padding: 0, lineHeight: 1 }}>×</button>
                        )}
                    </div>

                    {/* MODELO — piezas de geometría. Rotulado expreso para que no
                        se confunda con el avance del contrato (son cosas distintas). */}
                    <div style={{ fontSize: 10, color: '#7c8798', marginTop: 9 }}>
                        Modelo · <span style={{ color: '#9aa4b2' }}>{vista.hoverData.total} elementos</span>
                        {vista.hoverData.hasEjecutado && (
                            <span style={{ color: '#9aa4b2' }}> · {vista.hoverData.done} marcados ({vista.hoverData.pct}%)</span>
                        )}
                    </div>

                    {/* EXPEDIENTE (PREDICT) — el contrato detrás del objeto.
                        Se separa del bloque de arriba a propósito: "elementos"
                        es geometría del modelo, "partidas" son líneas del
                        presupuesto. Juntarlos confundiría dos conteos distintos. */}
                    {vista.predict && (
                        <div style={{ marginTop: 11, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,.10)',
                                      minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                            {/* El rótulo nombra la CALLE, no dice "expediente" a
                                secas: sin eso el 75.84% de la calle y el 0% del
                                tramo se leen como si midieran lo mismo. */}
                            <div style={{ fontSize: 9, letterSpacing: '.14em', color: '#7c8798',
                                          textTransform: 'uppercase', overflow: 'hidden',
                                          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                 title={vista.predict.calle || 'Expediente'}>
                                {vista.predict.calle
                                    ? `${vista.predict.calle_id} · ${vista.predict.calle}`
                                    : 'Expediente'}
                            </div>

                            {/* LAS TRES ETAPAS DEL EXPEDIENTE. Son pestañas y no
                                secciones apiladas a propósito: el hover es un
                                vistazo, no un legajo. Se ve una a la vez.
                                El cierre contractual está deshabilitado mientras
                                no haya as-built ni adicionales tramitados — un
                                botón que abre una pantalla vacía miente. */}
                            <div style={{ display: 'flex', gap: 3, marginTop: 8 }}>
                                {[
                                    { k: 'contractual', t: 'Contractual', c: '#9aa4b2', on: true },
                                    { k: 'ejecucion', t: 'Ejecución', c: '#fbbf24', on: true },
                                    { k: 'cierre', t: 'Cierre', c: '#7fc4d6', on: false },
                                ].map(b => (
                                    <button key={b.k} type="button" disabled={!b.on}
                                        onClick={() => b.on && setEtapa(b.k)}
                                        title={b.on ? '' : 'sin as-built ni adicionales cargados todavía'}
                                        style={{
                                            flex: 1, padding: '5px 4px', fontSize: 9.5, cursor: b.on ? 'pointer' : 'not-allowed',
                                            border: 'none', borderRadius: 5, letterSpacing: '.06em',
                                            textTransform: 'uppercase', fontWeight: 700,
                                            background: etapa === b.k ? 'rgba(255,255,255,.10)' : 'transparent',
                                            color: !b.on ? '#4d5560' : (etapa === b.k ? b.c : '#7c8798'),
                                            opacity: b.on ? 1 : .5,
                                        }}>
                                        {b.t}
                                    </button>
                                ))}
                            </div>
                            {/* CONTRACTUAL — lo que se pactó. Va aparte de la
                                ejecución porque son dos conversaciones distintas:
                                una con el expediente y otra con la obra. */}
                            {etapa === 'contractual' && (
                                <div style={{ marginTop: 10 }}>
                                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                        <div>
                                            <div style={{ fontSize: 9, letterSpacing: '.12em', color: '#7c8798', textTransform: 'uppercase' }}>Partidas</div>
                                            <div style={{ fontSize: 17, fontWeight: 800, color: '#e6edf5', fontVariantNumeric: 'tabular-nums' }}>
                                                {vista.predict.partidas}
                                            </div>
                                        </div>
                                        {vista.predict.valor_tramo != null && (
                                            <div>
                                                <div style={{ fontSize: 9, letterSpacing: '.12em', color: '#7c8798', textTransform: 'uppercase' }}>Le toca a este tramo</div>
                                                <div style={{ fontSize: 17, fontWeight: 800, color: '#e6edf5', fontVariantNumeric: 'tabular-nums' }}>
                                                    {soles(vista.predict.valor_tramo)}
                                                </div>
                                            </div>
                                        )}
                                        {vista.predict.compartidas > 0 && (
                                            <div>
                                                <div style={{ fontSize: 9, letterSpacing: '.12em', color: '#7c8798', textTransform: 'uppercase' }}>Compartidas</div>
                                                <div style={{ fontSize: 17, fontWeight: 800, color: '#8fa0b3', fontVariantNumeric: 'tabular-nums' }}>
                                                    {vista.predict.compartidas}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div style={{ marginTop: 10, fontSize: 10.5, color: '#8fa0b3', lineHeight: 1.5 }}>
                                        Los planos y las especificaciones de este tramo aún no están
                                        cargados en el grafo. El detalle por partida —precio unitario,
                                        cuadrilla del ACU, normas citadas— está en PREDICT.
                                    </div>
                                </div>
                            )}

                            {etapa === 'ejecucion' && <>
                            {/* EL METRADO CAMBIÓ — primero, porque cambia el alcance
                                y sin eso los porcentajes de abajo se leen sobre una
                                base equivocada. Sale del replanteo del RIBA y se
                                cuenta en PARTIDAS: sumar m con m3 con kg no significa
                                nada. Verde arriba del contrato, rojo por debajo. */}
                            {(vista.predict.n_mayor > 0 || vista.predict.n_menor > 0) && (
                                <div style={{ display: 'flex', gap: 14, marginTop: 8, alignItems: 'baseline' }}>
                                    <span style={{ fontSize: 9, letterSpacing: '.14em', color: '#7c8798', textTransform: 'uppercase' }}>
                                        Metrado
                                    </span>
                                    {vista.predict.n_mayor > 0 && (
                                        <span style={{ fontSize: 11, color: '#7dd3a8', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                                              title="partidas donde el replanteo midió MÁS que el contrato — va a adicional">
                                            ▲ {vista.predict.n_mayor} mayor
                                        </span>
                                    )}
                                    {vista.predict.n_menor > 0 && (
                                        <span style={{ fontSize: 11, color: '#e0776a', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
                                              title="partidas donde el replanteo midió MENOS que el contrato — es deductivo, no se cobra">
                                            ▼ {vista.predict.n_menor} menor
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* UNA SOLA BARRA, DOS TRAMOS. Antes había dos porcentajes
                                compitiendo y el ejecutado ya incluía al valorizado, así
                                que había que restar de cabeza. Aquí lo pagado y lo
                                construido-sin-pagar se apilan: lo segundo es lo que se
                                reclama, y se lee sin hacer ninguna cuenta. */}
                            {(() => {
                                const pag = vista.predict.valorizado_comp_pct ?? vista.predict.valorizado_pct;
                                const con = vista.predict.ejecutado_pct;
                                if (pag == null) return null;
                                const conC = con == null ? null : Math.min(100, con);
                                const sinPagar = conC == null ? 0 : Math.max(0, conC - pag);
                                return (
                                    <div style={{ marginTop: 9 }}>
                                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: 21, fontWeight: 800, color: '#7dd3a8', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                                                {pag.toFixed(1)}%
                                            </span>
                                            <span style={{ fontSize: 10, color: '#9aa4b2' }}>valorizado</span>
                                            {sinPagar > 0.05 && (
                                                <>
                                                    <span style={{ fontSize: 15, fontWeight: 800, color: '#fbbf24', lineHeight: 1, marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>
                                                        +{sinPagar.toFixed(1)}%
                                                    </span>
                                                    <span style={{ fontSize: 10, color: '#9aa4b2' }}>ejecutado sin valorizar</span>
                                                </>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', height: 7, background: 'rgba(255,255,255,.09)', borderRadius: 3, marginTop: 7, overflow: 'hidden' }}>
                                            <div style={{ width: `${pag}%`, background: '#3f9e73' }} />
                                            <div style={{ width: `${sinPagar}%`, background: '#c2963c' }} />
                                        </div>
                                        {con > 100.5 && (
                                            <div style={{ marginTop: 5, fontSize: 9.5, color: '#7dd3a8' }}>
                                                ▲ además hay mayor metrado: se ejecutó por encima del contrato
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* EL CONTEO SALE DE LO CONSTRUIDO — es lo que se ve
                                parado en la obra. Entre paréntesis, lo mismo por
                                lo pagado: la diferencia es lo que hay que cobrar. */}
                            {vista.predict.lista != null && (
                                <div style={{ display: 'flex', gap: 14, marginTop: 11, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                    {[
                                        { n: vista.predict.lista, t: 'listas', c: '#7dd3a8' },
                                        { n: vista.predict.proceso, t: 'en proceso', c: '#fbbf24' },
                                        { n: vista.predict.falta, t: 'faltan', c: '#6b7684' },
                                    ].map(k => (
                                        <div key={k.t} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                                            <span style={{ fontSize: 17, fontWeight: 800, color: k.c, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                                                {k.n}
                                            </span>
                                            <span style={{ fontSize: 9.5, color: '#7c8798', letterSpacing: '.05em' }}>{k.t}</span>
                                        </div>
                                    ))}
                                    {/* cuánto del frente respalda la comparación de
                                        arriba: por debajo del 90% el par de
                                        porcentajes descansa en datos incompletos
                                        y el lector tiene derecho a saberlo */}
                                    <span style={{ marginLeft: 'auto', fontSize: 9.5, color: '#6b7684', fontVariantNumeric: 'tabular-nums' }}
                                          title={vista.predict.cobertura_comp_pct != null
                                              ? `los dos % se comparan sobre el ${vista.predict.cobertura_comp_pct}% del frente que tiene dato de campo`
                                              : ''}>
                                        construidas · {vista.predict.partidas} partidas
                                        {vista.predict.cobertura_comp_pct != null
                                          && vista.predict.cobertura_comp_pct < 99.5
                                          && <span style={{ color: '#8a6a2f' }}> · {vista.predict.cobertura_comp_pct}% con dato</span>}
                                    </span>
                                </div>
                            )}

                            {/* ESTE TRAMO — el número que de verdad le pertenece.
                                Su metrado por su precio, medido por el cronograma
                                tramo por tramo. Va aparte y con su propio marco
                                porque NO es comparable con el % de arriba: aquél
                                es la calle entera, éste es el pedazo que estás
                                señalando con el mouse. */}
                            {vista.predict.valor_tramo != null && (
                                <div style={{
                                    marginTop: 11, padding: '9px 11px', borderRadius: 6,
                                    background: 'rgba(45,143,165,0.10)',
                                    border: '1px solid rgba(45,143,165,0.30)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                                        <span style={{ fontSize: 9, letterSpacing: '.16em', color: '#7fc4d6', textTransform: 'uppercase', fontWeight: 700 }}>
                                            Este tramo
                                        </span>
                                        <span style={{ marginLeft: 'auto', fontSize: 10, color: '#8fa0b3', fontVariantNumeric: 'tabular-nums' }}>
                                            {vista.predict.con_tramo} de {vista.predict.partidas} partidas
                                        </span>
                                    </div>
                                    {/* Sin porcentaje: los dos de arriba ya responden
                                        "¿cuánto se hizo?". Repetirlo aquí sobre otro
                                        subconjunto daba tres cifras parecidas y ninguna
                                        clara. Lo que solo este bloque sabe es la PLATA
                                        que le toca al tramo, y eso es lo que muestra. */}
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 7 }}>
                                        <span style={{ fontSize: 20, fontWeight: 800, lineHeight: 1, color: '#b6c2d0', fontVariantNumeric: 'tabular-nums' }}>
                                            {soles(vista.predict.valor_tramo)}
                                        </span>
                                        <span style={{ fontSize: 10, color: '#9aa4b2' }}>le toca a este tramo</span>
                                    </div>
                                    <div style={{ height: 4, background: 'rgba(255,255,255,.09)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                                        <div style={{ width: `${Math.min(100, vista.predict.ejecutado_tramo_pct || 0)}%`, height: '100%', background: '#2d8fa5' }} />
                                    </div>
                                    {vista.predict.falta_tramo_soles > 1 && (
                                        <div style={{ marginTop: 6, fontSize: 10.5, color: '#8fa0b3' }}>
                                            falta <span style={{ color: '#fbbf24', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                                                {soles(vista.predict.falta_tramo_soles)}</span> por construir aquí
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* FALTA — el número accionable. "67%" no dice qué hacer;
                                "faltan S/ 315,601" sí. */}
                            {faltante && faltante.faltaTotal > 1 && (
                                <div style={{ marginTop: 11, display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <span style={{ fontSize: 9, letterSpacing: '.16em', color: '#7c8798', textTransform: 'uppercase' }}>
                                        Falta construir
                                    </span>
                                    <span style={{ fontSize: 15, fontWeight: 800, color: '#fbbf24', fontVariantNumeric: 'tabular-nums' }}>
                                        {soles(faltante.faltaTotal)}
                                    </span>
                                    <span style={{ marginLeft: 'auto', fontSize: 9.5, color: '#7c8798', fontVariantNumeric: 'tabular-nums' }}>
                                        {faltante.top.length} {faltante.top.length === 1 ? 'partida' : 'partidas'}
                                    </span>
                                </div>
                            )}

                            {/* DÓNDE ESTÁ LO QUE FALTA — ordenado por soles pendientes,
                                no por código: lo gordo primero, el resto agrupado. */}
                            {faltante && faltante.top.length > 0 && !verTodas && (
                                <div style={{ marginTop: 8, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
                                    {faltante.top.map(f => (
                                        <div key={f.id} style={{ marginTop: 6 }}>
                                            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 10 }}>
                                                <span style={{ color: '#b6c2d0', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {f.nombre}
                                                </span>
                                                <span style={{ color: '#8fa0b3', flex: 'none', fontVariantNumeric: 'tabular-nums' }}>{f.pct.toFixed(0)}%</span>
                                                <span style={{ color: '#e6edf5', flex: 'none', fontVariantNumeric: 'tabular-nums', minWidth: 62, textAlign: 'right' }}>
                                                    {soles(f.falta)}
                                                </span>
                                            </div>
                                            <div style={{ height: 3, background: 'rgba(255,255,255,.07)', borderRadius: 2, marginTop: 3 }}>
                                                <div style={{ width: `${(f.falta / faltante.maxFalta) * 100}%`, height: '100%', background: '#c2963c', borderRadius: 2 }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* La lista completa, solo cuando la pidas */}
                            {vista.predictDet?.grupos?.length > 0 && (
                                <button type="button" onClick={() => setVerTodas(v => !v)}
                                    style={{ marginTop: 9, alignSelf: 'flex-start', background: 'none', border: 'none',
                                             color: '#8fa0b3', fontSize: 9.5, cursor: 'pointer', padding: 0,
                                             letterSpacing: '.1em', textTransform: 'uppercase' }}>
                                    {verTodas ? '▾ ver resumen' : `▸ ver las ${vista.predict.partidas} partidas`}
                                </button>
                            )}

                            {verTodas && vista.predictDet?.grupos?.length > 0 && (
                                <div style={{
                                    marginTop: 6, overflowY: 'auto', overscrollBehavior: 'contain',
                                    minHeight: 0, flex: '1 1 auto', paddingRight: 4,
                                }}>
                                    {vista.predictDet.grupos.map((g) => (
                                        <div key={g.nodo} style={{ marginTop: 7 }}>
                                            <div style={{ fontSize: 9, color: '#7c8798', letterSpacing: '.06em', textTransform: 'uppercase' }}>
                                                {(g.nombre || g.nodo).replace(/^[\d.]+\s*-\s*/, '')} · {g.partidas.length}
                                            </div>
                                            {g.partidas.map((p) => (
                                                <div key={p.id} style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 9.5, marginTop: 1.5 }}>
                                                    <span style={{ color: '#8fa0b3', fontVariantNumeric: 'tabular-nums', flex: 'none' }}>{p.id}</span>
                                                    <span style={{ color: '#b6c2d0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {(p.nombre || '').replace(/^[\d.]+\s*-\s*/, '')}
                                                    </span>
                                                    {/* el metrado cambió respecto al contrato: verde
                                                        arriba, rojo abajo. Sale del replanteo del RIBA. */}
                                                    {p.metrado_replanteo != null && p.metrado > 0 && (
                                                        p.metrado_replanteo > p.metrado * 1.001 ? (
                                                            <span style={{ flex: 'none', color: '#7dd3a8', fontSize: 9 }}
                                                                  title={`replanteo ${p.metrado_replanteo} vs contrato ${p.metrado} ${p.unidad || ''} — mayor metrado`}>▲</span>
                                                        ) : p.metrado_replanteo < p.metrado * 0.999 ? (
                                                            <span style={{ flex: 'none', color: '#e0776a', fontSize: 9 }}
                                                                  title={`replanteo ${p.metrado_replanteo} vs contrato ${p.metrado} ${p.unidad || ''} — menor metrado`}>▼</span>
                                                        ) : null
                                                    )}
                                                    <span style={{
                                                        marginLeft: 'auto', flex: 'none', fontVariantNumeric: 'tabular-nums',
                                                        color: (p.avance_ref ?? p.valorizado_pct) >= 99.5 ? '#7dd3a8'
                                                             : ((p.avance_ref ?? p.valorizado_pct) > 0 ? '#fbbf24' : '#6b7684'),
                                                    }}>{(p.avance_ref ?? p.valorizado_pct ?? 0).toFixed(0)}%</span>
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            )}
                            </>}
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
