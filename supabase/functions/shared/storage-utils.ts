// =====================================================
// UTILIDAD: Manejo de Imágenes con Supabase Storage
// Optimización automática + validación
// =====================================================

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

interface UploadImageOptions {
  clienteId: string
  tipoDocumento: 'cedula' | 'comprobante_domicilio' | 'foto_perfil' | 'otro'
  file: File
  maxSizeKB?: number // default 5120 (5MB)
}

interface UploadResult {
  success: boolean
  data?: {
    archivoId: string
    publicUrl?: string
    path: string
  }
  error?: string
}

// =====================================================
// FUNCIÓN: Comprimir imagen antes de subir
// =====================================================

async function compressImage(file: File, maxSizeKB: number = 5120): Promise<Blob> {
  // Si es PDF, no comprimir
  if (file.type === 'application/pdf') {
    return file
  }

  // Si ya es pequeño, retornar original
  if (file.size / 1024 < maxSizeKB) {
    return file
  }

  // Aquí usarías una librería de compresión
  // Para backend, retornamos el original
  // La compresión debe hacerse en el FRONTEND
  return file
}

// =====================================================
// FUNCIÓN: Validar tipo de archivo
// =====================================================

function validateFileType(mimeType: string): boolean {
  const allowedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'application/pdf'
  ]
  return allowedTypes.includes(mimeType)
}

// =====================================================
// FUNCIÓN PRINCIPAL: Subir imagen con auditoría
// =====================================================

export async function uploadImage(options: UploadImageOptions): Promise<UploadResult> {
  const { clienteId, tipoDocumento, file, maxSizeKB = 5120 } = options

  try {
    // 1. Validar tipo de archivo
    if (!validateFileType(file.type)) {
      return {
        success: false,
        error: 'Tipo de archivo no permitido'
      }
    }

    // 2. Validar tamaño
    const sizeMB = file.size / (1024 * 1024)
    if (sizeMB > 5) {
      return {
        success: false,
        error: 'El archivo excede el tamaño máximo de 5MB'
      }
    }

    // 3. Generar nombre único con timestamp
    const timestamp = Date.now()
    const extension = file.name.split('.').pop()
    const fileName = `${tipoDocumento}_${timestamp}.${extension}`
    const storagePath = `${clienteId}/${fileName}`

    // 4. Subir a Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documentos-clientes')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type
      })

    if (uploadError) {
      console.error('Error al subir archivo:', uploadError)
      return {
        success: false,
        error: uploadError.message
      }
    }

    // 5. Registrar en base de datos para auditoría
    const { data: registroData, error: registroError } = await supabase
      .rpc('registrar_archivo_subido', {
        p_cliente_id: clienteId,
        p_storage_path: storagePath,
        p_tipo_documento: tipoDocumento,
        p_mime_type: file.type,
        p_tamaño_bytes: file.size
      })

    if (registroError) {
      console.error('Error al registrar archivo:', registroError)
      // Intentar eliminar archivo subido
      await supabase.storage
        .from('documentos-clientes')
        .remove([storagePath])

      return {
        success: false,
        error: 'Error al registrar archivo en auditoría'
      }
    }

    // 6. Generar URL pública (si es bucket público) o firmada
    const { data: urlData } = await supabase.storage
      .from('documentos-clientes')
      .createSignedUrl(storagePath, 3600) // URL válida por 1 hora

    return {
      success: true,
      data: {
        archivoId: registroData,
        publicUrl: urlData?.signedUrl,
        path: storagePath
      }
    }

  } catch (error) {
    console.error('Error inesperado:', error)
    return {
      success: false,
      error: 'Error inesperado al subir archivo'
    }
  }
}

// =====================================================
// FUNCIÓN: Obtener URL firmada de archivo existente
// =====================================================

export async function getSignedUrl(path: string, expiresIn: number = 3600): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('documentos-clientes')
      .createSignedUrl(path, expiresIn)

    if (error) {
      console.error('Error al generar URL firmada:', error)
      return null
    }

    return data.signedUrl
  } catch (error) {
    console.error('Error inesperado:', error)
    return null
  }
}

// =====================================================
// FUNCIÓN: Eliminar archivo (soft delete)
// =====================================================

export async function deleteImage(archivoId: string): Promise<boolean> {
  try {
    // 1. Obtener información del archivo
    const { data: archivo, error: fetchError } = await supabase
      .from('archivos_clientes')
      .select('storage_path')
      .eq('id', archivoId)
      .single()

    if (fetchError || !archivo) {
      console.error('Archivo no encontrado:', fetchError)
      return false
    }

    // 2. Eliminar de Storage
    const { error: deleteError } = await supabase.storage
      .from('documentos-clientes')
      .remove([archivo.storage_path])

    if (deleteError) {
      console.error('Error al eliminar de storage:', deleteError)
      return false
    }

    // 3. Marcar como eliminado en DB (soft delete)
    const { error: updateError } = await supabase
      .from('archivos_clientes')
      .update({
        eliminado: true,
        eliminado_en: new Date().toISOString(),
        eliminado_por: (await supabase.auth.getUser()).data.user?.id
      })
      .eq('id', archivoId)

    if (updateError) {
      console.error('Error al actualizar registro:', updateError)
      return false
    }

    return true

  } catch (error) {
    console.error('Error inesperado:', error)
    return false
  }
}

// =====================================================
// FUNCIÓN: Listar archivos de un cliente
// =====================================================

export async function listClientFiles(clienteId: string) {
  try {
    const { data, error } = await supabase
      .from('archivos_clientes')
      .select('*')
      .eq('cliente_id', clienteId)
      .eq('eliminado', false)
      .order('subido_en', { ascending: false })

    if (error) {
      console.error('Error al listar archivos:', error)
      return []
    }

    // Generar URLs firmadas para cada archivo
    const archivosConUrl = await Promise.all(
      data.map(async (archivo) => {
        const url = await getSignedUrl(archivo.storage_path)
        return {
          ...archivo,
          url
        }
      })
    )

    return archivosConUrl

  } catch (error) {
    console.error('Error inesperado:', error)
    return []
  }
}
