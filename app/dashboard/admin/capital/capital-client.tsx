'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Plus, TrendingUp, Users, Landmark, Wallet, ArrowUpRight, ArrowDownRight, History, PieChart, DollarSign, Calendar, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { BackButton } from '@/components/ui/back-button'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { 
    AlertDialog, 
    AlertDialogAction, 
    AlertDialogCancel, 
    AlertDialogContent, 
    AlertDialogDescription, 
    AlertDialogFooter, 
    AlertDialogHeader, 
    AlertDialogTitle 
} from '@/components/ui/alert-dialog'

interface CapitalClientProps {
  initialInversionistas: any[]
  initialSocios: any[]
  accounts: any[]
  initialTransacciones: any[]
}

export default function CapitalClient({ 
  initialInversionistas, 
  initialSocios, 
  accounts, 
  initialTransacciones 
}: CapitalClientProps) {
  const [inversionistas, setInversionistas] = useState(initialInversionistas)
  const [socios, setSocios] = useState(initialSocios)
  const [transacciones, setTransacciones] = useState(initialTransacciones)
  const [valuation, setValuation] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [isNewInvModalOpen, setIsNewInvModalOpen] = useState(false)
  const [isNewSocioModalOpen, setIsNewSocioModalOpen] = useState(false)
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false)
  const [isEditInvModalOpen, setIsEditInvModalOpen] = useState(false)
  const [isEditSocioModalOpen, setIsEditSocioModalOpen] = useState(false)
  const [selectedInversionista, setSelectedInversionista] = useState<any>(null)
  const [selectedSocio, setSelectedSocio] = useState<any>(null)

  // Confirm Modal state
  const [confirmConfig, setConfirmConfig] = useState<{
      isOpen: boolean,
      title: string,
      description: string,
      actionText: string,
      variant: 'danger' | 'info',
      onConfirm: () => void
  }>({
      isOpen: false,
      title: '',
      description: '',
      actionText: 'Confirmar',
      variant: 'danger',
      onConfirm: () => {}
  })

  const askConfirmation = (title: string, description: string, actionText: string, variant: 'danger' | 'info', onConfirm: () => void) => {
      setConfirmConfig({
          isOpen: true,
          title,
          description,
          actionText,
          variant,
          onConfirm
      })
  }
  const formatDateLocal = (dateStr: string) => {
      if (!dateStr) return '-'
      // Append T00:00:00 to force local timezone parsing instead of UTC
      const date = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00`)
      return format(date, 'dd/MM/yyyy')
  }
  // Transaction form state
  const [txForm, setTxForm] = useState({
    entidad_id: '',
    entidad_tipo: 'inversionista' as 'inversionista' | 'socio',
    tipo: '',
    monto: '',
    cuenta_id: '',
    descripcion: ''
  })

  useEffect(() => {
    fetchValuation()
  }, [])

  const fetchValuation = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/capital/valuacion')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setValuation(data)
    } catch (error: any) {
      toast.error('Error al cargar valuación: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRegisterTransaction = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const res = await fetch('/api/admin/capital/transacciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(txForm)
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      toast.success('Transacción registrada exitosamente')
      setIsTransactionModalOpen(false)
      // Refresh data
      fetchValuation()
      const resTx = await fetch('/api/admin/capital/transacciones') // hypothetical or re-fetch current list
      // For now just reload page or refresh specific state
      window.location.reload()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val)
  }

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 sm:gap-3">
            <BackButton />
            <div className="min-w-0">
              <h1 className="page-title flex items-center gap-2 text-base sm:text-xl">
                <TrendingUp className="text-blue-500 w-5 h-5 shrink-0" />
                <span className="truncate">CAPITAL Y SOCIOS</span>
              </h1>
              <p className="page-subtitle text-xs sm:text-sm">Gestión financiera estratégica y valuación del negocio.</p>
            </div>
          </div>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button
            onClick={() => setIsNewInvModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white border-none shadow-lg shadow-blue-900/20 flex-1 sm:flex-none"
          >
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Nuevo Inversionista</span>
            <span className="sm:hidden ml-1 text-xs">Inversionista</span>
          </Button>
          <Button
            onClick={() => setIsNewSocioModalOpen(true)}
            variant="outline"
            className="border-slate-800 bg-slate-900/50 text-slate-300 hover:bg-slate-800 flex-1 sm:flex-none"
          >
            <Plus className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Nuevo Socio</span>
            <span className="sm:hidden ml-1 text-xs">Socio</span>
          </Button>
        </div>
      </div>

      {/* Critical Alerts */}
      {valuation?.alertas_pagos && valuation.alertas_pagos.length > 0 && (
        <div className="space-y-3">
          {valuation.alertas_pagos.map((alerta: any, idx: number) => (
            <div
              key={idx}
              className={`p-3 sm:p-4 rounded-xl border flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 animate-in slide-in-from-top-2 ${
                alerta.vencido
                  ? 'bg-rose-500/10 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.2)]'
                  : 'bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
              }`}
            >
              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${alerta.vencido ? 'bg-rose-500/20' : 'bg-amber-500/20'}`}>
                  <Calendar className={`w-5 h-5 ${alerta.vencido ? 'text-rose-500' : 'text-amber-500'}`} />
                </div>
                <div className="min-w-0">
                  <h3 className={`font-black text-xs sm:text-sm uppercase tracking-tight ${alerta.vencido ? 'text-rose-400' : 'text-amber-400'}`}>
                    {alerta.vencido ? 'Pago Vencido' : 'Pago Próximo'} - {alerta.nombre}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Fecha programada: <span className="text-white font-bold">{format(new Date(alerta.fecha_pago), 'dd/MM/yyyy')}</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between md:justify-end gap-3 md:gap-6">
                <div className="text-left md:text-right">
                  <p className="text-sm font-black text-white">{formatCurrency(alerta.monto_estimado)}</p>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Interés Estimado</p>
                </div>
                <Button
                  size="sm"
                  className={`${alerta.vencido ? 'bg-rose-600 hover:bg-rose-500' : 'bg-amber-600 hover:bg-amber-500'} text-white border-none font-bold whitespace-nowrap`}
                  onClick={() => {
                    setTxForm({
                        entidad_id: alerta.inversionista_id,
                        entidad_tipo: 'inversionista',
                        tipo: 'pago_interes',
                        monto: alerta.monto_estimado.toString(),
                        cuenta_id: '',
                        descripcion: `Pago de intereses - Periodo ${format(new Date(), 'MMMM yyyy', { locale: es })}`
                    })
                    setIsTransactionModalOpen(true)
                  }}
                >
                  <span className="hidden sm:inline">Registrar Pago Ahora</span>
                  <span className="sm:hidden">Registrar Pago</span>
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* KPI Overlays */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-6">
        <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Landmark size={80} />
          </div>
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500">Patrimonio Neto Est.</CardDescription>
            <CardTitle className="text-2xl sm:text-3xl font-black text-emerald-400 break-words">
              {valuation ? formatCurrency(valuation.metricas.patrimonio_neto) : '...'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-slate-400 gap-1">
              <ArrowUpRight className="w-3 h-3 text-emerald-400 shrink-0" />
              <span className="truncate">Basado en activos y pasivos actuales</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500">Capital en Calle</CardDescription>
            <CardTitle className="text-2xl sm:text-3xl font-black text-white break-words">
              {valuation ? formatCurrency(valuation.metricas.capital_en_calle) : '...'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-slate-400 gap-1">
              <Wallet className="w-3 h-3 text-blue-400 shrink-0" />
              <span className="truncate">Cartera activa total con intereses</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md">
          <CardHeader className="pb-2">
            <CardDescription className="text-[10px] sm:text-xs font-bold uppercase tracking-widest text-slate-500">Pasivo Inversionistas</CardDescription>
            <CardTitle className="text-2xl sm:text-3xl font-black text-rose-500 break-words">
              {valuation ? formatCurrency(valuation.metricas.pasivo_inversionistas) : '...'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-xs text-slate-400 gap-1">
              <ArrowDownRight className="w-3 h-3 text-rose-500 shrink-0" />
              <span className="truncate">Capital pendiente de devolución</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="inversionistas" className="w-full">
        <TabsList className="bg-slate-900/60 border border-slate-800 p-1 rounded-xl w-full sm:w-auto overflow-x-auto flex justify-start sm:inline-flex">
          <TabsTrigger value="inversionistas" className="rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white flex-1 sm:flex-none">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <History className="w-4 h-4 shrink-0" />
              <span>Inversionistas</span>
            </div>
          </TabsTrigger>
          <TabsTrigger value="socios" className="rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white flex-1 sm:flex-none">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <Users className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Socios y Participación</span>
              <span className="sm:hidden">Socios</span>
            </div>
          </TabsTrigger>
          <TabsTrigger value="historial" className="rounded-lg data-[state=active]:bg-blue-600 data-[state=active]:text-white flex-1 sm:flex-none">
            <div className="flex items-center gap-2 text-xs sm:text-sm">
              <History className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">Movimientos de Capital</span>
              <span className="sm:hidden">Movimientos</span>
            </div>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inversionistas" className="mt-6 space-y-6">
          <Card className="bg-slate-900/40 border-slate-800">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800/50 pb-4">
              <div className="min-w-0">
                <CardTitle className="text-base sm:text-xl font-bold text-white uppercase tracking-tighter">Listado de Inversionistas</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Seguimiento de capital de terceros y compromisos de pago.</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-slate-800 bg-slate-900 text-xs font-bold w-full sm:w-auto"
                onClick={() => {
                    setTxForm({...txForm, entidad_tipo: 'inversionista'})
                    setIsTransactionModalOpen(true)
                }}
              >
                <Plus className="w-3 h-3 mr-1" /> Registrar Pago/Gasto
              </Button>
            </CardHeader>

            {/* Mobile card list */}
            <div className="md:hidden space-y-3 p-3">
              {inversionistas.map((inv) => (
                <div key={inv.id} className="p-4 space-y-3 bg-slate-950/60 rounded-xl border border-slate-800/60">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-white uppercase text-sm truncate">{inv.nombre}</p>
                      <p className="text-lg font-black text-rose-400">{formatCurrency(inv.capital_total)}</p>
                    </div>
                    <Badge className={inv.estado === 'activo' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shrink-0' : 'bg-slate-500/10 text-slate-500 border-slate-500/20 shrink-0'}>
                      {parseFloat(inv.tasa_interes_mensual) === 0 ? 'PRÉSTAMO 0%' : inv.estado?.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs bg-slate-900/50 rounded-lg p-2.5">
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase font-bold">Tasa</p>
                      <p className="text-slate-300 font-mono">{inv.tasa_interes_mensual}%</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase font-bold">Frecuencia</p>
                      <p className="text-slate-300 uppercase text-[10px] font-bold">{inv.frecuencia_pago === 'no_aplica' ? 'N/A' : inv.frecuencia_pago}</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase font-bold">Inicio</p>
                      <p className="text-slate-300 text-[10px]">{formatDateLocal(inv.fecha_inicio)}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 pt-2 border-t border-slate-800/50">
                    <Button variant="ghost" size="sm" className="flex-1 h-8 text-slate-400 hover:text-white text-xs" onClick={() => {
                        setTxForm({
                            entidad_id: inv.id,
                            entidad_tipo: 'inversionista',
                            tipo: 'pago_interes',
                            monto: '',
                            cuenta_id: '',
                            descripcion: ''
                        })
                        setIsTransactionModalOpen(true)
                    }}>
                      <DollarSign className="w-4 h-4 mr-1" /> Pago
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300" onClick={() => {
                        askConfirmation(
                            '¿Editar registro?',
                            `¿Deseas abrir el editor para ${inv.nombre}?`,
                            'Sí, Editar',
                            'info',
                            () => {
                                setSelectedInversionista(inv)
                                setIsEditInvModalOpen(true)
                            }
                        )
                    }}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-500 hover:text-rose-400" onClick={() => {
                        askConfirmation(
                            '¿Eliminar registro?',
                            'Esta acción es permanente. Solo se permitirá si no existen transacciones asociadas.',
                            'Confirmar Eliminación',
                            'danger',
                            async () => {
                                try {
                                    const res = await fetch(`/api/admin/capital/inversionistas/${inv.id}`, { method: 'DELETE' })
                                    const data = await res.json()
                                    if (data.error) throw new Error(data.error)
                                    toast.success('Registro eliminado')
                                    window.location.reload()
                                } catch (e: any) {
                                    toast.error(e.message)
                                }
                            }
                        )
                    }}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {inversionistas.length === 0 && (
                <div className="p-6 text-center text-slate-600 italic text-sm">No hay inversionistas registrados.</div>
              )}
            </div>

            <CardContent className="p-0 overflow-x-auto hidden md:block">
              <Table className="min-w-[800px]">
                <TableHeader className="bg-slate-800/30">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400 font-bold uppercase text-[10px]">Nombre</TableHead>
                    <TableHead className="text-slate-400 font-bold uppercase text-[10px]">Capital Actual</TableHead>
                    <TableHead className="text-slate-400 font-bold uppercase text-[10px]">Tasa %</TableHead>
                    <TableHead className="text-slate-400 font-bold uppercase text-[10px]">Frecuencia</TableHead>
                    <TableHead className="text-slate-400 font-bold uppercase text-[10px]">Estado</TableHead>
                    <TableHead className="text-slate-400 font-bold uppercase text-[10px]">Inicio</TableHead>
                    <TableHead className="text-right text-slate-400 font-bold uppercase text-[10px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inversionistas.map((inv) => (
                    <TableRow key={inv.id} className="border-slate-800/50 hover:bg-slate-800/20">
                      <TableCell className="font-bold text-white uppercase">{inv.nombre}</TableCell>
                      <TableCell className="font-black text-rose-400">{formatCurrency(inv.capital_total)}</TableCell>
                      <TableCell className="text-slate-300 font-mono">{inv.tasa_interes_mensual}% <span className="text-[10px] text-slate-500">mensual</span></TableCell>
                      <TableCell className="uppercase text-[10px] font-bold text-slate-400">
                        <Badge variant="outline" className="border-slate-700 text-slate-400">{inv.frecuencia_pago === 'no_aplica' ? 'N/A' : inv.frecuencia_pago}</Badge>
                      </TableCell>
                      <TableCell>
                      <Badge className={inv.estado === 'activo' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' : 'bg-slate-500/10 text-slate-500 border-slate-500/20'}>
                          {parseFloat(inv.tasa_interes_mensual) === 0 ? 'PRÉSTAMO 0%' : inv.estado?.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {formatDateLocal(inv.fecha_inicio)}
                      </TableCell>
                      <TableCell className="text-right flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-slate-400 hover:text-white" onClick={() => {
                            setTxForm({
                                entidad_id: inv.id,
                                entidad_tipo: 'inversionista',
                                tipo: 'pago_interes',
                                monto: '',
                                cuenta_id: '',
                                descripcion: ''
                            })
                            setIsTransactionModalOpen(true)
                        }}>
                          <DollarSign className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-400 hover:text-blue-300" onClick={() => {
                            askConfirmation(
                                '¿Editar Inversionista?',
                                `¿Deseas modificar los datos de ${inv.nombre}?`,
                                'Abrir Editor',
                                'info',
                                () => {
                                    setSelectedInversionista(inv)
                                    setIsEditInvModalOpen(true)
                                }
                            )
                        }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-rose-500 hover:text-rose-400" onClick={() => {
                            askConfirmation(
                                '¿Eliminar inversionista?',
                                `¿Estás seguro de eliminar a ${inv.nombre}? Esta acción no se puede deshacer.`,
                                'Confirmar Eliminación',
                                'danger',
                                async () => {
                                    try {
                                        const res = await fetch(`/api/admin/capital/inversionistas/${inv.id}`, { method: 'DELETE' })
                                        const data = await res.json()
                                        if (data.error) throw new Error(data.error)
                                        toast.success('Registro eliminado')
                                        window.location.reload()
                                    } catch (e: any) {
                                        toast.error(e.message)
                                    }
                                }
                            )
                        }}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="socios" className="mt-6 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
            <Card className="bg-slate-900/40 border-slate-800">
              <CardHeader>
                <CardTitle className="text-base sm:text-xl font-bold text-white uppercase tracking-tighter">Participación de Socios</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Valuación actual de cada socio basada en el patrimonio neto.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6">
                {(valuation?.socios || socios).map((socio: any) => (
                  <div key={socio.id} className="p-3 sm:p-4 bg-slate-950/40 rounded-xl border border-slate-800/50 space-y-3">
                    <div className="flex justify-between items-center gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 shrink-0 rounded-full bg-blue-600/10 flex items-center justify-center font-bold text-blue-500 uppercase">
                          {socio.nombre.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-white uppercase truncate">{socio.nombre}</p>
                          <p className="text-xs text-slate-500">{socio.porcentaje_participacion}% de participación</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-base sm:text-xl font-black text-emerald-400">{formatCurrency(socio.valor_actual || 0)}</p>
                        <p className="text-[10px] text-slate-500 uppercase font-bold">Valor Actual</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 sm:gap-2 pt-2 border-t border-slate-800">
                        <Button size="sm" variant="ghost" className="text-[10px] h-7 font-bold uppercase px-2 hover:bg-slate-800" onClick={() => {
                                setTxForm({
                                    entidad_id: socio.id,
                                    entidad_tipo: 'socio',
                                    tipo: 'retiro_utilidad',
                                    monto: '',
                                    cuenta_id: '',
                                    descripcion: ''
                                })
                                setIsTransactionModalOpen(true)
                            }}>
                            <ArrowDownRight className="w-3 h-3 mr-1" /> Retirar Utilidad
                        </Button>
                        <Button size="sm" variant="ghost" className="text-[10px] h-7 font-bold uppercase px-2 hover:bg-slate-800" onClick={() => {
                                setTxForm({
                                    entidad_id: socio.id,
                                    entidad_tipo: 'socio',
                                    tipo: 'inyeccion',
                                    monto: '',
                                    cuenta_id: '',
                                    descripcion: ''
                                })
                                setIsTransactionModalOpen(true)
                            }}>
                            <ArrowUpRight className="w-3 h-3 mr-1" />
                            <span className="hidden sm:inline">Inyectar Mas Capital</span>
                            <span className="sm:hidden">Inyectar</span>
                        </Button>
                        <div className="flex-1" />
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-400 hover:text-blue-300" onClick={() => {
                            askConfirmation(
                                '¿Editar Socio?',
                                `¿Deseas modificar los datos de ${socio.nombre}?`,
                                'Abrir Editor',
                                'info',
                                () => {
                                    setSelectedSocio(socio)
                                    setIsEditSocioModalOpen(true)
                                }
                            )
                        }}>
                            <Pencil className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-500 hover:text-rose-400" onClick={() => {
                            askConfirmation(
                                '¿Eliminar socio?',
                                `¿Estás seguro de eliminar a ${socio.nombre}? Se perderá su registro de participación.`,
                                'Confirmar Eliminación',
                                'danger',
                                async () => {
                                    try {
                                        const res = await fetch(`/api/admin/capital/socios/${socio.id}`, { method: 'DELETE' })
                                        const data = await res.json()
                                        if (data.error) throw new Error(data.error)
                                        toast.success('Socio eliminado')
                                        window.location.reload()
                                    } catch (e: any) {
                                        toast.error(e.message)
                                    }
                                }
                            )
                        }}>
                            <Trash2 className="w-3 h-3" />
                        </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="bg-slate-900/40 border-slate-800 h-fit">
              <CardHeader>
                <CardTitle className="text-base sm:text-xl font-bold text-white uppercase tracking-tighter">Desglose de Valuación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="flex justify-between items-center gap-2 p-3 bg-slate-800/20 rounded-lg">
                  <span className="text-xs sm:text-sm text-slate-400">Capital en Calle (Activo)</span>
                  <span className="font-bold text-white text-sm sm:text-base whitespace-nowrap">{valuation ? formatCurrency(valuation.metricas.capital_en_calle) : '...'}</span>
                </div>
                <div className="flex justify-between items-center gap-2 p-3 bg-slate-800/20 rounded-lg">
                  <span className="text-xs sm:text-sm text-slate-400">Saldos en Cuentas</span>
                  <span className="font-bold text-white text-sm sm:text-base whitespace-nowrap">{valuation ? formatCurrency(valuation.metricas.saldo_cuentas) : '...'}</span>
                </div>
                <div className="flex justify-between items-center gap-2 p-3 bg-rose-900/10 rounded-lg border border-rose-500/10">
                  <span className="text-xs sm:text-sm text-rose-400">Total Pasivo (Inversionistas)</span>
                  <span className="font-bold text-rose-400 text-sm sm:text-base whitespace-nowrap">-{valuation ? formatCurrency(valuation.metricas.pasivo_inversionistas) : '...'}</span>
                </div>
                <div className="pt-3 sm:pt-4 border-t border-slate-800">
                  <div className="flex justify-between items-center gap-2 p-3 sm:p-4 bg-emerald-950/20 rounded-xl border border-emerald-500/20">
                    <span className="text-sm sm:text-lg font-bold text-emerald-500">PATRIMONIO NETO</span>
                    <span className="text-lg sm:text-2xl font-black text-emerald-500 whitespace-nowrap">{valuation ? formatCurrency(valuation.metricas.patrimonio_neto) : '...'}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="historial" className="mt-6">
          <Card className="bg-slate-900/40 border-slate-800">
            <CardHeader>
              <CardTitle className="text-base sm:text-xl font-bold text-white uppercase tracking-tighter">Historial de Movimientos</CardTitle>
              <CardDescription className="text-xs sm:text-sm">Registro auditado de todas las operaciones de capital.</CardDescription>
            </CardHeader>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-slate-800/50 border-t border-slate-800/50">
              {transacciones.map((tx) => (
                <div key={tx.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge className={`${
                      tx.tipo === 'inyeccion' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/10' :
                      tx.tipo === 'retiro_utilidad' || tx.tipo === 'retiro_capital' || tx.tipo === 'devolucion_capital' ? 'bg-rose-500/10 text-rose-500 border-rose-500/10' :
                      'bg-blue-500/10 text-blue-500 border-blue-500/10'
                    } uppercase text-[9px]`}>
                      {tx.tipo?.replace('_', ' ')}
                    </Badge>
                    <span className={`font-bold text-sm whitespace-nowrap ${['retiro_utilidad', 'pago_interes', 'devolucion_capital', 'retiro_capital'].includes(tx.tipo) ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {['retiro_utilidad', 'pago_interes', 'devolucion_capital', 'retiro_capital'].includes(tx.tipo) ? '- ' : '+ '}
                      {formatCurrency(tx.monto)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[10px]">
                    <span className="text-slate-500">{format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}</span>
                    <span className="font-bold text-slate-300 uppercase truncate">{tx.cuentas_financieras?.nombre}</span>
                  </div>
                  {tx.descripcion && (
                    <p className="text-xs text-slate-400 line-clamp-2">{tx.descripcion}</p>
                  )}
                </div>
              ))}
              {transacciones.length === 0 && (
                <div className="p-6 text-center text-slate-600 italic text-sm">No hay movimientos registrados.</div>
              )}
            </div>

            <CardContent className="p-0 overflow-x-auto hidden md:block">
              <Table className="min-w-[800px]">
                <TableHeader className="bg-slate-800/30">
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400 font-bold uppercase text-[10px]">Fecha</TableHead>
                    <TableHead className="text-slate-400 font-bold uppercase text-[10px]">Tipo</TableHead>
                    <TableHead className="text-slate-400 font-bold uppercase text-[10px]">Monto</TableHead>
                    <TableHead className="text-slate-400 font-bold uppercase text-[10px]">Cuenta</TableHead>
                    <TableHead className="text-slate-400 font-bold uppercase text-[10px]">Descripción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transacciones.map((tx) => (
                    <TableRow key={tx.id} className="border-slate-800/50 hover:bg-slate-800/20">
                      <TableCell className="text-xs text-slate-500">
                        {format(new Date(tx.created_at), 'dd/MM/yyyy HH:mm')}
                      </TableCell>
                      <TableCell>
                        <Badge className={`${
                            tx.tipo === 'inyeccion' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/10' :
                            tx.tipo === 'retiro_utilidad' || tx.tipo === 'retiro_capital' || tx.tipo === 'devolucion_capital' ? 'bg-rose-500/10 text-rose-500 border-rose-500/10' :
                            'bg-blue-500/10 text-blue-500 border-blue-500/10'
                        } uppercase text-[9px]`}>
                          {tx.tipo?.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className={`font-bold ${['retiro_utilidad', 'pago_interes', 'devolucion_capital', 'retiro_capital'].includes(tx.tipo) ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {['retiro_utilidad', 'pago_interes', 'devolucion_capital', 'retiro_capital'].includes(tx.tipo) ? '- ' : '+ '}
                        {formatCurrency(tx.monto)}
                      </TableCell>
                      <TableCell className="text-xs font-bold text-slate-300 uppercase">{tx.cuentas_financieras?.nombre}</TableCell>
                      <TableCell className="text-xs text-slate-400 max-w-xs truncate">{tx.descripcion}</TableCell>
                    </TableRow>
                  ))}
                  {transacciones.length === 0 && (
                      <TableRow>
                          <TableCell colSpan={5} className="text-center py-10 text-slate-600 italic">No hay movimientos registrados.</TableCell>
                      </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transaction Modal */}
      <Dialog open={isTransactionModalOpen} onOpenChange={setIsTransactionModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold uppercase">Registrar Operación de Capital</DialogTitle>
            <DialogDescription>Afectará el saldo de la cuenta seleccionada y el patrimonio.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRegisterTransaction} className="space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Tipo de Entidad</Label>
                  <Select 
                    value={txForm.entidad_tipo} 
                    onValueChange={(v: any) => setTxForm({...txForm, entidad_tipo: v, entidad_id: '', tipo: ''})}
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-800">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-950 border-slate-800">
                      <SelectItem value="inversionista">Inversionista</SelectItem>
                      <SelectItem value="socio">Socio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold uppercase text-slate-500">Persona / Entidad</Label>
                  <Select 
                    value={txForm.entidad_id} 
                    onValueChange={(v) => setTxForm({...txForm, entidad_id: v})}
                  >
                    <SelectTrigger className="bg-slate-950 border-slate-800">
                      <SelectValue placeholder="Seleccionar..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-950 border-slate-800">
                      {txForm.entidad_tipo === 'inversionista' ? (
                        inversionistas.map(inv => (
                          <SelectItem key={inv.id} value={inv.id}>{inv.nombre}</SelectItem>
                        ))
                      ) : (
                        socios.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>


              <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-slate-500">Operación</Label>
                    <Select value={txForm.tipo} onValueChange={(v) => setTxForm({...txForm, tipo: v})}>
                        <SelectTrigger className="bg-slate-950 border-slate-800">
                            <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-950 border-slate-800">
                            {txForm.entidad_tipo === 'inversionista' ? (
                                <>
                                    <SelectItem value="inyeccion" className="text-emerald-400 font-bold">↑ Inyección de Capital</SelectItem>
                                    <SelectItem value="pago_interes" className="text-rose-400 font-bold">↓ Pago de Interés</SelectItem>
                                    <SelectItem value="devolucion_capital" className="text-rose-400 font-bold">↓ Devolución de Capital</SelectItem>
                                </>
                            ) : (
                                <>
                                    <SelectItem value="inyeccion" className="text-emerald-400 font-bold">↑ Aporte de Capital</SelectItem>
                                    <SelectItem value="retiro_utilidad" className="text-rose-400 font-bold">↓ Retiro de Utilidades</SelectItem>
                                    <SelectItem value="retiro_capital" className="text-rose-400 font-bold">↓ Retiro de Capital</SelectItem>
                                </>
                            )}
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-2">
                    <Label className="text-xs font-bold uppercase text-slate-500">Monto (S/)</Label>
                    <Input 
                        type="number" 
                        step="0.01" 
                        required
                        className="bg-slate-950 border-slate-800 font-mono text-lg"
                        value={txForm.monto}
                        onChange={(e) => setTxForm({...txForm, monto: e.target.value})}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-500">Cuenta de Destinos/Origen</Label>
                <Select value={txForm.cuenta_id} onValueChange={(v) => setTxForm({...txForm, cuenta_id: v})}>
                    <SelectTrigger className="bg-slate-950 border-slate-800">
                        <SelectValue placeholder="Seleccionar cuenta" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-950 border-slate-800">
                        {accounts.map(acc => (
                            <SelectItem key={acc.id} value={acc.id}>
                                {acc.nombre} ({acc.carteras?.nombre}) - S/ {acc.saldo}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-slate-500">Descripción (Opcional)</Label>
                <Input 
                    className="bg-slate-950 border-slate-800"
                    placeholder="Ej. Interés primer trimestre 2024"
                    value={txForm.descripcion}
                    onChange={(e) => setTxForm({...txForm, descripcion: e.target.value})}
                />
            </div>

            <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setIsTransactionModalOpen(false)}>Cancelar</Button>
                <Button type="submit" className="bg-blue-600 hover:bg-blue-500" disabled={loading}>
                    {loading ? 'Procesando...' : 'Confirmar Operación'}
                </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* New Inversionista Modal */}
      <NewInversionistaModal 
        isOpen={isNewInvModalOpen} 
        onClose={() => setIsNewInvModalOpen(false)} 
        accounts={accounts}
        onSuccess={() => window.location.reload()}
      />

      {/* New Socio Modal */}
      <NewSocioModal 
        isOpen={isNewSocioModalOpen} 
        onClose={() => setIsNewSocioModalOpen(false)} 
        accounts={accounts}
        onSuccess={() => window.location.reload()}
      />

      {/* Edit Inversionista Modal */}
      {selectedInversionista && (
        <EditInversionistaModal 
          isOpen={isEditInvModalOpen}
          onClose={() => {
            setIsEditInvModalOpen(false)
            setSelectedInversionista(null)
          }}
          inversionista={selectedInversionista}
          onSuccess={() => window.location.reload()}
        />
      )}

      {/* Edit Socio Modal */}
      {selectedSocio && (
        <EditSocioModal 
          isOpen={isEditSocioModalOpen}
          onClose={() => {
            setIsEditSocioModalOpen(false)
            setSelectedSocio(null)
          }}
          socio={selectedSocio}
          onSuccess={() => window.location.reload()}
        />
      )}

      {/* Improved Confirm Dialog */}
      <AlertDialog 
        open={confirmConfig.isOpen} 
        onOpenChange={(open) => setConfirmConfig(prev => ({...prev, isOpen: open}))}
      >
        <AlertDialogContent className="bg-slate-900 border-slate-800 text-slate-200 max-w-[400px]">
          <AlertDialogHeader>
            <div className="flex items-center gap-3 mb-2">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${confirmConfig.variant === 'danger' ? 'bg-rose-500/20' : 'bg-blue-500/20'}`}>
                    <AlertTriangle className={`w-5 h-5 ${confirmConfig.variant === 'danger' ? 'text-rose-500' : 'text-blue-500'}`} />
                </div>
                <AlertDialogTitle className="text-xl font-bold uppercase tracking-tight text-white">
                    {confirmConfig.title}
                </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-slate-400 text-sm leading-relaxed">
              {confirmConfig.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-6">
            <AlertDialogCancel className="bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white border-none">
                Cancelar
            </AlertDialogCancel>
            <AlertDialogAction 
                onClick={confirmConfig.onConfirm}
                className={`${confirmConfig.variant === 'danger' ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-900/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'} text-white border-none shadow-lg font-bold`}
            >
                {confirmConfig.actionText}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  )
}

function NewInversionistaModal({ isOpen, onClose, accounts, onSuccess }: any) {
    const [loading, setLoading] = useState(false)
    const [tipoRegistro, setTipoRegistro] = useState<'inversionista' | 'prestamo'>('inversionista')
    const [form, setForm] = useState({
        nombre: '',
        capital_inicial: '',
        fecha_inicio: format(new Date(), 'yyyy-MM-dd'),
        duracion_meses: '',
        frecuencia_pago: 'mensual',
        tasa_interes_mensual: '5',
        cuenta_id: ''
    })

    const handleTipoChange = (tipo: 'inversionista' | 'prestamo') => {
        setTipoRegistro(tipo)
        if (tipo === 'prestamo') {
            setForm(f => ({ ...f, tasa_interes_mensual: '0', frecuencia_pago: 'no_aplica' }))
        } else {
            setForm(f => ({ ...f, tasa_interes_mensual: '5', frecuencia_pago: 'mensual' }))
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await fetch('/api/admin/capital/inversionistas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            })
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            toast.success(tipoRegistro === 'prestamo' ? 'Préstamo registrado exitosamente' : 'Inversionista creado exitosamente')
            onSuccess()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold uppercase">
                        {tipoRegistro === 'prestamo' ? 'Registrar Préstamo Recibido' : 'Nuevo Inversionista'}
                    </DialogTitle>
                    <DialogDescription>
                        {tipoRegistro === 'prestamo' 
                            ? 'Registra un préstamo que la empresa recibió. Se contabilizará como pasivo.'
                            : 'Registra un tercero que aporta capital con intereses pactados.'
                        }
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Tipo selector */}
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            type="button"
                            onClick={() => handleTipoChange('inversionista')}
                            className={`p-3 rounded-xl border text-xs font-bold uppercase text-center transition-all ${
                                tipoRegistro === 'inversionista'
                                    ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                            }`}
                        >
                            <TrendingUp className="w-4 h-4 mx-auto mb-1" />
                            Inversionista<br />
                            <span className="text-[9px] font-normal normal-case opacity-70">Con interés pactado</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleTipoChange('prestamo')}
                            className={`p-3 rounded-xl border text-xs font-bold uppercase text-center transition-all ${
                                tipoRegistro === 'prestamo'
                                    ? 'bg-emerald-600/20 border-emerald-500 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-700'
                            }`}
                        >
                            <Landmark className="w-4 h-4 mx-auto mb-1" />
                            Préstamo 0%<br />
                            <span className="text-[9px] font-normal normal-case opacity-70">Sin interés, solo devolver capital</span>
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">
                                {tipoRegistro === 'prestamo' ? 'Nombre del Prestamista' : 'Nombre Completo'}
                            </Label>
                            <Input className="bg-slate-950 border-slate-800" required placeholder={tipoRegistro === 'prestamo' ? 'Ej. Juan Pérez, Banco X...' : ''} value={form.nombre} onChange={(e) => setForm({...form, nombre: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Fecha de Inicio</Label>
                            <Input type="date" className="bg-slate-950 border-slate-800" required value={form.fecha_inicio} onChange={(e) => setForm({...form, fecha_inicio: e.target.value})} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">
                                {tipoRegistro === 'prestamo' ? 'Monto del Préstamo (S/)' : 'Capital Inicial (S/)'}
                            </Label>
                            <Input type="number" step="0.01" required className="bg-slate-950 border-slate-800 font-mono text-lg" value={form.capital_inicial} onChange={(e) => setForm({...form, capital_inicial: e.target.value})} />
                        </div>
                        {tipoRegistro === 'inversionista' ? (
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase text-slate-500">Frecuencia de Pagos</Label>
                                <Select value={form.frecuencia_pago} onValueChange={(v) => setForm({...form, frecuencia_pago: v})}>
                                    <SelectTrigger className="bg-slate-950 border-slate-800">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-950 border-slate-800">
                                        <SelectItem value="mensual">Mensual</SelectItem>
                                        <SelectItem value="bimestral">Bimestral</SelectItem>
                                        <SelectItem value="trimestral">Trimestral</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase text-slate-500">Plazo (Meses, Opcional)</Label>
                                <Input type="number" className="bg-slate-950 border-slate-800" placeholder="Sin plazo fijo" value={form.duracion_meses} onChange={(e) => setForm({...form, duracion_meses: e.target.value})} />
                            </div>
                        )}
                    </div>
                    {tipoRegistro === 'inversionista' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase text-slate-500">Tasa Mensual (%)</Label>
                                <Input type="number" step="0.1" required className="bg-slate-950 border-slate-800" value={form.tasa_interes_mensual} onChange={(e) => setForm({...form, tasa_interes_mensual: e.target.value})} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase text-slate-500">Duración (Meses)</Label>
                                <Input type="number" className="bg-slate-950 border-slate-800" value={form.duracion_meses} onChange={(e) => setForm({...form, duracion_meses: e.target.value})} />
                            </div>
                        </div>
                    )}

                    {tipoRegistro === 'prestamo' && (
                        <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-500/20 text-xs text-emerald-400/80">
                            <strong>Préstamo a 0% de interés.</strong> Se registrará como pasivo. No se generarán alertas de pago de intereses. Para devolver capital, usa la operación "Devolución de Capital" desde el listado.
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-slate-500">Cuenta para Desembolso</Label>
                        <Select value={form.cuenta_id} onValueChange={(v) => setForm({...form, cuenta_id: v})}>
                            <SelectTrigger className="bg-slate-950 border-slate-800">
                                <SelectValue placeholder="Seleccionar cuenta donde ingresó el dinero" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-950 border-slate-800">
                                {accounts.map((acc: any) => (
                                    <SelectItem key={acc.id} value={acc.id}>{acc.nombre} - S/ {acc.saldo}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-500" disabled={loading}>
                            {loading ? 'Procesando...' : tipoRegistro === 'prestamo' ? 'Registrar Préstamo' : 'Crear Registro'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function NewSocioModal({ isOpen, onClose, accounts, onSuccess }: any) {
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({
        nombre: '',
        capital_aportado: '',
        porcentaje_participacion: '',
        cuenta_id: ''
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await fetch('/api/admin/capital/socios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            })
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            toast.success('Socio registrado exitosamente')
            onSuccess()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold uppercase">Nuevo Socio</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-slate-500">Nombre del Socio</Label>
                        <Input className="bg-slate-950 border-slate-800" required value={form.nombre} onChange={(e) => setForm({...form, nombre: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Aporte Inicial (S/)</Label>
                            <Input type="number" step="0.01" className="bg-slate-950 border-slate-800" value={form.capital_aportado} onChange={(e) => setForm({...form, capital_aportado: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">% Participación</Label>
                            <Input type="number" step="0.01" required className="bg-slate-950 border-slate-800" value={form.porcentaje_participacion} onChange={(e) => setForm({...form, porcentaje_participacion: e.target.value})} />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-slate-500">Cuenta de Entrada</Label>
                        <Select value={form.cuenta_id} onValueChange={(v) => setForm({...form, cuenta_id: v})}>
                            <SelectTrigger className="bg-slate-950 border-slate-800">
                                <SelectValue placeholder="Seleccionar cuenta" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-950 border-slate-800">
                                {accounts.map((acc: any) => (
                                    <SelectItem key={acc.id} value={acc.id}>{acc.nombre} - S/ {acc.saldo}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function EditInversionistaModal({ isOpen, onClose, inversionista, onSuccess }: any) {
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({
        nombre: inversionista.nombre,
        fecha_inicio: inversionista.fecha_inicio,
        duracion_meses: inversionista.duracion_meses.toString(),
        frecuencia_pago: inversionista.frecuencia_pago,
        tasa_interes_mensual: inversionista.tasa_interes_mensual.toString(),
        estado: inversionista.estado
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/capital/inversionistas/${inversionista.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            })
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            toast.success('Inversionista actualizado')
            onSuccess()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold uppercase">Editar Inversionista</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Nombre Completo</Label>
                            <Input className="bg-slate-950 border-slate-800" required value={form.nombre} onChange={(e) => setForm({...form, nombre: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Fecha de Inicio</Label>
                            <Input type="date" className="bg-slate-950 border-slate-800" required value={form.fecha_inicio} onChange={(e) => setForm({...form, fecha_inicio: e.target.value})} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Tasa Mensual (%)</Label>
                            <Input type="number" step="0.1" required className="bg-slate-950 border-slate-800" value={form.tasa_interes_mensual} onChange={(e) => setForm({...form, tasa_interes_mensual: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Frecuencia de Pagos</Label>
                            <Select value={form.frecuencia_pago} onValueChange={(v) => setForm({...form, frecuencia_pago: v})}>
                                <SelectTrigger className="bg-slate-950 border-slate-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-950 border-slate-800">
                                    <SelectItem value="mensual">Mensual</SelectItem>
                                    <SelectItem value="bimestral">Bimestral</SelectItem>
                                    <SelectItem value="trimestral">Trimestral</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Duración (Meses)</Label>
                            <Input type="number" required className="bg-slate-950 border-slate-800" value={form.duracion_meses} onChange={(e) => setForm({...form, duracion_meses: e.target.value})} />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Estado</Label>
                            <Select value={form.estado} onValueChange={(v) => setForm({...form, estado: v})}>
                                <SelectTrigger className="bg-slate-950 border-slate-800">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-950 border-slate-800">
                                    <SelectItem value="activo">Activo</SelectItem>
                                    <SelectItem value="finalizado">Finalizado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-500" disabled={loading}>Guardar Cambios</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

function EditSocioModal({ isOpen, onClose, socio, onSuccess }: any) {
    const [loading, setLoading] = useState(false)
    const [form, setForm] = useState({
        nombre: socio.nombre,
        porcentaje_participacion: socio.porcentaje_participacion.toString()
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        try {
            const res = await fetch(`/api/admin/capital/socios/${socio.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form)
            })
            const data = await res.json()
            if (data.error) throw new Error(data.error)
            toast.success('Socio actualizado')
            onSuccess()
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold uppercase">Editar Socio</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-slate-500">Nombre del Socio</Label>
                        <Input className="bg-slate-950 border-slate-800" required value={form.nombre} onChange={(e) => setForm({...form, nombre: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase text-slate-500">% Participación</Label>
                        <Input type="number" step="0.01" required className="bg-slate-950 border-slate-800" value={form.porcentaje_participacion} onChange={(e) => setForm({...form, porcentaje_participacion: e.target.value})} />
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
                        <Button type="submit" className="bg-blue-600 hover:bg-blue-500" disabled={loading}>Guardar Cambios</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
