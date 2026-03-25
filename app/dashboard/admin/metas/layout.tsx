import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Gestión de Metas'
}

export default function AdminMetasLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
