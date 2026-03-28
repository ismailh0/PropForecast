// Shared utility functions used across multiple components
// Each function is exported so it can be imported wherever needed

// Normalises a postcode string to the standard format
// Strips whitespace, converts to uppercase, then inserts a space before last 3 characters 
export function normalizePostcode(raw) {
  const s = raw.toUpperCase().replace(/\s/g, '');
  if (s.length < 4) return s;
  return s.slice(0, -3) + ' ' + s.slice(-3);
}

// Converts  normalised price value t between 0 and 1 into an RGB colour
// Used to colour heatmap circles: 0 = cheapest (blue), 1 = most expensive (red)

// Works by defining 5 colour stops along the gradient selecting between the two stops that surround the given value of t
// This matches the gradient shown in the heatmap legend
export function priceToColor(t) {
  // Each stop is [position, [R, G, B]]
  const stops = [
    [0.00, [49,  54,  149]], // blue — lower prices
    [0.25, [116, 173, 209]], // light blue
    [0.50, [254, 224, 144]], // yellow — mid range
    [0.75, [244, 109, 67]],  // orange
    [1.00, [165, 0,   38]],  // red — higher prices
  ];

  // Fix t to [0, 1] so out of range values don't break the interpolation
  t = Math.max(0, Math.min(1, t));

  // Find the two surrounding colours
  let lo = stops[0], hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break; }
  }

  // f is how far t is between lo and hi 
  const f = (t - lo[0]) / (hi[0] - lo[0]);

  // Interpolate each RGB channel separately
  const r = Math.round(lo[1][0] + f * (hi[1][0] - lo[1][0]));
  const g = Math.round(lo[1][1] + f * (hi[1][1] - lo[1][1]));
  const b = Math.round(lo[1][2] + f * (hi[1][2] - lo[1][2]));

  return `rgb(${r},${g},${b})`;
}

// Trims an ISO date string down to just the date
export function formatDate(str) {
  return str ? str.slice(0, 10) : '';
}

// Converts single etter property type code from the database into a proper label 
export function propertyLabel(code) {
  return { D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat', O: 'Other' }[code] || code;
}

// converts single letter tenure code from the database into a  label
export function tenureLabel(code) {
  return { F: 'Freehold', L: 'Leasehold' }[code] || code;
}
