// Floating panel that appears over the map when a property is selected.
// Shows the latest sale, full sale history at that address, a price trend chart,
// and comparable sales of the same property type in the same outward code area.

// Props
// sale — the selected sale object 
// onClose  — hides panel

import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  PointElement, LineElement, Tooltip, Filler,
} from 'chart.js';
import { fetchAddressHistory, fetchComparables } from '../utils/api';
import { formatDate, propertyLabel, tenureLabel } from '../utils/helpers';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

export default function PropertyPanel({ sale, onClose }) {
  const [history, setHistory]         = useState(null); // all sales at this address
  const [comparables, setComparables] = useState(null); // similar nearby sales
  const [loading, setLoading]         = useState(true);

  // Build  display address string from PAON (house number/name) and street
  const address = `${sale.paon ? sale.paon + ' ' : ''}${sale.street}`;

  // Fetch address history and comparables whenever the selected property changes
  // only re-runs  when a different address is selected
  useEffect(() => {
    setLoading(true);
    setHistory(null);
    setComparables(null);

    // Run both requests in parallel
    Promise.all([
      fetchAddressHistory({ paon: sale.paon, street: sale.street, postcode: sale.postcode }),
      fetchComparables({
        postcode: sale.postcode,
        property_type: sale.property_type,
        paon: sale.paon,
        street: sale.street,
      }),
    ])
      .then(([histData, compData]) => {
        setHistory(histData.history);
        setComparables(compData.comparables);
      })
      .catch(() => {
        // On failure, set empty arrays so the messages render
        setHistory([]);
        setComparables([]);
      })
      .finally(() => setLoading(false));
  }, [sale.paon, sale.street, sale.postcode]);

  return (
    <div id="property-panel">
      {/* Header showing address, postcode and close */}
      <div className="pp-panel-header">
        <div className="pp-panel-title">
          <div className="pp-panel-address">{address}</div>
          <div className="pp-panel-postcode">{sale.postcode}</div>
        </div>
        <button className="pp-panel-close" onClick={onClose} aria-label="Close">✕</button>
      </div>

      <div className="pp-panel-body">

        {/* Most recent sale summary at the top */}
        <div className="pp-panel-latest">
          <span className="pp-panel-price">£{Number(sale.price).toLocaleString()}</span>
          <span className="pp-panel-date">{formatDate(sale.date_of_transfer)}</span>
          <span className="pp-panel-type">
            {propertyLabel(sale.property_type)} · {tenureLabel(sale.tenure)}
            {sale.new_build_flag === 'Y' ? ' · New build' : ''}
          </span>
        </div>

        {loading && <p className="pp-panel-loading">Loading details...</p>}

        {/* Full sale history at this address */}
        {!loading && history && history.length > 0 && (
          <div className="pp-panel-section">
            <div className="pp-panel-section-title">Sale history at this address</div>
            {history.map((h, i) => (
              <div key={i} className="pp-panel-row">
                <span className="pp-panel-row-date">{h.date_of_transfer.slice(0, 7)}</span>
                <span className="pp-panel-row-price">£{Number(h.price).toLocaleString()}</span>
                <span className="pp-panel-row-meta">
                  {propertyLabel(h.property_type)} · {tenureLabel(h.tenure)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Price trend chart — only shown if there are 2 or more historical sales */}
        {!loading && history && history.length >= 2 && (
          <div className="pp-panel-section">
            <div className="pp-panel-section-title">Price trend at this address</div>
            <div className="pp-panel-chart">
              <Line
                data={{
                  labels: history.map((h) => h.date_of_transfer.slice(0, 7)),
                  datasets: [{
                    data: history.map((h) => h.price),
                    borderColor: '#2a6496',
                    backgroundColor: 'rgba(42,100,150,0.08)',
                    borderWidth: 2,
                    pointRadius: 4,
                    fill: true,
                    tension: 0.3,
                  }],
                }}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { display: false },
                    tooltip: {
                      // Format tooltip values as £325,000 instead of raw numbers
                      callbacks: { label: (ctx) => '£' + Number(ctx.raw).toLocaleString() },
                    },
                  },
                  scales: {
                    x: { ticks: { font: { size: 10 } } },
                    y: { ticks: {
                      font: { size: 10 },
                      callback: (v) => '£' + (v >= 1000 ? Math.round(v / 1000) + 'k' : v),
                    }},
                  },
                }}
              />
            </div>
          </div>
        )}

        {/* Comparable sales — same property type, same outward code, excluding this address */}
        {!loading && comparables && comparables.length > 0 && (
          <div className="pp-panel-section">
            <div className="pp-panel-section-title">
              Comparable {propertyLabel(sale.property_type).toLowerCase()}s nearby
            </div>
            {comparables.map((c, i) => (
              <div key={i} className="pp-panel-row">
                <span className="pp-panel-row-date">{c.date_of_transfer.slice(0, 7)}</span>
                <span className="pp-panel-row-price">£{Number(c.price).toLocaleString()}</span>
                <span className="pp-panel-row-meta">
                  {c.paon ? c.paon + ' ' : ''}{c.street} · {c.postcode}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Shown when comparables query returned no results */}
        {!loading && comparables && comparables.length === 0 && (
          <div className="pp-panel-section">
            <div className="pp-panel-section-title">Comparable sales</div>
            <p className="pp-panel-empty">No comparable sales found nearby.</p>
          </div>
        )}

      </div>
    </div>
  );
}
