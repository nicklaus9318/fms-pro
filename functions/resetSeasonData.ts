import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const batchSize = 20;
    
    // 1. Elimina tutte le partite in batch
    const allMatches = await base44.asServiceRole.entities.Match.list();
    for (let i = 0; i < allMatches.length; i += batchSize) {
      const batch = allMatches.slice(i, i + batchSize);
      await Promise.all(batch.map(m => base44.asServiceRole.entities.Match.delete(m.id)));
      if (i + batchSize < allMatches.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // 2. Elimina tutti i trasferimenti in batch
    const allTransfers = await base44.asServiceRole.entities.Transfer.list();
    for (let i = 0; i < allTransfers.length; i += batchSize) {
      const batch = allTransfers.slice(i, i + batchSize);
      await Promise.all(batch.map(t => base44.asServiceRole.entities.Transfer.delete(t.id)));
      if (i + batchSize < allTransfers.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // 3. Elimina tutte le aste in batch
    const allAuctions = await base44.asServiceRole.entities.Auction.list();
    for (let i = 0; i < allAuctions.length; i += batchSize) {
      const batch = allAuctions.slice(i, i + batchSize);
      await Promise.all(batch.map(a => base44.asServiceRole.entities.Auction.delete(a.id)));
      if (i + batchSize < allAuctions.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // 4. Elimina tutte le offerte in batch
    const allBids = await base44.asServiceRole.entities.Bid.list();
    for (let i = 0; i < allBids.length; i += batchSize) {
      const batch = allBids.slice(i, i + batchSize);
      await Promise.all(batch.map(b => base44.asServiceRole.entities.Bid.delete(b.id)));
      if (i + batchSize < allBids.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // 5. Elimina tutte le transazioni di budget in batch
    const allTransactions = await base44.asServiceRole.entities.BudgetTransaction.list();
    for (let i = 0; i < allTransactions.length; i += batchSize) {
      const batch = allTransactions.slice(i, i + batchSize);
      await Promise.all(batch.map(t => base44.asServiceRole.entities.BudgetTransaction.delete(t.id)));
      if (i + batchSize < allTransactions.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // 6. Reimposta i budget delle squadre al valore iniziale in batch
    const allTeams = await base44.asServiceRole.entities.Team.list();
    let teamsUpdated = 0;
    for (let i = 0; i < allTeams.length; i += batchSize) {
      const batch = allTeams.slice(i, i + batchSize);
      await Promise.all(
        batch.map(team => 
          base44.asServiceRole.entities.Team.update(team.id, {
            budget: team.initial_budget || 100000000
          })
        )
      );
      teamsUpdated += batch.length;
      if (i + batchSize < allTeams.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // 7. Azzera statistiche giocatori in batch
    const allPlayers = await base44.asServiceRole.entities.Player.list();
    let playersUpdated = 0;
    for (let i = 0; i < allPlayers.length; i += batchSize) {
      const batch = allPlayers.slice(i, i + batchSize);
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
      if (i + batchSize < allPlayers.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // 8. Elimina tutti i player_statuses (squalifiche/infortuni)
    const allPlayerStatuses = await base44.asServiceRole.entities.PlayerStatus.list();
    let playerStatusesDeleted = 0;
    for (let i = 0; i < allPlayerStatuses.length; i += batchSize) {
      const batch = allPlayerStatuses.slice(i, i + batchSize);
      await Promise.all(batch.map(s => base44.asServiceRole.entities.PlayerStatus.delete(s.id)));
      playerStatusesDeleted += batch.length;
      if (i + batchSize < allPlayerStatuses.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    // 9. Azzera classifiche
    const allStandings = await base44.asServiceRole.entities.Standing.list();
    let standingsUpdated = 0;
    for (let i = 0; i < allStandings.length; i += batchSize) {
      const batch = allStandings.slice(i, i + batchSize);
      await Promise.all(
        batch.map(standing =>
          base44.asServiceRole.entities.Standing.update(standing.id, {
            points: 0, played: 0, won: 0, drawn: 0, lost: 0,
            goals_for: 0, goals_against: 0
          })
        )
      );
      standingsUpdated += batch.length;
      if (i + batchSize < allStandings.length) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    return Response.json({
      success: true,
      details: {
        matchesDeleted: allMatches.length,
        transfersDeleted: allTransfers.length,
        auctionsDeleted: allAuctions.length,
        bidsDeleted: allBids.length,
        transactionsDeleted: allTransactions.length,
        teamsReset: teamsUpdated,
        playersReset: playersUpdated,
        playerStatusesDeleted,
        standingsReset: standingsUpdated
      }
    });
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});