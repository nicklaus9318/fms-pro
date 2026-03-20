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
    // Aumenta il warning threshold (il bundle sarà diviso comunque)
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Librerie core React
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Tanstack Query
          'vendor-query': ['@tanstack/react-query'],
          // UI components Radix
          'vendor-radix': [
            '@radix-ui/react-dialog',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-popover',
            '@radix-ui/react-tooltip',
          ],
          // Supabase
          'vendor-supabase': ['@supabase/supabase-js'],
          // Chart e utility
          'vendor-charts': ['recharts'],
          'vendor-utils': ['moment', 'date-fns', 'lodash'],
        },
      },
    },
  },
});
