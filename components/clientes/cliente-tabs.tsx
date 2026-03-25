'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { Tabs } from '@/components/ui/tabs'

export function ClienteTabs({ defaultTab, children, className }: {
    defaultTab: string,
    children: React.ReactNode,
    className?: string
}) {
    const router = useRouter()
    const searchParams = useSearchParams()

    const currentTab = searchParams.get('tab') || defaultTab

    const handleTabChange = useCallback((value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', value)
        router.replace(`?${params.toString()}`, { scroll: false })
    }, [searchParams, router])

    return (
        <Tabs value={currentTab} onValueChange={handleTabChange} className={className}>
            {children}
        </Tabs>
    )
}
