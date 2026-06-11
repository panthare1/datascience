from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware 
import sqlite3
import joblib
from pathlib import Path
import json

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


# ===== Per-city stats cache =====
# ===== Per-city stats cache (loaded from disk, see precompute_cities.py) =====
print("Loading city stats cache...")
with open(script_dir / 'city_stats.json', 'r', encoding='utf-8') as f:
    city_stats_cache = json.load(f)
print(f"  Loaded {len(city_stats_cache)} cities from cache")


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

@app.get("/danger-zones")
def danger_zones(
    min_lat: float, max_lat: float,
    min_lon: float, max_lon: float,
    cell_size: float = 0.05,
    year: int = None,
):
    """
    Aggregated grid of events tagged as violence or public-order disturbance.
    """
    danger_types = (
        'Smurtas artimoje aplinkoje',
        'Nusikaltimai asmeniui dabar',
        'Nusikaltimai asmeniui anksčiau',
        'Smurtas/prievartavimas',
        'Pasikorimas ir pasismaugimas',
        'Ginklai, šaudmenys, karo laikų sprogmenys',
        'Sprogimas ar sprogimo grėsmė',
        'Bandymas nusižudyti (savižudybės pavojus)',
        'Įvairūs viešosios tvarkos pažeidimai',
    )

    # Build the IN clause placeholders
    placeholders = ','.join(['?'] * len(danger_types))

    sql = f"""
        SELECT
            ROUND(e.latitude  / ?, 0) * ? AS cell_lat,
            ROUND(e.longitude / ?, 0) * ? AS cell_lon,
            COUNT(*) AS count
        FROM events_rtree r
        JOIN events e ON e.rowid = r.id
        WHERE r.min_lat >= ? AND r.max_lat <= ?
          AND r.min_lon >= ? AND r.max_lon <= ?
          AND e.lower_level_incident_type IN ({placeholders})
    """
    params = [cell_size, cell_size, cell_size, cell_size,
              min_lat, max_lat, min_lon, max_lon]
    params.extend(danger_types)

    if year is not None:
        sql += " AND e.year = ?"
        params.append(year)

    sql += " GROUP BY cell_lat, cell_lon"

    rows = query_db(sql, tuple(params))
    return {"data": rows}

@app.get("/stats/by-month")
def stats_by_month():
    """Returns total event count per (year, month) for the time series chart."""
    sql = """
        SELECT year, month, COUNT(*) as count
        FROM events
        WHERE data_quality_flag = 'ok'
        GROUP BY year, month
        ORDER BY year, month
    """
    rows = query_db(sql)
    # Add a 'period' string for chart label (e.g. '2022-03')
    for row in rows:
        row['period'] = f"{row['year']}-{row['month']:02d}"
    return {"data": rows}


@app.get("/stats/by-higher-type")
def stats_by_higher_type():
    """Returns event count per higher-level type (15 categories)."""
    sql = """
        SELECT higher_level_incident_type as type, COUNT(*) as count
        FROM events
        WHERE data_quality_flag = 'ok'
        GROUP BY higher_level_incident_type
        ORDER BY count DESC
    """
    rows = query_db(sql)
    return {"data": rows}


@app.get("/stats/by-year-and-type")
def stats_by_year_and_type():
    """Returns counts of top 5 higher-level types broken down by year (for the year-over-year chart)."""
    # First get the top 5 types overall
    top_types_sql = """
        SELECT higher_level_incident_type as type
        FROM events
        WHERE data_quality_flag = 'ok'
        GROUP BY higher_level_incident_type
        ORDER BY COUNT(*) DESC
        LIMIT 5
    """
    top_types = [r['type'] for r in query_db(top_types_sql)]

    # Then for each year, count events per top type
    placeholders = ','.join(['?'] * len(top_types))
    sql = f"""
        SELECT year, higher_level_incident_type as type, COUNT(*) as count
        FROM events
        WHERE data_quality_flag = 'ok'
          AND higher_level_incident_type IN ({placeholders})
        GROUP BY year, higher_level_incident_type
        ORDER BY year, type
    """
    rows = query_db(sql, tuple(top_types))

    # Pivot the data so each row is one year with all types as columns (recharts likes this shape)
    years = sorted(set(r['year'] for r in rows))
    pivoted = []
    for year in years:
        row = {'year': str(year)}
        for t in top_types:
            count = next((r['count'] for r in rows if r['year'] == year and r['type'] == t), 0)
            row[t] = count
        pivoted.append(row)

    return {"data": pivoted, "types": top_types}

@app.get("/region-stats")
def region_stats(city: str):
    """Returns pre-computed stats for one of the named cities."""
    if city not in city_stats_cache:
        return {"error": f"Unknown city: {city}"}
    return city_stats_cache[city]