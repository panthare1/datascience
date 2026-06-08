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
  }, [eventType, year])   // <-- re-fetch whenever filters change

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

function MapView({ eventType, year }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
  const [events, setEvents] = useState([])
  const [cells, setCells] = useState([])
  const [bounds, setBounds] = useState(null)
  const [viewMode, setViewMode] = useState('pins')
  const [cellSize, setCellSize] = useState(0.05)
  const [error, setError] = useState(null)

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

  if (!apiKey) return <div>Missing VITE_GOOGLE_MAPS_API_KEY in .env.</div>
  if (error) return <div>Error loading data: {error}</div>

  const maxCount = cells.reduce((acc, c) => Math.max(acc, c.count), 0)

  return (
    <div>
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