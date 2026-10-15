# 02 — Funcionalidades

Alcance por módulo. Cada función tiene una fase: **MVP** (necesaria para cobrarle a la primera inmobiliaria), **F2**, **F3**, **F4** (ver [06-roadmap](06-roadmap.md)).

Las reglas de cálculo están en [03-reglas-de-negocio](03-reglas-de-negocio.md).

## 1. Cuenta, organización y usuarios

| Función | Fase |
|---|---|
| Registro con email + contraseña y Google; verificación de email | MVP |
| Organización: nombre, logo, firma, CUIT/ID fiscal, domicilio, país, moneda principal | MVP |
| Onboarding guiado: datos de la inmobiliaria → primera caja → primer contrato → primer cobro | MVP |
| Usuarios ilimitados por invitación; roles Administrador y Operador | MVP |
| Roles personalizados con permisos por módulo | F3 |
| Registro de auditoría (quién cambió qué y cuándo) | F2 |
| Una persona en varias organizaciones (cambio de organización) | F2 |
| Multisucursal (sucursales dentro de una organización) | F4 |

## 2. Clientes (propietarios, inquilinos, garantes)

Un cliente es una persona o empresa. Su rol (propietario, inquilino, garante) depende del contrato, no del cliente.

| Función | Fase |
|---|---|
| Alta/edición: nombre, apellido o razón social, documento, ID fiscal, condición fiscal, teléfonos, emails (varios con etiqueta), domicilio, nacionalidad, fecha de nacimiento | MVP |
| Consulta del padrón fiscal por CUIT para autocompletar (ARCA) | F3 |
| Cuentas bancarias del cliente (CBU/CVU, alias) | MVP |
| Ficha del cliente: contratos, saldo, movimientos, comunicaciones, notas, archivos | MVP |
| Detección de duplicados por documento | F2 |

## 3. Propiedades

| Función | Fase |
|---|---|
| Alta: dirección estructurada, propietario/s con porcentaje de titularidad, tipo (depto, casa, local, oficina, cochera), nomenclatura catastral | MVP |
| Edificios/complejos que agrupan unidades | F2 |
| Estado: disponible / alquilada / en refacción | MVP |
| Ficha: contratos (actual e históricos), incidentes, notas, archivos | MVP |

**Mejora sobre Krenta:** porcentaje de titularidad por propietario, para dividir liquidaciones entre copropietarios.

## 4. Contratos

| Función | Fase |
|---|---|
| Alta manual: propiedad, propietarios, inquilinos, garantes, fechas, monto, moneda, índice y periodicidad, honorarios, punitorios, método de cobro, día de vencimiento | MVP |
| **Contrato en curso:** cargar el monto del mes actual y empezar a generar deudas desde ahí | MVP |
| Tabla de períodos de actualización con vista previa | MVP |
| Archivo del contrato adjunto | MVP |
| Carga con IA desde PDF/Word **y escaneos/fotos** (OCR), con revisión antes de guardar | F2 |
| Importación masiva desde Excel/CSV con validación fila por fila | F2 |
| Finalización: normal, rescisión anticipada, prórroga, renovación (crea contrato nuevo vinculado) | MVP |
| Historial del contrato (cambios, actualizaciones, finalización) | MVP |
| Alertas de vencimiento (60/30 días antes) | MVP |
| Contratos en USD/EUR y cobro en pesos al tipo de cambio elegido | F2 |
| Alquiler temporario (por noche/semana) | F4 |
| Generación del contrato desde plantilla + firma electrónica | F4 |

## 5. Actualizaciones de monto (indexación)

| Función | Fase |
|---|---|
| Índices Argentina: IPC (INDEC), ICL (BCRA), Casa Propia; porcentaje fijo; sin actualización | MVP |
| Descarga automática de índices desde fuentes oficiales, con fecha de publicación | MVP |
| Cálculo automático al empezar cada período, con detalle (índice inicial, final, % y monto anterior/nuevo) | MVP |
| Ajuste manual del monto con motivo (queda registrado) | MVP |
| IPC con último mes provisorio (estimado) vs. solo valores reales, configurable por organización | MVP |
| Reporte "Actualizaciones del mes" con el monto actual y el nuevo | MVP |
| Índices de otros países (UF Chile, UVR/IPC Colombia, INPC México, UI Uruguay) | F4 |

## 6. Deudas, gastos y cobros al inquilino

| Función | Fase |
|---|---|
| Generación automática de la deuda mensual de alquiler | MVP |
| Punitorios automáticos con explicación del cálculo | MVP |
| Gastos únicos (cargo o descuento) asignados a inquilino, propietario o administración | MVP |
| Gastos recurrentes (expensas, ABL, servicios) con monto a confirmar mes a mes | MVP |
| Registro de pago: selección de conceptos, pago parcial, pago a cuenta, adelanto del mes siguiente | MVP |
| Métodos: efectivo, transferencia a la administración, transferencia al propietario, transferencia dividida | MVP |
| Comprobantes adjuntos al pago (transferencia, ticket) | MVP |
| Control de comprobantes de servicios que trae el inquilino (luz, gas, ABL) | F2 |
| Pago online desde el portal del inquilino (MercadoPago) con imputación automática | F3 |
| Conciliación de extracto bancario (importar CSV del banco y asociar transferencias) | F3 |

