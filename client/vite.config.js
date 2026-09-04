import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
  server: {
    // Bound explicitly to IPv4: Vite's default `localhost` resolves to ::1 only
    // on some Windows setups, which leaves http://127.0.0.1:5173 unreachable to
    // tooling such as Playwright's webServer probe.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    /**
     * Proxy the API so the browser stays same-origin in development.
     *
     * Without this the client's default base URL (`/api/v1`) resolves against
     * the Vite origin and 404s. Proxying rather than pointing VITE_API_BASE_URL
     * at :5000 also means no CORS preflight and no cross-site cookie rules, so
     * the httpOnly refresh cookie behaves exactly as it will in production.
     */
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },
  // `vite preview` serves the production build. It needs the same API proxy, or
  // a preview of the built app cannot sign in and is only useful as a shell.
  preview: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5000',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
