'use client'

import { useState, useEffect } from 'react'
import { MetasProgress } from '@/components/metas/metas-progress'
import { Users, ChevronDown, User } from 'lucide-react'

interface MetasPageClientProps {
  asesores: { id: string; nombre_completo: string; rol?: string }[]
  defaultUserId: string
  userRole: string
}

export function MetasPageClient({ asesores, defaultUserId, userRole }: MetasPageClientProps) {
  const [selectedAsesorId, setSelectedAsesorId] = useState<string>(asesores[0]?.id || defaultUserId)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load saved advisor on mount
  useEffect(() => {
    const savedId = localStorage.getItem('metas-selected-asesor')
    if (savedId && asesores.some(a => a.id === savedId)) {
      setSelectedAsesorId(savedId)
    }
    setIsLoaded(true)
  }, [asesores])

  // Save advisor on change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('metas-selected-asesor', selectedAsesorId)
    }
  }, [selectedAsesorId, isLoaded])

  const selectedAsesor = asesores.find(a => a.id === selectedAsesorId)

  const rolLabel = (rol?: string) => {
    switch(rol) {
      case 'admin': return 'Admin'
      case 'supervisor': return 'Supervisor'
      case 'asesor': return 'Asesor'
      default: return rol || ''
    }
  }

  const rolColor = (rol?: string) => {
    switch(rol) {
      case 'admin': return 'bg-purple-500/20 text-purple-400'
      case 'supervisor': return 'bg-amber-500/20 text-amber-400'
      default: return 'bg-slate-800 text-slate-500'
    }
  }

  return (
    <div className="space-y-4">
      {/* Selector de Personal */}
      <div className="relative">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="w-full md:w-auto flex items-center justify-between gap-3 px-4 py-2 rounded-xl bg-slate-900/80 border border-slate-700/50 hover:border-blue-500/50 transition-all duration-200 group"
        >
          <div className="flex items-center gap-2.5">
            <span className="p-1.5 bg-blue-500/20 rounded-lg group-hover:bg-blue-500/30 transition-colors">
              <User className="w-4 h-4 text-blue-400" />
            </span>
            <div className="text-left">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Viendo metas de</p>
              <p className="text-white font-bold text-base leading-tight">
                {selectedAsesor?.nombre_completo || 'Seleccionar'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedAsesor?.rol && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase ${rolColor(selectedAsesor.rol)}`}>
                {rolLabel(selectedAsesor.rol)}
              </span>
            )}
            <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
          </div>
        </button>

        {isOpen && (
          <div className="absolute z-50 top-full mt-2 w-full md:w-[420px] bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-slate-400 text-xs font-bold uppercase tracking-wider px-2">
                <Users className="w-3.5 h-3.5" />
                Personal ({asesores.length})
              </div>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {asesores.map(asesor => (
                <button
                  key={asesor.id}
                  onClick={() => {
                    setSelectedAsesorId(asesor.id)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-800/80 transition-colors ${
                    selectedAsesorId === asesor.id ? 'bg-blue-500/10 border-l-2 border-blue-500' : 'border-l-2 border-transparent'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${
                    selectedAsesorId === asesor.id ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {asesor.nombre_completo.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <span className={`font-medium ${selectedAsesorId === asesor.id ? 'text-blue-400' : 'text-slate-300'}`}>
                      {asesor.nombre_completo}
                    </span>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${rolColor(asesor.rol)}`}>
                    {rolLabel(asesor.rol)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Progreso del personal seleccionado */}
      <MetasProgress key={selectedAsesorId} userId={selectedAsesorId} userRole={selectedAsesor?.rol || 'asesor'} />
    </div>
  )
}
