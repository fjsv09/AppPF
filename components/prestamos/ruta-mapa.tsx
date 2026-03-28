'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Wallet, MapPin, CheckCircle2, AlertTriangle, User, Lock, Phone, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

import { getTodayPeru, getLoanStatusUI } from '@/lib/financial-logic'

// Fix Leaflet's default icon path issues in Next.js
if (typeof window !== 'undefined') {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
      iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
    });
}

// Create custom icons for different statuses
const createCustomIcon = (color: string) => {
    if (typeof window === 'undefined') return {} as any;
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

// icons object removed - now dynamic via getLoanStatusUI

interface RutaMapaProps {
    prestamos: any[]
    onQuickPay: (prestamo: any, e: React.MouseEvent) => void
    today: string
    isBlocked?: boolean
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

export default function RutaMapa({ prestamos, onQuickPay, today, isBlocked = false }: RutaMapaProps) {
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

        // Use centralized UI logic
        const statusUI = getLoanStatusUI(p);
        const icon = createCustomIcon(statusUI.marker);
        const deudaHoy = p.deudaHoy || 0;

        return {
            ...p,
            lat,
            lng,
            icon,
            statusText: statusUI.label,
            statusColor: statusUI.color,
            badgeClass: cn(statusUI.border, statusUI.color, statusUI.animate && "animate-pulse"),
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
                                
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                    <a 
                                        href={item.clientes?.telefono ? `tel:${item.clientes?.telefono}` : '#'} 
                                        className={cn(
                                            "flex items-center justify-center gap-1.5 text-xs font-bold transition-all px-2 py-2 rounded-xl border shadow-sm",
                                            item.clientes?.telefono 
                                                ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200" 
                                                : "text-slate-400 bg-slate-50 border-slate-200 cursor-not-allowed"
                                        )}
                                        onClick={(e) => {
                                            if (!item.clientes?.telefono) e.preventDefault();
                                        }}
                                    >
                                        <Phone className={cn("w-3.5 h-3.5", item.clientes?.telefono ? "text-emerald-600" : "text-slate-300")} />
                                        <span>Llamar</span>
                                    </a>
                                    <Button
                                        asChild
                                        variant="outline"
                                        className="h-9 rounded-xl border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-1.5 text-xs font-bold"
                                    >
                                        <Link href={`/dashboard/prestamos/${item.id}`}>
                                            <ChevronRight className="w-3.5 h-3.5" />
                                            Detallles
                                        </Link>
                                    </Button>
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
                                         <Badge variant="outline" className={cn("text-[10px] h-5 px-1.5 uppercase tracking-wide bg-slate-950/50", item.badgeClass)}>
                                            {item.statusText}
                                        </Badge>
                                    </div>
                                </div>

                                {item.deudaHoy > 0 && (
                                    <Button 
                                        onClick={(e) => {
                                             if (!isBlocked) onQuickPay(item, e);
                                        }}
                                        disabled={isBlocked}
                                        className={cn(
                                            "w-full shadow-sm flex items-center justify-center gap-2 h-8",
                                            isBlocked 
                                                ? "bg-slate-300 text-slate-500 cursor-not-allowed" 
                                                : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                        )}
                                    >
                                        {isBlocked ? <Lock className="w-3.5 h-3.5" /> : <Wallet className="w-3.5 h-3.5" />}
                                        {isBlocked ? 'Bloqueado' : 'Cobrar'}
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
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm border border-emerald-600"></div><span className="text-slate-600 font-medium">Al día (OK)</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-amber-400 shadow-sm border border-amber-500"></div><span className="text-slate-600 font-medium">Deuda Hoy</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-orange-500 shadow-sm border border-orange-600"></div><span className="text-slate-600 font-medium">CPP (Mora Leve)</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-rose-500 shadow-sm border border-rose-600"></div><span className="text-slate-600 font-medium">Moroso / Vencido</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-500 shadow-sm border border-slate-600"></div><span className="text-slate-600 font-medium">Finalizado / Renovado</span></div>
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
