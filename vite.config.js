import { defineConfig } from "vite";

// Duas entries: index.html (SPA principal) e onboard.html (mesma SPA,
// mesmo bundle, so' URL diferente). Vite gera 2 HTML files em dist/
// mas o JS bundle (assets/index-XXXX.js) e' compartilhado entre os dois
// via chunks compartilhados — zero duplicacao de codigo.
export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "index.html",
        onboard: "onboard.html",
      },
    },
  },
});
