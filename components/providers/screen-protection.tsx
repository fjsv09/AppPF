'use client'

import { useEffect, useState, useCallback } from 'react'

/**
 * ScreenProtection — Provider global that prevents screenshots
 * 
 * Techniques used:
 * 1. CSS: -webkit-user-select: none, user-select: none
 * 2. CSS: @media print { display: none }
 * 3. JS: Block PrintScreen, Ctrl+Shift+S, Ctrl+P, etc.
 * 4. JS: Detect visibility change (switching apps) → blur content
 * 5. JS: Block right-click contextmenu
 * 6. CSS: Watermark overlay as deterrent
 */
export function ScreenProtection({ children, userName }: { children: React.ReactNode; userName?: string }) {
    const [isBlurred, setIsBlurred] = useState(false)

    // Handle visibility change — blur content when app is not focused
    const handleVisibilityChange = useCallback(() => {
        if (document.visibilityState === 'hidden') {
            setIsBlurred(true)
        } else {
            // Small delay to prevent flash on resume
            setTimeout(() => setIsBlurred(false), 300)
        }
    }, [])

    // Block screenshot-related key combos
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        // PrintScreen
        if (e.key === 'PrintScreen') {
            e.preventDefault()
            setIsBlurred(true)
            setTimeout(() => setIsBlurred(false), 2000)
            return false
        }
        
        // Ctrl+Shift+S (save as / screenshot in some tools)
        if (e.ctrlKey && e.shiftKey && e.key === 'S') {
            e.preventDefault()
            return false
        }

        // Ctrl+P (print)
        if (e.ctrlKey && e.key === 'p') {
            e.preventDefault()
            return false
        }

        // Ctrl+Shift+I (dev tools)
        if (e.ctrlKey && e.shiftKey && e.key === 'I') {
            e.preventDefault()
            return false
        }

        // Windows + Shift + S (Windows Snipping Tool)
        if (e.metaKey && e.shiftKey && e.key === 'S') {
            e.preventDefault()
            setIsBlurred(true)
            setTimeout(() => setIsBlurred(false), 2000)
            return false
        }
    }, [])

    // Block right-click
    const handleContextMenu = useCallback((e: MouseEvent) => {
        e.preventDefault()
        return false
    }, [])

    useEffect(() => {
        // Register event listeners
        document.addEventListener('visibilitychange', handleVisibilityChange)
        document.addEventListener('keydown', handleKeyDown)
        document.addEventListener('contextmenu', handleContextMenu)

        // Block copy
        document.addEventListener('copy', (e) => {
            e.preventDefault()
        })

        // Inject print protection styles
        const styleEl = document.createElement('style')
        styleEl.id = 'screen-protection-styles'
        styleEl.textContent = `
            @media print {
                /* Ocultar todo por defecto para seguridad */
                body *:not([id^="print-container-"]):not([id^="print-container-"] *) {
                    display: none !important;
                }
                
                /* Mostrar el mensaje de protección solo si NO hay un contenedor de impresión activo */
                body:not(:has([id^="print-container-"]))::after {
                    content: 'Impresión no permitida — Sistema Protegido';
                    display: block;
                    font-size: 24px;
                    text-align: center;
                    padding: 100px;
                    color: #666;
                }

                /* Asegurar que el contenedor de impresión sea visible si existe */
                [id^="print-container-"] {
                    display: block !important;
                    position: absolute !important;
                    top: 0 !important;
                    left: 0 !important;
                    width: 100% !important;
                }
            }
        `
        document.head.appendChild(styleEl)

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            document.removeEventListener('keydown', handleKeyDown)
            document.removeEventListener('contextmenu', handleContextMenu)
            const existingStyle = document.getElementById('screen-protection-styles')
            if (existingStyle) existingStyle.remove()
        }
    }, [handleVisibilityChange, handleKeyDown, handleContextMenu])

    return (
        <div 
            className="screen-protected-container"
            style={{ 
                userSelect: 'none', 
                WebkitUserSelect: 'none',
                position: 'relative'
            }}
        >
            {children}
            
            {/* Blur overlay when screenshot attempt detected */}
            {isBlurred && (
                <div 
                    className="fixed inset-0 z-[9999] pointer-events-none"
                    style={{
                        backdropFilter: 'blur(30px)',
                        WebkitBackdropFilter: 'blur(30px)',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    }}
                >
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
                                <svg className="w-8 h-8 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                            </div>
                            <p className="text-white font-bold text-lg">Contenido Protegido</p>
                            <p className="text-slate-400 text-sm mt-1">Las capturas de pantalla no están permitidas</p>
                        </div>
                    </div>
                </div>
            )}

        </div>
    )
}
