# Diseño: Panel de Cobranza en Ruta — Control Operativo Diario

**Fecha:** 2026-05-15  
**Autor:** Brainstorming con usuario  
**Estado:** Aprobado

---

## 1. VISIÓN GENERAL

Crear una nueva interfaz de control operativo en tiempo real para supervisores y admins que permite monitorear la cobranza diaria en ruta de sus asesores. La interfaz prioriza **escaneo rápido** de quién va adelante, atrás, o en riesgo, con capacidad de **drill-down** para ver detalles sin perder contexto general.

**Propósito:** Control operativo en vivo (no analítico) — supervisores toman decisiones inmediatas mientras está en curso la jornada.

**Usuarios:**
- Supervisores: ven solo a sus asesores del equipo
- Admins: ven todo el sistema + filtros para explorar por supervisor/equipo

**Ubicación:** URL `/dashboard/cobranza-ruta` — nueva sección dedicada en el dashboard

---

## 2. REQUISITOS FUNCIONALES

### 2.1 Datos Principales (3 métricas prioritarias)

Cada asesor en la tabla muestra:

1. **Quedan por cobrar** (S/.)
   - Suma de montos de cuotas pendientes vencidas o de hoy
   - Fuente: `cronograma_cuotas` WHERE estado = 'pendiente' AND fecha_vencimiento ≤ hoy

2. **Cobraron en ruta** (S/. / cantidad)
   - Pagos registrados hoy que aplican a cuotas en ruta (vencidas + hoy)
   - Fuente: `pagos` WHERE created_at LIKE fecha_hoy AND estado_verificacion = 'aprobado'

3. **Total cobrado hoy** (S/.)
   - Suma de todos los pagos registrados por ese asesor en la fecha
   - Incluye: adelantamientos, devoluciones, ajustes

### 2.2 Indicadores Visuales Sofisticados

**Por cada fila de asesor:**

- **Código de color (estado):**
  - 🟢 Verde: cumplimiento ≥ 85% de meta esperada
  - 🟡 Amarillo: cumplimiento 60-85%
  - 🔴 Rojo: cumplimiento < 60%

- **Tendencia (mini ícono):**
  - ↑ Arriba: mejor que ayer a la misma hora
  - ↓ Abajo: peor que ayer a la misma hora
  - → Plano: similar que ayer

- **Porcentaje vs. meta:** Mostrar inline (ej: "85% de meta")

### 2.3 Drill-down por Métrica (Click en número)

**Click en "Quedan por cobrar":**
- Modal/Sidebar abre lista de clientes sin pagar de ese asesor
- Desglose: cliente, monto, días vencido, prioridad (coloreada)
- Ordenado por antigüedad o monto (configurable)

**Click en "Cobraron en ruta":**
- Modal/Sidebar muestra desglose de pagos registrados hoy
- Por cliente: nombre, monto, hora, estado verificación
- Suma verificada vs. no verificada

**Click en "Total cobrado hoy":**
- Modal/Sidebar muestra gráfico comparativo
  - Línea: cobranza acumulada hoy vs. ayer vs. promedio últimos 3 días
  - Tabla: desglose por turno (mañana, tarde, noche) — si la BD registra turnos, mostrar; si no, mostrar solo total acumulado
  - Comparativo vs. meta diaria esperada

### 2.4 Actualización de Datos

- **Auto-actualización:** cada 45 segundos
- **Refresh manual:** botón en header
- **Indicador visual:** "Última actualización hace X segundos"
- **Transición suave:** datos nuevos reemplazan sin flash/parpadeo

### 2.5 Filtros y Controles

**Header:**
- **Selector de supervisor** (solo si user = admin)
  - Default: todos los supervisores
  - Cambia datos mostrados en tiempo real
- **Selector de fecha** (solo si admin, default = hoy)
- **Botón Refresh** (manual, visible siempre)
- **Título dinámico:** "Cobranza en Ruta — [Fecha] — [Supervisor o "Sistema"]"

---

