//Property price forecast form in the sidebar
// Allows user to select property characteristics and a target year/month,
// then sends the request to Flask and displays the predicted price.

// When a sale card is clicked, anchorSale is passed in from App.jsx and the
// form fields are filled with that property's details

import { useState, useEffect } from 'react';
import { fetchForecast } from '../utils/api';
import { formatDate } from '../utils/helpers';

//month options
const MONTHS = [
  { value: 1,  label: 'January'   },
  { value: 2,  label: 'February'  },
  { value: 3,  label: 'March'     },
  { value: 4,  label: 'April'     },
  { value: 5,  label: 'May'       },
  { value: 6,  label: 'June'      },
  { value: 7,  label: 'July'      },
  { value: 8,  label: 'August'    },
  { value: 9,  label: 'September' },
  { value: 10, label: 'October'   },
  { value: 11, label: 'November'  },
  { value: 12, label: 'December'  },
];

//array of years from 2 years ahead down to 2018
function buildYears() {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear + 2; y >= 2018; y--) {
    years.push(y);
  }
  return years;
}

const YEARS = buildYears();
const DEFAULT_YEAR = new Date().getFullYear();

// Properties
export default function ForecastForm({ postcode, anchorSale, forecastSectionRef }) {
  const [propertyType, setPropertyType] = useState('F');
  const [tenure, setTenure]             = useState('L');
  const [newBuild, setNewBuild]         = useState('N');
  const [year, setYear]                 = useState(DEFAULT_YEAR);
  const [month, setMonth]               = useState(new Date().getMonth() + 1);

 
  const [result, setResult] = useState(null);

  // When a sale card is clicked, pre-fill the form with that propertys data
  useEffect(() => {
    if (!anchorSale) return;
    setPropertyType(anchorSale.property_type || 'F');
    setTenure(anchorSale.tenure || 'L');
    setNewBuild(anchorSale.new_build_flag || 'N');
    if (anchorSale.date_of_transfer) {
      const [y, m] = anchorSale.date_of_transfer.split('-');
      setYear(parseInt(y));
      setMonth(parseInt(m));
    }
    setResult(null); //clear prevbious
  }, [anchorSale]);

  async function handleForecast() {
    if (!postcode) return;

    const anchorYear = anchorSale
      ? new Date(anchorSale.date_of_transfer).getFullYear()
      : null;

    // return the actual recorded price if year matches last sale
    if (anchorSale && anchorYear === parseInt(year)) {
      setResult({
        actualPrice: anchorSale.price,
        actualYear: anchorYear,
      });
      return;
    }

    setResult({ loading: true });

    //Build the payload sent to Flask /api/forecast endpoint
    const payload = {
      postcode,
      property_type: propertyType,
      tenure,
      new_build: newBuild,
      year: parseInt(year),
      month: parseInt(month),
      //If a sale is selected, include its price and year for blending
      ...(anchorSale && {
        last_sale_price: anchorSale.price,
        last_sale_year: anchorYear,
      }),
    };

    try {
      const data = await fetchForecast(payload);
      setResult({ data, anchorSale });
    } catch (err) {
      setResult({ error: err.message });
    }
  }

  return (
    <div id="forecast-form" ref={forecastSectionRef}>
      <div className="form-row">
        <label>Property type</label>
        <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
          <option value="D">Detached</option>
          <option value="S">Semi-detached</option>
          <option value="T">Terraced</option>
          <option value="F">Flat</option>
          <option value="O">Other</option>
        </select>
      </div>
      <div className="form-row">
        <label>Tenure</label>
        <select value={tenure} onChange={(e) => setTenure(e.target.value)}>
          <option value="F">Freehold</option>
          <option value="L">Leasehold</option>
        </select>
      </div>
      <div className="form-row">
        <label>New build</label>
        <select value={newBuild} onChange={(e) => setNewBuild(e.target.value)}>
          <option value="N">No</option>
          <option value="Y">Yes</option>
        </select>
      </div>
      <div className="form-row">
        <label>Year</label>
        <select value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
          {YEARS.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <div className="form-row">
        <label>Month</label>
        <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))}>
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      <button id="forecast-btn" onClick={handleForecast}>
        Get Forecast
      </button>

      {/* Result panel — renders based on what result contains */}
      {result && (
        <div id="forecast-result">
          {result.loading && <p className="loading">Calculating...</p>}

          {/* Actual price shown when forecast year matches the last known sale year */}
          {result.actualPrice != null && (
            <>
              <div className="predicted-price">
                £{Number(result.actualPrice).toLocaleString()}
              </div>
              <div className="predicted-label">
                Actual recorded sale price · {result.actualYear}
              </div>
              <div className="blend-note">Land Registry transaction — no model used</div>
            </>
          )}

          {/* Model forecast result */}
          {result.data && (
            <>
              <div className="predicted-price">
                £{Number(result.data.predicted_price).toLocaleString()}
              </div>
              <div className="predicted-label">
                Estimated price · {result.data.district}
              </div>
              {/* blend_applied is true when anchor sale data was available and used */}
              {result.data.blend_applied ? (
                <div className="blend-note">
                  Anchored to last known sale (
                  {result.anchorSale
                    ? new Date(result.anchorSale.date_of_transfer).getFullYear()
                    : ''}{' '}
                  · £{Number(result.anchorSale ? result.anchorSale.price : 0).toLocaleString()}
                  )
                </div>
              ) : (
                <div className="blend-note">
                  Model estimate only — no sale history used
                </div>
              )}
            </>
          )}

          {result.error && <p className="error">{result.error}</p>}
        </div>
      )}
    </div>
  );
}
