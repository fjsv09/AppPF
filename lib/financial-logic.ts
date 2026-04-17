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
      cuotasPagadas: 0
    };
  }

  const cronograma = loan.cronograma_cuotas || [];

  // Fuente de verdad para pagos: standalonePagos > loan.pagos > flatMap(cronograma.pagos)
  const pagos = standalonePagos || loan.pagos || cronograma.flatMap((c: any) => c.pagos || []);

  const totalPagar = Number(loan.monto) * (1 + (Number(loan.interes) / 100));

  // 0. Cálculo de Pagado Real (Basado en transacciones reales para evitar desincronización con el cronograma)
  // Si tenemos el array de pagos, sumamos el monto_pagado de cada uno.
  const totalPagadoAcumuladoReal = pagos.length > 0
    ? pagos.reduce((sum: number, p: any) => sum + (Number(p.monto_pagado) || 0), 0)
    : cronograma.reduce((sum: number, c: any) => sum + (Number(c.monto_pagado) || 0), 0);

  // Usamos el mayor para ser resilientes a desincronizaciones puntuales en BD
  const totalPagadoAcumulado = Math.max(totalPagadoAcumuladoReal, cronograma.reduce((sum: number, c: any) => sum + (Number(c.monto_pagado) || 0), 0));

  if (loan.estado !== 'activo') {
    return {
      cuotasAtrasadas: 0,
      deudaExigibleTotal: 0,
      deudaExigibleHoy: 0,
      cuotaDiaHoy: 0,
      cuotaDiaProgramada: 0,
      cobradoHoy: 0,
      cobradoRutaHoy: 0,
      totalPagadoAcumulado: totalPagadoAcumulado,
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
      totalCuotas: cronograma.length,
      cuotasPagadas: cronograma.filter((c: any) => c.estado === 'pagado').length
    };
  }

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
    .filter((pay: any) => getIsToday(pay.created_at || pay.fecha_pago))
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
  // Importante: Aquí recalculamos la deuda exigible basada en el TOTAL pagado acumulado real
  // para que si el dinero se aplicó por cascada, el "Atraso" global disminuya correctamente.
  const valorCuotaPromedio = cronograma.length > 0
    ? cronograma.reduce((s: number, c: any) => s + Number(c.monto_cuota), 0) / cronograma.length
    : 0;

  const totalExigibleHastaHoy = cronograma
    .filter((c: any) => c.fecha_vencimiento <= today)
    .reduce((sum: number, c: any) => sum + Number(c.monto_cuota), 0);

  const deudaExigibleHoy = Math.max(0, totalExigibleHastaHoy - totalPagadoAcumulado);

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
    riesgoPorcentaje < 10 &&
    !['vencido', 'legal', 'castigado'].includes(loan.estado_mora)
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
    totalCuotas: loan.numero_cuotas || loan.cuotas || (valorCuotaPromedio > 0 ? Math.round(totalPagar / valorCuotaPromedio) : 0) || cronograma.length,
    cuotasPagadas: valorCuotaPromedio > 0 ? Math.floor(totalPagadoAcumulado / valorCuotaPromedio) : 0,
    loanScore: calculateLoanScore(loan, pagos, today) // Integración del nuevo score
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
  const details: { label: string; value: number; type: 'increase' | 'penalty' }[] = [];

  // Pesos dinamicos base desde config (con fallbacks legacy)
  const basePuntual = Math.abs(Number(config.score_peso_puntual) ?? 1);
  const baseTarde = Math.abs(Number(config.score_peso_tarde) ?? 5);

  const wCpp = Math.abs(Number(config.score_peso_cpp) ?? 10);
  const wMoroso = Math.abs(Number(config.score_peso_moroso) ?? 20);
  const wVencido = Math.abs(Number(config.score_peso_vencido) ?? 35);

  // Penalidades por dia de atraso y topes
  const wDiarioAtraso = Math.abs(Number(config.score_peso_diario_atraso) ?? 2);
  const wTopeAtrasoCuota = Math.abs(Number(config.score_tope_atraso_cuota) ?? 15);

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
  if (cronograma.length === 0) return { score: 100, increases: 0, penalties: 0, details: [] };

  let maxHistoricalDelay = 0;

  // 1. Preparar Pool de Trazabilidad (Alineado con DailyCollectorLog.tsx)
  const rawPagos = (pagos || []);

  // Calcular Saldo de Sistema (Diferencia acumulada para resiliencia en migraciones)
  const totalPagadoEnPagos = rawPagos.reduce((s, p) => s + (Number(p.monto_pagado) || 0), 0);
  const totalPagadoEnCronograma = cronograma.reduce((s, c) => s + (Number(c.monto_pagado) || 0), 0);
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

  cronograma.forEach(q => {
    remainingNeeded[q.id] = Number(q.monto_cuota) || 0;
    quotaAssignments[q.id] = [];
  });

  // FASE 1: Saldo de Sistema (Prioridad Histórica 0)
  if (systemMoney > 0.01) {
    cronograma.forEach(q => {
      if (systemMoney <= 0.01 || remainingNeeded[q.id] <= 0.01) return;
      const take = Math.min(systemMoney, remainingNeeded[q.id]);
      remainingNeeded[q.id] -= take;
      systemMoney -= take;
      quotaAssignments[q.id].push({ amount: take, date: '0000-00-00', p: { isSystem: true, metodo_pago: 'Sistema' } });
    });
  }

  // FASE 2: Prioridad Día (Puntualidad - Misma Fecha)
  // Si un pago se hizo hoy, cubrir la cuota de hoy primero.
  pool.forEach(p => {
    const sameDayQuota = cronograma.find(q => q.fecha_vencimiento === p.date);
    if (sameDayQuota && remainingNeeded[sameDayQuota.id] > 0.01) {
      const take = Math.min(p.rem, remainingNeeded[sameDayQuota.id]);
      remainingNeeded[sameDayQuota.id] -= take;
      p.rem -= take;
      quotaAssignments[sameDayQuota.id].push({ amount: take, date: p.date, p });
    }
  });

  // FASE 3: Cascada FIFO Residual (Cubrir deudas antiguas o adelantar futuras)
  cronograma.forEach(q => {
    pool.forEach(p => {
      if (remainingNeeded[q.id] <= 0.01 || p.rem <= 0.01) return;
      const take = Math.min(p.rem, remainingNeeded[q.id]);
      remainingNeeded[q.id] -= take;
      p.rem -= take;
      quotaAssignments[q.id].push({ amount: take, date: p.date, p });
    });
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
            return;
          }

          const fechaPagoStr = finishLine.date;
          const vDate = c.fecha_vencimiento || '';

          if (fechaPagoStr <= vDate) {
            increases += wPuntual;
          } else {
            // Pago tarde
            penalties += wTarde;

            // Calcular cuántos días de atraso tuvo al ser pagada para el histórico
            const fechaPagoObj = new Date(focusPayment.created_at || focusPayment.fecha_pago);
            const fechaVencObj = new Date(c.fecha_vencimiento + 'T12:00:00');
            const diffTime = fechaPagoObj.getTime() - fechaVencObj.getTime();
            const diffDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
            maxHistoricalDelay = Math.max(maxHistoricalDelay, diffDays);

            const isSystem = !focusPayment.asesor_id ||
              focusPayment.metodo_pago === 'Sistema' ||
              focusPayment.metodo_pago === 'Excedente' ||
              focusPayment.es_autopago_renovacion;

            const label = isSystem
              ? `Regularización Tardía (Mora) - Cuota ${c.numero_cuota}`
              : `Pago Tarde Cuota ${c.numero_cuota}`;

            details.push({ label, value: wTarde, type: 'penalty' });
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

  // 2. Castigos por Riesgo Histórico Máximo (Fusión Opción B: Comportamiento + Estado de Negocio + Fecha)
  const isVencidoState = ['vencido', 'legal', 'castigado'].includes(loan.estado?.toLowerCase().trim() || '') ||
    ['vencido', 'legal', 'castigado'].includes(loan.estado_mora?.toLowerCase().trim() || '') ||
    (loan.fecha_final && loan.fecha_final < today);

  const totalRemaining = Object.values(remainingNeeded).reduce((a, b) => a + b, 0);

  if (maxHistoricalDelay > 30 || (isVencidoState && totalRemaining > 0.01)) {
    penalties += wVencido;
    const label = (isVencidoState && totalRemaining > 0.01) ? 'Riesgo Crítico: PRÉSTAMO VENCIDO' : 'Riesgo Histórico: VENCIDO';
    details.push({ label, value: wVencido, type: 'penalty' });
  } else if (maxHistoricalDelay > 8) {
    penalties += wMoroso;
    details.push({ label: 'Riesgo Histórico: MOROSO', value: wMoroso, type: 'penalty' });
  } else if (maxHistoricalDelay >= 2) {
    penalties += wCpp;
    details.push({ label: 'Riesgo Histórico: CPP', value: wCpp, type: 'penalty' });
  }

  score = Math.max(0, Math.min(100, score + increases - penalties));

  return { score, increases, penalties, details };
}

export function calculateClientReputation(client: any, allLoans: any[], config: any = {}) {
  if (!client) return { score: 0, details: [], metrics: {} };

  const finishedLoans = allLoans.filter(l => ['finalizado', 'liquidado'].includes(l.estado));
  const totalFinished = finishedLoans.length;
  const details = [];

  // 1. Desempeño Histórico (60%) - Basado en scores de préstamos pasados
  let totalHistoricalScore = 0;
  finishedLoans.forEach(l => {
    // Aplanar pagos si vienen anidados en cronograma_cuotas
    let flatPagos = l.pagos || [];
    if (flatPagos.length === 0 && l.cronograma_cuotas) {
      flatPagos = l.cronograma_cuotas.flatMap((c: any) => c.pagos || []);
    }

    const meta = calculateLoanScore(l, flatPagos, getTodayPeru(), config);
    totalHistoricalScore += meta.score;
  });

  const avgPerformance = totalFinished > 0 ? (totalHistoricalScore / totalFinished) : 100;
  const performanceWeight = avgPerformance * 0.6;
  details.push({
    label: `Desempeño Histórico (${Math.round(avgPerformance)}% base)`,
    value: Math.round(performanceWeight),
    type: 'increase',
    description: `Promedio de salud de ${totalFinished} préstamos anteriores.`
  });

  // 2. Antigüedad (10%) - +1 pto por mes (máx 10)
  let seniorityBonus = 0;
  let months = 0;
  if (client.created_at) {
    const createdAt = new Date(client.created_at);
    if (!isNaN(createdAt.getTime())) {
      months = Math.floor((new Date().getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24 * 30));
      seniorityBonus = Math.min(10, Math.max(0, months));
    }
  }
  if (seniorityBonus > 0) {
    details.push({
      label: `Antigüedad como Cliente (${months} meses)`,
      value: seniorityBonus,
      type: 'increase'
    });
  }

  // 3. Volumen (30%) - +2 pts por cada préstamo finalizado (máx 30)
  const volumeBonus = Math.min(30, totalFinished * 2);
  if (volumeBonus > 0) {
    details.push({
      label: `Volumen: ${totalFinished} Préstamos Finalizados`,
      value: volumeBonus,
      type: 'increase'
    });
  }

  const finalScore = Math.round(Math.max(0, Math.min(100, performanceWeight + seniorityBonus + volumeBonus)));

  return {
    score: finalScore,
    details,
    metrics: {
      avgPerformance,
      totalFinished,
      months
    }
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
    const isMigrado = (p.observacion_supervisor || '').includes('Préstamo migrado del sistema anterior')
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
      if (saldo <= 0.01) return false
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
export function getComprehensiveEvaluation(client: any, loans: any[], allPayments?: any[], targetLoanId?: string, config: any = {}) {
  const today = getTodayPeru();

  // 1. Encontrar el préstamo para evaluar Salud
  // Prioridad: 1. targetLoanId, 2. Primer préstamo activo no liquidado
  const activeLoan = (loans || []).find((l: any) => {
    if (targetLoanId) return l.id === targetLoanId;

    const isMigrado = (l.observacion_supervisor || '').includes('Préstamo migrado del sistema anterior');
    const isEffectivelyFinalized = isMigrado && (l.saldo_pendiente || 0) <= 0.01;
    return l.estado === 'activo' && !isEffectivelyFinalized;
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
    allPayments.forEach(p => {
      totalPaymentsCount++;
      if ((p.metodo_pago || 'Efectivo') === 'Efectivo') countEfectivo++;
      else countDigital++;
    });
  } else {
    enrichedLoans.forEach(l => {
      const cronograma = l.cronograma_cuotas || [];
      cronograma.forEach((c: any) => {
        const cuotaPagos = c.pagos || [];
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
 * @returns Factores de ajuste y monto máximo sugerido
 */
export function calculateRenovationAdjustment(healthScore: number, reputationScore: number, montoOriginal: number) {
  // 1. Ajuste Base por Salud (Capacidad de pago demostrada hoy)
  let baseIncreasePct = 0;
  if (healthScore >= 90) baseIncreasePct = 20;
  else if (healthScore >= 75) baseIncreasePct = 15;
  else if (healthScore >= 60) baseIncreasePct = 10;
  else if (healthScore >= 40) baseIncreasePct = 0;
  else baseIncreasePct = -15; // Reducción sugerida por riesgo

  // 2. Plus por Reputación (Confianza histórica)
  // El bonus solo aplica si la salud actual no es crítica (>= 40)
  let reputationBonusPct = 0;
  if (healthScore >= 40) {
    if (reputationScore >= 90) reputationBonusPct = 10;
    else if (reputationScore >= 75) reputationBonusPct = 5;
  }

  const totalPotentialPct = baseIncreasePct + reputationBonusPct;
  const montoSugerido = montoOriginal * (1 + totalPotentialPct / 100);

  return {
    baseIncreasePct,
    reputationBonusPct,
    totalPotentialPct,
    montoSugerido: Math.round(montoSugerido * 100) / 100,
    esReduccion: totalPotentialPct < 0,
    esAumento: totalPotentialPct > 0,
    detalles: [
      {
        factor: 'Salud',
        pct: baseIncreasePct,
        razon: healthScore >= 90 ? 'Excelente (>=90 pts)' :
          healthScore >= 75 ? 'Muy Bueno (>=75 pts)' :
            healthScore >= 60 ? 'Bueno (>=60 pts)' :
              healthScore >= 40 ? 'Regular (>=40 pts)' : 'Riesgo (<40 pts)'
      },
      {
        factor: 'Reputación',
        pct: reputationBonusPct,
        razon: reputationBonusPct > 0 ? (reputationScore >= 90 ? 'Excelente (>=90 pts)' : 'Bueno (>=75 pts)') :
          (healthScore < 40 ? 'Bloqueado por Salud' : 'Sin Bonus (<75 pts)')
      }
    ]
  };
}

/**
 * ACCION ATOMICA DE EVALUACION DE SALUD (18 PTS TRUTH)
 * Esta es la unica funcion que debe usarse para obtener el score de salud de un prestamo.
 * Encapsula el fetching de datos identico al Dashboard para garantizar paridad.
 */
export async function getLoanHealthScoreAction(supabase: any, loanId: string) {
  const today = getTodayPeru();

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

  // 3. Obtener configuracion de pesos dinámicos
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
      'score_mult_mensual'
    ]);

  const config = (configRows || []).reduce((acc: any, row: any) => ({ ...acc, [row.clave]: row.valor }), {});

  // 4. Ejecutar formula centralizada con pesos dinamicos
  return calculateLoanScore(
    { ...prestamo, cronograma_cuotas: cronograma || [] },
    pagos,
    today,
    config
  );
}

