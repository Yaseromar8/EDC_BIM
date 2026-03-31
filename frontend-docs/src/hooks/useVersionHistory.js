/**
 * useVersionHistory.js — Hook de historial de versiones y promoción
 * Refactorización Fase 1: Capa de Datos
 * Extraído de App.jsx líneas 1050-1288
 */
import { useState, useEffect } from 'react';
import { apiFetch } from '../utils/apiFetch';
import { API } from '../utils/helpers';
import toast from 'react-hot-toast';

export function useVersionHistory(projectPrefix, user, { onRefresh } = {}) {
  const [versionHistory, setVersionHistory] = useState([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedVersions, setSelectedVersions] = useState(new Set());
  const [versionRowMenu, setVersionRowMenu] = useState(null);
  const [tableShowVersions, setTableShowVersions] = useState(false);
  const [versionPanelWidth, setVersionPanelWidth] = useState(450);
  const [versionAnchor, setVersionAnchor] = useState({ x: 0, y: 0 });
  const [versionTarget, setVersionTarget] = useState(null);

  const fetchVersionHistory = async (item) => {
    setLoadingVersions(true);
    setVersionHistory([]);
    try {
      const resp = await apiFetch(`${API}/api/docs/versions?id=${item.id || encodeURIComponent(item.fullName)}&model_urn=${encodeURIComponent(projectPrefix)}`);
      const data = await resp.json();
      if (data.success) setVersionHistory(data.versions || []);
    } catch (e) { console.error(e); }
    finally { setLoadingVersions(false); }
  };

  const handlePromote = async (version, activeFile) => {
    const target = versionTarget || activeFile;
    if (!target) return;
    
    try {
      const resp = await apiFetch(`${API}/api/docs/versions/promote`, {
        method: 'POST',
        body: JSON.stringify({ id: target.id, version_id: version.id, user: user?.name, model_urn: projectPrefix })
      });
      if (resp.ok) {
        setTableShowVersions(false);
        if (onRefresh) onRefresh();
        alert(`Versión ${version.version_number} promocionada exitosamente.`);
      } else {
        const error = await resp.json();
        alert(`Error al promocionar: ${error.error || 'Desconocido'}`);
      }
    } catch (e) { console.error(e); }
  };

  const onShowVersions = (f, e) => {
    setVersionTarget(f);
    setTableShowVersions(true);
    setVersionAnchor({ x: e.clientX - 350, y: Math.min(e.clientY, window.innerHeight - 400) });
    fetchVersionHistory(f);
  };

  return {
    versionHistory, setVersionHistory,
    loadingVersions,
    selectedVersions, setSelectedVersions,
    versionRowMenu, setVersionRowMenu,
    tableShowVersions, setTableShowVersions,
    versionPanelWidth, setVersionPanelWidth,
    versionAnchor,
    versionTarget, setVersionTarget,
    fetchVersionHistory,
    handlePromote,
    onShowVersions,
  };
}
