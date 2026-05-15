import { TableSkeleton } from '@/components/prestamos/table-skeleton'

export default function Loading() {
  return (
    <div className="page-container">
      <div className="page-header">
        <div className="h-8 w-64 bg-white/10 rounded animate-pulse" />
        <div className="h-4 w-48 bg-white/5 rounded animate-pulse mt-2" />
      </div>
      <TableSkeleton />
    </div>
  )
}
