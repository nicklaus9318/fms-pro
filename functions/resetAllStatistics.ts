import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const batchSize = 20;
    let playersUpdated = 0;
    let standingsUpdated = 0;
    let playerStatusesDeleted = 0;

    // 1. Azzera statistiche giocatori in batch
    const players = await base44.asServiceRole.entities.Player.list();
    for (let i = 0; i < players.length; i += batchSize) {
      const batch = players.slice(i, i + batchSize);
      await Promise.all(
        batch.map(player =>
          base44.asServiceRole.entities.Player.update(player.id, {
            goals: 0,
            assists: 0,
            mvp_count: 0,
            yellow_cards_accumulated: 0,
            player_status: 'available',
            suspension_end_date: null,
            injury_end_date: null
          })
        )
      );
      playersUpdated += batch.length;
      if (i + batchSize < players.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // 2. Azzera classifiche in batch
    const standings = await base44.asServiceRole.entities.Standing.list();
    for (let i = 0; i < standings.length; i += batchSize) {
      const batch = standings.slice(i, i + batchSize);
      await Promise.all(
        batch.map(standing =>
          base44.asServiceRole.entities.Standing.update(standing.id, {
            points: 0,
            played: 0,
            won: 0,
            drawn: 0,
            lost: 0,
            goals_for: 0,
            goals_against: 0
          })
        )
      );
      standingsUpdated += batch.length;
      if (i + batchSize < standings.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // 3. Cancella tutti gli stati dei giocatori in batch
    const playerStatuses = await base44.asServiceRole.entities.PlayerStatus.list();
    for (let i = 0; i < playerStatuses.length; i += batchSize) {
      const batch = playerStatuses.slice(i, i + batchSize);
      await Promise.all(
        batch.map(status =>
          base44.asServiceRole.entities.PlayerStatus.delete(status.id)
        )
      );
      playerStatusesDeleted += batch.length;
      if (i + batchSize < playerStatuses.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    return Response.json({
      success: true,
      message: 'Tutte le statistiche sono state azzerate con successo',
      details: {
        playersUpdated,
        standingsUpdated,
        playerStatusesDeleted
      }
    });

  } catch (error) {
    console.error('Errore nel reset delle statistiche:', error);
    return Response.json({ 
      error: 'Errore nel reset delle statistiche', 
      details: error.message 
    }, { status: 500 });
  }
});