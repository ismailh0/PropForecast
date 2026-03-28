// MapView.jsx — Full-screen interactive map using Leaflet via react-leaflet.

// Split into two components:

// MapController 
// lives inside the MapContainer and has direct access to the
// Leaflet map instance. Handles all map logic: heatmap circles,
// postcode locking, pin drops, popups, and unlock behaviour.

// MapView  
// The outer React component. Renders the MapContainer, unlock
// button, and heatmap legend. Passes properties down to MapController.


import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { normalizePostcode, priceToColor, formatDate, propertyLabel, tenureLabel } from '../utils/helpers';
import { fetchProperties, fetchHistory } from '../utils/api';

// Fix for Leaflet's default marker icons breaking under Vite's asset bundling.
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

//bounding box for the UK — prevents the user scrolling outside the country on load
const UK_BOUNDS = L.latLngBounds([49.5, -8.5], [61.0, 2.0]);

// MapController
// Inner component that handles all Leaflet map operations.
// Renders nothing — it only manages map state as a side effect.
function MapController({
  postcode,
  heatmapData,
  currentSales,
  onSelectSale,
  onNewSalesAndHistory,
  showOnMapTrigger,
  onShowUnlock,
  onHideUnlock,
  onLegendRange,
}) {
  const map = useMap(); 

  
  // use useRef() to hold Leaflet objects so React doesn't interfere with them.
  //Changing a ref never causes a redraw 
  const heatLayerRef        = useRef(null);  //group layer that holds all heatmap circles
  const heatCirclesRef      = useRef({});    //stores each circle by postcode
  const droppedPinRef       = useRef(null);  //blue pin dropped when a property is selected
  const currentPostcodeRef  = useRef('');    //whichever postcode is currently highlighted
  const popupCounterRef     = useRef(0);     //a counter used to give each popup button a unique ID
  const saleRegistryRef     = useRef({});    //stores sale data by ID so popup buttons can access it
  const onSelectSaleRef     = useRef(onSelectSale); //keeps a reference to the callback function passed
  const isLockedRef         = useRef(false); // racks whether the map is locked to a specific area

  
  useEffect(() => {
    onSelectSaleRef.current = onSelectSale;
  }, [onSelectSale]);

  // Expose a global function so leaflet popup can trigger react state updates when a property is clicked.
  // The popup stores a generated ID - this function looks up the matching sale.
  useEffect(() => {
    window._propForecastSelectFromPopup = (id) => {
      const sale = saleRegistryRef.current[id];
      if (!sale) return;
      map.closePopup();
      selectAndForecast(sale);
    };
    return () => { delete window._propForecastSelectFromPopup; };
  }, [map]);

  //Listen for zoom events to adjust heatmap circle opacity and radius
  useMapEvents({
    zoomend: () => updateAreaOpacity(),
  });

  // Scales heatmap circle opacity and radius based on the current zoom level
  function updateAreaOpacity() {
    if (!heatLayerRef.current) return;
    const z = map.getZoom();
    const opacity =
      z <= 13 ? 0.5 : z === 14 ? 0.45 : z === 15 ? 0.38 : z === 16 ? 0.3 : z === 17 ? 0.22 : 0.15;
    const radius =
      z <= 13 ? 220 : z === 14 ? 190 : z === 15 ? 160 : z === 16 ? 130 : 110;
    heatLayerRef.current.eachLayer((c) => {
      c.setStyle({ fillOpacity: opacity });
      c.setRadius(radius);
    });
  }

  // Rebuild the heatmap whenever new heatmap data arrives 
  useEffect(() => {
    if (!heatmapData || !heatmapData.points || heatmapData.points.length === 0) return;

    if (heatLayerRef.current) map.removeLayer(heatLayerRef.current);

    //Use log scale so the colour gradient isn't dominated by extreme outliers
    const logPrices = heatmapData.points.map((p) => Math.log(p[3]));
    const min = Math.min(...logPrices);
    const max = Math.max(...logPrices);
    const range = max - min || 1; // avoid division by zero

    //Pass the actual min/max prices up to MapView for the legend labels
    const actualPrices = heatmapData.points.map((p) => p[3]);
    onLegendRange?.(Math.min(...actualPrices), Math.max(...actualPrices));

    heatLayerRef.current = L.layerGroup();
    heatCirclesRef.current = {};

    heatmapData.points.forEach((p, i) => {
      const [pc, lat, lng, avgPrice] = p;

      //t is a normalised value 0–1 representing where this postcode sits on the price scale
      const t = Math.max(0.05, (logPrices[i] - min) / range);

      const circle = L.circle([lat, lng], {
        radius: 220,               
        fillColor: priceToColor(t),
        fillOpacity: 0.5,
        stroke: false,
        interactive: true,
      }).addTo(heatLayerRef.current);

      
      circle._centroid = L.latLng(lat, lng);
      circle._tooltipContent = `<b>${pc}</b><br>Avg £${Math.round(avgPrice).toLocaleString()}`;
      circle.bindTooltip(circle._tooltipContent, { direction: 'top', sticky: true });
      heatCirclesRef.current[pc] = circle;
    });

    heatLayerRef.current.addTo(map);
    updateAreaOpacity();
  }, [heatmapData, map]);

  //After a search, focus and lock the map to the searched postcode's area
  useEffect(() => {
    if (!postcode || !currentSales || currentSales.length === 0) return;
    focusPostcode(postcode);
  }, [postcode, currentSales]);

  // Refocus the map when when a property is slected from sidebar
  useEffect(() => {
    if (showOnMapTrigger === 0) return;
    if (postcode && currentSales && currentSales.length > 0) focusPostcode(postcode);
  }, [showOnMapTrigger]);

  // Highlights  circle for  given postcode, locks the map to the outward code area
  // disable all circle interactions
  // skipLock = true is used when clicking circles in unlocked mode 
  // the map should not lock again when browsing.
  function focusPostcode(rawPostcode, skipLock = false) {
    const pc = normalizePostcode(rawPostcode);
    if (!currentSales || currentSales.length === 0) return;

    let circle = heatCirclesRef.current[pc];

    // If the exact postcode isn't in the heatmap data fall back to the nearest circle using the first sale's coordinates as a reference point
    if (!circle) {
      const allCircles = Object.values(heatCirclesRef.current);
      if (allCircles.length === 0) return;
      const refLat = currentSales[0].latitude;
      const refLng = currentSales[0].longitude;
      let minDist = Infinity;
      allCircles.forEach((c) => {
        const d = Math.abs(c._centroid.lat - refLat) + Math.abs(c._centroid.lng - refLng);
        if (d < minDist) { minDist = d; circle = c; }
      });
    }

    if (!circle) return;

    // Remove white stroke from the previously highlighted circle
    if (currentPostcodeRef.current && heatCirclesRef.current[currentPostcodeRef.current]) {
      heatCirclesRef.current[currentPostcodeRef.current].setStyle({ stroke: false });
    }

    // Highlight new circle with a white border
    currentPostcodeRef.current = pc;
    circle.setStyle({ stroke: true, color: '#ffffff', weight: 2.5 });

    if (!skipLock) {
      isLockedRef.current = true;

      // Fit the map to the full view of all heatmap circles in the outward code area
      const allCircles = Object.values(heatCirclesRef.current);
      if (allCircles.length >= 2) {
        const bounds = L.latLngBounds(allCircles.map((c) => c._centroid));
        const padded = bounds.pad(0.06);
        map.setMaxBounds(padded);   // prevents scrolling outside the area
        map.setMinZoom(12);         // prevents zooming out past district level
        map.fitBounds(padded);
      }

      // Disable circle interactions while locked
      Object.values(heatCirclesRef.current).forEach((c) => {
        c.unbindTooltip();
        c.off('click');
        if (c._path) c._path.style.pointerEvents = 'none';
      });

      // display unlock button and only outwards postcode
      const outward = pc.replace(/\s.*/, ''); 
      onShowUnlock(outward);
    }

    // Open the postcode popup centred on the highlighted circle
    const { lat, lng } = circle._centroid;
    L.popup({ maxWidth: 320, className: 'postcode-popup-wrap' })
      .setLatLng([lat, lng])
      .setContent(buildPostcodePopup(currentSales))
      .openOn(map);
  }

  // Builds the HTML string for the postcode popup.
  // Groups sales by address, shows the most recent sale per address,
  // assigns a unique ID to each so _propForecastSelectFromPopup can look it up
  function buildPostcodePopup(sales) {
    const byAddress = {};
    sales.forEach((sale) => {
      const key = `${sale.paon || ''}|${sale.street}`;
      if (!byAddress[key]) byAddress[key] = [];
      byAddress[key].push(sale);
    });

    const rows = Object.entries(byAddress)
      .map(([key, group]) => {
        const [paon, street] = key.split('|');
        const latest = group[0]; // first in array is the most recent sale
        const id = `prop-${popupCounterRef.current++}`;
        saleRegistryRef.current[id] = latest; 
        return `
          <div class="pp-property" onclick="window._propForecastSelectFromPopup('${id}')">
            <div class="pp-address">${paon ? paon + ' ' : ''}${street}</div>
            <div class="pp-meta">£${Number(latest.price).toLocaleString()} · ${formatDate(latest.date_of_transfer)} · ${propertyLabel(latest.property_type)}</div>
            <div class="pp-count">${group.length} sale${group.length > 1 ? 's' : ''} recorded</div>
          </div>
        `;
      })
      .join('');

    const postcode = sales[0]?.postcode || '';
    return `<div class="pp-header">Properties at ${postcode}</div><div class="pp-list">${rows}</div>`;
  }

  // notifies React to open the property panel, then geocodes the address via Nominatim to get a precise lat/lng for the pin
  // falls back to the postcode centroid if geocoding fails
  async function selectAndForecast(sale) {
    onSelectSaleRef.current(sale);

    let lat = sale.latitude;
    let lng = sale.longitude;

    //attempt to geocode the full address for a more precise pin location
    if (sale.paon && sale.street && sale.town_city) {
      const query = `${sale.paon} ${sale.street}, ${sale.town_city}, UK`;
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=gb`,
          { headers: { 'User-Agent': 'PropForecast/1.0' } }
        );
        const results = await res.json();
        if (results.length > 0) {
          lat = parseFloat(results[0].lat);
          lng = parseFloat(results[0].lon);
        }
      } catch (_) {} // fall back to postcode centroid on any error
    }

    //remove the previous pin and drop a new one at the geocoded location
    if (droppedPinRef.current) map.removeLayer(droppedPinRef.current);
    droppedPinRef.current = L.marker([lat, lng], { zIndexOffset: 1000 })
      .addTo(map)
      .bindPopup(
        `<b>${sale.paon ? sale.paon + ' ' : ''}${sale.street}</b><br>£${Number(sale.price).toLocaleString()} · ${formatDate(sale.date_of_transfer)}`
      )
      .openPopup();
    map.setView([lat, lng], 16);
  }

  // Exposes unlockMap on window so the unlock button can trigger map logic that lives inside MapController
  useEffect(() => {
    window._propForecastUnlockMap = async () => {
      isLockedRef.current = false;
      map.setMaxBounds(null);
      map.setMinZoom(6);
      onHideUnlock(); //hide the unlock button in MapView

      Object.entries(heatCirclesRef.current).forEach(([pc, circle]) => {
        
        if (circle._path) circle._path.style.pointerEvents = '';

        
        if (circle._tooltipContent) {
          circle.bindTooltip(circle._tooltipContent, { direction: 'top', sticky: true });
        }

        //click handler allows circle interactions and focuses map without loxcking
        circle.off('click');
        circle.on('click', async () => {
          try {
            const [propData, histData] = await Promise.all([
              fetchProperties(pc),
              fetchHistory(pc),
            ]);
            onNewSalesAndHistory(pc, propData.results, histData);
            focusPostcode(pc, true);
          } catch (_) {}
        });
      });
    };

    return () => { delete window._propForecastUnlockMap; };
  }, [map, onNewSalesAndHistory, onHideUnlock]);

  //exposes a pin drop function for sidebar sale card clicks
  //geocodes the address and drops a pin without calling onSelectSaleRef 
  useEffect(() => {
    window._propForecastDropPinOnly = async (sale) => {
      let lat = sale.latitude;
      let lng = sale.longitude;
      if (sale.paon && sale.street && sale.town_city) {
        const query = `${sale.paon} ${sale.street}, ${sale.town_city}, UK`;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=gb`,
            { headers: { 'User-Agent': 'PropForecast/1.0' } }
          );
          const results = await res.json();
          if (results.length > 0) {
            lat = parseFloat(results[0].lat);
            lng = parseFloat(results[0].lon);
          }
        } catch (_) {}
      }
      if (droppedPinRef.current) map.removeLayer(droppedPinRef.current);
      droppedPinRef.current = L.marker([lat, lng], { zIndexOffset: 1000 })
        .addTo(map)
        .bindPopup(
          `<b>${sale.paon ? sale.paon + ' ' : ''}${sale.street}</b><br>£${Number(sale.price).toLocaleString()} · ${formatDate(sale.date_of_transfer)}`
        )
        .openPopup();
      map.setView([lat, lng], 16);
    };
    return () => { delete window._propForecastDropPinOnly; };
  }, [map]);

  return null;
}

