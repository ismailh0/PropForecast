// Displays model performance metrics and a detailed disclaimer.

//   metrics  — object containing r2, mae, mdae, rmse, train_years, test_years
//              fetched from Flask's /api/metrics endpoint on startup
//   onClose  — closes the modal

export default function ModelInfoModal({ metrics, onClose }) {
  return (
  
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box">
        <div className="modal-header">
          <h2>Model Info &amp; Disclaimer</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {/* Metric cards — only shown if metrics loaded successfully from Flask */}
          {metrics && (
            <div id="metrics-info">
              <div className="metric-card">
                {/* R2 score as a percentage — 1.0 = perfect fit */}
                <div className="metric-value">{(metrics.r2 * 100).toFixed(1)}%</div>
                <div className="metric-label">R² Score</div>
              </div>
              <div className="metric-card">
                {/* Mean Absolute Error — average difference between predicted and actual */}
                <div className="metric-value">£{Math.round(metrics.mae / 1000)}k</div>
                <div className="metric-label">Mean Abs. Error</div>
              </div>
              <div className="metric-card">
                {/* Median Absolute Error — less affected by extreme outliers than MAE */}
                <div className="metric-value">£{Math.round(metrics.mdae / 1000)}k</div>
                <div className="metric-label">Median Abs. Error</div>
              </div>
              <div className="metric-card">
                {/* Root Mean Squared Error — penalises large errors more heavily */}
                <div className="metric-value">£{Math.round(metrics.rmse / 1000)}k</div>
                <div className="metric-label">RMSE</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{metrics.train_years}</div>
                <div className="metric-label">Training Period</div>
              </div>
              <div className="metric-card">
                <div className="metric-value">{metrics.test_years}</div>
                <div className="metric-label">Test Period</div>
              </div>
            </div>
          )}

          <div className="modal-disclaimer">
            <h3>Accuracy &amp; Limitations</h3>
            <p>
              PropForecast uses a Random Forest regression model trained on Land Registry Price Paid
              data from 2018–2023. Forecasts are statistical estimates based on property type,
              tenure, location, and market trends — not valuations.
            </p>
            <p>
              The model has a median absolute error of approximately £43,000, meaning half of
              predictions are within this range of the true sale price. Errors can be significantly
              larger for unusual properties or in volatile market conditions.
            </p>
            <p>
              When a property's last known sale price is available, forecasts are blended with a
              compound growth projection anchored to that transaction. The weight given to the anchor
              decreases the older the sale record is.
            </p>
            <h3>Disclaimer</h3>
            <p>
              This tool is for educational and informational purposes only. Forecasts do not
              constitute financial, mortgage, or legal advice. Always consult a qualified surveyor or
              estate agent before making property decisions.
            </p>
            <p>
              Property prices are subject to market conditions, economic factors, and local variables
              that this model does not fully capture. Past price trends are not a guarantee of future
              performance.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
