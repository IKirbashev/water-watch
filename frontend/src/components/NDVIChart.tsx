'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import type { Measurement, PointMeasurement } from '@/types'

type Row = Pick<Measurement | PointMeasurement, 'date' | 'ndvi' | 'ndwi' | 'cloud_cover_pct'> & { id: string }

interface NDVIChartProps {
  entityId:    string
  entityType:  'field' | 'point'
  entityName:  string
  refreshKey?: number
  onDataChanged?: () => void
}

export default function NDVIChart({ entityId, entityType, entityName, refreshKey, onDataChanged }: NDVIChartProps) {
  const [data, setData]         = useState<Row[]>([])
  const [loading, setLoading]   = useState(true)
  const [showList, setShowList] = useState(false)

  // Edit state
  const [editRow, setEditRow]     = useState<Row | null>(null)
  const [eNdvi, setENdvi]         = useState('')
  const [eNdwi, setENdwi]         = useState('')
  const [eCloud, setECloud]       = useState('')
  const [eDate, setEDate]         = useState('')
  const [eSaving, setESaving]     = useState(false)

  // Delete state
  const [deleteRow, setDeleteRow] = useState<Row | null>(null)
  const [deleting, setDeleting]   = useState(false)

  const table    = entityType === 'field' ? 'measurements'    : 'point_measurements'
  const idColumn = entityType === 'field' ? 'field_id'        : 'point_id'

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const { data: rows, error } = await supabase
        .from(table)
        .select('id, date, ndvi, ndwi, cloud_cover_pct')
        .eq(idColumn, entityId)
        .order('date', { ascending: true })
        .limit(30)
      if (!cancelled) {
        if (error) console.error('Ошибка загрузки измерений:', error)
        setData((rows as Row[]) ?? [])
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [entityId, entityType, refreshKey, table, idColumn])

  const fmt = (d: string) => { const x = new Date(d); return `${x.getDate()}.${x.getMonth() + 1}` }
  const ndviColor = (n: number) => n >= 0.5 ? '#22c55e' : n >= 0.3 ? '#f59e0b' : '#ef4444'

  // ── Edit handler ──────────────────────────────────────────────────────────

  const openEdit = (row: Row) => {
    setEditRow(row)
    setEDate(row.date)
    setENdvi(row.ndvi != null ? String(row.ndvi) : '')
    setENdwi(row.ndwi != null ? String(row.ndwi) : '')
    setECloud(row.cloud_cover_pct != null ? String(row.cloud_cover_pct) : '')
  }

  const saveEdit = async () => {
    if (!editRow) return
    setESaving(true)

    const updates: Record<string, unknown> = { date: eDate }
    updates.ndvi            = eNdvi.trim()  ? parseFloat(eNdvi)    : null
    updates.ndwi            = eNdwi.trim()  ? parseFloat(eNdwi)    : null
    updates.cloud_cover_pct = eCloud.trim() ? parseInt(eCloud, 10) : null

    const { error } = await supabase.from(table).update(updates).eq('id', editRow.id)

    setESaving(false)
    if (error) { alert(`Ошибка: ${error.message}`); return }

    setEditRow(null)
    // Перезагрузить данные локально
    setData((prev) => prev.map((r) => r.id === editRow.id ? { ...r, ...updates, date: eDate } as Row : r))
    onDataChanged?.()
  }

  // ── Delete handler ────────────────────────────────────────────────────────

  const confirmDeleteMeasurement = async () => {
    if (!deleteRow) return
    setDeleting(true)

    const { error } = await supabase.from(table).delete().eq('id', deleteRow.id)

    setDeleting(false)
    if (error) { alert(`Ошибка: ${error.message}`); return }

    setDeleteRow(null)
    setData((prev) => prev.filter((r) => r.id !== deleteRow.id))
    onDataChanged?.()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center h-32 text-gray-500 text-sm">Загрузка…</div>
  )

  if (data.length === 0) return (
    <div className="flex flex-col items-center justify-center h-32 text-center gap-1">
      <p className="text-gray-500 text-sm">Нет данных</p>
      <p className="text-gray-600 text-xs">Добавьте первое измерение кнопкой выше</p>
    </div>
  )

  const last = data[data.length - 1]

  return (
    <div className="space-y-2.5">

      {/* Summary cards */}
      {last && (
        <div className="flex gap-2">
          <div className="flex-1 bg-gray-800/80 rounded-lg p-2">
            <p className="text-gray-400 text-[10px] mb-0.5">NDVI</p>
            <p className="text-lg font-bold" style={{ color: last.ndvi != null ? ndviColor(last.ndvi) : '#6b7280' }}>
              {last.ndvi?.toFixed(2) ?? '—'}
            </p>
            <p className="text-gray-500 text-[10px]">
              {last.ndvi == null ? 'Нет данных' : last.ndvi >= 0.5 ? 'Хорошая вегетация' : last.ndvi >= 0.3 ? 'Средняя' : 'Низкая'}
            </p>
          </div>
          <div className="flex-1 bg-gray-800/80 rounded-lg p-2">
            <p className="text-gray-400 text-[10px] mb-0.5">NDWI</p>
            <p className="text-lg font-bold text-blue-400">{last.ndwi?.toFixed(2) ?? '—'}</p>
            <p className="text-gray-500 text-[10px]">
              {last.ndwi == null ? 'Нет данных' : last.ndwi > 0 ? 'Влага в норме' : 'Низкая влажность'}
            </p>
          </div>
          <div className="flex-1 bg-gray-800/80 rounded-lg p-2">
            <p className="text-gray-400 text-[10px] mb-0.5">Снимок</p>
            <p className="text-lg font-bold text-white">{fmt(last.date)}</p>
            <p className="text-gray-500 text-[10px]">☁ {last.cloud_cover_pct ?? '?'}%</p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="bg-gray-800/80 rounded-lg p-2.5">
        <p className="text-gray-400 text-[10px] mb-1.5">Динамика NDVI · {data.length} снимков</p>
        <ResponsiveContainer width="100%" height={130}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="date" tickFormatter={fmt} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} />
            <YAxis domain={[-0.2, 1]} tick={{ fill: '#9ca3af', fontSize: 10 }} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
              labelFormatter={(v) => `Дата: ${v}`}
              formatter={(value) => [typeof value === 'number' ? value.toFixed(3) : '—', 'NDVI']}
            />
            <ReferenceLine y={0.5} stroke="#22c55e" strokeDasharray="4 4" opacity={0.4} />
            <ReferenceLine y={0.3} stroke="#f59e0b" strokeDasharray="4 4" opacity={0.4} />
            <Line type="monotone" dataKey="ndvi" stroke="#22c55e" strokeWidth={2}
              dot={{ r: 3, fill: '#22c55e' }} activeDot={{ r: 5 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Measurement list toggle */}
      <button
        onClick={() => setShowList(!showList)}
        className="w-full text-left text-gray-400 hover:text-gray-200 text-xs px-1 py-1 transition-colors"
      >
        {showList ? '▾ Скрыть измерения' : '▸ Показать все измерения'} ({data.length})
      </button>

      {/* Measurement list */}
      {showList && (
        <div className="bg-gray-800/60 rounded-lg overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 px-2 py-1.5 text-[10px] text-gray-500 font-medium border-b border-gray-700">
            <span>Дата</span>
            <span>NDVI</span>
            <span>NDWI</span>
            <span>☁%</span>
            <span></span>
          </div>
          <div className="max-h-40 overflow-y-auto">
            {data.map((row) => (
              <div key={row.id} className="group grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-2 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700/40 items-center">
                <span className="font-mono text-[11px]">{row.date}</span>
                <span className="font-mono w-10 text-right" style={{ color: row.ndvi != null ? ndviColor(row.ndvi) : '#6b7280' }}>
                  {row.ndvi?.toFixed(2) ?? '—'}
                </span>
                <span className="font-mono w-10 text-right text-blue-400">
                  {row.ndwi?.toFixed(2) ?? '—'}
                </span>
                <span className="font-mono w-8 text-right text-gray-500">
                  {row.cloud_cover_pct ?? '—'}
                </span>
                <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    title="Редактировать"
                    onClick={() => openEdit(row)}
                    className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-white hover:bg-gray-600 text-[10px]"
                  >✎</button>
                  <button
                    title="Удалить"
                    onClick={() => setDeleteRow(row)}
                    className="w-5 h-5 flex items-center justify-center rounded text-gray-500 hover:text-red-400 hover:bg-red-900/30 text-[10px]"
                  >✕</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editRow && <MeasurementModal onClose={() => setEditRow(null)}>
        <h2 className="text-white font-semibold text-lg mb-1">Редактировать измерение</h2>
        <p className="text-gray-400 text-xs mb-4">{entityName} · {editRow.date}</p>
        <div className="space-y-3">
          <label className="block">
            <span className="text-gray-400 text-xs">Дата</span>
            <input type="date" value={eDate} onChange={(e) => setEDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-green-500 block mt-1" />
          </label>
          <div className="flex gap-3">
            <label className="flex-1">
              <span className="text-gray-400 text-xs">NDVI</span>
              <input type="number" step="0.01" min="-1" max="1" value={eNdvi}
                onChange={(e) => setENdvi(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-green-500 block mt-1" />
            </label>
            <label className="flex-1">
              <span className="text-gray-400 text-xs">NDWI</span>
              <input type="number" step="0.01" min="-1" max="1" value={eNdwi}
                onChange={(e) => setENdwi(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-green-500 block mt-1" />
            </label>
            <label className="flex-1">
              <span className="text-gray-400 text-xs">☁ %</span>
              <input type="number" step="1" min="0" max="100" value={eCloud}
                onChange={(e) => setECloud(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-green-500 block mt-1" />
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={() => setEditRow(null)}
            className="px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors">
            Отмена
          </button>
          <button onClick={saveEdit} disabled={eSaving || !eDate}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium bg-green-600 hover:bg-green-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {eSaving ? 'Сохраняю…' : 'Сохранить'}
          </button>
        </div>
      </MeasurementModal>}

      {/* Delete confirm modal */}
      {deleteRow && <MeasurementModal onClose={() => setDeleteRow(null)}>
        <h2 className="text-white font-semibold text-lg mb-2">Удалить измерение?</h2>
        <p className="text-gray-400 text-sm mb-4">
          Измерение за <span className="text-white font-medium">{deleteRow.date}</span> будет удалено.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={() => setDeleteRow(null)}
            className="px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors">
            Отмена
          </button>
          <button onClick={confirmDeleteMeasurement} disabled={deleting}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {deleting ? 'Удаляю…' : 'Удалить'}
          </button>
        </div>
      </MeasurementModal>}
    </div>
  )
}

// ── Measurement modal (portal) ───────────────────────────────────────────────

function MeasurementModal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null

  return createPortal(
    <div
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{
        backgroundColor: '#111827', border: '1px solid #374151',
        borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        padding: '20px', width: '100%', maxWidth: '28rem', margin: '0 16px',
      }}>
        {children}
      </div>
    </div>,
    document.body,
  )
}