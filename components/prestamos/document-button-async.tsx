'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Files, Loader2 } from 'lucide-react'
import { ContratoGenerator } from '@/components/prestamos/contrato-generator'
import { fetchDocumentData } from '@/app/actions/documentos'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface DocumentButtonAsyncProps {
    solicitudId: string
    type?: 'solicitud' | 'renovacion'
    className?: string
    iconOnly?: boolean
}

export function DocumentButtonAsync({ solicitudId, type = 'solicitud', className, iconOnly = false }: DocumentButtonAsyncProps) {
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(false)
    const [data, setData] = useState<{ prestamo: any, cronograma: any[] } | null>(null)

    const handleOpen = async () => {
        if (data) {
            setOpen(true)
            return
        }

        setLoading(true)
        try {
            const result = await fetchDocumentData(solicitudId, type)
            if (!result || !result.prestamo) {
                toast.error('No se pudo cargar la información del documento.')
                return
            }
            setData(result)
            setOpen(true)
        } catch (error) {
            console.error('Error fetching documents:', error)
            toast.error('Error al obtener los documentos.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <>
            <Button
                size="sm"
                variant={iconOnly ? "ghost" : "outline"}
                className={cn(className)}
                onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleOpen()
                }}
                disabled={loading}
                title="Ver Documentos"
            >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Files className="w-3.5 h-3.5" />}
                {!iconOnly && <span className="ml-1">Doc</span>}
            </Button>

            {data && (
                <ContratoGenerator
                    prestamo={data.prestamo}
                    cronograma={data.cronograma}
                    open={open}
                    onOpenChange={setOpen}
                />
            )}
        </>
    )
}
