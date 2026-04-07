'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
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
import { FileUp, Download, CheckCircle2, AlertCircle, Loader2, FileSpreadsheet, Wallet, Info } from 'lucide-react'
import { Badge } from '../ui/badge'
import { createClient } from '../../utils/supabase/client'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "../ui/select"

interface BulkImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function BulkImportModal({ isOpen, onClose, onSuccess }: BulkImportModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [data, setData] = useState<any[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<{ success: number, skipped: number, errors: string[] } | null>(null)
  
  const [accounts, setAccounts] = useState<any[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  // Fetch accounts on open
  useEffect(() => {
    if (isOpen) {
        fetchAccounts()
    }
  }, [isOpen])

  const fetchAccounts = async () => {
    setIsLoadingAccounts(true)
    try {
        // Obtenemos todas las cuentas disponibles
        const { data, error } = await supabase
            .from('cuentas_financieras')
            .select('id, nombre, saldo, tipo')
            .order('nombre')
        
        if (error) throw error
        setAccounts(data || [])
    } catch (err: any) {
        console.error("Error fetchAccounts:", err)
        toast.error("Error cargando cuentas financieras")
    } finally {
        setIsLoadingAccounts(false)
    }
  }

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
      
      // Formatear fechas si vienen como objeto Date de Excel
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

  // Calculate totals
  const totalImportMonto = useMemo(() => {
      return data.reduce((acc, row) => acc + (parseFloat(row.monto_solicitado || row.monto || row.Monto || 0)), 0)
  }, [data])

  const selectedAccount = useMemo(() => {
      return accounts.find(a => a.id === selectedAccountId)
  }, [selectedAccountId, accounts])

  const isBalanceInsufficient = selectedAccount && totalImportMonto > selectedAccount.saldo

  const downloadTemplate = () => {
    const templateData = [
      {
        dni: '12345678',
        nombres: 'Juan Perez',
        telefono: '987654321',
        direccion: 'Av. Principal 123, Lima',
        referencia: 'Frente al parque',
        sector: 'Centro',
        giro_negocio: 'Bodega',
        fuentes_ingresos: 'Venta de abarrotes',
        ingresos_mensuales: 2500,
        motivo_prestamo: 'Ampliación de stock',
        monto_solicitado: 1000,
        interes: 20,
        cuotas: 30,
        modalidad: 'diario',
        fecha_inicio: new Date().toISOString().split('T')[0]
      }
    ]

    const ws = XLSX.utils.json_to_sheet(templateData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla Importacion")
    XLSX.writeFile(wb, "plantilla_importacion_prestamos.xlsx")
    toast.info("Descargando plantilla Excel...")
  }

  const handleUpload = async () => {
    if (data.length === 0 || !selectedAccountId) return
    if (isBalanceInsufficient) {
        toast.error("Saldo insuficiente en la cuenta seleccionada para completar el lote.")
        return
    }

    setIsUploading(true)
    setProgress(5)

    try {
      const response = await fetch('/api/clientes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            clients: data,
            cuentaOrigenId: selectedAccountId 
        })
      })

      setProgress(90)
      const res = await response.json()

      if (!response.ok) throw new Error(res.error || 'Error al importar')

      setResults({
        success: res.success,
        skipped: res.skipped,
        errors: res.errors
      })
      
      toast.success(`Importación terminada: ${res.success} préstamos creados.`)
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
    setSelectedAccountId('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

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
            <FileUp className="w-6 h-6 text-blue-400" />
            Importación Masiva: Aprobación y Desembolso
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Carga clientes y aprueba sus préstamos automáticamente. El dinero se deducirá de la cuenta financiera seleccionada.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-6 px-6">
          {/* Step 1: Account Selection & File Upload */}
          {!results && (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-4">
                {/* Account Selection */}
                <div className="p-6 rounded-2xl border border-slate-800 bg-slate-950/50 space-y-4">
                  <div className="flex items-center gap-2 text-blue-400">
                    <Wallet className="w-5 h-5" />
                    <h4 className="font-bold text-sm uppercase tracking-wider">1. Cuenta de Desembolso</h4>
                  </div>
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger className="bg-slate-900 border-slate-700 text-white h-12">
                      <SelectValue placeholder="Seleccione cuenta de origen..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-slate-800 text-white">
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id} className="focus:bg-slate-800 focus:text-white">
                             <div className="flex justify-between w-full gap-8">
                                <span>{acc.nombre}</span>
                                <span className="font-mono text-emerald-400 font-bold">${acc.saldo.toFixed(2)}</span>
                             </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedAccount && (
                    <div className="flex justify-between items-center px-2 py-1 rounded bg-slate-900/50 border border-slate-800">
                        <span className="text-xs text-slate-500">Saldo Disponible:</span>
                        <span className="text-sm font-black text-emerald-400">${selectedAccount.saldo.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* File Upload */}
                <div className="p-6 rounded-2xl border border-dashed border-slate-800 bg-slate-950/50 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="flex items-center gap-2 text-emerald-400">
                    <FileSpreadsheet className="w-5 h-5" />
                    <h4 className="font-bold text-sm uppercase tracking-wider">2. Archivo Excel</h4>
                  </div>
                  <div className="flex gap-2 w-full">
                    <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 border-slate-700 text-slate-400 hover:text-white h-10"
                        onClick={downloadTemplate}
                    >
                      <Download className="w-4 h-4 mr-2" /> Plantilla
                    </Button>
                    <label className="flex-[2] cursor-pointer">
                      <Input 
                        type="file" 
                        className="hidden" 
                        accept=".xlsx,.xls,.csv" 
                        onChange={handleFileChange}
                        ref={fileInputRef}
                      />
                      <div className="bg-emerald-600 hover:bg-emerald-500 text-white h-10 flex items-center justify-center rounded-lg font-bold text-sm transition-colors">
                        {file ? file.name : "Subir Archivo"}
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              {/* Totals Banner */}
              {data.length > 0 && (
                <div className={`p-4 rounded-xl border flex items-center justify-between ${isBalanceInsufficient ? 'bg-red-500/10 border-red-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${isBalanceInsufficient ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
                            {isBalanceInsufficient ? <AlertCircle className="w-6 h-6 text-red-400" /> : <Info className="w-6 h-6 text-blue-400" />}
                        </div>
                        <div>
                            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Resumen de Importación</p>
                            <h4 className="text-lg font-black text-white">Total a Desembolsar: <span className={isBalanceInsufficient ? 'text-red-400' : 'text-emerald-400'}>${totalImportMonto.toFixed(2)}</span></h4>
                        </div>
                    </div>
                    {isBalanceInsufficient && (
                        <Badge variant="destructive" className="h-8 px-4 text-xs font-black animate-pulse">
                            BLOQUEADO: SALDO INSUFICIENTE
                        </Badge>
                    )}
                </div>
              )}
            </div>
          )}

          {/* Results Summary */}
          {results && (
            <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
               <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-center">
                     <p className="text-[10px] text-emerald-500/70 font-bold uppercase tracking-tight">Préstamos Creados</p>
                     <h3 className="text-2xl font-black text-emerald-400">{results.success}</h3>
                  </div>
                  <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/20 text-center">
                     <p className="text-[10px] text-amber-500/70 font-bold uppercase tracking-tight">Omitidos (DNI Duplicado)</p>
                     <h3 className="text-2xl font-black text-amber-400">{results.skipped}</h3>
                  </div>
                  <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-center">
                     <p className="text-[10px] text-red-500/70 font-bold uppercase tracking-tight">Errores</p>
                     <h3 className="text-2xl font-black text-red-400">{results.errors.length}</h3>
                  </div>
               </div>

               {results.errors.length > 0 && (
                 <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <h5 className="text-xs font-bold text-slate-400 mb-2 uppercase">Detalle de Errores</h5>
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-2">
                       {results.errors.map((err, i) => (
                         <p key={i} className="text-[10px] text-red-400 flex items-start gap-2">
                            <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                            {err}
                         </p>
                       ))}
                    </div>
                 </div>
               )}
            </div>
          )}

          {/* Preview Table */}
          {data.length > 0 && !results && (
            <div className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Previsualización del Lote ({data.length} registros)</h4>
                <div className="flex gap-2">
                    <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">Identidad</Badge>
                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-400 border-amber-500/20">Negocio</Badge>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Préstamo</Badge>
                </div>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 overflow-hidden">
                <div className="overflow-x-auto">
                    <Table className="min-w-[1800px]">
                      <TableHeader className="bg-slate-900/50">
                        <TableRow className="border-slate-800 hover:bg-transparent">
                          {/* Datos de Identidad */}
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">DNI</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Nombre</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Teléfono</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Dirección</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Referencia</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Sector</TableHead>

                          {/* Datos de Negocio */}
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Negocio</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Fuentes</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Ingresos</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Motivo</TableHead>
                          
                          {/* Datos Financieros */}
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Monto</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Cuotas</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Interés</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Modalidad</TableHead>
                          <TableHead className="text-[10px] font-bold text-slate-500 uppercase">Inicio</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.slice(0, 10).map((row, i) => (
                          <TableRow key={i} className="border-slate-800 hover:bg-slate-900/30">
                            {/* Identidad */}
                            <TableCell className="text-xs font-mono">{row.dni || row.DNI || '---'}</TableCell>
                            <TableCell className="text-xs font-bold text-slate-300">{row.nombres || row.NOMBRES || row.Nombre || '---'}</TableCell>
                            <TableCell className="text-xs text-slate-500">{row.telefono || row.Telefono || '---'}</TableCell>
                            <TableCell className="text-xs text-slate-600 truncate max-w-[150px]">{row.direccion || row.Direccion || '---'}</TableCell>
                            <TableCell className="text-xs text-slate-600 truncate max-w-[120px]">{row.referencia || row.Referencia || '---'}</TableCell>
                            <TableCell className="text-xs text-slate-500 uppercase">{row.sector || row.Sector || '---'}</TableCell>

                            {/* Negocio */}
                            <TableCell className="text-xs text-slate-500 truncate max-w-[120px]">{row.giro_negocio || row.GiroNegocio || '---'}</TableCell>
                            <TableCell className="text-xs text-slate-500 truncate max-w-[120px]">{row.fuentes_ingresos || row.Fuentes || '---'}</TableCell>
                            <TableCell className="text-xs text-amber-500 font-bold">{row.ingresos_mensuales || row.Ingresos || '0'}</TableCell>
                            <TableCell className="text-xs text-slate-600 truncate max-w-[150px]">{row.motivo_prestamo || row.Motivo || '---'}</TableCell>

                            {/* Financieros */}
                            <TableCell className="text-xs text-emerald-400 font-black">
                                ${parseFloat(row.monto_solicitado || row.monto || row.Monto || 0).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-xs text-blue-400 font-bold">{row.cuotas || row.Cuotas || '0'}</TableCell>
                            <TableCell className="text-xs text-slate-400">{row.interes || row.Interes || '0'}%</TableCell>
                            <TableCell className="text-xs text-slate-400 uppercase">{row.modalidad || row.modalidad || row.frecuencia || '---'}</TableCell>
                            <TableCell className="text-xs text-slate-500 font-mono italic">
                                {row.fecha_inicio || row.fecha_inicio_propuesta || row.Fecha || '---'}
                            </TableCell>
                          </TableRow>
                        ))}
                        {data.length > 10 && (
                          <TableRow className="border-none hover:bg-transparent">
                            <TableCell colSpan={16} className="text-center py-4 text-[10px] text-slate-600 font-bold italic bg-slate-900/20">
                              ... y {data.length - 10} registros adicionales detectados en el archivo.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                </div>
              </div>
            </div>
          )}

          {isUploading && (
            <div className="pt-4 space-y-3">
              <div className="flex justify-between text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                <span>Ejecutando Ciclo de Préstamos ({results ? results.success : 0}/{data.length})...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2 bg-slate-800" />
              <p className="text-[10px] text-slate-500 italic text-center">Este proceso crea clientes, aprueba préstamos, genera cronogramas y desembolsa fondos.</p>
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
                disabled={data.length === 0 || !selectedAccountId || isUploading || isBalanceInsufficient}
                className="bg-blue-600 hover:bg-blue-500 text-white min-w-[200px] shadow-lg shadow-blue-900/20 font-bold"
            >
                {isUploading ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando...</>
                ) : (
                    <><CheckCircle2 className="w-4 h-4 mr-2" /> Iniciar Carga Masiva</>
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
