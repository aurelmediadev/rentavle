# 07 — Referencia: Krenta

Lo que aprendimos de [krenta.com](https://www.krenta.com) por ingeniería inversa (14-oct-2026): sitio público, bundles de JavaScript y una cuenta de prueba con datos ficticios. Sirve como referencia funcional, **no** para copiar código, textos ni diseño.

## Producto y negocio

- SaaS argentino de administración de alquileres para inmobiliarias. Dice tener +150 clientes; 47 reseñas en Google con 5,0.
- Planes (oct-2026): Inicial $40.500/mes (40 contratos), Profesional $63.000 (120), Corporativo $83.000 (300, +100 por $14.000). Usuarios ilimitados; todas las funciones en todos los planes; ajuste trimestral por IPC.
- Prueba gratis: ~10 días, 10 contratos.
- Venta y soporte muy apoyados en WhatsApp.
- Integración de marca blanca con KiteProp (modo `/embed` con SSO).

## Stack observado

Blitz.js sobre Next.js (Pages Router), Prisma, Mantine, Zod, react-query, react-pdf para documentos, Resend (email), S3 (archivos), MercadoPago (suscripciones), ARCA (facturación), Sentry, PostHog, GTM, Meta Pixel y Google Ads; CRM Kommo y GoHighLevel. Hosting en Vercel.

El bundle del cliente incluye el esquema completo de Prisma (nombres de modelos y campos). **Lección para Rentavle:** no importar tipos ni enums del ORM en componentes del cliente.

## Módulos (169 operaciones de backend)

Contratos (alta manual, con IA, CSV; prórroga, rescisión, renovación, borrado lógico), actualizaciones por índice (IPC, ICL, Casa Propia, IPC España), deudas y gastos (únicos y recurrentes, a confirmar), pagos de inquilinos, liquidaciones (por contrato o varios contratos), caja de partida doble (cajas y bancos), recibos y liquidaciones en PDF, comunicaciones (email y WhatsApp por link, plantillas con variables, avisos automáticos por email), facturación ARCA de honorarios, incidentes, notas, archivos, portal de clientes (modelo de datos presente), onboarding de 4 pasos, panel interno con impersonación.

## Comportamientos verificados en la prueba

- **Contrato en curso:** pide el monto del mes actual; las cuotas anteriores se dan por pagas.
- **Periodicidad** de actualización: 1, 2, 3, 4, 6, 9 o 12 meses. Tabla de períodos con el índice base.
- **Valores por defecto:** honorarios 10%, punitorios 0,5% diario, vencimiento día 10, intereses **desde el día 1**.
- **Punitorios** calculados al registrar el pago, con explicación ("14 días de mora x 0.5% x $500.000").
- **Gastos recurrentes** con monto "a confirmar"; cobrarlos sin confirmar pide confirmación extra.
- **Honorarios también sobre punitorios** ($3.500 sobre $35.000).
- Liquidación: columnas Pago / Honorarios / A retirar. Caja final = honorarios + gastos de la administración.
- Recibos con el nombre del usuario si la organización no tiene datos cargados.
- Facturación ARCA: asistente de 5 pasos, pero la activación final se pide por WhatsApp.
- Configuración de comunicaciones: aviso de aumento el día 25 del mes previo, recordatorio el último día del mes, avisos de mora; copia oculta a la organización.

## Oportunidades para Rentavle

| Debilidad de Krenta | Respuesta de Rentavle |
|---|---|
| Solo Argentina | Multipaís desde el diseño |
| WhatsApp manual (link) | WhatsApp Business API automático |
| Sin pago online visible para el inquilino | Portal con MercadoPago y conciliación automática |
| IA rechaza contratos escaneados | OCR para escaneos y fotos |
| Activación de facturación por soporte | Alta autoservicio verificada |
| Punitorios desde el día 1 y honorarios sobre punitorios por defecto | Defaults más justos para el inquilino y el propietario, configurables |
| Prueba de 10 días | Prueba más larga (21 días) con migración asistida |
| Reportes básicos | Morosidad, estado de cuenta por propietario, exportación total |
| Copropietarios sin porcentaje | Titularidad con porcentaje y liquidación dividida |
