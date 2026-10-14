import { expect, type Page, test } from "@playwright/test";
import { createAgency, trackBrowserErrors } from "./helpers";

// Next.js keeps visited pages mounted but hidden: act on visible elements only.
const visible = <T extends { filter(opts: { visible: boolean }): T }>(locator: T) => locator.filter({ visible: true });

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** First day of the month `offset` months from now (UTC). */
function monthStart(offset: number) {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
}

async function createClient(page: Page, firstName: string, lastName: string) {
  await page.goto("/clientes/nuevo");
  await visible(page.getByLabel("Nombre", { exact: true })).fill(firstName);
  await visible(page.getByLabel("Apellido", { exact: true })).fill(lastName);
  await visible(page.getByRole("button", { name: "Crear cliente" })).click();
  await expect(page).toHaveURL(/\/clientes\/\d+$/);
}

async function pick(page: Page, combobox: string, option: RegExp) {
  await visible(page.getByRole("combobox", { name: combobox })).click();
  await page.getByRole("option", { name: option }).click();
}

test("contracts: in-progress creation, overlap guard, extension, termination and renewal", async ({ page }) => {
  const problems = trackBrowserErrors(page);
  await createAgency(page);

  await createClient(page, "Pedro", "Propietario");
  await createClient(page, "Ana", "Inquilina");
  await createClient(page, "Gabriel", "Garante");

  await page.goto("/propiedades/nueva");
  await pick(page, "Propietario 1", /Pedro Propietario/);
  await visible(page.getByLabel("Calle", { exact: true })).fill("Calle Ficticia");
  await visible(page.getByLabel("Número", { exact: true })).fill("100");
  await visible(page.getByRole("button", { name: "Crear propiedad" })).click();
  await expect(page).toHaveURL(/\/propiedades\/1$/);

  // A contract that started six months ago and lasts three years.
  const start = monthStart(-6);
  await visible(page.getByRole("link", { name: "Nuevo contrato" })).click();
  await expect(visible(page.getByRole("combobox", { name: "Propiedad" }))).toContainText("Calle Ficticia 100");
  await pick(page, "Inquilino 1", /Ana Inquilina/);
  await visible(page.getByRole("button", { name: "Garante" })).click();
  await pick(page, "Garante 1", /Gabriel Garante/);
  await visible(page.getByLabel("Inicio")).fill(isoDate(start));
  await visible(page.getByRole("button", { name: "3 años" })).click();
  await expect(visible(page.getByText("Duración: 3 años"))).toBeVisible();
  await expect(visible(page.getByText("Contrato en curso"))).toBeVisible();
  await visible(page.getByLabel(/Monto vigente en/)).fill("500.000");
  await visible(page.getByLabel("Porcentaje sobre lo cobrado")).fill("10");
  // Semiannual IPC: the period containing the current month uses the typed amount.
  await expect(visible(page.getByRole("cell", { name: "Monto inicial" }))).toBeVisible();
  await expect(visible(page.getByRole("cell", { name: "No registrado" }))).toBeVisible();
  await visible(page.getByRole("button", { name: "Crear contrato" })).click();

  await expect(page).toHaveURL(/\/contratos\/1$/);
  await expect(visible(page.getByText("$ 500.000")).first()).toBeVisible();
  await expect(visible(page.getByText(/IPC .* Semestral/))).toBeVisible();
  await expect(visible(page.getByText("Contrato creado"))).toBeVisible();
  await expect(visible(page.getByRole("link", { name: "Gabriel Garante" }))).toBeVisible();
  await expect(visible(page.getByRole("cell", { name: "A actualizar" })).first()).toBeVisible();

  // The property is now rented and shows the contract.
  await page.goto("/propiedades/1");
  await expect(visible(page.getByText("Alquilada")).first()).toBeVisible();
  await expect(visible(page.getByRole("link", { name: /#1 · Ana Inquilina/ }))).toBeVisible();

  // A second overlapping contract on the same property is rejected.
  await page.goto("/contratos/nuevo?propiedad=1");
  await pick(page, "Inquilino 1", /Ana Inquilina/);
  await visible(page.getByLabel("Inicio")).fill(isoDate(monthStart(1)));
  await visible(page.getByRole("button", { name: "1 año" })).click();
  await visible(page.getByLabel("Monto inicial del alquiler")).fill("600000");
  await visible(page.getByLabel("Porcentaje sobre lo cobrado")).fill("10");
  await visible(page.getByRole("button", { name: "Crear contrato" })).click();
  await expect(visible(page.getByText("La propiedad ya tiene un contrato activo en esas fechas"))).toBeVisible();

  // Extension by one year.
  await page.goto("/contratos/1");
  const originalEnd = new Date(Date.UTC(start.getUTCFullYear() + 3, start.getUTCMonth(), 0));
  const extendedEnd = new Date(Date.UTC(start.getUTCFullYear() + 4, start.getUTCMonth(), 0));
  await visible(page.getByRole("button", { name: "Prorrogar" })).click();
  await page.getByRole("dialog").getByLabel("Nueva fecha de fin").fill(isoDate(extendedEnd));
  await page.getByRole("dialog").getByLabel("Motivo (opcional)").fill("Acuerdo de partes");
  await page.getByRole("dialog").getByRole("button", { name: "Prorrogar" }).click();
  await expect(visible(page.getByText("Acuerdo de partes"))).toBeVisible();
  await expect(visible(page.getByText(/4 años, 48 cuotas/))).toBeVisible();

  // Early termination, then undo it.
  const terminationEnd = new Date(Date.UTC(start.getUTCFullYear() + 2, start.getUTCMonth(), 0));
  await visible(page.getByRole("button", { name: "Rescindir" })).click();
  await page.getByRole("dialog").getByLabel("Fecha de fin (rescisión)").fill(isoDate(terminationEnd));
  await page.getByRole("dialog").getByRole("button", { name: "Registrar rescisión" }).click();
  await expect(visible(page.getByText("Con rescisión"))).toBeVisible();
  await expect(visible(page.getByText(/2 años, 24 cuotas/))).toBeVisible();

  page.once("dialog", (d) => d.accept());
  await visible(page.getByRole("button", { name: "Anular rescisión" })).click();
  await expect(visible(page.getByText(/4 años, 48 cuotas/))).toBeVisible();
  await expect(visible(page.locator("main ol > li").filter({ hasText: "Rescisión anulada" }))).toBeVisible();

  // Renewal: starts the day after the end, keeps people and conditions.
  await visible(page.getByRole("link", { name: "Renovar" })).click();
  await expect(visible(page.getByText("Renovación del contrato #1"))).toBeVisible();
  await expect(visible(page.getByLabel("Inicio"))).toHaveValue(
    isoDate(new Date(Date.UTC(extendedEnd.getUTCFullYear(), extendedEnd.getUTCMonth(), extendedEnd.getUTCDate() + 1))),
  );
  await expect(visible(page.getByRole("combobox", { name: "Inquilino 1" }))).toContainText("Ana Inquilina");
  await visible(page.getByRole("button", { name: "2 años" })).click();
  await visible(page.getByLabel("Monto inicial del alquiler")).fill("900000");
  await visible(page.getByRole("button", { name: "Crear renovación" })).click();
  await expect(page).toHaveURL(/\/contratos\/2$/);
  await expect(visible(page.getByRole("link", { name: "contrato #1" }))).toBeVisible();

  await page.goto("/contratos/1");
  await expect(visible(page.getByText("Renovado")).first()).toBeVisible();
  await expect(visible(page.getByRole("link", { name: "contrato #2" }))).toBeVisible();

  void originalEnd;
  expect(problems, "browser errors").toEqual([]);
});
