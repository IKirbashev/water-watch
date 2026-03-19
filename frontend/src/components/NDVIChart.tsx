'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import type { Measurement } from '@/types'

interface NDVIChartProps {
  fieldId: string
  fieldName: string
}

export default function NDVIChart({ fieldId, fieldName }: NDVIChartProps) {
  const [data, setData] = useState<Measurement[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data: rows, error } = await supabase
        .from('measurements')
        .select('*')
        .eq('field_id', fieldId)
        .order('date', { ascending: true })
        .limit(30) // последние 30 замеров

      if (error) {
        console.error('Ошибка загрузки измерений:', error)
      } else {
        setData(rows || [])
      }
      setLoading(false)
    }
    load()
  }, [fieldId])

  // Форматируем дату для оси X
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getDate()}.${d.getMonth() + 1}`
  }

  // Цвет точки по значению NDVI
  const getNDVIColor = (ndvi: number) => {
    if (ndvi >= 0.5) return '#22c55e'  // хорошо
    if (ndvi >= 0.3) return '#f59e0b'  // средне
    return '#ef4444'                    // плохо
  }

  const lastMeasurement = data[data.length - 1]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Загрузка данных...
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
        Нет данных для этого поля
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Последнее значение */}
      {lastMeasurement && (
        <div className="flex gap-3">
          <div className="flex-1 bg-gray-800 rounded-lg p-3">
            <p className="text-gray-400 text-xs mb-1">NDVI (сейчас)</p>
            <p
              className="text-2xl font-bold"
              style={{ color: getNDVIColor(lastMeasurement.ndvi ?? 0) }}
            >
              {lastMeasurement.ndvi?.toFixed(2) ?? '—'}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              {lastMeasurement.ndvi && lastMeasurement.ndvi >= 0.5
                ? 'Хорошая вегетация'
                : lastMeasurement.ndvi && lastMeasurement.ndvi >= 0.3
                ? 'Средняя вегетация'
                : 'Низкая вегетация'}
            </p>
          </div>
          <div className="flex-1 bg-gray-800 rounded-lg p-3">
            <p className="text-gray-400 text-xs mb-1">NDWI (влажность)</p>
            <p className="text-2xl font-bold text-blue-400">
              {lastMeasurement.ndwi?.toFixed(2) ?? '—'}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              {lastMeasurement.ndwi && lastMeasurement.ndwi > 0
                ? 'Влага в норме'
                : 'Низкая влажность'}
            </p>
          </div>
          <div className="flex-1 bg-gray-800 rounded-lg p-3">
            <p className="text-gray-400 text-xs mb-1">Дата снимка</p>
            <p className="text-lg font-bold text-white">
              {formatDate(lastMeasurement.date)}
            </p>
            <p className="text-gray-500 text-xs mt-1">
              Облачность: {lastMeasurement.cloud_cover_pct ?? '?'}%
            </p>
          </div>
        </div>
      )}

      {/* График NDVI */}
      <div className="bg-gray-800 rounded-lg p-3">
        <p className="text-gray-400 text-xs mb-2">Динамика NDVI за последние снимки</p>
        <ResponsiveContainer width="100%" height={160}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={false}
            />
            <YAxis
              domain={[-0.2, 1]}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '8px',
                fontSize: '12px',
              }}
              labelFormatter={(v) => `Дата: ${v}`}
              formatter={(value) => [typeof value === 'number' ? value.toFixed(3) : '—', 'NDVI']}
            />
            {/* Зоны нормы */}
            <ReferenceLine y={0.5} stroke="#22c55e" strokeDasharray="4 4" opacity={0.5} />
            <ReferenceLine y={0.3} stroke="#f59e0b" strokeDasharray="4 4" opacity={0.5} />
            <Line
              type="monotone"
              dataKey="ndvi"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ r: 3, fill: '#22c55e' }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-1">
          <span className="text-xs text-green-400">— выше 0.5: хорошо</span>
          <span className="text-xs text-yellow-400">— выше 0.3: средне</span>
        </div>
      </div>
    </div>
  )
}