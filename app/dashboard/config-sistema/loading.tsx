import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton"

export default function Loading() {
    return (
        <div className="space-y-8 p-1">
             <DashboardSkeleton withHeader={true} cards={0} withTable={false} />
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 9 }).map((_, i) => (
                    <DashboardSkeleton key={i} withHeader={false} cards={1} withTable={false} />
                ))}
             </div>
        </div>
    )
}
