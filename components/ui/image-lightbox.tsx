'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink } from 'lucide-react'

interface ImageLightboxProps {
  src: string
  alt: string
  thumbnail: React.ReactNode
  className?: string
}

export function LightboxModal({ src, alt, isOpen, onClose }: { src: string, alt: string, isOpen: boolean, onClose: () => void }) {
  const isPDF = src.includes('.pdf') || src.includes('application/pdf')

  useEffect(() => {
    if (isOpen) {
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose()
      }
      window.addEventListener('keydown', handleEsc)
      // Prevent scrolling when open
      document.body.style.overflow = 'hidden'
      return () => {
        window.removeEventListener('keydown', handleEsc)
        document.body.style.overflow = ''
      }
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  // Ensure PDF logic is handled at trigger level or handled here differently? 
  // Originally logic opened new tab for PDF *instead* of setting isOpen. 
  // So if isOpen is true, we assume we want to show the modal (image).
  // But let's check just in case.
  if (isPDF) return null 

  return createPortal(
    <div 
        className="fixed inset-0 z-[99999] bg-black/95 flex items-center justify-center p-4 animate-in fade-in duration-200 backdrop-blur-sm cursor-zoom-out touch-none"
        onClick={onClose}
        style={{ pointerEvents: 'auto' }}
        role="dialog"
        aria-modal="true"
    >
        {/* Image Container */}
        <div 
        className="relative w-full h-full flex items-center justify-center p-4 cursor-zoom-out"
        onClick={onClose}
        title="Clic para cerrar"
        >
        <img
            src={src}
            alt={alt}
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl cursor-zoom-out select-none"
            onClick={onClose}
            draggable={false}
        />
        </div>

        {/* Image label */}
        <div 
            className="absolute bottom-10 left-1/2 -translate-x-1/2 px-6 py-3 bg-black/60 backdrop-blur-md rounded-full border border-white/10 pointer-events-none select-none"
        >
        <p className="text-white font-medium text-base">{alt}</p>
        </div>

        {/* Close button - Absolute Top Right (DOM Last for top stack) */}
        <button
        onClick={onClose}
        className="absolute top-6 right-6 z-[100000] flex items-center gap-2 px-6 py-4 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors border border-white/20 backdrop-blur-md cursor-pointer group shadow-2xl pointer-events-auto"
        aria-label="Cerrar"
        >
        <span className="text-base font-bold uppercase tracking-wider hidden sm:inline opacity-90 group-hover:opacity-100">Cerrar</span>
        <X className="w-8 h-8" />
        </button>
    </div>,
    document.body
  )
}

export function ImageLightbox({ src, alt, thumbnail, className }: ImageLightboxProps) {
  const [isOpen, setIsOpen] = useState(false)
  
  const isPDF = src.includes('.pdf') || src.includes('application/pdf')

  const handleOpen = (e: React.MouseEvent) => {
    // Stop propagation to prevent parent interactions
    e.preventDefault()
    e.stopPropagation()
    
    if (isPDF) {
      // Para PDFs, abrir en nueva pestaña
      window.open(src, '_blank', 'noopener,noreferrer')
    } else {
      // Para imágenes, abrir modal
      setIsOpen(true)
    }
  }

  return (
    <>
      <button 
        type="button"
        onClick={handleOpen} 
        onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                handleOpen(e as any)
            }
        }}
        className={`cursor-pointer border-0 bg-transparent p-0 text-left outline-none appearance-none touch-manipulation ${className || ''}`}
        aria-label={`Ver imagen de ${alt}`}
      >
        {thumbnail}
      </button>

      <LightboxModal 
        src={src} 
        alt={alt} 
        isOpen={isOpen} 
        onClose={() => setIsOpen(false)} 
      />
    </>
  )
}
