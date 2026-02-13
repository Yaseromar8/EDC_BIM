
import React from 'react';
import './ProgressPanel.css';

const ProgressPanel = () => {
    return (
        <div className="progress-dashboard">
            <header className="progress-dashboard-header">
                <h1>Panel de Seguimiento</h1>
                <p>Estado general del proyecto y métricas de avance.</p>
            </header>

            <div className="progress-grid">
                {/* Metric Card 1 */}
                <div className="metric-card">
                    <h3>Avance Físico</h3>
                    <div className="metric-value">45%</div>
                    <div className="progress-bar-container">
                        <div className="progress-bar" style={{ width: '45%' }}></div>
                    </div>
                </div>

                {/* Metric Card 2 */}
                <div className="metric-card">
                    <h3>Avance Financiero</h3>
                    <div className="metric-value">32%</div>
                    <div className="progress-bar-container">
                        <div className="progress-bar financial" style={{ width: '32%' }}></div>
                    </div>
                </div>

                {/* Metric Card 3 */}
                <div className="metric-card">
                    <h3>Días Transcurridos</h3>
                    <div className="metric-value">120</div>
                    <span className="metric-sub">de 365 días</span>
                </div>

                {/* Main Chart Area Placeholder */}
                <div className="chart-card large">
                    <h3>Curva S de Avance</h3>
                    <div className="chart-placeholder">
                        <span>Gráfico de Curva S en desarrollo...</span>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="activity-card">
                    <h3>Actividad Reciente</h3>
                    <ul className="activity-list">
                        <li>
                            <span className="dot finished"></span>
                            <div>
                                <strong>Vaciado de Losa Nivel 2</strong>
                                <small>Completado hoy</small>
                            </div>
                        </li>
                        <li>
                            <span className="dot pending"></span>
                            <div>
                                <strong>Instalación Eléctrica Sector A</strong>
                                <small>En progreso</small>
                            </div>
                        </li>
                        <li>
                            <span className="dot issue"></span>
                            <div>
                                <strong>Retraso en entrega de acero</strong>
                                <small>Reportado ayer</small>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default ProgressPanel;
