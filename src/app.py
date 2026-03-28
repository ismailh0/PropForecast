import json
import math
import sqlite3
import numpy as np
import pandas as pd
import joblib
import requests
from pathlib import Path
from flask import Flask, jsonify, request
from flask_cors import CORS

#CONFIG

BASE_DIR   = Path(__file__).resolve().parent.parent
DB_PATH    = BASE_DIR / "data_clean" / "propforecast.db"
MODELS_DIR = BASE_DIR / "models"

app = Flask(__name__)
CORS(app)

print("Loading model...")

model        = joblib.load(MODELS_DIR / "rf_model.pkl")
feature_cols = json.load(open(MODELS_DIR / "feature_columns.json"))
dist_lookup  = json.load(open(MODELS_DIR / "district_avg_price.json"))
metrics_data = json.load(open(MODELS_DIR / "metrics.json"))

DISTRICT_AVGS = dist_lookup["districts"]
OVERALL_AVG   = dist_lookup["overall_avg"]
print("Ready.\n")


#HELPERS

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def normalize_postcode(raw):
    
    s = raw.upper().replace(" ", "")
    if len(s) < 4:
        return s
    return s[:-3] + " " + s[-3:]


def normalize_district(name):
    s = name.upper().strip()
    if s.endswith(", CITY OF"):
        s = "CITY OF " + s[:-9].strip()
    return s


#ROUTES

@app.route("/api/properties")
def properties():
    raw = request.args.get("postcode", "").strip()
    if not raw:
        return jsonify({"error": "postcode parameter is required"}), 400

    postcode = normalize_postcode(raw)

    conn = get_db()
    try:
        rows = conn.execute("""
            SELECT price, date_of_transfer, property_type, new_build_flag,
                   tenure, street, town_city, district
            FROM sales
            WHERE postcode = ?
            ORDER BY date_of_transfer DESC
            LIMIT 20
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
    raw = request.args.get("postcode", "").strip()
    if not raw:
        return jsonify({"error": "postcode parameter is required"}), 400

    postcode    = normalize_postcode(raw)
    outward     = postcode.replace(" ", "")[:-3]  
    like_param  = outward + " %"                  

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
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    required = ["postcode", "property_type", "tenure", "new_build", "year", "month"]
    missing  = [f for f in required if f not in data]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    postcode      = str(data["postcode"]).strip()
    property_type = str(data["property_type"]).upper().strip()
    tenure        = str(data["tenure"]).upper().strip()
    new_build     = str(data["new_build"]).upper().strip()

    try:
        year  = int(data["year"])
        month = int(data["month"])
    except (TypeError, ValueError):
        return jsonify({"error": "year and month must be integers"}), 400

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

    result       = resp.json().get("result", {})
    latitude     = result.get("latitude")
    longitude    = result.get("longitude")
    admin_district = result.get("admin_district", "")

    if latitude is None or longitude is None:
        return jsonify({"error": "Could not retrieve coordinates for this postcode"}), 400

    district_key      = normalize_district(admin_district)
    avg_district_price = DISTRICT_AVGS.get(district_key, OVERALL_AVG)

    quarter = math.ceil(month / 3)

    #build feature row — must match training order
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

    #model predicts log(price), convert back to £
    try:
        log_price       = model.predict(X)[0]
        predicted_price = round(float(np.exp(log_price)), 2)
    except Exception:
        return jsonify({"error": "Model prediction failed unexpectedly"}), 500

    return jsonify({
        "predicted_price": predicted_price,
        "postcode":        normalize_postcode(postcode),
        "district":        district_key,
        "inputs": {
            "property_type": property_type,
            "tenure":        tenure,
            "new_build":     new_build,
            "year":          year,
            "month":         month
        }
    })


@app.route("/api/metrics")
def metrics():
    return jsonify(metrics_data)


@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found"}), 404


@app.errorhandler(405)
def method_not_allowed(e):
    return jsonify({"error": "Method not allowed"}), 405


if __name__ == "__main__":
    #stops Flask loading the model twice on startup
    app.run(debug=True, use_reloader=False, port=5000)
