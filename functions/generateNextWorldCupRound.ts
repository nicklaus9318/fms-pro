import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data: match } = await req.json();

    // Solo per match completati in formato world_cup
    if (event.type !== 'update' || match.status !== 'completed') {
      return Response.json({ message: 'Not a completed match' });
    }

    // Verifica che sia una competizione world_cup
    const competition = await base44.asServiceRole.entities.Competition.filter({ 
      id: match.competition_id 
    });
    
    if (!competition.length || competition[0].format !== 'world_cup') {
      return Response.json({ message: 'Not a world_cup competition' });
    }

    const comp = competition[0];

    // Prendi tutti i match della competizione
    const allMatches = await base44.asServiceRole.entities.Match.filter({ 
      competition_id: comp.id 
    });

    // Separa i match per fase
    const groupMatches = allMatches.filter(m => m.stage && m.stage.startsWith('group_'));
    const knockoutMatches = allMatches.filter(m => m.stage && !m.stage.startsWith('group_'));

    // Se ci sono ancora match di gruppo non completati, non fare nulla
    const allGroupsCompleted = groupMatches.every(m => m.status === 'completed');
    
    if (!allGroupsCompleted) {
      return Response.json({ message: 'Group stage not completed yet' });
    }

    // Se già esistono match knockout, applica la stessa logica del knockout
    if (knockoutMatches.length > 0) {
      const currentMatchday = match.matchday;
      const currentRoundMatches = knockoutMatches.filter(m => m.matchday === currentMatchday);
      const allCompleted = currentRoundMatches.every(m => m.status === 'completed');
      
      if (!allCompleted) {
        return Response.json({ message: 'Not all knockout matches completed' });
      }

      const winners = currentRoundMatches.map(m => {
        if (m.home_score > m.away_score) return { id: m.home_team_id };
        if (m.away_score > m.home_score) return { id: m.away_team_id };
        return null;
      }).filter(w => w !== null);

      if (winners.length === 1) {
        return Response.json({ message: 'Competition completed', winner: winners[0] });
      }

      const nextMatchday = currentMatchday + 1;
      const nextMatches = [];

      for (let i = 0; i < winners.length; i += 2) {
        if (winners[i] && winners[i + 1]) {
          nextMatches.push({
            league_id: match.league_id,
            competition_id: comp.id,
            season: match.season,
            matchday: nextMatchday,
            stage: winners.length === 2 ? 'final' : 
                   winners.length === 4 ? 'semifinal' : 
                   winners.length === 8 ? 'quarterfinal' : 'knockout',
            home_team_id: winners[i].id,
            away_team_id: winners[i + 1].id,
            status: 'scheduled'
          });
        }
      }

      if (nextMatches.length > 0) {
        await base44.asServiceRole.entities.Match.bulkCreate(nextMatches);
      }

      return Response.json({ 
        success: true, 
        phase: 'knockout',
        nextRound: nextMatchday,
        matchesCreated: nextMatches.length 
      });
    }

    // Altrimenti, genera la fase knockout dai gironi
    // Calcola le classifiche dei gironi
    const groups = {};
    groupMatches.forEach(m => {
      if (!groups[m.stage]) groups[m.stage] = {};
      
      // Aggiorna statistiche squadra casa
      if (!groups[m.stage][m.home_team_id]) {
        groups[m.stage][m.home_team_id] = {
          id: m.home_team_id,
          points: 0,
          gf: 0,
          ga: 0,
          gd: 0
        };
      }
      
      // Aggiorna statistiche squadra ospite
      if (!groups[m.stage][m.away_team_id]) {
        groups[m.stage][m.away_team_id] = {
          id: m.away_team_id,
          points: 0,
          gf: 0,
          ga: 0,
          gd: 0
        };
      }

      const homeStats = groups[m.stage][m.home_team_id];
      const awayStats = groups[m.stage][m.away_team_id];

      homeStats.gf += m.home_score || 0;
      homeStats.ga += m.away_score || 0;
      awayStats.gf += m.away_score || 0;
      awayStats.ga += m.home_score || 0;

      if (m.home_score > m.away_score) {
        homeStats.points += 3;
      } else if (m.away_score > m.home_score) {
        awayStats.points += 3;
      } else {
        homeStats.points += 1;
        awayStats.points += 1;
      }

      homeStats.gd = homeStats.gf - homeStats.ga;
      awayStats.gd = awayStats.gf - awayStats.ga;
    });

    // Prendi le prime 2 di ogni girone
    const qualifiedTeams = [];
    Object.keys(groups).forEach(groupName => {
      const standings = Object.values(groups[groupName])
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          if (b.gd !== a.gd) return b.gd - a.gd;
          return b.gf - a.gf;
        });
      
      qualifiedTeams.push(...standings.slice(0, 2).map(t => t.id));
    });

    // Shuffle per accoppiamenti casuali
    const shuffled = qualifiedTeams.sort(() => Math.random() - 0.5);
    
    const knockoutRound = [];
    const maxGroupMatchday = Math.max(...groupMatches.map(m => m.matchday));

    for (let i = 0; i < shuffled.length; i += 2) {
      if (shuffled[i] && shuffled[i + 1]) {
        knockoutRound.push({
          league_id: match.league_id,
          competition_id: comp.id,
          season: match.season,
          matchday: maxGroupMatchday + 1,
          stage: shuffled.length >= 16 ? 'round_of_16' : 
                 shuffled.length >= 8 ? 'quarterfinal' : 
                 shuffled.length >= 4 ? 'semifinal' : 'final',
          home_team_id: shuffled[i],
          away_team_id: shuffled[i + 1],
          status: 'scheduled'
        });
      }
    }

    if (knockoutRound.length > 0) {
      await base44.asServiceRole.entities.Match.bulkCreate(knockoutRound);
    }

    return Response.json({ 
      success: true, 
      phase: 'knockout_created',
      matchesCreated: knockoutRound.length 
    });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});