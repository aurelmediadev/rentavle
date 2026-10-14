# 03 — Reglas de negocio

Cómo calcula Rentavle cada cosa. Estas reglas se implementan como **funciones puras con tests** (sin base de datos ni UI), en `packages/domain` o equivalente (ver [05-arquitectura](05-arquitectura.md)).

> ⚠️ Los aspectos legales (índices permitidos, periodicidad mínima, topes de punitorios) cambian con la normativa de cada país. Validar con un asesor antes de lanzar y mantener las reglas **configurables**, nunca fijas en el código.

## Convenciones

- **Dinero:** decimal exacto (nunca `float`). En la base, `numeric(14,2)`; en TypeScript, una librería decimal (`decimal.js` o `big.js`). Redondeo a 2 decimales, mitad hacia arriba, **solo al final** de cada cálculo.
- **Moneda:** todo importe va con su moneda (`ARS`, `USD`, `EUR`, `CLP`, `MXN`, ...). No se suman importes de monedas distintas sin una conversión explícita y registrada.
- **Fechas:** los períodos de alquiler son meses calendario (`2026-10`). Las fechas de vencimiento y de pago se evalúan en la zona horaria de la organización.
- **Cálculos explicables:** cada importe calculado guarda su fórmula legible (por ejemplo "14 días × 0,5% × $500.000") para mostrarla en pantalla y en el recibo.

## 1. Contrato y períodos

- Un contrato tiene `inicio`, `fin`, `monto_inicial`, `moneda` y una regla de actualización (`índice`, `periodicidad_meses`).
- **Cuotas:** una por mes calendario entre inicio y fin. La cuota `n/N` se muestra en recibos ("oct 26 (7/36)").
- **Períodos de actualización:** bloques de `periodicidad_meses` desde el inicio. Período 1 = monto inicial; los siguientes se calculan al comenzar (ver §2).
- **Contrato en curso** (inicio anterior al mes actual): el usuario indica el **monto vigente** y el **primer mes a registrar**. Las cuotas anteriores se consideran pagas y no generan movimientos. El período vigente toma ese monto como base para la próxima actualización.
- **Finalización:**
  - Normal: al llegar a `fin` sin renovación, pasa a "finalizado" cuando se salda la última cuota.
  - Rescisión anticipada: nueva fecha de fin; se anulan las cuotas posteriores; puede generar un cargo por rescisión (gasto único).
  - Prórroga: extiende `fin` en el mismo contrato y registra el evento.
  - Renovación: cierra el contrato y crea uno nuevo vinculado (`renovado_a`).

## 2. Actualización de montos (indexación)

Nuevo monto de un período:

```
monto_nuevo = monto_anterior × (valor_índice_final / valor_índice_inicial)
```

Se guardan `índice`, `valor_inicial`, `fecha_inicial`, `valor_final`, `fecha_final`, `% de variación`, `monto_anterior` y `monto_nuevo`.

### Por índice (Argentina)

| Índice | Fuente | Valores | Cómo se eligen los valores inicial y final |
|---|---|---|---|
| **ICL** | BCRA API v4, variable 40 (diario) | Valor diario | Valor del día de inicio del período anterior y del nuevo período (mismo día del mes que el inicio del contrato; si el mes es más corto, su último día) |
| **IPC** | INDEC vía datos.gob.ar, serie `148.3_INIVELNAL_DICI_M_26` (mensual) | Nivel general nacional, base dic-2016 | Nivel del mes `inicio_período_anterior − desfase` y del mes `inicio_período_nuevo − desfase`. Ej.: aumento trimestral de abril 2026 = nov-2025 → feb-2026 |
| **Casa Propia** | Sin API pública: carga manual | Coeficiente mensual | Producto de los coeficientes de los meses `[inicio_anterior − desfase, inicio_nuevo − desfase)` (a validar con la normativa) |
| **Porcentaje fijo** | El contrato | % por período | `monto × (1 + %)` |

**Desfase y valores provisorios del IPC.** El INDEC publica el IPC de un mes a mediados del mes siguiente. Si el contrato se actualiza el 1° de octubre, el IPC de septiembre todavía no existe. Dos modos, configurables por organización (Krenta ofrece los mismos):

- **Solo valores reales** (desfase 2): se usa hasta el último mes publicado. El aumento nunca se corrige.
- **Último mes provisorio** (desfase 1): si el último mes no está publicado, se estima repitiendo la variación mensual anterior y la actualización queda `provisoria`. Cuando se publica el valor real, se recalcula (la diferencia ya cobrada se ajustará en la cuota siguiente cuando existan las deudas, Fase 1 punto 4).

