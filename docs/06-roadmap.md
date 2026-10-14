# 06 — Roadmap

Fases en orden. Cada fase termina con un **criterio de salida** verificable. Las duraciones son estimaciones para una persona con asistencia de IA y se ajustan al cerrar cada fase.

## Fase 0 — Fundaciones (≈ 2 semanas)

Objetivo: el esqueleto donde se apoya todo lo demás.

- Monorepo (pnpm), Next.js, Tailwind + shadcn/ui, ESLint/Prettier, Vitest, Playwright, CI en GitHub Actions.
- Supabase local + proyecto de producción; Drizzle con primera migración.
- Auth: registro, login, recuperación de contraseña, Google.
- Organizaciones, membresías, invitaciones, roles admin/operator.
- RLS en todas las tablas + tests que verifican que una organización no ve datos de otra.
- `packages/domain` con dinero (decimal) y fechas/períodos, con tests.
- `CountryPack` de Argentina (documentos, condiciones fiscales, provincias, formatos).
- Layout de la app: menú lateral, búsqueda global (vacía), selector de organización.

**Salida:** una persona se registra, crea su inmobiliaria, invita a otra y ninguna ve datos ajenos (test automático).

## Fase 1 — MVP Argentina (≈ 8–10 semanas)

Objetivo: una inmobiliaria real puede administrar todos sus alquileres y dejar Excel.

1. **Clientes y propiedades:** ABM, contactos, cuentas bancarias, copropietarios con porcentaje.
2. **Contratos:** alta manual (incluido contrato en curso), detalle, períodos, finalización/prórroga/renovación, archivo adjunto, historial.
3. **Índices:** `fetch-indexes` para IPC, ICL y Casa Propia; cálculo de actualizaciones (real y provisorio); vista previa; ajuste manual; reporte del mes.
4. **Deudas:** generación mensual de alquiler; gastos únicos y recurrentes con monto a confirmar.
5. **Cobros:** registro de pago con selección de conceptos, punitorios explicados, pagos parciales y saldo a favor, 4 métodos de cobro, comprobantes adjuntos.
6. **Liquidaciones:** por contrato y agrupadas, copropietarios, honorarios.
7. **Contabilidad:** libro de partida doble, cajas y cuentas, libro de caja con saldo, registros manuales, reversas.
8. **Documentos:** recibo y liquidación en PDF con logo y firma, numeración, links para compartir.
9. **Comunicaciones:** email de recibo/liquidación; WhatsApp por link; plantillas; avisos automáticos por email (aumento, recordatorio, mora); historial.
10. **Panel:** contratos activos, cobrado vs. pendiente, honorarios del mes, vencimientos y actualizaciones.
11. **SaaS:** planes por contratos activos, prueba de 21 días con controles anti-duplicado, solo lectura al vencer, suscripción con MercadoPago, panel interno de administración.
12. **Onboarding:** asistente de primeros pasos y datos de ejemplo opcionales.
13. **Sitio público:** landing, precios, registro.

**Salida:** 3 inmobiliarias piloto operan un mes completo (generación de deudas → cobros → liquidaciones → avisos) y la caja de Rentavle coincide con su control manual.

## Fase 2 — Automatización y migración (≈ 6 semanas)

Objetivo: que cargar la cartera y operar el mes sea mucho más rápido que en Krenta.

- Carga de contratos con IA (PDF, Word, **escaneos y fotos**) con pantalla de revisión.
- Importación masiva desde Excel/CSV con validación por fila.
- WhatsApp Cloud API: avisos automáticos con plantillas aprobadas; estados de entrega.
- Contratos en USD/EUR cobrados en pesos con tipo de cambio registrado.
- Control de comprobantes de servicios que trae el inquilino.
- Incidentes, edificios/complejos, transferencias entre cajas, cierre de caja.
- Reportes: morosidad, estado de cuenta por propietario, exportación completa.
- Registro de auditoría e impersonación para soporte.
- Calculadora pública de alquileres (SEO).

**Salida:** una inmobiliaria con 100 contratos migra su cartera en menos de una hora; el 80% de los avisos salen automáticos.

## Fase 3 — Cobro online, portales y facturación (≈ 6–8 semanas)

Objetivo: que el inquilino pague solo y el propietario consulte solo.

- Portal del inquilino: deudas, pago online con MercadoPago (conciliación automática por webhook), recibos, subir comprobantes, reportar incidentes.
- Portal del propietario: liquidaciones, documentos, estado de sus propiedades.
- Acceso por link mágico.
- Facturación ARCA (WSFEv1): facturas A/B/C por honorarios; alta del punto de venta guiada y verificada.
- Consulta del padrón por CUIT.
- Conciliación de extractos bancarios (CSV).
- Roles personalizados.

**Salida:** al menos el 30% de los cobros de las inmobiliarias piloto entran por el portal sin intervención manual.

## Fase 4 — Expansión regional (continua)

Objetivo: Latinoamérica.

- **País 2: Chile.** Los alquileres se pactan en UF, que cambia todos los días: convertir UF a pesos, emitir avisos y recalcular es exactamente el trabajo que Rentavle automatiza. Mercado formal, con alta adopción de software y pagos digitales, poder adquisitivo mayor que Argentina, MercadoPago disponible y facturación electrónica obligatoria (SII). Requiere: índice UF diario (CMF/Banco Central de Chile), RUT, comunas/regiones, boleta/factura SII, CLP sin decimales.
- **País 3 (candidato): México** por tamaño de mercado (ajuste anual por INPC, CFDI del SAT). **Uruguay** como alternativa rápida por cercanía (UI, DGI).
- Antes de entrar a cada país: entrevistar 10 inmobiliarias locales y relevar competidores locales.
- `CountryPack` por país: índices (UF, UVR, INPC, UI), documentos (RUT, RFC, CC, CI), facturación (SII, SAT CFDI, DIAN, DGI), traducciones y plantillas.
- Precios en moneda local; MercadoPago del país.
- Portugués (Brasil) si se entra a ese mercado.
- Multisucursal, API pública, webhooks, alquileres temporarios, contratos desde plantilla con firma electrónica.

## Lanzamiento

| Hito | Cuándo |
|---|---|
| Piloto cerrado con 3–5 inmobiliarias (gratis a cambio de feedback) | Fin de Fase 1 |
| Lanzamiento público Argentina (precio pago) | Fin de Fase 2 |
| Primer país fuera de Argentina | Durante Fase 4 |

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Errores en cálculos de dinero hacen perder confianza | Dominio puro con tests exhaustivos (casos reales de las piloto); asientos balanceados validados en la base |
| Cambios normativos en índices/alquileres | Reglas configurables, índices en tablas, monitoreo de normativa |
| Fuentes de índices cambian de formato o se caen | Varias fuentes por índice, alertas si falta un valor, carga manual de emergencia por el equipo de Rentavle |
| Plantillas de WhatsApp rechazadas o costosas | Mantener el envío por link como alternativa; WhatsApp automático como add-on |
| Krenta reacciona bajando precios | Competir por automatización y regionalización, no por precio |
| Una sola persona desarrollando | Alcance estricto por fase; nada de F2 antes de cerrar F1 |

## Pendientes de decidir

- Ciudades donde buscar las inmobiliarias piloto (ver estrategia en [01-vision-y-producto](01-vision-y-producto.md#captación-de-las-primeras-inmobiliarias-sin-contactos-previos)).
- Empezar la búsqueda de piloto durante la Fase 1 (recomendado: desde la semana 4, con un prototipo para mostrar).
