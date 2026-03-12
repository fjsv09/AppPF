import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
        {/* Welcome Hero Skeleton */}
        <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-slate-800 p-8 md:p-10 mb-8 h-64 md:h-48 flex items-center">
            <div className="space-y-4 w-full">
                <Skeleton className="h-10 w-64 bg-slate-800" />
                <Skeleton className="h-6 w-full max-w-lg bg-slate-800" />
            </div>
        </div>

        {/* Admin KPIs Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-40 bg-slate-900 border border-slate-800 rounded-2xl" />
            <Skeleton className="h-40 bg-slate-900 border border-slate-800 rounded-2xl" />
            <Skeleton className="h-40 bg-slate-900 border border-slate-800 rounded-2xl" />
        </div>

        {/* Quick Links / Content Area */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
             <Skeleton className="h-20 bg-slate-900 border border-slate-800 rounded-xl" />
             <Skeleton className="h-20 bg-slate-900 border border-slate-800 rounded-xl" />
             <Skeleton className="h-20 bg-slate-900 border border-slate-800 rounded-xl" />
             <Skeleton className="h-20 bg-slate-900 border border-slate-800 rounded-xl" />
        </div>
    </div>
  )
}
