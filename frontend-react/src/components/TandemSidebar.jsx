import React, { useState, useEffect, useRef } from 'react';
import TandemFilterPanel from './TandemFilterPanel';
import SourceFilesPanel from './SourceFilesPanel';
import DocumentPanel from './DocumentPanel';
import DiscoverySearchPanel from './DiscoverySearchPanel';
import BuildPanel from './BuildPanel';

import DocsPanel from './DocsPanel';


const TandemSidebar = ({
    activePanel,
    panelVisible,
    sidebarWidth,
    setSidebarWidth,
    models,
    hiddenModelUrns,
    dynamicFilterBuckets,
    filterSelections,
    filterColors,
    expandedFilters,
    facetSearch,
    visiblePropertyObjects,
    hasMoreProperties,
    handleToggleModelVisibility,
    togglePropertyAll,
    handleValueToggle,
    toggleColor,
    setFilterConfiguratorOpen,
    setFilterSelections,
    setHiddenModelUrns,
    setExpandedFilters,
    setFacetSearch,
    setVisiblePropertiesCount,
    PALETTE,
    DEFAULT_VISIBLE_VALUES,

    // SourceFilesPanel props
    modelViews,
    activeViewableGuids,
    handleLoadSpecificView,
    handleModelUpdate,
    removeModel,
    setRelinkTargetModel,
    setImportModalOpen,
    extractionJobs,
    availableUpdates,
    updateCheckStatus,

    // DocumentPanel props
    documents,
    sprites,
    activeSpriteId,
    showSprites,
    spritePlacementActive,
    handleSpriteSelect,
    setDocumentsModalOpen,
    removeDocument,
    toggleSpritesVisibility,
    requestSpritePlacement,

    onOpenDocument,
    onCloseUniversalSearch,
    onUniversalSearch,

    // BuildPanel Props
    trackingData,
    onTrackingPinClick,
    onTrackingPinDelete,
    onTrackingPlacementToggle,
    trackingPlacementMode,
    selectedPinId,
    onCameraCapture,
    onPinMoveRequest, // New Prop
    BACKEND_URL,

    selectedElement
}) => {
    // === Variables para Panel Redimensionable ===
    // sidebarWidth + setSidebarWidth ahora vienen como props desde App.jsx
    const isResizing = useRef(false);
    const startX = useRef(0);
    const startWidth = useRef(350);

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing.current) return;
            // Calculamos el movimiento del ratón
            const delta = e.clientX - startX.current;
            // Limites de expansión del panel: Mínimo 280px, Máximo 1000px
            const newWidth = Math.max(280, Math.min(1000, startWidth.current + delta));
            setSidebarWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (isResizing.current) {
                isResizing.current = false;
                document.body.style.cursor = 'default';
                document.body.style.userSelect = 'auto'; // Restaurar selección
            }
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    const handleMouseDown = (e) => {
        e.preventDefault();
        isResizing.current = true;
        startX.current = e.clientX;
        startWidth.current = sidebarWidth;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none'; // Evitar seleccionar texto azul al arrastrar
    };

    const isLogicallyVisible = panelVisible && activePanel && activePanel !== 'views' && activePanel !== 'inventory';

    return (
        <aside 
            className={`app-sidebar`}
            style={{ 
                width: `${sidebarWidth}px`, 
                zIndex: 40,
                display: isLogicallyVisible ? 'flex' : 'none', // Ocultamiento duro
                flexShrink: 0,
                // === Estética Tandem (Transparente + Glassmorphism) ===
                backgroundColor: 'rgba(25, 25, 25, 0.65)', 
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)', // Para safari
                borderRight: '1px solid rgba(255,255,255,0.05)'
            }}
        >
            {/* Manija de Arrastre (Resizer Handle) */}
            <div
                className="sidebar-resizer"
                onMouseDown={handleMouseDown}
                style={{
                    position: 'absolute',
                    top: 0,
                    right: '-3px',
                    width: '6px',
                    height: '100%',
                    cursor: 'col-resize',
                    zIndex: 100,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => { e.target.style.backgroundColor = 'rgba(74, 144, 226, 0.8)'; e.target.style.width = '8px'; }}
                onMouseLeave={(e) => { e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; e.target.style.width = '6px'; }}
            />
            {activePanel === 'filters' && (
                <TandemFilterPanel
                    models={models}
                    hiddenModelUrns={hiddenModelUrns}
                    dynamicFilterBuckets={dynamicFilterBuckets}
                    filterSelections={filterSelections}
                    filterColors={filterColors}
                    expandedFilters={expandedFilters}
                    facetSearch={facetSearch}
                    visiblePropertyObjects={visiblePropertyObjects}
                    hasMoreProperties={hasMoreProperties}
                    handleToggleModelVisibility={handleToggleModelVisibility}
                    togglePropertyAll={togglePropertyAll}
                    handleValueToggle={handleValueToggle}
                    toggleColor={toggleColor}
                    setFilterConfiguratorOpen={setFilterConfiguratorOpen}
                    setFilterSelections={setFilterSelections}
                    setHiddenModelUrns={setHiddenModelUrns}
                    setExpandedFilters={setExpandedFilters}
                    setFacetSearch={setFacetSearch}
                    setVisiblePropertiesCount={setVisiblePropertiesCount}
                    PALETTE={PALETTE}
                    DEFAULT_VISIBLE_VALUES={DEFAULT_VISIBLE_VALUES}
                />
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
                    onRelink={(model) => {
                        setRelinkTargetModel(model);
                        setImportModalOpen(true);
                    }}
                    extractionJobs={extractionJobs}
                    availableUpdates={availableUpdates}
                    updateCheckStatus={updateCheckStatus}
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

            {activePanel === 'search' && (
                <DiscoverySearchPanel
                    query={universalSearch?.query}
                    answer={universalSearch?.answer}
                    results={universalSearch?.results}
                    loading={universalSearch?.loading}
                    messages={universalSearch?.messages}
                    onOpenDocument={onOpenDocument}
                    onClose={onCloseUniversalSearch}
                    onUniversalSearch={onUniversalSearch}
                />
            )}

            {activePanel === 'accdocs' && (
                <DocsPanel selectedElement={selectedElement} />
            )}

            {activePanel === 'progress' && (
                <BuildPanel
                    pins={trackingData ? [
                        ...(trackingData.avance || []),
                        ...(trackingData.docs || []),
                        ...(trackingData.restricciones || []),
                        ...(trackingData.maquinaria || [])
                    ] : []}
                    onPinSelect={(id) => {
                        const allPins = [
                            ...(trackingData.avance || []),
                            ...(trackingData.docs || []),
                            ...(trackingData.restricciones || []),
                            ...(trackingData.maquinaria || [])
                        ];
                        const found = allPins.find(p => p.id === id);
                        if (found && onTrackingPinClick) onTrackingPinClick(found);
                    }}
                    onPinDelete={onTrackingPinDelete}
                    placementMode={trackingPlacementMode}
                    onTogglePlacement={(type) => {
                        // type comes from BuildPanel ('avance', 'docs', 'restriction')
                        // We need to map 'restriction' back to App's 'restricciones' tab?
                        // Actually, App.jsx uses trackingTab to know what to create.
                        // So if we are in progress mode, we should set the tab.
                        if (onTrackingPlacementToggle) onTrackingPlacementToggle(type);
                    }}
                    showPins={true} // Defaulting to true for now
                    onTogglePins={() => { }} // Placeholder
                    selectedPinId={selectedPinId}
                    onCameraCapture={onCameraCapture}
                    onPinMoveRequest={onPinMoveRequest}
                />
            )}



        </aside>
    );
};

export default TandemSidebar;
