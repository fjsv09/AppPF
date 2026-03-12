'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog'
import { FileText, Printer, Scale, ShieldCheck } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface ContratoGeneratorProps {
    prestamo: any
    cronograma: any[]
    open?: boolean
    defaultOpen?: boolean
    onOpenChange?: (open: boolean) => void
    trigger?: React.ReactNode
}

export function ContratoGenerator({ prestamo, cronograma, open: controlledOpen, defaultOpen = false, onOpenChange: controlledOnOpenChange, trigger }: ContratoGeneratorProps) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen)
    const contentRef = useRef<HTMLDivElement>(null)

    const isControlled = controlledOpen !== undefined
    const open = isControlled ? controlledOpen : internalOpen
    
    const setOpen = (val: boolean) => {
        if (isControlled) {
            controlledOnOpenChange?.(val)
        } else {
            setInternalOpen(val)
        }
    }

    const handlePrint = () => {
        const content = contentRef.current
        if (!content) return

        const printWindow = window.open('', '', 'width=900,height=800')
        if (!printWindow) return

        printWindow.document.write(`
            <html>
                <head>
                    <title>Contrato-${prestamo.id}</title>
                    <style>
                        @page { size: A4; margin: 10mm 20mm 20mm 20mm; }
                        body { 
                            font-family: 'Times New Roman', Times, serif; 
                            color: #000; 
                            margin: 0; 
                            padding: 0;
                            line-height: 1.4;
                            font-size: 11pt; 
                        }
                        .page-break { page-break-after: always; display: block; position: relative; }
                        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10pt; }
                        th, td { border: 1px solid #000; padding: 4px 8px; text-align: center; }
                        th { background-color: #f0f0f0; font-weight: bold; }
                        /* Ensure Lucide Icons Render */
                        svg { width: 40px; height: 40px; }
                        .small-icon svg { width: 16px; height: 16px; }
                        /* Print specific overrides */
                        @media print {
                            body { -webkit-print-color-adjust: exact; }
                        }
                    </style>
                </head>
                <body>
                    ${content.innerHTML}
                </body>
            </html>
        `)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => {
            printWindow.print()
            printWindow.close()
        }, 500)
    }

    // Calculations
    const totalPagar = prestamo.monto * (1 + (prestamo.interes / 100))
    const fechaInicio = prestamo.fecha_inicio ? new Date(prestamo.fecha_inicio + 'T00:00:00') : new Date()
    const fechaInicioStr = format(fechaInicio, "d 'de' MMMM 'del' yyyy", { locale: es })
    
    // Capital/Interest logic (heuristics for display)
    const totalInterest = totalPagar - prestamo.monto
    const interestPerQuota = totalInterest / (cronograma.length || 1)
    const capitalPerQuota = prestamo.monto / (cronograma.length || 1)

    // Inline Styles for Consistency (Preview & Print)
    const styles = {
        container: { fontFamily: "'Times New Roman', Times, serif", color: '#000', lineHeight: '1.4', fontSize: '14px' },
        header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '20px' },
        headerGroup: { display: 'flex', alignItems: 'center', gap: '15px' },
        logoTitle: { fontSize: '24px', fontWeight: '900', lineHeight: '1', fontFamily: 'serif' },
        logoSubtitle: { fontSize: '11px', letterSpacing: '2px', fontWeight: 'bold' },
        logoTitleRight: { fontSize: '24px', fontWeight: '900', lineHeight: '1', fontStyle: 'italic', fontFamily: 'sans-serif' },
        logoSubtitleRight: { fontSize: '11px', fontStyle: 'italic' },
        title: { textAlign: 'center' as const, fontSize: '18px', fontWeight: 'bold', textDecoration: 'underline', margin: '20px 0' },
        titleNoDecor: { textAlign: 'center' as const, fontSize: '16px', fontWeight: 'bold', margin: '20px 0' },
        justify: { textAlign: 'justify' as const, marginBottom: '12px' },
        bold: { fontWeight: 'bold' },
        sectionTitle: { fontSize: '14px', fontWeight: 'bold', textDecoration: 'underline', marginBottom: '8px', display: 'block' },
        grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', marginBottom: '5px' },
        signatures: { display: 'flex', justifyContent: 'space-between', marginTop: '80px', padding: '0 30px' },
        signBox: { width: '220px', borderTop: '1px solid black', textAlign: 'center' as const, paddingTop: '5px', fontSize: '12px' }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {(trigger || (!isControlled && !trigger)) && (
                <DialogTrigger asChild>
                    {trigger || (
                        <Button variant="outline" className="h-9 text-[11px] md:text-xs px-3 gap-2 border border-white/20 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold transition-all w-full shadow-md">
                            <FileText className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
                            <span className="hidden sm:inline">Ver Contrato</span>
                            <span className="sm:hidden truncate">Contrato</span>
                        </Button>
                    )}
                </DialogTrigger>
            )}
            <DialogContent className="max-w-5xl h-[90vh] bg-slate-50 p-0 overflow-hidden flex flex-col text-slate-900">
                {/* Visual Header */}
                <div className="p-4 border-b bg-white flex justify-between items-center shadow-sm z-10 shrink-0">
                    <h3 className="font-bold flex items-center gap-2">
                        <FileText className="w-5 h-5 text-blue-600" />
                        Vista Previa (A4)
                    </h3>
                    <div className="flex gap-2">
                         <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="border-slate-400 text-black hover:bg-slate-200 bg-white">
                            Cancelar
                        </Button>
                        <Button size="sm" onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                            <Printer className="w-4 h-4" />
                            Imprimir
                        </Button>
                    </div>
                </div>

                {/* Scrollable Content Preview */}
                <div className="flex-1 overflow-y-auto bg-slate-200/50 p-8 flex justify-center">
                    <div ref={contentRef} className="bg-white shadow-xl p-[15mm]" style={{ width: '210mm', minHeight: '297mm', ...styles.container }}>
                        
                        {/* ---------------- PAGE 1: CONTRATO LEGAL ---------------- */}
                        <div className="page-break" style={{ marginBottom: '50px' }}>
                            {/* Header */}
                            <div style={styles.header}>
                                <div style={styles.headerGroup}>
                                    <Scale size={48} strokeWidth={1.5} color="black" />
                                    <div>
                                        <div style={styles.logoTitle}>TORRES</div>
                                        <div style={styles.logoSubtitle}>ESTUDIO JURIDICO</div>
                                    </div>
                                </div>
                                <div style={{...styles.headerGroup, textAlign: 'right', justifyContent: 'flex-end'}}>
                                    <div>
                                        <div style={styles.logoTitleRight}>ProFinanzas</div>
                                        <div style={styles.logoSubtitleRight}>Financiamiento Inmediato</div>
                                    </div>
                                    <ShieldCheck size={48} strokeWidth={1.5} color="black" />
                                </div>
                            </div>

                            <div style={styles.title}>CONTRATO DE PRÉSTAMO</div>

                            <p style={styles.justify}>
                                Conste por el presente contrato Privado de Préstamo de Dinero que celebramos de una parte la Empresa 
                                <span style={styles.bold}> “PROFINANZAS”</span> de propiedad de <span style={styles.bold}>“ESTUDIO DE ABOGADOS TORRES”</span> a quien en adelante se le denominara 
                                <span style={styles.bold}> EL PRESTAMISTA</span> y de la otra parte el Cliente: <span style={{...styles.bold, textTransform: 'uppercase'}}>{prestamo.clientes?.nombres}</span>, 
                                identificado con el Documento: <span style={styles.bold}>{prestamo.clientes?.dni}</span>, a quien en adelante se le denominará 
                                <span style={styles.bold}> EL PRESTATARIO</span>, ambas partes llegan a los acuerdos siguientes:
                            </p>

                            <div style={styles.justify}>
                                <span style={{display: 'block', fontWeight: 'bold', marginBottom: '2px'}}>PRIMERO:</span>
                                EL PRESTAMISTA cede en calidad de PRÉSTAMO al PRESTATARIO la suma o el monto de: 
                                <span style={styles.bold}> S/.{prestamo.monto.toFixed(2)}</span> al PRESTATARIO el día: <span style={{...styles.bold, textTransform: 'uppercase'}}>{fechaInicioStr}</span>
                            </div>

                            <div style={styles.justify}>
                                <span style={{display: 'block', fontWeight: 'bold', marginBottom: '2px'}}>SEGUNDO:</span>
                                El prestatario acepta dicho dinero en calidad de préstamo y asegura haber recibido el total del dinero a la firma del presente documento, 
                                por lo que se compromete a devolver dicha suma de dinero en cuotas o un solo pago según sea el caso en la fecha o fechas acordadas, 
                                asimismo ambas partes acuerdan que el pago del préstamo con intereses incluidos será la suma o monto de: 
                                <span style={styles.bold}> S/.{totalPagar.toFixed(2)}</span>
                            </div>

                            <div style={styles.justify}>
                                <span style={{display: 'block', fontWeight: 'bold', marginBottom: '2px'}}>TERCERO:</span>
                                En caso de incumplimiento de parte del PRESTATARIO, EL PRESTAMISTA queda en facultad de recurrir a las 
                                <span style={styles.bold}> autoridades pertinentes y hacer valer sus derechos</span>, o en su defecto 
                                <span style={styles.bold}> cobrar una cantidad por concepto de mora</span>, por lo que el presente documento es suficiente medio probatorio y vale como RECIBO.
                            </div>

                            <div style={styles.justify}>
                                <span style={{display: 'block', fontWeight: 'bold', marginBottom: '2px'}}>CUARTO:</span>
                                Ambas partes señalan y aseguran que en la celebración del mismo no ha mediado error, dolo de nulidad o anulabilidad 
                                que pudiera invalidar el contenido del mismo, por lo que proceden a firmar este contrato a la fecha: {fechaInicioStr}.
                            </div>

                            <div style={styles.signatures}>
                                <div style={styles.signBox}>
                                    <span style={styles.bold}>PRESTATARIO</span><br/>
                                    <div style={{marginTop: '5px', fontSize: '10pt', textTransform: 'uppercase'}}>
                                        {prestamo.clientes?.nombres}<br/>
                                        DNI: {prestamo.clientes?.dni}
                                    </div>
                                </div>
                                <div style={styles.signBox}>
                                    <span style={styles.bold}>PROFINANZAS</span><br/>
                                    <span style={{fontSize: '9pt'}}>Área Legal</span>
                                </div>
                            </div>
                        </div>

                        {/* ---------------- PAGE 2: CARGO / CRONOGRAMA ---------------- */}
                        <div style={{ pageBreakBefore: 'always' }} className="page-break">
                             {/* Header Repeated */}
                             <div style={styles.header}>
                                <div style={styles.headerGroup}>
                                    <Scale size={48} strokeWidth={1.5} color="black" />
                                    <div>
                                        <div style={styles.logoTitle}>TORRES</div>
                                        <div style={styles.logoSubtitle}>ESTUDIO JURIDICO</div>
                                    </div>
                                </div>
                                <div style={{...styles.headerGroup, textAlign: 'right', justifyContent: 'flex-end'}}>
                                    <div>
                                        <div style={styles.logoTitleRight}>ProFinanzas</div>
                                        <div style={styles.logoSubtitleRight}>Financiamiento Inmediato</div>
                                    </div>
                                    <ShieldCheck size={48} strokeWidth={1.5} color="black" />
                                </div>
                            </div>

                            <div style={styles.titleNoDecor}>CARGO DE CONTRATO DE PRÉSTAMO</div>

                            <div style={{marginBottom: '10px'}}>
                                <div style={{borderBottom: '1px solid #ccc', marginBottom: '5px', paddingBottom: '2px'}}>
                                    <span style={{fontSize: '12px', fontWeight: 'bold'}}>DATOS DEL CLIENTE:</span>
                                </div>
                                <div style={styles.grid}>
                                    <div><span style={styles.bold}>Cliente:</span> {prestamo.clientes?.nombres}</div>
                                    <div><span style={styles.bold}>DNI:</span> {prestamo.clientes?.dni}</div>
                                    <div><span style={styles.bold}>Teléfono:</span> {prestamo.clientes?.telefono || '-'}</div>
                                    <div><span style={styles.bold}>Dirección:</span> {prestamo.clientes?.direccion || '-'}</div>
                                </div>
                            </div>

                            <div style={{marginBottom: '10px'}}>
                                <div style={{borderBottom: '1px solid #ccc', marginBottom: '5px', paddingBottom: '2px'}}>
                                    <span style={{fontSize: '12px', fontWeight: 'bold'}}>DATOS DEL PRÉSTAMO:</span>
                                </div>
                                <div style={styles.grid}>
                                    <div><span style={styles.bold}>N° Préstamo:</span> {prestamo.id.split('-')[0]}</div>
                                    <div><span style={styles.bold}>Monto:</span> S/.{prestamo.monto.toFixed(2)}</div>
                                    <div><span style={styles.bold}>Cuotas:</span> {cronograma.length} ({prestamo.frecuencia})</div>
                                    <div><span style={styles.bold}>Tasa:</span> {prestamo.interes}%</div>
                                    <div><span style={styles.bold}>Fecha:</span> {fechaInicioStr}</div>
                                    <div><span style={styles.bold}>Total a Pagar:</span> S/.{totalPagar.toFixed(2)}</div>
                                </div>
                            </div>

                            {/* Cronograma Table */}
                            <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '11px'}}>
                                <thead>
                                    <tr style={{backgroundColor: '#f0f0f0'}}>
                                        <th style={{border: '1px solid black', padding: '4px'}}>N°</th>
                                        <th style={{border: '1px solid black', padding: '4px'}}>Fecha de Pago</th>
                                        <th style={{border: '1px solid black', padding: '4px'}}>Capital</th>
                                        <th style={{border: '1px solid black', padding: '4px'}}>Interés</th>
                                        <th style={{border: '1px solid black', padding: '4px'}}>Cuota</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {cronograma.map((c, i) => {
                                        const cuotaVal = parseFloat(c.monto_cuota)
                                        const capital = (capitalPerQuota).toFixed(2)
                                        const interes = (interestPerQuota).toFixed(2)
                                        const fecha = c.fecha_vencimiento ? new Date(c.fecha_vencimiento + 'T00:00:00').toLocaleDateString() : '-'

                                        return (
                                            <tr key={i}>
                                                <td style={{border: '1px solid black', padding: '4px', textAlign: 'center'}}>{c.numero_cuota}</td>
                                                <td style={{border: '1px solid black', padding: '4px', textAlign: 'center'}}>{fecha}</td>
                                                <td style={{border: '1px solid black', padding: '4px', textAlign: 'center'}}>S/.{capital}</td>
                                                <td style={{border: '1px solid black', padding: '4px', textAlign: 'center'}}>S/.{interes}</td>
                                                <td style={{border: '1px solid black', padding: '4px', textAlign: 'center'}}>S/.{cuotaVal.toFixed(2)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>

                             <div style={styles.signatures}>
                                <div style={styles.signBox}>
                                    <span style={styles.bold}>PRESTATARIO</span><br/>
                                    <div style={{marginTop: '5px', fontSize: '9pt', textTransform: 'uppercase'}}>
                                        {prestamo.clientes?.nombres}<br/>
                                        DNI: {prestamo.clientes?.dni}
                                    </div>
                                </div>
                                <div style={styles.signBox}>
                                    <span style={styles.bold}>PROFINANZAS</span><br/>
                                    <span style={{fontSize: '9pt'}}>Área Legal</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
