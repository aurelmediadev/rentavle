import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

// The app needs a session anyway; shared documents (/d/) must never be indexed.
const PRIVATE = [
  "/d/",
  "/api/",
  "/admin",
  "/panel",
  "/contratos",
  "/clientes",
  "/propiedades",
  "/movimientos",
  "/liquidaciones",
  "/caja",
  "/indices",
  "/configuracion",
  "/suscripcion",
  "/bienvenida",
  "/invitacion",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: PRIVATE },
    sitemap: `${env.siteUrl}/sitemap.xml`,
  };
}
