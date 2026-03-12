import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
        {/* Header Skeleton */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
            <div className="space-y-2">
                <Skeleton className="h-8 w-48 bg-slate-800" />
                <Skeleton className="h-4 w-64 bg-slate-800" />
            </div>
            <Skeleton className="h-12 w-40 bg-slate-800 rounded-xl" />
        </div>

        {/* Directory Stats Skeleton (Optional vs Prestamos) - Keeping simple for directory */}
        {/* We can envision the 3-columns cards for "Total Clients", "Active", "Pending" if used */}
        
        {/* Filter Bar Skeleton */}
        <div className="flex flex-wrap gap-4 items-center">
             <Skeleton className="h-10 w-full md:w-64 bg-slate-800 rounded-lg" />
             <div className="flex gap-2">
                <Skeleton className="h-10 w-32 bg-slate-800 rounded-lg" />
                <Skeleton className="h-10 w-32 bg-slate-800 rounded-lg" />
             </div>
        </div>

        {/* Table Skeleton */}
        <div className="space-y-4">
            <div className="border border-slate-800 rounded-xl overflow-hidden">
                <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex gap-4 hidden md:flex">
                    <Skeleton className="h-4 w-32 bg-slate-800" /> {/* Name */}
                    <Skeleton className="h-4 w-24 bg-slate-800" /> {/* DNI */}
                    <Skeleton className="h-4 w-24 bg-slate-800" /> {/* Phone */}
                    <Skeleton className="h-4 w-20 bg-slate-800" /> {/* Status */}
                    <Skeleton className="h-4 w-12 bg-slate-800" /> {/* Actions */}
                </div>
                {/* Rows */}
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="p-4 border-b border-slate-800/50 flex flex-col md:flex-row justify-between md:items-center gap-4">
                        <div className="flex items-center gap-4">
                             <Skeleton className="h-10 w-10 rounded-lg bg-slate-800" />
                             <div className="space-y-2">
                                <Skeleton className="h-4 w-40 bg-slate-800" />
                                <Skeleton className="h-3 w-20 bg-slate-800" />
                             </div>
                        </div>
                        <div className="hidden md:block">
                             <Skeleton className="h-4 w-24 bg-slate-800" />
                        </div>
                         <div className="hidden md:block">
                             <Skeleton className="h-6 w-20 rounded-full bg-slate-800" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    </div>
  )
}
