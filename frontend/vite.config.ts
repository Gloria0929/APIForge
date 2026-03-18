import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      checks: { pluginTimings: false },
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("element-plus")) return "element-plus";
            if (id.includes("monaco-editor")) return "monaco";
            if (id.includes("echarts")) return "echarts";
            if (id.includes("vue") || id.includes("pinia")) return "vue-vendor";
            if (id.includes("axios") || id.includes("marked")) return "libs";
          }
        },
      },
    },
    // Element Plus 全量导入约 950KB，无法进一步拆分；可按需引入以减小体积
    chunkSizeWarningLimit: 1100,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Backend NestJS listens on :3000 and exposes routes under /api/*
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
