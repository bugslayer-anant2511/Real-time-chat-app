import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    open: false,
  },
  preview: {
    port: 4173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('scheduler')) return 'react';
            if (id.includes('react-router')) return 'router';
            if (id.includes('socket.io-client') || id.includes('engine.io-client')) return 'socket-io';
            if (id.includes('emoji-picker-react')) return 'emoji-picker';
            if (id.includes('lucide-react')) return 'lucide';
            if (id.includes('axios')) return 'axios';
            return 'vendor';
          }
        },
      },
    },
  },
});
