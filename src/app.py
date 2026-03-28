# Flask backend for PropForecast
# Serves all API endpoints consumed by the  frontend.


# Endpoints:
#   GET  /api/properties      — all sales for a specific postcode
#   GET  /api/history         — yearly average prices for an outward code area
#   GET  /api/heatmap         — average price per postcode in an outward code area
#   GET  /api/address-history — all sales at a specific address
#   GET  /api/comparables     — recent sales of the same property type nearby
#   POST /api/forecast        — predict a property price using the model
#   GET  /api/metrics         — model performance metrics

import json
import math
import sqlite3
import datetime
import numpy as np
import pandas as pd
import joblib
import requests
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS

#CONFIGURATION 


BASE_DIR   = Path(__file__).resolve().parent.parent
DB_PATH    = BASE_DIR / "data_clean" / "propforecast.db"
MODELS_DIR = BASE_DIR / "models"

app = Flask(__name__)
CORS(app)  

# MODEL LOADING 
# All model assets are loaded once at startup

print("Loading model...")

model        = joblib.load(MODELS_DIR / "rf_model.pkl")           
feature_cols = json.load(open(MODELS_DIR / "feature_columns.json")) 
dist_lookup  = json.load(open(MODELS_DIR / "district_avg_price.json")) 
metrics_data = json.load(open(MODELS_DIR / "metrics.json"))        

DISTRICT_AVGS  = dist_lookup["districts"]  
OVERALL_AVG    = dist_lookup["overall_avg"] 
TRAIN_MIN_YEAR = 2018  
TRAIN_MAX_YEAR = 2023  


def _compute_growth_rate():
    """
    Calculates the average year-on-year price growth rate from the database.
    Used to extrapolate predictions beyond the model's training range (2018-2023).
    Falls back to 3% if there is insufficient data.
    """
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute("""
            SELECT strftime('%Y', date_of_transfer) AS yr,
                   AVG(price) AS avg_price
            FROM sales
            GROUP BY yr
            ORDER BY yr
        """).fetchall()
    finally:
        conn.close()

    if len(rows) < 2:
        return 0.03 

    #calculate growth rate for each consecutive year
    rates = []
    for i in range(1, len(rows)):
        prev = rows[i - 1]["avg_price"]
        curr = rows[i]["avg_price"]
        if prev > 0:
            rates.append((curr - prev) / prev)

    return float(np.mean(rates)) if rates else 0.03


#used in every forecast calculation
ANNUAL_GROWTH_RATE = _compute_growth_rate()
print(f"Annual growth rate from data: {ANNUAL_GROWTH_RATE:.2%}")
print("Ready.\n")


#HELPERS

def get_db():
    """Opens a SQLite connection with row_factory so rows behave like dicts."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def normalize_postcode(raw):
    """Converts any postcode format to the standard 'AA9 9AA' form."""
    s = raw.upper().replace(" ", "")
    if len(s) < 4:
        return s
    return s[:-3] + " " + s[-3:]


def normalize_district(name):
    """
    Normalises admin district names returned by postcodes.io into the format
    used as keys 
    """
    s = name.upper().strip()
    if s.endswith(", CITY OF"):
        s = "CITY OF " + s[:-9].strip()
    return s


# ── ROUTES ────────────────────────────────────────────────────────────────────

@app.route("/api/properties")
def properties():
    """
    Returns all sales records for an exact postcode match
    Results are ordered by most recent first
    Used by the sidebar to populate the recent sales list
    """
    raw = request.args.get("postcode", "").strip()
    if not raw:
        return jsonify({"error": "postcode parameter is required"}), 400

    postcode = normalize_postcode(raw)

    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT price, date_of_transfer, property_type, new_build_flag,
                   tenure, paon, street, town_city, district, postcode, latitude, longitude
            FROM sales
            WHERE postcode = ?
            ORDER BY date_of_transfer DESC
        """, (postcode,)).fetchall()
    finally:
        conn.close()

    results = [dict(row) for row in rows]

    return jsonify({
        "postcode": postcode,
        "count":    len(results),
        "results":  results
    })


