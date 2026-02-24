import json
import joblib
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score

#config

BASE_DIR   = Path(__file__).resolve().parent.parent
CLEAN_FILE = BASE_DIR / "data_clean" / "ppd_2018_2025_clean.csv"
MODELS_DIR = BASE_DIR / "models"

#Remove unrealistic prices before training
PRICE_MIN = 10_000
PRICE_MAX = 5_000_000

#Time-based split, train on everything up to and including this year
TRAIN_CUTOFF_YEAR = 2023

#Random Forest settings
N_ESTIMATORS = 100
RANDOM_STATE = 42
N_JOBS       = -1   #use all available CPU cores


#Load data
#Load cleaned data from phase 1 and remove outliers

def load_data():

    print(f"Loading clean dataset from {CLEAN_FILE.name}...")
    df = pd.read_csv(CLEAN_FILE, parse_dates=["date_of_transfer"])
    print(f"  Loaded {len(df):,} rows")

    before = len(df)
    df = df[(df["price"] >= PRICE_MIN) & (df["price"] <= PRICE_MAX)]
    print(f"  Removed {before - len(df):,} price outliers (outside £{PRICE_MIN:,} - £{PRICE_MAX:,})")
    print(f"  Remaining: {len(df):,} rows\n")

    return df


#Split
#split the data into train and test sets based on the year
#model is never trained on future data relative to the test period

def split_data(df):

    train = df[df["date_of_transfer"].dt.year <= TRAIN_CUTOFF_YEAR].copy()
    test  = df[df["date_of_transfer"].dt.year >  TRAIN_CUTOFF_YEAR].copy()

    print(f"Train set: {len(train):,} rows (2018-{TRAIN_CUTOFF_YEAR})")
    print(f"Test set:  {len(test):,} rows ({TRAIN_CUTOFF_YEAR + 1}-2025)\n")

    return train, test


#feature engineering
#avg sale price per district from training data

def compute_district_avg(train_df):
    
    district_avg = train_df.groupby("district")["price"].mean().to_dict()
    overall_avg  = float(train_df["price"].mean())

    print(f"  Computed avg price for {len(district_avg):,} districts")
    print(f"  Overall mean price (fallback for unknown districts): £{overall_avg:,.0f}\n")

    return district_avg, overall_avg


#avg sale price per postcode from training data
#more granular than district — falls back to district avg, then overall avg

def compute_postcode_avg(train_df):

    postcode_avg = train_df.groupby("postcode")["price"].mean().to_dict()
    print(f"  Computed avg price for {len(postcode_avg):,} postcodes\n")

    return postcode_avg


#build feature matrix from the cleaned dataframe

def engineer_features(df, district_avg, overall_avg):

    features = pd.DataFrame(index=df.index)

    #Temporal features — extracted from the sale date
    features["year"]    = df["date_of_transfer"].dt.year
    features["month"]   = df["date_of_transfer"].dt.month
    features["quarter"] = df["date_of_transfer"].dt.quarter

    #Geographic features
    features["latitude"]  = df["latitude"]
    features["longitude"] = df["longitude"]

    # Property type — one-hot encoded
    # D=Detached, F=Flat, S=Semi-detached, T=Terraced
    # 'O' (Other) is excluded and acts as the baseline category
    for pt in ["D", "F", "S", "T"]:
        features[f"property_type_{pt}"] = (df["property_type"] == pt).astype(int)

    #Binary flags
    features["new_build"]    = (df["new_build_flag"] == "Y").astype(int)
    features["is_leasehold"] = (df["tenure"] == "L").astype(int)

    #District average price — use overall mean for any district not seen in training
    features["avg_district_price"] = (
        df["district"].map(district_avg).fillna(overall_avg)
    )

    return features


#Train
#Traina random forest regressor on the log transofmed prices
#log tranform reduces impact of extreme values and improves accuracy

def train_model(X_train, y_train):
 
    print("Training Random Forest model...")
    print(f"  Training rows: {len(X_train):,}  |  Features: {X_train.shape[1]}")
    print(f"  n_estimators={N_ESTIMATORS}, random_state={RANDOM_STATE}, n_jobs={N_JOBS}")

    model = RandomForestRegressor(
        n_estimators=N_ESTIMATORS,
        n_jobs=N_JOBS,
        random_state=RANDOM_STATE
    )
    model.fit(X_train, y_train)

    print("  Training complete.\n")
    return model


