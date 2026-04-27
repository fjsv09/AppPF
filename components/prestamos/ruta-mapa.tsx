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

interface RutaMapaProps {
    prestamos: any[]
    onQuickPay: (prestamo: any, e: React.MouseEvent) => void
    today: string
    isBlocked?: boolean
    userRole?: string
    currentUserId?: string
    perfiles?: any[]
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

    useEffect(() => {
        setIsMounted(true)
        
        // Fetch radius config
        fetch('/api/configuracion?clave=visita_radio_maximo')
            .then(res => res.json())
            .then(data => {
                if (data.valor) setRadioMax(parseInt(data.valor))
            })
            .catch(err => console.error("Error fetching radius config:", err))
        if (typeof window !== 'undefined' && navigator.geolocation) {
            const watchId = navigator.geolocation.watchPosition(
                (pos) => setUserLoc([pos.coords.latitude, pos.coords.longitude]),
                (err) => console.error("Error GPS:", err),
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
                const coordsStr = p.gps_coordenadas || p.clientes?.solicitudes?.[0]?.gps_coordenadas
                if (coordsStr && typeof coordsStr === 'string') {
                    const [latStr, lngStr] = coordsStr.split(',')
                    if (latStr && lngStr) {
                        const lat = parseFloat(latStr.trim())
                        const lng = parseFloat(lngStr.trim())
                        if (!isNaN(lat) && !isNaN(lng)) {
                            const statusUI = getLoanStatusUI(p);
                            items.push({
                                ...p,
                                id: `${p.id}-official`,
                                lat,
                                lng,
                                isPayment: false,
                                icon: createCustomIcon(statusUI.marker),
                                statusText: statusUI.label,
                                statusColor: statusUI.color,
                                badgeClass: cn(statusUI.border, statusUI.color, statusUI.animate && "animate-pulse"),
                                deudaHoy: p.deudaHoy || 0
                            });
                        }
                    }
                }

                // Real Payment Location (Today)
                if (userRole === 'admin' || userRole === 'supervisor') {
                    const hoyPeru = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
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
                            const fechaPago = new Date(pag.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
                            const isCorrectDate = fechaPago === hoyPeru && pag.latitud && pag.longitud;
                            if (!isCorrectDate) return false;
                            if (userRole === 'supervisor' && currentUserId) {
                                return myAdvisorIds.includes(pag.registrado_por) || pag.registrado_por === currentUserId;
                            }
                            return true;
                        });

                    pagosDeHoy.forEach((pag: any, idx: number) => {
                        items.push({
                            ...p,
                            id: `${p.id}-payment-${idx}`,
                            lat: pag.latitud,
                            lng: pag.longitud,
                            isPayment: true,
                            icon: createCustomIcon('', true),
                            monto_pagado: pag.monto_pagado,
                            created_at: pag.created_at,
                            distancia_cobro: coordsStr ? calculateDistance(
                                parseFloat(coordsStr.split(',')[0]), 
                                parseFloat(coordsStr.split(',')[1]), 
                                pag.latitud, 
                                pag.longitud
                            ) : null
                        });
                    });
                }
                return items;
            }).filter(Boolean) as any[];
        } catch (error) {
            console.error("CRITICAL ERROR IN MAP ITEMS COLLECTION:", error);
            return [];
        }
    }, [prestamos, userRole, currentUserId, perfiles]);

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
                        color: item.isPayment ? '#10b981' : '#64748b'
                    });
                });
            }
        });

        return { spiderItems: sItems, connectorLines: lines, anchorPoints: anchors };
    }, [rawItems]);

    const markersList = useMemo(() => rawItems.map(i => [i.lat, i.lng] as [number, number]), [rawItems]);

    if (!isMounted) return <div className="h-[400px] w-full rounded-xl bg-slate-900 animate-pulse flex items-center justify-center text-slate-500">Cargando mapa...</div>

    if (rawItems.length === 0) {
        return (
            <div className="h-[400px] w-full rounded-xl bg-slate-900 border border-slate-800 flex flex-col items-center justify-center text-slate-500 gap-4">
                <MapPin className="w-12 h-12 opacity-20" />
                <p>No se encontraron coordenadas GPS válidas para la ruta de hoy.</p>
            </div>
        )
    }



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
                                <div className="p-1 min-w-[220px]">
                                    <div className="font-bold text-sm mb-1 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            {item.isPayment ? <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> : <User className="w-3.5 h-3.5 opacity-70" />}
                                            <span className="truncate">{item.clientes?.nombres}</span>
                                        </div>
                                        {item.isPayment ? (
                                            <Badge className="bg-emerald-500 hover:bg-emerald-600 text-[10px] font-black uppercase">Cobro Realizado</Badge>
                                        ) : (
                                            distance !== null && (
                                                <div className={cn(
                                                    "text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1 font-black",
                                                    isFar ? "bg-red-100 text-red-600" : "bg-blue-100 text-blue-600"
                                                )}>
                                                    <Navigation className="w-2.5 h-2.5" />
                                                    {distance < 1000 ? `${distance}m` : `${(distance/1000).toFixed(1)}km`}
                                                </div>
                                            )
                                        )}
                                    </div>

                                    {item.isPayment ? (
                                        <div className="space-y-2">
                                            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-center">
                                                <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest">Monto Recaudado</div>
                                                <div className="text-2xl font-black text-emerald-700">${item.monto_pagado}</div>
                                                <div className="text-[10px] text-slate-500 mt-1">
                                                    {new Date(item.created_at).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Lima' })}
                                                </div>
                                            </div>
                                            {item.distancia_cobro !== null && (
                                                <div className="text-[10px] text-slate-500 flex items-center justify-center gap-1">
                                                    <MapPin className="w-3 h-3" />
                                                    Cobrado a {item.distancia_cobro}m de la casa del cliente
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
                                                    const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
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
            <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur-md p-3 rounded-xl border border-slate-200 shadow-lg z-[1000] text-xs pointer-events-none">
                <h4 className="font-bold text-slate-700 mb-2 uppercase tracking-wider text-[10px]">Leyenda</h4>
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-emerald-500 shadow-sm border border-emerald-600"></div><span className="text-slate-600 font-medium">Al día (OK)</span></div>
                    <div className="flex items-center gap-2"><div className="w-3 h-4 rounded-full bg-emerald-500 shadow-sm border border-white flex items-center justify-center text-[8px] text-white font-bold">$</div><span className="text-slate-600 font-medium font-bold">Cobro Realizado</span></div>
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
                @keyframes pulse_marker {
                    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
                    70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
                    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
                }
            `}</style>
        </div>
    )
}
