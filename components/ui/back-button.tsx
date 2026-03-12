'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from './button'

export function BackButton() {
  const router = useRouter()

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => router.back()}
      className="w-10 h-10 rounded-xl bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all shrink-0 hover:scale-105 active:scale-95"
    >
      <ArrowLeft className="w-5 h-5" />
    </Button>
  )
}
