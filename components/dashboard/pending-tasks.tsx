'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Camera, AlertCircle, Clock, Loader2, CheckCircle2, ClipboardList } from 'lucide-react'
import { formatMoney } from '@/utils/format'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SimpleImageUpload } from '@/components/wizard/simple-image-upload'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import { TaskItem } from './task-item'

interface Tarea {
    id: string
    prestamo_id: string
    asesor_id: string
    tipo: 'nuevo_prestamo' | 'renovacion' | 'refinanciacion' | 'gestion_asignada' | 'visita_asignada' | 'auditoria_dirigida'
    estado: 'pendiente' | 'completada'
    created_at: string
    notas?: string
    asesor?: { nombre_completo: string }
    prestamo: {
        id: string
        monto: number
        cliente: {
            nombres: string
            foto_perfil: string | null
        }
        solicitud?: {
            motivo_prestamo: string
        }
    }
}

interface PendingTasksProps {
    variant?: 'full' | 'compact'
    asesorId?: string | null
}

export function PendingTasks({ variant = 'full', asesorId }: PendingTasksProps) {
    const [tareas, setTareas] = useState<Tarea[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedTarea, setSelectedTarea] = useState<Tarea | null>(null)
    const [evidenciaUrl, setEvidenciaUrl] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [userId, setUserId] = useState<string | null>(null)
    const router = useRouter()
    const supabase = createClient()

    const fetchTareas = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser()
            setUserId(user?.id || null)

            let url = '/api/tareas'
            if (asesorId) {
                url += `?asesorId=${asesorId}`
            }

            const res = await fetch(url)
            if (res.ok) {
                const data = await res.json()
                setTareas(data)
            }
        } catch (error) {
            console.error('Error fetching tareas:', error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        fetchTareas()
    }, [asesorId])

    const handleUpload = async () => {
        if (!selectedTarea || !evidenciaUrl) return
        
        setSubmitting(true)
        try {
            const res = await fetch(`/api/tareas/${selectedTarea.id}/completar`, {
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
            setSelectedTarea(null)
            setEvidenciaUrl('')
            fetchTareas() // Recargar
            router.refresh()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setSubmitting(false)
        }
    }

    if (loading) {
        return (
            <div className="flex justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
        )
    }

    if (tareas.length === 0) {
        if (variant === 'compact') {
            return <div className="px-5 py-4 text-center text-slate-600 text-[10px] italic">Sin pendientes</div>
        }
        return null
    }

    if (variant === 'compact') {
        return (
            <div className="divide-y divide-slate-800/30">
                {tareas.map(tarea => (
                    <TaskItem 
                        key={tarea.id}
                        tarea={tarea}
                        variant="compact"
                        userId={userId}
                        onSelect={setSelectedTarea}
                        onAction={(path) => router.push(path)}
                    />
                ))}
            </div>
        )
    }

    return (
        <div className="mt-8 space-y-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                Tareas y Gestiones Pendientes
                <Badge variant="outline" className="ml-2 h-4 px-1.5 text-[10px] bg-amber-500/20 text-amber-500 border-amber-500/30">
                    {tareas.length}
                </Badge>
            </h2>
            
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {tareas.map(tarea => (
                    <TaskItem 
                        key={tarea.id}
                        tarea={tarea}
                        variant="full"
                        userId={userId}
                        onSelect={setSelectedTarea}
                        onAction={(path) => router.push(path)}
                    />
                ))}
            </div>

            <Dialog open={!!selectedTarea} onOpenChange={(val) => !val && !submitting && setSelectedTarea(null)}>
                <DialogContent className="bg-slate-950 border-slate-800">
                    <DialogHeader>
                        <DialogTitle className="text-xl text-white">Subir Evidencia</DialogTitle>
                        <DialogDescription className="text-slate-400">
                            Por favor adjunte una fotografía clara del negocio o constancia correspondiente al préstamo de <span className="text-white font-medium">{selectedTarea?.prestamo.cliente.nombres}</span>.
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="my-4 max-w-sm mx-auto w-full">
                        <SimpleImageUpload 
                            label="Haz clic aquí para subir evidencia" 
                            value={evidenciaUrl}
                            onChange={setEvidenciaUrl}
                            folder="evidencias_tareas"
                        />
                    </div>

                    <div className="flex justify-end gap-3 border-t border-slate-800 pt-4">
                        <Button 
                            variant="ghost" 
                            disabled={submitting}
                            onClick={() => setSelectedTarea(null)}
                            className="text-slate-400 hover:text-white"
                        >
                            Cancelar
                        </Button>
                        <Button 
                            disabled={!evidenciaUrl || submitting}
                            onClick={handleUpload}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white"
                        >
                            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                            Completar Tarea
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
