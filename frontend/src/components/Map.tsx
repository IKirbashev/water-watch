'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type { FieldWithNDVI, MonitoringPoint, AppMode } from '@/types'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

// ── Helpers ──────────────────────────────────────────────────────────────────

function ndviToColor(ndvi: number | null): string {
  if (ndvi === null) return '#6b7280'
  if (ndvi >= 0.6)   return '#16a34a'
  if (ndvi >= 0.4)   return '#22c55e'
  if (ndvi >= 0.2)   return '#eab308'
  if (ndvi >= 0.0)   return '#f97316'
  return '#ef4444'
}

function screenDist(
  m: mapboxgl.Map,
  a: [number, number],
  b: [number, number],
): number {
  const pa = m.project(a as mapboxgl.LngLatLike)
  const pb = m.project(b as mapboxgl.LngLatLike)
  return Math.hypot(pa.x - pb.x, pa.y - pb.y)
}

// ── Types ────────────────────────────────────────────────────────────────────

interface MapProps {
  fields:           FieldWithNDVI[]
  monitoringPoints: MonitoringPoint[]
  mode:             AppMode
  selectedFieldId:  string | null
  selectedPointId:  string | null
  onFieldSelect:    (field: FieldWithNDVI)     => void
  onPointSelect:    (point: MonitoringPoint)   => void
  onPolygonComplete:(coords: [number, number][]) => void
  onPointPlace:     (coord:  [number, number])  => void
  onDrawCancel:     () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export default function Map({
  fields,
  monitoringPoints,
  mode,
  selectedFieldId,
  selectedPointId,
  onFieldSelect,
  onPointSelect,
  onPolygonComplete,
  onPointPlace,
  onDrawCancel,
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map          = useRef<mapboxgl.Map | null>(null)
  const popup        = useRef<mapboxgl.Popup | null>(null)
  const mapLoaded    = useRef(false)

  // Drawing state — both React state (for UI/effects) and refs (for event handlers)
  const [draftPoints, setDraftPoints] = useState<[number, number][]>([])
  const [cursorPos,   setCursorPos]   = useState<[number, number] | null>(null)
  const [canClose,    setCanClose]    = useState(false)

  // Stable refs for event handlers registered on map 'load'
  const modeRef              = useRef<AppMode>(mode)
  const draftPointsRef       = useRef<[number, number][]>([])
  const fieldsRef            = useRef<FieldWithNDVI[]>(fields ?? [])
  const monitoringPointsRef  = useRef<MonitoringPoint[]>(monitoringPoints ?? [])
  const onFieldSelectRef     = useRef(onFieldSelect)
  const onPointSelectRef     = useRef(onPointSelect)
  const onPolygonCompleteRef = useRef(onPolygonComplete)
  const onPointPlaceRef      = useRef(onPointPlace)
  const onDrawCancelRef      = useRef(onDrawCancel)
  const fittedRef            = useRef(false)

  // Keep refs in sync with props
  useEffect(() => { modeRef.current              = mode },              [mode])
  useEffect(() => { fieldsRef.current            = fields ?? [] },      [fields])
  useEffect(() => { monitoringPointsRef.current  = monitoringPoints ?? [] }, [monitoringPoints])
  useEffect(() => { onFieldSelectRef.current     = onFieldSelect },     [onFieldSelect])
  useEffect(() => { onPointSelectRef.current     = onPointSelect },     [onPointSelect])
  useEffect(() => { onPolygonCompleteRef.current = onPolygonComplete }, [onPolygonComplete])
  useEffect(() => { onPointPlaceRef.current      = onPointPlace },      [onPointPlace])
  useEffect(() => { onDrawCancelRef.current      = onDrawCancel },      [onDrawCancel])

  // Clear draft when leaving draw-field mode
  useEffect(() => {
    if (mode !== 'draw-field') {
      setDraftPoints([])
      draftPointsRef.current = []
      setCursorPos(null)
      setCanClose(false)
    }
  }, [mode])

  // Map cursor style
  useEffect(() => {
    if (!map.current) return
    map.current.getCanvas().style.cursor = mode !== 'view' ? 'crosshair' : ''
  }, [mode])

  // Escape to cancel drawing
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modeRef.current !== 'view') onDrawCancelRef.current()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Map init (once) ───────────────────────────────────────────────────────
  useEffect(() => {
    if (map.current || !mapContainer.current) return

    const m = new mapboxgl.Map({
      container:   mapContainer.current,
      style:       'mapbox://styles/mapbox/satellite-streets-v12',
      center:      [74.5, 42.0],
      zoom:        6,
      antialias:   false,
      fadeDuration: 0,
    })
    map.current = m
    m.addControl(new mapboxgl.NavigationControl(), 'top-right')

    popup.current = new mapboxgl.Popup({ closeButton: false, closeOnClick: false })

    m.on('load', () => {
      mapLoaded.current = true

      // ── Sources ─────────────────────────────────────────────────────────
      m.addSource('fields', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      m.addSource('monitoring-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      m.addSource('draft', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // ── Field layers ────────────────────────────────────────────────────
      m.addLayer({
        id: 'fields-fill', type: 'fill', source: 'fields',
        paint: {
          'fill-color':   ['get', 'ndvi_color'],
          'fill-opacity': ['case', ['boolean', ['feature-state', 'selected'], false], 0.75, 0.45],
        },
      })
      m.addLayer({
        id: 'fields-outline', type: 'line', source: 'fields',
        paint: {
          'line-color': ['case', ['boolean', ['feature-state', 'selected'], false], '#ffffff', 'rgba(255,255,255,0.6)'],
          'line-width': ['case', ['boolean', ['feature-state', 'selected'], false], 2.5, 1.5],
        },
      })

      // ── Monitoring point layer ───────────────────────────────────────────
      m.addLayer({
        id: 'monitoring-points-circle', type: 'circle', source: 'monitoring-points',
        paint: {
          'circle-radius':       ['case', ['boolean', ['feature-state', 'selected'], false], 10, 7],
          'circle-color':        '#3b82f6',
          'circle-stroke-width': ['case', ['boolean', ['feature-state', 'selected'], false], 3, 1.5],
          'circle-stroke-color': '#ffffff',
          'circle-opacity':      0.95,
        },
      })

      // ── Draft layers ────────────────────────────────────────────────────
      m.addLayer({
        id: 'draft-fill', type: 'fill', source: 'draft',
        filter: ['==', '$type', 'Polygon'],
        paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.15 },
      })
      m.addLayer({
        id: 'draft-line', type: 'line', source: 'draft',
        filter: ['any', ['==', '$type', 'LineString'], ['==', '$type', 'Polygon']],
        paint: { 'line-color': '#22c55e', 'line-width': 2, 'line-dasharray': [3, 2] },
      })
      m.addLayer({
        id: 'draft-vertices', type: 'circle', source: 'draft',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius':       ['coalesce', ['get', 'radius'], 5],
          'circle-color':        ['coalesce', ['get', 'color'], '#22c55e'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#ffffff',
        },
      })

      // ── Event: click on map ─────────────────────────────────────────────
      m.on('click', (e) => {
        const currentMode = modeRef.current

        if (currentMode === 'draw-point') {
          onPointPlaceRef.current([e.lngLat.lng, e.lngLat.lat])
          return
        }

        if (currentMode === 'draw-field') {
          const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat]
          const current = draftPointsRef.current

          if (current.length >= 3 && screenDist(m, current[0], coord) < 15) {
            const finalCoords = [...current]
            draftPointsRef.current = []
            setDraftPoints([])
            setCanClose(false)
            onPolygonCompleteRef.current(finalCoords)
            return
          }

          const next = [...current, coord]
          draftPointsRef.current = next
          setDraftPoints(next)
          return
        }
      })

      // ── Event: click on field ───────────────────────────────────────────
      m.on('click', 'fields-fill', (e) => {
        if (modeRef.current !== 'view') return
        if (!e.features?.length) return
        const id    = e.features[0].id as string
        const field = fieldsRef.current.find((f) => f.id === id)
        if (field) onFieldSelectRef.current(field)
      })

      // ── Event: click on monitoring point ────────────────────────────────
      m.on('click', 'monitoring-points-circle', (e) => {
        if (modeRef.current !== 'view') return
        if (!e.features?.length) return
        const id    = e.features[0].id as string
        const point = monitoringPointsRef.current.find((p) => p.id === id)
        if (point) onPointSelectRef.current(point)
      })

      // ── Event: mousemove ────────────────────────────────────────────────
      m.on('mousemove', (e) => {
        if (modeRef.current !== 'draw-field') return
        const coord: [number, number] = [e.lngLat.lng, e.lngLat.lat]
        setCursorPos(coord)

        const current = draftPointsRef.current
        setCanClose(current.length >= 3 && screenDist(m, current[0], coord) < 15)
      })

      // ── Popups: fields ───────────────────────────────────────────────────
      m.on('mouseenter', 'fields-fill', (e) => {
        if (modeRef.current !== 'view') return
        m.getCanvas().style.cursor = 'pointer'
        if (!e.features?.length || !popup.current) return
        const props = e.features[0].properties
        const ndvi  = props?.ndvi_value
        popup.current
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:12px;line-height:1.6">
              <div style="font-weight:600;margin-bottom:2px">${props?.name ?? ''}</div>
              <div>${ndvi != null ? `NDVI: <strong>${Number(ndvi).toFixed(2)}</strong>` : 'NDVI: нет данных'}</div>
              ${props?.area_ha ? `<div style="color:#9ca3af">${Number(props.area_ha).toFixed(1)} га</div>` : ''}
            </div>`,
          )
          .addTo(m)
      })
      m.on('mousemove',  'fields-fill', (e) => { if (modeRef.current === 'view') popup.current?.setLngLat(e.lngLat) })
      m.on('mouseleave', 'fields-fill', ()  => { if (modeRef.current === 'view') m.getCanvas().style.cursor = ''; popup.current?.remove() })

      // ── Popups: monitoring points ────────────────────────────────────────
      m.on('mouseenter', 'monitoring-points-circle', (e) => {
        if (modeRef.current !== 'view') return
        m.getCanvas().style.cursor = 'pointer'
        if (!e.features?.length || !popup.current) return
        const props = e.features[0].properties
        popup.current
          .setLngLat(e.lngLat)
          .setHTML(`<div style="font-size:12px;font-weight:600">${props?.name ?? 'Точка'}</div>`)
          .addTo(m)
      })
      m.on('mouseleave', 'monitoring-points-circle', () => {
        if (modeRef.current === 'view') m.getCanvas().style.cursor = ''
        popup.current?.remove()
      })

      // ── Right-click → cancel draw ───────────────────────────────────────
      m.on('contextmenu', () => {
        if (modeRef.current !== 'view') onDrawCancelRef.current()
      })

      // Initial render if data loaded before map
      applyFieldsToSource(m, fieldsRef.current)
      applyPointsToSource(m, monitoringPointsRef.current)

      if (fieldsRef.current.length > 0) {
        fitToFields(m, fieldsRef.current)
        fittedRef.current = true
      }
    })

    return () => {
      m.remove()
      map.current       = null
      mapLoaded.current  = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Update fields GeoJSON ─────────────────────────────────────────────────
  useEffect(() => {
    const m = map.current
    if (!m || !m.isStyleLoaded()) return
    applyFieldsToSource(m, fields)

    if (!fittedRef.current && fields.length > 0) {
      fittedRef.current = true
      fitToFields(m, fields)
    }
  }, [fields])

  // ── Update monitoring points GeoJSON ──────────────────────────────────────
  useEffect(() => {
    const m = map.current
    if (!m || !m.isStyleLoaded()) return
    applyPointsToSource(m, monitoringPoints)
  }, [monitoringPoints])

  // ── Selected field highlight ──────────────────────────────────────────────
  useEffect(() => {
    const m = map.current
    if (!m || !m.isStyleLoaded()) return
    fields.forEach((f) =>
      m.setFeatureState({ source: 'fields', id: f.id }, { selected: f.id === selectedFieldId }),
    )
  }, [selectedFieldId, fields])

  // ── Selected monitoring point highlight ───────────────────────────────────
  useEffect(() => {
    const m = map.current
    if (!m || !m.isStyleLoaded()) return
    monitoringPoints.forEach((p) =>
      m.setFeatureState({ source: 'monitoring-points', id: p.id }, { selected: p.id === selectedPointId }),
    )
  }, [selectedPointId, monitoringPoints])

  // ── Draft polygon rendering ───────────────────────────────────────────────
  useEffect(() => {
    const m = map.current
    if (!m || !m.isStyleLoaded()) return
    const source = m.getSource('draft') as mapboxgl.GeoJSONSource | undefined
    if (!source) return

    if (draftPoints.length === 0) {
      source.setData({ type: 'FeatureCollection', features: [] })
      return
    }

    const features: GeoJSON.Feature[] = []

    draftPoints.forEach((coord, i) => {
      const isFirst = i === 0
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: coord },
        properties: {
          radius: isFirst ? (canClose ? 11 : 7) : 5,
          color:  isFirst ? (canClose ? '#22c55e' : '#ffffff') : '#22c55e',
        },
      })
    })

    const lineCoords = cursorPos ? [...draftPoints, cursorPos] : draftPoints
    if (lineCoords.length >= 2) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: lineCoords },
        properties: {},
      })
    }

    if (draftPoints.length >= 3) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [[...draftPoints, draftPoints[0]]] },
        properties: {},
      })
    }

    source.setData({ type: 'FeatureCollection', features })
  }, [draftPoints, cursorPos, canClose])

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <div ref={mapContainer} className="w-full h-full rounded-lg overflow-hidden" />

      {mode === 'draw-field' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900/95 backdrop-blur-sm rounded-lg px-4 py-2.5 border border-green-800 shadow-xl pointer-events-none">
          <p className="text-white text-sm font-medium text-center">
            {draftPoints.length === 0
              ? '✏️ Кликайте на карте, чтобы добавить точки полигона'
              : draftPoints.length < 3
              ? `${draftPoints.length} из 3 минимальных точек добавлено`
              : canClose
              ? '✅ Кликните на первую точку, чтобы замкнуть полигон'
              : `${draftPoints.length} точек · кликните первую точку или продолжайте`}
          </p>
          <p className="text-gray-400 text-xs text-center mt-0.5">ПКМ или Escape — отмена</p>
        </div>
      )}

      {mode === 'draw-point' && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-gray-900/95 backdrop-blur-sm rounded-lg px-4 py-2.5 border border-blue-800 shadow-xl pointer-events-none">
          <p className="text-white text-sm font-medium text-center">
            📍 Кликните на карте, чтобы поставить точку мониторинга
          </p>
          <p className="text-gray-400 text-xs text-center mt-0.5">ПКМ или Escape — отмена</p>
        </div>
      )}

      <div className="absolute bottom-6 left-4 bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700 pointer-events-none">
        <p className="text-gray-400 text-xs font-medium mb-1.5">NDVI</p>
        <div className="flex items-center gap-1.5">
          {[
            { color: '#16a34a', label: '≥0.6' },
            { color: '#22c55e', label: '≥0.4' },
            { color: '#eab308', label: '≥0.2' },
            { color: '#f97316', label: '≥0.0' },
            { color: '#ef4444', label: '<0'   },
            { color: '#6b7280', label: '—'    },
          ].map(({ color, label }) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <div className="w-5 h-3 rounded-sm" style={{ backgroundColor: color, opacity: 0.75 }} />
              <span className="text-gray-400 text-[10px]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function applyFieldsToSource(m: mapboxgl.Map, fields: FieldWithNDVI[]) {
  const source = m.getSource('fields') as mapboxgl.GeoJSONSource | undefined
  if (!source) return
  source.setData({
    type: 'FeatureCollection',
    features: fields.map((field) => ({
      type:       'Feature' as const,
      id:         field.id,
      geometry:   field.geometry,
      properties: {
        name:       field.name,
        area_ha:    field.area_ha,
        ndvi_value: field.latestNDVI,
        ndvi_color: ndviToColor(field.latestNDVI),
      },
    })),
  })
}

function applyPointsToSource(m: mapboxgl.Map, points: MonitoringPoint[]) {
  const source = m.getSource('monitoring-points') as mapboxgl.GeoJSONSource | undefined
  if (!source) return
  source.setData({
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type:       'Feature' as const,
      id:         point.id,
      geometry:   point.geometry,
      properties: { name: point.name },
    })),
  })
}

function fitToFields(m: mapboxgl.Map, fields: FieldWithNDVI[]) {
  const allCoords = fields.flatMap((f) => f.geometry.coordinates[0]) as [number, number][]
  if (allCoords.length === 0) return
  const bounds = allCoords.reduce(
    (acc, c) => acc.extend(c),
    new mapboxgl.LngLatBounds(allCoords[0], allCoords[0]),
  )
  m.fitBounds(bounds, { padding: 80, maxZoom: 14, duration: 1000 })
}