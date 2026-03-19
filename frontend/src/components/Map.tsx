'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { supabase } from '@/lib/supabase'
import type { Field, Measurement } from '@/types'

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN!

interface FieldWithNDVI extends Field {
  latestNDVI: number | null
}

interface MapProps {
  onFieldSelect: (field: Field) => void
  selectedFieldId: string | null
}

// Возвращает hex-цвет по значению NDVI
function ndviToColor(ndvi: number | null): string {
  if (ndvi === null) return '#6b7280' // серый — нет данных
  if (ndvi >= 0.6) return '#16a34a'   // тёмно-зелёный — отлично
  if (ndvi >= 0.4) return '#22c55e'   // зелёный — хорошо
  if (ndvi >= 0.2) return '#eab308'   // жёлтый — средне
  if (ndvi >= 0.0) return '#f97316'   // оранжевый — слабо
  return '#ef4444'                     // красный — очень плохо / вода
}

export default function Map({ onFieldSelect, selectedFieldId }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const map = useRef<mapboxgl.Map | null>(null)
  const [fields, setFields] = useState<FieldWithNDVI[]>([])
  const popup = useRef<mapboxgl.Popup | null>(null)

  // Загружаем поля + последнее измерение NDVI для каждого
  useEffect(() => {
    async function loadFields() {
      const { data: fieldsData, error: fieldsError } = await supabase
        .from('fields')
        .select('*')

      if (fieldsError || !fieldsData) {
        console.error('Ошибка загрузки полей:', fieldsError)
        return
      }

      // Для каждого поля — последнее измерение NDVI
      const fieldsWithNDVI: FieldWithNDVI[] = await Promise.all(
        fieldsData.map(async (field) => {
          const { data: measurement } = await supabase
            .from('measurements')
            .select('ndvi')
            .eq('field_id', field.id)
            .order('date', { ascending: false })
            .limit(1)
            .maybeSingle()

          return {
            ...field,
            latestNDVI: (measurement as Measurement | null)?.ndvi ?? null,
          }
        })
      )

      setFields(fieldsWithNDVI)
    }

    loadFields()
  }, [])

  // Инициализируем карту один раз
  useEffect(() => {
    if (map.current || !mapContainer.current) return

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-streets-v12',
      center: [74.5, 42.0],
      zoom: 6,
      antialias: false,
      fadeDuration: 0,
    })

    const m = map.current
    m.addControl(new mapboxgl.NavigationControl(), 'top-right')

    popup.current = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
    })

    m.on('load', () => {
      m.addSource('fields', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })

      // Заливка — цвет берём из свойства ndvi_color
      m.addLayer({
        id: 'fields-fill',
        type: 'fill',
        source: 'fields',
        paint: {
          'fill-color': ['get', 'ndvi_color'],
          'fill-opacity': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            0.75,
            0.45,
          ],
        },
      })

      // Граница полей — ярче у выбранного
      m.addLayer({
        id: 'fields-outline',
        type: 'line',
        source: 'fields',
        paint: {
          'line-color': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            '#ffffff',
            'rgba(255,255,255,0.6)',
          ],
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'selected'], false],
            2.5,
            1.5,
          ],
        },
      })

      m.on('click', 'fields-fill', (e) => {
        if (!e.features?.length) return
        const id = e.features[0].id as string
        const clickedField = fields.find((f) => f.id === id)
        if (clickedField) onFieldSelect(clickedField)
      })

      m.on('mouseenter', 'fields-fill', (e) => {
        m.getCanvas().style.cursor = 'pointer'
        if (!e.features?.length || !popup.current) return

        const props = e.features[0].properties
        const ndvi = props?.ndvi_value
        const ndviLabel =
          ndvi !== null && ndvi !== undefined
            ? `NDVI: <strong>${Number(ndvi).toFixed(2)}</strong>`
            : 'NDVI: нет данных'

        popup.current
          .setLngLat(e.lngLat)
          .setHTML(
            `<div style="font-size:12px;line-height:1.6">
              <div style="font-weight:600;margin-bottom:2px">${props?.name ?? ''}</div>
              <div>${ndviLabel}</div>
              ${props?.area_ha ? `<div style="color:#9ca3af">${Number(props.area_ha).toFixed(1)} га</div>` : ''}
            </div>`
          )
          .addTo(m)
      })

      m.on('mousemove', 'fields-fill', (e) => {
        popup.current?.setLngLat(e.lngLat)
      })

      m.on('mouseleave', 'fields-fill', () => {
        m.getCanvas().style.cursor = ''
        popup.current?.remove()
      })
    })

    return () => {
      m.remove()
      map.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Обновляем GeoJSON на карте при загрузке/изменении данных
  useEffect(() => {
    if (!map.current) return

    const update = () => {
      const source = map.current!.getSource('fields') as mapboxgl.GeoJSONSource
      if (!source) return

      source.setData({
        type: 'FeatureCollection',
        features: fields.map((field) => ({
          type: 'Feature',
          id: field.id,
          geometry: field.geometry,
          properties: {
            name: field.name,
            area_ha: field.area_ha,
            ndvi_value: field.latestNDVI,
            ndvi_color: ndviToColor(field.latestNDVI),
          },
        })),
      })

      // Приближаемся к полям
      if (fields.length > 0) {
        const allCoords = fields.flatMap((f) =>
          f.geometry.coordinates[0]
        ) as [number, number][]

        if (allCoords.length > 0) {
          const bounds = allCoords.reduce(
            (acc, coord) => acc.extend(coord),
            new mapboxgl.LngLatBounds(allCoords[0], allCoords[0])
          )
          map.current!.fitBounds(bounds, { padding: 80, maxZoom: 14 })
        }
      }
    }

    if (map.current.isStyleLoaded()) {
      update()
    } else {
      map.current.once('load', update)
    }
  }, [fields])

  // Подсвечиваем выбранное поле
  useEffect(() => {
    if (!map.current || !map.current.isStyleLoaded()) return

    fields.forEach((f) => {
      map.current!.setFeatureState(
        { source: 'fields', id: f.id },
        { selected: false }
      )
    })

    if (selectedFieldId) {
      map.current.setFeatureState(
        { source: 'fields', id: selectedFieldId },
        { selected: true }
      )
    }
  }, [selectedFieldId, fields])

  return (
    <>
      <div ref={mapContainer} className="w-full h-full rounded-lg overflow-hidden" />

      {/* Легенда NDVI */}
      <div className="absolute bottom-6 left-[344px] bg-gray-900/90 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-700 pointer-events-none">
        <p className="text-gray-400 text-xs font-medium mb-1.5">Индекс NDVI</p>
        <div className="flex items-center gap-1.5">
          {[
            { color: '#16a34a', label: '≥0.6' },
            { color: '#22c55e', label: '≥0.4' },
            { color: '#eab308', label: '≥0.2' },
            { color: '#f97316', label: '≥0.0' },
            { color: '#ef4444', label: '<0' },
            { color: '#6b7280', label: '—' },
          ].map(({ color, label }) => (
            <div key={label} className="flex flex-col items-center gap-0.5">
              <div
                className="w-5 h-3 rounded-sm"
                style={{ backgroundColor: color, opacity: 0.75 }}
              />
              <span className="text-gray-400 text-[10px]">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}