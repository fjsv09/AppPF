"use client"

import { ImageLightbox } from "@/components/ui/image-lightbox"
import { FileText } from "lucide-react"

interface ClientExpedienteProps {
    documentos: Record<string, string> | null
}

const DOC_LABELS: Record<string, string> = {
    dni_frontal: 'DNI Frontal',
    dni_posterior: 'DNI Posterior',
    foto_cliente: 'Foto Cliente',
    frontis_casa: 'Fachada Casa',
    recibo_luz_agua: 'Recibo Servicios',
    negocio: 'Foto Negocio',
    documentos_negocio: 'Doc. Negocio',
    filtro_sentinel: 'Reporte Sentinel'
}

export function ClientExpediente({ documentos }: ClientExpedienteProps) {
    const docs = Object.entries(documentos || {}).filter(([key, url]) => url && DOC_LABELS[key])

    if (docs.length === 0) {
        return (
            <div className="py-10 flex flex-col items-center justify-center text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                <FileText className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm">No hay documentos digitalizados</p>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {docs.map(([key, url]) => (
                <ImageLightbox 
                    key={key}
                    src={url as string} 
                    alt={DOC_LABELS[key]}
                    className="aspect-square bg-slate-900 border border-slate-800 rounded-xl overflow-hidden relative group cursor-pointer shadow-sm hover:shadow-md hover:border-slate-700 transition-all"
                    thumbnail={(
                        <div className="w-full h-full relative">
                            <img src={url as string} alt={DOC_LABELS[key]} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <p className="text-white text-xs font-bold uppercase tracking-wider">{DOC_LABELS[key]}</p>
                            </div>
                        </div>
                    )}
                />
            ))}
        </div>
    )
}
