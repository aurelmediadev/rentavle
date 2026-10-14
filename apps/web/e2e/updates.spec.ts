import { expect, type Page, test } from "@playwright/test";
import { createAgency, trackBrowserErrors } from "./helpers";

// Requires IPC values in the local database (`pnpm --filter @rentavle/jobs fetch-indexes`).

const visible = <T extends { filter(opts: { visible: boolean }): T }>(locator: T) => locator.filter({ visible: true });

function monthStart(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

async function pick(page: Page, combobox: string, option: RegExp) {
  await visible(page.getByRole("combobox", { name: combobox })).click();
  await page.getByRole("option", { name: option }).click();
}

test("quarterly IPC update is calculated, shown in the report and can be adjusted", async ({ page }) => {
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

  // Quarterly IPC contract that started three months ago, registered from its first month:
  // its second period starts this month and must be updated.
  const start = monthStart(-3);
  await page.goto("/contratos/nuevo?propiedad=1");
  await pick(page, "Inquilino 1", /Ana Inquilina/);
  await visible(page.getByLabel("Inicio")).fill(start.toISOString().slice(0, 10));
  await visible(page.getByRole("button", { name: "2 años" })).click();
  await visible(page.getByLabel("Primer mes a registrar")).fill(start.toISOString().slice(0, 7));
  await visible(page.getByLabel(/Monto vigente en/)).fill("400.000");
  await visible(page.getByRole("combobox", { name: "Frecuencia" })).click();
  await visible(page.getByRole("option", { name: "Trimestral", exact: true })).click();
  await visible(page.getByLabel("Porcentaje sobre lo cobrado")).fill("10");
  await visible(page.getByRole("button", { name: "Crear contrato" })).click();
  await expect(page).toHaveURL(/\/contratos\/1$/);

  // The report lists it; recalculating uses the published IPC.
  await visible(page.getByRole("link", { name: "Actualizaciones" })).click();
  await expect(visible(page.getByRole("link", { name: /#1 · Calle Ficticia/ }))).toBeVisible();
  await visible(page.getByRole("button", { name: "Recalcular" })).click();
  await expect(visible(page.getByText("Actualizado")).first()).toBeVisible();
  await expect(visible(page.getByRole("cell", { name: "$ 400.000" }))).toBeVisible();

  // The contract shows where the number comes from.
  await page.goto("/contratos/1");
  await expect(visible(page.getByText(/IPC .* → .*/)).first()).toBeVisible();

  // Manual adjustment wins over the calculation.
  await visible(page.getByRole("button", { name: "Ajustar monto del período 2" })).click();
  await page.getByRole("dialog").getByLabel("Nuevo monto").fill("450.000");
  await page.getByRole("dialog").getByLabel("Motivo").fill("Acuerdo entre las partes");
  await page.getByRole("dialog").getByRole("button", { name: "Guardar monto" }).click();
  await expect(visible(page.getByText("Ajustado a mano"))).toBeVisible();
  await expect(visible(page.getByText("$ 450.000")).first()).toBeVisible();

  await page.goto("/contratos/actualizaciones");
  await visible(page.getByRole("button", { name: "Recalcular" })).click();
  await expect(visible(page.getByText("Ajustado a mano"))).toBeVisible();

  // Index page shows the official values.
  await visible(page.getByRole("link", { name: "Índices" })).click();
  await expect(visible(page.getByText(/IPC \(Índice de Precios al Consumidor\)/))).toBeVisible();
  await expect(visible(page.getByText("Fuente: INDEC"))).toBeVisible();

  expect(problems, "browser errors").toEqual([]);
});
