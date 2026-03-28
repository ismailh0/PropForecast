// The left hand panel 
// SearchBar, SalesList, PriceChart, and ForecastForm in one column
// Receives all data from App.jsx as props and passes the relevant pieces down to each child

import { useRef } from 'react';
import SearchBar from './SearchBar';
import SalesList from './SalesList';
import PriceChart from './PriceChart';
import ForecastForm from './ForecastForm';

export default function Sidebar({
  onOpenModelInfo,   // opens the welcome/info modal when the i button is clicked
  onSearch,          // triggers a postcode search in App.jsx
  isLoading,         // disables the search button while a request is in flight
  searchError,       // error message to show below the search bar
  currentSales,      // array of sale records for the current postcode
  historyData,       // yearly average prices for the price history chart
  anchorSale,        // the currently selected sale, fills the forecast form
  postcode,          // current postcode string - passed to ForecastForm for API calls
  hasResults,        // controls whether the sales/chart/forecast sections are visible
  onSelectSale,      // called when a sale card is clicked
  onShowOnMap,       // called when show on map buttonis clicked
}) {
  //Ref attached to the forecast form div so we can scroll to it 
  const forecastSectionRef = useRef(null);

 
  function handleSelectSale(sale) {
    onSelectSale(sale);
    // Drop pin via map — only called from sidebar
    window._propForecastDropPinOnly?.(sale);
    // Slight delay before scrolling so React has time to update the form fields first
    setTimeout(() => {
      forecastSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 50);
  }

  return (
    <div id="sidebar">
      {/* Header with app title and info button */}
      <div id="sidebar-header">
        <div id="header-top">
          <div>
            <h1>PropForecast</h1>
            <p>UK Property Price Visualiser &amp; Forecaster</p>
          </div>
          {/* i button — reopens the welcome modal */}
          <button id="model-info-btn" title="Model Info & Disclaimer" onClick={onOpenModelInfo}>
            i
          </button>
        </div>
      </div>

      <SearchBar onSearch={onSearch} isLoading={isLoading} error={searchError} />

      {/* These sections are hidden until a successful search has been completed */}
      {hasResults && (
        <>
          <div className="section-block">
            <h2>Recent Sales</h2>
            {/* Show a message if the postcode returned no sales */}
            {currentSales.length === 0 ? (
              <p style={{ color: '#888', fontSize: '13px', marginTop: '8px' }}>
                No sales found for this postcode. Try a nearby postcode.
              </p>
            ) : (
              <SalesList
                sales={currentSales}
                onSelectSale={handleSelectSale}
                onShowOnMap={onShowOnMap}
              />
            )}
          </div>

          <div className="section-block">
            {/* Area label */}
            <h2>
              Price History{' '}
              {historyData && (
                <span id="area-label">— {historyData.postcode_area}</span>
              )}
            </h2>
            <PriceChart historyData={historyData} />
          </div>

          <div className="section-block">
            <h2>Price Forecast</h2>
            <ForecastForm
              postcode={postcode}
              anchorSale={anchorSale}
              forecastSectionRef={forecastSectionRef}
            />
          </div>
        </>
      )}
    </div>
  );
}
