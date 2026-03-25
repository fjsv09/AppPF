import { Metadata } from 'next'

export const metadata: Metadata = {
    title: 'Auditoría y Control'
}

export default function AuditoriaLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
