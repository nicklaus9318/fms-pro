import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar, AlertCircle, Ticket, Shield, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import moment from 'moment';
import 'moment/locale/it';

moment.locale('it');

export default function SimpleDashboard() {
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {
        base44.auth.redirectToLogin();
      }
    };
    loadUser();
  }, []);

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const { data: players = [] } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.filter({ status: 'approved' })
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list()
  });

  const { data: lottoDraws = [] } = useQuery({
    queryKey: ['lottoDraws'],
    queryFn: () => base44.entities.LottoNumber.list('-created_date', 1)
  });

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list()
  });

  const backgroundImage = appSettings.find(s => s.key === 'background_image')?.value || '';

  const myTeams = teams.filter(t => t.owner_email === user?.email);
  const maggioreTeam = myTeams.find(t => t.team_type === 'maggiore' || !t.team_type);
  const primaveraTeam = myTeams.find(t => t.team_type === 'primavera');

  const myTeamIds = myTeams.map(t => t.id);
  const myPlayers = players.filter(p => myTeamIds.includes(p.team_id));

  const upcomingMatches = matches
    .filter(m => 
      m.status === 'scheduled' && 
      (myTeamIds.includes(m.home_team_id) || myTeamIds.includes(m.away_team_id))
    )
    .sort((a, b) => (a.matchday || 0) - (b.matchday || 0))
    .slice(0, 5);

  const unavailablePlayers = myPlayers.filter(p => 
    p.player_status === 'injured' || p.player_status === 'suspended'
  );

  const latestLotto = lottoDraws.length > 0 ? lottoDraws[0] : null;
  const lottoAffectedPlayers = latestLotto && latestLotto.numbers 
    ? myPlayers.filter(p => latestLotto.numbers.includes(p.lotto_number))
    : [];

  const getTeam = (teamId) => {
    if (!teamId) return null;
    return teams.find(t => t.id === teamId);
  };

  return (
    <div 
      className="space-y-8 min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-emerald-50/30 bg-cover bg-center bg-fixed"
      style={backgroundImage ? { backgroundImage: `url(${backgroundImage})` } : {}}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-800 to-emerald-600 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-slate-600 text-lg">Benvenuto, <span className="font-semibold text-emerald-600">{user?.full_name || 'Manager'}</span></p>
        </div>
      </div>

      {/* Le Mie Rose */}
      <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl hover:shadow-2xl transition-shadow duration-300">
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="flex items-center gap-3 text-2xl">
            <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30">
              <Users className="w-6 h-6 text-white" />
            </div>
            Le Mie Rose
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {maggioreTeam && (
              <div 
                onClick={() => navigate(createPageUrl('Teams') + `?team=${maggioreTeam.id}`)}
                className="relative p-6 rounded-2xl bg-gradient-to-br from-emerald-500 via-emerald-400 to-emerald-600 cursor-pointer hover:shadow-2xl hover:scale-105 transition-all duration-300 group overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-12 -mb-12" />
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs text-emerald-100 uppercase tracking-wider font-medium mb-1">Squadra Maggiore</p>
                      <p className="font-bold text-white text-xl flex items-center gap-3">
                        {maggioreTeam.logo_url && (
                          <img src={maggioreTeam.logo_url} alt={maggioreTeam.name} className="w-16 h-16 object-contain" />
                        )}
                        {maggioreTeam.name}
                        <ChevronRight className="w-5 h-5 text-white group-hover:translate-x-2 transition-transform duration-300" />
                      </p>
                    </div>
                    <Shield className="w-12 h-12 text-white/30" />
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <p className="text-xs text-emerald-100 mb-1">Giocatori</p>
                      <p className="font-bold text-white text-2xl">
                        {players.filter(p => p.team_id === maggioreTeam.id).length}
                      </p>
                    </div>
                    <div className="border-l border-white/20 pl-6">
                      <p className="text-xs text-emerald-100 mb-1">Budget</p>
                      <p className="font-bold text-white text-2xl">
                        €{((maggioreTeam.budget || 0) / 1000000).toFixed(2)}M
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {primaveraTeam && (
              <div 
                onClick={() => navigate(createPageUrl('Teams') + `?team=${primaveraTeam.id}`)}
                className="relative p-6 rounded-2xl bg-gradient-to-br from-blue-500 via-blue-400 to-blue-600 cursor-pointer hover:shadow-2xl hover:scale-105 transition-all duration-300 group overflow-hidden"
              >
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full -ml-12 -mb-12" />
                
                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-xs text-blue-100 uppercase tracking-wider font-medium mb-1">Squadra Primavera</p>
                      <p className="font-bold text-white text-xl flex items-center gap-3">
                        {primaveraTeam.logo_url && (
                          <img src={primaveraTeam.logo_url} alt={primaveraTeam.name} className="w-16 h-16 object-contain" />
                        )}
                        {primaveraTeam.name}
                        <ChevronRight className="w-5 h-5 text-white group-hover:translate-x-2 transition-transform duration-300" />
                      </p>
                    </div>
                    <Shield className="w-12 h-12 text-white/30" />
                  </div>
                  <div className="flex gap-6 text-sm">
                    <div>
                      <p className="text-xs text-blue-100 mb-1">Giocatori</p>
                      <p className="font-bold text-white text-2xl">
                        {players.filter(p => p.team_id === primaveraTeam.id).length}
                      </p>
                    </div>
                    <div className="border-l border-white/20 pl-6">
                      <p className="text-xs text-blue-100 mb-1">Budget</p>
                      <p className="font-bold text-white text-2xl">
                        €{((primaveraTeam.budget || 0) / 1000000).toFixed(2)}M
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {myTeams.length === 0 && (
            <p className="text-center text-slate-400 py-4">Non sei ancora assegnato a una squadra</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Agenda */}
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl hover:shadow-2xl transition-shadow duration-300">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/30">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              Prossime Partite
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            {upcomingMatches.length > 0 ? (
              upcomingMatches.map(match => {
                const homeTeam = getTeam(match.home_team_id);
                const awayTeam = getTeam(match.away_team_id);
                if (!homeTeam || !awayTeam) return null;
                return (
                  <div key={match.id} className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-slate-50 to-blue-50/30 border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all duration-200">
                    <div className="flex items-center gap-4 flex-1">
                      <Badge className="bg-blue-100 text-blue-700 font-semibold">G{match.matchday}</Badge>
                      <div className="text-sm flex-1">
                        <span className="font-semibold text-slate-800">{homeTeam.name}</span>
                        <span className="text-slate-400 mx-2 font-medium">vs</span>
                        <span className="font-semibold text-slate-800">{awayTeam.name}</span>
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-center text-slate-400 py-4">Nessuna partita programmata</p>
            )}
          </CardContent>
        </Card>

        {/* Indisponibili */}
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl hover:shadow-2xl transition-shadow duration-300">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="flex items-center gap-3 text-xl">
              <div className="p-2 rounded-lg bg-gradient-to-br from-rose-500 to-rose-600 shadow-lg shadow-rose-500/30">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              Giocatori Indisponibili
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-6">
            {/* Lotto */}
            {lottoAffectedPlayers.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Ticket className="w-4 h-4 text-amber-500" />
                  <p className="text-xs font-semibold text-amber-700 uppercase">Estratti Lotto</p>
                </div>
                {lottoAffectedPlayers.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded bg-amber-50">
                    <span className="text-sm font-medium text-slate-800">
                      {p.first_name} {p.last_name}
                    </span>
                    <Badge className="bg-amber-500 text-white">#{p.lotto_number}</Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Infortunati/Squalificati */}
            {unavailablePlayers.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-rose-700 uppercase mb-2">Infortuni/Squalifiche</p>
                {unavailablePlayers.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded bg-rose-50">
                    <span className="text-sm font-medium text-slate-800">
                      {p.first_name} {p.last_name}
                    </span>
                    <Badge className={p.player_status === 'injured' ? 'bg-rose-500' : 'bg-red-600'}>
                      {p.player_status === 'injured' ? 'Infortunato' : 'Squalificato'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {lottoAffectedPlayers.length === 0 && unavailablePlayers.length === 0 && (
              <p className="text-center text-slate-400 py-4">Tutti i giocatori disponibili</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}