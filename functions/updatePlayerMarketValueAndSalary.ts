import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { players } = await req.json();

    if (!players || !Array.isArray(players) || players.length === 0) {
      return Response.json({ error: 'Array di giocatori obbligatorio' }, { status: 400 });
    }

    const results = { updated: 0, skipped: 0, errors: [] };

    // Funzione calcolo valore mercato basata su overall e age
    const calculateValue = (overall, age) => {
      if (!overall || overall < 40) return 500000;
      // Overall 90+ età 23-28 → fino a 150M
      if (overall >= 90 && age >= 23 && age <= 28) {
        const v = 80000000 + (overall - 90) * 14000000 + (28 - Math.abs(age - 25)) * 1000000;
        return Math.min(150000000, v);
      }
      // Overall 85-89 età <25 → fino a 50M
      if (overall >= 85 && overall < 90 && age < 25) {
        const v = 20000000 + (overall - 85) * 6000000 + (25 - age) * 1000000;
        return Math.min(50000000, v);
      }
      // Overall 85+ senior → fino a 80M
      if (overall >= 85) {
        const v = 30000000 + (overall - 85) * 7000000;
        return Math.min(80000000, v);
      }
      // Overall 80-85 → fino a 50M
      if (overall >= 80) {
        const v = 10000000 + (overall - 80) * 8000000;
        return Math.min(50000000, v);
      }
      // Overall <80 → fino a 30M
      const v = 1000000 + (overall - 60) * 400000 + Math.max(0, 30 - age) * 200000;
      return Math.max(0, Math.min(30000000, v));
    };

    const calculateSalary = (overall) => {
      if (!overall || overall < 40) return 100000;
      if (overall >= 90) return 10000000;  // max 10M
      if (overall >= 88) return 7000000;
      if (overall >= 85) return 5000000;
      if (overall >= 82) return 3000000;
      if (overall >= 75) return 1500000;
      if (overall >= 65) return 500000;
      return 100000;
    };

    for (const player of players) {
      try {
        if (!player.id) {
          results.skipped++;
          results.errors.push(`Giocatore senza ID: ${player.first_name} ${player.last_name}`);
          continue;
        }

        const overall = player.overall_rating || 0;
        const age = player.age || 25;

        const playerValue = calculateValue(overall, age);
        const salary = calculateSalary(overall);

        await base44.asServiceRole.entities.Player.update(player.id, {
          player_value: playerValue,
          salary: salary
        });

        results.updated++;
      } catch (playerError) {
        results.skipped++;
        results.errors.push(`${player.first_name} ${player.last_name}: ${playerError.message}`);
      }
    }

    return Response.json({
      success: true,
      updated: results.updated,
      skipped: results.skipped,
      errors: results.errors
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
