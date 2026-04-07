import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { BackButton } from "@/components/ui/back-button"

export default function Loading() {
    return (
        <div className="page-container pb-20 animate-in fade-in duration-500">
            {/* Header Mirror */}
            <div className="page-header">
                <div className="flex items-center gap-3">
                    <BackButton />
                    <div className="space-y-2">
                        <Skeleton className="h-7 w-40 bg-slate-800" />
                        <Skeleton className="h-4 w-24 bg-slate-800/50" />
                    </div>
                </div>
            </div>

            {/* Filter Bar Mirror */}
            <div className="flex flex-col md:flex-row gap-4 mb-8">
                <Skeleton className="h-12 flex-1 rounded-2xl bg-slate-900" />
                <Skeleton className="h-12 w-full md:w-48 rounded-2xl bg-slate-900" />
                <Skeleton className="h-12 w-full md:w-48 rounded-2xl bg-slate-900" />
            </div>

            {/* Table Mirror */}
            <Card className="bg-slate-950 border-slate-800 overflow-hidden rounded-3xl">
                <CardContent className="p-0">
                    <div className="space-y-0.5">
                        <div className="h-12 bg-slate-900/50 border-b border-white/5 flex items-center px-4 gap-4">
                            {[1, 2, 3, 4, 5].map(i => (
                                <Skeleton key={i} className="h-3 flex-1 bg-slate-800" />
                            ))}
                        </div>
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                            <div key={i} className="h-16 border-b border-white/5 flex items-center px-4 gap-4">
                                <div className="flex items-center gap-3 flex-1">
                                    <Skeleton className="h-8 w-8 rounded-lg bg-slate-800" />
                                    <div className="space-y-1">
                                        <Skeleton className="h-3 w-16 bg-slate-800" />
                                        <Skeleton className="h-2 w-12 bg-slate-800" />
                                    </div>
                                </div>
                                <Skeleton className="h-4 flex-1 bg-slate-800" />
                                <Skeleton className="h-4 flex-1 bg-slate-800" />
                                <Skeleton className="h-4 flex-2 bg-slate-800" />
                                <Skeleton className="h-5 w-20 bg-slate-800 ml-auto" />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
