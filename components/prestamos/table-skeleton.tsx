import { Loader2 } from "lucide-react"

export const TableSkeleton = () => (
    <div className="space-y-6 animate-pulse">
        {/* Filter Bar Skeleton */}
        <div className="h-14 w-full bg-slate-900/40 border border-slate-800/60 rounded-xl mb-4" />

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 opacity-40">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                    <div className="h-3 w-16 bg-slate-800 rounded-full mb-3" />
                    <div className="h-6 w-24 bg-slate-800 rounded-md" />
                </div>
            ))}
        </div>

        <div className="bg-slate-900/50 border border-slate-800/60 rounded-2xl overflow-hidden relative min-h-[400px]">
            <div className="h-12 bg-slate-800/30 border-b border-slate-800" />
            {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="p-5 border-b border-slate-800 flex items-center justify-between opacity-20">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-slate-700 rounded-xl" />
                        <div className="space-y-2">
                            <div className="h-4 w-40 bg-slate-700 rounded-md" />
                            <div className="h-3 w-28 bg-slate-700/50 rounded-md" />
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="h-6 w-20 bg-slate-700 rounded-md" />
                        <div className="h-8 w-8 bg-slate-700 rounded-lg" />
                    </div>
                </div>
            ))}
        </div>
    </div>
)
