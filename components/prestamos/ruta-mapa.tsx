'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Wallet, MapPin, CheckCircle2, AlertTriangle, User } from 'lucide-react'
import { Button } from '@/components/ui/button'

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
    paid: createCustomIcon('#64748b'), // Slate 500
    normal: createCustomIcon('#10b981'), // Emerald 500
    warning: createCustomIcon('#f59e0b'), // Amber 500
    critical: createCustomIcon('#ef4444'), // Red 500
}

interface RutaMapaProps {
    prestamos: any[]
    onQuickPay: (prestamo: any, e: React.MouseEvent) => void
    today: string
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

export default function RutaMapa({ prestamos, onQuickPay, today }: RutaMapaProps) {
    const [isMounted, setIsMounted] = useState(false)

    useEffect(() => {
        setIsMounted(true)
    }, [])

    if (!isMounted) return <div className="h-[400px] w-full rounded-xl bg-slate-900 animate-pulse flex items-center justify-center text-slate-500">Cargando mapa...</div>

    // Filter out loans without valid coordinates
    const mapItems = prestamos.map(p => {
        const coordsStr = p.gps_coordenadas || p.clientes?.solicitudes?.[0]?.gps_coordenadas
        
        if (!coordsStr || typeof coordsStr !== 'string') return null;
        const [latStr, lngStr] = coordsStr.split(',')
        if (!latStr || !lngStr) return null;

        const lat = parseFloat(latStr.trim())
        const lng = parseFloat(lngStr.trim())

        if (isNaN(lat) || isNaN(lng)) return null;

        // Determine status logic
        const cuotasPagadas = p.total_pagado_acumulado ? Math.floor(p.total_pagado_acumulado / p.valorCuota) : 0
        const totalCuotas = p.numero_cuotas || p.totalCuotas || 0
        const deudaHoy = p.deudaHoy || 0
        const isFullyPaid = p.saldo_pendiente <= 0 || (cuotasPagadas >= totalCuotas && totalCuotas > 0)
        
        let icon = icons.normal
        let statusText = 'Pendiente'
        let statusColor = 'text-emerald-500'

        if (isFullyPaid || (deudaHoy <= 0)) {
            icon = icons.paid
            statusText = 'Al Día / Pagado'
            statusColor = 'text-slate-400'
        } else if (p.estado_mora === 'vencido' || p.estado_mora === 'moroso' || p.cuotasAtrasadas >= 3) {
            icon = icons.critical
            statusText = 'Morosidad Crítica'
            statusColor = 'text-red-500'
        } else if (p.estado_mora === 'cpp' || p.cuotasAtrasadas >= 1) {
            icon = icons.warning
            statusText = 'Atrasado'
            statusColor = 'text-amber-500'
        }

        return {
            ...p,
            lat,
            lng,
            icon,
            statusText,
            statusColor,
            deudaHoy
        }
    }).filter(Boolean) as any[]

    if (mapItems.length === 0) {
        return (
            <div className="h-[400px] w-full rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-4">
                <MapPin className="w-12 h-12 opacity-20" />
                <p>No se encontraron coordenadas GPS válidas para la ruta de hoy.</p>
            </div>
        )
    }

    const markersList: [number, number][] = mapItems.map(i => [i.lat, i.lng])

    // Default center (Lima, if nothing else)
    const center: [number, number] = markersList.length > 0 ? markersList[0] : [-12.0464, -77.0428]

    return (
        <div className="h-[500px] w-full rounded-2xl overflow-hidden border border-slate-800 shadow-xl relative z-10 group">
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
                            <div className="p-1 min-w-[200px]">
                                <div className="font-bold text-sm mb-1 flex items-center gap-2">
                                    <User className="w-3.5 h-3.5 opacity-70" />
                                    <span className="truncate">{item.clientes?.nombres}</span>
                                </div>
                                
                                <div className="text-xs text-slate-600 mb-2 font-mono flex items-center justify-between">
                                    <span>#{item.clientes?.dni}</span>
                                </div>

                                <div className="flex bg-slate-100 rounded-lg p-2 mb-3 items-center justify-between border border-slate-200">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Mora / Día</span>
                                        <span className={`font-bold text-lg font-mono ${item.statusColor}`}>
                                            ${item.deudaHoy.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="flex flex-col items-end">
                                         <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Estado</span>
                                         <span className={`text-xs font-bold flex items-center gap-1 ${item.statusColor}`}>
                                            {item.deudaHoy <= 0 ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                                            {item.statusText}
                                        </span>
                                    </div>
                                </div>

                                {item.deudaHoy > 0 && (
                                    <Button 
                                        onClick={(e) => {
                                            // Call the quick pay
                                            item.onClickAction = true;
                                            onQuickPay(item, e);
                                        }}
                                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2 h-8"
                                    >
                                        <Wallet className="w-3.5 h-3.5" />
                                        Cobrar
                                    </Button>
                                )}
                            </div>
                        </Popup>
                    </Marker>
                ))}
            </MapContainer>

            {/* Global legend overlay */}
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md p-3 rounded-xl border border-slate-200 shadow-lg z-[1000] text-xs pointer-events-none">
                <h4 className="font-bold text-slate-700 mb-2 uppercase tracking-wider text-[10px]">Leyenda</h4>
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm border border-emerald-600"></div><span className="text-slate-600 font-medium">Pendiente (Al Día)</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-500 shadow-sm border border-amber-600"></div><span className="text-slate-600 font-medium">Mora Leve</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-500 shadow-sm border border-red-600"></div><span className="text-slate-600 font-medium">Mora Crítica</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-500 shadow-sm border border-slate-600"></div><span className="text-slate-600 font-medium">Pagado</span></div>
                </div>
            </div>

            {/* Custom CSS overrides for Leaflet popups inside Next.js dark mode */}
            <style jsx global>{`
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
            `}</style>
        </div>
    )
}
