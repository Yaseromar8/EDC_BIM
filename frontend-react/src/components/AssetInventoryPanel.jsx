import React, { useState, useMemo, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

const BACKEND_URL = Capacitor.isNativePlatform()
    ? 'https://visor-bim-245133742416.us-central1.run.app'
    : (import.meta.env.VITE_BACKEND_URL || '');

const BACKEND_API = BACKEND_URL || 'http://localhost:5000';

const AssetInventoryPanel = ({ allLoadedProperties, selectedProject }) => {
    const [gemeloData, setGemeloData] = useState([]);
    const [expandedCategories, setExpandedCategories] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!selectedProject?.id) return;

        const fetchGemeloAssets = async () => {
            try {
                const res = await fetch(`${BACKEND_API}/api/gemelo/properties/all?project=${encodeURIComponent(selectedProject.id)}`);
                if (res.ok) {
                    const data = await res.json();
                    setGemeloData(data.assets || []);
                }
            } catch (err) {
                console.error("Error fetching gemelo inventory:", err);
            } finally {
                setLoading(false);
            }
        };

        fetchGemeloAssets();

        // Polling para mantener la tabla actualizada si se edita O&M
        const interval = setInterval(fetchGemeloAssets, 5000);
        return () => clearInterval(interval);
    }, [selectedProject]);

    // Group assets by category
    const groupedAssets = useMemo(() => {
        const groups = {};

        // Hacemos lookup rápido para datos O&M
        const gemeloLookup = new Map();
        gemeloData.forEach(g => {
            gemeloLookup.set(`${g.urn}-${g.elementId}`, g);
        });

        allLoadedProperties.forEach(item => {
            // Find category
            let category = "Uncategorized";
            const nameProp = item.properties?.find(p => p.displayName === 'name' || p.displayName === 'Name' || p.displayName === 'Nombre');
            const catProp = item.properties?.find(p =>
                p.displayName === 'Category' || p.displayName === 'Categoría' || p.displayName === 'Type'
            );

            if (catProp && catProp.displayValue) {
                category = String(catProp.displayValue);
            }

            const itemName = nameProp ? nameProp.displayValue : `Elemento ${item.dbId}`;
            const gemeloRecord = gemeloLookup.get(`${item.modelUrn}-${item.dbId}`);

            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push({
                ...item,
                name: itemName,
                hasGemeloData: !!gemeloRecord,
                omData: gemeloRecord ? gemeloRecord.properties : {}
            });
        });

        return groups;
    }, [allLoadedProperties, gemeloData]);

    const toggleExpand = (cat) => {
        setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
    };

    const handleSelectAsset = (modelUrn, dbId) => {
        // Enviar evento al Viewer para aislar el activo
        window.dispatchEvent(new CustomEvent('viewer-select', { detail: { dbIds: [dbId], urn: modelUrn } }));
    };

    const categories = Object.keys(groupedAssets).sort();

    return (
        <div className="filters-shell" style={{ display: 'flex', flexDirection: 'column', position: 'absolute', inset: 0, height: '100%', background: 'transparent', color: '#adadad', fontSize: '12px', zIndex: 20, overflow: 'hidden' }}>
            <header className="tandem-header" style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <h2 className="tandem-title">Asset Inventory</h2>
            </header>

            <div className="tandem-scroll" style={{ flex: 1, overflowY: 'auto' }}>
                {loading && (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>Sincronizando Gemelo...</div>
                )}

                {!loading && categories.length === 0 && (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#888' }}>No hay activos clasificados en el modelo.</div>
                )}

                {!loading && categories.map(cat => {
                    const isExpanded = expandedCategories[cat];
                    const assets = groupedAssets[cat];
                    const numWithData = assets.filter(a => a.hasGemeloData).length;

                    return (
                        <div key={cat} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div
                                style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', background: isExpanded ? 'rgba(58, 160, 255, 0.05)' : 'transparent' }}
                                onClick={() => toggleExpand(cat)}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '10px', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
                                    <polyline points="6 9 12 15 18 9" />
                                </svg>
                                <span style={{ flex: 1, fontWeight: '600', color: '#fff' }}>{cat.replace('Revit ', '')}</span>
                                <span style={{ fontSize: '10px', color: numWithData > 0 ? '#10b981' : '#64748b' }}>
                                    {numWithData > 0 ? `${numWithData}/${assets.length} O&M` : assets.length}
                                </span>
                            </div>

                            {isExpanded && (
                                <ul style={{ listStyle: 'none', margin: 0, padding: 0, background: 'rgba(0,0,0,0.2)' }}>
                                    {assets.map(asset => (
                                        <li
                                            key={`${asset.modelUrn}-${asset.dbId}`}
                                            style={{ display: 'flex', alignItems: 'center', padding: '8px 16px 8px 38px', cursor: 'pointer', borderBottom: '1px dotted rgba(255,255,255,0.03)' }}
                                            onClick={() => handleSelectAsset(asset.modelUrn, asset.dbId)}
                                        >
                                            <span style={{
                                                width: '8px', height: '8px', borderRadius: '50%', marginRight: '10px',
                                                background: asset.hasGemeloData ? '#10b981' : '#475569'
                                            }} title={asset.hasGemeloData ? "Datos O&M Activos" : "Sin Datos O&M"} />

                                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: asset.hasGemeloData ? '#fff' : '#cbd5e1' }}>
                                                {asset.name}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AssetInventoryPanel;
