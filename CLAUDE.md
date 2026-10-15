# Rentavle

SaaS de administración de alquileres para inmobiliarias de Latinoamérica (primero Argentina). Toda la definición del producto está en [`docs/`](docs/README.md): leerla antes de implementar una funcionalidad.

## Estado

Fase 0 (fundaciones) implementada. Fase 1 en curso: clientes y propiedades (punto 1) y contratos (punto 2) listos; del punto 2 faltan el archivo adjunto, la edición de condiciones y las alertas de vencimiento. Puntos 3 (índices y aumentos), 4 (deudas), 5 (cobros) y 6 (liquidaciones) listos. Seguir el orden de [`docs/06-roadmap.md`](docs/06-roadmap.md): no empezar una fase sin cerrar la anterior. Cómo correr el proyecto: [`README.md`](README.md).

## Next.js 16 (Cache Components activado)

Esta versión tiene cambios grandes: leer `apps/web/node_modules/next/dist/docs/` antes de usar una API nueva. Patrones ya adoptados:

- `middleware` ahora es `src/proxy.ts`; solo refresca la sesión y redirige de forma optimista. La autorización real está en `src/lib/auth.ts` (capa de acceso a datos).
- Todo lo que lee la sesión (cookies) va **dentro de `<Suspense>` en la propia página**: la página exporta un componente síncrono con el encabezado y un componente async con los datos. Un Suspense en el layout no cubre la navegación entre páginas hermanas.
- `createSupabaseServerClient()` llama a `connection()` antes de crear el cliente (Supabase usa `Date.now()`).
- Nada de `Math.random()`/`Date.now()` en el render; usar funciones auxiliares fuera del componente o tiempo de pedido.
- Hooks de URL (`usePathname`, `useSearchParams`) en componentes que se renderizan en rutas dinámicas van dentro de `<Suspense>` (ver el menú en `app-sidebar.tsx`).
- Next conserva montadas (ocultas) las páginas ya visitadas: los `id` de los campos se generan con `useId()` (nunca fijos) y los tests e2e interactúan solo con elementos visibles (`.filter({ visible: true })`).
- React 19 reinicia el formulario después de cada Server Action: **todo** error de validación devuelve `values: formValues(formData)` para no perder lo cargado. Las listas dinámicas (contactos, propietarios) son estado del cliente.
- Formularios con estado local que dependen de datos del servidor (por ejemplo, el cobro) llevan una `key` derivada de esos datos: si no, al volver a la página se reutiliza el estado viejo.
- El test e2e falla si hay errores en la consola del navegador: así se detectan los avisos de validación de Next.

## Base de datos

- Consultas de usuarios siempre con `asUser()` (`src/lib/auth.ts`), que corre la transacción con el rol `authenticated` y los claims del JWT para que apliquen las políticas RLS. `db.admin` saltea RLS: solo para jobs, webhooks y tests.
- Tablas en Drizzle (`packages/db/src/schema`); políticas RLS y funciones en migraciones SQL manuales (`generate:custom`).
- Altas que cruzan tablas con permisos distintos (crear organización, aceptar invitación) son funciones `security definer` en Postgres.
- En subconsultas `sql` de Drizzle, calificar las columnas de la tabla externa a mano (`"charges"."id"`): Drizzle las escribe sin tabla y Postgres las considera ambiguas.
- Después de `supabase db reset`: correr `fetch-indexes` (los e2e de actualizaciones usan el IPC real) y `seed-demo`.
- Fuentes externas inestables: la API de datos.gob.ar tiene réplicas desactualizadas; el IPC se consulta varias veces y se unen los resultados (`packages/country/src/ar/indexes.ts`).
- Cada tabla nueva de negocio: `organization_id`, RLS con `private.is_member()` / `private.has_role()`, y casos en `packages/db/test/tenant-isolation.test.ts`.

## Stack

Next.js (App Router) + TypeScript estricto, Tailwind + shadcn/ui, Supabase (Postgres, Auth, Storage), Drizzle ORM, Trigger.dev, Resend, `@react-pdf/renderer`, MercadoPago, `decimal.js`, `next-intl`, Vitest, Playwright. Monorepo pnpm (`apps/web`, `packages/*`). Detalle en [`docs/05-arquitectura.md`](docs/05-arquitectura.md).

## Reglas

- **Dinero:** nunca `number`/`float` para importes; usar `decimal.js` y `numeric(14,2)`. Todo importe va con su moneda.
- **Reglas de negocio** (indexación, punitorios, honorarios, imputación, liquidaciones) viven en `packages/domain` como funciones puras con tests. Ver [`docs/03-reglas-de-negocio.md`](docs/03-reglas-de-negocio.md).
- **Multi-tenant:** toda tabla de negocio tiene `organization_id` y RLS. Toda consulta del servidor filtra además por la organización activa.
- **Contabilidad:** los asientos (`ledger_entries`) nunca se editan ni se borran; se corrigen con reversas. Débitos = créditos por operación.
- **Multipaís:** nada de `if (country === 'AR')` fuera de `packages/country`.
- **Trabajos programados idempotentes:** volver a ejecutarlos no debe duplicar deudas, avisos ni asientos.
- **Cliente:** no importar el esquema de la base ni enums del ORM en componentes del navegador.
- **Idioma:** UI y documentación en español rioplatense; código, tablas y columnas en inglés.
- Si una decisión de producto cambia, actualizar `docs/` en el mismo cambio.
