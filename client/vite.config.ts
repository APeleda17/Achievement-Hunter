import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev serveris :5173. Užklausos /api ir /auth persiunčiamos į Express serverį (:3000),
// todėl naršyklė mato vieną adresą ir sesijos slapukas veikia be CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
    },
  },
});
