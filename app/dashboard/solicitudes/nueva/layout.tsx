import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Nueva Solicitud (Wizard)'
}

export default function NuevaSolicitudLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
