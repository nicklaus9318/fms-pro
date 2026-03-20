import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy } from "lucide-react";

export default function KnockoutBracket({ matches, teams, competition }) {
  // Raggruppa le partite per turno (matchday)
  const matchesByRound = matches.reduce((acc, match) => {
    if (!acc[match.matchday]) {
      acc[match.matchday] = [];
    }
    acc[match.matchday].push(match);
    return acc;
  }, {});

  const rounds = Object.keys(matchesByRound)
    .sort((a, b) => Number(a) - Number(b))
    .map(key => ({
      matchday: Number(key),
      matches: matchesByRound[key],
      stage: matchesByRound[key][0]?.stage || 'knockout'
    }));

  const getTeam = (teamId) => teams.find(t => t.id === teamId);

  const getWinner = (match) => {
    if (match.status !== 'completed') return null;
    if (match.home_score > match.away_score) return match.home_team_id;
    if (match.away_score > match.home_score) return match.away_team_id;
    return null;
  };

  const getStageName = (stage, matchCount) => {
    if (stage === 'final') return 'Finale';
    if (stage === 'semifinal') return 'Semifinali';
    if (stage === 'quarterfinal') return 'Quarti di Finale';
    if (stage === 'round_of_16') return 'Ottavi di Finale';
    
    // Calcola dal numero di partite
    if (matchCount === 1) return 'Finale';
    if (matchCount === 2) return 'Semifinali';
    if (matchCount === 4) return 'Quarti di Finale';
    if (matchCount === 8) return 'Ottavi di Finale';
    if (matchCount === 16) return 'Sedicesimi di Finale';
    
    return `Turno ${matchCount}`;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-r from-red-600 to-red-700 text-white border-0">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Trophy className="w-8 h-8" />
          </div>
          <CardTitle className="text-2xl">Tabellone ad Eliminazione Diretta</CardTitle>
          <p className="text-red-100">{competition?.name || 'Competizione'}</p>
        </CardHeader>
      </Card>

      {/* Tabellone orizzontale scorrevole */}
      <div className="overflow-x-auto pb-4">
        <div className="flex gap-8 min-w-max">
          {rounds.map((round, roundIdx) => (
            <div key={round.matchday} className="flex flex-col gap-4 min-w-[280px]">
              {/* Intestazione turno */}
              <div className="text-center sticky top-0 bg-slate-50 py-2 rounded-lg">
                <h3 className="text-lg font-bold text-slate-800">
                  {getStageName(round.stage, round.matches.length)}
                </h3>
                <p className="text-xs text-slate-500">Turno {round.matchday}</p>
              </div>

              {/* Partite del turno */}
              <div className="flex flex-col gap-4 justify-center">
                {round.matches.map((match, matchIdx) => {
                  const homeTeam = getTeam(match.home_team_id);
                  const awayTeam = getTeam(match.away_team_id);
                  const winnerId = getWinner(match);
                  const isCompleted = match.status === 'completed';

                  return (
                    <Card 
                      key={match.id}
                      className={`border-2 transition-all ${
                        isCompleted 
                          ? 'border-emerald-500 bg-emerald-50/50' 
                          : 'border-slate-200 bg-white'
                      }`}
                    >
                      <CardContent className="p-4 space-y-2">
                        {/* Squadra Casa */}
                        <div 
                          className={`flex items-center gap-3 p-2 rounded-lg transition-all ${
                            winnerId === match.home_team_id 
                              ? 'bg-emerald-100 border-2 border-emerald-500' 
                              : 'bg-slate-50'
                          }`}
                        >
                          <div 
                            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: homeTeam?.primary_color || '#10B981' }}
                          >
                            {homeTeam?.logo_url ? (
                              <img 
                                src={homeTeam.logo_url} 
                                alt={homeTeam.name} 
                                className="w-8 h-8 object-contain"
                              />
                            ) : (
                              <span className="text-white font-bold text-sm">
                                {homeTeam?.name?.charAt(0) || '?'}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-slate-800 truncate">
                              {homeTeam?.name || 'TBD'}
                            </p>
                          </div>
                          {isCompleted && (
                            <div className="flex items-center gap-2">
                              <span className={`text-xl font-bold ${
                                winnerId === match.home_team_id ? 'text-emerald-600' : 'text-slate-400'
                              }`}>
                                {match.home_score}
                              </span>
                              {winnerId === match.home_team_id && (
                                <Trophy className="w-4 h-4 text-amber-500" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Squadra Ospite */}
                        <div 
                          className={`flex items-center gap-3 p-2 rounded-lg transition-all ${
                            winnerId === match.away_team_id 
                              ? 'bg-emerald-100 border-2 border-emerald-500' 
                              : 'bg-slate-50'
                          }`}
                        >
                          <div 
                            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: awayTeam?.primary_color || '#3B82F6' }}
                          >
                            {awayTeam?.logo_url ? (
                              <img 
                                src={awayTeam.logo_url} 
                                alt={awayTeam.name} 
                                className="w-8 h-8 object-contain"
                              />
                            ) : (
                              <span className="text-white font-bold text-sm">
                                {awayTeam?.name?.charAt(0) || '?'}
                              </span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-slate-800 truncate">
                              {awayTeam?.name || 'TBD'}
                            </p>
                          </div>
                          {isCompleted && (
                            <div className="flex items-center gap-2">
                              <span className={`text-xl font-bold ${
                                winnerId === match.away_team_id ? 'text-emerald-600' : 'text-slate-400'
                              }`}>
                                {match.away_score}
                              </span>
                              {winnerId === match.away_team_id && (
                                <Trophy className="w-4 h-4 text-amber-500" />
                              )}
                            </div>
                          )}
                        </div>

                        {/* Status Badge */}
                        <div className="flex justify-center pt-1">
                          {isCompleted ? (
                            <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                              Completata
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Da giocare
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <Card className="bg-slate-50 border-dashed">
        <CardContent className="p-4 text-center text-sm text-slate-600">
          <p>Il tabellone avanza automaticamente quando tutte le partite di un turno vengono completate</p>
        </CardContent>
      </Card>
    </div>
  );
}