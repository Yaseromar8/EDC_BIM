import React, { useState, useEffect } from 'react';

const API_ENDPOINTS = {
    hubs: '/api/hubs',
    projects: (hubId) => `/api/hubs/${hubId}/projects`,
    topFolders: (hubId, projectId) => `/api/hubs/${hubId}/projects/${projectId}/topFolders`,
    folderContents: (projectId, folderId) => `/api/projects/${projectId}/folders/${folderId}/contents`,
    itemVersions: (projectId, itemId) => `/api/projects/${projectId}/items/${itemId}/versions`,
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

const TreeNode = ({ node, selectedFiles, onFileSelect, hubId }) => {
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
                let projectId = null;
                try {
                    const match = node.links.self.href.match(/projects\/(b\.[a-zA-Z0-9\-_]+)/);
                    if (match) {
                        projectId = match[1];
                    } else if (node.links.self.href.includes('folders')) {
                        const pMatch = node.links.self.href.match(/projects\/([a-zA-Z0-9\.\-_]+)\/folders/);
                        if (pMatch) projectId = pMatch[1];
                    }
                } catch (e) { }
                url = API_ENDPOINTS.folderContents(projectId, node.id);
                break;
            case 'items':
                const projId = node.links.self.href.match(/projects\/(b\.[a-zA-Z0-9\-_]+)/)[1];
                url = API_ENDPOINTS.itemVersions(projId, node.id);
                break;
            default: break;
        }
    }

    const { data: children, error, loading } = useFetch(url);
    const isFolder = node.type !== 'items' && node.type !== 'versions';

    const handleToggle = async () => {
        if (isFolder) {
            setIsOpen(!isOpen);
            return;
        }
    };

    const handleCheck = async (e) => {
        e.stopPropagation();
        if (isFolder) return;

        // Fetch details if checking an item (to get version)
        const projectMatch = node.links.self.href.match(/projects\/(b\.[a-zA-Z0-9\-_]+)/);
        const projectId = projectMatch ? projectMatch[1] : null;
        if (!projectId) return;

        // If explicitly checking, we need the version details.
        // Optimization: If unchecking, we don't need to fetch.
        const isSelected = selectedFiles.some(f => f.itemId === node.id);

        if (isSelected) {
            // Uncheck
            onFileSelect(node.id, null);
        } else {
            // Check - need to fetch latest version
            const versionsUrl = API_ENDPOINTS.itemVersions(projectId, node.id);
            try {
                const res = await fetch(versionsUrl);
                const json = await res.json();
                if (!json.data || !json.data.length) return;

                const sortedVersions = json.data.sort((a, b) => b.attributes.versionNumber - a.attributes.versionNumber);
                const latestVersion = sortedVersions[0];
                const versionUrn = latestVersion.id;
                const urn = btoa(versionUrn).replace(/=+$/, '');
                const label = node.attributes.displayName;

                onFileSelect(node.id, {
                    urn,
                    name: label,
                    itemId: node.id,
                    versionId: latestVersion.id,
                    projectId: projectId,
                    versionNumber: latestVersion.attributes.versionNumber,
                    lastModifiedTime: latestVersion.attributes.lastModifiedTime,
                    webView: latestVersion.links?.webView || null
                });
            } catch (e) {
                console.error('Error fetching version for check:', e);
            }
        }
    };

    const isChecked = selectedFiles.some(f => f.itemId === node.id);

    const getIcon = () => {
        switch (node.type) {
            case 'hubs': return 'fas fa-server';
            case 'projects': return 'fas fa-archive';
            case 'folders': return isOpen ? 'fas fa-folder-open' : 'fas fa-folder';
            case 'items': return 'fas fa-file-alt'; // Revit icon replacement
            default: return 'fas fa-question-circle';
        }
    };

    return (
        <li>
            <div className="tree-node-row">
                <span onClick={handleToggle} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    {isFolder ? (
                        <i className={`fas fa-caret-${isOpen ? 'down' : 'right'}`} style={{ width: '15px' }}></i>
                    ) : (
                        <span style={{ width: '15px' }}></span>
                    )}

                    {!isFolder && (
                        <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={handleCheck}
                            style={{ marginRight: '8px', cursor: 'pointer' }}
                        />
                    )}

                    <i className={getIcon()} style={{ marginRight: '5px', color: isFolder ? '#FFC107' : '#2196F3' }}></i>
                    {node.attributes.displayName || node.attributes.name}
                </span>
            </div>
            {isOpen && (
                <ul style={{ paddingLeft: '20px' }}>
                    {loading && <li><small>Loading...</small></li>}
                    {children && children.map(child => (
                        <TreeNode
                            key={child.id}
                            node={child}
                            selectedFiles={selectedFiles}
                            onFileSelect={onFileSelect}
                            hubId={node.type === 'hubs' ? node.id : hubId}
                        />
                    ))}
                </ul>
            )}
        </li>
    );
};

const NativeFileTree = ({ onSelectionChange, forcedHubId, forcedProjectId }) => {
    // If we have a forced project, we start fetching folders for it immediately.
    // Otherwise we fetch hubs list.

    // Determine initial URL
    let initialUrl = API_ENDPOINTS.hubs;
    if (forcedHubId && forcedProjectId) {
        initialUrl = API_ENDPOINTS.topFolders(forcedHubId, forcedProjectId);
    }

    const { data: initialData, error, loading } = useFetch(initialUrl);
    const [selectedFiles, setSelectedFiles] = useState([]);

    const handleFileSelect = (itemId, fileData) => {
        if (fileData) {
            setSelectedFiles(prev => [...prev.filter(f => f.itemId !== itemId), fileData]);
        } else {
            setSelectedFiles(prev => prev.filter(f => f.itemId !== itemId));
        }
    };

    useEffect(() => {
        onSelectionChange?.(selectedFiles);
    }, [selectedFiles, onSelectionChange]);

    if (loading) return <div style={{ padding: 10, color: '#aaa' }}>Loading...</div>;
    if (error) return <div style={{ padding: 10, color: '#f55' }}>Error loading data.</div>;

    return (
        <ul className="native-file-tree" style={{ listStyle: 'none', padding: 0 }}>
            {/* If controlled Project mode, render folder nodes directly */}
            {forcedProjectId && initialData ? (
                initialData.map(folder => (
                    <TreeNode
                        key={folder.id}
                        node={folder}
                        selectedFiles={selectedFiles}
                        onFileSelect={handleFileSelect}
                        hubId={forcedHubId} // Pass down context
                    />
                ))
            ) : (
                /* Standard Hubs mode */
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
    );
};

export default NativeFileTree;
