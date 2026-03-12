import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
        {/* Header Skeleton */}
        <div className="border-b border-white/5 pb-6">
            <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-xl bg-slate-800" />
                <div className="space-y-2">
                    <Skeleton className="h-8 w-64 bg-slate-800" />
                    <Skeleton className="h-4 w-48 bg-slate-800" />
                </div>
            </div>
        </div>

        {/* Alert Stats Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-32 flex flex-col justify-between">
                     <div className="flex justify-between">
                        <Skeleton className="h-4 w-24 bg-slate-800" />
                        <Skeleton className="h-8 w-8 rounded-lg bg-slate-800" />
                     </div>
                     <Skeleton className="h-8 w-16 bg-slate-800" />
                </div>
            ))}
        </div>

        {/* Alerts List Skeleton */}
        <div className="space-y-4">
            <Skeleton className="h-8 w-48 bg-slate-800" />
            
            {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 flex gap-4 items-start">
                     <Skeleton className="h-10 w-10 rounded-full bg-slate-800 shrink-0" />
                     <div className="space-y-2 flex-1">
                         <div className="flex justify-between">
                            <Skeleton className="h-4 w-40 bg-slate-800" />
                            <Skeleton className="h-4 w-24 bg-slate-800" />
                         </div>
                         <Skeleton className="h-3 w-full max-w-lg bg-slate-800" />
                     </div>
                </div>
            ))}
        </div>
    </div>
  )
}
