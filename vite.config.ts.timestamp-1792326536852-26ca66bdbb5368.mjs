// vite.config.ts
import { defineConfig } from "file:///F:/EchoSelf/node_modules/vite/dist/node/index.js";
import react from "file:///F:/EchoSelf/node_modules/@vitejs/plugin-react/dist/index.mjs";
import { fileURLToPath, URL } from "node:url";
import { copyFileSync } from "node:fs";
var __vite_injected_original_import_meta_url = "file:///F:/EchoSelf/vite.config.ts";
var vite_config_default = defineConfig({
  plugins: [
    react(),
    {
      // Static hosts without SPA rewrite support serve 404s on deep links
      // (/memories, /memory/<id>, ...). Emitting a 404.html that loads the app
      // covers GitHub Pages-style hosts; most hosts (Netlify, Vercel, Bolt)
      // already fall back to index.html.
      name: "spa-fallback",
      closeBundle() {
        copyFileSync("dist/index.html", "dist/404.html");
      }
    }
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", __vite_injected_original_import_meta_url))
    }
  },
  optimizeDeps: {
    exclude: ["lucide-react"]
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJGOlxcXFxFY2hvU2VsZlwiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9maWxlbmFtZSA9IFwiRjpcXFxcRWNob1NlbGZcXFxcdml0ZS5jb25maWcudHNcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfaW1wb3J0X21ldGFfdXJsID0gXCJmaWxlOi8vL0Y6L0VjaG9TZWxmL3ZpdGUuY29uZmlnLnRzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnIH0gZnJvbSAndml0ZSc7XHJcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XHJcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGgsIFVSTCB9IGZyb20gJ25vZGU6dXJsJztcclxuaW1wb3J0IHsgY29weUZpbGVTeW5jIH0gZnJvbSAnbm9kZTpmcyc7XHJcblxyXG4vLyBodHRwczovL3ZpdGVqcy5kZXYvY29uZmlnL1xyXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xyXG4gIHBsdWdpbnM6IFtcclxuICAgIHJlYWN0KCksXHJcbiAgICB7XHJcbiAgICAgIC8vIFN0YXRpYyBob3N0cyB3aXRob3V0IFNQQSByZXdyaXRlIHN1cHBvcnQgc2VydmUgNDA0cyBvbiBkZWVwIGxpbmtzXHJcbiAgICAgIC8vICgvbWVtb3JpZXMsIC9tZW1vcnkvPGlkPiwgLi4uKS4gRW1pdHRpbmcgYSA0MDQuaHRtbCB0aGF0IGxvYWRzIHRoZSBhcHBcclxuICAgICAgLy8gY292ZXJzIEdpdEh1YiBQYWdlcy1zdHlsZSBob3N0czsgbW9zdCBob3N0cyAoTmV0bGlmeSwgVmVyY2VsLCBCb2x0KVxyXG4gICAgICAvLyBhbHJlYWR5IGZhbGwgYmFjayB0byBpbmRleC5odG1sLlxyXG4gICAgICBuYW1lOiAnc3BhLWZhbGxiYWNrJyxcclxuICAgICAgY2xvc2VCdW5kbGUoKSB7XHJcbiAgICAgICAgY29weUZpbGVTeW5jKCdkaXN0L2luZGV4Lmh0bWwnLCAnZGlzdC80MDQuaHRtbCcpO1xyXG4gICAgICB9LFxyXG4gICAgfSxcclxuICBdLFxyXG4gIHJlc29sdmU6IHtcclxuICAgIGFsaWFzOiB7XHJcbiAgICAgICdAJzogZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuL3NyYycsIGltcG9ydC5tZXRhLnVybCkpLFxyXG4gICAgfSxcclxuICB9LFxyXG4gIG9wdGltaXplRGVwczoge1xyXG4gICAgZXhjbHVkZTogWydsdWNpZGUtcmVhY3QnXSxcclxuICB9LFxyXG59KTtcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUF1TixTQUFTLG9CQUFvQjtBQUNwUCxPQUFPLFdBQVc7QUFDbEIsU0FBUyxlQUFlLFdBQVc7QUFDbkMsU0FBUyxvQkFBb0I7QUFIb0csSUFBTSwyQ0FBMkM7QUFNbEwsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUztBQUFBLElBQ1AsTUFBTTtBQUFBLElBQ047QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLE1BS0UsTUFBTTtBQUFBLE1BQ04sY0FBYztBQUNaLHFCQUFhLG1CQUFtQixlQUFlO0FBQUEsTUFDakQ7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUFBLEVBQ0EsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxjQUFjLElBQUksSUFBSSxTQUFTLHdDQUFlLENBQUM7QUFBQSxJQUN0RDtBQUFBLEVBQ0Y7QUFBQSxFQUNBLGNBQWM7QUFBQSxJQUNaLFNBQVMsQ0FBQyxjQUFjO0FBQUEsRUFDMUI7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
