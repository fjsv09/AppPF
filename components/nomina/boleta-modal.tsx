'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileText, Calendar, CheckCircle2, AlertCircle, Banknote, User, Receipt, Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface BoletaModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    boleta: any
    trabajador: any
}

export function BoletaModal({ open, onOpenChange, boleta, trabajador }: BoletaModalProps) {
    if (!boleta || !trabajador) return null

    const mesNombre = new Date(2024, boleta.mes - 1, 1).toLocaleString('es-ES', { month: 'long' })
    const esPagada = boleta.estado === 'pagado'
    const neto = parseFloat(boleta.monto_acumulado_pagado || 0)

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px] bg-slate-900 border-slate-800 text-white shadow-2xl p-0 overflow-hidden">
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 border-b border-slate-800 relative">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Receipt className="w-32 h-32 text-white" />
                    </div>
                    
                    <DialogHeader className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                            <Badge className={`${esPagada ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'} capitalize px-3 py-1 font-bold tracking-tight`}>
                                {esPagada ? 'Boleta Pagada' : 'Pago Pendiente'}
                            </Badge>
                            <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase italic">ID: {boleta.id.slice(0,8)}</span>
                        </div>
                        <DialogTitle className="text-2xl font-black text-white flex items-center gap-3">
                            <FileText className="w-6 h-6 text-blue-500" />
                            Boleta de Pago
                        </DialogTitle>
                        <p className="text-slate-400 text-sm font-medium">Recibo oficial correspondiente al mes de <span className="text-white capitalize">{mesNombre} {boleta.anio}</span></p>
                    </DialogHeader>
                </div>

                <div className="p-6 space-y-6">
                    {/* Info Trabajador */}
                    <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50">
                        <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                            <User className="w-6 h-6 text-blue-400" />
                        </div>
                        <div>
                            <p className="text-sm font-black text-white">{trabajador.nombre_completo}</p>
                            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{trabajador.rol || 'Asesor'}</p>
                        </div>
                    </div>

                    {/* Desglose de Conceptos */}
                    <div className="space-y-3">
                        <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mb-4">Conceptos Salariales</p>
                        
                        <div className="space-y-2">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Sueldo Base del Trabajador</span>
                                <span className="text-white font-bold">S/ {parseFloat(boleta.sueldo_base).toFixed(2)}</span>
                            </div>
                            
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Bonos y Comisiones Ganadas</span>
                                <span className="text-emerald-400 font-bold">+ S/ {parseFloat(boleta.bonos || 0).toFixed(2)}</span>
                            </div>

                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400">Descuentos por Inasistencias/Tardanzas</span>
                                <span className="text-rose-400 font-bold">- S/ {parseFloat(boleta.descuentos || 0).toFixed(2)}</span>
                            </div>

                            <div className="flex justify-between items-center text-sm pt-2 border-t border-slate-800">
                                <span className="text-slate-400">Adelantos de Sueldo Solicitados</span>
                                <span className="text-amber-400 font-bold">- S/ {parseFloat(boleta.adelantos || 0).toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Resumen Final */}
                    <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-800/50 to-slate-900 border border-slate-700/50">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Neto a Percibir</span>
                            <span className="text-[10px] text-slate-500 italic">Mes de {mesNombre}</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black text-white">S/ {neto.toFixed(2)}</span>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-2 text-[10px] text-slate-500">
                            {esPagada ? (
                                <><CheckCircle2 className="w-3 h-3 text-emerald-500" /> Liquidación total completada de forma bancarizada.</>
                            ) : (
                                <><AlertCircle className="w-3 h-3 text-amber-500" /> Esta boleta se encuentra en estado de pago parcial o pendiente.</>
                            )}
                        </div>
                    </div>

                    {/* Botón Imprimir (Decorativo por ahora) */}
                    <button className="w-full py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 text-slate-400 text-xs font-bold transition-all flex items-center justify-center gap-2">
                        <Download className="w-4 h-4" />
                        Descargar Constancia en PDF
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
