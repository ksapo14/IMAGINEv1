import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/site-origin";

const publicRoutes = ["", "/product", "/about", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();

  return publicRoutes.map((route) => ({
    url: `${origin}${route}`,
    changeFrequency: "monthly",
    priority: route === "" ? 1 : 0.7
  }));
}
