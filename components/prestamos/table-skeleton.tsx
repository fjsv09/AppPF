export const TableSkeleton = () => (
    <div className="animate-pulse space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div className="space-y-2">
                <div className="h-8 w-48 bg-slate-800 rounded-lg" />
                <div className="h-4 w-64 bg-slate-800/50 rounded-lg" />
            </div>
            <div className="flex gap-2">
                <div className="h-10 w-24 bg-slate-800 rounded-xl" />
                <div className="h-10 w-32 bg-slate-800 rounded-xl" />
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-24 bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
                    <div className="h-3 w-16 bg-slate-800 rounded-full mb-3" />
                    <div className="h-6 w-24 bg-slate-800 rounded-md" />
                </div>
            ))}
        </div>

        <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="h-12 bg-slate-800/30 border-b border-slate-800" />
            {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="p-4 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="h-10 w-10 bg-slate-800 rounded-xl" />
                        <div className="space-y-2">
                            <div className="h-4 w-32 bg-slate-800 rounded-md" />
                            <div className="h-3 w-24 bg-slate-800/50 rounded-md" />
                        </div>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="hidden md:block space-y-2">
                            <div className="h-4 w-20 bg-slate-800 rounded-md" />
                            <div className="h-3 w-16 bg-slate-800/50 rounded-md" />
                        </div>
                        <div className="h-6 w-16 bg-slate-800 rounded-md" />
                    </div>
                </div>
            ))}
        </div>
    </div>
)
