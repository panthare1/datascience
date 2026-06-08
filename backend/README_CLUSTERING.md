# Duplicate-call clustering — methodology

This document describes the clustering pipeline that detects calls likely to refer to the same real-world incident. It's the result of decisions made during exploration; future improvements should start from here rather than redo it.

## Problem statement

The 112 emergency-call dataset contains 1,970,922 rows spanning roughly September 2021 through mid-2023. A single real-world incident (a car crash, a fight, a fire) typically produces multiple 112 calls as several bystanders report it. Each of these calls is logged as a separate row, inflating apparent event counts and adding noise to any downstream analysis that treats rows as distinct incidents.

The clustering pipeline assigns a `cluster_id` to each row such that rows sharing a `cluster_id` are likely reports of the same underlying incident. Rows judged unique get a unique `noise-N` identifier. Downstream consumers (the predictor, the danger-zone overlay, any analytics) should aggregate by `cluster_id` rather than by row.

## Data limitations that shaped the design

Three constraints in the source data drove key methodological choices:

**Timestamps are at month granularity.** The data contains `year` and `month` columns but no day, hour, or minute. The standard duplicate-detection approach in emergency-call literature uses a few-minute time window; that's unavailable here. The pipeline approximates by requiring duplicates to occur in the same month, which catches the obvious cases but cannot distinguish "two genuinely distinct incidents at the same intersection in the same month" from "one incident reported twice."

**No free-text descriptions.** Each row has a structured categorical label (`lower_level_incident_type`, one of 154 values) but no narrative description of the call. This rules out semantic similarity based on caller wording. The pipeline approximates by grouping the 154 categories into ~15 semantic buckets so that, for example, "fight" and "assault" can cluster together.

**Coordinates are precise but not labelled by event vs caller.** It is not always clear whether the recorded lat/lon is the incident location or the caller location. For most cases these are the same or close, but for unusual cases (a passing motorist phoning in from the next block) they diverge. The radius choice has to tolerate this ambiguity.

## Pipeline overview

The pipeline lives in `cluster_events.py` (logic) and `cluster_full.py` (the full-dataset production run). Output is written into the `cluster_id` column of `events.db` via `inject_clusters.py`.

Stage 1 — **Bucket assignment.** Every row is mapped to one of:

- A standard semantic bucket (`medical_general`, `public_order`, `traffic_violation`, `traffic_accident`, `fire`, `rescue`, `psychiatric`, `drugs`, `wildlife`, `lost_property`, `death`, `environmental`)
- A wildcard tag (`WILDCARD`) for categories so generic they could co-occur with any incident type
- A cross-bucket tag (`public_order+psychiatric`) for the one category that genuinely sits at an interpretive boundary
- An exclusion tag (`EXCLUDED`) for administrative / training / unclassified rows that are not real incidents
- A ground-truth tag (`EXCLUDED_GROUND_TRUTH`) for the 1,809 rows already labelled "Dubliuotas kvietimas" by operators

The mapping uses two dictionaries in `cluster_events.py`: `DEFAULT_BUCKET` provides per-higher-level defaults; `SPECIFIC_OVERRIDES` overrides individual lower-level categories where needed. Reading the dictionaries top-to-bottom is the authoritative answer; this prose is a summary.

Stage 2 — **Spatial clustering within (bucket, year, month).** For each combination of bucket and month, run DBSCAN with the haversine metric on the (latitude, longitude) coordinates. Points within 30m of each other form a cluster; points without enough close neighbours are marked as noise (singletons).

Wildcards are added to every bucket's clustering pass (because by definition they could belong to anything) but with a tighter 50m radius, to prevent them from creating long chain clusters across the city.

Cross-bucket categories (currently only `public_order+psychiatric`, for the single category `Neramumas / susijaudinimas`) are added to the clustering passes for both `public_order` and `psychiatric` separately.

Stage 3 — **Identifier assignment.** Cluster members get an identifier of the form `bucket-YYYY-MM-cN` (e.g., `medical_general-2022-03-c47`). Singletons get a unique label of the form `noise-N`. EXCLUDED and EXCLUDED_GROUND_TRUTH rows get no cluster identifier and are written as NULL in the database.