## 3. ARQUITECTURA TÉCNICA

### 3.1 Nuevas Funciones (lib/financial-logic.ts)

```typescript
interface AsesorDailyMetrics {
  asesor_id: string
  nombre_asesor: string
  quedan_por_cobrar: number          // S/. pendiente
  cobraron_en_ruta: number           // S/. en ruta hoy
  total_cobrado: number              // S/. total hoy
  meta_esperada: number              // S/. meta diaria calculada
  porcentaje_meta: number            // 0-100 (o más)
  estado_badge: 'critico' | 'riesgo' | 'al_dia'
  tendencia: 'up' | 'down' | 'flat'
  clientes_pendientes_count: number
}

function calculateAsesorDailyMetrics(
  asesorId: string,
  fecha: string,  // YYYY-MM-DD
  supabaseAdmin: any
): Promise<AsesorDailyMetrics>

// Retorna metrics para un solo asesor en una fecha
```

### 3.2 Server Action (app/api/dashboard/cobranza-ruta/route.ts)

```typescript
export async function GET(request: Request) {
  // 1. Auth + role check (user debe ser supervisor o admin)
  // 2. Parse query params: supervisor_id, fecha (default hoy)
  // 3. Si supervisor: filter por su user.id
  // 4. Si admin: permitir filtrar por supervisor_id param
  // 5. Fetch lista de asesores (perfiles WHERE rol='asesor')
  // 6. Para cada asesor: calculateAsesorDailyMetrics()
  // 7. Retorna: { asesores: AsesorDailyMetrics[], lastUpdated: timestamp }
}
```

### 3.3 Componentes React

**Nuevos:**
- `<CobranzaRutaPage />` — página contenedor, layout responsivo
- `<CobranzaHeader />` — título, filtros, refresh, última actualización
- `<CobranzaTable />` — tabla de asesores (desktop + mobile)
- `<AsesorMetricsDetails />` — sidebar + modal (misma lógica, wrapper diferente)
  - Acepta prop `mode: 'sidebar' | 'modal'`
  - Acepta prop `metric: 'quedan' | 'cobraron' | 'total'`
  - Renderiza contenido específico según métrica

**Reutilizados:**
- `TableSkeleton` (carga)
- `Dialog` (shadcn/ui, para modal)
- `Card` (shadcn/ui, para sidebar)
- `Button`, `Badge`, `Tooltip` (shadcn/ui)

### 3.4 Data Flow

```
CobranzaRutaPage carga
  ↓ useEffect + useState
  ↓ fetch /api/dashboard/cobranza-ruta?supervisor_id=X&fecha=YYYY-MM-DD
  ↓ GET /api/dashboard/cobranza-ruta
    ↓ calculateAsesorDailyMetrics() × N asesores (paralelo)
    ↓ Retorna array de metrics
  ↓ setState(metrics)
  ↓ Render <CobranzaTable metrics={metrics} />
    ↓ Click en asesor → setState(selectedAsesor, selectedMetric)
    ↓ Render <AsesorMetricsDetails /> (sidebar en desktop, modal en mobile)
  ↓ Auto-fetch cada 45s (setInterval o fetch con AbortController)
```

### 3.5 Responsividad

**Breakpoints (Tailwind):**
- `lg` (1024px) = transición desktop ↔ mobile
- `<lg` = modal full-screen
- `≥lg` = sidebar 30% derecha, tabla 70%

**Tabla en Mobile:**
- Mostrar solo: Nombre, Total cobrado, Badge
- "Quedan" y "Cobraron" accesibles vía click en fila → modal

**Tabla en Desktop:**
- Mostrar todas las columnas + indicadores visuales completos

---

## 4. DISEÑO DE INTERFAZ

### 4.1 Layout Desktop (≥1024px)

