import { expect, test } from "@playwright/test";
import { E2E_PASSWORD, randomCuit, signUpAndConfirm, uniqueEmail } from "./helpers";

test("an agency signs up, creates its organization and invites an operator", async ({ browser }) => {
  const adminEmail = uniqueEmail("admin");
  const operatorEmail = uniqueEmail("operador");
  const agencyName = `Inmobiliaria E2E ${Date.now()}`;

  // 1. The admin signs up and confirms the email.
  const admin = await browser.newPage();
  const problems: string[] = [];
  admin.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  admin.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  await signUpAndConfirm(admin, { firstName: "Ana", email: adminEmail });

  // 2. Onboarding: create the organization.
  await expect(admin).toHaveURL(/\/bienvenida/);
  await admin.getByLabel("Nombre de la inmobiliaria").fill(agencyName);
  await admin.getByLabel("CUIT").fill("20-12345678-5");
  await admin.getByRole("button", { name: "Empezar" }).click();
  await expect(admin.getByText("El CUIT no es válido")).toBeVisible();

  await admin.getByLabel("CUIT").fill(randomCuit());
  await admin.getByRole("button", { name: "Empezar" }).click();
  await expect(admin).toHaveURL(/\/panel/);
  await expect(admin.getByRole("heading", { name: agencyName })).toBeVisible();
  await expect(admin.getByText(/Prueba gratis · 2[01] días/)).toBeVisible();

  // 3. Invite an operator and grab the link.
  await admin.getByRole("link", { name: "Usuarios" }).click();
  await admin.getByLabel("Email").fill(operatorEmail);
  await admin.getByRole("button", { name: "Invitar" }).click();
  const invitationLink = await admin.getByLabel("Link de invitación").inputValue();
  expect(invitationLink).toMatch(/\/invitacion\//);
  await expect(admin.getByRole("cell", { name: operatorEmail })).toBeVisible();

  // 4. The operator opens the link in another browser, signs up and accepts.
  const operatorContext = await browser.newContext();
  const operator = await operatorContext.newPage();
  const invitationPath = new URL(invitationLink).pathname;
  await signUpAndConfirm(operator, { firstName: "Oscar", email: operatorEmail, next: invitationPath });
  await expect(operator).toHaveURL(new RegExp(invitationPath));
  await operator.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(operator).toHaveURL(/\/panel/);
  await expect(operator.getByRole("heading", { name: agencyName })).toBeVisible();

  // 5. Operators see the team but cannot invite.
  await operator.getByRole("link", { name: "Usuarios" }).click();
  await expect(operator.getByRole("cell", { name: /Ana Prueba/ })).toBeVisible();
  await expect(operator.getByRole("button", { name: "Invitar" })).toHaveCount(0);

  // 6. The admin sees the new member; sign out and back in works.
  await admin.reload();
  await expect(admin.getByRole("cell", { name: /Oscar Prueba/ })).toBeVisible();
  await admin.getByRole("button", { name: /Ana Prueba/ }).click();
  await admin.getByRole("menuitem", { name: "Cerrar sesión" }).click();
  await expect(admin).toHaveURL(/\/ingresar/);

  await admin.goto("/panel");
  await expect(admin).toHaveURL(/\/ingresar\?next=%2Fpanel/);
  await admin.getByLabel("Email").fill(adminEmail);
  await admin.getByLabel("Contraseña").fill(E2E_PASSWORD);
  await admin.getByRole("button", { name: "Ingresar" }).click();
  await expect(admin).toHaveURL(/\/panel/);
  await expect(admin.getByRole("heading", { name: agencyName })).toBeVisible();

  await operatorContext.close();
  expect(problems, "browser errors on the admin page").toEqual([]);
});
