"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <Button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle h-[42px] w-[42px] rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--panel)_82%,transparent)] p-0 text-[var(--text)] shadow-none transition-[transform,background-color] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:rotate-12 hover:scale-105 hover:bg-[var(--panel-strong)] hover:opacity-100"
      aria-label={`Switch to ${nextTheme} theme`}
      title={`Switch to ${nextTheme} theme`}
    >
      {theme === "dark" ? (
        <Sun className="h-[18px] w-[18px]" aria-hidden="true" />
      ) : (
        <Moon className="h-[18px] w-[18px]" aria-hidden="true" />
      )}
    </Button>
  );
}
