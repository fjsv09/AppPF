import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton"

export default function Loading() {
    return (
        <div className="space-y-6">
            <DashboardSkeleton withHeader={true} cards={3} withTable={true} />
        </div>
    )
}
