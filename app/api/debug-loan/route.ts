import { createAdminClient } from '@/utils/supabase/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get('name') || 'Laura Zapata'
    
    const supabase = createAdminClient()
    
    const { data: loans, error } = await supabase
        .from('prestamos')
        .select('*, clientes(nombres)')
        .ilike('clientes.nombres', `%${name}%`)
        .order('created_at', { ascending: false })
        .limit(5)
        
    if (error) return NextResponse.json({ error }, { status: 500 })
    
    // For each loan, get count of cuotas
    const results = await Promise.all((loans || []).map(async (loan) => {
        const { count } = await supabase
            .from('cronograma_cuotas')
            .select('*', { count: 'exact', head: true })
            .eq('prestamo_id', loan.id)
            
        return {
            id: loan.id,
            cliente: loan.clientes?.nombres,
            monto: loan.monto,
            cuotas: loan.cuotas,
            frecuencia: loan.frecuencia,
            fecha_fin: loan.fecha_fin,
            cuotas_count: count
        }
    }))
    
    return NextResponse.json(results)
}
