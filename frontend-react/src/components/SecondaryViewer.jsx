
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

    const [toolsVisible, setToolsVisible] = React.useState(false);

    // ... (rest of effects)

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div
                ref={containerRef}
                className={`secondary-viewer ${toolsVisible ? 'mobile-tools-visible' : 'mobile-tools-hidden'}`}
                style={{ width: '100%', height: '100%', position: 'relative', background: '#f0f0f0' }}
            />
            {/* Toggle Button for Mobile */}
            <button
                className="mobile-tools-toggle"
                onClick={() => setToolsVisible(prev => !prev)}
                title={toolsVisible ? "Hide Tools" : "Show Tools"}
            >
                {toolsVisible ? (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                ) : (
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></svg>
                )}
            </button>
        </div>
    );
};

export default SecondaryViewer;