@app.route("/api/history")
def history():
    """
    Returns yearly average sale prices for the outward code area
    Used to draw the price history chart in the sidebar
    """
    raw = request.args.get("postcode", "").strip()
    if not raw:
        return jsonify({"error": "postcode parameter is required"}), 400

    postcode   = normalize_postcode(raw)
    outward    = postcode.replace(" ", "")[:-3]  # e.g. 'LU3 1BB' → 'LU3'
    like_param = outward + " %"                  # e.g. 'LU3 %' for SQL LIKE

    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT strftime('%Y', date_of_transfer) AS year,
                   ROUND(AVG(price))                AS avg_price,
                   COUNT(*)                         AS transaction_count
            FROM sales
            WHERE postcode LIKE ?
            GROUP BY year
            ORDER BY year
        """, (like_param,)).fetchall()
    finally:
        conn.close()

    return jsonify({
        "postcode_area": outward,
        "history": [dict(row) for row in rows]
    })


@app.route("/api/forecast", methods=["POST"])
def forecast():
    """Generates a predicted price for a property using the Random Forest model."""
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    #Check all fields are present
    required = ["postcode", "property_type", "tenure", "new_build", "year", "month"]
    missing  = [f for f in required if f not in data]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    #Sanitise inputs
    postcode      = str(data["postcode"]).strip()
    property_type = str(data["property_type"]).upper().strip()
    tenure        = str(data["tenure"]).upper().strip()
    new_build     = str(data["new_build"]).upper().strip()

    try:
        year  = int(data["year"])
        month = int(data["month"])
    except (TypeError, ValueError):
        return jsonify({"error": "year and month must be integers"}), 400

    # Validate field values against allowed options
    if property_type not in {"D", "F", "S", "T", "O"}:
        return jsonify({"error": "property_type must be D, F, S, T or O"}), 400
    if tenure not in {"F", "L"}:
        return jsonify({"error": "tenure must be F (freehold) or L (leasehold)"}), 400
    if new_build not in {"Y", "N"}:
        return jsonify({"error": "new_build must be Y or N"}), 400
    if not (2018 <= year <= 2030):
        return jsonify({"error": "year must be between 2018 and 2030"}), 400
    if not (1 <= month <= 12):
        return jsonify({"error": "month must be between 1 and 12"}), 400

    # Look up latitude, longitude, and admin district from postcodes.io
    pc_clean = postcode.upper().replace(" ", "")
    try:
        resp = requests.get(
            f"https://api.postcodes.io/postcodes/{pc_clean}",
            timeout=5
        )
    except requests.RequestException:
        return jsonify({"error": "Postcode lookup service is unavailable. Please try again."}), 503

    if resp.status_code == 404:
        return jsonify({"error": f"Postcode '{postcode}' not found or invalid"}), 400
    if resp.status_code != 200:
        return jsonify({"error": "Postcode lookup service returned an unexpected error"}), 503

    result         = resp.json().get("result", {})
    latitude       = result.get("latitude")
    longitude      = result.get("longitude")
    admin_district = result.get("admin_district", "")

    if latitude is None or longitude is None:
        return jsonify({"error": "Could not retrieve coordinates for this postcode"}), 400

    # Get average district price for this admin area 
    district_key       = normalize_district(admin_district)
    avg_district_price = DISTRICT_AVGS.get(district_key, OVERALL_AVG)

    quarter = math.ceil(month / 3)  

    # Build the feature row 
    row = {
        "year":               year,
        "month":              month,
        "quarter":            quarter,
        "latitude":           latitude,
        "longitude":          longitude,
        "property_type_D":    1 if property_type == "D" else 0,
        "property_type_F":    1 if property_type == "F" else 0,
        "property_type_S":    1 if property_type == "S" else 0,
        "property_type_T":    1 if property_type == "T" else 0,
        "new_build":          1 if new_build == "Y" else 0,
        "is_leasehold":       1 if tenure == "L" else 0,
        "avg_district_price": avg_district_price,
    }
    X = pd.DataFrame([row], columns=feature_cols)

    try:
        # Model was trained on log(price) to reduce skew 
        log_price       = model.predict(X)[0]
        predicted_price = float(np.exp(log_price))  

        # Random Forest cannot extrapolate beyond its training range.
        # Apply compound growth to adjust predictions for years outside 2018–2023.
        if year > TRAIN_MAX_YEAR:
            predicted_price *= (1 + ANNUAL_GROWTH_RATE) ** (year - TRAIN_MAX_YEAR)
        elif year < TRAIN_MIN_YEAR:
            predicted_price /= (1 + ANNUAL_GROWTH_RATE) ** (TRAIN_MIN_YEAR - year)

        # Anchor blend — if the client provides the last known sale price
        blend_applied   = False
        last_sale_price = data.get("last_sale_price")
        last_sale_year  = data.get("last_sale_year")

        if last_sale_price and last_sale_year:
            try:
                last_sale_price  = float(last_sale_price)
                last_sale_year   = int(last_sale_year)
                current_year     = datetime.date.today().year

                # Project the last sale price forward/backward to the requested year
                years_elapsed = year - last_sale_year
                anchor_price  = last_sale_price * ((1 + ANNUAL_GROWTH_RATE) ** years_elapsed)

                # Weight decreases the older the sale is relative to today
                years_since_sale = max(0, current_year - last_sale_year)
                weight           = 1 / (1 + years_since_sale)

                predicted_price = (weight * anchor_price) + ((1 - weight) * predicted_price)
                blend_applied   = True
            except (TypeError, ValueError):
                pass  # if anchor data is malformed, fall back to model prediction

        predicted_price = round(predicted_price, 2)

    except Exception:
        return jsonify({"error": "Model prediction failed unexpectedly"}), 500

    return jsonify({
        "predicted_price": predicted_price,
        "postcode":        normalize_postcode(postcode),
        "district":        district_key,
        "blend_applied":   blend_applied,
        "inputs": {
            "property_type": property_type,
            "tenure":        tenure,
            "new_build":     new_build,
            "year":          year,
            "month":         month
        }
    })


@app.route("/api/address-history")
def address_history():
    """
    Returns all recorded sales at a specific address (PAON + street + postcode).
    Results are ordered chronologically (oldest first) for the price trend chart.
    Used by the PropertyPanel component.
    """
    paon     = request.args.get("paon", "").strip().upper()
    street   = request.args.get("street", "").strip().upper()
    postcode = normalize_postcode(request.args.get("postcode", "").strip())

    if not street or not postcode:
        return jsonify({"error": "street and postcode required"}), 400

    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT price, date_of_transfer, property_type, tenure
            FROM sales
            WHERE postcode = ? AND street = ? AND paon = ?
            ORDER BY date_of_transfer ASC
        """, (postcode, street, paon)).fetchall()
    finally:
        conn.close()

    return jsonify({"history": [dict(row) for row in rows]})


