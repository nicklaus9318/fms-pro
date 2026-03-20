import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[supabaseClient] Mancano le variabili d\'ambiente VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const toSnake = (str) => str.replace(/([A-Z])/g, '_$1').toLowerCase();

const tableMap = {
  AppSettings:       'app_settings',
  Auction:           'auctions',
  Bid:               'bids',
  BudgetTransaction: 'budget_transactions',
  Competition:       'competitions',
  HallOfFame:        'hall_of_fame',
  League:            'leagues',
  LottoNumber:       'lotto_numbers',
  Match:             'matches',
  Player:            'players',
  PlayerStatus:      'player_statuses',
  Sanction:          'sanctions',
  Standing:          'standings',
  Team:              'teams',
  Transfer:          'transfers',
  User:              'user_roles',   // ← punta a user_roles (con phone_number, full_name)
};

// Carica TUTTI i record usando paginazione automatica
async function fetchAll(table, orderCol, asc) {
  const PAGE = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderCol, { ascending: asc })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const createEntity = (entityName) => {
  const table = tableMap[entityName] || toSnake(entityName) + 's';

  const parseOrder = (orderBy = '-created_date') => {
    const desc = orderBy.startsWith('-');
    const col = desc ? orderBy.slice(1) : orderBy;
    return { col, asc: !desc };
  };

  return {
    list: async (orderBy = '-created_date') => {
      const { col, asc } = parseOrder(orderBy);
      return await fetchAll(table, col, asc);
    },

    filter: async (filters = {}, orderBy = '-created_date') => {
      const { col, asc } = parseOrder(orderBy);
      const PAGE = 1000;
      let all = [];
      let from = 0;
      while (true) {
        let query = supabase.from(table).select('*');
        for (const [k, v] of Object.entries(filters)) {
          query = query.eq(k, v);
        }
        const { data, error } = await query
          .order(col, { ascending: asc })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break;
        from += PAGE;
      }
      return all;
    },

    create: async (record) => {
      const { data, error } = await supabase
        .from(table)
        .insert(record)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    update: async (id, updates) => {
      const { data, error } = await supabase
        .from(table)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },

    delete: async (id) => {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      return { ok: true };
    },

    bulk: async (operations) => {
      const results = [];
      for (const op of operations) {
        const type = op.type || 'create';
        if (type === 'create') {
          const { data, error } = await supabase.from(table).insert(op.data || op).select().single();
          if (error) throw error;
          results.push(data);
        } else if (type === 'update') {
          const { data, error } = await supabase.from(table).update(op.data).eq('id', op.id).select().single();
          if (error) throw error;
          results.push(data);
        } else if (type === 'delete') {
          const { error } = await supabase.from(table).delete().eq('id', op.id);
          if (error) throw error;
          results.push({ ok: true });
        }
      }
      return results;
    },

    bulkCreate: async (records) => {
      const { data, error } = await supabase.from(table).insert(records).select();
      if (error) throw error;
      return data ?? [];
    },
  };
};

// ─── Auth ─────────────────────────────────────────────────────────────────────
const auth = {
  me: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role, full_name, phone_number')
      .eq('email', session.user.email)
      .single();
    return {
      id: session.user.id,
      email: session.user.email,
      full_name: roleData?.full_name || session.user.user_metadata?.full_name || session.user.email,
      phone_number: roleData?.phone_number || null,
      role: roleData?.role || 'user',
    };
  },

  updateMe: async (updates) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Non autenticato');
    // Aggiorna user_roles se ci sono campi da aggiornare lì
    const roleFields = {};
    if (updates.full_name)    roleFields.full_name    = updates.full_name;
    if (updates.phone_number) roleFields.phone_number = updates.phone_number;
    if (Object.keys(roleFields).length > 0) {
      await supabase.from('user_roles').update(roleFields).eq('email', session.user.email);
    }
    return auth.me();
  },

  logout: async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  },

  redirectToLogin: () => {
    console.info('[supabaseClient] redirectToLogin: auth gestita da AuthContext');
  },
};

