"""
Production clustering run: full dataset at 30m radius.
Writes results to events_clustered.csv (does NOT modify events.db).
"""

from pathlib import Path
import time
import numpy as np
import pandas as pd

# Import shared logic from cluster_events.py
from cluster_events import (
    assign_bucket, run_clustering, EARTH_RADIUS_M,
)
import cluster_events

# Set the radius
cluster_events.STANDARD_RADIUS_M = 30


if __name__ == '__main__':
    script_dir = Path(__file__).parent
    print("Loading data...")
    df = pd.read_csv(script_dir / '112_final.csv', encoding='utf-8')
    print(f"  {len(df):,} rows loaded")

    print("Assigning buckets...")
    df['bucket'] = df.apply(
        lambda r: assign_bucket(r['higher_level_incident_type'],
                                 r['lower_level_incident_type']),
        axis=1
    )

    # Eligible-for-clustering subset (whole country, all months)
    clusterable = df[
        ~df['bucket'].isin(['EXCLUDED', 'EXCLUDED_GROUND_TRUTH'])
    ].copy()
    print(f"  Clusterable rows: {len(clusterable):,}")

    print(f"\nRunning clustering on full dataset (radius={cluster_events.STANDARD_RADIUS_M}m)...")
    print("  This will take several minutes — be patient.")
    t = time.time()
    clustered = run_clustering(clusterable)
    elapsed = time.time() - t
    print(f"  Completed in {elapsed/60:.1f} minutes")

    # Quick result summary
    real_clusters = clustered[~clustered['cluster_id'].str.startswith('noise-')]
    cluster_sizes = real_clusters['cluster_id'].value_counts()
    print(f"\n  Rows in real clusters: {len(real_clusters):,}")
    print(f"  Rows as singletons:    {len(clustered) - len(real_clusters):,}")
    print(f"  Distinct clusters:     {len(cluster_sizes):,}")
    print(f"  Largest cluster:       {cluster_sizes.iloc[0]} members")

    # Merge back to the full df so EXCLUDED rows also get rows in the output
    # (they'll have cluster_id = NaN, which is fine — they're not clustered)
    df = df.merge(
        clustered[['incident_id', 'cluster_id']],
        on='incident_id',
        how='left',
    )

    # Save
    out_path = script_dir / 'events_clustered.csv'
    print(f"\nSaving to {out_path}...")
    df.to_csv(out_path, index=False, encoding='utf-8')
    print(f"  Saved {len(df):,} rows")