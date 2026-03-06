import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import './PdfViewer.css';

// Ensure worker is configured (same as DocPinPanel)
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PdfViewer = ({ url, onClose }) => {
    const [numPages, setNumPages] = useState(null);
    const [pageNumber, setPageNumber] = useState(1);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
    const [lastPinchDist, setLastPinchDist] = useState(null);
    const [lastTouchPos, setLastTouchPos] = useState(null);

    const containerRef = useRef(null);
    const wrapperRef = useRef(null);

    const onDocumentLoadSuccess = ({ numPages }) => {
        setNumPages(numPages);
        // Reset view on new document
        setScale(1);
        setOffset({ x: 0, y: 0 });
    };

    // Panning logic
    const handleMouseDown = (e) => {
        // Allow middle mouse (button 1) and left mouse (button 0)
        if (e.button !== 0 && e.button !== 1) return;
        if (e.button === 1) e.preventDefault(); // Prevent autoscroll
        setIsDragging(true);
        setLastMousePos({ x: e.clientX, y: e.clientY });
    };

    const handleDoubleClick = () => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
    };

    const handleMouseMove = useCallback((e) => {
        if (!isDragging) return;

        const dx = e.clientX - lastMousePos.x;
        const dy = e.clientY - lastMousePos.y;

        setOffset(prev => ({
            x: prev.x + dx,
            y: prev.y + dy
        }));
        setLastMousePos({ x: e.clientX, y: e.clientY });
    }, [isDragging, lastMousePos]);

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    // Touch logic (Panning & Pinch-to-zoom)
    const handleTouchStart = (e) => {
        if (e.touches.length === 1) {
            setIsDragging(true);
            setLastTouchPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
        } else if (e.touches.length === 2) {
            setIsDragging(false);
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            setLastPinchDist(dist);

            const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            setLastTouchPos({ x: cx, y: cy });
        }
    };

    const handleTouchMove = useCallback((e) => {
        // Prevent default browser behavior (scroll/pull-to-refresh) during interaction
        if (e.cancelable) e.preventDefault();

        if (e.touches.length === 1 && isDragging && lastTouchPos) {
            const dx = e.touches[0].clientX - lastTouchPos.x;
            const dy = e.touches[0].clientY - lastTouchPos.y;

            setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            setLastTouchPos({ x: e.touches[0].clientX, y: e.touches[0].clientY });
        } else if (e.touches.length === 2 && lastPinchDist !== null && lastTouchPos !== null) {
            const dist = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );

            const zoomSpeed = 0.005; // Pinch sensitivity
            const delta = dist - lastPinchDist;
            const factor = Math.exp(delta * zoomSpeed);

            const newScale = Math.min(Math.max(scale * factor, 0.1), 20);

            if (newScale !== scale) {
                const rect = containerRef.current.getBoundingClientRect();
                const mouseX = lastTouchPos.x - rect.left;
                const mouseY = lastTouchPos.y - rect.top;

                setOffset(prev => ({
                    x: mouseX - (mouseX - prev.x) * (newScale / scale),
                    y: mouseY - (mouseY - prev.y) * (newScale / scale)
                }));

                setScale(newScale);
            }
            setLastPinchDist(dist);
        }
    }, [isDragging, lastTouchPos, lastPinchDist, scale]);

    const handleTouchEnd = () => {
        setIsDragging(false);
        setLastPinchDist(null);
        setLastTouchPos(null);
    };

    // Zoom logic (towards cursor)
    const handleWheel = (e) => {
        e.preventDefault();

        const zoomSpeed = 0.001;
        const delta = -e.deltaY;
        const factor = Math.exp(delta * zoomSpeed);

        const newScale = Math.min(Math.max(scale * factor, 0.1), 20);

        if (newScale === scale) return;

        // Calculate cursor position relative to the wrapper
        const rect = containerRef.current.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // To zoom towards cursor:
        // offset_new = mouse_pos - (mouse_pos - offset_old) * (scale_new / scale_old)
        setOffset(prev => ({
            x: mouseX - (mouseX - prev.x) * (newScale / scale),
            y: mouseY - (mouseY - prev.y) * (newScale / scale)
        }));

        setScale(newScale);
    };

    useEffect(() => {
        const container = containerRef.current;
        if (container) {
            container.addEventListener('wheel', handleWheel, { passive: false });
            // Add touchmove with passive false to allow preventDefault
            container.addEventListener('touchmove', handleTouchMove, { passive: false });
        }
        return () => {
            if (container) {
                container.removeEventListener('wheel', handleWheel);
                container.removeEventListener('touchmove', handleTouchMove);
            }
        };
    }, [scale, offset, handleTouchMove]);

    return (
        <div className="pdf-viewer-container"
            ref={containerRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onDoubleClick={handleDoubleClick}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
            <div
                className="pdf-viewer-wrapper"
                ref={wrapperRef}
                style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    transformOrigin: '0 0',
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                }}
            >
                <Document
                    file={url}
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={<div className="pdf-loading">Cargando PDF...</div>}
                >
                    {Array.from(new Array(numPages), (el, index) => (
                        <Page
                            key={`page_${index + 1}`}
                            pageNumber={index + 1}
                            renderTextLayer={true}
                            renderAnnotationLayer={true}
                            className="pdf-page"
                            loading=""
                        />
                    ))}
                </Document>
            </div>

            {/* Pagination / Basic Controls if multi-page */}
            {numPages > 1 && (
                <div className="pdf-viewer-controls" onMouseDown={e => e.stopPropagation()}>
                    <span>Página {pageNumber} de {numPages}</span>
                    <button onClick={() => setPageNumber(prev => Math.max(prev - 1, 1))}>Anterior</button>
                    <button onClick={() => setPageNumber(prev => Math.min(prev + 1, numPages))}>Siguiente</button>
                </div>
            )}

            {/* Zoom Indicator */}
            <div className="pdf-zoom-badge">
                {(scale * 100).toFixed(0)}%
            </div>
        </div>
    );
};

export default PdfViewer;