#Evaluate
#evaluate the trained model on the test set
#predictions are converted back from log so error values are interpretable in pounds
#Metrics:
      #MAE  - Mean Absolute Error: average prediction error in £
      #MdAE - Median Absolute Error: more robust to outliers than MAE
      #RMSE - Root Mean Squared Error: penalises large errors more heavily
      #R²   - How much of price variance the model explains (1.0 = perfect)

def evaluate_model(model, X_test, y_test_log):
    print("Evaluating on test set (2024-2025)...")

    y_pred_log = model.predict(X_test)

    # Convert from log scale back to £
    y_pred = np.exp(y_pred_log)
    y_true = np.exp(y_test_log)

    mae  = mean_absolute_error(y_true, y_pred)
    rmse = np.sqrt(mean_squared_error(y_true, y_pred))
    r2   = r2_score(y_true, y_pred)
    mdae = float(np.median(np.abs(y_true - y_pred)))

    print(f"  MAE:  £{mae:>12,.0f}   (average prediction error in £)")
    print(f"  MdAE: £{mdae:>12,.0f}   (median prediction error in £)")
    print(f"  RMSE: £{rmse:>12,.0f}")
    print(f"  R²:    {r2:>12.4f}   (1.0 = perfect)\n")

    metrics = {
        "mae":          round(mae, 2),
        "rmse":         round(rmse, 2),
        "r2":           round(r2, 4),
        "mdae":         round(mdae, 2),
        "train_years":  f"2018-{TRAIN_CUTOFF_YEAR}",
        "test_years":   f"{TRAIN_CUTOFF_YEAR + 1}-2025",
        "test_rows":    len(X_test),
        "n_estimators": N_ESTIMATORS
    }

    return metrics


# Feature importance
# print top 10 most important features ranked b model

def print_feature_importance(model, feature_columns):

    importances = pd.Series(model.feature_importances_, index=feature_columns)
    importances = importances.sort_values(ascending=False)

    print("Feature importances (top 10):")
    for feat, score in importances.head(10).items():
        bar = "█" * int(score * 60)
        print(f"  {feat:<25} {score:.4f}  {bar}")
    print()


# Save

def save_outputs(model, feature_columns, district_avg, overall_avg, postcode_avg, metrics):

    MODELS_DIR.mkdir(exist_ok=True)

    # Trained model
    model_path = MODELS_DIR / "rf_model.pkl"
    joblib.dump(model, model_path)
    print(f"  Saved model            → {model_path.name}")

    # Feature column names in exact training order
    feat_path = MODELS_DIR / "feature_columns.json"
    with open(feat_path, "w") as f:
        json.dump(feature_columns, f, indent=2)
    print(f"  Saved feature columns  → {feat_path.name}")

    # District average price lookup (used by API to build feature rows)
    dist_path = MODELS_DIR / "district_avg_price.json"
    with open(dist_path, "w") as f:
        json.dump({"districts": district_avg, "overall_avg": overall_avg}, f, indent=2)
    print(f"  Saved district lookup  → {dist_path.name}")

    # Postcode average price lookup (more granular than district)
    pc_path = MODELS_DIR / "postcode_avg_price.json"
    with open(pc_path, "w") as f:
        json.dump(postcode_avg, f, indent=2)
    print(f"  Saved postcode lookup  → {pc_path.name}")

    # Evaluation metrics
    metrics_path = MODELS_DIR / "metrics.json"
    with open(metrics_path, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"  Saved metrics          → {metrics_path.name}")

    print(f"\n All outputs saved to models/\n")


# main

def main():

    #Load and filter
    df = load_data()

    #Time-based train/test split
    print("Splitting data...")
    train_df, test_df = split_data(df)
    del df  # free memory

    #Compute avg prices from training data only
    print("Computing district average prices...")
    district_avg, overall_avg = compute_district_avg(train_df)

    print("Computing postcode average prices...")
    postcode_avg = compute_postcode_avg(train_df)

    #Engineer features for both sets
    print("Engineering features...")
    X_train = engineer_features(train_df, district_avg, overall_avg)
    X_test  = engineer_features(test_df,  district_avg, overall_avg)

    #Log-transform the target variable (price → log price)
    y_train = np.log(train_df["price"])
    y_test  = np.log(test_df["price"])

    feature_columns = list(X_train.columns)
    print(f"  Features: {feature_columns}\n")

    #Train
    model = train_model(X_train, y_train)

    #Evaluate
    metrics = evaluate_model(model, X_test, y_test)

    #Feature importance
    print_feature_importance(model, feature_columns)

    #Save model and supporting files
    print("Saving outputs...")
    save_outputs(model, feature_columns, district_avg, overall_avg, postcode_avg, metrics)


if __name__ == "__main__":
    main()
