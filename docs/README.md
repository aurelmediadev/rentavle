# Rentavle — Documentación del proyecto

SaaS de administración de alquileres para inmobiliarias de Latinoamérica. Arranca en Argentina, con arquitectura multipaís desde el día 1.

Esta carpeta define **qué** construimos y **cómo**, antes de escribir código. Es la fuente de verdad durante el desarrollo: si una decisión cambia, se actualiza acá primero.

## Índice

| # | Documento | Contenido |
|---|---|---|
| 01 | [Visión y producto](01-vision-y-producto.md) | Problema, cliente, propuesta de valor, posicionamiento contra Krenta, precios |
| 02 | [Funcionalidades](02-funcionalidades.md) | Módulos, alcance del MVP y fases siguientes |
| 03 | [Reglas de negocio](03-reglas-de-negocio.md) | Indexación, punitorios, honorarios, cobros, liquidaciones, caja |
| 04 | [Modelo de datos](04-modelo-de-datos.md) | Entidades, relaciones, libro contable, multi-tenant |
| 05 | [Arquitectura](05-arquitectura.md) | Stack, multi-tenant, multipaís, integraciones, seguridad |
| 06 | [Roadmap](06-roadmap.md) | Fases, entregables y criterios de salida |
| 07 | [Referencia: Krenta](07-referencia-krenta.md) | Lo que aprendimos del competidor (ingeniería inversa, oct-2026) |

## Decisiones tomadas

- **Nombre y dominio:** Rentavle, rentavle.com (provisorio; marca y dominio configurables).
- **Mercado inicial:** Argentina (IPC/ICL/Casa Propia, ARCA, MercadoPago). **Segundo país: Chile** (alquileres en UF).
- **Sin plan gratis permanente:** solo prueba limitada con controles anti-duplicado.
- **Cliente inicial:** inmobiliarias chicas y medianas (10–300 contratos).
- **Stack:** Next.js (App Router) + TypeScript + Supabase (Postgres, Auth, Storage) + Drizzle ORM. Ver [05-arquitectura](05-arquitectura.md).
- **Multipaís desde el día 1:** país, moneda, índices y facturación electrónica son configuraciones por organización detrás de interfaces, nunca `if (argentina)` en el código.

## Decisiones abiertas

Ver la sección "Pendientes de decidir" al final de cada documento.
