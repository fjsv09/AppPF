
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function check() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('es-PE', {
      timeZone: 'America/Lima',
      year: 'numeric', month: '2-digit', day: '2-digit'
  });
  const parts = formatter.formatToParts(now);
  const day = parts.find(p => p.type === 'day')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const year = parts.find(p => p.type === 'year')?.value;
  const todayStr = `${year}-${month}-${day}`;
  
  console.log('TODAY_STR:', todayStr);

  const { data: perfiles } = await supabase
    .from('perfiles')
    .select('id, nombre_completo, rol')
    .ilike('nombre_completo', '%Franklin%')
  
  if (perfiles?.[0]) {
    const p = perfiles[0];
    console.log(`\n--- CUADRES DE ${p.nombre_completo} ---`);
    const { data: history } = await supabase
      .from('cuadres_diarios')
      .select('fecha, tipo_cuadre, estado')
      .eq('asesor_id', p.id)
      .lt('fecha', todayStr)
      .order('fecha', { ascending: false })
      .order('created_at', { ascending: false });
    
    console.log('History fetched (lt today):', JSON.stringify(history, null, 2));

    if (history && history.length > 0) {
        const daysEvaluated = new Set();
        for (const record of history) {
            if (!daysEvaluated.has(record.fecha)) {
                daysEvaluated.add(record.fecha);
                console.log(`DAY CHECK: ${record.fecha} | TIPO: ${record.tipo_cuadre} | ESTADO: ${record.estado}`);
                if (record.tipo_cuadre !== 'final' || record.estado !== 'aprobado') {
                    console.log('>>> SHOULD BLOCK DUE TO THIS RECORD');
                }
            }
        }
    } else {
        console.log('No history found before today!');
    }
  }
}

check().catch(console.error)
