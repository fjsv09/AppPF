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
  accept = 'image/jpeg,image/jpg,image/png,image/webp,application/pdf',
  maxSizeMB = 2,
  folder = 'evaluaciones',
  bucket = 'documentos-evaluacion'
}: SimpleImageUploadProps) {
  const [preview, setPreview] = useState<string>(value || '')
  const [fileType, setFileType] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    setError(null)
    setIsUploading(true)
    setFileType(selectedFile.type)

    try {
      // Validar tamaño
      const sizeMB = selectedFile.size / (1024 * 1024)
      if (sizeMB > maxSizeMB) {
        setError(`Archivo muy grande. Máximo ${maxSizeMB}MB`)
        setIsUploading(false)
        return
      }

      // Generar preview local inmediatamente (solo para imágenes)
      if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onloadend = () => {
          setPreview(reader.result as string)
        }
        reader.readAsDataURL(selectedFile)
      }

      // Subir archivo a Supabase Storage
      const publicUrl = await uploadFile(selectedFile, bucket, folder)
      
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
            <img
              src={preview || value}
              alt={label}
              className="w-full h-full object-cover"
            />
          )}
        </div>
      )}

      {error && (
        <p className="text-[10px] text-red-400">{error}</p>
      )}
    </div>
  )
}
