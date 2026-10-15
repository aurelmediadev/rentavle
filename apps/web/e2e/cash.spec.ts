import { expect, type Page, test } from "@playwright/test";
import { createAgency, trackBrowserErrors } from "./helpers";

const visible = <T extends { filter(opts: { visible: boolean }): T }>(locator: T) => locator.filter({ visible: true });

async function manual(page: Page, button: string, amount: string, concept: string, boxes?: { from: string; to: string }) {
  await page.goto("/caja");
  await visible(page.getByRole("button", { name: button, exact: true })).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Monto").fill(amount);
  if (boxes) {
    await dialog.getByRole("combobox", { name: "Desde" }).click();
    await visible(page.getByRole("option", { name: new RegExp(boxes.from) })).click();
    await dialog.getByRole("combobox", { name: "Hacia" }).click();
    await visible(page.getByRole("option", { name: new RegExp(boxes.to) })).click();
  }
  await dialog.getByLabel("Concepto").fill(concept);
  await dialog.getByRole("button", { name: "Registrar" }).click();
  await expect(page).toHaveURL(/\/movimientos\/\d+$/);
}

test("cash: boxes, manual income and expenses, transfers, cash book and reversal", async ({ page }) => {
  const problems = trackBrowserErrors(page);
  await createAgency(page);

  await page.goto("/caja");
  await expect(visible(page.getByLabel("Saldo de Caja principal"))).toHaveText("$ 0");

  await visible(page.getByRole("button", { name: "Nueva caja o cuenta" })).click();
  await page.getByRole("dialog").getByLabel("Nombre").fill("Banco Nación");
  await page.getByRole("dialog").getByRole("button", { name: "Crear" }).click();
  await expect(visible(page.getByLabel("Saldo de Banco Nación"))).toHaveText("$ 0");

  await manual(page, "Ingreso", "10.000", "Venta de llaves");
  await expect(visible(page.getByRole("row", { name: /Caja principal/ }))).toContainText("$ 10.000");
  await expect(visible(page.getByRole("row", { name: /Otros ingresos/ }))).toContainText("$ 10.000");

  await manual(page, "Egreso", "3.000", "Compra de librería");
  const expenseUrl = page.url();
  await manual(page, "Transferencia", "5.000", "Depósito en el banco", { from: "Caja principal", to: "Banco Nación" });
  await expect(visible(page.getByText("Hacia"))).toBeVisible();

  await page.goto("/caja");
  await expect(visible(page.getByLabel("Saldo de Caja principal"))).toHaveText("$ 2.000");
  await expect(visible(page.getByLabel("Saldo de Banco Nación"))).toHaveText("$ 5.000");

  // Cash book of the main box: three entries and the running balance.
  await visible(page.getByRole("link", { name: "Caja principal" })).click();
  await expect(visible(page.getByRole("row", { name: /Ingreso #\d+ · Venta de llaves/ }))).toContainText("$ 10.000");
  await expect(visible(page.getByRole("row", { name: /Egreso #\d+ · Compra de librería/ }))).toContainText("$ 7.000");
  await expect(visible(page.getByRole("row", { name: /Saldo final/ }))).toContainText("$ 2.000");

  // Annulling the expense puts the money back, with a reversal entry.
  await page.goto(expenseUrl);
  await visible(page.getByRole("button", { name: "Anular movimiento" })).click();
  await page.getByRole("dialog").getByLabel("Motivo").fill("Se cargó dos veces");
  await page.getByRole("dialog").getByRole("button", { name: "Anular movimiento" }).click();
  await expect(visible(page.getByText("Anulado: Se cargó dos veces"))).toBeVisible();
  await expect(visible(page.getByText(/Reversa del/))).toHaveCount(2);

  await page.goto("/caja");
  await expect(visible(page.getByLabel("Saldo de Caja principal"))).toHaveText("$ 5.000");

  expect(problems, "browser errors").toEqual([]);
});
