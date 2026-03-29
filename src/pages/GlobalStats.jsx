import { useState } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trophy, Award, AlertCircle, Target, Medal } from 'lucide-react';

export default function GlobalStats() {
  const { data: leagues = [] } = useQuery({
    queryKey: ['leagues'],
    queryFn: async () => { const { data } = await supabase.from('leagues').select('*'); return data || []; }
  });

  // Estrai tutte le stagioni uniche dalle leghe
  const availableSeasons = [...new Set(leagues.map(l => l.season).filter(Boolean))].sort().reverse();
  
  const [selectedSeason, setSelectedSeason] = useState(availableSeasons[0] || '2025/2026');

  const { data: matches = [] } = useQuery({
    queryKey: ['matches', selectedSeason],
    queryFn: async () => {
      const { data } = await supabase.from('matches').select('*').eq('season', selectedSeason).eq('status', 'completed');
      return data || [];
    }
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => { const { data } = await supabase.from('teams').select('*'); return data || []; }
  });

  const { data: players = [] } = useQuery({
    queryKey: ['players'],
    queryFn: async () => { const { data } = await supabase.from('players').select('*'); return data || []; }
  });

  const { data: suspendedPlayers = [] } = useQuery({
    queryKey: ['suspendedPlayers'],
    queryFn: async () => {
      const { data } = await supabase.from('player_statuses').select('*').eq('status_type', 'suspended');
      return data || [];
    }
  });

  // Funzione helper per aggiornare statistiche portieri
  const updateGk = (map, id, rating) => {
    if (!id || !rating) return;
    if (!map[id]) map[id] = { sum: 0, count: 0 };
    map[id].sum += rating;
    map[id].count++;
  };

  // Funzione per calcolare statistiche aggregate
  const getAggregatedStats = (matches) => {
    const results = {
      standings: {},
      scorers: {},
      assists: {},
      mvps: {},
      gks: {}
    };

    matches.forEach(match => {
      // 1. CLASSIFICA SQUADRE (Punti 3-1-0)
      const homeId = match.home_team_id;
      const awayId = match.away_team_id;

      if (!results.standings[homeId]) {
        results.standings[homeId] = {
          team_id: homeId,
          points: 0,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goals_for: 0,
          goals_against: 0
        };
      }
      if (!results.standings[awayId]) {
        results.standings[awayId] = {
          team_id: awayId,
          points: 0,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          goals_for: 0,
          goals_against: 0
        };
      }

      const h = results.standings[homeId];
      const a = results.standings[awayId];

      h.played++;
      a.played++;
      h.goals_for += match.home_score;
      h.goals_against += match.away_score;
      a.goals_for += match.away_score;
      a.goals_against += match.home_score;

      if (match.home_score > match.away_score) {
        h.points += 3;
        h.won++;
        a.lost++;
      } else if (match.home_score < match.away_score) {
        a.points += 3;
        a.won++;
        h.lost++;
      } else {
        h.points += 1;
        a.points += 1;
        h.drawn++;
        a.drawn++;
      }

      // 2. MARCATORI & ASSIST (Somma dinamica)
      (match.scorers || []).forEach(s => {
        if (!s.is_own_goal) {
          results.scorers[s.player_name] = (results.scorers[s.player_name] || 0) + 1;
        }
      });

      (match.assists || []).forEach(as => {
        results.assists[as.player_name] = (results.assists[as.player_name] || 0) + 1;
      });

      // 3. MVP & PORTIERI
      if (match.mvp_player_name) {
        results.mvps[match.mvp_player_name] = (results.mvps[match.mvp_player_name] || 0) + 1;
      }

      updateGk(results.gks, match.home_goalkeeper_id, match.home_goalkeeper_rating);
      updateGk(results.gks, match.away_goalkeeper_id, match.away_goalkeeper_rating);
    });

    return results;
  };

  // Calcola statistiche aggregate
  console.log("GlobalStats - Matches trovati:", matches);
  const aggregatedStats = getAggregatedStats(matches);
  console.log("GlobalStats - Stats aggregate:", aggregatedStats);
  const stats = aggregatedStats;

  // Top 5 per categoria
  const topScorers = Object.entries(stats.scorers)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const topAssists = Object.entries(stats.assists)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const topMVPs = Object.entries(stats.mvps)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const topGoalkeepers = Object.entries(stats.gks)
    .map(([id, data]) => {
      const player = players.find(p => p.id === id);
      const playerName = player ? `${player.first_name} ${player.last_name}` : `Portiere #${id.substring(0, 8)}`;
      return {
        id,
        name: playerName,
        avg: data.count > 0 ? (data.sum / data.count).toFixed(2) : 0
      };
    })
    .sort((a, b) => b.avg - a.avg)
    .slice(0, 5);

  // Raggruppa classifiche per lega
  const leagueStandings = leagues.reduce((acc, league) => {
    const leagueMatches = matches.filter(m => m.league_id === league.id);
    const leagueStats = getAggregatedStats(leagueMatches);
    const sortedStandings = Object.values(leagueStats.standings).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      return (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against);
    });

    if (sortedStandings.length > 0) {
      acc[league.id] = {
        league,
        standings: sortedStandings
      };
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Classifiche e Statistiche</h1>
          <p className="text-slate-500">Classifiche, premi stagionali e squalifiche</p>
        </div>
        <Select value={selectedSeason} onValueChange={setSelectedSeason}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {availableSeasons.map(season => (
              <SelectItem key={season} value={season}>{season}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="standings" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="standings">
            <Trophy className="w-4 h-4 mr-2" />
            Campionati
          </TabsTrigger>
          <TabsTrigger value="awards">
            <Award className="w-4 h-4 mr-2" />
            Premi Stagionali
          </TabsTrigger>
          <TabsTrigger value="mvp-total">
            <Award className="w-4 h-4 mr-2" />
            Classifica MVP
          </TabsTrigger>
          <TabsTrigger value="halloffame">
            <Trophy className="w-4 h-4 mr-2" />
            Hall of Fame
          </TabsTrigger>
          <TabsTrigger value="suspensions">
            <AlertCircle className="w-4 h-4 mr-2" />
            Squalificati
          </TabsTrigger>
        </TabsList>

        {/* Tab Classifiche */}
        <TabsContent value="standings" className="space-y-6">
          {Object.values(leagueStandings).map(({ league, standings: leagueStands }) => {
            const leagueTeams = teams.filter(t => leagueStands.some(s => s.team_id === t.id));
            
            return (
              <Card key={league.id}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-emerald-500" />
                    {league.name} - {league.season}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b text-sm text-slate-500">
                          <th className="text-left py-2 px-2 w-12">#</th>
                          <th className="text-left py-2 px-2">Squadra</th>
                          <th className="text-center py-2 px-2 w-16">Pt</th>
                          <th className="text-center py-2 px-2 w-16">G</th>
                          <th className="text-center py-2 px-2 w-16">V</th>
                          <th className="text-center py-2 px-2 w-16">N</th>
                          <th className="text-center py-2 px-2 w-16">P</th>
                          <th className="text-center py-2 px-2 w-16">GF</th>
                          <th className="text-center py-2 px-2 w-16">GS</th>
                          <th className="text-center py-2 px-2 w-16">DR</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leagueStands.map((standing, index) => {
                          const team = leagueTeams.find(t => t.id === standing.team_id);
                          const diff = standing.goals_for - standing.goals_against;
                          
                          return (
                            <tr key={standing.team_id} className="border-b hover:bg-slate-50">
                              <td className="py-3 px-2 font-medium text-slate-700">{index + 1}</td>
                              <td className="py-3 px-2">
                                <div className="flex items-center gap-2">
                                  {team?.primary_color && (
                                    <div 
                                      className="w-3 h-3 rounded-full" 
                                      style={{ backgroundColor: team.primary_color }}
                                    />
                                  )}
                                  <span className="font-medium text-slate-800">{team?.name || 'N/A'}</span>
                                </div>
                              </td>
                              <td className="py-3 px-2 text-center font-bold text-emerald-600">
                                {standing.points}
                              </td>
                              <td className="py-3 px-2 text-center text-slate-600">{standing.played}</td>
                              <td className="py-3 px-2 text-center text-slate-600">{standing.won}</td>
                              <td className="py-3 px-2 text-center text-slate-600">{standing.drawn}</td>
                              <td className="py-3 px-2 text-center text-slate-600">{standing.lost}</td>
                              <td className="py-3 px-2 text-center text-slate-600">{standing.goals_for}</td>
                              <td className="py-3 px-2 text-center text-slate-600">{standing.goals_against}</td>
                              <td className={`py-3 px-2 text-center font-medium ${diff > 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-slate-600'}`}>
                                {diff > 0 ? '+' : ''}{diff}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {Object.keys(leagueStandings).length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Nessuna classifica disponibile per questa stagione</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab Premi Stagionali */}
        <TabsContent value="awards">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Capocannoniere */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-rose-500" />
                  🏆 Capocannoniere
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topScorers.length > 0 ? (
                  <div className="space-y-3">
                    {topScorers.map(([player, goals], index) => (
                      <div key={player} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-amber-100 text-amber-700' : 
                            index === 1 ? 'bg-slate-100 text-slate-600' :
                            index === 2 ? 'bg-orange-100 text-orange-600' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {index + 1}
                          </div>
                          <span className="font-medium text-slate-800">{player}</span>
                        </div>
                        <Badge className="bg-rose-100 text-rose-700">{goals} gol</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-8">Nessun dato disponibile</p>
                )}
              </CardContent>
            </Card>

            {/* Assistman */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Medal className="w-5 h-5 text-blue-500" />
                  👟 Assistman
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topAssists.length > 0 ? (
                  <div className="space-y-3">
                    {topAssists.map(([player, assists], index) => (
                      <div key={player} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-amber-100 text-amber-700' : 
                            index === 1 ? 'bg-slate-100 text-slate-600' :
                            index === 2 ? 'bg-orange-100 text-orange-600' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {index + 1}
                          </div>
                          <span className="font-medium text-slate-800">{player}</span>
                        </div>
                        <Badge className="bg-blue-100 text-blue-700">{assists} assist</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-8">Nessun dato disponibile</p>
                )}
              </CardContent>
            </Card>

            {/* MVP */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-500" />
                  🌟 MVP della Stagione
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topMVPs.length > 0 ? (
                  <div className="space-y-3">
                    {topMVPs.map(([player, mvps], index) => (
                      <div key={player} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-amber-100 text-amber-700' : 
                            index === 1 ? 'bg-slate-100 text-slate-600' :
                            index === 2 ? 'bg-orange-100 text-orange-600' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {index + 1}
                          </div>
                          <span className="font-medium text-slate-800">{player}</span>
                        </div>
                        <Badge className="bg-amber-100 text-amber-700">{mvps} MVP</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-8">Nessun dato disponibile</p>
                )}
              </CardContent>
            </Card>

            {/* Miglior Portiere */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-emerald-500" />
                  🧤 Miglior Portiere
                </CardTitle>
              </CardHeader>
              <CardContent>
                {topGoalkeepers.length > 0 ? (
                  <div className="space-y-3">
                    {topGoalkeepers.map((gk, index) => (
                      <div key={gk.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                            index === 0 ? 'bg-amber-100 text-amber-700' : 
                            index === 1 ? 'bg-slate-100 text-slate-600' :
                            index === 2 ? 'bg-orange-100 text-orange-600' :
                            'bg-slate-100 text-slate-500'
                          }`}>
                            {index + 1}
                          </div>
                          <span className="font-medium text-slate-800">{gk.name}</span>
                        </div>
                        <Badge className="bg-emerald-100 text-emerald-700">Media {gk.avg}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 text-center py-8">Nessun dato disponibile</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab Classifica MVP Totale */}
        <TabsContent value="mvp-total">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                🏆 Classifica MVP Totale Stagione
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(() => {
                // Calcola MVP totali dalla stagione selezionata (tutte le competizioni)
                const mvpTotals = {};

                matches.forEach(match => {
                  if (match.mvp_player_name && match.status === 'completed') {
                    mvpTotals[match.mvp_player_name] = (mvpTotals[match.mvp_player_name] || 0) + 1;
                  }
                });

                const sortedMVPs = Object.entries(mvpTotals)
                  .sort(([, a], [, b]) => b - a);

                return sortedMVPs.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b text-sm text-slate-500">
                          <th className="text-left py-2 px-2 w-12">#</th>
                          <th className="text-left py-2 px-2">Giocatore</th>
                          <th className="text-center py-2 px-2">MVP Totali</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedMVPs.map(([playerName, count], index) => (
                          <tr key={playerName} className="border-b hover:bg-slate-50">
                            <td className="py-3 px-2">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                                index === 0 ? 'bg-amber-100 text-amber-700' : 
                                index === 1 ? 'bg-slate-100 text-slate-600' :
                                index === 2 ? 'bg-orange-100 text-orange-600' :
                                'bg-slate-100 text-slate-500'
                              }`}>
                                {index + 1}
                              </div>
                            </td>
                            <td className="py-3 px-2 font-medium text-slate-800">
                              {playerName}
                            </td>
                            <td className="py-3 px-2 text-center">
                              <Badge className="bg-amber-100 text-amber-700">
                                {count} MVP
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Award className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Nessun MVP assegnato in questa stagione</p>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Hall of Fame */}
        <TabsContent value="halloffame">
          <div className="space-y-4">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Trophy className="w-5 h-5 text-amber-500" />
                  🏆 Hall of Fame — Top 50 All Time
                </CardTitle>
                <p className="text-sm text-slate-500">Classifica storica aggiornata automaticamente. Resettabile solo dall'admin.</p>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="goals" className="space-y-4">
                  <TabsList>
                    <TabsTrigger value="goals">⚽ Marcatori</TabsTrigger>
                    <TabsTrigger value="assists">🅰️ Assistman</TabsTrigger>
                  </TabsList>

                  {/* Marcatori */}
                  <TabsContent value="goals">
                    {(() => {
                      const top = [...players]
                        .filter(p => (p.goals || 0) > 0)
                        .sort((a, b) => (b.goals || 0) - (a.goals || 0))
                        .slice(0, 50);
                      return top.length === 0 ? (
                        <div className="text-center py-12">
                          <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-slate-500">Nessun gol registrato</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b text-sm text-slate-500">
                                <th className="text-left py-2 px-2 w-12">#</th>
                                <th className="text-left py-2 px-2">Giocatore</th>
                                <th className="text-left py-2 px-2 hidden sm:table-cell">Squadra</th>
                                <th className="text-center py-2 px-2 w-16">Ruolo</th>
                                <th className="text-center py-2 px-2 w-20">⚽ Gol</th>
                              </tr>
                            </thead>
                            <tbody>
                              {top.map((player, i) => {
                                const team = teams.find(t => t.id === player.team_id);
                                return (
                                  <tr key={player.id} className={`border-b hover:bg-slate-50 ${i < 3 ? 'bg-amber-50/50' : ''}`}>
                                    <td className="py-3 px-2">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                        i === 0 ? 'bg-yellow-100 text-yellow-700' :
                                        i === 1 ? 'bg-slate-100 text-slate-600' :
                                        i === 2 ? 'bg-orange-100 text-orange-600' :
                                        'bg-slate-50 text-slate-400'
                                      }`}>
                                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                                      </div>
                                    </td>
                                    <td className="py-3 px-2 font-medium text-slate-800">
                                      {player.first_name} {player.last_name}
                                    </td>
                                    <td className="py-3 px-2 text-slate-500 text-sm hidden sm:table-cell">
                                      {team?.name || 'Svincolato'}
                                    </td>
                                    <td className="py-3 px-2 text-center">
                                      {player.role && <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">{player.role}</Badge>}
                                    </td>
                                    <td className="py-3 px-2 text-center">
                                      <Badge className="bg-rose-100 text-rose-700 border-0 font-bold text-sm">
                                        {player.goals || 0}
                                      </Badge>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </TabsContent>

                  {/* Assistman */}
                  <TabsContent value="assists">
                    {(() => {
                      const top = [...players]
                        .filter(p => (p.assists || 0) > 0)
                        .sort((a, b) => (b.assists || 0) - (a.assists || 0))
                        .slice(0, 50);
                      return top.length === 0 ? (
                        <div className="text-center py-12">
                          <Medal className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                          <p className="text-slate-500">Nessun assist registrato</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b text-sm text-slate-500">
                                <th className="text-left py-2 px-2 w-12">#</th>
                                <th className="text-left py-2 px-2">Giocatore</th>
                                <th className="text-left py-2 px-2 hidden sm:table-cell">Squadra</th>
                                <th className="text-center py-2 px-2 w-16">Ruolo</th>
                                <th className="text-center py-2 px-2 w-20">🅰️ Assist</th>
                              </tr>
                            </thead>
                            <tbody>
                              {top.map((player, i) => {
                                const team = teams.find(t => t.id === player.team_id);
                                return (
                                  <tr key={player.id} className={`border-b hover:bg-slate-50 ${i < 3 ? 'bg-amber-50/50' : ''}`}>
                                    <td className="py-3 px-2">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                                        i === 0 ? 'bg-yellow-100 text-yellow-700' :
                                        i === 1 ? 'bg-slate-100 text-slate-600' :
                                        i === 2 ? 'bg-orange-100 text-orange-600' :
                                        'bg-slate-50 text-slate-400'
                                      }`}>
                                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                                      </div>
                                    </td>
                                    <td className="py-3 px-2 font-medium text-slate-800">
                                      {player.first_name} {player.last_name}
                                    </td>
                                    <td className="py-3 px-2 text-slate-500 text-sm hidden sm:table-cell">
                                      {team?.name || 'Svincolato'}
                                    </td>
                                    <td className="py-3 px-2 text-center">
                                      {player.role && <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">{player.role}</Badge>}
                                    </td>
                                    <td className="py-3 px-2 text-center">
                                      <Badge className="bg-blue-100 text-blue-700 border-0 font-bold text-sm">
                                        {player.assists || 0}
                                      </Badge>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab Squalificati */}
        <TabsContent value="suspensions">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ammoniti (cartellini gialli) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-4 h-5 rounded bg-yellow-400" />
                  Ammoniti
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const allPlayersWithYellowCards = players.filter(p => p.yellow_cards_accumulated > 0);
                  const yellowCardSuspensionsMap = new Map(
                    suspendedPlayers
                      .filter(p => p.reason_type === 'yellow_card_accumulation')
                      .map(s => [s.player_id, s])
                  );

                  const sortedAmmoniti = allPlayersWithYellowCards
                    .sort((a, b) => b.yellow_cards_accumulated - a.yellow_cards_accumulated);

                  return sortedAmmoniti.length > 0 ? (
                    <div className="space-y-3">
                      {sortedAmmoniti.map(player => {
                        const team = teams.find(t => t.id === player.team_id);
                        const activeSuspension = yellowCardSuspensionsMap.get(player.id);

                        return (
                          <div 
                            key={player.id} 
                            className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200"
                          >
                            <div className="flex-1">
                              <p className="font-medium text-slate-800">
                                {player.first_name} {player.last_name}
                              </p>
                              <p className="text-sm text-slate-600">{team?.name || 'N/A'}</p>
                              <p className="text-xs text-slate-500 mt-1">
                                Cartellini Gialli: {player.yellow_cards_accumulated}
                              </p>
                            </div>
                            <div className="text-right">
                              {activeSuspension ? (
                                <>
                                  <Badge className="bg-red-100 text-red-700 border-red-300">
                                    Squalificato: {activeSuspension.matchdays_remaining} {activeSuspension.matchdays_remaining === 1 ? 'giornata' : 'giornate'}
                                  </Badge>
                                  {activeSuspension.suspension_start_matchday && (
                                    <p className="text-xs text-slate-500 mt-1">
                                      Da G{activeSuspension.suspension_start_matchday}
                                    </p>
                                  )}
                                </>
                              ) : (
                                <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300">
                                  Attenzione
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-4 h-5 rounded bg-yellow-400 mx-auto mb-3" />
                      <p className="text-slate-500">Nessun giocatore ammonito</p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Espulsi (cartellini rossi) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <div className="w-4 h-5 rounded bg-red-600" />
                  Espulsioni
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const redCardSuspensions = suspendedPlayers.filter(p => 
                    p.reason_type === 'red_card_direct'
                  );

                  return redCardSuspensions.length > 0 ? (
                    <div className="space-y-3">
                      {redCardSuspensions.map(player => {
                        const team = teams.find(t => t.id === player.team_id);

                        return (
                          <div key={player.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex-1">
                              <p className="font-medium text-slate-800">{player.player_name}</p>
                              <p className="text-sm text-slate-600">{team?.name || 'N/A'}</p>
                              <p className="text-xs text-slate-500 mt-1">{player.reason}</p>
                            </div>
                            <div className="text-right">
                              <Badge className="bg-red-100 text-red-700 border-red-300">
                                {player.matchdays_remaining} {player.matchdays_remaining === 1 ? 'giornata' : 'giornate'}
                              </Badge>
                              {player.suspension_start_matchday && (
                                <p className="text-xs text-slate-500 mt-1">
                                  Da G{player.suspension_start_matchday}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="w-4 h-5 rounded bg-red-600 mx-auto mb-3" />
                      <p className="text-slate-500">Nessuna espulsione</p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}