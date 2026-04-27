'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import * as XLSX from 'xlsx'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table"
import { Progress } from "../ui/progress"
import { toast } from "sonner"
import { FileUp, Download, CheckCircle2, AlertCircle, Loader2, FileSpreadsheet, Users, Banknote, Receipt, ArrowRightLeft, TrendingUp, TrendingDown, Info, Wallet, ChevronDown } from 'lucide-react'
import { Badge } from '../ui/badge'
import { createClient } from '@/utils/supabase/client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'

const GLOBAL_CARTERA_ID = '00000000-0000-0000-0000-000000000000'

interface BulkImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

type ImportTab = 'clientes' | 'prestamos' | 'gastos'

export function BulkImportModal({ isOpen, onClose, onSuccess }: BulkImportModalProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>('clientes')
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState<any[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<any | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Account selector state
  const [cuentas, setCuentas] = useState<any[]>([])
  const [selectedCuentaId, setSelectedCuentaId] = useState<string>('')
  const [loadingCuentas, setLoadingCuentas] = useState(false)

  // Fetch all financial accounts when modal opens
  const fetchCuentas = useCallback(async () => {
    setLoadingCuentas(true)
    try {
      const supabase = createClient()
      const { data: cuentasData } = await supabase
        .from('cuentas_financieras')
        .select('id, nombre, tipo, saldo, cartera_id, carteras(nombre)')
        .eq('cartera_id', GLOBAL_CARTERA_ID)
        .order('nombre')
      setCuentas(cuentasData || [])
      // Auto-select the first account that contains 'efectivo' in its name
      const defaultCuenta = cuentasData?.find((c: any) => c.nombre?.toLowerCase().includes('efectivo'))
        || cuentasData?.[0]
      if (defaultCuenta) setSelectedCuentaId(defaultCuenta.id)
    } catch (err) {
      console.error('Error fetching accounts:', err)
    } finally {
      setLoadingCuentas(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) fetchCuentas()
  }, [isOpen, fetchCuentas])

  const selectedCuenta = useMemo(() => cuentas.find(c => c.id === selectedCuentaId), [cuentas, selectedCuentaId])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      parseExcel(selectedFile)
    }
  }

  const parseExcel = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const bstr = e.target?.result
      const wb = XLSX.read(bstr, { type: 'binary', cellDates: true })
      const wsname = wb.SheetNames[0]
      const ws = wb.Sheets[wsname]
      const jsonData: any[] = XLSX.utils.sheet_to_json(ws)
      
      const formattedData = jsonData.map(row => {
          const newRow = { ...row }
          for (const key in newRow) {
              if (newRow[key] instanceof Date) {
                  newRow[key] = newRow[key].toISOString().split('T')[0]
              }
          }
          return newRow
      })
      
      setData(formattedData)
    }
    reader.readAsBinaryString(file)
  }

  // ===== TEMPLATES =====
  const downloadTemplate = () => {
    let templateData: any[] = []
    let sheetName = ''
    let fileName = ''

    switch (activeTab) {
      case 'clientes':
        templateData = [{
          dni: '12345678',
          nombres: 'Juan Perez',
          telefono: '987654321',
          direccion: 'Av. Principal 123',
          referencia: 'Frente al parque',
          sector: 'Centro',
          giro_negocio: 'Bodega',
          fuentes_ingresos: 'Venta de abarrotes',
          ingresos_mensuales: 2500,
          asesor_nombre: 'Franklin Ferre'
        }]
        sheetName = 'Clientes Migración'
        fileName = 'plantilla_migracion_clientes.xlsx'
        break

      case 'prestamos':
        templateData = [{
          dni_cliente: '12345678',
          monto: 1000,
          interes: 20,
          cuotas: 30,
          modalidad: 'diario',
          fecha_inicio: '2025-01-15',
          ya_pagado: 'NO',
          monto_abonado: 350,
          interes_extra: 50
        }]
        sheetName = 'Préstamos Migración'
        fileName = 'plantilla_migracion_prestamos.xlsx'
        break

      case 'gastos':
        templateData = [{
          descripcion: 'Pago de luz oficina',
          monto: 150,
          categoria: 'Servicios',
          registrado_por_nombre: 'Franklin Ferre',
          fecha_registro: '2025-02-10'
        }]
        sheetName = 'Gastos Migración'
        fileName = 'plantilla_migracion_gastos.xlsx'
        break
    }

    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, fileName)
    toast.info(`Descargando plantilla: ${fileName}`)
  }

  // ===== CALCULATIONS =====
  const loanSummary = useMemo(() => {
    if (activeTab !== 'prestamos') return null
    let totalDesembolsos = 0
    let totalIngresos = 0
    let pagados = 0
    let activos = 0

    data.forEach(l => {
      const monto = parseFloat(l.monto || l.Monto || 0)
      const interes = parseFloat(l.interes || l.Interes || 0)
      const yaPagado = (l.ya_pagado || l.YaPagado || 'NO').toString().toUpperCase().trim()
      const esPagado = yaPagado === 'SI' || yaPagado === 'SÍ' || yaPagado === 'YES'
      const montoAbonado = parseFloat(l.monto_abonado || l.MontoAbonado || 0)
      const interesExtra = parseFloat(l.interes_extra || l.InteresExtra || l.extra || 0)

      if (monto > 0) {
        totalDesembolsos += monto
        if (esPagado) {
          totalIngresos += monto * (1 + interes / 100)
          pagados++
        } else {
          if (montoAbonado > 0) totalIngresos += montoAbonado
          activos++
        }
        totalIngresos += interesExtra
      }
    })

    return { totalDesembolsos, totalIngresos, neto: totalDesembolsos - totalIngresos, pagados, activos }
  }, [data, activeTab])

  const totalGastos = useMemo(() => {
    if (activeTab !== 'gastos') return 0
    return data.reduce((acc, e) => acc + parseFloat(e.monto || e.Monto || 0), 0)
  }, [data, activeTab])

  const validationErrors = useMemo(() => {
    if (data.length === 0) return []
    return data.map(row => {
      const errors: string[] = []
      if (activeTab === 'prestamos') {
        const dni = (row.dni_cliente || row.DNI || row.dni || '').toString().trim()
        const monto = parseFloat(row.monto || row.Monto || 0)
        const cuotas = parseInt(row.cuotas || row.Cuotas || 0)
        const interes = parseFloat(row.interes || row.Interes || 0)

        if (!dni) errors.push('DNI faltante')
        if (isNaN(monto) || monto <= 0) errors.push('Monto <= 0')
        if (isNaN(cuotas) || cuotas <= 0) errors.push('Cuotas <= 0')
        if (monto > 0 && cuotas > 0) {
          const montoTotal = monto * (1 + (interes / 100))
          if ((montoTotal / cuotas) < 0.01) errors.push('Cuota $0.00')
        }
      } else if (activeTab === 'clientes') {
        const dni = (row.dni || row.DNI || '').toString().trim()
        const nombres = (row.nombres || row.NOMBRES || row.Nombre || '').toString().trim()
        if (!dni) errors.push('DNI faltante')
        if (!nombres) errors.push('Nombre faltante')
      } else if (activeTab === 'gastos') {
        const desc = (row.descripcion || row.Descripcion || '').toString().trim()
        const monto = parseFloat(row.monto || row.Monto || 0)
        if (!desc) errors.push('Descripción faltante')
        if (isNaN(monto) || monto <= 0) errors.push('Monto <= 0')
      }
      return errors
    })
  }, [data, activeTab])

  const hasValidationErrors = useMemo(() => validationErrors.some(e => e.length > 0), [validationErrors])
  const errorCount = useMemo(() => validationErrors.filter(e => e.length > 0).length, [validationErrors])

  // ===== UPLOAD =====
  const handleUpload = async () => {
    if (data.length === 0) return
    setIsUploading(true)
    setProgress(10)

    try {
      let endpoint = ''
      let body: any = {}

      switch (activeTab) {
        case 'clientes':
          endpoint = '/api/migracion/clientes'
          body = { clients: data }
          break
        case 'prestamos':
          endpoint = '/api/migracion/prestamos'
          body = { loans: data, cuenta_id: selectedCuentaId || undefined }
          break
        case 'gastos':
          endpoint = '/api/migracion/gastos'
          body = { expenses: data, cuenta_id: selectedCuentaId || undefined }
          break
      }

      setProgress(30)

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      setProgress(90)
      const res = await response.json()

      if (!response.ok) throw new Error(res.error || 'Error al importar')

      setResults(res)
      toast.success(`Migración completada: ${res.success} registros procesados.`)
      if (onSuccess) onSuccess()

    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsUploading(false)
      setProgress(100)
    }
  }

  const reset = () => {
    setFile(null)
    setData([])
    setResults(null)
    setProgress(0)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const switchTab = (tab: ImportTab) => {
    reset()
    setActiveTab(tab)
  }

  // ===== TAB CONFIG =====
  const tabs: { id: ImportTab; label: string; icon: React.ReactNode; accent: string; desc: string }[] = [
    { id: 'clientes', label: 'Clientes', icon: <Users className="w-4 h-4" />, accent: 'blue', desc: 'Solo registro de cartera' },
    { id: 'prestamos', label: 'Préstamos', icon: <Banknote className="w-4 h-4" />, accent: 'emerald', desc: 'Con movimientos financieros' },
    { id: 'gastos', label: 'Gastos', icon: <Receipt className="w-4 h-4" />, accent: 'amber', desc: 'Descuenta de cuenta seleccionada' },
  ]

  const currentAccent = tabs.find(t => t.id === activeTab)?.accent || 'blue'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
        if (!open) {
            onClose()
            setTimeout(reset, 300)
        }
    }}>
      <DialogContent className="max-w-6xl bg-slate-900 border-slate-800 text-slate-100 max-h-[95vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/20">
              <ArrowRightLeft className="w-5 h-5 text-blue-400" />
            </div>
            Migración de Datos — Sistema Anterior
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Importa clientes, préstamos históricos y gastos desde archivos Excel.
          </DialogDescription>
        </DialogHeader>

        {/* TABS */}
        <div className="px-6 pb-2">
          <div className="flex gap-2 p-1 bg-slate-950/50 rounded-xl border border-slate-800/50">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200",
                  activeTab === tab.id
                    ? `bg-${tab.accent}-500/15 text-${tab.accent}-400 border border-${tab.accent}-500/30 shadow-lg shadow-${tab.accent}-500/5`
                    : "text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 border border-transparent"
                )}
                style={activeTab === tab.id ? {
                  backgroundColor: tab.accent === 'blue' ? 'rgba(59,130,246,0.15)' :
                                    tab.accent === 'emerald' ? 'rgba(16,185,129,0.15)' :
                                    'rgba(245,158,11,0.15)',
                  color: tab.accent === 'blue' ? '#60a5fa' :
                          tab.accent === 'emerald' ? '#34d399' :
                          '#fbbf24',
                  borderColor: tab.accent === 'blue' ? 'rgba(59,130,246,0.3)' :
                                tab.accent === 'emerald' ? 'rgba(16,185,129,0.3)' :
                                'rgba(245,158,11,0.3)',
                } : {}}
              >
                {tab.icon}
                <span className="hidden sm:inline">{tab.label}</span>
                {data.length > 0 && activeTab === tab.id && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-1 border-current/30 bg-current/10">{data.length}</Badge>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 space-y-4 px-6">
          {/* Step: File Upload */}
          {!results && (
            <div className="space-y-4">
              {/* File Upload Card */}
              <div className="p-5 rounded-2xl border border-dashed border-slate-800 bg-slate-950/50 flex flex-col md:flex-row items-center gap-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="p-2.5 rounded-xl bg-slate-800/50 shrink-0">
                    <FileSpreadsheet className="w-6 h-6 text-slate-400" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-300">Archivo Excel</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">{tabs.find(t => t.id === activeTab)?.desc}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button 
                      variant="outline" 
                      size="sm" 
                      className="border-slate-700 text-slate-400 hover:text-white h-9"
                      onClick={downloadTemplate}
                  >
                    <Download className="w-4 h-4 mr-1.5" /> Plantilla
                  </Button>
                  <label className="cursor-pointer">
                    <Input 
                      type="file" 
                      className="hidden" 
                      accept=".xlsx,.xls,.csv" 
                      onChange={handleFileChange}
                      ref={fileInputRef}
                    />
                    <div className={cn(
                      "h-9 px-4 flex items-center justify-center rounded-lg font-bold text-sm transition-colors text-white",
                      currentAccent === 'blue' ? 'bg-blue-600 hover:bg-blue-500' :
                      currentAccent === 'emerald' ? 'bg-emerald-600 hover:bg-emerald-500' :
                      'bg-amber-600 hover:bg-amber-500'
                    )}>
                      <FileUp className="w-4 h-4 mr-1.5" />
                      {file ? file.name : "Subir Archivo"}
                    </div>
                  </label>
                </div>
              </div>

              {/* ===== ACCOUNT SELECTOR (Préstamos & Gastos only) ===== */}
              {(activeTab === 'prestamos' || activeTab === 'gastos') && (
                <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Wallet className="w-4 h-4 text-blue-400" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cuenta Financiera Destino</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                    <Select value={selectedCuentaId} onValueChange={setSelectedCuentaId} disabled={loadingCuentas}>
                      <SelectTrigger className="bg-slate-900/60 border-slate-700 text-white h-10 rounded-lg text-xs focus:ring-1 focus:ring-blue-500/40 transition-all w-full sm:w-auto sm:min-w-[320px]">
                        {loadingCuentas ? (
                          <span className="flex items-center gap-2 text-slate-500">
                            <Loader2 className="w-3 h-3 animate-spin" /> Cargando cuentas...
                          </span>
                        ) : (
                          <SelectValue placeholder="Seleccionar cuenta" />
                        )}
                      </SelectTrigger>
                      <SelectContent className="bg-slate-950 border-slate-800 text-white rounded-lg backdrop-blur-xl max-h-64">
                        {cuentas.map((c) => (
                          <SelectItem key={c.id} value={c.id} className="text-xs focus:bg-blue-500/10">
                            <div className="flex items-center gap-2">
                              <span className="font-bold">{c.nombre}</span>
                              <span className="text-slate-500">({c.tipo})</span>
                              <span className="text-emerald-400 font-mono text-[10px]">S/ {parseFloat(c.saldo || 0).toFixed(2)}</span>
                              {c.carteras?.nombre && (
                                <span className="text-[9px] text-slate-600">— {c.carteras.nombre}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedCuenta && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-[9px] h-5 px-2 bg-emerald-500/10 text-emerald-400 border-emerald-500/30 font-mono">
                          Saldo: S/ {parseFloat(selectedCuenta.saldo || 0).toFixed(2)}
                        </Badge>
                        {selectedCuenta.carteras?.nombre && (
                          <Badge variant="outline" className="text-[9px] h-5 px-2 bg-blue-500/10 text-blue-400 border-blue-500/30">
                            {selectedCuenta.carteras.nombre}
                          </Badge>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-[9px] text-slate-600 mt-2">Los egresos e ingresos de la migración se cargarán a esta cuenta.</p>
                </div>
              )}

              {/* ===== LOAN FINANCIAL SUMMARY ===== */}
              {activeTab === 'prestamos' && data.length > 0 && loanSummary && (
                <div className={cn(
                  "p-4 rounded-xl border",
                  loanSummary.neto > 0 ? "bg-amber-500/5 border-amber-500/20" : "bg-emerald-500/5 border-emerald-500/20"
                )}>
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-slate-400" />
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resumen Contable del Lote</p>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="p-3 rounded-lg bg-slate-950/50 border border-slate-800">
                      <p className="text-[9px] text-slate-500 font-bold uppercase">Registros</p>
                      <p className="text-lg font-black text-white">{data.length}</p>
                      <div className="flex gap-2 mt-1">
                        <span className="text-[9px] text-emerald-400">✅ {loanSummary.pagados} pagados</span>
                        <span className="text-[9px] text-blue-400">🔄 {loanSummary.activos} activos</span>
                      </div>
                    </div>
                    <div className="p-3 rounded-lg bg-red-500/5 border border-red-500/20">
                      <div className="flex items-center gap-1">
                        <TrendingDown className="w-3 h-3 text-red-400" />
                        <p className="text-[9px] text-red-400 font-bold uppercase">Desembolsos</p>
                      </div>
                      <p className="text-lg font-black text-red-400">${loanSummary.totalDesembolsos.toFixed(2)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                      <div className="flex items-center gap-1">
                        <TrendingUp className="w-3 h-3 text-emerald-400" />
                        <p className="text-[9px] text-emerald-400 font-bold uppercase">Ingresos Pagos</p>
                      </div>
                      <p className="text-lg font-black text-emerald-400">${loanSummary.totalIngresos.toFixed(2)}</p>
                    </div>
                    <div className={cn("p-3 rounded-lg border col-span-2 md:col-span-2",
                      loanSummary.neto > 0 ? "bg-amber-500/10 border-amber-500/30" : "bg-emerald-500/10 border-emerald-500/30"
                    )}>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Neto Requerido</p>
                      <p className={cn("text-xl font-black", loanSummary.neto > 0 ? "text-amber-400" : "text-emerald-400")}>
                        ${loanSummary.neto.toFixed(2)}
                      </p>
                      <p className="text-[9px] text-slate-500 mt-0.5">
                        {loanSummary.neto <= 0 ? "✅ No requiere saldo adicional (más ingresos que egresos)" : `⚠️ Se descontará de ${selectedCuenta?.nombre || 'la cuenta seleccionada'}`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* ===== EXPENSE SUMMARY ===== */}
              {activeTab === 'gastos' && data.length > 0 && (
                <div className="p-4 rounded-xl border bg-amber-500/5 border-amber-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-500/20">
                        <Receipt className="w-5 h-5 text-amber-400" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total a Descontar de {selectedCuenta?.nombre || 'Cuenta Seleccionada'}</p>
                        <h4 className="text-lg font-black text-amber-400">${totalGastos.toFixed(2)}</h4>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[10px] bg-slate-800/50 text-slate-400 border-slate-700">
                      {data.length} gastos
                    </Badge>
                  </div>
                </div>
              )}

              {/* ===== CLIENT SUMMARY ===== */}
              {activeTab === 'clientes' && data.length > 0 && (
                <div className="p-4 rounded-xl border bg-blue-500/5 border-blue-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/20">
                        <Users className="w-5 h-5 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Clientes a Importar</p>
                        <h4 className="text-lg font-black text-blue-400">{data.length} registros</h4>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-500">Solo registro de cartera — Sin préstamo ni desembolso</p>
                  </div>
                </div>
              )}

              {/* ===== VALIDATION WARNING ===== */}
              {data.length > 0 && hasValidationErrors && (
                <div className="p-4 rounded-xl border bg-red-500/10 border-red-500/30 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-red-500/20">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-red-400">Se detectaron {errorCount} registros con errores de formato.</p>
                    <p className="text-[10px] text-red-400/70">Revise la tabla de previsualización para corregir los datos antes de importar.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ===== RESULTS ===== */}
          {results && (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
               <div className={cn("grid gap-3", 
                 activeTab === 'prestamos' ? "grid-cols-2 md:grid-cols-5" : "grid-cols-3"
               )}>
                 <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
                    <p className="text-[10px] text-emerald-500/70 font-bold uppercase tracking-tight">Exitosos</p>
                    <h3 className="text-2xl font-black text-emerald-400">{results.success}</h3>
                 </div>
                 <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-center">
                    <p className="text-[10px] text-amber-500/70 font-bold uppercase tracking-tight">Omitidos</p>
                    <h3 className="text-2xl font-black text-amber-400">{results.skipped || 0}</h3>
                 </div>
                 <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-center">
                    <p className="text-[10px] text-red-500/70 font-bold uppercase tracking-tight">Errores</p>
                    <h3 className="text-2xl font-black text-red-400">{results.errors?.length || 0}</h3>
                 </div>
                 {activeTab === 'prestamos' && (
                   <>
                     <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-center">
                        <p className="text-[10px] text-red-400/70 font-bold uppercase tracking-tight">Desembolsado</p>
                        <h3 className="text-lg font-black text-red-400">${(results.totalDesembolsado || 0).toFixed(2)}</h3>
                     </div>
                     <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
                        <p className="text-[10px] text-emerald-400/70 font-bold uppercase tracking-tight">Ingresado</p>
                        <h3 className="text-lg font-black text-emerald-400">${(results.totalIngresado || 0).toFixed(2)}</h3>
                     </div>
                   </>
                 )}
                 {activeTab === 'gastos' && results.totalDescontado > 0 && (
                   <div className="col-span-3 p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-center">
                      <p className="text-[10px] text-amber-400/70 font-bold uppercase tracking-tight">Total Descontado de {selectedCuenta?.nombre || 'Cuenta'}</p>
                      <h3 className="text-lg font-black text-amber-400">${results.totalDescontado.toFixed(2)}</h3>
                   </div>
                 )}
               </div>

               {results.errors?.length > 0 && (
                 <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <h5 className="text-xs font-bold text-slate-400 mb-2 uppercase">Detalle de Errores</h5>
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
                       {results.errors.map((err: string, i: number) => (
                         <p key={i} className="text-[10px] text-red-400 flex items-start gap-2">
                            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                            {err}
                         </p>
                       ))}
                    </div>
                 </div>
               )}

               {results.skippedData?.length > 0 && (
                 <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                       <Info className="w-4 h-4 text-amber-500" />
                       <h5 className="text-xs font-bold text-slate-400 uppercase">Registros Omitidos</h5>
                    </div>
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                       {results.skippedData.map((skip: any, i: number) => (
                         <div key={i} className="text-[10px] bg-slate-900/50 p-2 rounded border border-slate-800 flex justify-between items-start gap-4">
                            <div>
                               <span className="text-blue-400 font-mono font-bold mr-2">{skip.dni}</span>
                               <span className="text-slate-200">{skip.nombres}</span>
                            </div>
                            <span className="text-amber-500/80 italic shrink-0">{skip.motivo}</span>
                         </div>
                       ))}
                    </div>
                 </div>
               )}
            </div>
          )}

          {/* ===== PREVIEW TABLE ===== */}
          {data.length > 0 && !results && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Previsualización ({data.length} registros)</h4>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 overflow-hidden">
                <div className="overflow-x-auto">
                    {/* ===== CLIENTES TABLE ===== */}
                    {activeTab === 'clientes' && (
                      <Table className="min-w-[1000px]">
                        <TableHeader className="bg-slate-900/50">
                          <TableRow className="border-slate-800 hover:bg-transparent">
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">DNI</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Nombre</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Teléfono</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Dirección</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Referencia</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Sector</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Negocio</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Estado</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.slice(0, 50).map((row, i) => {
                            const errors = validationErrors[i] || []
                            return (
                              <TableRow key={i} className={cn("border-slate-800 hover:bg-slate-900/30", errors.length > 0 && "bg-red-500/5")}>
                                <TableCell className="text-xs font-mono text-blue-400">{row.dni || row.DNI || '---'}</TableCell>
                                <TableCell className="text-xs font-bold text-slate-200">{row.nombres || row.NOMBRES || row.Nombre || '---'}</TableCell>
                                <TableCell className="text-xs text-slate-500">{row.telefono || row.Telefono || '---'}</TableCell>
                                <TableCell className="text-xs text-slate-600 truncate max-w-[150px]">{row.direccion || row.Direccion || '---'}</TableCell>
                                <TableCell className="text-xs text-slate-600 truncate max-w-[120px]">{row.referencia || row.Referencia || '---'}</TableCell>
                                <TableCell className="text-xs text-purple-400 uppercase">{row.sector || row.Sector || '---'}</TableCell>
                                <TableCell className="text-xs text-slate-500">{row.giro_negocio || row.GiroNegocio || '---'}</TableCell>
                                <TableCell>
                                  {errors.length > 0 ? (
                                    <Badge variant="outline" className="text-[9px] h-5 px-2 bg-red-500/10 text-red-400 border-red-500/30">
                                      {errors.join(', ')}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[9px] h-5 px-2 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                      Listo
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    )}

                    {/* ===== PRESTAMOS TABLE ===== */}
                    {activeTab === 'prestamos' && (
                      <Table className="min-w-[1200px]">
                        <TableHeader className="bg-slate-900/50">
                          <TableRow className="border-slate-800 hover:bg-transparent">
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">DNI</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Monto</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Interés</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Cuotas</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Modalidad</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Fecha Inicio</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Estado</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Abonado</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Int. Extra</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Validación</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.slice(0, 50).map((row, i) => {
                            const errors = validationErrors[i] || []
                            const yaPagado = (row.ya_pagado || row.YaPagado || 'NO').toString().toUpperCase().trim()
                            const esPagado = yaPagado === 'SI' || yaPagado === 'SÍ' || yaPagado === 'YES'
                            return (
                              <TableRow key={i} className={cn("border-slate-800 hover:bg-slate-900/30", errors.length > 0 && "bg-red-500/5")}>
                                <TableCell className="text-xs font-mono text-blue-400">{row.dni_cliente || row.DNI || row.dni || '---'}</TableCell>
                                <TableCell className="text-xs text-emerald-400 font-black">${parseFloat(row.monto || row.Monto || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-xs text-slate-400">{row.interes || row.Interes || '0'}%</TableCell>
                                <TableCell className="text-xs text-slate-400 font-bold">{row.cuotas || row.Cuotas || '0'}</TableCell>
                                <TableCell className="text-xs text-slate-400 uppercase">{row.modalidad || row.Modalidad || '---'}</TableCell>
                                <TableCell className="text-xs text-slate-500 font-mono">{row.fecha_inicio || row.FechaInicio || '---'}</TableCell>
                                <TableCell>
                                  <Badge className={cn(
                                    "text-[9px] h-5 px-2 font-black border",
                                    esPagado 
                                      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" 
                                      : "bg-blue-500/15 text-blue-400 border-blue-500/30"
                                  )}>
                                    {esPagado ? '✅ PAGADO' : '🔄 ACTIVO'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-xs text-amber-400 font-bold">${parseFloat(row.monto_abonado || row.MontoAbonado || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-xs text-blue-400 font-bold">${parseFloat(row.interes_extra || row.InteresExtra || row.extra || 0).toFixed(2)}</TableCell>
                                <TableCell>
                                  {errors.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                      {errors.map((err, idx) => (
                                        <Badge key={idx} variant="outline" className="text-[8px] h-4 px-1 bg-red-500/10 text-red-400 border-red-500/30">
                                          {err}
                                        </Badge>
                                      ))}
                                    </div>
                                  ) : (
                                    <Badge variant="outline" className="text-[9px] h-5 px-2 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                      Válido
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    )}

                    {/* ===== GASTOS TABLE ===== */}
                    {activeTab === 'gastos' && (
                      <Table className="min-w-[800px]">
                        <TableHeader className="bg-slate-900/50">
                          <TableRow className="border-slate-800 hover:bg-transparent">
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Descripción</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Monto</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Categoría</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Registrado Por</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Fecha</TableHead>
                            <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Validación</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.slice(0, 50).map((row, i) => {
                            const errors = validationErrors[i] || []
                            return (
                              <TableRow key={i} className={cn("border-slate-800 hover:bg-slate-900/30", errors.length > 0 && "bg-red-500/5")}>
                                <TableCell className="text-xs text-slate-200 font-medium truncate max-w-[200px]">{row.descripcion || row.Descripcion || '---'}</TableCell>
                                <TableCell className="text-xs text-amber-400 font-black">${parseFloat(row.monto || row.Monto || 0).toFixed(2)}</TableCell>
                                <TableCell className="text-xs text-purple-400">{row.categoria || row.Categoria || '---'}</TableCell>
                                <TableCell className="text-xs text-slate-300">{row.registrado_por_nombre || row.registrado_por || row.RegistradoPor || '---'}</TableCell>
                                <TableCell className="text-xs text-slate-500 font-mono">{row.fecha_registro || row.FechaRegistro || row.fecha || '---'}</TableCell>
                                <TableCell>
                                  {errors.length > 0 ? (
                                    <Badge variant="outline" className="text-[9px] h-5 px-2 bg-red-500/10 text-red-400 border-red-500/30">
                                      {errors.join(', ')}
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-[9px] h-5 px-2 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                      Válido
                                    </Badge>
                                  )}
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    )}

                    {/* Overflow indicator */}
                    {data.length > 10 && (
                      <div className="text-center py-3 text-[10px] text-slate-600 font-bold italic bg-slate-900/20 border-t border-slate-800">
                        ... y {data.length - 50} registros adicionales detectados. (Mostrando primeros 50)
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}

          {/* Progress */}
          {isUploading && (
            <div className="pt-4 space-y-3">
              <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest" style={{ color: currentAccent === 'blue' ? '#60a5fa' : currentAccent === 'emerald' ? '#34d399' : '#fbbf24' }}>
                <span>Procesando migración de {activeTab}...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2 bg-slate-800" />
              <p className="text-[10px] text-slate-500 italic text-center">
                {activeTab === 'clientes' && 'Creando registros de prospectos y clientes...'}
                {activeTab === 'prestamos' && 'Creando préstamos, cronogramas, movimientos financieros...'}
                {activeTab === 'gastos' && 'Registrando gastos y actualizando saldos...'}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-slate-800 p-6 bg-slate-950/20 gap-2">
          <Button 
            variant="outline" 
            onClick={results ? reset : onClose} 
            className="border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800"
            disabled={isUploading}
          >
            {results ? "Importar Otro Lote" : "Cancelar"}
          </Button>
          {!results && (
            <Button 
                onClick={handleUpload} 
                disabled={data.length === 0 || isUploading}
                className={cn(
                  "text-white min-w-[200px] shadow-lg font-bold",
                  currentAccent === 'blue' && "bg-blue-600 hover:bg-blue-500 shadow-blue-900/20",
                  currentAccent === 'emerald' && "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20",
                  currentAccent === 'amber' && "bg-amber-600 hover:bg-amber-500 shadow-amber-900/20",
                )}
            >
                {isUploading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando...</>
                ) : (
                    <><CheckCircle2 className="w-4 h-4 mr-2" /> Iniciar Migración ({data.length || 0})</>
                )}
            </Button>
          )}
          {results && (
             <Button onClick={onClose} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
                Finalizar y Cerrar
             </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
