import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Configuración de Feriados'
}

export default function FeriadosLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
