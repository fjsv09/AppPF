'use client'

import { useState, useRef } from 'react'
import { Upload, X, FileText, Check, Loader2 } from 'lucide-react'
import { uploadFile } from '@/utils/supabase/upload'

interface SimpleImageUploadProps {
  label: string
  value?: string
  onChange: (fileUrl: string) => void
  disabled?: boolean
  accept?: string
  maxSizeMB?: number
  folder?: string
  bucket?: string
}

export function SimpleImageUpload({ 
  label,
  value,
  onChange,
  disabled = false,
  accept = 'image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif,application/pdf',
  maxSizeMB = 5,
  folder = 'evaluaciones',
  bucket = 'documentos-evaluacion'
}: SimpleImageUploadProps) {
  const [preview, setPreview] = useState<string>(value || '')
  const [fileType, setFileType] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Función para comprimir imagen (portada de ImageUpload.tsx)
  const compressImage = async (file: File, maxSize: number): Promise<File> => {
    if (file.type === 'application/pdf') return file

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

          const MAX_WIDTH = 1600
          const MAX_HEIGHT = 1600

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

          let quality = 0.8
          const targetSize = maxSize * 1024 * 1024

          const tryCompress = () => {
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Error al comprimir imagen'))
                  return
                }

                if (blob.size <= targetSize || quality <= 0.4) {
                  const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                    type: 'image/jpeg',
                    lastModified: Date.now()
                  })
                  resolve(compressedFile)
                } else {
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setError(null)
    setIsUploading(true)
    setFileType(selectedFile.type)

    try {
      // Validar tamaño inicial (permitir hasta el doble para luego comprimir)
      const sizeMB = selectedFile.size / (1024 * 1024)
      if (sizeMB > maxSizeMB * 3) {
        setError(`Archivo demasiado grande. Máximo ${maxSizeMB}MB`)
        setIsUploading(false)
        return
      }

      // Comprimir si es imagen
      let fileToUpload = selectedFile
      if (selectedFile.type.startsWith('image/')) {
        try {
          fileToUpload = await compressImage(selectedFile, maxSizeMB)
        } catch (compressErr) {
          console.error('Error comprimiendo:', compressErr)
          // Si falla la compresión, intentamos con el original si no es gigante
          if (sizeMB > maxSizeMB) {
            setError('La imagen es muy pesada y no se pudo optimizar.')
            setIsUploading(false)
            return
          }
        }
      }

      // Generar preview local inmediatamente (solo para imágenes)
      if (fileToUpload.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setPreview(reader.result as string)
        }
        reader.readAsDataURL(fileToUpload)
      }

      // Subir archivo a Supabase Storage
      const publicUrl = await uploadFile(fileToUpload, bucket, folder)
      
      if (!publicUrl) {
        setError('Error al subir archivo. Intente nuevamente.')
        setPreview('')
        setIsUploading(false)
        return
      }

      // Guardar URL pública
      onChange(publicUrl)
      setPreview(publicUrl)
      setIsUploading(false)

    } catch (err) {
      console.error('Error al procesar archivo:', err)
      setError('Error al procesar archivo')
      setPreview('')
      setIsUploading(false)
    }
  }

  const handleRemove = () => {
    setPreview('')
    setFileType('')
    setError(null)
    onChange('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const hasFile = preview || value
  const isPDF = fileType === 'application/pdf' || (value && value.includes('.pdf'))

  return (
    <div className="space-y-1">
      {!hasFile ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            onChange={handleFileChange}
            disabled={disabled || isUploading}
            className="hidden"
            id={`upload-${label.replace(/\s/g, '-')}`}
          />
          <label
            htmlFor={`upload-${label.replace(/\s/g, '-')}`}
            className={`flex flex-col items-center justify-center aspect-square border-2 border-dashed rounded-lg transition-all ${
              disabled || isUploading
                ? 'border-slate-700 bg-slate-900 cursor-not-allowed opacity-50' 
                : 'border-slate-600 hover:border-blue-500 hover:bg-slate-800/50 cursor-pointer'
            }`}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                <span className="text-[10px] text-slate-400">Subiendo...</span>
              </div>
            ) : (
              <>
                <Upload className="w-6 h-6 text-slate-500 mb-1" />
                <span className="text-[10px] text-slate-400 text-center px-2">
                  {label}
                </span>
              </>
            )}
          </label>
        </>
      ) : (
        <div className="relative aspect-square bg-slate-950 rounded-lg overflow-hidden border-2 border-emerald-500/30">
          {!disabled && !isUploading && (
            <button
              type="button"
              onClick={handleRemove}
              className="absolute top-1 right-1 p-1 bg-red-500 rounded-full hover:bg-red-600 transition-colors z-10"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          )}
          
          <div className="absolute top-1 left-1 p-1 bg-emerald-500 rounded-full z-10">
            <Check className="w-3 h-3 text-white" />
          </div>

          {isPDF ? (
            <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-slate-800">
              <FileText className="w-12 h-12 text-red-400" />
              <span className="text-[10px] text-slate-300 font-medium">PDF</span>
            </div>
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview || value}
                alt={label}
                className="w-full h-full object-cover"
              />
            </>
          )}
        </div>
      )}

      {error && (
        <p className="text-[10px] text-red-400">{error}</p>
      )}
    </div>
  )
}
