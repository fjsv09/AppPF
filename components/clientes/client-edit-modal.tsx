"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { 
    User, Phone, MapPin, Briefcase, FileText, 
    Save, X, Loader2, Camera, Map as MapIcon,
    AlertCircle, DollarSign, PenTool
} from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SimpleImageUpload } from "@/components/wizard/simple-image-upload"
import { GpsInput } from "@/components/wizard/gps-input"
import { updateClientAction } from "@/actions/clientes"
import { useRouter } from "next/navigation"

const clientSchema = z.object({
  nombres: z.string().min(3, "El nombre es requerido"),
  dni: z.string().min(8, "DNI debe tener al menos 8 caracteres"),
  telefono: z.string().min(9, "Teléfono es requerido"),
  direccion: z.string().min(5, "Dirección es requerida"),
  referencia: z.string().optional(),
  giro_negocio: z.string().min(3, "Giro de negocio es requerido"),
  fuentes_ingresos: z.string().min(5, "Describa sus fuentes de ingresos"),
  ingresos_mensuales: z.number().min(0, "Ingresos mensuales requeridos"),
  motivo_prestamo: z.string().min(10, "Explique el motivo del préstamo"),
  sector_id: z.string().min(1, "Sector es requerido"),
  estado: z.enum(["activo", "inactivo"]),
  excepcion_voucher: z.boolean().default(false),
  limite_prestamo: z.number().min(0, "El límite debe ser mayor o igual a 0"),
})

interface ClientEditModalProps {
  cliente: any
  isOpen: boolean
  userRol?: 'admin' | 'supervisor' | 'asesor'
  onClose: () => void
  onSuccess: (updatedClient: any) => void
}

const DOCUMENTOS_REQUERIDOS = [
  { key: 'dni_frontal', label: 'DNI Frontal' },
  { key: 'dni_posterior', label: 'DNI Posterior' },
  { key: 'foto_cliente', label: 'Foto Cliente' },
  { key: 'frontis_casa', label: 'Fachada Casa' },
  { key: 'recibo_luz_agua', label: 'Recibo Servicios' },
  { key: 'negocio', label: 'Foto Negocio' },
  { key: 'documentos_negocio', label: 'Docs Negocio' },
  { key: 'filtro_sentinel', label: 'Reporte Sentinel' }
]

