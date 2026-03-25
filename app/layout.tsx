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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body
        className={`${inter.variable} antialiased bg-background text-foreground font-sans`}
      >
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
