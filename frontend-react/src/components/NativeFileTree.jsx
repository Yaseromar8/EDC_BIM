import React, { useState, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import './NativeFileTree.css';

const BACKEND_URL = Capacitor.isNativePlatform()
    ? 'https://visor-ecd-backend.onrender.com'
    : (import.meta.env.VITE_BACKEND_URL || '');

const API_ENDPOINTS = {
    hubs: `${BACKEND_URL}/api/hubs`,
    projects: (hubId) => `${BACKEND_URL}/api/hubs/${hubId}/projects`,
    topFolders: (hubId, projectId) => `${BACKEND_URL}/api/hubs/${hubId}/projects/${projectId}/topFolders`,
    folderContents: (projectId, folderId) => `${BACKEND_URL}/api/projects/${projectId}/folders/${folderId}/contents`,
    itemVersions: (projectId, itemId) => `${BACKEND_URL}/api/projects/${projectId}/items/${itemId}/versions`,
};

// Custom hook for fetching data
const useFetch = (url) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!url) return;
        const fetchData = async () => {
            try {
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
                const json = await res.json();
                setData(json.data);
            } catch (e) {
                setError(e);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [url]);

    return { data, error, loading };
};

const TreeNode = ({ node, selectedFiles, onFileSelect, hubId, projectId: contextProjectId }) => {
    const [isOpen, setIsOpen] = useState(false);
    let url = null;
    if (isOpen) {
        switch (node.type) {
            case 'hubs':
                url = API_ENDPOINTS.projects(node.id);
                break;
            case 'projects':
                url = API_ENDPOINTS.topFolders(hubId, node.id);
                break;
            case 'folders':
                const pid = contextProjectId || node.links.self.href.match(/projects\/(b\.[a-zA-Z0-9\-_]+)/)?.[1];
                url = API_ENDPOINTS.folderContents(pid, node.id);
                break;
            case 'items':
                const itemPid = contextProjectId || node.links.self.href.match(/projects\/(b\.[a-zA-Z0-9\-_]+)/)?.[1];
                url = API_ENDPOINTS.itemVersions(itemPid, node.id);
                break;
            default: break;
        }
    }

    const { data: children, error, loading } = useFetch(url);
    const isFolder = node.type !== 'items' && node.type !== 'versions';

    const handleToggle = () => {
        if (isFolder) {
            setIsOpen(!isOpen);
        }
    };

    const handleCheck = async (e) => {
        e.stopPropagation();
        if (isFolder) return;

        const projectMatch = node.links.self.href.match(/projects\/(b\.[a-zA-Z0-9\-_]+)/);
        const pid = contextProjectId || (projectMatch ? projectMatch[1] : null);
        if (!pid) return;

        const isSelected = selectedFiles.some(f => f.itemId === node.id);

        if (isSelected) {
            onFileSelect(node.id, null);
        } else {
            const versionsUrl = API_ENDPOINTS.itemVersions(pid, node.id);
            try {
                const res = await fetch(versionsUrl);
                const json = await res.json();
                if (!json.data || !json.data.length) return;

                const sortedVersions = json.data.sort((a, b) => b.attributes.versionNumber - a.attributes.versionNumber);
                const latestVersion = sortedVersions[0];
                const versionUrn = latestVersion.id;
                const urn = btoa(versionUrn).replace(/=+$/, '');

                onFileSelect(node.id, {
                    urn,
                    name: node.attributes.displayName,
                    itemId: node.id,
                    versionId: latestVersion.id,
                    projectId: pid,
                    versionNumber: latestVersion.attributes.versionNumber,
                    lastModifiedTime: latestVersion.attributes.lastModifiedTime,
                    webView: latestVersion.links?.webView || null
                });
            } catch (e) {
                console.error('Error fetching version:', e);
            }
        }
    };

    const isChecked = selectedFiles.some(f => f.itemId === node.id);

    const getIcon = () => {
        switch (node.type) {
            case 'hubs': return 'fas fa-building';
            case 'projects': return 'fas fa-project-diagram';
            case 'folders': return isOpen ? 'fas fa-folder-open' : 'fas fa-folder';
            case 'items': {
                const name = (node.attributes.displayName || '').toLowerCase();
                if (name.endsWith('.rvt')) return 'fas fa-cube';
                if (name.endsWith('.pdf')) return 'fas fa-file-pdf';
                if (name.endsWith('.dwg')) return 'fas fa-drafting-compass';
                return 'fas fa-file-alt';
            }
            default: return 'fas fa-circle';
        }
    };

    return (
        <li style={{ listStyle: 'none' }}>
            <div className={`tree-node-row ${isOpen ? 'is-open' : ''}`} style={{ padding: '6px 4px', borderRadius: '4px', display: 'flex', alignItems: 'center', transition: 'background 0.2s' }}>
                <span onClick={handleToggle} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    {isFolder ? (
                        <i className={`fas fa-caret-${isOpen ? 'down' : 'right'}`} style={{ width: '16px', fontSize: '12px', opacity: 0.5 }}></i>
                    ) : (
                        <span style={{ width: '16px' }}></span>
                    )}

                    {!isFolder && (
                        <div
                            onClick={handleCheck}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '16px',
                                height: '16px',
                                borderRadius: '3px',
                                border: `1.5px solid ${isChecked ? '#3aa0ff' : '#555'}`,
                                background: isChecked ? '#3aa0ff' : 'transparent',
                                marginRight: '8px',
                                cursor: 'pointer',
                                flexShrink: 0,
                            }}
                        >
                            {isChecked && (
                                <svg viewBox="0 0 24 24" width="12" height="12">
                                    <path fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" d="M6,11.3 L10.3,16 L18,6.2" />
                                </svg>
                            )}
                        </div>
                    )}

                    <i className={getIcon()} style={{ marginRight: '8px', color: isFolder ? '#FFC107' : (isChecked ? '#3aa0ff' : '#aaa'), fontSize: '14px' }}></i>
                    <span style={{ fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: isFolder ? 0.9 : 0.8 }}>
                        {node.attributes.displayName || node.attributes.name}
                    </span>
                </span>
            </div>
            {isOpen && (
                <ul style={{ paddingLeft: '18px', borderLeft: '1px solid rgba(255,255,255,0.05)', marginLeft: '8px' }}>
                    {loading && <li style={{ padding: '4px 0', fontSize: '11px', color: '#666' }}><i className="fas fa-spinner fa-spin"></i> Cargando...</li>}
                    {!loading && children && children.length === 0 && (
                        <li style={{ padding: '4px 8px', fontSize: '11px', color: '#555' }}>Vacio</li>
                    )}
                    {children && children.map(child => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            selectedFiles={selectedFiles}
                            onFileSelect={onFileSelect}
                            hubId={node.type === 'hubs' ? node.id : hubId}
                            projectId={contextProjectId}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
};

const NativeFileTree = ({ onSelectionChange, forcedHubId, forcedProjectId, onFileSelect: singleSelect }) => {
    // If singleSelect is provided, we only allow one file selection at a time
    let initialUrl = API_ENDPOINTS.hubs;
    if (forcedHubId && forcedProjectId) {
        initialUrl = API_ENDPOINTS.topFolders(forcedHubId, forcedProjectId);
    }

    const { data: initialData, error, loading } = useFetch(initialUrl);
    const [selectedFiles, setSelectedFiles] = useState([]);

    const handleFileSelect = (itemId, fileData) => {
        if (singleSelect) {
            // Single Selection Mode for specialized modals (like linking a pin)
            if (fileData) {
                setSelectedFiles([fileData]);
                singleSelect(fileData);
            } else {
                setSelectedFiles([]);
                singleSelect(null);
            }
            return;
        }

        if (fileData) {
            setSelectedFiles(prev => [...prev.filter(f => f.itemId !== itemId), fileData]);
        } else {
            setSelectedFiles(prev => prev.filter(f => f.itemId !== itemId));
        }
    };

    useEffect(() => {
        onSelectionChange?.(selectedFiles);
    }, [selectedFiles, onSelectionChange]);

    if (loading) return <div style={{ padding: '20px', color: '#666', fontSize: '13px' }}><i className="fas fa-spinner fa-spin"></i> Cargando navegador...</div>;
    if (error) return <div style={{ padding: '20px', color: '#e74c3c', fontSize: '13px' }}>Error al cargar datos de Autodesk.</div>;

    return (
        <div className="native-file-tree-container" style={{ color: '#ccc' }}>
            <ul className="native-file-tree" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {forcedProjectId && initialData ? (
                    initialData.map(folder => (
                        <TreeNode
                            key={folder.id}
                            node={folder}
                            selectedFiles={selectedFiles}
                            onFileSelect={handleFileSelect}
                            hubId={forcedHubId}
                            projectId={forcedProjectId}
                        />
                    ))
                ) : (
                    initialData && initialData.map(hub => (
                        <TreeNode
                            key={hub.id}
                            node={hub}
                            selectedFiles={selectedFiles}
                            onFileSelect={handleFileSelect}
                            hubId={hub.id}
                        />
                    ))
                )}
            </ul>
        </div>
    );
};


export default NativeFileTree;
