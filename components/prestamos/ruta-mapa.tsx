'use client'

import { useEffect, useState, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, CircleMarker } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Wallet, MapPin, User, Lock, Phone, Navigation, AlertTriangle, CheckCircle, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { VisitActionButton } from './visit-action-button'
import { getTodayPeru, getLoanStatusUI } from '@/lib/financial-logic'

// Helper for distance calculation
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000 // meters
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return Math.round(R * c)
}

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
const createCustomIcon = (color: string, isPayment: boolean = false) => {
    if (typeof window === 'undefined') return {} as any;

    if (isPayment) {
        return L.divIcon({
            className: 'payment-icon',
            html: `
                <div style="
                    background-color: #10b981;
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    border: 3px solid white;
                    box-shadow: 0 4px 10px rgba(16, 185, 129, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-weight: bold;
                ">
                    $
                </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -16]
        })
    }

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

const createExtraIcon = () => {
    if (typeof window === 'undefined') return {} as any;
    return L.divIcon({
        className: 'extra-icon',
        html: `
            <div style="
                background-color: #f97316;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 4px 10px rgba(249, 115, 22, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 14px;
            ">
                ★
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    })
}

const createExtraPaymentIcon = () => {
    if (typeof window === 'undefined') return {} as any;
    return L.divIcon({
        className: 'extra-payment-icon',
        html: `
            <div style="
                background-color: #f97316;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 4px 10px rgba(249, 115, 22, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 15px;
            ">
                $
            </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
    })
}

interface RutaMapaProps {
    prestamos: any[]
    onQuickPay: (prestamo: any, e: React.MouseEvent) => void
    today: string
    isBlocked?: boolean
    userRole?: string
    currentUserId?: string
    perfiles?: any[]
}

// Peru Geographic Bounds (Approximate)
const PERU_BOUNDS = {
    minLat: -18.5,
    maxLat: 0.1,
    minLng: -81.5,
    maxLng: -68.5
}

const isValidPeruCoord = (lat: number, lng: number) => {
    if (isNaN(lat) || isNaN(lng)) return false;
    // Check if coordinates are within Peru + small buffer
    return lat >= PERU_BOUNDS.minLat && lat <= PERU_BOUNDS.maxLat && 
           lng >= PERU_BOUNDS.minLng && lng <= PERU_BOUNDS.maxLng;
}

// Helper component to auto-fit the map bounds to the markers
function BoundsAutoFitter({ markers }: { markers: [number, number][] }) {
    const map = useMap();
    useEffect(() => {
        if (markers.length > 0) {
            try {
                const bounds = L.latLngBounds(markers);
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
                }
            } catch (err) {
                // ignore
            }
            
            // Invalidate size after a short delay to handle container animations
            const timer = setTimeout(() => {
                map.invalidateSize();
            }, 500);
            return () => clearTimeout(timer);
        }
    }, [map, markers]);
    return null;
}

export default function RutaMapa({ 
    prestamos = [], 
    onQuickPay, 
    today, 
    isBlocked = false, 
    userRole = 'asesor',
    currentUserId,
    perfiles = []
}: RutaMapaProps) {
    const [isMounted, setIsMounted] = useState(false)
    const [userLoc, setUserLoc] = useState<[number, number] | null>(null)
    const [radioMax, setRadioMax] = useState(300)
    const [filterMode, setFilterMode] = useState<'all' | 'clients' | 'payments'>('all')

    useEffect(() => {
        setIsMounted(true)
        
        // Fetch radius config
        fetch('/api/configuracion?clave=visita_radio_maximo')
            .then(res => res.json())
            .then(data => {
                if (data.valor) setRadioMax(parseInt(data.valor))
            })
            .catch(() => {})
        if (typeof window !== 'undefined' && navigator.geolocation) {
            const watchId = navigator.geolocation.watchPosition(
                (pos) => setUserLoc([pos.coords.latitude, pos.coords.longitude]),
                () => {},
                { enableHighAccuracy: true }
            )
            return () => navigator.geolocation.clearWatch(watchId)
        }
    }, [])

    // 1. First, get all raw items from loans and payments
    const rawItems = useMemo(() => {
        try {
            return prestamos.flatMap(p => {
                const items = [];
                
                // Client Official Location
                if (filterMode === 'all' || filterMode === 'clients') {
                    const coordsStr = p.gps_coordenadas || p.clientes?.solicitudes?.[0]?.gps_coordenadas
                    if (coordsStr && typeof coordsStr === 'string') {
                        const [latStr, lngStr] = coordsStr.split(',')
                        if (latStr && lngStr) {
                            const lat = parseFloat(latStr.trim())
                            const lng = parseFloat(lngStr.trim())
                            // Ignore [0,0], NaN and outside Peru
                            if (isValidPeruCoord(lat, lng)) {
                                const statusUI = getLoanStatusUI(p);
                                const isExtra = !p.cuota_dia_programada || p.cuota_dia_programada <= 0.01;
                                items.push({
                                    ...p,
                                    id: `${p.id}-official`,
                                    lat,
                                    lng,
                                    isPayment: false,
                                    isExtra,
                                    icon: isExtra ? createExtraIcon() : createCustomIcon(statusUI.marker),
                                    statusText: statusUI.label,
                                    statusColor: statusUI.color,
                                    badgeClass: cn(statusUI.border, statusUI.color, statusUI.animate && "animate-pulse"),
                                    deudaHoy: p.deudaHoy || 0
                                });
                            }
                        }
                    }
                }

                // Real Payment Location (Today)
                if ((userRole === 'admin' || userRole === 'supervisor') && (filterMode === 'all' || filterMode === 'payments')) {
                    const hoyPeru = getTodayPeru();
                    let myAdvisorIds: string[] = [];
                    if (userRole === 'supervisor' && currentUserId && Array.isArray(perfiles)) {
                        myAdvisorIds = perfiles
                            .filter(profile => profile && profile.supervisor_id === currentUserId)
                            .map(profile => profile.id);
                    }

                    const pagosDeHoy = (p.cronograma_cuotas || [])
                        .flatMap((c: any) => c.pagos || [])
                        .filter((pag: any) => {
                            if (!pag || !pag.created_at) return false;
                            
                            // [FIX] Comparación de fecha ajustada a Perú para evitar desfase UTC
                            const fechaPago = new Date(pag.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
                            
                            // Ignore invalid coords and outside Peru
                            const lat = parseFloat(pag.latitud);
                            const lng = parseFloat(pag.longitud);
                            const hasCoords = isValidPeruCoord(lat, lng);
                            const isCorrectDate = fechaPago === hoyPeru && hasCoords;
                            
                            if (!isCorrectDate) return false;
                            if (userRole === 'supervisor' && currentUserId) {
                                return myAdvisorIds.includes(pag.registrado_por) || pag.registrado_por === currentUserId;
                            }
                            return true;
                        });

                    pagosDeHoy.forEach((pag: any, idx: number) => {
                        const isExtraPago = !p.cuota_dia_programada || p.cuota_dia_programada <= 0.01;
                        items.push({
                            ...p,
                            id: `${p.id}-payment-${idx}`,
                            lat: parseFloat(pag.latitud),
                            lng: parseFloat(pag.longitud),
                            isPayment: true,
                            isExtra: isExtraPago,
                            icon: isExtraPago ? createExtraPaymentIcon() : createCustomIcon('', true),
                            monto_pagado: pag.monto_pagado,
                            created_at: pag.created_at,
                            registrado_por_nombre: p.asesor_nombre, // Usar el nombre mapeado en page.tsx
                            distancia_cobro: p.gps_coordenadas ? calculateDistance(
                                parseFloat(p.gps_coordenadas.split(',')[0]), 
                                parseFloat(p.gps_coordenadas.split(',')[1]), 
                                parseFloat(pag.latitud), 
                                parseFloat(pag.longitud)
                            ) : null
                        });
                    });
                }
                return items;
            }).filter(Boolean) as any[];
        } catch (error) {
            return [];
        }
    }, [prestamos, userRole, currentUserId, perfiles, filterMode]);

    // 2. Spiderfy overlapping items (separate them with lines to original point)
    const { spiderItems, connectorLines, anchorPoints } = useMemo(() => {
        if (!rawItems.length) return { spiderItems: [], connectorLines: [], anchorPoints: [] };
        
        const groups: Record<string, any[]> = {};
        rawItems.forEach(item => {
            // Group by ~11m precision (4 decimal places) to catch close markers
            const key = `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
            if (!groups[key]) groups[key] = [];
            groups[key].push(item);
        });

        const sItems: any[] = [];
        const lines: any[] = [];
        const anchors: [number, number][] = [];

        Object.values(groups).forEach(group => {
            if (group.length === 1) {
                sItems.push({ ...group[0], zIndexOffset: 0 });
            } else {
                const centerLat = group[0].lat;
                const centerLng = group[0].lng;
                anchors.push([centerLat, centerLng]);

                group.forEach((item, idx) => {
                    const angle = (idx / group.length) * 2 * Math.PI;
                    // Adjusted radius for balanced separation (~35 meters)
                    const radius = 0.00032; 
                    const sLat = centerLat + Math.cos(angle) * radius;
                    const sLng = centerLng + Math.sin(angle) * radius;

                    sItems.push({
                        ...item,
                        lat: sLat,
                        lng: sLng,
                        zIndexOffset: 1000 + idx
                    });

                    lines.push({
                        id: `${item.id}-line`,
                        positions: [[centerLat, centerLng], [sLat, sLng]],
                        color: (item.isPayment && !item.isExtra) ? '#10b981' : item.isExtra ? '#f97316' : '#64748b'
                    });
                });
            }
        });

        return { spiderItems: sItems, connectorLines: lines, anchorPoints: anchors };
    }, [rawItems]);

    const markersList = useMemo(() => rawItems.map(i => [i.lat, i.lng] as [number, number]), [rawItems]);

    // Default center (Lima, if nothing else)
    const center: [number, number] = useMemo(() => markersList.length > 0 ? markersList[0] : [-12.0464, -77.0428], [markersList]);

    if (!isMounted) return <div className="h-[400px] w-full rounded-xl bg-slate-900 animate-pulse flex items-center justify-center text-slate-500">Cargando mapa...</div>

    if (rawItems.length === 0) {
        return (
            <div className="h-[400px] w-full rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-4">
                <div className="bg-slate-800/50 p-6 rounded-full">
                    <MapPin className="w-12 h-12 opacity-20 text-white" />
                </div>
                <div className="text-center space-y-1">
                    <p className="text-slate-300 font-bold">No hay ubicaciones para mostrar</p>
                    <p className="text-sm opacity-60">Los préstamos filtrados no tienen coordenadas GPS válidas en Perú.</p>
                </div>
            </div>
        )
    }

    const isAdminOrSuper = userRole === 'admin' || userRole === 'supervisor';

    return (
        <div className="h-[500px] w-full rounded-2xl overflow-hidden border border-slate-800 shadow-xl relative z-10 group">
            {/* Map Controls Overlay - Solo visible para Admin/Supervisor */}
            {isAdminOrSuper && (
                <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
                    <div className="bg-white/90 backdrop-blur-md p-1 rounded-xl border border-slate-200 shadow-xl flex gap-1">
                        <button 
                            onClick={() => setFilterMode('all')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                                filterMode === 'all' 
                                    ? "bg-slate-900 text-white shadow-md" 
                                    : "text-slate-500 hover:bg-slate-100"
                            )}
                        >
                            <Navigation className="w-3.5 h-3.5" />
                            Todos
                        </button>
                        <button 
                            onClick={() => setFilterMode('clients')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                                filterMode === 'clients' 
                                    ? "bg-indigo-600 text-white shadow-md" 
                                    : "text-slate-500 hover:bg-slate-100"
                            )}
                        >
                            <User className="w-3.5 h-3.5" />
                            Clientes
                        </button>
                        <button 
                            onClick={() => setFilterMode('payments')}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all",
                                filterMode === 'payments' 
                                    ? "bg-emerald-600 text-white shadow-md" 
                                    : "text-slate-500 hover:bg-slate-100"
                            )}
                        >
                            <DollarSign className="w-3.5 h-3.5" />
                            Pagos
                        </button>
                    </div>
                </div>
            )}

            <MapContainer 
                key={`${rawItems.length}-${markersList[0]?.[0] || 'empty'}-${filterMode}`}
                center={center} 
                zoom={13} 
                scrollWheelZoom={true} 
                className="h-full w-full"
                attributionControl={false}
            >
                <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png"
                />
                
                <BoundsAutoFitter markers={markersList} />

                {/* Connector lines for spiderfied markers */}
                {connectorLines.map((line: any) => (
                    <Polyline 
                        key={line.id} 
                        positions={line.positions} 
                        color={line.color} 
                        weight={2} 
                        dashArray="5, 10" 
                        opacity={0.6} 
                    />
                ))}

                {/* Anchor points for spiderfied groups */}
                {anchorPoints.map((pos, idx) => (
                    <CircleMarker 
                        key={`anchor-${idx}`} 
                        center={pos} 
                        radius={4} 
                        fillColor="#64748b" 
                        color="white" 
                        weight={2} 
                        fillOpacity={1} 
                    />
                ))}

                {/* Advisor Location Marker */}
                {userLoc && (
                    <Marker 
                        position={userLoc}
                        icon={L.divIcon({
                            className: 'user-icon',
                            html: `
                                <div style="
                                    background-color: #3b82f6;
                                    width: 16px;
                                    height: 16px;
                                    border-radius: 50%;
                                    border: 3px solid white;
                                    box-shadow: 0 0 15px rgba(59, 130, 246, 0.8);
                                    animation: pulse_marker 2s infinite;
                                "></div>
                            `,
                            iconSize: [16, 16],
                            iconAnchor: [8, 8]
                        })}
                    >
                        <Popup>
                            <div className="p-1 font-bold text-blue-600">Mi ubicación</div>
                        </Popup>
                    </Marker>
                )}

                {spiderItems.map((item) => {
                    const distance = userLoc ? calculateDistance(userLoc[0], userLoc[1], item.lat, item.lng) : null;
                    const isFar = distance !== null && distance > radioMax;

                    return (
                        <Marker 
                            key={item.id} 
                            position={[item.lat, item.lng]}
                            icon={item.icon}
                            zIndexOffset={item.zIndexOffset}
                        >
                            <Popup className="custom-popup">
                                <div className="p-1 min-w-[180px] sm:min-w-[220px] max-w-[calc(100vw-60px)] sm:max-w-[320px]">
                                    <div className="font-bold text-sm mb-1 flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-1 min-w-0 py-1">
                                            {item.isPayment ? <DollarSign className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <User className="w-3.5 h-3.5 opacity-70 shrink-0" />}
                                            <span className="truncate block leading-tight">{item.clientes?.nombres}</span>
                                        </div>
                                        {item.isPayment ? (
                                            <div className="shrink-0">
                                                <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[9px] font-black uppercase px-2 py-0.5 leading-none h-auto whitespace-nowrap">Cobro Realizado</Badge>
                                            </div>
                                        ) : item.isExtra ? (
                                            <div className="shrink-0">
                                                <Badge className="bg-orange-500 hover:bg-orange-600 text-[9px] font-black uppercase px-2 py-0.5 leading-none h-auto whitespace-nowrap">Extra / Otra Fecha</Badge>
                                            </div>
                                        ) : (
                                            distance !== null && (
                                                <div className={cn(
                                                    "text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 font-black shrink-0 whitespace-nowrap",
                                                    isFar ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                                                )}>
                                                    <Navigation className="w-2.5 h-2.5" />
                                                    {distance < 1000 ? `${distance}m` : `${(distance/1000).toFixed(1)}km`}
                                                </div>
                                            )
                                        )}
                                    </div>

                                    {item.isPayment ? (
                                        <div className="space-y-2 mt-2">
                                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center relative overflow-hidden">
                                                <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/5 rounded-full -mr-8 -mt-8" />
                                                <div className="text-[10px] text-emerald-600 font-black uppercase tracking-widest mb-1">Monto Recaudado</div>
                                                <div className="text-3xl font-black text-emerald-700 tracking-tight">${item.monto_pagado}</div>
                                                
                                                <div className="mt-3 pt-3 border-t border-emerald-100/50 flex flex-col gap-1">
                                                    <div className="flex items-center justify-center gap-1.5 text-slate-600">
                                                        <User className="w-3 h-3 opacity-50" />
                                                        <span className="text-[11px] font-bold">{item.registrado_por_nombre || 'Asesor'}</span>
                                                    </div>
                                                    <div className="flex items-center justify-center gap-3 text-slate-400">
                                                        <div className="flex items-center gap-1">
                                                            <MapPin className="w-2.5 h-2.5 opacity-50" />
                                                            <span className="text-[10px] font-medium">
                                                                {new Date(item.created_at).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <Navigation className="w-2.5 h-2.5 opacity-50" />
                                                            <span className="text-[10px] font-black text-slate-600 uppercase">
                                                                {new Date(item.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Lima' })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            {item.distancia_cobro !== null && (
                                                <div className="bg-slate-50 border border-slate-100 rounded-lg py-1.5 px-3 flex items-center justify-center gap-2">
                                                    <div className={cn(
                                                        "w-1.5 h-1.5 rounded-full",
                                                        item.distancia_cobro < 100 ? "bg-emerald-500" : "bg-amber-500"
                                                    )} />
                                                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">
                                                        Cobrado a {item.distancia_cobro}m del cliente
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            {isFar && (
                                                <div className="mb-2 p-1.5 bg-red-50 border border-red-100 rounded-lg text-[10px] text-red-600 font-bold flex items-center gap-1.5">
                                                    <AlertTriangle className="w-3 h-3 shrink-0" />
                                                    <span>Fuera de rango para iniciar visita (&gt;{radioMax}m)</span>
                                                </div>
                                            )}
                                        
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
                                                {(() => {
                                                    const cronograma = (item.cronograma_cuotas || []);
                                                    const hoy = getTodayPeru();
                                                    const cuotaHoy = cronograma.find((c: any) => c.fecha_vencimiento === hoy && c.estado !== 'pagado');
                                                    const cuotaPendiente = cronograma.find((c: any) => c.estado !== 'pagado');
                                                    const cuotaTargetId = cuotaHoy?.id || cuotaPendiente?.id;
                                                    
                                                    if (!cuotaTargetId) return null;
                                                    
                                                    return (
                                                        <VisitActionButton 
                                                            cuotaId={cuotaTargetId} 
                                                            variant="default" 
                                                            className={cn(
                                                                "h-9 rounded-xl text-xs font-bold w-full",
                                                                isFar ? "bg-slate-200 text-slate-400 border-slate-300 opacity-60 cursor-not-allowed" : "bg-indigo-600 text-white"
                                                            )}
                                                            showText={true}
                                                            disabled={isFar}
                                                        />
                                                    );
                                                })()}
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
                                        </>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>

            {/* Global legend overlay */}
            <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md p-4 rounded-2xl border border-slate-200 shadow-2xl z-[1000] pointer-events-none transition-all duration-300">
                <h4 className="font-black text-slate-800 mb-3 uppercase tracking-widest text-[9px]">Leyenda Mapa</h4>
                <div className="flex flex-col gap-2.5">
                    {/* Sección Clientes: Solo se muestra si el filtro permite ver clientes */}
                    {(filterMode === 'all' || filterMode === 'clients') && (
                        <>
                            <div className="flex items-center gap-3">
                                <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 shadow-sm border-2 border-white"></div>
                                <span className="text-slate-600 text-[11px] font-bold">Al día (OK)</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-3.5 h-3.5 rounded-full bg-amber-400 shadow-sm border-2 border-white"></div>
                                <span className="text-slate-600 text-[11px] font-bold">Deuda Hoy</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-3.5 h-3.5 rounded-full bg-orange-500 shadow-sm border-2 border-white"></div>
                                <span className="text-slate-600 text-[11px] font-bold">CPP (Mora Leve)</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-3.5 h-3.5 rounded-full bg-rose-500 shadow-sm border-2 border-white"></div>
                                <span className="text-slate-600 text-[11px] font-bold">Moroso / Vencido</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-3.5 h-3.5 rounded-full bg-slate-500 shadow-sm border-2 border-white"></div>
                                <span className="text-slate-600 text-[11px] font-bold">Finalizado / Renovado</span>
                            </div>
                        </>
                    )}

                    {/* Sección Pagos: Solo para Admin/Supervisor y si el filtro permite ver pagos */}
                    {isAdminOrSuper && (filterMode === 'all' || filterMode === 'payments') && (
                        <div className="mt-1 pt-2 border-t border-slate-100 flex flex-col gap-2.5">
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-[10px] text-white font-black shadow-md">$</div>
                                <span className="text-emerald-700 text-[11px] font-black uppercase">Cobro Realizado</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full bg-orange-500 border-2 border-white flex items-center justify-center text-[10px] text-white font-black shadow-md">$</div>
                                <span className="text-orange-700 text-[11px] font-black uppercase">Extra / Otra Fecha</span>
                            </div>
                        </div>
                    )}
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
                    max-width: calc(100vw - 60px);
                    max-height: calc(100vh - 120px);
                    overflow-y: auto;
                }
                .leaflet-popup-tip {
                    background-color: white;
                }
                .leaflet-popup-content p {
                    margin: 0;
                }
                .leaflet-popup-content {
                    max-width: 100%;
                    width: 100%;
                }
                .leaflet-container {
                    background-color: #0f172a !important;
                }
                @keyframes pulse_marker {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
                    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
                }
                @media (max-width: 640px) {
                    .leaflet-popup-content-wrapper {
                        max-width: calc(100vw - 40px);
                    }
                }
            `}</style>
        </div>
    )
}
