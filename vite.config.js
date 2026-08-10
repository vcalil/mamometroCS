import { defineConfig } from "vite";

// Projeto na raiz: index.html é a entrada. Build sai em dist/.
// public/onboard.html é copiado as-is pelo Vite pra dist/ — é a página ATIVA de
// onboarding self-serve (o server.js injeta a config do Firebase nela ao servir).
export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
