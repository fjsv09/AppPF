'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { DollarSign, AlertCircle, Share2, Loader2, CheckCircle, Lock, CreditCard, Shield, Printer } from 'lucide-react'
import { api } from '@/services/api'
import { toBlob, toPng } from 'html-to-image'
import { cn } from '@/lib/utils'
import { VoucherContent } from '@/components/comunes/voucher-content'
import { Camera, Image as ImageIcon } from 'lucide-react'

interface QuickPayModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    prestamoId?: string
    prestamo?: any
    today?: string
    userRol?: 'admin' | 'supervisor' | 'asesor'
    onSuccess?: (result?: any) => void
    systemSchedule?: {
        horario_apertura: string
        horario_cierre: string
        desbloqueo_hasta: string
    }
    isBlockedByCuadre?: boolean
    blockReasonCierre?: string
    systemAccess?: any
    userLoc?: [number, number] | null
    exigirGps?: boolean
}

export function QuickPayModal({ 
    open, 
    onOpenChange, 
    prestamoId,
    prestamo: initialPrestamo, 
    today: initialToday, 
    userRol = 'asesor', 
    onSuccess, 
    systemSchedule, 
    isBlockedByCuadre, 
    blockReasonCierre,
    systemAccess,
    userLoc,
    exigirGps = false
}: QuickPayModalProps) {
    const [loading, setLoading] = useState(false)
    const [amount, setAmount] = useState('')
    const [metodoPago, setMetodoPago] = useState('')
    const [quota, setQuota] = useState<any>(null)
    const [fetching, setFetching] = useState(false)
    const [result, setResult] = useState<any>(null)
    const [fullCronograma, setFullCronograma] = useState<any[]>([])
    const [prestamo, setPrestamo] = useState<any>(initialPrestamo)

    // Sharing State
    const receiptRef = useRef<HTMLDivElement>(null)
    const printRef = useRef<HTMLDivElement>(null)
    const [sharing, setSharing] = useState(false)
    const [printing, setPrinting] = useState(false)
    const [logoUrl, setLogoUrl] = useState<string>('')
    const [lastPayment, setLastPayment] = useState<any>(null)
    const [historyPayments, setHistoryPayments] = useState<any[]>([])

    // Voucher Upload State
    const [voucherFile, setVoucherFile] = useState<File | null>(null)
    const [voucherPreview, setVoucherPreview] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)

    const [location, setLocation] = useState<{lat: number, lng: number} | null>(null)
    const [gpsError, setGpsError] = useState<string | null>(null)
    const [isGpsLoading, setIsGpsLoading] = useState(false)

    const supabase = useMemo(() => createClient(), [])

    // Calculate Today Peru if not provided
    const today = initialToday || new Date().toLocaleString("en-CA", { timeZone: "America/Lima" }).split(',')[0]

    // Solo se bloquean los pagos si el bloqueo es TOTAL (Horario, Feriado, Noche, Corte Mañana)
    // El bloqueo por falta de cuadre (Mañana) AHORA TAMBIÉN BLOQUEA pagos (Requerimiento de obligar entrega de dinero).
    const isTotalBlock = ['OUT_OF_HOURS', 'NIGHT_RESTRICTION', 'HOLIDAY_BLOCK', 'PENDING_SALDO', 'MISSING_MORNING_CUADRE'].includes(systemAccess?.code);
    const isBlockedForPayments = isBlockedByCuadre && isTotalBlock;

    // --- LOGICA DE HORARIO SÍNCRONA ---
    const getCanPayDueToTime = () => {
        if (userRol === 'admin') return true;
        
        // Bloqueo estricto solo si es bloqueo total
        if (isBlockedForPayments) return false; 
        
        if (!systemSchedule) return true;

        const now = new Date()
        const formatter = new Intl.DateTimeFormat('es-PE', {
            timeZone: 'America/Lima',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        })
        const currentHourString = formatter.format(now)

        const timeToMinutes = (timeStr: string) => {
            const [h, m] = timeStr.split(':').map(Number);
            return h * 60 + m;
        };

        const tNow = timeToMinutes(currentHourString);
        const tApertura = timeToMinutes(systemSchedule.horario_apertura || '10:00');
        const tCierre = timeToMinutes(systemSchedule.horario_cierre || '19:00');
        const tDesbloqueo = systemSchedule.desbloqueo_hasta ? new Date(systemSchedule.desbloqueo_hasta) : null;
        
        const isWithinHours = tNow >= tApertura && tNow < tCierre;
        const isTemporaryUnlocked = tDesbloqueo && now < tDesbloqueo;
        
        return isWithinHours || isTemporaryUnlocked
    }

    const canPayDueToTime = getCanPayDueToTime()
    const apertura = systemSchedule?.horario_apertura || '10:00'
    const cierre = systemSchedule?.horario_cierre || '19:00'

    // --- LOGICA DE INICIALIZACION Y LOGOS ---
    useEffect(() => {
        const fetchLogo = async () => {
            const { data } = await supabase
                .from('configuracion_sistema')
                .select('valor')
                .eq('clave', 'logo_sistema_url')
                .maybeSingle()
            if (data?.valor) setLogoUrl(data.valor)
        }
        
        if (open && !result) {
            fetchLogo()
            setLastPayment(null)
            const currentId = prestamoId || initialPrestamo?.id;
            if (currentId) {
                const cleanId = currentId.split('-')?.length > 5 
                    ? currentId.substring(0, 36) 
                    : currentId.replace('-official', '').replace(/-payment-\d+$/, '');
                
                if (initialPrestamo) {
                    const sanitizedPrestamo = { ...initialPrestamo, id: cleanId };
                    setPrestamo(sanitizedPrestamo)
                    fetchSmartQuota(cleanId)
                } else {
                    fetchPrestamoData(cleanId)
                }
            }
        }
        // Solo re-inicializamos si abre el modal o cambia el préstamo
    }, [open, prestamoId, initialPrestamo?.id, supabase])

    useEffect(() => {
        let watchId: number | null = null;

        if (open && !result) {
            setIsGpsLoading(true)
            
            // Sincronizar ubicación sin disparar recarga de datos
            if (userLoc) {
                setLocation({ lat: userLoc[0], lng: userLoc[1] })
                setIsGpsLoading(false)
            } else if (navigator.geolocation) {
                const getPosition = (highAccuracy: boolean) => {
                    watchId = navigator.geolocation.watchPosition(
                        (pos) => {
                            setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                            setGpsError(null)
                            setIsGpsLoading(false)
                        },
                        (err) => {
                            console.warn(`GPS watch error (highAccuracy=${highAccuracy}):`, err)
                            
                            // Si falla con alta precisión y nunca hemos tenido posición, intentamos con baja precisión
                            if (highAccuracy && err.code !== 1) { // 1 es Permission Denied, no reintentamos
                                navigator.geolocation.clearWatch(watchId!)
                                getPosition(false)
                                return
                            }

                            setLocation(null)
                            setGpsError(err.code === 1 ? "Permiso denegado" : "Señal débil o GPS apagado")
                            setIsGpsLoading(false)
                        },
                        { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 8000 : 15000, maximumAge: 0 }
                    )
                }

                getPosition(true)
            }
        }

        return () => {
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId)
            }
        }
    }, [open, result, exigirGps, userLoc])

    useEffect(() => {
        if (!open) {
            setResult(null)
            setLastPayment(null)
            setMetodoPago('')
            setLocation(null)
            setVoucherFile(null)
            setVoucherPreview(null)
        }
    }, [open])

    const fetchPrestamoData = async (id: string) => {
        const cleanId = id.split('-')?.length > 5 
            ? id.substring(0, 36) 
            : id.replace('-official', '').replace(/-payment-\d+$/, '');
            
        setFetching(true)
        try {
            const { data } = await supabase
                .from('prestamos')
                .select('*, clientes(id, nombres, dni, telefono)')
                .eq('id', cleanId)
                .single()
            
            if (data) {
                setPrestamo(data)
                fetchSmartQuota(id)
            }
        } catch (error) {
            console.error('Error fetching loan', error)
            toast.error('Error al cargar datos del préstamo')
        }
    }

    const fetchSmartQuota = async (id: string) => {
        const cleanId = id.split('-')?.length > 5 
            ? id.substring(0, 36) 
            : id.replace('-official', '').replace(/-payment-\d+$/, '');
            
        setFetching(true)
        try {
            const { data: cronograma } = await supabase
                .from('cronograma_cuotas')
                .select('*')
                .eq('prestamo_id', cleanId)
                .order('fecha_vencimiento', { ascending: true })

            if (!cronograma) return;

            const idsCuotas = cronograma.map((c: any) => c.id);
            const { data: pagosData } = idsCuotas.length > 0 
                ? await supabase
                    .from('pagos')
                    .select('*')
                    .in('cuota_id', idsCuotas)
                    .neq('estado_verificacion', 'rechazado') // NO CONTAR PAGOS RECHAZADOS
                    .order('created_at', { ascending: true })
                : { data: null };

            const hData = pagosData || [];

            // Virtual Distribution Logic - Solo cuenta lo aprobado o pendiente (no rechazado)
            const totalPagadoHistorico = hData.reduce((acc, p) => acc + (parseFloat(p.monto_pagado?.toString() || '0')), 0)
            let remainingToDistribute = totalPagadoHistorico
            
            const virtualCronograma = cronograma.map(c => {
                const montoCuota = parseFloat(c.monto_cuota || 0)
                let pagadoEnEstaCuota = 0
                if (remainingToDistribute >= montoCuota - 0.01) {
                    pagadoEnEstaCuota = montoCuota
                    remainingToDistribute -= montoCuota
                } else if (remainingToDistribute > 0) {
                    pagadoEnEstaCuota = Math.round(remainingToDistribute * 100) / 100
                    remainingToDistribute = 0
                }
                const isPaid = (montoCuota - pagadoEnEstaCuota) <= 0.01;
                return {
                    ...c,
                    monto_pagado: pagadoEnEstaCuota,
                    estado: isPaid ? 'pagado' : c.estado
                }
            })

            setFullCronograma(virtualCronograma)
            
            const todayQuota = virtualCronograma.find(c => c.fecha_vencimiento === today && c.estado !== 'pagado')
            const oldestPending = virtualCronograma.find(c => c.estado !== 'pagado')
            const targetQuota = todayQuota || oldestPending

            if (targetQuota) {
                const pendiente = targetQuota.monto_cuota - (targetQuota.monto_pagado || 0)
                setAmount(pendiente.toFixed(2))
                setQuota(targetQuota)
            } 

        } catch (error) {
            console.error('Error fetching quota', error)
            toast.error('Error al cargar cuota')
        } finally {
            setLoading(false)
            setFetching(false)
        }
    }

    const handlePrint = async () => {
        if (!printRef.current || printing) return
        setPrinting(true)
        const toastId = toast.loading('Preparando ticket...')
        
        // Limpieza previa (por si hubo cancelaciones anteriores)
        document.body.classList.remove('is-printing-ticket')
        document.getElementById('print-style-native')?.remove()
        document.getElementById('print-container-native')?.remove()

        try {
            const dataUrl = await toPng(printRef.current, { 
                backgroundColor: '#ffffff',
                pixelRatio: 3,
                skipFonts: false,
                cacheBust: true
            })
            
            const printContainer = document.createElement('div')
            printContainer.id = 'print-container-native'
            // Oculto en pantalla normal
            printContainer.style.display = 'none' 
            printContainer.innerHTML = `<img src="${dataUrl}" style="width: 58mm; height: auto;" />`
            
            const style = document.createElement('style')
            style.id = 'print-style-native'
            style.innerHTML = `
                @media print {
                    @page { margin: 0; size: 58mm auto; }
                    body > *:not(#print-container-native) { display: none !important; }
                    #print-container-native { 
                        display: block !important; 
                        position: absolute !important; 
                        left: 0 !important; 
                        top: 0 !important; 
                        width: 58mm !important; 
                    }
                }
            `
            document.head.appendChild(style)
            document.body.appendChild(printContainer)

            document.body.classList.add('is-printing-ticket')
            
            setTimeout(() => {
                window.print()
                setPrinting(false)
                toast.success('Abriendo vista de impresión...', { id: toastId })

                // Limpieza postergada para Android (que renderiza en 2do plano)
                setTimeout(() => {
                    document.body.classList.remove('is-printing-ticket')
                    document.getElementById('print-style-native')?.remove()
                    document.getElementById('print-container-native')?.remove()
                }, 30000) 
            }, 500)
        } catch (e) {
            console.error('Error printing:', e)
            toast.error('Error al generar ticket', { id: toastId })
            setPrinting(false)
        }
    }

    const handleShare = async () => {
        if (!receiptRef.current || sharing) return
        setSharing(true)
        try {
            const canvas = await toBlob(receiptRef.current, { 
                cacheBust: true, 
                pixelRatio: 2, 
                backgroundColor: '#0f172a',
                skipFonts: false
            })
            if (!canvas) throw new Error('Error al generar imagen')

            const file = new File([canvas], `recibo-${lastPayment?.id?.slice?.(-10) || 'pago'}.png`, { type: 'image/png' })

            if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Recibo de Pago',
                    text: `Pago registrado de ${prestamo?.clientes?.nombres}`
                })
            } else {
                const link = document.createElement('a')
                link.download = `recibo-${lastPayment?.id?.slice?.(-10) || 'pago'}.png`
                link.href = URL.createObjectURL(canvas)
                link.click()
                toast.success('Imagen descargada')
            }
            if (lastPayment?.id && userRol === 'asesor') {
                api.pagos.compartirVoucher(lastPayment.id).catch(() => {})
            }
        } catch (e) {
            console.error(e)
            toast.error('No se pudo compartir la imagen')
        } finally {
            setSharing(false)
        }
    }

    const handlePayment = async () => {
        if (!quota || !amount || parseFloat(amount) <= 0 || !metodoPago) {
            toast.error('Selecciona un método de pago')
            return
        }
        if (exigirGps) {
            if (!location) {
                toast.error('Ubicación requerida. Por favor activa el GPS.')
                return
            }
            
            // Re-validación final antes de enviar con reintento de precisión
            setLoading(true)
            try {
                const getPos = (high: boolean) => new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(
                        (pos) => {
                            setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                            resolve(pos)
                        },
                        (err) => reject(err),
                        { enableHighAccuracy: high, timeout: high ? 4000 : 8000 }
                    )
                })

                try {
                    await getPos(true)
                } catch (e) {
                    console.warn("Re-intento GPS con baja precisión...")
                    await getPos(false)
                }
            } catch (err: any) {
                setLoading(false)
                // Si es admin o supervisor, permitimos error de GPS para que no se bloqueen
                if (userRol === 'admin' || userRol === 'supervisor') {
                    console.warn("GPS falló pero se permite a Admin/Supervisor continuar")
                } else {
                    setLocation(null)
                    toast.error("Se perdió la señal GPS. Verifica tu ubicación.")
                    return
                }
            }
        }
        
        if (metodoPago !== 'Efectivo' && !voucherFile) {
            toast.error('Por favor sube o toma una foto del voucher')
            return
        }
        
        setLoading(true)
        let uploadedFileName = null
        try {
            let finalVoucherUrl = undefined
            
            // Subir voucher a Supabase Storage si existe
            if (voucherFile && metodoPago !== 'Efectivo') {
                const toastId = toast.loading('Subiendo voucher...')
                const fileExt = voucherFile.name.split('.').pop()
                uploadedFileName = `voucher-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`
                
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('vouchers_pagos')
                    .upload(uploadedFileName, voucherFile, {
                        cacheControl: '3600',
                        upsert: false
                    })
                    
                if (uploadError) {
                    toast.dismiss(toastId)
                    throw new Error('Error al subir la imagen del voucher')
                }
                
                const { data: { publicUrl } } = supabase.storage
                    .from('vouchers_pagos')
                    .getPublicUrl(uploadedFileName)
                    
                finalVoucherUrl = publicUrl
                toast.success('Voucher subido', { id: toastId })
            }

            const payAmount = parseFloat(amount)
            const res = await api.pagos.registrar({ 
                cuota_id: quota.id, 
                monto: payAmount,
                metodo_pago: metodoPago,
                latitud: location?.lat,
                longitud: location?.lng,
                voucher_url: finalVoucherUrl
            })

            const qRes = await supabase.from('cronograma_cuotas').select('*').eq('prestamo_id', prestamo.id).order('fecha_vencimiento', { ascending: true })
            const idsCuotas = qRes.data?.map((c: any) => c.id) || []
            
            const pRes = idsCuotas.length > 0 
                ? await supabase.from('pagos').select('*').in('cuota_id', idsCuotas).order('created_at', { ascending: true })
                : { data: [] }
            
            if (qRes.data) setFullCronograma(qRes.data)
            if (pRes.data) setHistoryPayments(pRes.data)

            const actualPayment = (pRes.data || []).find(p => p.id === res.pago_id) || {
                id: res.pago_id,
                monto_pagado: payAmount,
                created_at: new Date().toISOString(),
                prestamo_id: prestamo.id
            }

            setLastPayment(actualPayment)
            setResult(res) 

            toast.success('Pago registrado correctamente')
            if (onSuccess) onSuccess(res)
        } catch (error: any) {
            console.error(error)
            toast.error('Error al registrar pago', { description: error.message })
            
            // LIMPIEZA: Si la subida de imagen funcionó pero el registro en DB falló, borramos la imagen
            if (uploadedFileName) {
                console.log('Anulando subida de imagen por fallo en registro...')
                supabase.storage.from('vouchers_pagos').remove([uploadedFileName])
            }
        } finally {
            setLoading(false)
        }
    }

    const handleClose = () => {
        onOpenChange(false)
        setResult(null)
        setAmount('')
        setMetodoPago('')
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 p-0">
                {!result ? (
                    <div className="bg-slate-900 border-slate-800 text-white w-full">
                        {(!canPayDueToTime && userRol !== 'admin') ? (
                            <div className="flex flex-col items-center justify-center py-12 px-6 gap-6 text-center">
                                <div className="w-16 h-16 bg-rose-500/10 rounded-full flex items-center justify-center">
                                    <Lock className="h-8 w-8 text-rose-500" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-rose-400">Sistema Cerrado</h3>
                                    <p className="text-slate-400 text-sm">
                                        No se pueden registrar pagos fuera del horario de operación ({apertura} a {cierre}).
                                    </p>
                                </div>
                                <Button variant="outline" onClick={handleClose} className="mt-4 border-slate-700 text-slate-300">
                                    Cerrar
                                </Button>
                            </div>
                        ) : (isBlockedForPayments && userRol === 'asesor') ? (
                            <div className="flex flex-col items-center justify-center py-12 px-6 gap-6 text-center">
                                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center">
                                    <Lock className="h-8 w-8 text-amber-500" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-amber-400">Cuadre Pendiente</h3>
                                    <p className="text-slate-400 text-sm">
                                        {blockReasonCierre || 'Debes realizar tu cuadre para continuar.'}
                                    </p>
                                </div>
                                <Button variant="outline" onClick={handleClose} className="mt-4 border-slate-700 text-slate-300">
                                    Entendido
                                </Button>
                            </div>
                        ) : (
                            <>
                                <div className="p-4 md:p-6">
                                    <DialogHeader className="mb-2">
                                        <DialogTitle className="flex items-center gap-2 text-xl font-bold">
                                            <CreditCard className="w-5 h-5 text-emerald-500" />
                                            Registrar Cobro
                                        </DialogTitle>
                                        <DialogDescription className="text-slate-400">
                                            {prestamo?.clientes?.nombres}
                                            <br/> 
                                            <span className={quota?.fecha_vencimiento <= today ? "text-rose-400 font-bold" : "text-emerald-400"}>
                                                Cuota #{quota?.numero_cuota} • Vence: {quota?.fecha_vencimiento === today ? 'HOY' : quota?.fecha_vencimiento}
                                            </span>
                                        </DialogDescription>
                                    </DialogHeader>

                                    {/* Indicador de Señal GPS */}
                                    {exigirGps && (
                                    <div className={cn(
                                        "mb-2 px-3 py-1 rounded-lg border text-[10px] font-black uppercase flex items-center justify-between transition-all",
                                            location 
                                                ? "bg-emerald-500/5 border-emerald-500/20 text-emerald-500" 
                                                : "bg-rose-500/5 border-rose-500/20 text-rose-500 animate-pulse"
                                        )}>
                                            <div className="flex items-center gap-2">
                                                <div className={cn(
                                                    "w-2 h-2 rounded-full",
                                                    location ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                                                )} />
                                                SEÑAL GPS: {isGpsLoading ? 'Sincronizando...' : (location ? 'CONECTADO (MÁXIMA PRECISIÓN)' : (gpsError || 'SIN SEÑAL'))}
                                            </div>
                                            {location && <span className="font-mono opacity-60">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</span>}
                                        </div>
                                    )}

                                    {/* Banner advertencia GPS */}
                                    {exigirGps && !location && (
                                        <div className="bg-rose-950/40 border border-rose-500/30 rounded-xl p-4 flex gap-3 mb-4 animate-pulse">
                                            <Shield className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                                            <div className="text-sm text-rose-200 space-y-1">
                                                <span className="font-black text-rose-500 flex items-center gap-2">
                                                    <AlertCircle className="w-4 h-4" />
                                                    GPS OBLIGATORIO REQUERIDO
                                                </span>
                                                <p className="text-slate-200 leading-tight">
                                                    Tu cuenta requiere <span className="font-bold underline">GPS ACTIVO</span> para registrar cobranzas. Por favor, habilita la ubicación en tu dispositivo.
                                                </p>
                                                {(userRol === 'admin' || userRol === 'supervisor') && (
                                                    <Button 
                                                        variant="outline" 
                                                        size="sm" 
                                                        className="mt-2 h-7 text-[10px] bg-rose-500/10 border-rose-500/40 text-rose-200 hover:bg-rose-500/20"
                                                        onClick={() => {
                                                            // Mock location for testing on PC
                                                            setLocation({ lat: -12.0464, lng: -77.0428 }) 
                                                            setGpsError(null)
                                                            toast.info("Ubicación simulada (Lima Central)")
                                                        }}
                                                    >
                                                        Simular Ubicación (Modo PC)
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Banner informativo para Admin/Supervisor */}
                                    {(userRol === 'admin' || userRol === 'supervisor') && (
                                        <div className="bg-blue-950/30 border border-blue-500/20 rounded-xl p-3 flex gap-3 mb-2">
                                            <Shield className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                                            <div className="text-xs text-blue-200/80 space-y-1">
                                                <span className="font-bold text-blue-400 block">
                                                    Cobro como {userRol === 'admin' ? 'Administrador' : 'Supervisor'}
                                                </span>
                                                <p className="text-slate-400">
                                                    Este pago quedará registrado a tu nombre en auditoría, pero el sistema seguirá atribuyendo 
                                                    la cobranza al asesor. El dinero (físico o digital) lo recibe el asesor.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {fetching ? (
                                        <div className="py-12 flex flex-col items-center justify-center gap-4">
                                            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                                            <p className="text-slate-500 text-sm">Cargando datos de cuota...</p>
                                        </div>
                                    ) : (
                                        <div className="grid gap-4 md:gap-6 py-1">
                                        {!quota ? (
                                            <div className="py-8 text-center bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
                                                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                                                <p className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Préstamo Liquidado</p>
                                                <p className="text-[10px] text-slate-400 mt-1">Todas las cuotas han sido pagadas.</p>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="grid grid-cols-2 gap-4 p-3 bg-slate-950 rounded-xl border border-slate-800">
                                                    <div>
                                                        <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Total Cuota</p>
                                                        <p className="text-lg font-semibold text-slate-300">S/ {parseFloat(quota?.monto_cuota || 0).toFixed(2)}</p>
                                                    </div>
                                                    <div className="text-right">
                                                        <p className="text-[10px] text-slate-500 mb-1 font-bold uppercase tracking-wider">Pendiente</p>
                                                        <p className="text-lg font-bold text-rose-400">
                                                            S/ {(parseFloat(quota?.monto_cuota || 0) - (parseFloat(quota?.monto_pagado || 0))).toFixed(2)}
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="space-y-2 mt-1">
                                                    <Label htmlFor="amount" className="text-sm font-medium text-slate-300">Monto del cobro</Label>
                                                    <div className="relative">
                                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 flex items-center justify-center text-slate-400 font-bold text-sm">S/</div>
                                                        <Input
                                                            id="amount"
                                                            type="number"
                                                            value={amount}
                                                            onChange={(e) => {
                                                                const val = e.target.value
                                                                const numericVal = parseFloat(val)
                                                                const maxAmount = fullCronograma.reduce((acc, c) => acc + (parseFloat(c.monto_cuota) - parseFloat(c.monto_pagado || 0)), 0)
                                                                if (val === '' || (numericVal >= 0 && numericVal <= maxAmount + 0.01)) {
                                                                    setAmount(val)
                                                                } else if (numericVal > maxAmount) {
                                                                    setAmount(maxAmount.toFixed(2))
                                                                    toast.warning(`Máximo: S/ ${maxAmount.toFixed(2)}`)
                                                                }
                                                            }}
                                                            className="pl-10 h-10 text-lg font-bold bg-slate-950 border-slate-700 text-white rounded-xl"
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                            
                                            <div className="space-y-2 mt-1">
                                                <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider">Método de Pago</Label>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => setMetodoPago('Efectivo')}
                                                        className={cn(
                                                            "flex flex-col items-center justify-center gap-1 p-2 rounded-xl border-2 transition-all duration-200",
                                                            metodoPago === 'Efectivo' 
                                                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]" 
                                                            : "border-slate-800 bg-slate-950/50 text-slate-500 hover:border-slate-700 hover:text-slate-400"
                                                        )}
                                                    >
                                                        <span className="text-xl">💵</span>
                                                        <span className="font-bold text-[10px]">Efectivo</span>
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setMetodoPago('Yape')}
                                                        className={cn(
                                                            "flex flex-col items-center justify-center gap-1 p-2 rounded-xl border-2 transition-all duration-200",
                                                            metodoPago === 'Yape' 
                                                            ? "border-indigo-500 bg-indigo-500/10 text-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.1)]" 
                                                            : "border-slate-800 bg-slate-950/50 text-slate-500 hover:border-slate-700 hover:text-slate-400"
                                                        )}
                                                    >
                                                        <span className="text-xl">📱</span>
                                                        <span className="font-bold text-[10px]">Yape</span>
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Subida de Voucher */}
                                            {metodoPago === 'Yape' && (
                                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mt-2 animate-in fade-in slide-in-from-top-2">
                                                    <Label className="text-slate-300 text-xs font-bold uppercase tracking-wider block mb-3">Evidencia de Pago</Label>
                                                    
                                                    <div className="flex flex-col items-center gap-3">
                                                        {voucherPreview ? (
                                                            <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-slate-700 bg-black flex items-center justify-center">
                                                                <img src={voucherPreview} alt="Voucher Preview" className="max-h-full max-w-full object-contain" />
                                                                <Button 
                                                                    type="button"
                                                                    variant="destructive" 
                                                                    size="sm"
                                                                    className="absolute top-2 right-2 h-7 rounded-md"
                                                                    onClick={() => {
                                                                        setVoucherFile(null)
                                                                        setVoucherPreview(null)
                                                                        if (fileInputRef.current) fileInputRef.current.value = ''
                                                                    }}
                                                                >
                                                                    Cambiar Foto
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <div className="grid grid-cols-2 gap-3 w-full">
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    className="h-20 border-slate-700 hover:border-indigo-500 hover:bg-indigo-500/10 flex flex-col gap-2 rounded-xl"
                                                                    onClick={() => fileInputRef.current?.click()}
                                                                >
                                                                    <ImageIcon className="h-6 w-6 text-slate-400" />
                                                                    <span className="text-xs text-slate-400">Subir de Galería</span>
                                                                </Button>
                                                                <Button
                                                                    type="button"
                                                                    variant="outline"
                                                                    className="h-20 border-slate-700 hover:border-indigo-500 hover:bg-indigo-500/10 flex flex-col gap-2 rounded-xl"
                                                                    onClick={() => {
                                                                        // Pequeño hack para forzar la cámara en móviles
                                                                        if (fileInputRef.current) {
                                                                            fileInputRef.current.setAttribute('capture', 'environment')
                                                                            fileInputRef.current.click()
                                                                            setTimeout(() => {
                                                                                fileInputRef.current?.removeAttribute('capture')
                                                                            }, 1000)
                                                                        }
                                                                    }}
                                                                >
                                                                    <Camera className="h-6 w-6 text-slate-400" />
                                                                    <span className="text-xs text-slate-400">Tomar Foto</span>
                                                                </Button>
                                                            </div>
                                                        )}
                                                        <input 
                                                            type="file" 
                                                            ref={fileInputRef}
                                                            className="hidden" 
                                                            accept="image/*"
                                                            onChange={(e) => {
                                                                const file = e.target.files?.[0]
                                                                if (file) {
                                                                    // Validar tamaño (< 5MB)
                                                                    if (file.size > 5 * 1024 * 1024) {
                                                                        toast.error('La imagen es muy grande. Máximo 5MB.')
                                                                        return
                                                                    }
                                                                    setVoucherFile(file)
                                                                    const reader = new FileReader()
                                                                    reader.onloadend = () => setVoucherPreview(reader.result as string)
                                                                    reader.readAsDataURL(file)
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            <div className="bg-amber-950/30 border border-amber-900/50 rounded-lg p-3 flex gap-3 mt-2">
                                                <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
                                                <div className="text-xs text-amber-200/80">
                                                    <span className="font-bold text-amber-400">¿Pago Mixto?</span> Si el cliente paga una parte en efectivo y otra digital, registra cada monto por <span className="font-bold underline text-amber-300">separado</span> (primero uno y luego el otro).
                                                </div>
                                            </div>

                                            {fullCronograma.filter(c => c.fecha_vencimiento < today && c.estado !== 'pagado').length > 0 && quota?.fecha_vencimiento === today && (
                                                <div className="bg-blue-950/30 border border-blue-900/50 rounded-lg p-3 flex gap-3">
                                                    <AlertCircle className="w-5 h-5 text-blue-500 shrink-0" />
                                                    <div className="text-xs text-blue-200/80">
                                                        <span className="font-bold text-blue-400">Modo Ruta:</span> Se prioriza la cuota de hoy. Las cuotas atrasadas seguirán pendientes.
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <DialogFooter className="p-4 md:p-6 pt-1 flex gap-3">
                                    <Button 
                                        variant="ghost" 
                                        onClick={handleClose} 
                                        disabled={loading} 
                                        className="text-slate-500 hover:text-white hover:bg-slate-800"
                                    >
                                        Cancelar
                                    </Button>
                                    <Button 
                                        onClick={handlePayment} 
                                        disabled={loading || !amount || parseFloat(amount) <= 0 || !metodoPago || (exigirGps && !location) || (metodoPago !== 'Efectivo' && !voucherFile)}
                                        className={cn(
                                            "flex-1 h-12 text-lg font-bold shadow-xl transition-all duration-300",
                                            !metodoPago
                                            ? "bg-slate-800 text-slate-500 cursor-not-allowed opacity-50"
                                            : metodoPago === 'Efectivo' 
                                                ? "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20 text-white" 
                                                : (!voucherFile ? "bg-slate-700 text-slate-400" : "bg-indigo-600 hover:bg-indigo-500 shadow-indigo-900/20 text-white")
                                        )}
                                    >
                                        {loading ? (
                                            <Loader2 className="animate-spin h-5 w-5" />
                                        ) : (
                                            <div className="flex items-center justify-center gap-2">
                                                <span>{!metodoPago ? 'Elige Método Pago' : `Confirmar Pago (${metodoPago})`}</span>
                                            </div>
                                        )}
                                    </Button>
                                </DialogFooter>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="bg-slate-950 text-white w-full flex flex-col min-h-[450px]">
                        {/* Main View (Dark Mode) */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar bg-[#0f172a] p-4">
                            {!lastPayment ? (
                                <div className="flex flex-col items-center justify-center py-24 gap-4">
                                    <div className="relative">
                                        <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full animate-pulse" />
                                        <Loader2 className="w-10 h-10 text-emerald-500 animate-spin relative" />
                                    </div>
                                    <p className="text-slate-400 text-sm font-bold tracking-tight">Generando comprobante...</p>
                                </div>
                            ) : (
                                <div ref={receiptRef} className="rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/5 bg-slate-900">
                                    <VoucherContent 
                                        payment={lastPayment}
                                        loan={prestamo}
                                        client={prestamo?.clientes}
                                        cronograma={fullCronograma}
                                        allPayments={historyPayments}
                                        logoUrl={logoUrl}
                                        isPrinting={false}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Hidden Print View (High Contrast) */}
                        <div style={{ position: 'absolute', left: '-9999px', top: 0 }}>
                            {lastPayment && (
                                <div ref={printRef}>
                                    <VoucherContent 
                                        payment={lastPayment}
                                        loan={prestamo}
                                        client={prestamo?.clientes}
                                        cronograma={fullCronograma}
                                        allPayments={historyPayments}
                                        logoUrl={logoUrl}
                                        isPrinting={true}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Footer Buttons - Fixed at bottom */}
                        <div className="p-3 bg-slate-950 flex gap-2 border-t border-slate-800 shadow-2xl">
                            <Button 
                                onClick={handlePrint} 
                                disabled={printing || sharing || !lastPayment} 
                                variant="outline"
                                className="flex-1 border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800 rounded-xl h-11 text-xs font-bold"
                            >
                                {printing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Printer className="w-4 h-4 mr-2" />}
                                Imprimir
                            </Button>
                            <Button 
                                onClick={handleShare} 
                                disabled={sharing || printing || !lastPayment} 
                                className="flex-[1.5] bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20 h-11 text-sm font-bold"
                            >
                                {sharing ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
                                Compartir
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}
