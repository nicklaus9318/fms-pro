import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json();
    const { confirm_matches, team_id_override, extracted_players, team_id } = body;

    // --- MODALITÀ CONFERMA: applica i match approvati ---
    if (confirm_matches) {
      const { team_id: tid, approved, create_new } = confirm_matches;
      const team = await base44.asServiceRole.entities.Team.get(tid);
      const results = {
        team_name: team.name, team_id: tid,
        players_assigned: [], players_created: [], players_already_in_team: [], errors: []
      };

      for (const match of (approved || [])) {
        try {
          const existingPlayer = await base44.asServiceRole.entities.Player.get(match.player_id);
          if (existingPlayer.team_id !== tid) {
            await base44.asServiceRole.entities.Player.update(match.player_id, { team_id: tid });
            results.players_assigned.push({ id: match.player_id, name: match.extracted_name });
          } else {
            results.players_already_in_team.push({ id: match.player_id, name: match.extracted_name });
          }
        } catch (e) {
          results.errors.push(`Errore assegnando ${match.extracted_name}: ${e.message}`);
        }
      }

      for (const p of (create_new || [])) {
        try {
          const newPlayer = await base44.asServiceRole.entities.Player.create({
            first_name: p.first_name, last_name: p.last_name,
            age: p.age || null, overall_rating: p.overall_rating || null,
            team_id: tid, status: 'pending', role: 'ATT'
          });
          results.players_created.push({ id: newPlayer.id, name: `${p.first_name} ${p.last_name}`, status: 'pending' });
        } catch (e) {
          results.errors.push(`Errore creando ${p.first_name} ${p.last_name}: ${e.message}`);
        }
      }

      return Response.json({ success: true, mode: 'confirmed', ...results });
    }

    // --- MODALITÀ MATCH: cerca giocatori estratti nel DB ---
    // Questa modalità riceve i giocatori già estratti (dal frontend con AI)
    if (extracted_players && team_id) {
      const team = await base44.asServiceRole.entities.Team.get(team_id);
      if (!team) {
        return Response.json({ success: false, error: 'Squadra non trovata' });
      }

      const allPlayers = await base44.asServiceRole.entities.Player.list();
      const matchCandidates = [];

      for (const extractedPlayer of extracted_players) {
        const { first_name, last_name, age, overall_rating } = extractedPlayer;
        if (!last_name) continue;

        const fullName = `${first_name || ''} ${last_name}`.toLowerCase().trim();

        const exactMatch = allPlayers.find(p => {
          const pFullName = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase().trim();
          return pFullName === fullName;
        });

        const fuzzyMatches = exactMatch ? [] : allPlayers.filter(p => {
          const pLastName = (p.last_name || '').toLowerCase().trim();
          const extractedLastName = last_name.toLowerCase().trim();
          return pLastName === extractedLastName ||
            pLastName.includes(extractedLastName) ||
            extractedLastName.includes(pLastName);
        }).slice(0, 3);

        matchCandidates.push({
          extracted: { first_name, last_name, age, overall_rating },
          exact_match: exactMatch ? {
            id: exactMatch.id,
            name: `${exactMatch.first_name} ${exactMatch.last_name}`,
            age: exactMatch.age, overall_rating: exactMatch.overall_rating, team_id: exactMatch.team_id
          } : null,
          fuzzy_matches: fuzzyMatches.map(p => ({
            id: p.id, name: `${p.first_name} ${p.last_name}`,
            age: p.age, overall_rating: p.overall_rating, team_id: p.team_id
          }))
        });
      }

      return Response.json({
        success: true, mode: 'preview',
        team_name: team.name, team_id: team.id,
        match_candidates: matchCandidates
      });
    }

    return Response.json({
      success: false,
      error: 'Parametri mancanti. Invia extracted_players e team_id, oppure confirm_matches.'
    }, { status: 400 });

  } catch (error) {
    console.error('Error processing team screenshot:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
