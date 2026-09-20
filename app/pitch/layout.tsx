import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pitch Mode | Imagine v1",
  description: "Present the Imagineer deck with semantic slide navigation.",
  robots: { index: false, follow: false }
};

export default function PitchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
