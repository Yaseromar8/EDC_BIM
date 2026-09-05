import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { urlInventario, enlaceCompartido } from './utils/enlaceCompartido';
import './App.css';
import { resetFrenteSession } from './utils/frenteSession';
import TopBar from './components/TopBar';
import ViewsPanel from './components/ViewsPanel';
import SourceFilesPanel from './components/SourceFilesPanel';
import NativeFileTree from './components/NativeFileTree';
import Viewer from './components/Viewer';
import SecondaryViewer from './components/SecondaryViewer';
import ImportModelModal from './components/ImportModelModal';
import ErrorBoundary from './components/ErrorBoundary';
import DocumentPanel from './components/DocumentPanel';
import AddDocumentModal from './components/AddDocumentModal';
import LandingPage from './components/LandingPage'; // Import Landing Page
import LoginScreen from './components/LoginScreen';
import FilterConfiguratorModal from './components/FilterConfiguratorModal';
import NativeARView from './components/NativeARView';
import GeoControlPanel from './components/GeoControlPanel';
import { isNativeAR } from './native/arcore';
import PhotoAlbumModal from './components/PhotoAlbumModal';
import SheetViewerPanel from './components/SheetViewerPanel';
import LinkRevitBadge from './components/LinkRevitBadge';
import SectionCutTool from './components/SectionCutTool';
// Tablero de análisis: diferido (React.lazy) — sale del bundle inicial del visor.
const DashboardWorkspace = React.lazy(() => import('./components/dashboard/DashboardWorkspace'));
import ProgressDetailPanel from './components/ProgressDetailPanel';
import DocumentManager from './components/DocumentManager';
import DocPinPanel from './components/DocPinPanel';
import InventoryDataGrid from './components/InventoryDataGrid';
import BudgetTree from './components/BudgetTree';
import TandemSidebar from './components/TandemSidebar';
import TandemFilterPanel, { restoreSourceTints } from './components/TandemFilterPanel';
import PdfReader from './components/PdfReader';
import CompareView from './components/CompareView';
import LOB4DPanel from './components/LOB4DPanel';
import ProfilePanel from './components/ProfilePanel';
import ViewerLabelsBar from './components/ViewerLabelsBar';


import { uploadFile } from './services/uploadService';
import { processPendingUploads, getPendingThumbnails } from './services/uploadQueue';
import { apiFetch } from './utils/apiFetch';
import { getCachedInventory, setCachedInventory } from './utils/inventoryCache';

import { App as CapacitorApp } from '@capacitor/app';
import { BackgroundTask } from '@capawesome/capacitor-background-task';
import { Network } from '@capacitor/network';

// =====================================================================
// NORMALIZACIÓN DE CATEGORÍAS REVIT (ES → EN)
// Revit exporta categorías en el idioma del template.
// Este mapa unifica las categorías en español a su equivalente inglés
// para que los filtros no muestren duplicados ("Muros" + "Walls").
// =====================================================================
const REVIT_CATEGORY_ES_TO_EN = {
  'Muros': 'Walls',
  'Suelos': 'Floors',
  'Modelos genéricos': 'Generic Models',
  'Armadura estructural': 'Structural Rebar',
  'Bordes de losa': 'Slab Edges',
  'Aparatos sanitarios': 'Plumbing Fixtures',
  'Puertas': 'Doors',
  'Ventanas': 'Windows',
  'Pilares estructurales': 'Structural Columns',
  'Pilares': 'Columns',
  'Vigas': 'Beams',
  'Techos': 'Ceilings',
  'Cubiertas': 'Roofs',
  'Escaleras': 'Stairs',
  'Tramos': 'Stair Runs',
  'Descansillos': 'Stair Landings',
  'Barandillas': 'Railings',
  'Líneas': 'Lines',
  'Tuberías': 'Pipes',
  'Conductos': 'Ducts',
  'Bandejas de cables': 'Cable Trays',
  'Mobiliario': 'Furniture',
  'Equipos mecánicos': 'Mechanical Equipment',
  'Equipos eléctricos': 'Electrical Equipment',
  'Iluminación': 'Lighting Fixtures',
  'Rampas': 'Ramps',
  'Áreas': 'Areas',
  'Habitaciones': 'Rooms',
  'Niveles': 'Levels',
  'Rejillas': 'Grids',
  'Cimentación estructural': 'Structural Foundations',
  'Conexiones estructurales': 'Structural Connections',
  'Armazón estructural': 'Structural Framing',
  'Estructura': 'Structural Framing',
  'Refuerzo de área estructural': 'Structural Area Reinforcement',
  'Refuerzo de trayectoria estructural': 'Structural Path Reinforcement',
  'Cerramientos': 'Curtain Walls',
  'Montantes de cerramiento': 'Curtain Wall Mullions',
  'Paneles de cerramiento': 'Curtain Panels',
  'Sistemas de tuberías': 'Piping Systems',
  'Accesorios de tuberías': 'Pipe Fittings',
  'Accesorios de tubería': 'Pipe Fittings',
  'Topografía': 'Topography',
  'Vegetación': 'Planting',
  'Forjados': 'Floors',
};

/**
 * Normaliza una categoría de Revit:
 * 1. Traduce español → inglés
 * 2. Detecta nombres de archivo usados como categoría (modelos vinculados)
 */
function normalizeRevitCategory(rawCat) {
  if (!rawCat || rawCat === '(Unassigned)') return rawCat || '(Unassigned)';
  const trimmed = String(rawCat).trim();
  // Paso 1: Detectar nombres de archivo (linked models)
  // Patrones: contiene .dwg/.rvt/.ifc, o es solo MAYÚSCULAS+números+guiones
  if (/\.(dwg|rvt|ifc|nwc|nwd)$/i.test(trimmed)) return '(Linked Model)';
  if (/^[A-Z0-9_\-]+$/.test(trimmed) && trimmed.length > 3) return '(Linked Model)';
  // Paso 2: Normalizar idioma
  return REVIT_CATEGORY_ES_TO_EN[trimmed] || trimmed;
}


const ARIcon = () => (
  <svg className="rail-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5,3A2,2,0,0,0,3,5V9a1,1,0,0,0,2,0V5H9a1,1,0,0,0,0-2Z" />
    <path d="M19,3H15a1,1,0,0,0,0,2h4V9a1,1,0,0,0,2,0V5A2,2,0,0,0,19,3Z" />
    <path d="M19,19H15a1,1,0,0,0,0,2h4a2,2,0,0,0,2-2V15a1,1,0,0,0-2,0Z" />
    <path d="M5,19V15a1,1,0,0,0-2,0v4a2,2,0,0,0,2,2H9a1,1,0,0,0,0-2Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const FilterIcon = () => (
  <svg
    className="rail-icon"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M21.5,3.54a1.53,1.53,0,0,0-1.4-.73H3.91a1.52,1.52,0,0,0-1.4.73A1.77,1.77,0,0,0,2.7,5.43c.5.82,5.34,8.2,6.2,9.51v4.72c0,1.82,1.11,2.06,2.07,2.06h.91a.25.25,0,0,0,.12,0,.25.25,0,0,0,.12,0H13c1,0,2.07-.24,2.07-2.06V14.94c.86-1.31,5.7-8.69,6.2-9.51A1.81,1.81,0,0,0,21.5,3.54ZM20,4.65c-.52.85-6.24,9.57-6.29,9.66a.74.74,0,0,0-.13.41v4.94a1.23,1.23,0,0,1-.06.5,1.15,1.15,0,0,1-.51.06h-.91a.25.25,0,0,0-.12,0,.25.25,0,0,0-.12,0H11c-.45,0-.5,0-.5,0a1.05,1.05,0,0,1-.07-.51V14.72a.73.73,0,0,0-.12-.41C10.22,14.22,4.5,5.5,4,4.65a1.19,1.19,0,0,1-.15-.34H20.17A1,1,0,0,1,20,4.65Z" />
  </svg>
);

const GearIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 18 18"
    fill="currentColor"
  >
    <path d="M1.5 6.645v-.06a.398.398 0 0 0 0 .098v.067-.105ZM16.307 11.1a2.43 2.43 0 0 1-1.073-2.542 2.4 2.4 0 0 1 1.073-1.538.563.563 0 0 0 .187-.75l-1.387-2.377a.563.563 0 0 0-.75-.225c-.468.217-.994.28-1.5.18a2.407 2.407 0 0 1-1.905-2.19.562.562 0 0 0-.563-.525h-2.76a.555.555 0 0 0-.562.517 1.83 1.83 0 0 1-.053.345A2.377 2.377 0 0 1 6.001 3.51a2.43 2.43 0 0 1-1.808.338 2.775 2.775 0 0 1-.532-.173.563.563 0 0 0-.75.218L1.5 6.248a.54.54 0 0 0-.075.285V6.645c.019.04.044.075.075.105.02.068.056.13.105.18.032.036.07.067.112.09l.105.075a2.385 2.385 0 0 1-.112 4.005.563.563 0 0 0-.188.75l1.38 2.4a.563.563 0 0 0 .75.218c.469-.217.994-.28 1.5-.18a2.408 2.408 0 0 1 1.898 2.1.562.562 0 0 0 .555.502h2.782a.57.57 0 0 0 .563-.502c0-.083 0-.165.037-.248a2.414 2.414 0 0 1 2.858-1.89c.182.046.36.106.532.18a.562.562 0 0 0 .75-.225l1.373-2.347a.563.563 0 0 0-.195-.758Zm-1.935 2.153a3.525 3.525 0 0 0-4.44 2.498H8.086a3.51 3.51 0 0 0-2.693-2.573 3.427 3.427 0 0 0-1.762.075l-.878-1.5a3.518 3.518 0 0 0 1.148-1.958 3.54 3.54 0 0 0-1.155-3.412l.892-1.5.293.067a3.518 3.518 0 0 0 4.177-2.7h1.785a3.533 3.533 0 0 0 2.723 2.685 3.48 3.48 0 0 0 1.755-.075l.9 1.5a3.525 3.525 0 0 0 0 5.325l-.9 1.568ZM9 6a3.068 3.068 0 1 0 3.067 3.068A3.075 3.075 0 0 0 9.001 6Zm0 5.01a1.942 1.942 0 1 1 1.942-1.942 1.95 1.95 0 0 1-1.942 1.935v.007ZM1.816 7.088a.285.285 0 0 1-.098-.045.532.532 0 0 1-.262-.36.398.398 0 0 1 0-.098v.06l.045.105c.02.068.056.13.105.18.032.036.07.067.112.09l.098.068Z" />
  </svg>
);

const RevertIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M19.77,13.69A5.75,5.75,0,0,1,14,19.43H6.43a.75.75,0,0,1,0-1.5H14a4.24,4.24,0,0,0,0-8.48H6.6l1.82,2.12a.75.75,0,0,1-.57,1.24.76.76,0,0,1-.57-.26L4.4,9.18a.74.74,0,0,1,0-1L7.28,4.84a.76.76,0,0,1,1.06-.08.75.75,0,0,1,.08,1.06L6.6,8H14A5.74,5.74,0,0,1,19.77,13.69Z" />
  </svg>
);

const ClusterIconTandem = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M2.13,12.43a.34.34,0,0,0-.09.08.57.57,0,0,1,.18-.12Zm-.26,1a.63.63,0,0,1-.07-.26A.77.77,0,0,0,1.87,13.38Zm20.31-.52a.54.54,0,0,0-.1-.22.49.49,0,0,0-.12-.13l-.09-.08-.08,0h0l-.1,0-4.2-2V5.09a.69.69,0,0,0,0-.2.54.54,0,0,0-.11-.23l-.1-.12,0,0a.57.57,0,0,0-.13-.08s0,0,0,0L12.4,2.21l-.08,0a.72.72,0,0,0-.54,0,.51.51,0,0,0-.17.07L7,4.41s0,0,0,0h0l0,0-.05,0-.06,0a.76.76,0,0,0-.11.14.81.81,0,0,0-.12.4v5.26l-4.19,2-.11.05a.57.57,0,0,0-.18.12.61.61,0,0,0-.13.15.48.48,0,0,0-.08.16,1.13,1.13,0,0,0,0,.18h0s0,0,0,.05v5.85a.76.76,0,0,0,.45.69L7,21.69l.09,0a.76.76,0,0,0,.21,0,.78.78,0,0,0,.22,0l.09,0,4.43-2,4.42,2,.09,0a.76.76,0,0,0,.21,0,.78.78,0,0,0,.22,0l.09,0,4.73-2.09a.75.75,0,0,0,.44-.69V13.06A.69.69,0,0,0,22.18,12.86Zm-15.66,7L3.29,18.42v-4.2l3.23,1.43Zm.76-5.51L4.34,13l2.88-1.37h0l0,0,0,0h0L10.2,13Zm4,4.08L8,19.85v-4.2l3.23-1.43Zm0-6.54L8,10.35V6.24l3.23,1.43ZM9.08,5.07,12,3.68l2.93,1.39L12,6.36ZM16,6.24v4.11l-3.23,1.53V7.67Zm0,13.61-3.23-1.43v-4.2L16,15.65Zm.76-5.51L13.8,13l2.88-1.37.05,0,.05,0L19.66,13Zm4,4.08-3.23,1.43v-4.2l3.23-1.43ZM7.31,11.67H7.23l0,0ZM6.88,4.45l0,0h0Zm9.9,7.22h-.1l.05,0Zm.44-7.15a.57.57,0,0,0-.13-.08l.05,0Z" />
  </svg>
);

const SearchIconTandem = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
    <path d="M20.59,19.53l-5.32-5.32a6.76,6.76,0,1,0-1.06,1.06l5.32,5.32a.74.74,0,0,0,.53.22.71.71,0,0,0,.53-.22A.74.74,0,0,0,20.59,19.53ZM4.75,10A5.25,5.25,0,1,1,10,15.25,5.26,5.26,0,0,1,4.75,10Z" />
  </svg>
);

const PaletteIconTandem = () => (
  <svg viewBox="0 0 17 17" width="16" height="16" fill="currentColor">
    <path fillRule="evenodd" d="M16 8.39785C16.0013 8.67363 15.948 8.94693 15.8431 9.20189C15.7382 9.45685 15.5838 9.68839 15.3889 9.88306L10.2409 15.043C9.84594 15.4362 9.3119 15.6569 8.75527 15.6569C8.19863 15.6569 7.66459 15.4362 7.26966 15.043L1.44181 9.21701L1.30433 9.34716C1.25144 9.40083 1.18839 9.44338 1.11887 9.4723C1.04935 9.50123 0.974775 9.51594 0.89951 9.51558C0.824181 9.51638 0.749473 9.50186 0.679897 9.47291C0.61032 9.44397 0.547317 9.40119 0.494692 9.34716C0.387415 9.2395 0.327158 9.09356 0.327158 8.9414C0.327158 8.78925 0.387415 8.64331 0.494692 8.53565L0.983528 8.05334L8.31608 0.688512L8.36191 0.627266H8.40773L8.85838 0.167921C8.96579 0.0603959 9.11139 0 9.2632 0C9.415 0 9.5606 0.0603959 9.66801 0.167921C9.77529 0.27558 9.83555 0.421517 9.83555 0.573676C9.83555 0.725834 9.77529 0.871771 9.66801 0.97943L9.53817 1.11723L15.3584 6.95091C15.7551 7.33208 15.9857 7.85484 16 8.4055V8.39785ZM2.8243 7.81601H14.648C14.6295 7.77802 14.6035 7.74417 14.5717 7.71649L8.75145 1.89046L2.8243 7.81601ZM2.30491 14.4076C2.02162 13.7108 1.64379 13.0564 1.18212 12.463C0.717517 13.0544 0.339445 13.7092 0.0593219 14.4076C0.0012077 14.5871 -0.0144889 14.7776 0.0134716 14.9642C0.0414321 15.1508 0.112284 15.3283 0.220433 15.4827C0.328583 15.6372 0.471068 15.7643 0.636641 15.8541C0.802213 15.9438 0.986339 15.9938 1.17448 16C1.36328 15.9949 1.54829 15.9458 1.71483 15.8566C1.88137 15.7673 2.02484 15.6403 2.13384 15.4857C2.24285 15.3311 2.31437 15.1532 2.34274 14.966C2.37112 14.7789 2.35555 14.5877 2.29728 14.4076H2.30491Z" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
);

const TargetIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
    <line x1="12" y1="2" x2="12" y2="22" />
    <line x1="2" y1="12" x2="22" y2="12" />
  </svg>
);


const DEFAULT_VISIBLE_VALUES = 5;

const FolderIcon = () => (
  <svg
    className="rail-icon"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M21.208 7.84812V5.57112C21.208 4.69012 20.494 3.97612 19.613 3.97612H11.574L11.363 3.76612C11.222 3.62512 11.032 3.54712 10.834 3.54712H5.99199C4.00399 3.54712 2.38599 5.16512 2.38599 7.15312V16.8461C2.38599 18.8341 4.00399 20.4521 5.99199 20.4521H18.008C19.996 20.4521 21.614 18.8341 21.614 16.8461V9.47512C21.614 8.88612 21.459 8.33812 21.208 7.84712V7.84812ZM20.114 16.8471C20.114 18.0081 19.169 18.9531 18.008 18.9531H5.99199C4.83099 18.9531 3.88599 18.0081 3.88599 16.8471V7.15312C3.88599 5.99212 4.83099 5.04712 5.99199 5.04712H10.524L12.636 7.15112C12.777 7.29212 12.967 7.37012 13.165 7.37012H18.007C19.168 7.37012 20.113 8.31512 20.113 9.47612V16.8471H20.114Z" />
  </svg>
);

const DocumentIcon = () => (
  <svg
    className="rail-icon"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M20.208,7.848H12.574l-.211-.21c-.141-.141-.331-.219-.529-.219H5.992c-1.988,0-3.606,1.618-3.606,3.606v9.693 c0,1.988,1.618,3.606,3.606,3.606h14.216c1.988,0,3.606-1.618,3.606-3.606V11.454C23.814,9.466,22.196,7.848,20.208,7.848z M22.314,20.733c0,1.161-.945,2.106-2.106,2.106H5.992c-1.161,0-2.106-.945-2.106-2.106V10.865c0-1.161,.945-2.106,2.106-2.106 h5.32l2.112,2.104c.141,.141,.331,.219,.529,.219h6.255c1.161,0,2.106,.945,2.106,2.106V20.733z" />
    <path d="M15.5,12.5h-5c-.276,0-.5,.224-.5,.5v7.5h6v-7.5C16,12.724,15.776,12.5,15.5,12.5z M14.5,19h-3v-5h3V19z" />
    <rect x="11.5" y="15" width="1" height="1" />
    <rect x="13.5" y="15" width="1" height="1" />
  </svg>
);


const ProgressIcon = () => (
  <svg
    className="rail-icon"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="18" y1="20" x2="18" y2="10"></line>
    <line x1="12" y1="20" x2="12" y2="4"></line>
    <line x1="6" y1="20" x2="6" y2="14"></line>
  </svg>
);




const FourDIcon = () => (
  <svg className="rail-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 21 13 3"></path>
    <path d="M17 21 11 3"></path>
    <path d="M8.3 17h7.4"></path>
    <path d="M9.6 13h4.8"></path>
    <path d="M10.8 9h2.4"></path>
  </svg>
);

const CivilRoadIcon = () => (
  <svg className="rail-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 22L9 2" />
    <path d="M20 22L15 2" />
    <path d="M12 22v-4" />
    <path d="M12 14v-4" />
    <path d="M12 6V2" />
  </svg>
);

const InventoryIcon = () => (
  <svg
    className="rail-icon"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
  >
    <path d="M20,3.5H4a2,2,0,0,0-2,2v13a2,2,0,0,0,2,2H20a2,2,0,0,0,2-2v-13A2,2,0,0,0,20,3.5ZM20.5,18.5a.5.5,0,0,1-.5.5H15.75V12.75h4.75ZM20.5,11.25H15.75V5h4.25a.5.5,0,0,1,.5.5ZM14.25,12.75v6.25H9.75v-6.25ZM9.75,11.25V5h4.5v6.25ZM8.25,12.75v6.25H4a.5.5,0,0,1-.5-.5v-5.75ZM3.5,11.25V5.5A.5.5,0,0,1,4,5H8.25v6.25Z" />
  </svg>
);

const BudgetIcon = () => (
  <svg className="rail-icon" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
    <path d="M7 12h2v5H7zm4-3h2v8h-2zm4-3h2v11h-2z"/>
  </svg>
);

const PALETTE = [
  'rgb(0, 255, 255)',   // Cyan
  'rgb(138, 43, 226)',  // Purple
  'rgb(0, 0, 205)',     // Dark Blue
  'rgb(255, 127, 127)', // Light Red
  'rgb(127, 255, 163)', // Light Green
  'rgb(199, 127, 255)', // Medium Purple
  'rgb(255, 235, 127)', // Yellow
  'rgb(127, 237, 255)', // Light Cyan
  'rgb(192, 192, 192)', // Silver
  'rgb(0, 100, 0)',     // Dark Green
  'rgb(25, 25, 112)'    // Dark Navy
];

const normalizePropertyList = (detail = []) => {
  return detail.map((item, index) => {
    if (typeof item === 'string') {
      return {
        id: `general::${item}`,
        name: item,
        category: 'General',
        group: 'Property',
        path: item,
        sampleValue: null,
        units: null
      };
    }
    const category = item.category || 'General';
    const name = item.name || item.displayName || `Property ${index + 1}`;
    const id = item.id || `${category}::${name}`;
    const group = item.group || item.attribute || item.type || 'Property';
    return {
      id,
      name,
      category,
      group,
      path: item.path || [category, group].filter(Boolean).join(' ▸ '),
      sampleValue: item.sampleValue ?? item.value ?? null,
      units: item.units || null
    };
  });
};

