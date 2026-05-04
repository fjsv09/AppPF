/**
 * Utilidades Centralizadas para Lógica Financiera
 * Sistema de Préstamos y Cobranzas
 */

/**
 * Retorna la fecha actual en formato YYYY-MM-DD ajustada a la zona horaria de Perú.
 */
export function getTodayPeru(): string {
  // ISO format YYYY-MM-DD in Lima time
  const date = new Date();
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

interface SystemConfig {
  renovacionMinPagado?: number; // Ej: 60
  refinanciacionMinMora?: number; // Ej: 50
  umbralCpp?: number; // Ej: 4
  umbralMoroso?: number; // Ej: 7
  umbralCppOtros?: number; // Ej: 1
  umbralMorosoOtros?: number; // Ej: 2
}

interface LoanScore {
  score: number;
  increases: number;
  penalties: number;
  details: { label: string; value: number; type: 'increase' | 'penalty' }[];
  pagos_puntuales?: number; // Propiedad opcional para paridad con BehaviorSummary
  pagos_tardios?: number;
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
  metaTotalHoyYAtrasados: number;
  cobradoTotalHoyYAtrasados: number;
  loanScore?: LoanScore; // Nuevo
}

/**
 * Calcula las métricas financieras de un préstamo individual con la lógica pulida del Panel de Préstamos.
 */
export function calculateLoanMetrics(
  loan: any,
  today: string = getTodayPeru(),
  config: SystemConfig = { renovacionMinPagado: 60, umbralCpp: 1, umbralMoroso: 4, umbralCppOtros: 1, umbralMorosoOtros: 2 },
  standalonePagos?: any[]
): LoanMetrics {

  if (!loan) {
    return {
      cuotasAtrasadas: 0,
      deudaExigibleTotal: 0,
      deudaExigibleHoy: 0,
      cuotaDiaHoy: 0,
      cuotaDiaProgramada: 0,
      cobradoHoy: 0,
      cobradoRutaHoy: 0,
      totalPagadoAcumulado: 0,
      saldoPendiente: 0,
      riesgoPorcentaje: 0,
      diasSinPago: 0,
      isCritico: false,
      isMora: false,
      isAlDia: true,
      esRenovable: false,
      estadoCalculado: 'sin_deuda',
      valorCuotaPromedio: 0,
      saldoCuotaParcial: 0,
      totalCuotas: 0,
      cuotasPagadas: 0,
      metaTotalHoyYAtrasados: 0,
      cobradoTotalHoyYAtrasados: 0,
      loanScore: { score: 100, increases: 0, penalties: 0, details: [], pagos_puntuales: 0, pagos_tardios: 0 }
    };
  }

  const cronograma = loan.cronograma_cuotas || [];

  // Fuente de verdad para pagos: standalonePagos > loan.pagos > flatMap(cronograma.pagos)
  // [FILTRO SEGURIDAD] Excluir pagos rechazados explícitamente
  const pagosRaw = standalonePagos || loan.pagos || cronograma.flatMap((c: any) => c.pagos || []);
  const pagos = pagosRaw.filter((p: any) => p.estado_verificacion !== 'rechazado' && p.estado_verificacion !== 'pendiente');

  const totalPagar = Number(loan.monto) * (1 + (Number(loan.interes) / 100));

  // 0. Cálculo de Pagado Real (Basado en transacciones reales para evitar desincronización con el cronograma)
  // Si tenemos el array de pagos, sumamos el monto_pagado de cada uno.
  const totalPagadoAcumuladoReal = pagos.length > 0
    ? pagos.reduce((sum: number, p: any) => sum + (Number(p.monto_pagado) || 0), 0)
    : cronograma.reduce((sum: number, c: any) => sum + (Number(c.monto_pagado) || 0), 0);

  // [SINCRONIZACIÓN] Priorizamos la suma de transacciones reales (pagos) si existen.
  // Solo usamos la suma del cronograma como fallback para préstamos migrados sin registros de pagos.
  const sumCronograma = cronograma.reduce((sum: number, c: any) => sum + (Number(c.monto_pagado) || 0), 0);
  const totalPagadoAcumulado = (pagosRaw.length > 0) ? Math.max(totalPagadoAcumuladoReal, sumCronograma) : sumCronograma;

  // Helper para determinar si es hoy
  const getIsToday = (date: string) => {
    if (!date) return false;
    try {
      const dateDate = new Date(date).toLocaleDateString('en-CA', { timeZone: 'America/Lima' });
      return dateDate === today;
    } catch (e) {
      return false;
    }
  };

  // CALCULAR CUOTA DÍA PROGRAMADA PRIMERO (para todos los préstamos, no solo activos)
  // Esto es necesario para que META HOY muestre TODAS las cuotas que vencen hoy sin filtrar
  // El objetivo es la SUMA TOTAL de todas las cuotas vencidas hoy, sin importar pagos
  const cuotaDiaProgramada = cronograma
    .filter((c: any) => c.fecha_vencimiento === today)
    .reduce((sum: number, c: any) => sum + Number(c.monto_cuota), 0);

  if (loan.estado !== 'activo') {
    // Para préstamos no-activos, calcular métricas de atrasos correctamente
    // (migradores, refinanciados, etc. que aún están en cobranza)
    const totalExigibleHastaHoyNA = cronograma
      .filter((c: any) => c.fecha_vencimiento <= today)
      .reduce((sum: number, c: any) => sum + Number(c.monto_cuota), 0);
    const deudaExigibleHoyNA = Math.max(0, totalExigibleHastaHoyNA - totalPagadoAcumulado);
    const valorCuotaPromedioNA = cronograma.length > 0
      ? cronograma.reduce((s: number, c: any) => s + Number(c.monto_cuota), 0) / cronograma.length
      : 0;
    const cuotasAtrasadasNA = valorCuotaPromedioNA > 0 ? Math.floor(deudaExigibleHoyNA / valorCuotaPromedioNA) : 0;
    const saldoPendienteNA = Math.max(0, totalPagar - totalPagadoAcumulado);


    return {
      cuotasAtrasadas: cuotasAtrasadasNA,
      deudaExigibleTotal: saldoPendienteNA,
      deudaExigibleHoy: deudaExigibleHoyNA,
      cuotaDiaHoy: 0,
      cuotaDiaProgramada: cuotaDiaProgramada,
      cobradoHoy: 0,
      cobradoRutaHoy: 0,
      totalPagadoAcumulado: totalPagadoAcumulado,
      saldoPendiente: saldoPendienteNA,
      riesgoPorcentaje: (totalPagar > 0) ? (deudaExigibleHoyNA / totalPagar) * 100 : 0,
      diasSinPago: 0,
      isCritico: false,
      isMora: false,
      isAlDia: deudaExigibleHoyNA <= 0.01,
      esRenovable: (loan.estado === 'finalizado' || loan.estado === 'completado' || loan.estado === 'renovado'),
      estadoCalculado: loan?.estado === 'finalizado' ? 'finalizado' : 'sin_deuda',
      valorCuotaPromedio: valorCuotaPromedioNA,
      saldoCuotaParcial: 0,
      totalCuotas: cronograma.length || loan.numero_cuotas || loan.cuotas || (valorCuotaPromedioNA > 0 ? Math.round(totalPagar / valorCuotaPromedioNA) : 0),
      cuotasPagadas: Math.min(
        cronograma.length || loan.numero_cuotas || loan.cuotas || 0,
        Math.max(
          cronograma.filter((c: any) =>
            c.estado === 'pagado' ||
            (Number(c.monto_pagado || 0) >= Number(c.monto_cuota || 0) - 0.01 && Number(c.monto_cuota || 0) > 0)
          ).length,
          valorCuotaPromedioNA > 0 ? Math.floor(totalPagadoAcumulado / valorCuotaPromedioNA) : 0
        )
      ),
      metaTotalHoyYAtrasados: 0,
      cobradoTotalHoyYAtrasados: 0,
      loanScore: calculateLoanScore(loan, pagos, today, config)
    };
  }

  // 1. Meta Hoy (Especísticamente cuotas que vencen hoy)
  const cuotaDiaHoy = cronograma
    .filter((c: any) => c.fecha_vencimiento === today)
    .reduce((sum: number, c: any) => sum + Math.max(0, Number(c.monto_cuota) - (Number(c.monto_pagado) || 0)), 0);

  // 2. Cobrados Hoy

  const cobradoHoy = pagos
    .filter((pay: any) => getIsToday(pay.created_at || pay.fecha_pago))
    .reduce((sum: number, pay: any) => sum + (Number(pay.monto_pagado) || 0), 0);

  // Cobrado Ruta Hoy: SOLO lo que pagó de la cuota que vence HOY (Meta de la ruta)
  const cobradoRutaHoy = cronograma
    .filter((c: any) => c.fecha_vencimiento === today)
    .reduce((sum: number, c: any) => {
      const pagosDeEstaCuotaHoy = (c.pagos || [])
        .filter((p: any) => getIsToday(p.created_at) && p.estado_verificacion !== 'rechazado' && p.estado_verificacion !== 'pendiente')
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

  // 2.5. Cuota Programada para Hoy: Ya calculada al principio para todos los préstamos
  // (ver línea anterior al check de estado !== 'activo')

  // 2.6. Meta y Cobrado Eficiencia (Hoy + Atrasados): Lógica Centralizada
  let metaTotalHoyYAtrasados = 0;
  let cobradoTotalHoyYAtrasados = 0;

  cronograma.forEach((c: any) => {
    if (c.fecha_vencimiento <= today) {
      const pagosDeEstaCuotaHoy = (c.pagos || [])
        .filter((p: any) => getIsToday(p.created_at) && p.estado_verificacion !== 'rechazado' && p.estado_verificacion !== 'pendiente')
        .reduce((s: number, p: any) => s + (Number(p.monto_pagado) || 0), 0);

      const metaCuota = Number(c.monto_cuota);
      const totalPagadoAcumuladoCuota = Number(c.monto_pagado || 0);
      const pagadoAntes = Math.max(0, totalPagadoAcumuladoCuota - pagosDeEstaCuotaHoy);
      const pendienteAlInicio = Math.max(0, metaCuota - pagadoAntes);

      if (pendienteAlInicio > 0.01) {
        metaTotalHoyYAtrasados += pendienteAlInicio;
        cobradoTotalHoyYAtrasados += Math.min(pagosDeEstaCuotaHoy, pendienteAlInicio);
      }
    }
  });

  // 3. Deuda Exigible Hoy (Todo lo vencido hasta hoy inclusive)
  // Importante: Aquí recalculamos la deuda exigible basada en el TOTAL pagado acumulado real
  // para que si el dinero se aplicó por cascada, el "Atraso" global disminuya correctamente.
  const valorCuotaPromedio = cronograma.length > 0
    ? cronograma.reduce((s: number, c: any) => s + Number(c.monto_cuota), 0) / cronograma.length
    : 0;

  const totalExigibleHastaHoy = cronograma
    .filter((c: any) => c.fecha_vencimiento <= today)
    .reduce((sum: number, c: any) => sum + Number(c.monto_cuota), 0);

  const deudaExigibleHoy = Math.max(0, totalExigibleHastaHoy - totalPagadoAcumulado);

  // DEBUG: Log todos los préstamos activos para ver si Segundo aparece
  // DEBUG para Segundo Aníbal - buscar en cualquier formato de nombre
  const allNamesInLoan = `${JSON.stringify(loan)}`.toLowerCase();
  if (allNamesInLoan.includes('segundo') && allNamesInLoan.includes('olorrega')) {
    console.log('DEBUG SEGUNDO ENCONTRADO:', {
      loan_id: loan.id,
      estado: loan.estado,
      cronograma_length: cronograma.length,
      totalPagar,
      totalPagadoAcumulado,
      totalExigibleHastaHoy,
      deudaExigibleHoy,
      cuotasAtrasadas: valorCuotaPromedio > 0 ? Math.floor(deudaExigibleHoy / valorCuotaPromedio) : 0
    });
  }

  // 4. Cuotas Exigibles (Mora + Hoy)
  const cuotasAtrasadas = valorCuotaPromedio > 0 ? Math.floor(deudaExigibleHoy / valorCuotaPromedio) : 0;

  // Conteo de cuotas que tienen saldo pendiente individual (para lógica de CPP/Moroso)
  const totalAtrasadas = cronograma
    .filter((c: any) => c.fecha_vencimiento <= today && c.estado !== 'pagado' && (c.monto_cuota - (c.monto_pagado || 0)) > 0.5)
    .length;

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
  const saldoPendiente = Math.max(0, totalPagar - totalPagadoAcumulado);

  // 6. Riesgo Capital % (Vencido <= hoy / Saldo Pendiente)
  // También usamos la deuda exigible recalculada para el riesgo
  const riesgoPorcentaje = totalPagar > 0 ? (deudaExigibleHoy / totalPagar) * 100 : 0;

  // 7. Días sin pago
  let diasSinPago = 0;
  const now = new Date();
  if (pagos.length > 0) {
    const lastPaymentDate = new Date(Math.max(...pagos.map((pay: any) => new Date(pay.created_at || pay.fecha_pago).getTime())));
    diasSinPago = Math.ceil(Math.abs(now.getTime() - lastPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
  } else if (loan.fecha_inicio) {
    diasSinPago = Math.ceil(Math.abs(now.getTime() - new Date(loan.fecha_inicio).getTime()) / (1000 * 60 * 60 * 24));
  }

  // 9. Reglas de Negocio (Dinámicas desde Configuración)
  const isDiario = loan.frecuencia?.toLowerCase() === 'diario';
  const cfgCpp = config.umbralCpp || 4;
  const cfgMoroso = config.umbralMoroso || 7;
  const cfgCppOtros = config.umbralCppOtros || 1;
  const cfgMorosoOtros = config.umbralMorosoOtros || 2;

  // La transición se basa en el total de cuotas exigibles (Mora Real + Hoy) o el estado global de mora del préstamo
  const hasCriticalStatus = ['vencido', 'legal', 'castigado'].includes(loan.estado_mora || '');
  const isCritico = hasCriticalStatus || (isDiario && cuotasAtrasadas >= cfgMoroso) || (!isDiario && cuotasAtrasadas >= cfgMorosoOtros);
  const isMora = ((isDiario && cuotasAtrasadas >= cfgCpp) || (!isDiario && cuotasAtrasadas >= cfgCppOtros)) && !isCritico;
  const isAlDia = cuotasAtrasadas === 0 && !hasCriticalStatus;

  // 10. Renovación
  const renovacionMinPagadoDecimal = (config.renovacionMinPagado || 60) / 100;
  const esRenovable = (
    totalPagadoAcumulado >= (totalPagar * renovacionMinPagadoDecimal) &&
    riesgoPorcentaje < 30 && // Aumentado de 10 a 30 para captar potenciales renovaciones con mora controlada
    !['legal', 'castigado'].includes(loan.estado_mora) // Permitimos 'vencido' si tiene buen avance de pago
  );

  let estadoCalculado: any = 'al_dia';
  if (isCritico) estadoCalculado = 'critico';
  else if (isMora) estadoCalculado = 'atrasado';
  else if (cuotasAtrasadas > 0) estadoCalculado = 'deuda';

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
    totalCuotas: cronograma.length || loan.numero_cuotas || loan.cuotas || (valorCuotaPromedio > 0 ? Math.round(totalPagar / valorCuotaPromedio) : 0),
    cuotasPagadas: Math.min(
      cronograma.length || loan.numero_cuotas || loan.cuotas || 0,
      Math.max(
        cronograma.filter((c: any) =>
          c.estado === 'pagado' ||
          (Number(c.monto_pagado || 0) >= Number(c.monto_cuota || 0) - 0.01 && Number(c.monto_cuota || 0) > 0)
        ).length,
        valorCuotaPromedio > 0 ? Math.floor(totalPagadoAcumulado / valorCuotaPromedio) : 0
      )
    ),
    metaTotalHoyYAtrasados,
    cobradoTotalHoyYAtrasados,
    loanScore: calculateLoanScore(loan, pagos, today, config) // Integración del nuevo score
  };
}

/**
 * Calcula la Mora Bancaria Centralizada (Capital Vencido / Capital Original)
 * Sincroniza la lógica del Panel de Préstamos para ser usada en dashboards de Supervisión y Admin.
 */
export function calculateMoraBancaria(prestamos: any[], today: string = getTodayPeru()) {
  let totalCapitalOriginal = 0;
  let totalCapitalVencido = 0;
  const loansInMora = new Set<string>();

  // Solo consideramos préstamos activos o en estados de riesgo para el cálculo de la cartera vigente
  const relevantPrestamos = (prestamos || []).filter(p => 
    ['activo', 'vencido', 'moroso', 'cpp', 'legal'].includes(p.estado)
  );

  relevantPrestamos.forEach(p => {
    const montoCapital = parseFloat(p.monto) || 0;
    totalCapitalOriginal += montoCapital;

    const cuotas = p.cronograma_cuotas || [];
    // Intentar obtener el número de cuotas real del préstamo, fallback a la longitud del cronograma o 30
    const numCuotas = p.numero_cuotas || p.cuotas || cuotas.length || 30;
    const capitalPorCuota = montoCapital / numCuotas;

    cuotas.filter((c: any) => c.fecha_vencimiento <= today && c.estado !== 'pagado').forEach((c: any) => {
      const montoCuota = parseFloat(c.monto_cuota) || 0;
      const montoPagado = parseFloat(c.monto_pagado) || 0;
      const pendiente = Math.max(0, montoCuota - montoPagado);

      if (pendiente > 0.01) {
        // El capital vencido se calcula proporcionalmente a cuánto de la cuota (que incluye interés) falta pagar
        const proporcionPendiente = montoCuota > 0 ? pendiente / montoCuota : 1;
        totalCapitalVencido += capitalPorCuota * proporcionPendiente;
        loansInMora.add(p.id);
      }
    });
  });

  return {
    tasaMorosidadCapital: totalCapitalOriginal > 0 ? (totalCapitalVencido / totalCapitalOriginal) * 100 : 0,
    capitalVencido: totalCapitalVencido,
    capitalOriginal: totalCapitalOriginal,
    countLoansInMora: loansInMora.size,
    loansInMoraIds: Array.from(loansInMora)
  };
}

/**
 * Calcula el score individual de un préstamo (0-100).
 * Basado en aumentos por puntualidad y castigos por atrasos.
 */
export function calculateLoanScore(loan: any, pagos: any[], today: string = getTodayPeru(), config: any = {}): LoanScore {
  let score = 100;
  let increases = 0;
  let penalties = 0;
  let pagos_puntuales = 0;
  let pagos_tardios = 0;
  const details: { label: string; value: number; type: 'increase' | 'penalty' }[] = [];

  const getVal = (key: string, fallback: number) => {
    const val = config[key];
    if (val === undefined || val === null || val === '') return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : Math.abs(num);
  };

  // Pesos dinamicos base desde config (con fallbacks legacy)
  const basePuntual = getVal('score_peso_puntual', 1);
  const baseTarde = getVal('score_peso_tarde', 5);

  const wCpp = getVal('score_peso_cpp', 10);
  const wMoroso = getVal('score_peso_moroso', 20);
  const wVencido = getVal('score_peso_vencido', 35);

  // Penalidades por dia de atraso y topes
  const wDiarioAtraso = getVal('score_peso_diario_atraso', 2);
  const wTopeAtrasoCuota = getVal('score_tope_atraso_cuota', 15);

  // Multiplicadores por frecuencia (Normalizacion)
  const freq = loan.frecuencia?.toLowerCase().trim() || 'diario';
  let multiplier = 1;
  if (freq === 'semanal') multiplier = Math.max(1, Number(config.score_mult_semanal) || 5);
  else if (freq === 'quincenal') multiplier = Math.max(1, Number(config.score_mult_quincenal) || 10);
  else if (freq === 'mensual') multiplier = Math.max(1, Number(config.score_mult_mensual) || 20);

  // Aplicar multiplicador solo a los pesos por cuota
  const wPuntual = basePuntual * multiplier;
  const wTarde = baseTarde * multiplier;

  const cronograma = loan.cronograma_cuotas || [];
  if (cronograma.length === 0) return { score: 100, increases: 0, penalties: 0, details: [], pagos_puntuales: 0, pagos_tardios: 0 };

  let maxHistoricalDelay = 0;

  // 1. Preparar Pool de Trazabilidad (Alineado con DailyCollectorLog.tsx)
  // [FILTRO SEGURIDAD] Excluir pagos rechazados explícitamente
  const rawPagos = (pagos || []).filter((p: any) => p.estado_verificacion !== 'rechazado');

  // Calcular Saldo de Sistema (Diferencia acumulada para resiliencia en migraciones)
  const totalPagadoEnPagos = rawPagos.reduce((s: number, p: any) => s + (Number(p.monto_pagado) || 0), 0);
  const totalPagadoEnCronograma = cronograma.reduce((s: number, c: any) => s + (Number(c.monto_pagado) || 0), 0);
  let systemMoney = Math.max(0, totalPagadoEnCronograma - totalPagadoEnPagos);

  const pool = [...rawPagos]
    .sort((a, b) => {
      const tA = new Date(a.created_at || a.fecha_pago).getTime();
      const tB = new Date(b.created_at || b.fecha_pago).getTime();
      return tA - tB;
    })
    .map(p => ({
      ...p,
      rem: Number(p.monto_pagado) || 0,
      // Convertimos a ISO Date (YYYY-MM-DD) en Lima para comparaciones exactas
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date(p.created_at || p.fecha_pago))
    }));

  const remainingNeeded: Record<string, number> = {};
  const quotaAssignments: Record<string, { amount: number, date: string, p: any }[]> = {};

  cronograma.forEach((q: any) => {
    remainingNeeded[q.id] = Number(q.monto_cuota) || 0;
    quotaAssignments[q.id] = [];
  });

  // FASE 1: Saldo de Sistema (Prioridad Histórica 0)
  if (systemMoney > 0.01) {
    cronograma.forEach((q: any) => {
      if (systemMoney <= 0.01 || remainingNeeded[q.id] <= 0.01) return;
      const take = Math.min(systemMoney, remainingNeeded[q.id]);
      remainingNeeded[q.id] -= take;
      systemMoney -= take;
      quotaAssignments[q.id].push({ amount: take, date: '0000-00-00', p: { isSystem: true, metodo_pago: 'Sistema' } });
    });
  }

  // FASE 2: Prioridad Día (Puntualidad - Misma Fecha)
  // Si un pago se hizo hoy, cubrir la cuota de hoy primero.
  pool.forEach((p: any) => {
    const sameDayQuota = cronograma.find((q: any) => q.fecha_vencimiento === p.date);
    if (sameDayQuota && remainingNeeded[sameDayQuota.id] > 0.01) {
      const take = Math.min(p.rem, remainingNeeded[sameDayQuota.id]);
      remainingNeeded[sameDayQuota.id] -= take;
      p.rem -= take;
      quotaAssignments[sameDayQuota.id].push({ amount: take, date: p.date, p });
    }
  });

  // FASE 3: Cascada FIFO Residual (Cubrir deudas antiguas o adelantar futuras)
  let pIdx = 0;
  cronograma.forEach((q: any) => {
    while (pIdx < pool.length && remainingNeeded[q.id] > 0.01) {
      const p = pool[pIdx];
      if (p.rem <= 0.01) {
        pIdx++;
        continue;
      }
      const take = Math.min(p.rem, remainingNeeded[q.id]);
      remainingNeeded[q.id] -= take;
      p.rem -= take;
      quotaAssignments[q.id].push({ amount: take, date: p.date, p });
      if (p.rem <= 0.01) pIdx++;
    }
  });

  // 2. Cálculo de Aumentos y Penalizaciones basado en la Trazabilidad Final
  cronograma.forEach((c: any) => {
    const target = Number(c.monto_cuota);
    const satisfied = target - (remainingNeeded[c.id] || 0);
    const isPaid = satisfied >= (target - 0.01);

    if (isPaid) {
      const assignments = quotaAssignments[c.id] || [];
      // En cascada de 3 fases, el "focusPayment" es el último que terminó de saldar la cuota
      const finishLine = assignments[assignments.length - 1];
      const focusPayment = finishLine?.p;

      if (focusPayment) {
        try {
          // Si es sistema, se asume puntual para no penalizar inconsistencias legacy
          if (focusPayment.isSystem) {
            increases += wPuntual;
            pagos_puntuales++; // [CORRECCIÓN] Incrementar contador para datos reales en UI
            details.push({ label: `Pago Puntual Cuota ${c.numero_cuota}`, value: wPuntual, type: 'increase' });
            return;
          }

          const fechaPagoStr = finishLine.date;
          const vDate = c.fecha_vencimiento || '';

          if (fechaPagoStr <= vDate) {
            increases += wPuntual;
            pagos_puntuales++;
            details.push({ label: `Pago Puntual Cuota ${c.numero_cuota}`, value: wPuntual, type: 'increase' });
          } else {
            // Pago tarde: Calcular días de atraso al momento de pagar
            const fechaPagoObj = new Date(finishLine.date + 'T12:00:00');
            const fechaVencObj = new Date(c.fecha_vencimiento + 'T12:00:00');
            const diffTime = fechaPagoObj.getTime() - fechaVencObj.getTime();
            const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            maxHistoricalDelay = Math.max(maxHistoricalDelay, diffDays);

            const isSystem = focusPayment.metodo_pago === 'Sistema' ||
              focusPayment.metodo_pago === 'Renovación' ||
              focusPayment.metodo_pago === 'Excedente' ||
              focusPayment.es_autopago_renovacion === true;

            // Penalidad:
            // 1. Si es pago por Sistema (Renovación), penalizamos por días reales (más severo).
            // 2. Si es pago por Cliente (aunque sea tarde), usamos la penalidad base fija (menos severo).
            const dayPenalty = Math.min(wTopeAtrasoCuota, diffDays * wDiarioAtraso);
            const finalPenalty = isSystem ? Math.max(wTarde, dayPenalty) : wTarde;
            
            penalties += finalPenalty;
            pagos_tardios++;

            const label = isSystem
              ? `Regularización Tardía (Mora) - Cuota ${c.numero_cuota} (${diffDays}d)`
              : `Pago Tarde Cuota ${c.numero_cuota}`;

            details.push({ label, value: finalPenalty, type: 'penalty' });
          }
        } catch (e) {
          console.error('Error parsing payment date:', e);
        }
      }
    } else if (c.fecha_vencimiento < today) {
      // Cuota vencida activa (No alcanzada por ninguna de las 3 fases)
      const vDate = new Date(c.fecha_vencimiento + 'T12:00:00');
      const tDate = new Date(today + 'T12:00:00');
      const diffTime = tDate.getTime() - vDate.getTime();
      const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

      maxHistoricalDelay = Math.max(maxHistoricalDelay, diffDays);

      // Peso configurable por dia, con tope configurable por cuota
      const dayPenalty = Math.min(wTopeAtrasoCuota, diffDays * wDiarioAtraso);
      penalties += dayPenalty;
      details.push({ label: `Atraso Cuota ${c.numero_cuota} (${diffDays}d)`, value: dayPenalty, type: 'penalty' });
    }


  });

  // 2. Castigos por Riesgo Histórico (Uso directo de estado_mora para evitar recálculo dinámico en score)
  const currentMora = loan.estado_mora?.toLowerCase().trim();

  if (['vencido', 'legal', 'castigado'].includes(currentMora)) {
    penalties += wVencido;
    details.push({ label: 'Riesgo Histórico: VENCIDO', value: wVencido, type: 'penalty' });
  } else if (currentMora === 'moroso') {
    penalties += wMoroso;
    details.push({ label: 'Riesgo Histórico: MOROSO', value: wMoroso, type: 'penalty' });
  } else if (currentMora === 'cpp') {
    penalties += wCpp;
    details.push({ label: 'Riesgo Histórico: CPP', value: wCpp, type: 'penalty' });
  }

  score = Math.max(0, Math.min(100, score + increases - penalties));

  return { score, increases, penalties, details, pagos_puntuales, pagos_tardios };
}

export function calculateClientReputation(client: any, allLoans: any[], config: any = {}) {
  if (!client) return { score: 0, details: [], metrics: {} };

  // 1. Obtención de parámetros dinámicos con fallbacks robustos
  const startScore = 100;
  const getConfigValue = (key: string, fallback: number) => {
    const val = config[key];
    if (val === undefined || val === null || val === '') return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : Math.abs(num);
  };

  const bFinalizado = getConfigValue('reputation_bonus_finalizado', 10);
  const bRenovado = getConfigValue('reputation_bonus_renovado', 15);
  const bSaludExcelencia = getConfigValue('reputation_bonus_salud_excelente', 10);
  const bAntiguedadMensual = getConfigValue('reputation_bonus_antiguedad_mensual', 1);

  const pRefinanciado = getConfigValue('reputation_penalty_refinanciado', 20);
  const pVencido = getConfigValue('reputation_penalty_vencido', 40);
  const pSaludPobre = getConfigValue('reputation_penalty_salud_pobre', 25);

  const relevantLoans = allLoans.filter(l => 
    ['finalizado', 'liquidado', 'renovado', 'refinanciado', 'activo'].includes(l.estado) &&
    l.estado_verificacion !== 'rechazado'
  );
  const totalProcessed = relevantLoans.length;
  const metrics: any = {
    totalFinished: 0,
    totalRenovated: 0,
    totalRefinanced: 0,
    totalVencido: 0,
    avgPerformance: 0,
    months: 0
  };

  const details: any[] = [
    { 
      label: 'Puntaje Base Histórico', 
      value: startScore, 
      type: 'base', 
      date: client.created_at || new Date(0).toISOString(),
      description: 'Todo cliente inicia con un récord impecable.' 
    }
  ];

  let currentScore = startScore;
  let totalHistoricalHealth = 0;

  // 2. Evaluación de Historial de Préstamos (Orden cronológico por fecha de creación)
  const sortedLoans = [...relevantLoans].sort((a, b) => 
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  sortedLoans.forEach(l => {
    // Calcular salud individual para el promedio histórico
    let flatPagosRaw = l.pagos || [];
    if (flatPagosRaw.length === 0 && l.cronograma_cuotas) {
      flatPagosRaw = l.cronograma_cuotas.flatMap((c: any) => c.pagos || []);
    }
    const flatPagos = flatPagosRaw.filter((p: any) => p.estado_verificacion !== 'rechazado');
    const loanScore = calculateLoanScore(l, flatPagos, getTodayPeru(), config);
    totalHistoricalHealth += loanScore.score;

    // APLICAR BONOS (Con tope estricto de 100 en cada paso)
    if (l.estado === 'renovado') {
      metrics.totalRenovated++;
      const valToAdd = bRenovado;
      const prev = currentScore;
      currentScore = Math.min(100, currentScore + valToAdd);
      const effectivelyAdded = currentScore - prev;
      details.push({ 
        label: `Renovación Exitosa (P#${l.id.split('-')[0]})`, 
        value: valToAdd, 
        effectivelyAdded, 
        type: 'increase',
        date: l.created_at,
        isCapped: valToAdd > effectivelyAdded
      });
    } else if (l.estado === 'finalizado' || l.estado === 'liquidado') {
      metrics.totalFinished++;
      const valToAdd = bFinalizado;
      const prev = currentScore;
      currentScore = Math.min(100, currentScore + valToAdd);
      const effectivelyAdded = currentScore - prev;
      details.push({ 
        label: `Préstamo Pagado (P#${l.id.split('-')[0]})`, 
        value: valToAdd, 
        effectivelyAdded, 
        type: 'increase',
        date: l.created_at,
        isCapped: valToAdd > effectivelyAdded
      });
    }

    // APLICAR PENALIDADES (Resta directa)
    if (l.estado === 'refinanciado') {
      metrics.totalRefinanced++;
      currentScore = Math.max(0, currentScore - pRefinanciado);
      details.push({ label: `Refinanciación por Mora (P#${l.id.split('-')[0]})`, value: -pRefinanciado, effectivelyAdded: -pRefinanciado, type: 'penalty', date: l.created_at });
    }

    const em = (l.estado_mora?.toLowerCase() || l.estado?.toLowerCase() || '');
    if (em === 'vencido') {
      metrics.totalVencido++;
      currentScore = Math.max(0, currentScore - pVencido);
      details.push({ 
        label: `Riesgo: Préstamo Vencido (P#${l.id.split('-')[0]})`, 
        value: -pVencido, 
        effectivelyAdded: -pVencido, 
        type: 'penalty', 
        date: l.created_at 
      });
    }
  });

  // 3. Evaluación de Salud Promedio
  const avgPerformance = totalProcessed > 0 ? (totalHistoricalHealth / totalProcessed) : 100;
  metrics.avgPerformance = avgPerformance;

  if (avgPerformance >= 85 && totalProcessed > 0) {
    const prev = currentScore;
    currentScore = Math.min(100, currentScore + bSaludExcelencia);
    const added = currentScore - prev;
    details.push({ 
      label: 'Excelencia en Salud Histórica', 
      value: bSaludExcelencia, 
      effectivelyAdded: added, 
      type: 'increase', 
      date: new Date().toISOString(),
      isCapped: bSaludExcelencia > added
    });
  } else if (avgPerformance < 50 && totalProcessed > 0) {
    currentScore = Math.max(0, currentScore - pSaludPobre);
    details.push({ label: 'Riesgo: Historial de Baja Salud', value: -pSaludPobre, effectivelyAdded: -pSaludPobre, type: 'penalty', date: new Date().toISOString() });
  }

  // 4. Antigüedad
  let months = 0;
  if (client.created_at) {
    const createdAt = new Date(client.created_at);
    if (!isNaN(createdAt.getTime())) {
      months = Math.floor((new Date().getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30));
      metrics.months = months;
      if (months > 0 && bAntiguedadMensual > 0) {
        const bonusTotal = months * bAntiguedadMensual;
        const prev = currentScore;
        currentScore = Math.min(100, currentScore + bonusTotal);
        const effectivelyAdded = currentScore - prev;
        details.push({ 
          label: `Meses de Continuidad (${months}m)`, 
          value: bonusTotal, 
          effectivelyAdded, 
          type: 'increase',
          date: new Date().toISOString(),
          isCapped: bonusTotal > effectivelyAdded
        });
      }
    }
  }

  // 5. Ordenamiento Final por fecha
  details.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const finalScore = Math.round(currentScore);

  return {
    score: finalScore,
    details,
    metrics
  };
}
/**
 * Determina la situación financiera global de un cliente basada primordialmente 
 * en las etiquetas de auditoría de la base de datos (estado_mora).
 */
export function calculateClientSituation(client: any) {
  if (client.estado === 'inactivo') return 'inactivo';

  const activeLoans = (client.prestamos || []).filter((p: any) => {
    // Si ya está finalizado en BD, descartar
    if (p.estado !== 'activo') return false

    // Si es una migración, verificar saldo
    const isMigrado = (p.observacion_supervisor || '').includes('Préstamo migrado') || (p.observacion_supervisor || '').includes('[MIGRACIÓN]')
    if (isMigrado) {
      // Calcular saldo (Redundante pero seguro)
      let saldo = 0
      if (p.cronograma_cuotas) {
        saldo = p.cronograma_cuotas.reduce((acc: number, c: any) => acc + (c.monto_cuota - (c.monto_pagado || 0)), 0)
      } else if (p.monto !== undefined && p.interes !== undefined) {
        // Fallback a cálculo de capital + interés si no hay cronograma cargado
        const totalPagar = Number(p.monto) * (1 + (Number(p.interes) / 100))
        // Aquí no tenemos total_pagado_acumulado fácilmente, así que confiamos en el cronograma
        // o dejamos que pase como activo. Por suerte en las vistas de lista SÍ traemos cronograma.
      }
      if ((p.cronograma_cuotas?.length ?? 0) > 0 && saldo <= 0.01) return false
    }

    return true
  });

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

/**
 * ORQUESTADOR CENTRALIZADO DE EVALUACION
 * Procesa la data cruda de Supabase y devuelve todos los scores necesarios.
 * Usalo en perfiles de cliente, APIs de elegibilidad y modales de renovacion.
 * @param allPayments Opcional - Un array plano con TODOS los pagos del cliente para optimizar consultas.
 * @param targetLoanId Opcional - ID del prestamo especifico que se desea evaluar para "Salud del Prestamo".
 * @param config Opcional - Objeto con pesos de score dinámicos.
 */
export function getComprehensiveEvaluation(client: any, loans: any[], allPayments?: any[], targetLoanId?: string, config: any = {}, todayOverride?: string) {
  const today = todayOverride || getTodayPeru();

  // 1. Encontrar el préstamo para evaluar Salud
  // Prioridad: 1. targetLoanId, 2. Primer préstamo activo no liquidado
  const activeLoan = (loans || []).find((l: any) => {
    if (targetLoanId) return l.id === targetLoanId;

    const isMigrado = (l.observacion_supervisor || '').includes('Préstamo migrado') || (l.observacion_supervisor || '').includes('[MIGRACIÓN]');
    const isEffectivelyFinalized = isMigrado && (l.saldo_pendiente || 0) <= 0.01;
    const isRejected = l.estado_verificacion === 'rechazado';
    return l.estado === 'activo' && !isEffectivelyFinalized && !isRejected;
  });

  // Inyectar pagos si se proveen de forma externa (optimización para APIs)
  const enrichedLoans = (loans || []).map(l => {
    if (allPayments && allPayments.length > 0) {
      // [AISLAMIENTO ESTRICTO] 
      // Para coincidir con el dashboard (Score de 18), filtramos ÚNICAMENTE por cuota_id.
      // Esto evita que excedentes o pagos de otros préstamos "limpios" inflen este score.
      const loanCuotasIds = new Set((l.cronograma_cuotas || []).map((c: any) => c.id));

      const loanPaymentsMap = new Map();
      allPayments.forEach((p: any) => {
        const belongsToThisLoan = (p.cuota_id && loanCuotasIds.has(p.cuota_id));

        if (belongsToThisLoan) {
          // Evitar duplicados si vienen de múltiples fuentes (Supabase joins)
          loanPaymentsMap.set(p.id, p);
        }
      });

      return { ...l, pagos: Array.from(loanPaymentsMap.values()) };
    }
    return l;
  });

  const targetActiveLoan = activeLoan ? enrichedLoans.find(l => l.id === activeLoan.id) : null;

  let healthScoreData = null;
  if (targetActiveLoan) {
    // Asegurar que tenemos los pagos aplanados para este préstamo
    let flatPagos = targetActiveLoan.pagos || [];

    // Si no vienen aplanados (fallback para dashboard o consultas simples), buscar en las cuotas
    if (flatPagos.length === 0 && targetActiveLoan.cronograma_cuotas) {
      flatPagos = targetActiveLoan.cronograma_cuotas.flatMap((c: any) => c.pagos || []);
    }

    healthScoreData = calculateLoanScore(targetActiveLoan, flatPagos, today, config);
  }

  // 2. Calcular Reputación con TODO el historial enriquecido
  const reputationData = calculateClientReputation(client, enrichedLoans, config);

  // 3. Calcular hábito de pago consolidado
  let countEfectivo = 0;
  let countDigital = 0;
  let totalPaymentsCount = 0;

  if (allPayments && allPayments.length > 0) {
    allPayments.filter((p: any) => p.estado_verificacion !== 'rechazado').forEach(p => {
      totalPaymentsCount++;
      if ((p.metodo_pago || 'Efectivo') === 'Efectivo') countEfectivo++;
      else countDigital++;
    });
  } else {
    enrichedLoans.forEach(l => {
      const cronograma = l.cronograma_cuotas || [];
      cronograma.forEach((c: any) => {
        const cuotaPagos = (c.pagos || []).filter((p: any) => p.estado_verificacion !== 'rechazado');
        cuotaPagos.forEach((p: any) => {
          totalPaymentsCount++;
          const method = p.metodo_pago || 'Efectivo';
          if (method === 'Efectivo') countEfectivo++;
          else countDigital++;
        });
      });
    });
  }

  return {
    healthScore: healthScoreData?.score || 100,
    healthScoreData,
    reputationData,
    reputationScore: reputationData.score,
    paymentHabits: {
      totalPayments: totalPaymentsCount,
      countEfectivo,
      countDigital,
      pctEfectivo: totalPaymentsCount > 0 ? Math.round((countEfectivo / totalPaymentsCount) * 100) : 0,
      pctDigital: totalPaymentsCount > 0 ? Math.round((countDigital / totalPaymentsCount) * 100) : 0
    },
    today
  };
}

/**
 * Calcula el ajuste de capital recomendado para una renovación basado en Score Dual.
 * @param healthScore Score de salud del préstamo actual (0-100)
 * @param reputationScore Score de reputación histórica del cliente (0-100)
 * @param montoOriginal Capital del préstamo anterior
 * @param saldoPendiente Opcional - Saldo que el cliente aún debe del préstamo actual
 * @returns Factores de ajuste y montos limites sugeridos
 */
export function calculateRenovationAdjustment(
  healthScore: number, 
  reputationScore: number, 
  montoOriginal: number,
  saldoPendiente: number = 0,
  config: any = {}
) {
  const getConfigValue = (key: string, fallback: number) => {
    const val = config[key];
    if (val === undefined || val === null || val === '') return fallback;
    const num = Number(val);
    return isNaN(num) ? fallback : num;
  };

  const aExcelente = getConfigValue('renovacion_aumento_excelente', 20);
  const aMuyBueno = getConfigValue('renovacion_aumento_muy_bueno', 15);
  const aBueno = getConfigValue('renovacion_aumento_bueno', 10);
  const aRegular = getConfigValue('renovacion_aumento_regular', 0);
  const rRiesgo = getConfigValue('renovacion_reduccion_riesgo', -15);

  const bRepExcelente = getConfigValue('renovacion_bono_reputacion_excelente', 10);
  const bRepBueno = getConfigValue('renovacion_bono_reputacion_bueno', 5);

  // 1. Ajuste Base por Salud (Capacidad de pago demostrada hoy)
  let baseIncreasePct = 0;
  if (healthScore >= 90) baseIncreasePct = aExcelente;
  else if (healthScore >= 75) baseIncreasePct = aMuyBueno;
  else if (healthScore >= 60) baseIncreasePct = aBueno;
  else if (healthScore >= 40) baseIncreasePct = aRegular;
  else baseIncreasePct = rRiesgo; // Reducción sugerida por riesgo (Estándar Dual-Score)

  // 2. Plus por Reputación (Confianza histórica)
  // El bonus solo aplica si la salud actual no es crítica (>= 40)
  let reputationBonusPct = 0;
  if (healthScore >= 40) {
    if (reputationScore >= 90) reputationBonusPct = bRepExcelente;
    else if (reputationScore >= 75) reputationBonusPct = bRepBueno;
  }

  const totalPotentialPct = baseIncreasePct + reputationBonusPct;
  const montoSugerido = montoOriginal * (1 + totalPotentialPct / 100);
  
  // 3. Monto Mínimo: 50% del capital anterior o el saldo pendiente (lo que sea mayor)
  // Para evitar que el cliente pida menos de lo que ya debe.
  const montoMinimoSugerido = Math.max(montoOriginal * 0.5, saldoPendiente);

  return {
    baseIncreasePct,
    reputationBonusPct,
    totalPotentialPct,
    montoSugerido: Math.round(montoSugerido * 100) / 100,
    montoMaximo: Math.round(montoSugerido * 100) / 100, // Alias para claridad en UI
    montoMinimo: Math.round(montoMinimoSugerido * 100) / 100,
    esReduccion: totalPotentialPct < 0,
    esAumento: totalPotentialPct > 0,
    detalles: [
      {
        factor: 'Salud',
        pct: baseIncreasePct,
        razon: healthScore >= 90 ? 'Excelente (>=90 pts)' :
          healthScore >= 75 ? 'Muy Bueno (>=75 pts)' :
            healthScore >= 60 ? 'Bueno (>=60 pts)' :
              healthScore >= 40 ? 'Regular (>=40 pts)' : 'Riesgo crítico (<40 pts)'
      },
      {
        factor: 'Reputación',
        pct: reputationBonusPct,
        razon: reputationBonusPct > 0 ? (reputationScore >= 90 ? 'Bono Excelente (>=90 pts)' : 'Bono Bueno (>=75 pts)') :
          (healthScore < 40 ? 'Bono bloqueado: Se requiere Salud >= 40 pts para aplicar beneficios de reputación.' : 'Sin bono: Puntaje insuficiente (<75 pts).'),
        status: healthScore < 40 ? 'BLOQUEADO' : undefined
      }
    ]
  };
}

/**
 * Obtiene toda la configuración financiera (scores y reputación) de forma centralizada.
 */
export async function getFinancialConfig(supabase: any) {
  const { data: configRows } = await supabase
    .from('configuracion_sistema')
    .select('clave, valor')
    .in('clave', [
      'score_peso_puntual',
      'score_peso_tarde',
      'score_peso_cpp',
      'score_peso_moroso',
      'score_peso_vencido',
      'score_peso_diario_atraso',
      'score_tope_atraso_cuota',
      'score_mult_semanal',
      'score_mult_quincenal',
      'score_mult_mensual',
      'reputation_bonus_finalizado',
      'reputation_bonus_renovado',
      'reputation_bonus_salud_excelente',
      'reputation_penalty_refinanciado',
      'reputation_penalty_vencido',
      'reputation_penalty_salud_pobre',
      'reputation_bonus_antiguedad_mensual',
      'renovacion_aumento_excelente',
      'renovacion_aumento_muy_bueno',
      'renovacion_aumento_bueno',
      'renovacion_aumento_regular',
      'renovacion_reduccion_riesgo',
      'renovacion_bono_reputacion_excelente',
      'renovacion_bono_reputacion_bueno'
    ]);

  return (configRows || []).reduce((acc: any, row: any) => ({ ...acc, [row.clave]: row.valor }), {});
}

/**
 * ACCION ATOMICA DE EVALUACION DE SALUD (18 PTS TRUTH)
 * Esta es la unica funcion que debe usarse para obtener el score de salud de un prestamo.
 * Encapsula el fetching de datos identico al Dashboard para garantizar paridad.
 */
export async function getLoanHealthScoreAction(supabase: any, loanId: string, todayOverride?: string) {
  const today = todayOverride || getTodayPeru();

  // 1. Obtener prestamo y cronograma
  const { data: prestamo } = await supabase
    .from('prestamos')
    .select('*, clientes(*)')
    .eq('id', loanId)
    .single();

  const { data: cronograma } = await supabase
    .from('cronograma_cuotas')
    .select('*')
    .eq('prestamo_id', loanId)
    .order('numero_cuota', { ascending: true });

  // 2. Obtener pagos (Stricto sensu - solo por ID de cuota para paridad con 18 pts)
  const cuotaIds = cronograma?.map((c: any) => c.id) || [];
  let pagos: any[] = [];
  if (cuotaIds.length > 0) {
    const { data: qPagos } = await supabase
      .from('pagos')
      .select('*')
      .in('cuota_id', cuotaIds);
    pagos = qPagos || [];
  }

  // 3. Obtener configuracion centralizada
  const config = await getFinancialConfig(supabase);

  // 4. Ejecutar formula centralizada con pesos dinamicos
  const metrics = calculateLoanMetrics(
    { ...prestamo, cronograma_cuotas: cronograma || [] },
    today,
    config,
    pagos
  );

  // Mantener compatibilidad con código existente que espera score y details en el primer nivel
  return {
    ...metrics,
    score: metrics.loanScore?.score ?? 100,
    details: metrics.loanScore?.details ?? [],
    pagos_puntuales: metrics.loanScore?.pagos_puntuales ?? 0,
    pagos_tardios: metrics.loanScore?.pagos_tardios ?? 0,
  };
}

/**
 * ACCION ATOMICA DE EVALUACION DE REPUTACION DEL CLIENTE
 * Centraliza la obtencion de datos y el calculo para garantizar paridad entre vistas.
 */
export async function getClientReputationAction(supabase: any, clienteId: string, todayOverride?: string) {
  // 1. Obtener perfil del cliente con antiguedad
  const { data: client } = await supabase
    .from('clientes')
    .select('*, asesor:asesor_id(nombre_completo)')
    .eq('id', clienteId)
    .single();

  if (!client) throw new Error('Cliente no encontrado');

  // 2. Obtener TODO el historial con cuotas y pagos anidados (Cascada Completa)
  const { data: allLoans, error: loansError } = await supabase
    .from('prestamos')
    .select(`
        *,
        cronograma_cuotas (
            *,
            pagos (*)
        )
    `)
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false });

  if (loansError) {
    console.error('❌ Error fetching allLoans for reputation:', loansError);
    throw loansError;
  }

  // 3. Obtener configuracion centralizada
  const systemConfig = await getFinancialConfig(supabase);

  // 4. Ejecutar Evaluacion Integral (Formula que no debe alterarse)
  // Pasamos [] como allPayments porque ya vienen anidados en los loans
  return getComprehensiveEvaluation(client, allLoans || [], [], undefined, systemConfig, todayOverride);
}

/**
 * GENERACION DE CRONOGRAMA CENTRALIZADA (NODE.JS)
 * Reemplaza la logica de base de datos para garantizar consistencia con feriados y domingos.
 */
export async function generarCronogramaNode(supabase: any, prestamoId: string) {
    // 1. Obtener datos del préstamo
    const { data: prestamo, error: pError } = await supabase
        .from('prestamos')
        .select('*')
        .eq('id', prestamoId)
        .single();

    if (pError || !prestamo) throw new Error('Préstamo no encontrado para generación de cronograma');

    // 0. Seguridad: No regenerar si hay cuotas pagadas (total o parcialmente)
    const { data: cuotasPagadas } = await supabase
        .from('cronograma_cuotas')
        .select('id')
        .eq('prestamo_id', prestamoId)
        .gt('monto_pagado', 0)
        .limit(1);

    if (cuotasPagadas && cuotasPagadas.length > 0) {
        throw new Error('No se puede sincronizar el cronograma porque ya existen cuotas con pagos registrados.');
    }

    // 2. Obtener feriados
    const { data: holidaysData } = await supabase.from('feriados').select('fecha');
    const holidaysSet = new Set(holidaysData?.map((h: any) => {
        if (typeof h.fecha === 'string') return h.fecha.split('T')[0];
        return String(h.fecha).split('T')[0];
    }) || []);

    // 3. Preparar variables
    const nCuotas = prestamo.cuotas;
    const nFrecuencia = (prestamo.frecuencia || 'diario').toLowerCase();
    const fInicioStr = prestamo.fecha_inicio;
    
    // Parse UTC Date safely
    const [y, m, d] = fInicioStr.split('-').map(Number);
    const fInicio = new Date(Date.UTC(y, m - 1, d));

    const totalToPay = prestamo.monto * (1 + (prestamo.interes / 100));
    const quotaAmount = Math.round((totalToPay / nCuotas) * 100) / 100;
    
    const schedule = [];
    const anchorDate = new Date(fInicio);

    const validateDate = (d: Date): Date => {
        let check = new Date(d);
        let safety = 0;
        while (safety < 30) {
            safety++;
            const dayOfWeek = check.getUTCDay();
            const dateStr = check.toISOString().split('T')[0];
            if (dayOfWeek === 0 || holidaysSet.has(dateStr)) {
                check.setUTCDate(check.getUTCDate() + 1);
            } else break;
        }
        return check;
    };

    if (nFrecuencia === 'diario') {
        // Domino: cada cuota desde el día hábil anterior + 1
        let currentDate = new Date(anchorDate);
        currentDate.setUTCDate(currentDate.getUTCDate() + 1);
        for (let i = 1; i <= nCuotas; i++) {
            let next = new Date(currentDate);
            next.setUTCDate(next.getUTCDate() + 1);
            next = validateDate(next);
            schedule.push({
                prestamo_id: prestamoId,
                numero_cuota: i,
                monto_cuota: i === nCuotas ? parseFloat((totalToPay - (quotaAmount * (nCuotas - 1))).toFixed(2)) : quotaAmount,
                fecha_vencimiento: next.toISOString().split('T')[0],
                estado: 'pendiente'
            });
            currentDate = next;
        }
    } else {
        // Ancla fija: cada cuota se calcula desde fecha_inicio, no desde la cuota ajustada anterior
        for (let i = 1; i <= nCuotas; i++) {
            let next = new Date(anchorDate);
            if (nFrecuencia === 'semanal') next.setUTCDate(next.getUTCDate() + i * 7);
            else if (nFrecuencia === 'quincenal') next.setUTCDate(next.getUTCDate() + i * 14);
            else next.setUTCMonth(next.getUTCMonth() + i);
            next = validateDate(next);
            schedule.push({
                prestamo_id: prestamoId,
                numero_cuota: i,
                monto_cuota: i === nCuotas ? parseFloat((totalToPay - (quotaAmount * (nCuotas - 1))).toFixed(2)) : quotaAmount,
                fecha_vencimiento: next.toISOString().split('T')[0],
                estado: 'pendiente'
            });
        }
    }

    // 4. Operaciones en DB
    // a. Limpiar cronograma antiguo
    await supabase.from('cronograma_cuotas').delete().eq('prestamo_id', prestamoId);

    // b. Insertar nuevo cronograma
    const { error: insError } = await supabase.from('cronograma_cuotas').insert(schedule);
    if (insError) throw insError;

    // c. Actualizar fecha_fin del préstamo
    const finalEndDate = schedule[schedule.length - 1].fecha_vencimiento;
    await supabase.from('prestamos').update({ fecha_fin: finalEndDate }).eq('id', prestamoId);

    return { success: true, fecha_fin: finalEndDate };
}
