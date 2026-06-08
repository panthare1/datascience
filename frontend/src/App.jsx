import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps'

function Stats({ eventType, year }) {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams()
    if (eventType) params.set('event_type', eventType)
    if (year) params.set('year', year)

    fetch(`http://127.0.0.1:8000/stats/by-type?${params}`)
      .then(response => response.json())
      .then(data => setStats(data.data))
      .catch(err => setError(err.message))
  }, [eventType, year])

  if (error) return <div>Error loading data: {error}</div>
  if (stats === null) return <div>Loading...</div>

  return (
    <div>
      <h2>Events by category</h2>
      <ul>
        {stats.map(row => (
          <li key={row.type}>
            <strong>{row.type}</strong>: {row.count.toLocaleString()}
          </li>
        ))}
      </ul>
    </div>
  )
}

function MapBoundsWatcher({ onBoundsChanged }) {
  const map = useMap()

  useEffect(() => {
    if (!map) return

    let timeoutId = null
    let lastBoundsKey = null

    const fireUpdate = () => {
      const bounds = map.getBounds()
      if (!bounds) return
      const sw = bounds.getSouthWest()
      const ne = bounds.getNorthEast()

      const key = `${sw.lat().toFixed(4)},${sw.lng().toFixed(4)},${ne.lat().toFixed(4)},${ne.lng().toFixed(4)}`
      if (key === lastBoundsKey) return
      lastBoundsKey = key

      onBoundsChanged({
        min_lat: sw.lat(),
        max_lat: ne.lat(),
        min_lon: sw.lng(),
        max_lon: ne.lng(),
      })
    }

    const listener = map.addListener('idle', () => {
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(fireUpdate, 150)
    })

    return () => {
      listener.remove()
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [map, onBoundsChanged])

  return null
}

function MapClickHandler({ onMapClick }) {
  const map = useMap()

  useEffect(() => {
    if (!map) return
    const listener = map.addListener('click', (e) => {
      onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() })
    })
    return () => listener.remove()
  }, [map, onMapClick])

  return null
}

function HeatmapCell({ cell, cellSize, maxCount }) {
  const map = useMap()

  useEffect(() => {
    if (!map) return

    const intensity = maxCount > 0 ? cell.count / maxCount : 0
    const hue = (1 - intensity) * 60   // 60 = yellow, 0 = red
    const color = `hsl(${hue}, 100%, 50%)`

    const halfSize = cellSize / 2
    const rectangle = new window.google.maps.Rectangle({
      bounds: {
        south: cell.cell_lat - halfSize,
        north: cell.cell_lat + halfSize,
        west: cell.cell_lon - halfSize,
        east: cell.cell_lon + halfSize,
      },
      strokeWeight: 0,
      fillColor: color,
      fillOpacity: 0.5,
      map: map,
      clickable: false,
    })

    return () => rectangle.setMap(null)
  }, [map, cell, cellSize, maxCount])

  return null
}

