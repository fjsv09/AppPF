import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Notificaciones'
}

export default function NotificacionesLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
