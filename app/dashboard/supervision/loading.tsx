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

        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
             {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl h-32 flex flex-col justify-between">
                     <div className="flex items-center gap-3 mb-4">
                        <Skeleton className="h-10 w-10 rounded-xl bg-slate-800" />
                        <Skeleton className="h-4 w-24 bg-slate-800" />
                     </div>
                     <Skeleton className="h-10 w-20 bg-slate-800" />
                </div>
             ))}
        </div>

        {/* Table Skeleton */}
        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
             <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                 <div className="flex items-center gap-2">
                     <Skeleton className="h-5 w-5 rounded bg-slate-800" />
                     <Skeleton className="h-6 w-48 bg-slate-800" />
                 </div>
             </div>

             <div className="p-4 bg-slate-800/50 border-b border-slate-800 flex gap-4 hidden md:flex">
                <Skeleton className="h-4 w-32 bg-slate-800" /> {/* Asesor */}
                <Skeleton className="h-4 w-20 bg-slate-800" /> {/* Clientes */}
                <Skeleton className="h-4 w-32 bg-slate-800" /> {/* Prestamos */}
                <Skeleton className="h-4 w-24 bg-slate-800" /> {/* Capital */}
                <Skeleton className="h-4 w-24 bg-slate-800" /> {/* Mora */}
                <Skeleton className="h-4 w-24 bg-slate-800" /> {/* Estado */}
             </div>
             
             {[1, 2, 3, 4].map((i) => (
                <div key={i} className="p-6 border-b border-slate-800/50 flex flex-col md:flex-row justify-between items-center gap-4">
                     <div className="flex items-center gap-3 w-full md:w-auto">
                        <Skeleton className="h-10 w-10 rounded-full bg-slate-800" />
                        <Skeleton className="h-5 w-40 bg-slate-800" />
                     </div>
                     <div className="flex gap-8 w-full md:w-auto justify-between">
                         <Skeleton className="h-5 w-12 bg-slate-800" />
                         <Skeleton className="h-5 w-24 bg-slate-800" />
                         <Skeleton className="h-5 w-24 bg-slate-800" />
                         <Skeleton className="h-6 w-20 rounded-full bg-slate-800" />
                     </div>
                </div>
             ))}
        </div>
    </div>
  )
}
