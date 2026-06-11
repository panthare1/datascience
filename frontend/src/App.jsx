import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps'

const CITIES = [
  { name: 'Vilnius',    lat: 54.687, lon: 25.279 },
  { name: 'Kaunas',     lat: 54.898, lon: 23.903 },
  { name: 'Klaipėda',   lat: 55.708, lon: 21.131 },
  { name: 'Šiauliai',   lat: 55.934, lon: 23.314 },
  { name: 'Panevėžys',  lat: 55.733, lon: 24.357 },
  { name: 'Alytus',     lat: 54.396, lon: 24.045 },
  { name: 'Marijampolė', lat: 54.555, lon: 23.354 },
]

function Compare() {
  const [cityA, setCityA] = useState('Vilnius')
  const [cityB, setCityB] = useState('Kaunas')
  const [statsA, setStatsA] = useState(null)
  const [statsB, setStatsB] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    
  Promise.all([
    fetch(`http://127.0.0.1:8000/region-stats?city=${encodeURIComponent(cityA)}`).then(r => r.json()),
    fetch(`http://127.0.0.1:8000/region-stats?city=${encodeURIComponent(cityB)}`).then(r => r.json()),
  ])
      .then(([a, b]) => { setStatsA(a); setStatsB(b) })
      .catch(err => setError(err.message))
  }, [cityA, cityB])

  if (error) return <div>Error: {error}</div>
  if (!statsA || !statsB) return <div>Loading...</div>

  // Merge time series for the line chart
  const allPeriods = new Set([
    ...statsA.monthly.map(r => r.period),
    ...statsB.monthly.map(r => r.period),
  ])
  const mergedMonthly = Array.from(allPeriods).sort().map(period => ({
    period,
    [cityA]: statsA.monthly.find(r => r.period === period)?.count ?? null,
    [cityB]: statsB.monthly.find(r => r.period === period)?.count ?? null,
  }))

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '8px', color: '#1a202c' }}>Compare regions</h2>
      <p style={{ marginTop: 0, marginBottom: '24px', color: '#718096', fontSize: '14px' }}>
        Pick two Lithuanian cities and compare their emergency event profiles. Each city is defined as a 10 km radius around its center.
      </p>

      {/* City pickers */}
      <div style={{ display: 'flex', gap: '24px', marginBottom: '32px' }}>
        <label>
          City A:{' '}
          <select value={cityA} onChange={e => setCityA(e.target.value)}>
            {CITIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </label>

        <label>
          City B:{' '}
          <select value={cityB} onChange={e => setCityB(e.target.value)}>
            {CITIES.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        </label>
      </div>

      {/* Total counts side by side */}
      <div style={{ display: 'flex', gap: '24px', marginBottom: '40px' }}>
        <div style={{ flex: 1, padding: '20px', border: '1px solid #e2e8f0', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: '#718096', marginBottom: '4px' }}>{cityA}</div>
          <div style={{ fontSize: '32px', fontWeight: 600, color: '#4a90e2' }}>
            {statsA.total.toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: '#718096' }}>total events</div>
        </div>
        <div style={{ flex: 1, padding: '20px', border: '1px solid #e2e8f0', borderRadius: '6px', textAlign: 'center' }}>
          <div style={{ fontSize: '13px', color: '#718096', marginBottom: '4px' }}>{cityB}</div>
          <div style={{ fontSize: '32px', fontWeight: 600, color: '#e67e22' }}>
            {statsB.total.toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: '#718096' }}>total events</div>
        </div>
      </div>

      {/* Top 5 types side by side */}
      <div style={{ marginBottom: '40px' }}>
        <h3 style={{ marginBottom: '16px', fontSize: '16px', color: '#2d3748' }}>Top 5 incident categories</h3>
        <div style={{ display: 'flex', gap: '24px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', color: '#718096', marginBottom: '8px' }}>{cityA}</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statsA.top_types} layout="vertical" margin={{ left: 100, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={v => v.toLocaleString()} />
                <Bar dataKey="count" fill="#4a90e2" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', color: '#718096', marginBottom: '8px' }}>{cityB}</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={statsB.top_types} layout="vertical" margin={{ left: 100, right: 20 }}>
                <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 10 }} width={100} />
                <Tooltip formatter={v => v.toLocaleString()} />
                <Bar dataKey="count" fill="#e67e22" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Time series, two lines */}
      <div>
        <h3 style={{ marginBottom: '16px', fontSize: '16px', color: '#2d3748' }}>Events per month</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={mergedMonthly} margin={{ top: 10, right: 30, left: 0, bottom: 30 }}>
            <XAxis dataKey="period" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={v => v?.toLocaleString() ?? '—'} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Line type="monotone" dataKey={cityA} stroke="#4a90e2" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
            <Line type="monotone" dataKey={cityB} stroke="#e67e22" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

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

