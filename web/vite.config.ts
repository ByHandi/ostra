import { tanstackRouter } from "@tanstack/router-plugin/vite";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const controlUrl = loadEnv(mode, process.cwd(), "").CONTROL_URL || "http://127.0.0.1:8080";

  return {
    plugins: [
      // Must come before @vitejs/plugin-react.
      tanstackRouter({
        target: "react",
        autoCodeSplitting: true,
        quoteStyle: "double",
        semicolons: true,
      }),
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // The control-plane embeds this directory (go:embed) and serves it on the console domain.
    // A subdirectory on purpose: emptyOutDir wipes it on every build, while the tracked
    // dist/.gitkeep one level up keeps go:embed compiling on a fresh clone.
    build: {
      outDir: "../control/internal/ui/dist/web",
      emptyOutDir: true,
    },
    // Same-origin in dev too: the refresh cookie is scoped to /api/auth on this origin.
    server: {
      proxy: {
        "/api": { target: controlUrl, changeOrigin: true },
      },
    },
  };
});
