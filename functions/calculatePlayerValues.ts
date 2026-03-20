import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Unauthorized: Admin access required' }, { status: 403 });
        }

        // Recupera tutti i giocatori
        const players = await base44.asServiceRole.entities.Player.list();

        let updated = 0;
        const updates = [];

        // Funzione per calcolare lo stipendio in base all'overall
        const calculateSalary = (overall) => {
            if (!overall || overall < 40) return 100000;
            if (overall >= 88) return 1000000;
            if (overall >= 85) return 700000;
            if (overall >= 82) return 500000;
            if (overall >= 75) return 250000;
            return 100000;
        };

        for (const player of players) {
            const overall = player.overall_rating || 0;
            const age = player.age || 25;
            let playerValue = 0;

            // Se non ha overall rating valido, assegna un valore base minimo
            if (!player.overall_rating || player.overall_rating < 40) {
                playerValue = 500000; // 500k per giocatori senza rating
            }
            // Formula 1: Overall > 85 e età < 25
            else if (overall > 85 && age < 25) {
                playerValue = 30000000 + (overall - 85) * 4000000;
            }
            // Formula 2: Overall >= 80 e < 85 e età < 25
            else if (overall >= 80 && overall <= 85 && age < 25) {
                playerValue = 25000000 - (85 - overall) * 1000000;
            }
            // Formula 3: Overall < 80
            else if (overall < 80) {
                const baseValue = 1000000;
                const overallContribution = (overall - 60) * 400000;
                const ageContribution = (30 - age) * 200000;
                
                const calculatedValue = baseValue + overallContribution + ageContribution;
                playerValue = Math.max(0, Math.min(15000000, calculatedValue));
            }
            // Tutti gli altri casi (overall >= 80 con età >= 25)
            else {
                const baseValue = 15000000;
                const overallContribution = (overall - 80) * 500000;
                const ageContribution = (30 - age) * 300000;
                
                const calculatedValue = baseValue + overallContribution + ageContribution;
                playerValue = Math.max(5000000, Math.min(25000000, calculatedValue));
            }

            // Calcola lo stipendio
            const salary = calculateSalary(overall);

            // Aggiorna se valore o stipendio sono cambiati
            if (player.player_value !== playerValue || player.salary !== salary) {
                await base44.asServiceRole.entities.Player.update(player.id, {
                    player_value: playerValue,
                    salary: salary
                });
                updated++;
                updates.push({
                    id: player.id,
                    name: `${player.first_name} ${player.last_name}`,
                    old_value: player.player_value,
                    new_value: playerValue,
                    old_salary: player.salary,
                    new_salary: salary,
                    overall: overall,
                    age: age
                });
            }
        }

        return Response.json({
            success: true,
            total_players: players.length,
            updated: updated,
            updates: updates
        });

    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});