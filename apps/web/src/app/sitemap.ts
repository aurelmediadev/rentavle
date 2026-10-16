import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Public pages only; the app, the internal panel and shared documents stay out. */
export default function sitemap(): MetadataRoute.Sitemap {
  return ["/", "/precios", "/registro", "/terminos", "/privacidad"].map((path) => ({
    url: `${env.siteUrl}${path === "/" ? "" : path}`,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
