
import React, { useEffect, useRef } from 'react';

const SecondaryViewer = ({ document, node, urn }) => {
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
        if (!viewer) return;

        // CASE 1: Document + Node passed directly
        if (document && node) {
            console.log('[SecondaryViewer] Loading node:', node.data.name);
            if (viewer.model) viewer.unloadModel(viewer.model);
            viewer.loadDocumentNode(document, node).then(() => {
                console.log('[SecondaryViewer] Sheet loaded from Node');
            }).catch(err => console.error('Failed to load sheet:', err));
            return;
        }

        // CASE 2: URN passed (Load document then default viewable)
        if (urn) {
            const documentId = 'urn:' + urn;
            Autodesk.Viewing.Document.load(documentId, (doc) => {
                const rootItem = doc.getRoot();
                const viewables = rootItem.search({ type: 'geometry', role: '2d' });
                if (viewables.length === 0) {
                    console.warn('[SecondaryViewer] No 2D viewables found for URN');
                    return;
                }
                // Load the first 2D viewable (Sheet)
                const viewable = viewables[0];
                if (viewer.model) viewer.unloadModel(viewer.model);
                viewer.loadDocumentNode(doc, viewable).then(() => {
                    console.log('[SecondaryViewer] Sheet loaded from URN');
                });
            }, (errorCode, errorMsg) => {
                console.error('[SecondaryViewer] Load Error:', errorCode, errorMsg);
            });
        }

    }, [document, node, urn]);

    return (
        <div
            ref={containerRef}
            className="secondary-viewer"
            style={{ width: '100%', height: '100%', position: 'relative', background: '#f0f0f0' }}
        />
    );
};

export default SecondaryViewer;
