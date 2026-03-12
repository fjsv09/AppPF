import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
        {/* Header Skeleton */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-56 bg-slate-800" />
                <Skeleton className="h-4 w-40 bg-slate-800" />
            </div>
            <div className="flex gap-3">
                 <Skeleton className="h-10 w-32 bg-slate-800 rounded-lg" />
                 <Skeleton className="h-10 w-32 bg-slate-800 rounded-lg" />
            </div>
        </div>

        {/* Hero / Quick Stats Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
             <Skeleton className="h-32 w-full bg-slate-900 border border-slate-800 rounded-2xl" />
             <Skeleton className="h-32 w-full bg-slate-900 border border-slate-800 rounded-2xl" />
             <Skeleton className="h-32 w-full bg-slate-900 border border-slate-800 rounded-2xl" />
        </div>

        {/* Recent Payments Table Skeleton */}
        <div className="space-y-4 pt-4">
             <Skeleton className="h-6 w-48 bg-slate-800 mb-4" />
             
            <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex gap-4 hidden md:flex">
                    <Skeleton className="h-4 w-32 bg-slate-800" /> {/* Client */}
                    <Skeleton className="h-4 w-24 bg-slate-800" /> {/* Amount */}
                    <Skeleton className="h-4 w-24 bg-slate-800" /> {/* Date */}
                    <Skeleton className="h-4 w-24 bg-slate-800" /> {/* Method */}
                </div>
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="p-4 border-b border-slate-800/50 flex items-center justify-between">
                         <div className="flex items-center gap-3">
                            <Skeleton className="h-10 w-10 rounded-full bg-slate-800" />
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-32 bg-slate-800" />
                                <Skeleton className="h-3 w-16 bg-slate-800" />
                            </div>
                         </div>
                         <Skeleton className="h-5 w-24 bg-slate-800" />
                    </div>
                ))}
            </div>
        </div>
    </div>
  )
}
