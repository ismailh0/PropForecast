// Introductory modal shown every time the app loads
// called again when the info button in the sidebar header is clicked

// Props:
// onGetStarted — closes  modal and reveals the main app
// onViewModelInfo — closes modal and opens the model info modal instead

export default function WelcomeModal({ onGetStarted, onViewModelInfo }) {
  return (
    // Fullscreen overlay 
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-header">
          <h2>Welcome to PropForecast</h2>
        </div>
        <div className="modal-body">
          <p>
            PropForecast is a UK property price visualiser and forecasting tool built on Land
            Registry Price Paid data from 2018–2025.
          </p>
          <p>
            Enter any UK postcode to explore recent sales, view neighbourhood price trends, and
            generate price forecasts for any property type.
          </p>

          <div className="modal-disclaimer">
            <h3>How the heatmap works</h3>
            <p>
              The heatmap displays colour-coded circles across the map, each representing a postcode
              area. The colour of each circle reflects the average sale price recorded at that
              postcode, ranging from blue (lower prices) to red (higher prices), based on Land
              Registry transaction data.
            </p>
            <p>
              Each circle is positioned using the geographic centroid of its postcode rather than a
              precise boundary. As a result, some properties may visually fall outside their
              corresponding circle. This is a known limitation of the visualisation and does not
              affect forecast accuracy.
            </p>
            <h3>Disclaimer</h3>
            <p>
              Forecasts are statistical estimates only and do not constitute financial, mortgage, or
              legal advice. Always consult a qualified surveyor or estate agent before making
              property decisions. Past price trends are not a guarantee of future performance.
            </p>
          </div>

          <div className="modal-actions">
            <button className="btn-primary" onClick={onGetStarted}>
              Get Started
            </button>
            <button className="btn-secondary" onClick={onViewModelInfo}>
              View Model Info
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
