'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Calendar as CalendarIcon, Trash2, Plus, CalendarDays } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { BackButton } from '@/components/ui/back-button'

export default function FeriadosPage() {
    const supabase = createClient()
    const [fecha, setFecha] = useState('')
    const [descripcion, setDescripcion] = useState('')
    const [feriados, setFeriados] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        fetchFeriados()
    }, [])

    const fetchFeriados = async () => {
        try {
            const { data, error } = await supabase
                .from('feriados')
                .select('*')
                .order('fecha', { ascending: true })
            if (error) throw error
            setFeriados(data || [])
        } catch (error) {
            toast.error('Error al cargar feriados')
        } finally {
            setLoading(false)
        }
    }

    const handleAgregar = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!fecha || !descripcion) {
            toast.warning('Completa todos los campos')
            return
        }

        try {
            const { error } = await supabase
                .from('feriados')
                .insert([{ fecha, descripcion }])

            if (error) throw error
            toast.success('Feriado agregado correctamente')
            setFecha('')
            setDescripcion('')
            fetchFeriados()
        } catch (error) {
            toast.error('Error al agregar feriado')
        }
    }

    const handleEliminar = async (id: number) => {
        try {
            const { error } = await supabase
                .from('feriados')
                .delete()
                .eq('id', id)

            if (error) throw error
            toast.success('Feriado eliminado')
            fetchFeriados()
        } catch (error) {
            toast.error('Error al eliminar')
        }
    }

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center gap-3">
                <BackButton />
                <div>
                    <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Configuración de Feriados</h1>
                    <p className="text-slate-500 text-xs mt-0.5">Define los días no laborables para el cálculo de cronogramas.</p>
                </div>
            </div>

            <div className="grid gap-8 md:grid-cols-12">
                {/* Add Form Section */}
                <div className="md:col-span-4 space-y-6">
                    <div className="bg-slate-900/50 backdrop-blur-sm border border-indigo-500/20 rounded-2xl p-6 shadow-xl sticky top-8">
                        <div className="mb-6">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <Plus className="w-5 h-5 text-indigo-400" />
                                Nuevo Feriado
                            </h2>
                            <p className="text-sm text-slate-500 mt-1">Agrega una fecha para excluirla de los cobros.</p>
                        </div>

                        <form onSubmit={handleAgregar} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs uppercase font-bold text-slate-500 ml-1">Fecha</label>
                                <div className="relative">
                                    <CalendarIcon className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                                    <Input
                                        type="date"
                                        value={fecha}
                                        onChange={(e) => setFecha(e.target.value)}
                                        className="pl-9 bg-slate-950/50 border-slate-700 focus:border-indigo-500 text-slate-200"
                                    />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-xs uppercase font-bold text-slate-500 ml-1">Descripción</label>
                                <Input
                                    placeholder="Ej: Año Nuevo"
                                    value={descripcion}
                                    onChange={(e) => setDescripcion(e.target.value)}
                                    className="bg-slate-950/50 border-slate-700 focus:border-indigo-500 text-slate-200"
                                />
                            </div>
                            <Button className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-lg shadow-indigo-900/20 rounded-xl mt-2">
                                Agregar Fecha
                            </Button>
                        </form>
                    </div>
                </div>

                {/* List Section */}
                <div className="md:col-span-8">
                    <div className="bg-slate-900/30 border border-slate-800 rounded-2xl overflow-hidden">
                        <div className="p-4 bg-slate-900/50 border-b border-slate-800">
                             <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Calendario Anual</h3>
                        </div>
                        
                        {loading ? (
                             <div className="p-8 text-center text-slate-500">Cargando fechas...</div>
                        ) : feriados.length === 0 ? (
                            <div className="p-12 text-center flex flex-col items-center text-slate-500">
                                <CalendarDays className="w-12 h-12 mb-4 opacity-20" />
                                <p>No hay feriados registrados aún.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-800/50">
                                {feriados.map((f) => (
                                    <div key={f.id} className="group flex items-center justify-between p-4 hover:bg-slate-800/30 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col items-center justify-center w-12 h-12 bg-slate-800 rounded-xl border border-slate-700 group-hover:border-indigo-500/30 group-hover:bg-indigo-500/10 transition-colors">
                                                <span className="text-[10px] uppercase font-bold text-slate-500 group-hover:text-indigo-400">
                                                    {format(new Date(f.fecha + 'T12:00:00'), 'MMM', { locale: es })}
                                                </span>
                                                <span className="text-lg font-bold text-white group-hover:text-indigo-300">
                                                    {format(new Date(f.fecha + 'T12:00:00'), 'dd')}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="font-medium text-slate-200 text-lg">{f.descripcion}</p>
                                                <p className="text-xs text-slate-500 capitalize">
                                                    {format(new Date(f.fecha + 'T12:00:00'), 'EEEE, yyyy', { locale: es })}
                                                </p>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => handleEliminar(f.id)}
                                            className="text-slate-600 hover:text-red-400 hover:bg-red-950/30 rounded-full transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <Trash2 className="h-5 w-5" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
