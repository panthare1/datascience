from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware 
import sqlite3
import joblib
from pathlib import Path

# ===== Predictor model loading =====
script_dir = Path(__file__).parent
print("Loading predictor model...")
predictor = joblib.load(script_dir / 'predictor.joblib')
predictor_classes = joblib.load(script_dir / 'predictor_classes.joblib')
print(f"  Loaded model with {len(predictor_classes)} classes")

app = FastAPI(title="Lithuania 112 Events API")
# Allow any origin during development.
# Tighten this before deploying publicly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
DB_PATH = "events.db"

def query_db(sql, params=()):#reusable function. connects to db, prevents sql injection, returns list of dicts/clean json
    """Run a SQL query and return rows as a list of dicts."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row #access columns by name
    cur = conn.cursor()#sql requires a cursor object
    cur.execute(sql, params)#to prevet sql injection, pass params as a separate argument instead of formatting into the string
    rows = [dict(row) for row in cur.fetchall()]#return list of dicts/clean json
    conn.close()#close
    return rows

#endpoints
@app.get("/")
def home():
    return {"status": "ok", "message": "112 Events API is running"}

@app.get("/stats/by-type")
def stats_by_type(
    event_type: str = Query(None),
    year: int = Query(None),
):
    """Total event counts grouped by higher-level type. Optionally filtered."""
    sql = """
        SELECT higher_level_incident_type AS type, COUNT(*) AS count
        FROM events
        WHERE 1=1
    """
    params = []

    if event_type is not None:
        sql += " AND higher_level_incident_type = ?"
        params.append(event_type)
    if year is not None:
        sql += " AND year = ?"
        params.append(year)

    sql += " GROUP BY higher_level_incident_type ORDER BY count DESC"

    rows = query_db(sql, tuple(params))
    return {"data": rows}

@app.get("/heatmap")
def heatmap_data(
    min_lat: float = Query(..., description="South edge of the map"),
    max_lat: float = Query(..., description="North edge of the map"),
    min_lon: float = Query(..., description="West edge of the map"),
    max_lon: float = Query(..., description="East edge of the map"),
    cell_size: float = Query(0.05, description="Grid cell size in degrees (~5km at this latitude)"),
    event_type: str = Query(None),
    year: int = Query(None),
):
    """aggregate event counts into a grid for heatmap visualization."""
    sql = """
        SELECT
            ROUND(e.latitude / ?, 0) * ? AS cell_lat,
            ROUND(e.longitude / ?, 0) * ? AS cell_lon,
            COUNT(*) AS count
        FROM events_rtree r
        JOIN events e ON e.rowid = r.id
        WHERE r.min_lat >= ? AND r.max_lat <= ?
        AND r.min_lon >= ? AND r.max_lon <= ?
    """
    params = [cell_size, cell_size, cell_size, cell_size, min_lat, max_lat, min_lon, max_lon]

    if event_type is not None:
        sql += " AND higher_level_incident_type = ?"
        params.append(event_type)

    if year is not None:
        sql += " AND year = ?"
        params.append(year)

    sql += " GROUP BY cell_lat, cell_lon"
    rows = query_db(sql, tuple(params))
    return {"count": len(rows), "cell_size": cell_size, "data": rows}

@app.get("/events")
def get_events(
    #Return events inside a geographic bounding box, with optional filters."""
    min_lat: float = Query(..., description="South edge of the map"),
    max_lat: float = Query(..., description="North edge of the map"),
    min_lon: float = Query(..., description="West edge of the map"),
    max_lon: float = Query(..., description="East edge of the map"),
    event_type: str = Query(None, description="Filter by higher-level incident type"),   
    year: int = Query(None, description="Filter by year"),
    limit: int = Query(2000, description="Max events to reuturn"),                       
    #The things after ? in the URL are called query parameters, and FastAPI makes it easy to define and validate them using the Query class. 
    #The ... means it's required, and the description is used in the API docs."""
    #URL request parameter example: /events?min_lat=53.8&max_lat=56&min_lon=20&max_lon=26&event_type=Fire&year=2020&limit=100
):
    """Return events inside a geographic bounding box, with optional filters."""
    sql = """
        SELECT e.latitude, e.longitude, e.higher_level_incident_type, e.lower_level_incident_type,
            e.year, e.month, e.data_quality_flag
        FROM events_rtree r
        JOIN events e ON e.rowid = r.id
        WHERE r.min_lat >= ? AND r.max_lat <= ?
        AND r.min_lon >= ? AND r.max_lon <= ?
    """
    params = [min_lat, max_lat, min_lon, max_lon]

    if event_type is not None:
        sql += "AND higher_level_incident_type = ?"
        params.append(event_type)
    
    if year is not None:
        sql += " AND year = ?"
        params.append(year)
    
    sql += " LIMIT ?"
    params.append(limit)

    rows = query_db(sql, tuple(params))
    return {"count": len(rows), "data": rows}

@app.get("/predict")
def predict(lat: float, lon: float, month: int, year: int):
    """
    Predict the top-3 most likely incident types at a given location and time.
    Returns: {"data": [{"type": "...", "probability": 0.xx}, ...]}
    """
    import numpy as np
    
    # Build a single-row feature array matching v1's training features
    X = [[lat, lon, month, year]]
    
    # predict_proba returns shape (1, n_classes)
    probabilities = predictor.predict_proba(X)[0]
    
    # Get top 3 indices, highest to lowest
    top3_indices = np.argsort(probabilities)[::-1][:3]
    
    # Map to class names + probabilities
    top3 = [
        {
            "type": predictor_classes[i],
            "probability": float(probabilities[i])
        }
        for i in top3_indices
    ]
    
    return {"data": top3}

@app.get("/historical-near-point")
def historical_near_point(lat: float, lon: float, radius_m: float = 500):
    """
    Return counts of incident types within `radius_m` of (lat, lon),
    using the R-Tree for fast spatial lookup.
    """
    # Convert radius in meters to degrees (approximate, fine at Lithuania latitude)
    # 1 degree latitude ≈ 111 km. 1 degree longitude at 55°N ≈ 64 km.
    lat_delta = radius_m / 111_000
    lon_delta = radius_m / 64_000

    sql = """
        SELECT e.lower_level_incident_type AS type, COUNT(*) AS count
        FROM events_rtree r
        JOIN events e ON e.rowid = r.id
        WHERE r.min_lat >= ? AND r.max_lat <= ?
          AND r.min_lon >= ? AND r.max_lon <= ?
        GROUP BY e.lower_level_incident_type
        ORDER BY count DESC
        LIMIT 3
    """
    params = (
        lat - lat_delta, lat + lat_delta,
        lon - lon_delta, lon + lon_delta,
    )
    rows = query_db(sql, params)

    # Also get the total count for context
    total_sql = """
        SELECT COUNT(*) as total
        FROM events_rtree r
        WHERE r.min_lat >= ? AND r.max_lat <= ?
          AND r.min_lon >= ? AND r.max_lon <= ?
    """
    total_row = query_db(total_sql, params)
    total = total_row[0]['total'] if total_row else 0

    return {"data": rows, "total": total, "radius_m": radius_m}