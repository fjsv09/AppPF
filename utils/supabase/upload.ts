import { createClient } from '@/utils/supabase/client'

/**
 * Sube un archivo a Supabase Storage
 * @param file - Archivo a subir
 * @param bucket - Nombre del bucket (default: 'documentos-evaluacion')
 * @param folder - Carpeta dentro del bucket (opcional)
 * @returns URL pública del archivo o null si hay error
 */
export async function uploadFile(
  file: File,
  bucket: string = 'documentos-evaluacion',
  folder?: string
): Promise<string | null> {
  try {
    const supabase = createClient()
    
    // Generar nombre único para el archivo
    const timestamp = Date.now()
    const randomStr = Math.random().toString(36).substring(7)
    const fileExt = file.name.split('.').pop()
    const fileName = `${timestamp}_${randomStr}.${fileExt}`
    
    // Construir path completo
    const filePath = folder ? `${folder}/${fileName}` : fileName
    
    // Subir archivo
    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      })
    
    if (error) {
      console.error('Error subiendo archivo:', error)
      return null
    }
    
    // Obtener URL pública
    const { data: { publicUrl } } = supabase.storage
      .from(bucket)
      .getPublicUrl(filePath)
    
    return publicUrl
  } catch (error) {
    console.error('Error en uploadFile:', error)
    return null
  }
}

/**
 * Elimina un archivo de Supabase Storage
 * @param url - URL pública del archivo
 * @param bucket - Nombre del bucket
 */
export async function deleteFile(
  url: string,
  bucket: string = 'documentos-evaluacion'
): Promise<boolean> {
  try {
    const supabase = createClient()
    
    // Extraer path del archivo de la URL
    const urlParts = url.split(`/${bucket}/`)
    if (urlParts.length < 2) return false
    
    const filePath = urlParts[1]
    
    const { error } = await supabase.storage
      .from(bucket)
      .remove([filePath])
    
    if (error) {
      console.error('Error eliminando archivo:', error)
      return false
    }
    
    return true
  } catch (error) {
    console.error('Error en deleteFile:', error)
    return false
  }
}

/**
 * Sube múltiples archivos en paralelo
 * @param files - Array de archivos a subir
 * @param bucket - Nombre del bucket
 * @param folder - Carpeta dentro del bucket (opcional)
 * @returns Array de URLs públicas (null para archivos que fallaron)
 */
export async function uploadMultipleFiles(
  files: File[],
  bucket: string = 'documentos-evaluacion',
  folder?: string
): Promise<(string | null)[]> {
  const uploadPromises = files.map(file => uploadFile(file, bucket, folder))
  return Promise.all(uploadPromises)
}
