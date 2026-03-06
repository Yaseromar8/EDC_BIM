import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import './App.css';
import TopBar from './components/TopBar';
import ViewsPanel from './components/ViewsPanel';
import SourceFilesPanel from './components/SourceFilesPanel';
import NativeFileTree from './components/NativeFileTree';
import Viewer from './components/Viewer';
import SecondaryViewer from './components/SecondaryViewer';
import ImportModelModal from './components/ImportModelModal';
import DocumentPanel from './components/DocumentPanel';
import AddDocumentModal from './components/AddDocumentModal';
import MobileFloatingToolbar from './components/MobileFloatingToolbar';
import LandingPage from './components/LandingPage'; // Import Landing Page
import LoginScreen from './components/LoginScreen';
import FilterConfiguratorModal from './components/FilterConfiguratorModal';
import ARView from './components/ARView';
import PhotoAlbumModal from './components/PhotoAlbumModal';
import ProgressDetailPanel from './components/ProgressDetailPanel';
import DocumentManager from './components/DocumentManager';
import DocPinPanel from './components/DocPinPanel';
import TandemSidebar from './components/TandemSidebar';
import TandemFilterPanel from './components/TandemFilterPanel';
import PdfViewer from './components/PdfViewer';



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
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93l-2.4-2.8A2 2 0 0 0 8.27 2H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z" />
    <path d="M9 20v-7h6v7" />
    <path d="M12 13v-3" />
    <path d="M12 20v-7" />
    <rect x="10" y="15" width="4" height="2" />
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

