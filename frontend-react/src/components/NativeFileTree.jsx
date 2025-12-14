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

const TreeNode = ({ node, onFileSelect, hubId }) => {
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
                const projectId = node.links.self.href.match(/projects\/(b\.[a-zA-Z0-9\-_]+)/)[1];
                url = API_ENDPOINTS.folderContents(projectId, node.id);
                break;
            case 'items':
                const projId = node.links.self.href.match(/projects\/(b\.[a-zA-Z0-9\-_]+)/)[1];
                url = API_ENDPOINTS.itemVersions(projId, node.id);
                break;
            default:
                break;
        }
    }

    const { data: children, error, loading } = useFetch(url);

    const isFolder = node.type !== 'items' && node.type !== 'versions';

    const handleToggle = async () => {
        if (isFolder) {
            setIsOpen(!isOpen);
            return;
        }
        const projectMatch = node.links.self.href.match(/projects\/(b\.[a-zA-Z0-9\-_]+)/);
        const projectId = projectMatch ? projectMatch[1] : null;
        if (!projectId) return;
        const versionsUrl = API_ENDPOINTS.itemVersions(projectId, node.id);
        try {
            const res = await fetch(versionsUrl);
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            const json = await res.json();
            if (!json.data || !json.data.length) return;

            // Sort versions by versionNumber descending to ensure we get the latest
            const sortedVersions = json.data.sort((a, b) => {
                const vA = a.attributes.versionNumber;
                const vB = b.attributes.versionNumber;
                return vB - vA;
            });

            const latestVersion = sortedVersions[0];
            const versionUrn = latestVersion.id;
            const urn = btoa(versionUrn).replace(/=+$/, '');
            const label = node.attributes.displayName || latestVersion.attributes?.displayName || latestVersion.attributes?.name;

            console.log(`[NativeFileTree] Selected Latest Version: v${latestVersion.attributes.versionNumber} (ID: ${versionUrn})`);

            onFileSelect?.({
                urn,
                name: label || `Modelo ${node.id}`,
                itemId: node.id,
                versionId: latestVersion.id,
                projectId,
                webView: latestVersion.links?.webView || null
            });
        } catch (e) {
            console.error('Error fetching versions:', e);
        }
    };

    const getIcon = () => {
        switch (node.type) {
            case 'hubs': return 'fas fa-server';
            case 'projects': return 'fas fa-archive';
            case 'folders': return isOpen ? 'fas fa-folder-open' : 'fas fa-folder';
            case 'items': return 'fas fa-file-alt';
            default: return 'fas fa-question-circle';
        }
    };

    return (
        <li>
            <div onClick={handleToggle} style={{ cursor: 'pointer' }}>
                <i className={getIcon()} style={{ marginRight: '5px' }}></i>
                {node.attributes.displayName || node.attributes.name}
            </div>
            {isOpen && (
                <ul style={{ paddingLeft: '20px' }}>
                    {loading && <li>Loading...</li>}
                    {error && <li>Error loading data.</li>}
                    {children && children.map(child => (
                        <TreeNode key={child.id} node={child} onFileSelect={onFileSelect} hubId={node.type === 'hubs' ? node.id : hubId} />
                    ))}
                </ul>
            )}
        </li>
    );
};

const NativeFileTree = ({ onFileSelect }) => {
    const { data: hubs, error, loading } = useFetch(API_ENDPOINTS.hubs);

    return (
        <ul className="native-file-tree">
            {loading && <li>Loading hubs...</li>}
            {error && <li>Error loading hubs.</li>}
            {hubs && hubs.map(hub => (
                <TreeNode key={hub.id} node={hub} onFileSelect={onFileSelect} hubId={hub.id} />
            ))}
        </ul>
    );
};

export default NativeFileTree;