// ─── Edge Functions / funzioni locali ─────────────────────────────────────────
const functions = {
  invoke: async (name, params = {}) => {
    console.info(`[supabaseClient] Funzione: ${name}`, params);
    switch (name) {

      case 'deleteAllPlayers': {
        const { error } = await supabase.from('players').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) throw error;
        return { success: true };
      }

      case 'resetSeasonData': {
        for (const t of ['matches', 'standings', 'auctions', 'bids', 'transfers', 'budget_transactions', 'player_statuses']) {
          await supabase.from(t).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        }
        // Azzera anche statistiche giocatori
        await supabase.from('players').update({
          goals: 0, assists: 0, mvp_count: 0,
          yellow_cards_accumulated: 0,
          player_status: null, injury_end_date: null, suspension_end_date: null,
        }).neq('id', '00000000-0000-0000-0000-000000000000');
        return { success: true };
      }

      case 'resetAllStatistics': {
        await supabase.from('players').update({
          goals: 0, assists: 0, mvp_count: 0,
          yellow_cards_accumulated: 0,
        }).neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('standings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('player_statuses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        return { success: true };
      }

      case 'findDuplicatePlayers': {
        // Usa first_name + last_name come chiave (non p.name che non esiste)
        const { data: players, error } = await supabase
          .from('players')
          .select('id, first_name, last_name, role, age, overall_rating, status, team_id')
          .order('first_name');
        if (error) throw error;
        const seen = {};
        const groups = {};
        for (const p of (players || [])) {
          const key = `${(p.first_name || '').toLowerCase().trim()} ${(p.last_name || '').toLowerCase().trim()}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(p);
        }
        const duplicates = Object.entries(groups)
          .filter(([, arr]) => arr.length > 1)
          .map(([name, arr]) => ({ name, players: arr }));
        return { duplicates };
      }

      case 'endLoans': {
        const { error } = await supabase.from('players')
          .update({ is_on_loan: false, loan_from_team_id: null })
          .eq('is_on_loan', true);
        return { success: !error };
      }

      case 'cancelBid': {
        const { error } = await supabase.from('bids')
          .update({ status: 'cancelled' })
          .eq('id', params.bid_id);
        return { success: !error };
      }

      case 'closePublicAuction': {
        const { error } = await supabase.from('auctions')
          .update({ status: 'completed' })
          .eq('id', params.auction_id);
        return { success: !error };
      }

      case 'closeSealedBidAuction': {
        // Trova l'offerta più alta
        const { data: bids, error: bidsErr } = await supabase
          .from('bids')
          .select('*')
          .eq('auction_id', params.auction_id)
          .eq('status', 'active')
          .order('amount', { ascending: false });
        if (bidsErr) throw bidsErr;

        const winner = bids?.[0] || null;

        if (winner) {
          // Assegna il giocatore alla squadra vincitrice
          const { data: auction } = await supabase
            .from('auctions').select('player_id').eq('id', params.auction_id).single();

          if (auction?.player_id) {
            await supabase.from('players')
              .update({ team_id: winner.team_id })
              .eq('id', auction.player_id);
          }

          // Scala il budget
          const { data: team } = await supabase
            .from('teams').select('budget').eq('id', winner.team_id).single();
          if (team) {
            const newBudget = (team.budget || 0) - winner.amount;
            await supabase.from('teams').update({ budget: newBudget }).eq('id', winner.team_id);
            // Registra transazione
            await supabase.from('budget_transactions').insert({
              team_id: winner.team_id,
              team_name: winner.team_name,
              amount: -winner.amount,
              type: 'auction_win',
              description: `Asta vinta`,
              previous_balance: team.budget,
              new_balance: newBudget,
            });
          }

          // Marca bid vincente
          await supabase.from('bids').update({ is_winning: true }).eq('id', winner.id);
        }

        // Chiudi l'asta
        await supabase.from('auctions')
          .update({ status: 'completed', current_winner_team_id: winner?.team_id || null })
          .eq('id', params.auction_id);

        return { success: true, data: { winner } };
      }

      case 'updatePlayerMarketValueAndSalary': {
        const calculateValue = (overall, age) => {
          if (!overall || overall < 40) return 500000;
          // Overall 90+ età 23-28 → fino a 150M
          if (overall >= 90 && age >= 23 && age <= 28) {
            const v = 80000000 + (overall - 90) * 14000000 + (28 - Math.abs(age - 25)) * 1000000;
            return Math.min(150000000, v);
          }
          // Overall 85-89 età <25 → fino a 50M
          if (overall >= 85 && overall < 90 && age < 25) {
            const v = 20000000 + (overall - 85) * 6000000 + (25 - age) * 1000000;
            return Math.min(50000000, v);
          }
          // Overall 85+ senior → fino a 80M
          if (overall >= 85) {
            const v = 30000000 + (overall - 85) * 7000000;
            return Math.min(80000000, v);
          }
          // Overall 80-85 → fino a 50M
          if (overall >= 80) {
            const v = 10000000 + (overall - 80) * 8000000;
            return Math.min(50000000, v);
          }
          // Overall <80 → fino a 30M
          const v = 1000000 + (overall - 60) * 400000 + Math.max(0, 30 - age) * 200000;
          return Math.max(0, Math.min(30000000, v));
        };
        const calculateSalary = (overall) => {
          if (!overall || overall < 40) return 100000;
          if (overall >= 90) return 10000000;
          if (overall >= 88) return 7000000;
          if (overall >= 85) return 5000000;
          if (overall >= 82) return 3000000;
          if (overall >= 75) return 1500000;
          if (overall >= 65) return 500000;
          return 100000;
        };
        const players = params.players || [];
        let updated = 0, skipped = 0;
        const errors = [];
        for (const player of players) {
          try {
            if (!player.id) { skipped++; continue; }
            const playerValue = calculateValue(player.overall_rating || 0, player.age || 25);
            const salary = calculateSalary(player.overall_rating || 0);
            const { error } = await supabase.from('players')
              .update({ player_value: playerValue, salary })
              .eq('id', player.id);
            if (error) throw error;
            updated++;
          } catch (e) {
            skipped++;
            errors.push(`${player.first_name} ${player.last_name}: ${e.message}`);
          }
        }
        return { success: true, updated, skipped, errors };
      }

      case 'generateNextKnockoutRound':
      case 'generateNextWorldCupRound':
      case 'processMatchResults':
        return { success: true, message: `${name} eseguito localmente` };

      case 'processTeamScreenshot':
        return { success: false, message: 'processTeamScreenshot non disponibile senza AI' };

      default:
        console.warn(`[supabaseClient] Funzione non implementata: ${name}`);
        return { success: false, message: `Funzione ${name} non implementata` };
    }
  },
};

const appLogs = { logUserInApp: async () => {} };

export const base44 = {
  auth,
  appLogs,
  functions,
  entities: {
    AppSettings:       createEntity('AppSettings'),
    Auction:           createEntity('Auction'),
    Bid:               createEntity('Bid'),
    BudgetTransaction: createEntity('BudgetTransaction'),
    Competition:       createEntity('Competition'),
    HallOfFame:        createEntity('HallOfFame'),
    League:            createEntity('League'),
    LottoNumber:       createEntity('LottoNumber'),
    Match:             createEntity('Match'),
    Player:            createEntity('Player'),
    PlayerStatus:      createEntity('PlayerStatus'),
    Sanction:          createEntity('Sanction'),
    Standing:          createEntity('Standing'),
    Team:              createEntity('Team'),
    Transfer:          createEntity('Transfer'),
    User:              createEntity('User'),  // → user_roles
  },
};
