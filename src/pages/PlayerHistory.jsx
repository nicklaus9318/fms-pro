import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  ArrowLeft, Trophy, Target, Medal, Award, AlertCircle, 
  TrendingUp, Calendar, ShieldAlert, History, Euro 
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function PlayerHistory() {
  const urlParams = new URLSearchParams(window.location.search);
  const playerId = urlParams.get('id');
  
  const [selectedSeason, setSelectedSeason] = useState('all');

  const { data: player } = useQuery({
    queryKey: ['player', playerId],
    queryFn: async () => {
      const players = await base44.entities.Player.list();
      return players.find(p => p.id === playerId);
    },
    enabled: !!playerId
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const { data: allMatches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.filter({ status: 'completed' })
  });

  const { data: transfers = [] } = useQuery({
    queryKey: ['transfers', playerId],
    queryFn: async () => {
      const allTransfers = await base44.entities.Transfer.list();
      return allTransfers.filter(t => 
        t.player_ids_out?.includes(playerId) || t.player_ids_in?.includes(playerId)
      );
    },
    enabled: !!playerId
  });

  const { data: suspensions = [] } = useQuery({
    queryKey: ['suspensions', playerId],
    queryFn: () => base44.entities.PlayerStatus.filter({ player_id: playerId })
  });

  if (!playerId || !player) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Giocatore non trovato</p>
      </div>
    );
  }

  const currentTeam = teams.find(t => t.id === player.team_id);

  // Filtra partite in cui il giocatore ha partecipato (gol, assist, MVP, cartellini)
  const playerMatches = allMatches.filter(match => {
    const scored = match.scorers?.some(s => s.player_id === playerId);
    const assisted = match.assists?.some(a => a.player_id === playerId);
    const wasMVP = match.mvp_player_id === playerId;
    const gotCard = match.cards?.some(c => c.player_id === playerId);
    const wasGK = match.home_goalkeeper_id === playerId || match.away_goalkeeper_id === playerId;
    
    return scored || assisted || wasMVP || gotCard || wasGK;
  });

  // Estrai stagioni disponibili
  const availableSeasons = [...new Set(playerMatches.map(m => m.season).filter(Boolean))].sort().reverse();
  
  // Filtra partite per stagione selezionata
  const filteredMatches = selectedSeason === 'all' 
    ? playerMatches 
    : playerMatches.filter(m => m.season === selectedSeason);

  // Calcola statistiche per stagione
  const seasonStats = {};
  playerMatches.forEach(match => {
    const season = match.season || 'N/A';
    if (!seasonStats[season]) {
      seasonStats[season] = {
        matches: 0,
        goals: 0,
        assists: 0,
        mvps: 0,
        yellowCards: 0,
        redCards: 0,
        gkAppearances: 0,
        gkRatingSum: 0
      };
    }

    seasonStats[season].matches++;
    
    const goals = match.scorers?.filter(s => s.player_id === playerId && !s.is_own_goal).length || 0;
    seasonStats[season].goals += goals;
    
    const assists = match.assists?.filter(a => a.player_id === playerId).length || 0;
    seasonStats[season].assists += assists;
    
    if (match.mvp_player_id === playerId) {
      seasonStats[season].mvps++;
    }

    const yellowCards = match.cards?.filter(c => c.player_id === playerId && c.type === 'yellow').length || 0;
    const redCards = match.cards?.filter(c => c.player_id === playerId && c.type === 'red').length || 0;
    seasonStats[season].yellowCards += yellowCards;
    seasonStats[season].redCards += redCards;

    if (match.home_goalkeeper_id === playerId && match.home_goalkeeper_rating) {
      seasonStats[season].gkAppearances++;
      seasonStats[season].gkRatingSum += match.home_goalkeeper_rating;
    }
    if (match.away_goalkeeper_id === playerId && match.away_goalkeeper_rating) {
      seasonStats[season].gkAppearances++;
      seasonStats[season].gkRatingSum += match.away_goalkeeper_rating;
    }
  });

  // Storico trasferimenti
  const transferHistory = transfers
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
    .map(transfer => {
      const isOutgoing = transfer.player_ids_out?.includes(playerId);
      const fromTeam = teams.find(t => t.id === transfer.from_team_id);
      const toTeam = teams.find(t => t.id === transfer.to_team_id);

      return {
        ...transfer,
        isOutgoing,
        fromTeam,
        toTeam
      };
    });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 bg-gradient-to-r from-white/80 to-emerald-50/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-emerald-100">
        <div className="flex items-start gap-6 flex-1">
          <Link to={createPageUrl('Players')}>
            <Button variant="outline" size="icon" className="hover:bg-emerald-50 hover:border-emerald-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          
          <div className="flex items-center gap-6 flex-1">
            {player.photo_url && (
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-2xl blur opacity-40" />
                <img 
                  src={player.photo_url} 
                  alt={`${player.first_name} ${player.last_name}`}
                  className="relative w-24 h-24 rounded-2xl object-cover border-4 border-white shadow-xl"
                />
              </div>
            )}
            <div className="flex-1">
              <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 to-emerald-600 bg-clip-text text-transparent mb-3">
                {player.first_name} {player.last_name}
              </h1>
              <div className="flex items-center gap-3 flex-wrap">
                <Badge className="bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-sm px-3 py-1 shadow-lg shadow-emerald-500/30">
                  {player.role}
                </Badge>
                <Badge className="bg-white border-2 border-slate-200 text-slate-700 text-sm px-3 py-1">
                  Overall: {player.overall_rating || 'N/A'}
                </Badge>
                {currentTeam && (
                  <Badge className="bg-white border-2 border-blue-200 text-blue-700 text-sm px-3 py-1">
                    {currentTeam.name}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>

        <Select value={selectedSeason} onValueChange={setSelectedSeason}>
          <SelectTrigger className="w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le stagioni</SelectItem>
            {availableSeasons.map(season => (
              <SelectItem key={season} value={season}>{season}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="stats" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 bg-white/80 backdrop-blur-sm p-2 rounded-xl shadow-lg border-0">
          <TabsTrigger value="stats" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-emerald-500 data-[state=active]:to-emerald-600 data-[state=active]:text-white rounded-lg transition-all">
            <Trophy className="w-4 h-4 mr-2" />
            Statistiche
          </TabsTrigger>
          <TabsTrigger value="matches" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-blue-600 data-[state=active]:text-white rounded-lg transition-all">
            <Calendar className="w-4 h-4 mr-2" />
            Partite
          </TabsTrigger>
          <TabsTrigger value="cards" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-yellow-500 data-[state=active]:to-yellow-600 data-[state=active]:text-white rounded-lg transition-all">
            <ShieldAlert className="w-4 h-4 mr-2" />
            Disciplina
          </TabsTrigger>
          <TabsTrigger value="transfers" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-purple-600 data-[state=active]:text-white rounded-lg transition-all">
            <History className="w-4 h-4 mr-2" />
            Trasferimenti
          </TabsTrigger>
        </TabsList>

        {/* Tab Statistiche */}
        <TabsContent value="stats">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(seasonStats)
              .filter(([season]) => selectedSeason === 'all' || season === selectedSeason)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([season, stats]) => (
                <Card key={season} className="bg-white/80 backdrop-blur-sm border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                  <CardHeader className="border-b border-slate-100 pb-3">
                    <CardTitle className="text-lg font-bold text-slate-700">
                      {season}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Partite</span>
                      <span className="font-semibold text-slate-800">{stats.matches}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 flex items-center gap-1">
                        <Target className="w-3 h-3 text-rose-500" />
                        Gol
                      </span>
                      <span className="font-semibold text-rose-600">{stats.goals}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 flex items-center gap-1">
                        <Medal className="w-3 h-3 text-blue-500" />
                        Assist
                      </span>
                      <span className="font-semibold text-blue-600">{stats.assists}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600 flex items-center gap-1">
                        <Award className="w-3 h-3 text-amber-500" />
                        MVP
                      </span>
                      <span className="font-semibold text-amber-600">{stats.mvps}</span>
                    </div>
                    {stats.gkAppearances > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-600">Media Portiere</span>
                        <span className="font-semibold text-emerald-600">
                          {(stats.gkRatingSum / stats.gkAppearances).toFixed(2)}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
          </div>

          {Object.keys(seasonStats).length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Nessuna statistica disponibile</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab Partite */}
        <TabsContent value="matches">
          <div className="space-y-3">
            {filteredMatches.length > 0 ? (
              filteredMatches
                .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
                .map(match => {
                  const homeTeam = teams.find(t => t.id === match.home_team_id);
                  const awayTeam = teams.find(t => t.id === match.away_team_id);
                  
                  const playerGoals = match.scorers?.filter(s => s.player_id === playerId && !s.is_own_goal).length || 0;
                  const playerAssists = match.assists?.filter(a => a.player_id === playerId).length || 0;
                  const wasMVP = match.mvp_player_id === playerId;
                  const cards = match.cards?.filter(c => c.player_id === playerId) || [];

                  return (
                    <Card key={match.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <span className="font-semibold text-slate-800">
                                {homeTeam?.name} {match.home_score} - {match.away_score} {awayTeam?.name}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                G{match.matchday}
                              </Badge>
                              <Badge variant="outline" className="text-xs">
                                {match.season}
                              </Badge>
                            </div>
                            
                            <div className="flex flex-wrap gap-2">
                              {playerGoals > 0 && (
                                <Badge className="bg-rose-100 text-rose-700">
                                  <Target className="w-3 h-3 mr-1" />
                                  {playerGoals} {playerGoals === 1 ? 'gol' : 'gol'}
                                </Badge>
                              )}
                              {playerAssists > 0 && (
                                <Badge className="bg-blue-100 text-blue-700">
                                  <Medal className="w-3 h-3 mr-1" />
                                  {playerAssists} {playerAssists === 1 ? 'assist' : 'assist'}
                                </Badge>
                              )}
                              {wasMVP && (
                                <Badge className="bg-amber-100 text-amber-700">
                                  <Award className="w-3 h-3 mr-1" />
                                  MVP
                                </Badge>
                              )}
                              {cards.map((card, idx) => (
                                <Badge 
                                  key={idx}
                                  className={card.type === 'yellow' 
                                    ? 'bg-yellow-100 text-yellow-700 border-yellow-300' 
                                    : 'bg-red-100 text-red-700 border-red-300'
                                  }
                                >
                                  {card.type === 'yellow' ? '🟨' : '🟥'} Cartellino {card.type === 'yellow' ? 'Giallo' : 'Rosso'}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">Nessuna partita trovata</p>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Tab Disciplina */}
        <TabsContent value="cards">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Riepilogo Cartellini */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                  Riepilogo Cartellini
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                    <span className="text-sm font-medium text-slate-700">Gialli Accumulati</span>
                    <Badge className="bg-yellow-100 text-yellow-700">
                      {player.yellow_cards_accumulated || 0}
                    </Badge>
                  </div>
                  
                  {Object.entries(seasonStats).map(([season, stats]) => (
                    <div key={season} className="border-t pt-3">
                      <p className="text-xs font-semibold text-slate-600 mb-2">{season}</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-4 rounded bg-yellow-400" />
                          <span className="text-slate-600">{stats.yellowCards} gialli</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-4 rounded bg-red-600" />
                          <span className="text-slate-600">{stats.redCards} rossi</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Storico Squalifiche */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                  Storico Squalifiche
                </CardTitle>
              </CardHeader>
              <CardContent>
                {suspensions.length > 0 ? (
                  <div className="space-y-3">
                    {suspensions.map(susp => (
                      <div key={susp.id} className="p-3 bg-red-50 rounded-lg border border-red-200">
                        <p className="text-sm font-medium text-slate-800">{susp.reason}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-slate-600">
                          {susp.matchday_of_card && (
                            <Badge variant="outline" className="text-xs">
                              G{susp.matchday_of_card}
                            </Badge>
                          )}
                          {susp.suspension_start_matchday && (
                            <span>Squalifica da G{susp.suspension_start_matchday}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-slate-500 text-sm">Nessuna squalifica</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Tab Trasferimenti */}
        <TabsContent value="transfers">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-emerald-500" />
                Storico Trasferimenti
              </CardTitle>
            </CardHeader>
            <CardContent>
              {transferHistory.length > 0 ? (
                <div className="space-y-4">
                  {transferHistory.map(transfer => (
                    <div 
                      key={transfer.id} 
                      className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border border-slate-200"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={
                            transfer.type === 'purchase' ? 'bg-emerald-100 text-emerald-700' :
                            transfer.type === 'loan' ? 'bg-blue-100 text-blue-700' :
                            transfer.type === 'swap' ? 'bg-purple-100 text-purple-700' :
                            'bg-slate-100 text-slate-700'
                          }>
                            {transfer.type === 'purchase' ? 'Acquisto' :
                             transfer.type === 'loan' ? 'Prestito' :
                             transfer.type === 'swap' ? 'Scambio' :
                             transfer.type === 'auction' ? 'Asta' : 'Parametro Zero'}
                          </Badge>
                          <Badge variant="outline" className={
                            transfer.status === 'completed' ? 'bg-green-50 text-green-700' :
                            transfer.status === 'accepted' ? 'bg-blue-50 text-blue-700' :
                            transfer.status === 'rejected' ? 'bg-red-50 text-red-700' :
                            'bg-yellow-50 text-yellow-700'
                          }>
                            {transfer.status === 'completed' ? 'Completato' :
                             transfer.status === 'accepted' ? 'Accettato' :
                             transfer.status === 'rejected' ? 'Rifiutato' : 'In attesa'}
                          </Badge>
                        </div>
                        
                        <p className="text-sm text-slate-700">
                          <span className="font-medium">{transfer.fromTeam?.name || 'N/A'}</span>
                          <TrendingUp className="w-3 h-3 mx-2 inline text-emerald-600" />
                          <span className="font-medium">{transfer.toTeam?.name || 'N/A'}</span>
                        </p>
                        
                        <p className="text-xs text-slate-500 mt-1">
                          {new Date(transfer.created_date).toLocaleDateString('it-IT')}
                        </p>
                      </div>
                      
                      {transfer.amount > 0 && (
                        <div className="text-right">
                          <Badge className="bg-emerald-100 text-emerald-700">
                            <Euro className="w-3 h-3 mr-1" />
                            {(transfer.amount / 1000000).toFixed(1)}M
                          </Badge>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <History className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">Nessun trasferimento registrato</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}