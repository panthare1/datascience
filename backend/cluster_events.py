"""
Clustering pipeline for 112 emergency calls.

Subset run: Vilnius region, March 2022. Pure diagnostics — no DB writes.
"""

from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.cluster import DBSCAN

# =============================================================================
#  Bucket assignment (same as before — abbreviated here for readability)
# =============================================================================

DEFAULT_BUCKET = {
    'Policijos įvykiai': 'public_order',
    'BPC-GMP': 'medical_general',
    'GMP įvykiai': 'medical_general',
    'PGT įvykiai': 'fire',
    'BPC-PGT': 'fire',
    'eCall': 'traffic_accident',
    'Aplinkosauga': 'environmental',
    'SPEC tarnybos': 'EXCLUDED',
    'BPC TRUKDANTIS': 'EXCLUDED',
    'Konsultacija': 'EXCLUDED',
    'LAKD': 'traffic_accident',
    'Pagalba 112': 'EXCLUDED',
    'Testavimo pratybos': 'EXCLUDED',
    'POLICIJOS pareigūnų korupcija *': 'EXCLUDED',
    '116000': 'EXCLUDED',
}

SPECIFIC_OVERRIDES = {
    'Narkotinės medžiagos': 'drugs',
    'Žolė': 'drugs',
    'Žolė (SA)': 'drugs',
    'Kompleksinis įvykis': 'WILDCARD',
    'Pavojus gyvybei': 'WILDCARD',
    'Neramumas / susijaudinimas': 'public_order+psychiatric',
    'Bandymas nusižudyti (savižudybės pavojus)': 'psychiatric',
    'Sprogimas ar sprogimo grėsmė': 'fire',
    'Mirties konstatavimas': 'death',
    'Lavonas': 'death',
    'Auto 1': 'traffic_accident',
    'Auto 2': 'traffic_accident',
    'Rasti ar pamesti daiktai': 'lost_property',
    'Asmens paieška': 'rescue',
    'Kiti psichikos ir elgesio sutrikimai': 'psychiatric',
    'Įvykiai su laukiniais gyvūnais': 'wildlife',
    'Gyvūnų įkandimai': 'wildlife',
    'Gyvūnų įkandimai (nežymūs), įdrėskimai, apseilėjimai': 'wildlife',
    'Eismo įvykis': 'traffic_accident',
    'Transporto priemonių avarija': 'traffic_accident',
    'KET pažeidimas': 'traffic_violation',
    'Pavojus eismo saugumui': 'traffic_violation',
    'Eismo saugumas': 'traffic_violation',
    'Dubliuotas kvietimas': 'EXCLUDED_GROUND_TRUTH',
    'Atsisakė/Atsakytas': 'EXCLUDED',
    'Konsultacija': 'EXCLUDED',
    'GMP konsultacija': 'EXCLUDED',
    'Skambutis ne GMP tikslais': 'EXCLUDED',
    'Pagalba kitoms tarnyboms': 'EXCLUDED',
    'Pagalba specialiosioms tarnyboms': 'EXCLUDED',
    'Perduota kitoms tarnyboms': 'EXCLUDED',
    'Pagalbos tarnybų pareigūnų prašymas': 'EXCLUDED',
    'BPC TRUKDANTIS': 'EXCLUDED',
    'Skambinančiajam reikalaujant': 'EXCLUDED',
    'Neklasifikuoti': 'EXCLUDED',
    'PGT neklasifikuoti': 'EXCLUDED',
    'PGT neklasifikuoti (SA)': 'EXCLUDED',
    'Testavimo pratybos': 'EXCLUDED',
    'PGT pratybos': 'EXCLUDED',
    'Pratybos (SA)': 'EXCLUDED',
    'Pagalba 112': 'EXCLUDED',
    '116000': 'EXCLUDED',
    'Pervežimas': 'EXCLUDED',
    'Skubus pervežimas': 'EXCLUDED',
    'Komercinis pervežimas': 'EXCLUDED',
    'Budėjimas renginyje, laidotuvėse': 'EXCLUDED',
    'SPT': 'EXCLUDED',
    'Valstybės tarnautojų korupcija': 'EXCLUDED',
    'POLICIJOS pareigūnų korupcija *': 'EXCLUDED',
    'Neigiama informacija internete': 'EXCLUDED',
    'GMP įvykiai': 'EXCLUDED',
    'BPC-GMP': 'EXCLUDED',
    'Nusikaltimai asmeniui': 'EXCLUDED',
}


