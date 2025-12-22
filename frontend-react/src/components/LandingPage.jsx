
import React from 'react';
import './LandingPage.css';

// Placeholder paths - user needs to put actual files in /public or /src/assets
const LOGO_PATH = '/POWER_CHINA.webp';
const BG_PATH = '/FONDO_PAGINA.jpg';
// Placeholder images for projects if not provided
const PROJECT_1_IMG = '/drenaje.png'; // Urban/Drainage generic
const PROJECT_2_IMG = '/canal.png'; // Canal generic

const LandingPage = ({ onSelectProject }) => {
    return (
        <div className="landing-container" style={{ backgroundImage: `url(${BG_PATH})` }}>
            <div className="landing-overlay">

                {/* Header / Logo */}
                <header className="landing-header">
                    <img src={LOGO_PATH} alt="Power China" className="landing-logo" onError={(e) => e.target.style.display = 'none'} />
                    {/* Fallback text if logo fails */}
                    <h1 className="landing-title-text" style={{ display: 'none' }}>POWERCHINA</h1>
                </header>

                {/* Main Content */}
                <div className="landing-content">
                    <h2 className="landing-subtitle">SELECCIONE EL PROYECTO</h2>

                    <div className="project-cards-container">
                        {/* Card 1: DRENAJE URBANO */}
                        <div
                            className="project-card"
                            onClick={() => onSelectProject('DRENAJE_URBANO')}
                        >
                            <div className="card-image" style={{ backgroundImage: `url(${PROJECT_1_IMG})` }}>
                                <div className="card-overlay"></div>
                            </div>
                            <div className="card-label">
                                <span>DRENAJE URBANO</span>
                            </div>
                        </div>

                        {/* Card 2: CANAL */}
                        <div
                            className="project-card"
                            onClick={() => onSelectProject('CANAL')}
                        >
                            <div className="card-image" style={{ backgroundImage: `url(${PROJECT_2_IMG})` }}>
                                <div className="card-overlay"></div>
                            </div>
                            <div className="card-label">
                                <span>CANAL</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <footer className="landing-footer">
                    <p>© 2025 Visor de Proyectos - Power China</p>
                </footer>
            </div>
        </div>
    );
};

export default LandingPage;
