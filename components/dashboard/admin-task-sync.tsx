'use client'
import { useEffect } from 'react'

export function AdminTaskSync() {
    useEffect(() => {
        // Ejecución silenciosa en segundo plano al cargar el dashboard
        // Utilizamos un timeout corto para no interferir con la carga inicial de datos pesados
        const timer = setTimeout(() => {
            fetch('/api/auditoria/generar-tareas?mode=background', { 
                method: 'POST',
                // Indicamos que es una tarea de fondo de baja prioridad
                priority: 'low'
            }).catch(err => console.error('Silent Audit Error:', err))
        }, 3000)

        return () => clearTimeout(timer)
    }, [])

    return null // No renderiza nada
}
