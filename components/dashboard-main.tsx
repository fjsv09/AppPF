'use client'

import { useSidebar } from '@/components/providers/sidebar-provider'
import { cn } from '@/lib/utils'

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar()

  return (
    <main className={cn(
      "flex-1 overflow-y-auto overflow-x-hidden transition-all duration-300 p-6 md:p-10 pt-[calc(2.5rem+env(safe-area-inset-top,0px))] pb-24 md:pb-10 w-full h-full custom-scrollbar",
      isCollapsed ? "md:pl-24" : "md:pl-80"
    )}>
      {children}
    </main>
  )
}
