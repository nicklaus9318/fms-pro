import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    console.log('🎯 processMatchResults invoked:', { event, matchId: data?.id });

    const match = await base44.asServiceRole.entities.Match.get(data.id);

    if (!match) {
      return Response.json({ success: false, error: 'Match not found' }, { status: 404 });
    }

    if (match.status !== 'completed' || match.home_score == null || match.away_score == null) {
      return Response.json({ success: true, message: 'Match not completed or scores missing' });
    }

    const home_score = match.home_score;
    const away_score = match.away_score;

    const homeTeam = await base44.asServiceRole.entities.Team.get(match.home_team_id);
    const awayTeam = await base44.asServiceRole.entities.Team.get(match.away_team_id);

    if (!homeTeam || !awayTeam) {
      return Response.json({ success: false, error: 'Teams not found' }, { status: 404 });
    }

    // Premi fissi (configurabili qui se necessario)
    const PRIZE_WIN = 0;      // Premio vittoria squadra
    const PRIZE_DRAW = 0;     // Premio pareggio squadra
    const PRIZE_LOSS = 0;     // Premio sconfitta squadra
    const PRIZE_GOAL = 0;     // Premio per gol segnato
    const PRIZE_CLEAN_SHEET = 0; // Premio clean sheet
    const PRIZE_MVP = 0;      // Premio MVP individuale

    let homeReward = 0;
    let awayReward = 0;
    const homeTransactions = [];
    const awayTransactions = [];

    // Premio vittoria/pareggio/sconfitta
    if (home_score > away_score) {
      if (PRIZE_WIN > 0) { homeReward += PRIZE_WIN; homeTransactions.push({ amount: PRIZE_WIN, desc: `Vittoria vs ${awayTeam.name}` }); }
      if (PRIZE_LOSS > 0) { awayReward += PRIZE_LOSS; awayTransactions.push({ amount: PRIZE_LOSS, desc: `Sconfitta vs ${homeTeam.name}` }); }
    } else if (away_score > home_score) {
      if (PRIZE_WIN > 0) { awayReward += PRIZE_WIN; awayTransactions.push({ amount: PRIZE_WIN, desc: `Vittoria vs ${homeTeam.name}` }); }
      if (PRIZE_LOSS > 0) { homeReward += PRIZE_LOSS; homeTransactions.push({ amount: PRIZE_LOSS, desc: `Sconfitta vs ${awayTeam.name}` }); }
    } else {
      if (PRIZE_DRAW > 0) {
        homeReward += PRIZE_DRAW; homeTransactions.push({ amount: PRIZE_DRAW, desc: `Pareggio vs ${awayTeam.name}` });
        awayReward += PRIZE_DRAW; awayTransactions.push({ amount: PRIZE_DRAW, desc: `Pareggio vs ${homeTeam.name}` });
      }
    }

    // Premio gol
    if (PRIZE_GOAL > 0) {
      if (home_score > 0) { homeReward += PRIZE_GOAL * home_score; homeTransactions.push({ amount: PRIZE_GOAL * home_score, desc: `Bonus ${home_score} gol` }); }
      if (away_score > 0) { awayReward += PRIZE_GOAL * away_score; awayTransactions.push({ amount: PRIZE_GOAL * away_score, desc: `Bonus ${away_score} gol` }); }
    }

    // Premio clean sheet
    if (PRIZE_CLEAN_SHEET > 0) {
      if (away_score === 0) { homeReward += PRIZE_CLEAN_SHEET; homeTransactions.push({ amount: PRIZE_CLEAN_SHEET, desc: `Clean sheet vs ${awayTeam.name}` }); }
      if (home_score === 0) { awayReward += PRIZE_CLEAN_SHEET; awayTransactions.push({ amount: PRIZE_CLEAN_SHEET, desc: `Clean sheet vs ${homeTeam.name}` }); }
    }

    // Premio MVP individuale
    if (PRIZE_MVP > 0 && match.mvp_player_id) {
      try {
        const mvpPlayer = await base44.asServiceRole.entities.Player.get(match.mvp_player_id);
        if (mvpPlayer?.team_id) {
          const mvpTeam = await base44.asServiceRole.entities.Team.get(mvpPlayer.team_id);
          if (mvpTeam) {
            const newBalance = (mvpTeam.budget || 0) + PRIZE_MVP;
            await base44.asServiceRole.entities.BudgetTransaction.create({
              team_id: mvpTeam.id, team_name: mvpTeam.name, amount: PRIZE_MVP,
              type: 'manual_adjustment', description: `Bonus MVP: ${match.mvp_player_name}`,
              related_player_id: mvpPlayer.id, related_player_name: match.mvp_player_name,
              previous_balance: mvpTeam.budget || 0, new_balance: newBalance, league_id: match.league_id
            });
            await base44.asServiceRole.entities.Team.update(mvpTeam.id, { budget: newBalance });
          }
        }
      } catch (e) { console.log('MVP prize error:', e.message); }
    }

    // Applica premi squadra casa
    if (homeReward > 0) {
      let currentBalance = homeTeam.budget || 0;
      for (const tx of homeTransactions) {
        const newBalance = currentBalance + tx.amount;
        await base44.asServiceRole.entities.BudgetTransaction.create({
          team_id: homeTeam.id, team_name: homeTeam.name, amount: tx.amount,
          type: 'manual_adjustment', description: tx.desc,
          previous_balance: currentBalance, new_balance: newBalance, league_id: match.league_id
        });
        currentBalance = newBalance;
      }
      await base44.asServiceRole.entities.Team.update(homeTeam.id, { budget: currentBalance });
    }

    // Applica premi squadra ospite
    if (awayReward > 0) {
      let currentBalance = awayTeam.budget || 0;
      for (const tx of awayTransactions) {
        const newBalance = currentBalance + tx.amount;
        await base44.asServiceRole.entities.BudgetTransaction.create({
          team_id: awayTeam.id, team_name: awayTeam.name, amount: tx.amount,
          type: 'manual_adjustment', description: tx.desc,
          previous_balance: currentBalance, new_balance: newBalance, league_id: match.league_id
        });
        currentBalance = newBalance;
      }
      await base44.asServiceRole.entities.Team.update(awayTeam.id, { budget: currentBalance });
    }

    return Response.json({
      success: true,
      homeReward,
      awayReward,
      message: `Premi assegnati: ${homeTeam.name} €${homeReward}, ${awayTeam.name} €${awayReward}`
    });

  } catch (error) {
    console.error('Error processing match results:', error);
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
});
