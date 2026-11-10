import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Static build for hosting on a Claude artifact (claude.ai).
// Output: dist-artifact/ — publish index.html + assets/* as the artifact's files.
export default defineConfig({
  root: fileURLToPath(new URL("./artifact", import.meta.url)),
  base: "./",
  plugins: [
    react(),
    {
      // Artifact files are served from the artifact's own origin; drop `crossorigin`
      // so the browser does not demand CORS headers for them.
      name: "strip-crossorigin",
      enforce: "post",
      transformIndexHtml: (html) => html.replace(/ crossorigin/g, ""),
    },
  ],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  build: {
    outDir: fileURLToPath(new URL("./dist-artifact", import.meta.url)),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
});
