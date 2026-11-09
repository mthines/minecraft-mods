import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// npm run web:dev: the page on :5173, with /api going to ./mc web on :8080.
export default defineConfig({ root: "web", plugins: [react()], build: { outDir: "dist", emptyOutDir: true }, server: { host: true, proxy: { "/api": "http://localhost:8080" } } });
