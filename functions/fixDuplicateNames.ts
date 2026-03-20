import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Unauthorized - Admin only' }, { status: 403 });
    }

    const allPlayers = await base44.asServiceRole.entities.Player.list();
    let fixed = 0;

    for (const player of allPlayers) {
      if (player.first_name && player.last_name) {
        // Check if last_name starts with first_name
        const lastNameLower = player.last_name.toLowerCase();
        const firstNameLower = player.first_name.toLowerCase();
        
        if (lastNameLower.startsWith(firstNameLower + ' ') || lastNameLower === firstNameLower) {
          // Remove first_name from the beginning of last_name
          let newLastName = player.last_name;
          if (lastNameLower.startsWith(firstNameLower + ' ')) {
            newLastName = player.last_name.substring(player.first_name.length + 1);
          }
          
          await base44.asServiceRole.entities.Player.update(player.id, {
            first_name: '',
            last_name: newLastName
          });
          fixed++;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return Response.json({
      success: true,
      message: `Fixed ${fixed} players with duplicate names`,
      details: {
        totalPlayers: allPlayers.length,
        playersFixed: fixed
      }
    });

  } catch (error) {
    return Response.json({ 
      error: error.message,
      success: false 
    }, { status: 500 });
  }
});