function TrafficLayerControl({ enabled }) {
  const map = useMap()

  useEffect(() => {
    if (!map || !enabled) return

    const trafficLayer = new window.google.maps.TrafficLayer()
    trafficLayer.setMap(map)

    return () => trafficLayer.setMap(null)
  }, [map, enabled])

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
          style={{ border: 'none',
            background: 'transparent',
            cursor: 'pointer', 
            fontSize: '18px',
            color: '#000000',
          }}
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

import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, Legend, ResponsiveContainer
} from 'recharts'

function Analytics() {
  const [byMonth, setByMonth] = useState(null)
  const [byHigherType, setByHigherType] = useState(null)
  const [byYearAndType, setByYearAndType] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('http://127.0.0.1:8000/stats/by-month').then(r => r.json()),
      fetch('http://127.0.0.1:8000/stats/by-higher-type').then(r => r.json()),
      fetch('http://127.0.0.1:8000/stats/by-year-and-type').then(r => r.json()),
    ])
      .then(([month, higher, yearType]) => {
        setByMonth(month.data)
        setByHigherType(higher.data)
        setByYearAndType(yearType)
      })
      .catch(err => setError(err.message))
  }, [])

  if (error) return <div>Error: {error}</div>
  if (!byMonth || !byHigherType || !byYearAndType) return <div>Loading analytics...</div>

  // Color palette
  const colors = ['#4a90e2', '#e67e22', '#27ae60', '#9b59b6', '#e74c3c', '#16a085', '#f39c12', '#34495e']

  const top10Types = byHigherType.slice(0, 10)

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '8px', color: '#1a202c' }}>Data analysis</h2>
      <p style={{ marginTop: 0, marginBottom: '32px', color: '#718096', fontSize: '14px' }}>
        Aggregate views of the 1.97 million 112 calls in our dataset.
      </p>

      {/* Chart 1: Events per month */}
      <section style={{ marginBottom: '40px' }}>
        <h3 style={{ marginBottom: '4px', fontSize: '16px', color: '#2d3748' }}>
          Events per month
        </h3>
        <p style={{ marginTop: 0, marginBottom: '16px', fontSize: '12px', color: '#718096' }}>
          Gaps in the line indicate months removed by our data quality filter (Sept-Nov 2022, plus Sept 2021 partial).
        </p>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={byMonth} margin={{ top: 10, right: 30, left: 0, bottom: 20 }}>
            <XAxis dataKey="period" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={value => value.toLocaleString()} />
            <Line type="monotone" dataKey="count" stroke="#4a90e2" strokeWidth={2} dot={{ r: 4 }} connectNulls={false} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      {/* Chart 2: Top 10 higher-level types */}
      <section style={{ marginBottom: '40px' }}>
        <h3 style={{ marginBottom: '4px', fontSize: '16px', color: '#2d3748' }}>
          Events by category
        </h3>
        <p style={{ marginTop: 0, marginBottom: '16px', fontSize: '12px', color: '#718096' }}>
          Top 10 higher-level incident categories. Medical and police account for most calls.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={top10Types} layout="vertical" margin={{ top: 10, right: 30, left: 140, bottom: 5 }}>
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <YAxis type="category" dataKey="type" tick={{ fontSize: 11 }} width={140} />
            <Tooltip formatter={value => value.toLocaleString()} />
            <Bar dataKey="count" fill="#4a90e2" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Chart 3: Category share donut */}
      <section style={{ marginBottom: '40px' }}>
        <h3 style={{ marginBottom: '4px', fontSize: '16px', color: '#2d3748' }}>
          Category distribution
        </h3>
        <p style={{ marginTop: 0, marginBottom: '16px', fontSize: '12px', color: '#718096' }}>
          Share of total events by higher-level category.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <PieChart>
            <Pie
              data={top10Types}
              dataKey="count"
              nameKey="type"
              cx="50%"
              cy="50%"
              outerRadius={120}
              innerRadius={60}
              label={false}
            >
              {top10Types.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={value => value.toLocaleString()} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
          </PieChart>
        </ResponsiveContainer>
      </section>

      {/* Chart 4: Year-over-year */}
      <section style={{ marginBottom: '20px' }}>
        <h3 style={{ marginBottom: '4px', fontSize: '16px', color: '#2d3748' }}>
          Year-over-year by category
        </h3>
        <p style={{ marginTop: 0, marginBottom: '16px', fontSize: '12px', color: '#718096' }}>
          Top 5 categories compared across 2021 (partial), 2022 (partial), 2023 (partial). Absolute counts shown.
        </p>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={byYearAndType.data} margin={{ top: 10, right: 30, left: 0, bottom: 5 }}>
            <XAxis dataKey="year" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={value => value.toLocaleString()} />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            {byYearAndType.types.map((type, i) => (
              <Bar key={type} dataKey={type} fill={colors[i % colors.length]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </section>
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

  const [trafficEnabled, setTrafficEnabled] = useState(false)

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
      limit: 100,
    })
    if (eventType) params.set('event_type', eventType)
    if (year) params.set('year', year)

    fetch(`http://127.0.0.1:8000/events?${params}`)
      .then(r => r.json())
      .then(data => setEvents(data.data))
      .catch(err => setError(err.message))
  } else if (viewMode === 'heatmap') {
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
  } else if (viewMode === 'danger') {
    const params = new URLSearchParams({
      min_lat: bounds.min_lat,
      max_lat: bounds.max_lat,
      min_lon: bounds.min_lon,
      max_lon: bounds.max_lon,
      cell_size: cellSize,
    })
    if (year) params.set('year', year)
    // Note: no event_type filter — danger mode hardcodes medical+police

    fetch(`http://127.0.0.1:8000/danger-zones?${params}`)
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
          <input type="radio" name="mode" value="danger"
                checked={viewMode === 'danger'}
                onChange={() => setViewMode('danger')} /> Danger zones
        </label>

        <label>
          <input type="radio" name="mode" value="heatmap"
                 checked={viewMode === 'heatmap'}
                 onChange={() => setViewMode('heatmap')} /> Heatmap
        </label>

        <label>
          <input
              type="checkbox"
              checked={trafficEnabled}
              onChange={e => setTrafficEnabled(e.target.checked)}
          /> Traffic
        </label>

        {(viewMode === 'heatmap' || viewMode === 'danger') && (
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
          <TrafficLayerControl enabled={trafficEnabled} />

          {viewMode === 'pins' && events.map(event => (
            <AdvancedMarker
              key={event.object_id ?? `${event.latitude},${event.longitude}`}
              position={{ lat: event.latitude, lng: event.longitude }}
              title={`${event.higher_level_incident_type}\n${event.lower_level_incident_type}\n${event.year}-${event.month}`}
            />
          ))}

          {(viewMode === 'heatmap' || viewMode === 'danger') && cells.map(cell => (
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
      <div style={{
        minHeight: '100vh',
        backgroundColor: '#f7fafc',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#2d3748',
      }}>
        {/* Full-width header bar */}
        <header style={{
          backgroundColor: '#1a202c',
          borderBottom: '3px solid #4a90e2',
          padding: '20px 0',
        }}>
          <div style={{
            maxWidth: '1400px',
            margin: '0 auto',
            padding: '0 32px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{
                width: '8px',
                height: '32px',
                backgroundColor: '#4a90e2',
                borderRadius: '2px',
              }} />
              <div>
                <h1 style={{
                  margin: 0,
                  fontSize: '22px',
                  fontWeight: 700,
                  color: '#ffffff',
                  letterSpacing: '-0.01em',
                }}>
                  Lithuania 112 Events
                </h1>
                <div style={{
                  fontSize: '12px',
                  color: '#a0aec0',
                  marginTop: '2px',
                  letterSpacing: '0.02em',
                }}>
                  Emergency event analytics, 2021-2023, 1.97 million calls
                </div>
              </div>
            </div>

            
              <a href="https://github.com/panthare1/datascience"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: '13px',
                color: '#e2e8f0',
                textDecoration: 'none',
                padding: '8px 14px',
                border: '1px solid #4a5568',
                borderRadius: '4px',
                fontWeight: 500,
              }}
            >
              GitHub
            </a>
          </div>
        </header>

        {/* Main content area */}
        <main style={{
          maxWidth: '1400px',
          margin: '0 auto',
          padding: '28px 32px',
        }}>
          <div style={{
            backgroundColor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
            padding: '24px',
          }}>
            <nav style={{ marginBottom: '20px', display: 'flex', gap: '20px' }}>
              <Link to="/stats" style={{ color: '#4a90e2', textDecoration: 'none', fontWeight: 500 }}>Stats</Link>
              <Link to="/analytics" style={{ color: '#4a90e2', textDecoration: 'none', fontWeight: 500 }}>Analytics</Link>
              <Link to="/compare" style={{ color: '#4a90e2', textDecoration: 'none', fontWeight: 500 }}>Compare</Link>
              <Link to="/map" style={{ color: '#4a90e2', textDecoration: 'none', fontWeight: 500 }}>Map</Link>
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
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/stats" element={<Stats eventType={eventType} year={year} />} />
              <Route path="/compare" element={<Compare />} />
              <Route path="/map" element={<MapView eventType={eventType} year={year} />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  )
}
export default App