## 7. Liquidaciones al propietario

| Función | Fase |
|---|---|
| Liquidación por contrato: conceptos cobrados − honorarios − gastos a cargo del propietario | MVP |
| Liquidación de varios contratos del mismo propietario juntos | MVP |
| División entre copropietarios según porcentaje | MVP |
| Métodos: efectivo, transferencia desde la administración, transferencia directa del inquilino | MVP |
| Comisión bancaria por transferencia configurable | F2 |

## 8. Caja y contabilidad

| Función | Fase |
|---|---|
| Cajas físicas y cuentas bancarias de la administración | MVP |
| Libro de caja con saldo corrido por cuenta | MVP |
| Registros manuales de entrada/salida (gastos propios de la inmobiliaria) | MVP |
| Transferencias entre cajas/cuentas | F2 |
| Reporte de honorarios cobrados por período | MVP |
| Cierre de caja diario/mensual | F2 |
| Exportación contable (CSV/Excel) | F2 |

## 9. Documentos (PDF)

| Función | Fase |
|---|---|
| Recibo de pago al inquilino (original y copia, media hoja opcional) | MVP |
| Liquidación al propietario (pago, honorarios, neto) | MVP |
| Recibo provisorio / aviso de deuda con gastos sin confirmar en blanco | F2 |
| Logo, firma y datos fiscales de la inmobiliaria en todos los documentos | MVP |
| Link público con vencimiento para compartir un documento | MVP |
| Numeración correlativa por organización | MVP |

## 10. Comunicaciones

| Función | Fase |
|---|---|
| Envío de recibo/liquidación por email | MVP |
| Envío por WhatsApp manual (abre WhatsApp con mensaje armado), registrado en el historial | MVP |
| Plantillas editables con variables (`{{DIRECCION}}`, `{{NUEVO_MONTO}}`, etc.) | MVP |
| Avisos automáticos por email: aumento (antes del mes), recordatorio de pago (antes del vencimiento), mora | MVP |
| Envío automático por WhatsApp Business API (plantillas aprobadas por Meta) | F2 |
| Copia oculta a la organización | MVP |
| Historial de comunicaciones por contrato y cliente, con estado de entrega | MVP |

## 11. Facturación electrónica

| Función | Fase |
|---|---|
| ARCA (Argentina): facturas A/B/C por honorarios de la inmobiliaria | F3 |
| Alta guiada del punto de venta, con verificación automática de la conexión | F3 |
| Facturación por cuenta y orden del propietario (si aplica) | F4 |
| Adaptadores para otros países: SAT CFDI (MX), SII (CL), DIAN (CO), DGI (UY) | F4 |

## 12. Portales

| Función | Fase |
|---|---|
| Portal del inquilino: deudas, pagos, recibos, pago online, subir comprobantes, reportar incidentes | F3 |
| Portal del propietario: liquidaciones, estado de sus propiedades, documentos | F3 |
| Acceso por link mágico (sin contraseña) | F3 |

## 13. Incidentes, notas y archivos

| Función | Fase |
|---|---|
| Incidentes por propiedad: prioridad, estado, responsable, historial | F2 |
| Notas en contrato/cliente/propiedad, con notas destacadas | MVP |
| Archivos adjuntos por entidad | MVP |

## 14. Panel y reportes

| Función | Fase |
|---|---|
| Panel: contratos activos, cobrado vs. pendiente del mes, honorarios del mes, vencimientos próximos, actualizaciones del mes | MVP |

> **Implementado (panel):** contratos activos, cobrado en el mes, pendiente de las deudas del mes, deuda vencida, honorarios del mes (de la contabilidad: se reconocen al liquidar), deudas vencidas por contrato con acceso a cobrar, actualizaciones de este mes y el próximo, propietarios para liquidar y contratos que terminan en 60 días. Una inmobiliaria sin contratos ve los primeros pasos. Falta la búsqueda global.
| Morosidad por antigüedad | F2 |
| Rentabilidad y estado de cuenta por propietario | F2 |
| Búsqueda global (contratos, clientes, propiedades, movimientos) | MVP |
| Exportación completa de los datos de la organización | F2 |

## 15. Plataforma (SaaS)

| Función | Fase |
|---|---|
| Planes y límites por contratos activos | MVP |
| Prueba gratis con controles anti-duplicado (CUIT, email y teléfono verificados) | MVP |
| Cuenta en solo lectura al vencer la prueba o la suscripción, con exportación de datos | MVP |
| Suscripción con MercadoPago (débito automático) | MVP |
| Panel interno de administración: organizaciones, planes, pagos, soporte | MVP |
| Impersonación para soporte, con registro de auditoría | F2 |
| Calculadora pública de alquileres (IPC/ICL) para SEO | F2 |
| API pública + webhooks | F4 |

## Fuera de alcance (por ahora)

- Gestión de ventas, captación y publicación de propiedades en portales (otro producto).
- Contabilidad general de la inmobiliaria (solo la caja de la administración de alquileres).
- Liquidación de sueldos o impuestos.

## Pendientes de decidir

- ¿La prueba gratis incluye WhatsApp automático (tiene costo por mensaje)?
- ¿Las transferencias divididas requieren integración bancaria o solo se registran?
