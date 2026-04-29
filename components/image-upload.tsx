'use client'

// =====================================================
// COMPONENTE: Upload de Imágenes con Compresión
// Optimizado para reducir costes de storage
// =====================================================

import { useState, useRef } from 'react'
import { Upload, X, FileImage, FileText, Loader2 } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/client'

interface ImageUploadProps {
  clienteId: string
  tipoDocumento: 'cedula' | 'comprobante_domicilio' | 'foto_perfil' | 'otro'
  onUploadComplete?: (result: any) => void
  maxSizeMB?: number
  accept?: string
}

export default function ImageUpload({
  clienteId,
  tipoDocumento,
  onUploadComplete,
  maxSizeMB = 5,
  accept = 'image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,application/pdf'
}: ImageUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const supabase = getSupabaseClient()

  // =====================================================
  // FUNCIÓN: Comprimir imagen en el cliente
  // Esto reduce costes de storage y ancho de banda
  // =====================================================
  const compressImage = async (file: File, maxSizeMB: number): Promise<File> => {
    // Si es PDF, retornar sin comprimir
    if (file.type === 'application/pdf') {
      return file
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new Image()
        img.src = event.target?.result as string
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          // Reducir dimensiones si es muy grande
          const MAX_WIDTH = 1920
          const MAX_HEIGHT = 1920

          if (width > MAX_WIDTH) {
            height = (height * MAX_WIDTH) / width
            width = MAX_WIDTH
          }
          if (height > MAX_HEIGHT) {
            width = (width * MAX_HEIGHT) / height
            height = MAX_HEIGHT
          }

          canvas.width = width
          canvas.height = height

          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('No se pudo crear canvas'))
            return
          }

          ctx.drawImage(img, 0, 0, width, height)

          // Comprimir iterativamente hasta alcanzar el tamaño deseado
          let quality = 0.9
          const targetSize = maxSizeMB * 1024 * 1024

          const tryCompress = () => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Error al comprimir imagen'))
                  return
                }

                // Si el tamaño es aceptable o la calidad ya es muy baja, terminar
                if (blob.size <= targetSize || quality <= 0.5) {
                  const compressedFile = new File([blob], file.name, {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                  })
                  resolve(compressedFile)
                } else {
                  // Reducir calidad y reintentar
                  quality -= 0.1
                  tryCompress()
                }
              },
              'image/jpeg',
              quality
            )
          }

          tryCompress()
        }
        img.onerror = () => reject(new Error('Error al cargar imagen'))
      }
      reader.onerror = () => reject(new Error('Error al leer archivo'))
    })
  }

  // =====================================================
  // MANEJO: Selección de archivo
  // =====================================================
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setError(null)

    // Validar tamaño original
    const sizeMB = selectedFile.size / (1024 * 1024)
    if (sizeMB > maxSizeMB * 2) {
      setError(`El archivo es demasiado grande. Máximo ${maxSizeMB * 2}MB`)
      return
    }

    try {
      // Comprimir imagen
      setProgress(10)
      const compressedFile = await compressImage(selectedFile, maxSizeMB)
      setProgress(30)

      setFile(compressedFile)

      // Generar preview
      if (compressedFile.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setPreview(reader.result as string)
        }
        reader.readAsDataURL(compressedFile)
      } else {
        setPreview(null)
      }

      setProgress(0)
    } catch (err) {
      console.error('Error al procesar archivo:', err)
      setError('Error al procesar el archivo')
      setProgress(0)
    }
  }

  // =====================================================
  // FUNCIÓN: Subir archivo a Supabase
  // =====================================================
  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setProgress(0)
    setError(null)

    try {
      // 1. Generar nombre único
      const timestamp = Date.now()
      const extension = file.name.split('.').pop()
      const fileName = `${tipoDocumento}_${timestamp}.${extension}`
      const storagePath = `${clienteId}/${fileName}`

      setProgress(20)

      // 2. Subir a Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documentos-clientes')
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        throw new Error(uploadError.message)
      }

      setProgress(60)

      // 3. Registrar en base de datos
      const { data: registroData, error: registroError } = await supabase.rpc(
        'registrar_archivo_subido',
        {
          p_cliente_id: clienteId,
          p_storage_path: storagePath,
          p_tipo_documento: tipoDocumento,
          p_mime_type: file.type,
          p_tamaño_bytes: file.size
        }
      )

      if (registroError) {
        // Rollback: eliminar archivo subido
        await supabase.storage.from('documentos-clientes').remove([storagePath])
        throw new Error('Error al registrar archivo')
      }

      setProgress(100)

      // 4. Callback de éxito
      if (onUploadComplete) {
        onUploadComplete({
          archivoId: registroData,
          path: storagePath,
          fileName
        })
      }

      // Limpiar estado
      setTimeout(() => {
        setFile(null)
        setPreview(null)
        setProgress(0)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      }, 1000)
    } catch (err: any) {
      console.error('Error al subir archivo:', err)
      setError(err.message || 'Error al subir archivo')
      setProgress(0)
    } finally {
      setUploading(false)
    }
  }

  // =====================================================
  // RENDERIZADO
  // =====================================================
  return (
    <div className="space-y-4">
      {/* Input de archivo */}
      <div className="relative">
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          onChange={handleFileChange}
          className="hidden"
          id={`file-upload-${tipoDocumento}`}
        />
        <label
          htmlFor={`file-upload-${tipoDocumento}`}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg cursor-pointer hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
        >
          <Upload className="w-5 h-5" />
          <span>Seleccionar {tipoDocumento.replace('_', ' ')}</span>
        </label>
      </div>

      {/* Preview del archivo */}
      {file && (
        <div className="relative p-4 bg-white/10 backdrop-blur-md rounded-lg border border-white/20">
          <button
            onClick={() => {
              setFile(null)
              setPreview(null)
              if (fileInputRef.current) {
                fileInputRef.current.value = ''
              }
            }}
            className="absolute top-2 right-2 p-1 bg-red-500 rounded-full hover:bg-red-600 transition-colors"
          >
            <X className="w-4 h-4 text-white" />
          </button>

          {preview ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview}
                alt="Preview"
                className="w-full h-48 object-contain rounded-lg"
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-48">
              <FileText className="w-16 h-16 text-white/60" />
            </div>
          )}

          <div className="mt-3 text-sm text-white/80">
            <p className="font-medium">{file.name}</p>
            <p className="text-xs">
              {(file.size / 1024).toFixed(2)} KB
            </p>
          </div>

          {/* Botón de subida */}
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full mt-4 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
          >
            {uploading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Subiendo... {progress}%</span>
              </>
            ) : (
              <span>Subir Archivo</span>
            )}
          </button>
        </div>
      )}

      {/* Barra de progreso */}
      {progress > 0 && (
        <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm">
          {error}
        </div>
      )}
    </div>
  )
}
