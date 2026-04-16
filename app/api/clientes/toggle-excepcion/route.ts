import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic'

export async function PATCH(request: Request) {
    try {
        const { cliente_id, excepcion_voucher } = await request.json();

        if (!cliente_id) {
            return NextResponse.json({ error: 'Falta el ID del cliente' }, { status: 400 });
        }

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        }

        const adminDb = createAdminClient();

        // Validar rol de admin
        const { data: perfil } = await adminDb
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single();

        if (perfil?.rol !== 'admin') {
            return NextResponse.json({ error: 'Operación no permitida' }, { status: 403 });
        }

        // Actualizar el cliente (usando admin client asumiendo que la politica puede ser estricta o evadiendo RLS por si acaso)
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

        revalidatePath(`/dashboard/clientes/${cliente_id}`);
        revalidatePath('/dashboard/clientes');

        return NextResponse.json(data);
    } catch (e) {
        return NextResponse.json({ error: 'Error en la petición' }, { status: 500 });
    }
}
