import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Live Canvas | Imagine v1",
  description:
    "Speak or type an idea and turn it into structured notes, diagrams, and visual explanations."
};

export default function CanvasLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return children;
}
