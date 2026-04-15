import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from 'sonner';
import { ProgressProvider } from '@/components/providers/progress-provider';
import { NotificationProvider } from '@/components/providers/notification-provider';

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

import { createAdminClient } from "@/utils/supabase/admin";

export const revalidate = 0

export async function generateMetadata(): Promise<Metadata> {
  const supabase = createAdminClient();
  const { data: config } = await supabase
    .from('configuracion_sistema')
    .select('clave, valor')
    .in('clave', ['nombre_sistema', 'logo_sistema_url']);

  const configMap = config?.reduce((acc: any, item) => {
    acc[item.clave] = item.valor;
    return acc;
  }, {});

  const systemName = configMap?.nombre_sistema || "ProFinanzas";
  const systemLogo = configMap?.logo_sistema_url;

  // Add a timestamp to the logo URL to bust browser cache
  const logoWithTimestamp = systemLogo ? `${systemLogo}${systemLogo.includes('?') ? '&' : '?'}v=${Date.now()}` : undefined;

  return {
    title: {
      default: systemName,
      template: `%s | ${systemName}`,
    },
    description: "Gestión eficiente de préstamos y clientes",
    manifest: '/manifest.json',
    icons: logoWithTimestamp ? {
      icon: [
        { url: logoWithTimestamp, rel: 'icon', type: 'image/png' },
        { url: logoWithTimestamp, rel: 'shortcut icon' },
      ],
      apple: [
        { url: logoWithTimestamp, rel: 'apple-touch-icon' },
      ],
    } : {
      icon: '/favicon.ico', // Fallback to local if no logo is configured
    }
  };
}

import { SWRegistration } from '@/components/providers/sw-registration';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0" />
      </head>
      <body
        className={`${inter.variable} antialiased bg-background text-foreground font-sans`}
      >
        <SWRegistration />
        <ProgressProvider>
          <NotificationProvider>
            {children}
          </NotificationProvider>
        </ProgressProvider>
        <Toaster position="top-center" richColors theme="dark" />
      </body>
    </html>
  );
}
