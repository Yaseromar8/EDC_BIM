import React, { useState, useCallback, useEffect, useMemo } from 'react';
import './App.css';
import NativeFileTree from './components/NativeFileTree';
import Viewer from './components/Viewer';
import ImportModelModal from './components/ImportModelModal';
import DocumentPanel from './components/DocumentPanel';
import AddDocumentModal from './components/AddDocumentModal';
import BuildPanel from './components/BuildPanel';
import BuildMapView from './components/BuildMapView';

const FilterIcon = () => (
  <svg
    className="rail-icon"
    width="26"
    height="26"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M4 6.5h16l-5.6 6.6v4.4L9.6 20v-6.9L4 6.5Z"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="rgba(96,165,250,0.15)"
    />
    <circle cx="8" cy="5" r="1" fill="currentColor" />
    <circle cx="16" cy="5" r="1" fill="currentColor" />
  </svg>
);

const GearIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
    <path d="M19.4 13a7.5 7.5 0 0 0 0-2l2-1.5-2-3.5-2.3.3a7.5 7.5 0 0 0-1.7-1L14.8 2h-5.6L8.6 5.3a7.5 7.5 0 0 0-1.7 1L4.6 6l-2 3.5L4.6 11a7.5 7.5 0 0 0 0 2l-2 1.5 2 3.5 2.3-.3a7.5 7.5 0 0 0 1.7 1l.6 3.3h5.6l.6-3.3a7.5 7.5 0 0 0 1.7-1l2.3.3 2-3.5L19.4 13Z" />
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="11" cy="11" r="7" />
    <line x1="16.5" y1="16.5" x2="21" y2="21" />
  </svg>
);

const TargetIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="3" />
    <circle cx="12" cy="12" r="8" />
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
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M4 7h4l2 3h10v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
    <path d="M22 10h-9.5L11 7H4" />
  </svg>
);

const DocumentIcon = () => (
  <svg
    className="rail-icon"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M7 2h7l5 5v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
    <path d="M14 2v6h6" />
    <line x1="9" y1="13" x2="15" y2="13" />
    <line x1="9" y1="17" x2="15" y2="17" />
  </svg>
);

