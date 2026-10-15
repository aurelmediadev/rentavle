import { expect, test } from "@playwright/test";
import { createAgency, trackBrowserErrors } from "./helpers";

const visible = <T extends { filter(opts: { visible: boolean }): T }>(locator: T) => locator.filter({ visible: true });

// Runs against the local MercadoPago simulator (no MERCADOPAGO_ACCESS_TOKEN).
test("subscription: trial, subscribe through the payment simulator, cancel to read-only, export", async ({ page }) => {
  const problems = trackBrowserErrors(page);
  await createAgency(page);

  await page.goto("/suscripcion");
  await expect(visible(page.getByText("Prueba gratis", { exact: true })).first()).toBeVisible();
  await expect(visible(page.getByLabel("Uso del plan"))).toHaveText("0 de 10 contratos activos");
  await expect(visible(page.getByRole("button", { name: "Elegir plan Inicial" }))).toBeVisible();

  // Yearly Inicial: 10 months.
  await visible(page.getByRole("radio", { name: /Anual/ })).click();
  await expect(visible(page.getByText(/^\$\s350\.000$/))).toBeVisible();
  await visible(page.getByRole("button", { name: "Elegir plan Inicial" })).click();
  await expect(page).toHaveURL(/\/suscripcion\/simulador\/sim_/);
  await expect(visible(page.getByText(/Plan Inicial/))).toBeVisible();
  await visible(page.getByRole("button", { name: "Aprobar débito" })).click();

  await expect(page).toHaveURL(/\/suscripcion\?volver=1/);
  await expect(visible(page.getByText(/^Plan Inicial\s*Activa/))).toBeVisible();
  await expect(visible(page.getByLabel("Uso del plan"))).toHaveText("0 de 40 contratos activos");
  await expect(visible(page.getByText(/Próximo débito: .* · \$\s350\.000/))).toBeVisible();

  // Cancelling leaves the account read-only: nothing new can be saved.
  await visible(page.getByRole("button", { name: "Cancelar suscripción" })).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar suscripción" }).click();
  await expect(visible(page.getByRole("alert").filter({ hasText: "Tu suscripción no está activa" }))).toBeVisible();

  await page.goto("/clientes/nuevo");
  await visible(page.getByLabel("Nombre", { exact: true })).fill("Ana");
  await visible(page.getByLabel("Apellido", { exact: true })).fill("Bloqueada");
  await visible(page.getByRole("button", { name: "Crear cliente" })).click();
  await expect(visible(page.getByText(/modo solo lectura/))).toBeVisible();

  // Exporting still works.
  const response = await page.request.get("/api/exportar");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-disposition"]).toMatch(/attachment; filename="rentavle-\d{4}-\d{2}-\d{2}\.json"/);
  const data = (await response.json()) as { inmobiliaria: { subscriptionStatus: string }; clientes: unknown[] };
  expect(data.inmobiliaria.subscriptionStatus).toBe("cancelled");
  expect(data.clientes).toEqual([]);

  expect(problems, "browser errors").toEqual([]);
});
