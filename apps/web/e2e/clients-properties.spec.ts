import { expect, test } from "@playwright/test";
import { createAgency, trackBrowserErrors } from "./helpers";

// Next.js 16 keeps visited pages mounted but hidden (React <Activity>), so the same
// field can exist twice in the DOM; interactions target the visible element.

test("clients and properties with co-owners", async ({ page }) => {
  const problems = trackBrowserErrors(page);
  await createAgency(page);

  // A client with an invalid CUIT is rejected, then created.
  await page.getByRole("link", { name: "Clientes" }).filter({ visible: true }).click();
  await expect(page.getByText("Todavía no cargaste clientes.")).toBeVisible();
  await page.getByRole("link", { name: "Nuevo cliente" }).filter({ visible: true }).click();
  await page.getByLabel("Nombre", { exact: true }).filter({ visible: true }).fill("Pedro");
  await page.getByLabel("Apellido", { exact: true }).filter({ visible: true }).fill("Propietario");
  await page.getByLabel("Número de documento").filter({ visible: true }).fill("30.111.222");
  await page.getByLabel("CUIT", { exact: true }).filter({ visible: true }).fill("20-12345678-5");
  await page.getByLabel("Email", { exact: true }).filter({ visible: true }).fill("pedro@example.com");
  await page.getByRole("button", { name: "Crear cliente" }).filter({ visible: true }).click();
  await expect(page.getByText("El CUIT no es válido")).toBeVisible();
  // Fields keep their values after a validation error.
  await expect(page.getByLabel("Apellido", { exact: true })).toHaveValue("Propietario");

  await page.getByLabel("CUIT", { exact: true }).filter({ visible: true }).fill("20-12345678-6");
  await page.getByRole("button", { name: "Crear cliente" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/clientes\/1$/);
  await expect(page.getByRole("heading", { name: "Pedro Propietario" })).toBeVisible();
  await expect(page.getByText("20-12345678-6")).toBeVisible();
  await expect(page.getByText("30111222")).toBeVisible();
  await expect(page.getByRole("link", { name: "pedro@example.com" })).toBeVisible();

  // Bank account.
  await page.getByLabel("Alias", { exact: true }).filter({ visible: true }).fill("pedro.cuenta");
  await page.getByRole("button", { name: "Agregar cuenta" }).filter({ visible: true }).click();
  await expect(page.getByText("Alias pedro.cuenta")).toBeVisible();

  // A company client.
  await page.goto("/clientes/nuevo");
  await page.getByRole("radio", { name: "Empresa" }).filter({ visible: true }).click();
  await page.getByLabel("Razón social").filter({ visible: true }).fill("Juana Inversiones SA");
  await page.getByRole("button", { name: "Crear cliente" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/clientes\/2$/);

  // Property with two owners at 50% each.
  await page.getByRole("link", { name: "Propiedades" }).filter({ visible: true }).click();
  await page.getByRole("link", { name: "Nueva propiedad" }).filter({ visible: true }).click();
  await page.getByRole("combobox", { name: "Propietario 1" }).filter({ visible: true }).click();
  await page.getByRole("option", { name: /Pedro Propietario/ }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Copropietario" }).filter({ visible: true }).click();
  await page.getByRole("combobox", { name: "Propietario 2" }).filter({ visible: true }).click();
  await page.getByRole("option", { name: /Juana Inversiones/ }).filter({ visible: true }).click();
  await expect(page.getByLabel("Porcentaje del propietario 1")).toHaveValue("50");
  await page.getByLabel("Calle", { exact: true }).filter({ visible: true }).fill("Calle Ficticia");
  await page.getByLabel("Número", { exact: true }).filter({ visible: true }).fill("100");
  await page.getByLabel("Piso / depto").filter({ visible: true }).fill("2B");
  await page.getByRole("button", { name: "Crear propiedad" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/propiedades\/1$/);
  await expect(page.getByRole("heading", { name: /Calle Ficticia 100 2B/ })).toBeVisible();
  await expect(page.getByText("50%")).toHaveCount(2);

  // Editing with a total different from 100% is rejected.
  await page.getByRole("link", { name: "Editar" }).filter({ visible: true }).click();
  await page.getByLabel("Porcentaje del propietario 1").filter({ visible: true }).fill("70");
  await page.getByLabel("Porcentaje del propietario 2").filter({ visible: true }).fill("40");
  await page.getByRole("button", { name: "Guardar cambios" }).filter({ visible: true }).click();
  await expect(page.getByText("Los porcentajes deben sumar 100% (suman 110%)")).toBeVisible();
  await page.getByLabel("Porcentaje del propietario 2").filter({ visible: true }).fill("30");
  await page.getByRole("button", { name: "Guardar cambios" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/propiedades\/1$/);
  await expect(page.getByText("70%")).toBeVisible();

  // The owner's page lists the property; search finds clients.
  await page.getByRole("link", { name: "Pedro Propietario" }).filter({ visible: true }).click();
  await expect(page.getByRole("link", { name: /Calle Ficticia 100 2B/ })).toBeVisible();
  await page.goto("/clientes");
  await page.getByRole("searchbox").filter({ visible: true }).fill("juana");
  await expect(page.getByRole("link", { name: "Juana Inversiones SA" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Pedro Propietario" })).toHaveCount(0);

  expect(problems, "browser errors").toEqual([]);
});
