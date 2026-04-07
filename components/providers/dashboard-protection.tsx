'use client'

import { AttendanceGate } from '@/components/asistencia/attendance-gate'
import { ScreenProtection } from '@/components/providers/screen-protection'

interface DashboardProtectionProps {
    children: React.ReactNode
    userRole: string
    userName: string
    attendanceInitialData?: {
        required: boolean
        marked: boolean
        event: 'entrada' | 'fin_turno_1' | 'cierre' | string
        config: any
    }
}

/**
 * DashboardProtection — Client wrapper that combines attendance gate + screen protection
 * Used in the dashboard layout to enforce both features.
 */
export function DashboardProtection({ 
    children, 
    userRole, 
    userName, 
    attendanceInitialData 
}: DashboardProtectionProps) {
    return (
        <ScreenProtection userName={userName}>
            <AttendanceGate 
                userRole={userRole} 
                initialData={attendanceInitialData}
            >
                {children}
            </AttendanceGate>
        </ScreenProtection>
    )
}
