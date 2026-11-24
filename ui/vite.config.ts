import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** Where `agentree serve` listens; the development server passes `/api` on to it as the daemon's own page would ask. */
const DAEMON = process.env.AGENTREE_DAEMON ?? "http://127.0.0.1:4517";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: DAEMON, headers: { origin: DAEMON } } },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
});
