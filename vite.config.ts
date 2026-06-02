import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/triagegrierson/', // <-- Permite que la app funcione correctamente en el subdominio de Hostinger
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'), // Mantiene la compatibilidad con tus alias de carpetas si los usas
    },
  },
});