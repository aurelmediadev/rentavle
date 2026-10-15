import { expect, type Page, test } from "@playwright/test";
import { createAgency, trackBrowserErrors } from "./helpers";

const visible = <T extends { filter(opts: { visible: boolean }): T }>(locator: T) => locator.filter({ visible: true });

// 1×1 transparent PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

async function pick(page: Page, combobox: string, option: RegExp) {
  await visible(page.getByRole("combobox", { name: combobox })).click();
  await page.getByRole("option", { name: option }).click();
}

async function expectPdf(response: { status(): number; headers(): Record<string, string>; body(): Promise<Buffer> }) {
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toBe("application/pdf");
  expect((await response.body()).subarray(0, 5).toString()).toBe("%PDF-");
}

test("documents: agency data and branding, receipt PDF, public link and void", async ({ page, browser }) => {
  const problems = trackBrowserErrors(page);
  await createAgency(page);

  // Agency data and logo printed on documents.
  await page.goto("/configuracion/inmobiliaria");
  await visible(page.getByLabel("Razón social")).fill("Demo Propiedades S.R.L.");
  await visible(page.getByLabel("Domicilio")).fill("Av. Corrientes 1234, CABA");
  await visible(page.getByRole("button", { name: "Guardar" })).click();
  await expect(visible(page.getByText(/Datos guardados/))).toBeVisible();
  await visible(page.getByLabel("Archivo de logo")).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
  await visible(page.getByRole("button", { name: "Subir logo" })).click();
  await expect(visible(page.getByRole("img", { name: "Logo" }))).toBeVisible();

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

  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  await page.goto("/contratos/nuevo?propiedad=1");
  await pick(page, "Inquilino 1", /Ana Inquilina/);
  await visible(page.getByLabel("Inicio")).fill(month);
  await visible(page.getByRole("button", { name: "2 años" })).click();
  await visible(page.getByLabel("Monto inicial del alquiler")).fill("500.000");
  await visible(page.getByLabel("Porcentaje sobre lo cobrado")).fill("10");
  await visible(page.getByRole("combobox", { name: "Índice" })).click();
  await visible(page.getByRole("option", { name: "Sin actualización" })).click();
  await visible(page.getByRole("button", { name: "Crear contrato" })).click();
  await expect(page).toHaveURL(/\/contratos\/1$/);

  // Collecting issues receipt #1.
  await page.goto("/contratos/1/cobrar");
  await expect(visible(page.getByRole("checkbox", { name: /Cobrar Alquiler/ }))).toHaveCount(1);
  await visible(page.getByRole("button", { name: "Registrar cobro" })).click();
  await expect(page).toHaveURL(/\/movimientos\/\d+/);
  await expect(visible(page.getByText("Recibo N° 00000001"))).toBeVisible();

  const pdfHref = await visible(page.getByRole("link", { name: "Ver PDF" })).getAttribute("href");
  await expectPdf(await page.request.get(pdfHref!));
  await expectPdf(await page.request.get(`${pdfHref}?formato=media`));

  // A public link works without a session; a made-up one doesn't.
  await visible(page.getByRole("button", { name: "Copiar link para compartir" })).click();
  const shareUrl = await visible(page.getByLabel("Link para compartir")).inputValue();
  expect(shareUrl).toMatch(/\/d\/[A-Za-z0-9_-]+$/);
  const anonymous = await browser.newContext();
  await expectPdf(await anonymous.request.get(shareUrl));
  expect((await anonymous.request.get(shareUrl.replace(/[^/]+$/, "inventado-inventado-inventado"))).status()).toBe(404);
  // Internal PDFs need a session.
  expect((await anonymous.request.get(new URL(pdfHref!, shareUrl).toString(), { maxRedirects: 0 })).status()).not.toBe(200);
  await anonymous.close();

  // Annulling the payment voids the receipt; it stays available, marked as void.
  await visible(page.getByRole("button", { name: "Anular cobro" })).click();
  await page.getByRole("dialog").getByLabel("Motivo").fill("Error de carga");
  await page.getByRole("dialog").getByRole("button", { name: "Anular cobro" }).click();
  await expect(visible(page.getByText("Anulado: Error de carga"))).toBeVisible();
  await page.reload();
  await expect(visible(page.getByText("Recibo N° 00000001"))).toBeVisible();
  await expect(visible(page.getByText("Anulado", { exact: true }))).toHaveCount(2);
  await expectPdf(await page.request.get(pdfHref!));

  expect(problems, "browser errors").toEqual([]);
});
