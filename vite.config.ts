import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon-source.svg", "icons/*.png", "generated/**/*"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,jpg,jpeg,webp,json}"],
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html"
      },
      manifest: {
        name: "Practice Quiz",
        short_name: "Quiz",
        lang: "el",
        description: "Κουίζ εξάσκησης χωρίς λογαριασμό",
        theme_color: "#173f35",
        background_color: "#f4f1e8",
        display: "standalone",
        start_url: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      }
    })
  ]
});
