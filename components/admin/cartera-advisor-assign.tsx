'use client'

import { useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { UserPlus } from 'lucide-react'

export function CarteraAdvisorAssign({ carteraId, asesores }: { carteraId: string, asesores: any[] }) {
    const [selected, setSelected] = useState('')
    const [loading, setLoading] = useState(false)
    const supabase = createClient()
    const router = useRouter()

    async function handleAssign() {
        if (!selected) return
        setLoading(true)
        try {
            const { error } = await supabase
                .from('carteras')
                .update({ asesor_id: selected })
                .eq('id', carteraId)
            
            if (error) throw error
            
            toast.success('Asesor vinculado a esta cartera')
            router.refresh()
        } catch (e: any) {
            toast.error('Error al asignar: ' + e.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="animate-in fade-in slide-in-from-top-1 duration-500">
            <div className="flex items-center gap-2">
                <Select onValueChange={setSelected}>
                    <SelectTrigger className="h-9 bg-slate-900 border-slate-700 text-[11px] w-[200px] text-white">
                        <SelectValue placeholder="Seleccionar Asesor..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-950 border-slate-800 text-white">
                        {asesores.map(a => (
                            <SelectItem key={a.id} value={a.id} className="text-xs hover:bg-blue-500/10 focus:bg-blue-500/10 cursor-pointer">
                                {a.nombre_completo}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button 
                    size="sm" 
                    className="h-9 bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] px-4 shadow-lg shadow-blue-900/20 gap-2" 
                    onClick={handleAssign} 
                    disabled={loading || !selected}
                >
                    <UserPlus className="w-3.5 h-3.5" />
                    {loading ? 'PROCESANDO...' : 'VINCULAR AHORA'}
                </Button>
            </div>
            <p className="text-[9px] text-slate-600 mt-2 font-medium italic">
                * Al vincular un asesor, se cargarán automáticamente sus préstamos activos.
            </p>
        </div>
    )
}
