import { expect, type Page, test } from "@playwright/test";
import { createAgency, trackBrowserErrors } from "./helpers";

const visible = <T extends { filter(opts: { visible: boolean }): T }>(locator: T) => locator.filter({ visible: true });

function monthStart(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function pick(page: Page, combobox: string, option: RegExp) {
  await visible(page.getByRole("combobox", { name: combobox })).click();
  await page.getByRole("option", { name: option }).click();
}

async function collect(page: Page, opts: { rentIndex: number; method?: string }) {
  await page.goto("/contratos/1/cobrar");
  const rents = visible(page.getByRole("checkbox", { name: /Cobrar Alquiler/ }));
  await expect(rents.first()).toBeVisible();
  const count = await rents.count();
  for (let i = 0; i < count; i++) {
    if (i === opts.rentIndex) await rents.nth(i).check();
    else await rents.nth(i).uncheck();
  }
  for (let i = 0; i < count; i++) {
    if (i === opts.rentIndex) await expect(rents.nth(i)).toBeChecked();
    else await expect(rents.nth(i)).not.toBeChecked();
  }
  await visible(page.getByRole("checkbox", { name: "Cobrar punitorios por mora" })).uncheck();
  if (opts.method) {
    await visible(page.getByRole("combobox", { name: "Forma de pago" })).click();
    await visible(page.getByRole("option", { name: opts.method })).click();
  }
  await visible(page.getByRole("button", { name: "Registrar cobro" })).click();
  await expect(page).toHaveURL(/\/movimientos\/\d+/);
}

test("owner settlements: co-owners, fees, direct payments, owner debts and reversal", async ({ page }) => {
  const problems = trackBrowserErrors(page);
  await createAgency(page);

  for (const [first, last] of [["Laura", "Pérez"], ["Jorge", "Pérez"], ["Ana", "Inquilina"]]) {
    await page.goto("/clientes/nuevo");
    await visible(page.getByLabel("Nombre", { exact: true })).fill(first!);
    await visible(page.getByLabel("Apellido", { exact: true })).fill(last!);
    await visible(page.getByRole("button", { name: "Crear cliente" })).click();
    await expect(page).toHaveURL(/\/clientes\/\d+$/);
  }

  // Co-owned 60/40.
  await page.goto("/propiedades/nueva");
  await pick(page, "Propietario 1", /Laura Pérez/);
  await visible(page.getByRole("button", { name: "Copropietario" })).click();
  await pick(page, "Propietario 2", /Jorge Pérez/);
  await visible(page.getByLabel("Porcentaje del propietario 1")).fill("60");
  await visible(page.getByLabel("Porcentaje del propietario 2")).fill("40");
  await visible(page.getByLabel("Calle", { exact: true })).fill("Juan B. Justo");
  await visible(page.getByRole("button", { name: "Crear propiedad" })).click();
  await expect(page).toHaveURL(/\/propiedades\/1$/);

  const start = monthStart(-1);
  await page.goto("/contratos/nuevo?propiedad=1");
  await pick(page, "Inquilino 1", /Ana Inquilina/);
  await visible(page.getByLabel("Inicio")).fill(iso(start));
  await visible(page.getByRole("button", { name: "2 años" })).click();
  await visible(page.getByLabel("Primer mes a registrar")).fill(iso(start).slice(0, 7));
  await visible(page.getByLabel(/Monto vigente en/)).fill("500.000");
  await visible(page.getByRole("combobox", { name: "Índice" })).click();
  await visible(page.getByRole("option", { name: "Sin actualización" })).click();
  await visible(page.getByLabel("Porcentaje sobre lo cobrado")).fill("10");
  await visible(page.getByRole("button", { name: "Crear contrato" })).click();
  await expect(page).toHaveURL(/\/contratos\/1$/);

  // A repair at the owners' charge, owed to the agency.
  await visible(page.getByRole("button", { name: "Cargo o descuento" })).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Concepto").fill("Reparación de techo");
  await dialog.getByLabel("Monto", { exact: true }).fill("20.000");
  await dialog.getByRole("combobox", { name: "A cargo de" }).click();
  await visible(page.getByRole("option", { name: "Propietario" })).click();
  await dialog.getByRole("combobox", { name: "A favor de" }).click();
  await visible(page.getByRole("option", { name: "Administración" })).click();
  await dialog.getByRole("button", { name: "Agregar" }).click();
  await expect(visible(page.getByText("Reparación de techo"))).toBeVisible();

  // Month 1 collected by the agency in cash; month 2 paid directly to the owners.
  await collect(page, { rentIndex: 0 });
  await collect(page, { rentIndex: 0, method: "Transferencia directa al propietario" });

  // Overview: Laura gets 60% of the cash payment minus 10%; Jorge 40%.
  await page.goto("/liquidaciones");
  await expect(visible(page.getByRole("row", { name: /Laura Pérez/ }))).toContainText("$ 270.000");
  await expect(visible(page.getByRole("row", { name: /Jorge Pérez/ }))).toContainText("$ 180.000");

  // Settle Laura: the repair is deducted and the fee of the direct payment becomes her debt.
  await visible(page.getByRole("row", { name: /Laura Pérez/ }).getByRole("link", { name: "Liquidar" })).click();
  await expect(visible(page.getByText(/A pagar al propietario/))).toContainText("$ 250.000");
  await expect(visible(page.getByText(/Honorarios a cobrarle al propietario/))).toContainText("$ 30.000");
  await visible(page.getByRole("button", { name: "Registrar liquidación" })).click();
  await expect(page).toHaveURL(/\/movimientos\/\d+/);
  await expect(visible(page.getByText("Liquidación registrada."))).toBeVisible();
  await expect(visible(page.getByRole("row", { name: /Total pagado al propietario/ }))).toContainText("$ 250.000");
  await expect(visible(page.getByText(/Queda como deuda del propietario: Honorarios de administración \$\s30\.000/))).toBeVisible();
  const lauraSettlementUrl = page.url();

  // Jorge's settlement doesn't include Laura's fee debt.
  await page.goto("/liquidaciones");
  await visible(page.getByRole("row", { name: /Jorge Pérez/ }).getByRole("link", { name: "Liquidar" })).click();
  await expect(visible(page.getByText(/Honorarios de administración/))).toHaveCount(0);
  await expect(visible(page.getByText(/A pagar al propietario/))).toContainText("$ 180.000");
  await visible(page.getByRole("button", { name: "Registrar liquidación" })).click();
  await expect(page).toHaveURL(/\/movimientos\/\d+/);

  // A settled payment can't be annulled before its settlements.
  await page.goto("/movimientos/1");
  await visible(page.getByRole("button", { name: "Anular cobro" })).click();
  await page.getByRole("dialog").getByLabel("Motivo").fill("Prueba");
  await page.getByRole("dialog").getByRole("button", { name: "Anular cobro" }).click();
  await expect(page.getByRole("dialog").getByText(/anulá primero la liquidación #\d+/)).toBeVisible();
  await page.keyboard.press("Escape");

  // Annulling Laura's settlement makes her payments settleable again.
  await page.goto(lauraSettlementUrl.replace(/\?.*/, ""));
  await visible(page.getByRole("button", { name: "Anular liquidación" })).click();
  await page.getByRole("dialog").getByLabel("Motivo").fill("Se liquidó con el monto equivocado");
  await page.getByRole("dialog").getByRole("button", { name: "Anular liquidación" }).click();
  await expect(visible(page.getByText("Anulado: Se liquidó con el monto equivocado"))).toBeVisible();
  await page.goto("/liquidaciones");
  await expect(visible(page.getByRole("row", { name: /Laura Pérez/ }))).toContainText("$ 270.000");
  await expect(visible(page.getByRole("row", { name: /Jorge Pérez/ }))).toHaveCount(0);

  // The cash box: 500.000 collected − 180.000 paid to Jorge (Laura's payout was annulled).
  await page.goto("/caja");
  await expect(visible(page.getByLabel("Saldo de Caja principal"))).toHaveText("$ 320.000");

  expect(problems, "browser errors").toEqual([]);
});
