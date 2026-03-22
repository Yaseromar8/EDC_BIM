import React, { useState } from 'react';
import './SchedulePanel.css';

const SchedulePanel = ({ onUploadSuccess, BACKEND_URL, scheduleData, setScheduleData }) => {
    const [isUploading, setIsUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedTask, setSelectedTask] = useState(null);

    const handleFileChange = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${BACKEND_URL}/api/schedule/upload-local`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            
            if (data.success) {
                setScheduleData(data.schedule);
                if (onUploadSuccess) onUploadSuccess(data.schedule);
            } else {
                alert('Error al procesar el XML: ' + data.error);
            }
        } catch (error) {
            console.error('Upload error:', error);
            alert('Error al conectar con el servidor.');
        } finally {
            setIsUploading(false);
        }
    };

    const filteredTasks = scheduleData?.tasks.filter(task => 
        task.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.activityId.toLowerCase().includes(searchTerm.toLowerCase())
    ) || [];

    return (
        <div className="schedule-panel">
            <header className="panel-header">
                <h2>Cronograma (100% Data)</h2>
                <span className="panel-subtitle">Análisis Forense Primavera XML</span>
            </header>

            {!scheduleData ? (
                <div className="upload-section">
                    <label className="upload-card">
                        <input 
                            type="file" 
                            accept=".xml" 
                            onChange={handleFileChange} 
                            disabled={isUploading}
                            hidden
                        />
                        <div className="upload-icon">🔍</div>
                        <div className="upload-text">
                            {isUploading ? 'Procesando cada tag...' : 'Cargar XML para extracción 100%'}
                        </div>
                    </label>
                </div>
            ) : (
                <div className="schedule-content">
                    <div className="search-bar">
                        <input 
                            type="text" 
                            placeholder="Buscar en todos los campos..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="tasks-container">
                        <div className="tasks-stats">
                            {filteredTasks.length} actividades extraídas sin residuos
                        </div>
                        
                        <div className="task-list">
                            {filteredTasks.map(task => (
                                <div 
                                    key={task.id} 
                                    className={`task-row ${selectedTask?.id === task.id ? 'active' : ''}`}
                                    onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                                >
                                    <div className="task-row-top">
                                        <div className="col-id">{task.activityId}</div>
                                        <div className="col-name" title={task.name}>{task.name}</div>
                                    </div>
                                    
                                    {selectedTask?.id === task.id && (
                                        <div className="task-metadata-grid">
                                            {Object.entries(task.all_data).map(([key, value]) => (
                                                <div key={key} className="meta-item">
                                                    <span className="meta-key">{key}:</span>
                                                    <span className="meta-value">{value || '-'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    
                    <div className="panel-footer">
                        <button className="reset-btn" onClick={() => setScheduleData(null)}>
                            Limpiar y Nueva Carga
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SchedulePanel;
