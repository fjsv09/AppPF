'use client'

// =====================================================
// COMPONENTE: Visualizador de Imágenes
// Con lazy loading y URLs firmadas
// =====================================================

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { FileImage, Download, Trash2, Eye, Loader2, X } from 'lucide-react'
import Image from 'next/image'

interface Documento {
  nombre: string
  url: string
  tipo: string
  tamaño: number
  creado_el: string
  metadatos?: {
    tipo_documento?: string
    es_foto_perfil?: boolean
    [key: string]: any
  }
}

interface ImageGalleryProps {
  documentos: Documento[]
  onDelete?: (filePath: string) => Promise<void>
  readOnly?: boolean
  bucket?: string
  layout?: 'grid' | 'list'
}

export function ImageGallery({ 
  documentos, 
  onDelete, 
  readOnly = false,
  bucket = 'documentos-clientes',
  layout = 'grid'
}: ImageGalleryProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    // Filtrar solo imágenes
    const imageDocs = documentos.filter(doc => doc.tipo.startsWith('image/'))
    
    // Si no hay imágenes, no hacemos nada
    if (imageDocs.length === 0) {
        setLoading(false)
        return
    }

    const fetchSignedUrls = async () => {
      const newSignedUrls: Record<string, string> = {}
      
      try {
        for (const doc of imageDocs) {
          // Extraer la ruta real del path completo
          // El formato en la DB suele ser "clientes/uuid/carpeta/archivo.jpg"
          const path = doc.url
          
          if (!path) continue;

          // Generar URL firmada válida por 1 hora (3600 segundos)
          const { data, error } = await supabase
            .storage
            .from(bucket)
            .createSignedUrl(path, 3600)

          if (error) {
            continue
          }

          if (data?.signedUrl) {
            newSignedUrls[path] = data.signedUrl
          }
        }
        
        setSignedUrls(newSignedUrls)
      } catch (err) {
        // Silencio en modo producción
      } finally {
        setLoading(false)
      }
    }

    fetchSignedUrls()
  }, [documentos, bucket, supabase])

  // =====================================================
  // FUNCIÓN: Eliminar archivo
  // =====================================================
  const handleDelete = async (storagePath: string, fileName: string) => {
    if (readOnly) return
    if (!confirm(`¿Estás seguro de eliminar ${fileName}?`)) return
    
    setIsDeleting(storagePath)

    try {
      if (onDelete) {
          await onDelete(storagePath)
      }
    } catch (err: any) {
      console.error('Error al eliminar archivo:', err)
      alert('Error al eliminar archivo: ' + err.message)
    } finally {
        setIsDeleting(null)
    }
  }

  // =====================================================
  // FUNCIÓN: Descargar archivo
  // =====================================================
  const handleDownload = async (url: string, fileName: string) => {
    try {
      const response = await fetch(url)
      const blob = await response.blob()
      const downloadUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = downloadUrl
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      console.error('Error al descargar:', err)
      alert('Error al descargar archivo')
    }
  }

  // =====================================================
  // RENDERIZADO
  // =====================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  const imageDocs = documentos.filter(doc => doc.tipo.startsWith('image/'))

  if (imageDocs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-white/60">
        <FileImage className="w-16 h-16 mb-4 opacity-50 text-slate-600" />
        <p className="text-slate-500">No hay imágenes adjuntas.</p>
      </div>
    )
  }

  return (
    <>
      <div className={`grid gap-4 ${layout === 'grid' ? 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4' : 'grid-cols-1'}`}>
        {imageDocs.map((archivo) => {
            const signedUrl = signedUrls[archivo.url]
            const typeLabel = archivo.metadatos?.tipo_documento || 'Documento'
            return (
          <div
            key={archivo.nombre}
            className="group relative bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-blue-500/50 transition-colors shadow-sm"
          >
            {/* Imagen o icono */}
            <div className={`relative w-full bg-black/40 ${layout === 'grid' ? 'aspect-square' : 'h-32'}`}>
              {signedUrl ? (
                <Image
                  src={signedUrl}
                  alt={archivo.nombre}
                  fill
                  className="object-cover cursor-pointer hover:scale-105 transition-transform duration-500"
                  onClick={() => setSelectedImage(signedUrl)}
                />
              ) : (
                <div className="flex items-center justify-center h-full">
                  <FileImage className="w-10 h-10 text-slate-700" />
                </div>
              )}

              {/* Overlay con acciones */}
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col items-center justify-center gap-3">
                <div className="flex gap-2">
                    {signedUrl && (
                    <button
                        onClick={() => setSelectedImage(signedUrl)}
                        className="w-10 h-10 flex items-center justify-center bg-blue-500/20 text-blue-400 rounded-full hover:bg-blue-500 hover:text-white transition-colors"
                        title="Ver pantalla completa"
                    >
                        <Eye className="w-5 h-5" />
                    </button>
                    )}
                    {signedUrl && (
                    <button
                        onClick={() => handleDownload(signedUrl, archivo.nombre)}
                        className="w-10 h-10 flex items-center justify-center bg-green-500/20 text-green-400 rounded-full hover:bg-green-500 hover:text-white transition-colors"
                        title="Descargar imagen"
                    >
                        <Download className="w-5 h-5" />
                    </button>
                    )}
                </div>
                {!readOnly && (
                  <button
                    onClick={() => handleDelete(archivo.url, archivo.nombre)}
                    disabled={isDeleting === archivo.url}
                    className="w-10 h-10 flex items-center justify-center bg-red-500/20 text-red-400 rounded-full hover:bg-red-500 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Eliminar documento"
                  >
                    {isDeleting === archivo.url ? <Loader2 className="w-5 h-5 animate-spin"/> : <Trash2 className="w-5 h-5" />}
                  </button>
                )}
              </div>
            </div>

            {/* Información */}
            <div className="p-3 bg-slate-900 border-t border-slate-800">
              <p className="font-semibold text-xs text-slate-300 truncate mb-1 capitalize">
                {typeLabel.replace('_', ' ')}
              </p>
              <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                <span>{(archivo.tamaño / 1024).toFixed(0)} KB</span>
                <span>{new Date(archivo.creado_el).toLocaleDateString('es-ES')}</span>
              </div>
            </div>
          </div>
        )})}
      </div>

      {/* Modal de vista previa */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/95 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-5xl w-full max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-12 right-0 p-2 bg-slate-800 text-slate-400 rounded-full hover:bg-slate-700 hover:text-white transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="relative w-full h-[80vh]">
                <Image
                src={selectedImage}
                alt="Vista Previa"
                fill
                className="object-contain rounded-lg"
                unoptimized
                />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
