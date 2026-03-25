import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Search, Grid3X3, List, User } from 'lucide-react';
import PlayerCard from '@/components/players/PlayerCard';
import { toast } from 'sonner';

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
  sofifaId = String(sofifaId).trim();
  if (sofifaId.includes('sofifa.com')) {
    const match = sofifaId.match(/\/player\/(\d+)\//);
    if (match) sofifaId = match[1];
    else return null;
  }
  sofifaId = sofifaId.replace(/\D/g, '');
  if (sofifaId.length < 4) return null;
  // FotMob CDN - nessuna restrizione hotlink
  return `https://images.fotmob.com/image_resources/playerimages/${sofifaId}.png`;
};

const getSofifaFallbackUrl = (sofifaId) => {
  if (!sofifaId) return null;
  const id = String(sofifaId).replace(/\D/g, '');
  if (id.length < 4) return null;
  // Fallback FUTWIZ
  return `https://cdn.futwiz.com/assets/img/fc25/faces/${id}.png`;
};

export default function FreeAgents() {
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid');

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {}
    };
    loadUser();
  }, []);

  const isAdmin = user?.role === 'admin';

  const { data: freePlayers = [], isLoading } = useQuery({
    queryKey: ['freePlayers'],
    queryFn: () => base44.entities.Player.filter({ status: 'approved' })
  });

  const filteredPlayers = freePlayers
    .filter(p => !p.team_id)
    .filter(player => {
      const matchesSearch = search === '' || 
        `${player.first_name} ${player.last_name}`.toLowerCase().includes(search.toLowerCase());
      const matchesRole = roleFilter === 'all' || player.role === roleFilter;
      return matchesSearch && matchesRole;
    })
    .sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));

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

      <div className="flex flex-col sm:flex-row gap-4">
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
          <SelectTrigger className="w-full sm:w-[200px]">
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
            <p className="text-slate-500">Nessun giocatore svincolato</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
