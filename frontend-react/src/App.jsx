// Root component of the appl


import { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import MapView from './components/MapView';
import WelcomeModal from './components/WelcomeModal';
import ModelInfoModal from './components/ModelInfoModal';
import PropertyPanel from './components/PropertyPanel';
import { fetchProperties, fetchHeatmap, fetchHistory, fetchMetrics } from './utils/api';

export default function App() {

  // MODAL VISIBILITY
  // Controls which modal is currently shown. Welcome modal is shown by default on every page load. 
  const [showWelcomeModal, setShowWelcomeModal] = useState(true);
  const [showModelModal, setShowModelModal] = useState(false);

  // SEARCH STATE 
  // Stores the current postcode, all sales for that postcode, price history, and heatmap data.
  const [postcode, setPostcode] = useState('');
  const [currentSales, setCurrentSales] = useState([]);
  const [historyData, setHistoryData] = useState(null);
  const [heatmapData, setHeatmapData] = useState(null);

  // PROPERTY SELECTION STATE
  // anchorSale — the selected sale used to fill the forecast form
  // selectedProperty — controls whether the floating property panel is visible
  const [anchorSale, setAnchorSale] = useState(null);
  const [selectedProperty, setSelectedProperty] = useState(null);

  // UI STATE
  const [metrics, setMetrics] = useState(null); // model performance metrics
  const [isLoading, setIsLoading] = useState(false);  // shows loading text during search
  const [searchError, setSearchError] = useState(null); // shows error if search fails
  const [hasResults, setHasResults] = useState(false);  // controls sidebar section visibility

  // Counter incremented when show on map is clicked
  // when it changes, the map re-focuses the pin
  const [showOnMapTrigger, setShowOnMapTrigger] = useState(0);

  // LOAD METRICS ON STARTUP
  useEffect(() => {
    fetchMetrics()
      .then(setMetrics)
      .catch(() => {}); //ignore if metrics file is unavailable
  }, []);

  //SEARCH HANDLER 
  // used when the user submits a postcode.
  // Runs all three API calls in parallel using Promise.all, then updates state with the results
  async function handleSearch(rawPostcode) {
    setSearchError(null);
    setIsLoading(true);
    setAnchorSale(null); //clear any previously selected property

    try {
      // Fire all 3 requests simultaneously 
      const [propData, histData, heatData] = await Promise.all([
        fetchProperties(rawPostcode), // recent sales for this postcode
        fetchHistory(rawPostcode),    // yearly averages for the price chart
        fetchHeatmap(rawPostcode),    // all postcode averages for the heatmap
      ]);

      setCurrentSales(propData.results);
      setHistoryData(histData);
      setHeatmapData(heatData);
      setPostcode(rawPostcode);
      setHasResults(true); // reveals the sales list, chart and forecast sections
    } catch (err) {
      setSearchError(err.message || 'Something went wrong.');
    } finally {
      setIsLoading(false); // always runs, whether the request succeeded or failed
    }
  }

  // PROPERTY SELECTION
  // Called when user selects a property 
  // Sets the anchor sale and opens the property panel.
  const handleSelectSale = useCallback((sale) => {
    setAnchorSale(sale);
    setSelectedProperty(sale);
  }, []);

  
  // Updates the sidebar with the new postcode's sales and history without a full re-search
  const handleNewSalesAndHistory = useCallback((newPostcode, sales, histData) => {
    setCurrentSales(sales);
    setHistoryData(histData);
    setPostcode(newPostcode);
    setHasResults(true);
  }, []);

  // Increments the trigger counter so MapView knows to refocus the dropped pin.
  function handleShowOnMap() {
    setShowOnMapTrigger((n) => n + 1);
  }

  // RENDER
  return (
    <div id="app">

      {/* Welcome modal */}
      {showWelcomeModal && (
        <WelcomeModal
          onGetStarted={() => setShowWelcomeModal(false)}
          onViewModelInfo={() => {
            setShowWelcomeModal(false);
            setShowModelModal(true);
          }}
        />
      )}

      {/* Model info modal */}
      {showModelModal && (
        <ModelInfoModal metrics={metrics} onClose={() => setShowModelModal(false)} />
      )}

      {/* Left-hand sidebar*/}
      <Sidebar
        onOpenModelInfo={() => setShowWelcomeModal(true)}
        onSearch={handleSearch}
        isLoading={isLoading}
        searchError={searchError}
        currentSales={currentSales}
        historyData={historyData}
        anchorSale={anchorSale}
        postcode={postcode}
        hasResults={hasResults}
        onSelectSale={handleSelectSale}
        onShowOnMap={handleShowOnMap}
      />

      {/* Fullscreen map */}
      <MapView
        postcode={postcode}
        heatmapData={heatmapData}
        currentSales={currentSales}
        onSelectSale={handleSelectSale}
        onNewSalesAndHistory={handleNewSalesAndHistory}
        showOnMapTrigger={showOnMapTrigger}
      />

      {/* Floating property panel */}
      {selectedProperty && (
        <PropertyPanel
          sale={selectedProperty}
          onClose={() => setSelectedProperty(null)}
        />
      )}
    </div>
  );
}
