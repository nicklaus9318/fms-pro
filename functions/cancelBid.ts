import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { bid_id } = await req.json();

        if (!bid_id) {
            return Response.json({ error: 'bid_id richiesto' }, { status: 400 });
        }

        // Recupera l'offerta
        const bids = await base44.entities.Bid.filter({ id: bid_id });
        const bid = bids[0];

        if (!bid) {
            return Response.json({ error: 'Offerta non trovata' }, { status: 404 });
        }

        // Recupera l'asta
        const auctions = await base44.entities.Auction.filter({ id: bid.auction_id });
        const auction = auctions[0];

        if (!auction) {
            return Response.json({ error: 'Asta non trovata' }, { status: 404 });
        }

        // Recupera la squadra dell'utente
        const teams = await base44.entities.Team.filter({ owner_email: user.email });
        const myTeam = teams[0];

        // Verifica permessi: solo il proprietario dell'offerta o un admin può annullarla
        const isAdmin = user.role === 'admin';
        const isOwner = myTeam && bid.team_id === myTeam.id;

        if (!isAdmin && !isOwner) {
            return Response.json({ error: 'Non hai i permessi per annullare questa offerta' }, { status: 403 });
        }

        // Verifica che l'asta sia ancora attiva
        if (auction.status !== 'active') {
            return Response.json({ error: 'Non puoi annullare un\'offerta per un\'asta chiusa' }, { status: 400 });
        }

        // Verifica che l'offerta non sia già annullata
        if (bid.status === 'cancelled') {
            return Response.json({ error: 'Questa offerta è già stata annullata' }, { status: 400 });
        }

        // Annulla l'offerta
        await base44.asServiceRole.entities.Bid.update(bid_id, {
            status: 'cancelled'
        });

        // Se è un'asta pubblica e l'offerta annullata era quella vincente, dobbiamo ricalcolare il vincitore
        if (auction.auction_type === 'public' && bid.team_id === auction.current_winner_team_id) {
            // Recupera tutte le offerte attive per questa asta
            const allBids = await base44.asServiceRole.entities.Bid.filter({ 
                auction_id: auction.id
            });
            
            const activeBids = allBids.filter(b => b.status === 'active' && b.id !== bid_id);
            
            if (activeBids.length > 0) {
                // Trova l'offerta più alta
                const sortedBids = activeBids.sort((a, b) => b.amount - a.amount);
                const newWinningBid = sortedBids[0];
                
                // Aggiorna l'asta con il nuovo vincitore
                await base44.asServiceRole.entities.Auction.update(auction.id, {
                    current_price: newWinningBid.amount,
                    current_winner_team_id: newWinningBid.team_id,
                    current_winner_team_name: newWinningBid.team_name
                });
            } else {
                // Nessuna offerta rimasta, riporta al prezzo di partenza
                await base44.asServiceRole.entities.Auction.update(auction.id, {
                    current_price: auction.starting_price,
                    current_winner_team_id: null,
                    current_winner_team_name: null
                });
            }
        }

        return Response.json({ 
            success: true, 
            message: 'Offerta annullata con successo',
            auction_type: auction.auction_type
        });
    } catch (error) {
        console.error('Errore annullamento offerta:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});