## Parameter values

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Spatial radius (standard) | 30 m | Tight enough to avoid chain clustering in dense cities; loose enough to tolerate GPS imprecision and "same intersection" reports |
| Spatial radius (wildcards) | 50 m | Tighter for categories that could cross-cluster with any bucket |
| Minimum cluster size | 2 | At least two calls within radius are needed to form a cluster |
| Time window | Same calendar month | The finest granularity the data permits |
| Metric | Haversine | Honest great-circle distance on a sphere, given lat/lon inputs |
| Algorithm | DBSCAN | Density-based, doesn't require pre-specifying cluster count, supports noise labels |

The standard radius was chosen after a sweep over `{150, 50, 30, 20}` metres on a Vilnius March 2022 subset. The 150m setting produced chain clusters (largest 7,031 members across central Vilnius — clearly an artefact). 30m gave a maximum cluster size of 10 on the subset and 40 on the full dataset, with no chain monsters and a sensible singleton fraction (~87% on the full data).

## Evaluation

The dataset contains 1,809 rows already labelled `Dubliuotas kvietimas` ("duplicated call") by operators. These were held out of the clustering input and used as ground truth for evaluation.

The evaluation measures **spatial recall**: for each ground-truth row, is there at least one other call within 30m in the same month? The fraction with at least one such neighbour is the spatial recall at 30m.

Results on the full March 2022 subset (106 ground-truth rows):

| Radius | Spatial recall |
|--------|----------------|
| 30 m  | 18.9% |
| 50 m  | 33.0% |
| 100 m | 50.0% |
| 150 m | 57.5% |
| 300 m | 80.2% |

Honest interpretation: at the chosen 30m radius, the pipeline recovers only about one in five of the operator-confirmed duplicates. The recall climbs steadily as the radius loosens, suggesting many real duplicates are between 30m and 300m apart — further than our radius will catch.

Two reasons recall is low at 30m. First, our radius is conservative: it was chosen to avoid chain artefacts in dense areas, at the cost of missing real but more-distant duplicate calls. Second, even at 300m we miss ~20% of ground-truth rows, suggesting some of those operator-labelled duplicates aren't spatial-temporal duplicates at all — possibly the recorded location is the dispatcher's location, possibly the duplicate is across a month boundary, possibly the labelling itself is noisy.

We accept the 19% recall as the v1 baseline. The downstream features (predictor, danger zones) are built on the clustered data with this limitation documented.

## Known limitations

- **Recall is low.** As above. About 80% of operator-confirmed duplicates are not recovered by the spatial-only approach at 30m.
- **No temporal resolution within months.** Two distinct incidents at the same intersection in the same month will be merged if they happen to be within 30m.
- **DBSCAN can chain.** Mitigated by the tight radius but not fully prevented. Larger clusters on the full dataset (40 members) should be inspected; some may still be artefacts of dense areas (e.g., outside major hospitals or police stations).
- **Bucket assignments are manual.** The 154 → 15 mapping was done by hand based on conversation with a Lithuanian-speaking project owner. Errors are possible, especially for rare categories at the long tail. The dictionaries in `cluster_events.py` are the source of truth.
- **Ground-truth noise.** The `Dubliuotas kvietimas` category itself appears to contain rows that aren't strictly spatial duplicates, complicating evaluation.

## What would improve this with better data

- **Hour or minute-level timestamps** would allow a real temporal window (e.g., 20 minutes), which is the standard approach in the field. Spatial recall would likely improve substantially.
- **Free-text call descriptions** would allow language-model-based semantic clustering, replacing the manual bucket dictionary.
- **A second clustering algorithm** (HDBSCAN, or complete-linkage hierarchical clustering) might handle variable density better than DBSCAN, allowing a wider radius without chain artefacts.

## How to re-run

From the project's backend folder, with the virtual environment activated:

```
python cluster_full.py        # clusters full dataset, writes events_clustered.csv
python inject_clusters.py     # writes cluster_id column into events.db
```

The full-dataset clustering run takes about 2 minutes. The database injection takes longer due to per-row UPDATE overhead; a faster rewrite using bulk table rebuild is a known improvement.

## File layout

- `cluster_events.py` — Bucket definitions, clustering function, subset diagnostics
- `cluster_full.py` — Production run on full dataset → `events_clustered.csv`
- `inject_clusters.py` — `events_clustered.csv` → `events.db.cluster_id`
- `events_clustered.csv` — Output of `cluster_full.py`; the canonical clustered dataset
- `events.db` — SQLite database; after `inject_clusters.py` it has `cluster_id` populated
