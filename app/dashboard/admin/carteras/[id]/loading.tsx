import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"
import { BackButton } from "@/components/ui/back-button"

export default function Loading() {
    return (
        <div className="page-container animate-in fade-in duration-500">
            {/* Header Mirror */}
            <div className="page-header">
                <div className="flex items-center gap-3">
                    <BackButton />
                    <div className="space-y-2">
                        <Skeleton className="h-7 w-48 bg-slate-800" />
                        <Skeleton className="h-4 w-32 bg-slate-800/50" />
                    </div>
                </div>

                <div className="flex items-center gap-2.5 bg-slate-900/40 p-2 rounded-xl border border-slate-800/60 min-w-[220px]">
                    <Skeleton className="h-8 w-8 rounded-full bg-slate-800" />
                    <div className="flex-1 space-y-1">
                        <Skeleton className="h-2 w-12 bg-slate-800" />
                        <Skeleton className="h-3 w-24 bg-slate-800" />
                    </div>
                </div>
            </div>

            {/* KPI Mirror */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="lg:col-span-8 grid grid-cols-2 gap-3">
                    <Card className="bg-slate-950 border-slate-800">
                        <CardContent className="p-4 space-y-3">
                            <Skeleton className="h-3 w-20 bg-slate-800" />
                            <Skeleton className="h-8 w-32 bg-slate-800" />
                        </CardContent>
                    </Card>
                    <Card className="bg-slate-950 border-slate-800">
                        <CardContent className="p-4 space-y-3">
                            <Skeleton className="h-3 w-20 bg-slate-800" />
                            <Skeleton className="h-8 w-32 bg-slate-800" />
                        </CardContent>
                    </Card>
                    <Card className="col-span-2 bg-slate-900/60 border-slate-800 p-3 h-14">
                        <div className="flex justify-between items-center h-full">
                            <div className="flex gap-3 items-center">
                                <Skeleton className="h-8 w-8 rounded-lg bg-slate-800" />
                                <Skeleton className="h-4 w-24 bg-slate-800" />
                            </div>
                            <Skeleton className="h-8 w-20 rounded-lg bg-slate-800" />
                        </div>
                    </Card>
                </div>
                <div className="lg:col-span-4">
                    <Card className="bg-slate-950 border-slate-800 h-full">
                        <CardContent className="p-4 space-y-4">
                            <Skeleton className="h-3 w-16 bg-slate-800" />
                            <Skeleton className="h-10 w-full bg-slate-800" />
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Accounts Mirror */}
            <div className="space-y-4 mt-6">
                <div className="flex justify-between items-end px-1">
                    <Skeleton className="h-5 w-32 bg-slate-800" />
                    <Skeleton className="h-3 w-24 bg-slate-800/50" />
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <Card key={i} className="bg-slate-950 border-slate-800 h-32">
                            <CardContent className="p-4 space-y-4">
                                <div className="flex justify-between">
                                    <Skeleton className="h-3 w-12 bg-slate-800" />
                                    <Skeleton className="h-6 w-6 bg-slate-800" />
                                </div>
                                <Skeleton className="h-8 w-24 bg-slate-800" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    )
}
