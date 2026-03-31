'use client'

import dynamic from 'next/dynamic'
import type { FieldWithNDVI, MonitoringPoint, AppMode } from '@/types'

const NDVIChart = dynamic(() => import('./NDVIChart'), {
  loading: () => <p className="text-gray-400 text-sm p-3">Загрузка графика...</p>,
})

interface SidebarProps {
  fields:        FieldWithNDVI[]
  points:        MonitoringPoint[]
  selectedField: FieldWithNDVI | null
  selectedPoint: MonitoringPoint | null
  mode:          AppMode
  chartRefreshKey: number
  onFieldSelect:    (field: FieldWithNDVI)   => void
  onPointSelect:    (point: MonitoringPoint) => void
  onStartDrawField: () => void
  onStartDrawPoint: () => void
  onCancelDraw:     () => void
  onRenameField:    (id: string, name: string) => void
  onDeleteField:    (id: string, name: string) => void
  onRenamePoint:    (id: string, name: string) => void
  onDeletePoint:    (id: string, name: string) => void
  onAddMeasurement: (entityType: 'field' | 'point', entityId: string, entityName: string) => void
  onDataChanged:    () => void
}

export default function Sidebar({
  fields, points,
  selectedField, selectedPoint,
  mode, chartRefreshKey,
  onFieldSelect, onPointSelect,
  onStartDrawField, onStartDrawPoint, onCancelDraw,
  onRenameField, onDeleteField,
  onRenamePoint, onDeletePoint,
  onAddMeasurement,
  onDataChanged,
}: SidebarProps) {
  const isDrawing = mode !== 'view'

  return (
    <aside className="w-80 shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h1 className="text-white font-bold text-lg">Water Watch</h1>
        <p className="text-gray-400 text-xs mt-0.5">Мониторинг NDVI / NDWI</p>
      </div>

      {/* Drawing banner */}
      {isDrawing && (
        <div className="mx-3 mt-3 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 flex items-center justify-between">
          <span className="text-white text-sm">
            {mode === 'draw-field' ? '✏️ Рисую поле…' : '📍 Ставлю точку…'}
          </span>
          <button onClick={onCancelDraw} className="text-gray-400 hover:text-white text-xs transition-colors ml-2">
            Отмена
          </button>
        </div>
      )}

      {/* Lists */}
      <div className="flex-1 overflow-y-auto">

        {/* Fields */}
        <section className="p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">
              Поля ({fields.length})
            </p>
            <button
              onClick={onStartDrawField} disabled={isDrawing}
              className="text-xs text-green-400 hover:text-green-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              + Добавить
            </button>
          </div>
          <div className="space-y-0.5">
            {fields.map((field) => (
              <FieldRow
                key={field.id} field={field}
                selected={selectedField?.id === field.id}
                onSelect={() => onFieldSelect(field)}
                onRename={() => onRenameField(field.id, field.name)}
                onDelete={() => onDeleteField(field.id, field.name)}
              />
            ))}
            {fields.length === 0 && (
              <p className="text-gray-600 text-xs px-1 py-2">Нет полей — нарисуйте первое</p>
            )}
          </div>
        </section>

        <div className="mx-3 border-t border-gray-700" />

        {/* Monitoring points */}
        <section className="p-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">
              Точки мониторинга ({points.length})
            </p>
            <button
              onClick={onStartDrawPoint} disabled={isDrawing}
              className="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              + Добавить
            </button>
          </div>
          <div className="space-y-0.5">
            {points.map((point) => (
              <PointRow
                key={point.id} point={point}
                selected={selectedPoint?.id === point.id}
                onSelect={() => onPointSelect(point)}
                onRename={() => onRenamePoint(point.id, point.name)}
                onDelete={() => onDeletePoint(point.id, point.name)}
              />
            ))}
            {points.length === 0 && (
              <p className="text-gray-600 text-xs px-1 py-2">Нет точек — поставьте первую</p>
            )}
          </div>
        </section>

      </div>

      {/* Chart panel */}
      {(selectedField || selectedPoint) ? (
        <div className="border-t border-gray-700 flex flex-col overflow-hidden" style={{ maxHeight: '55%' }}>
          {/* Detail header */}
          <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
            <span className="text-sm">{selectedField ? '🟩' : '🔵'}</span>
            <span className="text-white font-medium text-sm truncate flex-1">
              {selectedField?.name ?? selectedPoint?.name}
            </span>
            {selectedField?.area_ha != null && (
              <span className="text-gray-500 text-xs shrink-0">{selectedField.area_ha.toFixed(1)} га</span>
            )}
            {/* Add measurement button */}
            <button
              onClick={() => {
                if (selectedField)
                  onAddMeasurement('field', selectedField.id, selectedField.name)
                else if (selectedPoint)
                  onAddMeasurement('point', selectedPoint.id, selectedPoint.name)
              }}
              className="shrink-0 px-2 py-1 rounded-md bg-gray-700 hover:bg-gray-600 text-gray-300
                hover:text-white text-xs transition-colors"
              title="Добавить измерение вручную"
            >
              + измерение
            </button>
          </div>

          <div className="overflow-y-auto px-3 pb-3">
            {selectedField && (
              <NDVIChart
                entityId={selectedField.id}
                entityType="field"
                entityName={selectedField.name}
                refreshKey={chartRefreshKey}
                onDataChanged={onDataChanged}
              />
            )}
            {selectedPoint && (
              <NDVIChart
                entityId={selectedPoint.id}
                entityType="point"
                entityName={selectedPoint.name}
                refreshKey={chartRefreshKey}
                onDataChanged={onDataChanged}
              />
            )}
          </div>
        </div>
      ) : (
        <div className="border-t border-gray-700 flex flex-col items-center justify-center h-28 text-center p-3">
          <p className="text-gray-600 text-xs">Выберите поле или точку на карте</p>
        </div>
      )}
    </aside>
  )
}

