'use client'

import { useState } from 'react'
import { MapPin, Loader2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface GpsInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
}

/**
 * Input para capturar coordenadas GPS del cliente
 * Permite captura automática o entrada manual
 */
export function GpsInput({ value, onChange, disabled = false, error }: GpsInputProps) {
  const [isCapturing, setIsCapturing] = useState(false)

  const captureLocation = () => {
    if (!navigator.geolocation) {
      alert('Tu navegador no soporta geolocalización')
      return
    }

    setIsCapturing(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(6)
        const lng = position.coords.longitude.toFixed(6)
        onChange(`${lat},${lng}`)
        setIsCapturing(false)
      },
      (error) => {
        console.error('Error capturando ubicación:', error)
        alert('No se pudo obtener la ubicación. Por favor ingresa las coordenadas manualmente.')
        setIsCapturing(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    )
  }

  const openInMaps = () => {
    if (!value) return
    const url = `https://www.google.com/maps?q=${value}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const isValidFormat = (coords: string) => {
    if (!coords) return false
    const parts = coords.split(',')
    if (parts.length !== 2) return false
    const [lat, lng] = parts.map(p => parseFloat(p.trim()))
    return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="gps-coords" className="text-sm font-medium text-white/90">
        Coordenadas GPS de la Casa *
      </Label>
      
      <div className="flex gap-2">
        <div className="flex-1">
          <Input
            id="gps-coords"
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder="-12.0464,-77.0428"
            className={`bg-white/5 border-white/10 text-white placeholder:text-white/40 ${
              error ? 'border-red-500' : ''
            }`}
          />
          {error && (
            <p className="text-xs text-red-400 mt-1">{error}</p>
          )}
          <p className="text-xs text-white/50 mt-1">
            Formato: latitud,longitud
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={captureLocation}
          disabled={isCapturing || disabled}
          className="shrink-0 bg-white/5 border-white/10 hover:bg-white/10"
          title="Capturar mi ubicación actual"
        >
          {isCapturing ? (
            <Loader2 className="w-4 h-4 animate-spin text-white/70" />
          ) : (
            <MapPin className="w-4 h-4 text-white/70" />
          )}
        </Button>

        {value && isValidFormat(value) && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={openInMaps}
            className="shrink-0 bg-white/5 border-white/10 hover:bg-white/10"
            title="Ver en Google Maps"
          >
            <ExternalLink className="w-4 h-4 text-blue-400" />
          </Button>
        )}
      </div>
    </div>
  )
}
