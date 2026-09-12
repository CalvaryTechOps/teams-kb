import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    // Reuse workers across test files instead of spawning one per file.
    // Trade-off: mocks registered with `vi.mock` and module-level state are
    // no longer reset between files that share a worker. The suite passes
    // with `--maxWorkers=1 --sequence.shuffle.files` (every file in one
    // registry, random order), so nothing depends on isolation today; if a
    // test starts failing only in the full run, try `--isolate` first.
    isolate: false,
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
