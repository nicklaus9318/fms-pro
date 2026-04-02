import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Search, Grid3X3, List, User } from 'lucide-react';
import PlayerCard from '@/components/players/PlayerCard';

const ROLES = [
  { value: 'all', label: 'Tutti i ruoli' },
  { value: 'POR', label: 'Portiere' },
  { value: 'DC', label: 'Difensore Centrale' },
  { value: 'TS', label: 'Terzino Sinistro' },
  { value: 'TD', label: 'Terzino Destro' },
  { value: 'CDC', label: 'Centrocampista Difensivo' },
  { value: 'CC', label: 'Centrocampista Centrale' },
  { value: 'COC', label: 'Centrocampista Offensivo' },
  { value: 'ES', label: 'Esterno Sinistro' },
  { value: 'ED', label: 'Esterno Destro' },
  { value: 'AS', label: 'Ala Sinistra' },
  { value: 'AD', label: 'Ala Destra' },
  { value: 'ATT', label: 'Attaccante' },
];

const getSofifaPhotoUrl = (player) => {
  if (player?.photo_url && typeof player.photo_url === 'string') return player.photo_url;
  let sofifaId = player?.id_sofifa;
  if (!sofifaId) return null;
  sofifaId = String(sofifaId).replace(/\D/g, '');
  if (sofifaId.length < 4) return null;
  return `https://cdn.sofifa.net/players/${sofifaId}/26/60.png`;
};

const getSofifaFallbackUrl = (sofifaId) => {
  if (!sofifaId) return null;
  const id = String(sofifaId).replace(/\D/g, '');
  if (id.length < 4) return null;
  return `https://cdn.futwiz.com/assets/img/fc25/faces/${id}.png`;
};

export default function FreeAgents() {
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [minOverall, setMinOverall] = useState('');
  const [maxOverall, setMaxOverall] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;
        const { data } = await supabase.from('user_roles').select('*').eq('email', authUser.email).single();
        if (data) setUser(data);
      } catch (e) {}
    };
    loadUser();
  }, []);

  const isAdmin = user?.role === 'admin';

  const { data: freePlayers = [], isLoading } = useQuery({
    queryKey: ['freePlayers'],
    queryFn: async () => {
      let all = [];
      let from = 0;
      const batchSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from('players')
          .select('id,first_name,last_name,role,age,overall_rating,player_value,salary,team_id,id_sofifa,photo_url')
          .eq('status', 'approved')
          .is('team_id', null)
          .order('overall_rating', { ascending: false })
          .range(from, from + batchSize - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all = [...all, ...data];
        if (data.length < batchSize) break;
        from += batchSize;
      }
      return all;
    },
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const filteredPlayers = freePlayers.filter(player => {
    const matchesSearch = search === '' ||
      `${player.first_name} ${player.last_name}`.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || player.role === roleFilter;
    const matchesOvrMin = minOverall === '' || (player.overall_rating && player.overall_rating >= parseInt(minOverall));
    const matchesOvrMax = maxOverall === '' || (player.overall_rating && player.overall_rating <= parseInt(maxOverall));
    const matchesAgeMin = minAge === '' || (player.age && player.age >= parseInt(minAge));
    const matchesAgeMax = maxAge === '' || (player.age && player.age <= parseInt(maxAge));
    return matchesSearch && matchesRole && matchesOvrMin && matchesOvrMax && matchesAgeMin && matchesAgeMax;
  });

  const hasActiveFilters = minOverall || maxOverall || minAge || maxAge || roleFilter !== 'all' || search;

  const resetFilters = () => {
    setSearch('');
    setRoleFilter('all');
    setMinOverall('');
    setMaxOverall('');
    setMinAge('');
    setMaxAge('');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Users className="w-7 h-7 text-emerald-500" />
            Giocatori Svincolati
          </h1>
          <p className="text-slate-500">{filteredPlayers.length} giocatori senza squadra</p>
        </div>
      </div>

      {/* Filtri principali */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Cerca giocatore..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Ruolo" />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map(role => (
              <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('grid')} className="h-8 w-8">
            <Grid3X3 className="w-4 h-4" />
          </Button>
          <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')} className="h-8 w-8">
            <List className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filtri Overall e Età */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">OVR Min</label>
          <Input type="number" placeholder="Es: 75" value={minOverall} onChange={(e) => setMinOverall(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">OVR Max</label>
          <Input type="number" placeholder="Es: 91" value={maxOverall} onChange={(e) => setMaxOverall(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Età Min</label>
          <Input type="number" placeholder="Es: 18" value={minAge} onChange={(e) => setMinAge(e.target.value)} className="h-9 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-500">Età Max</label>
          <Input type="number" placeholder="Es: 30" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} className="h-9 text-sm" />
        </div>
      </div>

      {/* Badge risultati + reset */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">{filteredPlayers.length} risultati</span>
          <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-slate-400 hover:text-slate-600 h-7 px-2">
            ✕ Reset filtri
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredPlayers.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredPlayers.map(player => (
              <PlayerCard
                key={player.id}
                player={player}
                showTeam={true}
                teamName="Svincolato"
                showDeleteButton={isAdmin}
                showHistoryButton={true}
              />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white rounded-lg overflow-hidden shadow-sm">
              <thead className="bg-slate-100">
                <tr>
                  <th className="text-left p-3 text-sm font-semibold text-slate-700">Foto</th>
                  <th className="text-left p-3 text-sm font-semibold text-slate-700">Nome</th>
                  <th className="text-left p-3 text-sm font-semibold text-slate-700">Età</th>
                  <th className="text-left p-3 text-sm font-semibold text-slate-700">Ruolo</th>
                  <th className="text-left p-3 text-sm font-semibold text-slate-700">OVR</th>
                  <th className="text-left p-3 text-sm font-semibold text-slate-700">Valore</th>
                  <th className="text-left p-3 text-sm font-semibold text-slate-700">Stipendio</th>
                </tr>
              </thead>
              <tbody>
                {filteredPlayers.map(player => {
                  const photoUrl = getSofifaPhotoUrl(player);
                  return (
                    <tr key={player.id} className="border-t border-slate-200 hover:bg-slate-50 transition-colors">
                      <td className="p-3">
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={`${player.first_name} ${player.last_name}`}
                            className="w-10 h-10 rounded-lg object-cover"
                            onError={(e) => { const fb = getSofifaFallbackUrl(player.id_sofifa); if (fb && e.target.src !== fb) { e.target.src = fb; } else { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; } }}
                          />
                        ) : null}
                        <div className="w-10 h-10 rounded-lg bg-slate-100 items-center justify-center" style={{ display: photoUrl ? 'none' : 'flex' }}>
                          <User className="w-5 h-5 text-slate-400" />
                        </div>
                      </td>
                      <td className="p-3 text-sm font-medium text-slate-900">{player.first_name} {player.last_name}</td>
                      <td className="p-3 text-sm text-slate-600">{player.age || '-'}</td>
                      <td className="p-3 text-sm">
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-md text-xs font-medium">{player.role}</span>
                      </td>
                      <td className="p-3 text-sm font-semibold text-emerald-600">{player.overall_rating || '-'}</td>
                      <td className="p-3 text-sm text-slate-700">€{player.player_value ? (player.player_value / 1000000).toFixed(1) + 'M' : '-'}</td>
                      <td className="p-3 text-sm text-slate-700">€{player.salary ? (player.salary / 1000000).toFixed(1) + 'M' : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Nessun giocatore trovato</p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={resetFilters} className="mt-3">
                Reset filtri
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
