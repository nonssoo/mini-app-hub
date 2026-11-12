import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      includeAssets: ["petal.svg"],
      manifest: {
        name: "Petal — your cycle, your notes",
        short_name: "Petal",
        description: "A private period and cycle tracker that runs on your device.",
        theme_color: "#fbf5f7",
        background_color: "#fbf5f7",
        display: "standalone",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "petal.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{html,js,css,svg,webmanifest}"],
        maximumFileSizeToCacheInBytes: 16 * 1024 * 1024,
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 7000,
  },
});
