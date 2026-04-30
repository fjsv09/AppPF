'use client'

import { useSidebar } from '@/components/providers/sidebar-provider'
import { cn } from '@/lib/utils'

export function DashboardMain({ children }: { children: React.ReactNode }) {
  const { isCollapsed } = useSidebar()

  return (
    <main
      className={cn(
        "transition-all duration-300 p-6 md:p-10 md:pt-14 w-full min-h-screen",
        isCollapsed ? "md:pl-24" : "md:pl-80"
      )}
      style={{
        paddingTop: 'calc(3rem + env(safe-area-inset-top, 0px))',
        paddingBottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {children}
    </main>
  )
}
