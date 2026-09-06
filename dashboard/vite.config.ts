import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    fs: {
      // the embedded terminal imports the canonical CLI core from ../src/cli
      allow: [fileURLToPath(new URL(".", import.meta.url)), fileURLToPath(new URL("../src", import.meta.url))],
    },
    proxy: {
      "/keeperhub": {
        target: "https://app.keeperhub.com",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/keeperhub/, ""),
      },
    },
  },
});
