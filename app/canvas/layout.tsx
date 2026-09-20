import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pitch Mode | Imagine v1",
  description:
    "Continue to the Imagineer presentation workspace.",
  robots: {
    index: false,
    follow: false
  }
};

export default function CanvasLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