// ── FieldRow ──────────────────────────────────────────────────────────────────

function FieldRow({
  field, selected, onSelect, onRename, onDelete,
}: {
  field: FieldWithNDVI; selected: boolean
  onSelect: () => void; onRename: () => void; onDelete: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
        selected ? 'bg-green-900/40 border border-green-800' : 'hover:bg-gray-800 border border-transparent'
      }`}
    >
      <span className="w-2 h-2 rounded-sm shrink-0 bg-green-500 opacity-80" />
      <span className="flex-1 font-medium truncate text-gray-200">{field.name}</span>
      {field.latestNDVI != null && (
        <span className={`text-xs font-mono shrink-0 ${ndviColor(field.latestNDVI)}`}>
          {field.latestNDVI.toFixed(2)}
        </span>
      )}
      <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Btn title="Переименовать" onClick={(e) => { e.stopPropagation(); onRename() }}>✎</Btn>
        <Btn title="Удалить" danger onClick={(e) => { e.stopPropagation(); onDelete() }}>✕</Btn>
      </span>
    </div>
  )
}

// ── PointRow ──────────────────────────────────────────────────────────────────

function PointRow({
  point, selected, onSelect, onRename, onDelete,
}: {
  point: MonitoringPoint; selected: boolean
  onSelect: () => void; onRename: () => void; onDelete: () => void
}) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-1.5 px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-sm ${
        selected ? 'bg-blue-900/40 border border-blue-800' : 'hover:bg-gray-800 border border-transparent'
      }`}
    >
      <span className="w-2 h-2 rounded-full shrink-0 bg-blue-500" />
      <span className="flex-1 font-medium truncate text-gray-200">{point.name}</span>
      <span className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <Btn title="Переименовать" onClick={(e) => { e.stopPropagation(); onRename() }}>✎</Btn>
        <Btn title="Удалить" danger onClick={(e) => { e.stopPropagation(); onDelete() }}>✕</Btn>
      </span>
    </div>
  )
}

// ── Btn ───────────────────────────────────────────────────────────────────────

function Btn({
  children, title, danger = false, onClick,
}: {
  children: React.ReactNode; title: string; danger?: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  return (
    <button title={title} onClick={onClick}
      className={`w-5 h-5 flex items-center justify-center rounded text-xs transition-colors
        ${danger ? 'text-gray-500 hover:text-red-400 hover:bg-red-900/30' : 'text-gray-500 hover:text-white hover:bg-gray-700'}`}
    >
      {children}
    </button>
  )
}

function ndviColor(ndvi: number) {
  if (ndvi >= 0.5) return 'text-green-400'
  if (ndvi >= 0.3) return 'text-yellow-400'
  return 'text-red-400'
}