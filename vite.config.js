import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import dts from "unplugin-dts/vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  plugins: [vue(), dts({ bundleTypes: true })],
  build: {
    target: "esnext",
    emptyOutDir: true,
    lib: {
      entry: resolve("src/index.ts"),
      name: "grillade",
      fileName: "grillade",
      formats: ["es"],
    },
    rolldownOptions: {
      external: ["documonster/excel", "vue", "vue-router"],
    },
  },
});