El modo es una preferencia de la organización (`organizations.settings.ipcMode`, por defecto `real`). El método de cada serie (`level_ratio` o `coefficient_product`) está en `index_series.method`. Implementación: `packages/domain/src/rent-update.ts` (cálculo) y `packages/jobs` (aplicación diaria).

**Cuándo se calcula:** todos los días se calculan los períodos que empiezan este mes o el próximo (para poder avisar con anticipación), apenas están los valores del índice. Los ajustados a mano no se tocan nunca. Montos redondeados a 2 decimales (mitad hacia arriba).

### Reglas

- La actualización se calcula automáticamente cuando están disponibles todos los valores del índice; si falta alguno, queda `pendiente_de_índice` y aparece en el reporte "Actualizaciones del mes".
- **Vista previa:** antes de aplicarla se puede ver el cálculo; el usuario puede ajustar el monto a mano con un motivo (`ajustada_manualmente`).
- **Aviso:** al quedar confirmado el monto nuevo se programa el aviso al inquilino y al propietario (§8).
- Los índices viven en tablas propias (`index_series`, `index_values`) con fuente, fecha de publicación y si son provisorios. **Nunca** se escriben a mano en el contrato.

## 3. Deudas del inquilino

Al comienzo de cada mes (proceso nocturno) se generan, por contrato activo:

1. **Alquiler** del mes, con el monto vigente del período.
2. **Gastos recurrentes** que correspondan ese mes (expensas, ABL, etc.):
   - Monto conocido → deuda confirmada.
   - Monto variable → deuda `a_confirmar` con el último monto como estimación. Se puede cobrar igual, con una advertencia.
3. **Ajustes** pendientes (diferencias de IPC provisorio, saldos a favor).

Cada deuda define **a quién le debe** (crédito para: propietario, administración) y **si lleva honorarios**.

Los gastos pueden ser **por adelantado** (se cobran en el mes del servicio) o **vencidos** (se cobran el mes siguiente).

## 4. Punitorios (intereses por mora)

Configurables por contrato, con valores por defecto de la organización:

| Parámetro | Por defecto Rentavle | Krenta (observado) |
|---|---|---|
| Tasa diaria | 0,5% (editable; 0 desactiva) | 0,5% |
| Día de vencimiento | 10 | 10 |
| Desde cuándo se cuentan los días | **día siguiente al vencimiento** | día 1 del mes |
| Base | saldo impago del alquiler | monto del alquiler |
| ¿Llevan honorarios? | **no** (configurable) | sí |

```
días_de_mora = fecha_de_pago − fecha_desde   (si fecha_de_pago > vencimiento; si no, 0)
punitorio    = días_de_mora × tasa_diaria × saldo_impago_del_alquiler
```

- Con "desde el día 1", pagar el día 11 cuenta 11 días; con "desde el vencimiento", cuenta 1. Mostrar siempre la explicación.
- Se calculan **al momento del pago** (no se acumulan diariamente en la base). En los avisos de mora se muestran estimados a la fecha.
- Se pueden condonar total o parcialmente con motivo (queda registrado).
- Pago parcial: el saldo restante sigue generando punitorios desde la fecha del último pago.

## 5. Honorarios de la administración

- Tipo **porcentaje** (sobre lo cobrado) o **monto fijo** mensual, por contrato.
- Se devengan **al cobrar** (criterio de caja): solo sobre conceptos efectivamente pagados por el inquilino que tengan `lleva_honorarios = sí`.
- Por defecto llevan honorarios: alquiler. Opcionales: punitorios, gastos recurrentes (por concepto).
- El honorario se descuenta de lo que se le debe al propietario y queda como ingreso de la administración.

Ejemplo (contrato de $500.000 con 10% de honorarios, pagado el día 14 con punitorios desde el día 1):

| Concepto | Paga inquilino | Honorarios | Al propietario |
|---|---|---|---|
| Alquiler oct | $500.000 | $50.000 | $450.000 |
| Punitorios (14 d × 0,5%) | $35.000 | $3.500 (si llevan) | $31.500 |
| Expensas (a la administración) | $80.000 | — | — |
| **Total** | **$615.000** | **$53.500** | **$481.500** |

## 6. Cobros al inquilino

