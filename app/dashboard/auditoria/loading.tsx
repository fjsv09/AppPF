import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-4xl mx-auto">
        {/* Header Skeleton */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-white/5">
            <div>
                <div className="flex items-center gap-3">
                     <Skeleton className="h-8 w-8 rounded-full bg-slate-800" />
                     <Skeleton className="h-8 w-64 bg-slate-800" />
                </div>
                <Skeleton className="h-4 w-96 bg-slate-800 mt-2" />
            </div>
        </div>

        {/* Timeline Skeleton */}
        <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-800 before:to-transparent">
            {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                    
                    {/* Timeline Dot Skeleton */}
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-slate-800 bg-slate-900 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                        <Skeleton className="w-5 h-5 rounded-full bg-slate-800" />
                    </div>

                    {/* Content Card Skeleton */}
                    <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-slate-900/40 p-4 rounded-xl border border-slate-800">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <Skeleton className="h-5 w-48 bg-slate-800" />
                                <Skeleton className="h-5 w-16 bg-slate-950 rounded" />
                            </div>
                            
                            <Skeleton className="h-4 w-full bg-slate-800 mt-1" />
                            <Skeleton className="h-4 w-3/4 bg-slate-800" />

                            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/5">
                                <Skeleton className="h-4 w-24 bg-slate-800" />
                                <Skeleton className="h-4 w-24 bg-slate-800" />
                                <Skeleton className="h-5 w-20 bg-slate-800 ml-auto" />
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    </div>
  )
}
