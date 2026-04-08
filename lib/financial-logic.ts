/**
 * Utilidades Centralizadas para Lógica Financiera
 * Sistema de Préstamos y Cobranzas
 */

/**
 * Retorna la fecha actual en formato YYYY-MM-DD ajustada a la zona horaria de Perú.
 */
export function getTodayPeru(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
}

interface SystemConfig {
  renovacionMinPagado?: number; // Ej: 60
  refinanciacionMinMora?: number; // Ej: 50
  umbralCpp?: number; // Ej: 4
  umbralMoroso?: number; // Ej: 7
  umbralCppOtros?: number; // Ej: 1
  umbralMorosoOtros?: number; // Ej: 2
}

interface LoanMetrics {
  cuotasAtrasadas: number;
  deudaExigibleTotal: number;
  deudaExigibleHoy: number;
  cuotaDiaHoy: number;     // Lo que falta cobrar hoy de la cuota de hoy (disminuye al pagar)
  cuotaDiaProgramada: number; // Lo que se debía cobrar hoy al iniciar el día (fijo)
  cobradoHoy: number;      // Total recaudado hoy (efectivo total)
  cobradoRutaHoy: number;  // Recaudado hoy que aplica a cuotas vencidas o de hoy (para avance de meta)
  totalPagadoAcumulado: number;
  saldoPendiente: number;
  riesgoPorcentaje: number;
  diasSinPago: number;
  isCritico: boolean; // Alerta Grave (Configurable, default 7+ diarias)
  isMora: boolean;    // Mora Temprana (Configurable, default 4+ diarias)
  isAlDia: boolean;
  esRenovable: boolean;
  estadoCalculado: 'critico' | 'atrasado' | 'al_dia' | 'finalizado' | 'sin_deuda';
  valorCuotaPromedio: number;
  saldoCuotaParcial: number; // Balance restante de la primera cuota que tenga pago parcial (>0 y <total)
  totalCuotas: number;
  cuotasPagadas: number;
}

/**
 * Calcula las métricas financieras de un préstamo individual con la lógica pulida del Panel de Préstamos.
 */
