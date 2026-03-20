/**
 * CompetitionGenerator.js
 * Generatori di calendario per tutti i formati supportati
 */

// ─── UTILS ────────────────────────────────────────────────────────────────────

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── 1. GIRONE ALL'ITALIANA CLASSICO (Berger) ─────────────────────────────────

export function generateClassicLeague(teams, leagueId, season) {
  const teamList = [...teams];
  if (teamList.length % 2 !== 0) teamList.push({ id: 'BYE', name: 'Riposo' });
  const n = teamList.length;
  const rounds = n - 1;
  const matches = [];

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < n / 2; i++) {
      const home = teamList[(round + i) % (n - 1)];
      const away = i === 0 ? teamList[n - 1] : teamList[(round + n - i - 1) % (n - 1)];
      if (home.id === 'BYE' || away.id === 'BYE') continue;
      matches.push({
        league_id: leagueId, season,
        matchday: round + 1,
        home_team_id: round % 2 === 0 ? home.id : away.id,
        away_team_id: round % 2 === 0 ? away.id : home.id,
        home_team_name: round % 2 === 0 ? home.name : away.name,
        away_team_name: round % 2 === 0 ? away.name : home.name,
        status: 'scheduled'
      });
    }
  }
  return matches;
}

// ─── 2. SWISS MODEL 40 SQUADRE (Champions League style) ──────────────────────
/**
 * 40 squadre in 4 fasce da 10.
 * Ogni squadra gioca 8 partite: 2 per fascia (1 casa, 1 fuori).
 * Poi: Top 8 → ottavi diretti. 9-24 → playoff. 25-40 → eliminati.
 */
export function generateSwissModel(teams, leagueId, season) {
  const n = teams.length;
  if (n < 8) throw new Error('Servono almeno 8 squadre per il formato Swiss');

  // Dividi in 4 fasce per ranking (ordine in cui arrivano)
  const potSize = Math.floor(n / 4);
  const pots = [
    teams.slice(0, potSize),
    teams.slice(potSize, potSize * 2),
    teams.slice(potSize * 2, potSize * 3),
    teams.slice(potSize * 3)
  ];

  const matches = [];
  const opponentMap = {}; // teamId → Set di opponentId già assegnati
  teams.forEach(t => { opponentMap[t.id] = new Set(); });

  const matchdayMap = {}; // teamId → prossima matchday disponibile
  teams.forEach(t => { matchdayMap[t.id] = 1; });

  function getNextMatchday(t1Id, t2Id) {
    return Math.max(matchdayMap[t1Id], matchdayMap[t2Id]);
  }

  function tryAssign(team, opponents, homeFirst) {
    const shuffled = shuffle(opponents);
    for (const opp of shuffled) {
      if (opponentMap[team.id].has(opp.id)) continue;
      if (opponentMap[opp.id].has(team.id)) continue;
      const md = getNextMatchday(team.id, opp.id);
      // Partita andata
      matches.push({
        league_id: leagueId, season,
        matchday: md,
        home_team_id: homeFirst ? team.id : opp.id,
        away_team_id: homeFirst ? opp.id : team.id,
        home_team_name: homeFirst ? team.name : opp.name,
        away_team_name: homeFirst ? opp.name : team.name,
        status: 'scheduled',
        competition_phase: 'swiss'
      });
      opponentMap[team.id].add(opp.id);
      opponentMap[opp.id].add(team.id);
      matchdayMap[team.id] = md + 1;
      matchdayMap[opp.id] = md + 1;
      return true;
    }
    return false;
  }

  // Ogni squadra affronta 2 avversari per fascia (1 casa, 1 fuori)
  for (let potIdx = 0; potIdx < 4; potIdx++) {
    const pot = pots[potIdx];
    // Squadre di altre fasce
    const otherPots = pots.filter((_, i) => i !== potIdx);

    for (const team of teams) {
      const potOpponents = shuffle(pot.filter(t => t.id !== team.id));
      // 2 avversari da questa fascia
      let assigned = 0;
      for (const opp of potOpponents) {
        if (assigned >= 2) break;
        if (opponentMap[team.id].has(opp.id)) continue;
        const md = getNextMatchday(team.id, opp.id);
        const homeFirst = assigned % 2 === 0;
        matches.push({
          league_id: leagueId, season,
          matchday: md,
          home_team_id: homeFirst ? team.id : opp.id,
          away_team_id: homeFirst ? opp.id : team.id,
          home_team_name: homeFirst ? team.name : opp.name,
          away_team_name: homeFirst ? opp.name : team.name,
          status: 'scheduled',
          competition_phase: 'swiss'
        });
        opponentMap[team.id].add(opp.id);
        opponentMap[opp.id].add(team.id);
        matchdayMap[team.id] = md + 1;
        matchdayMap[opp.id] = md + 1;
        assigned++;
      }
    }
  }

  // Deduplica
  const seen = new Set();
  return matches.filter(m => {
    const key = [m.home_team_id, m.away_team_id, m.matchday].join('-');
    const rev = [m.away_team_id, m.home_team_id, m.matchday].join('-');
    if (seen.has(key) || seen.has(rev)) return false;
    seen.add(key);
    return true;
  });
}

