import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor splits
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react-router')) return 'vendor-react';
            if (id.includes('@tanstack')) return 'vendor-query';
            if (id.includes('@supabase')) return 'vendor-supabase';
            if (id.includes('@radix-ui')) return 'vendor-radix';
            if (id.includes('recharts')) return 'vendor-charts';
            if (id.includes('moment') || id.includes('date-fns')) return 'vendor-utils';
            if (id.includes('lucide-react')) return 'vendor-icons';
          }
          // Split pagine admin pesanti
          if (id.includes('AdminPanel')) return 'AdminPanel';
          if (id.includes('Calendar')) return 'Calendar';
          if (id.includes('Market') || id.includes('GestioneAste') || id.includes('AsteBusteChiuse')) return 'Market';
          if (id.includes('Players') || id.includes('PlayerCard') || id.includes('PlayerHistory')) return 'Players';
          if (id.includes('Teams') || id.includes('TeamTableView')) return 'Teams';
        }
      },
    },
  },
});
