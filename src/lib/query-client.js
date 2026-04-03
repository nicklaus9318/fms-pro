import { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/api/supabaseClient';

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      // Dati freschi per 5 minuti — riduce drasticamente i refetch durante la navigazione
      staleTime: 5 * 60 * 1000,
      // Dati in cache per 15 minuti dopo l'ultimo uso
      gcTime: 15 * 60 * 1000,
      // Non ricaricare quando si rifocalizza la finestra
      refetchOnWindowFocus: false,
      // Non ricaricare alla riconnessione (i dati in cache sono sufficienti)
      refetchOnReconnect: false,
      // Non ricaricare quando il componente si rimonta (navigazione tra pagine)
      refetchOnMount: false,
      // Riprova solo 1 volta in caso di errore
      retry: 1,
      retryDelay: 1000,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Precaricare i dati core in background appena l'utente è autenticato
// Chiamare questa funzione dopo il login per avere i dati già pronti
export const prefetchCoreData = () => {
  const qc = queryClientInstance;

  qc.prefetchQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data } = await supabase.from('teams').select('id,name,owner_email,budget,logo_url,primary_color,team_type,league_id,initial_budget');
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  qc.prefetchQuery({
    queryKey: ['leagues'],
    queryFn: async () => {
      const { data } = await supabase.from('leagues').select('id,name,season,status,participating_teams,current_matchday,prize_type,competition_format,logo_url,default_budget');
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Usa la stessa queryKey di Players.jsx e FreeAgents.jsx con batch loading
  qc.prefetchQuery({
    queryKey: ['allPlayers'],
    queryFn: async () => {
      let all = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data } = await supabase
          .from('players')
          .select('id,first_name,last_name,role,age,overall_rating,goals,assists,mvp_count,yellow_cards_accumulated,player_status,team_id,id_sofifa,photo_url,status,sofifa_link,player_value,salary,nationality,created_by')
          .eq('status', 'approved')
          .order('overall_rating', { ascending: false })
          .range(from, from + batchSize - 1);
        if (!data || data.length === 0) break;
        all = [...all, ...data];
        if (data.length < batchSize) break;
        from += batchSize;
      }
      return all;
    },
    staleTime: 5 * 60 * 1000,
  });

  qc.prefetchQuery({
    queryKey: ['matches'],
    queryFn: async () => {
      const { data } = await supabase.from('matches').select('id,league_id,competition_id,season,matchday,status,home_team_id,home_team_name,away_team_id,away_team_name,home_score,away_score,stage');
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
};
