'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useTransition } from 'react'
import { Tabs } from '@/components/ui/tabs'
import { Loader2 } from 'lucide-react'

export function TareasTabs({ defaultTab, children, className }: {
    defaultTab: string,
    children: React.ReactNode,
    className?: string
}) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()

    const currentTab = searchParams.get('tab') || defaultTab

    const handleTabChange = useCallback((value: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('tab', value)
        
        startTransition(() => {
            router.replace(`?${params.toString()}`, { scroll: false })
        })
    }, [searchParams, router])

    return (
        <div className="relative">
            <Tabs value={currentTab} onValueChange={handleTabChange} className={className}>
                {children}
            </Tabs>
            
            {isPending && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/20 backdrop-blur-[1px] rounded-xl animate-in fade-in duration-200">
                    <div className="bg-slate-900/80 border border-white/10 p-3 rounded-full shadow-2xl">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                    </div>
                </div>
            )}
        </div>
    )
}
