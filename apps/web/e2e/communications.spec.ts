import { randomUUID } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { createAgency, trackBrowserErrors } from "./helpers";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";
const visible = <T extends { filter(opts: { visible: boolean }): T }>(locator: T) => locator.filter({ visible: true });

async function pick(page: Page, combobox: string, option: RegExp) {
  await visible(page.getByRole("combobox", { name: combobox })).click();
  await page.getByRole("option", { name: option }).click();
}

interface MailpitMessage {
  Subject: string;
  Text: string;
  To: { Address: string }[];
  Bcc: { Address: string }[];
  Attachments: { FileName: string; ContentType: string }[];
}

async function latestEmailTo(address: string): Promise<MailpitMessage> {
  let message: MailpitMessage | undefined;
  await expect
    .poll(async () => {
      const list = (await (await fetch(`${MAILPIT_URL}/api/v1/search?query=to:${encodeURIComponent(address)}`)).json()) as { messages: { ID: string }[] };
      if (!list.messages[0]) return false;
      message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${list.messages[0].ID}`)).json()) as MailpitMessage;
      return true;
    }, { timeout: 15_000 })
    .toBe(true);
  return message!;
}

test("communications: receipt by email and WhatsApp, history and message settings", async ({ page, context }) => {
  const problems = trackBrowserErrors(page);
  const id = randomUUID().slice(0, 8);
  const tenantEmail = `ana-${id}@e2e.rentavle.local`;
  const agencyEmail = `copia-${id}@e2e.rentavle.local`;
  await createAgency(page);

  await page.goto("/configuracion/inmobiliaria");
  await visible(page.getByLabel("Email", { exact: true })).fill(agencyEmail);
  await visible(page.getByRole("button", { name: "Guardar" })).click();
  await expect(visible(page.getByText(/Datos guardados/))).toBeVisible();

  await page.goto("/clientes/nuevo");
  await visible(page.getByLabel("Nombre", { exact: true })).fill("Pedro");
  await visible(page.getByLabel("Apellido", { exact: true })).fill("Propietario");
  await visible(page.getByRole("button", { name: "Crear cliente" })).click();
  await expect(page).toHaveURL(/\/clientes\/\d+$/);
  await page.goto("/clientes/nuevo");
  await visible(page.getByLabel("Nombre", { exact: true })).fill("Ana");
  await visible(page.getByLabel("Apellido", { exact: true })).fill("Inquilina");
  await visible(page.getByLabel("Email", { exact: true })).fill(tenantEmail);
  await visible(page.getByLabel("Teléfono", { exact: true })).fill("11 5555-1234");
  await visible(page.getByRole("button", { name: "Crear cliente" })).click();
  await expect(page).toHaveURL(/\/clientes\/\d+$/);

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

  await page.goto("/contratos/1/cobrar");
  await expect(visible(page.getByRole("checkbox", { name: /Cobrar Alquiler/ }))).toHaveCount(1);
  await visible(page.getByRole("button", { name: "Registrar cobro" })).click();
  await expect(page).toHaveURL(/\/movimientos\/\d+/);

  // Email: PDF attached, public link in the text, hidden copy to the agency.
  await visible(page.getByRole("button", { name: "Enviar por email" })).click();
  const emailDialog = page.getByRole("dialog");
  await expect(emailDialog.getByRole("checkbox", { name: new RegExp(tenantEmail) })).toBeChecked();
  await expect(emailDialog.getByLabel("Mensaje")).toHaveValue(/te enviamos el recibo N° 00000001/i);
  await emailDialog.getByRole("button", { name: "Enviar" }).click();
  await expect(page.getByText(`Enviado a ${tenantEmail}`)).toBeVisible();

  const email = await latestEmailTo(tenantEmail);
  expect(email.Subject).toMatch(/^Recibo N° 00000001 - Inmobiliaria E2E/);
  expect(email.Text).toMatch(/http:\/\/localhost:3000\/d\/[A-Za-z0-9_-]+/);
  expect(email.Attachments).toEqual([expect.objectContaining({ FileName: "recibo-00000001.pdf", ContentType: "application/pdf" })]);
  expect(email.Bcc.map((b) => b.Address)).toEqual([agencyEmail]);
  const link = email.Text.match(/http:\/\/localhost:3000\/d\/[A-Za-z0-9_-]+/)![0];
  expect((await page.request.get(link)).headers()["content-type"]).toBe("application/pdf");

  // WhatsApp: opens wa.me with the message, recorded in the history.
  await context.route("https://wa.me/**", (route) => route.fulfill({ body: "WhatsApp" }));
  await visible(page.getByRole("button", { name: "WhatsApp" })).click();
  await expect(page.getByRole("dialog").getByText("(+5491155551234)")).toBeVisible();
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("dialog").getByRole("button", { name: "Abrir WhatsApp" }).click();
  const popup = await popupPromise;
  await popup.waitForURL(/^https:\/\/wa\.me\/5491155551234\?text=/);
  expect(decodeURIComponent(popup.url())).toMatch(/recibo N° 00000001 por \$\s[\d.]+ del pago del \d+ de \w+ de \d{4}: http\S+\/d\//);
  await popup.close();

  await page.reload();
  await expect(visible(page.getByRole("listitem", { name: `Recibo de pago a ${tenantEmail}` }))).toContainText("Enviado");
  await expect(visible(page.getByRole("listitem", { name: "Recibo de pago a +5491155551234" }))).toContainText("Abierto en WhatsApp");
  await page.goto("/contratos/1");
  await expect(visible(page.getByRole("listitem", { name: /^Recibo de pago a / }))).toHaveCount(2);

  // Message settings: own text (with a variable check) and automatic notices.
  await page.goto("/configuracion/mensajes");
  await visible(page.getByRole("button", { name: "Editar Recibo de pago" })).click();
  const templateDialog = page.getByRole("dialog");
  await templateDialog.getByLabel("Asunto del email").fill("Tu recibo {{NUMERO}} {{INVENTADA}}");
  await templateDialog.getByRole("button", { name: "Guardar" }).click();
  await expect(templateDialog.getByText(/Variables que no existen para este mensaje: \{\{INVENTADA\}\}/)).toBeVisible();
  await templateDialog.getByLabel("Asunto del email").fill("Tu recibo {{NUMERO}}");
  await templateDialog.getByRole("button", { name: "Guardar" }).click();
  await expect(visible(page.getByRole("row", { name: /Recibo de pago/ }))).toContainText("Personalizado");

  await visible(page.getByRole("checkbox", { name: /Recordatorio de pago/ })).check();
  await visible(page.getByLabel("Días de atraso")).fill("2, 7");
  await visible(page.getByRole("button", { name: "Guardar avisos" })).click();
  await expect(visible(page.getByText("Avisos guardados"))).toBeVisible();
  await page.reload();
  await expect(visible(page.getByRole("checkbox", { name: /Recordatorio de pago/ }))).toBeChecked();
  await expect(visible(page.getByLabel("Días de atraso"))).toHaveValue("2, 7");

  expect(problems, "browser errors").toEqual([]);
});
