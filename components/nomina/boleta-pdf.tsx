'use client'

import { useState, useRef, useEffect } from 'react'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { createClient } from '@/utils/supabase/client'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { toast } from 'sonner'
import { FileText, Printer, Share2, X, Download, ShieldCheck } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface BoletaPDFProps {
    nomina: any
    trabajador: { nombre_completo: string; rol?: string }
    open?: boolean
    onOpenChange?: (open: boolean) => void
}

export function BoletaPDF({ nomina, trabajador, open, onOpenChange }: BoletaPDFProps) {
    const [internalOpen, setInternalOpen] = useState(false)
    const [detalles, setDetalles] = useState<any[]>([])
    const [loadingDetalles, setLoadingDetalles] = useState(false)
    const contentRef = useRef<HTMLDivElement>(null)

    const isControlled = open !== undefined
    const isOpen = isControlled ? open : internalOpen
    const setOpen = (v: boolean) => {
        if (isControlled) onOpenChange?.(v)
        else setInternalOpen(v)
    }

    useEffect(() => {
        if (isOpen && nomina?.id) {
            const fetchDetalles = async () => {
                setLoadingDetalles(true)
                const supabase = createClient()
                const { data, error } = await supabase
                    .from('transacciones_personal')
                    .select('*')
                    .eq('trabajador_id', nomina.trabajador_id)
                    .eq('nomina_id', nomina.id)
                    .order('created_at', { ascending: true })
                
                if (!error && data) {
                    setDetalles(data)
                }
                setLoadingDetalles(false)
            }
            fetchDetalles()
        }
    }, [isOpen, nomina?.id])

    if (!nomina) return null

    const sueldoBase = nomina.sueldo_base || 0
    const bonos = nomina.bonos || 0
    const descuentos = (nomina.descuentos_original || 0) + (nomina.descuentos || 0)
    const adelantos = (nomina.adelantos_original || 0) + (nomina.adelantos || 0)
    
    // Calcular total ya pagado históricamente (transacciones de tipo 'pago')
    const totalPagadoHistorico = detalles
        .filter(d => d.tipo === 'pago')
        .reduce((acc, d) => acc + parseFloat(d.monto || 0), 0)

    const totalNeto = sueldoBase + bonos - descuentos - adelantos - totalPagadoHistorico
    const mesAnio = format(new Date(nomina.anio, nomina.mes - 1), 'MMMM yyyy', { locale: es })
    const fechaPago = nomina.fecha_pago ? format(new Date(nomina.fecha_pago), 'dd/MM/yyyy HH:mm', { locale: es }) : 'Pendiente'

    const isLiquidacion = detalles.some(d => d.tipo === 'liquidacion')

    const handlePrint = () => {
        const content = contentRef.current
        if (!content) return

        // 1. Crear contenedor temporal para la impresión (In-place strategy)
        const printContainer = document.createElement('div')
        printContainer.id = 'print-container-boleta'
        printContainer.style.display = 'none'
        printContainer.innerHTML = content.innerHTML

        // 2. Inyectar estilos para ocultar todo lo demás durante la impresión
        const style = document.createElement('style')
        style.id = 'print-style-boleta'
        style.innerHTML = `
            @media print {
                body > *:not(#print-container-boleta) { display: none !important; }
                #print-container-boleta { 
                    display: block !important; 
                    position: absolute !important; 
                    top: 0 !important; 
                    left: 0 !important; 
                    width: 100% !important;
                    background: white !important;
                    color: black !important;
                }
                @page { size: A5 landscape; margin: 10mm; }
            }
        `
        
        document.head.appendChild(style)
        document.body.appendChild(printContainer)

        // 3. Disparar impresión nativa
        setTimeout(() => {
            window.print()
            
            // 4. Limpieza
            setTimeout(() => {
                try {
                    const s = document.getElementById('print-style-boleta')
                    const c = document.getElementById('print-container-boleta')
                    if (s) document.head.removeChild(s)
                    if (c) document.body.removeChild(c)
                } catch (e) {}
            }, 1000)
        }, 500)
    }

    const handleShare = async () => {
        const content = contentRef.current
        if (!content) return

        try {
            toast.loading("Generando PDF...", { id: "boleta-pdf" })

            const dataUrl = await toPng(content, { backgroundColor: '#fff', pixelRatio: 2 })
            const pdf = new jsPDF('l', 'mm', 'a5')
            const pdfWidth = pdf.internal.pageSize.getWidth()
            const pdfHeight = pdf.internal.pageSize.getHeight()

            pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST')

            const pdfBlob = pdf.output('blob')
            const fileName = `Boleta_${trabajador.nombre_completo.replace(/\s+/g, '_')}_${mesAnio.replace(/\s+/g, '_')}.pdf`
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' })

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file], title: `Boleta de Pago - ${trabajador.nombre_completo}` })
                toast.success("PDF Enviado", { id: "boleta-pdf" })
            } else {
                const link = document.createElement('a')
                link.href = URL.createObjectURL(pdfBlob)
                link.download = fileName
                link.click()
                toast.success("PDF Descargado", { id: "boleta-pdf" })
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                toast.error("Error al generar PDF", { id: "boleta-pdf" })
            } else {
                toast.dismiss("boleta-pdf")
            }
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setOpen}>
            {!isControlled && (
                <DialogTrigger asChild>
                    <button className="p-1.5 hover:bg-blue-500/20 rounded-lg text-blue-400 transition-colors" title="Ver Boleta PDF">
                        <FileText className="w-3.5 h-3.5" />
                    </button>
                </DialogTrigger>
            )}

            <DialogContent className="max-w-4xl h-[85vh] bg-slate-900 border-slate-700/50 p-0 overflow-hidden flex flex-col text-slate-100 shadow-2xl">
                {/* Header */}
                <div className="p-4 border-b border-slate-700 bg-slate-900 flex justify-between items-center shrink-0">
                    <h3 className="font-bold flex items-center gap-2 text-white">
                        <FileText className="w-4 h-4 text-blue-400" />
                        Boleta de Pago — {mesAnio}
                    </h3>
                    <div className="flex gap-2">
                        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-slate-700">
                            Cerrar
                        </button>
                        <button onClick={handleShare} className="px-3 py-1.5 text-xs font-bold text-emerald-400 hover:bg-emerald-900/20 bg-emerald-500/10 rounded-lg transition-colors border border-emerald-700/50 flex items-center gap-1.5">
                            <Share2 className="w-3 h-3" />
                            Compartir PDF
                        </button>
                        <button onClick={handlePrint} className="px-3 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg shadow-blue-900/40 flex items-center gap-1.5">
                            <Printer className="w-3 h-3" />
                            Imprimir
                        </button>
                    </div>
                </div>

                {/* Preview Content */}
                <div className="flex-1 overflow-y-auto bg-slate-950 p-6 md:p-12 flex justify-center items-start">
                    <div
                        ref={contentRef}
                        style={{
                            width: '210mm',
                            minHeight: '148mm',
                            backgroundColor: 'white',
                            fontFamily: "'Segoe UI', 'Helvetica', sans-serif",
                            color: '#000',
                            padding: '15mm',
                            boxSizing: 'border-box'
                        }}
                        className="shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
                    >
                        {/* Boleta Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #1e40af', paddingBottom: '10px', marginBottom: '15px' }}>
                            <div>
                                <div style={{ fontSize: '22px', fontWeight: '900', color: '#1e3a5f', fontStyle: 'italic' }}>ProFinanzas</div>
                                <div style={{ fontSize: '10px', color: '#666', letterSpacing: '2px' }}>FINANCIAMIENTO INMEDIATO</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '14px', fontWeight: '800', color: '#1e40af', textTransform: 'uppercase' }}>Boleta de Pago</div>
                                <div style={{ fontSize: '11px', color: '#666', textTransform: 'uppercase' }}>{mesAnio}</div>
                                <div style={{
                                    fontSize: '9px',
                                    fontWeight: '700',
                                    color: nomina.estado === 'pagado' ? '#059669' : '#d97706',
                                    backgroundColor: nomina.estado === 'pagado' ? '#ecfdf5' : '#fffbeb',
                                    padding: '2px 8px',
                                    borderRadius: '4px',
                                    display: 'inline-block',
                                    marginTop: '4px',
                                    border: `1px solid ${nomina.estado === 'pagado' ? '#a7f3d0' : '#fde68a'}`
                                }}>
                                    {nomina.estado === 'pagado' ? '✓ PAGADO' : '⏳ PENDIENTE'}
                                </div>
                            </div>
                        </div>

                        {/* Datos del Trabajador */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px', marginBottom: '15px', fontSize: '11px' }}>
                            <div><span style={{ fontWeight: '700', color: '#555' }}>Trabajador:</span> <span style={{ fontWeight: '600', textTransform: 'uppercase' }}>{trabajador.nombre_completo}</span></div>
                            <div><span style={{ fontWeight: '700', color: '#555' }}>Cargo:</span> <span style={{ textTransform: 'uppercase' }}>{trabajador.rol || 'Asesor'}</span></div>
                            <div><span style={{ fontWeight: '700', color: '#555' }}>Periodo:</span> {mesAnio}</div>
                            <div><span style={{ fontWeight: '700', color: '#555' }}>Fecha de Pago:</span> {fechaPago}</div>
                        </div>

                        {/* Tabla de Desglose */}
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px', marginBottom: '15px' }}>
                            <thead>
                                <tr style={{ backgroundColor: '#1e40af', color: 'white' }}>
                                    <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: '700', fontSize: '10px', letterSpacing: '1px' }}>CONCEPTO</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '700', fontSize: '10px', letterSpacing: '1px' }}>INGRESOS</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '700', fontSize: '10px', letterSpacing: '1px' }}>DEDUCCIONES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Sueldo Base (Siempre Primero) */}
                                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                    <td style={{ padding: '6px 10px' }}>Sueldo Base Mensual</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600' }}>S/ {sueldoBase.toFixed(2)}</td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>—</td>
                                </tr>

                                {/* Desglose Dinámico de Transacciones */}
                                {loadingDetalles ? (
                                    <tr>
                                        <td colSpan={3} style={{ padding: '20px', textAlign: 'center', color: '#999', fontSize: '10px' }}>
                                            Cargando desglose de conceptos...
                                        </td>
                                    </tr>
                                ) : detalles.length > 0 ? (
                                    <>
                                        {detalles.map((trans) => {
                                            const isIngreso = ['bono', 'liquidacion', 'bonos', 'ajuste_positivo'].includes(trans.tipo)
                                            const isEgreso = ['descuento', 'pago', 'adelanto', 'ajuste_negativo'].includes(trans.tipo) 
                                            
                                            if (!isIngreso && !isEgreso) return null

                                            let descripcion = trans.descripcion
                                            if (trans.tipo === 'pago') {
                                                descripcion = `PAGO REALIZADO (A CUENTA) - ${trans.metadatos?.cuota || ''}`
                                            }

                                            return (
                                                <tr key={trans.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                    <td style={{ padding: '6px 10px', fontWeight: (trans.tipo === 'liquidacion' || trans.tipo === 'pago') ? '800' : 'normal' }}>
                                                        {descripcion}
                                                        {trans.tipo === 'liquidacion' && ' (Pago Final)'}
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: isIngreso ? '#059669' : '#000' }}>
                                                        {isIngreso ? `S/ ${parseFloat(trans.monto).toFixed(2)}` : '—'}
                                                    </td>
                                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: isEgreso ? '#dc2626' : '#000' }}>
                                                        {isEgreso ? `S/ ${parseFloat(trans.monto).toFixed(2)}` : '—'}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </>
                                ) : (
                                    <>
                                        {/* Fallback si no hay detalles (nóminas antiguas) */}
                                        {bonos > 0 && (
                                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                <td style={{ padding: '6px 10px' }}>Bonos Acumulados</td>
                                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: '#059669' }}>
                                                    S/ {bonos.toFixed(2)}
                                                </td>
                                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>—</td>
                                            </tr>
                                        )}
                                        {descuentos > 0 && (
                                            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                <td style={{ padding: '6px 10px' }}>Descuentos (Tardanza/Otros)</td>
                                                <td style={{ padding: '6px 10px', textAlign: 'right' }}>—</td>
                                                <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: '#dc2626' }}>
                                                    S/ {descuentos.toFixed(2)}
                                                </td>
                                            </tr>
                                        )}
                                        {totalPagadoHistorico > 0 && (
                                             <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                                 <td style={{ padding: '6px 10px' }}>Pagos Adelantados (Ya realizados)</td>
                                                 <td style={{ padding: '6px 10px', textAlign: 'right' }}>—</td>
                                                 <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '600', color: '#dc2626' }}>
                                                     S/ {totalPagadoHistorico.toFixed(2)}
                                                 </td>
                                             </tr>
                                        )}
                                    </>
                                )}
                            </tbody>
                            <tfoot>
                                <tr style={{ backgroundColor: '#f8fafc', borderTop: '2px solid #1e40af' }}>
                                    <td style={{ padding: '8px 10px', fontWeight: '800', fontSize: '11px' }}>TOTAL BRUTO / DEDUCCIONES</td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '800', color: '#059669', fontSize: '11px' }}>
                                        S/ {(sueldoBase + bonos).toFixed(2)}
                                    </td>
                                    <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '800', color: '#dc2626', fontSize: '11px' }}>
                                        S/ {(descuentos + adelantos + totalPagadoHistorico).toFixed(2)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>

                        {/* Total Neto */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            backgroundColor: isLiquidacion ? '#dc2626' : '#1e3a5f',
                            color: 'white',
                            padding: '10px 15px',
                            borderRadius: '6px',
                            marginBottom: '15px'
                        }}>
                            <span style={{ fontWeight: '700', fontSize: '12px', letterSpacing: '1px' }}>
                                {isLiquidacion ? 'NETO TOTAL LIQUIDACIÓN' : 'NETO A RECIBIR'}
                            </span>
                            <span style={{ fontWeight: '900', fontSize: '18px' }}>S/ {totalNeto.toFixed(2)}</span>
                        </div>

                        {/* Footer */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: '#999', borderTop: '1px solid #e5e7eb', paddingTop: '8px' }}>
                            <span>Este documento es un comprobante de pago interno de ProFinanzas.</span>
                            <span>Generado automáticamente — {format(new Date(), 'dd/MM/yyyy HH:mm')}</span>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
