import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Trophy, Euro, Shield, TrendingUp, Calendar } from 'lucide-react';
import TeamStatsCard from '@/components/dashboard/TeamStatsCard';
import DepartmentAverages from '@/components/dashboard/DepartmentAverages';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;
        const { data } = await supabase.from('user_roles').select('*').eq('email', authUser.email).single();
        if (data) setUser(data);
      } catch (e) {
        console.log('User not logged in');
      }
    };
    loadUser();
  }, []);

  const { data: leagues = [] } = useQuery({
    queryKey: ['leagues'],
    queryFn: async () => { const { data } = await supabase.from('leagues').select('id,name,season,status,participating_teams,current_matchday'); return data || []; }
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => { const { data } = await supabase.from('teams').select('id,name,owner_email,primary_color,logo_url,budget,league_id,team_type'); return data || []; }
  });

  const { data: players = [] } = useQuery({
    queryKey: ['players'],
    queryFn: async () => { const { data } = await supabase.from('players').select('id,first_name,last_name,role,age,overall_rating,team_id,id_sofifa,photo_url,status').eq('status', 'approved'); return data || []; }
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: async () => { const { data } = await supabase.from('matches').select('id,league_id,season,matchday,status,home_team_id,away_team_id,home_score,away_score'); return data || []; }
  });

  const { data: auctions = [] } = useQuery({
    queryKey: ['auctions'],
    queryFn: async () => { const { data } = await supabase.from('auctions').select('id,player_id,player_name,status,auction_type,current_price,end_time').eq('status', 'active'); return data || []; }
  });

  const { data: playerStatuses = [] } = useQuery({
    queryKey: ['playerStatuses'],
    queryFn: async () => { const { data } = await supabase.from('player_statuses').select('id,player_id,player_name,team_id,status_type,matchdays_remaining'); return data || []; }
  });

  // Find user's team
  useEffect(() => {
    if (user && teams.length > 0 && !selectedTeamId) {
      const myTeam = teams.find(t => t.owner_email === user.email);
      if (myTeam) {
        setSelectedTeamId(myTeam.id);
      }
    }
  }, [user, teams, selectedTeamId]);

  const selectedTeam = teams.find(t => t.id === selectedTeamId);
  const teamPlayers = players.filter(p => p.team_id === selectedTeamId);

  // Lega attiva della squadra selezionata
  const activeLeague = leagues.find(l =>
    l.status === 'active' && (l.participating_teams || []).includes(selectedTeamId)
  );

  // Mostra indisponibili SOLO se c'è una lega attiva
  const unavailablePlayers = activeLeague ? teamPlayers.filter(p => {
    const status = playerStatuses.find(s => s.player_id === p.id);
    return status && (status.status_type === 'injured' || status.status_type === 'suspended');
  }) : [];

  // current_matchday: giornata massima con partite completate nella lega attiva
  // oppure il campo current_matchday se impostato manualmente dall'admin
  const currentMatchday = (() => {
    if (!activeLeague) return null;
    if (activeLeague.current_matchday) return activeLeague.current_matchday;
    const leagueMatches = matches.filter(m => m.league_id === activeLeague.id && m.status === 'completed');
    if (leagueMatches.length === 0) return 0;
    return Math.max(...leagueMatches.map(m => m.matchday));
  })();

  const nextMatch = matches
    .filter(m => m.status === 'scheduled' && (m.home_team_id === selectedTeamId || m.away_team_id === selectedTeamId))
    .sort((a, b) => a.matchday - b.matchday)[0];

  const formatBudget = (budget) => {
    if (!budget) return '€0';
    if (budget >= 1000000) return `€${(budget / 1000000).toFixed(1)}M`;
    if (budget >= 1000) return `€${(budget / 1000).toFixed(0)}K`;
    return `€${budget}`;
  };

  // Prossime partite: solo fino alla giornata successiva a quella corrente
  const upcomingMatches = matches
    .filter(m => {
      if (m.status !== 'scheduled') return false;
      if (currentMatchday !== null && m.matchday > currentMatchday + 1) return false;
      return true;
    })
    .slice(0, 5);

  // Risultati recenti: solo fino alla giornata corrente
  const recentResults = matches
    .filter(m => {
      if (m.status !== 'completed') return false;
      if (currentMatchday !== null && m.matchday > currentMatchday) return false;
      return true;
    })
    .slice(0, 5);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500">Panoramica generale del campionato</p>
        </div>
        
        {teams.length > 0 && (
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Seleziona squadra" />
            </SelectTrigger>
            <SelectContent>
              {teams.map(team => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <TeamStatsCard
          title="Squadre"
          value={teams.length}
          icon={Shield}
          color="blue"
        />
        <TeamStatsCard
          title="Giocatori"
          value={players.length}
          icon={Users}
          color="emerald"
        />
        <TeamStatsCard
          title="Aste Attive"
          value={auctions.length}
          icon={TrendingUp}
          color="amber"
        />
        <TeamStatsCard
          title="Partite"
          value={matches.length}
          icon={Calendar}
          color="purple"
        />
      </div>

      {selectedTeam && (
        <>
          {/* Team Budget */}
          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32" />
            <CardHeader>
              <CardTitle className="text-lg font-medium text-emerald-100">
                {selectedTeam.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-2">
                <Euro className="w-8 h-8 text-emerald-200" />
                <span className="text-4xl font-bold">{formatBudget(selectedTeam.budget)}</span>
                <span className="text-emerald-200 mb-1">budget disponibile</span>
              </div>
              <div className="mt-4 flex items-center gap-4 text-emerald-100">
                <span>{teamPlayers.length} giocatori in rosa</span>
              </div>
            </CardContent>
          </Card>

          {/* Team Stats */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <DepartmentAverages players={teamPlayers} />
            </div>

            <div className="space-y-4">
              {/* Next Match */}
              {nextMatch && (
                <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
                  <CardHeader>
                    <CardTitle className="text-sm font-medium text-blue-100">
                      Prossima Partita
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <p className="text-xs text-blue-200">Giornata {nextMatch.matchday}</p>
                      <div className="flex items-center justify-center gap-2">
                        <span className="font-bold">
                          {nextMatch.home_team_id === selectedTeamId ? 'Casa' : teams.find(t => t.id === nextMatch.home_team_id)?.name}
                        </span>
                        <span className="text-blue-200">vs</span>
                        <span className="font-bold">
                          {nextMatch.away_team_id === selectedTeamId ? 'Trasferta' : teams.find(t => t.id === nextMatch.away_team_id)?.name}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Unavailable Players */}
              <Card className="bg-white border-0 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-sm font-semibold text-slate-800">
                    Indisponibili
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {unavailablePlayers.length > 0 ? (
                    <div className="space-y-2">
                      {unavailablePlayers.map(player => {
                        const status = playerStatuses.find(s => s.player_id === player.id);
                        return (
                          <div key={player.id} className="flex items-center justify-between p-2 rounded-lg bg-rose-50">
                            <div>
                              <p className="text-sm font-medium text-slate-700">
                                {player.first_name} {player.last_name}
                              </p>
                              <p className="text-xs text-rose-600">
                                {status?.status_type === 'injured' ? '🤕 Infortunato' : '🟥 Squalificato'}
                              </p>
                            </div>
                            {status?.matchdays_remaining && (
                              <span className="text-xs text-slate-500">
                                {status.matchdays_remaining} giornate
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-4">
                      Tutti disponibili ✓
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming Matches */}
        <Card className="bg-white border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              Prossime Partite
            </CardTitle>
          </CardHeader>
          <CardContent>
            {upcomingMatches.length > 0 ? (
              <div className="space-y-3">
                {upcomingMatches.map(match => {
                  const homeTeam = teams.find(t => t.id === match.home_team_id);
                  const awayTeam = teams.find(t => t.id === match.away_team_id);
                  return (
                    <div key={match.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{homeTeam?.name || 'TBD'}</span>
                        <span className="text-xs text-slate-400">vs</span>
                        <span className="text-sm font-medium">{awayTeam?.name || 'TBD'}</span>
                      </div>
                      <span className="text-xs text-slate-500">Giornata {match.matchday}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">Nessuna partita programmata</p>
            )}
          </CardContent>
        </Card>

        {/* Recent Results */}
        <Card className="bg-white border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" />
              Ultimi Risultati
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentResults.length > 0 ? (
              <div className="space-y-3">
                {recentResults.map(match => {
                  const homeTeam = teams.find(t => t.id === match.home_team_id);
                  const awayTeam = teams.find(t => t.id === match.away_team_id);
                  return (
                    <div key={match.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{homeTeam?.name || 'TBD'}</span>
                        <span className="text-lg font-bold text-slate-800">
                          {match.home_score} - {match.away_score}
                        </span>
                        <span className="text-sm font-medium">{awayTeam?.name || 'TBD'}</span>
                      </div>
                      <span className="text-xs text-slate-500">G{match.matchday}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-400 text-center py-4">Nessun risultato recente</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}