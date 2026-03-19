'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import type { Field } from '@/types'

// Ленивая загрузка графика
const NDVIChart = dynamic(() => import('./NDVIChart'), {
  loading: () => <p className="text-gray-400 text-sm p-3">Загрузка графика...</p>,
})

interface SidebarProps {
  selectedField: Field | null
  onFieldSelect: (field: Field) => void
}

export default function Sidebar({ selectedField, onFieldSelect }: SidebarProps) {
  const [fields, setFields] = useState<Field[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('fields')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error) setFields(data || [])
      setLoading(false)
    }
    load()
  }, [])

  return (
    <aside className="w-80 bg-gray-900 border-r border-gray-800 flex flex-col h-full overflow-hidden">
      {/* Шапка */}
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-white font-bold text-lg">Water Watch</h1>
        <p className="text-gray-400 text-xs mt-0.5">Мониторинг водных ресурсов</p>
      </div>

      {/* Список полей */}
      <div className="p-3 border-b border-gray-800">
        <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-2">
          Мои поля ({fields.length})
        </p>

        {loading && (
          <p className="text-gray-500 text-sm">Загрузка...</p>
        )}

        <div className="space-y-1">
          {fields.map((field) => (
            <button
              key={field.id}
              onClick={() => onFieldSelect(field)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm ${
                selectedField?.id === field.id
                  ? 'bg-green-900/50 text-green-300 border border-green-800'
                  : 'text-gray-300 hover:bg-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium truncate">{field.name}</span>
                {field.area_ha && (
                  <span className="text-gray-500 text-xs ml-2 shrink-0">
                    {field.area_ha.toFixed(1)} га
                  </span>
                )}
              </div>
            </button>
          ))}

          {!loading && fields.length === 0 && (
            <p className="text-gray-500 text-sm px-2">
              Полей пока нет. Добавьте их в Supabase.
            </p>
          )}
        </div>
      </div>

      {/* Данные выбранного поля */}
      <div className="flex-1 overflow-y-auto p-3">
        {selectedField ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-white font-semibold text-sm">{selectedField.name}</h2>
              <span className="text-gray-500 text-xs">
                {selectedField.area_ha?.toFixed(1)} га
              </span>
            </div>
            <NDVIChart
              fieldId={selectedField.id}
              fieldName={selectedField.name}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <div className="text-3xl mb-2">🗺️</div>
            <p className="text-gray-400 text-sm">
              Выберите поле на карте или в списке
            </p>
          </div>
        )}
      </div>
    </aside>
  )
}