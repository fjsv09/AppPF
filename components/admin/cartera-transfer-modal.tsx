'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { ArrowRightLeft, Landmark, Wallet, AlertCircle } from 'lucide-react'

interface CarteraTransferModalProps {
  carteraId: string
  accounts: any[]
}

export function CarteraTransferModal({ carteraId, accounts }: CarteraTransferModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [transfer, setTransfer] = useState({
    origen_id: '',
    destino_id: '',
    monto: '',
    descripcion: ''
  })
  
  const supabase = createClient()
  const router = useRouter()

  async function executeTransfer() {
    const monto = parseFloat(transfer.monto)
    if (!transfer.origen_id || !transfer.destino_id) {
      toast.error('Seleccione las cuentas de origen y destino')
      return
    }

    if (isNaN(monto) || monto <= 0) {
      toast.error('El monto a transferir debe ser mayor a 0')
      return
    }

    if (transfer.origen_id === transfer.destino_id) {
        toast.error('La cuenta de origen y destino deben ser diferentes')
        return
    }

    // Check balance
    const sourceAcc = accounts.find(a => a.id === transfer.origen_id)
    if (sourceAcc && parseFloat(sourceAcc.saldo) < monto) {
        toast.error(`Saldo insuficiente en ${sourceAcc.nombre} (S/ ${parseFloat(sourceAcc.saldo).toFixed(2)})`)
        return
    }

    setLoading(true)
    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('Sesión no encontrada')

        const { data, error } = await supabase.rpc('inyectar_capital_db', {
            p_cartera_id: carteraId,
            p_cuenta_destino_id: transfer.destino_id,
            p_cuenta_origen_id: transfer.origen_id,
            p_monto: monto,
            p_tipo: 'transferencia',
            p_descripcion: transfer.descripcion || `Transferencia interna entre cuentas`,
            p_usuario_id: user.id
        })

        if (error) throw error

        toast.success('Transferencia realizada correctamente')
        setIsOpen(false)
        setTransfer({ origen_id: '', destino_id: '', monto: '', descripcion: '' })
        router.refresh()
    } catch (error: any) {
        toast.error('Error: ' + error.message)
    } finally {
        setLoading(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 md:h-8 px-3 md:px-5 border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 text-blue-400 text-[9px] md:text-[10px] font-black rounded-lg transition-all flex items-center gap-1.5">
          <ArrowRightLeft className="w-3 h-3" />
          TRANSFERIR
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900/95 border-slate-800 backdrop-blur-xl text-white sm:max-w-[420px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-blue-600/20 rounded-lg">
              <ArrowRightLeft className="w-5 h-5 text-blue-400" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight">Transferencia Interna</DialogTitle>
          </div>
          <DialogDescription className="text-slate-400 text-xs">
            Mueve fondos entre las cuentas de esta cartera de forma inmediata.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cuenta de Origen</Label>
            <Select 
                onValueChange={(val) => setTransfer({ ...transfer, origen_id: val })}
                value={transfer.origen_id}
            >
              <SelectTrigger className="bg-slate-950/50 border-slate-800 h-10 text-xs">
                <SelectValue placeholder="Desde..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white">
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    <div className="flex justify-between w-full gap-4">
                        <span>{a.nombre}</span>
                        <span className="text-emerald-400 font-mono">S/ {parseFloat(a.saldo).toFixed(2)}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-center -my-2 relative z-10">
              <div className="h-8 w-8 rounded-full bg-slate-800 border-4 border-slate-900 flex items-center justify-center">
                  <ArrowRightLeft className="w-3 h-3 text-blue-400 rotate-90" />
              </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Cuenta de Destino</Label>
            <Select 
                onValueChange={(val) => setTransfer({ ...transfer, destino_id: val })}
                value={transfer.destino_id}
            >
              <SelectTrigger className="bg-slate-950/50 border-slate-800 h-10 text-xs">
                <SelectValue placeholder="Hacia..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800 text-white">
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {a.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Monto a Transferir</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold text-sm">S/</span>
              <Input 
                type="number"
                step="0.01"
                min="0.01"
                required
                placeholder="0.00" 
                className="bg-slate-950/50 border-slate-800 focus:border-blue-500/50 text-white pl-8 h-12 text-lg font-black"
                value={transfer.monto}
                onChange={(e) => setTransfer({ ...transfer, monto: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Descripción (Opcional)</Label>
            <Input 
                placeholder="Ej: Traspaso a caja chica..." 
                className="bg-slate-950/50 border-slate-800 text-white h-10 text-xs"
                value={transfer.descripcion}
                onChange={(e) => setTransfer({ ...transfer, descripcion: e.target.value })}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <Button 
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-12 shadow-lg shadow-blue-900/20 transition-all" 
            onClick={executeTransfer}
            disabled={loading}
          >
            {loading ? 'Procesando...' : 'Completar Transferencia'}
          </Button>
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-[9px] text-amber-200/70 leading-relaxed uppercase">
                  Esta acción actualizará los balances de ambas cuentas de inmediato y quedará registrada en el historial de auditoría.
              </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
