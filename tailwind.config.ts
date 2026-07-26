import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        border: "hsl(var(--border))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))"
      },
      keyframes: {
        "diagram-enter": {
          from: { opacity: "0", transform: "translateY(0.5rem)" },
          to: { opacity: "1", transform: "translateY(0)" }
        },
        "route-progress": {
          from: { transform: "scaleX(0.2)" },
          to: { transform: "scaleX(1)" }
        },
        "core-breathe": {
          "0%, 100%": { opacity: "0.5", transform: "scale(0.92)" },
          "50%": { opacity: "1", transform: "scale(1.16)" }
        },
        "inline-signal": {
          from: { transform: "scaleY(0.55)" },
          to: { transform: "scaleY(1)" }
        },
        "journey-spin": {
          to: { transform: "rotate(360deg)" }
        },
        "journey-wave": {
          from: { transform: "scaleY(0.34)" },
          to: { transform: "scaleY(1)" }
        },
        "listen-pulse": {
          "0%, 100%": {
            opacity: "0.72",
            transform: "translate(-50%, -50%) scale(0.92)"
          },
          "50%": {
            opacity: "1",
            transform: "translate(-50%, -50%) scale(1.08)"
          }
        },
        "reason-turn": {
          to: { transform: "translate(-50%, -50%) rotate(360deg)" }
        },
        "reason-node": {
          from: { transform: "translate3d(0, 0, 0) scale(0.88)" },
          to: {
            transform:
              "translate3d(var(--node-x), var(--node-y), 0) scale(1.12)"
          }
        },
        "draw-stroke": {
          "0%, 8%": { opacity: "0.2", transform: "scaleX(0)" },
          "34%, 78%": { opacity: "1", transform: "scaleX(1)" },
          "100%": { opacity: "0.22", transform: "scaleX(1)" }
        },
        "draw-node": {
          "0%, 18%": { opacity: "0", transform: "scale(0)" },
          "42%, 82%": { opacity: "1", transform: "scale(1)" },
          "100%": { opacity: "0.22", transform: "scale(1)" }
        },
        "draw-tool": {
          "0%": {
            opacity: "0",
            transform: "translate3d(-340px, 50px, 0) rotate(-18deg)"
          },
          "18%": { opacity: "1" },
          "78%": {
            opacity: "1",
            transform: "translate3d(0, 340px, 0) rotate(12deg)"
          },
          "100%": {
            opacity: "0",
            transform: "translate3d(30px, 360px, 0) rotate(18deg)"
          }
        },
        "room-board-pulse": {
          from: { transform: "translate(-50%, -50%) scale(0.96)" },
          to: { transform: "translate(-50%, -50%) scale(1.04)" }
        },
        "room-speak": {
          "0%, 8%": {
            opacity: "0",
            transform: "translate3d(-50%, 16px, 0) scale(0.5)"
          },
          "18%, 38%": {
            opacity: "1",
            transform: "translate3d(-50%, 0, 0) scale(1)"
          },
          "52%, 100%": {
            opacity: "0",
            transform: "translate3d(-50%, -24px, 0) scale(0.72)"
          }
        },
        "map-pulse": {
          "0%": {
            opacity: "0.9",
            transform: "translate(-50%, -50%) scale(0.72)"
          },
          "100%": {
            opacity: "0",
            transform: "translate(-50%, -50%) scale(1.2)"
          }
        }
      },
      animation: {
        "diagram-enter":
          "diagram-enter 420ms cubic-bezier(0.22, 1, 0.36, 1) both",
        "route-progress":
          "route-progress 900ms cubic-bezier(0.16, 1, 0.3, 1) infinite alternate",
        "core-breathe":
          "core-breathe 2.8s cubic-bezier(0.37, 0, 0.63, 1) infinite",
        "inline-signal":
          "inline-signal 1.6s cubic-bezier(0.37, 0, 0.63, 1) infinite alternate",
        "journey-spin-reverse": "journey-spin 24s linear infinite reverse",
        "journey-wave":
          "journey-wave 1.15s cubic-bezier(0.37, 0, 0.63, 1) infinite alternate",
        "listen-pulse":
          "listen-pulse 2.2s cubic-bezier(0.37, 0, 0.63, 1) infinite",
        "reason-turn": "reason-turn 8s linear infinite",
        "reason-node":
          "reason-node 2.8s cubic-bezier(0.37, 0, 0.63, 1) infinite alternate",
        "draw-stroke":
          "draw-stroke 4.6s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        "draw-node":
          "draw-node 4.6s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        "draw-tool":
          "draw-tool 4.6s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        "room-board-pulse":
          "room-board-pulse 2.8s cubic-bezier(0.37, 0, 0.63, 1) infinite alternate",
        "room-speak":
          "room-speak 4.8s cubic-bezier(0.16, 1, 0.3, 1) infinite",
        "map-pulse": "map-pulse 2.6s ease-out infinite"
      }
    }
  },
  plugins: []
};

export default config;
