import { expect, type Page, test } from "@playwright/test";
import { createAgency, trackBrowserErrors } from "./helpers";

const visible = <T extends { filter(opts: { visible: boolean }): T }>(locator: T) => locator.filter({ visible: true });

function monthStart(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

async function pick(page: Page, combobox: string, option: RegExp) {
  await visible(page.getByRole("combobox", { name: combobox })).click();
  await page.getByRole("option", { name: option }).click();
}

const balance = (page: Page) => visible(page.getByText(/^Inquilino debe/));

test("tenant account: monthly rent, recurring expenses, discounts, voids and next month", async ({ page }) => {
  const problems = trackBrowserErrors(page);
  await createAgency(page);

  for (const [first, last] of [["Pedro", "Propietario"], ["Ana", "Inquilina"]]) {
    await page.goto("/clientes/nuevo");
    await visible(page.getByLabel("Nombre", { exact: true })).fill(first!);
    await visible(page.getByLabel("Apellido", { exact: true })).fill(last!);
    await visible(page.getByRole("button", { name: "Crear cliente" })).click();
    await expect(page).toHaveURL(/\/clientes\/\d+$/);
  }
  await page.goto("/propiedades/nueva");
  await pick(page, "Propietario 1", /Pedro Propietario/);
  await visible(page.getByLabel("Calle", { exact: true })).fill("Calle Ficticia");
  await visible(page.getByRole("button", { name: "Crear propiedad" })).click();
  await expect(page).toHaveURL(/\/propiedades\/1$/);

  // Contract started two months ago, registered from its first month, without updates.
  const start = monthStart(-2);
  await page.goto("/contratos/nuevo?propiedad=1");
  await pick(page, "Inquilino 1", /Ana Inquilina/);
  await visible(page.getByLabel("Inicio")).fill(start.toISOString().slice(0, 10));
  await visible(page.getByRole("button", { name: "2 años" })).click();
  await visible(page.getByLabel("Primer mes a registrar")).fill(start.toISOString().slice(0, 7));
  await visible(page.getByLabel(/Monto vigente en/)).fill("400.000");
  await visible(page.getByRole("combobox", { name: "Índice" })).click();
  await visible(page.getByRole("option", { name: "Sin actualización" })).click();
  await visible(page.getByLabel("Porcentaje sobre lo cobrado")).fill("10");
  await visible(page.getByRole("button", { name: "Crear contrato" })).click();
  await expect(page).toHaveURL(/\/contratos\/1$/);

  // Three months of rent are owed right away.
  await expect(visible(page.getByText(/Alquiler .* \(1\/24\)/))).toBeVisible();
  await expect(visible(page.getByText(/Alquiler .* \(3\/24\)/))).toBeVisible();
  await expect(balance(page)).toContainText("$ 1.200.000");

  // Variable recurring expense: generated as an estimate, then confirmed.
  await visible(page.getByRole("button", { name: "Gasto recurrente" })).click();
  const recurring = page.getByRole("dialog");
  await recurring.getByLabel("Nombre").fill("Expensas");
  await recurring.getByLabel("Monto", { exact: true }).fill("80.000");
  await recurring.getByRole("button", { name: "Agregar" }).click();
  await expect(visible(page.getByText("A confirmar", { exact: true }))).toBeVisible();
  await expect(balance(page)).toContainText("$ 1.280.000");

  await visible(page.getByRole("button", { name: /Confirmar monto de Expensas/ })).click();
  await page.getByRole("dialog").getByLabel("Monto", { exact: true }).fill("85.000");
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
  await expect(visible(page.getByText("A confirmar", { exact: true }))).toHaveCount(0);
  await expect(balance(page)).toContainText("$ 1.285.000");

  // One-off discount.
  await visible(page.getByRole("button", { name: "Cargo o descuento" })).click();
  const oneOff = page.getByRole("dialog");
  await oneOff.getByRole("combobox", { name: "Tipo" }).click();
  await visible(page.getByRole("option", { name: "Descuento (resta)" })).click();
  await oneOff.getByLabel("Concepto").fill("Bonificación por arreglo");
  await oneOff.getByLabel("Monto", { exact: true }).fill("10.000");
  await oneOff.getByRole("button", { name: "Agregar" }).click();
  await expect(visible(page.getByText("Bonificación por arreglo"))).toBeVisible();
  await expect(balance(page)).toContainText("$ 1.275.000");

  // Void the first month's rent.
  await visible(page.getByRole("button", { name: /Anular Alquiler .* \(1\/24\)/ })).click();
  await page.getByRole("dialog").getByLabel("Motivo").fill("Pagado antes de usar el sistema");
  await page.getByRole("dialog").getByRole("button", { name: "Anular deuda" }).click();
  await expect(visible(page.getByText(/Anulada: Pagado antes/))).toBeVisible();
  await expect(balance(page)).toContainText("$ 875.000");

  // Next month's debts on demand: rent + expensas at the confirmed amount.
  await visible(page.getByRole("button", { name: "Deudas del próximo mes" })).click();
  await expect(visible(page.getByText(/Alquiler .* \(4\/24\)/))).toBeVisible();
  await expect(balance(page)).toContainText("$ 1.360.000");

  // Early termination at the end of this month voids next month's unpaid debts...
  const endOfMonth = new Date(Date.UTC(monthStart(1).getUTCFullYear(), monthStart(1).getUTCMonth(), 0));
  await visible(page.getByRole("button", { name: "Rescindir" })).click();
  await page.getByRole("dialog").getByLabel("Fecha de fin (rescisión)").fill(endOfMonth.toISOString().slice(0, 10));
  await page.getByRole("dialog").getByRole("button", { name: "Registrar rescisión" }).click();
  await expect(balance(page)).toContainText("$ 875.000");
  await expect(visible(page.getByText("Anulada: Rescisión anticipada del contrato")).first()).toBeVisible();

  // ...and undoing it restores them.
  page.once("dialog", (d) => d.accept());
  await visible(page.getByRole("button", { name: "Anular rescisión" })).click();
  await expect(balance(page)).toContainText("$ 1.360.000");

  expect(problems, "browser errors").toEqual([]);
});