//MapView
//Outer component renders the MapContainer (Leaflet wrapper),the unlock button overlay, and the heatmap legend.
export default function MapView({
  postcode,
  heatmapData,
  currentSales,
  onSelectSale,
  onNewSalesAndHistory,
  showOnMapTrigger,
}) {
  const [showUnlockBtn, setShowUnlockBtn] = useState(false);
  const [unlockLabel, setUnlockLabel]     = useState('');
  const [legendRange, setLegendRange]     = useState(null); // { lo, hi } in £

  //called by MapController when the map locks to show the unlock button
  function handleShowUnlock(outward) {
    setUnlockLabel(`Unlock — browse all of ${outward}`);
    setShowUnlockBtn(true);
  }

  //called by MapController when the map unlocks to hide the button
  function handleHideUnlock() {
    setShowUnlockBtn(false);
  }

  function handleUnlock() {
    if (window._propForecastUnlockMap) window._propForecastUnlockMap();
  }

  return (
    <div id="map">
      {/* MapContainer initialises Leaflet and provides the map context
          that MapController and useMap() depend on */}
      <MapContainer
        center={[54.5, -3.5]}       // centres on the UK on load
        zoom={7}
        minZoom={7}                  // prevents zooming out past UK 
        maxBounds={UK_BOUNDS}        // prevents scrolling outside the UK
        maxBoundsViscosity={1.0}     // hard boundary — map snaps back if dragged outside
        style={{ width: '100%', height: '100%' }}
      >
        {/* OpenStreetMap tile layer — provides the base map imagery */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="© OpenStreetMap contributors"
          maxZoom={18}
        />

        {/* MapController lives inside the container so it can access the map instance */}
        <MapController
          postcode={postcode}
          heatmapData={heatmapData}
          currentSales={currentSales}
          onSelectSale={onSelectSale}
          onNewSalesAndHistory={onNewSalesAndHistory}
          showOnMapTrigger={showOnMapTrigger}
          onShowUnlock={handleShowUnlock}
          onHideUnlock={handleHideUnlock}
          onLegendRange={(lo, hi) => setLegendRange({ lo, hi })}
        />
      </MapContainer>

      {/* Unlock button — only visible when locked to an area */}
      {showUnlockBtn && (
        <button id="unlock-btn" onClick={handleUnlock}>
          {unlockLabel}
        </button>
      )}

      {/* Heatmap legend — shown once heatmap data has been loaded and price range is known */}
      {legendRange && (
        <div id="heatmap-legend">
          <div id="heatmap-legend-bar" />
          <div id="heatmap-legend-labels">
            <span>£{Math.round(legendRange.lo / 1000)}k</span>
            <span>£{Math.round(legendRange.hi / 1000)}k</span>
          </div>
          <div id="heatmap-legend-title">Avg price / postcode</div>
        </div>
      )}
    </div>
  );
}
