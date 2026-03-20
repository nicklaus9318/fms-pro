import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        // Admin-only access
        if (!user || user.role !== 'admin') {
            return new Response(JSON.stringify({ error: 'Unauthorized: Admin access required' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Find all players currently on loan
        const playersOnLoan = await base44.asServiceRole.entities.Player.filter({ is_on_loan: true });

        if (playersOnLoan.length === 0) {
            return new Response(JSON.stringify({ message: 'Nessun giocatore in prestito da terminare.' }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const operations = playersOnLoan.map(player =>
            base44.asServiceRole.entities.Player.update(player.id, {
                is_on_loan: false,
                loan_from_team_id: null
            })
        );

        await Promise.all(operations);

        return new Response(JSON.stringify({
            message: `Terminati ${playersOnLoan.length} prestiti con successo.`,
            updatedPlayerIds: playersOnLoan.map(p => p.id)
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error ending loans:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
});