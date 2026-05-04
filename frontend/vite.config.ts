import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",    // accesible desde otros equipos de la red
    port: 3000,
    proxy: {
      "/api": "http://localhost:8000",
      "/ws":  { target: "ws://localhost:8000", ws: true },
    },
  },
});
