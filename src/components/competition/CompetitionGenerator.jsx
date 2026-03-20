// Generatori di calendario per diversi formati di competizione

// TIPO 1: Campionato classico andata e ritorno (Algoritmo di Berger)
export function generateClassicLeague(teams, leagueId, season) {
  const matches = [];
  let teamsCopy = [...teams];
  
  // Se dispari, aggiungi team fittizio per i riposi
  if (teamsCopy.length % 2 !== 0) {
    teamsCopy.push(null);
  }
  
  const numTeams = teamsCopy.length;
  const totalRounds = (numTeams - 1) * 2; // Andata e ritorno
  
  for (let round = 1; round <= totalRounds; round++) {
    const isReturnLeg = round > (numTeams - 1);
    
    for (let i = 0; i < numTeams / 2; i++) {
      const team1 = teamsCopy[i];
      const team2 = teamsCopy[numTeams - 1 - i];
      
      if (team1 && team2) {
        // Nel ritorno inverti casa/trasferta
        const home = isReturnLeg ? team2 : team1;
        const away = isReturnLeg ? team1 : team2;
        
        matches.push({
          league_id: leagueId,
          season: season,
          matchday: round,
          home_team_id: home.id,
          away_team_id: away.id,
          status: 'scheduled'
        });
      }
    }
    
    // Rotazione Berger (fisso il primo, ruoto gli altri)
    const first = teamsCopy.shift();
    const last = teamsCopy.pop();
    teamsCopy.splice(1, 0, last);
    teamsCopy.unshift(first);
  }
  
  return matches;
}

// TIPO 2: Coppa a eliminazione diretta
export function generateKnockoutCup(teams, leagueId, season) {
  const matches = [];
  const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);
  
  // Primo turno (es. Ottavi, Sedicesimi)
  const numMatches = Math.floor(shuffledTeams.length / 2);
  
  for (let i = 0; i < numMatches; i++) {
    const home = shuffledTeams[i * 2];
    const away = shuffledTeams[i * 2 + 1];
    
    if (home && away) {
      matches.push({
        league_id: leagueId,
        season: season,
        matchday: 1,
        home_team_id: home.id,
        away_team_id: away.id,
        status: 'scheduled'
      });
    }
  }
  
  return matches;
}

// TIPO 3: Stile Mondiale (Gironi + Eliminazione)
export function generateWorldCupStyle(teams, leagueId, season) {
  const matches = [];
  const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);
  
  // Dividi in gironi da 4 squadre
  const groups = [];
  for (let i = 0; i < shuffledTeams.length; i += 4) {
    groups.push(shuffledTeams.slice(i, i + 4));
  }
  
  let matchday = 1;
  
  // Genera partite per ogni girone (tutti contro tutti, andata e ritorno)
  groups.forEach((groupTeams, groupIndex) => {
    if (groupTeams.length < 2) return;
    
    // Andata
    for (let i = 0; i < groupTeams.length; i++) {
      for (let j = i + 1; j < groupTeams.length; j++) {
        matches.push({
          league_id: leagueId,
          season: season,
          matchday: matchday,
          home_team_id: groupTeams[i].id,
          away_team_id: groupTeams[j].id,
          status: 'scheduled'
        });
        matchday++;
      }
    }
    
    // Ritorno
    for (let i = 0; i < groupTeams.length; i++) {
      for (let j = i + 1; j < groupTeams.length; j++) {
        matches.push({
          league_id: leagueId,
          season: season,
          matchday: matchday,
          home_team_id: groupTeams[j].id,
          away_team_id: groupTeams[i].id,
          status: 'scheduled'
        });
        matchday++;
      }
    }
  });
  
  return matches;
}

// TIPO 4: Stile Champions 2025/26 (Swiss System - 8 partite per squadra)
export function generateChampionsSwiss(teams, leagueId, season) {
  const matches = [];
  const matchesPerTeam = 8;
  const usedPairings = new Set();
  
  // Per ogni squadra, assegna 8 avversari diversi
  teams.forEach((team, index) => {
    const opponents = teams.filter(t => t.id !== team.id);
    
    // Mescola gli avversari
    const shuffledOpponents = [...opponents].sort(() => Math.random() - 0.5);
    
    // Prendi i primi 8 avversari disponibili
    let assignedMatches = 0;
    
    for (const opponent of shuffledOpponents) {
      if (assignedMatches >= matchesPerTeam) break;
      
      // Crea chiave univoca per la coppia
      const pairingKey = [team.id, opponent.id].sort().join('-');
      
      // Verifica se questa coppia non è già stata usata
      if (!usedPairings.has(pairingKey)) {
        usedPairings.add(pairingKey);
        
        // Alterna casa/trasferta
        const isHome = assignedMatches % 2 === 0;
        
        matches.push({
          league_id: leagueId,
          season: season,
          matchday: assignedMatches + 1,
          home_team_id: isHome ? team.id : opponent.id,
          away_team_id: isHome ? opponent.id : team.id,
          status: 'scheduled'
        });
        
        assignedMatches++;
      }
    }
  });
  
  // Rimuovi duplicati (stesso match aggiunto due volte)
  const uniqueMatches = [];
  const seen = new Set();
  
  matches.forEach(match => {
    const key = `${match.home_team_id}-${match.away_team_id}`;
    const reverseKey = `${match.away_team_id}-${match.home_team_id}`;
    
    if (!seen.has(key) && !seen.has(reverseKey)) {
      seen.add(key);
      uniqueMatches.push(match);
    }
  });
  
  return uniqueMatches;
}