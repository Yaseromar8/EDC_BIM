import React, { useState, useCallback, useEffect, useMemo } from 'react';
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
import BuildPanel from './components/BuildPanel';
import BuildMapView from './components/BuildMapView';
import NavigationPanel from './components/NavigationPanel';
import AddAttachmentModal from './components/AddAttachmentModal';

const FilterIcon = () => (
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
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
  </svg>
);

const GearIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
    <line x1="12" y1="2" x2="12" y2="5" />
    <line x1="12" y1="19" x2="12" y2="22" />
    <line x1="2" y1="12" x2="5" y2="12" />
    <line x1="19" y1="12" x2="22" y2="12" />
  </svg>
);

const DEFAULT_VISIBLE_VALUES = 5;

const FolderIcon = () => (
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
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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

const BuildIcon = () => (
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
    <path d="M2 22h20" />
    <path d="M12 2v20" />
    <path d="M2 12h10" />
    <path d="M12 7h5" />
    <path d="M12 17h5" />
    <path d="M17 7v10" />
  </svg>
);

const CompassIcon = () => (
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
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
  </svg>
);

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

  const toggleProp = propId => {
    setPendingSelection(prev =>
      prev.includes(propId) ? prev.filter(id => id !== propId) : [...prev, propId]
    );
  };

  const handleSave = () => {
    onSave?.(pendingSelection);
    onClose?.();
  };

  if (!open) return null;

  const availableGroups = groupProperties(availableProperties, availableQuery);
  const propertyMap = new Map(availableProperties.map(prop => [prop.id, prop]));
  const selectedDetails = pendingSelection
    .map(id => propertyMap.get(id))
    .filter(Boolean)
    .filter(prop =>
      selectedQuery.trim()
        ? prop.name.toLowerCase().includes(selectedQuery.trim().toLowerCase()) ||
        (prop.path || '').toLowerCase().includes(selectedQuery.trim().toLowerCase())
        : true
    );

  return (
    <div className="modal-overlay filters-config-overlay">
      <div className="filters-config-panel">
        <header className="filters-config-header">
          <div>
            <h3>Edit Filters</h3>
            <p>Search and select the parameters you want to expose in the filter panel.</p>
          </div>
          <div className="filters-config-actions">
            <button className="secondary-btn" onClick={() => onReset?.()} type="button">
              Reset default
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Close configurator">
              ×
            </button>
          </div>
        </header>
        <div className="filters-config-body">
          <section>
            <p className="filters-config-label">Available Properties</p>
            <div className="filters-config-search">
              <input
                type="search"
                placeholder="Search"
                value={availableQuery}
                onChange={e => setAvailableQuery(e.target.value)}
              />
            </div>
            {availableGroups.map(group => {
              const selectedCount = group.properties.filter(prop =>
                pendingSelection.includes(prop.id)
              ).length;
              return (
                <details key={group.id} open>
                  <summary>
                    <span>{group.label}</span>
                    <span className="filters-config-count">
                      {selectedCount} of {group.properties.length}
                    </span>
                  </summary>
                  <ul>
                    {group.properties.map(prop => (
                      <li key={prop.id}>
                        <label>
                          <input
                            type="checkbox"
                            checked={pendingSelection.includes(prop.id)}
                            onChange={() => toggleProp(prop.id)}
                          />
                          <span>
                            <strong>{prop.name}</strong>
                            <small>{prop.path}</small>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
            {!availableGroups.length && (
              <div className="filters-config-empty">No properties found for this search.</div>
            )}
          </section>
          <section>
            <p className="filters-config-label">Selected Properties</p>
            <div className="filters-config-search">
              <input
                type="search"
                placeholder="Search"
                value={selectedQuery}
                onChange={e => setSelectedQuery(e.target.value)}
              />
            </div>
            {selectedDetails.length === 0 && (
              <div className="filters-config-empty">Select at least one property to display.</div>
            )}
            <ul className="filters-selected-list">
              {selectedDetails.map(prop => (
                <li key={prop.id}>
                  <div>
                    <strong>{prop.name}</strong>
                    <small>{prop.path}</small>
                  </div>
                  <button onClick={() => toggleProp(prop.id)} aria-label={`Remove ${prop.name}`}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="filters-config-visibility">
              <label>
                <input
                  type="checkbox"
                  checked={hideLocations}
                  onChange={e => setHideLocations(e.target.checked)}
                />
                <span>Hide location categories (Levels, Rooms, Spaces) from graphics and results</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={includeMultiLevel}
                  onChange={e => setIncludeMultiLevel(e.target.checked)}
                />
                <span>Include elements spanning multiple levels in each level filter</span>
              </label>
            </div>
          </section>
        </div>
        <footer className="filters-config-footer">
          <button className="secondary-btn" onClick={onClose}>
            Cancel
          </button>
          <button className="primary-btn" onClick={handleSave} disabled={!pendingSelection.length}>
            Update
          </button>
        </footer>
      </div>
    </div>
  );
}








function App() {
  const [models, setModels] = useState([]);
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
  const [buildUploads, setBuildUploads] = useState([]);
  const [filterConfiguratorOpen, setFilterConfiguratorOpen] = useState(false);
  const [availableProperties, setAvailableProperties] = useState([]);
  const [filterProperties, setFilterProperties] = useState([]);
  const [modelProperties, setModelProperties] = useState({}); // Changed to object {urn: props[]}
  const [filterSelections, setFilterSelections] = useState({});
  const [expandedFilters, setExpandedFilters] = useState({});
  const [filterColors, setFilterColors] = useState({}); // Restored state
  const [showSplash, setShowSplash] = useState(true);
  const [buildUploading, setBuildUploading] = useState(false);
  const [buildUploadError, setBuildUploadError] = useState('');
  const [buildPins, setBuildPins] = useState([]);
  const [showBuildPins, setShowBuildPins] = useState(false);
  const [buildPlacementMode, setBuildPlacementMode] = useState(false);
  const [buildPinType, setBuildPinType] = useState('data'); // 'data', 'docs', 'avance', 'restriccion'
  const [selectedPinId, setSelectedPinId] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [minimapActive, setMinimapActive] = useState(false);
  const [vrActive, setVrActive] = useState(false);
  // Duplicate removed
  const [sheets, setSheets] = useState([]); // To store 2D sheets
  const [activeSheet, setActiveSheet] = useState(null);
  const [docPlacementMode, setDocPlacementMode] = useState(false);
  const [docs, setDocs] = useState([]); // Array of attached docs (legacy?) (Keeping for safety)
  const [docPins, setDocPins] = useState([]); // Array of { id, x, y, z, docs: [] }
  const [openedDoc, setOpenedDoc] = useState(null); // Currently viewing doc in Split Screen

  // Attachments Modal State
  const [attachmentModalOpen, setAttachmentModalOpen] = useState(false);
  const [attachmentPinId, setAttachmentPinId] = useState(null);

  const [parallelMode, setParallelMode] = useState(false); // Floating vs Split Default False

  // Viewable / Proposal Handling (Infraworks)
  const [modelViews, setModelViews] = useState({}); // { urn: [ { guid, name } ] }
  const [activeViewableGuids, setActiveViewableGuids] = useState({}); // { urn: guid }

  const handleViewablesLoaded = useCallback(({ urn, views }) => {
    setModelViews(prev => {
      // Avoid unnecessary updates
      if (JSON.stringify(prev[urn]) === JSON.stringify(views)) return prev;
      return { ...prev, [urn]: views };
    });
  }, []);

  const handleLoadSpecificView = useCallback((urn, guid) => {
    console.log('[App] Switching view for', urn, 'to', guid);
    setActiveViewableGuids(prev => ({
      ...prev,
      [urn]: guid
    }));
  }, []);

  const handleDocPinComplete = (position) => {
    const newPin = {
      id: 'doc-' + Date.now(),
      x: position.x,
      y: position.y,
      z: position.z,
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

  const activeProperties = useMemo(() => {
    let all = [];
    Object.entries(modelProperties).forEach(([urn, props]) => {
      if (!hiddenModelUrns.includes(urn)) {
        // Tag each row with its model URN so we can distinguish DbIds from different models
        const tagged = props.map(p => ({ ...p, modelUrn: urn }));
        all = all.concat(tagged);
      }
    });
    return all;
  }, [modelProperties, hiddenModelUrns]);

  // Load views on mount
  useEffect(() => {
    fetch('/api/views')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setSavedViews(data);
      })
      .catch(err => console.error("Error loading views:", err));
  }, []);

  const handleSaveView = useCallback((name) => {
    const handleStateCapture = (e) => {
      const viewerState = e.detail;
      window.removeEventListener('viewer-state-captured', handleStateCapture);

      const filterState = {
        filterSelections,
        filterColors,
        filterProperties
      };

      fetch('/api/views', {
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
    fetch(`/api/views/${viewId}`, { method: 'DELETE' })
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
    setHiddenModelUrns(prev =>
      prev.includes(urn) ? prev.filter(u => u !== urn) : [...prev, urn]
    );
  }, []);


  // Load pins and layers from server
  useEffect(() => {
    fetch('/api/pins')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setBuildPins(data);
        }
      })
      .catch(err => console.error('Error loading pins:', err));
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

  const handlePinCreated = useCallback(async (pinData) => {
    // 1. Optimistic UI: Create immediately
    const tempId = 'temp-' + Date.now();
    const optimisticPin = {
      id: tempId,
      name: `Punto ${buildPins.length + 1} (Creando...)`,
      ...pinData,
      type: buildPinType, // Save the type selected in UI
      createdAt: new Date().toISOString(),
      documents: []
    };

    setBuildPins(prev => [...prev, optimisticPin]);
    setSelectedPinId(tempId);
    setBuildPlacementMode(false); // Immediate exit

    try {
      const res = await fetch('/api/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pinData, type: buildPinType }) // Send type to backend
      });
      if (res.ok) {
        const newPin = await res.json();
        // Replace temp pin with real one
        setBuildPins(prev => prev.map(p => p.id === tempId ? newPin : p));
        setSelectedPinId(newPin.id);
      } else {
        // Rollback on server error
        setBuildPins(prev => prev.filter(p => p.id !== tempId));
        alert('Error al guardar el punto en el servidor.');
      }
    } catch (err) {
      console.error('Error creating pin:', err);
      // Rollback on network error
      setBuildPins(prev => prev.filter(p => p.id !== tempId));
    }
  }, [buildPins.length]);

  const handlePinSelect = useCallback((pinId) => {
    setSelectedPinId(pinId);
    // Loose compare or stringify to handle potential mismatches (number vs string)
    const pin = buildPins.find(p => String(p.id) === String(pinId));

    if (pin) {
      // Always open the sheet/doc context for the pin
      setActiveSheet({
        name: pin.name,
        isPin: true,
        pinId: pin.id,
        docs: pin.documents || [] // Pass empty array if no docs
      });
      // If docs exist, open the first one. If not, open nothing (empty state will show)
      if (pin.documents && pin.documents.length > 0) {
        setOpenedDoc(pin.documents[0]);
        setParallelMode(false);
      } else {
        setOpenedDoc(null);
        // Keep parallel mode as is or default?
      }
    }
  }, [buildPins]);

  const handlePinDelete = useCallback(async (pinId) => {
    try {
      const res = await fetch(`/api/pins/${pinId}`, { method: 'DELETE' });
      if (res.ok) {
        setBuildPins(prev => prev.filter(p => p.id !== pinId));
        if (selectedPinId === pinId) {
          setSelectedPinId(null);
        }
      }
    } catch (err) {
      console.error('Error deleting pin:', err);
    }
  }, [selectedPinId]);

  const handleBuildFileUpload = async (file, targetPinId = null) => {
    const pinId = targetPinId || selectedPinId;
    if (!pinId || !file) return;

    // 1. Optimistic Update: Show image immediately
    const tempId = Date.now();
    const tempUrl = URL.createObjectURL(file);
    const tempDoc = {
      id: tempId,
      name: file.name,
      url: tempUrl,
      status: 'uploading',
      timestamp: new Date().toISOString()
    };

    setBuildPins(prevPins => prevPins.map(pin => {
      if (pin.id === pinId) {
        return {
          ...pin,
          documents: [...(pin.documents || []), tempDoc]
        };
      }
      return pin;
    }));

    setBuildUploading(true);
    setBuildUploadError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      // 2. Upload to Server
      const res = await fetch('/api/build/acc-upload', {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al subir archivo');
      }

      const data = await res.json();

      // 3. Prepare Final Document
      const finalDoc = {
        id: tempId, // Keep the same ID to maintain continuity in UI if needed, or use server ID
        name: file.name,
        urn: data.urn,
        storageId: data.storage_id,
        versionId: data.version_id,
        itemId: data.item_id,
        // Use proxy URL for permanent access
        url: `/api/images/proxy?storageId=${encodeURIComponent(data.storage_id)}`,
        status: 'processed',
        timestamp: new Date().toISOString()
      };

      // 4. Update Local State (Swap Temp for Real)
      setBuildPins(prevPins => prevPins.map(pin => {
        if (pin.id === pinId) {
          const updatedDocs = (pin.documents || []).map(d =>
            d.id === tempId ? finalDoc : d
          );
          return { ...pin, documents: updatedDocs };
        }
        return pin;
      }));

      // 5. Sync with Server (Fetch latest -> Append -> Save)
      // We fetch the latest pin state from server to ensure we don't overwrite other committed changes
      // and we don't send our local "temp" docs to the server.
      const pinRes = await fetch(`/api/pins`);
      if (pinRes.ok) {
        const allPins = await pinRes.json();
        const serverPin = allPins.find(p => p.id === pinId);

        if (serverPin) {
          const newServerDocs = [...(serverPin.documents || []), finalDoc];

          await fetch(`/api/pins/${pinId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ documents: newServerDocs })
          });
        }
      }

    } catch (err) {
      console.error('Build upload error:', err);
      setBuildUploadError(err.message);

      // Remove the temp doc on error
      setBuildPins(prevPins => prevPins.map(pin => {
        if (pin.id === pinId) {
          return {
            ...pin,
            documents: (pin.documents || []).filter(d => d.id !== tempId)
          };
        }
        return pin;
      }));
    } finally {
      setBuildUploading(false);
    }
  };



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

  useEffect(() => {
    if (!showSplash) return;
    if (models.length > 0 || documents.length > 0) {
      setShowSplash(false);
    }
  }, [models.length, documents.length, showSplash]);

  useEffect(() => {
    if (!availableProperties.length) return;
    setFilterProperties(prev => {
      const availableIds = new Set(availableProperties.map(prop => prop.id));
      const sanitized = prev.filter(id => availableIds.has(id));
      if (sanitized.length) return sanitized;
      const defaults = availableProperties.slice(0, Math.min(availableProperties.length, 4)).map(prop => prop.id);
      return defaults;
    });
  }, [availableProperties]);

  const resetFiltersToDefault = useCallback(() => {
    if (!availableProperties.length) return;
    setFilterProperties(availableProperties.slice(0, Math.min(availableProperties.length, 4)).map(prop => prop.id));
  }, [availableProperties]);

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
          // Actually, the best way is to pre-fill dynamicFilterBuckets logic?
          // No, we need the initial FULL set of values for this property.
          // Let's find the property in availableProperties? No we need the values.
          // We can re-scan modelProperties for this property ID.
          // BUT, to avoid heavy computation here, let's defer?
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



  // Twin Config: Load models from backend on mount
  useEffect(() => {
    fetch('/api/config/project')
      .then(res => res.json())
      .then(data => {
        if (data.models && Array.isArray(data.models)) {
          // Map backend format to viewer format if needed
          // Backend: { urn, name, source, ... }
          // Viewer expects: { urn, name (or label), ... }
          const mapped = data.models.map(m => ({
            ...m,
            label: m.name // Viewer uses label or name
          }));
          setModels(mapped);
        }
      })
      .catch(err => console.error("Error loading project config:", err));
  }, []);

  const handleLinkDocs = useCallback(async (model) => {
    // 1. Optimistic Update (Optional)
    // 2. Call Backend
    try {
      const res = await fetch('/api/config/project/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          urn: model.urn,
          name: model.name || model.label,
          region: 'US', // Assume US for now
          // Metadata for Update support
          projectId: model.projectId,
          itemId: model.itemId,
          versionId: model.versionId
        })
      });
      if (res.ok) {
        const config = await res.json();
        if (config.models) {
          setModels(config.models.map(m => ({ ...m, label: m.name })));
        }
      }
    } catch (e) {
      console.error("Error linking model:", e);
    }
  }, []);

  const handleModelUpdate = useCallback(async (urn) => {
    try {
      const res = await fetch('/api/config/project/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urn })
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
  }, []);

  const handleLocalUpload = useCallback(async (file, label) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('label', label);

    try {
      // Show loading indicator?
      const res = await fetch('/api/config/project/upload', {
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
  }, []);

  const removeModel = useCallback(async (urn) => {
    try {
      const res = await fetch('/api/config/project/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urn })
      });
      if (res.ok) {
        const config = await res.json();
        if (config.models) {
          setModels(config.models.map(m => ({ ...m, label: m.name })));

          // Also remove properties for this model from local state
          setModelProperties(prev => {
            const next = { ...prev };
            delete next[urn];
            return next;
          });

          // And ensure it is removed from hidden list if it was there
          setHiddenModelUrns(prev => prev.filter(u => u !== urn));
        }
      }
    } catch (e) {
      console.error("Error removing model:", e);
    }
  }, []);

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

  const pollTranslationStatus = useCallback(async (urn) => {
    const checkStatus = async () => {
      try {
        // Encode URN twice to ensure slashes are handled correctly by proxies/servers
        const encodedUrn = encodeURIComponent(urn);
        const response = await fetch(`/api/build/translation-status?urn=${encodedUrn}`);
        const data = await response.json();
        if (data.status === 'success') {
          setBuildUploads(prev => prev.map(f => f.urn === urn ? { ...f, status: 'success' } : f));
        } else if (data.status === 'failed') {
          setBuildUploads(prev => prev.map(f => f.urn === urn ? { ...f, status: 'failed' } : f));
        } else {
          setTimeout(checkStatus, 5000); // Retry in 5s
        }
      } catch (error) {
        console.error("Polling error", error);
      }
    };
    checkStatus();
  }, []);

  const removeBuildUpload = useCallback((id) => {
    setBuildUploads(prev => prev.filter(file => file.id !== id));
  }, []);

  const fetchSignedRead = useCallback(async (file) => {
    const storageId = file.storageId || file.storage_id;
    const projectId = file.projectId || file.project_id;
    const versionId = file.versionId || file.version_id;
    const body = storageId ? { storageId } : { projectId, versionId };
    const resp = await fetch('/api/build/signed-read', {
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
    if (id) {
      setShowSprites(true);
      setActivePanel('docs');
      setPanelVisible(true);
    }
  }, []);

  const toggleSpritesVisibility = useCallback(() => {
    setShowSprites(prev => !prev);
  }, []);

  const togglePanel = panel => {
    if (showSplash) setShowSplash(false);
    if (activePanel === panel) {
      setPanelVisible(prev => !prev);
    } else {
      setActivePanel(panel);
      setPanelVisible(true);
    }
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
      return { groups: [], dbIds: [], nonMatchingDbIds: [] };
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
            const key = `${item.modelUrn}#${item.id}`;
            propKeys.add(key);
            if (!keyMap.has(key)) keyMap.set(key, item);
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
        const key = `${item.modelUrn}#${item.id}`;
        allKnownKeys.add(key);
        if (!keyMap.has(key)) keyMap.set(key, item);
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
      nonMatchingDbIds
    };
  }, [filterSelections, filterBuckets, filterColors]);

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

  const handleValueToggle = useCallback((propId, value) => {
    setFilterSelections(prev => {
      const current = new Set(prev[propId] || []);
      if (current.has(value)) {
        current.delete(value);
      } else {
        current.add(value);
      }
      const next = { ...prev };
      if (current.size) {
        next[propId] = Array.from(current);
      } else {
        delete next[propId];
      }
      return next;
    });
  }, []);

  const toggleExpandBlock = useCallback((propId) => {
    setExpandedFilters(prev => ({ ...prev, [propId]: !prev[propId] }));
  }, []);

  const handlePinUpdate = async (updatedPin) => {
    try {
      const res = await fetch(`/api/pins/${updatedPin.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPin)
      });
      if (res.ok) {
        const savedPin = await res.json();
        setBuildPins(prev => prev.map(p => p.id === savedPin.id ? savedPin : p));
      }
    } catch (err) {
      console.error('Error updating pin:', err);
    }
  };

  // --- ATTACHMENT MODAL HANDLERS ---
  const handleOpenAttachmentModal = (pinId) => {
    setAttachmentPinId(pinId);
    setAttachmentModalOpen(true);
  };

  const handleAttachment = async (data) => {
    if (!attachmentPinId) return;

    let newDoc = null;

    if (data.type === 'local') {
      await handleBuildFileUpload(data.file, attachmentPinId);
    } else if (data.type === 'acc') {
      const { file } = data;
      const tempId = 'acc-' + Date.now();
      newDoc = {
        id: tempId,
        name: file.name,
        urn: file.urn,
        versionId: file.versionId,
        itemId: file.itemId,
        source: 'acc',
        status: 'ready',
        timestamp: new Date().toISOString()
      };

      setBuildPins(prevPins => prevPins.map(pin => {
        if (pin.id === attachmentPinId) {
          return { ...pin, documents: [...(pin.documents || []), newDoc] };
        }
        return pin;
      }));

      try {
        const pin = buildPins.find(p => p.id === attachmentPinId);
        if (pin) {
          const currentDocs = pin.documents || [];
          const updatedPin = { ...pin, documents: [...currentDocs, newDoc] };

          const res = await fetch(`/api/pins/${pin.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedPin)
          });

          if (res.ok) {
            const savedPin = await res.json();
            setBuildPins(prev => prev.map(p => p.id === savedPin.id ? savedPin : p));
          }
        }
      } catch (err) {
        console.error("Error linking ACC doc:", err);
      }
    }
  };



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

  return (
    <div className="app-layout" style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100vw', overflow: 'hidden' }}>
      <TopBar
        activePanel={activePanel}
        togglePanel={togglePanel}
        isViewsActive={activePanel === 'views' && panelVisible}
      />
      <div className="app-container" style={{ flex: 1, position: 'relative' }}>
        {showSplash && (
          <div className="splash-overlay">
            <img src="/POWER_CHINA.webp" alt="Company logo" />
          </div>
        )}
        <nav className="app-left-rail" aria-label="Primary tools">
          <button
            type="button"
            className={`rail-button ${activePanel === 'filters' && panelVisible ? 'active' : ''}`}
            onClick={() => togglePanel('filters')}
            title="Filters"
          >
            <FilterIcon />
            <span className="rail-label">Filters</span>
          </button>
          <button
            type="button"
            className={`rail-button ${activePanel === 'files' && panelVisible ? 'active' : ''}`}
            onClick={() => togglePanel('files')}
            title="Files"
          >
            <FolderIcon />
            <span className="rail-label">Files</span>
          </button>
          <button
            type="button"
            className={`rail-button ${activePanel === 'docs' && panelVisible ? 'active' : ''}`}
            onClick={() => togglePanel('docs')}
            title="Documentation"
          >
            <DocumentIcon />
            <span className="rail-label">Docs</span>
          </button>
          <button
            type="button"
            className={`rail-button ${activePanel === 'build' && panelVisible ? 'active' : ''}`}
            onClick={() => togglePanel('build')}
            title="Build"
          >
            <BuildIcon />
            <span className="rail-label">Build</span>
          </button>
          <button
            type="button"
            className={`rail-button ${activePanel === 'navigation' && panelVisible ? 'active' : ''}`}
            onClick={() => togglePanel('navigation')}
            title="Navigation"
          >
            <CompassIcon />
            <span className="rail-label">Nav</span>
          </button>
        </nav>

        <aside className={`app-sidebar ${panelVisible && activePanel !== 'views' ? '' : 'hidden'}`}>
          {activePanel === 'filters' && (
            <div className="filters-shell">
              <header className="filters-shell-header">
                <div>
                  <h2 className="filters-shell-title">FILTERS</h2>
                  <span className="filters-shell-subtitle">Select elements to highlight</span>
                </div>
                <div className="filters-shell-actions">
                  <button className="icon-button ghost" onClick={() => setFilterConfiguratorOpen(true)} title="Configure Filters">
                    <GearIcon />
                  </button>
                  <button className="icon-button ghost" title="Reset Filters" onClick={() => {
                    setFilterSelections({});
                    window.dispatchEvent(new CustomEvent('filters-apply', { detail: { dbIds: [] } }));
                  }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>
                </div>
              </header>
              <div className="filters-shell-body">
                {/* Sources Filter Block */}
                <div className="filters-block">
                  <header className="filters-block-header">
                    <div className="filters-block-info">
                      <h3 className="filters-block-title">Sources</h3>
                      <span className="filters-block-subcount">({models.length - hiddenModelUrns.length} of {models.length})</span>
                    </div>
                    <div className="filters-block-toolbar">
                      <button className="icon-button ghost" style={{ width: 24, height: 24 }} onClick={() => setExpandedFilters(prev => ({ ...prev, 'sources': !prev['sources'] }))}>
                        {expandedFilters['sources'] !== false ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
                        )}
                      </button>
                    </div>
                  </header>
                  {expandedFilters['sources'] !== false && (
                    <ul className="filters-value-list">
                      {models.map(model => (
                        <li key={model.urn} className="filters-value-item">
                          <label className="filters-value-label">
                            <input
                              type="checkbox"
                              checked={!hiddenModelUrns.includes(model.urn)}
                              onChange={() => handleToggleModelVisibility(model.urn)}
                            />
                            <span title={model.label}>{model.label}</span>
                          </label>
                          <span className="filters-value-count">
                            {/* We could show element count per model here if available */}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Dynamically Generated Model Filters */}
                {Object.keys(filterBuckets).length === 0 && (
                  <div style={{ padding: 20, textAlign: 'center', color: '#666', fontSize: 13 }}>
                    No properties available.
                  </div>
                )}
                {!availableProperties.length && (
                  <div className="filters-block-empty">
                    Carga o selecciona un modelo para descubrir sus parámetros disponibles.
                  </div>
                )}
                {availableProperties.length > 0 && selectedPropertyObjects.length === 0 && (
                  <div className="filters-block-empty">
                    Usa el engranaje para elegir los parámetros que quieres ver aquí.
                  </div>
                )}
                {visiblePropertyObjects.map(prop => {
                  const bucket = dynamicFilterBuckets[prop.id];
                  const selectedValues = filterSelections[prop.id] || [];

                  // Filter: Hide items with 0 count unless they are selected
                  const validItems = bucket
                    ? bucket.values.filter(item => item.count > 0 || selectedValues.includes(item.value))
                    : [];

                  const values = expandedFilters[prop.id]
                    ? validItems
                    : validItems.slice(0, DEFAULT_VISIBLE_VALUES);

                  const allSelected = bucket && selectedValues.length === bucket.values.length;
                  const someSelected = selectedValues.length > 0 && selectedValues.length < (bucket?.values.length || 0);
                  const hasMore = validItems.length > DEFAULT_VISIBLE_VALUES;

                  return (
                    <div key={prop.id} className="filters-block">
                      <div className="filters-block-header">
                        <div className="filters-block-left" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={input => { if (input) input.indeterminate = someSelected; }}
                            onChange={() => togglePropertyAll(prop.id)}
                            style={{ width: '14px', height: '14px', accentColor: '#3aa0ff', cursor: 'pointer' }}
                          />
                          <div className="filters-block-info">
                            <p className="filters-block-title">{prop.name}</p>
                            <span className="filters-block-path">{prop.path}</span>
                            <span className="filters-block-subcount">
                              {selectedValues.length} of {bucket?.values.length || 0}
                            </span>
                          </div>
                        </div>
                        <div className="filters-block-toolbar">
                          <button
                            type="button"
                            className={`icon-button ${filterColors[prop.id] ? 'active' : ''}`}
                            title={filterColors[prop.id] ? "Remove filter colors" : "Color by property"}
                            onClick={(e) => { e.stopPropagation(); toggleColor(prop.id); }}
                          >
                            {/* Palette Icon */}
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="13.5" cy="6.5" r="1.5"></circle>
                              <circle cx="17.5" cy="10.5" r="1.5"></circle>
                              <circle cx="8.5" cy="7.5" r="1.5"></circle>
                              <circle cx="6.5" cy="12.5" r="1.5"></circle>
                              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"></path>
                            </svg>
                          </button>
                          <button type="button" className="icon-button ghost" title="Buscar valores">
                            <SearchIcon />
                          </button>
                          <span className="filters-block-count">{bucket?.total || 0}</span>
                        </div>
                      </div>
                      {bucket && bucket.values.length ? (
                        <>
                          <ul className="filters-value-list">
                            {values.map((item, index) => {
                              const checked = selectedValues.includes(item.value);
                              // Calculate color if enabled
                              let colorDot = null;
                              if (filterColors[prop.id]) {
                                const originalIndex = bucket.values.findIndex(v => v.value === item.value);
                                const color = PALETTE[originalIndex % PALETTE.length];
                                colorDot = <div className="color-dot" style={{ backgroundColor: color }}></div>;
                              }

                              return (
                                <li key={item.value} className="filters-value-item">
                                  <label className="filters-value-label">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => handleValueToggle(prop.id, item.value)}
                                    />
                                    <span title={item.value}>{item.value}</span>
                                  </label>
                                  <div className="filters-value-right">
                                    <span className="filters-value-count">{item.count}</span>
                                    {colorDot ? colorDot : <div className="color-dot-placeholder"></div>}
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                          {hasMore && (
                            <button
                              type="button"
                              className="filters-more-btn"
                              onClick={() => toggleExpandBlock(prop.id)}
                            >
                              {expandedFilters[prop.id] ? 'less' : 'more'}
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  );
                })}
                {hasMoreProperties && (
                  <button
                    className="filters-more-btn"
                    onClick={() => setVisiblePropertiesCount(prev => prev + 5)}
                  >
                    Show more properties...
                  </button>
                )}
              </div>
            </div>
          )}

          {activePanel === 'files' && (
            <SourceFilesPanel
              models={models}
              hiddenModels={hiddenModelUrns}
              onImport={() => setImportModalOpen(true)}
              onRemove={removeModel}
              onToggleVisibility={handleToggleModelVisibility}
              modelViews={modelViews}
              activeViewableGuids={activeViewableGuids}
              onLoadView={handleLoadSpecificView}
              onUpdate={handleModelUpdate}
            />
          )}
          {activePanel === 'docs' && (
            <DocumentPanel
              documents={documents}
              sprites={sprites}
              activeSpriteId={activeSpriteId}
              showSprites={showSprites}
              spritePlacementActive={spritePlacementActive}
              onSelectSprite={handleSpriteSelect}
              onAddClick={() => setDocumentsModalOpen(true)}
              onRemove={removeDocument}
              onToggleSprites={toggleSpritesVisibility}
              onRequestSprite={requestSpritePlacement}
            />
          )}
          {activePanel === 'build' && (
            <BuildPanel
              buildUploads={buildUploads}
              pins={buildPins}
              selectedPinId={selectedPinId}
              onPinSelect={handlePinSelect}
              onFileUpload={handleBuildFileUpload}
              uploading={buildUploading}
              uploadError={buildUploadError}

              models={models}
              hiddenModels={hiddenModelUrns}
              onImport={() => setImportModalOpen(true)}
              onRemove={removeModel}
              onToggleVisibility={handleToggleModelVisibility}

              showPins={showBuildPins}
              onTogglePins={() => setShowBuildPins(prev => !prev)}

              placementMode={buildPlacementMode}
              onTogglePlacement={(type) => {
                // Ensure we set type FIRST, then toggle mode
                // Also, if clicking the button while active, we might want to just ensure type is set if we are enabling.
                // If disabling, type doesn't matter.
                if (type) setBuildPinType(type);
                setBuildPlacementMode(prev => !prev);
              }}
              onPinDelete={handlePinDelete}
              onPinUpload={handleOpenAttachmentModal}
            />
          )}
          {activePanel === 'navigation' && (
            <NavigationPanel
              minimapActive={minimapActive}
              onToggleMinimap={setMinimapActive}
              vrActive={vrActive}
              onToggleVR={setVrActive}
              sheets={sheets}
              onSelectSheet={setActiveSheet}
              activeSheet={activeSheet}
              docPlacementMode={docPlacementMode}
              onToggleDocMode={setDocPlacementMode}
            />
          )}
        </aside>

        <div className="app-viewer">
          <div className="split-view-container">
            <div className="split-3d">
              <Viewer
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

                // BUILD MODE INTEGRATION (Infraworks)
                buildMode={activePanel === 'build'}
                buildPlacementMode={buildPlacementMode}
                buildPinType={buildPinType}
                buildPins={buildPins}
                showBuildPins={showBuildPins} // Pass visibility state
                selectedBuildPinId={selectedPinId}
                onBuildPinCreate={handlePinCreated}
                onBuildPinSelect={handlePinSelect}
                onBuildPinUpdate={handlePinUpdate}
              // onBuildPinDelete={handlePinDelete} // If needed later
              />
            </div>

            <div className={`split-doc ${activeSheet ? 'active' : ''} ${parallelMode ? 'parallel' : ''}`}>
              {activeSheet && (
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
                      <div className="parallel-toggle" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#ccc', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px' }}>
                        <span>En Paralelo</span>
                        <input
                          type="checkbox"
                          checked={parallelMode}
                          onChange={(e) => setParallelMode(e.target.checked)}
                          style={{ cursor: 'pointer' }}
                        />
                      </div>

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
                          <iframe src={openedDoc.url} style={{ width: '100%', height: '100%', border: 'none' }} title="Doc Viewer" />
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
              )}
            </div>
          </div>

        </div>

        <ImportModelModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          onLinkDocs={handleLinkDocs}
          onUploadLocal={handleLocalUpload}
        />

        {/* Views Popover */}
        {activePanel === 'views' && panelVisible && (
          <ViewsPanel
            views={savedViews}
            onSaveView={handleSaveView}
            onDeleteView={handleDeleteView}
            onLoadView={handleLoadView}
            onClose={() => setPanelVisible(false)}
          />
        )}

        <AddDocumentModal
          open={documentsModalOpen}
          onClose={() => setDocumentsModalOpen(false)}
          targetSpriteId={activeSpriteId}
          onConfirm={(items) => {
            addDocuments(items);
            setDocumentsModalOpen(false);
          }}
        />

        <AddAttachmentModal
          open={attachmentModalOpen}
          onClose={() => setAttachmentModalOpen(false)}
          onAttach={handleAttachment}
        />

        <FilterConfigurator
          open={filterConfiguratorOpen}
          availableProperties={availableProperties}
          selectedIds={filterProperties}
          onClose={() => setFilterConfiguratorOpen(false)}
          onSave={(newProps) => {
            setFilterProperties(newProps);
            setFilterConfiguratorOpen(false);
          }}
          onReset={() => {
            setFilterProperties([]);
            setFilterConfiguratorOpen(false);
          }}
        />
      </div>
    </div >
  );
}

export default App;
