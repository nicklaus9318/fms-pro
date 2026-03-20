import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, ShieldAlert } from 'lucide-react';

export default function SeasonStats({ matches = [], players = [], playerStatuses = [] }) {
  // Calcola statistiche dalla lista di match completati
  const calculateStats = () => {
    const stats = {
      scorers: {},
      assists: {},
      mvp: {},
      goalkeepers: {},
      injuries: {}
    };
    
    matches.forEach(match => {
      // Marcatori
      if (match.scorers) {
        match.scorers.forEach(scorer => {
          if (!scorer.is_own_goal && scorer.player_name) {
            stats.scorers[scorer.player_name] = (stats.scorers[scorer.player_name] || 0) + 1;
          }
        });
      }

      // Assist
      if (match.assists) {
        match.assists.forEach(assist => {
          if (assist.player_name) {
            stats.assists[assist.player_name] = (stats.assists[assist.player_name] || 0) + 1;
          }
        });
      }

      // MVP
      if (match.mvp_player_name) {
        stats.mvp[match.mvp_player_name] = (stats.mvp[match.mvp_player_name] || 0) + 1;
      }

      // Portieri
      if (match.home_goalkeeper_id && match.home_goalkeeper_rating) {
        const gk = players.find(p => p.id === match.home_goalkeeper_id);
        const gkName = gk ? `${gk.first_name} ${gk.last_name}` : match.home_goalkeeper_id;
        if (!stats.goalkeepers[gkName]) {
          stats.goalkeepers[gkName] = { totalRating: 0, matches: 0 };
        }
        stats.goalkeepers[gkName].totalRating += match.home_goalkeeper_rating;
        stats.goalkeepers[gkName].matches += 1;
      }
      if (match.away_goalkeeper_id && match.away_goalkeeper_rating) {
        const gk = players.find(p => p.id === match.away_goalkeeper_id);
        const gkName = gk ? `${gk.first_name} ${gk.last_name}` : match.away_goalkeeper_id;
        if (!stats.goalkeepers[gkName]) {
          stats.goalkeepers[gkName] = { totalRating: 0, matches: 0 };
        }
        stats.goalkeepers[gkName].totalRating += match.away_goalkeeper_rating;
        stats.goalkeepers[gkName].matches += 1;
      }

    });

    // Aggrega infortuni da PlayerStatus
    playerStatuses
      .filter(ps => ps.status_type === 'injured')
      .forEach(ps => {
        if (ps.player_name) {
          if (!stats.injuries[ps.player_name]) {
            stats.injuries[ps.player_name] = { count: 0, totalDays: 0 };
          }
          stats.injuries[ps.player_name].count += 1;
          stats.injuries[ps.player_name].totalDays += ps.matchdays_remaining || 0;
        }
      });

    return {
      topScorers: Object.entries(stats.scorers)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topAssists: Object.entries(stats.assists)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topMVP: Object.entries(stats.mvp)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
      topGoalkeepers: Object.entries(stats.goalkeepers)
        .map(([name, data]) => ({
          name,
          average: (data.totalRating / data.matches).toFixed(2),
          played: data.matches
        }))
        .sort((a, b) => parseFloat(b.average) - parseFloat(a.average))
        .slice(0, 10),
      topInjuries: Object.entries(stats.injuries)
        .map(([name, data]) => ({
          name,
          count: data.count,
          totalDays: data.totalDays
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    };
  };

  const seasonStats = calculateStats();

  if (matches.length === 0) {
    return null;
  }

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
      {/* Capocannonieri */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            ⚽ Capocannonieri
          </CardTitle>
        </CardHeader>
        <CardContent>
          {seasonStats.topScorers.length > 0 ? (
            <div className="space-y-2">
              {seasonStats.topScorers.slice(0, 5).map((scorer, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-400 w-4">{index + 1}</span>
                    <span className="text-slate-800">{scorer.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{scorer.count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-4">Nessun dato</p>
          )}
        </CardContent>
      </Card>

      {/* Assist */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            🎯 Assist
          </CardTitle>
        </CardHeader>
        <CardContent>
          {seasonStats.topAssists.length > 0 ? (
            <div className="space-y-2">
              {seasonStats.topAssists.slice(0, 5).map((assist, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-400 w-4">{index + 1}</span>
                    <span className="text-slate-800">{assist.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{assist.count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-4">Nessun dato</p>
          )}
        </CardContent>
      </Card>

      {/* MVP */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-500" />
            MVP
          </CardTitle>
        </CardHeader>
        <CardContent>
          {seasonStats.topMVP.length > 0 ? (
            <div className="space-y-2">
              {seasonStats.topMVP.slice(0, 5).map((mvp, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-400 w-4">{index + 1}</span>
                    <span className="text-slate-800">{mvp.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{mvp.count}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-4">Nessun dato</p>
          )}
        </CardContent>
      </Card>

      {/* Portieri */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            🧤 Miglior Portiere
          </CardTitle>
        </CardHeader>
        <CardContent>
          {seasonStats.topGoalkeepers.length > 0 ? (
            <div className="space-y-2">
              {seasonStats.topGoalkeepers.slice(0, 5).map((gk, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-400 w-4">{index + 1}</span>
                    <span className="text-slate-800">{gk.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {gk.average} ({gk.played}P)
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-4">Nessun dato</p>
          )}
        </CardContent>
      </Card>

      {/* Infortuni */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            Infortuni
          </CardTitle>
        </CardHeader>
        <CardContent>
          {seasonStats.topInjuries.length > 0 ? (
            <div className="space-y-2">
              {seasonStats.topInjuries.slice(0, 5).map((injury, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-400 w-4">{index + 1}</span>
                    <span className="text-slate-800">{injury.name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {injury.count} ({injury.totalDays}G)
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-4">Nessun dato</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}