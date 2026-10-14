# 05 — Arquitectura

## Principios

1. **Una persona tiene que poder operarlo.** Servicios administrados, poca infraestructura propia.
2. **El dominio no depende del framework.** Las reglas de [03](03-reglas-de-negocio.md) son funciones puras en TypeScript, testeadas sin base de datos.
3. **Aislamiento de inmobiliarias en la base,** no solo en el código (Row Level Security).
4. **Multipaís por configuración:** lo que cambia por país (índices, facturación, documentos de identidad, formatos, idioma) va detrás de interfaces con una implementación por país.
5. **Nada de secretos ni lógica sensible en el navegador.** (Krenta expone su esquema completo de Prisma en el bundle del cliente; no repetirlo.)

## Stack

| Capa | Elección | Por qué |
|---|---|---|
| Lenguaje | TypeScript (estricto) | Un solo lenguaje de punta a punta |
| Web | Next.js (App Router), React Server Components, Server Actions | Ecosistema maduro, SSR, despliegue simple |
| UI | Tailwind CSS + shadcn/ui (Radix) | Componentes accesibles y editables; tablas con TanStack Table |
| Formularios | React Hook Form + Zod | Los esquemas Zod se comparten entre cliente y servidor |
| Base de datos | Postgres en Supabase | RLS, backups, réplicas, extensiones (`pg_cron`) |
| ORM / migraciones | Drizzle ORM + drizzle-kit | SQL explícito, tipos generados, migraciones versionadas |
| Auth | Supabase Auth (email+contraseña, Google, links mágicos para portales) | Integrado con RLS vía JWT |
| Archivos | Supabase Storage (buckets privados, URLs firmadas) | Contratos, comprobantes, PDFs |
| Trabajos en segundo plano | Trigger.dev | Tareas programadas y colas con reintentos (deudas mensuales, índices, avisos, PDFs, IA) |
| PDFs | `@react-pdf/renderer` en el servidor | Plantillas en React, mismo diseño en todos los documentos |
| Email | Resend + React Email | Envío transaccional con webhooks de entrega/rebote |
| WhatsApp | Links `wa.me` (MVP) → Meta WhatsApp Cloud API (F2) | Plantillas aprobadas para avisos automáticos |
| Pagos | MercadoPago (suscripciones del SaaS y cobro online a inquilinos) | Disponible en AR, MX, CL, CO, UY, PE, BR |
| IA | Anthropic Claude API (extracción de datos de contratos, con salida estructurada) | Lee PDF y escaneos; validado contra esquema Zod |
| Dinero | `decimal.js` | Aritmética exacta |
| Fechas | `date-fns` + `@date-fns/tz` | Zonas horarias por organización |
| i18n | `next-intl` | `es-AR` primero; luego `es-MX`, `es-CL`, `es-CO`, `pt-BR` |
| Tests | Vitest (dominio y servidor), Playwright (flujos end-to-end) | |
| Calidad | ESLint, Prettier, `tsc --noEmit` en CI | |
| Hosting | Vercel (web) + Supabase (datos) + Trigger.dev (jobs) | |
| Observabilidad | Sentry (errores), PostHog (producto), logs de Vercel | |
| CI/CD | GitHub Actions: lint, tipos, tests, migraciones en preview | |

## Estructura del repositorio

Monorepo con pnpm workspaces:

```
rentavle/
├── apps/
│   └── web/                  # Next.js: app interna, portales, sitio público, API
│       ├── app/
│       │   ├── (marketing)/  # landing, precios, calculadora pública
│       │   ├── (auth)/       # login, registro, invitaciones
│       │   ├── (app)/        # app de la inmobiliaria
│       │   ├── (portal)/     # portal de inquilinos y propietarios (F3)
│       │   ├── (admin)/      # panel interno de Rentavle
│       │   └── api/          # webhooks (MercadoPago, Resend, WhatsApp)
│       └── ...
├── packages/
│   ├── domain/               # reglas de negocio puras + tests (sin I/O)
│   ├── db/                   # esquema Drizzle, migraciones, políticas RLS, seeds
│   ├── country/              # adaptadores por país (índices, fiscal, documentos, formatos)
│   ├── pdf/                  # plantillas de documentos
│   ├── emails/               # plantillas React Email
│   └── jobs/                 # tareas de Trigger.dev
├── docs/                     # esta documentación
└── CLAUDE.md
```

## Multi-tenant y seguridad

- Toda tabla de negocio tiene `organization_id`. **RLS activado en todas**, con políticas del tipo:
  `organization_id in (select organization_id from memberships where user_id = auth.uid())`.
- La organización activa viaja en la sesión; el servidor siempre filtra por ella además de RLS (defensa en profundidad).
- Los permisos por rol (admin, operator, custom) se validan en el servidor con un helper único `authorize(action, resource)`.
- Las operaciones contables (cobro, liquidación, reversa) corren en **una transacción** con una función de Postgres que valida el balance de los asientos.
- Datos sensibles (credenciales fiscales, tokens de WhatsApp): en Supabase Vault o un gestor de secretos; la base guarda solo la referencia.
- Los links públicos de documentos usan tokens aleatorios con vencimiento, guardados como hash.
- Rate limiting en login, registro y endpoints públicos.
- Copias de seguridad diarias (Supabase) + exportación total de datos para el cliente.
- Cumplimiento: Ley 25.326 de Protección de Datos Personales (AR) y equivalentes por país; términos y política de privacidad antes del lanzamiento.

## Multipaís

El país de la organización determina un `CountryPack`:

