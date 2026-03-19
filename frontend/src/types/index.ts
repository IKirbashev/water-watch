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
  farmer_id: string
  name: string
  geometry: GeoJSON.Polygon
  area_ha: number | null
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

// Для графика: measurement + название поля
export interface MeasurementWithField extends Measurement {
  fields: { name: string }
}