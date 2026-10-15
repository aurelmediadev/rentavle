# Rentavle

SaaS de administración de alquileres para inmobiliarias de Latinoamérica. Producto, reglas de negocio y roadmap en [`docs/`](docs/README.md).

## Requisitos

- Node.js 22 o superior
- pnpm 10 (`npm install -g pnpm@10`)
- Docker Desktop abierto (Supabase local corre en contenedores)

## Primer arranque

```bash
pnpm install
pnpm exec supabase start
cp apps/web/.env.example apps/web/.env.local
```

Completá `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `apps/web/.env.local` con el valor que imprime `pnpm exec supabase status`.

```bash
pnpm dev
```

| Servicio | URL |
|---|---|
| App | http://localhost:3000 |
| Supabase Studio (base de datos) | http://127.0.0.1:55323 |
| Mailpit (emails de prueba: confirmaciones, recuperación) | http://127.0.0.1:55324 |
| API de Supabase | http://127.0.0.1:55321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:55322/postgres` |

Los puertos usan el rango 553xx para no chocar con otros proyectos de Supabase en la misma máquina.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | App web en modo desarrollo |
| `pnpm test` | Tests unitarios y de base de datos (requiere Supabase local) |
| `pnpm --filter @rentavle/web test:e2e` | Tests end-to-end con Playwright (usa Microsoft Edge local) |
| `pnpm typecheck` / `pnpm lint` | Tipos y lint de todo el monorepo |
| `pnpm --filter @rentavle/db generate --name=<nombre>` | Genera una migración desde el esquema de Drizzle |
| `pnpm --filter @rentavle/db generate:custom --name=<nombre>` | Migración SQL manual (políticas RLS, funciones) |
| `pnpm exec supabase db reset` | Recrea la base local aplicando todas las migraciones |
| `pnpm --filter @rentavle/jobs fetch-indexes` | Descarga IPC e ICL oficiales a la base local (correr después de cada `db reset`) |
| `pnpm --filter @rentavle/jobs apply-rent-updates` | Calcula los aumentos que corresponden |
| `pnpm --filter @rentavle/jobs generate-charges` | Genera las deudas del mes |
| `pnpm --filter @rentavle/jobs grant-platform-admin <email>` | Da acceso al panel interno (`/admin`) a un usuario del equipo de Rentavle. El usuario de la demo ya lo tiene |
| `pnpm --filter @rentavle/jobs send-communications` | Envía los avisos automáticos que corresponden hoy (en local llegan a Mailpit: http://127.0.0.1:55324) |
| `pnpm --filter @rentavle/jobs seed-demo` | Crea la inmobiliaria de demostración (necesita `SUPABASE_SERVICE_ROLE_KEY` de `supabase status`; datos de acceso en `packages/jobs/src/seed-demo-credentials.ts`) |

## Estructura

```
apps/web          Next.js 16 (App Router, Cache Components)
packages/domain   Reglas de negocio puras (dinero, períodos...) con tests
packages/db       Esquema Drizzle, cliente con RLS, tests de aislamiento
packages/country  Paquetes por país (Argentina: CUIT, provincias, condiciones fiscales)
supabase/         Configuración local y migraciones SQL
docs/             Producto, reglas de negocio, arquitectura y roadmap
```
