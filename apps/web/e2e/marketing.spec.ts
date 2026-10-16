import { expect, test } from "@playwright/test";
import { trackBrowserErrors } from "./helpers";

test("public site: landing, prices from the database, legal pages and SEO files", async ({ page }) => {
  const problems = trackBrowserErrors(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rentavle cobra, actualiza, liquida y avisa por vos.");
  await expect(page.getByLabel("Ejemplo de cobro")).toContainText("14 días de mora × 0,5% × $ 500.000");
  await page.getByText("¿Necesito tarjeta para la prueba?").click();
  await expect(page.getByText(/La prueba dura 21 días con hasta 10 contratos/)).toBeVisible();

  await page.getByRole("navigation").getByRole("link", { name: "Precios" }).click();
  await expect(page).toHaveURL(/\/precios$/);
  for (const [plan, price] of [["Inicial", "35.000"], ["Profesional", "59.000"], ["Corporativo", "89.000"]]) {
    await expect(page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: plan }) })).toContainText(new RegExp(`\\$\\s${price.replace(".", "\\.")}`));
  }
  await expect(page.getByText(/\+100 contratos por \$\s15\.000 por mes/)).toBeVisible();

  await page.getByRole("contentinfo").getByRole("link", { name: "Términos y condiciones" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Términos y condiciones");
  await expect(page.getByRole("note")).toContainText("Borrador");
  await page.goto("/privacidad");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Política de privacidad");

  // Signing up says what you accept.
  await page.goto("/registro");
  await expect(page.getByRole("link", { name: "términos y condiciones" })).toHaveAttribute("href", "/terminos");

  const robots = await (await page.request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /d/");
  expect(robots).toContain("Disallow: /admin");
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await page.request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("/precios</loc>");
  expect(sitemap).not.toContain("/panel");

  expect(problems, "browser errors").toEqual([]);
});
