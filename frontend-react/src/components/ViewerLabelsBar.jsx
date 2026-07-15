import React, { useEffect, useRef, useState } from 'react';
import { ProfileIcon, ZoneTagIcon, ExcavationIcon } from './TandemIcons';

// Barra inferior compacta (estilo Tandem "Ab / Labels") para marcar/desmarcar
// capas del visor SIN distorsionar el layout: flota sobre el canvas, no ocupa
// espacio. Hoy controla: Perfil longitudinal y Rótulos de SubZona.
const REASON_TEXT = {
    'sin-inventario': 'Inventario aún no cargado — espera unos segundos y reintenta.',
    'sin-parametro': 'No se encontró el parámetro SubZona/Zona en el inventario.',
    'parametro-vacio': 'El parámetro de SubZona existe pero está vacío en los elementos.',
    'sin-geometria': 'Hay SubZonas pero no cruzaron con geometría del visor (revisar mapeo).',
};

export default function ViewerLabelsBar() {
    const [profileOn, setProfileOn] = useState(false);
    const [zonesOn, setZonesOn] = useState(false);
    const [excavOn, setExcavOn] = useState(false);
    const [toast, setToast] = useState(null);
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
