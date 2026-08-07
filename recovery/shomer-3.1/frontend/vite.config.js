// frontend/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 3000,
    open: false, // Abre automaticamente o navegador
    cors: true,
    // Configuração de proxy detalhada
    proxy: {
      // Stream de vídeo principal
      "/video_feed": {
        target: "http://backend:8000",
        changeOrigin: true,
        secure: false,
        ws: false,
        timeout: 30000,
        headers: {
          Accept: "multipart/x-mixed-replace,image/jpeg",
        },
        configure: (proxy, options) => {
          proxy.on("error", (err, req, res) => {
            console.log("Proxy error:", err);
          });
          proxy.on("proxyReq", (proxyReq, req, res) => {
            console.log("Proxying request to:", proxyReq.path);
          });
        },
      },

      // Stream alternativo (imagem única)
      "/demo-stream.jpg": {
        target: "http://backend:8000",
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        headers: {
          Accept: "image/jpeg,image/*",
          "Cache-Control": "no-cache",
        },
      },

      // API de estatísticas
      "/stats": {
        target: "http://backend:8000",
        changeOrigin: true,
        secure: false,
        timeout: 5000,
        headers: {
          Accept: "application/json",
        },
      },

      // Export de logs
      "/export_log.csv": {
        target: "http://backend:8000",
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        headers: {
          Accept: "text/csv",
        },
      },

      // Health check
      "/health": {
        target: "http://backend:8000",
        changeOrigin: true,
        secure: false,
        timeout: 5000,
      },

      // Fallback para outras rotas da API
      "/api": {
        target: "http://backend:8000",
        changeOrigin: true,
        secure: false,
        timeout: 10000,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },

  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",
    target: "es2015",
    rollupOptions: {
      output: {
        manualChunks: {
          // Separar dependências grandes em chunks
          vendor: ["react", "react-dom"],
          motion: ["framer-motion"],
          icons: ["lucide-react"],
        },
      },
    },
    // Otimizações para produção
    chunkSizeWarningLimit: 1000,
  },

  // Configurações de preview (para testar build)
  preview: {
    host: true,
    port: 3000,
    proxy: {
      "/video_feed": "http://backend:8000",
      "/demo-stream.jpg": "http://backend:8000",
      "/stats": "http://backend:8000",
      "/export_log.csv": "http://backend:8000",
    },
  },

  // Otimizações de desenvolvimento
  optimizeDeps: {
    include: ["react", "react-dom", "framer-motion", "lucide-react", "axios"],
    exclude: [],
  },

  // Configurações de CSS
  css: {
    devSourcemap: true,
    postcss: "./postcss.config.js",
  },

  // Define para desenvolvimento
  define: {
    __DEV__: JSON.stringify(true),
    __API_URL__: JSON.stringify("http://backend:8000"),
  },
});