function PredictionPanel({ prediction, loading, error, onClose }) {
  if (!prediction && !loading && !error) return null

  const historical = prediction?.historical
  const predicted = prediction?.predicted

  const histData = historical?.data || []
  const histMax = histData.length > 0 ? Math.max(...histData.map(d => d.count)) : 0

  const predData = predicted?.data || []
  const predMax = predData.length > 0 ? Math.max(...predData.map(d => d.probability)) : 0

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      width: '360px',
      backgroundColor: 'white',
      padding: '16px',
      borderRadius: '8px',
      boxShadow: '0 2px 12px rgba(0, 0, 0, 0.15)',
      zIndex: 1000,
      fontFamily: 'sans-serif',
      maxHeight: '85vh',
      overflowY: 'auto',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <strong>Incident analysis at this point</strong>
        <button
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '18px' }}
        >×</button>
      </div>

      {loading && <div style={{ fontSize: '13px', color: '#666' }}>Loading...</div>}
      {error && <div style={{ color: 'red', fontSize: '13px' }}>Error: {error}</div>}

      {prediction && (
        <>
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
              Nearby historical events
            </div>

            {histData.length === 0 ? (
              <div style={{ fontSize: '12px', color: '#666' }}>
                No events within {historical?.radius_m || 500}m of this point.
              </div>
            ) : (
              <>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
                  Based on <strong>{historical.total.toLocaleString()}</strong> events within {historical.radius_m}m. Top 3 types:
                </div>
                {histData.map((item, i) => (
                  <div key={i} style={{ marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                      <span>{item.type}</span>
                      <span><strong>{item.count.toLocaleString()}</strong></span>
                    </div>
                    <div style={{ height: '7px', backgroundColor: '#eee', borderRadius: '4px', overflow: 'hidden', marginTop: '2px' }}>
                      <div style={{
                        height: '100%',
                        width: `${(item.count / histMax) * 100}%`,
                        backgroundColor: '#4a90e2',
                      }} />
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          <div style={{ borderTop: '1px solid #eee', marginBottom: '14px' }} />

          <div>
            <div style={{ fontSize: '13px', fontWeight: 'bold', marginBottom: '8px' }}>
              Model prediction
            </div>
            <div style={{ fontSize: '11px', color: '#666', marginBottom: '8px' }}>
              From a classifier trained on 1.35M events. Top 3 most likely types:
            </div>
            {predData.map((item, i) => (
              <div key={i} style={{ marginBottom: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span>{item.type}</span>
                  <span><strong>{(item.probability * 100).toFixed(1)}%</strong></span>
                </div>
                <div style={{ height: '7px', backgroundColor: '#eee', borderRadius: '4px', overflow: 'hidden', marginTop: '2px' }}>
                  <div style={{
                    height: '100%',
                    width: `${(item.probability / predMax) * 100}%`,
                    backgroundColor: '#e67e22',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function MapView({ eventType, year }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const [events, setEvents] = useState([])
  const [cells, setCells] = useState([])
  const [bounds, setBounds] = useState(null)
  const [viewMode, setViewMode] = useState('pins')
  const [cellSize, setCellSize] = useState(0.05)
  const [error, setError] = useState(null)

  const [prediction, setPrediction] = useState(null)
  const [predictionLoading, setPredictionLoading] = useState(false)
  const [predictionError, setPredictionError] = useState(null)

  useEffect(() => {
    if (!bounds) return

    if (viewMode === 'pins') {
      const params = new URLSearchParams({
        min_lat: bounds.min_lat,
        max_lat: bounds.max_lat,
        min_lon: bounds.min_lon,
        max_lon: bounds.max_lon,
        limit: 1000,
      })
      if (eventType) params.set('event_type', eventType)
      if (year) params.set('year', year)

      fetch(`http://127.0.0.1:8000/events?${params}`)
        .then(r => r.json())
        .then(data => setEvents(data.data))
        .catch(err => setError(err.message))
    } else {
      const params = new URLSearchParams({
        min_lat: bounds.min_lat,
        max_lat: bounds.max_lat,
        min_lon: bounds.min_lon,
        max_lon: bounds.max_lon,
        cell_size: cellSize,
      })
      if (eventType) params.set('event_type', eventType)
      if (year) params.set('year', year)

      fetch(`http://127.0.0.1:8000/heatmap?${params}`)
        .then(r => r.json())
        .then(data => setCells(data.data))
        .catch(err => setError(err.message))
    }
  }, [bounds, eventType, year, viewMode, cellSize])

  const handleMapClick = ({ lat, lng }) => {
    setPredictionLoading(true)
    setPrediction(null)
    setPredictionError(null)

    const histParams = new URLSearchParams({ lat, lon: lng, radius_m: 500 })
    const predParams = new URLSearchParams({ lat, lon: lng, month: 6, year: 2022 })

    Promise.all([
      fetch(`http://127.0.0.1:8000/historical-near-point?${histParams}`).then(r => r.json()),
      fetch(`http://127.0.0.1:8000/predict?${predParams}`).then(r => r.json()),
    ])
      .then(([historical, predicted]) => {
        setPrediction({ historical, predicted })
        setPredictionLoading(false)
      })
      .catch(err => {
        setPredictionError(err.message)
        setPredictionLoading(false)
      })
  }

  if (!apiKey) return <div>Missing VITE_GOOGLE_MAPS_API_KEY in .env.</div>
  if (error) return <div>Error loading data: {error}</div>

  const maxCount = cells.reduce((acc, c) => Math.max(acc, c.count), 0)

  return (
    <div>
      <PredictionPanel
        prediction={prediction}
        loading={predictionLoading}
        error={predictionError}
        onClose={() => setPrediction(null)}
      />

      <div style={{ marginBottom: '10px', display: 'flex', gap: '15px', alignItems: 'center' }}>
        <label>
          <input type="radio" name="mode" value="pins"
                 checked={viewMode === 'pins'}
                 onChange={() => setViewMode('pins')} /> Pins
        </label>
        <label>
          <input type="radio" name="mode" value="heatmap"
                 checked={viewMode === 'heatmap'}
                 onChange={() => setViewMode('heatmap')} /> Heatmap
        </label>
        {viewMode === 'heatmap' && (
          <label>
            Cell size:{' '}
            <select value={cellSize} onChange={e => setCellSize(parseFloat(e.target.value))}>
              <option value="0.01">Fine (~1 km)</option>
              <option value="0.05">Medium (~5 km)</option>
              <option value="0.1">Coarse (~10 km)</option>
            </select>
          </label>
        )}
        <span>
          {viewMode === 'pins'
            ? `${events.length} events shown`
            : `${cells.length} cells shown`}
        </span>
      </div>

      <APIProvider apiKey={apiKey}>
        <Map
          style={{ width: '100%', height: '600px' }}
          defaultCenter={{ lat: 54.69, lng: 25.28 }}
          defaultZoom={11}
          mapId="lt112-map"
        >
          <MapBoundsWatcher onBoundsChanged={setBounds} />
          <MapClickHandler onMapClick={handleMapClick} />

          {viewMode === 'pins' && events.map(event => (
            <AdvancedMarker
              key={event.object_id ?? `${event.latitude},${event.longitude}`}
              position={{ lat: event.latitude, lng: event.longitude }}
              title={`${event.higher_level_incident_type}\n${event.lower_level_incident_type}\n${event.year}-${event.month}`}
            />
          ))}

          {viewMode === 'heatmap' && cells.map(cell => (
            <HeatmapCell
              key={`${cell.cell_lat},${cell.cell_lon}`}
              cell={cell}
              cellSize={cellSize}
              maxCount={maxCount}
            />
          ))}
        </Map>
      </APIProvider>
    </div>
  )
}

function App() {
  const [eventType, setEventType] = useState('')
  const [year, setYear] = useState('')
  const [allTypes, setAllTypes] = useState([])

  useEffect(() => {
    fetch('http://127.0.0.1:8000/stats/by-type')
      .then(response => response.json())
      .then(data => setAllTypes(data.data.map(row => row.type)))
      .catch(() => setAllTypes([]))
  }, [])

  return (
    <BrowserRouter>
      <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
        <h1>Lithuania 112 Events</h1>

        <nav style={{ marginBottom: '20px', display: 'flex', gap: '15px' }}>
          <Link to="/stats">Stats</Link>
          <Link to="/map">Map</Link>
        </nav>

        <div style={{ marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center' }}>
          <label>
            Event type:{' '}
            <select value={eventType} onChange={e => setEventType(e.target.value)}>
              <option value="">All types</option>
              {allTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </label>

          <label>
            Year:{' '}
            <select value={year} onChange={e => setYear(e.target.value)}>
              <option value="">All years</option>
              <option value="2021">2021</option>
              <option value="2022">2022</option>
              <option value="2023">2023</option>
            </select>
          </label>
        </div>

        <Routes>
          <Route path="/" element={<Stats eventType={eventType} year={year} />} />
          <Route path="/stats" element={<Stats eventType={eventType} year={year} />} />
          <Route path="/map" element={<MapView eventType={eventType} year={year} />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App