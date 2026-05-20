/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Mulish", "sans-serif"] },
      colors: {
        edp: {
          // ── Marine Blue (fundo principal e headers) ─────────────────────────
          navy:    "#212E3E",   // Marine Blue primário
          navy2:   "#424D5B",   // Marine Blue 2
          navy3:   "#646D78",   // Marine Blue 3
          navy4:   "#90979F",   // Marine Blue 4

          // ── Electric Green (acento em fundo escuro) ─────────────────────────
          green:   "#28FF52",   // Electric Green — indicadores de estado activo
          green2:  "#7EFF97",
          green3:  "#A9FFBA",
          green4:  "#D4FFDD",

          // ── Seaweed Green (semântico em fundo claro) ───────────────────────
          seaweed: "#225E66",   // texto/badge em cards brancos
          seaweed2:"#43767D",
          seaweed3:"#648E94",
          seaweed4:"#91AFB3",

          // ── Cobalt Blue (elementos interactivos) ───────────────────────────
          cobalt:  "#263CC8",
          cobalt2: "#4759D0",
          cobalt3: "#7D8ADE",
          cobalt4: "#A8B1E9",

          // ── Semânticos ─────────────────────────────────────────────────────
          red:     "#E32C2C",   // vermelho EDP
          red2:    "#EDD5D3",
          yellow:  "#F7D200",   // aviso
          yellow2: "#FFF1BE",

          // ── Neutros (do claro para o escuro) ──────────────────────────────
          text:    "#222222",   // texto primário
          sub:     "#455558",   // texto secundário
          slate:   "#7C9599",   // Slate Grey 1
          slate2:  "#90A5A8",
          slate3:  "#A3B5B8",
          slate4:  "#BECACC",
          n7:      "#D7DFE0",   // bordas
          n8:      "#E6EBEC",   // superfície
          n9:      "#F1F4F4",   // fundo muito claro

          // ── Aliases de compatibilidade ─────────────────────────────────────
          bg:      "#212E3E",
          card:    "#FFFFFF",
          border:  "#D7DFE0",
          surface: "#E6EBEC",
          muted:   "#7C9599",
        },
      },
    },
  },
  plugins: [],
};
