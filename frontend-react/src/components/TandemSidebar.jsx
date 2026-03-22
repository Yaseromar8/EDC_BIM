import React from 'react';
import TandemFilterPanel from './TandemFilterPanel';
import SourceFilesPanel from './SourceFilesPanel';
import DocumentPanel from './DocumentPanel';
import DiscoverySearchPanel from './DiscoverySearchPanel';
import BuildPanel from './BuildPanel';
import SchedulePanel from './SchedulePanel';


const TandemSidebar = ({
    activePanel,
    panelVisible,
    models,
    hiddenModelUrns,
    filterBuckets,
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
    BACKEND_URL,
    scheduleData,
    setScheduleData
}) => {
    return (
        <aside className={`app-sidebar ${panelVisible && activePanel !== 'views' ? '' : 'hidden'}`}>

            {activePanel === 'filters' && (
                <TandemFilterPanel
                    models={models}
                    hiddenModelUrns={hiddenModelUrns}
                    filterBuckets={filterBuckets}
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

            {activePanel === 'progress' && (
                <BuildPanel
                    pins={trackingData ? [
                        ...(trackingData.avance || []),
                        ...(trackingData.docs || []),
                        ...(trackingData.restricciones || [])
                    ] : []}
                    onPinSelect={(id) => {
                        const allPins = [
                            ...(trackingData.avance || []),
                            ...(trackingData.docs || []),
                            ...(trackingData.restricciones || [])
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
                />
            )}

            {activePanel === 'schedule' && (
                <SchedulePanel 
                    BACKEND_URL={BACKEND_URL}
                    scheduleData={scheduleData}
                    setScheduleData={setScheduleData}
                    onUploadSuccess={(data) => {
                        console.log('Schedule uploaded:', data);
                    }}
                />
            )}

        </aside>
    );
};

export default TandemSidebar;
