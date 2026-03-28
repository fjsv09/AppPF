'use client'

import { AttendanceGate } from '@/components/asistencia/attendance-gate'
import { ScreenProtection } from '@/components/providers/screen-protection'

interface DashboardProtectionProps {
    children: React.ReactNode
    userRole: string
    userName: string
}

/**
 * DashboardProtection — Client wrapper that combines attendance gate + screen protection
 * Used in the dashboard layout to enforce both features.
 */
export function DashboardProtection({ children, userRole, userName }: DashboardProtectionProps) {
    return (
        <ScreenProtection userName={userName}>
            <AttendanceGate userRole={userRole}>
                {children}
            </AttendanceGate>
        </ScreenProtection>
    )
}
