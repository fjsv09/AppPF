# Explicación de Indicadores

## 🔴 ALERTAS (1) - "Silencio Administrativo"
**Lógica:** Clientes con `dias_sin_pago > 3`.
**Significado:** Cuenta los clientes que llevan **más de 3 días consecutivos sin registrar NINGÚN pago** (ni siquiera parcial).
**Por qué:** Te avisa rápido de clientes que han dejado de pagar repentinamente.

## 🟠 MORA (3) - "Calidad de Deuda"
**Lógica:** Clientes con `riesgo_capital_real_porcentaje > 10%`.
**Significado:** Cuenta los clientes donde **más del 10% de su saldo actual ya está vencido**.
**Por qué:** Diferencia un atraso leve de un problema estructural de impago.

*(Este archivo se generó automáticamente para responder su consulta)*
