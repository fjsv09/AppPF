# 🚀 GUÍA RÁPIDA DE IMPLEMENTACIÓN
## Sistema de Almacenamiento de Imágenes - AppPF

---

## ✅ PASO 1: Aplicar Migración SQL

### Opción A: Desde Supabase Dashboard (Recomendado)

1. Ir a: https://kaxwuclrddyeetflneil.supabase.co/project/kaxwuclrddyeetflneil/sql/new
2. Copiar todo el contenido de: `supabase/migrations/20260214_almacenamiento_imagenes.sql`
3. Pegar en el editor SQL
4. Clic en **"Run"**
5. Verificar que dice: "Success. No rows returned"

### Opción B: Desde Terminal

```powershell
# Desde c:\Users\fjsvc\Desktop\AppPF
supabase db push
```

---

## ✅ PASO 2: Verificar Configuración

1. Ir a: https://kaxwuclrddyeetflneil.supabase.co/project/kaxwuclrddyeetflneil/storage/buckets
2. Deberías ver 2 buckets:
   - ✅ `documentos-clientes` (privado)
   - ✅ `avatares` (público)

3. En SQL Editor, ejecutar: `supabase/migrations/verificar_almacenamiento.sql`
4. Todas las consultas deben devolver resultados válidos

---

## ✅ PASO 3: Probar Upload

### Test Manual desde Dashboard:

1. Ir a: Storage → documentos-clientes
2. Intentar subir un archivo manualmente
3. Debería crear carpeta con formato: `{cliente_id}/archivo.jpg`

### Test desde la App:

1. Navegar a: `/dashboard/clientes/[id]/documentos`
2. Seleccionar un archivo (imagen o PDF)
3. Verificar que se comprime automáticamente
4. Subir
5. Debe aparecer en la galería

---

## ✅ PASO 4: Verificar Seguridad (RLS)

### Como Admin/Asesor:
- ✅ Puedes subir archivos
- ✅ Ves todos los documentos de todos los clientes

### Como Cliente:
- ❌ NO puedes subir archivos (bloqueado por RLS)
- ✅ Solo ves tus propios documentos

**Test:**
```sql
-- Cambiar usuario en Supabase Dashboard (Authentication → Users → Impersonate)
-- Intentar acceder a documentos de otro cliente
-- Debería devolver 0 filas
```

---

## 📁 ARCHIVOS CREADOS

```
AppPF/
├── supabase/
│   ├── migrations/
│   │   ├── 20260214_almacenamiento_imagenes.sql    ← MIGRACIÓN PRINCIPAL
│   │   └── verificar_almacenamiento.sql             ← SCRIPT DE VERIFICACIÓN
│   └── functions/
│       └── shared/
│           └── storage-utils.ts                     ← UTILIDADES BACKEND
├── components/
│   ├── image-upload.tsx                            ← COMPONENTE DE UPLOAD
│   └── image-gallery.tsx                           ← GALERÍA CON LAZY LOADING
├── app/
│   └── dashboard/
│       └── clientes/
│           └── [id]/
│               └── documentos/
│                   └── page.tsx                    ← PÁGINA DE EJEMPLO
└── .agent/
    └── ALMACENAMIENTO_IMAGENES.md                  ← DOCUMENTACIÓN COMPLETA
```

---

## 🎯 USO EN PÁGINAS EXISTENTES

### En cualquier página de cliente:

```tsx
import ImageUpload from '@/components/image-upload'
import ImageGallery from '@/components/image-gallery'

// En tu JSX:
<ImageUpload 
  clienteId={cliente.id}
  tipoDocumento="cedula"
  onUploadComplete={() => {
    // Recargar galería o hacer algo
  }}
/>

<ImageGallery 
  clienteId={cliente.id}
  editable={userRole !== 'cliente'} 
/>
```

---

## 💰 COSTES ESTIMADOS

| Clientes | Almacenamiento | Transferencia/mes | **Coste Mensual** |
|----------|----------------|-------------------|-------------------|
| 100      | 0.3GB          | 1GB               | **$0.10** (Gratis) |
| 500      | 1.5GB          | 5GB               | **$0.50** |
| 2000     | 6GB            | 20GB              | **$2.00** |

**Plan Supabase:**
- Free: 1GB storage, 2GB bandwidth
- Pro: $25/mes incluye 100GB storage, 200GB bandwidth

**Conclusión:** Estarás en el plan gratuito por un buen tiempo 🎉

---

## 🔧 OPTIMIZACIONES IMPLEMENTADAS

✅ **Compresión automática en cliente** (reduce 70-85%)  
✅ **Lazy loading de imágenes** (solo carga al ver)  
✅ **URLs firmadas temporales** (seguridad adicional)  
✅ **Límites de tamaño estrictos** (5MB documentos, 500KB avatares)  
✅ **Validación de tipos MIME** (solo JPEG, PNG, WEBP, PDF)  
✅ **Auditoría completa** (tabla `archivos_clientes`)  
✅ **Soft delete** (no borra, marca como eliminado)  

---

## 🚨 TROUBLESHOOTING

### Error: "No se pudo subir archivo"

**Causa:** Políticas RLS bloqueando upload

**Solución:**
```sql
-- Verificar tu rol
SELECT rol FROM perfiles WHERE id = auth.uid();

-- Debe ser 'admin', 'supervisor' o 'asesor'
```

### Error: "Archivo demasiado grande"

**Causa:** Archivo excede 5MB

**Solución:**
- Comprimir imagen antes de subir (el componente lo hace automáticamente)
- Si sigue fallando, verificar límite del bucket:

```sql
SELECT file_size_limit FROM storage.buckets WHERE id = 'documentos-clientes';
-- Debe devolver: 5242880 (5MB)
```

### Error: "Tipo de archivo no permitido"

**Causa:** Formato no soportado

**Solución:**
```sql
SELECT allowed_mime_types FROM storage.buckets WHERE id = 'documentos-clientes';
-- Debe incluir: image/jpeg, image/png, image/webp, application/pdf
```

---

## 📚 RECURSOS

- [Documentación Completa](../.agent/ALMACENAMIENTO_IMAGENES.md)
- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
- [Dashboard Storage](https://kaxwuclrddyeetflneil.supabase.co/project/kaxwuclrddyeetflneil/storage/buckets)

---

## ✨ PRÓXIMOS PASOS (Opcional)

1. **OCR para Cédulas** - Extraer datos automáticamente
2. **Detección de Duplicados** - Evitar subir misma imagen 2 veces
3. **Backup Automático** - Exportar a S3 o Google Drive cada mes
4. **Compresión AVIF** - Formato aún más eficiente (requiere conversión)

---

**Creado:** 2026-02-14  
**Sistema:** AppPF - Préstamos y Cobranzas  
**Autor:** Antigravity AI  
**Stack:** Next.js + Supabase Storage
