import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    // Supporta sia { competition_id } che { event, data } (chiamato da Calendar.jsx)
    const competition_id = body.competition_id || body.data?.competition_id;

    if (!competition_id) {
      return Response.json({ message: 'competition_id mancante' });
    }

    // Verifica che sia una competizione knockout
    const competition = await base44.asServiceRole.entities.Competition.filter({ 
      id: competition_id 
    });
    
    if (!competition.length || competition[0].format !== 'knockout') {
      return Response.json({ message: 'Not a knockout competition or competition not found' });
    }

    const comp = competition[0];

    // Prendi tutti i match completati della competizione
    const allCompletedMatches = await base44.asServiceRole.entities.Match.filter({ 
      competition_id: comp.id,
      status: 'completed'
    });

    if (allCompletedMatches.length === 0) {
      return Response.json({ message: 'No completed matches found for this competition' });
    }

    // Trova l'ultimo matchday completato
    const latestMatchday = Math.max(...allCompletedMatches.map(m => m.matchday));
    const completedMatchesInLatestRound = allCompletedMatches.filter(m => m.matchday === latestMatchday);

    // Recupera tutti i match (completati e non) del latestMatchday per verificare che non ci siano ancora da giocare
    const allMatchesInLatestRound = await base44.asServiceRole.entities.Match.filter({
      competition_id: comp.id,
      matchday: latestMatchday
    });

    const allAreCompleted = allMatchesInLatestRound.every(m => m.status === 'completed');

    if (!allAreCompleted) {
      return Response.json({ message: 'Not all matches in the latest round are completed' });
    }

    // Raccogli tutti i vincitori del turno
    const winners = completedMatchesInLatestRound.map(m => {
      if (m.home_score > m.away_score) return { id: m.home_team_id };
      if (m.away_score > m.home_score) return { id: m.away_team_id };
      return null;
    }).filter(w => w !== null);

    // Se c'è un solo vincitore, la competizione è finita
    if (winners.length === 1) {
      const allTeams = await base44.asServiceRole.entities.Team.list();
      const winnerTeam = allTeams.find(t => t.id === winners[0].id);
      return Response.json({ 
        message: 'Competition completed', 
        winner: { id: winners[0].id, name: winnerTeam?.name || 'N/A' },
        matchesCreated: 0
      });
    }

    // Se il numero di vincitori è dispari (e > 1), non possiamo generare il prossimo turno
    if (winners.length % 2 !== 0) {
      return Response.json({ message: 'Cannot generate next round: odd number of winners. Admin intervention required.', matchesCreated: 0 });
    }

    // Genera il prossimo turno
    const nextMatchday = latestMatchday + 1;
    const nextMatches = [];
    
    // Recupera tutti i team per ottenere i nomi
    const allTeams = await base44.asServiceRole.entities.Team.list();
    const getTeamName = (teamId) => allTeams.find(t => t.id === teamId)?.name || 'N/A';

    // Accoppia i vincitori
    for (let i = 0; i < winners.length; i += 2) {
      if (winners[i] && winners[i + 1]) {
        nextMatches.push({
          league_id: comp.league_id,
          competition_id: comp.id,
          season: comp.season,
          matchday: nextMatchday,
          stage: winners.length === 2 ? 'final' : 
                 winners.length === 4 ? 'semifinal' : 
                 winners.length === 8 ? 'quarterfinal' : 
                 winners.length === 16 ? 'round_of_16' : 'knockout',
          home_team_id: winners[i].id,
          home_team_name: getTeamName(winners[i].id),
          away_team_id: winners[i + 1].id,
          away_team_name: getTeamName(winners[i + 1].id),
          status: 'scheduled'
        });
      }
    }

    if (nextMatches.length > 0) {
      await base44.asServiceRole.entities.Match.bulkCreate(nextMatches);
    }

    return Response.json({ 
      success: true, 
      nextRound: nextMatchday,
      matchesCreated: nextMatches.length 
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});