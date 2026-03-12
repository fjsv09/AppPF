# Guía de Requerimientos - Módulo Financiero

Este documento detalla el flujo de dinero, gestión de gastos y reportes financieros para el sistema de cobranzas.

## 1. Flujo de Efectivo y Cuentas

El sistema debe manejar tres tipos principales de cuentas por cada cartera:

*   **Cuenta Cobranzas:** Recibe todos los pagos registrados por los asesores durante el día. Es una cuenta transitoria.
*   **Cuenta Caja:** Almacena el efectivo físico después del cuadre.
*   **Cuenta Yape/Digital:** Almacena el dinero recibido por medios digitales (Yape, Plin, Transferencias).

### Flujo de Dinero:
1.  **Recaudación:** Los pagos de cuotas entran a la **Cuenta Cobranzas**.
2.  **Cuadre (3:00 PM y 7:00 PM):** El asesor ingresa la distribución a Caja/Yape. **Todo cuadre queda en estado "Pendiente" hasta que el Admin lo apruebe.**
3.  **Cobros en Local:** La **Secretaria/Asistente** puede registrar pagos recibidos físicamente en la oficina, que entran directamente a la cuenta de Caja de la oficina.
4.  **Inyección de Capital:**
    *   **Interna:** Movimiento de capital entre carteras.
    *   **Terceros:** Entrada de capital externo con un compromiso de pago de intereses (bimestral o trimestral).
4.  **Dividendos:** Registro de retiros de utilidades por parte de los socios.

## 2. Gestión de Gastos

Los asesores registran gastos operativos durante su ruta (gasolina, comida, movilidad, etc.).

*   **Categorización:** Cada gasto debe pertenecer a una categoría (ej. Combustible, Alimentación, Mantenimiento, Otros).
*   **Análisis:** El sistema debe permitir ver en qué categorías se está gastando más dinero.
*   **Sueldos:** El administrador descuenta los sueldos de los asesores como un gasto especial dentro de la cartera.

## 3. Jerarquía, Unificación e Inicio de Cartera

*   **Apertura de Cartera:** Al crear una nueva cartera (ej. nueva zona o asesor), el sistema **debe requerir obligatoriamente una inyección de capital inicial**. Sin capital de inicio (Saldo > 0 en Caja), no se pueden registrar nuevos préstamos.
*   **Origen del Capital Inicial:**
    *   **Inyección Externa:** Capital de socios o terceros.
    *   **Traspaso entre Carteras:** Salida de capital de una "Cartera A" (Cuenta Caja) para fondear la nueva "Cartera B".
*   **Por Cartera:** Cada cartera (grupo de clientes/asesor) tiene su propia contabilidad independiente (sus propias cuentas de Caja y Yape).
*   **Vista Global:** El administrador tiene una "Cuenta Global" o "Dashboard Consolidado" que suma los saldos y movimientos de todas las carteras para tener una visión total del capital de la empresa.

## 4. Reportes y Rendimiento

El sistema debe generar los siguientes indicadores y reportes detallados:

### Indicadores de Rendimiento de Cartera:
*   **Clientes Nuevos:** Cantidad y monto de préstamos otorgados a personas que no estaban en el sistema.
*   **Renovaciones:** Préstamos cerrados y reabiertos con nuevo capital.
*   **Refinanciamientos:** Reestructuración de deudas existentes.
*   **Capital Colocado:** Suma total del capital (sin intereses) entregado en préstamos.
*   **Ganancia Bruta:** Intereses totales proyectados de los préstamos activos.
*   **Ganancia Neta Real:** Cobro de intereses efectivo menos gastos operativos pagados y sueldos liquidados.
*   **Ganancia Proyectada Neta (Outlook):** Es el indicador más importante para la expansión. Se calcula como:
    `Intereses por Cobrar - (Gastos Fijos + Planilla Proyectada + Bonos por Cumplir + Dividendos Pactados + Intereses a Terceros)`
*   **Morosidad:** Porcentaje de capital en riesgo (cuotas vencidas vs total).

