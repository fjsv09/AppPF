'use client'

import { MapPin, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface GpsDisplayProps {
  coordinates: string | null
  className?: string
  showLabel?: boolean
}

/**
 * Componente para mostrar coordenadas GPS con link a Google Maps
 * @param coordinates - String en formato "latitud,longitud" (ej: "-12.0464,-77.0428")
 */
export function GpsDisplay({ coordinates, className = '', showLabel = true }: GpsDisplayProps) {
  if (!coordinates) {
    return null
  }

  // Validar formato básico
  const parts = coordinates.split(',')
  if (parts.length !== 2) {
    return (
      <span className="text-sm text-red-400">
        Coordenadas inválidas
      </span>
    )
  }

  const [lat, lng] = parts.map(p => p.trim())
  const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lng}`

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <MapPin className="w-4 h-4 text-blue-400" />
      )}
      <Button
        variant="link"
        size="sm"
        className="text-blue-400 hover:text-blue-300 p-0 h-auto font-mono text-sm"
        onClick={() => window.open(googleMapsUrl, '_blank', 'noopener,noreferrer')}
      >
        {coordinates}
        <ExternalLink className="w-3 h-3 ml-1" />
      </Button>
    </div>
  )
}
