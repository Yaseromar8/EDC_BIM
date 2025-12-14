
import React, { useEffect, useRef } from 'react';

const SecondaryViewer = ({ document, node }) => {
    const containerRef = useRef(null);
    const viewerRef = useRef(null);

    useEffect(() => {
        if (!window.Autodesk || !containerRef.current) return;

        // Initialize a new GUI Viewer instance (Headless would lack toolbar)
        // We use the same Initializer as the main app (assumed running).
        const viewer = new Autodesk.Viewing.GuiViewer3D(containerRef.current, {
            startOnInitialize: false,
            // Extensions that make sense for 2D
            extensions: ['Autodesk.DocumentBrowser']
        });

        viewer.start();
        viewerRef.current = viewer;

        // Optimize for 2D
        viewer.setTheme('light-theme'); // Usually better for sheets

        // Handle Resizing automatically
        const resizeObserver = new ResizeObserver(() => {
            if (viewerRef.current) {
                viewerRef.current.resize();
            }
        });
        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
            if (viewerRef.current) {
                viewerRef.current.finish();
                viewerRef.current = null;
            }
        };
    }, []);

    // Load the Document/Node when props change
    useEffect(() => {
        const viewer = viewerRef.current;
        if (viewer && document && node) {
            console.log('[SecondaryViewer] Loading node:', node.data.name);

            // Unload previous model if any? 
            // loadDocumentNode adds to the scene if aggregated view is supported, 
            // but for sheets usually replaces.
            // Explicit unload is safer for a "Single Sheet View"
            if (viewer.model) {
                viewer.unloadModel(viewer.model);
            }

            viewer.loadDocumentNode(document, node).then(model => {
                console.log('[SecondaryViewer] Sheet loaded');
                // Fit to view
                // viewer.autocam.shotParams.destinationPercent = 1;
                // viewer.fitToView();
            }).catch(err => console.error('Failed to load sheet:', err));
        }
    }, [document, node]);

    return (
        <div
            ref={containerRef}
            className="secondary-viewer"
            style={{ width: '100%', height: '100%', position: 'relative', background: '#f0f0f0' }}
        />
    );
};

export default SecondaryViewer;
