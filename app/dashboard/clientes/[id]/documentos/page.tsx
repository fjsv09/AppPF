// =====================================================
// EJEMPLO: Integración de Imágenes en Perfil Cliente
// Archivo: app/dashboard/clientes/[id]/documentos/page.tsx
// =====================================================

import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { notFound } from 'next/navigation'
import ImageUpload from '@/components/image-upload'
import { ImageGallery } from '@/components/image-gallery'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Upload } from 'lucide-react'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export default async function ClienteDocumentosPage({ params }: Props) {
  const { id } = await params

  // Verificar que el cliente existe
  const supabaseAdmin = createAdminClient()
  const { data: cliente } = await supabaseAdmin
    .from('clientes')
    .select('id, nombres, dni, archivos_clientes(*)')
    .eq('id', id)
    .single()

  if (!cliente) return notFound()

  // Formatear archivos del cliente al formato Documento
  const documentos = (cliente.archivos_clientes || []).filter((a: any) => !a.eliminado).map((archivo: any) => ({
      nombre: archivo.id, 
      url: archivo.storage_path,
      tipo: archivo.mime_type,
      tamaño: archivo.tamaño_bytes,
      creado_el: archivo.subido_en,
      metadatos: {
         tipo_documento: archivo.tipo_documento
      }
  }))

  // Obtener rol del usuario actual
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: perfil } = await supabaseAdmin
    .from('perfiles')
    .select('rol')
    .eq('id', user?.id)
    .single()

  const userRole = perfil?.rol || 'asesor'
  const canEdit = ['admin', 'supervisor', 'asesor'].includes(userRole)

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white">
            Documentos de {cliente.nombres}
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">DNI: {cliente.dni}</p>
        </div>
      </div>

      {/* Sección de Upload (Solo para staff) */}
      {canEdit && (
        <Card className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/20 border-slate-800 backdrop-blur-sm">
          <CardHeader className="border-b border-white/5">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-500" />
              Subir Documentos
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Cédula */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">
                  Cédula de Identidad
                </h3>
                <ImageUpload
                  clienteId={id}
                  tipoDocumento="cedula"
                  onUploadComplete={() => {
                    // Revalidar la página para mostrar nuevo documento
                    window.location.reload()
                  }}
                />
              </div>

              {/* Comprobante de Domicilio */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">
                  Comprobante de Domicilio
                </h3>
                <ImageUpload
                  clienteId={id}
                  tipoDocumento="comprobante_domicilio"
                  onUploadComplete={() => {
                    window.location.reload()
                  }}
                />
              </div>

              {/* Otros Documentos */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">
                  Otros Documentos
                </h3>
                <ImageUpload
                  clienteId={id}
                  tipoDocumento="otro"
                  onUploadComplete={() => {
                    window.location.reload()
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Galería de Documentos */}
      <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-sm">
        <CardHeader className="border-b border-white/5">
          <CardTitle className="text-white text-lg flex items-center gap-2">
            <FileText className="w-5 h-5 text-purple-500" />
            Documentos Adjuntos
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <ImageGallery documentos={documentos} readOnly={!canEdit} bucket="documentos-clientes" layout="grid" />
        </CardContent>
      </Card>

      {/* Sección de Ayuda */}
      <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <h4 className="text-blue-300 font-semibold mb-2">
          💡 Consejos para Subir Documentos
        </h4>
        <ul className="text-sm text-blue-200/80 space-y-1">
          <li>• Máximo 2MB por archivo (JPG, PNG, WEBP, PDF)</li>
          <li>• Las imágenes se comprimen automáticamente para optimizar espacio</li>
          <li>• Los documentos se guardan de forma segura y solo son visibles para staff autorizado</li>
          <li>• El cliente solo puede ver sus propios documentos si inicia sesión</li>
        </ul>
      </div>
    </div>
  )
}
