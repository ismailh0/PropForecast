// All HTTP requests to the Flask backend are defined here

// The '/api' prefix is intercepted by Vite's dev proxy (vite.config.js)
// and forwarded to Flask running on http://localhost:5000.


const API = '/api';

// Fetches all sales records for a given postcode from the database
// Returns an object with a 'results' array of sale records
export async function fetchProperties(postcode) {
  const res = await fetch(`${API}/properties?postcode=${encodeURIComponent(postcode)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

// Fetches heatmap data for the outward code area 
// Returns average sale prices grouped by postcode for the entire district
// used to colour the heatmap circles on the map
export async function fetchHeatmap(postcode) {
  const res = await fetch(`${API}/heatmap?postcode=${encodeURIComponent(postcode)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

// Fetches yearly average sale prices for a postcode's outward code area
// Used to draw the price history chart in the sidebar
export async function fetchHistory(postcode) {
  const res = await fetch(`${API}/history?postcode=${encodeURIComponent(postcode)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

// Sends a forecast request to Flask as a POST request with a JSON body
// The payload includes property type, tenure, postcode, year, month,
// and optionally the last known sale price and year for blend anchoring
// Returns the predicted price and blend info
export async function fetchForecast(payload) {
  const res = await fetch(`${API}/forecast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

//Fetches the model's performance metrics from the metrics.json file via Flask
export async function fetchMetrics() {
  const res = await fetch(`${API}/metrics`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

// Fetches all recorded sales at a specific address
// Used in the property panel to show the full sale history for that address
export async function fetchAddressHistory({ paon, street, postcode }) {
  const params = new URLSearchParams({ paon: paon || '', street, postcode });
  const res = await fetch(`${API}/address-history?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

// Fetches comparable sales — recent sales of the same property type within the same outward code area
export async function fetchComparables({ postcode, property_type, paon, street }) {
  const params = new URLSearchParams({ postcode, property_type, paon: paon || '', street: street || '' });
  const res = await fetch(`${API}/comparables?${params}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}
