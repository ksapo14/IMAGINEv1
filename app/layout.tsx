import type { Metadata } from "next";
import "lenis/dist/lenis.css";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  title: "Imagine v1 by Imagineer | Speak ideas into view",
  description:
    "Turn speech and typed prompts into structured notes, diagrams, and visual explanations in one live learning canvas.",
  openGraph: {
    title: "Imagine v1 by Imagineer | Speak ideas into view",
    description:
      "Turn speech and typed prompts into structured notes, diagrams, and visual explanations."
  },
  twitter: {
    card: "summary",
    title: "Imagine v1 by Imagineer | Speak ideas into view",
    description:
      "Turn speech and typed prompts into structured notes, diagrams, and visual explanations."
  },
  icons: {
    icon: "/brand/imagineer-shortform.png",
    apple: "/brand/imagineer-shortform.png"
  }
};

const themeScript = `
  (() => {
    try {
      const saved = localStorage.getItem("imagine-theme");
      const theme = saved === "light" || saved === "dark"
        ? saved
        : (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.colorScheme = theme;
    } catch (_) {}
  })();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
