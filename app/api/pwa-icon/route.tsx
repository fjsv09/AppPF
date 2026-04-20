import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'

// Edge runtime is required for ImageResponse to work reliably
export const runtime = 'edge'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const size = Math.min(Math.max(parseInt(searchParams.get('size') || '512', 10), 64), 1024)
    const format = searchParams.get('format') || 'png' // 'png' or 'svg'

    // Fetch logo URL from Supabase using REST API (Edge-compatible)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    let logoUrl = ''
    if (supabaseUrl && supabaseKey) {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/configuracion_sistema?clave=eq.logo_sistema_url&select=valor`,
          {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
            },
          }
        )
        if (res.ok) {
          const data = await res.json()
          logoUrl = data?.[0]?.valor || ''
        }
      } catch (e) {
        console.error('Failed to fetch config:', e)
      }
    }

    // If SVG format is requested, return SVG (for non-Apple use cases)
    if (format === 'svg') {
      let logoDataUri = ''
      if (logoUrl) {
        try {
          const logoRes = await fetch(logoUrl)
          if (logoRes.ok) {
            const buffer = await logoRes.arrayBuffer()
            const contentType = logoRes.headers.get('content-type') || 'image/png'
            const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
            logoDataUri = `data:${contentType};base64,${base64}`
          }
        } catch (e) { /* fallback to text */ }
      }

      const padding = Math.round(size * 0.175)
      const logoSize = size - (padding * 2)
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
        <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:#0f172a"/><stop offset="50%" style="stop-color:#1e293b"/><stop offset="100%" style="stop-color:#0f172a"/></linearGradient></defs>
        <rect width="${size}" height="${size}" fill="url(#bg)"/>
        ${logoDataUri
          ? `<image x="${padding}" y="${padding}" width="${logoSize}" height="${logoSize}" href="${logoDataUri}" preserveAspectRatio="xMidYMid meet"/>`
          : `<text x="${size/2}" y="${size/2}" fill="white" font-size="${Math.round(size * 0.35)}" font-weight="bold" font-family="Arial,sans-serif" text-anchor="middle" dominant-baseline="central">PF</text>`
        }
      </svg>`

      return new NextResponse(svg, {
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      })
    }

    // PNG format: Use ImageResponse (generates actual PNG via satori + resvg)
    const logoSize = Math.round(size * 0.6)

    return new ImageResponse(
      (
        <div
          style={{
            width: size,
            height: size,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)',
          }}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              width={logoSize}
              height={logoSize}
              style={{
                objectFit: 'contain',
              }}
            />
          ) : (
            <div
              style={{
                fontSize: Math.round(size * 0.35),
                fontWeight: 'bold',
                color: 'white',
                letterSpacing: 4,
                display: 'flex',
              }}
            >
              PF
            </div>
          )}
        </div>
      ),
      {
        width: size,
        height: size,
        headers: {
          'Cache-Control': 'public, max-age=3600, s-maxage=3600',
        },
      },
    )
  } catch (err) {
    console.error('PWA icon generation error:', err)
    return new NextResponse('Error generating icon', { status: 500 })
  }
}
