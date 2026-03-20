import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { auction_id } = await req.json();
    if (!auction_id) {
      return Response.json({ error: 'auction_id è obbligatorio' }, { status: 400 });
    }

    // Recupera l'asta
    const auctions = await base44.asServiceRole.entities.Auction.filter({ id: auction_id });
    const auction = auctions[0];
    if (!auction) {
      return Response.json({ error: 'Asta non trovata' }, { status: 404 });
    }
    if (auction.status !== 'active') {
      return Response.json({ error: 'Asta già chiusa' }, { status: 400 });
    }

    // Recupera tutte le offerte attive per questa asta
    const allBidsForAuction = await base44.asServiceRole.entities.Bid.filter({ 
      auction_id: auction_id
    });
    const bids = allBidsForAuction.filter(b => b.status === 'active');

    if (bids.length === 0) {
      // Nessuna offerta: elimina l'asta direttamente
      await base44.asServiceRole.entities.Auction.delete(auction_id);
      return Response.json({ 
        success: true, 
        winner: null, 
        message: 'Asta senza offerte eliminata automaticamente' 
      });
    }

    // Ordina le offerte: prima per importo decrescente, poi per data crescente (chi ha offerto prima vince in caso di parità)
    const sortedBids = [...bids].sort((a, b) => {
      if (b.amount !== a.amount) return b.amount - a.amount;
      return new Date(a.bid_time || a.created_date) - new Date(b.bid_time || b.created_date);
    });

    // Recupera tutte le squadre per verificare il budget
    const teams = await base44.asServiceRole.entities.Team.list();

    let winner = null;

    // Trova il vincitore valido (con budget sufficiente)
    for (const bid of sortedBids) {
      const team = teams.find(t => t.id === bid.team_id);
      if (!team) continue;

      if (bid.amount <= (team.budget || 0)) {
        winner = { bid, team };
        break;
      }
    }

    if (winner) {
      const { bid, team } = winner;

      // Assegna il giocatore alla squadra vincitrice
      await base44.asServiceRole.entities.Player.update(auction.player_id, {
        team_id: team.id,
        is_on_loan: false,
        loan_from_team_id: null
      });

      // Sottrai il budget dalla squadra vincitrice
      const newBudget = (team.budget || 0) - bid.amount;
      await base44.asServiceRole.entities.Team.update(team.id, { budget: newBudget });

      // Registra transazione di budget
      await base44.asServiceRole.entities.BudgetTransaction.create({
        team_id: team.id,
        team_name: team.name,
        amount: -bid.amount,
        type: 'auction_win',
        description: `Asta busta chiusa: ${auction.player_name}`,
        related_player_id: auction.player_id,
        related_player_name: auction.player_name,
        previous_balance: team.budget || 0,
        new_balance: newBudget,
        league_id: team.league_id || null
      });

      // Chiudi l'asta con il vincitore
      await base44.asServiceRole.entities.Auction.update(auction_id, {
        status: 'completed',
        current_winner_team_id: team.id,
        current_winner_team_name: team.name,
        current_price: bid.amount
      });

      // Marca l'offerta vincente
      await base44.asServiceRole.entities.Bid.update(bid.id, { is_winning: true });

      return Response.json({
        success: true,
        winner: {
          team_name: team.name,
          amount: bid.amount
        },
        message: `Vince ${team.name} con €${bid.amount}`
      });

    } else {
      // Nessun vincitore valido (tutti senza budget)
      await base44.asServiceRole.entities.Auction.update(auction_id, { status: 'cancelled' });
      return Response.json({
        success: true,
        winner: null,
        message: 'Asta chiusa: nessuna squadra con budget sufficiente'
      });
    }

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});