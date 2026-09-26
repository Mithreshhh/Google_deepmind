import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// .env lives in the project root so server and client share one file.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '..', '');
  const apiPort = env.PORT || 5000;
  return {
    envDir: '..',
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target: `http://localhost:${apiPort}`, changeOrigin: true },
      },
    },
    build: { chunkSizeWarningLimit: 6000 },
  };
});
