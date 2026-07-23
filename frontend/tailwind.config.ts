import type { Config } from "tailwindcss";
// @ts-expect-error - tailwindcss-rtl has no bundled types
import rtl from "tailwindcss-rtl";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--color-bg)",
        foreground: "var(--color-fg)",
        secondary: "var(--color-secondary)",
        card: "var(--color-card)",
        border: "var(--color-border)",
        muted: "var(--color-muted)",
        surface: "var(--color-surface)",

        // Brand navy (darb-branding/index.html v1.0). The mark was recoloured
        // from forest to navy and sand with a yellow dot; the product follows.
        primary: {
          DEFAULT: "#1D4E89",
          hover: "#163C6E",
          soft: "#F5F8FD",
          ring: "rgba(29, 78, 137, 0.18)",
        },

        /**
         * The `forest` scale is kept under its old name on purpose: it is used
         * in ~40 places across the dashboard and renaming it here would be a
         * mechanical churn commit on top of a visual one. The values are navy.
         * 300 is the brand's yellow accent, matching --forest-300 in the
         * guidelines, which is what carries the dot and the on-dark highlight.
         */
        forest: {
          50: "#F2F6FC",
          100: "#DBE7F5",
          200: "#B7CDEA",
          300: "#F5C518",
          400: "#5E93D6",
          500: "#3B6FB0",
          600: "#1D4E89",
          700: "#163C6E",
          800: "#0B1F3C",
          900: "#0A1220",
        },

        /** The brand's yellow: the sun in the mark, and the full stop. */
        dot: "#F5C518",

        sand: {
          50: "#FBFAF8",
          100: "#F6F5F3",
          200: "#EDEAE5",
          300: "#E4E0DC",
          400: "#C5BBB1",
          500: "#A99E92",
          600: "#8A7E72",
          700: "#625E5B",
          800: "#4A4744",
          900: "#302E2D",
        },

        clay: "#C57B59",
        moss: "#468254",
        slate2: "#27455C",
        linkBlue: "#3860BE",

        keeta: "#FFB800",
        talabat: "#FF5A00",
        deliveroo: "#00CCBC",
        americana: "#0066FF",
      },
      fontFamily: {
        sans: [
          '"SF Pro Display"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"Almarai"',
          "system-ui",
          "sans-serif",
        ],
        display: [
          '"SF Pro Display"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"Almarai"',
          "system-ui",
          "sans-serif",
        ],
        // Arabic is Almarai only. No CDN fallback chain: the face is self-hosted,
        // so either it loads or we want the system default, not a silent swap.
        arabic: [
          '"Almarai"',
          "system-ui",
          "sans-serif",
        ],
      },
      fontSize: {
        "display-2xl": ["80px", { lineHeight: "84px", letterSpacing: "-0.03em", fontWeight: "400" }],
        "display-xl": ["65px", { lineHeight: "72px", letterSpacing: "-0.02em", fontWeight: "400" }],
        "display-lg": ["48px", { lineHeight: "54px", letterSpacing: "-0.02em", fontWeight: "400" }],
        "display-md": ["36px", { lineHeight: "42px", letterSpacing: "-0.015em", fontWeight: "400" }],
        "display-sm": ["28px", { lineHeight: "34px", letterSpacing: "-0.01em", fontWeight: "400" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "8px",
        md: "10px",
        lg: "12px",
        xl: "16px",
        "2xl": "24px",
        "3xl": "32px",
        pill: "9999px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15, 31, 24, 0.04), 0 2px 8px rgba(15, 31, 24, 0.05)",
        lift: "0 2px 4px rgba(15, 31, 24, 0.04), 0 16px 40px rgba(15, 31, 24, 0.08)",
        float: "0 28px 34px rgba(15, 79, 138, 0.08), 0 75px 63px rgba(15, 79, 138, 0.06), 0 180px 84px rgba(15, 79, 138, 0.04)",
        ring: "0 0 0 3px rgba(29, 78, 137, 0.18)",
      },
      backgroundImage: {
        "hero-veil": "linear-gradient(180deg, rgba(11,31,60,0) 0%, rgba(11,31,60,0.65) 100%)",
        "sand-gradient": "linear-gradient(180deg, #F6F5F3 0%, #EDEAE5 100%)",
        "forest-gradient": "linear-gradient(180deg, #0B1F3C 0%, #0A1220 100%)",
      },
      transitionTimingFunction: {
        "sierra-out": "cubic-bezier(0.22, 1, 0.36, 1)",
        "sierra-inout": "cubic-bezier(0.65, 0, 0.35, 1)",
      },
      transitionDuration: {
        250: "250ms",
        400: "400ms",
        600: "600ms",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.4s ease both",
      },
    },
  },
  plugins: [rtl],
};
export default config;
