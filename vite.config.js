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
      entry: {
        index: resolve("src/index.ts"),
        utils: resolve("src/utils/index.ts"),
      },
      name: "grillade",
      formats: ["es"],
    },
    rolldownOptions: {
      // Exact matches only, regex eliminates all sub-paths of vue/... and @vue/... scoped packages
      external: ["documonster/excel", "vue", /^@?vue\//],
    },
  },
});
