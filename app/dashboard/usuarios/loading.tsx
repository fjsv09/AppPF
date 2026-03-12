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
            <Skeleton className="h-10 w-32 bg-slate-800 rounded-lg" />
        </div>

        {/* User Stats / Hero Skeleton (Optional if exists) */}
        
        {/* Table Skeleton */}
        <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/50">
             <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/50">
                <Skeleton className="h-6 w-32 bg-slate-800" />
             </div>
             
             <div className="p-4 bg-slate-900/50 border-b border-slate-800 flex gap-4 hidden md:flex">
                <Skeleton className="h-4 w-32 bg-slate-800" /> {/* Name */}
                <Skeleton className="h-4 w-24 bg-slate-800" /> {/* Email */}
                <Skeleton className="h-4 w-20 bg-slate-800" /> {/* Role */}
                <Skeleton className="h-4 w-20 bg-slate-800" /> {/* Status */}
                <Skeleton className="h-4 w-24 bg-slate-800" /> {/* Created */}
             </div>
             
             {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="p-4 border-b border-slate-800/50 flex flex-col md:flex-row justify-between items-center gap-4">
                     <div className="flex items-center gap-3 w-full md:w-auto">
                        <Skeleton className="h-10 w-10 rounded-full bg-slate-800" />
                        <div className="space-y-2">
                             <Skeleton className="h-4 w-40 bg-slate-800" />
                             <Skeleton className="h-3 w-32 bg-slate-800" />
                        </div>
                     </div>
                     <div className="flex gap-4 w-full md:w-auto justify-between md:justify-end">
                         <Skeleton className="h-6 w-20 rounded-full bg-slate-800" />
                         <Skeleton className="h-6 w-24 rounded-full bg-slate-800" />
                         <Skeleton className="h-8 w-8 rounded-lg bg-slate-800" />
                     </div>
                </div>
             ))}
        </div>
    </div>
  )
}
