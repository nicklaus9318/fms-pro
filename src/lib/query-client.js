import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      // Dati considerati freschi per 2 minuti — evita refetch inutili
      staleTime: 2 * 60 * 1000,
      // Dati tenuti in cache per 10 minuti dopo l'ultimo uso
      gcTime: 10 * 60 * 1000,
      // Non ricaricare quando si rifocalizza la finestra
      refetchOnWindowFocus: false,
      // Non ricaricare alla riconnessione di rete (solo per dati non critici)
      refetchOnReconnect: 'always',
      // Riprova solo 1 volta in caso di errore
      retry: 1,
      retryDelay: 1000,
    },
    mutations: {
      retry: 0,
    },
  },
});