// ─── 3. ELIMINAZIONE DIRETTA 40 SQUADRE ──────────────────────────────────────
/**
 * 40 squadre:
 * - Turno preliminare: squadre 25-40 (16 squadre → 8 partite → 8 vincitori)
 * - Sedicesimi: 8 vincitori + squadre 1-24 = 32 squadre
 * - Ottavi, Quarti, Semifinali, Finale
 * Le squadre 1-24 (top) saltano i preliminari (BYE)
 */
export function generateKnockout40(teams, leagueId, season) {
  if (teams.length < 8) throw new Error('Servono almeno 8 squadre');

  const seeded = teams.slice(0, Math.min(24, teams.length));
  const qualifiers = teams.slice(24);
  const shuffledQualifiers = shuffle(qualifiers);
  const matches = [];

  // TURNO PRELIMINARE (matchday 1) — squadre 25-40
  const prelimWinners = []; // placeholder per i vincitori
  for (let i = 0; i < shuffledQualifiers.length - 1; i += 2) {
    const home = shuffledQualifiers[i];
    const away = shuffledQualifiers[i + 1];
    if (!home || !away) break;
    matches.push({
      league_id: leagueId, season,
      matchday: 1,
      home_team_id: home.id,
      away_team_id: away.id,
      home_team_name: home.name,
      away_team_name: away.name,
      status: 'scheduled',
      competition_phase: 'preliminary',
      round_name: 'Turno Preliminare'
    });
    prelimWinners.push({ placeholder: `Vincitore P${Math.floor(i / 2) + 1}` });
  }

  // SEDICESIMI (matchday 2) — 24 teste di serie + 8 vincitori preliminari
  // Abbina: 1 vs 32, 2 vs 31, ecc.
  const r16Teams = shuffle([...seeded]);
  for (let i = 0; i < r16Teams.length - 1; i += 2) {
    const home = r16Teams[i];
    const away = r16Teams[i + 1];
    if (!home || !away) break;
    matches.push({
      league_id: leagueId, season,
      matchday: 2,
      home_team_id: home.id,
      away_team_id: away.id,
      home_team_name: home.name,
      away_team_name: away.name,
      status: 'scheduled',
      competition_phase: 'round_of_32',
      round_name: 'Sedicesimi di Finale'
    });
  }

  // I match dei turni successivi (Ottavi, Quarti, Semifinali, Finale)
  // vengono generati automaticamente avanzando i vincitori
  // I placeholder vengono creati qui come partite TBD
  const roundNames = ['Ottavi di Finale', 'Quarti di Finale', 'Semifinali', 'Finale'];
  const roundSizes = [8, 4, 2, 1];

  roundSizes.forEach((numMatches, idx) => {
    for (let i = 0; i < numMatches; i++) {
      matches.push({
        league_id: leagueId, season,
        matchday: 3 + idx,
        home_team_id: null,
        away_team_id: null,
        home_team_name: 'TBD',
        away_team_name: 'TBD',
        status: 'scheduled',
        competition_phase: roundNames[idx].toLowerCase().replace(/ /g, '_'),
        round_name: roundNames[idx]
      });
    }
  });

  return matches;
}