```ts
interface CountryPack {
  code: 'AR' | 'MX' | 'CL' | 'CO' | 'UY' | ...;
  currencies: Currency[];              // ARS, USD...
  identityDocuments: DocType[];        // DNI, CUIT, RUT, RFC, CURP...
  taxConditions: TaxCondition[];       // Resp. Inscripto, Monotributo... / régimen SAT...
  indexSeries: IndexSeriesCode[];      // AR_IPC, AR_ICL...
  indexFetchers: IndexFetcher[];       // descarga de índices oficiales
  fiscalProvider?: FiscalProvider;     // ARCA, SAT CFDI, SII, DIAN...
  addressFormat: AddressFormat;        // provincia/estado/región/departamento
  defaults: OrgDefaults;               // punitorios, vencimiento, textos legales
}
```

- La UI y los documentos se arman desde el pack: no hay `if (pais === 'AR')` fuera de `packages/country`.
- Argentina es el primer pack completo. Agregar un país = implementar su pack + traducciones + plantillas de documentos.

## Integraciones

| Integración | Uso | Fase |
|---|---|---|
| INDEC / BCRA / datos.gob.ar | Descarga diaria de IPC, ICL, Casa Propia, tipos de cambio | MVP |
| Resend | Emails transaccionales y avisos | MVP |
| MercadoPago Suscripciones | Cobro del plan a las inmobiliarias | MVP |
| Claude API | Extracción de datos de contratos (PDF/Word/escaneo) | F2 |
| WhatsApp Cloud API | Avisos automáticos con plantillas aprobadas | F2 |
| MercadoPago Checkout | Pago online del inquilino; webhook concilia y genera el cobro | F3 |
| ARCA (WSAA + WSFEv1) | Facturación electrónica de honorarios | F3 |
| Padrón ARCA | Autocompletar datos por CUIT | F3 |

Cada integración externa va detrás de una interfaz con una implementación falsa para tests y desarrollo local.

## Trabajos programados (Trigger.dev)

| Tarea | Frecuencia | Qué hace |
|---|---|---|
| `fetch-indexes` | Diaria | Descarga índices nuevos; recalcula actualizaciones pendientes o provisorias |
| `generate-monthly-charges` | Diaria (procesa organizaciones cuyo mes comenzó en su zona horaria) | Crea deudas de alquiler y gastos recurrentes del mes |
| `apply-rent-updates` | Diaria | Calcula los períodos que empiezan y programa avisos |
| `send-scheduled-communications` | Cada hora | Envía recordatorios y avisos de mora que corresponden; usa `dedupe_key` |
| `contract-expiry-alerts` | Diaria | Alertas de vencimiento a 60/30 días |
| `render-document` | Por demanda | Genera el PDF y lo guarda en Storage |
| `extract-contract` | Por demanda | IA sobre el archivo subido → borrador de contrato para revisar |

Todas son **idempotentes**: correr dos veces no duplica deudas, avisos ni asientos.

## Ambientes

- **Local:** Supabase CLI (Postgres en Docker), Trigger.dev en modo dev, integraciones falsas.
- **Preview:** cada PR despliega en Vercel con una rama de base de Supabase.
- **Producción:** Vercel + Supabase (región São Paulo, la más cercana a Argentina) + Trigger.dev.

## Costos de infraestructura (estimación)

> Valores de referencia en USD, **a verificar en la página de precios de cada proveedor** antes de fijar los planes: cambian seguido.

**Fijos mensuales** (independientes de la cantidad de clientes, hasta varios cientos de inmobiliarias):

| Servicio | Plan | USD/mes aprox. |
|---|---|---|
| Vercel | Pro (1 usuario) | 20 |
| Supabase | Pro + cómputo chico | 25–35 |
| Trigger.dev | Hobby/Pro | 10–50 |
| Resend | Pro (≈50.000 emails) | 20 |
| Sentry / PostHog | Planes gratis al inicio | 0 |
| Dominio rentavle.com | anual prorrateado | ~1–2 |
| **Total fijo** | | **≈ 75–130** |

**Variables por contrato activo por mes** (lo que importa para el precio):

| Concepto | Supuesto | USD/contrato/mes aprox. |
|---|---|---|
| Emails | ~6 por contrato (recibo, aviso, recordatorio, mora, liquidación) | < 0,01 |
| Almacenamiento | PDFs y comprobantes (~2 MB/mes) | < 0,01 |
| Base de datos y cómputo | asientos, deudas, tareas | < 0,01 |
| **WhatsApp automático (F2)** | ~3–4 mensajes de plantilla "utility" por contrato | **≈ 0,05–0,15** (el más caro; depende de la tarifa de Meta por país) |
| Carga con IA (F2) | una vez por contrato importado | ≈ 0,02–0,10 por contrato (único) |
| Cobro online (F3) | comisión de MercadoPago | la paga el inquilino o la inmobiliaria; no es costo de Rentavle |

**Conclusión:** sin WhatsApp automático, el costo variable es casi cero; el costo real es el fijo (~USD 100/mes), que se cubre con unas pocas suscripciones. WhatsApp automático es el único costo que escala de forma visible: conviene incluir un cupo de mensajes por plan o cobrarlo como adicional.

Este cálculo se rehace con datos reales al cerrar la Fase 1 (los proveedores muestran el consumo).

## Pendientes de decidir

- Supabase vs. Neon + Auth.js si se quiere menos dependencia de un solo proveedor (recomendación: Supabase por velocidad).
- Trigger.dev vs. Inngest (equivalentes; Trigger.dev por la simplicidad de las tareas largas).
- Subdominios de rentavle.com: propuesta `rentavle.com` (sitio), `app.rentavle.com` (app), `portal.rentavle.com` (portales). El dominio va en variables de entorno para poder cambiar de marca.
