import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    server: {
      deps: {
        // The DOCX exporter lazily imports the `buffer` polyfill as a bare
        // specifier; Node can't resolve that package's directory as ESM, so
        // let Vite process the module (as the browser bundler does).
        inline: [/@blocknote\/xl-docx-exporter/],
      },
    },
  },
});
