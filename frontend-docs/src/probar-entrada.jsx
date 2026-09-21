// BANCO · entrada de Docs (inicio y lista de proyectos) con datos de ejemplo.
// Los componentes reales (HubPage, SecureProjectsPage) con los estilos globales
// de la app; solo se sustituyen las respuestas de la API que piden al abrir.
// `?pantalla=inicio` (por defecto) o `?pantalla=proyectos`; `&vacio=1` sin datos.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import HubPage from './pages/HubPage';
import SecureProjectsPage from './pages/SecureProjectsPage';

const q = new URLSearchParams(window.location.search);
const vacio = q.get('vacio') === '1';
const dias = (n) => new Date(Date.now() + n * 86400000).toISOString();

const PENDIENTES = vacio ? [] : [
  { id: 1, objeto_tipo: 'REVIEW', asunto: 'Planos de drenaje, sector B · C03', project_name: 'PQT8 · Drenaje Pluvial Talara', vence_en: dias(-1) },
  { id: 2, objeto_tipo: 'RFI', asunto: 'Cota de fondo en el buzón BP-10', project_name: 'PQT8 · Drenaje Pluvial Talara', vence_en: dias(3) },
  { id: 3, objeto_tipo: 'TRANSMITTAL', asunto: 'Láminas de paisajismo, entrega 2', project_name: 'PQT8 · Drenaje Pluvial Talara', destino_funcion: 'Entidad', vence_en: dias(6) },
];
const OBRAS = vacio ? [] : [
  { id: 1, hub_name: 'MP de Talara', name: 'PQT8 · Drenaje Pluvial Talara', location: 'Talara, Piura', number: '500125', account: 'Consorcio Talara', invite_code: 'K7Q2MX', created_at: '2026-04-20T12:00:00Z' },
  { id: 2, hub_name: 'MP de Talara', name: 'Paquete 5 · Colectores primarios', location: 'Talara, Piura', number: '500124', account: 'Consorcio Talara', invite_code: 'P4WZ8N', created_at: '2026-06-03T12:00:00Z' },
  { id: 3, hub_name: 'MD de Pariñas', name: 'Reposición de pavimentos', location: 'Pariñas, Piura', number: '500126', account: 'Cuenta principal', invite_code: 'T9RB3L', created_at: '2026-08-18T12:00:00Z' },
  { id: 4, hub_name: 'MP de Talara', name: 'Defensa ribereña · Santa Rita', location: 'Talara, Piura', number: '500131', account: 'Cuenta principal', invite_code: 'H2CV6D', created_at: '2026-09-04T12:00:00Z' },
];

const fetchReal = window.fetch.bind(window);
window.fetch = async (url, opciones) => {
  const u = String(url);
  const json = (d) => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
  if (u.includes('/api/mi-trabajo')) return json({ pendientes: PENDIENTES });
  if (u.includes('/api/portal/hubs')) return json({ hubs: [{ id: 1, name: 'MP de Talara' }] });
  if (u.includes('/api/projects')) return json({ projects: OBRAS });
  return fetchReal(url, opciones);
};

const usuario = { id: 1, name: 'Ana Torres', email: 'ana@ejemplo.pe', role: 'admin' };
const pantalla = q.get('pantalla') || 'inicio';
createRoot(document.getElementById('root')).render(
  pantalla === 'proyectos'
    ? <SecureProjectsPage user={usuario} onSelectProject={() => {}} onLogout={() => {}} onBackToHub={() => {}} />
    : <HubPage user={usuario} onChooseDocs={() => {}} onLogout={() => {}} onAbrirRevision={() => {}} />
);
