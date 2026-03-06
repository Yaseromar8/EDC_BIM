import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Capacitor } from '@capacitor/core';

const BACKEND_URL = Capacitor.isNativePlatform()
    ? 'https://visor-ecd-backend.onrender.com'
    : (import.meta.env.VITE_BACKEND_URL || '');

const DailyReportPanel = ({ selectedProject }) => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [newReport, setNewReport] = useState({
        date: new Date().toISOString().split('T')[0],
        weather: 'Despejado',
        personnel: 0,
        issues: '',
        tasks: ''
    });

    const modelUrn = selectedProject || 'global';

    useEffect(() => {
        fetchReports();
    }, [modelUrn]);

    const fetchReports = async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${BACKEND_URL}/api/tracking/daily-reports?model_urn=${modelUrn}`);
            setReports(res.data);
        } catch (error) {
            console.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post(`${BACKEND_URL}/api/tracking/daily-reports`, {
                ...newReport,
                model_urn: modelUrn,
                user: 'Usuario Obra' // Placeholder
            });
            alert('✅ Reporte guardado');
            setShowForm(false);
            fetchReports();
        } catch (error) {
            console.error('Error saving report:', error);
            alert('Error al guardar el reporte');
        }
    };

    return (
        <div className="daily-report-panel" style={{ padding: '16px', color: '#eee' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0 }}>Partes Diarios</h3>
                <button
                    onClick={() => setShowForm(!showForm)}
                    style={{
                        padding: '6px 12px',
                        background: '#3aa0ff',
                        border: 'none',
                        color: 'white',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    {showForm ? 'Cancelar' : '+ Nuevo Reporte'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} style={{ background: '#222', padding: '12px', borderRadius: '8px', marginBottom: '20px' }}>
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Fecha</label>
                        <input
                            type="date"
                            value={newReport.date}
                            onChange={e => setNewReport({ ...newReport, date: e.target.value })}
                            style={{ width: '100%', padding: '6px', background: '#333', border: '1px solid #444', color: 'white' }}
                        />
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Clima</label>
                        <select
                            value={newReport.weather}
                            onChange={e => setNewReport({ ...newReport, weather: e.target.value })}
                            style={{ width: '100%', padding: '6px', background: '#333', border: '1px solid #444', color: 'white' }}
                        >
                            <option>Despejado</option>
                            <option>Nublado</option>
                            <option>Lluvia</option>
                            <option>Viento Fuerte</option>
                        </select>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Personal Total</label>
                        <input
                            type="number"
                            value={newReport.personnel}
                            onChange={e => setNewReport({ ...newReport, personnel: parseInt(e.target.value) || 0 })}
                            style={{ width: '100%', padding: '6px', background: '#333', border: '1px solid #444', color: 'white' }}
                        />
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Tareas Realizadas</label>
                        <textarea
                            value={newReport.tasks}
                            onChange={e => setNewReport({ ...newReport, tasks: e.target.value })}
                            style={{ width: '100%', padding: '6px', background: '#333', border: '1px solid #444', color: 'white', minHeight: '60px' }}
                        />
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: '4px' }}>Incidentes / Restricciones</label>
                        <textarea
                            value={newReport.issues}
                            onChange={e => setNewReport({ ...newReport, issues: e.target.value })}
                            style={{ width: '100%', padding: '6px', background: '#333', border: '1px solid #444', color: 'white', minHeight: '60px' }}
                        />
                    </div>
                    <button type="submit" style={{ width: '100%', padding: '8px', background: '#22c55e', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                        GUARDAR REPORTE
                    </button>
                </form>
            )}

            <div className="reports-list">
                {loading ? <p>Cargando...</p> : reports.map((r, i) => (
                    <div key={i} style={{ background: '#333', padding: '12px', borderRadius: '8px', marginBottom: '10px', fontSize: '0.9rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #444', paddingBottom: '6px', marginBottom: '6px' }}>
                            <span style={{ fontWeight: 'bold' }}>📅 {r.date}</span>
                            <span style={{ color: '#aaa' }}>☁️ {r.weather}</span>
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <span style={{ color: '#3aa0ff' }}>👷 Personal:</span> {r.personnel}
                        </div>
                        <div style={{ marginBottom: '8px' }}>
                            <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#22c55e' }}>✅ TAREAS:</div>
                            <div style={{ fontSize: '0.85rem' }}>{r.tasks || 'Sin datos'}</div>
                        </div>
                        {r.issues && (
                            <div>
                                <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: '#ef4444' }}>⚠️ INCIDENTES:</div>
                                <div style={{ fontSize: '0.85rem' }}>{r.issues}</div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DailyReportPanel;
