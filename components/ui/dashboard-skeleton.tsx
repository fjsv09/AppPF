import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"

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
        <div className="relative space-y-6 animate-in fade-in duration-700 p-1 min-h-[60vh]">


            {withHeader && (
                <div className="flex flex-col gap-2 mb-8 opacity-40">
                    <Skeleton className="h-8 w-48 bg-slate-700/40" />
                    <Skeleton className="h-4 w-72 bg-slate-700/20" />
                </div>
            )}

            {cards > 0 && (
                <div className={cn(
                    "grid gap-4 opacity-30",
                    cards === 1 ? "grid-cols-1" :
                        cards === 2 ? "grid-cols-1 md:grid-cols-2" :
                            "grid-cols-1 md:grid-cols-3"
                )}>
                    {Array.from({ length: cards }).map((_, i) => (
                        <Skeleton key={i} className="h-32 rounded-2xl bg-slate-800/40 border border-white/5" />
                    ))}
                </div>
            )}

            {withTable && (
                <div className="space-y-3 mt-8 opacity-25">
                    <div className="flex items-center gap-4 px-2">
                        <Skeleton className="h-4 w-24 bg-slate-700/30" />
                        <Skeleton className="h-4 w-24 bg-slate-700/30" />
                        <Skeleton className="h-4 w-24 bg-slate-700/30" />
                    </div>
                    <div className="rounded-xl border border-white/5 bg-slate-900/30 overflow-hidden">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="border-b border-white/5 p-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <Skeleton className="h-10 w-10 rounded-full bg-slate-700/20" />
                                    <div className="space-y-2">
                                        <Skeleton className="h-3 w-32 bg-slate-700/30" />
                                        <Skeleton className="h-2 w-20 bg-slate-700/10" />
                                    </div>
                                </div>
                                <Skeleton className="h-6 w-16 rounded-lg bg-slate-700/10" />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    )
}
