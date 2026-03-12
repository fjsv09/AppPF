Actúa como arquitecto senior + generador de código backend y frontend.

Vas a construir una APLICACIÓN WEB PRIVADA de gestión de préstamos y cobranzas para una financiera pequeña.

El sistema debe ser robusto, seguro, auditable y escalable, preparado para 1,000+ préstamos activos, con uso principal desde celular (mobile-first).

🎯 OBJETIVO GENERAL

Construir un sistema web que gestione:

Clientes

Préstamos

Cronogramas de cuotas

Pagos (incluye pagos parciales)

Renovaciones

Roles y permisos

Alertas de seguridad

Auditoría completa

👉 Los datos financieros NO se corrigen, se registran.

🧱 STACK TECNOLÓGICO OBLIGATORIO
Backend (única fuente de verdad)

Supabase

PostgreSQL

Supabase Auth

Row Level Security (RLS)

Edge Functions (lógica crítica)

Frontend

Web App (React / Next / Vue indistinto)

Mobile-first

Optimizado para Android

UI simple, operativa

Regla clave

👉 Toda lógica crítica vive en backend (Edge Functions).
👉 El frontend JAMÁS escribe directo en tablas críticas.

👥 ROLES DEL SISTEMA
🟢 ADMIN

Permisos:

CRUD completo de clientes

Crear préstamos

Generar cronograma (SOLO antes del inicio)

Aprobar renovaciones

Ver y editar pagos

Ver auditoría y alertas

Anular préstamos (con registro)

Desbloqueo excepcional (auditado)

🟡 SUPERVISOR

Permisos:

Ver clientes y préstamos

Aprobar pagos registrados

Ver cronogramas (solo lectura)

Aprobar renovaciones

Restricciones:

❌ No generar cronograma

❌ No editar préstamos activos

🔵 ASESOR / COBRADOR

Permisos:

Registrar pagos

Ver solo clientes asignados

Ver cronogramas (solo lectura)

Restricciones:

❌ No editar préstamos

❌ No editar cronogramas

🗃️ BASE DE DATOS (SUPABASE – POSTGRESQL)
Tabla: clientes

id (uuid, PK)

dni

nombres

telefono

direccion

estado (activo / inactivo)

created_at

Tabla: prestamos

id (uuid, PK)

cliente_id (FK)

monto

interes

fecha_inicio

fecha_fin

estado (activo, finalizado, renovado, anulado)

bloqueo_cronograma (boolean, default false)

created_at

Tabla: cronograma_cuotas

id (uuid, PK)

prestamo_id (FK)

numero_cuota

fecha_vencimiento

monto_cuota

estado (pendiente, pagado, atrasado)

fecha_pago

created_at

Tabla: pagos

id (uuid, PK)

cuota_id (FK)

monto_pagado

fecha_pago

registrado_por

created_at

Tabla: renovaciones

id (uuid, PK)

prestamo_original_id

prestamo_nuevo_id

saldo_pendiente

fecha_renovacion

aprobado_por

created_at

Tabla: auditoria

id

usuario_id

accion

tabla_afectada

registro_id

timestamp

detalle

Tabla: alertas

id

tipo_alerta

descripcion

usuario_id

prestamo_id

created_at

🔒 REGLAS CRÍTICAS DE NEGOCIO
📌 PRÉSTAMOS

Un préstamo se considera INICIADO si fecha_inicio <= hoy

Una vez iniciado:

❌ No se edita monto

❌ No se edita interés

❌ No se edita cliente

❌ No se elimina

Solo ADMIN puede generar cronograma ANTES del inicio

📌 CRONOGRAMA

Se genera UNA sola vez por préstamo

Al iniciar préstamo:

bloqueo_cronograma = true

Nadie puede:

Editar cuotas

Eliminar cuotas

Agregar cuotas

Cuotas pagadas NUNCA se editan

📌 PAGOS

✅ Se permiten pagos parciales

❌ Ningún pago se edita ni elimina

Correcciones = nuevo registro

Todo pago genera auditoría

🔁 REGLAS EXACTAS DE RENOVACIÓN

Una renovación SOLO es válida si:

Préstamo activo

Sin cuotas vencidas

≥ 90% de cuotas pagadas

Proceso:

Se crea un nuevo préstamo

Se genera nuevo cronograma

El préstamo original:

Cambia estado a renovado

Queda bloqueado permanentemente

Todo se registra en renovaciones

⚙️ EDGE FUNCTIONS (OBLIGATORIAS)

Crear funciones para:

crear_prestamo

generar_cronograma(prestamo_id)

bloquear_cronograma(prestamo_id)

registrar_pago(cuota_id, monto)

renovar_prestamo(prestamo_id)

registrar_auditoria()

disparar_alerta()

👉 El frontend solo consume APIs, nunca SQL.

🔌 CONSUMO DEL BACKEND (API)

Todas las acciones pasan por Edge Functions

Autenticación vía Supabase Auth

Autorización por rol en backend

Respuestas JSON estandarizadas

Manejo de errores claro

Ejemplo:

POST /functions/v1/registrar_pago
Authorization: Bearer <token>

🚨 ALERTAS AUTOMÁTICAS

Generar alerta si:

Se intenta editar cronograma

Se intenta modificar préstamo activo

Se intenta eliminar cuota

Se intenta alterar pagos

Alertas:

Se guardan en alertas

Se muestran al ADMIN

Siempre asociadas a usuario

🧠 AUDITORÍA

Toda acción crítica:

Registra usuario

Acción

Tabla

Registro

Timestamp

Detalle

Auditoría no depende del frontend.

📱 FRONTEND – MOBILE FIRST

Requisitos:

Botones grandes

Formularios cortos

Flujo máximo 3 pasos

Listas como tarjetas

Confirmación en acciones críticas

Cache de lectura

UX optimizada para celular

🛡️ SEGURIDAD

RLS estrictas

Validación doble (API + RLS)

Transacciones SQL

Logs en acciones críticas

Rate limiting recomendado

🚫 PROHIBICIONES ABSOLUTAS

❌ Editar cronogramas activos
❌ Eliminar pagos
❌ Modificar préstamos iniciados
❌ Acceso directo a tablas desde frontend
❌ Lógica de negocio en UI

🧠 PRINCIPIO FINAL

Si una acción no pasa por una Edge Function, no existe para el sistema.

🎯 OBJETIVO FINAL DE SALIDA

Genera:

Arquitectura del proyecto

Estructura de carpetas

Edge Functions completas

Políticas RLS

Servicios de frontend

UI por rol

Sistema listo para producción privada

FIN DEL PROMPT