export interface Farmer {
  id: string
  name: string
  phone: string | null
  telegram_id: string | null
  region: string | null
  created_at: string
}

export interface Field {
  id: string
  farmer_id: string | null
  name: string
  geometry: GeoJSON.Polygon
  area_ha: number | null
  created_at: string
}

// Field + последний NDVI — используется во фронте повсюду
export interface FieldWithNDVI extends Field {
  latestNDVI: number | null
}

export interface MonitoringPoint {
  id: string
  farmer_id: string | null
  name: string
  geometry: GeoJSON.Point
  description: string | null
  created_at: string
}

export interface Measurement {
  id: string
  field_id: string
  date: string
  ndvi: number | null
  ndwi: number | null
  cloud_cover_pct: number | null
  sentinel_scene_id: string | null
  created_at: string
}

export interface PointMeasurement {
  id: string
  point_id: string
  date: string
  ndvi: number | null
  ndwi: number | null
  cloud_cover_pct: number | null
  sentinel_scene_id: string | null
  created_at: string
}

// DrawMode — оригинальное имя в проекте
export type DrawMode = 'idle' | 'draw-field' | 'draw-point'

// AppMode — алиас для совместимости с новыми компонентами
// 'view' === 'idle', 'draw-field' и 'draw-point' совпадают
export type AppMode = 'view' | 'draw-field' | 'draw-point'

export interface PendingDraw {
  type: 'field' | 'point'
  geometry: GeoJSON.Polygon | GeoJSON.Point
}