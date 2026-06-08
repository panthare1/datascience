# Spatial indexing with R-Tree

This document explains how the project uses SQLite's R-Tree extension to make spatial queries fast. It's the reason the map feels responsive when you pan — without it, every pan would take ~250ms; with it, ~50ms.

## The problem

The `events` table contains roughly 1.97 million rows(before clustering). Every row has a `latitude` and `longitude`. The frontend map asks the backend "give me all events inside the visible map area" several times as the user pans. The query looks like:

```sql
SELECT * FROM events
WHERE latitude  BETWEEN ? AND ?
  AND longitude BETWEEN ? AND ?
LIMIT 1000
```

Without help, SQLite would have to scan every one of the 1.97M rows for each query, comparing each row's coordinates against the bounding box. Even with regular B-tree indexes on `latitude` and `longitude` separately, SQLite can only use one of them per query and still has to filter the rest manually. The result is slow queries — typical was around 240 ms per pan, which makes the map feel sluggish.

R-Tree is built specifically for this kind of question: "what's inside this 2D rectangle?"

## What R-Tree is

R-Tree is a data structure that organizes 2D (or higher-dimensional) regions hierarchically. Each node in the tree represents a rectangle, and its children are rectangles that fit inside it. To find what's inside a query rectangle, you descend through nodes whose rectangles overlap your query and skip nodes that don't.

Practically: with 1.97M points, R-Tree can typically narrow down to the ~1,000 points inside a city-block-sized box by visiting only a few dozen tree nodes. The rest of the data is never touched.

SQLite ships with R-Tree as an extension. We use the `USING rtree(...)` virtual-table mechanism to create one.

## Layout in `events.db`

The R-Tree lives alongside the main `events` table as a separate virtual table called `events_rtree`. It has five columns:

| Column   | Meaning                                                    |
|----------|------------------------------------------------------------|
| `id`     | Matches the corresponding row's `rowid` in `events`        |
| `min_lat`| Minimum latitude of the row's region                       |
| `max_lat`| Maximum latitude of the row's region                       |
| `min_lon`| Minimum longitude of the row's region                      |
| `max_lon`| Maximum longitude of the row's region                      |

Because every event is a point (not a polygon), `min_lat` and `max_lat` are both set to the event's latitude — and likewise for longitude. R-Tree is generic enough to handle this point-as-degenerate-rectangle case without complaint.

The `events_rtree` table does NOT contain a copy of the event details (incident type, year, month, etc.). It only contains coordinates. Think of it as a sidecar table: a spatial index that points into `events`.

Why this separation? SQLite's R-Tree extension requires its own virtual table — you can't add an R-Tree index directly to an existing table the way you'd add a regular index. The sidecar pattern is the standard workaround.

## How a query uses both tables

The `/events` and `/heatmap` endpoints in `server.py` use a join pattern:

```sql
SELECT e.*
FROM events_rtree r
JOIN events e ON e.rowid = r.id
WHERE r.min_lat >= ? AND r.max_lat <= ?
  AND r.min_lon >= ? AND r.max_lon <= ?
  AND ...                            -- optional filters on e.year, e.type, etc.
```

What happens at execution time:

1. SQLite uses the R-Tree to find rows in `events_rtree` whose coordinates fall in the bounding box. This is the fast step — narrows 1.97M down to whatever's inside the box (often hundreds to a few thousand).
2. The join links those rows to the matching `events` rows by `rowid` (SQLite's internal primary key, also fast).
3. Optional `WHERE` clauses on `events` columns (year, type, etc.) filter further.
4. `LIMIT 1000` (or similar) caps the result.

The performance improvement is dramatic when the visible area is small. Panning around Vilnius city center drops from ~240 ms to ~50 ms — a ~5x speedup. The improvement is smaller when the visible area is huge (zoomed out to all of Lithuania), since the R-Tree can't narrow as much there.

## How `events_rtree` was created

A one-time script `add_rtree.py` creates and populates the virtual table:

```sql
CREATE VIRTUAL TABLE events_rtree USING rtree(
    id, min_lat, max_lat, min_lon, max_lon
);

INSERT INTO events_rtree
SELECT rowid, latitude, latitude, longitude, longitude FROM events;
```

The first statement creates the virtual table. The second populates it by reading every row from `events` and inserting a corresponding rtree row with `min_lat = max_lat = latitude` and `min_lon = max_lon = longitude`.

This ran once after `build_db.py` finished. It takes maybe 30-60 seconds on 1.97M rows.

## Keeping the R-Tree in sync

The R-Tree is NOT automatically kept in sync with the `events` table. If new rows are inserted into `events`, they will NOT appear in `events_rtree` unless we explicitly insert them there too. Likewise for updates and deletes.

For this project that's not a problem — the data is static. We loaded once, built the R-Tree once, and never modify the rows. If we ever needed to add new emergency calls to the dataset, we'd need to either rebuild the R-Tree from scratch or write triggers to keep both tables in sync on insert/update/delete.

## Verifying it's working

A few sanity checks worth knowing:

**Row count match.** The R-Tree should have the same row count as the events table:

```sql
SELECT COUNT(*) FROM events;        -- ~1,970,922
SELECT COUNT(*) FROM events_rtree;  -- should match
```

If they differ significantly, the R-Tree got out of sync at some point and the spatial queries will return wrong results.

**Query plan inspection.** To confirm SQLite is actually using the R-Tree, prefix any spatial query with `EXPLAIN QUERY PLAN`:

```sql
EXPLAIN QUERY PLAN
SELECT e.* FROM events_rtree r JOIN events e ON e.rowid = r.id
WHERE r.min_lat >= 54.6 AND r.max_lat <= 54.8
  AND r.min_lon >= 25.1 AND r.max_lon <= 25.4;
```

You should see something like `SEARCH events_rtree VIRTUAL TABLE INDEX 2:D0D0D0D0` — the "VIRTUAL TABLE INDEX" part means R-Tree is being used.

## When NOT to use the R-Tree

A few cases where the R-Tree doesn't help:

- **Non-spatial queries.** `SELECT * FROM events WHERE year = 2022` doesn't need it; a regular index on `year` would help instead.
- **Lookup by `incident_id`.** `incident_id` has its own regular index; that's the right tool.
- **Cluster lookups.** "Get all events with cluster_id = X" uses the regular index we added on `cluster_id` (`idx_cluster` in `inject_clusters.py`); R-Tree wouldn't help.

R-Tree is only worth it when the query filters by a 2D bounding box. For other filters, regular indexes or full table scans are the right approach.

## Limitations

- **R-Tree assumes a flat plane.** It doesn't know latitude/longitude are spherical coordinates. For Lithuania-scale bounding boxes this is fine — the distortion at 55° N is small enough to ignore for "find events in a box" queries. It would be a problem if we tried to use the R-Tree for distance queries (the eps in DBSCAN, for example) — those need haversine math instead.
- **The R-Tree is built for the static dataset.** Adding new rows requires manual upkeep (see above).
- **Memory usage.** The R-Tree adds maybe 30-50 MB to `events.db`. Not a concern for a desktop project; would matter in a constrained embedded environment.

## File layout

- `add_rtree.py` — One-time script that creates and populates `events_rtree`
- `events.db` — Contains both `events` and `events_rtree`
- `server.py` — Uses the R-Tree in the `/events` and `/heatmap` endpoint queries