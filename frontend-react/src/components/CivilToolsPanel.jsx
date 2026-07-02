import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './SourceFilesPanel.css';
import { apiFetch } from '../utils/apiFetch';
import SectionViewer from './SectionViewer';

const { VITE_API_URL } = import.meta.env;
const BACKEND_URL = VITE_API_URL || (
    typeof window !== 'undefined' && window.location.hostname === 'localhost'
        ? 'http://localhost:3000'
        : 'https://visor-ecd-backend.onrender.com'
);

const getCivilSession = () => {
    if (typeof window === 'undefined') return { records: {}, lastKey: null };
    if (!window.__civilToolsSession) {
        window.__civilToolsSession = { records: {}, lastKey: null };
    }
    return window.__civilToolsSession;
};

const getCacheKey = (urn, fallback = 'global') => String(urn || fallback || 'global');

const getInitialCache = () => {
    const session = getCivilSession();
    const key = session.lastKey;
    return key && session.records[key] ? session.records[key] : {};
};

const formatStation = (stationMeters) => {
    if (stationMeters == null || Number.isNaN(Number(stationMeters))) return '0+000.00';
    const value = Number(stationMeters);
    const km = Math.floor(Math.abs(value) / 1000);
    const m = Math.abs(value) % 1000;
    const sign = value < 0 ? '-' : '';
    return `${sign}${km}+${m.toFixed(2).padStart(6, '0')}`;
};

const parseStation = (str) => {
    const raw = String(str || '').trim();
    const parts = raw.split('+');
    if (parts.length === 2) {
        const km = parseFloat(parts[0]) || 0;
        const m = parseFloat(parts[1]) || 0;
        return (km >= 0 ? 1 : -1) * (Math.abs(km) * 1000 + m);
    }
    return parseFloat(raw) || 0;
};

const getProfileText = (profile) => `${profile?.name || ''} ${profile?.type || ''}`.toLowerCase();

const isSurfaceProfile = (profile) => {
    const text = getProfileText(profile);
    return text.includes('surface') ||
        text.includes('superficie') ||
        text.includes('existing') ||
        text.includes('terreno') ||
        text.includes('natural') ||
        /\beg\b/.test(text);
};

const isDesignProfile = (profile) => {
    const text = getProfileText(profile);
    return text.includes('design') ||
        text.includes('layout') ||
        text.includes('rasante') ||
        text.includes('finished') ||
        text.includes('proposed') ||
        text.includes('fondo') ||
        text.includes('clave') ||
        /\bfg\b/.test(text);
};

const normalizeSearchText = (value) => String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const getSearchTokens = (value) => normalizeSearchText(value).match(/[a-z0-9]+/g) || [];

const getAlignmentTokens = (alignment) => {
    const rawTokens = getSearchTokens(alignment?.alignmentId || alignment?.name || '');
    const generic = new Set(['alignment', 'alineamiento', 'eje', 'col', 'calle', 'colector', 'principal']);
    return rawTokens.filter(token => token.length >= 2 && !generic.has(token));
};

const getAlignmentKeys = (alignment) => {
    const tokens = getAlignmentTokens(alignment);
    const keys = new Set(tokens);

    if (tokens.length > 1) {
        keys.add(tokens.map(token => token[0]).join(''));
        keys.add(tokens.join(''));
    }

    return Array.from(keys).filter(key => key.length >= 2);
};

const getProfileScore = (profile, alignment) => {
    const text = getProfileText(profile);
    if (isSurfaceProfile(profile)) return -1000;

    let score = 0;
    const profileTokens = new Set(getSearchTokens(`${profile?.name || ''} ${profile?.type || ''}`));
    const profileFlat = getSearchTokens(profile?.name || '').join('');
    const alignmentKeys = getAlignmentKeys(alignment);

    for (const key of alignmentKeys) {
        if (profileTokens.has(key)) score += key.length <= 3 ? 170 : 90;
        else if (profileFlat.includes(key)) score += key.length <= 3 ? 120 : 60;
    }

    if (text.includes('layout') || text.includes('design') || /\bfg\b/.test(text)) score += 100;
    if (text.includes('rasante') || text.includes('finished') || text.includes('proposed')) score += 80;
    if (text.includes('metrado') || text.includes('pn-csi')) score += 30;
    if (text.includes('fondo') || text.includes('clave')) score += 20;

    const alignmentText = normalizeSearchText(alignment?.alignmentId || alignment?.name || '');
    if (alignmentText.includes('colector') || alignmentText.includes('tuberia')) {
        if (text.includes('fondo') || text.includes('clave') || text.includes('invert') || alignmentKeys.some(key => profileFlat.includes(key))) {
            score += 80;
        }
        if (text.includes('rasante') && !alignmentKeys.some(key => profileFlat.includes(key))) {
            score -= 70;
        }
    }

    return score;
};

