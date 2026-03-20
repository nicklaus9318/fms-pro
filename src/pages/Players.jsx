import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Search, Filter, Grid3X3, List, User } from 'lucide-react';
import PlayerCard from '@/components/players/PlayerCard';
import PlayerForm from '@/components/players/PlayerForm';
import PlayerEditModal from '@/components/players/PlayerEditModal';
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

export default function Players() {
  const [user, setUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid');
  const [minOverall, setMinOverall] = useState('');
  const [maxOverall, setMaxOverall] = useState('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [availabilityFilter, setAvailabilityFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(0);
  const playersPerPage = 150;

  useEffect(() => { setCurrentPage(0); }, [search, roleFilter, statusFilter, minOverall, maxOverall, minAge, maxAge, availabilityFilter]);

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

  const { data: allPlayers = [], isLoading } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => base44.entities.Player.list()
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Player.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allPlayers'] }); toast.success('Giocatore creato'); setShowForm(false); setSelectedPlayer(null); }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Player.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['allPlayers'] }); toast.success('Giocatore aggiornato'); setShowForm(false); setSelectedPlayer(null); }
  });

  const handleSubmit = async (data) => {
    if (selectedPlayer) await updateMutation.mutateAsync({ id: selectedPlayer.id, data });
    else await createMutation.mutateAsync(data);
  };

  const handleEdit = (player) => { setSelectedPlayer(player); setShowEditModal(true); };
  const handleSavePlayer = async (data) => { await updateMutation.mutateAsync({ id: selectedPlayer.id, data }); };

  const filteredPlayers = allPlayers.filter(player => {
    const matchesSearch = search === '' || `${player.first_name} ${player.last_name}`.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || player.role === roleFilter;
    const matchesStatus = statusFilter === 'all' || player.status === statusFilter;
    const matchesOverall = (minOverall === '' || (player.overall_rating && player.overall_rating >= parseInt(minOverall))) &&
                           (maxOverall === '' || (player.overall_rating && player.overall_rating <= parseInt(maxOverall)));
    const matchesAge = (minAge === '' || (player.age && player.age >= parseInt(minAge))) &&
                       (maxAge === '' || (player.age && player.age <= parseInt(maxAge)));
    const matchesAvailability = availabilityFilter === 'all' ||
      (availabilityFilter === 'free' && !player.team_id) ||
      (availabilityFilter === 'assigned' && player.team_id);
    return matchesSearch && matchesRole && matchesStatus && matchesOverall && matchesAge && matchesAvailability;
  }).sort((a, b) => (b.overall_rating || 0) - (a.overall_rating || 0));

  const getTeamName = (teamId) => teams.find(t => t.id === teamId)?.name || 'Svincolato';

  const totalPages = Math.ceil(filteredPlayers.length / playersPerPage) || 1;
  const paginatedPlayers = filteredPlayers.slice(currentPage * playersPerPage, (currentPage + 1) * playersPerPage);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Giocatori</h1>
          <p className="text-slate-500">
            Trovati: {filteredPlayers.length} di {allPlayers.length} giocatori
            {filteredPlayers.length > playersPerPage && ` (pagina ${currentPage + 1} di ${totalPages})`}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setSelectedPlayer(null); setShowForm(true); }} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" />
            Aggiungi Giocatore
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input placeholder="Cerca giocatore per nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <Filter className="w-4 h-4 mr-2 text-slate-400" />
              <SelectValue placeholder="Ruolo" />
            </SelectTrigger>
            <SelectContent>
              {ROLES.map(role => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={availabilityFilter} onValueChange={setAvailabilityFilter}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Disponibilità" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="free">Svincolati</SelectItem>
              <SelectItem value="assigned">Con squadra</SelectItem>
            </SelectContent>
          </Select>
          {isAdmin && (
            <Tabs value={statusFilter} onValueChange={setStatusFilter}>
              <TabsList>
                <TabsTrigger value="approved">Approvati</TabsTrigger>
                <TabsTrigger value="pending">In attesa</TabsTrigger>
                <TabsTrigger value="all">Tutti</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
            <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('grid')} className="h-8 w-8"><Grid3X3 className="w-4 h-4" /></Button>
            <Button variant={viewMode === 'list' ? 'secondary' : 'ghost'} size="icon" onClick={() => setViewMode('list')} className="h-8 w-8"><List className="w-4 h-4" /></Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600">Overall Min</label>
            <Input type="number" placeholder="Es: 70" value={minOverall} onChange={(e) => setMinOverall(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600">Overall Max</label>
            <Input type="number" placeholder="Es: 90" value={maxOverall} onChange={(e) => setMaxOverall(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600">Età Min</label>
            <Input type="number" placeholder="Es: 18" value={minAge} onChange={(e) => setMinAge(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600">Età Max</label>
            <Input type="number" placeholder="Es: 35" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} className="h-9" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : paginatedPlayers.length > 0 ? (
        viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {paginatedPlayers.map(player => (
              <PlayerCard key={player.id} player={player} onClick={isAdmin ? () => handleEdit(player) : undefined}
                showTeam={true} teamName={getTeamName(player.team_id)} showHistoryButton={true} />
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
                  <th className="text-left p-3 text-sm font-semibold text-slate-700">Squadra</th>
                  {isAdmin && <th className="text-left p-3 text-sm font-semibold text-slate-700">Azioni</th>}
                </tr>
              </thead>
              <tbody>
                {paginatedPlayers.map(player => {
                  const photoUrl = getSofifaPhotoUrl(player);
                  return (
                    <tr key={player.id} className="border-t border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer"
                      onClick={isAdmin ? () => handleEdit(player) : undefined}>
                      <td className="p-3">
                        {photoUrl ? (
                          <img src={photoUrl} alt={`${player.first_name} ${player.last_name}`}
                            className="w-10 h-10 rounded-lg object-cover"
                            onError={(e) => { const fb = getSofifaFallbackUrl(player.id_sofifa); if (fb && e.target.src !== fb) { e.target.src = fb; } else { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; } }} />
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
                      <td className="p-3 text-sm text-slate-600">{getTeamName(player.team_id)}</td>
                      {isAdmin && (
                        <td className="p-3">
                          <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleEdit(player); }}>Modifica</Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        <div className="text-center py-12">
          <p className="text-slate-500">Nessun giocatore trovato</p>
        </div>
      )}

      {filteredPlayers.length > playersPerPage && (
        <div className="flex justify-between items-center mt-6 pt-6 border-t border-slate-200">
          <Button variant="outline" onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))} disabled={currentPage === 0}>Precedente</Button>
          <span className="text-sm text-slate-700">Pagina {currentPage + 1} di {totalPages}</span>
          <Button variant="outline" onClick={() => setCurrentPage(prev => prev + 1)} disabled={(currentPage + 1) >= totalPages}>Successiva</Button>
        </div>
      )}

      {isAdmin && (
        <>
          <PlayerForm open={showForm} onClose={() => { setShowForm(false); setSelectedPlayer(null); }}
            onSubmit={handleSubmit} player={selectedPlayer} teams={teams} isAdmin={isAdmin} />
          <PlayerEditModal open={showEditModal} onClose={() => { setShowEditModal(false); setSelectedPlayer(null); }}
            player={selectedPlayer} teams={teams} onSave={handleSavePlayer} isAdmin={isAdmin} />
        </>
      )}
    </div>
  );
}
