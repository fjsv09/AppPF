'use client'
import { useState, useEffect } from "react"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { LightboxModal } from "@/components/ui/image-lightbox"
import { Phone, MessageCircle, MapPin, Calendar, Clock, FileText, CheckCircle, AlertTriangle, X, Send, Users, Edit, Lock, Unlock } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { ClientGestiones } from "./client-gestiones"
import { ClientExpediente } from "./client-expediente"
import { ClientEditModal } from "./client-edit-modal"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface ClientDetailDrawerProps {
  cliente: any | null
  isOpen: boolean
  onClose: () => void
  userRol?: "admin" | "supervisor" | "asesor"
  onUpdate?: (updatedClient: any) => void
}

export function ClientDetailDrawer({ cliente, isOpen, onClose, userRol = "asesor", onUpdate }: ClientDetailDrawerProps) {
  const [profileImageOpen, setProfileImageOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isBlocking, setIsBlocking] = useState(false)
  const router = useRouter()

  // Safe navigation logic
  if (!cliente) return null

  const formatMoney = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })

  const handleToggleBlock = async () => {
        const isBlocked = !!cliente.bloqueado_renovacion
        const action = isBlocked ? 'unblock' : 'block'
        if (action === 'block' && !confirm('¿Está seguro que desea BLOQUEAR a este cliente? El cliente no podrá renovar préstamos.')) return;
        if (action === 'unblock' && !confirm('¿Confirma que desea DESBLOQUEAR a este cliente?')) return;
        
        setIsBlocking(true)
        try {
            const response = await fetch('/api/clientes/bloquear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cliente_id: cliente.id, action })
            })

            const data = await response.json()
            if (!response.ok) throw new Error(data.error || 'Error al actualizar')
            
            toast.success(action === 'block' ? 'Cliente bloqueado para renovar' : 'Cliente desbloqueado')
            if (onUpdate) onUpdate(data.cliente)
            router.refresh()
        } catch (error: any) {
            toast.error(error.message || 'Error al bloquear/desbloquear cliente')
        } finally {
            setIsBlocking(false)
        }
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md md:max-w-xl p-0 gap-0 border-l border-slate-800 bg-slate-950">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-slate-900/50">
           <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-4">
                  <div 
                      className="relative w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center overflow-hidden border-2 border-slate-700 cursor-pointer hover:border-slate-500 transition-colors z-50"
                      onClick={() => setProfileImageOpen(true)}
                  >
                     {cliente.foto_perfil ? (
                        <img 
                            src={cliente.foto_perfil} 
                            alt={cliente.nombres} 
                            className="w-full h-full object-cover" 
                        />
                     ) : (
                        <span className="text-xl font-bold text-slate-400">{cliente.nombres?.charAt(0)}</span>
                     )}
                 </div>
                 <div>
                    <SheetTitle className="text-xl font-bold text-white leading-tight mb-1">{cliente.nombres}</SheetTitle>
                    <div className="flex items-center gap-2">
                       <Badge variant="outline" className={cn("text-[10px] px-2 py-0.5 h-5 rounded-full border font-bold", 
                          cliente.situacion === 'critico' ? "bg-rose-500/10 text-rose-400 border-rose-500/30" : 
                          cliente.situacion === 'atrasado' ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : 
                          cliente.situacion === 'al_dia' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : 
                          cliente.situacion === 'sin_deuda' ? "bg-blue-500/10 text-blue-400 border-blue-500/30" :
                          "bg-slate-800 text-slate-400 border-slate-700"
                       )}>
                          <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5", 
                             cliente.situacion === 'al_dia' ? "bg-emerald-500 animate-pulse" : 
                             cliente.situacion === 'critico' ? "bg-rose-500 animate-bounce" :
                             cliente.situacion === 'atrasado' ? "bg-amber-500 animate-pulse" :
                             "bg-slate-500"
                          )} />
                          {cliente.situacion === 'critico' ? 'CRÍTICO' : 
                           cliente.situacion === 'atrasado' ? 'EN MORA' : 
                           cliente.situacion === 'al_dia' ? 'AL DÍA' : 
                           cliente.situacion === 'sin_deuda' ? 'SIN DEUDA' :
                           cliente.estado?.toUpperCase()}
                       </Badge>
                       <span className="text-xs text-slate-400 font-mono">{cliente.dni}</span>
                     </div>
                  </div>
               </div>
               
               {/* Admin Edit Action */}
               {userRol === 'admin' && (
                   <Button 
                       variant="outline" 
                       size="sm" 
                       className="h-8 bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
                       onClick={() => setIsEditModalOpen(true)}
                   >
                       <Edit className="w-3 h-3 mr-1.5" />
                       Editar Perfil
                   </Button>
               )}
            </div>
           
           {/* Quick Actions */}
           <div className="grid grid-cols-2 gap-3 mb-3">
              <Button className="bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-900/20" onClick={() => window.open(`https://wa.me/${cliente.telefono}`, '_blank')}>
                 <MessageCircle className="w-4 h-4 mr-2" /> WhatsApp
              </Button>
              <Button variant="outline" className="bg-slate-800 border-slate-700 text-slate-200 hover:text-white hover:bg-slate-700" onClick={() => window.open(`tel:${cliente.telefono}`)}>
                 <Phone className="w-4 h-4 mr-2" /> Llamar
              </Button>
           </div>
           
           {(userRol === 'admin' || (userRol === 'asesor' && !cliente.bloqueado_renovacion)) && (
               <Button 
                   variant="outline" 
                   className={cn(
                       "w-full font-bold",
                       cliente.bloqueado_renovacion 
                           ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white" 
                           : "bg-amber-950/30 border-amber-900/50 text-amber-400 hover:bg-amber-900/40 hover:text-amber-300"
                   )} 
                   onClick={handleToggleBlock}
                   disabled={isBlocking}
               >
                   {cliente.bloqueado_renovacion ? <Unlock className="w-4 h-4 mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
                   {isBlocking ? "Procesando..." : (cliente.bloqueado_renovacion ? 'Desbloquear Renovación' : 'Bloquear para Renovación')}
               </Button>
           )}
        </div>

        {/* Content Tabs */}
        <Tabs defaultValue="perfil" className="flex-1 flex flex-col h-[calc(100vh-180px)]">
           <div className="px-6 pt-4 bg-slate-900/50 border-b border-slate-800">
              <TabsList className="bg-slate-900/50 border border-slate-800 p-0.5 w-full grid grid-cols-3 h-7 mb-4">
                 <TabsTrigger value="perfil" className="text-[10px] h-full data-[state=active]:bg-slate-800 text-slate-400 data-[state=active]:text-white transition-all">Perfil</TabsTrigger>
                 <TabsTrigger value="gestiones" className="text-[10px] h-full data-[state=active]:bg-slate-800 text-slate-400 data-[state=active]:text-white transition-all">Gestiones</TabsTrigger>
                 <TabsTrigger value="expediente" className="text-[10px] h-full data-[state=active]:bg-slate-800 text-slate-400 data-[state=active]:text-white transition-all">Expediente</TabsTrigger>
              </TabsList>
           </div>

           <div className="flex-1 overflow-y-auto bg-slate-950/30 pb-6 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
              {/* TAB 1: PERFIL */}
              <TabsContent value="perfil" className="p-6 space-y-6 m-0 animate-in fade-in slide-in-from-right-4 duration-300">
                 {/* Financial Summary */}
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Deuda Total</div>
                        <div className={cn("text-2xl font-bold", cliente.stats?.totalDebt > 0 ? "text-rose-400" : "text-emerald-400")}>
                           {formatMoney(cliente.stats?.totalDebt || 0)}
                        </div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Préstamos Activos</div>
                        <div className="text-2xl font-bold text-blue-400">
                           {cliente.stats?.activeLoansCount || 0}
                        </div>
                    </div>
                    <div className="col-span-2 md:col-span-1 p-4 rounded-xl bg-slate-900/50 border border-slate-800">
                        <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">Préstamos Históricos</div>
                        <div className="text-2xl font-bold text-slate-200">
                           {cliente.stats?.historicalLoansCount || 0}
                        </div>
                    </div>
                 </div>

                 {/* Contact Info */}
                 <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                        <MapPin className="w-4 h-4 text-purple-500" /> Dirección
                    </h3>
                    <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800 text-slate-300 text-sm leading-relaxed">
                        <div className="mb-2">
                            {cliente.direccion || "Sin dirección registrada"}
                        </div>
                        {cliente.referencia && (
                            <div className="text-xs text-slate-400 mt-1 italic border-l-2 border-slate-700 pl-2">
                                Ref: {cliente.referencia}
                            </div>
                        )}
                        <div className="mt-3">
                             <Button variant="link" className="p-0 h-auto text-blue-400 text-xs" onClick={() => {
                                 const coords = cliente.gps_coordenadas && cliente.gps_coordenadas !== "null" ? cliente.gps_coordenadas : null;
                                 const query = coords || cliente.direccion;
                                 if (query) {
                                     const url = coords 
                                         ? `https://www.google.com/maps?q=${encodeURIComponent(coords)}`
                                         : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
                                     window.open(url, '_blank')
                                 }
                             }}>
                                 Ver en Mapa Google
                             </Button>
                        </div>
                    </div>
                 </div>

                 {/* Personal Info */}
                 <div className="space-y-2 pt-2 border-t border-slate-800/50">
                    <div className="flex justify-between py-2 border-b border-slate-800/30">
                        <span className="text-sm text-slate-500">DNI</span>
                        <span className="text-sm text-slate-200 font-mono">{cliente.dni}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-800/30">
                        <span className="text-sm text-slate-500">Teléfono</span>
                        <span className="text-sm text-slate-200 font-mono">{cliente.telefono}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-800/30">
                        <span className="text-sm text-slate-500">Sector</span>
                        <span className="text-sm text-slate-200">{cliente.sectores?.nombre || "No registrado"}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-800/30">
                        <span className="text-sm text-slate-500">Creado el</span>
                        <span className="text-sm text-slate-200">{format(new Date(cliente.created_at), "dd MMM yyyy", { locale: es })}</span>
                    </div>
                 </div>
              </TabsContent>

              {/* TAB 2: GESTIONES CRM */}
              <TabsContent value="gestiones" className="p-0 m-0 h-full animate-in fade-in slide-in-from-right-4 duration-300">
                  <ClientGestiones 
                      userRol={userRol} 
                      loans={cliente.prestamos || []} 
                      clienteId={cliente.id}
                      clienteNombre={cliente.nombres}
                  />
              </TabsContent>

              {/* TAB 3: EXPEDIENTE */}
              <TabsContent value="expediente" className="mx-0 p-4 pt-0 mt-0 !mt-0 border-0 outline-none ring-0 shadow-none bg-transparent">
                  <ClientExpediente documentos={cliente.documentos} />
              </TabsContent>
           </div>
        </Tabs>

        <LightboxModal 
            src={cliente.foto_perfil || ''} 
            alt={cliente.nombres || ' Foto de perfil'} 
            isOpen={profileImageOpen} 
            onClose={() => setProfileImageOpen(false)} 
        />

        <ClientEditModal 
            cliente={cliente}
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onSuccess={(updated) => {
                if (onUpdate) onUpdate(updated)
                setIsEditModalOpen(false)
            }}
        />
      </SheetContent>
    </Sheet>
  )
}
