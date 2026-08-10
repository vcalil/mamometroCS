import { defineConfig } from "vite";

// Duas entradas: index.html (SPA) e onboard.html (página self-serve de onboarding).
// Ambas são bundladas pelo Vite — o onboard.html importa os módulos compartilhados
// (onboard-core/onboard-guide) e recebe a config do Firebase via %VITE_FIREBASE_*%
// no build (mesma fonte do SPA; não precisa mais de injeção no server.js).
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
