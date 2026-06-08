"""
Fast injection: writes cluster_id from events_clustered.csv into events.db.
Uses bulk operations instead of per-row UPDATE.
"""

from pathlib import Path
import sqlite3
import pandas as pd
import time


def main():
    script_dir = Path(__file__).parent
    db_path = script_dir / 'events.db'
    csv_path = script_dir / 'events_clustered.csv'

    print(f"Reading {csv_path}...")
    df = pd.read_csv(csv_path, encoding='utf-8')
    print(f"  {len(df):,} rows loaded")

    # Keep only the columns we need for the join
    cluster_df = df[['incident_id', 'cluster_id']].copy()
    print(f"  {cluster_df['cluster_id'].notna().sum():,} rows have a cluster_id")

    print(f"\nConnecting to {db_path}...")
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Drop any leftover index from the previous attempt
    print("  Dropping any existing cluster_id index (will rebuild at end)...")
    cur.execute("DROP INDEX IF EXISTS idx_cluster")
    conn.commit()

    # Verify cluster_id column exists (it should from the previous attempt)
    existing_cols = [row[1] for row in cur.execute("PRAGMA table_info(events)").fetchall()]
    if 'cluster_id' not in existing_cols:
        print("  Adding cluster_id column...")
        cur.execute("ALTER TABLE events ADD COLUMN cluster_id TEXT")
        conn.commit()

    # Step 1: Bulk-write the (incident_id, cluster_id) pairs to a temp table
    print("\nStep 1/3: Bulk-writing cluster_id mapping to temp table...")
    t = time.time()
    cluster_df.to_sql('_cluster_map', conn, if_exists='replace', index=False)
    print(f"  Done in {time.time() - t:.1f}s")

    # Step 2: Index the temp table on incident_id for the join
    print("\nStep 2/3: Indexing temp table and updating events...")
    t = time.time()
    cur.execute("CREATE INDEX IF NOT EXISTS _cluster_map_idx ON _cluster_map(incident_id)")
    conn.commit()

    # Bulk UPDATE using the join
    cur.execute("""
        UPDATE events
        SET cluster_id = (
            SELECT cluster_id FROM _cluster_map WHERE _cluster_map.incident_id = events.incident_id
        )
    """)
    conn.commit()
    print(f"  Done in {time.time() - t:.1f}s")

    # Step 3: Clean up the temp table and rebuild the final index
    print("\nStep 3/3: Cleaning up and indexing cluster_id...")
    t = time.time()
    cur.execute("DROP TABLE _cluster_map")
    cur.execute("CREATE INDEX idx_cluster ON events(cluster_id)")
    conn.commit()
    print(f"  Done in {time.time() - t:.1f}s")

    # Verify
    print("\nVerifying...")
    total = cur.execute("SELECT COUNT(*) FROM events").fetchone()[0]
    clustered = cur.execute("SELECT COUNT(*) FROM events WHERE cluster_id IS NOT NULL").fetchone()[0]
    noise = cur.execute("SELECT COUNT(*) FROM events WHERE cluster_id LIKE 'noise-%'").fetchone()[0]
    real_clusters = cur.execute(
        "SELECT COUNT(DISTINCT cluster_id) FROM events WHERE cluster_id NOT LIKE 'noise-%' AND cluster_id IS NOT NULL"
    ).fetchone()[0]

    print(f"  Total rows:                {total:,}")
    print(f"  Rows with cluster_id set:  {clustered:,}")
    print(f"  Rows in real clusters:     {clustered - noise:,}")
    print(f"  Singleton (noise) markers: {noise:,}")
    print(f"  Distinct real clusters:    {real_clusters:,}")

    conn.close()
    print("\nDone.")


if __name__ == '__main__':
    main()