import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    // Elimina tutti i giocatori uno alla volta per evitare rate limit
    const allPlayers = await base44.asServiceRole.entities.Player.list();
    let deleted = 0;
    
    for (const player of allPlayers) {
      await base44.asServiceRole.entities.Player.delete(player.id);
      deleted++;
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return Response.json({
      success: true,
      details: {
        playersDeleted: allPlayers.length
      }
    });
  } catch (error) {
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});