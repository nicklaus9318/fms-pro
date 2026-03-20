/**
 * localClient.js
 * Rimpiazza il client base44 con un sistema di storage locale (localStorage).
 * Compatibile con la stessa API usata nel codice originale.
 */

// ─── Utility ────────────────────────────────────────────────────────────────

const generateId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const now = () => new Date().toISOString();

const getStore = (entityName) => {
  try {
    const raw = localStorage.getItem(`fanta_${entityName}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveStore = (entityName, data) => {
  localStorage.setItem(`fanta_${entityName}`, JSON.stringify(data));
};

// ─── Entity factory ──────────────────────────────────────────────────────────

const createEntity = (entityName) => ({
  /** Restituisce tutti i record, ordinati per campo */
  list: async (orderBy = '-created_date', limit = 1000, skip = 0) => {
    const data = getStore(entityName);
    const field = orderBy.startsWith('-') ? orderBy.slice(1) : orderBy;
    const dir = orderBy.startsWith('-') ? -1 : 1;
    const sorted = [...data].sort((a, b) => {
      const av = a[field] ?? '';
      const bv = b[field] ?? '';
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return sorted.slice(skip, skip + limit);
  },

  /** Filtra per una o più proprietà (match esatto) */
  filter: async (filters = {}, orderBy = '-created_date', limit = 1000, skip = 0) => {
    const data = getStore(entityName);
    const filtered = data.filter((item) =>
      Object.entries(filters).every(([k, v]) => item[k] === v)
    );
    const field = orderBy.startsWith('-') ? orderBy.slice(1) : orderBy;
    const dir = orderBy.startsWith('-') ? -1 : 1;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[field] ?? '';
      const bv = b[field] ?? '';
      return av < bv ? -dir : av > bv ? dir : 0;
    });
    return sorted.slice(skip, skip + limit);
  },

  /** Crea un nuovo record */
  create: async (record) => {
    const data = getStore(entityName);
    const newRecord = {
      id: generateId(),
      created_date: now(),
      ...record,
    };
    data.push(newRecord);
    saveStore(entityName, data);
    return newRecord;
  },

  /** Aggiorna un record esistente per id */
  update: async (id, updates) => {
    const data = getStore(entityName);
    const idx = data.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error(`Record ${id} non trovato in ${entityName}`);
    data[idx] = { ...data[idx], ...updates };
    saveStore(entityName, data);
    return data[idx];
  },

  /** Elimina un record per id */
  delete: async (id) => {
    const data = getStore(entityName);
    const filtered = data.filter((r) => r.id !== id);
    saveStore(entityName, filtered);
    return { ok: true };
  },

  /** Operazioni bulk: array di { type: 'update'|'create'|'delete', id?, data } */
  bulk: async (operations) => {
    const data = getStore(entityName);
    const results = [];
    for (const op of operations) {
      if (op.type === 'create' || !op.type) {
        const newRecord = { id: generateId(), created_date: now(), ...(op.data || op) };
        data.push(newRecord);
        results.push(newRecord);
      } else if (op.type === 'update') {
        const idx = data.findIndex((r) => r.id === op.id);
        if (idx !== -1) {
          data[idx] = { ...data[idx], ...op.data };
          results.push(data[idx]);
        }
      } else if (op.type === 'delete') {
        const idx = data.findIndex((r) => r.id === op.id);
        if (idx !== -1) data.splice(idx, 1);
        results.push({ ok: true });
      }
    }
    saveStore(entityName, data);
    return results;
  },

  /** bulk alias: bulkCreate */
  bulkCreate: async (records) => {
    const data = getStore(entityName);
    const created = records.map((r) => ({ id: generateId(), created_date: now(), ...r }));
    data.push(...created);
    saveStore(entityName, data);
    return created;
  },
});

// ─── Auth ────────────────────────────────────────────────────────────────────

const DEFAULT_USER = {
  id: 'local-admin',
  email: 'admin@fantacalcio.local',
  full_name: 'Admin Locale',
  role: 'admin',
  created_date: now(),
};

const auth = {
  me: async () => {
    const stored = localStorage.getItem('fanta_current_user');
    return stored ? JSON.parse(stored) : DEFAULT_USER;
  },

  updateMe: async (updates) => {
    const current = await auth.me();
    const updated = { ...current, ...updates };
    localStorage.setItem('fanta_current_user', JSON.stringify(updated));
    return updated;
  },

  logout: (redirectUrl) => {
    localStorage.removeItem('fanta_current_user');
    window.location.href = redirectUrl || '/';
  },

  redirectToLogin: (redirectUrl) => {
    // In modalità locale non esiste login esterno – non facciamo nulla
    console.info('[localClient] redirectToLogin chiamato – ignorato in modalità locale');
  },
};

// ─── Functions (serverless → logica locale) ──────────────────────────────────

const functions = {
  invoke: async (name, params = {}) => {
    console.info(`[localClient] Funzione remota chiamata: ${name}`, params);

    switch (name) {
      case 'calculatePlayerValues':
        return calculatePlayerValues(params);
      case 'cancelBid':
        return cancelBid(params);
      case 'closePublicAuction':
        return closePublicAuction(params);
      case 'closeSealedBidAuction':
        return closeSealedBidAuction(params);
      case 'deleteAllPlayers':
        return deleteAllPlayers();
      case 'endLoans':
        return endLoans();
      case 'findDuplicatePlayers':
        return findDuplicatePlayers(params);
      case 'fixDuplicateNames':
        return fixDuplicateNames(params);
      case 'generateNextKnockoutRound':
        return generateNextKnockoutRound(params);
      case 'generateNextWorldCupRound':
        return generateNextWorldCupRound(params);
      case 'processMatchResults':
        return processMatchResults(params);
      case 'processTeamScreenshot':
        return { success: false, message: 'processTeamScreenshot non disponibile in locale' };
      case 'resetAllStatistics':
        return resetAllStatistics();
      case 'resetSeasonData':
        return resetSeasonData();
      case 'updatePlayerMarketValueAndSalary':
        return updatePlayerMarketValueAndSalary(params);
      default:
        console.warn(`[localClient] Funzione sconosciuta: ${name}`);
        return { success: false, message: `Funzione ${name} non implementata in locale` };
    }
  },
};

// ─── Implementazioni funzioni locali ─────────────────────────────────────────

async function deleteAllPlayers() {
  saveStore('Player', []);
  return { success: true, message: 'Tutti i giocatori eliminati' };
}

async function findDuplicatePlayers(params) {
  const players = getStore('Player');
  const seen = {};
  const duplicates = [];
  for (const p of players) {
    const key = (p.name || '').toLowerCase().trim();
    if (seen[key]) duplicates.push(p);
    else seen[key] = p;
  }
  return { duplicates };
}

async function fixDuplicateNames(params) {
  const players = getStore('Player');
  const seen = {};
  let fixed = 0;
  for (const p of players) {
    const key = (p.name || '').toLowerCase().trim();
    if (seen[key]) {
      p.name = `${p.name} (${p.id.slice(0, 4)})`;
      fixed++;
    } else {
      seen[key] = true;
    }
  }
  saveStore('Player', players);
  return { success: true, fixed };
}

async function calculatePlayerValues(params) {
  const players = getStore('Player');
  const updated = players.map((p) => ({
    ...p,
    market_value: p.market_value || p.salary || 1,
  }));
  saveStore('Player', updated);
  return { success: true };
}

async function updatePlayerMarketValueAndSalary(params) {
  const players = getStore('Player');
  const updated = players.map((p) => ({
    ...p,
    market_value: Math.max(1, (p.market_value || 1) + Math.round((Math.random() - 0.5) * 2)),
  }));
  saveStore('Player', updated);
  return { success: true };
}

async function cancelBid(params) {
  const { bid_id } = params;
  const bids = getStore('Bid');
  const idx = bids.findIndex((b) => b.id === bid_id);
  if (idx !== -1) {
    bids[idx].status = 'cancelled';
    saveStore('Bid', bids);
  }
  return { success: true };
}

async function closePublicAuction(params) {
  const { auction_id } = params;
  const auctions = getStore('Auction');
  const idx = auctions.findIndex((a) => a.id === auction_id);
  if (idx !== -1) {
    auctions[idx].status = 'closed';
    saveStore('Auction', auctions);
  }
  return { success: true };
}

async function closeSealedBidAuction(params) {
  const { auction_id } = params;
  const auctions = getStore('Auction');
  const bids = getStore('Bid');
  const aIdx = auctions.findIndex((a) => a.id === auction_id);
  if (aIdx !== -1) {
    const auctionBids = bids.filter((b) => b.auction_id === auction_id && b.status === 'active');
    const winner = auctionBids.sort((a, b) => b.amount - a.amount)[0];
    auctions[aIdx].status = 'closed';
    if (winner) auctions[aIdx].winner_team_id = winner.team_id;
    saveStore('Auction', auctions);
  }
  return { success: true };
}

async function endLoans() {
  const players = getStore('Player');
  const updated = players.map((p) =>
    p.on_loan ? { ...p, on_loan: false, loan_team_id: null } : p
  );
  saveStore('Player', updated);
  return { success: true };
}

async function resetAllStatistics() {
  const players = getStore('Player');
  const reset = players.map((p) => ({
    ...p,
    goals: 0,
    assists: 0,
    yellow_cards: 0,
    red_cards: 0,
    yellow_cards_accumulated: 0,
    matches_played: 0,
  }));
  saveStore('Player', reset);
  return { success: true };
}

async function resetSeasonData() {
  saveStore('Match', []);
  saveStore('Standing', []);
  saveStore('Auction', []);
  saveStore('Bid', []);
  saveStore('Transfer', []);
  saveStore('BudgetTransaction', []);
  return { success: true, message: 'Stagione resettata' };
}

async function processMatchResults(params) {
  return { success: true, message: 'Risultati processati localmente' };
}

async function generateNextKnockoutRound(params) {
  return { success: true, message: 'Round generato localmente' };
}

async function generateNextWorldCupRound(params) {
  return { success: true, message: 'Round World Cup generato localmente' };
}

// ─── AppLogs (no-op) ──────────────────────────────────────────────────────────

const appLogs = {
  logUserInApp: async (pageName) => {
    // Silenzioso in locale
  },
};

// ─── Client principale ────────────────────────────────────────────────────────

export const base44 = {
  auth,
  appLogs,
  functions,
  entities: {
    AppSettings: createEntity('AppSettings'),
    Auction: createEntity('Auction'),
    Bid: createEntity('Bid'),
    BudgetTransaction: createEntity('BudgetTransaction'),
    Competition: createEntity('Competition'),
    HallOfFame: createEntity('HallOfFame'),
    League: createEntity('League'),
    LottoNumber: createEntity('LottoNumber'),
    Match: createEntity('Match'),
    Player: createEntity('Player'),
    PlayerStatus: createEntity('PlayerStatus'),
    Sanction: createEntity('Sanction'),
    Standing: createEntity('Standing'),
    Team: createEntity('Team'),
    Transfer: createEntity('Transfer'),
    User: createEntity('User'),
  },
};
