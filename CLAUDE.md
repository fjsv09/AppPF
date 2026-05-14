# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ProFinanzas (PF-System)** is a comprehensive Next.js-based financial loan management and collections system. The application manages loan portfolios, client relationships, payment tracking, and advisor performance metrics with role-based access control and complex financial calculations.

### Tech Stack

- **Frontend:** Next.js 14.2, React 18, TypeScript, Tailwind CSS (shadcn/ui components)
- **Backend:** Next.js API routes with Server Actions, RLS (Row-Level Security)
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth (JWT)
- **Storage:** Supabase Storage (documents, images)
- **Monitoring:** Sentry, Realtime notifications
- **PWA:** Web Push API, manifest.webmanifest

## Development Commands

```bash
npm run dev              # Development server on http://localhost:3000
npm run build            # Production build
npm start                # Run production server
npm run lint             # ESLint
npm run db:cleanup       # Remove test data
npm run db:reset-total   # Full database reset
```

### Environment Setup

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=sb_secret_...
CRON_SECRET=sk_cron_...
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BL9z...
VAPID_PRIVATE_KEY=Ro5H...
```

## Architecture Overview

### Directory Structure

```
app/
├── api/                    # API route handlers
│   ├── prestamos/          # Loan CRUD operations
│   ├── pagos/              # Payment processing
│   ├── clientes/           # Client search/lookup
│   ├── renovaciones/       # Renewal workflows
│   └── [features]/
├── dashboard/              # Protected dashboard routes
│   ├── prestamos/          # Loan portfolio & KPIs
│   ├── clientes/           # Client directory
│   ├── pagos/              # Payment entry interface
│   ├── metas/              # Advisor goals & bonuses
│   ├── admin/              # System configuration
│   └── [features]/
└── login/                  # Authentication

components/
├── ui/                     # shadcn/ui design system
├── prestamos/              # Loan components
│   ├── prestamos-table.tsx # Main loans table (250KB)
│   ├── kpi-cards.tsx       # Metrics display
│   ├── quick-pay-modal.tsx # Fast payment entry
│   └── [loan-features]/
├── providers/              # React context & providers
└── [feature-modules]/

lib/
├── financial-logic.ts      # Core calculations (76KB) - CRITICAL
├── metas-logic.ts          # Advisor goal logic
├── config-cache.ts         # System config caching
└── supabase/               # Database clients

utils/
├── supabase/               # Auth & database utilities
├── systemRestrictions.ts   # Access control rules
├── checkAdvisorBlocked.ts  # Advisor suspension checks
└── [utilities]/

services/
├── notification-service.ts # Push notifications

public/                     # Static assets
migrations/                 # SQL migrations
supabase/                   # Supabase config
```

### Core Data Models

**Primary Tables:**
- `clientes` - Client records (names, DNI, advisor assignments)
- `prestamos` - Loan records (amount, interest rate, status)
- `cronograma_cuotas` - Payment schedules (due dates, amounts)
- `pagos` - Payment transactions (amount, date, verification status)
- `perfiles` - User accounts (roles: admin, supervisor, asesor, cliente)
- `metas_asesores` - Advisor sales targets
- `bonos_pagados` - Bonus payment history
- `configuracion` - System settings & thresholds
- `notificaciones` - Notification records

**Key Relationships:**
```
prestamos → clientes (via cliente_id)
cronograma_cuotas → prestamos (via prestamo_id)
pagos → cronograma_cuotas (via cuota_id)
clientes → perfiles (via asesor_id)
```

## Financial Logic Engine

**File:** `lib/financial-logic.ts` (76KB)

This is the **single source of truth** for all financial calculations. Never duplicate logic elsewhere.

### Core Functions

1. **`calculateLoanMetrics(prestamo, cronograma, pagos)`** - MOST CRITICAL
   - Calculates complete loan status (25+ fields)
   - Uses FIFO cascade for payment distribution
   - Returns: arrears, overdue interest, risk %, payment status, renewal eligibility
   - Called by every loan display component
   - **NEVER duplicate this logic**

2. **`computeVirtualCronograma(cronograma, pagos)`** - Payment Cascade
   - Distributes payments chronologically across schedule (FIFO)
   - Only canonical source for virtual progress display
   - Returns: `{ cuotasPagadasVirtual, saldoCuotaEnCurso, saldoTotalPendiente }`
   - **Must be called for accurate loan progress**

3. **`calculateMoraBancaria(dias, monto, tasa, config)`** - Interest Calculations
   - Compound interest with configurable rates
   - Handles daily vs. monthly rate calculations

4. **`getTodayPeru()`** - Peru Timezone Handler
   - Returns correct date in Peru timezone (America/Lima)
   - Returns `YYYY-MM-DD` format
   - **Use instead of `new Date().toDateString()`**

5. **Scoring Functions:**
   - `calculateCreditScore()` - Client reputation scoring
   - `evaluateLoanScore()` - Individual loan risk assessment
   - Configurable thresholds via system config

### Example: Loan Status Calculation

```typescript
import { calculateLoanMetrics, getTodayPeru } from '@/lib/financial-logic'

