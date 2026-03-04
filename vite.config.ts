import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'todo-frontend',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/tasks': 'http://localhost:3000',
      '/admin': 'http://localhost:3000',
    },
  },
  build: {
    outDir: '../dist-frontend',
    emptyOutDir: true,
  },
});