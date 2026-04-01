import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@novelforge/domain": path.resolve(
        __dirname,
        "../../packages/domain/src/index.ts",
      ),
      "@novelforge/analysis": path.resolve(
        __dirname,
        "../../packages/analysis/src/index.ts",
      ),
      "@novelforge/test-fixtures": path.resolve(
        __dirname,
        "../../packages/test-fixtures/src/index.ts",
      ),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  clearScreen: false,
});
