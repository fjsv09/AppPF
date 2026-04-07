import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton"

export default function Loading() {
    return <DashboardSkeleton withHeader={true} cards={3} withTable={true} />
}
