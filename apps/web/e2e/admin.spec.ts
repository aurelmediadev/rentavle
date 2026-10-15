import { expect, test } from "@playwright/test";
import { createAgency, grantPlatformAdmin, trackBrowserErrors } from "./helpers";

const visible = <T extends { filter(opts: { visible: boolean }): T }>(locator: T) => locator.filter({ visible: true });

test("internal panel: only staff, gives a pilot free access with a logged reason", async ({ page, browser }) => {
  const problems = trackBrowserErrors(page);

  // An agency's admin who isn't staff gets a 404.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await createAgency(otherPage);
  // Streaming already sent 200: what matters is that nothing of the panel shows.
  await otherPage.goto("/admin");
  await expect(otherPage.getByText("This page could not be found.")).toBeVisible();
  await expect(otherPage.getByText("Organizaciones")).toHaveCount(0);
  await other.close();

  const { email, name } = await createAgency(page);
  await grantPlatformAdmin(email);

  await page.goto(`/admin?q=${encodeURIComponent(name)}`);
  const row = visible(page.getByRole("row", { name: new RegExp(name) }));
  await expect(row).toContainText("Prueba");
  await row.getByRole("link", { name }).click();
  await expect(page).toHaveURL(/\/admin\/organizaciones\/[0-9a-f-]{36}$/);
  await expect(visible(page.getByText("0 de 10"))).toBeVisible();

  // Pilot: active, no plan (free, unlimited). The reason is required.
  await visible(page.getByRole("combobox", { name: "Estado" })).click();
  await page.getByRole("option", { name: "Activa" }).click();
  await visible(page.getByLabel("Motivo")).fill("Piloto: 6 meses sin cargo");
  await visible(page.getByRole("button", { name: "Guardar cambios" })).click();
  await expect(visible(page.getByText("Acceso actualizado"))).toBeVisible();
  await expect(visible(page.getByText("0 (sin límite)"))).toBeVisible();
  await expect(visible(page.getByRole("list", { name: "Historial de cambios" }))).toContainText("Piloto: 6 meses sin cargo");

  // The agency sees it on its subscription page.
  await page.goto("/suscripcion");
  await expect(visible(page.getByText("Acceso sin cargo (inmobiliaria piloto)."))).toBeVisible();
  await expect(visible(page.getByLabel("Uso del plan"))).toHaveText("0 contratos activos");

  expect(problems, "browser errors").toEqual([]);
});
