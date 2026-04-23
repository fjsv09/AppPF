
import { createClient } from "@/utils/supabase/client";

const supabase = createClient();

export const api = {
    prestamos: {
        crear: async (data: any) => {
            const response = await fetch('/api/prestamos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Error al crear préstamo')
            }
            return await response.json()
        },
        generarCronograma: async (prestamoId: string) => {
             // Deprecated: API Route handles this automatically now.
             // Leaving stub just in case legacy calls exist, or simply throw.
             console.warn("generarCronograma is auto-handled by create.")
             return { success: true }
        },
        bloquearCronograma: async (prestamoId: string) => {
             const response = await fetch('/api/prestamos/bloquear', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prestamo_id: prestamoId }),
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Error al bloquear cronograma')
            }
            return await response.json()
        },
    renovar: async (data: any) => {
            const response = await fetch('/api/renovaciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            })
            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Error al renovar')
            }
            return await response.json()
        },
    },
    clientes: {
        crear: async (data: { dni: string; nombres: string; telefono?: string; direccion?: string; asesor_id?: string | null }) => {
            const response = await fetch('/api/clientes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Error al crear cliente');
            }

            return await response.json();
        },
        toggleExcepcionVoucher: async (cliente_id: string, excepcion_voucher: boolean) => {
            const response = await fetch('/api/clientes/toggle-excepcion', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cliente_id, excepcion_voucher }),
            })
            if (!response.ok) throw new Error('Error al actualizar cliente')
            return await response.json()
        },
    },
    pagos: {
        registrar: async (data: { cuota_id: string; monto: number; metodo_pago?: string; latitud?: number; longitud?: number; voucher_url?: string }) => {
            const response = await fetch('/api/pagos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            })

            if (!response.ok) {
                const err = await response.json()
                throw new Error(err.error || 'Error al registrar pago')
            }

            return await response.json()
        },
        compartirVoucher: async (pago_id: string) => {
            const response = await fetch('/api/pagos/voucher', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pago_id }),
            })
            if (!response.ok) throw new Error('Error al actualizar voucher')
            return await response.json()
        },
    },
};
