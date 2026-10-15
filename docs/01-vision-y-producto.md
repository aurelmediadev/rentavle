# 01 — Visión y producto

## Problema

Una inmobiliaria que administra alquileres repite todos los meses el mismo trabajo manual:

- Calcular aumentos por IPC/ICL con calculadoras externas y avisarle a cada inquilino.
- Armar recibos y liquidaciones a mano (Word/Excel), con errores en punitorios y honorarios.
- Perseguir pagos por WhatsApp sin saber de un vistazo quién debe qué.
- Llevar la caja de la administración (lo que entra de inquilinos, lo que sale a propietarios, lo que queda de honorarios) en planillas.
- Información atada a una computadora o a una persona.

Cada contrato nuevo suma trabajo lineal. La inmobiliaria no puede crecer su cartera sin sumar personal.

## Cliente objetivo (fase inicial)

**Inmobiliarias chicas y medianas de Argentina con 10 a 300 contratos de alquiler administrados.**

- Decisor: dueño/a de la inmobiliaria o encargado/a de administración.
- Usuarios diarios: 1 a 5 personas (administrativos/operadores).
- Hoy usan: Excel + WhatsApp, o un sistema viejo de escritorio, o Krenta / competidores.
- Sensibles a: tiempo ahorrado, errores en liquidaciones, imagen profesional ante propietarios.

Más adelante: propietarios particulares (plan chico), administraciones grandes (multisucursal) y el resto de Latinoamérica.

## Propuesta de valor

> **Rentavle cobra, actualiza, liquida y avisa por vos. Vos solo controlás.**

1. **Cero cálculo manual.** Aumentos por índice, punitorios y honorarios calculados y explicados ("14 días × 0,5% × $500.000").
2. **Cobranza que se mueve sola.** Recordatorios automáticos por email y WhatsApp, y el inquilino puede pagar online desde su portal.
3. **Liquidaciones claras.** El propietario recibe su liquidación con el detalle de pago, honorarios y neto, y puede consultarla en su propio portal.
4. **Caja siempre cuadrada.** Libro contable de partida doble por debajo: cada peso tiene origen y destino.
5. **Empezá en una tarde.** Importás tus contratos desde PDF/Word/escaneo con IA o desde Excel, y seguís desde el mes actual sin cargar historia.

## Posicionamiento frente a Krenta

Krenta es la referencia directa en Argentina (+150 inmobiliarias, 5,0 en Google). Cubre bien el núcleo. Rentavle tiene que igualar ese núcleo y ganar en estos puntos (ver detalle en [07-referencia-krenta](07-referencia-krenta.md)):

| Tema | Krenta (observado) | Rentavle |
|---|---|---|
| Alcance geográfico | Argentina (algo de España en índices) | Latinoamérica: multipaís desde el día 1 |
| WhatsApp | Abre WhatsApp Web con el mensaje armado; el envío es manual | Envío automático por WhatsApp Business API + opción manual |
| Cobro al inquilino | Se registra a mano el pago | Portal del inquilino con pago online (MercadoPago) y conciliación automática |
| Carga con IA | Solo Word/PDF con texto; rechaza escaneos | También escaneos y fotos (OCR) |
| Facturación ARCA | Activación manual por WhatsApp con soporte | Alta autoservicio guiada y verificada automáticamente |
| Índices | Carga interna; IPC con modo provisorio | Descarga automática desde fuentes oficiales, con historial y trazabilidad |
| Prueba gratis | 10 días, 10 contratos | 21 días, 10 contratos, con la migración asistida incluida |
| Reglas de punitorios/honorarios | Configurables por contrato | Igual, con defaults más justos y vista previa del cálculo antes de guardar |
| Reportes | Panel básico | Morosidad, rentabilidad por propietario, vencimientos, exportación total de datos |

**Regla:** no competir con precio bajo como primera arma; competir con automatización real (que el sistema haga el trabajo, no solo lo registre).

## Modelo de negocio

Suscripción mensual por organización, escalonada por **contratos activos**, con usuarios ilimitados (igual que el mercado; cobrar por usuario genera fricción).