### Análisis de Crecimiento:
*   **Crecimiento Empresarial:** Comparativa de capital colocado vs meses anteriores.
*   **Puntos de Mejora:** Identificación de carteras con alta morosidad o gastos excesivos.
*   **Flujo de Caja (Cash Flow):** Reporte de entradas (cobros) vs salidas (préstamos otorgados + gastos).

## 5. Reglas de Negocio (Finanzas)
*   Toda transferencia entre cuentas (Cobranzas -> Caja) debe quedar auditada.
*   No se pueden eliminar registros de gastos; si hay un error, se registra un movimiento de compensación.
## 6. Gestión de Personal (Sueldos y Bonos)

El sistema debe permitir a los trabajadores (Admin, Supervisor, Asesor) visualizar su estado financiero mensual:
*   **Sueldo Base:** Monto fijo según contrato.
*   **Descuentos:** Por faltas, préstamos internos o errores en cuadre.
*   **Bonos:** Incentivos por cumplimiento de metas específicas.
*   **Seguimiento de Metas (Asesor):**
    *   **Cobranza Diaria/Semanal:** Porcentaje de cumplimiento sobre la meta de recaudo.
    *   **Baja Morosidad (Escalafones):** Ejemplo de incentivos:
        *   Morosidad < 5%: S/ 800
        *   Morosidad < 7%: S/ 400
        *   Morosidad < 9%: S/ 200
        *   Morosidad > 10%: Sin bono.
    *   **Colocación:** Bono por nuevos clientes o monto total colocado.
    *   **Volumen de Cartera:** Por mantener el capital activo en un rango definido.
*   **Bono de Equipo:** Incentivo global si el % mayoritario de asesores cumple sus metas.
*   **Descuentos:** Por tardanzas, faltas o errores operativos.
*   **Pagos Semanales:** Registro de los adelantos o pagos efectuados durante el mes.
*   **Cumpleaños:** Panel de recordatorios para celebrar y fidelizar al equipo humano.
*   **Estado Neto:** Cálculo en tiempo real de cuánto le corresponde cobrar al finalizar el periodo.

## 7. Jerarquía y Supervisión

El sistema implementa un control de tres niveles:
1.  **Admin:** Supervisión total. Aprueba obligatoriamente todos los **cuadres** diarios de los asesores.
2.  **Supervisor:** Responsable de un grupo de asesores. Monitorea cobros y apoya en la revisión previa de cuadres.
3.  **Secretaria / Asistente:** Rol administrativo. Atiende cobros en local físico, apoya en la organización de cuadres y gestión de documentos financieros.
4.  **Asesor:** Operación en campo.

## 8. Control de Acceso y Bloqueo

*   **Desactivación Total:** El administrador o supervisor puede suspender la cuenta de cualquier asesor o supervisor de forma inmediata. Un usuario bloqueado no podrá iniciar sesión ni realizar ninguna operación en el sistema.

## 9. Estrategias de Eficiencia y Expansión

Para escalar la empresa y mejorar el rendimiento financiero, se proponen:

1.  **Interés Dinámico (Pricing por Riesgo):** Clientes con excelente historial pueden acceder a tasas menores, fidelizándolos y reduciendo el riesgo.
2.  **Reasignación Inteligente de Capital:** El sistema sugiere mover capital de carteras estancadas o con alta morosidad hacia carteras con alta demanda y buen recaudo.
3.  **Alertas de Fraude y Auditoría:** Detección de patrones inusuales (ej. cobros registrados fuera de la zona GPS del cliente o cuadres con descuadres recurrentes).
4.  **Portal de Inversionistas:** Vista simplificada para terceros que inyectan capital, mostrando su ROI y saldo actual sin comprometer datos sensibles de clientes.
5.  **Proyección de Flujo de Caja y Utilidades:** Predicción de cuánto dinero habrá disponible y cuál será la utilidad real al final del trimestre, restando automáticamente todos los compromisos financieros (planilla, bonos, dividendos, etc.).
