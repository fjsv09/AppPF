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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Calendar / Date Picker Section Skeleton */}
            <div className="md:col-span-1 space-y-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                     <Skeleton className="h-6 w-32 bg-slate-800 mb-4" />
                     <Skeleton className="h-64 w-full bg-slate-800 rounded-xl" />
                     <div className="mt-4 space-y-3">
                         <Skeleton className="h-10 w-full bg-slate-800 rounded-lg" />
                         <Skeleton className="h-10 w-full bg-slate-800 rounded-lg" />
                     </div>
                </div>
            </div>

            {/* List Section Skeleton */}
            <div className="md:col-span-2 space-y-6">
                 <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
                      <div className="flex justify-between mb-6">
                          <Skeleton className="h-6 w-48 bg-slate-800" />
                          <Skeleton className="h-8 w-24 bg-slate-800 rounded-lg" />
                      </div>
                      
                      <div className="space-y-3">
                          {[1, 2, 3, 4].map(i => (
                             <div key={i} className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
                                  <div className="flex items-center gap-4">
                                       <Skeleton className="h-12 w-12 rounded-lg bg-slate-800" />
                                       <div className="space-y-2">
                                            <Skeleton className="h-4 w-40 bg-slate-800" />
                                            <Skeleton className="h-3 w-24 bg-slate-800" />
                                       </div>
                                  </div>
                                  <Skeleton className="h-8 w-8 rounded-lg bg-slate-800" />
                             </div>
                          ))}
                      </div>
                 </div>
            </div>
        </div>
    </div>
  )
}