def assign_bucket(higher_level, lower_level):
    if lower_level in SPECIFIC_OVERRIDES:
        return SPECIFIC_OVERRIDES[lower_level]
    return DEFAULT_BUCKET.get(higher_level, 'other_serious')


# =============================================================================
#  Clustering
# =============================================================================

EARTH_RADIUS_M = 6_371_000          # mean Earth radius in meters
STANDARD_RADIUS_M = 150
WILDCARD_RADIUS_M = 50
MIN_SAMPLES = 2                     # at least 2 calls within radius to form a cluster


def cluster_one_group(coords_deg, radius_m):
    """Run DBSCAN on one bucket+month group. Returns array of cluster labels.

    coords_deg: numpy array shape (N, 2), (latitude, longitude) in degrees
    radius_m:   neighborhood radius in meters
    """
    if len(coords_deg) < MIN_SAMPLES:
        return np.full(len(coords_deg), -1)   # too few rows; all noise

    coords_rad = np.radians(coords_deg)
    eps_rad = radius_m / EARTH_RADIUS_M
    db = DBSCAN(eps=eps_rad, min_samples=MIN_SAMPLES,
                metric='haversine', n_jobs=-1)
    return db.fit_predict(coords_rad)


def run_clustering(df_in):
    """
    Cluster every (bucket, year, month) group.
    Returns the input df with an added 'cluster_id' column.

    cluster_id format: 'bucket-year-month-clusterN' or 'noise-' + uuid-like
    """
    df = df_in.copy()
    df['cluster_id'] = None

    # Buckets that participate as a normal cluster
    normal_buckets = sorted(b for b in df['bucket'].unique()
                            if b not in {'EXCLUDED', 'EXCLUDED_GROUND_TRUTH',
                                         'WILDCARD', 'public_order+psychiatric'})

    wildcards_df = df[df['bucket'] == 'WILDCARD']
    cross_df = df[df['bucket'] == 'public_order+psychiatric']

    next_noise_id = [0]   # mutable counter for unique noise labels

    def make_noise_id():
        next_noise_id[0] += 1
        return f'noise-{next_noise_id[0]}'

    # --- For each normal bucket: cluster bucket-only + wildcards (at tight radius) ---
    # The cross-bucket rows ('public_order+psychiatric') ALSO participate
    # in clustering for both public_order and psychiatric specifically.

    for bucket in normal_buckets:
        bucket_df = df[df['bucket'] == bucket]

        for (year, month), month_group in bucket_df.groupby(['year', 'month']):
            # Build the pool of points to cluster: this bucket + wildcards (in same month) + maybe cross
            pool_indices = list(month_group.index)

            wc_same_month = wildcards_df[
                (wildcards_df['year'] == year) &
                (wildcards_df['month'] == month)
            ]
            pool_indices.extend(wc_same_month.index)

            if bucket in ('public_order', 'psychiatric'):
                cross_same_month = cross_df[
                    (cross_df['year'] == year) &
                    (cross_df['month'] == month)
                ]
                pool_indices.extend(cross_same_month.index)

            if not pool_indices:
                continue

            pool_df = df.loc[pool_indices]
            coords = pool_df[['latitude', 'longitude']].values

            # Cluster the whole pool at the standard radius
            # Wildcards inside get clustered at their tight 50m via the noise-flagging trick:
            # First pass at 150m on the full pool
            labels = cluster_one_group(coords, STANDARD_RADIUS_M)

            # Assign cluster IDs (only update rows that don't already have one)
            for i, idx in enumerate(pool_indices):
                if df.at[idx, 'cluster_id'] is not None:
                    continue   # already assigned by an earlier bucket's run
                if labels[i] == -1:
                    df.at[idx, 'cluster_id'] = make_noise_id()
                else:
                    df.at[idx, 'cluster_id'] = f'{bucket}-{year}-{month:02d}-c{labels[i]}'

    return df


