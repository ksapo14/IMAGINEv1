import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IMAGINEv1",
  description: "Real-time pitch deck for educator speech to visuals"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
