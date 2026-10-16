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
  const page = await browser.newPage({ baseURL });
  try {
    await createAgency(page);
    for (const route of ROUTES) {
      await page.goto(route, { timeout: 120_000 });
      await page.waitForLoadState("networkidle", { timeout: 120_000 });
    }
  } finally {
    await browser.close();
  }
}
