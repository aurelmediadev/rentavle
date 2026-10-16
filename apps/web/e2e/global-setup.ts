import { chromium, type FullConfig } from "@playwright/test";
import { createAgency } from "./helpers";

// The dev server compiles each route on its first visit (several seconds each).
// Without this, the first tests of a run time out while Next compiles; signed in,
// because the proxy sends anonymous visitors to the login before any page compiles.
const ROUTES = [
  "/panel",
  "/clientes",
  "/clientes/nuevo",
  "/propiedades/nueva",
  "/contratos",
  "/contratos/nuevo",
  "/caja",
  "/movimientos",
  "/liquidaciones",
  "/configuracion/inmobiliaria",
  "/configuracion/mensajes",
  "/configuracion/usuarios",
  "/suscripcion",
  "/admin",
  "/precios",
];

export default async function globalSetup(config: FullConfig) {
  const { baseURL, channel } = config.projects[0]!.use;
  const browser = await chromium.launch({ channel });
  let page = await browser.newPage({ baseURL });
  try {
    // Public pages first; then sign up (its expects use the 5 s default here, so a
    // cold first attempt may time out: the second one finds everything compiled).
    for (const route of ["/", "/registro", "/ingresar"]) await page.goto(route, { timeout: 120_000 });
    try {
      await createAgency(page);
    } catch {
      page = await browser.newPage({ baseURL });
      await createAgency(page);
    }
    for (const route of ROUTES) {
      await page.goto(route, { timeout: 120_000 });
      await page.waitForLoadState("networkidle", { timeout: 120_000 });
    }
  } finally {
    await browser.close();
  }
}