const getPrimaryProfile = (alignment) => {
    const profiles = alignment?.profiles || [];
    if (!profiles.length) return null;
    return profiles
        .map((profile, index) => ({ profile, index, score: getProfileScore(profile, alignment) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.profile || null;
};

const getVisibleProfiles = (alignment) => {
    const profiles = alignment?.profiles || [];
    return profiles
        .filter(profile => !isSurfaceProfile(profile))
        .map((profile, index) => ({ profile, index, score: getProfileScore(profile, alignment) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(item => item.profile);
};

const getDefaultProfileName = (alignment) => getPrimaryProfile(alignment)?.name || '';

const resolveProfileName = (alignment, requestedName) => {
    const requested = (alignment?.profiles || []).find(profile => profile.name === requestedName);
    if (requested && !isSurfaceProfile(requested)) return requested.name;
    return getDefaultProfileName(alignment);
};

const normalizeAlignments = (items = []) => (
    Array.isArray(items)
        ? items.map(alignment => ({
            ...alignment,
            activeProfileName: resolveProfileName(alignment, alignment.activeProfileName)
        }))
        : []
);

const countVisibleProfiles = (alignments = []) =>
    alignments.reduce((total, alignment) => total + getVisibleProfiles(alignment).length, 0);

const getProfileRole = (profile) => {
    if (!profile) return '';
    if (isSurfaceProfile(profile)) return 'EG';
    return profile.type || 'Perfil';
};

const formatValue = (value, suffix = ' m') => (
    Number.isFinite(Number(value)) ? `${Number(value).toFixed(2)}${suffix}` : '-'
);

const RoadIconSmall = ({ muted = false }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={muted ? '#8b949e' : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 21c2.6-5.2 4-11.5 4.4-18" />
        <path d="M15.2 22c.6-5.8 2.2-11.3 4.8-16.5" />
        <path d="m12.2 6.7 1.2 1.1" />
        <path d="m12.6 11.2 1.3 1.1" />
        <path d="m13.5 16 1.4 1" />
    </svg>
);

const ProfileIcon = ({ muted = false }) => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={muted ? '#8b949e' : 'currentColor'} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17h18" />
        <path d="M5 15c3-7 6-7 9-2 2 3.2 3.8 3.4 5 1" />
        <circle cx="5" cy="15" r="1.2" />
        <circle cx="14" cy="13" r="1.2" />
        <circle cx="19" cy="14" r="1.2" />
    </svg>
);

const SearchIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="11" cy="11" r="7" />
        <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </svg>
);

const DownloadIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7 10 12 15 17 10" />
        <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
);

const CloseIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
);

const Chevron = ({ open = true }) => (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polyline points={open ? '6 9 12 15 18 9' : '9 18 15 12 9 6'} />
    </svg>
);

const PropertyRow = ({ label, value }) => (
    <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        minHeight: 38,
        padding: '0 12px 0 28px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        fontSize: 12
    }}>
        <span style={{ color: '#cfd6df', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ color: '#f3f4f6', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
);

const Section = ({ title, children, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <button
                type="button"
                onClick={() => setOpen(prev => !prev)}
                style={{
                    width: '100%',
                    border: 0,
                    background: 'rgba(255,255,255,0.05)',
                    color: '#f0f0f0',
                    minHeight: 32,
                    padding: '0 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                    textAlign: 'left'
                }}
            >
                <Chevron open={open} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
            </button>
            {open && children}
        </div>
    );
};

const controlStyle = {
    background: '#12151a',
    border: '1px solid rgba(255,255,255,0.16)',
    color: '#e5e7eb',
    borderRadius: 4,
    outline: 'none'
};

const navButtonStyle = {
    border: 0,
    background: 'transparent',
    color: '#9ca3af',
    width: 26,
    height: 30,
    cursor: 'pointer',
    fontSize: 15
};

const CivilToolsPanel = ({ activeModelUrn, models = [], onClose }) => {
    const initialCache = useMemo(getInitialCache, []);
    const [alignmentData, setAlignmentData] = useState(() => initialCache.alignmentData || []);
    const [selectedAlignmentId, setSelectedAlignmentId] = useState(initialCache.selectedAlignmentId || '');
    const [activeAlignmentIds, setActiveAlignmentIds] = useState(initialCache.activeAlignmentIds || (initialCache.selectedAlignmentId ? [initialCache.selectedAlignmentId] : []));
    const [selectedProfileName, setSelectedProfileName] = useState(initialCache.selectedProfileName || '');
    const [selectedDwgUrn, setSelectedDwgUrn] = useState(initialCache.selectedDwgUrn || '');
    const [isExtracting, setIsExtracting] = useState(false);
    const [extractProgress, setExtractProgress] = useState(initialCache.extractProgress || 0);
    const [extractMessage, setExtractMessage] = useState(initialCache.extractMessage || '');
    const [extractError, setExtractError] = useState('');
    const [extractReportUrl, setExtractReportUrl] = useState(initialCache.extractReportUrl || '');
    const [contextData, setContextData] = useState(initialCache.contextData || null);
    const [stationInput, setStationInput] = useState(initialCache.stationInput || '0+000.00');
    const [searchOpen, setSearchOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [stationLabelsVisible, setStationLabelsVisible] = useState(initialCache.stationLabelsVisible ?? true);
    
    const [pollingInterval, setPollingInterval] = useState(null);
    const [sectionJSON, setSectionJSON] = useState(null);
    const [sectionIndex, setSectionIndex] = useState(0);
    const [showSectionViewer, setShowSectionViewer] = useState(false);
    const [isExtractingSections, setIsExtractingSections] = useState(false);
    const [sectionProgress, setSectionProgress] = useState(0);
    const [sectionMessage, setSectionMessage] = useState('');
    const extensionRef = useRef(null);
    const pollTimeoutRef = useRef(null);
    const restoredKeyRef = useRef(null);
    const initialReplayRef = useRef(false);

    const dwgModelsList = useMemo(
        () => models.filter(m => m.name && m.name.toLowerCase().includes('.dwg')),
        [models]
    );

    const activeCacheKey = useMemo(
        () => getCacheKey(selectedDwgUrn || activeModelUrn, activeModelUrn),
        [selectedDwgUrn, activeModelUrn]
    );

    const selectedAlignment = useMemo(
        () => alignmentData.find(a => a.alignmentId === selectedAlignmentId) || null,
        [alignmentData, selectedAlignmentId]
    );

    const selectedProfile = useMemo(() => {
        if (!selectedAlignment) return null;
        const profile = (selectedAlignment.profiles || []).find(item => item.name === selectedProfileName);
        return profile && !isSurfaceProfile(profile) ? profile : getPrimaryProfile(selectedAlignment);
    }, [selectedAlignment, selectedProfileName]);

    const alignmentTree = useMemo(() => {
        const q = query.trim().toLowerCase();
        return alignmentData
            .map(alignment => {
                const profiles = getVisibleProfiles(alignment);
                const profileMatches = q
                    ? profiles.filter(profile =>
                        String(profile.name || '').toLowerCase().includes(q) ||
                        String(profile.type || '').toLowerCase().includes(q)
                    )
                    : profiles;
                const alignmentMatches = !q || String(alignment.alignmentId || '').toLowerCase().includes(q);
                return {
                    alignment,
                    profiles: alignmentMatches ? profiles : profileMatches,
                    visible: alignmentMatches || profileMatches.length > 0
                };
            })
            .filter(item => item.visible);
    }, [alignmentData, query]);

    const stationRange = useMemo(() => {
        const start = Number(selectedAlignment?.startStation || 0);
        const end = Number(selectedAlignment?.endStation || selectedAlignment?.length || start);
        return {
            min: Math.min(start, end),
            max: Math.max(start, end)
        };
    }, [selectedAlignment]);

    const stationValue = useMemo(() => {
        const raw = contextData?.station ?? parseStation(stationInput);
        if (!selectedAlignment) return raw;
        return Math.max(stationRange.min, Math.min(stationRange.max, Number(raw) || stationRange.min));
    }, [contextData, selectedAlignment, stationInput, stationRange.max, stationRange.min]);

    const persistCache = useCallback((patch = {}) => {
        const session = getCivilSession();
        const key = activeCacheKey;
        session.lastKey = key;
        session.records[key] = {
            ...(session.records[key] || {}),
            alignmentData,
            selectedAlignmentId,
            selectedProfileName,
            selectedDwgUrn,
            contextData,
            stationInput,
            stationLabelsVisible,
            extractProgress,
            extractMessage,
            extractReportUrl,
            ...patch,
            updatedAt: Date.now()
        };
    }, [
        activeCacheKey,
        alignmentData,
        contextData,
        extractMessage,
        extractProgress,
        extractReportUrl,
        selectedAlignmentId,
        selectedDwgUrn,
        selectedProfileName,
        stationInput,
        stationLabelsVisible
    ]);

    useEffect(() => {
        if (dwgModelsList.length > 0 && !selectedDwgUrn) {
            setSelectedDwgUrn(dwgModelsList[0].urn);
        }
    }, [dwgModelsList, selectedDwgUrn]);

    useEffect(() => {
        if (!activeCacheKey || restoredKeyRef.current === activeCacheKey) return;
        restoredKeyRef.current = activeCacheKey;

        const cached = getCivilSession().records[activeCacheKey];
        if (cached) {
            setAlignmentData(cached.alignmentData || []);
            setSelectedAlignmentId(cached.selectedAlignmentId || '');
            setSelectedProfileName(cached.selectedProfileName || '');
            setContextData(cached.contextData || null);
            setStationInput(cached.stationInput || '0+000.00');
            setStationLabelsVisible(cached.stationLabelsVisible ?? true);
            setExtractProgress(cached.extractProgress || 0);
            setExtractMessage(cached.extractMessage || '');
            setExtractReportUrl(cached.extractReportUrl || '');
            return;
        }

        setAlignmentData([]);
        setSelectedAlignmentId('');
        setSelectedProfileName('');
        setContextData(null);
        setStationInput('0+000.00');
        setStationLabelsVisible(true);
        setExtractProgress(0);
        setExtractMessage('');
        setExtractError('');
        setExtractReportUrl('');

        // PERSISTENCIA: sin caché de sesión, buscar la extracción GUARDADA en el
        // backend (la primera extracción es permanente; solo cambia al re-extraer).
        const persistUrn = selectedDwgUrn || activeModelUrn;
        if (!persistUrn) return;
        let alive = true;
        apiFetch(`${BACKEND_URL}/api/civil/alignments?urn=${encodeURIComponent(persistUrn)}`)
            .then((r) => r.json())
            .then((d) => {
                if (!alive || !d.found || !Array.isArray(d.data) || !d.data.length) return;
                const alignmentJSON = normalizeAlignments(d.data);
                setAlignmentData(alignmentJSON);
                setExtractMessage(`Extracción guardada: ${alignmentJSON.length} ejes (${(d.updated_at || '').slice(0, 10)})`);
                window.__lobCivilAlignments = alignmentJSON; // visible para 4D LOB
            })
            .catch(() => { /* sin persistencia aún */ });
        return () => { alive = false; };
    }, [activeCacheKey, selectedDwgUrn, activeModelUrn]);

    useEffect(() => {
        const handleContextChange = (e) => {
            const data = e.detail;
            setContextData(data);
            const formatted = formatStation(data.station);
            if (document.activeElement?.id !== 'civil-station-input') {
                setStationInput(formatted);
            }
            persistCache({ contextData: data, stationInput: formatted });
        };

        window.addEventListener('LOB4D_PK_CONTEXT_CHANGED', handleContextChange);
        return () => window.removeEventListener('LOB4D_PK_CONTEXT_CHANGED', handleContextChange);
    }, [persistCache]);

    useEffect(() => () => {
        if (pollTimeoutRef.current) {
            clearTimeout(pollTimeoutRef.current);
            pollTimeoutRef.current = null;
        }
    }, []);

    const getExtension = useCallback(async () => {
        const viewer = window.viewer;
        if (!viewer) return null;
        if (extensionRef.current) return extensionRef.current;

        let ext = viewer.getExtension('LOB4DExtension');
        if (!ext) {
            try {
                ext = await viewer.loadExtension('LOB4DExtension');
            } catch (err) {
                console.error('[CivilTools] Error loading LOB4DExtension:', err);
            }
        }
        extensionRef.current = ext || null;
        return extensionRef.current;
    }, []);

    const applyAlignment = useCallback(async (alignmentId, source = alignmentData, options = {}) => {
        const baseAlignment = source.find(a => a.alignmentId === alignmentId);
        if (!baseAlignment) return;

        const isToggle = options.toggle === true;
        let nextActiveIds = [...activeAlignmentIds];
        
        if (isToggle) {
            if (nextActiveIds.includes(alignmentId)) {
                nextActiveIds = nextActiveIds.filter(id => id !== alignmentId);
            } else {
                nextActiveIds.push(alignmentId);
            }
        } else {
            if (!nextActiveIds.includes(alignmentId)) {
                nextActiveIds.push(alignmentId);
            }
        }

        const profileName = resolveProfileName(
            baseAlignment,
            options.profileName ?? selectedProfileName ?? baseAlignment.activeProfileName
        );
        const nextStationLabelsVisible = options.stationLabelsVisible ?? true;
        const nextSource = source.map(item => item.alignmentId === alignmentId
            ? { ...item, activeProfileName: profileName }
            : item
        );
        const alignment = nextSource.find(a => a.alignmentId === alignmentId);
        const station = Number.isFinite(Number(options.station))
            ? Number(options.station)
            : Number(alignment.startStation || 0);

        setAlignmentData(nextSource);
        setActiveAlignmentIds(nextActiveIds);
        
        const nextSelected = isToggle ? (nextActiveIds.includes(selectedAlignmentId) ? selectedAlignmentId : nextActiveIds[0]) : alignmentId;
        setSelectedAlignmentId(nextSelected || '');
        setSelectedProfileName(profileName || '');
        setStationLabelsVisible(nextStationLabelsVisible);
        
        if (!isToggle && !options.keepOpen) {
            setSearchOpen(false);
        }
        setExtractError('');

        const ext = await getExtension();
        if (ext) {
            ext.setStationAnnotationsVisible?.(nextStationLabelsVisible);
            if (ext.bakeAlignment) {
                ext.bakeAlignment(nextSource, nextActiveIds);
            }
            if (nextActiveIds.length > 0) {
                ext.simulatePK(alignment, station);
            } else {
                ext.simulatePK(null, 0);
            }
        }

        const formatted = formatStation(station);
        setStationInput(formatted);
        persistCache({
            alignmentData: nextSource,
            activeAlignmentIds: nextActiveIds,
            selectedAlignmentId: nextSelected || '',
            selectedProfileName: profileName || '',
            stationInput: formatted,
            stationLabelsVisible: nextStationLabelsVisible
        });
    }, [alignmentData, activeAlignmentIds, selectedAlignmentId, selectedProfileName, getExtension, persistCache]);

    const toggleStationLabels = useCallback(() => {
        const next = !stationLabelsVisible;
        setStationLabelsVisible(next);
        persistCache({ stationLabelsVisible: next });
        getExtension().then(ext => {
            ext?.setStationAnnotationsVisible?.(next);
            if (next && selectedAlignment) {
                ext?.bakeAlignment?.(alignmentData, selectedAlignment.alignmentId);
                ext?.simulatePK?.(selectedAlignment, parseStation(stationInput));
            }
        });
    }, [alignmentData, getExtension, persistCache, selectedAlignment, stationInput, stationLabelsVisible]);

    useEffect(() => {
        if (initialReplayRef.current || !alignmentData.length || !selectedAlignmentId) return;
        initialReplayRef.current = true;
        applyAlignment(selectedAlignmentId, alignmentData, {
            profileName: selectedProfileName,
            station: parseStation(stationInput),
            stationLabelsVisible
        });
    }, [alignmentData, applyAlignment, selectedAlignmentId, selectedProfileName, stationInput, stationLabelsVisible]);

    const updateStation = useCallback((station) => {
        const safeStation = Number(station) || 0;
        const formatted = formatStation(safeStation);
        setStationInput(formatted);
        persistCache({ stationInput: formatted });
        getExtension().then(ext => {
            if (ext?.setStation) ext.setStation(safeStation);
        });
    }, [getExtension, persistCache]);

    // SECCIONES PERSISTENTES: al abrir (o cambiar de DWG), cargar la última
    // extracción guardada — disponible al instante tras recargar la página.
    useEffect(() => {
        const persistUrn = selectedDwgUrn || activeModelUrn;
        if (!persistUrn || sectionJSON) return undefined;
        let alive = true;
        apiFetch(`${BACKEND_URL}/api/civil/sections?urn=${encodeURIComponent(persistUrn)}`)
            .then((r) => r.json())
            .then((d) => {
                if (!alive || !d.found || !d.data) return;
                const count = Array.isArray(d.data) ? d.data.length : (d.data.stations?.length || 0);
                if (!count) return;
                setSectionJSON(d.data);
                setSectionProgress(100);
                setSectionMessage(`Secciones guardadas: ${count} estaciones · ${(d.updated_at || '').slice(0, 10)}`);
            })
            .catch(() => { /* sin persistencia aún */ });
        return () => { alive = false; };
    }, [selectedDwgUrn, activeModelUrn, sectionJSON]);

    // RETO: desde el visualizador 2D → volar la cámara del modelo a esa sección.
    const handleGoToSection = useCallback(async (alignName, station) => {
        const target = alignmentData.find((a) => a.alignmentId === alignName || a.name === alignName)
            || (selectedAlignment || alignmentData[0]);
        if (!target) {
            setSectionMessage('Extrae los alineamientos (Extraer) para poder ubicar la sección en el modelo.');
            return;
        }
        setShowSectionViewer(false);
        if (target.alignmentId !== selectedAlignmentId) {
            await applyAlignment(target.alignmentId, alignmentData, { station });
        }
        const ext = await getExtension();
        const ok = ext?.flyToStation?.(target, Number(station) || 0);
        if (ok) updateStation(Number(station) || 0);
        else setSectionMessage('La progresiva está fuera del eje extraído.');
    }, [alignmentData, selectedAlignment, selectedAlignmentId, applyAlignment, getExtension, updateStation]);

    const handleExtractCurves = async () => {
        let realUrn = selectedDwgUrn || activeModelUrn;
        let realProjectId = null;

        if (selectedDwgUrn) {
            const model = dwgModelsList.find(item => item.urn === selectedDwgUrn);
            if (model) realProjectId = model.projectId;
        }

        if (!realUrn) {
            alert('Se necesita un URN valido para extraer curvas.');
            return;
        }

        if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current);
        setIsExtracting(true);
        setExtractError('');
        setExtractReportUrl('');
        setExtractProgress(5);
        setExtractMessage('Preparando archivo Civil 3D...');
        persistCache({
            selectedDwgUrn,
            extractProgress: 5,
            extractMessage: 'Preparando archivo Civil 3D...'
        });

        try {
            const res = await apiFetch(`${BACKEND_URL}/api/civil/extract-curves`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urn: realUrn, project_id: realProjectId })
            });

            const data = await res.json();
            if (!res.ok) {
                const message = data.error || data.details || 'No se pudo iniciar la extraccion';
                setExtractError(message);
                setExtractMessage(message);
                setIsExtracting(false);
                alert(`Error en Design Automation: ${message}`);
                return;
            }

            setExtractProgress(15);
            setExtractMessage('WorkItem enviado a Design Automation...');
            let pollCount = 0;

            const pollStatus = async () => {
                try {
                    pollCount += 1;
                    const statusRes = await apiFetch(`${BACKEND_URL}/api/civil/workitem-status/${data.workitem_id}`);
                    const statusData = await statusRes.json();
                    const status = String(statusData.status || '').toLowerCase();

                    if (status === 'pending' || status === 'inprogress') {
                        const nextProgress = Math.min(92, 18 + pollCount * 4);
                        const message = status === 'pending'
                            ? 'En cola de Design Automation...'
                            : 'Civil 3D esta extrayendo alineamientos y perfiles...';
                        setExtractProgress(nextProgress);
                        setExtractMessage(message);
                        persistCache({ extractProgress: nextProgress, extractMessage: message });
                        pollTimeoutRef.current = setTimeout(pollStatus, 3000);
                        return;
                    }

                    if (status.startsWith('failed') || status === 'cancelled') {
                        const isTimeLimit = status === 'failedlimitprocessingtime';
                        const reportUrl = statusData.reportUrl || statusData.report || '';
                        const message = isTimeLimit
                            ? 'La extraccion supero el limite de procesamiento. Se aumento el limite para los siguientes WorkItems; vuelve a intentar con backend reiniciado.'
                            : `WorkItem finalizo con estado: ${statusData.status}. Revisa el reporte de Autodesk.`;
                        console.error('[CivilTools] WorkItem failed:', statusData);
                        setExtractError(message);
                        setExtractReportUrl(reportUrl);
                        setExtractProgress(92);
                        setExtractMessage(message);
                        setIsExtracting(false);
                        persistCache({ extractMessage: message, extractProgress: 92, extractReportUrl: reportUrl });
                        return;
                    }

                    if (status === 'success') {
                        setExtractProgress(96);
                        setExtractMessage('Descargando JSON de alineamientos...');
                        const resultParams = new URLSearchParams({
                            workitem_id: data.workitem_id,
                            object_name: data.result_object || ''
                        });
                        const jsonRes = await apiFetch(`${BACKEND_URL}/api/civil/alignment-result?${resultParams.toString()}`);
                        if (!jsonRes.ok) {
                            const message = 'Error al descargar el JSON de alineamientos.';
                            setExtractError(message);
                            setExtractMessage(message);
                            setIsExtracting(false);
                            alert(message);
                            return;
                        }

                        const alignmentJSON = normalizeAlignments(await jsonRes.json());
                        setAlignmentData(alignmentJSON);
                        setExtractProgress(100);
                        setExtractMessage(`Listo: ${alignmentJSON.length} ejes / ${countVisibleProfiles(alignmentJSON)} perfiles utiles`);

                        // PERSISTIR: la extracción queda guardada (permanente hasta re-extraer)
                        window.__lobCivilAlignments = alignmentJSON; // visible para 4D LOB
                        apiFetch(`${BACKEND_URL}/api/civil/alignments`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ urn: realUrn, model_urn: activeModelUrn, data: alignmentJSON })
                        }).catch((e) => console.warn('[CivilTools] No se pudo persistir la extracción:', e));

                        if (alignmentJSON.length > 0) {
                            const first = alignmentJSON[0];
                            await applyAlignment(first.alignmentId, alignmentJSON, {
                                profileName: getDefaultProfileName(first),
                                station: first.startStation
                            });
                        }

                        setIsExtracting(false);
                        persistCache({
                            alignmentData: alignmentJSON,
                            selectedDwgUrn,
                            extractProgress: 100,
                            extractMessage: `Listo: ${alignmentJSON.length} ejes / ${countVisibleProfiles(alignmentJSON)} perfiles utiles`
                        });
                        return;
                    }

                    const message = `Estado inesperado de WorkItem: ${statusData.status || 'sin estado'}`;
                    setExtractError(message);
                    setExtractMessage(message);
                    setIsExtracting(false);
                } catch (err) {
                    console.error('[CivilTools] Polling error:', err);
                    const message = 'Error consultando el estado de extraccion.';
                    setExtractError(message);
                    setExtractMessage(message);
                    setIsExtracting(false);
                    alert(message);
                }
            };

            pollTimeoutRef.current = setTimeout(pollStatus, 3000);
        } catch (err) {
            console.error('[CivilTools] Extraction error:', err);
            const message = 'Error de red al conectar con el servidor.';
            setExtractError(message);
            setExtractMessage(message);
            setIsExtracting(false);
            alert(message);
        }
    };

    // SEC: misma UX de carga que EXTRAER (porcentaje visible, sin alerts) y
    // resultado PERSISTENTE (se guarda en el backend; se reemplaza al re-extraer).
    const handleExtractSections = async () => {
        const realUrn = selectedDwgUrn || activeModelUrn;
        let realProjectId = null;
        if (selectedDwgUrn) {
            const model = dwgModelsList.find(item => item.urn === selectedDwgUrn);
            if (model) realProjectId = model.projectId;
        }
        if (!realUrn || isExtractingSections) return;

        setIsExtractingSections(true);
        setSectionProgress(5);
        setSectionMessage('Enviando WorkItem de secciones a Civil 3D…');

        const fail = (msg) => {
            setSectionMessage(msg);
            setSectionProgress(0);
            setIsExtractingSections(false);
        };

        try {
            const res = await apiFetch(`${BACKEND_URL}/api/civil/extract-sections-test`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ urn: realUrn, project_id: realProjectId })
            });
            const data = await res.json();
            if (!res.ok) { fail(`No se pudo iniciar: ${data.error || 'error desconocido'}`); return; }

            setSectionProgress(12);
            setSectionMessage('Procesando en la nube de Civil 3D…');

            let pollCount = 0;
            const MAX_POLLS = 100;
            const pollStatus = async () => {
                try {
                    pollCount += 1;
                    if (pollCount > MAX_POLLS) { fail('Tiempo de espera agotado. Reintenta la extracción.'); return; }
                    const statusRes = await apiFetch(`${BACKEND_URL}/api/civil/workitem-status/${data.workitem_id}`);
                    const statusData = await statusRes.json();
                    const status = String(statusData.status || '').toLowerCase();

                    if (status === 'pending' || status === 'inprogress') {
                        setSectionProgress((prev) => Math.min(82, Math.max(prev, 12 + pollCount * 4)));
                        setTimeout(pollStatus, 3000);
                        return;
                    }
                    if (status.startsWith('failed') || status === 'cancelled') {
                        console.error('[Sections] WorkItem failed:', statusData);
                        fail(`Extracción falló (${statusData.status}). Revisa el DWG o reintenta.`);
                        return;
                    }
                    if (status === 'success') {
                        setSectionProgress(88);
                        setSectionMessage('Descargando secciones…');
                        const resultParams = new URLSearchParams({
                            workitem_id: data.workitem_id,
                            object_name: data.result_object || ''
                        });
                        const jsonRes = await apiFetch(`${BACKEND_URL}/api/civil/alignment-result?${resultParams.toString()}`);
                        if (!jsonRes.ok) { fail('No se pudo descargar el JSON de secciones.'); return; }

                        const result = await jsonRes.json();
                        const stationCount = Array.isArray(result) ? result.length : (result?.stations?.length || 0);
                        if (!stationCount) { fail('La extracción devolvió un resultado vacío (¿el DWG tiene sample lines?).'); return; }

                        setSectionJSON(result);
                        setSectionIndex(0);
                        setSectionProgress(95);
                        setSectionMessage('Guardando en el servidor…');

                        // PERSISTIR: disponible al instante en la próxima carga
                        try {
                            await apiFetch(`${BACKEND_URL}/api/civil/sections`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ urn: realUrn, model_urn: activeModelUrn, data: result })
                            });
                        } catch (e) { console.warn('[Sections] No se pudo persistir:', e); }

                        const warns = (!Array.isArray(result) && result.warnings?.length)
                            ? ` · ${result.warnings.length} avisos` : '';
                        setSectionProgress(100);
                        setSectionMessage(`Listo: ${stationCount} estaciones${warns}`);
                        setIsExtractingSections(false);
                        return;
                    }
                    fail(`Estado inesperado: ${statusData.status || 'sin estado'}`);
                } catch (err) {
                    console.error('[Sections] polling:', err);
                    fail('Error consultando el estado de la extracción.');
                }
            };
            setTimeout(pollStatus, 3000);
        } catch (err) {
            console.error('[Sections] red:', err);
            fail('Error de red al iniciar la extracción de secciones.');
        }
    };

    const handleStationSubmit = (e) => {
        if (e.key !== 'Enter') return;
        updateStation(parseStation(stationInput));
    };

    const handleStep = (delta) => {
        updateStation(stationValue + delta);
    };

    const clearSelection = () => {
        setSelectedAlignmentId('');
        setSelectedProfileName('');
        setContextData(null);
        setSearchOpen(false);
        getExtension().then(ext => {
            ext?.bakeAlignment?.(alignmentData, 'ALL');
            ext?.setStationAnnotationsVisible?.(false);
        });
        persistCache({ selectedAlignmentId: '', selectedProfileName: '', contextData: null });
    };

    const emptyText = isExtracting
        ? 'Extrayendo alineamientos desde Civil 3D...'
        : 'Extrae curvas para elegir un eje o perfil.';

    const currentProfileLabel = selectedProfile
        ? `${selectedAlignment?.alignmentId || ''} / ${selectedProfile.name}`
        : selectedAlignment?.alignmentId || 'Buscar eje o perfil...';

    return (
        <div className="source-files-panel" style={{ minWidth: 0 }}>
            <div className="sfp-header">
                <h3>Herramientas de civil</h3>
                <div className="sfp-actions" style={{ opacity: 1 }}>
                    <button className="sfp-action-btn" type="button" title="Cerrar" onClick={onClose}>
                        <CloseIcon />
                    </button>
                </div>
            </div>

            <div className="sfp-list" style={{ padding: 12, gap: 12 }}>
                {dwgModelsList.length > 1 && (
                    <select
                        value={selectedDwgUrn}
                        onChange={(e) => {
                            setSelectedDwgUrn(e.target.value);
                            persistCache({ selectedDwgUrn: e.target.value });
                        }}
                        style={{
                            ...controlStyle,
                            width: '100%',
                            height: 34,
                            padding: '0 10px',
                            fontSize: 12
                        }}
                    >
                        {dwgModelsList.map(model => (
                            <option key={model.urn} value={model.urn}>{model.name}</option>
                        ))}
                    </select>
                )}

                <div style={{ position: 'relative', display: 'flex', gap: 8 }}>
                    <button
                        type="button"
                        onClick={() => setSearchOpen(prev => !prev)}
                        style={{
                            ...controlStyle,
                            flex: 1,
                            minWidth: 0,
                            height: 34,
                            padding: '0 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: 'pointer',
                            fontSize: 12
                        }}
                    >
                        <span style={{ overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {currentProfileLabel}
                        </span>
                        <Chevron open={searchOpen} />
                    </button>

                    <button
                        type="button"
                        onClick={handleExtractCurves}
                        disabled={isExtracting}
                        title="Extraer curvas desde Civil 3D"
                        style={{
                            height: 34,
                            border: '1px solid #3aa0ff',
                            background: isExtracting ? '#3a3f47' : '#0078d4',
                            color: '#fff',
                            borderRadius: 4,
                            padding: '0 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            cursor: isExtracting ? 'wait' : 'pointer',
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        <DownloadIcon />
                        {isExtracting ? `${extractProgress}%` : 'Extraer'}
                    </button>

                    <button
                        type="button"
                        onClick={handleExtractSections}
                        disabled={isExtracting || isExtractingSections}
                        title="Extraer secciones transversales desde Civil 3D"
                        style={{
                            height: 34,
                            border: '1px solid #3aa0ff',
                            background: isExtractingSections ? '#3a3f47' : 'transparent',
                            color: isExtractingSections ? '#fff' : '#8ecbff',
                            borderRadius: 4,
                            padding: '0 10px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 7,
                            cursor: isExtractingSections ? 'wait' : 'pointer',
                            fontSize: 11,
                            fontWeight: 700,
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {isExtractingSections ? `${sectionProgress}%` : 'Sec'}
                    </button>

                    {searchOpen && (
                        <div style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            top: 38,
                            zIndex: 25,
                            background: 'rgba(24, 27, 32, 0.98)',
                            border: '1px solid rgba(255,255,255,0.16)',
                            borderRadius: 4,
                            boxShadow: '0 12px 24px rgba(0,0,0,0.45)',
                            overflow: 'hidden'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af' }}>
                                <SearchIcon />
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Buscar..."
                                    autoFocus
                                    style={{ border: 0, outline: 0, flex: 1, fontSize: 12, background: 'transparent', color: '#f3f4f6' }}
                                />
                            </div>
                            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                {alignmentTree.length === 0 ? (
                                    <div style={{ padding: 16, color: '#9ca3af', fontSize: 12 }}>{emptyText}</div>
                                ) : alignmentTree.map(({ alignment, profiles }) => {
                                    const alignmentActive = activeAlignmentIds.includes(alignment.alignmentId);
                                    const primaryProfile = getPrimaryProfile(alignment);
                                    return (
                                        <div key={alignment.alignmentId}>
                                            <div
                                                style={{
                                                    width: '100%',
                                                    border: 0,
                                                    background: alignmentActive && !selectedProfile ? 'rgba(58,160,255,0.16)' : 'transparent',
                                                    padding: '8px 12px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 9,
                                                    color: '#e5e7eb',
                                                    fontSize: 12,
                                                    textAlign: 'left'
                                                }}
                                            >
                                                <input 
                                                    type="checkbox" 
                                                    checked={alignmentActive} 
                                                    onChange={() => applyAlignment(alignment.alignmentId, alignmentData, {
                                                        profileName: getDefaultProfileName(alignment),
                                                        station: alignment.startStation,
                                                        toggle: true,
                                                        keepOpen: true
                                                    })}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => applyAlignment(alignment.alignmentId, alignmentData, {
                                                        profileName: getDefaultProfileName(alignment),
                                                        station: alignment.startStation,
                                                        toggle: true,
                                                        keepOpen: true
                                                    })}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: 'inherit',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: 8,
                                                        flex: 1,
                                                        cursor: 'pointer',
                                                        padding: 0
                                                    }}
                                                >
                                                    <RoadIconSmall muted />
                                                    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left' }}>{alignment.alignmentId}</span>
                                                    {primaryProfile && (
                                                        <span style={{ color: '#8ab4f8', fontSize: 10 }}>{getProfileRole(primaryProfile) || 'Perfil'}</span>
                                                    )}
                                                </button>
                                            </div>
                                            {profiles.map(profile => {
                                                const profileActive = activeAlignmentIds.includes(alignment.alignmentId) && profile.name === selectedProfileName;
                                                return (
                                                    <button
                                                        key={`${alignment.alignmentId}-${profile.name}`}
                                                        type="button"
                                                        onClick={() => applyAlignment(alignment.alignmentId, alignmentData, {
                                                            profileName: profile.name,
                                                            station: alignment.startStation
                                                        })}
                                                        style={{
                                                            width: '100%',
                                                            border: 0,
                                                            background: profileActive ? 'rgba(58,160,255,0.16)' : 'transparent',
                                                            padding: '7px 12px 7px 34px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: 9,
                                                            cursor: 'pointer',
                                                            color: profileActive ? '#ffffff' : '#cfd6df',
                                                            fontSize: 12,
                                                            textAlign: 'left'
                                                        }}
                                                    >
                                                        <ProfileIcon muted={!profileActive} />
                                                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.name}</span>
                                                        <span style={{ color: '#8b949e', fontSize: 10 }}>{getProfileRole(profile)}</span>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                })}
                            </div>
                            {alignmentData.length > 0 && (
                                <button
                                    type="button"
                                    onClick={clearSelection}
                                    style={{
                                        width: '100%',
                                        border: 0,
                                        background: 'transparent',
                                        borderTop: '1px solid rgba(255,255,255,0.08)',
                                        color: '#3aa0ff',
                                        padding: '9px 12px',
                                        textAlign: 'right',
                                        cursor: 'pointer',
                                        fontSize: 12
                                    }}
                                >
                                    Borrar
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                        type="button"
                        onClick={toggleStationLabels}
                        disabled={!selectedAlignment}
                        title={stationLabelsVisible ? 'Ocultar progresivas de tramos' : 'Mostrar progresivas de tramos'}
                        style={{
                            width: 34,
                            height: 30,
                            border: `1px solid ${stationLabelsVisible ? '#3aa0ff' : 'rgba(255,255,255,0.16)'}`,
                            background: stationLabelsVisible ? 'rgba(58,160,255,0.16)' : '#12151a',
                            color: stationLabelsVisible ? '#8ecbff' : '#9ca3af',
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: selectedAlignment ? 'pointer' : 'not-allowed',
                            opacity: selectedAlignment ? 1 : 0.5
                        }}
                    >
                        <RoadIconSmall muted={!stationLabelsVisible} />
                    </button>
                    <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
                    <span style={{ color: '#8b949e', fontSize: 11 }}>
                        {alignmentData.length > 0 ? `${alignmentData.length} ejes / ${countVisibleProfiles(alignmentData)} perfiles utiles` : 'Sin datos civil cargados'}
                    </span>
                </div>

                {(isExtracting || extractMessage) && (
                    <div style={{
                        border: `1px solid ${extractError ? 'rgba(248,113,113,0.45)' : 'rgba(58,160,255,0.24)'}`,
                        background: extractError ? 'rgba(127,29,29,0.24)' : 'rgba(58,160,255,0.08)',
                        borderRadius: 6,
                        padding: 10
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: extractError ? '#fecaca' : '#bfdbfe', fontSize: 11 }}>
                            {isExtracting && <span className="sfp-check-spinner" />}
                            <span style={{ flex: 1 }}>{extractMessage}</span>
                            <strong>{extractProgress}%</strong>
                        </div>
                        <div style={{ height: 5, borderRadius: 99, overflow: 'hidden', background: 'rgba(255,255,255,0.12)', marginTop: 8 }}>
                            <div style={{
                                height: '100%',
                                width: `${Math.max(0, Math.min(100, extractProgress))}%`,
                                background: extractError ? '#f87171' : '#3aa0ff',
                                transition: 'width 0.25s ease'
                            }} />
                        </div>
                        {extractReportUrl && (
                            <button
                                type="button"
                                onClick={() => window.open(extractReportUrl, '_blank', 'noopener,noreferrer')}
                                style={{
                                    marginTop: 8,
                                    border: '1px solid rgba(248,113,113,0.45)',
                                    background: 'transparent',
                                    color: '#fecaca',
                                    borderRadius: 4,
                                    padding: '5px 8px',
                                    cursor: 'pointer',
                                    fontSize: 11,
                                    fontWeight: 700
                                }}
                            >
                                Abrir reporte
                            </button>
                        )}
                    </div>
                )}

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                    <div style={{ color: '#f3f4f6', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>P.K. actual</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button type="button" disabled={!selectedAlignment} onClick={() => handleStep(-10)} style={navButtonStyle}>{'<<'}</button>
                        <button type="button" disabled={!selectedAlignment} onClick={() => handleStep(-1)} style={navButtonStyle}>{'<'}</button>
                        <input
                            id="civil-station-input"
                            type="text"
                            value={stationInput}
                            onChange={(e) => setStationInput(e.target.value)}
                            onKeyDown={handleStationSubmit}
                            onBlur={() => updateStation(parseStation(stationInput))}
                            disabled={!selectedAlignment}
                            style={{
                                ...controlStyle,
                                flex: 1,
                                minWidth: 0,
                                height: 38,
                                padding: '0 10px',
                                fontSize: 13,
                                textAlign: 'center',
                                opacity: selectedAlignment ? 1 : 0.6
                            }}
                        />
                        <button type="button" disabled={!selectedAlignment} onClick={() => handleStep(1)} style={navButtonStyle}>{'>'}</button>
                        <button type="button" disabled={!selectedAlignment} onClick={() => handleStep(10)} style={navButtonStyle}>{'>>'}</button>
                    </div>

                    <input
                        type="range"
                        min={stationRange.min}
                        max={stationRange.max}
                        step="0.1"
                        value={Number.isFinite(stationValue) ? stationValue : stationRange.min}
                        disabled={!selectedAlignment}
                        onChange={(e) => updateStation(Number(e.target.value))}
                        style={{
                            width: '100%',
                            marginTop: 12,
                            accentColor: '#3aa0ff',
                            opacity: selectedAlignment ? 1 : 0.45
                        }}
                    />

                    {selectedAlignment && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', fontSize: 10, marginTop: 2 }}>
                            <span>{formatStation(stationRange.min)}</span>
                            <span>{formatStation(stationRange.max)}</span>
                        </div>
                    )}
                </div>

                <div style={{ marginBottom: 20 }}>
                    {!contextData ? (
                        <div className="sfp-empty" style={{ padding: '18px 6px' }}>{emptyText}</div>
                    ) : (
                        <>
                            <Section title="Propiedades de P.K.">
                                <PropertyRow label="X (Abscisa)" value={formatValue(contextData.x)} />
                                <PropertyRow label="Y (Ordenada)" value={formatValue(contextData.y)} />
                                <PropertyRow label="Z (Alzado)" value={formatValue(contextData.z)} />
                            </Section>

                            <Section title="Alineamiento">
                                <PropertyRow label="Eje" value={selectedAlignment?.alignmentId || '-'} />
                                <PropertyRow label="Perfil" value={selectedProfileName || '-'} />
                                <PropertyRow label="Tipo perfil" value={selectedProfile?.type || '-'} />
                                <PropertyRow label="Parent" value={selectedProfile?.parentAlignment || selectedAlignment?.alignmentId || '-'} />
                                <PropertyRow label="Capa" value={selectedProfile?.layer || '-'} />
                                <PropertyRow label="Estilo" value={selectedProfile?.style || '-'} />
                                <PropertyRow label="Puntos reales" value={selectedProfile?.points?.length || 0} />
                                <PropertyRow label="P.K. inicial" value={formatValue(selectedAlignment?.startStation)} />
                                <PropertyRow label="P.K. final" value={formatValue(selectedAlignment?.endStation)} />
                                <PropertyRow label="Longitud" value={formatValue(selectedAlignment?.length)} />
                            </Section>

                            {contextData.horizontal && (
                                <Section title={`Horizontal ${contextData.horizontal.type || ''}`}>
                                    <PropertyRow label="P.K. inicial" value={formatValue(contextData.horizontal.startStation)} />
                                    <PropertyRow label="P.K. final" value={formatValue(contextData.horizontal.endStation)} />
                                    <PropertyRow label="Longitud" value={formatValue(contextData.horizontal.length)} />
                                </Section>
                            )}

                            {contextData.vertical && (
                                <Section title={`Vertical ${contextData.vertical.type || ''}`}>
                                    <PropertyRow label="P.K. inicial" value={formatValue(contextData.vertical.startStation)} />
                                    <PropertyRow label="P.K. final" value={formatValue(contextData.vertical.endStation)} />
                                    <PropertyRow label="Longitud" value={formatValue(contextData.vertical.length)} />
                                    {contextData.vertical.grade !== undefined && (
                                        <PropertyRow label="Pendiente" value={`${(Number(contextData.vertical.grade) * 100).toFixed(2)} %`} />
                                    )}
                                </Section>
                            )}
                        </>
                    )}
                </div>

                {/* Secciones transversales — estado + visualizador (minimalista) */}
                {(sectionMessage || isExtractingSections || sectionJSON) && (
                    <div style={{
                        marginTop: 14,
                        border: '1px solid rgba(255,255,255,0.10)',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.03)',
                        padding: '10px 12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                                background: isExtractingSections ? '#3aa0ff' : sectionJSON ? '#22c55e' : '#8a919c'
                            }} />
                            <span style={{
                                fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
                                color: '#8a919c', fontWeight: 700
                            }}>
                                Secciones transversales
                            </span>
                        </div>

                        {isExtractingSections && (
                            <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${sectionProgress}%`, background: '#3aa0ff', transition: 'width 300ms ease' }} />
                            </div>
                        )}

                        {sectionMessage && (
                            <div style={{ marginTop: 7, fontSize: 11.5, color: '#c8cdd6', lineHeight: 1.4 }}>
                                {sectionMessage}
                            </div>
                        )}

                        {sectionJSON && !isExtractingSections && (
                            <button
                                onClick={() => setShowSectionViewer(true)}
                                style={{
                                    marginTop: 10,
                                    width: '100%',
                                    height: 32,
                                    background: 'transparent',
                                    color: '#8ecbff',
                                    border: '1px solid #3aa0ff',
                                    borderRadius: 5,
                                    fontWeight: 700,
                                    fontSize: 12,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center',
                                    gap: 8
                                }}
                            >
                                Visualizador 2D <span style={{ color: '#5d6672', fontWeight: 400 }}>· secciones y volúmenes</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
            
            {showSectionViewer && sectionJSON && (
                <SectionViewer
                    sectionsData={sectionJSON}
                    onClose={() => setShowSectionViewer(false)}
                    onGoToStation={handleGoToSection}
                />
            )}
        </div>
    );
};

export default CivilToolsPanel;
