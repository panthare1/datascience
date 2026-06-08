import sqlite3
import time

conn = sqlite3.connect('events.db')
cur = conn.cursor()

print("Creating R-Tree index...")
t = time.time()

# Create the R-Tree virtual table — SQLite's spatial index
cur.execute("""
    CREATE VIRTUAL TABLE IF NOT EXISTS events_rtree USING rtree(
        id,             -- rowid pointing back to events table
        min_lat, max_lat,
        min_lon, max_lon
    )
""")

# Populate it from the events table
# For point data, min and max are the same value
cur.execute("""
    INSERT OR REPLACE INTO events_rtree (id, min_lat, max_lat, min_lon, max_lon)
    SELECT rowid, latitude, latitude, longitude, longitude
    FROM events
""")

conn.commit()
print(f"R-Tree created and populated in {time.time() - t:.1f} seconds")

# Verify by counting
count = cur.execute("SELECT COUNT(*) FROM events_rtree").fetchone()[0]
print(f"R-Tree contains {count:,} entries")

conn.close()