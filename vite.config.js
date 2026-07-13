import { defineConfig } from "vite";

// Projeto na raiz: index.html é a entrada. Build sai em dist/.
export default defineConfig({
  root: ".",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
