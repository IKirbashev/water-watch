'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import dynamic from 'next/dynamic'
import Sidebar from '@/components/Sidebar'
import { supabase } from '@/lib/supabase'
import type { FieldWithNDVI, MonitoringPoint, AppMode } from '@/types'

// Mapbox использует window — SSR невозможен
const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm">Загрузка карты...</p>
      </div>
    </div>
  ),
})

// ── Modal state types ────────────────────────────────────────────────────────

interface AddFieldModal {
  coordinates: [number, number][]
  name: string
}

interface AddPointModal {
  coordinate: [number, number]
  name: string
}

interface RenameModal {
  type: 'field' | 'point'
  id: string
  name: string
}

interface DeleteConfirm {
  type: 'field' | 'point'
  id: string
  name: string
}

interface AddMeasurementModal {
  entityType: 'field' | 'point'
  entityId: string
  entityName: string
}

// ── Page component ───────────────────────────────────────────────────────────

export default function Home() {
  // ── Core data ─────────────────────────────────────────────────────────────
  const [fields, setFields]                     = useState<FieldWithNDVI[]>([])
  const [monitoringPoints, setMonitoringPoints] = useState<MonitoringPoint[]>([])

  // ── UI state ──────────────────────────────────────────────────────────────
  const [mode, setMode]                   = useState<AppMode>('view')
  const [selectedField, setSelectedField] = useState<FieldWithNDVI | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<MonitoringPoint | null>(null)
  const [chartRefreshKey, setChartRefreshKey] = useState(0)

  // ── Modal state ───────────────────────────────────────────────────────────
  const [addFieldModal, setAddFieldModal]             = useState<AddFieldModal | null>(null)
  const [addPointModal, setAddPointModal]             = useState<AddPointModal | null>(null)
  const [renameModal, setRenameModal]                 = useState<RenameModal | null>(null)
  const [deleteConfirm, setDeleteConfirm]             = useState<DeleteConfirm | null>(null)
  const [addMeasurementModal, setAddMeasurementModal] = useState<AddMeasurementModal | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Measurement form state ────────────────────────────────────────────────
  const [mDate, setMDate]               = useState('')
  const [mNdvi, setMNdvi]               = useState('')
  const [mNdwi, setMNdwi]               = useState('')
  const [mCloudCover, setMCloudCover]   = useState('')

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadFields = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from('fields')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) { console.error('Ошибка загрузки полей:', error); return }
    if (!rows) { setFields([]); return }

    // N+1 запрос за последним NDVI — приемлемо для MVP
    const withNdvi: FieldWithNDVI[] = await Promise.all(
      rows.map(async (field) => {
        const { data: m } = await supabase
          .from('measurements')
          .select('ndvi')
          .eq('field_id', field.id)
          .order('date', { ascending: false })
          .limit(1)
        return { ...field, latestNDVI: m?.[0]?.ndvi ?? null }
      }),
    )
    setFields(withNdvi)
  }, [])

  const loadPoints = useCallback(async () => {
    const { data: rows, error } = await supabase
      .from('monitoring_points')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) { console.error('Ошибка загрузки точек:', error); return }
    setMonitoringPoints(rows ?? [])
  }, [])

  useEffect(() => {
    loadFields()
    loadPoints()
  }, [loadFields, loadPoints])

  // ── Selection handlers ────────────────────────────────────────────────────

  const handleFieldSelect = useCallback((field: FieldWithNDVI) => {
    setSelectedField(field)
    setSelectedPoint(null)
  }, [])

  const handlePointSelect = useCallback((point: MonitoringPoint) => {
    setSelectedPoint(point)
    setSelectedField(null)
  }, [])

  // ── Drawing handlers ──────────────────────────────────────────────────────

  const handleStartDrawField = useCallback(() => {
    setMode('draw-field')
    setSelectedField(null)
    setSelectedPoint(null)
  }, [])

  const handleStartDrawPoint = useCallback(() => {
    setMode('draw-point')
    setSelectedField(null)
    setSelectedPoint(null)
  }, [])

  const handleDrawCancel = useCallback(() => {
    setMode('view')
  }, [])

  const handlePolygonComplete = useCallback((coords: [number, number][]) => {
    setMode('view')
    setAddFieldModal({ coordinates: coords, name: '' })
  }, [])

  const handlePointPlace = useCallback((coord: [number, number]) => {
    setMode('view')
    setAddPointModal({ coordinate: coord, name: '' })
  }, [])

  // ── CRUD: Add field ───────────────────────────────────────────────────────

  const saveNewField = async () => {
    if (!addFieldModal || !addFieldModal.name.trim()) return
    setSaving(true)

    const ring = [...addFieldModal.coordinates, addFieldModal.coordinates[0]]
    const geometry: GeoJSON.Polygon = { type: 'Polygon', coordinates: [ring] }

    const { error } = await supabase.from('fields').insert({
      name: addFieldModal.name.trim(),
      geometry,
    })

    setSaving(false)
    if (error) { console.error('Ошибка сохранения поля:', error); return }
    setAddFieldModal(null)
    await loadFields()
  }

  // ── CRUD: Add monitoring point ────────────────────────────────────────────

  const saveNewPoint = async () => {
    if (!addPointModal || !addPointModal.name.trim()) return
    setSaving(true)

    const geometry: GeoJSON.Point = {
      type: 'Point',
      coordinates: addPointModal.coordinate,
    }

    const { error } = await supabase.from('monitoring_points').insert({
      name: addPointModal.name.trim(),
      geometry,
    })

    setSaving(false)
    if (error) { console.error('Ошибка сохранения точки:', error); return }
    setAddPointModal(null)
    await loadPoints()
  }

  // ── CRUD: Rename ──────────────────────────────────────────────────────────

  const saveRename = async () => {
    if (!renameModal || !renameModal.name.trim()) return
    setSaving(true)

    const table = renameModal.type === 'field' ? 'fields' : 'monitoring_points'
    const { error } = await supabase
      .from(table)
      .update({ name: renameModal.name.trim() })
      .eq('id', renameModal.id)

    setSaving(false)
    if (error) { console.error('Ошибка переименования:', error); return }
    setRenameModal(null)

    if (renameModal.type === 'field') await loadFields()
    else await loadPoints()
  }

  // ── CRUD: Delete ──────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteConfirm) return
    setSaving(true)

    const table = deleteConfirm.type === 'field' ? 'fields' : 'monitoring_points'
    const { error } = await supabase.from(table).delete().eq('id', deleteConfirm.id)

    setSaving(false)
    if (error) { console.error('Ошибка удаления:', error); return }

    // Сброс выбора если удалён выбранный элемент
    if (deleteConfirm.type === 'field' && selectedField?.id === deleteConfirm.id) setSelectedField(null)
    if (deleteConfirm.type === 'point' && selectedPoint?.id === deleteConfirm.id) setSelectedPoint(null)

    setDeleteConfirm(null)

    if (deleteConfirm.type === 'field') await loadFields()
    else await loadPoints()
  }

  // ── CRUD: Add measurement ─────────────────────────────────────────────────

  const openMeasurementModal = useCallback(
    (entityType: 'field' | 'point', entityId: string, entityName: string) => {
      setAddMeasurementModal({ entityType, entityId, entityName })
      setMDate(new Date().toISOString().slice(0, 10))
      setMNdvi('')
      setMNdwi('')
      setMCloudCover('')
    },
    [],
  )

  const handleDataChanged = useCallback(() => {
    setChartRefreshKey((k) => k + 1)
    loadFields() // обновить latestNDVI в сайдбаре
  }, [loadFields])

  const saveMeasurement = async () => {
    if (!addMeasurementModal || !mDate) return
    setSaving(true)

    const table    = addMeasurementModal.entityType === 'field' ? 'measurements' : 'point_measurements'
    const idColumn = addMeasurementModal.entityType === 'field' ? 'field_id'     : 'point_id'

    const row: Record<string, unknown> = {
      [idColumn]: addMeasurementModal.entityId,
      date: mDate,
    }
    if (mNdvi.trim())       row.ndvi            = parseFloat(mNdvi)
    if (mNdwi.trim())       row.ndwi            = parseFloat(mNdwi)
    if (mCloudCover.trim()) row.cloud_cover_pct = parseInt(mCloudCover, 10)

    const { error } = await supabase.from(table).upsert(row, {
      onConflict: idColumn + ',date',
    })

    setSaving(false)
    if (error) {
      console.error('Ошибка сохранения измерения:', error.message, error.code, error.details, error.hint)
      alert(`Ошибка: ${error.message}`)
      return
    }

    setAddMeasurementModal(null)
    setChartRefreshKey((k) => k + 1)

    // Обновить latestNDVI если это поле
    if (addMeasurementModal.entityType === 'field') await loadFields()
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
    <main className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar
        fields={fields}
        points={monitoringPoints}
        selectedField={selectedField}
        selectedPoint={selectedPoint}
        mode={mode}
        chartRefreshKey={chartRefreshKey}
        onFieldSelect={handleFieldSelect}
        onPointSelect={handlePointSelect}
        onStartDrawField={handleStartDrawField}
        onStartDrawPoint={handleStartDrawPoint}
        onCancelDraw={handleDrawCancel}
        onRenameField={(id, name) => setRenameModal({ type: 'field', id, name })}
        onDeleteField={(id, name) => setDeleteConfirm({ type: 'field', id, name })}
        onRenamePoint={(id, name) => setRenameModal({ type: 'point', id, name })}
        onDeletePoint={(id, name) => setDeleteConfirm({ type: 'point', id, name })}
        onAddMeasurement={openMeasurementModal}
        onDataChanged={handleDataChanged}
      />

      <div className="flex-1 relative p-2">
        <Map
          fields={fields}
          monitoringPoints={monitoringPoints}
          mode={mode}
          selectedFieldId={selectedField?.id ?? null}
          selectedPointId={selectedPoint?.id ?? null}
          onFieldSelect={handleFieldSelect}
          onPointSelect={handlePointSelect}
          onPolygonComplete={handlePolygonComplete}
          onPointPlace={handlePointPlace}
          onDrawCancel={handleDrawCancel}
        />
      </div>
    </main>

      {/* ── Modal: добавить поле ─────────────────────────────────────────── */}
      {addFieldModal && (
        <ModalOverlay onClose={() => setAddFieldModal(null)}>
          <h2 className="text-white font-semibold text-lg mb-4">Новое поле</h2>
          <p className="text-gray-400 text-xs mb-3">
            {addFieldModal.coordinates.length} вершин полигона
          </p>
          <input
            autoFocus
            type="text"
            placeholder="Название поля"
            value={addFieldModal.name}
            onChange={(e) => setAddFieldModal({ ...addFieldModal, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && saveNewField()}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white
              placeholder-gray-500 text-sm focus:outline-none focus:border-green-500 mb-4"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setAddFieldModal(null)} className="px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors">
              Отмена
            </button>
            <button onClick={saveNewField} disabled={saving || !addFieldModal.name.trim()} className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-green-600 hover:bg-green-500">
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal: добавить точку мониторинга ────────────────────────────── */}
      {addPointModal && (
        <ModalOverlay onClose={() => setAddPointModal(null)}>
          <h2 className="text-white font-semibold text-lg mb-4">Новая точка мониторинга</h2>
          <p className="text-gray-400 text-xs mb-3">
            {addPointModal.coordinate[1].toFixed(5)}, {addPointModal.coordinate[0].toFixed(5)}
          </p>
          <input
            autoFocus
            type="text"
            placeholder="Название точки"
            value={addPointModal.name}
            onChange={(e) => setAddPointModal({ ...addPointModal, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && saveNewPoint()}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white
              placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 mb-4"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setAddPointModal(null)} className="px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors">
              Отмена
            </button>
            <button onClick={saveNewPoint} disabled={saving || !addPointModal.name.trim()} className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500">
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal: переименование ────────────────────────────────────────── */}
      {renameModal && (
        <ModalOverlay onClose={() => setRenameModal(null)}>
          <h2 className="text-white font-semibold text-lg mb-4">Переименовать</h2>
          <input
            autoFocus
            type="text"
            value={renameModal.name}
            onChange={(e) => setRenameModal({ ...renameModal, name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && saveRename()}
            className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white
              text-sm focus:outline-none focus:border-green-500 mb-4"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setRenameModal(null)} className="px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors">
              Отмена
            </button>
            <button onClick={saveRename} disabled={saving || !renameModal.name.trim()} className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-green-600 hover:bg-green-500">
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal: подтверждение удаления ────────────────────────────────── */}
      {deleteConfirm && (
        <ModalOverlay onClose={() => setDeleteConfirm(null)}>
          <h2 className="text-white font-semibold text-lg mb-2">Удалить?</h2>
          <p className="text-gray-400 text-sm mb-4">
            {deleteConfirm.type === 'field' ? 'Поле' : 'Точка'}{' '}
            <span className="text-white font-medium">&laquo;{deleteConfirm.name}&raquo;</span>{' '}
            и все измерения будут удалены.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors">
              Отмена
            </button>
            <button onClick={confirmDelete} disabled={saving} className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-red-600 hover:bg-red-500">
              {saving ? 'Удаляю…' : 'Удалить'}
            </button>
          </div>
        </ModalOverlay>
      )}

      {/* ── Modal: добавить измерение ────────────────────────────────────── */}
      {addMeasurementModal && (
        <ModalOverlay onClose={() => setAddMeasurementModal(null)}>
          <h2 className="text-white font-semibold text-lg mb-1">Добавить измерение</h2>
          <p className="text-gray-400 text-xs mb-4">{addMeasurementModal.entityName}</p>

          <div className="space-y-3">
            <label className="block">
              <span className="text-gray-400 text-xs">Дата</span>
              <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-green-500 block mt-1" />
            </label>
            <div className="flex gap-3">
              <label className="flex-1">
                <span className="text-gray-400 text-xs">NDVI</span>
                <input type="number" step="0.01" min="-1" max="1" placeholder="0.00"
                  value={mNdvi} onChange={(e) => setMNdvi(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-green-500 block mt-1" />
              </label>
              <label className="flex-1">
                <span className="text-gray-400 text-xs">NDWI</span>
                <input type="number" step="0.01" min="-1" max="1" placeholder="0.00"
                  value={mNdwi} onChange={(e) => setMNdwi(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-green-500 block mt-1" />
              </label>
              <label className="flex-1">
                <span className="text-gray-400 text-xs">Облачность %</span>
                <input type="number" step="1" min="0" max="100" placeholder="0"
                  value={mCloudCover} onChange={(e) => setMCloudCover(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 text-white text-sm focus:outline-none focus:border-green-500 block mt-1" />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-5">
            <button onClick={() => setAddMeasurementModal(null)} className="px-4 py-2 rounded-lg text-gray-400 hover:text-white text-sm transition-colors">
              Отмена
            </button>
            <button onClick={saveMeasurement} disabled={saving || !mDate} className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-green-600 hover:bg-green-500">
              {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </ModalOverlay>
      )}
    </>
  )
}

// ── Modal overlay ────────────────────────────────────────────────────────────

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  if (!mounted) return null

  const overlay = (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #ffffff',
          borderRadius: '12px',
          boxShadow: '0 25px 50px -12px rgba(255, 255, 255, 0.5)',
          padding: '20px',
          width: '100%',
          maxWidth: '28rem',
          margin: '0 16px',
        }}
      >
        {children}
      </div>
    </div>
  )

  return createPortal(overlay, document.body)
}