// In any page or component:
const metrics = calculateLoanMetrics(prestamo, cronograma, pagos)

// Now you have all loan status data:
console.log(metrics.isAlDia)           // boolean
console.log(metrics.isMora)            // boolean
console.log(metrics.isCritico)         // boolean
console.log(metrics.diasSinPago)       // number
console.log(metrics.cuotasAtrasadas)   // number
console.log(metrics.saldoPendiente)    // number
```

## Request Flow & Security

### Authentication

```
Client Request
    ↓
middleware.ts (session refresh via Supabase SSR)
    ↓
Protected route or API endpoint
    ↓
Check: supabase.auth.getUser() returns user
    ↓
Fetch user's role from perfiles table
    ↓
Call checkSystemAccess() for business rules
    ↓
Proceed or return 403 error
```

### Three Database Client Patterns

```typescript
// 1. Client-side (public)
import { createClient } from '@/utils/supabase/client'
const supabase = createClient()
// Respects RLS automatically

// 2. Server-side with session
import { createClient } from '@/utils/supabase/server'
const supabase = await createClient()
// Uses session, respects RLS

// 3. Admin (server-only - use sparingly)
import { createAdminClient } from '@/utils/supabase/admin'
const supabaseAdmin = createAdminClient()
// Bypasses RLS, use only for: mutations, admin ops, cross-tenant reads
```

### Access Control Layers

**`utils/systemRestrictions.ts`** - `checkSystemAccess()` enforces:
- Operating hours restrictions
- Holiday blocks (via `feriados` table)
- Daily cuadre (settlement) closures
- GPS requirements for field collections
- Individual advisor suspension status
- System-wide operation locks

Example:
```typescript
const access = await checkSystemAccess(supabaseAdmin, user.id, role, 'pago')
if (!access.allowed) {
  return NextResponse.json({ 
    error: access.reason,
    codigo: access.code
  }, { status: 403 })
}
```

## Component Patterns

### Page Components

Server components in `app/dashboard/**/page.tsx`:
- Fetch data before rendering
- Wrap slow operations with `<Suspense>` + skeleton loader
- Use `TableSkeleton` for table loading states
- Handle network errors gracefully

### Client Components

- Add `'use client'` only when necessary
- Use `react-hook-form` + `zod` for form validation
- Use shadcn/ui components (Dialog, Form, Button, Card, etc.)
- Toast notifications: `toast.success()`, `toast.error()` via sonner

### Modals & Dialogs

- Single `useState` for open/close state
- Use shadcn `Dialog` + `Form` primitives
- Pass `onSuccess` callback to parent
- Show loading state with spinner during operations

### Tables

- Large tables like `prestamos-table.tsx` (250KB) handle complex features
- Use column visibility, sorting, filtering
- Always provide skeleton loading state
- Consider virtual scrolling for 1000+ rows

## API Route Pattern

All mutations follow this consistent structure:

```typescript
export async function POST(request: Request) {
  try {
    // 1. Authenticate
    const { data: { user }, error: authError } = 
      await supabase.auth.getUser()
    if (!user) return NextResponse.json(
      { error: 'Unauthorized' }, { status: 401 })

    // 2. Check role
    const { data: perfil } = await supabaseAdmin
      .from('perfiles')
      .select('rol, supervisor_id')
      .eq('id', user.id)
      .single()
    if (!perfil) return NextResponse.json(
      { error: 'Perfil no encontrado' }, { status: 403 })

    // 3. Check access (hours, holidays, etc.)
    const access = await checkSystemAccess(
      supabaseAdmin, user.id, perfil.rol, 'action_type')
    if (!access.allowed) return NextResponse.json(
      { error: access.reason }, { status: 403 })

    // 4. Validate input
    const body = await request.json()
    if (!body.required_field) return NextResponse.json(
      { error: 'Missing required fields' }, { status: 400 })

    // 5. Execute mutation (use admin client)
    const { data, error } = await supabaseAdmin
      .from('table')
      .insert({ ...body })
    if (error) throw error

    // 6. Trigger notifications if needed
    // await createFullNotification(...)

    // 7. Return response
    return NextResponse.json({ success: true, data })
  } catch (error: any) {
    console.error('API Error:', error)
    return NextResponse.json(
      { error: error.message }, { status: 500 })
  }
}
```

## Critical Patterns & Gotchas

### 1. Financial Calculations Are Sacred

`lib/financial-logic.ts` is the **single source of truth**.

**DO NOT:**
- Duplicate calculation logic elsewhere
- Bypass `calculateLoanMetrics()` for status checks
- Assume payment progress without `computeVirtualCronograma()`

**DO:**
- Always call `calculateLoanMetrics()` for loan status
- Trust the FIFO cascade output
- Cache results, but invalidate on payment changes

### 2. Always Use Peru Timezone

```typescript
import { getTodayPeru } from '@/lib/financial-logic'

