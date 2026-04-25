'use client'

import { PaginationControlled } from '@/components/ui/pagination-controlled'
import { useRouter, useSearchParams } from 'next/navigation'

interface MovementsPaginationProps {
  totalPages: number
  currentPage: number
  totalRecords: number
}

export function MovementsPagination({
  totalPages,
  currentPage,
  totalRecords
}: MovementsPaginationProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    router.push(`?${params.toString()}`, { scroll: false })
  }

  return (
    <div className="p-4 border-t border-white/5">
      <PaginationControlled
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        totalRecords={totalRecords}
        pageSize={10}
      />
    </div>
  )
}
