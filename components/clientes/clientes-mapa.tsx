'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, User, Phone, Map as MapIcon, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// Fix Leaflet's default icon path issues in Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Create custom icons for different statuses
const createCustomIcon = (color: string) => {
    return L.divIcon({
        className: 'custom-icon',
        html: `
            <div style="
                background-color: ${color};
                width: 24px;
                height: 24px;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                border: 3px solid white;
                box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.5);
            "></div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 24],
        popupAnchor: [0, -24]
    })
}

const icons = {
    active: createCustomIcon('#10b981'), // Emerald 500 (Activo normal sin deuda)
    debt: createCustomIcon('#f59e0b'), // Amber 500 (Con Deuda Activa)
    inactive: createCustomIcon('#64748b'), // Slate 500 (Inactivo / Sin prestamos)
    critical: createCustomIcon('#ef4444') // Red 500 (Ejemplo futuro)
}

interface ClientesMapaProps {
    clientes: any[]
}

// Helper component to auto-fit the map bounds to the markers
function BoundsAutoFitter({ markers }: { markers: [number, number][] }) {
    const map = useMap();
    useEffect(() => {
        if (markers.length > 0) {
            const bounds = L.latLngBounds(markers);
            map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
        }
    }, [map, markers]);
    return null;
}

export default function ClientesMapa({ clientes }: ClientesMapaProps) {
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    if (!isMounted) return <div className="h-[500px] w-full rounded-2xl bg-slate-900 border border-slate-800 animate-pulse flex items-center justify-center text-slate-500">Cargando mapa de clientes...</div>

    // Filter out clients without valid coordinates
    const mapItems = clientes.map(c => {
        const coordsStr = c.gps_coordenadas
        
        if (!coordsStr || typeof coordsStr !== 'string') return null;
        const [latStr, lngStr] = coordsStr.split(',')
        if (!latStr || !lngStr) return null;

        const lat = parseFloat(latStr.trim())
        const lng = parseFloat(lngStr.trim())

        if (isNaN(lat) || isNaN(lng)) return null;

        // Determine status logic
        let icon = icons.active
        let statusText = 'Activo'
        let statusColor = 'text-emerald-500'
        let bgBadge = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'

        if (c.estado !== 'activo') {
            icon = icons.inactive
            statusText = c.estado?.toUpperCase() || 'INACTIVO'
            statusColor = 'text-slate-400'
            bgBadge = 'bg-slate-500/10 border-slate-500/20 text-slate-400'
        } else if (c.stats?.totalDebt > 0) {
            icon = icons.debt
            statusText = 'Activo (Con Deuda)'
            statusColor = 'text-amber-500'
            bgBadge = 'bg-amber-500/10 border-amber-500/20 text-amber-500'
        }

        return {
            ...c,
            lat,
            lng,
            icon,
            statusText,
            statusColor,
            bgBadge
        }
    }).filter(Boolean) as any[]

    if (mapItems.length === 0) {
        return (
            <div className="h-[500px] w-full rounded-2xl bg-slate-900/50 border border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-4">
                <MapIcon className="w-12 h-12 opacity-20" />
                <div className="text-center">
                    <p className="font-medium text-slate-400">No hay coordenadas disponibles</p>
                    <p className="text-sm">Ninguno de los clientes actualmente filtrados tiene un GPS asignado.</p>
                </div>
            </div>
        )
    }

    const markersList: [number, number][] = mapItems.map(i => [i.lat, i.lng])
    const center: [number, number] = markersList.length > 0 ? markersList[0] : [-12.0464, -77.0428]

    return (
        <div className="h-[600px] w-full rounded-2xl overflow-hidden border border-slate-800 shadow-xl relative z-10 group">
            <MapContainer 
                center={center} 
                zoom={13} 
                scrollWheelZoom={true} 
                className="h-full w-full"
                attributionControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                />
                
                <BoundsAutoFitter markers={markersList} />

                {mapItems.map((item) => (
                    <Marker 
                        key={item.id} 
                        position={[item.lat, item.lng]}
                        icon={item.icon}
                    >
                        <Popup className="custom-popup">
                            <div className="p-1 min-w-[220px]">
                                <div className="font-bold text-sm mb-2 flex flex-col">
                                    <span className="truncate flex items-center gap-2 text-slate-800">
                                        <User className="w-3.5 h-3.5 opacity-70" />
                                        {item.nombres}
                                    </span>
                                    <span className="text-xs text-slate-500 font-mono flex items-center gap-2 mt-1 ml-5">
                                        #{item.dni}
                                    </span>
                                </div>
                                
                                <div className="mb-3 pl-5 border-l-2 border-slate-100 py-1 space-y-1">
                                    {item.telefono && (
                                        <div className="flex items-center gap-2 text-xs text-slate-600">
                                            <Phone className="w-3 h-3 text-slate-400" />
                                            {item.telefono}
                                        </div>
                                    )}
                                    {item.sectores?.nombre && (
                                        <div className="flex items-center gap-2 text-xs text-slate-600">
                                            <MapPin className="w-3 h-3 text-slate-400" />
                                            {item.sectores.nombre}
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between bg-slate-50 rounded-lg p-2 mb-3 border border-slate-100">
                                    <Badge variant="outline" className={item.bgBadge + " text-[10px]"}>
                                        {item.statusText}
                                    </Badge>
                                    {item.stats?.totalDebt > 0 && (
                                        <div className="flex flex-col items-end">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Deuda</span>
                                            <span className="font-bold font-mono text-amber-600">
                                                ${item.stats.totalDebt.toFixed(2)}
                                            </span>
                                        </div>
                                    )}
                                </div>

                                <Button 
                                    onClick={() => window.open(`/dashboard/clientes/${item.id}`, '_blank')}
                                    className="w-full bg-slate-900 hover:bg-slate-800 text-white shadow-sm flex items-center justify-center gap-2 h-8"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    Ver Perfil
                                </Button>
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {/* Global legend overlay */}
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md p-3 rounded-xl border border-slate-200 shadow-lg z-[1000] text-xs pointer-events-none">
                <h4 className="font-bold text-slate-700 mb-2 uppercase tracking-wider text-[10px]">Leyenda</h4>
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm border border-emerald-600"></div><span className="text-slate-600 font-medium">Activo (Sin Deuda)</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500 shadow-sm border border-amber-600"></div><span className="text-slate-600 font-medium">Activo (Con Deuda)</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-500 shadow-sm border border-slate-600"></div><span className="text-slate-600 font-medium">Inactivo / Sin Préstamos</span></div>
                </div>
            </div>

            {/* Custom CSS overrides for Leaflet popups inside Next.js dark mode */}
            <style dangerouslySetInnerHTML={{ __html: `
                .leaflet-popup-content-wrapper {
                    background-color: white;
                    color: #1e293b; 
                    border-radius: 12px;
                    border: 1px solid #e2e8f0;
                    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
                }
                .leaflet-popup-tip {
                    background-color: white;
                }
                .leaflet-popup-content p {
                    margin: 0;
                }
                .leaflet-container {
                    background-color: #0f172a !important; 
                }
            ` }} />
        </div>
    )
}
