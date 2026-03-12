'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Camera, Loader2, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SimpleImageUpload } from '@/components/wizard/simple-image-upload'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface UploadEvidenceButtonProps {
    tareaId: string
    clienteNombre: string
    compact?: boolean
    onSuccess?: () => void
}

export function UploadEvidenceButton({ tareaId, clienteNombre, compact = false, onSuccess }: UploadEvidenceButtonProps) {
    const [open, setOpen] = useState(false)
    const [evidenciaUrl, setEvidenciaUrl] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const router = useRouter()

    const handleUpload = async () => {
        if (!evidenciaUrl) return
        
        setSubmitting(true)
        try {
            const res = await fetch(`/api/tareas/${tareaId}/completar`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ evidencia_url: evidenciaUrl })
            })

            if (!res.ok) {
                const error = await res.json()
                throw new Error(error.error || 'Error completando tarea')
            }

            toast.success('Evidencia subida exitosamente')
            setOpen(false)
            setEvidenciaUrl('')
            if (onSuccess) onSuccess()
            router.refresh()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <>
            <Button 
                onClick={() => setOpen(true)}
                className={`w-full bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 ${compact ? 'text-[10px] h-7 px-2 md:text-xs md:px-3' : ''}`}
                size="sm"
            >
                <Camera className={`${compact ? 'w-3 h-3 mr-1 md:w-3.5 md:h-3.5 md:mr-1.5' : 'w-4 h-4 mr-2'}`} />
                {compact && <span className="sm:hidden">Foto</span>}
                <span className={compact ? "hidden sm:inline" : ""}>Subir Foto</span>
            </Button>

            <Dialog open={open} onOpenChange={(val) => !val && !submitting && setOpen(false)}>
                <DialogContent className="bg-[#0b1121] border-slate-800/60 shadow-2xl sm:max-w-[425px] flex flex-col p-6 overflow-hidden">
                    <DialogHeader className="flex items-center flex-col justify-center space-y-3 pt-2">
                        <DialogTitle className="text-xl md:text-2xl text-white font-bold tracking-tight">
                            Subir Evidencia
                        </DialogTitle>
                        <DialogDescription className="text-slate-400 text-center leading-snug px-2 text-sm md:text-base">
                            Por favor adjunte una fotografía clara del negocio o constancia correspondiente al préstamo de <strong className="text-white font-semibold">{clienteNombre}</strong>.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="my-6 w-full relative">
                        {/* Background glow for the image upload */}
                        <div className="absolute inset-0 bg-blue-500/5 blur-xl -z-10 rounded-full" />
                        <SimpleImageUpload 
                            label="Haz clic aquí para subir evidencia" 
                            value={evidenciaUrl}
                            onChange={setEvidenciaUrl}
                            folder="evidencias_tareas"
                        />
                    </div>

                    <div className="flex justify-center md:justify-end gap-3 border-t border-slate-800/60 pt-5 mt-auto w-full">
                        <Button 
                            variant="outline" 
                            disabled={submitting}
                            onClick={() => setOpen(false)}
                            className="flex-1 md:flex-none bg-transparent border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                        >
                            Cancelar
                        </Button>
                        <Button 
                            disabled={!evidenciaUrl || submitting}
                            onClick={handleUpload}
                            className="flex-1 md:flex-none bg-[#105a42] hover:bg-[#157a58] text-emerald-50 border border-[#166e51] hover:border-[#1d9169] transition-colors shadow-lg shadow-emerald-900/20"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin text-emerald-200" /> : <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-200" />}
                            Completar Tarea
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
