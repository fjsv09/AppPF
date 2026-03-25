import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Sectores de Clientes'
}

export default function SectoresLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
