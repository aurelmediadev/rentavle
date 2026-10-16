# 08 — Puesta en producción

Cómo llevar Rentavle a producción para las inmobiliarias piloto. Lo marcado **(vos)** son cuentas, pagos o credenciales que solo puede hacer el dueño del proyecto; el resto son comandos o configuraciones que se pueden hacer juntos.

## Arquitectura en producción

| Pieza | Servicio | Plan | Costo aprox. |
|---|---|---|---|
| Base de datos, autenticación y archivos | Supabase, región **São Paulo** | Pro (copias diarias, sin pausas por inactividad) | USD 25/mes |
| Aplicación web y tareas diarias (crons) | Vercel, región **São Paulo** (`gru1`, ya configurada) | Pro (el plan gratis no permite uso comercial) | USD 20/mes |
| Emails (recibos, avisos, registro) | Resend, con dominio propio verificado | Gratis hasta 3.000/mes; luego Pro | USD 0–20/mes |
| Cobro de suscripciones | MercadoPago | Comisión por cobro | — |
| Dominio | rentavle.com | — | ~USD 15/año |

Total fijo: **~USD 45–65 por mes**. El costo por contrato es casi cero ([05-arquitectura](05-arquitectura.md#costos-de-infraestructura-estimación)).

## 1. Cuentas (vos)

1. **Dominio:** registrar `rentavle.com` (o el definitivo) en un registrador que permita editar los DNS.
2. **Supabase:** crear la organización y un proyecto `rentavle-prod` en la región *South America (São Paulo)*, plan Pro. Guardar la contraseña de la base en un gestor de contraseñas.
3. **Vercel:** crear la cuenta con el usuario de GitHub `aurelmediadev` y pasarla a Pro.
4. **Resend:** crear la cuenta.
5. **MercadoPago:** cuenta de vendedor y una aplicación en developers.mercadopago.com (ver el paso 6).

## 2. Base de datos (Supabase)

Desde la raíz del repositorio, en tu terminal (los comandos piden iniciar sesión en el navegador):

```bash
npx supabase login
npx supabase link --project-ref <ref-del-proyecto>
npx supabase db push
```

`db push` aplica todas las migraciones: tablas, políticas RLS, funciones, buckets de archivos y los planes con sus precios.

En el panel de Supabase:

- Authentication → URL Configuration: **Site URL** `https://rentavle.com` y **Redirect URLs** `https://rentavle.com/**`.
- Authentication → Emails → Templates: pegar las plantillas en castellano de `supabase/templates` con estos asuntos:

| Plantilla | Archivo | Asunto |
|---|---|---|
| Confirm signup | `confirmation.html` | Confirmá tu email - Rentavle |
| Reset password | `recovery.html` | Elegí una contraseña nueva - Rentavle |
| Change email address | `email_change.html` | Confirmá tu nuevo email - Rentavle |

No usar `supabase config push`: subiría la configuración local (por ejemplo, `site_url` a localhost).

**Envío de emails de autenticación (obligatorio):** sin un SMTP propio, Supabase manda como máximo 2 emails por hora y los registros fallan. En Authentication → Emails → SMTP Settings:

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Puerto | `465` |
| Usuario | `resend` |
| Contraseña | una API key de Resend (paso 3) |
| Remitente | `avisos@rentavle.com`, nombre `Rentavle` |

**Datos para Vercel** (Settings → Database y Settings → API Keys):

- Cadena de conexión **Transaction pooler** (puerto 6543) → `DATABASE_URL`.
- URL del proyecto → `NEXT_PUBLIC_SUPABASE_URL`.
- Publishable key → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

La *service role key* **no** va en Vercel: la aplicación no la usa.

## 3. Emails (Resend)

1. Domains → agregar `rentavle.com` y cargar en el DNS los registros que indica (SPF, DKIM y el MX de envío). Esperar a que figure como verificado.
2. API Keys → crear una con permiso de envío → `RESEND_API_KEY` (y la misma, u otra, como contraseña SMTP de Supabase).
3. Webhooks → endpoint `https://rentavle.com/api/webhooks/resend` con los eventos *delivered, bounced, complained, failed* → su *signing secret* → `RESEND_WEBHOOK_SECRET`.

## 4. Aplicación (Vercel)

1. Add New → Project → importar `aurelmediadev/rentavle`.
2. **Root Directory:** `apps/web` (Vercel detecta Next.js y pnpm; dejar activado *Include files outside the root directory*, porque usa los paquetes del monorepo).
3. Variables de entorno (entorno *Production*):

| Variable | Valor |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `https://rentavle.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | del paso 2 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | del paso 2 |
| `DATABASE_URL` | del paso 2 (pooler, puerto 6543) |
| `CRON_SECRET` | un valor aleatorio largo (`openssl rand -hex 32`) |
| `RESEND_API_KEY` | del paso 3 |
| `RESEND_WEBHOOK_SECRET` | del paso 3 |
| `EMAIL_FROM` | `avisos@rentavle.com` |
| `MERCADOPAGO_ACCESS_TOKEN` | del paso 6 (puede quedar vacío al principio) |
| `MERCADOPAGO_WEBHOOK_SECRET` | del paso 6 |

4. Deploy. La página de precios se arma durante el build leyendo la base, así que `DATABASE_URL` tiene que estar antes del primer deploy.
5. Settings → Domains → agregar `rentavle.com` y `www.rentavle.com` y cargar los registros DNS que indica.

Las tareas diarias ya están en `apps/web/vercel.json` (índices y deudas a las 6 h, avisos a las 9 h, hora argentina); Vercel les manda `CRON_SECRET` solo.

## 5. Primer arranque

1. Cargar los índices históricos (IPC e ICL) sin esperar al cron:
   ```bash
   curl -H "Authorization: Bearer <CRON_SECRET>" https://rentavle.com/api/cron/indices
   ```
2. Registrarte en `https://rentavle.com/registro` con tu email real y darte acceso al panel interno (con la cadena de conexión **directa**, puerto 5432):
   ```bash
   DATABASE_URL="<cadena directa>" pnpm --filter @rentavle/jobs grant-platform-admin tu@email.com
   ```
3. **Prueba completa** con una inmobiliaria de prueba: registro (llega el email en castellano) → datos e inmobiliaria → cliente, propiedad y contrato → cobro → recibo PDF → link compartido → email del recibo (llega con el adjunto) → liquidación → caja. Borrarla después desde el panel interno o dejarla como inmobiliaria de ejemplo.
4. Para cada inmobiliaria piloto: en `/admin`, cambiar su acceso a **Activa sin plan** con el motivo ("Piloto: 6 meses sin cargo").

## 6. MercadoPago (cuando esté la aplicación)

Mientras falten las credenciales, elegir un plan muestra "escribinos y te activamos el plan", y las pilotos tienen acceso desde el panel interno.

1. **Prueba primero** con las credenciales *de prueba* en local (`apps/web/.env.local`) o en un entorno de Vercel aparte, con usuarios de prueba de MercadoPago.
2. Con las credenciales productivas: `MERCADOPAGO_ACCESS_TOKEN` en Vercel.
3. En la aplicación de MercadoPago → Webhooks: URL `https://rentavle.com/api/webhooks/mercadopago`, evento **Planes y suscripciones** → la clave secreta → `MERCADOPAGO_WEBHOOK_SECRET`.
4. Redeploy y probar una suscripción real con un plan, y su cancelación.

## Antes de abrir el registro al público

- Términos y condiciones y política de privacidad revisados por un abogado (hoy son borradores).
- Verificación de teléfono en el registro (falta elegir proveedor de SMS o WhatsApp).
- En Supabase: activar *Leaked password protection* (Authentication → Policies) y revisar los límites de envío.
- Proteger la rama `main` en GitHub para que solo se integre con la integración continua en verde (Vercel publica cada push a `main`).

## Cuidados

- **Nunca** correr `seed-demo` ni tests contra producción (`seed-demo` se niega a correr fuera de localhost; los tests borran datos).
- Las migraciones nuevas se aplican con `npx supabase db push` **antes** de publicar el código que las usa.
- Las claves solo en Vercel y en el gestor de contraseñas; nunca en el repositorio.
