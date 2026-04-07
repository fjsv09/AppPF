import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton"

export default function Loading() {
    return (
        <div className="space-y-6">
            <DashboardSkeleton withHeader={true} cards={0} withTable={false} />
            <div className="h-12 w-full bg-slate-900/50 rounded-xl border border-white/5 animate-pulse" />
            <DashboardSkeleton withHeader={false} cards={1} withTable={true} />
        </div>
    )
}