const buildFilterBuckets = (modelProperties, selectedMetas) => {
  if (!modelProperties.length || !selectedMetas.length) return {};
  const metaMap = new Map(selectedMetas.map(meta => [meta.id, meta]));
  const bucketMaps = new Map();
  selectedMetas.forEach(meta => bucketMaps.set(meta.id, new Map()));

  modelProperties.forEach(row => {
    const props = row.properties || [];
    props.forEach(prop => {
      const key = getPropertyKeyFromRaw(prop);
      if (!metaMap.has(key)) return;
      const valueLabel = formatPropertyValue(prop.displayValue);
      if (!valueLabel || !valueLabel.trim()) return;
      const numLabel = valueLabel.trim();
      const store = bucketMaps.get(key);
      if (!store.has(numLabel)) {
        store.set(numLabel, { value: numLabel, count: 0, dbIds: [] });
      }
      const entry = store.get(numLabel);
      entry.count += 1;
      // Store object { id, modelUrn } instead of just integer
      entry.dbIds.push({ id: row.dbId, modelUrn: row.modelUrn });
    });
  });

  const result = {};
  bucketMaps.forEach((map, propId) => {
    const values = Array.from(map.values()).sort((a, b) => {
      if (b.count === a.count) return a.value.localeCompare(b.value);
      return b.count - a.count;
    });
    const total = values.reduce((sum, item) => sum + item.count, 0);
    const valueIndex = new Map(values.map(entry => [entry.value, entry]));
    result[propId] = {
      meta: metaMap.get(propId),
      total,
      values,
      valueIndex
    };
  });
  return result;
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
            <button className="primary-btn" onClick={handleSave} style={{ background: '#3b82f6', border: 'none', color: 'white', padding: '8px 24px', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}>
              Update
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}








const BACKEND_URL = Capacitor.isNativePlatform()
  ? 'https://visor-ecd-backend.onrender.com'
  : (import.meta.env.VITE_BACKEND_URL || (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://visor-ecd-backend.onrender.com'));

console.log('[App] Initializing. Platform:', Capacitor.getPlatform(), 'Backend:', BACKEND_URL);
console.log('[App] Version: 1.0.3 - Mobile Connection & UI Cleanup applied.');

const ACC_PROJECT_ID = 'b.a7ce4d60-79f3-4dbf-b059-fefaf14f7b1d';

function App() {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('visor_user');
    return saved ? JSON.parse(saved) : null;
  });

  const handleLoginSuccess = (userData) => {
    localStorage.setItem('visor_user', JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('visor_user');
    setUser(null);
    setSelectedProject(null);
  };

  const [models, setModels] = useState([]);
  const [relinkTargetModel, setRelinkTargetModel] = useState(null); // Relink State
  const [hiddenModelUrns, setHiddenModelUrns] = useState([]);
  const [savedViews, setSavedViews] = useState([]); // New State
  const [documents, setDocuments] = useState([]);
  const [sprites, setSprites] = useState([]);
  const [activeSpriteId, setActiveSpriteId] = useState(null);
  const [showSprites, setShowSprites] = useState(false);
  const [spritePlacementActive, setSpritePlacementActive] = useState(false);
  const [activePanel, setActivePanel] = useState(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const [filterConfiguratorOpen, setFilterConfiguratorOpen] = useState(false);
  const [availableProperties, setAvailableProperties] = useState([]);
  const [filterProperties, setFilterProperties] = useState(['Standard::Sources', 'Tandem Category']);
  const [modelProperties, setModelProperties] = useState({}); // Changed to object {urn: props[]}
  const [filterSelections, setFilterSelections] = useState({});
  const [expandedFilters, setExpandedFilters] = useState({});
  const [facetSearch, setFacetSearch] = useState({}); // { [facetId]: { open: bool, query: string } }

  const [filterColors, setFilterColors] = useState({});

  // Seguimiento / Tracking State
  const [trackingTab, setTrackingTab] = useState(null); // 'avance' | 'fotos' | 'docs' | null
  const [trackingPlacementMode, setTrackingPlacementMode] = useState(false);
  // Placeholder Mock Data (Should match Viewer internal logic or pass down)
  const [trackingData, setTrackingData] = useState({
    avance: [],
    fotos: [],
    docs: [],
    restricciones: []
  });
  const [selectedProject, setSelectedProject] = useState(null);

  const [showSplash, setShowSplash] = useState(false);
  const [selectedPinId, setSelectedPinId] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [minimapActive, setMinimapActive] = useState(false);
  const [vrActive, setVrActive] = useState(false);
  const [arModeActive, setArModeActive] = useState(false);
  const [arInitialCamera, setArInitialCamera] = useState(null);

  // Album Modal State
  const [photoAlbumOpen, setPhotoAlbumOpen] = useState(false);
  const [selectedAlbumPin, setSelectedAlbumPin] = useState(null);

  // Progress Panel State

  const [progressPanelOpen, setProgressPanelOpen] = useState(false);
  const [selectedProgressPin, setSelectedProgressPin] = useState(null);
  const [panelDocked, setPanelDocked] = useState(false); // PiP (false) vs Docked (true)
  const [selectedElement, setSelectedElement] = useState(null); // New: Store { dbId, modelUrn } for detailed tracking

  // Doc Pin Panel State
  const [docPinPanelOpen, setDocPinPanelOpen] = useState(false);
  const [selectedDocPin, setSelectedDocPin] = useState(null);



  const [sheets, setSheets] = useState([]); // To store 2D sheets
  const [activeSheet, setActiveSheet] = useState(null);
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

      const resp = await fetch(`${BACKEND_URL}/api/ai/universal-search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          const assistantMsg = { role: 'assistant', content: data.answer, results: data.results };
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
      const resp = await fetch(`${BACKEND_URL}/api/documents/${result.nodeId}`);
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
      setPanelVisible(!panelVisible);
    } else {
      setActivePanel(panelName);
      // Ocultar el panel lateral automáticamente si es Seguimiento (Progreso)
      // para que solo aparezcan los botones superiores
      if (panelName === 'progress') {
        setPanelVisible(false);
      } else {
        setPanelVisible(true);
      }

      if (window.innerWidth < 1024) {
        setIsRailExpanded(false);
      }
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



  // 1. Fetch token on mount
  const [accessToken, setAccessToken] = useState('');

  useEffect(() => {
    const getToken = async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/token`);
        const data = await res.json();
        setAccessToken(data.access_token);
      } catch (err) {
        console.error('Failed to get token', err);
      }
    };
    getToken();
  }, []);

  const handleDocPinComplete = (position) => {
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

  const handleModelProperties = useCallback(({ urn, props }) => {
    if (!urn) {
      // Legacy fallback
      if (Array.isArray(props)) setModelProperties(prev => ({ ...prev, 'unknown': props }));
      return;
    }
    setModelProperties(prev => ({
      ...prev,
      [urn]: props
    }));
  }, []);

  // Flatten all loaded properties for metadata extraction (stable list)
  const allLoadedProperties = useMemo(() => {
    return Object.values(modelProperties).flat();
  }, [modelProperties]);

  // Extract unique CodigoDePartida values for the dropdown selector
  const availablePartidas = useMemo(() => {
    const partidaMap = new Map(); // code -> { code, name, count }
    for (const element of allLoadedProperties) {
      if (!element.properties) continue;
      const codigoProp = element.properties.find(p => p.displayName === '03_05_DSI_CodigoDePartida');
      if (!codigoProp || !codigoProp.displayValue) continue;
      const code = String(codigoProp.displayValue).trim();
      if (!code) continue;
      if (partidaMap.has(code)) {
        partidaMap.get(code).count++;
      } else {
        // Try to find element name using the specific property
        const nameProp = element.properties.find(p => p.displayName === '03_04_DSI_NombreDePartida') ||
          element.properties.find(p => p.displayName === 'Name' || p.displayName === 'name');
        partidaMap.set(code, {
          code,
          name: nameProp?.displayValue || '',
          count: 1
        });
      }
    }
    // Sort by code
    return Array.from(partidaMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [allLoadedProperties]);

  const activeProperties = useMemo(() => {
    let all = [];
    // Create a Set of currently loaded URNs for fast lookup
    const activeUrns = new Set(models.map(m => m.urn));
    const urnNames = new Map(models.map(m => [m.urn, m.name]));

    Object.entries(modelProperties).forEach(([urn, props]) => {
      // Only include properties from models that are currently in the list AND not hidden
      if (activeUrns.has(urn) && !hiddenModelUrns.includes(urn)) {
        const modelName = urnNames.get(urn) || 'Model';
        // Tag each row with its model URN so we can distinguish DbIds from different models
        const tagged = props.map(p => ({
          ...p,
          modelUrn: urn,
          properties: [
            ...(p.properties || []),
            // Inject Synthetic "Sources" property for filtering by Model
            { displayName: 'Sources', displayValue: modelName, category: 'Standard', type: 'String' }
          ]
        }));
        all = all.concat(tagged);
      }
    });
    return all;
  }, [modelProperties, hiddenModelUrns, models]);

  // Load views on mount
  // Load views on mount
  useEffect(() => {
    if (!selectedProject) return;

    fetch(`${BACKEND_URL}/api/views`)
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
        filterProperties
      };

      fetch(`${BACKEND_URL}/api/views`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          viewerState,
          filterState
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
  }, [filterSelections, filterColors, filterProperties]);

  const handleDeleteView = useCallback((viewId) => {
    if (!window.confirm("Delete this view?")) return;
    fetch(`${BACKEND_URL}/api/views/${viewId}`, { method: 'DELETE' })
      .then(res => res.ok ? setSavedViews(prev => prev.filter(v => v.id !== viewId)) : null)
      .catch(err => console.error("Error deleting view:", err));
  }, []);

  const handleLoadView = useCallback((view) => {
    if (view.filterState) {
      if (view.filterState.filterSelections) setFilterSelections(view.filterState.filterSelections);
      if (view.filterState.filterColors) setFilterColors(view.filterState.filterColors);
      if (view.filterState.filterProperties) setFilterProperties(view.filterState.filterProperties);
    }
    window.dispatchEvent(new CustomEvent('viewer-restore-state', { detail: view.viewerState }));
  }, []);

  const handleToggleModelVisibility = useCallback((urn) => {
    console.log('[App] Toggling visibility for:', urn);
    setHiddenModelUrns(prev => {
      const next = prev.includes(urn) ? prev.filter(u => u !== urn) : [...prev, urn];
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
      // Whitelist 'Standard::Sources' and 'Tandem Category' so they are not stripped
      const sanitized = prev.filter(id => availableIds.has(id) || id === 'Standard::Sources' || id === 'Tandem Category');

      if (sanitized.length) return sanitized;
      // Default fallback
      return ['Standard::Sources', 'Tandem Category'];
    });
  }, [availableProperties]);

  const resetFiltersToDefault = useCallback(() => {
    // Reset to hardcoded defaults
    setFilterProperties(['Standard::Sources', 'Tandem Category']);
  }, []);

  useEffect(() => {
    // Initialize filterSelections with ALL values when filter properties change
    // This implements the "All Selected by Default" behavior similar to Tandem
    if (filterProperties.length === 0 || !modelProperties) return;

    setFilterSelections(prev => {
      const next = { ...prev };

      filterProperties.forEach(propId => {
        // Only initialize if not already set (preserve user selection if they switch panels)
        // Or if we want to ensure new properties start selected
        if (!next[propId]) {
          // We need to look up values from 'filterBuckets' or re-calculate them
          // Since 'filterBuckets' might depend on 'filterSelections', we can't fully rely on it here
          // However, 'buildFilterBuckets' only needs modelProperties.
          // Let's optimize: We can just use modelProperties again or just wait for user interaction to populate?
          // User wants "Todo marcado por defecto".

          // We can use a simpler approach: calculate values just for this property
          const propValues = new Set();
          Object.values(modelProperties).forEach(propsObj => {
            if (propsObj[propId]) propValues.add(propsObj[propId]);
          });
          next[propId] = Array.from(propValues);
        }
      });
      return next;
    });

    setExpandedFilters(prev => {
      const next = {};
      filterProperties.forEach(id => {
        next[id] = prev[id] || false;
      });
      return next;
    });
  }, [filterProperties, modelProperties]);



  // Twin Config: Load models from backend on mount (and when project changes)
  useEffect(() => {
    if (!selectedProject) return; // Don't fetch if no project selected

    // CRITICAL: Clear models immediately before fetching to prevent old project's
    // models from briefly rendering in the new project viewer
    setModels([]);
    setModelProperties({});
    setAvailableProperties([]);
    setHiddenModelUrns([]);

    fetch(`${BACKEND_URL}/api/config/project?project=${selectedProject.id}`)
      .then(res => res.json())
      .then(data => {
        if (data.models && Array.isArray(data.models)) {
          // Map backend format to viewer format
          const mapped = data.models.map(m => ({
            ...m,
            label: m.name
          }));
          setModels(mapped);
        }
      })
      .catch(err => console.error("Error loading project config:", err));
  }, [selectedProject]);

  const handleLinkDocs = useCallback(async (modelsInput, isGemelo = false) => {
    // Determine if input is array
    const models = Array.isArray(modelsInput) ? modelsInput : [modelsInput];

    try {
      if (!selectedProject) return alert("No project selected");

      // Handle Relink Mode
      if (relinkTargetModel) {
        if (models.length === 0) return;
        const newModelData = models[0]; // Relink strictly one model

        const res = await fetch(`${BACKEND_URL}/api/config/project/relink`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            targetId: relinkTargetModel.id,
            oldUrn: relinkTargetModel.urn,
            project: selectedProject,
            newModel: {
              urn: newModelData.urn,
              name: newModelData.name || newModelData.label,
              versionId: newModelData.versionId,
              versionNumber: newModelData.versionNumber,
              lastModifiedTime: newModelData.lastModifiedTime,
              projectId: newModelData.projectId, // ACC Project
              itemId: newModelData.itemId
            }
          })
        });

        if (res.ok) {
          const config = await res.json();
          if (config.models) {
            setModels(config.models.map(m => ({ ...m, label: m.name })));
            alert("Model relinked successfully.");
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
          project: selectedProject.id
        };

        const res = await fetch(`${BACKEND_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const config = await res.json();
          if (config.models) {
            setModels(config.models.map(m => ({ ...m, label: m.name })));
          }
        } else {
          const err = await res.json();
          alert(`Error: ${err.error || 'Failed to link model'}`);
        }
      }

    } catch (e) {
      console.error("Error linking model:", e);
      alert("Error procesando los modelos.");
    }
  }, [selectedProject, relinkTargetModel]);

  const handleModelUpdate = useCallback(async (urn) => {
    if (!selectedProject) return alert("Error: No project context.");
    try {
      const res = await fetch(`${BACKEND_URL}/api/config/project/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urn, project: selectedProject.id })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.updated && data.config?.models) {
          alert(`Model updated to latest version!`);
          setModels(data.config.models.map(m => ({ ...m, label: m.name })));
        } else if (data.message) {
          alert(data.message);
        }
      } else {
        const err = await res.json();
        alert(`Update failed: ${err.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error("Error updating model:", e);
      alert("Error updating model. See console.");
    }
  }, [selectedProject]);

  const handleLocalUpload = useCallback(async (file, label) => {
    if (!selectedProject) return alert("Error: No project context.");

    const formData = new FormData();
    formData.append('file', file);
    formData.append('label', label);
    formData.append('project', selectedProject.id); // Add project context

    try {
      // Show loading indicator?
      const res = await fetch(`${BACKEND_URL}/api/config/project/upload`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        // data.config, data.model
        if (data.config && data.config.models) {
          setModels(data.config.models.map(m => ({ ...m, label: m.name })));
        }
      } else {
        alert("Upload failed. See console.");
      }
    } catch (e) {
      console.error("Upload error:", e);
      alert("Error uploading file.");
    }
  }, [selectedProject]);

  const removeModel = useCallback(async (urn) => {
    // 1. Optimistic local removal — avoids cross-project contamination from backend response
    setModels(prev => prev.filter(m => m.urn !== urn));
    setModelProperties(prev => {
      const next = { ...prev };
      delete next[urn];
      return next;
    });
    setHiddenModelUrns(prev => prev.filter(u => u !== urn));

    try {
      await fetch(`${BACKEND_URL}/api/config/project/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urn, project: selectedProject.id })
      });
      // Don't use the response to update state — local optimistic update already handled it
    } catch (e) {
      console.error("Error removing model:", e);
      // On error, reload from server to restore correct state
      fetch(`${BACKEND_URL}/api/config/project?project=${selectedProject}`)
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
    const resp = await fetch(`${BACKEND_URL}/api/build/signed-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
    const fetchTracking = async () => {
      try {
        const urn = selectedProject?.id || 'global';
        console.log(`[App] Fetching tracking data for urn: ${urn}`);
        const res = await fetch(`${BACKEND_URL}/api/tracking?model_urn=${urn}&t=${Date.now()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (res.ok) {
          const data = await res.json();
          console.log(`[App] Received tracking data:`, data);
          setTrackingData({
            avance: data.avance || [],
            fotos: data.fotos || [],
            docs: data.docs || []
          });
        } else {
          console.error(`[App] Failed to fetch tracking data. Status: ${res.status}`);
        }
      } catch (e) {
        console.error("Failed to load tracking data", e);
      }
    };
    fetchTracking();
  }, [selectedProject]);

  // Save Tracking Data Helper
  const saveTrackingData = async (newData) => {
    try {
      const urn = selectedProject?.id || 'global';
      await fetch(`${BACKEND_URL}/api/tracking?model_urn=${urn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newData)
      });
    } catch (e) {
      console.error("Failed to save tracking data", e);
    }
  };

  const handleTrackingPinCreate = (newPin) => {
    if (!trackingTab) return; // Guard clause

    let pinsToAdd = [newPin];

    if (trackingTab === 'avance') {
      // Show detected partida in the prompt if available
      const partidaInfo = newPin.codigoPartida ? ` (Partida: ${newPin.codigoPartida})` : '';
      const val = prompt(`Ingrese el porcentaje de avance${partidaInfo} (ej: 50%):`, "0%");
      if (val === null) return; // Cancelled
      pinsToAdd = [{ ...newPin, val, color: '#fbbf24' }];
    } else if (trackingTab === 'docs') {
      pinsToAdd = [{ ...newPin, docs: [], color: '#8b5cf6' }]; // Purple or specific color for docs
    } else if (trackingTab === 'restricciones') {
      const val = prompt("Descripción breve de la restricción / alerta:", "Pendiente");
      if (val === null) return;
      pinsToAdd = [{ ...newPin, val, docs: [], color: '#f59e0b', type: 'restriction' }];
    }

    setTrackingData(prev => {
      const currentList = prev[trackingTab] || [];
      const updated = {
        ...prev,
        [trackingTab]: [...currentList, ...pinsToAdd]
      };
      saveTrackingData(updated); // Sync to backend
      return updated;
    });
  };

  const handleTrackingPinDelete = async (type, id) => {
    // Optimistic Update
    setTrackingData(prev => {
      const currentList = prev[type] || [];
      const updatedList = currentList.filter(p => p.id !== id);
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
    } else if (type === 'docs' || type === 'restricciones') {
      setDocPinPanelOpen(false);
      setSelectedDocPin(null);
    }
  };

  // Update a specific tracking pin (e.g., change codigoPartida, val/name, etc.)
  const handleTrackingPinUpdate = (type, pinId, updates) => {
    setTrackingData(prev => {
      // Ensure we are operating on the correct category (avance/docs/fotos/restricciones)
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

  const handleTrackingPinClick = useCallback((pin) => {
    console.log('[App] Pin Clicked:', pin);
    if (trackingTab === 'fotos') {
      setSelectedAlbumPin(pin);
      setPhotoAlbumOpen(true);
      setPanelDocked(false); // Start floating (PiP)
    } else if (trackingTab === 'avance') {
      setSelectedProgressPin(pin);
      setProgressPanelOpen(true);
      setPanelDocked(false); // Start floating (PiP)
    } else if (trackingTab === 'docs' || trackingTab === 'restricciones') {
      setSelectedDocPin(pin);
      setDocPinPanelOpen(true);
      setPanelDocked(false);
    }
  }, [trackingTab]);

  const handleTrackingPlacementToggle = (type) => {
    const tabMap = {
      'data': 'avance',
      'avance': 'avance',
      'docs': 'docs',
      'restriction': 'restricciones'
    };
    const targetTab = tabMap[type] || 'avance';

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

  const handleAddPhotoToPin = (newPhoto) => {
    if (!selectedAlbumPin) return;

    // Update Local State
    setTrackingData(prev => {
      const updatedFotos = prev.fotos.map(pin => {
        if (pin.id === selectedAlbumPin.id) {
          return { ...pin, photos: [...(pin.photos || []), newPhoto] };
        }
        return pin;
      });
      const newState = { ...prev, fotos: updatedFotos };

      // Sync to Backend (Full generic update or specific endpoint)
      // We can use the specific endpoint for better granularity if we want
      // But full save is easier for now given the structure
      saveTrackingData(newState);

      return newState;
    });
    // Update Selected Pin State
    setSelectedAlbumPin(prev => ({ ...prev, photos: [...(prev.photos || []), newPhoto] }));
  };

  // Attach multiple docs to a pin in one go
  const handleAttachBatchDocsToPin = (pinId, newDocs) => {
    setTrackingData(prev => {
      const updatedDocs = (prev.docs || []).map(pin => {
        if (pin.id === pinId) {
          return { ...pin, docs: [...(pin.docs || []), ...newDocs] };
        }
        return pin;
      });
      const newState = { ...prev, docs: updatedDocs };
      saveTrackingData(newState);
      return newState;
    });

    setSelectedDocPin(prev => {
      if (!prev || prev.id !== pinId) return prev;
      return { ...prev, docs: [...(prev.docs || []), ...newDocs] };
    });
  };

  // Attach a doc (PDF) to a doc pin
  const handleAttachDocToPin = (pinId, doc, isUpdate = false) => {
    setTrackingData(prev => {
      const updatedDocs = (prev.docs || []).map(pin => {
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
      const newState = { ...prev, docs: updatedDocs };
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
  const handleRemoveDocFromPin = (pinId, docId) => {
    setTrackingData(prev => {
      const updatedDocs = (prev.docs || []).map(pin => {
        if (pin.id === pinId) {
          return { ...pin, docs: (pin.docs || []).filter(d => d.id !== docId) };
        }
        return pin;
      });
      const newState = { ...prev, docs: updatedDocs };
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

  const filterBuckets = useMemo(
    () => buildFilterBuckets(activeProperties, selectedPropertyObjects),
    [activeProperties, selectedPropertyObjects]
  );

  // Calculate dynamic counts (Faceted Search)
  const dynamicFilterBuckets = useMemo(() => {
    // 1. Pre-calculate the set of DbIds for each property's current selection
    const propSelections = new Map();
    Object.entries(filterSelections).forEach(([propId, values]) => {
      if (!values || !values.length) return;
      const bucket = filterBuckets[propId];
      if (!bucket) return;
      const unionIds = new Set();
      values.forEach(val => {
        const entry = bucket.valueIndex?.get(val);
        if (entry) entry.dbIds.forEach(id => unionIds.add(id));
      });
      propSelections.set(propId, unionIds);
    });

    // 2. For each property, calculate the intersection of ALL OTHER properties
    const result = {};
    filterProperties.forEach(targetPropId => {
      // Find intersection of all OTHER selections
      let validIds = null;
      propSelections.forEach((ids, propId) => {
        if (propId === targetPropId) return; // Skip self
        if (validIds === null) {
          validIds = new Set(ids);
        } else {
          validIds = new Set([...validIds].filter(x => ids.has(x)));
        }
      });

      // If validIds is null, it means no other filters are active -> All IDs are valid
      // If validIds is empty set, it means intersection is empty -> No IDs are valid

      const originalBucket = filterBuckets[targetPropId];
      if (!originalBucket) return;

      // Clone values with updated counts
      const newValues = originalBucket.values.map(valEntry => {
        let count = 0;
        if (validIds === null) {
          count = valEntry.count; // No other filters, keep original count
        } else {
          // Count how many of this value's DbIds are in validIds
          count = valEntry.dbIds.filter(id => validIds.has(id)).length;
        }
        return { ...valEntry, count };
      });

      // Sort again if needed, or keep original order
      // newValues.sort((a, b) => b.count - a.count); 

      result[targetPropId] = {
        ...originalBucket,
        values: newValues,
        total: newValues.reduce((sum, v) => sum + v.count, 0)
      };
    });

    return result;
  }, [filterBuckets, filterSelections, filterProperties]);

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
    '#3AA0FF', '#F97316', '#10B981', '#F43F5E', '#A855F7', '#0EA5E9', '#EAB308',
    '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6', '#84CC16', '#F59E0B'
  ];

  // ... existing code ...

  const activeFilterDetail = useMemo(() => {
    const activeProps = Object.entries(filterSelections).filter(([_, values]) => values && values.length > 0);

    if (activeProps.length === 0) {
      return { groups: [], dbIds: [], nonMatchingDbIds: [], isFiltering: false };
    }

    // 1. Calculate matching DbIds (Intersection of Unions)
    // We use a Set of strings "urn#dbId" to perform set operations
    let intersectionKeys = null;
    const keyMap = new Map(); // "urn#dbId" -> { id, modelUrn }

    activeProps.forEach(([propId, values]) => {
      const bucket = filterBuckets[propId];
      if (!bucket) return;

      const propKeys = new Set();
      values.forEach(value => {
        const entry = bucket.valueIndex?.get(value);
        if (entry) {
          entry.dbIds.forEach(item => {
            if (!hiddenModelUrns.includes(item.modelUrn)) {
              const key = `${item.modelUrn}#${item.id}`;
              propKeys.add(key);
              if (!keyMap.has(key)) keyMap.set(key, item);
            }
          });
        }
      });

      if (intersectionKeys === null) {
        intersectionKeys = propKeys;
      } else {
        intersectionKeys = new Set([...intersectionKeys].filter(k => propKeys.has(k)));
      }
    });

    const finalKeys = intersectionKeys ? Array.from(intersectionKeys) : [];
    const finalKeySet = new Set(finalKeys);

    // transform back to objects
    const finalDbIds = finalKeys.map(k => keyMap.get(k));

    // Calculate non-matching IDs for ghosting
    // We need all known IDs from the buckets
    const allKnownKeys = new Set();
    Object.values(filterBuckets).forEach(bucket => {
      bucket.values.forEach(v => v.dbIds.forEach(item => {
        if (!hiddenModelUrns.includes(item.modelUrn)) {
          const key = `${item.modelUrn}#${item.id}`;
          allKnownKeys.add(key);
          if (!keyMap.has(key)) keyMap.set(key, item);
        }
      }));
    });

    const nonMatchingKeys = Array.from(allKnownKeys).filter(k => !finalKeySet.has(k));
    const nonMatchingDbIds = nonMatchingKeys.map(k => keyMap.get(k));

    // 2. Prepare Groups for Coloring
    const groups = [];

    activeProps.forEach(([propId, values]) => {
      const bucket = filterBuckets[propId];
      if (!bucket) return;

      const isColoringEnabled = filterColors[propId];

      if (isColoringEnabled) {
        values.forEach((value, valIndex) => {
          const entry = bucket.valueIndex?.get(value);
          if (!entry) return;

          // Filter items to only those in the final intersection
          const validItems = entry.dbIds.filter(item => finalKeySet.has(`${item.modelUrn}#${item.id}`));

          if (validItems.length > 0) {
            const originalIndex = bucket.values.findIndex(v => v.value === value);
            const color = PALETTE[originalIndex % PALETTE.length];

            groups.push({
              propId,
              value,
              name: `${bucket.meta?.name}: ${value}`,
              dbIds: validItems, // This is now array of {id, modelUrn}
              color: color
            });
          }
        });
      }
    });

    return {
      groups,
      dbIds: finalDbIds,
      nonMatchingDbIds,
      isFiltering: activeProps.length > 0
    };
  }, [filterSelections, filterBuckets, filterColors, hiddenModelUrns]);

  // ... existing code ...

  const toggleColor = (propId) => {
    setFilterColors(prev => ({
      ...prev,
      [propId]: !prev[propId]
    }));
  };

  // ... inside render loop ...


  useEffect(() => {
    window.dispatchEvent(new CustomEvent('filters-apply', { detail: activeFilterDetail }));
  }, [activeFilterDetail]);

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

    // CRITICAL FIX: Reset properties to prevent stale state on project switch
    setAvailableProperties([]);
    setModelProperties({});
    setFilterSelections({});
    // setFilterBuckets({}); // filterBuckets is computed via useMemo, no setter.
  }, []);



  const toggleExpandBlock = useCallback((propId) => {
    setExpandedFilters(prev => ({ ...prev, [propId]: !prev[propId] }));
  }, []);


  // Calculate available properties dynamically from ALL LOADED properties (stable list for configuration)
  useEffect(() => {
    const uniqueProps = new Map();
    allLoadedProperties.forEach(row => {
      (row.properties || []).forEach(p => {
        const key = getPropertyKeyFromRaw(p);
        if (!uniqueProps.has(key)) {
          uniqueProps.set(key, {
            id: key,
            name: p.displayName || p.name || 'Unnamed',
            category: p.displayCategory || p.category || 'General',
            path: p.path
          });
        }
      });
    });
    setAvailableProperties(Array.from(uniqueProps.values()));
  }, [allLoadedProperties]);



  // --- RENDER: LOGIN -> LANDING -> APP ---
  if (!user) {
    return <LoginScreen onLogin={handleLoginSuccess} />;
  }

  if (!selectedProject) {
    return <LandingPage onSelectProject={setSelectedProject} />;
  }

  // Multi-tenant key: project.id is the unique scope for all data (like ACC project URN)
  const activeModelUrn = (selectedProject?.id) || 'global';

  return (
    <div className={`app-layout ${activeSheet ? 'doc-open' : ''}`} style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <TopBar
        user={user}
        onLogout={handleLogout}
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
      <div className="app-container" style={{ flex: 1, position: 'relative' }}>

        {/* Photo Album Modal Removed - Now Inserted in Split View below */}

        {showSplash && (
          <div className="splash-screen" style={{ backgroundImage: `url('/FONDO_PAGINA.jpg')` }}>
            <img src="/POWER_CHINA.webp" alt="Company logo" />
          </div>
        )}
        {/* Expand Rail Button (Only visible when rail is hidden) */}
        {!isRailExpanded && (
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
        {isRailExpanded && (
          <nav className="app-left-rail" aria-label="Primary tools">
            {/* Close Rail Button (Mobile Only) */}
            <button
              className="rail-button mobile-only-close"
              onClick={toggleRail}
              style={{
                height: '40px',
                marginBottom: '10px',
                display: window.innerWidth < 1024 ? 'flex' : 'none', // Simple inline check, better done via CSS class
                color: '#888'
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>

            <button
              type="button"
              className={`rail-button ${activePanel === 'files' && panelVisible ? 'active' : ''}`}
              onClick={() => togglePanel('files')}
              title="Models"
            >
              <FolderIcon />
              <span className="rail-label" style={{ fontWeight: 700 }}>Files</span>
            </button>
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
              className={`rail-button ${activePanel === 'progress' && panelVisible ? 'active' : ''}`}
              onClick={() => togglePanel('progress')}
              title="Seguimiento"
            >
              <ProgressIcon />
              <span className="rail-label" style={{ fontWeight: 700 }}>Seguimiento</span>
            </button>





          </nav>

        )}

        {/* MOBILE FLOATING TOOLBAR */}
        <MobileFloatingToolbar
          items={[
            {
              id: 'files',
              label: 'Videos',
              icon: <FolderIcon />,
              active: activePanel === 'files' && panelVisible,
              onClick: () => togglePanel('files')
            },
            {
              id: 'filters',
              label: 'Filtros',
              icon: <FilterIcon />,
              active: activePanel === 'filters' && panelVisible,
              onClick: () => togglePanel('filters')
            },
            {
              id: 'ar',
              label: 'AR Mode',
              icon: <ARIcon />,
              active: arModeActive,
              onClick: () => {
                if (!arModeActive) {
                  // CAPTURE camera from main viewer (if exists)
                  try {
                    // Try to find the global viewer instance
                    const viewer = window.NOP_VIEWER || (window.Autodesk && window.Autodesk.Viewing && window.Autodesk.Viewing.Private && window.Autodesk.Viewing.Private.GuiViewer3D && window.Autodesk.Viewing.Private.GuiViewer3D.instances && window.Autodesk.Viewing.Private.GuiViewer3D.instances[0]);

                    if (viewer && viewer.navigation) {
                      const cam = viewer.navigation.getCamera();
                      const cameraState = {
                        position: cam.position.clone(),
                        target: cam.target.clone(),
                        up: cam.up.clone(),
                        fov: viewer.navigation.getVerticalFov()
                      };
                      console.log("[App] Captured camera for AR:", cameraState);
                      setArInitialCamera(cameraState);
                    } else {
                      console.warn("[App] No viewer found, AR will use fitToView");
                    }
                  } catch (err) {
                    console.error("[App] Error capturing camera:", err);
                  }
                  setArModeActive(true);
                } else {
                  setArModeActive(false);
                  setArInitialCamera(null);
                }
              }
            }
          ]}
        />

        <TandemSidebar
          activePanel={activePanel}
          panelVisible={panelVisible}
          models={models}
          hiddenModelUrns={hiddenModelUrns}
          filterBuckets={filterBuckets}
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
          removeModel={removeModel}
          setRelinkTargetModel={setRelinkTargetModel}
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

          // Tracking / BuildPanel Props
          trackingData={trackingData}
          onTrackingPinClick={handleTrackingPinClick}
          onTrackingPinDelete={(id) => handleTrackingPinDelete(trackingTab || 'restricciones', id)}
          onTrackingPlacementToggle={handleTrackingPlacementToggle}
          trackingPlacementMode={trackingPlacementMode}
          selectedPinId={selectedProgressPin?.id || selectedDocPin?.id || selectedAlbumPin?.id}
          onCameraCapture={handleCameraCapture}
        />

        <div className="app-viewer">
          {activePanel === 'progress' && (
            <div style={{
              position: 'absolute',
              top: '20px',
              // Shift center-left if any panel is docked (50% of remaining viewer space = 25%)
              left: panelDocked && (
                (trackingTab === 'fotos' && photoAlbumOpen && selectedAlbumPin) ||
                (trackingTab === 'avance' && progressPanelOpen && selectedProgressPin) ||
                (trackingTab === 'docs' && docPinPanelOpen && selectedDocPin) ||
                (trackingTab === 'restricciones' && docPinPanelOpen && selectedDocPin)
              ) ? '25%' : '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '8px',
              zIndex: 100,
              transition: 'left 0.3s ease',
              background: 'rgba(0,0,0,0.45)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              padding: '6px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)'
            }}>
              <button
                className="secondary-btn"
                style={{
                  background: trackingTab === 'avance' ? '#22c55e' : 'transparent',
                  color: trackingTab === 'avance' ? '#fff' : '#bbb',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontSize: '12px',
                  letterSpacing: '0.05em',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onClick={() => setTrackingTab(prev => prev === 'avance' ? null : 'avance')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
                </svg>
                AVANCE
              </button>
              <button
                className="secondary-btn"
                style={{
                  background: trackingTab === 'fotos' ? '#3b82f6' : 'transparent',
                  color: trackingTab === 'fotos' ? '#fff' : '#bbb',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontSize: '12px',
                  letterSpacing: '0.05em',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onClick={() => setTrackingTab(prev => prev === 'fotos' ? null : 'fotos')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
                FOTOS
              </button>
              <button
                className="secondary-btn"
                style={{
                  background: trackingTab === 'docs' ? '#8b5cf6' : 'transparent',
                  color: trackingTab === 'docs' ? '#fff' : '#bbb',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontSize: '12px',
                  letterSpacing: '0.05em',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onClick={() => setTrackingTab(prev => prev === 'docs' ? null : 'docs')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                DOC
              </button>
              <button
                className="secondary-btn"
                style={{
                  background: trackingTab === 'restricciones' ? '#f59e0b' : 'transparent',
                  color: trackingTab === 'restricciones' ? '#fff' : '#bbb',
                  border: 'none',
                  padding: '8px 20px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                  fontSize: '11px',
                  letterSpacing: '0.05em',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
                onClick={() => setTrackingTab(prev => prev === 'restricciones' ? null : 'restricciones')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                RESTR.
              </button>

              {/* Add Photo Button when Photos active */}
              {trackingTab === 'fotos' && (
                <button
                  className="secondary-btn"
                  title="Agregar Nueva Foto"
                  style={{
                    background: trackingPlacementMode ? '#ef4444' : 'rgba(59, 130, 246, 0.8)',
                    color: 'white',
                    border: 'none',
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    transition: 'all 0.2s ease',
                    boxShadow: trackingPlacementMode ? '0 0 12px rgba(239,68,68,0.4)' : 'none'
                  }}
                  onClick={() => setTrackingPlacementMode(prev => !prev)}
                >
                  {trackingPlacementMode ? '✕' : '+'}
                </button>
              )}

              {/* Add Progress Button when Avance active */}
              {trackingTab === 'avance' && (
                <button
                  className="secondary-btn"
                  title="Marcar Avance"
                  style={{
                    background: trackingPlacementMode ? '#ef4444' : 'rgba(34, 197, 94, 0.8)',
                    color: 'white',
                    border: 'none',
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    transition: 'all 0.2s ease',
                    boxShadow: trackingPlacementMode ? '0 0 12px rgba(239,68,68,0.4)' : 'none'
                  }}
                  onClick={() => setTrackingPlacementMode(prev => !prev)}
                >
                  {trackingPlacementMode ? '✕' : '+'}
                </button>
              )}

              {/* Add Doc Button when Docs active */}
              {trackingTab === 'docs' && (
                <button
                  className="secondary-btn"
                  title="Agregar Documento (PDF)"
                  style={{
                    background: trackingPlacementMode ? '#ef4444' : 'rgba(139, 92, 246, 0.8)',
                    color: 'white',
                    border: 'none',
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    transition: 'all 0.2s ease',
                    boxShadow: trackingPlacementMode ? '0 0 12px rgba(239,68,68,0.4)' : 'none'
                  }}
                  onClick={() => setTrackingPlacementMode(prev => !prev)}
                >
                  {trackingPlacementMode ? '✕' : '+'}
                </button>
              )}
              {/* Add Restriction Button when Alerta active */}
              {trackingTab === 'restricciones' && (
                <button
                  className="secondary-btn"
                  title="Marcar Restricción / Alerta"
                  style={{
                    background: trackingPlacementMode ? '#ef4444' : 'rgba(245, 158, 11, 0.8)',
                    color: 'white',
                    border: 'none',
                    width: '34px',
                    height: '34px',
                    borderRadius: '50%',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '18px',
                    transition: 'all 0.2s ease',
                    boxShadow: trackingPlacementMode ? '0 0 12px rgba(239,68,68,0.4)' : 'none'
                  }}
                  onClick={() => setTrackingPlacementMode(prev => !prev)}
                >
                  {trackingPlacementMode ? '✕' : '+'}
                </button>
              )}
            </div>
          )}
          <div className="split-view-container">
            <div className="split-3d" style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 9999, background: 'rgba(0,0,0,0.6)', color: '#4ade80', fontSize: '10px', padding: '3px 8px', borderRadius: '4px', border: '1px solid #4ade80', pointerEvents: 'none' }}>
                Sistema Actualizado v1.0.3
              </div>
              {/* 3D VIEWER - Keep mounted but hide in Build mode to preserve state */}
              <div style={{ width: '100%', height: '100%', display: activePanel === 'build' ? 'none' : 'block' }}>
                <Viewer
                  accessToken={accessToken}
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
                  trackingPlacementMode={trackingPlacementMode}
                  onTrackingPinCreate={handleTrackingPinCreate}
                  onTrackingPinClick={handleTrackingPinClick}
                  onSelectionChanged={setSelectedElement}
                  aiModelCommand={aiModelCommand}
                  hideToolbar={activePanel === 'progress'}
                />

              </div>

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
                      <div style={{ flex: 1, background: '#e5e7eb', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                        {openedDoc.type === 'pdf' ? (
                          <PdfViewer url={openedDoc.nodeId ? `${import.meta.env.VITE_BACKEND_URL}/api/docs/proxy?id=${openedDoc.nodeId}` : openedDoc.url} />
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
                            <a href={openedDoc.url} target="_blank" rel="noreferrer" style={{ color: '#3aa0ff' }}>Descargar Archivo</a>
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
                              <div style={{ color: '#3aa0ff', fontSize: '1.2rem' }}>›</div>
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
              <div className={`split-doc active dark-float ${panelDocked ? 'parallel' : ''}`} style={panelDocked ? { background: '#1a1b1e', borderLeft: '1px solid #444', zIndex: 10 } : {}}>
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
                  onRename={(id, newTitle) => handleTrackingPinUpdate('fotos', id, { val: newTitle })}
                  modelUrn="global"
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
                  elementProps={
                    selectedProgressPin && selectedProgressPin.dbId
                      ? allLoadedProperties.find(p => p.dbId === selectedProgressPin.dbId)?.properties
                      : null
                  }
                  onDelete={(id) => handleTrackingPinDelete('avance', id)}
                  isDocked={panelDocked}
                  onToggleDock={() => setPanelDocked(prev => !prev)}
                  onUpdatePin={(id, updates) => handleTrackingPinUpdate('avance', id, updates)}
                  availablePartidas={availablePartidas}
                />
              </div>
            )}

            {/* CASE F: DOC PIN PANEL */}
            {(trackingTab === 'docs' || trackingTab === 'restricciones') && docPinPanelOpen && selectedDocPin && (
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
                  onAttachDoc={handleAttachDocToPin}
                  onAttachBatchDocs={handleAttachBatchDocsToPin}
                  onRemoveDoc={handleRemoveDocFromPin}
                  onRename={(id, newTitle) => handleTrackingPinUpdate(trackingTab, id, { val: newTitle })}
                  projectPrefix={selectedProject?.name ? `proyectos/${selectedProject.name.replace(/ /g, '_')}/` : 'proyectos/'}
                  modelUrn="global"
                />
              </div>
            )}
          </div>
        </div>

        <ImportModelModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onLinkDocs={handleLinkDocs}
          onUploadLocal={handleLocalUpload}
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

        {/* AR VIEW OVERLAY */}
        {arModeActive && (
          <ARView
            models={models}
            initialCamera={arInitialCamera}
            onExit={() => {
              setArModeActive(false);
              setArInitialCamera(null);
            }}
          />
        )}

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
