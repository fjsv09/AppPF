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

export const metadata: Metadata = {
  title: "Sistema de Préstamos y Cobranzas",
  description: "Gestión eficiente de préstamos y clientes",
};

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
