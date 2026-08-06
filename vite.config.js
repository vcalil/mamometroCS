import { defineConfig } from "vite";

// Projeto na raiz: index.html e a entrada. Build sai em dist/.
// (onboard.html e' standalone em public/, copy as-is pelo Vite, sem
// build entry proprio — eh o backup/legacy com HTML+CSS+JS inline.)
export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
