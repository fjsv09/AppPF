import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

export function DashboardSkeleton({ 
    withHeader = true, 
    cards = 3, 
    withTable = true 
}: { 
    withHeader?: boolean, 
    cards?: number, 
    withTable?: boolean 
}) {
    return (
        <div className="space-y-6 animate-in fade-in duration-500 p-1">
            {withHeader && (
                <div className="flex flex-col gap-2 mb-8">
                    <Skeleton className="h-8 w-48 bg-slate-800/50" />
                    <Skeleton className="h-4 w-72 bg-slate-800/30" />
                </div>
            )}

            {cards > 0 && (
                <div className={cn(
                    "grid gap-4",
                    cards === 1 ? "grid-cols-1" : 
                    cards === 2 ? "grid-cols-1 md:grid-cols-2" : 
                    "grid-cols-1 md:grid-cols-3"
                )}>
                    {Array.from({ length: cards }).map((_, i) => (
                        <Skeleton key={i} className="h-32 rounded-2xl bg-slate-900/50 border border-white/5" />
                    ))}
                </div>
            )}

            {withTable && (
                <div className="space-y-3 mt-8">
                    <div className="flex items-center gap-4 px-2">
                        <Skeleton className="h-4 w-24 bg-slate-800/40" />
                        <Skeleton className="h-4 w-24 bg-slate-800/40" />
                        <Skeleton className="h-4 w-24 bg-slate-800/40" />
                    </div>
                    <div className="rounded-xl border border-white/5 bg-slate-900/30 overflow-hidden">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="border-b border-white/5 p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-10 w-10 rounded-full bg-slate-800/30" />
                                    <div className="space-y-2">
                                        <Skeleton className="h-3 w-32 bg-slate-800/40" />
                                        <Skeleton className="h-2 w-20 bg-slate-800/20" />
                                    </div>
                                </div>
                                <Skeleton className="h-6 w-16 rounded-lg bg-slate-800/20" />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
