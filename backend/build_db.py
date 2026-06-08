import pandas as pd
import sqlite3

print("Loading final CSV...")
df = pd.read_csv('112_final.csv', encoding='utf-8')
print(f"Loaded {len(df):,} rows")
print("Columns:", df.columns.tolist())

# Create / overwrite the SQLite database
print("Building SQLite database...")
conn = sqlite3.connect('events.db')

# Write the dataframe into a table called 'events'
df.to_sql('events', conn, if_exists='replace', index=False)

# Create indexes so queries are fast
cur = conn.cursor()
cur.execute("CREATE INDEX idx_year_month ON events(year, month)")
cur.execute("CREATE INDEX idx_higher_type ON events(higher_level_incident_type)")
cur.execute("CREATE INDEX idx_coords ON events(latitude, longitude)")
cur.execute("CREATE INDEX idx_flag ON events(data_quality_flag)")
conn.commit()

# Verify the table was created and has the expected number of rows
row_count = cur.execute("SELECT COUNT(*) FROM events").fetchone()[0]
print(f"Database built. 'events' table has {row_count:,} rows.")

# Show a sample query: counts by higher-level type
print("\nSample query — events per higher-level type:")
for row in cur.execute("""
    SELECT higher_level_incident_type, COUNT(*) as n
    FROM events
    GROUP BY higher_level_incident_type
    ORDER BY n DESC
    LIMIT 5
"""):
    print(f"  {row[0]}: {row[1]:,}")

conn.close()
print("\nDone. Created events.db")