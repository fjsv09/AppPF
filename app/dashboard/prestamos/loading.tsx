import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
        {/* Header Skeleton */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-64 bg-slate-800" />
                <Skeleton className="h-4 w-48 bg-slate-800" />
            </div>
            <Skeleton className="h-12 w-40 bg-slate-800 rounded-xl" />
        </div>

        {/* Hero Stats Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-48 flex flex-col justify-between">
                    <div className="flex justify-between items-start">
                        <Skeleton className="h-4 w-24 bg-slate-800" />
                        <Skeleton className="h-8 w-8 rounded-full bg-slate-800" />
                    </div>
                    <div>
                        <Skeleton className="h-10 w-32 bg-slate-800 mb-2" />
                        <Skeleton className="h-4 w-20 bg-slate-800" />
                    </div>
                </div>
            ))}
        </div>

        {/* Table Skeleton */}
        <div className="space-y-4">
            <div className="flex gap-2 mb-6">
                <Skeleton className="h-10 w-full md:w-64 bg-slate-800" />
                <Skeleton className="h-10 w-32 bg-slate-800" />
            </div>
            <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex gap-4">
                    {[1, 2, 3, 4, 5].map((i) => (
                        <Skeleton key={i} className="h-4 w-24 bg-slate-800" />
                    ))}
                </div>
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-4 border-b border-slate-800/50 flex gap-4">
                        <Skeleton className="h-12 w-full bg-slate-800" />
                    </div>
                ))}
            </div>
        </div>
    </div>
  )
}
