// Renders the list of recent sale cards in the sidebar

// Receives
// sales — array of sale records from the database
// onSelectSale — called when a card is clicked
// onShowOnMap  — called when shiw properies button is clicked

import { formatDate, propertyLabel, tenureLabel } from '../utils/helpers';

export default function SalesList({ sales, onSelectSale, onShowOnMap }) {
  //if no sales were returned for the postcode, display a message
  if (!sales || sales.length === 0) {
    return (
      <div id="recent-sales">
        <p className="loading">No sales found for this postcode.</p>
      </div>
    );
  }

  return (
    <div id="recent-sales">
      {/* Button to refocus and open the postcode popup on the map */}
      <button className="show-map-btn" onClick={onShowOnMap}>
        Show properties on map
      </button>

      {/* Map over the sales array to render one card per sale.
          The key helps React update the list when it changes. */}
      {sales.map((sale, i) => (
        <div key={i} className="sale-card" onClick={() => onSelectSale(sale)}>
          <div className="sale-price">£{Number(sale.price).toLocaleString()}</div>
          <div className="sale-meta">
            {formatDate(sale.date_of_transfer)} · {propertyLabel(sale.property_type)} ·{' '}
            {tenureLabel(sale.tenure)}
          </div>
          <div className="sale-meta">
            {sale.paon ? sale.paon + ' ' : ''}
            {sale.street}, {sale.town_city}
          </div>
          <div className="sale-hint">Click to forecast this property</div>
        </div>
      ))}
    </div>
  );
}
