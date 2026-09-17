import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { getSiteOrigin } from "@/lib/site-origin";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteOrigin()),
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
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
