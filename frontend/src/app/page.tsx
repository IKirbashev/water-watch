'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Sidebar from '@/components/Sidebar'
import type { Field } from '@/types'

// ВАЖНО: Mapbox не работает на сервере (использует window).
// dynamic + ssr:false — единственный правильный способ подключить его в Next.js
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

export default function Home() {
  const [selectedField, setSelectedField] = useState<Field | null>(null)

  return (
    <main className="flex h-screen bg-gray-950 overflow-hidden">
      <Sidebar
        selectedField={selectedField}
        onFieldSelect={setSelectedField}
      />
      <div className="flex-1 relative p-2">
        <Map
          onFieldSelect={setSelectedField}
          selectedFieldId={selectedField?.id ?? null}
        />
      </div>
    </main>
  )
}