// Correct
const today = getTodayPeru()

// Wrong - don't do this
const today = new Date().toDateString()
const today = new Date().toLocaleDateString()
```

### 3. RLS & Admin Client Usage

- **RLS (Row-Level Security):** Database-level access control
- **When to use admin client:**
  - All mutations (inserts, updates, deletes)
  - Admin reads across multiple advisors
  - Operations that need to bypass RLS
- **Never expose admin key to client code**

### 4. Payment Processing Safety

- Fetch latest cuota/cronograma within operation
- Validate amount against `monto_cuota`
- Check `estado_verificacion` status
- Log audit entries
- Trigger notifications after successful insert

### 5. Large Component Files

These files are intentionally complex - modularize carefully:
- `prestamos-table.tsx` (250KB) - Advanced table features
- `quick-pay-modal.tsx` (57KB) - Payment validation logic
- `kpi-cards.tsx` (22KB) - Multi-metric calculations

Don't split without understanding state dependencies.

### 6. Configuration & Caching

System config cached in `lib/config-cache.ts`:
- All thresholds stored in `configuracion` table
- Cache loads on first access
- **Invalidate after admin config changes**
- Examples: mora days, renewal %, business hours

### 7. Image Storage

Complete system documented in `GUIA_RAPIDA_IMAGENES.md`:
- Use `components/image-upload.tsx` + `components/image-gallery.tsx`
- Auto-compression: 70-85% reduction
- Buckets: `documentos-clientes` (private), `avatares` (public)
- Size limits: 5MB docs, 500KB avatars
- Lazy loading in gallery component

### 8. Notifications

**Push Notifications:**
- Via `services/notification-service.ts`
- Component: `components/push-subscription-manager.tsx`
- Records stored in `notificaciones` table
- Web Push API for browser notifications

**Toast Notifications:**
- Use `sonner` library
- `toast.success()`, `toast.error()`, `toast.loading()`

## Debugging Tips

### Loan Calculation Issues

1. Add console logs in `lib/financial-logic.ts`
2. Inspect `cronograma_cuotas` entries for the loan
3. Verify `pagos` have `estado_verificacion = 'aprobado'`
4. Trace `computeVirtualCronograma()` manually
5. Compare virtual calculation vs. sum of `monto_pagado`

### Access Denied Errors

1. Check user role in `perfiles` table
2. Run `checkSystemAccess()` with user ID to diagnose
3. Verify not in blocked advisor list
4. Check system config: hours, holidays, cuadre status

### Timezone Issues

- Always verify with `getTodayPeru()`
- Check if comparisons are date-only vs. timestamp
- Payment dates use `created_at` (UTC) - convert for display

### Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| Payment not applying | estado_verificacion != 'aprobado' | Check approval workflow |
| Wrong loan status | Stale calculation | Invalidate & recalculate |
| Access denied | Hours/cuadre/suspension | Run checkSystemAccess() |
| Date off by one day | Wrong date function | Use getTodayPeru() |
| Table is slow | Unoptimized query | Add pagination/virtual scroll |

## Code Style

- **TypeScript:** Strict mode, no implicit `any`
- **Components:** Functional with hooks
- **Forms:** `react-hook-form` + `zod` validation
- **Styling:** Tailwind classes only
- **Comments:** Explain *why*, not *what*
- **Naming:** PascalCase (components), camelCase (functions), kebab-case (pages)

## Important Documentation

- `GUIA_RAPIDA_IMAGENES.md` - Image/document storage guide
- `financial_requirements.md` - Business requirements
- `formato-app.md` - UI/UX specifications
- `lib/financial-logic.ts` - Financial calculations reference
