import { expect, test } from "@playwright/test";
import { createAgency, trackBrowserErrors } from "./helpers";

const visible = <T extends { filter(opts: { visible: boolean }): T }>(locator: T) => locator.filter({ visible: true });

test("first steps: checklist, sample agency with demo data, delete it, hide the checklist", async ({ page }) => {
  const problems = trackBrowserErrors(page);
  const { name } = await createAgency(page);

  await expect(visible(page.getByText("0 de 5 listos", { exact: false }))).toBeVisible();
  await expect(visible(page.getByRole("link", { name: "Primer contrato" }))).toBeVisible();

  // Completing a step ticks it.
  await page.goto("/configuracion/inmobiliaria");
  await visible(page.getByLabel("Razón social")).fill("Demo Propiedades S.R.L.");
  await visible(page.getByLabel("Domicilio")).fill("Av. Corrientes 1234, CABA");
  await visible(page.getByRole("button", { name: "Guardar" })).click();
  await expect(visible(page.getByText(/Datos guardados/))).toBeVisible();
  await page.goto("/panel");
  await expect(visible(page.getByRole("link", { name: "Datos de la inmobiliaria (listo)" }))).toBeVisible();
  await expect(visible(page.getByText("1 de 5 listos", { exact: false }))).toBeVisible();

  // Sample agency: demo data in a separate agency.
  await visible(page.getByRole("button", { name: "Probar con datos de ejemplo" })).click();
  await expect(visible(page.getByText("Inmobiliaria de ejemplo.", { exact: false }))).toBeVisible();
  await expect(visible(page.getByRole("heading", { name: `Ejemplo · ${name}` }))).toBeVisible();
  await expect(visible(page.getByLabel("Contratos activos"))).toHaveText("3");
  await expect(visible(page.getByRole("row", { name: /Gurruchaga 1456/ }))).toBeVisible();

  // The real agency stays empty; deleting the sample goes back to it.
  await visible(page.getByRole("button", { name: "Borrar la inmobiliaria de ejemplo" })).click();
  await expect(visible(page.getByRole("heading", { name }))).toBeVisible();
  await expect(visible(page.getByText("1 de 5 listos", { exact: false }))).toBeVisible();
  await expect(visible(page.getByRole("button", { name: "Probar con datos de ejemplo" }))).toBeVisible();

  await visible(page.getByRole("button", { name: "Ocultar" })).click();
  await expect(visible(page.getByText("Primeros pasos"))).toHaveCount(0);

  expect(problems, "browser errors").toEqual([]);
});
