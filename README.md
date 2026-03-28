# PropForecast

A UK property price visualisation and forecasting web application built using Flask and React. Uses Land Registry Price Paid data from 2018–2025 to display historical sale prices on an interactive map and generate price forecasts using a trained Random Forest regression model.

---

## OneDrive Download link

https://cityuni-my.sharepoint.com/:f:/g/personal/ismail_hussain_city_ac_uk/IgB6TWxrnWJMRpMx7Elpm2KUAeRYOiBahWzEywmAhOAdUKQ?e=mKXfsM

---

## Folder Structure

```
PropForecast/
├── src/
│   ├── app.py              # Flask REST API — serves all /api endpoints
│   ├── train_model.py      # Model training script — Random Forest regression
│   ├── create_db.py        # Database creation script used — builds SQLite from CSV
│   └── prepare_dataset.py  # Data cleaning and preprocessing pipeline
│
├── frontend-react/
│   ├── src/
│   │   ├── App.jsx                        # Root React component, manages global state
│   │   ├── main.jsx                       # React entry point
│   │   ├── index.css                      # Global styles
│   │   ├── components/
│   │   │   ├── MapView.jsx                # Leaflet map, heatmap, markers, property panel
│   │   │   ├── Sidebar.jsx                # Search, sales list, forecast form, chart
│   │   │   ├── SearchBar.jsx              # Postcode search input
│   │   │   ├── SalesList.jsx              # List of recent sales cards
│   │   │   ├── ForecastForm.jsx           # Price forecast form and result display
│   │   │   ├── PriceChart.jsx             # Historical price trend chart
│   │   │   ├── PropertyPanel.jsx          # Map overlay panel for selected property
│   │   │   ├── WelcomeModal.jsx           # Welcome screen
│   │   │   └── ModelInfoModal.jsx         # Model accuracy and disclaimer modal
│   │   └── utils/
│   │       ├── api.js                     # All fetch calls to Flask API
│   │       └── helpers.js                 # Shared utility functions
│   ├── public/
│   │   └── favicon.png                    # Browser tab icon
│   ├── package.json                       # JavaScript dependencies
│   └── vite.config.js                     # Vite config with Flask API proxy
│
├── models/
│   ├── rf_model.pkl                       # Trained Random Forest model (obtain separately — see below)
│   ├── metrics.json                       # Model evaluation metrics 
│   ├── feature_columns.json               # Feature list used during training
│   ├── district_avg_price.json            # District-level average prices for growth rate
│   └── postcode_avg_price.json            # Postcode-level average prices
│
├── data_clean/
│   └── propforecast.db                    # SQLite database (obtain separately — see below)
│
└── requirements.txt                       # Python dependencies
```

---

## Requirements

- Python 3.9 or above
- Node.js 18 or above
- pip
- npm

---

## Large Files (READ CAREFULLY)

IF you have obtained this from git:
Two files are too large to include in this git repository and must be obtained separately:

`rf_model.pkl` | Place in `models/` | Trained Random Forest model 
`propforecast.db` | Place in `data_clean/` | SQLite property sales database 

If you have obtained propForecast directly via OneDrive link, it is more than likely that these files are already included, but please double check.

Download links for missing files: 
https://drive.google.com/file/d/1fpSMLZooP34xnND3alSPBnsQxitmy27B/view?usp=sharing
https://drive.google.com/file/d/1T6gNJN8OHB7f5RycvxKLFA063siHLSdR/view?usp=sharing


---


## Installation


**1. Install Python dependencies**
```bash
pip install -r requirements.txt
```

**2. Install JavaScript dependencies**
```bash
cd frontend-react
npm install
```

**3. Place the large files** in their correct folders as described above. (IF NOT INCLUDED)

---

## Running the Application

Open two terminals:

**Terminal 1 — Start the Flask backend**
```bash
python src/app.py
```

**Terminal 2 — Start the React frontend**
```bash
cd frontend-react
npm run dev
```

Then open your browser and go to: `http://localhost:5173`

---

## Hosted Version

A hosted version could not be provided due to the memory requirements of the trained random forest model exceeding the limits of free tier hosting platforms. 
The application can be run locally following the installation instructions above.

---

## Testing the Application

1. Enter a UK postcode in the search bar (e.g. `LU3 1BB`) and press Search
2. The map will zoom to the area and display a colour coded heatmap of average sale prices
3. Click any property from the recent sales list on the left to view its details
4. Use the Price Forecast form to generate a predicted price for a given year
5. Click any heatmap circle to browse properties in that postcode area
6. Click the info icon in the sidebar for model accuracy information and disclaimers