export function ClientEditModal({ cliente, isOpen, userRol, onClose, onSuccess }: ClientEditModalProps) {
  const isSuper = userRol === 'supervisor'
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sectores, setSectores] = useState<any[]>([])
  const [fotoPerfil, setFotoPerfil] = useState(cliente?.foto_perfil || "")
  const [documentos, setDocumentos] = useState<Record<string, string>>(cliente?.documentos || {})

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors }
  } = useForm({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      nombres: cliente?.nombres || "",
      dni: cliente?.dni || "",
      telefono: cliente?.telefono || "",
      direccion: cliente?.direccion || "",
      referencia: cliente?.referencia || "",
      giro_negocio: cliente?.giro_negocio || cliente?.ocupacion || "",
      fuentes_ingresos: cliente?.fuentes_ingresos || "",
      ingresos_mensuales: cliente?.ingresos_mensuales || 0,
      motivo_prestamo: cliente?.motivo_prestamo || "",
      sector_id: cliente?.sector_id || "",
      estado: cliente?.estado || "activo",
      excepcion_voucher: cliente?.excepcion_voucher || false,
      limite_prestamo: cliente?.limite_prestamo || 0,
    }
})

  // Coordenadas GPS separadas (no en react-hook-form para facilitar GpsInput)
  const [gpsCoords, setGpsCoords] = useState(cliente?.gps_coordenadas || "")

  useEffect(() => {
    if (cliente) {
        setFotoPerfil(cliente.foto_perfil || "")
        setDocumentos(cliente.documentos || {})
        setGpsCoords(cliente.gps_coordenadas || "")

        // Actualizar valores del formulario si el cliente cambia
        setValue("nombres", cliente.nombres || "")
        setValue("dni", cliente.dni || "")
        setValue("telefono", cliente.telefono || "")
        setValue("direccion", cliente.direccion || "")
        setValue("referencia", cliente.referencia || "")
        setValue("giro_negocio", cliente.giro_negocio || cliente.ocupacion || "")
        setValue("fuentes_ingresos", cliente.fuentes_ingresos || "")
        setValue("ingresos_mensuales", cliente.ingresos_mensuales || 0)
        setValue("motivo_prestamo", cliente.motivo_prestamo || "")
        setValue("sector_id", cliente.sector_id || "")
        setValue("estado", cliente.estado || "activo")
        setValue("excepcion_voucher", cliente.excepcion_voucher || false)
        setValue("limite_prestamo", cliente.limite_prestamo || 0)
    }
  }, [cliente, setValue])

  useEffect(() => {
    async function loadSectores() {
        try {
            const response = await fetch('/api/sectores')
            if (response.ok) {
                const data = await response.json()
                setSectores(data)
            }
        } catch (err) {
            console.error("Error loading sectores:", err)
        }
    }
    if (isOpen) loadSectores()
  }, [isOpen])

  const handleDocumentoUpload = (key: string, url: string) => {
    setDocumentos(prev => ({ ...prev, [key]: url }))
  }

  const onSubmit = async (data: any) => {
    setIsSubmitting(true)
    setError(null)
    try {
      const payload = {
        ...data,
        id: cliente.id,
        gps_coordenadas: gpsCoords,
        foto_perfil: fotoPerfil,
        documentos: documentos
      }
      
      const updated = await updateClientAction(payload)
      onSuccess(updated)
      router.refresh()
      onClose()
    } catch (err: any) {
      setError(err.message || "Error al actualizar el cliente")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto bg-slate-950 border-slate-800 text-slate-100 p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-6 border-b border-white/5 bg-slate-900/50">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <User className="w-5 h-5 text-blue-400" />
            Editar Perfil del Cliente
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-8 pb-32">
             {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                </div>
             )}

             {/* Sección 1: Foto y Básico */}
             <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-1 space-y-2">
                    <label className="text-[10px] uppercase font-bold text-slate-500 ml-1">Foto de Perfil</label>
                    <div className="flex flex-col items-center gap-3">
                        <SimpleImageUpload 
                            label="Avatar"
                            value={fotoPerfil}
                            onChange={setFotoPerfil}
                            folder="avatares"
                            bucket="avatares"
                            disabled={isSubmitting}
                        />
                    </div>
                </div>

                <div className="md:col-span-3 space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 ml-1">Nombres Completos *</label>
                        <Input 
                            {...register("nombres")}
                            className="bg-slate-900 border-slate-800 focus:border-blue-500/50"
                            placeholder="Nombre del cliente"
                            disabled={isSubmitting || isSuper}
                        />
                        {errors.nombres && <p className="text-[10px] text-red-400">{errors.nombres.message as string}</p>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs text-slate-400 ml-1">DNI *</label>
                            <Input 
                                {...register("dni")}
                                className="bg-slate-900 border-slate-800 focus:border-blue-500/50"
                                placeholder="DNI"
                                disabled={isSubmitting || isSuper}
                            />
                            {errors.dni && <p className="text-[10px] text-red-400">{errors.dni.message as string}</p>}
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs text-slate-400 ml-1">Teléfono *</label>
                            <Input 
                                {...register("telefono")}
                                className="bg-slate-900 border-slate-800 focus:border-blue-500/50"
                                placeholder="999 999 999"
                                disabled={isSubmitting}
                            />
                            {errors.telefono && <p className="text-[10px] text-red-400">{errors.telefono.message as string}</p>}
                        </div>
                    </div>
                </div>
             </div>

             {/* Sección 2: Ubicación */}
             <div className="space-y-4 pt-4 border-t border-white/5">
                <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <MapPin className="w-3 h-3" /> Ubicación y Sector
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 ml-1">Dirección *</label>
                        <Input 
                            {...register("direccion")}
                            className="bg-slate-900 border-slate-800 focus:border-blue-500/50"
                            placeholder="Dirección exacta"
                            disabled={isSubmitting}
                        />
                        {errors.direccion && <p className="text-[10px] text-red-400">{errors.direccion.message as string}</p>}
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 ml-1">Referencia</label>
                        <Input 
                            {...register("referencia")}
                            className="bg-slate-900 border-slate-800 focus:border-blue-500/50"
                            placeholder="Cerca de..."
                            disabled={isSubmitting}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 ml-1">Sector *</label>
                        <Select 
                            defaultValue={cliente?.sector_id}
                            onValueChange={(val) => setValue("sector_id", val)}
                        >
                            <SelectTrigger className="bg-slate-900 border-slate-800">
                                <SelectValue placeholder="Seleccione un sector" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                {sectores.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        {errors.sector_id && <p className="text-[10px] text-red-400">{errors.sector_id.message as string}</p>}
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 ml-1">Estado</label>
                        <Select 
                            defaultValue={cliente?.estado || "activo"}
                            onValueChange={(val: any) => setValue("estado", val)}
                            disabled={isSubmitting || isSuper}
                        >
                            <SelectTrigger className="bg-slate-900 border-slate-800 h-10">
                                <SelectValue placeholder="Estado del cliente" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                <SelectItem value="activo">Activo</SelectItem>
                                <SelectItem value="inactivo">Inactivo</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 ml-1">Exento de Recibo (Voucher)</label>
                        <Select 
                            value={String(cliente?.excepcion_voucher || false)}
                            onValueChange={(val) => setValue("excepcion_voucher", val === "true")}
                            disabled={isSubmitting || isSuper}
                        >
                            <SelectTrigger className="bg-slate-900 border-slate-800 h-10">
                                <SelectValue placeholder="¿Exento de recibo?" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-900 border-slate-800">
                                <SelectItem value="false">Requiere Recibo (Normal)</SelectItem>
                                <SelectItem value="true">Exento de Recibo (Confianza)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
             </div>

             {/* Sección 3: Evaluación Financiera */}
             <div className="space-y-4 pt-4 border-t border-white/5">
                <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Briefcase className="w-3 h-3" /> Evaluación Financiera
                </h3>
                
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 ml-1">Giro de Negocio *</label>
                        <div className="relative">
                            <Briefcase className="absolute left-3 top-3.5 h-4 w-4 text-blue-500" />
                            <Input 
                                {...register("giro_negocio")}
                                className="pl-9 bg-slate-900 border-slate-800 focus:border-blue-500/50"
                                placeholder="Ej: Bodega, Restaurante, Taxi"
                                disabled={isSubmitting}
                            />
                        </div>
                        {errors.giro_negocio && <p className="text-[10px] text-red-400">{errors.giro_negocio.message as string}</p>}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs text-slate-400 ml-1">Fuentes de Ingresos *</label>
                            <Input 
                                {...register("fuentes_ingresos")}
                                className="bg-slate-900 border-slate-800 focus:border-blue-500/50"
                                placeholder="Ej: Ventas, Servicios"
                                disabled={isSubmitting}
                            />
                            {errors.fuentes_ingresos && <p className="text-[10px] text-red-400">{errors.fuentes_ingresos.message as string}</p>}
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs text-slate-400 ml-1">Ingresos Mensuales (S/) *</label>
                            <div className="relative">
                                <DollarSign className="absolute left-3 top-3.5 h-4 w-4 text-emerald-500" />
                                <Input 
                                    type="number"
                                    step="0.01"
                                    {...register("ingresos_mensuales", { valueAsNumber: true })}
                                    className="pl-9 bg-slate-900 border-slate-800 focus:border-emerald-500/50"
                                    placeholder="2500"
                                    disabled={isSubmitting}
                                />
                            </div>
                            {errors.ingresos_mensuales && <p className="text-[10px] text-red-400">{errors.ingresos_mensuales.message as string}</p>}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 ml-1">Motivo del Préstamo *</label>
                        <Textarea 
                            {...register("motivo_prestamo")}
                            className="bg-slate-900 border-slate-800 focus:border-blue-500/50 min-h-[80px] resize-none"
                            placeholder="Describa para qué utilizará el préstamo..."
                            disabled={isSubmitting}
                        />
                        {errors.motivo_prestamo && <p className="text-[10px] text-red-400">{errors.motivo_prestamo.message as string}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 ml-1 flex items-center gap-2">
                            <DollarSign className="w-3 h-3 text-emerald-400" /> Monto Límite de Préstamo (S/)
                        </label>
                        <Input 
                            type="number"
                            step="0.01"
                            {...register("limite_prestamo", { valueAsNumber: true })}
                            className="bg-slate-900 border-slate-800 focus:border-emerald-500/50 font-bold text-emerald-400"
                            placeholder="500.00"
                            disabled={
                                isSubmitting || 
                                userRol === 'asesor' || 
                                (userRol === 'supervisor' && (cliente?.limite_prestamo || 0) > 0)
                            }
                        />
                        {userRol === 'supervisor' && (cliente?.limite_prestamo || 0) > 0 && (
                            <p className="text-[10px] text-slate-500 italic pl-1">Solo el administrador puede editar un límite ya establecido.</p>
                        )}
                        {errors.limite_prestamo && <p className="text-[10px] text-red-400">{errors.limite_prestamo.message as string}</p>}
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs text-slate-400 ml-1 flex items-center gap-2">
                            <MapIcon className="w-3 h-3 text-purple-400" /> Ubicación GPS
                        </label>
                        <GpsInput value={gpsCoords} onChange={setGpsCoords} disabled={isSubmitting} />
                    </div>
                </div>
             </div>

             {/* Sección 4: Expediente */}
             <div className="space-y-4 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                        <FileText className="w-3 h-3" /> Expediente Digital
                    </h3>
                    <Badge variant="outline" className="text-[9px] bg-blue-500/5 text-blue-400 border-blue-500/20 uppercase">
                        {Object.values(documentos).filter(Boolean).length} / 8 Documentos
                    </Badge>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {DOCUMENTOS_REQUERIDOS.map((doc) => (
                        <SimpleImageUpload
                            key={doc.key}
                            label={doc.label}
                            value={documentos[doc.key]}
                            onChange={(url) => handleDocumentoUpload(doc.key, url)}
                            disabled={isSubmitting}
                        />
                    ))}
                </div>
             </div>
          </div>

          <DialogFooter className="sticky bottom-0 left-0 right-0 p-6 bg-slate-900 border-t border-white/5 gap-3 flex flex-row justify-end">
            <Button 
                type="button" 
                variant="ghost" 
                onClick={onClose}
                disabled={isSubmitting}
                className="hover:bg-slate-800"
            >
                Cancelar
            </Button>
            <Button 
                type="submit" 
                className="bg-blue-600 hover:bg-blue-500 text-white min-w-[140px]"
                disabled={isSubmitting}
            >
                {isSubmitting ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Guardando...
                    </>
                ) : (
                    <>
                        <Save className="w-4 h-4 mr-2" />
                        Guardar Cambios
                    </>
                )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