const groupProperties = (properties, query = '') => {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? properties.filter(prop =>
      prop.name.toLowerCase().includes(normalizedQuery) ||
      (prop.path || '').toLowerCase().includes(normalizedQuery)
    )
    : properties;
  const map = new Map();
  filtered.forEach(prop => {
    const label = prop.category || 'General';
    if (!map.has(label)) {
      map.set(label, []);
    }
    map.get(label).push(prop);
  });
  return Array.from(map.entries())
    .map(([label, props]) => ({
      id: label,
      label,
      properties: props.sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

const formatPropertyValue = value => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().split('T')[0];
  if (typeof value === 'object') {
    if (value.displayValue !== undefined) return formatPropertyValue(value.displayValue);
    return JSON.stringify(value);
  }
  return String(value);
};

const getPropertyKeyFromRaw = prop => {
  const category = prop.displayCategory || prop.category || 'General';
  const name = prop.displayName || 'Unnamed';
  return `${category}::${name}`;
};

function FilterConfigurator({
  open,
  availableProperties,
  selectedIds,
  onClose,
  onSave,
  onReset
}) {
  const [pendingSelection, setPendingSelection] = useState(selectedIds);
  const [availableQuery, setAvailableQuery] = useState('');
  const [selectedQuery, setSelectedQuery] = useState('');
  const [hideLocations, setHideLocations] = useState(false);
  const [includeMultiLevel, setIncludeMultiLevel] = useState(false);

  useEffect(() => {
    if (open) {
      setPendingSelection(selectedIds);
      setAvailableQuery('');
      setSelectedQuery('');
    }
  }, [open, selectedIds]);

  const addProp = propId => {
    if (!pendingSelection.includes(propId)) {
      setPendingSelection(prev => [...prev, propId]);
    }
  };

  const removeProp = propId => {
    setPendingSelection(prev => prev.filter(id => id !== propId));
  };

  const handleSave = () => {
    onSave?.(pendingSelection);
    onClose?.();
  };

  if (!open) return null;

  const availableGroups = groupProperties(availableProperties, availableQuery);
  const propertyMap = new Map(availableProperties.map(prop => [prop.id, prop]));

  // Selected details
  const selectedDetails = pendingSelection
    .map(id => propertyMap.get(id))
    .filter(Boolean)
    .filter(prop => {
      const q = selectedQuery.trim().toLowerCase();
      if (!q) return true;
      return prop.name.toLowerCase().includes(q) || (prop.path || '').toLowerCase().includes(q);
    });

  return (
    <div className="modal-overlay filters-config-overlay">
      <div className="filters-config-panel" style={{ width: '900px', maxWidth: '95vw', height: '70vh', display: 'flex', flexDirection: 'column' }}>

        <header className="filters-config-header">
          <div>
            <h3>Edit Filters</h3>
            <p>Select properties to display in the filters panel. Use (+) to add and Trash icon to remove.</p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>

        <div className="filters-config-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', flex: 1, overflow: 'hidden', padding: '20px' }}>

          {/* LEFT: AVAILABLE */}
          <section style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(30, 30, 30, 0.4)' }}>
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ color: '#e0e0e0' }}>Available Properties</strong>
                <small style={{ color: '#999' }}>{availableGroups.reduce((acc, g) => acc + g.properties.length, 0)} items</small>
              </div>
              <input
                type="search"
                placeholder="Search properties..."
                value={availableQuery}
                onChange={e => setAvailableQuery(e.target.value)}
                style={{ width: '100%', background: '#222', border: '1px solid #444', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '13px' }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
              {availableGroups.map(group => (
                <details key={group.id} open style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <summary style={{ padding: '10px 12px', cursor: 'pointer', background: 'rgba(255,255,255,0.02)', fontWeight: 600, fontSize: '12px', color: '#ccc' }}>
                    {group.label}
                  </summary>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {group.properties.map(prop => {
                      const isSelected = pendingSelection.includes(prop.id);
                      return (
                        <li key={prop.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid rgba(255,255,255,0.02)', opacity: isSelected ? 0.5 : 1 }}>
                          <div style={{ overflow: 'hidden', marginRight: '8px' }}>
                            <div style={{ fontSize: '13px', color: '#eee', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={prop.name}>{prop.name}</div>
                            <div style={{ fontSize: '11px', color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={prop.path}>{prop.path}</div>
                          </div>
                          {!isSelected && (
                            <button
                              onClick={() => addProp(prop.id)}
                              style={{ background: 'transparent', border: '1px solid #444', borderRadius: '4px', color: '#4ade80', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                              title="Add to filters"
                            >
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </button>
                          )}
                          {isSelected && <span style={{ fontSize: '11px', color: '#666' }}>Added</span>}
                        </li>
                      );
                    })}
                  </ul>
                </details>
              ))}
              {!availableGroups.length && <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No properties found.</div>}
            </div>
          </section>

          {/* RIGHT: SELECTED */}
          <section style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(30, 30, 30, 0.4)' }}>
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ color: '#e0e0e0' }}>Selected Properties</strong>
                <small style={{ color: '#999' }}>{pendingSelection.length} selected</small>
              </div>
              <input
                type="search"
                placeholder="Filter selected..."
                value={selectedQuery}
                onChange={e => setSelectedQuery(e.target.value)}
                style={{ width: '100%', background: '#222', border: '1px solid #444', color: 'white', padding: '8px', borderRadius: '4px', fontSize: '13px' }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0' }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {selectedDetails.map(prop => (
                  <li key={prop.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', background: 'rgba(59, 130, 246, 0.05)' }}>
                    <div style={{ flex: 1, overflow: 'hidden', marginRight: '10px' }}>
                      <div style={{ fontSize: '13px', color: '#fff' }}>{prop.name}</div>
                      <div style={{ fontSize: '11px', color: '#888' }}>{prop.category} &rsaquo; {prop.group}</div>
                    </div>
                    <button
                      onClick={() => removeProp(prop.id)}
                      style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                      title="Remove"
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                  </li>
                ))}
                {!selectedDetails.length && <div style={{ padding: '30px', textAlign: 'center', color: '#666', fontSize: '13px' }}>No properties selected.<br />Add properties from the left panel.</div>}
              </ul>
            </div>
          </section>

        </div>

        <footer className="filters-config-footer" style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(0,0,0,0.2)' }}>
          <div>
            {/* Options can go here if needed */}
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="secondary-btn" onClick={() => onReset?.()} style={{ background: 'transparent', border: '1px solid #444', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
              Reset Default
            </button>
            <button className="primary-btn" onClick={handleSave} style={{ background: 'var(--alephia-interactive)', border: 'none', color: 'white', padding: '8px 24px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>
              Update
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}








const BACKEND_URL = (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ? 'https://visor-ecd-backend.onrender.com' : (import.meta.env.VITE_BACKEND_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:3000' : (typeof window !== 'undefined' && window.location.hostname.match(/^\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}$/) ? `http://${window.location.hostname}:3000` : 'https://visor-ecd-backend.onrender.com')));

// El ayudante vive en utils/enlaceCompartido.js (lo comparten App y la
// rejilla del inventario).

console.log('[App] Initializing. Platform:', Capacitor.getPlatform(), 'Backend:', BACKEND_URL);
console.log('[App] Version: 1.0.3 - Mobile Connection & UI Cleanup applied.');

const ACC_PROJECT_ID = 'b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d';

// ─── Auth Bypass (retirado) ─────────────────────────────────────────────────
// Quedó en true de una demo antigua y su efecto real era dejar el visor SIN
// botón de cerrar sesión (onLogout={null} más abajo): no había forma de salir
// de la cuenta. El gate de login nunca dependió de esta constante — vive en
// `!user && !_hasSession && !isSharedMode`.
const BYPASS_AUTH = false;

function App() {
  const [user, setUser] = useState(() => {
    // Con try/catch: un visor_user corrupto lanzaba dentro del inicializador
    // de useState y la app arrancaba en pantalla blanca, sin forma de llegar
    // al login para arreglarlo.
    try {
      const saved = localStorage.getItem('visor_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      localStorage.removeItem('visor_user');
      localStorage.removeItem('visor_session_token');
      return null;
    }
  });

  const handleLoginSuccess = useCallback((userData) => {
    localStorage.setItem('visor_user', JSON.stringify(userData));
    if (userData.session_token) {
      localStorage.setItem('visor_session_token', userData.session_token);
    }
    setUser(userData);
  }, []);

  // REVALIDAR LA SESIÓN AL ARRANCAR.
  // El visor se creía el `visor_user` de localStorage y no lo comprobaba nunca.
  // Un rol guardado mal o un token caducado dejaban la interfaz mintiendo (por
  // ejemplo, escondiendo módulos a un admin) hasta que algo fallaba con un
  // mensaje que no explicaba nada. Se le pregunta al servidor quién eres: así
  // los cambios de rol surten efecto, y si el token ya no vale se cierra sesión
  // en vez de dejar media pantalla rota.
  useEffect(() => {
    if (!user) return;
    if (new URLSearchParams(window.location.search).get('sso_ticket')) return;
    let cancelado = false;
    apiFetch(`${BACKEND_URL}/api/auth/me`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('sesión no válida'))))
      .then(u => {
        if (cancelado || !u?.id) return;
        if (u.role !== user.role || u.email !== user.email) {
          const fresco = { ...user, ...u };
          localStorage.setItem('visor_user', JSON.stringify(fresco));
          setUser(fresco);
        }
      })
      .catch(() => {
        if (cancelado) return;
        // Limpieza explícita en vez de llamar a handleLogout, que se declara
        // más abajo: así no se depende del orden de definición.
        localStorage.removeItem('visor_user');
        localStorage.removeItem('visor_session_token');
        localStorage.removeItem('visor_selectedProject');
        setUser(null);
      });
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // SSO desde Docs: el URL contiene sólo un ticket efímero y de un único uso,
  // nunca el token de sesión reutilizable.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ticket = params.get('sso_ticket');
    if (!ticket) return;
    fetch(`${BACKEND_URL}/api/auth/handoff/exchange`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket }) })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!data?.session_token) return null;
        localStorage.setItem('visor_session_token', data.session_token);
        return apiFetch(`${BACKEND_URL}/api/auth/me`).then(r => (r.ok ? r.json() : null)).then(u => ({ u, token: data.session_token }));
      })
      .then(result => {
        if (result?.u?.id) {
          const userData = { ...result.u, session_token: result.token };
          localStorage.setItem('visor_user', JSON.stringify(userData));
          setUser(userData);
        }
      })
      .catch(() => { /* si falla, el visor sigue con lo que haya en localStorage */ })
      .finally(() => {
        params.delete('sso_ticket');
        params.delete('pick');   // este efecto guarda su propia copia del URL
        const qs = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
      });
  }, []);

  // `pick` cumplió su función en el arranque: fuera del URL para que un
  // refresco no reabra el selector si ya elegiste modelo.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('pick')) return;
    params.delete('pick');
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
  }, []);

  // ── PERMISOS por módulo (prueba de producción) ────────────────────────────
  // Civil, 4D LOB y BIM 5D: solo admin. Los demás usuarios ven el botón opaco
  // y al clickear reciben un aviso. (Gate simple de UI; el backend ya exige
  // sesión para los datos.)
  const isAdminUser = user?.role === 'admin';
  const [permToast, setPermToast] = useState(null);
  const permToastTimer = useRef(null);
  const denyAccess = useCallback((moduleName) => {
    setPermToast(`🔒 No tienes permisos para ${moduleName}. Solicítalo al administrador.`);
    if (permToastTimer.current) clearTimeout(permToastTimer.current);
    permToastTimer.current = setTimeout(() => setPermToast(null), 3200);
  }, []);
  const restrictedRailStyle = isAdminUser ? undefined : { opacity: 0.35, cursor: 'not-allowed' };

  const handleLogout = useCallback(() => {
    localStorage.removeItem('visor_user');
    localStorage.removeItem('visor_session_token');
    localStorage.removeItem('visor_selectedProject');
    setUser(null);
    setSelectedProject(null);
  }, []);

  useEffect(() => {
    const onAuthExpired = () => handleLogout();
    window.addEventListener('auth-expired', onAuthExpired);
    return () => window.removeEventListener('auth-expired', onAuthExpired);
  }, [handleLogout]);

  // ── ESTABILIDAD: observabilidad global de errores ──────────────────────────
  // Promesas sin catch quedaban como "Uncaught (in promise)" ANÓNIMOS (sin
  // causa) y los errores de listeners morían en silencio. Aquí les damos
  // nombre y quedan en un buffer (window.__stabilityLog) para diagnóstico.
  const [webglLost, setWebglLost] = useState(false);
  useEffect(() => {
    window.__stabilityLog = window.__stabilityLog || [];
    const push = (kind, detail) => {
      window.__stabilityLog.push({ kind, detail: String(detail).slice(0, 400), at: new Date().toISOString() });
      if (window.__stabilityLog.length > 100) window.__stabilityLog.shift();
    };
    const onRejection = (ev) => {
      push('unhandledrejection', ev.reason?.stack || ev.reason);
      console.error('[Estabilidad] Promesa sin catch:', ev.reason);
    };
    const onError = (ev) => push('window.onerror', ev.message);
    const onGlLost = () => setWebglLost(true);
    const onGlRestored = () => setWebglLost(false);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onError);
    window.addEventListener('viewer-webgl-lost', onGlLost);
    window.addEventListener('viewer-webgl-restored', onGlRestored);
    return () => {
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onError);
      window.removeEventListener('viewer-webgl-lost', onGlLost);
      window.removeEventListener('viewer-webgl-restored', onGlRestored);
    };
  }, []);

  // ── CAPACITOR BACKGROUND SYNC ──
  useEffect(() => {
    if (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.isNativePlatform()) {
      // Listen for Backgrounding
      CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) {
          // App went to background, keep thread alive for queue
          const taskId = await BackgroundTask.beforeExit(async () => {
            console.log('[App] Background Task started to flush upload queue');
            if (window.onPhotoUploadedCallback_for_background) {
              await processPendingUploads(window.onPhotoUploadedCallback_for_background, () => BACKEND_URL);
            }
            BackgroundTask.finish({ taskId });
          });
        } else {
          // App returned to foreground
          if (window.onPhotoUploadedCallback_for_background) {
            await processPendingUploads(window.onPhotoUploadedCallback_for_background, () => BACKEND_URL);
          }
        }
      });

      // Listen for Network Restoration
      Network.addListener('networkStatusChange', async status => {
        if (status.connected && window.onPhotoUploadedCallback_for_background) {
          console.log('[App] Network restored, flushing upload queue');
          await processPendingUploads(window.onPhotoUploadedCallback_for_background, () => BACKEND_URL);
        }
      });
    }
  }, []);

  const [models, setModels] = useState([]);
  // Espejo de `models` para leerlos desde temporizadores y callbacks sin
  // arrastrar una lista obsoleta (la restauracion de vistas pinta a +500 ms,
  // cuando la lista pudo haber cambiado).
  const modelsRef = useRef([]);
  const [relinkTargetModel, setRelinkTargetModel] = useState(null); // Relink State
  const [extractionJobs, setExtractionJobs] = useState({}); // Tracking BG extractions
  const pollIntervalsRef = useRef({}); // intervalos de sondeo de extracción por urn (para topar/limpiar)

  const [hiddenModelUrns, setHiddenModelUrns] = useState([]);
  useEffect(() => { modelsRef.current = models; }, [models]);

  // Shared View Mode
  const [isSharedMode, setIsSharedMode] = useState(() => !!new URLSearchParams(window.location.search).get('shareView'));
  const [sharedViewData, setSharedViewData] = useState(null);
  const [savedViews, setSavedViews] = useState([]); // New State
  const [documents, setDocuments] = useState([]);
  const [sprites, setSprites] = useState([]);
  const [activeSpriteId, setActiveSpriteId] = useState(null);
  const [showSprites, setShowSprites] = useState(false);
  const [spritePlacementActive, setSpritePlacementActive] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [compareMode, setCompareMode] = useState(false); // Comparador (contractual vs avance)
  const [panelVisible, setPanelVisible] = useState(false);
  const [inventoryTabOpen, setInventoryTabOpen] = useState(false);
  const [inventoryPanelHeight, setInventoryPanelHeight] = useState(280);
  const [budgetTabOpen, setBudgetTabOpen] = useState(false);
  const [budgetPoppedOut, setBudgetPoppedOut] = useState(false);
  const [budgetPanelHeight, setBudgetPanelHeight] = useState(320);
  const [lob4dTabOpen, setLob4dTabOpen] = useState(false);
  // Topografía: puntos de control + amarre modelo↔UTM (base del AR georref.)
  const [geoPanelOpen, setGeoPanelOpen] = useState(false);
  const [tableroOpen, setTableroOpen] = useState(false); // Tablero de análisis (gráficos desde Inventory)
  // Split real con el Tablero: el panel anuncia su ancho y el contenedor del
  // visor lo reserva (el ResizeObserver del Viewer hace viewer.resize()).
  const [tableroW, setTableroW] = useState(0);
  useEffect(() => {
    const onW = (e) => setTableroW(e.detail?.width || 0);
    window.addEventListener('tablero-width', onW);
    return () => window.removeEventListener('tablero-width', onW);
  }, []);
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const [isolatedExtIds, setIsolatedExtIds] = useState(null); // Lifted from InventoryDataGrid — persists across mount/unmount

  // window.postgresInventory es el inventario ya descargado, compartido para
  // que el grid no baje una segunda copia de 73 MB. Va SIEMPRE acompañado del
  // frente al que pertenece: sin esa marca, una descarga de Canal que termina
  // tarde deja sus filas en el global y el grid las muestra en Drenaje Urbano
  // como si fueran suyas. El consumidor compara la marca y, si no coincide,
  // descarga lo que le toca.
  const tagInventory = useCallback((rows, urn) => {
    window.postgresInventory = rows;
    window.postgresInventoryUrn = rows ? (urn || null) : null;
  }, []);


  // Popout Window Bridge: Forward events between visor and undocked inventory
  useEffect(() => {
    // From popout → parent: row click selection
    const handlePopoutMessage = (e) => {
      if (!e.data || !e.data.type) return;

      if (e.data.type === 'inventory-popout-select') {
        // Translate extId to dbId and trigger viewer selection
        const extId = e.data.extId;
        if (!extId || !window.rosettaToDbId) return;
        for (const urn in window.rosettaToDbId) {
          const mapping = window.rosettaToDbId[urn];
          if (mapping && mapping[extId]) {
            window.dispatchEvent(new CustomEvent('viewer-select', {
              detail: { dbIds: [mapping[extId]], urn }
            }));
            break;
          }
        }
      }

      if (e.data.type === 'inventory-dock') {
        // Re-open inline panel
        setInventoryTabOpen(true);
        window.__inventoryPopup = null;
      }
    };

    // From visor → popout: forward isolation & highlight events
    const forwardIsolation = (e) => {
      const ids = e.detail.isolatedExtIds;
      console.log(`[App.jsx 🔍] inventory-isolation-sync recibido: ${ids ? ids.length : 0} extIds`);
      // Persist isolation state in App.jsx (always mounted) so Inventory reads it on open
      if (!ids || ids.length === 0) {
        setIsolatedExtIds(null);
        // MASTER RESET: Solo limpiar filtros si el usuario realmente NO tiene filtros activos.
        // Si hay filtros activos del usuario (filterSelections con valores), el reset proviene
        // del sistema de filtros (feedback loop) y NO debemos borrar las selecciones.
        setFilterSelections(prev => {
          const hasActiveFilters = Object.keys(prev).some(k => prev[k] && prev[k].length > 0);
          if (hasActiveFilters) {
            console.log(`[App.jsx] Isolation CLEARED, pero filterSelections PRESERVADAS (${Object.keys(prev).length} filtros activos)`);
            return prev; // No mutar — el usuario tiene filtros activos
          }
          console.log(`[App.jsx] Isolation CLEARED, FilterSelections RESET (sin filtros activos)`);
          return {};
        });
      } else {
        setIsolatedExtIds(new Set(ids));
        console.log(`[App.jsx] Isolation SET: ${ids.length} elements (sample: ${ids.slice(0, 2).join(', ')})`);
      }
      // Forward to popout window if open
      if (window.__inventoryPopup && !window.__inventoryPopup.closed) {
        window.__inventoryPopup.postMessage({
          type: 'inventory-popout-isolation',
          isolatedExtIds: ids
        }, '*');
      }
    };

    const forwardHighlight = (e) => {
      if (window.__inventoryPopup && !window.__inventoryPopup.closed) {
        const { dbId, urn } = e.detail;
        const safeUrn = String(urn).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const urnDict = window.rosettaToExtId?.[urn] || window.rosettaToExtId?.[safeUrn];
        if (urnDict && urnDict[dbId]) {
          window.__inventoryPopup.postMessage({
            type: 'inventory-popout-highlight',
            extId: urnDict[dbId]
          }, '*');
        }
      }
    };

    window.addEventListener('message', handlePopoutMessage);
    window.addEventListener('inventory-isolation-sync', forwardIsolation);
    window.addEventListener('inventory-highlight-row', forwardHighlight);
    return () => {
      window.removeEventListener('message', handlePopoutMessage);
      window.removeEventListener('inventory-isolation-sync', forwardIsolation);
      window.removeEventListener('inventory-highlight-row', forwardHighlight);
    };
  }, []);

  // Budget Popout Window Bridge
  useEffect(() => {
    const handleBudgetMessage = (e) => {
      if (e.data?.type === 'budget-dock') {
        setBudgetTabOpen(true);
      }
    };
    window.addEventListener('message', handleBudgetMessage);
    return () => window.removeEventListener('message', handleBudgetMessage);
  }, []);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const [filterConfiguratorOpen, setFilterConfiguratorOpen] = useState(false);
  const [availableProperties, setAvailableProperties] = useState([]);
  const [filterProperties, setFilterProperties] = useState(['Standard::Sources', 'Standard::Revit Category']);

  const [filterSelections, setFilterSelections] = useState({});

  // "Mostrar todo" ejecutado DESDE el visor (menú contextual/Esc): el panel de
  // filtros debe reflejarlo. Sin esto, la escena mostraba todo pero el panel
  // seguía diciendo "1 of 8" — dos verdades distintas en pantalla.
  useEffect(() => {
    const onShowAll = () => {
      setFilterSelections(prev => (prev && Object.keys(prev).length ? {} : prev));
    };
    window.addEventListener('viewer-show-all', onShowAll);
    return () => window.removeEventListener('viewer-show-all', onShowAll);
  }, []);
  const [expandedFilters, setExpandedFilters] = useState({});
  const [facetSearch, setFacetSearch] = useState({}); // { [facetId]: { open: bool, query: string } }

  const [filterColors, setFilterColors] = useState({});

  // Seguimiento / Tracking State
  const [trackingTab, setTrackingTab] = useState(null); // 'avance' | 'fotos' | 'docs' | null
  const [trackingPlacementMode, setTrackingPlacementMode] = useState(false);
  const [trackingPinsVisible, setTrackingPinsVisible] = useState(true); // Ojo global de pins de seguimiento
  const [relocatingPin, setRelocatingPin] = useState(null); // { id, type } — pin being moved
  const [pinPrompt, setPinPrompt] = useState(null); // { pin, tab } — datos pendientes para crear pin (reemplaza prompt() nativo)
  // Placeholder Mock Data (Should match Viewer internal logic or pass down)
  const [trackingData, setTrackingData] = useState({
    avance: [],
    fotos: [],
    docs: [],
    restricciones: []
  });
  const [selectedProject, setSelectedProject] = useState(() => {
    // PRIORITY 1: URL params from Gateway Interceptor (frontend-docs navigation)
    // Must be checked SYNCHRONOUSLY here to prevent race condition where
    // the model-fetch useEffect fires with stale localStorage data before
    // the Gateway useEffect can update selectedProject.
    const params = new URLSearchParams(window.location.search);
    const projId = params.get('project');
    const frenteId = params.get('frente');
    if (projId && frenteId) {
      const frontName = params.get('fn') || `Frente ${frenteId}`;
      console.log(`[App] Gateway init: project=${projId}, frente=${frenteId}`);
      return {
        id: `${projId}_${frenteId}`,
        baseName: projId,
        frontId: frenteId,
        frontName: frontName,
        displayName: `${projId} - ${frontName}`,
        name: projId
      };
    }

    // PRIORITY 2: llegada desde el Hub -> selector de modelos, siempre.
    // Elegir producto (Hub) y elegir modelo son dos decisiones distintas: no se
    // salta la segunda por recordar la última sesión. Se borra también lo
    // guardado para que un refresco posterior no reviva el proyecto anterior.
    if (params.get('pick') === '1' || params.get('sso_ticket')) {
      localStorage.removeItem('visor_selectedProject');
      return null;
    }

    // PRIORITY 3: Restore from localStorage (page refresh without URL params)
    const saved = localStorage.getItem('visor_selectedProject');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.warn('Failed to parse saved project', e);
      }
    }
    return null;
  });

  // 💾 Persistencia local: Guardar el proyecto cuando cambie
  useEffect(() => {
    if (selectedProject) {
      localStorage.setItem('visor_selectedProject', JSON.stringify(selectedProject));
    } else {
      localStorage.removeItem('visor_selectedProject');
    }
  }, [selectedProject]);

  // 🔄 Reset al cambiar de frente — LO DE UN FRENTE SE QUEDA EN ESE FRENTE.
  //
  // La referencia guarda el último frente REAL, y salir a la lista de proyectos
  // (selectedProject = null) no la toca. Antes sí la borraba, y como para
  // cambiar de frente hay que pasar SIEMPRE por esa lista, al llegar al frente
  // nuevo el "anterior" ya era null y el reset no se ejecutaba nunca: los
  // colores y los paneles de Canal aparecían en Drenaje Urbano.
  const prevProjectIdRef = useRef(selectedProject?.id || null);
  useEffect(() => {
    const newId = selectedProject?.id || null;
    const prevId = prevProjectIdRef.current;

    // Salir a la lista de proyectos no es cambiar de frente: se conserva la
    // referencia para poder comparar cuando se entre al siguiente.
    if (newId === null) return;

    if (prevId && prevId !== newId) {
      console.log(`[App] Frente cambió: ${prevId} → ${newId}. Reiniciando el estado del frente anterior.`);

      // Todo el estado que vive en `window` — inventario, mapas de identidad,
      // filtros, colores, datos civiles — está DECLARADO en un solo sitio.
      // Ver utils/frenteSession.js: ahí se añade lo nuevo, no aquí.
      resetFrenteSession();

      // Y el estado que vive en React, que es el que dibuja la interfaz.
      setFilterSelections({});
      setFilterColors({});
      setHiddenModelUrns([]);
      setInventoryTabOpen(false);
      setIsolatedExtIds(null);
      setActivePanel(null);
      setPanelVisible(false);
    }

    prevProjectIdRef.current = newId;
  }, [selectedProject]);

  // 🚀 INTERCEPTOR DE PASARELA (Gateway interceptor)
  // The actual project initialization from URL params is now handled SYNCHRONOUSLY
  // in the useState initializer above. This useEffect only cleans up the URL
  // to prevent params from persisting on refresh.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('project') && params.get('frente')) {
      const url = new URL(window.location);
      url.searchParams.delete('project');
      url.searchParams.delete('frente');
      url.searchParams.delete('fn');
      window.history.replaceState({}, document.title, url.pathname + url.search);
    }
  }, []);



  const [showSplash, setShowSplash] = useState(false);
  const [selectedPinId, setSelectedPinId] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [minimapActive, setMinimapActive] = useState(false);
  const [vrActive, setVrActive] = useState(false);
  const [nativeArActive, setNativeArActive] = useState(false); // AR nativo (ARCore en APK)

  // Album Modal State
  const [photoAlbumOpen, setPhotoAlbumOpen] = useState(false);
  const [selectedAlbumPin, setSelectedAlbumPin] = useState(null);

  // Progress Panel State

  const [progressPanelOpen, setProgressPanelOpen] = useState(false);
  const [selectedProgressPin, setSelectedProgressPin] = useState(null);
  const [panelDocked, setPanelDocked] = useState(true); // Default to Docked instead of floating
  const [selectedElement, setSelectedElement] = useState(null); // New: Store { dbId, modelUrn } for detailed tracking

  // Doc Pin Panel State
  const [docPinPanelOpen, setDocPinPanelOpen] = useState(false);
  const [selectedDocPin, setSelectedDocPin] = useState(null);

  // AISLAMIENTO ENTRE FRENTES: al cambiar de frente se cierra TODO panel/overlay
  // que muestre datos del frente anterior. Sin esto, el álbum de una ZONA, el
  // comparador o un modal quedaban abiertos encima del frente nuevo — parecía
  // información cruzada entre frentes (era estado de UI sin limpiar, no datos).
  useEffect(() => {
    // Seguimiento (fotos / avance / docs por pin)
    setPhotoAlbumOpen(false);
    setSelectedAlbumPin(null);
    setProgressPanelOpen(false);
    setSelectedProgressPin(null);
    setDocPinPanelOpen(false);
    setSelectedDocPin(null);
    setSelectedElement(null);
    // Modos de pantalla completa (comparan/superponen modelos DEL frente)
    setCompareMode(false);
    setNativeArActive(false);
    // Modales (importar hereda además el guard del relink)
    setImportModalOpen(false);
    setRelinkTargetModel(null);
    setDocumentsModalOpen(false);
    setFilterConfiguratorOpen(false);
    // Lámina 2D abierta (pertenece a un modelo del frente anterior)
    setActiveLmvSheet(null);
    // Tablero de análisis (sus gráficos son del inventario del frente anterior)
    setTableroOpen(false);
  }, [selectedProject?.id]);

  // Presencia web para AUTO-DETECCIÓN de frente desde Revit: mientras haya un
  // frente abierto en el visor, latimos al backend; así el plugin "ECD Link"
  // descubre solo a qué frente engancharse (sin que lo escribas).
  useEffect(() => {
    const pid = selectedProject?.id;
    if (!pid) return undefined;
    // EN EL ENLACE COMPARTIDO NO SE LATE. El latido existe para que el plugin
    // de Revit descubra que frente tiene abierto EL USUARIO; un invitado sin
    // sesion no tiene nada que enganchar, asi que el POST solo podia devolver
    // 401 -- y lo hacia cada 5 segundos, para siempre, por cada invitado. En
    // la consola del supervisor se veia una cascada de errores en rojo (parece
    // roto) y al backend le llegaba una peticion inutil por invitado y por
    // lustro. Se corta en el origen.
    if (isSharedMode) return undefined;
    let stop = false;
    const beat = () => {
      apiFetch(`${BACKEND_URL}/api/link/web-presence`, {
        method: 'POST',
        body: JSON.stringify({ project: pid }),
      }).catch(() => { /* sin sesión o backend caído: no pasa nada */ });
    };
    beat();
    const id = setInterval(() => { if (!stop) beat(); }, 5000);
    return () => { stop = true; clearInterval(id); };
  }, [selectedProject?.id, isSharedMode]);



  const [sheets, setSheets] = useState([]); // To store 2D sheets
  const [activeSheet, setActiveSheet] = useState(null);
  // Lámina LMV de Revit abierta en el panel dividido (distinta de activeSheet,
  // que es para PDFs/documentos por URL)
  const [activeLmvSheet, setActiveLmvSheet] = useState(null);
  const [docPlacementMode, setDocPlacementMode] = useState(false);
  const [docs, setDocs] = useState([]); // Array of attached docs (legacy?) (Keeping for safety)
  const [docPins, setDocPins] = useState([]); // Array of { id, x, y, z, docs: [] }
  const [openedDoc, setOpenedDoc] = useState(null); // Currently viewing doc in Split Screen

  const toggleSpritesVisibility = () => setShowSprites(prev => !prev);

  // Removed fake ingestion state and polling

  const [isRailExpanded, setIsRailExpanded] = useState(true); // Added for responsive rail



  const [parallelMode, setParallelMode] = useState(false); // Floating vs Split Default False
  const [showDocManager, setShowDocManager] = useState(false); // Gestor Documental GCS

  // Viewable / Proposal Handling (Infraworks)
  const [modelViews, setModelViews] = useState({}); // { urn: [ { guid, name } ] }
  const [activeViewableGuids, setActiveViewableGuids] = useState({}); // { urn: guid }

  // Universal Search State
  const [universalSearch, setUniversalSearch] = useState({
    query: '',
    answer: '',
    results: [],
    loading: false
  });
  const [aiModelCommand, setAiModelCommand] = useState(null);

  const handleUniversalSearch = async (query) => {
    if (!query || !query.trim()) return;

    // 1. Añadir el mensaje del usuario inmediatamente para el chat
    const userMsg = { role: 'user', content: query };
    setUniversalSearch(prev => ({
      ...prev,
      query,
      answer: '',
      results: [],
      loading: true,
      messages: [...(prev.messages || []), userMsg]
    }));
    setActivePanel('search');
    setPanelVisible(true);

    try {
      // Usamos el historial acumulado hasta ahora más el nuevo mensaje
      const fullHistory = [...(universalSearch.messages || []), userMsg];

      const resp = await apiFetch(`${BACKEND_URL}/api/ai/universal-search`, {
        method: 'POST',
        body: JSON.stringify({
          query,
          model_urn: selectedProject?.urn || null,
          history: fullHistory
        })
      });
      const data = await resp.json();

      if (data.success) {
        if (data.intent === 'model_command') {
          setAiModelCommand({ ...data.command, timestamp: Date.now() });
          setUniversalSearch(prev => ({
            ...prev,
            answer: `Comando: Aislar ${data.command.parameter}`,
            loading: false
          }));
        } else {
          const assistantMsg = {
            role: 'assistant',
            content: data.answer,
            results: data.results,
            agentSteps: data.agent_steps // Capture from backend
          };
          setUniversalSearch(prev => ({
            ...prev,
            answer: data.answer,
            results: data.results,
            loading: false,
            // Agregamos el mensaje del asistente al historial ya existente
            messages: [...(prev.messages || []), assistantMsg]
          }));
        }
      } else {
        setUniversalSearch(prev => ({
          ...prev,
          loading: false,
          messages: [...(prev.messages || []), { role: 'assistant', content: `Error: ${data.error || 'No se pudo procesar.'}` }]
        }));
      }
    } catch (err) {
      console.error('Search error:', err);
      setUniversalSearch(prev => ({
        ...prev,
        loading: false,
        messages: [...(prev.messages || []), { role: 'assistant', content: 'Error de conexión con la IA.' }]
      }));
    }
  };

  const handleOpenDocByNodeId = async (result) => {
    if (!result.nodeId) {
      alert("No se encontró ID de nodo para este documento en la base de datos.");
      return;
    }

    try {
      // Necesitamos obtener la URL real del archivo desde el backend
      const resp = await apiFetch(`${BACKEND_URL}/api/documents/${result.nodeId}`);
      const data = await resp.json();

      if (data.success && data.document) {
        // Abrir en el visor de planos/docs
        setActiveSheet({
          id: data.document.id,
          name: data.document.name,
          url: data.document.url,
          type: data.document.mime_type?.includes('pdf') ? 'pdf' : 'image',
          isPin: false // Se abre como un visor de documento directo
        });
        setOpenedDoc({
          id: data.document.id,
          name: data.document.name,
          url: data.document.url,
          type: data.document.mime_type?.includes('pdf') ? 'pdf' : 'image'
        });
      } else {
        alert("No se pudo obtener la información del documento.");
      }
    } catch (err) {
      console.error("Error opening doc by node ID:", err);
    }
  };

  const handleViewablesLoaded = useCallback(({ urn, views }) => {
    setModelViews(prev => {
      // Avoid unnecessary updates
      if (JSON.stringify(prev[urn]) === JSON.stringify(views)) return prev;
      return { ...prev, [urn]: views };
    });
  }, []);

  // --- UI Helpers for Mobile Logic ---
  const togglePanel = useCallback((panelName) => {
    if (activePanel === panelName) {
      const isClosing = panelVisible;
      setPanelVisible(!panelVisible);
      // Reset tracking if we are toggling off the progress panel
      if (isClosing && panelName === 'progress') {
        setTrackingTab(null);
        setTrackingPlacementMode(false);
      }
    } else {
      setActivePanel(panelName);
      // Reset tracking state when switching away from progress
      if (activePanel === 'progress' || panelName !== 'progress') {
        setTrackingTab(null);
        setTrackingPlacementMode(false);
      }

      // Ocultar el panel lateral automáticamente si es Seguimiento (Progreso)
      // para que solo aparezcan los botones superiores
      if (panelName === 'progress') {
        setPanelVisible(false);
      } else {
        setPanelVisible(true);
      }

      if (window.innerWidth < 1024 && window.innerWidth > window.innerHeight) {
        // Landscape small screen: collapse rail like desktop
        setIsRailExpanded(false);
      }
      // Portrait: rail stays visible (it's the bottom tab bar)
    }
  }, [activePanel, panelVisible]);

  const toggleRail = useCallback(() => {
    setIsRailExpanded(prev => !prev);
  }, []);


  const handleLoadSpecificView = useCallback((urn, guid) => {
    console.log('[App] Switching view for', urn, 'to', guid);
    setActiveViewableGuids(prev => ({
      ...prev,
      [urn]: guid
    }));
  }, []);



  // El token de Autodesk YA NO se pide aqui. Lo pedia este efecto con `[]` y su
  // unico cometido era servir de puerta para que Viewer se inicializara: si esta
  // primera peticion fallaba, `accessToken` se quedaba vacio para siempre, el
  // efecto no volvia a correr y el visor no arrancaba nunca -- ni cuando el
  // backend volvia. Sin aviso ninguno. Ahora hay UN SOLO mecanismo, el que
  // Autodesk soporta: Viewer monta -> Initializer -> getAccessToken ->
  // pedirTokenDeVisor(), que ademas reintenta y avisa. Ver Viewer.jsx.

  const handleDocPinComplete = async (position) => {
    const urn = selectedProject?.id || 'global';
    const newPin = {
      id: 'doc-' + Date.now(),
      x: position.x,
      y: position.y,
      z: position.z,
      dbId: position.dbId,
      externalId: position.externalId,
      objectName: position.objectName,
      docs: [] // List of attached documents
    };
    setDocPins(prev => [...prev, newPin]);
    setDocPlacementMode(false);

    try {
      await apiFetch(`${BACKEND_URL}/api/pins`, {
        method: 'POST',
        body: JSON.stringify({
          id: newPin.id,
          type: 'doc',
          x_coord: newPin.x,
          y_coord: newPin.y,
          z_coord: newPin.z,
          projectId: urn,
          name: position.objectName || 'Document Pin'
        })
      });
    } catch (e) {
      console.error("Failed to save doc pin", e);
    }
    // Automatically select the new pin to add docs?
    // setSelectedDocPinId(newPin.id); // State not defined, removed to fix crash
    // Initialize with correct structure
    setActiveSheet({
      name: 'Nuevo Marcador',
      isPin: true,
      pinId: newPin.id,
      docs: []
    });
    setOpenedDoc(null);
  };

  const handleDocPinSelect = (pinId) => {
    // setSelectedDocPinId(pinId); // State not defined
    // Find pin data
    // Find pin data
    const pin = docPins.find(p => p.id === pinId);
    if (pin) {
      // If the pin has docs, show list. If not, show empty state.
      // For now, we reuse 'activeSheet' to trigger the split view opening.
      // We need a way to distinguish "View Sheet" from "View Pin Docs".
      // Let's overload 'activeSheet' or create a new state 'activeDocContext'.
      // To keep it simple for this turn:
      setActiveSheet({
        name: pin.docs.length > 0 ? 'Documentos del Marcador' : 'Carpeta Vacía',
        isPin: true,
        pinId: pinId,
        docs: pin.docs
      });
      setOpenedDoc(null);
    }
  };

  const handleModelProperties = useCallback(({ urn }) => {
    console.log(`[App] Modelo ${urn} inicializado nativamente.`);
  }, []);

  const [availablePartidas, setAvailablePartidas] = useState([]);

  useEffect(() => {
    const handleSchemaExtracted = () => {
      if (!window.postgresInventory) return;
      
      const pMap = {};
      window.postgresInventory.forEach(row => {
        let code = row['03_05_DSI_CodigoDePartida1'] || row['03_05_DSI_CodigoDePartida2'] || row['03_05_DSI_CodigoDePartida3'] || row['03_05_DSI_CodigoDePartida'];
        if (code) {
          code = String(code).trim();
          let name = row['03_04_DSI_NombreDePartida1'] || row['03_04_DSI_NombreDePartida2'] || row['03_04_DSI_NombreDePartida3'] || row['03_04_DSI_NombreDePartida'] || row['Name'] || row['name'];
          if (!pMap[code]) pMap[code] = { code, name: name || '', count: 0 };
          pMap[code].count++;
          if (!pMap[code].name && name) pMap[code].name = name;
        }
      });
      
      setAvailablePartidas(Object.values(pMap).sort((a, b) => a.code.localeCompare(b.code)));
    };
    
    window.addEventListener('viewer-schema-extracted', handleSchemaExtracted);
    // Call once in case it already fired
    handleSchemaExtracted();
    
    return () => window.removeEventListener('viewer-schema-extracted', handleSchemaExtracted);
  }, []);

  // ------------------------------------
  // SHARED VIEW DETECTION
  // ------------------------------------
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('shareView');
    if (shareId) {
      setIsSharedMode(true);
      apiFetch(`${BACKEND_URL}/api/views/${shareId}`)
        .then(res => res.json())
        .then(data => {
          if (!data.error) {
            console.log('[App] Shared View loaded successfully:', data.name);
            setSharedViewData(data);
            if (data.projectId) {
              setSelectedProject({
                id: data.projectId,
                name: data.projectId,
                baseName: data.projectId
              });
            }
          }
        })
        .catch(err => console.error("Error loading shared view:", err));
    }
  }, []);

  // ------------------------------------
  // SHARED VIEW AUTO-RESTORE
  // ------------------------------------
  useEffect(() => {
    if (!isSharedMode || !sharedViewData) return;

    let restored = false;
    const handleGeometryLoaded = () => {
      if (!restored) {
        console.log('[App] Auto-restoring shared view state after geometry loaded...');

        // Aplica el estado almacenado (Cámara, colores, filtros, etc.)
        if (sharedViewData.filterState) {
          if (sharedViewData.filterState.filterSelections) setFilterSelections(sharedViewData.filterState.filterSelections);
          if (sharedViewData.filterState.filterColors) setFilterColors(sharedViewData.filterState.filterColors);
          if (sharedViewData.filterState.filterProperties) setFilterProperties(sharedViewData.filterState.filterProperties);
          if (sharedViewData.filterState.hiddenModelUrns) setHiddenModelUrns(sharedViewData.filterState.hiddenModelUrns);
          // Colores por valor + exclusiones "no pintar" de la vista compartida
          if (sharedViewData.filterState.customValueColors) {
            window._customValueColors = sharedViewData.filterState.customValueColors;
            window.dispatchEvent(new CustomEvent('custom-colors-restored', { detail: window._customValueColors }));
            window.dispatchEvent(new CustomEvent('ecd-source-tints-restore', {
              detail: {
                on: !!sharedViewData.filterState.sourceColorOn,
                customColors: sharedViewData.filterState.sourceCustomColors || {},
              },
            }));
          }
          // Heatmap de avance por PK de la vista compartida
          if (sharedViewData.filterState.pkHeatmap) {
            window.__pkHeatmap = sharedViewData.filterState.pkHeatmap;
            window.dispatchEvent(new CustomEvent('lob-pk-heatmap', { detail: window.__pkHeatmap }));
          }
        }

        window.dispatchEvent(new CustomEvent('viewer-restore-state', { detail: sharedViewData.viewerState }));

        // ANTI-WIPE (Race Condition Resolution): APS restoreState destruye los shaders custom de WebGPU.
        // Forzamos una re-inyección de la paleta semántica 1.5s después de que se posiciona la cámara nativa.
        if (sharedViewData.filterState && sharedViewData.filterState.filterColors) {
          setTimeout(() => {
            Object.keys(sharedViewData.filterState.filterColors).forEach(propId => {
              if (sharedViewData.filterState.filterColors[propId]) {
                const selectedValues = sharedViewData.filterState.filterSelections?.[propId] || [];
                window.dispatchEvent(new CustomEvent('theme-property-bucket', {
                  detail: {
                    propId,
                    values: selectedValues.length > 0 ? selectedValues : null,
                    active: true,
                    paletteName: 'Classic Tandem',
                    customColors: sharedViewData.filterState.customValueColors || window._customValueColors || {}
                  }
                }));
              }
            });
          }, 1500);
        }
        
        restored = true;
      }
    };

    window.addEventListener('viewer-geometry-loaded', handleGeometryLoaded);
    return () => window.removeEventListener('viewer-geometry-loaded', handleGeometryLoaded);
  }, [isSharedMode, sharedViewData]);

  // Load views on mount
  useEffect(() => {
    if (!selectedProject) return;
    // El invitado no tiene el panel de vistas: pedir la lista solo daba 401.
    if (isSharedMode) return;

    const projectId = selectedProject?.id || selectedProject?.name || 'global';
    apiFetch(`${BACKEND_URL}/api/views?project=${encodeURIComponent(projectId)}`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setSavedViews(data);
      })
      .catch(err => console.error("Error loading views:", err));
  }, [selectedProject]);

  const handleSaveView = useCallback((name) => {
    const handleStateCapture = (e) => {
      const viewerState = e.detail;
      window.removeEventListener('viewer-state-captured', handleStateCapture);

      const filterState = {
        filterSelections,
        filterColors,
        filterProperties,
        hiddenModelUrns,
        // Colores POR VALOR (picker) y exclusiones "no pintar" (✕): viven en
        // window._customValueColors (solo memoria) — sin guardarlos aquí, la
        // vista restauraba la paleta por defecto y perdía tu configuración.
        customValueColors: window._customValueColors || {},
        // Coloreo por SOURCE (el de la cabecera de Sources): vive tambien en
        // window y no se estaba guardando, asi que una vista con los modelos
        // coloreados volvia en gris.
        sourceColorOn: !!window.__ecdSourceColorOn,
        sourceCustomColors: window.__ecdSourceCustomColors || {},
        // Heatmap de avance por PK (tramos por alineamiento + estado)
        pkHeatmap: window.__pkHeatmap || null
      };

      const configState = {
        inventoryColumns: window.__inventoryCacheSelectedColumns || null
      };

      apiFetch(`${BACKEND_URL}/api/views`, {
        method: 'POST',
        body: JSON.stringify({
          name,
          viewerState,
          filterState,
          config: configState,
          project: selectedProject?.id || selectedProject?.name || 'global'
        })
      })
        .then(res => res.json())
        .then(newView => {
          setSavedViews(prev => [...prev, newView]);
        })
        .catch(err => console.error("Error saving view:", err));
    };

    window.addEventListener('viewer-state-captured', handleStateCapture);
    window.dispatchEvent(new CustomEvent('viewer-request-state'));
  }, [filterSelections, filterColors, filterProperties, hiddenModelUrns]);

  const handleDeleteView = useCallback((viewId) => {
    // Sin window.confirm: la pregunta la hace el propio panel, en la fila.
    // El aviso del navegador rompia el sitio (sale con el dominio delante, en
    // ingles y con el estilo del sistema) y ademas tapaba QUE vista se iba a
    // borrar, que es justo el dato que uno necesita para decidir.
    apiFetch(`${BACKEND_URL}/api/views/${viewId}`, { method: 'DELETE' })
      .then(res => res.ok ? setSavedViews(prev => prev.filter(v => v.id !== viewId)) : null)
      .catch(err => console.error("Error deleting view:", err));
  }, []);

  const handleLoadView = useCallback((view) => {
    // 1. Restaurar estado nativo del Viewer (cámara, renderOptions)
    //    NOTA: restoreState WIPES la visibilidad custom de nuestros filtros.
    //    Por eso re-inyectamos los filtros DESPUÉS con delay.
    window.dispatchEvent(new CustomEvent('viewer-restore-state', { detail: view.viewerState }));

    // 2. Restaurar el estado de filtros en React (async state updates)
    if (view.filterState) {
      if (view.filterState.filterSelections) setFilterSelections(view.filterState.filterSelections);
      if (view.filterState.filterColors) setFilterColors(view.filterState.filterColors);
      if (view.filterState.filterProperties) setFilterProperties(view.filterState.filterProperties);
      if (view.filterState.hiddenModelUrns) setHiddenModelUrns(view.filterState.hiddenModelUrns);
      else setHiddenModelUrns([]);
    }

    // 3. Restaurar configuración adicional (como columnas del inventario)
    if (view.config && view.config.inventoryColumns) {
      window.__inventoryCacheSelectedColumns = view.config.inventoryColumns;
      window.dispatchEvent(new CustomEvent('restore-inventory-config', {
        detail: view.config.inventoryColumns
      }));
    }

    // 4. ANTI-WIPE: Forzar re-aplicación de filtros DESPUÉS de que restoreState
    //    haya terminado de resetear la visibilidad del viewer.
    //    Sin este delay, restoreState borra la isolation que recalculate-filters aplicó.
    setTimeout(() => {
      const fs = view.filterState || {};
      console.log('[App] Anti-wipe: Re-inyectando filtros tras restoreState...');

      // Restaurar colores por valor + exclusiones "no pintar" ANTES del theming
      // (el handler los lee de window._customValueColors) y avisar al panel de
      // Filtros para que sus puntitos reflejen la configuración restaurada.
      if (fs.customValueColors) {
        window._customValueColors = fs.customValueColors;
        window.dispatchEvent(new CustomEvent('custom-colors-restored', { detail: fs.customValueColors }));
      }

      // Restaurar el coloreo por Source. Se PINTA aqui directamente, sin
      // depender de que el panel de Filtros este abierto — al cargar una vista
      // estas en el panel de Vistas, y antes el aviso no lo escuchaba nadie.
      // El evento se emite ademas para que el panel, si esta montado, ponga
      // sus puntitos al dia; y si se abre despues, sus estados iniciales ya
      // leen los globales que acabamos de fijar.
      try {
        restoreSourceTints(window.NOP_VIEWER, modelsRef.current || [],
                           !!fs.sourceColorOn, fs.sourceCustomColors || {});
      } catch (e) { console.warn('[App] No se pudo restaurar el color por Source:', e); }
      window.dispatchEvent(new CustomEvent('ecd-source-tints-restore', {
        detail: { on: !!fs.sourceColorOn, customColors: fs.sourceCustomColors || {} },
      }));

      // Restaurar Heatmap de avance por PK (la extensión reintenta sola si los
      // modelos aún no terminan de cargar).
      if (fs.pkHeatmap) {
        window.__pkHeatmap = fs.pkHeatmap;
        window.dispatchEvent(new CustomEvent('lob-pk-heatmap', { detail: fs.pkHeatmap }));
      }

      // Re-dispatch recalculate-filters para que Viewer.jsx re-aplique isolation
      window.dispatchEvent(new CustomEvent('recalculate-filters', {
        detail: {
          filterProperties: fs.filterProperties || filterProperties,
          filterSelections: fs.filterSelections || {}
        }
      }));

      // Re-inyectar colores semánticos (misma lógica que shared view)
      if (fs.filterColors) {
        Object.keys(fs.filterColors).forEach(propId => {
          if (fs.filterColors[propId]) {
            const selectedValues = fs.filterSelections?.[propId] || [];
            window.dispatchEvent(new CustomEvent('theme-property-bucket', {
              detail: {
                propId,
                values: selectedValues.length > 0 ? selectedValues : null,
                active: true,
                paletteName: 'Classic Tandem',
                customColors: fs.customValueColors || window._customValueColors || {}
              }
            }));
          }
        });
      }
    }, 500);
  }, [filterProperties]);

  const handleToggleModelVisibility = useCallback((urn) => {
    // Normalize to prevent encoding mismatches (+/-  //_  =)
    const norm = (u) => String(u || '').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const normalizedUrn = norm(urn);
    console.log('[App] Toggling visibility for:', normalizedUrn);
    setHiddenModelUrns(prev => {
      const next = prev.map(norm).includes(normalizedUrn)
        ? prev.filter(u => norm(u) !== normalizedUrn)
        : [...prev, normalizedUrn];
      console.log('[App] New hidden list:', next);
      return next;
    });
  }, []);


  // Get user geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        () => {
          setUserLocation({ lat: -12.0464, lng: -77.0428 });
        }
      );
    } else {
      setUserLocation({ lat: -12.0464, lng: -77.0428 });
    }
  }, []);



  useEffect(() => {
    const handleProperties = (event) => {
      const normalized = normalizePropertyList(event.detail || []);
      setAvailableProperties(normalized);
    };
    window.addEventListener('phasing-properties', handleProperties);
    return () => window.removeEventListener('phasing-properties', handleProperties);
  }, []);

  useEffect(() => {
    const handleExternalProps = (event) => {
      const detail = event.detail || [];
      console.log('[filters] Received bulk properties:', detail.length);
      handleModelProperties(detail);
    };
    window.addEventListener('viewer-model-properties', handleExternalProps);
    return () => window.removeEventListener('viewer-model-properties', handleExternalProps);
  }, [handleModelProperties]);

  useEffect(() => {
    if (activePanel === 'filters' && panelVisible) {
      window.dispatchEvent(new CustomEvent('phasing-get-properties'));
    }
  }, [activePanel, panelVisible]);

  /* REMOVED AUTO-HIDE SPLASH logic to keep it until explicit user action */
  /*
  useEffect(() => {
    if (!showSplash) return;
    if (models.length > 0 || documents.length > 0) {
      setShowSplash(false);
    }
  }, [models.length, documents.length, showSplash]);
  */

  useEffect(() => {
    if (!availableProperties.length) return;
    setFilterProperties(prev => {
      const availableIds = new Set(availableProperties.map(prop => prop.id));
      // Whitelist 'Standard::Sources' and 'Standard::Revit Category' so they are not stripped
      const sanitized = prev.filter(id => availableIds.has(id) || id === 'Standard::Sources' || id === 'Standard::Revit Category');

      if (sanitized.length) return sanitized;
      // Default fallback
      return ['Standard::Sources', 'Standard::Revit Category'];
    });
  }, [availableProperties]);

  const resetFiltersToDefault = useCallback(() => {
    // Reset to hardcoded defaults
    setFilterProperties(['Standard::Sources', 'Standard::Revit Category']);
  }, []);

  useEffect(() => {
    if (filterProperties.length === 0) return;

    setExpandedFilters(prev => {
      const next = {};
      filterProperties.forEach(id => {
        next[id] = prev[id] || false;
      });
      return next;
    });
  }, [filterProperties]);



  // 📌 EJE BASE PERSISTENTE: si el usuario fijó un eje en el panel Civil, se
  // dibuja AUTOMÁTICAMENTE al abrir el visor (progresivas incluidas), sin
  // abrir el panel. Espera a que el viewer + LOB4DExtension existan y baja el
  // JSON de alineamientos del backend (la extracción vive en Postgres).
  useEffect(() => {
    if (!selectedProject || !models.length) return undefined;
    // Herramienta DEL EQUIPO: desde un enlace compartido no se pide.
    // No es cosmetica -- cada una devolvia 401 y llenaba de rojo la
    // consola del supervisor, que es a quien le ensenas la plataforma.
    if (isSharedMode) return undefined;
    const scope = selectedProject.id || 'global';
    let cancelled = false;
    let pin = null;

    // COMPARTIDO: el pin ahora vive en Postgres (lo ven TODOS los usuarios).
    // localStorage queda como respaldo local/offline.
    const resolvePin = async () => {
      try {
        const res = await apiFetch(`${BACKEND_URL}/api/civil/base-axis?scope=${encodeURIComponent(scope)}`);
        if (res.ok) {
          const d = await res.json();
          if (d?.pin?.fileUrn) {
            try { localStorage.setItem(`civil_base_axis::${scope}`, JSON.stringify(d.pin)); } catch { /* noop */ }
            return d.pin;
          }
          if (d && 'pin' in d && d.pin === null) return null; // desfijado explícitamente
        }
      } catch { /* backend caído → respaldo local */ }
      try {
        const raw = localStorage.getItem(`civil_base_axis::${scope}`);
        return raw ? JSON.parse(raw) : null;
      } catch { return null; }
    };

    let tries = 0;
    const attempt = async () => {
      if (cancelled) return;
      tries += 1;
      if (pin === null) {
        pin = await resolvePin();
        if (cancelled) return;
        if (!pin?.fileUrn) return; // sin pin: nada que auto-dibujar
      }
      const viewer = window.NOP_VIEWER;
      const ext = viewer?.getExtension?.('LOB4DExtension');
      const hasModel = viewer?.model || viewer?.getVisibleModels?.()?.length;
      if (!ext || !hasModel) {
        if (tries < 40) window.setTimeout(attempt, 900); // hasta ~36s de arranque
        return;
      }
      try {
        const params = new URLSearchParams({ scope_urn: scope });
        const res = await apiFetch(`${BACKEND_URL}/api/civil/alignments?${params.toString()}`);
        const d = await res.json();
        const items = d.items || (d.found && d.data ? [{ urn: d.urn || scope, data: d.data }] : []);
        const item = items.find((it) => it.urn === pin.fileUrn) || null;
        const data = item?.data;
        if (!Array.isArray(data) || !data.length) {
          console.warn('[App] Eje base fijado pero sin extracción en BD para', pin.fileUrn);
          return;
        }
        if (cancelled) return;
        ext.setStationAnnotationsVisible?.(pin.showStations !== false);
        ext.bakeAlignment(data, pin.alignmentIds || 'ALL');
        // compartir con 4D LOB / secciones (misma semilla que usa el panel Civil)
        window.__lobCivilAlignments = data;
        console.log(`[App] 📌 Eje base auto-dibujado: ${Array.isArray(pin.alignmentIds) ? pin.alignmentIds.join(', ') : 'todos'}`);
      } catch (err) {
        console.warn('[App] Eje base: fallo al auto-cargar', err);
      }
    };
    attempt();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject, models.length]);

  // 👻 HOLOGRAMA DE MOVIMIENTO DE TIERRAS: la capa "Mov. tierras 3D" pide al
  // backend la malla corte/relleno generada desde las secciones persistidas
  // de Civil 3D (loft sobre el eje real) y la dibuja translúcida sobre el
  // modelo. La matemática vive en el backend; aquí solo se dibuja.
  useEffect(() => {
    // Herramienta DEL EQUIPO: desde un enlace compartido no se pide.
    // No es cosmetica -- cada una devolvia 401 y llenaba de rojo la
    // consola del supervisor, que es a quien le ensenas la plataforma.
    if (isSharedMode) return undefined;
    const scope = selectedProject?.id || 'global';
    let cancelled = false;
    // Payload cacheado por frente (el efecto se recrea al cambiar de frente):
    // apagar/encender la capa no vuelve a ir al backend. Caché POR MODO:
    // 'sections' = holograma por secciones (lámina del cadista) ·
    // 'topo' = sólidos por topografías (recetas QTO evaluadas en continuo)
    const cachedByMode = { sections: null, topo: null };
    let currentMode = 'sections';

    const fetchPayload = async (fresh = false, mode = currentMode) => {
      if (fresh) cachedByMode[mode] = null;
      if (cachedByMode[mode]) return { ok: true, d: cachedByMode[mode] };
      const url = mode === 'topo'
        ? `${BACKEND_URL}/api/civil/earthworks-solids?scope_urn=${encodeURIComponent(scope)}`
        : `${BACKEND_URL}/api/civil/earthworks-mesh?scope_urn=${encodeURIComponent(scope)}${fresh ? '&fresh=1' : ''}`;
      const res = await apiFetch(url);
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error || !d.kinds) {
        return { ok: false, reason: d.error || `http-${res.status}`, detail: d.detail };
      }
      // Respuesta del contrato VIEJO (malla fusionada, sin bodies): el
      // backend en marcha es anterior al refactor — pedir reinicio en claro.
      const hasBodies = Object.values(d.kinds).some(k => Array.isArray(k?.bodies) && k.bodies.length);
      if (!hasBodies) return { ok: false, reason: mode === 'topo' ? 'sin-dibujo' : 'contrato-viejo' };
      cachedByMode[mode] = d;
      return { ok: true, d };
    };

    const onToggle = async (e) => {
      const visible = !!e?.detail?.visible;
      if (e?.detail?.mode) currentMode = e.detail.mode === 'topo' ? 'topo' : 'sections';
      const viewer = window.__mainViewer || window.NOP_VIEWER;
      if (!viewer) return;
      const mod = await import('./components/ghostEarthworks');
      if (cancelled) return;
      if (!visible) { mod.clearGhostEarthworks(viewer); return; }
      try {
        const r = await fetchPayload();
        if (cancelled) return;
        if (!r.ok) {
          window.dispatchEvent(new CustomEvent('ghost-earthworks-result', {
            detail: { ok: false, reason: r.reason, detail: r.detail },
          }));
          return;
        }
        const drawn = mod.drawGhostEarthworks(viewer, r.d);
        window.dispatchEvent(new CustomEvent('ghost-earthworks-result', {
          detail: drawn
            ? { ok: true, mode: currentMode, volumes: drawn.volumes, bodies: drawn.bodies, alignmentId: r.d.alignmentId, warnings: r.d.warnings }
            : { ok: false, reason: 'sin-dibujo' },
        }));
      } catch (err) {
        console.warn('[App] Holograma mov. tierras: fallo', err);
        if (!cancelled) {
          window.dispatchEvent(new CustomEvent('ghost-earthworks-result', { detail: { ok: false, reason: 'red' } }));
        }
      }
    };

    // Precalentamiento: a los pocos segundos de entrar al frente se pide la
    // malla en silencio (calienta el caché del backend y el local) — cuando el
    // usuario active la capa, aparece al instante.
    const warmTimer = window.setTimeout(() => {
      if (!cancelled) fetchPayload().catch(() => {});
    }, 5000);

    // El panel Civil avisó que la data cambió (extraer/actualizar/borrar):
    // invalidar cachés y, si el holograma está visible, redibujarlo fresco.
    const onCivilChanged = async () => {
      cachedByMode.sections = null;
      cachedByMode.topo = null;
      try {
        const mod = await import('./components/ghostEarthworks');
        if (cancelled) return;
        if (mod.hasGhostEarthworks()) {
          const viewer = window.__mainViewer || window.NOP_VIEWER;
          if (!viewer) return;
          const r = await fetchPayload(true);
          if (cancelled) return;
          if (r.ok) {
            const drawn = mod.drawGhostEarthworks(viewer, r.d);
            window.dispatchEvent(new CustomEvent('ghost-earthworks-result', {
              detail: drawn
                ? { ok: true, volumes: drawn.volumes, bodies: drawn.bodies, alignmentId: r.d.alignmentId, warnings: r.d.warnings }
                : { ok: false, reason: 'sin-dibujo' },
            }));
          } else {
            mod.clearGhostEarthworks(viewer);
            window.dispatchEvent(new CustomEvent('ghost-earthworks-result', {
              detail: { ok: false, reason: r.reason, detail: r.detail },
            }));
          }
        } else {
          fetchPayload(true).catch(() => {});
        }
      } catch { /* noop */ }
    };
    window.addEventListener('civil-data-changed', onCivilChanged);

    // Leyenda: ocultar/mostrar un cuerpo individual sin redibujar
    const onBody = async (e) => {
      const viewer = window.__mainViewer || window.NOP_VIEWER;
      if (!viewer || !e?.detail?.id) return;
      const mod = await import('./components/ghostEarthworks');
      mod.setGhostBodyVisible(viewer, e.detail.id, e.detail.visible !== false);
    };

    window.addEventListener('ghost-earthworks', onToggle);
    window.addEventListener('ghost-earthworks-body', onBody);
    return () => {
      cancelled = true;
      window.clearTimeout(warmTimer);
      window.removeEventListener('ghost-earthworks', onToggle);
      window.removeEventListener('ghost-earthworks-body', onBody);
      window.removeEventListener('civil-data-changed', onCivilChanged);
      // Cambio de frente/desmontaje: el holograma del frente anterior no debe quedar
      const viewer = window.__mainViewer || window.NOP_VIEWER;
      if (viewer) import('./components/ghostEarthworks').then((m) => m.clearGhostEarthworks(viewer)).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProject?.id]);

  // Twin Config: Load models from backend on mount (and when project changes)
  useEffect(() => {
    if (!selectedProject) return; // Don't fetch if no project selected

    // CRITICAL: Clear models immediately before fetching to prevent old project's
    // models from briefly rendering in the new project viewer
    setModels([]);
    setAvailableProperties([]);
    setDynamicFilterBuckets({});
    setHiddenModelUrns([]);
    window.postgresInventory = null; window.postgresInventoryUrn = null;

    // Load Project Config Models
    apiFetch(`${BACKEND_URL}/api/config/project?project=${selectedProject.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.models && Array.isArray(data.models)) {
          // Map backend format to viewer format
          const mapped = data.models.map(m => ({
            ...m,
            label: m.name
          }));

          // Mapa fiable urn → nombre de archivo (el visor principal no llena
          // __viewerLiveModels con el label; esto sí, y lo usa LOB4DExtension
          // p. ej. para reconocer el DWG de sólidos de excavación).
          window.__modelLabelByUrn = {};
          mapped.forEach(m => {
            if (m.urn) window.__modelLabelByUrn[String(m.urn).replace(/^urn:/i, '')] = m.label || m.name || '';
          });

          // CRITICAL: Hydrate activeViewableGuids BEFORE setModels
          // de modo que cuando el Viewer reaccione al cambio de `models`,
          // ya tenga los GUIDs de las vistas configuradas por el usuario.
          const initialViews = {};
          mapped.forEach(m => {
            if (m.defaultViewGuid) {
              initialViews[m.urn] = m.defaultViewGuid;
            }
          });
          if (Object.keys(initialViews).length > 0) {
            setActiveViewableGuids(prev => ({ ...prev, ...initialViews }));
          }

          // AHORA seteamos los modelos (esto dispara la carga en el Viewer)
          setModels(mapped);
        }
      })
      .catch(err => console.error("Error loading project config:", err));

    // INYECCIÓN CDE PROFESIONAL: Descargar inventario completo de la base de datos PostgreSQL
    // Una vez descargado, evitará usar las consultas asfixiantes (O(N^2)) del visor LMV local.
    // RESILIENTE: la respuesta puede llegar VACÍA (backend frío/timeout en payloads grandes),
    // lo que rompía JSON.parse ("Unexpected end of JSON input"). Leemos texto, validamos, y
    // reintentamos con backoff antes de rendirnos.
    const fetchInventoryResilient = async (attempt = 0) => {
      const res = await apiFetch(urlInventario(BACKEND_URL, selectedProject.id));
      if (!res.ok) {
        // Leer el cuerpo del error ({'error': ...} del backend) para saber la
        // CAUSA real, y reintentar: los 500 vienen intermitentes (conexión del
        // pool que tropieza); el siguiente intento suele pasar.
        let serverMsg = '';
        try { serverMsg = (await res.text()).slice(0, 300); } catch { /* noop */ }
        if (attempt < 2) {
          const wait = 1000 * (attempt + 1);
          console.warn(`[Piedra Rosetta] /api/inventory HTTP ${res.status} (${serverMsg}). Reintentando en ${wait}ms…`);
          await new Promise(r => setTimeout(r, wait));
          return fetchInventoryResilient(attempt + 1);
        }
        throw new Error(`Falló /api/inventory (HTTP ${res.status}) → ${serverMsg}`);
      }
      const text = await res.text();
      if (!text || !text.trim()) {
        // Cuerpo vacío: reintentar hasta 2 veces (el backend puede estar despertando)
        if (attempt < 2) {
          const wait = 800 * (attempt + 1);
          console.warn(`[Piedra Rosetta] /api/inventory devolvió vacío. Reintentando en ${wait}ms (intento ${attempt + 1}/2)…`);
          await new Promise(r => setTimeout(r, wait));
          return fetchInventoryResilient(attempt + 1);
        }
        throw new Error('El backend devolvió el inventario VACÍO tras 3 intentos (revisar /api/inventory / Cloud SQL).');
      }
      try {
        return JSON.parse(text);
      } catch (e) {
        throw new Error(`Inventario con JSON inválido (${text.length} bytes, posible respuesta truncada).`);
      }
    };

    // Promesa GLOBAL del preload: InventoryDataGrid la espera en vez de bajar
    // su PROPIA copia en paralelo. GUARD anti-duplicado: React (StrictMode dev)
    // monta los efectos DOS veces → sin esto se lanzaban 2 descargas de 73MB
    // simultáneas (se partían el ancho de banda y una moría con 500).
    if (window.__inventoryPreloadKey === selectedProject.id && window.__inventoryPreloadPromise) {
      console.log('[Piedra Rosetta] Preload ya en curso para este proyecto — reutilizando (sin descarga duplicada).');
      return;
    }
    window.__inventoryPreloadKey = selectedProject.id;
    window.__inventoryPreloadPromise = (async () => {
      // ── CACHÉ LOCAL (IndexedDB, patrón Tandem/ACC) ────────────────────────
      // 1) Pedir la HUELLA de versión (~100 bytes). 2) Si coincide con la del
      // caché local → usarlo (0 descarga, apertura ~1s). 3) Si no → descarga
      // completa (gzip) y se guarda para la próxima.
      let verKey = null;
      try {
        const vres = await apiFetch(urlInventario(BACKEND_URL, selectedProject.id, { version: true }));
        if (vres.ok) {
          const v = await vres.json();
          verKey = `${v.count}|${v.last_updated}|${v.user_updated}`;
        }
      } catch { /* sin versión → descarga normal */ }

      if (verKey) {
        const cached = await getCachedInventory(selectedProject.id);
        if (cached && cached.verKey === verKey && Array.isArray(cached.mappedData) && cached.mappedData.length) {
          tagInventory(cached.mappedData, selectedProject?.id);
          console.log(`[Piedra Rosetta] ⚡ Inventario desde caché LOCAL (${cached.mappedData.length} activos, 0 bytes descargados)`);
          window.dispatchEvent(new CustomEvent('viewer-schema-extracted', { detail: { schema: cached.schemaList || [] } }));
          return;
        }
        if (cached) console.log('[Piedra Rosetta] Caché local desactualizado (hubo re-extracción/edición) — descargando fresco…');
      }

      const dbData = await fetchInventoryResilient();
      return { dbData, verKey };
    })()
      .then(payload => {
        if (!payload) return; // servido desde caché
        const { dbData, verKey } = payload;
        const schemaMap = {};

        // Flatten as in InventoryDataGrid
        const mappedData = dbData.map(node => {
          let row = {
            dbId: node.external_id,
            model_urn: node.model_urn,
            source_urn: node.source_urn || node.model_urn,
            Name: node.name,
            Material: node.material || '',
            Status: node.installation_status || '',
            Vaciado_Nro: node.vaciado_nro || ''
          };
          if (node.properties && typeof node.properties === 'object') {
            Object.entries(node.properties).forEach(([cName, cVal]) => {
              if (typeof cVal === 'object' && cVal !== null) {
                Object.entries(cVal).forEach(([rawPName, pVal]) => {
                  // Civil 3D: strip redundant group prefix from property name
                  let pName = rawPName;
                  if (pName.startsWith(cName)) {
                    let cleaned = pName.slice(cName.length).replace(/^[\s\-\_\.]+/, '');
                    if (cleaned.length > 0) pName = cleaned;
                  } else if (cName.toUpperCase() === 'PROPERTY SETS' && pName.match(/^.*?\s*[\-\u2013\u2014]\s*(.+)$/)) {
                    pName = pName.match(/^.*?\s*[\-\u2013\u2014]\s*(.+)$/)[1];
                  }
                  const val = Array.isArray(pVal) ? pVal.map(x => String(x ?? '').trim()).filter(Boolean).join(', ') : String(pVal).trim();
                  // FIX: Solo sobreescribir si el nuevo valor no está vacío,
                  // o si la propiedad aún no existe. Esto protege los valores válidos.
                  if (val !== '' || !row.hasOwnProperty(pName) || row[pName] === '') {
                    row[pName] = val;
                  }

                  // Construir esquema exacto para FilterConfigurator
                  const key = cName + '::' + pName;
                  if (!schemaMap[key]) {
                    schemaMap[key] = {
                      id: key,
                      name: pName,
                      category: cName,
                      group: 'text',
                      path: cName + ' ▸ ' + pName
                    };
                  }
                });
              }
            });
          }

          // Inyectar "Revit Category" normalizada (ES→EN, linked models, etc.)
          const rawCat = node.properties?.['__category__']?.['__category__']
            || row['__category__']  // ya aplanado por el loop anterior
            || '(Unassigned)';
          row['Revit Category'] = normalizeRevitCategory(rawCat);

          return row;
        });
        tagInventory(mappedData, selectedProject?.id);
        console.log(`[Piedra Rosetta] Descargados ${mappedData.length} activos desde PostgreSQL (Enterprise CDE Mode)`);

        // Registrar 'Revit Category' como propiedad disponible para filtros
        schemaMap['Standard::Revit Category'] = {
          id: 'Standard::Revit Category',
          name: 'Revit Category',
          category: 'Standard',
          group: 'text',
          path: 'Standard ▸ Revit Category'
        };

        // INYECCIÓN DEMO: Registrar 'Status' (Estado de Ejecución) para permitir su coloreo
        schemaMap['Avance de Obra::Status'] = {
          id: 'Avance de Obra::Status',
          name: 'Estado de Ejecución',
          category: 'Avance de Obra',
          group: 'text',
          path: 'Avance de Obra ▸ Estado de Ejecución'
        };

        // Plan de Vaciado: Registrar 'Vaciado_Nro' para filtrado y coloreo en 3D
        schemaMap['Avance de Obra::Vaciado_Nro'] = {
          id: 'Avance de Obra::Vaciado_Nro',
          name: 'Plan de Vaciado',
          category: 'Avance de Obra',
          group: 'text',
          path: 'Avance de Obra ▸ Plan de Vaciado'
        };

        const schemaList = Object.values(schemaMap).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
        window.dispatchEvent(new CustomEvent('viewer-schema-extracted', { detail: { schema: schemaList } }));

        // Guardar en caché local para que la PRÓXIMA apertura sea instantánea
        // (se invalida sola cuando cambia la huella de versión del servidor).
        if (verKey) {
          setCachedInventory(selectedProject.id, { verKey, mappedData, schemaList, savedAt: Date.now() });
        }
      })
      .catch(err => console.error("[Piedra Rosetta] Error pre-cargando inventario PostgreSQL:", err));

  }, [selectedProject]);

  // Recarga reactiva: cuando una extracción termina, re-descargar inventario fresco
  useEffect(() => {
    if (!selectedProject) return;
    const handleRefresh = () => {
      console.log('[Piedra Rosetta] Recarga reactiva disparada — descargando inventario fresco...');
      apiFetch(urlInventario(BACKEND_URL, selectedProject.id))
        .then(res => {
          if (!res.ok) throw new Error('Falló el fetch a /api/inventory');
          return res.json();
        })
        .then(dbData => {
          const schemaMap = {};
          const mappedData = dbData.map(node => {
            let row = {
              dbId: node.external_id,
              model_urn: node.model_urn,
              source_urn: node.source_urn || node.model_urn,
              Name: node.name,
              Material: node.material || '',
              Status: node.installation_status || '',
              Vaciado_Nro: node.vaciado_nro || ''
            };
            if (node.properties && typeof node.properties === 'object') {
              Object.entries(node.properties).forEach(([cName, cVal]) => {
                if (typeof cVal === 'object' && cVal !== null) {
                  Object.entries(cVal).forEach(([rawPName, pVal]) => {
                    let pName = rawPName;
                    for (const d of [' - ', ' \u2013 ', ' \u2014 ']) {
                      if (pName.startsWith(cName + d)) { pName = pName.slice((cName + d).length); break; }
                    }
                    const val = Array.isArray(pVal) ? pVal.map(x => String(x ?? '').trim()).filter(Boolean).join(', ') : String(pVal).trim();
                    if (val !== '' || !row.hasOwnProperty(pName) || row[pName] === '') {
                      row[pName] = val;
                    }
                    const key = cName + '::' + pName;
                    if (!schemaMap[key]) {
                      schemaMap[key] = { id: key, name: pName, category: cName, group: 'text', path: cName + ' ▸ ' + pName };
                    }
                  });
                }
              });
            }
            const rawCat2 = node.properties?.['__category__']?.['__category__']
              || row['__category__']
              || '(Unassigned)';
            row['Revit Category'] = normalizeRevitCategory(rawCat2);
            return row;
          });

          tagInventory(mappedData, selectedProject?.id);
          window.__inventoryCache = null;
          console.log(`[Piedra Rosetta] Recarga reactiva completada: ${mappedData.length} activos actualizados`);

          schemaMap['Standard::Revit Category'] = {
            id: 'Standard::Revit Category', name: 'Revit Category', category: 'Standard', group: 'text', path: 'Standard ▸ Revit Category'
          };
          const schemaList = Object.values(schemaMap).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
          window.dispatchEvent(new CustomEvent('viewer-schema-extracted', { detail: { schema: schemaList } }));
        })
        .catch(err => console.error('[Piedra Rosetta] Error en recarga reactiva:', err));
    };

    window.addEventListener('inventory-needs-refresh', handleRefresh);
    return () => window.removeEventListener('inventory-needs-refresh', handleRefresh);
  }, [selectedProject]);

  // Background Extraction Logic for Updates/Relinks
  const [availableUpdates, setAvailableUpdates] = useState({});

  // === VERSION CHECK POLLING (Tandem-style) ===
  useEffect(() => {
    if (!selectedProject) return;
    // Avisar de versiones nuevas es para quien edita, no para quien mira.
    if (isSharedMode) return;

    const checkForUpdates = async () => {
      try {
        const res = await apiFetch(`${BACKEND_URL}/api/config/project/check-updates`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ project: selectedProject.id })
        });
        if (res.ok) {
          const data = await res.json();
          const updatesMap = {};
          (data.updates || []).forEach(u => {
            updatesMap[u.model_id] = u;
          });
          setAvailableUpdates(updatesMap);
          const withUpdates = (data.updates || []).filter(u => u.has_update);
          if (withUpdates.length > 0) {
            console.log(`[Version Check] ${withUpdates.length} model(s) have updates available`);
          }
        }
      } catch (err) {
        console.warn('[Version Check] Error checking for updates:', err);
      }
    };

    // Check immediately on project load
    const initialDelay = setTimeout(checkForUpdates, 5000); // 5s after load

    // Poll every 5 minutes
    const interval = setInterval(checkForUpdates, 5 * 60 * 1000);

    return () => {
      clearTimeout(initialDelay);
      clearInterval(interval);
    };
  }, [selectedProject]);

  // existingJobId: cuando Update/Relink ya dispararon la extracción en el backend,
  // pasamos su job_id para SONDEARLO en vez de lanzar una segunda extracción del
  // mismo URN (antes corrían dos en paralelo, purgando/reinsertando a la vez).
  const triggerBackgroundExtraction = async (urn, existingJobId = null) => {
    setExtractionJobs(prev => ({ ...prev, [urn]: { progress: 0, status: 'Iniciando extracción...', isActive: true } }));
    console.log("[Extraction] URN:", urn, existingJobId ? `(sondeando job ${existingJobId})` : '(nuevo job)');
    try {
      let job_id = existingJobId;
      if (!job_id) {
        const res = await apiFetch(`${BACKEND_URL}/api/inventory/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urn, target_urn: selectedProject ? selectedProject.id : urn })
        });
        if (!res.ok) throw new Error("Error iniciando job");
        job_id = (await res.json()).job_id;
      }

      // Limpiar cualquier sondeo previo del MISMO urn → no se acumulan intervalos.
      if (pollIntervalsRef.current[urn]) {
        clearInterval(pollIntervalsRef.current[urn]);
        delete pollIntervalsRef.current[urn];
      }

      let attempts = 0;
      // ~12 min a 3s: las extracciones del update-all corren EN COLA secuencial,
      // así que el último modelo del lote espera a los anteriores antes de empezar.
      const MAX_ATTEMPTS = 240;

      const stopPoll = () => {
        clearInterval(pollInterval);
        delete pollIntervalsRef.current[urn];
      };

      const pollInterval = setInterval(async () => {
        attempts++;
        if (attempts > MAX_ATTEMPTS) {
          stopPoll();
          setExtractionJobs(prev => ({ ...prev, [urn]: { ...prev[urn], status: 'La extracción tardó demasiado (reintenta)', isActive: false } }));
          return;
        }
        try {
          const stRes = await apiFetch(`${BACKEND_URL}/api/inventory/extract/status/${job_id}`);
          if (stRes.ok) {
            const stData = await stRes.json();

            setExtractionJobs(prev => ({
              ...prev,
              [urn]: { progress: stData.progress || 0, status: stData.message || '', isActive: true }
            }));

            if (stData.status === 'success') {
              stopPoll();
              setExtractionJobs(prev => ({ ...prev, [urn]: { ...prev[urn], progress: 100, isActive: false } }));
              // Invalida cache de inventario global para que fuerce una llamada fresca al DB
              window.__inventoryCache = null;
              // Disparar recarga reactiva de inventario y filtros
              window.dispatchEvent(new CustomEvent('inventory-needs-refresh'));
            } else if (stData.status === 'error') {
              stopPoll();
              setExtractionJobs(prev => ({ ...prev, [urn]: { ...prev[urn], status: 'Error', isActive: false } }));
            }
          }
        } catch (e) {
          console.error("Polling error:", e);
        }
      }, 3000);
      pollIntervalsRef.current[urn] = pollInterval;
    } catch (e) {
      console.error("[Extraction] Error:", e);
      setExtractionJobs(prev => ({ ...prev, [urn]: { status: 'Fallo al iniciar', isActive: false } }));
    }
  };

  // Limpieza: al desmontar, cortar todos los sondeos de extracción vivos.
  useEffect(() => () => {
    Object.values(pollIntervalsRef.current).forEach(id => clearInterval(id));
    pollIntervalsRef.current = {};
  }, []);

  // Per-model update check status: { [urn]: { status: 'checking'|'up_to_date'|'updating'|'error'|'pending', message? } }
  const [updateCheckStatus, setUpdateCheckStatus] = useState({});

  const handleModelUpdate = useCallback(async (urn) => {
    if (!selectedProject) return;

    // Show spinner
    setUpdateCheckStatus(prev => ({ ...prev, [urn]: { status: 'checking' } }));

    try {
      const res = await apiFetch(`${BACKEND_URL}/api/config/project/update`, {
        method: 'POST',
        body: JSON.stringify({ urn, project: selectedProject.id })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.pending_translation) {
          // Versión nueva detectada pero aún traduciéndose en ACC → no cambiamos nada,
          // mostramos aviso y dejamos que reintente. Evita el update "que no trae datos".
          setUpdateCheckStatus(prev => ({ ...prev, [urn]: { status: 'pending', message: data.message || 'Traduciéndose en ACC…' } }));
          setTimeout(() => setUpdateCheckStatus(prev => { const n = { ...prev }; delete n[urn]; return n; }), 7000);
          return;
        }
        if (data.updated && data.config?.models) {
          // New version found and applied
          setUpdateCheckStatus(prev => ({ ...prev, [urn]: { status: 'updating', message: 'Updated! Extracting...' } }));

          // CRITICAL: Hydrate activeViewableGuids for new URNs BEFORE setModels
          // to prevent the Viewer from falling back to default geometry (wrong view).
          // This mirrors the hydration logic in the initial project load (line ~1332).
          const mapped = data.config.models.map(m => ({ ...m, label: m.name }));
          const updatedViews = {};
          mapped.forEach(m => {
            if (m.defaultViewGuid) {
              updatedViews[m.urn] = m.defaultViewGuid;
            }
          });
          if (Object.keys(updatedViews).length > 0) {
            setActiveViewableGuids(prev => ({ ...prev, ...updatedViews }));
          }

          setModels(mapped);

          // Clear the update notification for this model
          setAvailableUpdates(prev => {
            const next = { ...prev };
            Object.keys(next).forEach(k => {
              if (next[k]?.urn === urn) next[k] = { ...next[k], has_update: false };
            });
            return next;
          });

          if (data.newUrn) {
            // El backend ya disparó la extracción: sondeamos SU job (no lanzamos otra)
            triggerBackgroundExtraction(data.newUrn, data.extraction_job_id || null);
          }

          // Invalidate inventory caches immediately so stale data from the old URN
          // isn't displayed while the background extraction runs
          window.__inventoryCache = null;
          window.postgresInventory = null; window.postgresInventoryUrn = null;

          // Clear status after 5s
          setTimeout(() => setUpdateCheckStatus(prev => { const n = { ...prev }; delete n[urn]; return n; }), 5000);
        } else {
          // Already latest version
          setUpdateCheckStatus(prev => ({ ...prev, [urn]: { status: 'up_to_date' } }));
          // Clear after 3s
          setTimeout(() => setUpdateCheckStatus(prev => { const n = { ...prev }; delete n[urn]; return n; }), 3000);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setUpdateCheckStatus(prev => ({ ...prev, [urn]: { status: 'error', message: err.error || 'Error' } }));
        setTimeout(() => setUpdateCheckStatus(prev => { const n = { ...prev }; delete n[urn]; return n; }), 4000);
      }
    } catch (e) {
      console.error("Error updating model:", e);
      setUpdateCheckStatus(prev => ({ ...prev, [urn]: { status: 'error', message: 'Connection error' } }));
      setTimeout(() => setUpdateCheckStatus(prev => { const n = { ...prev }; delete n[urn]; return n; }), 4000);
    }
  }, [selectedProject]);

  // UPDATE MASIVO profesional (estilo Tandem): UNA llamada al backend, que
  // resuelve todo server-side — config se escribe una sola vez (sin carreras),
  // pre-chequeo de traducción por modelo, extracciones EN COLA secuencial (no
  // N hilos en paralelo contra APS: esa era la causa del error del update-all),
  // y reporte por modelo (updated / al día / traduciéndose / error).
  const [updateAllBusy, setUpdateAllBusy] = useState(false);
  const handleUpdateAll = useCallback(async () => {
    const pending = (models || []).filter(m => availableUpdates[m.id]?.has_update);
    if (!pending.length || updateAllBusy || !selectedProject) return;
    setUpdateAllBusy(true);

    // Estado "checking" en todos los pendientes de una vez
    setUpdateCheckStatus(prev => {
      const next = { ...prev };
      pending.forEach(m => { next[m.urn] = { status: 'checking' }; });
      return next;
    });

    try {
      const res = await apiFetch(`${BACKEND_URL}/api/config/project/update-all`, {
        method: 'POST',
        body: JSON.stringify({ project: selectedProject.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Reporte por modelo → chips de estado individuales
      const statusMap = {
        updated: (r) => ({ status: 'updating', message: `v${r.versionNumber || '?'} — extrayendo…` }),
        up_to_date: () => ({ status: 'up_to_date' }),
        pending_translation: (r) => ({ status: 'pending', message: r.message || 'Traduciéndose en ACC…' }),
        no_acc_metadata: (r) => ({ status: 'error', message: r.message || 'Sin metadata ACC' }),
        error: (r) => ({ status: 'error', message: r.message || 'Error' }),
      };
      setUpdateCheckStatus(prev => {
        const next = { ...prev };
        (data.results || []).forEach(r => {
          if (r.urn) next[r.urn] = (statusMap[r.status] || statusMap.error)(r);
        });
        return next;
      });

      // Aplicar el config nuevo UNA vez (los modelos quedan en su mismo lugar:
      // el backend muta cada entrada in-place, el orden no cambia)
      if (data.config?.models) {
        const mapped = data.config.models.map(m => ({ ...m, label: m.name }));
        const updatedViews = {};
        mapped.forEach(m => { if (m.defaultViewGuid) updatedViews[m.urn] = m.defaultViewGuid; });
        if (Object.keys(updatedViews).length) setActiveViewableGuids(prev => ({ ...prev, ...updatedViews }));
        setModels(mapped);
      }

      // Limpiar avisos de update de los que ya se actualizaron y sondear SU job
      const updatedResults = (data.results || []).filter(r => r.status === 'updated');
      if (updatedResults.length) {
        setAvailableUpdates(prev => {
          const next = { ...prev };
          updatedResults.forEach(r => { if (next[r.id]) next[r.id] = { ...next[r.id], has_update: false }; });
          return next;
        });
        window.__inventoryCache = null;
        window.postgresInventory = null; window.postgresInventoryUrn = null;
        updatedResults.forEach(r => {
          if (r.newUrn) triggerBackgroundExtraction(r.newUrn, r.extraction_job_id || null);
        });
      }

      const s = data.summary || {};
      console.log(`[UpdateAll] ${s.updated || 0} actualizados · ${s.up_to_date || 0} al día · ${s.pending_translation || 0} traduciéndose · ${s.errors || 0} errores`);

      // Limpiar chips pasados unos segundos
      setTimeout(() => setUpdateCheckStatus(prev => {
        const next = { ...prev };
        (data.results || []).forEach(r => {
          if (r.urn && next[r.urn]?.status !== 'updating') delete next[r.urn];
        });
        return next;
      }), 7000);
    } catch (e) {
      console.error('[UpdateAll] Error:', e);
      setUpdateCheckStatus(prev => {
        const next = { ...prev };
        pending.forEach(m => { next[m.urn] = { status: 'error', message: e.message || 'Error de conexión' }; });
        return next;
      });
      setTimeout(() => setUpdateCheckStatus(prev => {
        const next = { ...prev };
        pending.forEach(m => { delete next[m.urn]; });
        return next;
      }), 5000);
    } finally {
      setUpdateAllBusy(false);
    }
  }, [models, availableUpdates, updateAllBusy, selectedProject]);

  const handleLinkDocs = useCallback(async (modelsInput, isGemelo = false, viewGuid = null) => {
    // Determine if input is array
    const models = Array.isArray(modelsInput) ? modelsInput : [modelsInput];

    try {
      if (!selectedProject) return alert("No project selected");

      // Handle Relink Mode
      if (relinkTargetModel) {
        if (models.length === 0) return;
        const newModelData = models[0]; // Relink strictly one model

        const res = await apiFetch(`${BACKEND_URL}/api/config/project/relink`, {
          method: 'POST',
          body: JSON.stringify({
            targetId: relinkTargetModel.id,
            oldUrn: relinkTargetModel.urn,
            project: selectedProject.id,
            newModel: {
              urn: newModelData.urn,
              name: newModelData.name || newModelData.label,
              versionId: newModelData.versionId,
              versionNumber: newModelData.versionNumber,
              lastModifiedTime: newModelData.lastModifiedTime,
              projectId: newModelData.projectId, // ACC Project
              itemId: newModelData.itemId,
              defaultViewGuid: viewGuid
            }
          })
        });

        if (res.ok) {
          const config = await res.json();
          if (config.models) {
            setModels(config.models.map(m => ({ ...m, label: m.name })));

            // Apply the new active viewable across the state
            if (viewGuid) {
              setActiveViewableGuids(prev => ({ ...prev, [newModelData.urn]: viewGuid }));
            }

            // El backend ya disparó la extracción del relink: sondeamos SU job
            triggerBackgroundExtraction(newModelData.urn, config.extraction_job_id || null);
          }
        } else {
          alert("Failed to relink model.");
        }
        setRelinkTargetModel(null);
        return;
      }

      // Standard Add Mode (Direct or Gemelo)
      const endpoint = '/api/config/project/add';

      for (const model of models) {
        const payload = {
          urn: model.urn,
          name: model.name || model.label,
          region: 'US',
          projectId: model.projectId,
          itemId: model.itemId,
          versionId: model.versionId,
          versionNumber: model.versionNumber,
          lastModifiedTime: model.lastModifiedTime,
          project: selectedProject.id,
          defaultViewGuid: viewGuid
        };

        const res = await apiFetch(`${BACKEND_URL}${endpoint}`, {
          method: 'POST',
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const config = await res.json();
          if (config.models) {
            setModels(config.models.map(m => ({ ...m, label: m.name })));
            
            // Apply the new active viewable across the state for standard imports
            if (viewGuid) {
              setActiveViewableGuids(prev => ({ ...prev, [model.urn]: viewGuid }));
            }
          }
        } else if (res.status === 409) {
          // Duplicado (guard estilo Tandem): el modelo ya está vinculado al frente
          const err = await res.json().catch(() => ({}));
          alert(err.message || 'Ese modelo ya está vinculado a este frente.');
        } else {
          const err = await res.json().catch(() => ({}));
          alert(`Error: ${err.error || 'Failed to link model'}`);
        }
      }

      // Si se cargó un gemelo, forzamos recarga de la metadata (inventario Postgres)
      if (isGemelo) {
        try {
          const res = await apiFetch(urlInventario(BACKEND_URL, selectedProject.id));
          if (res.ok) {
            const dbData = await res.json();
            const schemaMap = {};

            const mappedData = dbData.map(node => {
              let row = {
                dbId: node.external_id,
                model_urn: node.model_urn,
                source_urn: node.source_urn || node.model_urn,
                Name: node.name,
                Material: node.material || '',
                Status: node.installation_status || '',
                Vaciado_Nro: node.vaciado_nro || ''
              };
              if (node.properties && typeof node.properties === 'object') {
                Object.entries(node.properties).forEach(([cName, cVal]) => {
                  if (typeof cVal === 'object' && cVal !== null) {
                    Object.entries(cVal).forEach(([rawPName, pVal]) => {
                      let pName = rawPName;
                      for (const d of [' - ', ' \u2013 ', ' \u2014 ']) {
                        if (pName.startsWith(cName + d)) { pName = pName.slice((cName + d).length); break; }
                      }
                      const val = Array.isArray(pVal) ? pVal.map(x => String(x ?? '').trim()).filter(Boolean).join(', ') : String(pVal).trim();
                      if (val !== '' || !row.hasOwnProperty(pName) || row[pName] === '') {
                        row[pName] = val;
                      }

                      const key = cName + '::' + pName;
                      if (!schemaMap[key]) {
                        schemaMap[key] = {
                          id: key,
                          name: pName,
                          category: cName,
                          group: 'text',
                          path: cName + ' ▸ ' + pName
                        };
                      }
                    });
                  }
                });
              }
              // Inyectar "Revit Category" normalizada
              const rawCat3 = node.properties?.['__category__']?.['__category__']
                || row['__category__']
                || '(Unassigned)';
              row['Revit Category'] = normalizeRevitCategory(rawCat3);

              return row;
            });
            tagInventory(mappedData, selectedProject?.id);
            console.log(`[Piedra Rosetta] Caché reactualizada: ${mappedData.length} activos`);

            // Registrar 'Revit Category' en el schema
            schemaMap['Standard::Revit Category'] = {
              id: 'Standard::Revit Category',
              name: 'Revit Category',
              category: 'Standard',
              group: 'text',
              path: 'Standard ▸ Revit Category'
            };

            const schemaList = Object.values(schemaMap).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
            window.dispatchEvent(new CustomEvent('viewer-schema-extracted', { detail: { schema: schemaList } }));
          }
        } catch (e) {
          console.error("Error recargando caché postgres:", e);
        }
      }

    } catch (e) {
      console.error("Error linking model:", e);
      alert("Error procesando los modelos.");
    }
  }, [selectedProject, relinkTargetModel]);

  const handleExtractCivilData = useCallback(async (sourceModel, options = {}) => {
    if (!selectedProject?.id) throw new Error('No hay frente seleccionado para guardar datos Civil.');
    const urn = sourceModel?.urn || sourceModel?.id;
    if (!urn) throw new Error('No se encontro URN para extraer datos Civil.');

    const scopeUrn = options.scopeUrn || selectedProject.id;
    const projectId = sourceModel?.projectId || sourceModel?.project_id || null;
    const report = (pct, msg) => {
      try { options.onProgress?.(pct, msg); } catch (e) { /* noop */ }
    };
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const runWorkitem = async ({
      startEndpoint,
      persistEndpoint,
      label,
      startPct,
      donePct
    }) => {
      report(startPct, `Enviando ${label} a Design Automation...`);
      const startRes = await apiFetch(`${BACKEND_URL}${startEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urn, project_id: projectId })
      });
      const startData = await startRes.json().catch(() => ({}));
      if (!startRes.ok) {
        throw new Error(startData.error || startData.details || `No se pudo iniciar ${label}.`);
      }

      const workitemId = startData.workitem_id;
      const resultObject = startData.result_object || '';
      if (!workitemId) throw new Error(`Design Automation no devolvio workitem para ${label}.`);

      const startedAt = Date.now();
      let pollCount = 0;
      while (true) {
        if (Date.now() - startedAt > 45 * 60 * 1000) {
          throw new Error(`${label} tardo demasiado. El WorkItem sigue en Autodesk o fallo por timeout.`);
        }

        await wait(3000);
        pollCount += 1;
        const statusRes = await apiFetch(`${BACKEND_URL}/api/civil/workitem-status/${workitemId}`);
        const statusData = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) {
          throw new Error(statusData.error || `No se pudo consultar el estado de ${label}.`);
        }

        const status = String(statusData.status || '').toLowerCase();
        if (status === 'pending' || status === 'inprogress') {
          const span = Math.max(1, donePct - startPct - 8);
          const pct = Math.min(donePct - 8, startPct + 5 + pollCount * Math.max(2, Math.floor(span / 18)));
          report(pct, status === 'pending'
            ? `${label}: en cola de Autodesk...`
            : `${label}: Civil 3D esta procesando...`);
          continue;
        }

        if (status === 'success' || status === 'successwitherrors') {
          report(donePct - 5, `${label}: descargando JSON...`);
          const resultParams = new URLSearchParams({
            workitem_id: workitemId,
            object_name: resultObject
          });
          const resultRes = await apiFetch(`${BACKEND_URL}/api/civil/alignment-result?${resultParams.toString()}`);
          const resultJson = await resultRes.json().catch(() => null);
          if (!resultRes.ok || resultJson == null) {
            throw new Error(`No se pudo descargar el JSON de ${label}.`);
          }

          report(donePct - 2, `${label}: guardando en el frente...`);
          const persistRes = await apiFetch(`${BACKEND_URL}${persistEndpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              urn,
              model_urn: scopeUrn,
              scope_urn: scopeUrn,
              data: resultJson,
              // nombre legible del DWG: el panel Civil lo muestra en el
              // selector (sin él quedaba "Carga en la nube · fecha (urn…)")
              display_name: sourceModel?.name || sourceModel?.label || sourceModel?.fileName || null
            })
          });
          const persistData = await persistRes.json().catch(() => ({}));
          if (!persistRes.ok) {
            throw new Error(persistData.error || `No se pudo guardar ${label}.`);
          }

          report(donePct, `${label}: listo.`);
          return resultJson;
        }

        if (status.startsWith('failed') || status === 'cancelled') {
          const isLimit = status === 'failedlimitprocessingtime';
          throw new Error(isLimit
            ? `${label} supero el limite de procesamiento de Autodesk.`
            : `${label} finalizo con estado ${statusData.status || status}.`);
        }

        throw new Error(`${label} devolvio estado inesperado: ${statusData.status || 'sin estado'}.`);
      }
    };

    const alignments = await runWorkitem({
      startEndpoint: '/api/civil/extract-curves',
      persistEndpoint: '/api/civil/alignments',
      label: 'alineamientos y perfiles',
      startPct: 5,
      donePct: options.includeSections ? 58 : 100
    });

    let sections = null;
    if (options.includeSections) {
      sections = await runWorkitem({
        startEndpoint: '/api/civil/extract-sections-test',
        persistEndpoint: '/api/civil/sections',
        label: 'secciones',
        startPct: 60,
        donePct: 100
      });
    }

    window.__lobCivilAlignments = Array.isArray(alignments) ? alignments : alignments?.items || alignments;
    window.dispatchEvent(new CustomEvent('civil-data-updated', {
      detail: { urn, scope_urn: scopeUrn, alignments, sections }
    }));
    return { urn, scope_urn: scopeUrn, alignments, sections };
  }, [selectedProject]);


  // UPLOAD LOCAL profesional (2 fases, paridad con Tandem):
  //   1) subir archivo + disparar traducción (0–60%)
  //   2) sondear la traducción en ACC (60–95%) y, al estar lista, el backend
  //      agrega el modelo (con su vista 3D por defecto) y ENCOLA la extracción
  //      de metadata — el mismo pipeline que update/relink/DOCS.
  // onProgress(percent, message) mantiene informado al modal en cada fase.
  const handleLocalUpload = useCallback(async (file, label, onProgress) => {
    if (!selectedProject) throw new Error("No hay proyecto seleccionado.");
    // La subida local SIEMPRE agrega (no implementa relink). Desarmar el target
    // para que un pick posterior en el mismo modal no dispare un relink fantasma.
    setRelinkTargetModel(null);
    const report = (p, msg) => { try { onProgress?.(p, msg); } catch (e) { /* noop */ } };

    // Fase 1: subir DIRECTO A AMAZON con URL firmada (el % de red va de 0 a 60).
    //
    // Los bytes ya no pasan por nuestro backend. No es una elegancia: el backend
    // corre con 4 workers x 2 hilos, o sea OCHO peticiones simultáneas para toda
    // la plataforma. Un modelo de 300 MB atravesándolo retenía uno de esos ocho
    // hilos varios minutos y además se leía entero en memoria; dos o tres a la
    // vez dejaban sin aire al portal, las fotos y el LOB. Ahora el backend solo
    // firma y cierra, que son dos llamadas cortas.
    report(2, 'Preparando la subida…');
    const fRes0 = await apiFetch(`${BACKEND_URL}/api/modelos/firmar-subida`, {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, size: file.size, project: selectedProject.id })
    });
    const firma = await fRes0.json().catch(() => ({}));
    if (!fRes0.ok || !firma.urls?.length) {
      throw new Error(firma.error || 'No se pudo preparar la subida.');
    }

    report(4, 'Subiendo archivo…');
    const trozo = firma.partSize;
    for (let i = 0; i < firma.urls.length; i++) {
      const parte = file.slice(i * trozo, (i + 1) * trozo);
      const put = await fetch(firma.urls[i], { method: 'PUT', body: parte });
      if (!put.ok) throw new Error(`Falló la subida del bloque ${i + 1} de ${firma.urls.length}.`);
      report(4 + Math.round(((i + 1) / firma.urls.length) * 56), 'Subiendo archivo…');
    }

    report(60, 'Cerrando la subida…');
    const fRes1 = await apiFetch(`${BACKEND_URL}/api/modelos/cerrar-subida`, {
      method: 'POST',
      body: JSON.stringify({ objectKey: firma.objectKey, uploadKey: firma.uploadKey,
                             filename: file.name, label, project: selectedProject.id })
    });
    const data = await fRes1.json().catch(() => ({}));
    if (!fRes1.ok || !data?.urn) throw new Error(data?.error || 'El upload no devolvió URN.');

    // Fase 2: sondear traducción → finalize agrega el modelo y encola extracción
    report(62, 'Traduciendo en ACC…');
    const started = Date.now();
    const TIMEOUT_MS = 20 * 60 * 1000; // 20 min para modelos grandes
    while (true) {
      if (Date.now() - started > TIMEOUT_MS) {
        throw new Error('La traducción tardó demasiado. Reintenta en unos minutos (el archivo ya quedó subido).');
      }
      const fRes = await apiFetch(`${BACKEND_URL}/api/config/project/upload/finalize`, {
        method: 'POST',
        body: JSON.stringify({ urn: data.urn, label, project: selectedProject.id })
      });
      const fin = await fRes.json().catch(() => ({}));
      if (!fRes.ok) throw new Error(fin.error || `Finalize HTTP ${fRes.status}`);
      if (fin.failed) throw new Error(fin.message || 'La traducción falló en ACC.');

      if (fin.ready) {
        // Modelo agregado: aplicar config, hidratar vista y sondear SU extracción
        if (fin.config?.models) {
          const mapped = fin.config.models.map(m => ({ ...m, label: m.name }));
          if (fin.defaultViewGuid) {
            setActiveViewableGuids(prev => ({ ...prev, [fin.urn]: fin.defaultViewGuid }));
          }
          setModels(mapped);
        }
        window.__inventoryCache = null;
        if (fin.extraction_job_id) triggerBackgroundExtraction(fin.urn, fin.extraction_job_id);
        report(100, 'Modelo listo. Extrayendo metadata en segundo plano…');
        return fin;
      }

      const pctText = String(fin.progress || '');
      const match = pctText.match(/(\d+)\s*%/);
      const transPct = match ? Number(match[1]) : null;
      report(transPct != null ? 62 + Math.round(transPct * 0.33) : 70,
        `Traduciendo en ACC… ${transPct != null ? transPct + '%' : ''}`.trim());
      await new Promise(r => setTimeout(r, 5000));
    }
  }, [selectedProject]);

  const removeModel = useCallback(async (urn) => {
    // 1. Optimistic local removal — avoids cross-project contamination from backend response
    setModels(prev => prev.filter(m => m.urn !== urn));
    setHiddenModelUrns(prev => prev.filter(u => u !== urn));

    try {
      await apiFetch(`${BACKEND_URL}/api/config/project/remove`, {
        method: 'POST',
        body: JSON.stringify({ urn, project: selectedProject.id })
      });
      // Don't use the response to update state — local optimistic update already handled it

      // COHERENCIA INVENTORY/FILTER: el backend ya purgó inventory_assets del
      // modelo eliminado. Sin este refresh, sus elementos seguían apareciendo
      // en Inventario y Filtros hasta recargar la página.
      window.__inventoryCache = null;
      window.postgresInventory = null; window.postgresInventoryUrn = null;
      window.dispatchEvent(new CustomEvent('inventory-needs-refresh'));
    } catch (e) {
      console.error("Error removing model:", e);
      // On error, reload from server to restore correct state
      apiFetch(`${BACKEND_URL}/api/config/project?project=${selectedProject}`)
        .then(res => res.json())
        .then(data => {
          if (data.models) setModels(data.models.map(m => ({ ...m, label: m.name })));
        });
    }
  }, [selectedProject]);

  // Removed old upsertModel or kept it aliased?
  // We can remove upsertModel as it was local only.

  // ... (rest of code)

  // In JSX:
  // Remove tree-wrapper

  // Update ImportModelModal props



  const loadSingleModel = useCallback((model) => {
    if (!model?.urn) return;
    const label = model.name || 'Documento Build';
    // Replace all models with just this one
    setModels([{ ...model, label }]);
  }, []);

  const fetchSignedRead = useCallback(async (file) => {
    const storageId = file.storageId || file.storage_id;
    const projectId = file.projectId || file.project_id;
    const versionId = file.versionId || file.version_id;
    const body = storageId ? { storageId } : { projectId, versionId };
    const resp = await apiFetch(`${BACKEND_URL}/api/build/signed-read`, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(data.error || 'No se pudo obtener URL firmada de lectura.');
    }
    return data.signedUrl || data.url;
  }, []);



  const addDocuments = useCallback((items) => {
    if (!items?.length) return;
    setDocuments(prev => {
      const existing = new Set(prev.map(doc => doc.id));
      const merged = [...prev];
      items.forEach(item => {
        if (!existing.has(item.id)) {
          merged.push(item);
        }
      });
      return merged;
    });
  }, []);

  const removeDocument = useCallback((doc) => {
    setDocuments(prev => prev.filter(item => item.id !== doc.id));
  }, []);

  const addSprite = useCallback(({ position, dbId }) => {
    const pos = position
      ? {
        x: position.x ?? position.X ?? position[0] ?? 0,
        y: position.y ?? position.Y ?? position[1] ?? 0,
        z: position.z ?? position.Z ?? position[2] ?? 0
      }
      : { x: 0, y: 0, z: 0 };
    setSprites(prev => {
      const id = `sprite-${Date.now()}-${prev.length + 1}`;
      const name = `Location ${prev.length + 1}`;
      const next = [...prev, { id, name, position: pos, dbId: dbId || null }];
      setActiveSpriteId(id);
      return next;
    });
  }, []);

  const requestSpritePlacement = useCallback(() => {
    // Check if there's at least one model loaded
    if (models.length === 0) {
      alert('Please load a 3D model first before adding sprites.\n\n1. Go to "Files" panel\n2. Select a model from Autodesk Docs\n3. Then return to "Docs" and click "+ Add sprite"');
      return;
    }

    setActivePanel('docs');
    setPanelVisible(true);
    setShowSprites(true);
    setSpritePlacementActive(true);
  }, [models]);

  const handlePlacementComplete = useCallback((payload) => {
    if (!payload) {
      setSpritePlacementActive(false);
      return;
    }
    addSprite(payload);
    setSpritePlacementActive(false);
  }, [addSprite]);

  const handleSpriteDelete = useCallback((spriteId) => {
    setSprites(prev => prev.filter(s => s.id !== spriteId));
    if (activeSpriteId === spriteId) {
      setActiveSpriteId(null);
    }
  }, [activeSpriteId]);

  const handleSpriteSelect = useCallback((id) => {
    setActiveSpriteId(id);
    // If we want to open a panel or something upon selection, do it here
    if (id) {
      setActivePanel('docs');
      setPanelVisible(true);
    }
  }, []);

  // Load Tracking Data on Mount or Project Change
  useEffect(() => {
    // NI CON SESION NI POR ENLACE: el seguimiento de obra (pines, fotos de
    // avance) es del equipo. Antes se dejaba pasar el modo compartido
    // pensando que le servia, pero sin sesion la ruta responde 401: el
    // invitado solo recibia errores.
    if (!user) return;

    const fetchTracking = async () => {
      try {
        const urn = selectedProject?.id || 'global';
        console.log(`[App] Fetching tracking data for urn: ${urn}`);
        const res = await apiFetch(`${BACKEND_URL}/api/project-pins?model_urn=${urn}&t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (res.ok) {
          const data = await res.json();
          console.log(`[App] Received tracking data:`, data);
          setTrackingData({
            avance: data.avance || [],
            fotos: data.fotos || [],
            docs: data.docs || [],
            rfis: data.rfis || [],
            restricciones: data.restricciones || [],
            maquinaria: data.maquinaria || []
          });
        } else {
          console.error(`[App] Failed to fetch tracking data. Status: ${res.status}`);
        }
      } catch (e) {
        console.error("Failed to load tracking data", e);
      }
    };

    const fetchDocPins = async () => {
      try {
        const projectUrn = selectedProject?.id || 'global';
        const res = await apiFetch(`${BACKEND_URL}/api/pins?project=${projectUrn}`);
        if (res.ok) {
          const data = await res.json();
          const loadedDocs = data.filter(p => p.type === 'doc').map(p => ({
            id: p.id,
            x: p.x_coord,
            y: p.y_coord,
            z: p.z_coord,
            objectName: p.name,
            docs: p.attachment_url ? [{ url: p.attachment_url, name: 'Adjunto' }] : []
          }));
          setDocPins(loadedDocs);
        }
      } catch (e) {
        console.error("Error fetching doc pins", e);
      }
    };

    fetchTracking();
    fetchDocPins();

    // 📸 DALUX-STYLE: Resume any pending photo uploads from IndexedDB
    const resumePendingUploads = async () => {
      try {
        // STEP 1: Show thumbnails IMMEDIATELY from IndexedDB (user sees them right away)
        const pendingThumbs = await getPendingThumbnails();
        if (pendingThumbs.length > 0) {
          console.log(`[App] 📸 Showing ${pendingThumbs.length} pending thumbnail(s) from local storage`);
          setTrackingData(prev => {
            const updatedFotos = prev.fotos.map(pin => {
              const thumbsForPin = pendingThumbs.filter(t => String(t.pinId) === String(pin.id));
              if (thumbsForPin.length === 0) return pin;
              const existingIds = new Set((pin.photos || []).map(p => String(p.id)));
              const newPhotos = thumbsForPin
                .filter(t => !existingIds.has(String(t.photo.id)))
                .map(t => t.photo);
              return { ...pin, photos: [...(pin.photos || []), ...newPhotos] };
            });
            return { ...prev, fotos: updatedFotos };
          });
        }

        // STEP 2: Upload in background (replace blob URL with permanent cloud URL when done)
        const onPhotoUploaded = (pinId, photoData) => {
          console.log(`[App] ✅ Pending photo uploaded for pin ${pinId}`);
          setTrackingData(prev => {
            const updatedFotos = prev.fotos.map(pin => {
              if (String(pin.id) === String(pinId)) {
                const existingIds = (pin.photos || []).map(p => String(p.id));
                if (existingIds.includes(String(photoData.id))) {
                  return {
                    ...pin,
                    photos: pin.photos.map(p => String(p.id) === String(photoData.id) ? photoData : p)
                  };
                }
                return { ...pin, photos: [...(pin.photos || []), photoData] };
              }
              return pin;
            });
            const newState = { ...prev, fotos: updatedFotos };
            saveTrackingData(newState);
            return newState;
          });
        };
        
        window.onPhotoUploadedCallback_for_background = onPhotoUploaded;

        await processPendingUploads(onPhotoUploaded, () => BACKEND_URL);
      } catch (e) {
        console.error('[App] Error resuming pending uploads:', e);
      }
    };
    // Small delay to let tracking data load first
    setTimeout(resumePendingUploads, 2000);

  }, [selectedProject, user, isSharedMode]);

  useEffect(() => {
    const handleTooltipUpdate = (e) => {
      const { pinId, equipo, personal, actividad } = e.detail;
      handleTrackingPinUpdate('maquinaria', pinId, { equipo, personal, actividad });
    };
    window.addEventListener('maqPinUpdateFromTooltip', handleTooltipUpdate);
    return () => window.removeEventListener('maqPinUpdateFromTooltip', handleTooltipUpdate);
  }, []);

  // Save Tracking Data Helper
  const saveTrackingData = async (newData) => {
    if (saveTrackingData.timeoutId) {
      clearTimeout(saveTrackingData.timeoutId);
    }

    // 🛡️ OFFLINE FIX: Never send "Subiendo..." pending photos to the backend.
    // They are safe in IndexedDB and will be sent once they actually upload.
    const sanitizedData = JSON.parse(JSON.stringify(newData));
    
    if (sanitizedData.fotos) {
      sanitizedData.fotos = sanitizedData.fotos.map(pin => {
        if (pin.photos) {
          pin.photos = pin.photos.filter(p => !p.isUploading);
        }
        return pin;
      });
    }

    const urn = selectedProject?.id || 'global';
    
    // 🛡️ RACE CONDITION FIX: Wait 1.5s for rapid photo uploads to settle
    saveTrackingData.timeoutId = setTimeout(async () => {
      try {
        await apiFetch(`${BACKEND_URL}/api/project-pins?model_urn=${urn}`, {
          method: 'POST',
          body: JSON.stringify(sanitizedData)
        });
      } catch (e) {
        console.error("Failed to save tracking data", e);
      }
    }, 1500);
  };

  // Categorías que el usuario puede CREAR desde la UI de seguimiento
  const VALID_TRACKING_CATEGORIES = ['avance', 'fotos', 'docs', 'rfis', 'restricciones'];
  // Categorías existentes en data (maquinaria se crea por otro flujo pero debe poder editarse/borrarse)
  const ALL_TRACKING_CATEGORIES = [...VALID_TRACKING_CATEGORIES, 'maquinaria'];

  // Resuelve la categoría real de un pin buscándolo por id en trackingData
  const findPinCategory = (pinId) => {
    for (const t of ALL_TRACKING_CATEGORIES) {
      if ((trackingData[t] || []).some(p => String(p.id) === String(pinId))) return t;
    }
    return null;
  };

  // Commit final de un pin nuevo (tras el modal si la categoría requiere texto)
  const commitTrackingPin = (tab, pin) => {
    setTrackingData(prev => {
      const currentList = prev[tab] || [];
      const updated = { ...prev, [tab]: [...currentList, pin] };
      saveTrackingData(updated); // Sync to backend
      return updated;
    });
  };

  const handleTrackingPinCreate = (newPin) => {
    // 🔒 Defensa estructural: Evita inyección de categorías no reconocidas
    if (!trackingTab || !VALID_TRACKING_CATEGORIES.includes(trackingTab)) {
      console.warn(`[Seguridad] Intento de creación de pin en pestaña no registrada: ${trackingTab}`);
      return;
    }

    if (trackingTab === 'avance' || trackingTab === 'rfis' || trackingTab === 'restricciones') {
      // Requieren texto del usuario: abrir modal propio (reemplaza prompt() nativo)
      setPinPrompt({ pin: newPin, tab: trackingTab });
      return;
    }

    if (trackingTab === 'docs') {
      commitTrackingPin('docs', { ...newPin, docs: [], color: '#8b5cf6' });
    } else {
      // fotos (y cualquier categoría sin texto inicial)
      commitTrackingPin(trackingTab, newPin);
    }
  };

  const handleTrackingPinDelete = async (type, id) => {
    // Resolver la categoría real del pin (la pestaña activa puede no coincidir)
    const actualType = findPinCategory(id) || type;
    if (!ALL_TRACKING_CATEGORIES.includes(actualType)) {
      console.warn(`[Seguridad] Operación DELETE abortada, categoría no válida: ${actualType}`);
      return;
    }
    type = actualType;

    // Optimistic Update
    setTrackingData(prev => {
      const currentList = prev[type] || [];
      const updatedList = currentList.filter(p => String(p.id) !== String(id));
      const newState = { ...prev, [type]: updatedList };
      saveTrackingData(newState);
      return newState;
    });

    // Close panels if open
    if (type === 'fotos') {
      setPhotoAlbumOpen(false);
      setSelectedAlbumPin(null);
    } else if (type === 'avance') {
      setProgressPanelOpen(false);
      setSelectedProgressPin(null);
    } else if (type === 'docs' || type === 'restricciones' || type === 'rfis') {
      setDocPinPanelOpen(false);
      setSelectedDocPin(null);
    }
  };

  // Update a specific tracking pin (e.g., change codigoPartida, val/name, etc.)
  const handleTrackingPinUpdate = (type, pinId, updates) => {
    if (!ALL_TRACKING_CATEGORIES.includes(type)) return;

    setTrackingData(prev => {
      // Ensure we are operating on the correct category (avance/docs/fotos/restricciones/rfis)
      const pins = prev[type] || [];
      const updatedPins = pins.map(pin =>
        String(pin.id) === String(pinId) ? { ...pin, ...updates } : pin
      );
      const newState = { ...prev, [type]: updatedPins };
      saveTrackingData(newState);
      return newState;
    });

    // Sync active selection state based on type
    if (type === 'avance') {
      setSelectedProgressPin(prev =>
        prev && String(prev.id) === String(pinId) ? { ...prev, ...updates } : prev
      );
    } else if (type === 'fotos') {
      setSelectedAlbumPin(prev =>
        prev && String(prev.id) === String(pinId) ? { ...prev, ...updates } : prev
      );
    } else if (type === 'docs' || type === 'restricciones') {
      setSelectedDocPin(prev =>
        prev && String(prev.id) === String(pinId) ? { ...prev, ...updates } : prev
      );
    }
  };

  // Handle Pin Relocation: user clicked a new position in the 3D viewer
  const handlePinRelocateComplete = useCallback((newPos) => {
    if (!relocatingPin) return;
    const { id, type } = relocatingPin;
    setRelocatingPin(null); // Exit relocate mode

    // Update local state + sync to backend via saveTrackingData
    setTrackingData(prev => {
      const pins = prev[type] || [];
      const updatedPins = pins.map(pin =>
        String(pin.id) === String(id)
          ? { ...pin, x: newPos.x, y: newPos.y, z: newPos.z }
          : pin
      );
      const newState = { ...prev, [type]: updatedPins };
      saveTrackingData(newState);
      console.log(`[App] Pin ${id} reubicado a (${newPos.x.toFixed(2)}, ${newPos.y.toFixed(2)}, ${newPos.z.toFixed(2)})`);
      return newState;
    });
  }, [relocatingPin]);

  const handleTrackingPinClick = useCallback((pin) => {
    console.log('[App] Pin Clicked:', pin);
    // Use _trackingType (tagged by BuildPanel) as fallback if trackingTab is null or mismatched
    const effectiveType = trackingTab || pin._trackingType;

    if (effectiveType === 'fotos') {
      setSelectedAlbumPin(pin);
      setPhotoAlbumOpen(true);
      setPanelDocked(true);
      if (!trackingTab) setTrackingTab('fotos');
    } else if (effectiveType === 'avance') {
      setSelectedProgressPin(pin);
      setProgressPanelOpen(true);
      setPanelDocked(true);
      if (!trackingTab) setTrackingTab('avance');
    } else if (effectiveType === 'docs' || effectiveType === 'restricciones' || effectiveType === 'rfis') {
      setSelectedDocPin(pin);
      setDocPinPanelOpen(true);
      setPanelDocked(true);
      if (!trackingTab) setTrackingTab(effectiveType);
    }
  }, [trackingTab]);

  const handleTrackingPlacementToggle = (type) => {
    // Sin tipo (cambio de pestaña, cancelación): apagar el modo colocación
    if (!type) {
      setTrackingPlacementMode(false);
      return;
    }
    const tabMap = {
      'avance': 'avance',
      'fotos': 'fotos',
      'docs': 'docs',
      'rfis': 'rfis',
      'restriction': 'restricciones',
      'restricciones': 'restricciones'
    };
    const targetTab = tabMap[type];
    if (!targetTab) {
      console.warn(`[Seguimiento] Tipo de colocación no reconocido: ${type}`);
      return;
    }

    if (trackingTab === targetTab) {
      setTrackingPlacementMode(prev => !prev);
    } else {
      setTrackingTab(targetTab);
      setTrackingPlacementMode(true);
    }
  };

  const handleCameraCapture = (file) => {
    console.log('[App] Photo captured from BuildPanel:', file);
    // This could trigger a pinning process or photo upload
    alert("Foto capturada: " + file.name + ". Funcionalidad de auto-pin próximamente.");
  };

  const handleAddPhotoToPin = (newPhoto, isUpdate = false) => {
    if (!selectedAlbumPin) return;

    setTrackingData(prev => {
      const updatedFotos = prev.fotos.map(pin => {
        if (String(pin.id) === String(selectedAlbumPin.id)) {
          if (isUpdate) {
            return {
              ...pin,
              photos: (pin.photos || []).map(p => String(p.id) === String(newPhoto.tempId) ? newPhoto : p)
            };
          }
          return { ...pin, photos: [...(pin.photos || []), newPhoto] };
        }
        return pin;
      });
      const newState = { ...prev, fotos: updatedFotos };

      // Si es un update (carga finalizada) o no es temporal, guardamos en GCS
      if (isUpdate || !newPhoto.isUploading) {
        saveTrackingData(newState);
      }

      return newState;
    });

    // Update Selected Pin State
    setSelectedAlbumPin(prev => {
      if (isUpdate) {
        return {
          ...prev,
          photos: (prev.photos || []).map(p => String(p.id) === String(newPhoto.tempId) ? newPhoto : p)
        };
      }
      return { ...prev, photos: [...(prev.photos || []), newPhoto] };
    });
  };

  const handleDeletePhotoFromPin = (pinId, photoId) => {
    setTrackingData(prev => {
      const updatedFotos = prev.fotos.map(pin => {
        if (String(pin.id) === String(pinId)) {
          return {
            ...pin,
            photos: (pin.photos || []).filter(p => String(p.id) !== String(photoId))
          };
        }
        return pin;
      });
      const newState = { ...prev, fotos: updatedFotos };
      saveTrackingData(newState); // Sincroniza al backend (el backend detectará el faltante y borrará de GCS)
      return newState;
    });

    setSelectedAlbumPin(prev => {
      if (prev && String(prev.id) === String(pinId)) {
        return {
          ...prev,
          photos: (prev.photos || []).filter(p => String(p.id) !== String(photoId))
        };
      }
      return prev;
    });
  };

  const handleUpdatePhotoInPin = (pinId, photoId, newFields) => {
    setTrackingData(prev => {
      const updatedFotos = prev.fotos.map(pin => {
        if (String(pin.id) === String(pinId)) {
          return {
            ...pin,
            photos: (pin.photos || []).map(p => String(p.id) === String(photoId) ? { ...p, ...newFields } : p)
          };
        }
        return pin;
      });
      const newState = { ...prev, fotos: updatedFotos };
      saveTrackingData(newState);
      return newState;
    });

    setSelectedAlbumPin(prev => {
      if (prev && String(prev.id) === String(pinId)) {
        return {
          ...prev,
          photos: (prev.photos || []).map(p => String(p.id) === String(photoId) ? { ...p, ...newFields } : p)
        };
      }
      return prev;
    });
  };

  // Attach multiple docs to a pin in one go
  const handleAttachBatchDocsToPin = (pinId, newDocs, pinType = 'docs') => {
    setTrackingData(prev => {
      const targetArray = prev[pinType] || [];
      const updatedList = targetArray.map(pin => {
        if (String(pin.id) === String(pinId)) {
          return { ...pin, docs: [...(pin.docs || []), ...newDocs] };
        }
        return pin;
      });
      const newState = { ...prev, [pinType]: updatedList };
      saveTrackingData(newState);
      return newState;
    });

    setSelectedDocPin(prev => {
      if (!prev || String(prev.id) !== String(pinId)) return prev;
      return { ...prev, docs: [...(prev.docs || []), ...newDocs] };
    });
  };

  // Attach a doc (PDF) to a doc pin
  const handleAttachDocToPin = async (pinId, doc, isUpdate = false, pinType = 'docs') => {

    if (!isUpdate) {
      // Encontrar el pin objetivo para extraer dbId y urn
      const targetArray = trackingData[pinType] || [];
      const targetPin = targetArray.find(p => p.id === pinId);

      if (targetPin && targetPin.dbId) {
        try {
          // Disparar Payload Simétrico al Backend para persistencia real (dataType: 25)
          const payload = {
            urn: targetPin.modelUrn || targetPin.urn || 'global',
            dbId: targetPin.dbId,
            documentName: doc.name || doc.plano_titulo || 'Documento Adjunto',
            documentUrl: doc.nodeId || doc.url,
            dataType: 25
          };

          const API_URL = import.meta.env.VITE_BACKEND_URL || '';
          const response = await fetch(`${API_URL}/api/docs/mutate-bind`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (!response.ok) {
            console.warn('[APS Bridge] Fallo la inyección del puntero en el servidor', await response.text());
            return; // Abort local UI update if server failed (as requested)
          }
          console.log('[APS Bridge] Inyección dataType: 25 persistida con éxito en BIM-Talara.');
        } catch (e) {
          console.error('[APS Bridge] API no disponible para mutate-bind u ocurrió un error de red:', e);
          return; // Abort
        }
      }
    }

    setTrackingData(prev => {
      const targetArray = prev[pinType] || [];
      const updatedDocs = targetArray.map(pin => {
        if (pin.id === pinId) {
          let newDocs;
          if (isUpdate) {
            newDocs = (pin.docs || []).map(d =>
              (d.nodeId === doc.nodeId || d.id === doc.id) ? { ...d, ...doc } : d
            );
          } else {
            newDocs = [...(pin.docs || []), doc];
          }
          return { ...pin, docs: newDocs };
        }
        return pin;
      });
      const newState = { ...prev, [pinType]: updatedDocs };
      saveTrackingData(newState);
      return newState;
    });
    // Update selected pin state
    setSelectedDocPin(prev => {
      if (!prev || prev.id !== pinId) return prev;
      let newDocs;
      if (isUpdate) {
        newDocs = (prev.docs || []).map(d =>
          (d.nodeId === doc.nodeId || d.id === doc.id) ? { ...d, ...doc } : d
        );
      } else {
        newDocs = [...(prev.docs || []), doc];
      }
      return { ...prev, docs: newDocs };
    });
  };

  // Remove a doc from a doc pin
  const handleRemoveDocFromPin = (pinId, docId, pinType = 'docs') => {
    setTrackingData(prev => {
      const targetArray = prev[pinType] || [];
      const updatedDocs = targetArray.map(pin => {
        if (pin.id === pinId) {
          return { ...pin, docs: (pin.docs || []).filter(d => d.id !== docId) };
        }
        return pin;
      });
      const newState = { ...prev, [pinType]: updatedDocs };
      saveTrackingData(newState);
      return newState;
    });
    // Update selected pin state
    setSelectedDocPin(prev =>
      prev && prev.id === pinId
        ? { ...prev, docs: (prev.docs || []).filter(d => d.id !== docId) }
        : prev
    );
  };


  const selectedPropertyObjects = useMemo(() => (
    filterProperties
      .map(id => availableProperties.find(prop => prop.id === id))
      .filter(Boolean)
  ), [filterProperties, availableProperties]);

  const [visiblePropertiesCount, setVisiblePropertiesCount] = useState(5);

  const visiblePropertyObjects = useMemo(() =>
    selectedPropertyObjects.slice(0, visiblePropertiesCount),
    [selectedPropertyObjects, visiblePropertiesCount]
  );

  const hasMoreProperties = selectedPropertyObjects.length > visiblePropertiesCount;

  const [dynamicFilterBuckets, setDynamicFilterBuckets] = useState({});

  // 1. Recibir los resultados del Motor APS
  useEffect(() => {
    const handleFiltersCalculated = (e) => {
      setDynamicFilterBuckets(e.detail);
    };
    window.addEventListener('filters-calculated', handleFiltersCalculated);
    return () => window.removeEventListener('filters-calculated', handleFiltersCalculated);
  }, []);

  // 2. Disparar recálculos nativos sin colapsar React
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('recalculate-filters', {
      detail: { filterProperties, filterSelections }
    }));
  }, [filterProperties, filterSelections]);

  const togglePropertyAll = useCallback((propId) => {
    const bucket = dynamicFilterBuckets[propId];
    if (!bucket) return;

    const allValues = bucket.values.map(v => v.value);
    const currentSelection = filterSelections[propId] || [];

    // Logic: If ALL are currently selected, deselect ALL.
    // Otherwise (mix or none), select ALL.
    // Use the bucket values count to determine if all are selected
    const isAllSelected = currentSelection.length === bucket.values.length;

    if (isAllSelected) {
      setFilterSelections(prev => {
        const next = { ...prev };
        delete next[propId]; // Empty selection
        return next;
      });
    } else {
      setFilterSelections(prev => ({
        ...prev,
        [propId]: allValues
      }));
    }
  }, [dynamicFilterBuckets, filterSelections]);

  const handleValueToggle = useCallback((propId, value) => {
    setFilterSelections(prev => {
      const currentList = prev[propId] || [];
      const isAllVirtual = currentList.length === 0; // "Virtual All" state

      let nextList;

      if (isAllVirtual) {
        // From "All Visible" -> "Isolate One"
        nextList = [value];
      } else {
        // Standard Toggle
        const currentSet = new Set(currentList);
        if (currentSet.has(value)) {
          currentSet.delete(value);
        } else {
          currentSet.add(value);
        }
        nextList = Array.from(currentSet);
      }

      const next = { ...prev };
      if (nextList.length > 0) {
        next[propId] = nextList;
      } else {
        // If empty, delete key -> Returns to "All Visible"
        delete next[propId];
      }
      return next;
    });
  }, []);

  // State for color toggles (per property) - MOVED TO TOP
  // const [filterColors, setFilterColors] = useState({});

  const PALETTE = [
    '#7e9bbd', '#F97316', '#10B981', '#F43F5E', '#A855F7', '#5f7fa3', '#EAB308',
    '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#84CC16', '#F59E0B'
  ];

  // ... existing code ...



  const toggleColor = useCallback((propId) => {
    setFilterColors(prev => ({
      ...prev,
      [propId]: !prev[propId]
    }));
  }, []);

  const handleLogoClick = useCallback(() => {
    // Return to Landing Page immediately and clean up
    console.log('[App] Logo Clicked - Resetting State');

    // Batch updates where possible, though React 18 does this automatically
    setSelectedProject(null);
    setPanelVisible(false);
    setActivePanel(null);
    setModels([]);
    setSavedViews([]);
    setDocuments([]);
    setSprites([]);
    setHiddenModelUrns([]);

    setAvailableProperties([]);
    setFilterSelections({});
  }, []);

  const toggleExpandBlock = useCallback((propId) => {
    setExpandedFilters(prev => ({ ...prev, [propId]: !prev[propId] }));
  }, []);
  // Escucha el esquema de propiedades extraído nativamente por el Viewer
  useEffect(() => {
    const handleSchemaExtracted = (e) => {
      console.log(`[REACT] ⏱️ ${performance.now().toFixed(2)}ms - Recibido: viewer-schema-extracted - Sincronizando propiedades disponibles.`);
      setAvailableProperties(e.detail.schema);
      // No dispatch aquí: el useEffect de filterProperties/filterSelections/availableProperties ya lo hará
    };
    window.addEventListener('viewer-schema-extracted', handleSchemaExtracted);
    return () => window.removeEventListener('viewer-schema-extracted', handleSchemaExtracted);
  }, [filterProperties, filterSelections]);

  // Recalcular nativamente las cubetas cuando cambia la selección de filtros o de las categorías base
  useEffect(() => {
    if (availableProperties.length === 0) return; // No disparar si no ha cargado el esquema
    
    const triggerRecalc = () => {
        console.log(`[REACT] ⏱️ ${performance.now().toFixed(2)}ms - Cambio detectado: Disparando recalculate-filters hacia LMV`);
        window.dispatchEvent(new CustomEvent('recalculate-filters', {
          detail: { filterProperties, filterSelections }
        }));
    };

    triggerRecalc();

    // Cuando un nuevo modelo termina de indexar su árbol (rosetta-ready), forzar recálculo
    // para que la UI incluya sus elementos en los buckets de filtros.
    window.addEventListener('rosetta-ready', triggerRecalc);
    return () => window.removeEventListener('rosetta-ready', triggerRecalc);
  }, [filterProperties, filterSelections, availableProperties.length, hiddenModelUrns]);

  // Guardar en la UI las nuevas cubetas calculadas asincrónicamente por el Viewer LMV Worker
  useEffect(() => {
    const handleFiltersCalculated = (e) => {
      console.log(`[REACT] ⏱️ ${performance.now().toFixed(2)}ms - Recibido: filters-calculated - Actualizando UI de Paneles`);
      setDynamicFilterBuckets(e.detail);

      // AUTO-INYECCIÓN VISTA GUARDADA: Si al terminar de cargar los buckets hay colores activos, reinstanciarlos
      Object.keys(filterColors).forEach(propId => {
          if (filterColors[propId]) {
              const selectedValues = filterSelections[propId] || [];
              window.dispatchEvent(new CustomEvent('theme-property-bucket', {
                  detail: {
                      propId,
                      values: selectedValues.length > 0 ? selectedValues : null,
                      active: true,
                      paletteName: 'Classic Tandem'
                  }
              }));
          }
      });
    };
    window.addEventListener('filters-calculated', handleFiltersCalculated);
    return () => window.removeEventListener('filters-calculated', handleFiltersCalculated);
  }, [filterColors, filterSelections]);

  // --- RENDER: LOGIN -> LANDING -> APP ---
  // Auth robusto: mostramos login si NO hay sesion. El gateway (frontend-docs)
  // pasa ?session_token=... que apiFetch ya capturo a localStorage; si existe,
  // entramos directo con el token real. Si no hay token ni usuario, login.
  const _hasSession = !!(
    localStorage.getItem('visor_session_token') ||
    sessionStorage.getItem('visor_session_token') ||
    new URLSearchParams(window.location.search).get('session_token')
  );
  if (!user && !_hasSession && !isSharedMode) {
    return <LoginScreen onLogin={handleLoginSuccess} />;
  }

  if (isSharedMode && !sharedViewData) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#1c2027', color: 'white', fontFamily: 'sans-serif' }}><h3>Cargando Vista Compartida...</h3></div>;
  }

  if (!selectedProject && !isSharedMode) {
    return <LandingPage onSelectProject={setSelectedProject} user={user} />;
  }

  // Multi-tenant key: project.id is the unique scope for all data (like ACC project URN)
  const activeModelUrn = (selectedProject?.id) || 'global';

  return (
    <div className={`app-layout ${activeSheet ? 'doc-open' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      {!isSharedMode && (
        <TopBar
          user={user}
          onLogout={BYPASS_AUTH ? null : handleLogout}
          activePanel={activePanel}
          togglePanel={togglePanel}
          isViewsActive={activePanel === 'views'}
          onLogoClick={() => {
            if (activePanel) {
              setActivePanel(null);
            } else {
              setSelectedProject(null);
            }
          }}
          selectedProject={selectedProject}
          onUniversalSearch={handleUniversalSearch}
        />
      )}
      <div className="app-container" style={{ flex: 1, position: 'relative' }}>

        {/* Portal for floating Tandem Overlays (e.g. Heatmaps) */}
        <div id="viewer-top-portal" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9999 }}></div>

        {/* Photo Album Modal Removed - Now Inserted in Split View below */}

        {showSplash && (
          <div className="splash-screen" style={{ backgroundImage: `url('/FONDO_PAGINA.jpg')` }}>
            <img src="/POWER_CHINA.webp" alt="Company logo" />
          </div>
        )}
        {/* Expand Rail Button (Only visible when rail is hidden) */}
        {!isSharedMode && !isRailExpanded && (
          <button
            onClick={toggleRail}
            className="desktop-rail-toggle"
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              zIndex: 3000,
              background: '#1c2027',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              width: '40px',
              height: '40px',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              cursor: 'pointer'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
        )}

        {/* Navigation Rail */}
        {!isSharedMode && isRailExpanded && (
          <nav className="app-left-rail" aria-label="Primary tools">
            <button
              type="button"
              className={`rail-button ${activePanel === 'filters' && panelVisible ? 'active' : ''}`}
              onClick={() => togglePanel('filters')}
              title="Filters"
            >
              <FilterIcon />
              <span className="rail-label" style={{ fontWeight: 700 }}>Filters</span>
            </button>

            <button
              type="button"
              className={`rail-button ${activePanel === 'files' && panelVisible ? 'active' : ''}`}
              onClick={() => togglePanel('files')}
              title="Files"
            >
              <FolderIcon />
              <span className="rail-label" style={{ fontWeight: 700 }}>Files</span>
            </button>


            <button
              type="button"
              className={`rail-button ${activePanel === 'progress' && panelVisible ? 'active' : ''}`}
              onClick={() => togglePanel('progress')}
              title="Seguimiento"
            >
              <ProgressIcon />
              <span className="rail-label" style={{ fontWeight: 700 }}>Seguimiento</span>
            </button>

            <button
              type="button"
              className={`rail-button ${lob4dTabOpen ? 'active' : ''}`}
              style={restrictedRailStyle}
              onClick={() => {
                if (!isAdminUser) return denyAccess('4D LOB');
                const nextOpen = !lob4dTabOpen;
                setLob4dTabOpen(nextOpen);
                if (nextOpen) {
                  setCompareMode(false);
                  setBudgetTabOpen(false);
                  setInventoryTabOpen(false);
                  setActivePanel(null);
                  setPanelVisible(false);
                }
              }}
              title={isAdminUser ? '4D LOB' : '4D LOB (requiere permisos)'}
            >
              <FourDIcon />
              <span className="rail-label" style={{ fontWeight: 700 }}>4D LOB</span>
            </button>

            <button
              type="button"
              className={`rail-button ${activePanel === 'civil' && panelVisible ? 'active' : ''}`}
              style={restrictedRailStyle}
              onClick={() => {
                if (!isAdminUser) return denyAccess('Civil');
                togglePanel('civil');
              }}
              title={isAdminUser ? 'Herramientas de civil' : 'Civil (requiere permisos)'}
            >
              <CivilRoadIcon />
              <span className="rail-label" style={{ fontWeight: 700 }}>Civil</span>
            </button>

            <button
              type="button"
              className={`rail-button ${geoPanelOpen ? 'active' : ''}`}
              style={restrictedRailStyle}
              onClick={() => {
                if (!isAdminUser) return denyAccess('Topografía');
                setGeoPanelOpen((v) => !v);
              }}
              title={isAdminUser ? 'Topografía: puntos de control y amarre UTM' : 'Topografía (requiere permisos)'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3 L12 13"></path>
                <circle cx="12" cy="16" r="3"></circle>
                <path d="M5 21 L19 21"></path>
                <path d="M7 6 L12 3 L17 6"></path>
              </svg>
              <span className="rail-label" style={{ fontWeight: 700 }}>Topografía</span>
            </button>

            <button
              type="button"
              className={`rail-button ${compareMode ? 'active' : ''}`}
              onClick={() => setCompareMode(true)}
              title="Comparar (contractual vs avance)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="4" width="9" height="16" rx="1"></rect>
                <rect x="13" y="4" width="9" height="16" rx="1"></rect>
                <line x1="6.5" y1="9" x2="6.5" y2="15"></line>
                <line x1="17.5" y1="9" x2="17.5" y2="15"></line>
              </svg>
              <span className="rail-label" style={{ fontWeight: 700 }}>Comparar</span>
            </button>

            <button
              type="button"
              data-test-id="nav-item-tablero"
              className={`rail-button ${tableroOpen ? 'active' : ''}`}
              style={restrictedRailStyle}
              onClick={() => {
                if (!isAdminUser) return denyAccess('Tablero');
                setTableroOpen(prev => !prev);
              }}
              title={isAdminUser ? 'Tablero de análisis (gráficos desde el modelo)' : 'Tablero (requiere permisos)'}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="20" x2="6" y2="10"></line>
                <line x1="12" y1="20" x2="12" y2="4"></line>
                <line x1="18" y1="20" x2="18" y2="14"></line>
              </svg>
              <span className="rail-label" style={{ fontWeight: 700 }}>Tablero</span>
            </button>





            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              {/* SEPARATOR AS IN TANDEM */}
              <div style={{ width: '40px', height: '1px', backgroundColor: '#444', margin: '8px auto' }}></div>

              <button
                type="button"
                data-test-id="nav-item-budget"
                className={`rail-button ${budgetTabOpen ? 'active' : ''}`}
                style={restrictedRailStyle}
                onClick={() => {
                  if (!isAdminUser) return denyAccess('BIM 5D');
                  setBudgetTabOpen(prev => !prev);
                }}
                title={isAdminUser ? 'BIM 5D - Presupuesto' : 'BIM 5D (requiere permisos)'}
              >
                <BudgetIcon />
                <span className="rail-label" style={{ fontWeight: 700 }}>BIM 5D</span>
              </button>

              <button
                type="button"
                data-test-id="nav-item-inventory"
                className={`rail-button ${inventoryTabOpen ? 'active' : ''}`}
                onClick={() => setInventoryTabOpen(prev => !prev)}
                title="Inventory"
              >
                <InventoryIcon />
                <span className="rail-label" style={{ fontWeight: 700 }}>Inventory</span>
              </button>
            </div>

          </nav>

        )}

        {/* Modo Comparador: overlay que toma el lienzo sin desmontar el visor principal */}
        {compareMode && (
          <CompareView BACKEND_URL={BACKEND_URL} projectId={selectedProject?.id}
                       onExit={() => setCompareMode(false)} />
        )}

        {lob4dTabOpen && (
          <LOB4DPanel
            models={models}
            activeViewableGuids={activeViewableGuids}
            project={selectedProject}
            onClose={() => setLob4dTabOpen(false)}
          />
        )}

        {geoPanelOpen && (
          <GeoControlPanel
            project={selectedProject}
            BACKEND_URL={BACKEND_URL}
            onClose={() => setGeoPanelOpen(false)}
          />
        )}


        {/* RAIL DEL ENLACE COMPARTIDO. Exactamente dos herramientas, y por
            eso es un rail PROPIO y no el de siempre con cosas escondidas: lo
            que no esta aqui no se puede alcanzar, en vez de estar oculto pero
            presente. El invitado filtra y consulta el inventario; nada mas. */}
        {isSharedMode && (
          <nav className="app-left-rail" aria-label="Vista compartida">
            <button
              type="button"
              className={`rail-button ${activePanel === 'filters' && panelVisible ? 'active' : ''}`}
              onClick={() => togglePanel('filters')}
              title="Filters"
            >
              <FilterIcon />
              <span className="rail-label" style={{ fontWeight: 700 }}>Filters</span>
            </button>

            <button
              type="button"
              className={`rail-button ${inventoryTabOpen ? 'active' : ''}`}
              onClick={() => setInventoryTabOpen(prev => !prev)}
              title="Inventory"
            >
              <InventoryIcon />
              <span className="rail-label" style={{ fontWeight: 700 }}>Inventory</span>
            </button>
          </nav>
        )}

        {/* En modo compartido esta barra SOLO puede traer el panel de filtros:
            es la mitad de lo que el enlace concede. Cualquier otro panel queda
            fuera aunque algo intente activarlo. */}
        {(!isSharedMode || activePanel === 'filters') && (
          <TandemSidebar
            activePanel={activePanel}
            panelVisible={panelVisible}
            sidebarWidth={sidebarWidth}
            setSidebarWidth={setSidebarWidth}
            models={models}
            activeModelUrn={selectedProject?.id || 'global'}
            hiddenModelUrns={hiddenModelUrns}
            selectedElement={selectedElement}

            dynamicFilterBuckets={dynamicFilterBuckets}
            filterSelections={filterSelections}
            filterColors={filterColors}
            expandedFilters={expandedFilters}
            facetSearch={facetSearch}
            visiblePropertyObjects={visiblePropertyObjects}
            hasMoreProperties={hasMoreProperties}
            handleToggleModelVisibility={handleToggleModelVisibility}
            togglePropertyAll={togglePropertyAll}
            handleValueToggle={handleValueToggle}
            toggleColor={toggleColor}
            setFilterConfiguratorOpen={setFilterConfiguratorOpen}
            setFilterSelections={setFilterSelections}
            setHiddenModelUrns={setHiddenModelUrns}
            setExpandedFilters={setExpandedFilters}
            setFacetSearch={setFacetSearch}
            setVisiblePropertiesCount={setVisiblePropertiesCount}
            PALETTE={PALETTE}
            DEFAULT_VISIBLE_VALUES={DEFAULT_VISIBLE_VALUES}
            modelViews={modelViews}
            activeViewableGuids={activeViewableGuids}
            handleLoadSpecificView={handleLoadSpecificView}
            handleModelUpdate={handleModelUpdate}
            handleUpdateAll={handleUpdateAll}
            updateAllBusy={updateAllBusy}
            removeModel={removeModel}
            setRelinkTargetModel={setRelinkTargetModel}
            extractionJobs={extractionJobs}
            availableUpdates={availableUpdates}
            updateCheckStatus={updateCheckStatus}
            sheets={sheets}
            onOpenSheet={setActiveLmvSheet}
            setImportModalOpen={setImportModalOpen}
            documents={documents}
            sprites={sprites}
            activeSpriteId={activeSpriteId}
            showSprites={showSprites}
            spritePlacementActive={spritePlacementActive}
            handleSpriteSelect={handleSpriteSelect}
            setDocumentsModalOpen={setDocumentsModalOpen}
            removeDocument={removeDocument}
            toggleSpritesVisibility={toggleSpritesVisibility}
            requestSpritePlacement={requestSpritePlacement}
            onUniversalSearch={handleUniversalSearch}
            universalSearch={universalSearch}
            onOpenDocument={handleOpenDocByNodeId}
            onCloseUniversalSearch={() => setPanelVisible(false)}
            onClosePanel={() => setPanelVisible(false)}
            BACKEND_URL={BACKEND_URL}


            // Tracking / BuildPanel Props
            trackingData={trackingData}
            onTrackingPinClick={handleTrackingPinClick}
            onTrackingPinDelete={(id) => handleTrackingPinDelete(findPinCategory(id), id)}
            onTrackingPlacementToggle={handleTrackingPlacementToggle}
            trackingPlacementMode={trackingPlacementMode}
            trackingPinsVisible={trackingPinsVisible}
            onToggleTrackingPins={() => setTrackingPinsVisible(prev => !prev)}
            onTrackingPinRename={(pinId, newName) => {
              const t = findPinCategory(pinId);
              if (t) handleTrackingPinUpdate(t, pinId, { val: newName });
            }}
            selectedPinId={selectedProgressPin?.id || selectedDocPin?.id || selectedAlbumPin?.id}
            onCameraCapture={handleCameraCapture}
            onPinMoveRequest={(pinId) => {
              const foundType = findPinCategory(pinId);
              if (foundType) {
                setRelocatingPin({ id: pinId, type: foundType });
                console.log(`[App] Modo Mover activado para pin ${pinId} (${foundType})`);
              }
            }}
          />
        )}

        <div className="app-viewer">
          {!isSharedMode && activePanel === 'progress' && (() => {
            // Diseño sobrio: acento de color sutil (icono + subrayado) en vez de
            // fondo saturado. Contador de pins por categoría para ver de un vistazo.
            const TABS = [
              { id: 'avance', label: 'Avance', color: '#7ea88f', icon: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /> },
              { id: 'fotos', label: 'Fotos', color: '#7e9bbd', icon: <><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></> },
              { id: 'docs', label: 'Documentos', color: '#9a8fb0', icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></> },
              { id: 'rfis', label: 'RFI', color: '#bd8585', icon: <><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></> },
              { id: 'restricciones', label: 'Restricciones', color: '#c2a878', icon: <><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></> },
            ];
            const docked = panelDocked && (
              (trackingTab === 'fotos' && photoAlbumOpen && selectedAlbumPin) ||
              (trackingTab === 'avance' && progressPanelOpen && selectedProgressPin) ||
              ((trackingTab === 'docs' || trackingTab === 'restricciones' || trackingTab === 'rfis') && docPinPanelOpen && selectedDocPin)
            );
            return (
            <div className="tracking-toolbar" style={{ left: docked ? '25%' : '50%' }}>
              {TABS.map(t => {
                const active = trackingTab === t.id;
                const count = (trackingData[t.id] || []).length;
                return (
                  <button
                    key={t.id}
                    title={t.label}
                    onClick={() => setTrackingTab(prev => prev === t.id ? null : t.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '7px 13px',
                      background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                      color: active ? '#eef1f5' : '#9aa3b0',
                      border: 'none', borderBottom: active ? `2px solid ${t.color}` : '2px solid transparent',
                      borderRadius: '6px 6px 0 0', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                      transition: 'all 0.15s ease', whiteSpace: 'nowrap'
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#cdd3da'; }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.color = '#9aa3b0'; }}
                  >
                    <span style={{ display: 'inline-flex', color: active ? t.color : '#7a828e' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{t.icon}</svg>
                    </span>
                    {t.label}
                    {count > 0 && (
                      <span style={{
                        fontSize: 10, fontWeight: 700, lineHeight: '14px', minWidth: 16, textAlign: 'center',
                        padding: '0 5px', borderRadius: 9,
                        background: active ? t.color : 'rgba(255,255,255,0.1)',
                        color: active ? '#15181d' : '#aab1bb'
                      }}>{count}</span>
                    )}
                  </button>
                );
              })}
              {trackingTab && (
                <>
                  <div style={{ width: 1, height: 22, background: 'rgba(255,255,255,0.12)', margin: '0 6px' }} />
                  <button
                    title={trackingPlacementMode ? 'Cancelar colocación' : 'Colocar un nuevo marcador en el modelo'}
                    onClick={() => setTrackingPlacementMode(prev => !prev)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                      background: trackingPlacementMode ? '#bd8585' : 'var(--alephia-interactive)', color: '#fff',
                      border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {trackingPlacementMode ? '✕ Cancelar' : '+ Nuevo'}
                  </button>
                </>
              )}
            </div>
            );
          })()}

          <div className="split-view-container" style={{
            // Split real con el Tablero: se reserva su ancho y el visor 3D se
            // encoge con transición (el ResizeObserver del Viewer re-encuadra).
            marginRight: tableroOpen ? tableroW : 0,
            transition: 'margin-right 0.22s ease',
          }}>
            <div className="split-3d" style={{ position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* 3D VIEWER - Hide when build is active */}
              <div style={{ flex: 1, minHeight: 0, position: 'relative', display: (activePanel === 'build') ? 'none' : 'block' }}>
                {!compareMode && (
                  <ErrorBoundary
                    scope="viewer"
                    title="El visor 3D falló"
                    message="El motor 3D (WebGL) encontró un error, posiblemente por memoria de GPU. El resto de la app sigue activo; recarga para reabrir el modelo."
                  >
                  <Viewer
                    key={selectedProject?.id || 'viewer-default'}
                    models={models}
                    hiddenModelUrns={hiddenModelUrns}
                    sprites={sprites}
                    showSprites={showSprites}
                    activeSpriteId={activeSpriteId}
                    onSpriteSelect={handleSpriteSelect}
                    onSpriteDelete={handleSpriteDelete}
                    placementMode={spritePlacementActive}
                    onPlacementComplete={handlePlacementComplete}
                    onModelProperties={handleModelProperties}
                    minimapActive={minimapActive}
                    vrActive={vrActive}
                    onSheetsLoaded={setSheets}
                    activeSheet={activeSheet}

                    // Doc Pins Props
                    docPins={docPins}
                    docPlacementMode={docPlacementMode}
                    onDocPlacementComplete={handleDocPinComplete}
                    onDocPinSelect={handleDocPinSelect}

                    // Viewables / Proposals
                    onViewablesLoaded={handleViewablesLoaded}
                    activeViewableGuids={activeViewableGuids}

                    arMode={false}

                    // SEGUIMIENTO PROPS
                    trackingTab={trackingTab}
                    trackingData={trackingData}
                    trackingPinsVisible={trackingPinsVisible}
                    trackingPlacementMode={trackingPlacementMode}
                    onTrackingPinCreate={handleTrackingPinCreate}
                    onTrackingPinClick={handleTrackingPinClick}
                    relocatingPin={relocatingPin}
                    onPinRelocateComplete={handlePinRelocateComplete}
                    onSelectionChanged={setSelectedElement}
                    aiModelCommand={aiModelCommand}
                    hideToolbar={activePanel === 'progress'}
                  />
                  </ErrorBoundary>
                )}

                {/* 📈 Perfil longitudinal interactivo (sincronizado con la PK 3D) */}
                {!compareMode && <ProfilePanel />}

                {/* 📐 Lámina 2D de Revit en panel dividido */}
                {!compareMode && activeLmvSheet && (
                  <SheetViewerPanel sheet={activeLmvSheet} onClose={() => setActiveLmvSheet(null)} />
                )}

                {/* 📈 Tablero de análisis (gráficos desde el Inventory, sync con el 3D) */}
                {tableroOpen && selectedProject && (
                  <React.Suspense fallback={null}>
                    <DashboardWorkspace
                      project={selectedProject.id}
                      backendUrl={BACKEND_URL}
                      onClose={() => setTableroOpen(false)}
                    />
                  </React.Suspense>
                )}

                {/* 🔗 Live Link Web ↔ Revit: vive como chip en la barra inferior (rightSlot) */}

                {/* ⚠️ GPU reset: canvas negro → ofrecer recarga en vez de app "muerta" */}
                {webglLost && (
                  <div style={{
                    position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(127,29,29,0.97)', border: '1px solid #b91c1c', color: '#fee2e2',
                    padding: '10px 18px', borderRadius: '9px', fontSize: '13px', fontWeight: 600,
                    zIndex: 1300, display: 'flex', alignItems: 'center', gap: '12px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                  }}>
                    <span>⚠️ La tarjeta gráfica se reinició y el visor perdió el lienzo.</span>
                    <button
                      onClick={() => window.location.reload()}
                      style={{ background: '#fff', border: 'none', color: '#7f1d1d', padding: '5px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 800 }}
                    >
                      Recargar visor
                    </button>
                  </div>
                )}

                {/* 🔒 Aviso de módulo sin permisos */}
                {permToast && (
                  <div style={{
                    position: 'absolute', top: '12px', left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(30,33,40,0.97)', border: '1px solid #4a4f58', color: '#e8d8b0',
                    padding: '9px 18px', borderRadius: '9px', fontSize: '13px', fontWeight: 600,
                    zIndex: 1200, boxShadow: '0 4px 20px rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
                  }}>
                    {permToast}
                  </div>
                )}

                {/* PIN RELOCATE BANNER */}
                {relocatingPin && (
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'rgba(59, 130, 246, 0.95)',
                    color: '#fff',
                    padding: '10px 24px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    zIndex: 999,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(8px)',
                    animation: 'fadeIn 0.2s ease'
                  }}>
                    <span>📌 Haz clic en la nueva ubicación del pin</span>
                    <button
                      onClick={() => setRelocatingPin(null)}
                      style={{
                        background: 'rgba(255,255,255,0.2)',
                        border: 'none',
                        color: '#fff',
                        padding: '4px 12px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 600
                      }}
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                {/* MODAL CREACIÓN DE PIN (reemplaza prompt() nativo) */}
                {pinPrompt && (() => {
                  const cfg = {
                    avance: {
                      title: 'Nuevo punto de avance',
                      label: pinPrompt.pin.codigoPartida ? `Porcentaje de avance (Partida: ${pinPrompt.pin.codigoPartida})` : 'Porcentaje de avance',
                      placeholder: 'Ej: 50%',
                      defaultVal: '0%',
                      accent: '#22c55e',
                      build: (val) => ({ ...pinPrompt.pin, val, color: '#fbbf24' })
                    },
                    rfis: {
                      title: 'Nuevo RFI',
                      label: 'Asunto del RFI',
                      placeholder: 'Ej: Consulta sobre detalle de armadura',
                      defaultVal: 'Nuevo RFI',
                      accent: '#ef4444',
                      build: (val) => ({ ...pinPrompt.pin, val, docs: [], color: '#ef4444', type: 'rfi' })
                    },
                    restricciones: {
                      title: 'Nueva restricción',
                      label: 'Descripción breve de la restricción / alerta',
                      placeholder: 'Ej: Falta liberación de área',
                      defaultVal: 'Pendiente',
                      accent: '#f59e0b',
                      build: (val) => ({ ...pinPrompt.pin, val, docs: [], color: '#f59e0b', type: 'restriction' })
                    }
                  }[pinPrompt.tab];
                  if (!cfg) return null;
                  const confirm = () => {
                    const input = document.getElementById('pin-prompt-input');
                    const val = (input?.value || '').trim() || cfg.defaultVal;
                    commitTrackingPin(pinPrompt.tab, cfg.build(val));
                    setPinPrompt(null);
                  };
                  return (
                    <div style={{
                      position: 'absolute', inset: 0, zIndex: 1200,
                      background: 'rgba(10,12,16,0.55)', backdropFilter: 'blur(3px)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }} onClick={() => setPinPrompt(null)}>
                      <div onClick={(e) => e.stopPropagation()} style={{
                        width: 'min(380px, 90vw)', background: '#1c2027',
                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                        padding: '20px', boxShadow: '0 12px 40px rgba(0,0,0,0.5)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: cfg.accent }}></span>
                          <span style={{ color: '#fff', fontSize: '14px', fontWeight: 700 }}>{cfg.title}</span>
                        </div>
                        <label style={{ display: 'block', color: '#9aa3b2', fontSize: '12px', marginBottom: '6px' }}>{cfg.label}</label>
                        <input
                          id="pin-prompt-input"
                          autoFocus
                          defaultValue={cfg.defaultVal}
                          placeholder={cfg.placeholder}
                          onKeyDown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') setPinPrompt(null); }}
                          onFocus={(e) => e.target.select()}
                          style={{
                            width: '100%', boxSizing: 'border-box', background: '#12151a',
                            border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px',
                            color: '#fff', padding: '9px 12px', fontSize: '13px', outline: 'none'
                          }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                          <button onClick={() => setPinPrompt(null)} style={{
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                            color: '#bbb', padding: '7px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 600
                          }}>Cancelar</button>
                          <button onClick={confirm} style={{
                            background: cfg.accent, border: 'none', color: '#fff',
                            padding: '7px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: 700
                          }}>Crear</button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* Barra inferior de capas (full-width, estilo Tandem): el visor
                  de arriba (flex:1) se achica solo para acomodarla. */}
              {!compareMode && activePanel !== 'build' && (
                <ViewerLabelsBar rightSlot={<>
                  <SectionCutTool />
                  {/* Mismo motivo que el latido: consulta /api/link/status cada
                      3 s y para un invitado siempre es 401. El enlace de Revit
                      es una herramienta del equipo, no del que recibe el enlace. */}
                  {!isSharedMode && (
                    <LinkRevitBadge variant="inline" project={selectedProject?.id} backendUrl={BACKEND_URL} />
                  )}
                  {!isSharedMode && !nativeArActive && selectedProject && models && models.length > 0 && (
                    <button
                      onClick={() => {
                        // UN SOLO AR. En el APK lo alimenta ARCore; en el
                        // navegador, el simulador. Antes habia dos componentes
                        // distintos y en la laptop se entraba al viejo, que no
                        // tenia seguimiento: de ahi el "por que hay dos AR".
                        setNativeArActive(true);
                      }}
                      title={isNativeAR() ? 'Realidad Aumentada (ARCore)' : 'Realidad Aumentada (ensayo, sin cámara real)'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', height: 26,
                        background: 'var(--alephia-interactive)', color: '#fff', border: 'none', borderRadius: 6,
                        fontWeight: 700, fontSize: 11.5, cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2l8.66 5v10L12 22l-8.66-5V7L12 2z" /><path d="M12 22V12M3.34 7L12 12l8.66-5" />
                      </svg>
                      AR
                    </button>
                  )}
                </>} />
              )}



              {/* BIM 5D BUDGET TREE - Overlay Panel */}
              {budgetTabOpen && (
                <div className="budget-overlay-panel" style={{
                  position: 'absolute',
                  bottom: 0,
                  left: panelVisible && activePanel && activePanel !== 'views' && activePanel !== 'inventory'
                    ? `${64 + sidebarWidth}px`
                    : '64px',
                  right: 0,
                  height: budgetPoppedOut ? '0px' : `${budgetPanelHeight}px`,
                  zIndex: 31,
                  display: budgetPoppedOut ? 'none' : 'flex',
                  flexDirection: 'column',
                  borderTop: '1px solid #2a2b30',
                  boxShadow: '0 -2px 12px rgba(0,0,0,0.5)',
                  pointerEvents: 'auto',
                  transition: 'left 0.3s ease'
                }}>
                  {/* Resize Handle */}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const startY = e.clientY;
                      const startH = budgetPanelHeight;
                      const onMove = (ev) => {
                        const delta = startY - ev.clientY;
                        const newH = Math.max(150, Math.min(600, startH + delta));
                        setBudgetPanelHeight(newH);
                      };
                      const onUp = () => {
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                      };
                      window.addEventListener('mousemove', onMove);
                      window.addEventListener('mouseup', onUp);
                    }}
                    style={{
                      height: '5px',
                      cursor: 'ns-resize',
                      background: 'transparent',
                      position: 'relative',
                      zIndex: 12,
                      flexShrink: 0
                    }}
                  >
                    <div style={{ position: 'absolute', left: '50%', top: '1px', transform: 'translateX(-50%)', width: '40px', height: '3px', borderRadius: '2px', background: '#555' }} />
                  </div>
                  <BudgetTree
                    activeModelUrn={selectedProject?.id || 'global'}
                    onClose={() => setBudgetTabOpen(false)}
                    onPoppedOut={(val) => setBudgetPoppedOut(val)}
                  />
                </div>
              )}

              {/* INVENTORY DATA GRID - Overlay Panel (Tandem Style) */}
              {inventoryTabOpen && (
                <div className="inventory-overlay-panel" style={{
                  position: 'absolute',
                  bottom: 0,
                  left: panelVisible && activePanel && activePanel !== 'views' && activePanel !== 'inventory'
                    ? `${64 + sidebarWidth}px`
                    : '64px',
                  right: 0,
                  height: `${inventoryPanelHeight}px`,
                  zIndex: 30,
                  display: 'flex',
                  flexDirection: 'column',
                  borderTop: '1px solid #2a2b30',
                  boxShadow: '0 -2px 12px rgba(0,0,0,0.5)',
                  pointerEvents: 'auto',
                  transition: 'left 0.3s ease'
                }}>
                  {/* Resize Handle */}
                  <div
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const startY = e.clientY;
                      const startH = inventoryPanelHeight;
                      const onMove = (ev) => {
                        const delta = startY - ev.clientY;
                        const newH = Math.max(150, Math.min(600, startH + delta));
                        setInventoryPanelHeight(newH);
                      };
                      const onUp = () => {
                        window.removeEventListener('mousemove', onMove);
                        window.removeEventListener('mouseup', onUp);
                      };
                      window.addEventListener('mousemove', onMove);
                      window.addEventListener('mouseup', onUp);
                    }}
                    style={{
                      height: '5px',
                      cursor: 'ns-resize',
                      background: 'transparent',
                      position: 'relative',
                      zIndex: 12,
                      flexShrink: 0
                    }}
                  >
                    <div style={{ position: 'absolute', left: '50%', top: '1px', transform: 'translateX(-50%)', width: '40px', height: '3px', borderRadius: '2px', background: '#555' }} />
                  </div>
                  <InventoryDataGrid
                    activeModelUrn={selectedProject?.id || 'global'}
                    dynamicFilterBuckets={dynamicFilterBuckets}
                    filterSelections={filterSelections}
                    hiddenModelUrns={hiddenModelUrns}
                    isolatedExtIds={isolatedExtIds}
                    onClose={() => setInventoryTabOpen(false)}
                  />
                </div>
              )}

            </div>

            {/* DEBUG: Log activeSheet render */}
            {/* {console.log('[App] Rendering. ActiveSheet:', activeSheet)} */}
            {activeSheet && (
              <div className={`split-doc active ${parallelMode ? 'parallel' : ''}`}>
                {/* 
                  Note: I moved the wrapper inside the condition so it unmounts completely when closed.
                  This ensures flexbox layout works correctly (3D viewer takes full height when this is gone).
               */}
                <>
                  {/* Header styled like Minimap: Dark Grey/Black */}
                  <div className="doc-header" style={{
                    backgroundColor: '#222',
                    color: '#fff',
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTopLeftRadius: parallelMode ? '0' : '8px',
                    borderTopRightRadius: parallelMode ? '0' : '8px',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {/* Icon/Title */}
                      <span style={{ fontSize: '1.2rem' }}>📄</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#888', textTransform: 'uppercase' }}>
                          {activeSheet.isPin ? 'MARCADOR' : 'PLANO 2D'}
                        </span>
                        <span className="doc-title" style={{ fontSize: '0.9rem', fontWeight: 500, maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={activeSheet.name}>
                          {openedDoc ? openedDoc.name : activeSheet.name}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {/* Parallel Toggle */}
                      <label className="parallel-toggle" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#ccc', background: 'rgba(255,255,255,0.1)', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', userSelect: 'none' }}>
                        <span>En Paralelo</span>
                        <input
                          className="tandem-checkbox"
                          type="checkbox"
                          checked={parallelMode}
                          onChange={(e) => setParallelMode(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                      </label>

                      {/* Back Button */}
                      {openedDoc && (
                        <button onClick={() => setOpenedDoc(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.1rem' }} title="Volver">⬅</button>
                      )}

                      {/* Close Button */}
                      <button onClick={() => { setActiveSheet(null); setOpenedDoc(null); }} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                    </div>

                  </div>

                  {/* Body */}
                  <div className="doc-content" style={{ flex: 1, overflow: 'hidden', background: '#fff', display: 'flex', flexDirection: 'column' }}>

                    {/* CASE A: VIWING A SPECIFIC DOCUMENT */}
                    {openedDoc ? (
                      <div style={{ flex: 1, background: '#e5e7eb', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', position: 'relative' }}>
                        {openedDoc.type === 'pdf' ? (
                          <PdfReader url={openedDoc.nodeId ? `${import.meta.env.VITE_BACKEND_URL}/api/docs/proxy?id=${openedDoc.nodeId}` : openedDoc.url} fileName={openedDoc.name || 'documento.pdf'} />
                        ) : openedDoc.type === 'image' ? (
                          <img src={openedDoc.url} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} alt="Doc" />
                        ) : (openedDoc.source === 'acc' || openedDoc.urn) ? (
                          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                            <SecondaryViewer urn={openedDoc.urn} />
                          </div>
                        ) : (
                          <div style={{ textAlign: 'center', padding: 20 }}>
                            <div style={{ fontSize: '3rem' }}>📄</div>
                            <p>Vista previa no disponible para {openedDoc.type}</p>
                            <a href={openedDoc.url} target="_blank" rel="noreferrer" style={{ color: 'var(--alephia-interactive-hover)' }}>Descargar Archivo</a>
                          </div>
                        )}
                      </div>
                    ) : activeSheet.isPin ? (
                      /* CASE B: DOCUMENT LIST (PIN) */
                      <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
                        <div style={{
                          border: '2px dashed #ccc',
                          borderRadius: '8px',
                          padding: '20px',
                          textAlign: 'center',
                          marginBottom: '20px',
                          cursor: 'pointer',
                          backgroundColor: '#f9fafb'
                        }}
                          onClick={() => {
                            const fName = prompt("Nombre del documento (Simulación):", "Plano Detalle Estructural.pdf");
                            if (fName) {
                              const newDoc = {
                                id: Date.now(),
                                name: fName,
                                type: fName.endsWith('.png') || fName.endsWith('.jpg') ? 'image' : 'pdf',
                                url: fName.endsWith('.png') ? 'https://via.placeholder.com/800x600.png?text=Plano+Imagen' : 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf'
                              };
                              const updatedPins = docPins.map(p => {
                                if (p.id === activeSheet.pinId) {
                                  return { ...p, docs: [...p.docs, newDoc] };
                                }
                                return p;
                              });
                              setDocPins(updatedPins);
                              setActiveSheet(prev => ({ ...prev, docs: [...prev.docs, newDoc] }));
                            }
                          }}
                        >
                          <span style={{ fontSize: '1.5rem', display: 'block' }}>☁️</span>
                          <span style={{ fontWeight: '600', color: '#4b5563' }}>Subir Nuevo Documento</span>
                          <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '5px 0 0' }}>Click para simular carga</p>
                        </div>

                        <h4 style={{ margin: '0 0 10px', color: '#333' }}>Archivos Adjuntos ({activeSheet.docs?.length || 0})</h4>

                        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                          {activeSheet.docs?.map(doc => (
                            <li key={doc.id}
                              onClick={() => setOpenedDoc(doc)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '12px', padding: '12px',
                                background: 'white', border: '1px solid #e5e7eb', borderRadius: '8px',
                                marginBottom: '8px', cursor: 'pointer', transition: 'box-shadow 0.2s'
                              }}
                              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)'}
                              onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
                            >
                              <div style={{ fontSize: '1.2rem' }}>{doc.type === 'pdf' ? '📕' : '🖼️'}</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '500', fontSize: '0.9rem', color: '#111' }}>{doc.name}</div>
                              </div>
                              <div style={{ color: 'var(--alephia-text-muted)', fontSize: '1.2rem' }}>›</div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      /* CASE C: REVIT SHEET INFO (Active 2D View) */
                      <SecondaryViewer
                        document={activeSheet.document}
                        node={activeSheet.node}
                      />
                    )}

                  </div>
                </>
              </div>
            )}

            {/* CASE D: PHOTO ALBUM SLIDER */}
            {trackingTab === 'fotos' && photoAlbumOpen && selectedAlbumPin && (
              <div className={`split-doc active dark-float ${panelDocked ? 'parallel' : ''}`} style={panelDocked ? { background: '#1a1b1e', borderLeft: '1px solid #444', zIndex: 10, position: 'relative', overflow: 'hidden' } : {}}>
                {/* Dock/Undock toggle */}
                {!panelDocked && (
                  <button className="dock-toggle-btn" onClick={() => setPanelDocked(true)} title="Acoplar panel">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="3" x2="12" y2="21" /></svg>
                  </button>
                )}
                <PhotoAlbumModal
                  isOpen={true}
                  variant="panel"
                  onClose={() => setPhotoAlbumOpen(false)}
                  pinId={selectedAlbumPin?.id}
                  title={selectedAlbumPin ? `Zona: ${selectedAlbumPin.val || selectedAlbumPin.id}` : 'Album de Fotos'}
                  photos={selectedAlbumPin?.photos || []}
                  onAddPhoto={handleAddPhotoToPin}
                  onDelete={(id) => handleTrackingPinDelete('fotos', id)}
                  onDeletePhoto={handleDeletePhotoFromPin}
                  onUpdatePhoto={handleUpdatePhotoInPin}
                  onRename={(id, newTitle, extras) => handleTrackingPinUpdate('fotos', id, { val: newTitle, ...extras })}
                  modelUrn={selectedProject?.id || 'global'}
                  targetPath={selectedAlbumPin?.targetPath}
                  projectPrefix={selectedProject?.name ? `proyectos/${selectedProject.name.replace(/ /g, '_')}` : 'proyectos'}
                />
              </div>
            )}

            {/* CASE E: PROGRESS DETAIL PANEL */}
            {trackingTab === 'avance' && progressPanelOpen && selectedProgressPin && (
              <div className={`split-doc active dark-float ${panelDocked ? 'parallel' : ''}`} style={panelDocked ? { background: '#1a1b1e', borderLeft: '1px solid #444', zIndex: 10 } : {}}>
                <ProgressDetailPanel
                  isOpen={true}
                  onClose={() => setProgressPanelOpen(false)}
                  pin={selectedProgressPin}
                  elementProps={null}
                  onDelete={(id) => handleTrackingPinDelete('avance', id)}
                  isDocked={panelDocked}
                  onToggleDock={() => setPanelDocked(prev => !prev)}
                  onUpdatePin={(id, updates) => handleTrackingPinUpdate('avance', id, updates)}
                  availablePartidas={availablePartidas}
                />
              </div>
            )}

            {/* CASE F: DOC PIN PANEL */}
            {(trackingTab === 'docs' || trackingTab === 'restricciones' || trackingTab === 'rfis') && docPinPanelOpen && selectedDocPin && (
              <div className={`split-doc active dark-float ${panelDocked ? 'parallel' : ''}`} style={panelDocked ? { background: '#1a1b1e', borderLeft: '1px solid #444', zIndex: 10 } : {}}>
                {!panelDocked && (
                  <button className="dock-toggle-btn" onClick={() => setPanelDocked(true)} title="Acoplar panel">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="12" y1="3" x2="12" y2="21" /></svg>
                  </button>
                )}
                <DocPinPanel
                  isOpen={true}
                  variant="panel"
                  onClose={() => setDocPinPanelOpen(false)}
                  pin={selectedDocPin}
                  onDelete={(id) => handleTrackingPinDelete(trackingTab, id)}
                  onAttachDoc={(id, doc, isUp) => handleAttachDocToPin(id, doc, isUp, trackingTab)}
                  onAttachBatchDocs={(id, docs) => handleAttachBatchDocsToPin(id, docs, trackingTab)}
                  onRemoveDoc={(id, docId) => handleRemoveDocFromPin(id, docId, trackingTab)}
                  onRename={(id, newTitle) => handleTrackingPinUpdate(trackingTab, id, { val: newTitle })}
                  projectPrefix={selectedProject?.baseName ? `proyectos/${selectedProject.baseName.replace(/ /g, '_')}/` : 'proyectos/'}
                  /* El ALCANCE con el que se guarda lo llega decidido del servidor
                     (`scope_escritura`). Antes se fabricaba aqui a partir del nombre
                     visible de la obra: renombrarla movia el alcance de todo lo que se
                     escribiera despues, y dos entidades con una obra del mismo nombre
                     producian el mismo identificador. `projectPrefix` de arriba SI
                     sigue derivandose del nombre, y debe: es la ruta de CARPETAS que
                     se navega, no la obra a la que pertenece el dato. */
                  modelUrn={selectedProject?.scope_escritura || selectedProject?.id || 'global'}
                />
              </div>
            )}
          </div>
        </div>

        <ImportModelModal
          open={importModalOpen}
          onClose={() => {
            setImportModalOpen(false);
            // CRÍTICO: desarmar el modo Relink al cerrar sin elegir. Si quedaba
            // armado, el SIGUIENTE "Importar" reemplazaba un modelo en silencio
            // (handleLinkDocs ve relinkTargetModel y hace relink, no add).
            setRelinkTargetModel(null);
          }}
          onLinkDocs={handleLinkDocs}
          onUploadLocal={handleLocalUpload}
          onExtractCivilData={handleExtractCivilData}
          selectedProject={selectedProject}
          relinkTarget={relinkTargetModel}
        />

        {/* Views Popover */}
        {
          activePanel === 'views' && panelVisible && (
            <ViewsPanel
              views={savedViews}
              onSaveView={handleSaveView}
              onDeleteView={handleDeleteView}
              onLoadView={handleLoadView}
              onClose={() => setPanelVisible(false)}
            />
          )
        }

        <AddDocumentModal
          open={documentsModalOpen}
          onClose={() => setDocumentsModalOpen(false)}
          targetSpriteId={activeSpriteId}
          selectedProject={selectedProject}
          onConfirm={(items) => {
            addDocuments(items);
            setDocumentsModalOpen(false);
          }}
        />


        <FilterConfiguratorModal
          open={filterConfiguratorOpen}
          availableProperties={availableProperties}
          selectedProperties={filterProperties}
          onClose={() => setFilterConfiguratorOpen(false)}
          onUpdate={(newProps) => {
            // Mock update logic or implement real prop reordering if needed
            // For now we just close or update state if we implement reorder
            setFilterProperties(newProps);
            setFilterConfiguratorOpen(false);
          }}
        />

        {/* AR — uno solo: ARCore en el APK, simulador en el navegador */}
        {nativeArActive && (
          <NativeARView onExit={() => setNativeArActive(false)} />
        )}

        {/* Botón AR: vive como chip en la barra inferior (rightSlot de ViewerLabelsBar) */}

        {/* GESTOR DOCUMENTAL GCS */}
        <DocumentManager
          isOpen={showDocManager}
          onClose={() => setShowDocManager(false)}
        />


      </div >
    </div >
  );
}

export default App;
