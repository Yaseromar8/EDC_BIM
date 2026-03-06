
import React, { useState, useMemo } from 'react';
import './ProgressPanel.css';
import { parseExcelProgress } from '../services/ExcelImportService';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';

const BACKEND_URL = Capacitor.isNativePlatform()
    ? 'https://visor-ecd-backend.onrender.com'
    : (import.meta.env.VITE_BACKEND_URL || '');

const ProgressPanel = ({ trackingData = {}, selectedProject }) => {
    const [uploading, setUploading] = useState(false);
    const [specialtyFilter, setSpecialtyFilter] = useState('Todas');

    // Compute metrics from real tracking data
    const metrics = useMemo(() => {
        let avance = trackingData.avance || [];
        let fotos = trackingData.fotos || [];
        let docs = trackingData.docs || [];
        const detalles = trackingData.detalles || {};

        if (specialtyFilter !== 'Todas') {
            avance = avance.filter(p => p.specialty === specialtyFilter);
            fotos = fotos.filter(p => p.specialty === specialtyFilter);
            docs = docs.filter(p => p.specialty === specialtyFilter);
        }

        let avgProgress = 0;
        if (avance.length > 0) {
            const total = avance.reduce((sum, pin) => {
                const val = parseFloat(String(pin.val || '0').replace('%', ''));
                return sum + (isNaN(val) ? 0 : val);
            }, 0);
            avgProgress = Math.round(total / avance.length);
        }

        return {
            avgProgress,
            pinCount: avance.length,
            photoCount: fotos.length,
            docCount: docs.length,
            detallesCount: Object.keys(detalles).length,
            filteredAvance: avance
        };
    }, [trackingData, specialtyFilter]);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!selectedProject) {
            alert('Selecciona un proyecto primero.');
            return;
        }

        setUploading(true);
        try {
            const data = await parseExcelProgress(file);
            // selectedProject here is already project.id (stable string, e.g. "CANAL")
            // This key does NOT change when Revit model version is updated
            const urn = selectedProject;
            const currentRes = await axios.get(`${BACKEND_URL}/api/tracking?model_urn=${urn}`);
            const current = currentRes.data;

            let avanceRows;
            if (Array.isArray(data)) {
                avanceRows = data;
            } else {
                avanceRows = Object.values(data).flat();
            }

            await axios.post(`${BACKEND_URL}/api/tracking?model_urn=${urn}`, {
                ...current,
                avance: [...(current.avance || []), ...avanceRows]
            });

            alert('✅ Avance cargado correctamente');
        } catch (error) {
            console.error('Error parsing Excel:', error);
            alert('Error al leer el archivo Excel');
        } finally {
            setUploading(false);
            e.target.value = '';
        }
    };

    return (
        <div className="progress-dashboard">
            <header className="progress-dashboard-header">
                <div>
                    <h1>Panel de Seguimiento</h1>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        {['Todas', 'General', 'Arquitectura', 'Estructuras', 'MEP'].map(s => (
                            <button
                                key={s}
                                onClick={() => setSpecialtyFilter(s)}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '0.75rem',
                                    borderRadius: '12px',
                                    border: '1px solid #444',
                                    background: specialtyFilter === s ? '#3aa0ff' : '#222',
                                    color: specialtyFilter === s ? 'white' : '#888',
                                    cursor: 'pointer'
                                }}
                            >
                                {s}
                            </button>
                        ))}
                    </div>
                </div>
                <div style={{ marginLeft: 'auto' }}>
                    <input
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        id="excel-upload"
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                    />
                    <label htmlFor="excel-upload" className="button-upload" style={{
                        padding: '8px 12px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.9rem'
                    }}>
                        {uploading ? 'Procesando...' : '📂 Cargar Avance (Excel)'}
                    </label>
                </div>
            </header>

            <div className="progress-grid">
                <div className="metric-card">
                    <h3>Avance Promedio</h3>
                    <div className="metric-value">{metrics.avgProgress}%</div>
                    <div className="progress-bar-container">
                        <div className="progress-bar" style={{ width: `${Math.min(metrics.avgProgress, 100)}%` }}></div>
                    </div>
                </div>

                <div className="metric-card">
                    <h3>Marcadores de Avance</h3>
                    <div className="metric-value">{metrics.pinCount}</div>
                    <span className="metric-sub">pines colocados</span>
                </div>

                <div className="metric-card">
                    <h3>Fotos Registradas</h3>
                    <div className="metric-value">{metrics.photoCount}</div>
                    <span className="metric-sub">evidencias fotográficas</span>
                </div>

                <div className="metric-card">
                    <h3>Documentos Vinculados</h3>
                    <div className="metric-value">{metrics.docCount}</div>
                    <span className="metric-sub">pines de documentos</span>
                </div>

                <div className="chart-card large">
                    <h3>Resumen de Detalles</h3>
                    <div className="chart-placeholder">
                        {metrics.detallesCount > 0 ? (
                            <span>{metrics.detallesCount} elementos con detalle cargado</span>
                        ) : (
                            <span>Sin detalles cargados. Use el panel de detalle de cada pin.</span>
                        )}
                    </div>
                </div>

                <div className="activity-card">
                    <h3>Actividad Reciente {specialtyFilter !== 'Todas' ? `(${specialtyFilter})` : ''}</h3>
                    <ul className="activity-list">
                        {(metrics.filteredAvance || []).slice(-5).reverse().map((pin, i) => {
                            const val = parseFloat(String(pin.val || '0').replace('%', ''));
                            const statusClass = val >= 100 ? 'finished' : val >= 50 ? 'pending' : 'issue';
                            return (
                                <li key={pin.id || i}>
                                    <span className={`dot ${statusClass}`}></span>
                                    <div>
                                        <strong>{pin.specialty || 'General'} - Pin #{pin.id || i + 1}</strong>
                                        <small>{pin.val || '0%'} avance</small>
                                    </div>
                                </li>
                            );
                        })}
                        {(!metrics.filteredAvance || metrics.filteredAvance.length === 0) && (
                            <li>
                                <span className="dot pending"></span>
                                <div>
                                    <strong>Sin actividad</strong>
                                    <small>Coloque marcadores de avance en el modelo.</small>
                                </div>
                            </li>
                        )}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default ProgressPanel;