**No hay plan gratis permanente** (evita que una misma inmobiliaria abra varias cuentas para no pagar). Solo una prueba gratuita limitada.

Estructura de planes. Precios **provisorios** (oct-2026), pensados sobre el costo de infraestructura estimado ([05-arquitectura](05-arquitectura.md#costos-de-infraestructura-estimación): ~USD 100/mes fijo, casi cero por contrato) y la referencia de Krenta:

| Plan | Contratos activos | Precio/mes (ARS) | Referencia Krenta |
|---|---|---|---|
| Prueba | hasta 10, por 21 días | $0 | 10 días, 10 contratos |
| Inicial | hasta 40 | $35.000 | $40.500 |
| Profesional | hasta 120 | $59.000 | $63.000 |
| Corporativo | hasta 300 | $89.000 (+100 contratos por $15.000) | $83.000 (+100 contratos por $14.000) |
| A medida | +300 | a cotizar | — |

Criterio: Inicial y Profesional apenas debajo de Krenta (es donde se decide el cambio, y todavía faltan carga con IA y ARCA); Corporativo algo arriba, porque es quien más aprovecha la automatización. Con 3 o 4 suscripciones del plan Inicial se cubre el costo fijo.

**Prueba sin abuso:**
- Una prueba por CUIT de la inmobiliaria, por email verificado y por teléfono verificado (código por SMS o WhatsApp).
- Al vencer, la cuenta queda en solo lectura (puede exportar sus datos) hasta suscribirse; no se borra nada durante 90 días.
- Señales de duplicado (mismo CUIT, teléfono, dominio de email o dispositivo) bloquean una nueva prueba y la derivan a soporte.

**Otras reglas:**
- Ajuste trimestral por inflación (como Krenta), comunicado con 30 días de anticipación.
- Pago anual: 2 meses gratis (se pagan 10).
- Facturación electrónica ARCA y WhatsApp automático pueden ser add-ons si el costo por mensaje lo exige.
- Por país: precios en moneda local, con referencia en USD.

## Métricas de éxito

- **Activación:** % de cuentas nuevas que registran su primer pago de inquilino en 7 días.
- **Tiempo a valor:** minutos desde el registro hasta el primer recibo emitido (objetivo < 30).
- **Retención:** churn mensual de cuentas pagas < 3%.
- **Uso de automatización:** % de comunicaciones enviadas automáticamente vs. manualmente.

## Pendientes de decidir

- Confirmar los precios provisorios con las inmobiliarias piloto; si WhatsApp automático es add-on.
- Duración final de la prueba (propuesta: 21 días).

## Decidido

- Nombre: **Rentavle**, dominio **rentavle.com** (provisorio; el código no depende del nombre: marca y dominio van en configuración).
- Sin plan gratis permanente.

## Captación de las primeras inmobiliarias (sin contactos previos)

Objetivo: 3 a 5 inmobiliarias piloto al terminar la Fase 1.

1. **Lista de prospectos:** inmobiliarias de una o dos ciudades (por ejemplo CABA/GBA y una del interior) sacadas de Google Maps, Zonaprop y Argenprop; priorizar las que publican alquileres y tienen entre 1 y 10 empleados.
2. **Oferta piloto:** 6 meses gratis y migración de contratos hecha por nosotros, a cambio de usarlo en serio, una llamada de feedback cada 2 semanas y un testimonio si les sirve.
3. **Contacto:** WhatsApp y email directo al dueño, con un video de 2 minutos mostrando el aumento automático por IPC y el recibo.
4. **Contenido que atrae:** calculadora pública de alquileres IPC/ICL (muy buscada en Argentina), guías sobre la ley de alquileres y plantillas de recibo.
5. **Comunidades:** colegios y cámaras inmobiliarias, grupos de Facebook/LinkedIn de corredores.
6. **Más adelante:** anuncios en Google para "sistema de administración de alquileres", programa de referidos (un mes gratis por recomendación) y alianzas con CRMs inmobiliarios (como hizo Krenta con KiteProp).
