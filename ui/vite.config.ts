import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  /** Where `agentree serve` listens; the development server passes `/api` on to it as the daemon's own page would ask. */
  const daemon = loadEnv(mode, ".", "AGENTREE_").AGENTREE_DAEMON ?? "http://127.0.0.1:4517";
  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: { "/api": { target: daemon, headers: { origin: daemon } } },
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      strictPort: true,
    },
  };
});