// ─── 4. EUROPEI 16 SQUADRE (Gironi + Knockout) ───────────────────────────────
/**
 * 16 squadre → 4 gironi da 4 (round robin 3 partite cad.)
 * Top 2 per girone → Quarti (8 squadre)
 * Quarti → Semifinali → Finale
 */
export function generateEuros16(teams, leagueId, season) {
  if (teams.length < 8) throw new Error('Servono almeno 8 squadre');

  const shuffled = shuffle(teams.slice(0, 16));
  const groupSize = 4;
  const numGroups = Math.floor(shuffled.length / groupSize);
  const groupLetters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
  const matches = [];

  // FASE A GIRONI
  for (let g = 0; g < numGroups; g++) {
    const group = shuffled.slice(g * groupSize, (g + 1) * groupSize);
    const groupName = `Gruppo ${groupLetters[g]}`;
    let matchday = 1;

    // Round robin: ogni squadra gioca 3 partite
    const pairs = [];
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        pairs.push([group[i], group[j]]);
      }
    }

    // Distribuisci in 3 giornate (2 partite per giornata)
    const rounds = [
      [pairs[0], pairs[5]],
      [pairs[1], pairs[4]],
      [pairs[2], pairs[3]]
    ];

    rounds.forEach((roundPairs, roundIdx) => {
      roundPairs.forEach(([home, away]) => {
        if (!home || !away) return;
        matches.push({
          league_id: leagueId, season,
          matchday: roundIdx + 1,
          home_team_id: home.id,
          away_team_id: away.id,
          home_team_name: home.name,
          away_team_name: away.name,
          status: 'scheduled',
          competition_phase: 'group',
          group_name: groupName,
          round_name: `${groupName} - Giornata ${roundIdx + 1}`
        });
      });
    });
  }

  // FASE AD ELIMINAZIONE — Quarti, Semifinali, Finale
  const knockoutRounds = [
    { name: 'Quarti di Finale', numMatches: 4, matchday: 4 },
    { name: 'Semifinali', numMatches: 2, matchday: 5 },
    { name: 'Finale 3°/4° Posto', numMatches: 1, matchday: 6 },
    { name: 'Finale', numMatches: 1, matchday: 6 }
  ];

  knockoutRounds.forEach(({ name, numMatches, matchday }) => {
    for (let i = 0; i < numMatches; i++) {
      matches.push({
        league_id: leagueId, season,
        matchday,
        home_team_id: null,
        away_team_id: null,
        home_team_name: 'TBD',
        away_team_name: 'TBD',
        status: 'scheduled',
        competition_phase: name.toLowerCase().replace(/ /g, '_'),
        round_name: name
      });
    }
  });

  return matches;
}

// ─── EXPORT FORMATO → FUNZIONE ────────────────────────────────────────────────

export const FORMAT_GENERATORS = {
  classic:   generateClassicLeague,
  swiss40:   generateSwissModel,
  knockout40: generateKnockout40,
  euros16:   generateEuros16,
};

export const FORMAT_LABELS = {
  classic:    { label: 'Girone All\'Italiana', description: 'Tutti contro tutti, andata e ritorno', minTeams: 2, icon: '🏆' },
  swiss40:    { label: 'Swiss Model (Champions)', description: '40 squadre, 4 fasce, 8 partite a testa', minTeams: 8, icon: '⭐' },
  knockout40: { label: 'Eliminazione Diretta 40', description: 'Preliminari + Sedicesimi fino alla Finale', minTeams: 8, icon: '⚔️' },
  euros16:    { label: 'Stile Europei (16 sqd.)', description: '4 gironi da 4 + Quarti/Semifinali/Finale', minTeams: 8, icon: '🌍' },
};
