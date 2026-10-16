import { expect, type Page, test } from "@playwright/test";
import { createAgency, trackBrowserErrors } from "./helpers";

const visible = <T extends { filter(opts: { visible: boolean }): T }>(locator: T) => locator.filter({ visible: true });
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function pick(page: Page, combobox: string, option: RegExp) {
  await visible(page.getByRole("combobox", { name: combobox })).click();
  await page.getByRole("option", { name: option }).click();
}

test("attachments and contract conditions: signed contract, payment receipt, edit fees and due day", async ({ page }) => {
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

  // The signed contract, uploaded straight to Storage and downloadable.
  await visible(page.getByLabel("Adjuntar a archivos del contrato")).setInputFiles({ name: "Contrato firmado.pdf", mimeType: "application/pdf", buffer: PDF });
  const list = visible(page.getByRole("list", { name: "Archivos del contrato" }));
  await expect(list).toContainText("Contrato firmado.pdf");
  const href = await list.getByRole("link", { name: /Contrato firmado\.pdf/ }).getAttribute("href");
  const download = await page.request.get(href!);
  expect(download.status()).toBe(200);
  expect((await download.body()).subarray(0, 5).toString()).toBe("%PDF-");

  // Wrong type is refused before uploading.
  await visible(page.getByLabel("Adjuntar a archivos del contrato")).setInputFiles({ name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ") });
  await expect(page.getByText(/virus\.exe: Solo PDF, imágenes/)).toBeVisible();

  // Edit conditions: logged in the history.
  await visible(page.getByRole("button", { name: "Editar condiciones" })).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Porcentaje sobre lo cobrado").fill("8");
  await dialog.getByLabel("Día de vencimiento").fill("5");
  await dialog.getByLabel("Motivo del cambio").fill("Acuerdo con el propietario");
  await dialog.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Condiciones actualizadas")).toBeVisible();
  await page.reload();
  await expect(visible(page.getByText(/Contrato editado · honorarios, día de vencimiento/))).toBeVisible();
  await expect(visible(page.getByText("Acuerdo con el propietario"))).toBeVisible();

  // A payment receipt on the movement; deleting it.
  await page.goto("/contratos/1/cobrar");
  await expect(visible(page.getByRole("checkbox", { name: /Cobrar Alquiler/ }))).toHaveCount(1);
  await visible(page.getByRole("button", { name: "Registrar cobro" })).click();
  await expect(page).toHaveURL(/\/movimientos\/\d+/);
  await visible(page.getByLabel("Adjuntar a comprobantes")).setInputFiles({ name: "transferencia.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgo=", "base64") });
  await expect(visible(page.getByRole("list", { name: "Comprobantes" }))).toContainText("transferencia.png");
  page.once("dialog", (d) => void d.accept());
  await visible(page.getByRole("button", { name: "Borrar transferencia.png" })).click();
  await expect(visible(page.getByText("Sin archivos.", { exact: false }))).toBeVisible();

  expect(problems, "browser errors").toEqual([]);
});
