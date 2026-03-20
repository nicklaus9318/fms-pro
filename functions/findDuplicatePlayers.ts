import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
        }

        const { action, playerIdsToDelete } = await req.json();

        // Recupera tutti i giocatori
        const allPlayers = await base44.asServiceRole.entities.Player.list();

        // Trova duplicati basandosi su first_name e last_name
        const duplicateGroups = {};
        
        allPlayers.forEach(player => {
            const key = `${player.first_name?.toLowerCase()}_${player.last_name?.toLowerCase()}`;
            if (!duplicateGroups[key]) {
                duplicateGroups[key] = [];
            }
            duplicateGroups[key].push(player);
        });

        // Filtra solo i gruppi con duplicati (più di 1 giocatore)
        const duplicates = Object.entries(duplicateGroups)
            .filter(([key, players]) => players.length > 1)
            .map(([key, players]) => ({
                name: `${players[0].first_name} ${players[0].last_name}`,
                players: players.map(p => ({
                    id: p.id,
                    first_name: p.first_name,
                    last_name: p.last_name,
                    age: p.age,
                    role: p.role,
                    overall_rating: p.overall_rating,
                    team_id: p.team_id,
                    status: p.status,
                    created_date: p.created_date
                }))
            }));

        // Se l'azione è delete, elimina i giocatori specificati
        if (action === 'delete' && playerIdsToDelete && playerIdsToDelete.length > 0) {
            for (const playerId of playerIdsToDelete) {
                await base44.asServiceRole.entities.Player.delete(playerId);
            }
            
            return Response.json({
                success: true,
                message: `Eliminati ${playerIdsToDelete.length} giocatori duplicati`,
                deletedCount: playerIdsToDelete.length
            });
        }

        // Altrimenti restituisci solo la lista dei duplicati
        return Response.json({
            success: true,
            totalDuplicateGroups: duplicates.length,
            totalDuplicatePlayers: duplicates.reduce((sum, group) => sum + group.players.length, 0),
            duplicates: duplicates
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});