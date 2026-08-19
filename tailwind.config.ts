import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Geist est chargée via next/font/local (app/layout.tsx) en variables
      // CSS (--font-geist-sans/--font-geist-mono) — jusqu'ici jamais
      // branchées à Tailwind, donc jamais réellement appliquées (le site
      // tournait sur la pile système par défaut de Preflight). Ce mapping
      // fait que `font-sans` (et donc Preflight lui-même) utilise Geist.
      fontFamily: {
        sans: ["var(--font-geist-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      // Vert de marque : plus profond/désaturé que l'emerald par défaut de
      // Tailwind (600 par défaut = #059669, assez vif) — vise un rendu plus
      // "corporate/premium" qu'"app fitness". brand-600 est la couleur
      // principale ; les composants partagés (components/ui/*) l'utilisent
      // désormais à la place d'emerald-* brut.
      colors: {
        brand: {
          50: "#EBF9F3",
          100: "#D3F0E4",
          200: "#A8DFCB",
          300: "#6FC4A9",
          400: "#3AA487",
          500: "#14876B",
          600: "#0D6E4E", // couleur de marque principale
          700: "#0A5740",
          800: "#084433",
          900: "#063329",
        },
        // Direction visuelle "Ledger" (nouvelle identité, cf. audit
        // design/UX) : palette additive, namespacée pour ne rien casser du
        // thème brand/slate actuel tant que les pages n'ont pas migré.
        // Esthétique "manifeste douanier / carte d'embarquement" — surface
        // crème neutre, hairlines plutôt qu'ombres, ambre réservé aux
        // montants/gains uniquement (jamais une couleur de bouton générique).
        ledger: {
          surface: "#FAFAF7",
          line: "#E3E0D6",
          ink: "#10231D",
          "ink-soft": "#1B332B",
          amber: "#C6862A",
          text: "#1A1A17",
          muted: "#7A7669",
        },
      },
      // Ombres plus douces/diffuses que shadow-sm/shadow-md par défaut — la
      // profondeur vient de l'ombre, la bordure reste quasi invisible
      // (cf. Card). "soft-lg" = état survolé des surfaces interactives.
      boxShadow: {
        soft: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)",
        "soft-lg": "0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 6px -2px rgb(15 23 42 / 0.05)",
      },
      // Rayon quasi carré propre à Ledger, distinct de rounded-lg/xl
      // utilisés par le thème actuel.
      borderRadius: {
        ledger: "3px",
      },
    },
  },
  plugins: [],
};
export default config;