```
┌─────────────────────────────────────────────────────┐
│ ← HEADER: Cobranza en Ruta — [Fecha]              │
│    [Supervisor selector] [Refresh] Hace 12 segundos │
├─────────────────────────┬───────────────────────────┤
│                         │                           │
│  TABLA (70%)            │ SIDEBAR (30%)             │
│  ┌─────────────────┐    │  ┌─────────────────────┐  │
│  │ Nombre │ Quedan│    │  │ Detalles Asesor     │  │
│  │ Cobraron│Total │    │  │ "Quedan por cobrar" │  │
│  │ Badge                │  │                     │  │
│  ├─────────────────┤    │  │ Lista de clientes:  │  │
│  │ Juan    │ 500  │    │  │ • Cliente 1: 200    │  │
│  │ 1,200  │2,500  │    │  │ • Cliente 2: 300    │  │
│  │ 🟢 85% │       │    │  │                     │  │
│  │ ↑      │       │    │  │ [Close]             │  │
│  ├─────────────────┤    │  └─────────────────────┘  │
│  │ María   │ 800  │    │  (Scrollable si muchos)   │
│  │ 900    │1,700  │    │                           │
│  │ 🟡 60% │       │    │                           │
│  │ ↓      │       │    │                           │
│  └─────────────────┘    │                           │
│  (Scrollable)           │                           │
└─────────────────────────┴───────────────────────────┘
```

### 4.2 Layout Mobile (<1024px)

```
┌──────────────────────────┐
│ ← Cobranza en Ruta      │
│   [Refresh] Hace 5s     │
├──────────────────────────┤
│ TABLA (compact)          │
│ ┌──────────────────────┐ │
│ │ Juan          2,500  │ │
│ │ 🟢 85% ↑             │ │
│ ├──────────────────────┤ │
│ │ María         1,700  │ │
│ │ 🟡 60% ↓             │ │
│ └──────────────────────┘ │
│ (Scrollable)             │
│                          │
│ [Click → Modal overlay]  │
└──────────────────────────┘

┌──────────────────────────┐
│ × Juan - Quedan Cobrar   │
│                          │
│ $ 500 pendiente          │
│                          │
│ • Cliente A: 200 (3 días)│
│ • Cliente B: 300 (1 día) │
│                          │
│ [Close o swipe down]     │
└──────────────────────────┘
```

### 4.3 Tabla — Estructura de Columnas

| Columna | Desktop | Mobile | Contenido |
|---------|---------|--------|-----------|
| Asesor | ✓ | ✓ | Nombre, foto (opcional) |
| Quedan | ✓ | ✗ (modal) | S/. clickeable |
| Cobraron | ✓ | ✗ (modal) | S/. clickeable |
| Total | ✓ | ✓ | S/. + % meta clickeable |
| Badge | ✓ | ✓ | Color + tendencia |
| Expand | ✓ | ✓ | Click → details |

---

## 5. VALIDACIÓN DE DATOS

### 5.1 Cálculos Certificados

- **Quedan:** JOIN cronograma_cuotas → SUM(monto_cuota - monto_pagado) WHERE estado != 'pagado'
- **Cobraron en ruta:** JOIN pagos → SUM(monto_pagado) WHERE created_at >= hoy 00:00 AND <= hoy 23:59
- **Total cobrado:** SUM(pagos) WHERE created_at LIKE hoy
- **Meta esperada:** metas_asesores.meta_mensual / días_hábiles_mes * días_transcurridos
- **Tendencia:** comparar (total_hoy - total_ayer_same_hour) > 0 ? 'up' : (< 0 ? 'down' : 'flat')

### 5.2 Datos en Cache vs. Real-time

- **Auto-actualización cada 45s:** Suficiente para operativo, no degrada BD
- **Refresh manual:** Fetch immediately sin cache
- **Cambios en pagos:** Se reflejan en siguiente ciclo auto o manual refresh

---

## 6. FLUJOS DE USUARIO

### 6.1 Supervisor Monitorea su Equipo

