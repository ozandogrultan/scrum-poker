import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: 'http://127.0.0.1:3001', changeOrigin: false } },
  },
  test: { environment: 'jsdom', include: ['src/**/*.test.tsx', 'tests/**/*.test.tsx'] },
});
