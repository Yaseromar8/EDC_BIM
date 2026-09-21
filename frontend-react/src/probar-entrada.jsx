// BANCO · entrada de View (lista de proyectos y de frentes) con datos de ejemplo.
// El componente real (LandingPage) con los mismos estilos globales que la app;
// solo se sustituyen las respuestas de /api/hubs, /api/projects y /api/frentes.
// `?vista=frente` abre la primera obra; `?vista=formulario`, además, «Crear frente».
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './App.css';
import LandingPage from './components/LandingPage';

const DATOS = {
  hubs: [],
  projects: [
    { id: 'p1', name: 'PQT8_TALARA', hub_name: 'Proyectos Generales', project_type: '', status: 'active', updated_at: '2026-08-07T12:00:00Z' },
    { id: 'p2', name: 'PQT8_INTERFERENCIAS', hub_name: 'Proyectos Generales', project_type: 'Infraestructura', status: 'active', updated_at: '2026-07-03T12:00:00Z' },
    { id: 'p3', name: 'Piloto externo 2026', hub_name: 'Proyectos Generales', project_type: 'Infraestructura', status: 'active', updated_at: '2026-08-23T12:00:00Z' },
    { id: 'p4', name: 'Paquete 5 · Colectores primarios', hub_name: 'Proyectos Generales', project_type: 'Infraestructura', status: 'active', updated_at: '2026-08-22T12:00:00Z' },
    { id: 'p5', name: 'Reposición de pavimentos', hub_name: 'Proyectos Generales', project_type: 'Infraestructura', status: 'active', updated_at: '2026-08-07T12:00:00Z' },
  ],
  frentes: [
    { frontId: 'CANAL', name: 'Frente Canal', icon: '🌊', frontType: '', civil: { ejes: 24, estaciones: 75 } },
    { frontId: 'DRENAJE', name: 'Frente Drenaje Urbano', icon: '🏙️', frontType: '', civil: { ejes: 46, estaciones: 0 } },
  ],
};

const fetchReal = window.fetch.bind(window);
window.fetch = async (url, opciones) => {
  const u = String(url);
  const json = (d) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (u.includes('/api/hubs')) return json({ hubs: DATOS.hubs });
  if (u.includes('/api/projects')) return json({ projects: DATOS.projects });
  if (u.includes('/api/frentes')) return json({ frentes: DATOS.frentes });
  return fetchReal(url, opciones);
};

createRoot(document.getElementById('root')).render(
  <LandingPage user={{ name: 'Ana Torres', email: 'ana@ejemplo.pe', role: 'admin' }}
               onSelectProject={(p) => console.log('[banco] elegido', p.displayName)} />
);

const vista = new URLSearchParams(window.location.search).get('vista');
const pulsar = (selector, luego) => {
  const el = document.querySelector(selector);
  if (el) { el.click(); if (luego) setTimeout(luego, 150); } else setTimeout(() => pulsar(selector, luego), 50);
};
if (vista === 'frente') pulsar('.acc-project-card');
if (vista === 'formulario') pulsar('.acc-project-card', () => pulsar('.frente-card-nuevo'));
