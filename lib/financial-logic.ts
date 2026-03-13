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
  cuotaDiaHoy: number;
  cobradoHoy: number;
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
}

/**
 * Calcula las métricas financieras de un préstamo individual con la lógica pulida del Panel de Préstamos.
 */
export function calculateLoanMetrics(
  loan: any, 
  today: string = getTodayPeru(),
  config: SystemConfig = { renovacionMinPagado: 60, umbralCpp: 4, umbralMoroso: 7, umbralCppOtros: 1, umbralMorosoOtros: 2 }
): LoanMetrics {
  if (!loan || loan.estado !== 'activo') {
    const totalPagado = (loan.cronograma_cuotas || []).reduce((sum: number, c: any) => sum + (c.monto_pagado || 0), 0);
    return {
      cuotasAtrasadas: 0,
      deudaExigibleTotal: 0,
      deudaExigibleHoy: 0,
      cuotaDiaHoy: 0,
      cobradoHoy: 0,
      totalPagadoAcumulado: totalPagado,
      saldoPendiente: 0,
      riesgoPorcentaje: 0,
      diasSinPago: 0,
      isCritico: false,
      isMora: false,
      isAlDia: true,
      esRenovable: false,
      estadoCalculado: loan?.estado === 'finalizado' ? 'finalizado' : 'sin_deuda',
      valorCuotaPromedio: 0
    };
  }

  const cronograma = loan.cronograma_cuotas || [];
  const pagos = cronograma.flatMap((c: any) => c.pagos || []);
  const totalPagar = Number(loan.monto) * (1 + (Number(loan.interes) / 100));

  // 1. Meta Hoy (Específicamente cuotas que vencen hoy)
  const cuotaDiaHoy = cronograma
    .filter((c: any) => c.fecha_vencimiento === today)
    .reduce((sum: number, c: any) => sum + Math.max(0, Number(c.monto_cuota) - (Number(c.monto_pagado) || 0)), 0);

  // 2. Cobrado Hoy (Basado en la fecha de creación del pago)
  const cobradoHoy = pagos
    .filter((pay: any) => pay.created_at && new Date(pay.created_at).toLocaleDateString('en-CA', { timeZone: 'America/Lima' }) === today)
    .reduce((sum: number, pay: any) => sum + Number(pay.monto_pagado), 0);

  // 3. Deuda Exigible Hoy (Todo lo vencido hasta hoy inclusive)
  const deudaExigibleHoy = cronograma
    .filter((c: any) => c.fecha_vencimiento <= today)
    .reduce((sum: number, c: any) => sum + Math.max(0, Number(c.monto_cuota) - (Number(c.monto_pagado) || 0)), 0);

  // 4. Cuotas Exigibles (Mora + Hoy)
  // Este conteo debe coincidir con lo que el usuario ve en la tabla para evitar confusión
  const totalAtrasadas = cronograma
    .filter((c: any) => c.fecha_vencimiento <= today && c.estado !== 'pagado' && (c.monto_cuota - (c.monto_pagado || 0)) > 0.5)
    .length;

  // 4.5. Cuotas Mora Real (Vencidas ANTES de hoy)
  const cuotasAtrasadas = cronograma
    .filter((c: any) => c.fecha_vencimiento < today && c.estado !== 'pagado' && (c.monto_cuota - (c.monto_pagado || 0)) > 0.01)
    .length;

  // 5. Acumulados
  const totalPagadoAcumulado = cronograma.reduce((sum: number, c: any) => sum + (Number(c.monto_pagado) || 0), 0);
  const saldoPendiente = Math.max(0, totalPagar - totalPagadoAcumulado);

  // 6. Riesgo Capital % (Vencido < hoy / Saldo Pendiente)
  const capitalVencido = cronograma
    .filter((c: any) => c.fecha_vencimiento < today)
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

  // La transición se basa en el total de cuotas exigibles (Mora Real + Hoy)
  const isCritico = (isDiario && totalAtrasadas >= cfgMoroso) || (!isDiario && totalAtrasadas >= cfgMorosoOtros);
  const isMora = (isDiario && totalAtrasadas >= cfgCpp) || (!isDiario && totalAtrasadas >= cfgCppOtros);
  const isAlDia = !isMora;

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
    cobradoHoy,
    totalPagadoAcumulado,
    saldoPendiente,
    riesgoPorcentaje,
    diasSinPago,
    isCritico,
    isMora,
    isAlDia,
    esRenovable,
    estadoCalculado,
    valorCuotaPromedio
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
