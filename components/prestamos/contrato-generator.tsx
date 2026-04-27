'use client'

import { useState, useRef, useEffect } from 'react'
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileText, Printer, Scale, ShieldCheck, Files, ScrollText, TableProperties, ChevronLeft, ArrowRight, Share2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { toast } from "sonner"

interface ContratoGeneratorProps {
    prestamo: any
    cronograma: any[]
    open?: boolean
    defaultOpen?: boolean
    onOpenChange?: (open: boolean) => void
    trigger?: React.ReactNode
}

type ViewMode = 'menu' | 'preview'
type DocMode = 'completo' | 'contrato' | 'cronograma'

export function ContratoGenerator({ prestamo, cronograma, open: controlledOpen, defaultOpen = false, onOpenChange: controlledOnOpenChange, trigger }: ContratoGeneratorProps) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen)
    const [viewMode, setViewMode] = useState<ViewMode>('menu')
    const [docMode, setDocMode] = useState<DocMode>('completo')
    const contentRef = useRef<HTMLDivElement>(null)

    const isControlled = controlledOpen !== undefined
    const isOpen = isControlled ? controlledOpen : internalOpen
    
    const setOpen = (val: boolean) => {
        if (isControlled) {
            controlledOnOpenChange?.(val)
        } else {
            setInternalOpen(val)
        }
        if (!val) {
            // Reset to menu when closing after a short delay to avoid flicker
            setTimeout(() => setViewMode('menu'), 300)
        }
    }

    // Auto-open preview if defaultOpen is true (e.g. from URL tab)
    useEffect(() => {
        if (defaultOpen) {
            setViewMode('preview')
            setDocMode('completo')
        }
    }, [defaultOpen])

    const handleSelectDoc = (mode: DocMode) => {
        setDocMode(mode)
        setViewMode('preview')
    }

    const handlePrint = () => {
        const content = contentRef.current
        if (!content) return

        const printWindow = window.open('', '', 'width=900,height=800')
        if (!printWindow) return

        printWindow.document.write(`
            <html>
                <head>
                    <title>ProFinanzas - Documento de Préstamo</title>
                    <style>
                        @page { 
                            size: A4; 
                            margin: 10mm; 
                        }
                        body { 
                            font-family: 'Times New Roman', Times, serif; 
                            color: #000; 
                            margin: 0; 
                            padding: 0;
                            line-height: 1.4;
                            font-size: 11pt; 
                            background-color: white;
                        }
                        .page-break { 
                            page-break-after: always; 
                            display: block; 
                            position: relative;
                            min-height: 277mm !important; /* Adjusted for footer */
                            height: auto !important;
                            margin-bottom: 0 !important;
                            padding: 10mm 15mm 20mm 15mm !important; /* Bottom padding for footer */
                            box-sizing: border-box !important;
                        }
                        .page-break:last-child { 
                            page-break-after: auto !important; 
                        }
                        .print-footer {
                            position: absolute;
                            bottom: 10mm;
                            left: 15mm;
                            right: 15mm;
                            border-top: 1px solid #eee;
                            padding-top: 5px;
                            display: flex;
                            justify-content: space-between;
                            font-size: 8pt;
                            color: #666;
                            font-family: sans-serif;
                        }
                        table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 10pt; }
                        th, td { border: 1px solid #000; padding: 4px 8px; text-align: center; }
                        th { background-color: #f0f0f0 !important; font-weight: bold; -webkit-print-color-adjust: exact; }
                        svg { width: 40px; height: 40px; }
                        .small-icon svg { width: 16px; height: 16px; }
                        @media print {
                            body { -webkit-print-color-adjust: exact; }
                            .page-break { border: none !important; box-shadow: none !important; }
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

    const handleShare = async (e?: React.MouseEvent) => {
        if (e) {
            e.preventDefault()
            e.stopPropagation()
        }
        
        const content = contentRef.current
        if (!content) return

        // Step 1: Find all pages (they have the .page-break class)
        const pages = content.querySelectorAll<HTMLElement>('.page-break')
        if (pages.length === 0) return

        const docTitle = docMode === 'completo' ? 'Contrato Completo' : docMode === 'contrato' ? 'Contrato' : 'Cronograma'
        const title = `${docTitle} - ${prestamo.clientes?.nombres}`
        const fileName = `${docTitle.replace(/\s+/g, '_')}_${prestamo.clientes?.nombres.replace(/\s+/g, '_')}.pdf`
        
        try {
            toast.loading("Generando PDF profesional...", { id: "share-pdf" })
            
            // Create jsPDF Instance (A4, mm)
            const pdf = new jsPDF('p', 'mm', 'a4')
            const pdfWidth = pdf.internal.pageSize.getWidth()
            const pdfHeight = pdf.internal.pageSize.getHeight()

            for (let i = 0; i < pages.length; i++) {
                const page = pages[i]
                
                // Capture Page as Image (Better fidelity than direct HTML printing sometimes)
                const dataUrl = await toPng(page, {
                    backgroundColor: '#fff',
                    pixelRatio: 2,
                    cacheBust: true,
                    skipFonts: false
                })

                if (i > 0) pdf.addPage()

                // Calculate image dimensions to fit perfectly within A4
                // Usually documents are already designed for that, but we ensure scaling
                pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST')
            }

            // Step 3: Convert to Blob
            const pdfBlob = pdf.output('blob')
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' })

            // Share using Web Share API (PDF Support is high on mobile)
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title,
                    text: `Hola ${prestamo.clientes?.nombres}, aquí tienes tu ${docTitle.toLowerCase()} oficial de ProFinanzas en PDF.`
                })
                toast.success("PDF Enviado", { id: "share-pdf" })
                return
            } else {
                // If sharing not supported, we can download it as fallback
                const link = document.createElement('a')
                link.href = URL.createObjectURL(pdfBlob)
                link.download = fileName
                link.click()
                toast.success("PDF Descargado", { id: "share-pdf" })
                return
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error("Error generating/sharing PDF:", err)
                toast.error("Error al generar PDF", { description: (err as Error).message, id: "share-pdf" })
            } else {
                 toast.dismiss("share-pdf")
                 return
            }
        }
        
        // Final fallback to WhatsApp (Link only)
        const text = `Hola ${prestamo.clientes?.nombres}, aquí tienes tu ${docTitle.toLowerCase()} de ProFinanzas.`
        const url = window.location.href
        const message = encodeURIComponent(`${text}\n\nPuedes verlo aquí: ${url}`)
        const phone = prestamo.clientes?.telefono ? `51${prestamo.clientes.telefono}` : ''
        window.open(`https://wa.me/${phone}?text=${message}`, '_blank')
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
        signBox: { width: '220px', borderTop: '1px solid black', textAlign: 'center' as const, paddingTop: '5px', fontSize: '12px' },
        footer: {
            position: 'absolute' as const,
            bottom: '10mm',
            left: '15mm',
            right: '15mm',
            borderTop: '1px solid #eee',
            paddingTop: '5px',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '8pt',
            color: '#666',
            fontFamily: 'sans-serif'
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={setOpen}>
            {(trigger || (!isControlled && !trigger)) && (
                <DialogTrigger asChild>
                    {trigger || (
                        <Button variant="outline" className="h-9 text-[11px] md:text-xs px-3 gap-2 border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 text-blue-200 rounded-xl font-bold transition-all w-full shadow-lg shadow-blue-500/5">
                            <Files className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0 text-blue-400" />
                            <span className="hidden sm:inline">Ver Documentos</span>
                            <span className="sm:hidden truncate">Documentos</span>
                        </Button>
                    )}
                </DialogTrigger>
            )}
            
            <DialogContent className={`${viewMode === 'menu' ? 'max-w-md' : 'max-w-5xl h-[90vh]'} bg-slate-900 border-slate-700/50 p-0 overflow-hidden flex flex-col text-slate-100 shadow-2xl`}>
                <DialogHeader className="sr-only">
                    <DialogTitle>Generador de Contratos</DialogTitle>
                </DialogHeader>
                
                {viewMode === 'menu' ? (
                    <div className="flex flex-col p-6 gap-6">
                        <div className="space-y-1">
                            <h2 className="text-xl font-black text-white flex items-center gap-2">
                                <Files className="w-5 h-5 text-blue-400" />
                                Gestión de Documentos
                            </h2>
                            <p className="text-slate-400 text-xs">Seleccione el documento que desea visualizar o imprimir.</p>
                        </div>

                        <div className="grid gap-3">
                            <Button 
                                variant="outline" 
                                size="lg" 
                                onClick={() => handleSelectDoc('completo')}
                                className="h-20 flex flex-col items-start justify-center gap-1 border-slate-800 bg-slate-800/50 hover:bg-blue-600/10 hover:border-blue-500/50 text-left px-5 rounded-2xl group transition-all"
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                                            <Files className="w-5 h-5 text-blue-400" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-100 uppercase tracking-tight">Ver Contrato Completo</p>
                                            <p className="text-[10px] text-slate-500 font-medium">Contrato Legal + Cronograma (2 Páginas)</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <div 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setDocMode('completo'); 
                                                setViewMode('preview');
                                                setTimeout(() => handleShare(), 500); 
                                            }}
                                            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                                            title="Compartir PDF"
                                        >
                                            <Share2 className="w-4 h-4" />
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-blue-400 transition-all group-hover:translate-x-1" />
                                    </div>
                                </div>
                            </Button>

                            <Button 
                                variant="outline" 
                                size="lg" 
                                onClick={() => handleSelectDoc('contrato')}
                                className="h-16 flex flex-col items-start justify-center gap-1 border-slate-800 bg-slate-800/50 hover:bg-indigo-600/10 hover:border-indigo-500/50 text-left px-5 rounded-2xl group transition-all"
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center group-hover:bg-indigo-500/30 transition-colors">
                                            <ScrollText className="w-4 h-4 text-indigo-400" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-100 uppercase tracking-tight text-xs">Ver Contrato solo</p>
                                            <p className="text-[10px] text-slate-500 font-medium">Documento legal firmado (1 Página)</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <div 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setDocMode('contrato'); 
                                                setViewMode('preview');
                                                setTimeout(() => handleShare(), 500); 
                                            }}
                                            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                                            title="Compartir PDF"
                                        >
                                            <Share2 className="w-3.5 h-3.5" />
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 transition-all group-hover:translate-x-1" />
                                    </div>
                                </div>
                            </Button>

                            <Button 
                                variant="outline" 
                                size="lg" 
                                onClick={() => handleSelectDoc('cronograma')}
                                className="h-16 flex flex-col items-start justify-center gap-1 border-slate-800 bg-slate-800/50 hover:bg-emerald-600/10 hover:border-emerald-500/50 text-left px-5 rounded-2xl group transition-all"
                            >
                                <div className="flex items-center justify-between w-full">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                                            <TableProperties className="w-4 h-4 text-emerald-400" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-100 uppercase tracking-tight text-xs">Ver Cronograma</p>
                                            <p className="text-[10px] text-slate-500 font-medium">Cargo de contrato y fechas de pago (1 Página)</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center">
                                        <div 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                setDocMode('cronograma'); 
                                                setViewMode('preview');
                                                setTimeout(() => handleShare(), 500); 
                                            }}
                                            className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-all"
                                            title="Compartir PDF"
                                        >
                                            <Share2 className="w-3.5 h-3.5" />
                                        </div>
                                        <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 transition-all group-hover:translate-x-1" />
                                    </div>
                                </div>
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Visual Header for Preview */}
                        <div className="p-3 md:p-4 border-b border-slate-700 bg-slate-900 flex justify-between items-center shadow-sm z-10 shrink-0">
                            <div className="flex items-center gap-1.5 md:gap-4 overflow-hidden">
                                <Button variant="ghost" size="sm" onClick={() => setViewMode('menu')} className="text-slate-400 hover:text-white hover:bg-slate-800 h-8 px-1.5 md:px-2 gap-1 font-bold">
                                    <ChevronLeft className="w-4 h-4" />
                                    <span className="hidden md:inline">Volver</span>
                                </Button>
                                <div className="h-6 w-px bg-slate-800 hidden sm:block" />
                                <h3 className="font-bold flex items-center gap-2 text-white truncate">
                                    <Printer className="w-4 h-4 text-blue-400 shrink-0 hidden sm:block" />
                                    <span className="truncate text-[13px] md:text-sm">
                                        {docMode === 'completo' ? 'Contrato Completo' : docMode === 'contrato' ? 'Contrato Legal' : 'Cronograma / Cargo'}
                                    </span>
                                </h3>
                            </div>
                             <div className="flex gap-1.5 md:gap-2 shrink-0">
                                <Button variant="outline" size="sm" onClick={() => setOpen(false)} className="border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent h-8 px-2 md:px-3">
                                    <span className="hidden md:inline">Cerrar</span>
                                    <span className="md:hidden">X</span>
                                </Button>
                                <Button variant="outline" size="sm" onClick={handleShare} className="border-emerald-700/50 text-emerald-500 hover:bg-emerald-900/20 bg-emerald-500/10 h-8 font-bold gap-1 md:gap-2 px-2 md:px-3">
                                    <Share2 className="w-3.5 h-3.5" />
                                    <span className="hidden md:inline">Compartir PDF</span>
                                    <span className="md:hidden">PDF</span>
                                </Button>
                                <Button size="sm" onClick={handlePrint} className="bg-blue-600 hover:bg-blue-700 text-white gap-1 md:gap-2 font-bold h-8 px-2 md:px-4 shadow-lg shadow-blue-900/40">
                                    <Printer className="w-4 h-4" />
                                    <span className="hidden md:inline">Imprimir</span>
                                    <span className="md:hidden text-xs">Print</span>
                                </Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto bg-slate-950 p-4 md:p-12 flex justify-center items-start">
                            <div 
                                ref={contentRef} 
                                className="bg-white shadow-[0_20px_50px_rgba(0,0,0,0.5)] h-fit" 
                                style={{ 
                                    width: '210mm', 
                                    minHeight: '297mm', 
                                    backgroundColor: 'white', 
                                    ...styles.container,
                                    color: 'black',
                                    padding: '0' // Remove parent padding
                                }}
                            >
                                
                                {/* ---------------- PAGE 1: CONTRATO LEGAL (Original & Copy) ---------------- */}
                                {(() => {
                                    const contractBlock = (isCopy = false) => (
                                        <div className="page-break" style={{ 
                                            marginBottom: docMode === 'completo' ? '50px' : '0',
                                            padding: '15mm',
                                            minHeight: '297mm',
                                            backgroundColor: 'white',
                                            boxSizing: 'border-box',
                                            position: 'relative'
                                        }}>
                                            {isCopy && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '10mm',
                                                    right: '15mm',
                                                    fontSize: '9pt',
                                                    color: '#999',
                                                    fontWeight: 'bold',
                                                    textTransform: 'uppercase',
                                                    border: '1px solid #eee',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px'
                                                }}>
                                                    Copia para el Cliente
                                                </div>
                                            )}
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
                                                <div style={styles.footer}>
                                                    <span>ProFinanzas - Estudio Jurídico Torres</span>
                                                    <span>{isCopy ? 'Copia Cliente' : 'Original Empresa'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );

                                    if (docMode === 'contrato') return contractBlock(false);
                                    if (docMode === 'completo') return (
                                        <>
                                            {contractBlock(false)}
                                            {contractBlock(true)}
                                        </>
                                    );
                                    return null;
                                })()}

                                {/* ---------------- PAGE 2: CARGO / CRONOGRAMA ---------------- */}
                                {(docMode === 'completo' || docMode === 'cronograma') && (
                                    <div style={{ 
                                        padding: '15mm',
                                        minHeight: '297mm',
                                        backgroundColor: 'white',
                                        boxSizing: 'border-box',
                                        position: 'relative'
                                    }} className="page-break">
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
                                        <div style={styles.footer}>
                                            <span>ProFinanzas - Estudio Jurídico Torres</span>
                                            <span>Cargo de Recepción y Cronograma</span>
                                        </div>
                                    </div>
                                )}

                            </div>
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
