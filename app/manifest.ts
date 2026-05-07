import { MetadataRoute } from 'next'
import { getSystemConfig } from '@/lib/config-cache'

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const configMap = await getSystemConfig()
  const systemName = configMap?.nombre_sistema || 'ProFinanzas'
  return {
    name: `App ${systemName}`,
    short_name: systemName,
    description: 'Sistema de Gestión de Préstamos y Cobranzas',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#3b82f6',
    icons: [
      {
        src: '/api/pwa-icon?size=192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/api/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/api/pwa-icon?size=512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
