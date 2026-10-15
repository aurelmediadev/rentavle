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

const balance = (page: Page) => visible(page.getByText(/^Inquilino debe/));

test("payments: late interest, partial payment and reversal", async ({ page }) => {
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

  // Rent of $500.000 since two months ago, due the 10th, 0,5% daily after the due date.
  const start = monthStart(-2);
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
  await expect(balance(page)).toContainText("$ 1.500.000");

  // 1. Pay the first month four days late: interest is calculated and explained.
  await visible(page.getByRole("link", { name: "Registrar cobro" })).click();
  const rents = visible(page.getByRole("checkbox", { name: /Cobrar Alquiler/ }));
  await rents.nth(1).uncheck();
  await rents.nth(2).uncheck();
  const lateDate = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 14));
  await visible(page.getByLabel("Fecha del pago")).fill(iso(lateDate));
  await expect(visible(page.getByText("4 días de mora × 0,5% × $ 500.000"))).toBeVisible();
  await expect(visible(page.getByRole("row", { name: /Total a cobrar/ }))).toContainText("$ 510.000");
  await visible(page.getByRole("button", { name: "Registrar cobro" })).click();

  await expect(page).toHaveURL(/\/movimientos\/1/);
  await expect(visible(page.getByText("Cobro registrado"))).toBeVisible();
  await expect(visible(page.getByRole("row", { name: /^Total/ }))).toContainText("$ 510.000");
  await expect(visible(page.getByText(/Punitorios/)).first()).toBeVisible();

  await visible(page.getByRole("link", { name: "Contrato #1" })).click();
  await expect(balance(page)).toContainText("$ 1.000.000");
  await expect(visible(page.getByText("Pagado")).first()).toBeVisible();

  // 2. Partial payment without interest: the rest stays owed.
  await visible(page.getByRole("link", { name: "Registrar cobro" })).click();
  await visible(page.getByRole("checkbox", { name: "Cobrar punitorios por mora" })).uncheck();
  await visible(page.getByLabel("Monto recibido")).fill("300.000");
  await expect(visible(page.getByText(/Queda debiendo/))).toContainText("$ 700.000");
  await visible(page.getByRole("button", { name: "Registrar cobro" })).click();
  await expect(page).toHaveURL(/\/movimientos\/2/);
  await visible(page.getByRole("link", { name: "Contrato #1" })).click();
  await expect(balance(page)).toContainText("$ 700.000");
  await expect(visible(page.getByText("Pago parcial"))).toBeVisible();

  // 3. Annul the first payment: its rent is owed again and its interest is voided.
  await page.goto("/movimientos/1");
  await visible(page.getByRole("button", { name: "Anular cobro" })).click();
  await page.getByRole("dialog").getByLabel("Motivo").fill("Se cargó en el contrato equivocado");
  await page.getByRole("dialog").getByRole("button", { name: "Anular cobro" }).click();
  await expect(visible(page.getByText("Anulado: Se cargó en el contrato equivocado"))).toBeVisible();
  await page.goto("/contratos/1");
  await expect(balance(page)).toContainText("$ 1.200.000");
  await expect(visible(page.getByText(/Anulada: Anulación del cobro #1/))).toBeVisible();

  // The movements list shows both, the first one annulled.
  await page.goto("/movimientos");
  await expect(visible(page.getByText("Anulado"))).toBeVisible();

  expect(problems, "browser errors").toEqual([]);
});
