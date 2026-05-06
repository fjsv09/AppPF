'use client'

import React, { createContext, useContext, useTransition, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface LoadingContextType {
  isPending: boolean
  loadingTab: string | null
  navigateWithLoading: (tab: string) => void
  updateParams: (updates: Record<string, string | null>) => void
  startTransition: React.TransitionStartFunction
  searchParams: ReturnType<typeof useSearchParams>
  pathname: string
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined)

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [isPending, startTransition] = useTransition()
  const [loadingTab, setLoadingTab] = useState<string | null>(null)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const navigateWithLoading = (tab: string) => {
    setLoadingTab(tab)
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('tab', tab)
      params.set('page', '1')
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  const updateParams = (updates: Record<string, string | null>) => {
    setLoadingTab(null) // Reset loading tab when using general filters
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === '') {
          params.delete(key)
        } else {
          params.set(key, value)
        }
      })
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    })
  }

  return (
    <LoadingContext.Provider value={{ isPending, loadingTab, navigateWithLoading, updateParams, startTransition, searchParams, pathname }}>
      {children}
    </LoadingContext.Provider>
  )
}

export function useLoading() {
  const context = useContext(LoadingContext)
  if (context === undefined) {
    throw new Error('useLoading must be used within a LoadingProvider')
  }
  return context
}
