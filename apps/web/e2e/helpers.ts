import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { expect, type Page } from "@playwright/test";

// Local Supabase catches all auth emails in Mailpit (supabase/config.toml, [local_smtp]).
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:55324";

/** Password used for every throwaway e2e account; local database only. */
export const E2E_PASSWORD = "rentavle-e2e-local";

export function uniqueEmail(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8)}@e2e.rentavle.local`;
}

/** A valid, random company CUIT (prefix 30), unique enough per run. */
export function randomCuit(): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const body = `30${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const total = weights.reduce((acc, w, i) => acc + w * Number(body[i]), 0);
  const raw = 11 - (total % 11);
  const check = raw === 11 ? 0 : raw === 10 ? 9 : raw;
  return `${body}${check}`;
}

interface MailpitSummary {
  ID: string;
  To: { Address: string }[];
}

/** Waits for the newest email sent to `address` and returns its first matching link. */
export async function linkFromEmail(address: string, pattern: RegExp): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const list = (await (await fetch(`${MAILPIT_URL}/api/v1/search?query=to:${encodeURIComponent(address)}`)).json()) as {
          messages: MailpitSummary[];
        };
        const latest = list.messages[0];
        if (!latest) return false;
        const message = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${latest.ID}`)).json()) as { HTML: string };
        const href = [...message.HTML.matchAll(/href="([^"]+)"/g)]
          .map((m) => m[1]!.replaceAll("&amp;", "&"))
          .find((h) => pattern.test(h));
        link = href;
        return Boolean(href);
      },
      { timeout: 15_000, message: `no email with a matching link for ${address}` },
    )
    .toBe(true);
  return link!;
}

export async function signUpAndConfirm(page: Page, opts: { firstName: string; email: string; next?: string }) {
  await page.goto(opts.next ? `/registro?next=${encodeURIComponent(opts.next)}` : "/registro");
  await page.getByLabel("Nombre", { exact: true }).fill(opts.firstName);
  await page.getByLabel("Apellido").fill("Prueba");
  await page.getByLabel("Email").fill(opts.email);
  await page.getByLabel("Contraseña").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByText(`Te enviamos un email a ${opts.email}`)).toBeVisible();

  await page.goto(await linkFromEmail(opts.email, /verify/));
}

/** Collects browser errors (including Next.js dev validation) to assert none happened. */
export function trackBrowserErrors(page: Page): string[] {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  return problems;
}

/** Signs up a new admin and creates their agency; leaves the page on /panel. */
export async function createAgency(page: Page, name = `Inmobiliaria E2E ${Date.now()}`) {
  const email = uniqueEmail("admin");
  await signUpAndConfirm(page, { firstName: "Ana", email });
  await expect(page).toHaveURL(/\/bienvenida/);
  await page.getByLabel("Nombre de la inmobiliaria").fill(name);
  await page.getByLabel("CUIT").fill(randomCuit());
  await page.getByRole("button", { name: "Empezar" }).click();
  await expect(page).toHaveURL(/\/panel/);
  return { email, name };
}

/** Makes a user Rentavle staff (internal panel). Local database only, like the CLI command. */
export async function grantPlatformAdmin(email: string) {
  const sql = postgres(process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55322/postgres", { prepare: false });
  try {
    await sql`insert into public.platform_admins (user_id) select id from auth.users where email = ${email} on conflict do nothing`;
  } finally {
    await sql.end();
  }
}
