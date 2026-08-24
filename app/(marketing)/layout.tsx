import type { Metadata } from "next";
import "lenis/dist/lenis.css";
import { MarketingMotionBoundary } from "@/components/marketing/motion-boundary";
import { MarketingSmoothScroll } from "@/components/marketing/smooth-scroll";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

export const metadata: Metadata = {
  title: {
    default: "Imagine | Visual support that follows the lesson",
    template: "%s | Imagine"
  },
  description:
    "Imagine interprets finalized teaching speech against saved lesson context and a cumulative live whiteboard.",
  openGraph: {
    title: "Imagine | Visual support that follows the lesson",
    description:
      "Save lesson context, teach naturally, and build a cumulative live whiteboard.",
    type: "website"
  },
  twitter: {
    card: "summary",
    title: "Imagine | Visual support that follows the lesson",
    description:
      "Save lesson context, teach naturally, and build a cumulative live whiteboard."
  }
};

export default function MarketingLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="marketing-root">
      <MarketingSmoothScroll />
      <a href="#main-content" className="marketing-skip-link">
        Skip to content
      </a>
      <SiteHeader />
      <MarketingMotionBoundary>{children}</MarketingMotionBoundary>
      <SiteFooter />
    </div>
  );
}
