import { createClient } from '@/utils/supabase/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// GET - Verificar elegibilidad para refinanciacion directa admin
export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const supabase = await createClient()
    const supabaseAdmin = createAdminClient()

    try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        // 1. Verificar Rol Admin Estrictamente
        const { data: perfil } = await supabaseAdmin
            .from('perfiles')
            .select('rol')
            .eq('id', user.id)
            .single()

        if (!perfil || perfil.rol !== 'admin') {
            return NextResponse.json({ error: 'Solo los administradores pueden usar la refinanciación directa', elegibilidad: { elegible: false, razon_bloqueo: 'Usuario no es administrador' } }, { status: 403 })
        }

        // 2. Obtener datos básicos del préstamo y el límite del cliente
        const { data: prestamo } = await supabaseAdmin
            .from('prestamos')
            .select(`
                *,
                clientes:cliente_id(limite_prestamo)
            `)
            .eq('id', id)
            .single()

        if (!prestamo) {
            return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 })
        }

        // 3. Evaluar elegibilidad general ignorando el bloqueo de "porcentaje pagado".
        // Reusamos la lógica de RPC pero forzamos el 'elegible' en el cliente.
        // Como alternativa, podemos calcular el score y los límites directamente.
        
        // Calcular porcentaje pagado (sólo para visualización)
        const { data: cuotasData } = await supabaseAdmin
            .from('cronograma_cuotas')
            .select('monto_cuota, monto_pagado')
            .eq('prestamo_id', id)
        
        let totalCuotas = 0;
        let totalPagado = 0;
        
        if (cuotasData) {
            totalCuotas = cuotasData.reduce((sum, c) => sum + Number(c.monto_cuota), 0);
            totalPagado = cuotasData.reduce((sum, c) => sum + Number(c.monto_pagado || 0), 0);
        }

        const porcentajePagado = totalCuotas > 0 ? (totalPagado / totalCuotas) * 100 : 0;
        const saldoPendiente = totalCuotas - totalPagado;

        // Calcular Score (RPC helper)
        const { data: scoreDataRaw } = await supabaseAdmin.rpc('calcular_score_cliente', { p_cliente_id: prestamo.cliente_id })
        const scoreDataStr = typeof scoreDataRaw === 'string' ? scoreDataRaw : JSON.stringify(scoreDataRaw || '{}')
        const scoreDetalle = JSON.parse(scoreDataStr)
        let scoreValue = parseInt(scoreDetalle.score !== undefined ? scoreDetalle.score : '50')
        
        // --- PARCHE SCORE: CORREGIR HISTORIAL DE MORA/VENCIDO NO CONTABILIZADO POR LA BD ---
        if (scoreDetalle) {
            const clienteId = prestamo.cliente_id;
            const { data: todosPrestamos } = await supabaseAdmin
                .from('prestamos')
                .select('estado_mora')
                .eq('cliente_id', clienteId);
            
            if (todosPrestamos) {
                const realMoraCount = todosPrestamos.filter(p => ['vencido', 'castigado', 'legal'].includes(p.estado_mora?.toLowerCase())).length;
                const dbMoraCount = scoreDetalle.historial_mora || 0;
                
                if (realMoraCount > dbMoraCount) {
                    const diff = realMoraCount - dbMoraCount;
                    scoreDetalle.historial_mora = realMoraCount;
                    // Penalidad de 20 pts por cada préstamo vencido no contabilizado
                    scoreValue = Math.max(0, scoreValue - (diff * 20));
                    scoreDetalle.score = scoreValue;
                }
            }
        }
        // -----------------------------------------------------------------------------------

        // Límites según Score (reusando lógica original)
        let montoMaximo = prestamo.monto;
        let montoMinimo = prestamo.monto * 0.5;

        // Limites simplificados
        if (scoreValue >= 80) montoMaximo = prestamo.monto * 1.40;
        else if (scoreValue >= 60) montoMaximo = prestamo.monto * 1.20;
        else if (scoreValue < 40) montoMaximo = prestamo.monto * 0.8;

        if (saldoPendiente > 0) {
            montoMinimo = Math.max(montoMinimo, saldoPendiente);
        }

        // CAPI: El monto máximo no puede superar el límite establecido para el cliente
        const clientLimit = parseFloat((prestamo.clientes as any)?.limite_prestamo || 0);
        if (clientLimit > 0 && montoMaximo > clientLimit) {
            montoMaximo = clientLimit;
        }

        // Fix: Para refinanciación crítica, el monto máximo legal SIEMPRE debe cubrir al menos el saldo pendiente. 
        // Si el score penalizó el máximo por debajo del pendiente, lo igualamos para permitir la operación.
        if (montoMaximo < montoMinimo) {
            montoMaximo = montoMinimo;
        }

        // Respuesta siempre elegible para el Admin
        const elegibilidadMock = {
            elegible: true,
            score: scoreValue,
            score_detalle: scoreDetalle,
            porcentaje_pagado: parseFloat(porcentajePagado.toFixed(2)),
            monto_original: prestamo.monto,
            saldo_pendiente: parseFloat(saldoPendiente.toFixed(2)),
            monto_maximo: parseFloat(montoMaximo.toFixed(2)),
            monto_minimo: parseFloat(montoMinimo.toFixed(2)),
            requiere_excepcion: true,
            tipo_excepcion: 'mora_critica',
            estado_prestamo: prestamo.estado,
            estado_mora: prestamo.estado_mora,
            es_refinanciado: prestamo.estado === 'refinanciado',
            es_ultimo_prestamo: true,
            requiere_admin_excepcion: true
        }

        return NextResponse.json(elegibilidadMock)

    } catch (e: any) {
        console.error('Unexpected error:', e)
        return NextResponse.json({ error: e.message }, { status: 500 })
    }
}
