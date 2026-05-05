/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["Mulish", "sans-serif"] },
      colors: {
        edp: {
          bg:      "#212E3E",   // fundo principal
          navy:    "#212E3E",   // azul padrão
          blue:    "#212E3E",   // azul EDP (botões, destaques)
          card:    "#FFFFFF",   // painéis brancos
          surface: "#EEF3FB",   // superfície clara
          border:  "#C8D8EE",   // bordas nos painéis brancos
          dark:    "#212E3E",   // header
          red:     "#E30613",   // vermelho EDP
          green:   "#00A651",   // verde estado
          muted:   "#7A94C1",   // texto secundário no fundo escuro
          sub:     "#64748B",   // texto secundário nos painéis brancos
          text:    "#001540",   // texto principal nos painéis brancos
        },
      },
    },
  },
  plugins: [],
};
