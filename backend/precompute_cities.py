"""
One-time script to precompute per-city stats and save to city_stats.json.
Run this manually whenever the cities list or events.db changes.
"""
import sqlite3
import json

DB_PATH = "events.db"
OUTPUT_PATH = "city_stats.json"

CITIES = [
    {'name': 'Vilnius',     'lat': 54.687, 'lon': 25.279},
    {'name': 'Kaunas',      'lat': 54.898, 'lon': 23.903},
    {'name': 'Klaipėda',    'lat': 55.708, 'lon': 21.131},
    {'name': 'Šiauliai',    'lat': 55.934, 'lon': 23.314},
    {'name': 'Panevėžys',   'lat': 55.733, 'lon': 24.357},
    {'name': 'Alytus',      'lat': 54.396, 'lon': 24.045},
    {'name': 'Marijampolė', 'lat': 54.555, 'lon': 23.354},
]

RADIUS_KM = 5

def query_db(sql, params=()):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    cur.execute(sql, params)
    rows = [dict(row) for row in cur.fetchall()]
    conn.close()
    return rows


print(f"Computing stats for {len(CITIES)} cities at {RADIUS_KM} km radius...")
city_stats = {}

for city in CITIES:
    name = city['name']
    lat = city['lat']
    lon = city['lon']
    lat_delta = RADIUS_KM / 111
    lon_delta = RADIUS_KM / 64
    bbox = (lat - lat_delta, lat + lat_delta, lon - lon_delta, lon + lon_delta)

    print(f"  {name}... ", end='', flush=True)

    bbox_filter = """
        FROM events_rtree r
        JOIN events e ON e.rowid = r.id
        WHERE r.min_lat >= ? AND r.max_lat <= ?
          AND r.min_lon >= ? AND r.max_lon <= ?
          AND e.data_quality_flag = 'ok'
    """

    total = query_db("SELECT COUNT(*) as total " + bbox_filter, bbox)[0]['total']

    top_types = query_db(f"""
        SELECT e.higher_level_incident_type as type, COUNT(*) as count
        {bbox_filter}
        GROUP BY e.higher_level_incident_type
        ORDER BY count DESC
        LIMIT 5
    """, bbox)

    monthly = query_db(f"""
        SELECT e.year as year, e.month as month, COUNT(*) as count
        {bbox_filter}
        GROUP BY e.year, e.month
        ORDER BY e.year, e.month
    """, bbox)
    for r in monthly:
        r['period'] = f"{r['year']}-{r['month']:02d}"

    city_stats[name] = {
        'total': total,
        'top_types': top_types,
        'monthly': monthly,
        'radius_km': RADIUS_KM,
    }
    print(f"{total:,} events")

with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(city_stats, f, ensure_ascii=False, indent=2)

print(f"\nSaved to {OUTPUT_PATH}")
print(f"File size: about {len(json.dumps(city_stats)) / 1024:.1f} KB")