import { DashboardSkeleton } from "@/components/ui/dashboard-skeleton"

export default function Loading() {
    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row gap-6">
                <DashboardSkeleton withHeader={true} cards={0} withTable={false} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 <div className="md:col-span-1">
                    <DashboardSkeleton withHeader={false} cards={1} withTable={false} />
                 </div>
                 <div className="md:col-span-2">
                    <DashboardSkeleton withHeader={false} cards={0} withTable={true} />
                 </div>
            </div>
        </div>
    )
}