- El usuario selecciona qué deudas cancela; por defecto, todas las vencidas y la del mes, de la más vieja a la más nueva.
- **Pago parcial:** se imputa en orden (punitorios → alquiler → gastos) salvo que el usuario elija otro. El saldo queda pendiente.
- **Pago a cuenta / de más:** queda como saldo a favor del inquilino y se aplica a la próxima deuda.
- **Métodos:**
  - Efectivo → entra a una caja física.
  - Transferencia a la administración → entra a una cuenta bancaria de la administración.
  - Transferencia al propietario → no entra dinero a la administración; se registra el cobro y el propietario ya recibió su parte (la administración queda acreedora de sus honorarios).
  - Transferencia dividida → honorarios y gastos a la administración; el resto, directo al propietario.
- Cada cobro genera un **recibo** numerado y sus asientos contables (§9).

## 7. Liquidaciones al propietario

- Lo que se le debe al propietario = conceptos cobrados a su favor − honorarios − gastos a su cargo (reparaciones, comisión bancaria, etc.).
- Se puede liquidar por contrato o agrupando todos los contratos del propietario.
- **Copropietarios:** se divide según el porcentaje de titularidad de la propiedad.
- Solo se liquida lo **efectivamente cobrado** (nunca deudas pendientes del inquilino), salvo que la inmobiliaria adelante fondos (registrado como préstamo, F3).
- Cada liquidación genera un **documento** con columnas Pago / Honorarios / A liquidar, y sus asientos.

## 8. Comunicaciones automáticas

| Aviso | Cuándo (por defecto) | Destinatarios | Canal |
|---|---|---|---|
| Actualización de monto | 10 días antes del mes del aumento (o al confirmarse el índice si es más tarde) | Inquilino, propietario | Email (MVP), WhatsApp (F2) |
| Recordatorio de pago | 3 días antes del vencimiento | Inquilino | Email, WhatsApp |
| Aviso de mora | 1, 5 y 10 días después del vencimiento (configurable) | Inquilino (y garante opcional) | Email, WhatsApp |
| Recibo de pago | Al registrar el pago (opcional) | Inquilino | Email, WhatsApp |
| Aviso de cobro al propietario | Al registrar el pago (opcional) | Propietario | Email, WhatsApp |
| Liquidación | Al registrarla (opcional) | Propietario | Email, WhatsApp |
| Vencimiento de contrato | 60 y 30 días antes | Administración | Interno + email |

- Plantillas editables con variables; vista previa con datos reales antes de enviar.
- Nunca se envía dos veces el mismo aviso automático para el mismo contrato y período (clave única).
- Cada envío queda en el historial con su estado (enviado, entregado, rebotado, leído si el canal lo informa).

## 9. Contabilidad (partida doble)

Todo movimiento de dinero o de deuda genera asientos balanceados (débitos = créditos). Esto garantiza que la caja cuadre y permite auditar cualquier saldo.

**Cuentas** (por organización):

- `caja:<id>` / `banco:<id>`: dinero físico de la administración.
- `inquilino:<contrato>`: lo que debe el inquilino (cuenta a cobrar).
- `propietario:<cliente>`: lo que la administración le debe al propietario (cuenta a pagar).
- `honorarios`: ingresos de la administración.
- `gastos_administracion`: lo que la administración cobra para sí (por ejemplo, expensas que paga ella).

**Ejemplo** (el cobro de §5 en efectivo y luego la liquidación en efectivo):

| Evento | Debe | Haber | Importe |
|---|---|---|---|
| Deuda de alquiler | inquilino | propietario | 500.000 |
| Deuda de expensas | inquilino | gastos_administracion | 80.000 |
| Punitorios al cobrar | inquilino | propietario | 35.000 |
| Cobro en efectivo | caja | inquilino | 615.000 |
| Honorarios | propietario | honorarios | 53.500 |
| Liquidación en efectivo | propietario | caja | 481.500 |

Saldo de caja: 615.000 − 481.500 = **133.500** = honorarios (53.500) + expensas (80.000). Coincide con lo que mostró Krenta en la prueba.

- Los asientos **no se editan ni se borran**: una corrección es un asiento inverso (`reversa_de`).
- Los saldos (caja, inquilino, propietario) se calculan desde los asientos; se pueden cachear, pero el libro es la fuente de verdad.

## 10. Numeración y documentos

- Recibos, liquidaciones, movimientos y facturas llevan numeración correlativa por organización y por tipo, sin huecos (secuencia en la base con bloqueo por organización).
- Un documento emitido no cambia; si se anula, queda marcado como anulado y se emite otro.

## Pendientes de decidir

- Tasa de punitorios por defecto y si se aplica un tope.
- Orden de imputación por defecto en pagos parciales.
- Tratamiento de saldos a favor del propietario (¿se pueden adelantar fondos?).
