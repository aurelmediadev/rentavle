import { expect, type Page, test } from "@playwright/test";
import { createAgency, trackBrowserErrors } from "./helpers";

const visible = <T extends { filter(opts: { visible: boolean }): T }>(locator: T) => locator.filter({ visible: true });

async function pick(page: Page, combobox: string, option: RegExp) {
  await visible(page.getByRole("combobox", { name: combobox })).click();
  await page.getByRole("option", { name: option }).click();
}

test("panel: first steps, then the month's numbers and overdue debts", async ({ page }) => {
  // The scenario needs this month's rent (due on the 28th, the latest allowed) not to be overdue yet.
  test.skip(new Date().getUTCDate() >= 28, "Escenario armado para antes del día 28 del mes");
  const problems = trackBrowserErrors(page);
  await createAgency(page);
  await expect(visible(page.getByText("Primeros pasos"))).toBeVisible();

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

  // Started last month, due on the 28th: last month's rent is overdue, this month's isn't yet.
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  await page.goto("/contratos/nuevo?propiedad=1");
  await pick(page, "Inquilino 1", /Ana Inquilina/);
  await visible(page.getByLabel("Inicio")).fill(start);
  await visible(page.getByRole("button", { name: "2 años" })).click();
  await visible(page.getByLabel("Primer mes a registrar")).fill(start.slice(0, 7));
  await visible(page.getByLabel(/Monto vigente en/)).fill("500.000");
  await visible(page.getByRole("combobox", { name: "Índice" })).click();
  await visible(page.getByRole("option", { name: "Sin actualización" })).click();
  await visible(page.getByLabel("Porcentaje sobre lo cobrado")).fill("10");
  await visible(page.getByLabel("Día de vencimiento")).fill("28");
  await visible(page.getByRole("button", { name: "Crear contrato" })).click();
  await expect(page).toHaveURL(/\/contratos\/1$/);

  await page.goto("/panel");
  await expect(visible(page.getByLabel("Contratos activos"))).toHaveText("1");
  await expect(visible(page.getByLabel("Deuda vencida"))).toHaveText(/^\$\s500\.000$/);
  await expect(visible(page.getByLabel(/^Pendiente de /))).toHaveText(/^\$\s500\.000$/);
  await expect(visible(page.getByLabel(/^Cobrado en /))).toHaveText(/^\$\s0$/);
  const overdueRow = visible(page.getByRole("row", { name: /#1 · Calle Ficticia/ }));
  await expect(overdueRow).toContainText("Ana Inquilina");
  await expect(visible(page.getByRole("link", { name: /Pedro Propietario/ }))).toHaveCount(0);

  // Collect last month's rent from the panel: it leaves the overdue list and shows up to settle.
  await overdueRow.getByRole("link", { name: "Cobrar" }).click();
  await expect(page).toHaveURL(/\/contratos\/1\/cobrar$/);
  const rents = visible(page.getByRole("checkbox", { name: /Cobrar Alquiler/ }));
  await expect(rents).toHaveCount(2);
  await rents.nth(1).uncheck();
  await expect(rents.nth(1)).not.toBeChecked();
  await visible(page.getByRole("checkbox", { name: "Cobrar punitorios por mora" })).uncheck();
  await visible(page.getByRole("button", { name: "Registrar cobro" })).click();
  await expect(page).toHaveURL(/\/movimientos\/\d+/);

  await page.goto("/panel");
  await expect(visible(page.getByText("No hay deudas vencidas."))).toBeVisible();
  await expect(visible(page.getByLabel(/^Cobrado en /))).toHaveText(/^\$\s500\.000$/);
  await expect(visible(page.getByRole("listitem").filter({ hasText: "Pedro Propietario" }))).toContainText("$ 450.000");

  expect(problems, "browser errors").toEqual([]);
});