@app.route("/api/heatmap")
def heatmap():
    """
    Returns one data point per postcode in the outward code area, containing
    the postcode, centroid coordinates, and average sale price.
    Capped at 500 postcodes — sufficient for any UK outward code area.
    Used by MapView to draw and colour the heatmap circles.
    """
    raw = request.args.get("postcode", "").strip()
    if not raw:
        return jsonify({"error": "postcode required"}), 400

    postcode   = normalize_postcode(raw)
    outward    = postcode.replace(" ", "")[:-3]  
    like_param = outward + " %"

    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT postcode, latitude, longitude, AVG(price) AS price
            FROM sales
            WHERE postcode LIKE ?
            AND latitude IS NOT NULL
            AND longitude IS NOT NULL
            GROUP BY postcode
            LIMIT 500
        """, (like_param,)).fetchall()
    finally:
        conn.close()

    return jsonify({"points": [[r["postcode"], r["latitude"], r["longitude"], r["price"]] for r in rows]})


@app.route("/api/comparables")
def comparables():
    """
    Returns recent sales of the same property type within the outward code area,
    excluding the selected property itself.
    Used by PropertyPanel to show comparable nearby transactions.
    """
    raw           = request.args.get("postcode", "").strip()
    property_type = request.args.get("property_type", "").strip().upper()
    paon          = request.args.get("paon", "").strip().upper()
    street        = request.args.get("street", "").strip().upper()

    if not raw or not property_type:
        return jsonify({"error": "postcode and property_type required"}), 400

    postcode   = normalize_postcode(raw)
    outward    = postcode.replace(" ", "")[:-3]
    like_param = outward + " %"

    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT price, date_of_transfer, paon, street, postcode,
                   property_type, tenure, new_build_flag
            FROM sales
            WHERE postcode LIKE ?
              AND property_type = ?
              AND NOT (UPPER(paon) = ? AND UPPER(street) = ? AND postcode = ?)
            ORDER BY date_of_transfer DESC
            LIMIT 6
        """, (like_param, property_type, paon, street, postcode)).fetchall()
    finally:
        conn.close()

    return jsonify({"comparables": [dict(r) for r in rows]})


@app.route("/api/metrics")
def metrics():
    """Returns the model performance metrics loaded from metrics.json at startup."""
    return jsonify(metrics_data)


# ERROR HANDLERS

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405


# ENTRY POINT 

if __name__ == "__main__":
    # prevents Flask from loading the model twice on startup
    app.run(debug=True, use_reloader=False, port=5000)
