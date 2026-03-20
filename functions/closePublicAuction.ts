import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const { auction_id } = await req.json();

        // Recupera l'asta
        const auctions = await base44.asServiceRole.entities.Auction.filter({ id: auction_id });
        if (auctions.length === 0) {
            return Response.json({ error: 'Asta non trovata' }, { status: 404 });
        }

        const auction = auctions[0];

        if (auction.status !== 'active') {
            return Response.json({ error: 'Asta già chiusa' }, { status: 400 });
        }

        // Verifica se c'è un vincitore
        if (!auction.current_winner_team_id) {
            // Nessuna offerta ricevuta - annulla l'asta
            await base44.asServiceRole.entities.Auction.update(auction_id, {
                status: 'cancelled'
            });
            return Response.json({ 
                success: true, 
                message: 'Asta annullata: nessuna offerta ricevuta' 
            });
        }

        // Recupera giocatore, squadra venditrice e squadra vincitrice
        const [player] = await base44.asServiceRole.entities.Player.filter({ id: auction.player_id });
        const [winnerTeam] = await base44.asServiceRole.entities.Team.filter({ id: auction.current_winner_team_id });
        
        if (!player) {
            return Response.json({ error: 'Giocatore non trovato' }, { status: 404 });
        }

        // Trasferisci il giocatore alla squadra vincitrice
        await base44.asServiceRole.entities.Player.update(player.id, {
            team_id: auction.current_winner_team_id
        });

        // Scala i soldi dalla squadra vincitrice
        const newWinnerBudget = (parseFloat(winnerTeam.budget) || 0) - auction.current_price;
        await base44.asServiceRole.entities.Team.update(winnerTeam.id, {
            budget: newWinnerBudget
        });

        // Crea transazione per la squadra vincitrice
        await base44.asServiceRole.entities.BudgetTransaction.create({
            team_id: winnerTeam.id,
            team_name: winnerTeam.name,
            amount: -auction.current_price,
            type: 'auction_win',
            description: `Acquisto all'asta: ${auction.player_name}`,
            related_player_id: player.id,
            related_player_name: auction.player_name,
            previous_balance: parseFloat(winnerTeam.budget) || 0,
            new_balance: newWinnerBudget
        });

        // Se c'è una squadra venditrice, aggiungi i soldi
        if (auction.seller_team_id) {
            const [sellerTeam] = await base44.asServiceRole.entities.Team.filter({ id: auction.seller_team_id });
            if (sellerTeam) {
                const newSellerBudget = (parseFloat(sellerTeam.budget) || 0) + auction.current_price;
                await base44.asServiceRole.entities.Team.update(sellerTeam.id, {
                    budget: newSellerBudget
                });

                // Crea transazione per la squadra venditrice
                await base44.asServiceRole.entities.BudgetTransaction.create({
                    team_id: sellerTeam.id,
                    team_name: sellerTeam.name,
                    amount: auction.current_price,
                    type: 'auction_sale',
                    description: `Vendita all'asta: ${auction.player_name}`,
                    related_player_id: player.id,
                    related_player_name: auction.player_name,
                    previous_balance: parseFloat(sellerTeam.budget) || 0,
                    new_balance: newSellerBudget
                });
            }
        }

        // Marca l'offerta vincente
        const bids = await base44.asServiceRole.entities.Bid.filter({ auction_id: auction_id });
        const winningBid = bids.find(b => b.team_id === auction.current_winner_team_id && b.amount === auction.current_price);
        if (winningBid) {
            await base44.asServiceRole.entities.Bid.update(winningBid.id, { is_winning: true });
        }

        // Chiudi l'asta
        await base44.asServiceRole.entities.Auction.update(auction_id, {
            status: 'completed'
        });

        return Response.json({
            success: true,
            winner: auction.current_winner_team_name,
            price: auction.current_price,
            player: auction.player_name
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});