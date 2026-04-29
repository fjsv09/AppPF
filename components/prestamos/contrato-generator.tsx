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

    // ===== CENTRALIZED DOCUMENT CSS (used by both Print and Share) =====
    const getDocumentCSS = () => `
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Times New Roman', Times, serif; 
            color: #000; margin: 0; padding: 0;
            line-height: 1.4; font-size: 11pt; 
            background: white; width: 794px;
        }
        @page { size: A4; margin: 8mm; }
        .page-break { 
            page-break-after: always; display: block; position: relative;
            width: 794px; min-height: 1123px;
            padding: 40px 50px 60px 50px;
            box-sizing: border-box; overflow: hidden; background: white;
        }
        .page-break:last-child { page-break-after: auto; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 10pt; }
        th, td { border: 1px solid #000; padding: 4px 8px; text-align: center; }
        th { background-color: #f0f0f0; font-weight: bold; }
        svg { width: 40px; height: 40px; }
        @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; width: 794px !important; }
            .page-break { border: none; box-shadow: none; margin: 0; width: 794px !important; min-height: 1123px !important; }
        }
    `;

    // ===== CENTRALIZED DOCUMENT HTML (used by both Print and Share) =====
    const getDocumentHTML = () => {
        const content = contentRef.current
        if (!content) return ''
        return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=794"><title>ProFinanzas - Documento</title><style>${getDocumentCSS()}</style></head><body>${content.innerHTML}</body></html>`
    }

    const handlePrint = () => {
        const html = getDocumentHTML()
        if (!html) return

        const printWindow = window.open('', '', 'width=900,height=800')
        if (!printWindow) return

        printWindow.document.write(html)
        printWindow.document.close()
        printWindow.focus()
        setTimeout(() => {
            printWindow.print()
            printWindow.close()
        }, 500)
    }

    const handleShare = async (e?: React.MouseEvent) => {
        if (e) { e.preventDefault(); e.stopPropagation() }
        
        const content = contentRef.current
        if (!content) return

        const docTitle = docMode === 'completo' ? 'Contrato Completo' : docMode === 'contrato' ? 'Contrato' : 'Cronograma'
        const title = `${docTitle} - ${prestamo.clientes?.nombres}`
        const fileName = `${docTitle.replace(/\s+/g, '_')}_${prestamo.clientes?.nombres.replace(/\s+/g, '_')}.pdf`
        
        try {
            toast.loading("Generando PDF...", { id: "share-pdf" })
            
            // Create a hidden iframe at fixed A4 pixel dimensions to avoid mobile deformation
            const iframe = document.createElement('iframe')
            iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;height:1123px;border:none;opacity:0;pointer-events:none;'
            document.body.appendChild(iframe)

            const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document
            if (!iframeDoc) throw new Error('No se pudo crear el marco de renderizado')

            iframeDoc.open()
            iframeDoc.write(getDocumentHTML())
            iframeDoc.close()

            // Wait for rendering
            await new Promise(r => setTimeout(r, 800))

            const pages = iframeDoc.querySelectorAll<HTMLElement>('.page-break')
            if (pages.length === 0) { document.body.removeChild(iframe); return }

            const pdf = new jsPDF('p', 'mm', 'a4')
            const pdfW = pdf.internal.pageSize.getWidth()
            const pdfH = pdf.internal.pageSize.getHeight()

            for (let i = 0; i < pages.length; i++) {
                const dataUrl = await toPng(pages[i], {
                    backgroundColor: '#fff',
                    pixelRatio: 2,
                    cacheBust: true,
                    width: 794,
                    height: 1123,
                })
                if (i > 0) pdf.addPage()
                pdf.addImage(dataUrl, 'PNG', 0, 0, pdfW, pdfH, undefined, 'FAST')
            }

            document.body.removeChild(iframe)

            const pdfBlob = pdf.output('blob')
            const file = new File([pdfBlob], fileName, { type: 'application/pdf' })

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        files: [file], title,
                        text: `Hola ${prestamo.clientes?.nombres}, aquí tienes tu ${docTitle.toLowerCase()} oficial de ProFinanzas en PDF.`
                    })
                    toast.success("PDF Enviado", { id: "share-pdf" })
                } catch (shareErr: any) {
                    if (shareErr.name === 'NotAllowedError' || shareErr.message?.includes('user gesture')) {
                        // Fallback to download because share failed due to gesture timeout
                        const link = document.createElement('a')
                        link.href = URL.createObjectURL(pdfBlob)
                        link.download = fileName
                        link.click()
                        toast.success("PDF Descargado", { id: "share-pdf" })
                    } else if (shareErr.name !== 'AbortError') {
                        throw shareErr
                    } else {
                        toast.dismiss("share-pdf")
                    }
                }
            } else {
                const link = document.createElement('a')
                link.href = URL.createObjectURL(pdfBlob)
                link.download = fileName
                link.click()
                toast.success("PDF Descargado", { id: "share-pdf" })
            }
        } catch (err: any) {
            if (err.name !== 'AbortError') {
                console.error("Error generating/sharing PDF:", err)
                toast.error("Error al generar PDF", { description: err.message || "Error desconocido", id: "share-pdf" })
            } else {
                toast.dismiss("share-pdf")
            }
        }
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
    // All dimensions in px matching A4 at 96dpi (794x1123px)
    const styles = {
        container: { fontFamily: "'Times New Roman', Times, serif", color: '#000', lineHeight: '1.4', fontSize: '14.7px' },
        header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid black', paddingBottom: '10px', marginBottom: '20px' },
        headerGroup: { display: 'flex', alignItems: 'center', gap: '15px' },
        logoTitle: { fontSize: '24px', fontWeight: '900', lineHeight: '1', fontFamily: 'serif' },
        logoSubtitle: { fontSize: '11px', letterSpacing: '2px', fontWeight: 'bold' },
        logoTitleRight: { fontSize: '24px', fontWeight: '900', lineHeight: '1', fontStyle: 'italic', fontFamily: 'sans-serif' },
        logoSubtitleRight: { fontSize: '11px', fontStyle: 'italic' },
        title: { textAlign: 'center' as const, fontSize: '18px', fontWeight: 'bold', textDecoration: 'underline', margin: '18px 0' },
        titleNoDecor: { textAlign: 'center' as const, fontSize: '16px', fontWeight: 'bold', margin: '18px 0' },
        justify: { textAlign: 'justify' as const, marginBottom: '10px', fontSize: '14px', lineHeight: '1.45' },
        bold: { fontWeight: 'bold' },
        sectionTitle: { fontSize: '14px', fontWeight: 'bold', textDecoration: 'underline', marginBottom: '8px', display: 'block' },
        grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px', marginBottom: '8px', fontSize: '13px' },
        signatures: { display: 'flex', justifyContent: 'space-between', marginTop: '50px', padding: '0 50px' },
        signBox: { width: '200px', textAlign: 'center' as const, fontSize: '12px' },
        signLine: { borderTop: '1px solid black', marginBottom: '5px', width: '100%' },
        footer: {
            position: 'absolute' as const,
            bottom: '30px',
            left: '50px',
            right: '50px',
            borderTop: '1px solid #eee',
            paddingTop: '5px',
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '10px',
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

                        <div className="flex-1 overflow-y-auto overflow-x-auto bg-slate-950 p-2 md:p-12 flex justify-center items-start">
                            <div className="origin-top-left md:origin-top scale-[0.48] md:scale-100 min-w-[794px]" style={{ transformOrigin: 'top center' }}>
                            <div 
                                ref={contentRef} 
                                className="bg-white shadow-[0_20px_50px_rgba(0,0,0,0.5)] h-fit" 
                                style={{ 
                                    width: '794px', 
                                    minHeight: '1123px', 
                                    backgroundColor: 'white', 
                                    ...styles.container,
                                    color: 'black',
                                    padding: '0',
                                    overflow: 'hidden'
                                }}
                            >
                                
                                {/* ---------------- PAGE 1: CONTRATO LEGAL (Original & Copy) ---------------- */}
                                {(() => {
                                    const contractBlock = (isCopy = false) => (
                                        <div className="page-break" style={{ 
                                            width: '794px',
                                            minHeight: '1123px',
                                            padding: '40px 50px 60px 50px',
                                            backgroundColor: 'white',
                                            boxSizing: 'border-box',
                                            position: 'relative'
                                        }}>
                                            {isCopy && (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: '8mm',
                                                    right: '12mm',
                                                    fontSize: '8pt',
                                                    color: '#000',
                                                    fontWeight: 'bold',
                                                    textTransform: 'uppercase',
                                                    border: '1.5px solid #000',
                                                    padding: '3px 10px',
                                                    borderRadius: '0',
                                                    letterSpacing: '1px',
                                                    backgroundColor: '#fff',
                                                    zIndex: 10
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
                                                    <div style={styles.signLine} />
                                                    <span style={styles.bold}>PRESTATARIO</span><br/>
                                                    <div style={{marginTop: '5px', fontSize: '10pt', textTransform: 'uppercase'}}>
                                                        {prestamo.clientes?.nombres}<br/>
                                                        DNI: {prestamo.clientes?.dni}
                                                    </div>
                                                </div>
                                                <div style={styles.signBox}>
                                                    <div style={styles.signLine} />
                                                    <span style={styles.bold}>PROFINANZAS</span><br/>
                                                    <span style={{fontSize: '9pt'}}>Área Legal</span>
                                                </div>
                                            </div>
                                            <div style={styles.footer}>
                                                <span>ProFinanzas - Estudio Jurídico Torres</span>
                                                <span>{isCopy ? 'Copia Cliente' : 'Original Empresa'}</span>
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
                                        width: '794px',
                                        minHeight: '1123px',
                                        padding: '40px 50px 60px 50px',
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
                                                <div style={styles.signLine} />
                                                <span style={styles.bold}>PRESTATARIO</span><br/>
                                                <div style={{marginTop: '5px', fontSize: '9pt', textTransform: 'uppercase'}}>
                                                    {prestamo.clientes?.nombres}<br/>
                                                    DNI: {prestamo.clientes?.dni}
                                                </div>
                                            </div>
                                            <div style={styles.signBox}>
                                                <div style={styles.signLine} />
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
                        </div>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}