const BuildIcon = () => (
  <svg
    className="rail-icon"
    width="22"
    height="22"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 9h18l-1 10H4L3 9z" />
    <rect x="9" y="9" width="6" height="6" rx="1.5" />
    <path d="M2.5 19.5h19" />
    <path d="M6 13l-3.5 7.5M18 13l3.5 7.5" />
    <path d="M10 19.5l-2.5 4M14 19.5l2.5 4" />
    <path d="M12 19.5v4" />
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
      entry.dbIds.push(row.dbId);
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
  const [modelProperties, setModelProperties] = useState([]);
  const [filterSelections, setFilterSelections] = useState({});
  const [expandedFilters, setExpandedFilters] = useState({});
  const [showSplash, setShowSplash] = useState(true);
  const [buildUploading, setBuildUploading] = useState(false);
  const [buildUploadError, setBuildUploadError] = useState('');
  const [buildPins, setBuildPins] = useState([]);
  const [selectedPinId, setSelectedPinId] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const handleModelProperties = useCallback((props = []) => {
    setModelProperties(props);
  }, []);

  // Load pins from server
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
    try {
      const res = await fetch('/api/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pinData)
      });
      if (res.ok) {
        const newPin = await res.json();
        setBuildPins(prev => [...prev, newPin]);
        setSelectedPinId(newPin.id);
      }
    } catch (err) {
      console.error('Error creating pin:', err);
    }
  }, []);

  const handlePinSelect = useCallback((pinId) => {
    setSelectedPinId(pinId);
  }, []);

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
    if (!pinId) {
      alert('Por favor, selecciona un punto en el mapa primero para asociar el documento.');
      return;
    }

    setBuildUploading(true);
    setBuildUploadError(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/build/acc-upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      console.log('Build upload response:', data);

      // Add document to the selected PIN
      // Update pin with new document
      const pin = buildPins.find(p => p.id === pinId);
      if (pin) {
        const newDoc = {
          id: Date.now(),
          name: file.name,
          urn: data.urn,
          storageId: data.storage_id,
          versionId: data.version_id,
          itemId: data.item_id,
          // Use proxy URL for permanent access, fallback to blob for immediate local preview if needed
          url: `/api/images/proxy?storageId=${encodeURIComponent(data.storage_id)}`,
          status: 'processing',
          timestamp: new Date().toISOString()
        };

        const updatedDocuments = [...(pin.documents || []), newDoc];

        // Save to server
        const updateRes = await fetch(`/api/pins/${pinId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documents: updatedDocuments })
        });

        if (updateRes.ok) {
          const updatedPin = await updateRes.json();
          setBuildPins(prev => prev.map(p => p.id === pinId ? updatedPin : p));
        }
      }

    } catch (err) {
      console.error('Build upload error:', err);
      setBuildUploadError(err.message);
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
    setFilterSelections(prev => {
      const next = {};
      filterProperties.forEach(id => {
        if (prev[id]?.length) {
          next[id] = prev[id];
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
  }, [filterProperties]);

  const upsertModel = useCallback((model) => {
    if (!model?.urn) return;
    setModels(prev => {
      if (prev.some(entry => entry.urn === model.urn)) {
        return prev;
      }
      const label = model.name || `Model ${prev.length + 1}`;
      return [...prev, { ...model, label }];
    });
  }, []);

  const removeModel = useCallback((urn) => {
    setModels(prev => prev.filter(model => model.urn !== urn));
  }, []);

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

  const openBuildMap = useCallback(async (file) => {
    const lower = (file.name || '').toLowerCase();
    const isKml = lower.endsWith('.kml') || lower.endsWith('.kmz') || (file.type || '').includes('kml');
    if (!isKml) {
      alert('Selecciona un archivo KML o KMZ para verlo en Maps.');
      return;
    }
    try {
      const signedUrl = await fetchSignedRead(file);
      window.dispatchEvent(new CustomEvent('maps-open-google', {
        detail: {
          job: {
            status: 'ready',
            tileset_url: signedUrl || file.url
          }
        }
      }));
    } catch (err) {
      console.error('No se obtuvo signed URL, usando fallback.', err);
      const fallback = file.url;
      if (!fallback) {
        alert(err.message || 'No se pudo obtener URL firmada.');
        return;
      }
      window.dispatchEvent(new CustomEvent('maps-open-google', {
        detail: {
          job: {
            status: 'ready',
            tileset_url: fallback
          }
        }
      }));
    }
  }, [fetchSignedRead]);

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

  const filterBuckets = useMemo(
    () => buildFilterBuckets(modelProperties, selectedPropertyObjects),
    [modelProperties, selectedPropertyObjects]
  );

  const activeFilterDetail = useMemo(() => {
    const groups = [];
    const aggregated = new Set();
    Object.entries(filterSelections).forEach(([propId, values]) => {
      if (!values?.length) return;
      const bucket = filterBuckets[propId];
      if (!bucket) return;
      const uniqueDbIds = new Set();
      values.forEach(value => {
        const entry = bucket.valueIndex?.get(value);
        if (!entry) return;
        entry.dbIds.forEach(id => {
          uniqueDbIds.add(id);
          aggregated.add(id);
        });
      });
      if (!uniqueDbIds.size) return;
      groups.push({
        propId,
        name: bucket.meta?.name || propId,
        values,
        dbIds: Array.from(uniqueDbIds)
      });
    });
    return {
      groups,
      dbIds: Array.from(aggregated)
    };
  }, [filterSelections, filterBuckets]);

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

  return (
    <div className="app-container">
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
      </nav>

      <aside className={`app-sidebar ${panelVisible ? '' : 'hidden'}`}>
        {activePanel === 'filters' && (
          <div className="filters-shell">
            <header className="filters-shell-header">
              <div>
                <p className="filters-shell-title">Filters</p>
                <span className="filters-shell-subtitle">
                  {selectedPropertyObjects.length} parameters activos
                </span>
              </div>
              <div className="filters-shell-actions">
                <button
                  type="button"
                  className="icon-button"
                  title="Configurar filtros"
                  onClick={() => setFilterConfiguratorOpen(true)}
                >
                  <GearIcon />
                </button>
              </div>
            </header>
            <div className="filters-shell-body">
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
              {selectedPropertyObjects.map(prop => {
                const bucket = filterBuckets[prop.id];
                const selectedValues = filterSelections[prop.id] || [];
                const values = bucket
                  ? (expandedFilters[prop.id] ? bucket.values : bucket.values.slice(0, DEFAULT_VISIBLE_VALUES))
                  : [];
                const hasMore = bucket ? bucket.values.length > DEFAULT_VISIBLE_VALUES : false;
                return (
                  <div key={prop.id} className="filters-block">
                    <div className="filters-block-header">
                      <div className="filters-block-info">
                        <p className="filters-block-title">{prop.name}</p>
                        <span className="filters-block-path">{prop.path}</span>
                        <span className="filters-block-subcount">
                          {selectedValues.length} of {bucket?.values.length || 0}
                        </span>
                      </div>
                      <div className="filters-block-toolbar">
                        <button type="button" className="icon-button ghost" title="Buscar valores">
                          <SearchIcon />
                        </button>
                        <button type="button" className="icon-button ghost" title="Aislar en el modelo">
                          <TargetIcon />
                        </button>
                        <span className="filters-block-count">{bucket?.total || 0}</span>
                      </div>
                    </div>
                    {bucket && bucket.values.length ? (
                      <>
                        <ul className="filters-value-list">
                          {values.map(item => {
                            const checked = selectedValues.includes(item.value);
                            return (
                              <li key={item.value} className="filters-value-item">
                                <label className="filters-value-label">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => handleValueToggle(prop.id, item.value)}
                                  />
                                  <span>{item.value}</span>
                                </label>
                                <span className="filters-value-count">{item.count}</span>
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
                    ) : (
                      <div className="filters-block-empty">Sin datos todavía. Próximamente.</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {activePanel === 'files' && (
          <>
            <div className="source-files">
              <div className="source-header">
                <div>
                  <p className="source-title">Source Files</p>
                  <span className="source-count">{models.length} linked</span>
                </div>
                <button className="import-button" onClick={() => setImportModalOpen(true)}>+ Import Model</button>
              </div>
              <ul className="source-list">
                {models.length === 0 && <li className="source-empty">No models linked yet.</li>}
                {models.map(model => (
                  <li key={model.urn} className="source-item">
                    <div>
                      <span className="source-name">{model.label}</span>
                      <span className="source-sub">URN: {model.urn.slice(-8)}</span>
                    </div>
                    <button className="source-remove" onClick={() => removeModel(model.urn)} aria-label={`Remove ${model.label}`}>×</button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="tree-wrapper">
              <h4 className="tree-title">Browse Autodesk Docs</h4>
              <p className="tree-hint">Click an item to add it to the scene.</p>
              <NativeFileTree onFileSelect={upsertModel} />
            </div>
          </>
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
          />
        )}
      </aside>

      <div className="app-viewer">
        {activePanel === 'build' ? (
          <BuildMapView
            userLocation={userLocation}
            pins={buildPins}
            selectedPinId={selectedPinId}
            onPinCreated={handlePinCreated}
            onPinSelect={handlePinSelect}
            onPinDelete={handlePinDelete}
            onPinUpdate={handlePinUpdate}
            onFileUpload={handleBuildFileUpload}
          />
        ) : (
          <Viewer
            models={models}
            sprites={sprites}
            showSprites={showSprites}
            activeSpriteId={activeSpriteId}
            onSpriteSelect={handleSpriteSelect}
            onSpriteDelete={handleSpriteDelete}
            placementMode={spritePlacementActive}
            onPlacementComplete={handlePlacementComplete}
            onModelProperties={handleModelProperties}
          />
        )}
      </div>

      <ImportModelModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onConfirm={(model) => {
          upsertModel(model);
          setImportModalOpen(false);
        }}
      />

      <AddDocumentModal
        open={documentsModalOpen}
        onClose={() => setDocumentsModalOpen(false)}
        targetSpriteId={activeSpriteId}
        onConfirm={(items) => {
          addDocuments(items);
          setDocumentsModalOpen(false);
        }}
      />

      <FilterConfigurator
        open={filterConfiguratorOpen}
        availableProperties={availableProperties}
        selectedIds={filterProperties}
        onClose={() => setFilterConfiguratorOpen(false)}
        onSave={setFilterProperties}
        onReset={resetFiltersToDefault}
      />
    </div>
  );
}

export default App;