```
1. Entra a /dashboard/cobranza-ruta
2. Ve tabla de sus 5 asesores con totales
3. Nota que Juan está 🔴 crítico
4. Click en "Quedan por cobrar" de Juan
5. Modal abre: clientes sin pagar, ordenados por antigüedad
6. Ve que un cliente grande debe hace 3 días → decisión: llamar o enviar apoyo
7. Cierra modal, monitorea otros
8. A los 45s, tabla se actualiza automáticamente
```

### 6.2 Admin Analiza Desempeño General

```
1. Entra a /dashboard/cobranza-ruta
2. Ve todos los supervisores (filtro por defecto)
3. Selecciona supervisor "Carlos" en dropdown
4. Tabla se actualiza → ve equipo de Carlos
5. Compara vs. otros supervisores (cambia selector)
6. Nota que día anterior fue peor → click en "Total" de alguien
7. Ve gráfico comparativo: hoy vs. ayer vs. promedio
8. Toma decisión sobre bonificación o intervención
```

---

## 7. SEGURIDAD Y ACCESO

- **Autenticación:** Supabase Auth (session via middleware.ts)
- **Autorización:**
  - Supervisor: solo ve `WHERE asesor_id IN (su_equipo)`
  - Admin: ve todo, puede filtrar por supervisor_id param
- **RLS:** Usar `createAdminClient()` para queries de cobranza (no aplica RLS de un solo asesor)
- **Validación:** Input params (supervisor_id, fecha) validados con `zod`

---

## 8. TESTING

### 8.1 Unit Tests

- `calculateAsesorDailyMetrics()` con datos mock (quedan, cobraron, total, tendencia)
- Cálculo de `estado_badge` (crítico/riesgo/al_día)
- Cálculo de tendencia (up/down/flat)

### 8.2 Integration Tests

- GET `/api/dashboard/cobranza-ruta?supervisor_id=X`
- Retorna array válido, datos son correctos
- Filtro por fecha funciona
- Auth check funciona (rechazo si no es supervisor/admin)

### 8.3 E2E Tests

- Supervisor navega a página, ve su equipo
- Click en métrica abre modal/sidebar
- Auto-actualización cada 45s
- Mobile layout funciona (tabla compacta, modal full-screen)

---

## 9. REUTILIZACIÓN DE CÓDIGO EXISTENTE

| Elemento | Fuente | Cómo se Reutiliza |
|----------|--------|------------------|
| `getTodayPeru()` | `lib/financial-logic.ts` | Obtener fecha actual en Peru TZ |
| `calculateLoanMetrics()` | `lib/financial-logic.ts` | Cálculos de estado de préstamo (en detalles) |
| `TableSkeleton` | `components/ui/` | Loading state de tabla |
| `Dialog`, `Card`, `Button` | shadcn/ui | Modal, sidebar, botones |
| Auth check pattern | `app/api/*/route.ts` | Verificar user + rol |
| `checkSystemAccess()` | `utils/systemRestrictions.ts` | Validar si supervisor puede acceder |

**Nueva función centralizada:**
- `calculateAsesorDailyMetrics()` en `lib/financial-logic.ts` — pensada para reutilizar en otros módulos (reportes, notificaciones, etc.)

---

## 10. ROADMAP FUTURO (OUT OF SCOPE)

- Exportar datos a CSV/PDF
- Alertas automáticas (notificación si alguien cae a rojo)
- Integración con WhatsApp/SMS para avisos
- Histórico de cobranza (últimos 30 días)
- Comparativa vs. metas mensuales
- Análisis de patrones de cobranza por asesor

---

## 11. CHECKLIST DE APROBACIÓN

- [x] Visión clara: control operativo, no analítico
- [x] Usuarios definidos: supervisor + admin
- [x] 3 métricas prioritarias identificadas
- [x] Indicadores visuales especificados
- [x] Drill-down por métrica claro
- [x] Auto-actualización + refresh manual
- [x] Layout responsivo diseñado (desktop + mobile)
- [x] Arquitectura técnica clara (función, API, componentes)
- [x] Reutilización de código existente
- [x] Seguridad y acceso mapeado

---

**Listo para implementación.**
