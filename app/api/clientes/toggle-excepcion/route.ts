import { NextResponse } from 'next/server';
import { createAdminClient, requireAdmin } from '@/utils/supabase/admin';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
    const guard = await requireAdmin();
    if ('error' in guard) return guard.error;
    const { user } = guard;

    try {
        const { cliente_id, excepcion_voucher } = await request.json();

        if (!cliente_id || typeof cliente_id !== 'string') {
            return NextResponse.json({ error: 'Falta el ID del cliente' }, { status: 400 });
        }
        if (typeof excepcion_voucher !== 'boolean') {
            return NextResponse.json({ error: 'excepcion_voucher debe ser booleano' }, { status: 400 });
        }

        const adminDb = createAdminClient();

        // Leer estado previo para auditoría
        const { data: prev } = await adminDb
            .from('clientes')
            .select('id, excepcion_voucher, nombres')
            .eq('id', cliente_id)
            .maybeSingle();

        if (!prev) {
            return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
        }

        const { data, error } = await adminDb
            .from('clientes')
            .update({ excepcion_voucher })
            .eq('id', cliente_id)
            .select()
            .single();

        if (error) {
            console.error('Error al actualizar cliente:', error);
            return NextResponse.json({ error: 'Error del servidor' }, { status: 500 });
        }

        // Auditar el cambio (regla sensible: exime al cliente de auditorías de voucher)
        await adminDb.from('auditoria').insert({
            tabla: 'clientes',
            accion: 'toggle_excepcion_voucher',
            registro_id: cliente_id,
            usuario_id: user.id,
            detalles: {
                cliente: prev.nombres,
                valor_anterior: prev.excepcion_voucher,
                valor_nuevo: excepcion_voucher
            }
        });

        revalidatePath(`/dashboard/clientes/${cliente_id}`);
        revalidatePath('/dashboard/clientes');

        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: 'Error en la petición' }, { status: 500 });
    }
}