export function calculateLoanMetrics(
  loan: any, 
  today: string = getTodayPeru(),
  config: SystemConfig = { renovacionMinPagado: 60, umbralCpp: 1, umbralMoroso: 4, umbralCppOtros: 1, umbralMorosoOtros: 2 }
): LoanMetrics {
  if (!loan || loan.estado !== 'activo') {
    const totalPagado = (loan.cronograma_cuotas || []).reduce((sum: number, c: any) => sum + (c.monto_pagado || 0), 0);
    return {
      cuotasAtrasadas: 0,
      deudaExigibleTotal: 0,
      deudaExigibleHoy: 0,
      cuotaDiaHoy: 0,
      cuotaDiaProgramada: 0,
      cobradoHoy: 0,
      cobradoRutaHoy: 0,
      totalPagadoAcumulado: totalPagado,
      saldoPendiente: 0,
      riesgoPorcentaje: 0,
      diasSinPago: 0,
      isCritico: false,
      isMora: false,
      isAlDia: true,
      esRenovable: false,
      estadoCalculado: loan?.estado === 'finalizado' ? 'finalizado' : 'sin_deuda',
      valorCuotaPromedio: 0,
      saldoCuotaParcial: 0,
      totalCuotas: (loan.cronograma_cuotas || []).length,
      cuotasPagadas: (loan.cronograma_cuotas || []).filter((c: any) => c.estado === 'pagado').length
    };
  }

  const cronograma = loan.cronograma_cuotas || [];
  const pagos = cronograma.flatMap((c: any) => c.pagos || []);
  const totalPagar = Number(loan.monto) * (1 + (Number(loan.interes) / 100));

  // 1. Meta Hoy (Específicamente cuotas que vencen hoy)
  const cuotaDiaHoy = cronograma
    .filter((c: any) => c.fecha_vencimiento === today)
    .reduce((sum: number, c: any) => sum + Math.max(0, Number(c.monto_cuota) - (Number(c.monto_pagado) || 0)), 0);

  // 2. Cobrados Hoy
  const getIsToday = (date: string) => {
    if (!date) return false;
    try {
      // Usar un formato ultra-robusto para comparación
      const dateDate = new Date(date).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
      return dateDate === today;
    } catch (e) {
      return false;
    }
  };

  const cobradoHoy = pagos
    .filter((pay: any) => getIsToday(pay.created_at))
    .reduce((sum: number, pay: any) => sum + (Number(pay.monto_pagado) || 0), 0);

  // Cobrado Ruta Hoy: SOLO lo que pagó de la cuota que vence HOY (Meta de la ruta)
  const cobradoRutaHoy = cronograma
    .filter((c: any) => c.fecha_vencimiento === today)
    .reduce((sum: number, c: any) => {
      const pagosDeEstaCuotaHoy = (c.pagos || [])
        .filter((p: any) => getIsToday(p.created_at))
        .reduce((s: number, p: any) => s + (Number(p.monto_pagado) || 0), 0);
      
      const metaCuota = Number(c.monto_cuota);
      const totalPagadoAcumulado = Number(c.monto_pagado || 0);
      
      // ¿Cuánto se pagó ANTES de hoy?
      const pagadoAntes = Math.max(0, totalPagadoAcumulado - pagosDeEstaCuotaHoy);
      
      // ¿Cuánto faltaba cobrar de esta cuota al iniciar el día? (ESTO ES LA META REAL)
      const pendienteAlInicio = Math.max(0, metaCuota - pagadoAntes);
      
      // El avance es el pago de hoy, pero topado por lo que faltaba (no contar adelantos/intereses de más como "avance")
      return sum + Math.min(pagosDeEstaCuotaHoy, pendienteAlInicio);
    }, 0);

  // 2.5. Cuota Programada para Hoy: La meta real al iniciar el día
  const cuotaDiaProgramada = cronograma
    .filter((c: any) => c.fecha_vencimiento === today)
    .reduce((sum: number, c: any) => {
      const pagosDeEstaCuotaHoy = (c.pagos || [])
        .filter((p: any) => getIsToday(p.created_at))
        .reduce((s: number, p: any) => s + (Number(p.monto_pagado) || 0), 0);
      
      const metaCuota = Number(c.monto_cuota);
      const totalPagadoAcumulado = Number(c.monto_pagado || 0);
      const pagadoAntes = Math.max(0, totalPagadoAcumulado - pagosDeEstaCuotaHoy);
      const pendienteAlInicio = Math.max(0, metaCuota - pagadoAntes);
      
      // Si ya estaba pagada totalmente antes de hoy (pendiente 0), no se agrega a la meta del día
      if (pendienteAlInicio <= 0.01) return sum;

      return sum + pendienteAlInicio;
    }, 0);

  // 3. Deuda Exigible Hoy (Todo lo vencido hasta hoy inclusive)
  const deudaExigibleHoy = cronograma
    .filter((c: any) => c.fecha_vencimiento <= today)
    .reduce((sum: number, c: any) => sum + Math.max(0, Number(c.monto_cuota) - (Number(c.monto_pagado) || 0)), 0);

  // 4. Cuotas Exigibles (Mora + Hoy)
  // Este conteo debe coincidir con lo que el usuario ve en la tabla para evitar confusión
  const totalAtrasadas = cronograma
    .filter((c: any) => c.fecha_vencimiento <= today && c.estado !== 'pagado' && (c.monto_cuota - (c.monto_pagado || 0)) > 0.5)
    .length;

  // Igualando estrictamente al cálculo de UI de la tabla principal
  const tempValorCuota = cronograma.length > 0 ? cronograma.reduce((s: number, c: any) => s + Number(c.monto_cuota), 0) / cronograma.length : 0;
  const cuotasAtrasadas = tempValorCuota > 0 ? Math.floor(deudaExigibleHoy / tempValorCuota) : 0;
  
  // 4.6. Saldo Cuota Parcial (Cualquier cuota con pago > 0 y < monto)
  const partialPaidQuota = cronograma.find((c: any) => {
    const pagado = Number(c.monto_pagado) || 0;
    const monto = Number(c.monto_cuota) || 0;
    // Se considera parcial si se pagó algo pero falta más de un centavo
    return pagado > 0.01 && pagado < (monto - 0.01);
  });
  const saldoCuotaParcial = partialPaidQuota 
    ? (Number(partialPaidQuota.monto_cuota) - (Number(partialPaidQuota.monto_pagado) || 0)) 
    : 0;

  // 5. Acumulados
  const totalPagadoAcumulado = cronograma.reduce((sum: number, c: any) => sum + (Number(c.monto_pagado) || 0), 0);
  const saldoPendiente = Math.max(0, totalPagar - totalPagadoAcumulado);

  // 6. Riesgo Capital % (Vencido <= hoy / Saldo Pendiente)
  const capitalVencido = cronograma
    .filter((c: any) => c.fecha_vencimiento <= today)
    .reduce((sum: number, c: any) => sum + (Number(c.monto_cuota) - (Number(c.monto_pagado) || 0)), 0);
  const riesgoPorcentaje = totalPagar > 0 ? (capitalVencido / totalPagar) * 100 : 0;

  // 7. Días sin pago
  let diasSinPago = 0;
  const now = new Date();
  if (pagos.length > 0) {
    const lastPaymentDate = new Date(Math.max(...pagos.map((pay: any) => new Date(pay.created_at).getTime())));
    diasSinPago = Math.ceil(Math.abs(now.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
  } else if (loan.fecha_inicio) {
    diasSinPago = Math.ceil(Math.abs(now.getTime() - new Date(loan.fecha_inicio).getTime()) / (1000 * 60 * 60 * 24));
  }

  // 8. Valor Cuota Promedio
  const valorCuotaPromedio = cronograma.length > 0 
    ? cronograma.reduce((s: number, c: any) => s + Number(c.monto_cuota), 0) / cronograma.length
    : 0;

  // 9. Reglas de Negocio (Dinámicas desde Configuración)
  const isDiario = loan.frecuencia?.toLowerCase() === 'diario';
  const cfgCpp = config.umbralCpp || 4;
  const cfgMoroso = config.umbralMoroso || 7;
  const cfgCppOtros = config.umbralCppOtros || 1;
  const cfgMorosoOtros = config.umbralMorosoOtros || 2;

  // La transición se basa en el total de cuotas exigibles (Mora Real + Hoy) o el estado global de mora del préstamo
  const hasCriticalStatus = ['vencido', 'legal', 'castigado'].includes(loan.estado_mora || '');
  const isCritico = hasCriticalStatus || (isDiario && totalAtrasadas >= cfgMoroso) || (!isDiario && totalAtrasadas >= cfgMorosoOtros);
  const isMora = ((isDiario && totalAtrasadas >= cfgCpp) || (!isDiario && totalAtrasadas >= cfgCppOtros)) && !isCritico;
  const isAlDia = totalAtrasadas === 0 && !hasCriticalStatus;

  // 10. Renovación
  const renovacionMinPagadoDecimal = (config.renovacionMinPagado || 60) / 100;
  const esRenovable = (
    totalPagadoAcumulado >= (totalPagar * renovacionMinPagadoDecimal) &&
    riesgoPorcentaje < 10 &&
    !['vencido', 'legal', 'castigado'].includes(loan.estado_mora)
  );

  let estadoCalculado: any = 'al_dia';
  if (isCritico) estadoCalculado = 'critico';
  else if (isMora) estadoCalculado = 'atrasado';
  else if (totalAtrasadas > 0) estadoCalculado = 'deuda';

  return {
    cuotasAtrasadas,
    deudaExigibleTotal: saldoPendiente,
    deudaExigibleHoy,
    cuotaDiaHoy,
    cuotaDiaProgramada,
    cobradoHoy,
    cobradoRutaHoy,
    totalPagadoAcumulado,
    saldoPendiente,
    riesgoPorcentaje,
    diasSinPago,
    isCritico,
    isMora,
    isAlDia,
    esRenovable,
    estadoCalculado,
    valorCuotaPromedio,
    saldoCuotaParcial,
    totalCuotas: loan.numero_cuotas || loan.cuotas || (valorCuotaPromedio > 0 ? Math.round(totalPagar / valorCuotaPromedio) : 0) || cronograma.length,
    cuotasPagadas: valorCuotaPromedio > 0 ? Math.floor(totalPagadoAcumulado / valorCuotaPromedio) : 0
  };
}
/**
 * Determina la situación financiera global de un cliente basada primordialmente 
 * en las etiquetas de auditoría de la base de datos (estado_mora).
 */
export function calculateClientSituation(client: any) {
  if (client.estado === 'inactivo') return 'inactivo';

  const activeLoans = (client.prestamos || []).filter((p: any) => p.estado === 'activo');
  if (activeLoans.length === 0) return 'sin_deuda';

  // Jerarquía de riesgo para el resumen del cliente
  const riskLevels = {
    'vencido': 5,
    'moroso': 4,
    'cpp': 3,
    'deuda': 2,
    'ok': 1
  };

  let highestRiskKey: keyof typeof riskLevels = 'ok';

  activeLoans.forEach((loan: any) => {
    const em = (loan.estado_mora?.toLowerCase() || 'ok') as keyof typeof riskLevels;
    if (riskLevels[em] > riskLevels[highestRiskKey]) {
      highestRiskKey = em;
    }
  });

  return highestRiskKey;
}

/**
 * CONSTANTES DE MODALIDAD
 */
export const CUOTAS_ESTANDAR = {
    diario: 24,   // 24 días
    semanal: 4,   // 4 semanas
    quincenal: 2, // 2 quincenas
    mensual: 1,   // 1 mes
}

/**
 * Función para verificar si es día hábil (no feriado ni domingo)
 */
export function esDiaHabil(fecha: Date | string, feriadosSet: Set<string>): boolean {
    const d = typeof fecha === 'string' ? new Date(fecha + 'T12:00:00') : new Date(fecha)
    const fechaStr = d.toISOString().split('T')[0]
    const diaSemana = d.getDay()
    // 0 = Domingo
    return diaSemana !== 0 && !feriadosSet.has(fechaStr)
}

/**
 * Función para obtener siguiente día hábil (AVANZA 1 día min)
 */
export function siguienteDiaHabil(fecha: Date, feriadosSet: Set<string>): Date {
    const siguiente = new Date(fecha)
    siguiente.setDate(siguiente.getDate() + 1)
    while (!esDiaHabil(siguiente, feriadosSet)) {
        siguiente.setDate(siguiente.getDate() + 1)
    }
    return siguiente
}

/**
 * Función para validar día actual o mover al siguiente (SIN avanzar forzosamente)
 */
export function validarDiaHabil(fecha: Date, feriadosSet: Set<string>): Date {
    const valid = new Date(fecha)
    while (!esDiaHabil(valid, feriadosSet)) {
        valid.setDate(valid.getDate() + 1)
    }
    return valid
}

/**
 * Calcula las fechas de inicio y fin proyectadas de un préstamo.
 */
export function calcularFechasProyectadas(
    fechaSolicitud: string, 
    cuotas: number, 
    modalidad: keyof typeof CUOTAS_ESTANDAR, 
    feriadosSet: Set<string>
) {
    if (!fechaSolicitud || cuotas <= 0) return { fechaInicio: null, fechaFin: null }
    
    // Usar T12:00:00 para evitar desfaces de zona horaria
    const fechaBase = new Date(fechaSolicitud + 'T12:00:00') 
    if (isNaN(fechaBase.getTime())) return { fechaInicio: null, fechaFin: null }

    let fechaPrimeraCuota: Date
    
    if (modalidad === 'diario') {
        // Diario: Inicio + 2 días (Día de Gracia)
        const baseDate = new Date(fechaBase)
        baseDate.setDate(baseDate.getDate() + 2)
        fechaPrimeraCuota = validarDiaHabil(baseDate, feriadosSet)
    } else {
         // Periódico: Start + Intervalo
         const baseDate = new Date(fechaBase)
         let daysToAdd = 0
         let monthsToAdd = 0
         
         if (modalidad === 'semanal') daysToAdd = 7
         else if (modalidad === 'quincenal') daysToAdd = 14
         else if (modalidad === 'mensual') monthsToAdd = 1
         
         baseDate.setDate(baseDate.getDate() + daysToAdd)
         baseDate.setMonth(baseDate.getMonth() + monthsToAdd)
         
         fechaPrimeraCuota = validarDiaHabil(baseDate, feriadosSet)
    }

    // Calcular fecha fin según modalidad
    let fechaUltimaCuota = new Date(fechaBase) 
    const n = cuotas // Total cuotas
    
    if (modalidad === 'mensual') {
         fechaUltimaCuota.setMonth(fechaUltimaCuota.getMonth() + n)
    } else if (modalidad === 'diario') {
         fechaUltimaCuota = new Date(fechaPrimeraCuota)
         let count = 0
         let cursor = new Date(fechaPrimeraCuota)
         while (count < (n - 1)) {
             cursor = siguienteDiaHabil(cursor, feriadosSet)
             count++
         }
         fechaUltimaCuota = cursor
    } else {
         // Semanal / Quincenal
         let interval = 7
         if (modalidad === 'quincenal') interval = 14
         fechaUltimaCuota.setDate(fechaUltimaCuota.getDate() + (n * interval))
    }
    
    // Ajustar ultima cuota si cae inhabil
    fechaUltimaCuota = validarDiaHabil(fechaUltimaCuota, feriadosSet)

    return { 
        fechaInicio: fechaPrimeraCuota, 
        fechaFin: fechaUltimaCuota 
    }
}

/**
 * Calcula el interés proporcional basado en cuotas y modalidad.
 */
export function calcularInteresProporcional(
    cuotas: number, 
    modalidad: keyof typeof CUOTAS_ESTANDAR, 
    interesBase: number = 20
) {
    const cuotasEstandar = CUOTAS_ESTANDAR[modalidad]
    if (cuotas <= 0) return { interes: interesBase, esAjustado: false, cuotasEstandar }

    // Calcular proporcionalmente (Regla de 3)
    const interesFinal = (cuotas / cuotasEstandar) * interesBase
    
    return { 
        interes: Math.round(interesFinal * 100) / 100, // Redondear a 2 decimales
        esAjustado: cuotas !== cuotasEstandar,
        cuotasEstandar
    }
}
/**
 * Centraliza la identificación visual de los estados de un préstamo para toda la aplicación.
 * Mapea el estado del negocio a etiquetas, colores y estilos de UI (CSS y Leaflet).
 */
export function getLoanStatusUI(loan: any) {
    const isEffectivelyFinalized = 
        loan.isFinalizado || 
        loan.estado === 'finalizado' || 
        loan.estado === 'renovado' ||
        loan.estado === 'refinanciado' ||
        (loan.saldo_pendiente || loan.metrics?.saldoPendiente || 0) <= 0.01;

    // Jerarquía de estados coincidente con la tabla de préstamos
    if (loan.estado === 'refinanciado') {
        return {
            label: 'REFIN',
            color: 'text-indigo-400',
            border: 'border-indigo-500',
            bg: 'bg-indigo-900/10',
            marker: '#6366f1', // Indigo 500
            animate: false
        }
    }
    if (loan.estado === 'renovado') {
        return {
            label: 'RENOV',
            color: 'text-slate-500',
            border: 'border-slate-600',
            bg: 'bg-slate-900/10',
            marker: '#64748b', // Slate 500
            animate: false
        }
    }
    if (isEffectivelyFinalized) {
        return {
            label: 'FINAL',
            color: 'text-slate-500',
            border: 'border-slate-600',
            bg: 'bg-slate-900/10',
            marker: '#64748b', // Slate 500
            animate: false
        }
    }
    if (loan.estado_mora === 'vencido') {
        return {
            label: 'VENCIDO',
            color: 'text-rose-500',
            border: 'border-rose-500',
            bg: 'bg-rose-900/10',
            marker: '#f43f5e', // Rose 500
            animate: false
        }
    }
    if (loan.estado_mora === 'moroso') {
        return {
            label: 'MOROSO',
            color: 'text-rose-500',
            border: 'border-rose-500',
            bg: 'bg-rose-900/10',
            marker: '#f43f5e', // Rose 500
            animate: true
        }
    }
    if (loan.estado_mora === 'cpp') {
        return {
            label: 'CPP',
            color: 'text-orange-500',
            border: 'border-orange-500',
            bg: 'bg-orange-950/20',
            marker: '#f97316', // Orange 500
            animate: false
        }
    }

    // deudaHoy existe en objetos enriquecidos por calculateLoanMetrics
    const deuda = Number(loan.deudaHoy || loan.deuda_exigible_hoy || 0);
    if (deuda > 0.01) {
        return {
            label: 'DEUDA',
            color: 'text-amber-400',
            border: 'border-amber-400',
            bg: 'bg-amber-950/20',
            marker: '#fbbf24', // Amber 400
            animate: false
        }
    }

    return {
        label: 'OK',
        color: 'text-emerald-500',
        border: 'border-emerald-500',
        bg: 'bg-emerald-950/20',
        marker: '#10b981', // Emerald 500
        animate: false
    }
}