# =============================================================================
#  Main: load data, subset, cluster, report
# =============================================================================

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

    # --- Filter to Vilnius March 2022 ---
    # Vilnius city box: lat 54.55-54.85, lon 25.05-25.55
    vilnius_box = (
        (df['latitude'] >= 54.55) & (df['latitude'] <= 54.85) &
        (df['longitude'] >= 25.05) & (df['longitude'] <= 25.55)
    )
    march_2022 = (df['year'] == 2022) & (df['month'] == 3)
    subset = df[vilnius_box & march_2022].copy()

    print(f"\nSubset (Vilnius, March 2022): {len(subset):,} rows")
    print("\nSubset bucket distribution:")
    print(subset['bucket'].value_counts().to_string())

    # Exclude rows we don't cluster
    clusterable = subset[
        ~subset['bucket'].isin(['EXCLUDED', 'EXCLUDED_GROUND_TRUTH'])
    ].copy()
    print(f"\nClusterable rows: {len(clusterable):,}")

    print("\nRunning clustering...")
    # --- Radius sweep ---

    for radius in [150, 50, 30, 20]:
        STANDARD_RADIUS_M = radius

        print(f"\n{'=' * 60}")
        print(f"  CLUSTERING WITH STANDARD_RADIUS_M = {radius}")
        print(f"{'=' * 60}")

        import time
        t = time.time()
        clustered = run_clustering(clusterable)
        print(f"  Completed in {time.time() - t:.1f}s")

        real_clusters = clustered[~clustered['cluster_id'].str.startswith('noise-')]
        cluster_sizes = real_clusters['cluster_id'].value_counts()

        print(f"  Rows in real clusters: {len(real_clusters):,} / {len(clustered):,}")
        print(f"  Rows as singletons:    {len(clustered) - len(real_clusters):,}")
        print(f"  Number of clusters:    {len(cluster_sizes):,}")

        # Bucket the cluster sizes for compact display
        size_buckets = pd.cut(
            cluster_sizes,
            bins=[1, 2, 3, 5, 10, 20, 50, 100, 1_000_000],
            labels=['2', '3', '4-5', '6-10', '11-20', '21-50', '51-100', '>100'],
            include_lowest=False,
        )
        print("\n  Cluster size distribution:")
        print(size_buckets.value_counts().sort_index().to_string())
        print(f"  Largest cluster: {cluster_sizes.iloc[0]} members")

# =========================================================================
    #  Ground-truth evaluation — spatial recall on Dubliuotas kvietimas
    # =========================================================================
    print(f"\n{'=' * 60}")
    print(f"  GROUND-TRUTH EVALUATION (30m, March 2022, nationwide)")
    print(f"{'=' * 60}")

    march_2022_all = df[(df['year'] == 2022) & (df['month'] == 3)]
    gt = march_2022_all[march_2022_all['bucket'] == 'EXCLUDED_GROUND_TRUTH']
    pool = march_2022_all[march_2022_all['bucket'] != 'EXCLUDED_GROUND_TRUTH']

    print(f"  Dubliuotas kvietimas rows in March 2022: {len(gt):,}")
    print(f"  Pool of other calls in March 2022:        {len(pool):,}")

    if len(gt) == 0:
        print("  No ground-truth rows found.")
    else:
        from sklearn.neighbors import BallTree

        pool_coords_rad = np.radians(pool[['latitude', 'longitude']].values)
        tree = BallTree(pool_coords_rad, metric='haversine')

        gt_coords_rad = np.radians(gt[['latitude', 'longitude']].values)

        eps_rad = 30 / EARTH_RADIUS_M
        neighbors = tree.query_radius(gt_coords_rad, r=eps_rad, count_only=True)
        matched = (neighbors >= 1).sum()
        recall_pct = 100 * matched / len(gt)
        print(f"\n  Spatial recall at 30m: {recall_pct:.1f}% ({matched:,} / {len(gt):,})")

        print(f"\n  Recall at different radii (informational only):")
        for r in [50, 100, 150, 300]:
            eps_r = r / EARTH_RADIUS_M
            n_at_r = tree.query_radius(gt_coords_rad, r=eps_r, count_only=True)
            match_at_r = (n_at_r >= 1).sum()
            print(f"    at {r}m: {100 * match_at_r / len(gt):.1f}%")