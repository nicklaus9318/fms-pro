import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Users, Euro, Shield, Settings, Loader2, Search, ChevronLeft, ChevronRight, Upload } from 'lucide-react';
import DepartmentAverages from '@/components/dashboard/DepartmentAverages';
import TeamTableView from '@/components/team/TeamTableView';
import { supabase } from '@/api/supabaseClient';
import { compressImage } from '@/lib/r2Client';
import { toast } from 'sonner';

const EMPTY_FORM = {
  name: '',
  budget: '',
  initial_budget: '',
  owner_email: '',
  primary_color: '#10B981',
  secondary_color: '#FFFFFF',
  logo_url: '',
  team_type: 'maggiore'
};

export default function Teams() {
  const [user, setUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null); // squadra in modifica
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const teamsPerPage = 9;
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const teamIdFromUrl = urlParams.get('team');

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const isAdmin = user?.role === 'admin';

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const { data: players = [] } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.filter({ status: 'approved' })
  });

  useEffect(() => {
    if (teamIdFromUrl && teams.length > 0) {
      const team = teams.find(t => t.id === teamIdFromUrl);
      if (team) setSelectedTeam(team);
    }
  }, [teamIdFromUrl, teams]);

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Team.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Squadra creata con successo');
      setShowForm(false);
      setEditingTeam(null);
      setFormData(EMPTY_FORM);
    },
    onError: (e) => toast.error('Errore: ' + e.message)
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Team.update(id, data),
    onSuccess: (updatedTeam) => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Squadra aggiornata');
      // Aggiorna selectedTeam con i dati nuovi (logo incluso)
      if (selectedTeam && updatedTeam) setSelectedTeam(updatedTeam);
      setShowForm(false);
      setEditingTeam(null);
      setFormData(EMPTY_FORM);
    },
    onError: (e) => toast.error('Errore: ' + e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: async (teamId) => {
      const teamPlayers = players.filter(p => p.team_id === teamId);
      await Promise.all(
        teamPlayers.map(player =>
          base44.entities.Player.update(player.id, { team_id: null })
        )
      );
      await base44.entities.Team.delete(teamId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      toast.success('Squadra eliminata e giocatori svincolati');
      setSelectedTeam(null);
    },
    onError: (e) => toast.error('Errore eliminazione: ' + e.message)
  });

  // FIX: openEdit setta il formData PRIMA di aprire il dialog
  const openEdit = useCallback((team, e) => {
    e?.stopPropagation();
    setEditingTeam(team);
    setFormData({
      name: team.name || '',
      budget: team.budget || '',
      initial_budget: team.initial_budget || '',
      owner_email: team.owner_email || '',
      primary_color: team.primary_color || '#10B981',
      secondary_color: team.secondary_color || '#FFFFFF',
      logo_url: team.logo_url || '',
      team_type: team.team_type || 'maggiore'
    });
    setShowForm(true);
  }, []);

  const openCreate = useCallback(() => {
    setEditingTeam(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
  }, []);

  const handleDeleteTeam = (e) => {
    e?.stopPropagation();
    if (!selectedTeam) return;
    if (window.confirm(`Sei sicuro di eliminare "${selectedTeam.name}"?\n\nTutti i giocatori verranno automaticamente svincolati.`)) {
      deleteMutation.mutate(selectedTeam.id);
    }
  };

  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      // Comprimi immagine prima dell'upload
      const compressed = await compressImage(file, { maxWidth: 300, maxHeight: 300, quality: 0.75 });
      const fileExt = 'jpg';
      const fileName = `team-logos/${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from('backgrounds').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('backgrounds').getPublicUrl(fileName);
      setFormData(prev => ({ ...prev, logo_url: publicUrl }));
      toast.success('Logo caricato');
    } catch (error) {
      toast.error('Errore caricamento logo: ' + error.message);
    }
    setUploadingLogo(false);
    e.target.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const dataToSubmit = {
      ...formData,
      budget: formData.budget !== '' ? parseFloat(formData.budget) : 0,
      initial_budget: formData.initial_budget !== '' ? parseFloat(formData.initial_budget) : 0
    };
    if (editingTeam) {
      await updateMutation.mutateAsync({ id: editingTeam.id, data: dataToSubmit });
    } else {
      await createMutation.mutateAsync(dataToSubmit);
    }
    setLoading(false);
  };

  // Filtri
  const filteredTeams = teams.filter(team => {
    const matchesSearch = team.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (team.owner_email && team.owner_email.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType = filterType === 'all' || team.team_type === filterType;
    return matchesSearch && matchesType;
  });

  const totalPages = Math.ceil(filteredTeams.length / teamsPerPage);
  const startIndex = (currentPage - 1) * teamsPerPage;
  const paginatedTeams = filteredTeams.slice(startIndex, startIndex + teamsPerPage);

  useEffect(() => { setCurrentPage(1); }, [searchQuery, filterType]);

  const ROLE_ORDER = { 'POR': 1, 'DC': 2, 'TS': 3, 'TD': 4, 'CDC': 5, 'CC': 6, 'COC': 7, 'ES': 8, 'ED': 9, 'AS': 10, 'AD': 11, 'ATT': 12 };
  const getTeamPlayers = (teamId) =>
    players.filter(p => p.team_id === teamId).sort((a, b) => (ROLE_ORDER[a.role] || 99) - (ROLE_ORDER[b.role] || 99));

  const formatBudget = (budget) => {
    const amount = parseFloat(budget) || 0;
    if (amount >= 1000000) return `€${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `€${(amount / 1000).toFixed(0)}K`;
    return `€${amount.toLocaleString()}`;
  };

  // Vista dettaglio squadra
  if (selectedTeam) {
    const teamPlayers = getTeamPlayers(selectedTeam.id);
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setSelectedTeam(null)} className="text-slate-600">
            ← Torna alle squadre
          </Button>
          {isAdmin && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={(e) => openEdit(selectedTeam, e)}>
                <Settings className="w-4 h-4 mr-2" />
                Modifica
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteTeam}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Elimina Squadra
              </Button>
            </div>
          )}
        </div>

        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-0 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full -translate-y-32 translate-x-32"
            style={{ backgroundColor: selectedTeam.primary_color, opacity: 0.2 }} />
          <CardContent className="p-8">
            <div className="flex items-center gap-6">
              {selectedTeam.logo_url ? (
                <img src={selectedTeam.logo_url} alt={selectedTeam.name} className="w-24 h-24 rounded-xl object-cover" />
              ) : (
                <div className="w-24 h-24 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: selectedTeam.primary_color || '#10B981' }}>
                  <Shield className="w-12 h-12 text-white" />
                </div>
              )}
              <div>
                <h1 className="text-3xl font-bold">{selectedTeam.name}</h1>
                <p className="text-slate-400 mt-1">{selectedTeam.owner_email || 'Nessun proprietario'}</p>
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <Euro className="w-5 h-5 text-emerald-400" />
                    <span className="text-xl font-bold">{formatBudget(selectedTeam.budget)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-400" />
                    <span>{teamPlayers.length} giocatori</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <DepartmentAverages players={teamPlayers} />
        <TeamTableView teamId={selectedTeam.id} isAdmin={isAdmin} />

        {/* Form modifica (aperto dall'interno della vista dettaglio) */}
        <Dialog open={showForm} onOpenChange={(open) => { if (!open) { setShowForm(false); setEditingTeam(null); setFormData(EMPTY_FORM); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingTeam ? 'Modifica Squadra' : 'Nuova Squadra'}</DialogTitle>
            </DialogHeader>
            <TeamForm
              formData={formData}
              setFormData={setFormData}
              loading={loading}
              uploadingLogo={uploadingLogo}
              onSubmit={handleSubmit}
              onCancel={() => { setShowForm(false); setEditingTeam(null); setFormData(EMPTY_FORM); }}
              handleLogoUpload={handleLogoUpload}
              isEdit={!!editingTeam}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Squadre</h1>
          <p className="text-slate-500">{filteredTeams.length} squadre {filteredTeams.length !== teams.length && `di ${teams.length}`}</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" />
            Nuova Squadra
          </Button>
        )}
      </div>

      <Card className="bg-white border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input placeholder="Cerca per nome o proprietario..." value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le squadre</SelectItem>
                <SelectItem value="maggiore">Solo Maggiori</SelectItem>
                <SelectItem value="primavera">Solo Primavera</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => <div key={i} className="h-48 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : paginatedTeams.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {paginatedTeams.map(team => {
              const teamPlayers = getTeamPlayers(team.id);
              return (
                <Card key={team.id}
                  className="group cursor-pointer hover:shadow-lg transition-all duration-300 bg-white border-0 shadow-sm overflow-hidden"
                  onClick={() => setSelectedTeam(team)}
                >
                  <div className="h-2 w-full" style={{ backgroundColor: team.primary_color || '#10B981' }} />
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-4">
                      {team.logo_url ? (
                        <img src={team.logo_url} alt={team.name} className="w-14 h-14 rounded-xl object-cover" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl flex items-center justify-center"
                          style={{ backgroundColor: team.primary_color || '#10B981' }}>
                          <Shield className="w-7 h-7 text-white" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg truncate">{team.name}</CardTitle>
                        <p className="text-sm text-slate-500 truncate">{team.owner_email || 'Nessun proprietario'}</p>
                        {team.team_type === 'primavera' && (
                          <Badge variant="outline" className="mt-1 text-xs">Primavera</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Euro className="w-4 h-4 text-emerald-500" />
                        <span className="font-semibold text-slate-800">{formatBudget(team.budget)}</span>
                      </div>
                      <Badge variant="secondary" className="bg-slate-100">
                        <Users className="w-3 h-3 mr-1" />{teamPlayers.length}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <Button key={page} variant={currentPage === page ? "default" : "outline"} size="sm"
                    onClick={() => setCurrentPage(page)}
                    className={currentPage === page ? "bg-emerald-600" : ""}>
                    {page}
                  </Button>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      ) : filteredTeams.length === 0 && teams.length > 0 ? (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="py-12 text-center">
            <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Nessuna squadra trovata con i filtri selezionati</p>
            <Button onClick={() => { setSearchQuery(''); setFilterType('all'); }} className="mt-4" variant="outline">
              Cancella filtri
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Nessuna squadra registrata</p>
            {isAdmin && (
              <Button onClick={openCreate} className="mt-4" variant="outline">
                <Plus className="w-4 h-4 mr-2" />Crea la prima squadra
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Form modale (lista squadre) */}
      <Dialog open={showForm} onOpenChange={(open) => {
        if (!open) { setShowForm(false); setEditingTeam(null); setFormData(EMPTY_FORM); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingTeam ? 'Modifica Squadra' : 'Nuova Squadra'}</DialogTitle>
          </DialogHeader>
          <TeamForm
            formData={formData}
            setFormData={setFormData}
            loading={loading}
            uploadingLogo={uploadingLogo}
            onSubmit={handleSubmit}
            onCancel={() => { setShowForm(false); setEditingTeam(null); setFormData(EMPTY_FORM); }}
            handleLogoUpload={handleLogoUpload}
            isEdit={!!editingTeam}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Componente form estratto per riuso
function TeamForm({ formData, setFormData, loading, uploadingLogo, onSubmit, onCancel, handleLogoUpload, isEdit }) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Nome Squadra *</Label>
        <Input id="name" value={formData.name}
          onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Budget Attuale (€)</Label>
          <Input type="number" value={formData.budget}
            onChange={(e) => setFormData(prev => ({ ...prev, budget: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Budget Iniziale (€)</Label>
          <Input type="number" value={formData.initial_budget}
            onChange={(e) => setFormData(prev => ({ ...prev, initial_budget: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Email Proprietario</Label>
        <Input type="email" value={formData.owner_email}
          onChange={(e) => setFormData(prev => ({ ...prev, owner_email: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Tipo Squadra</Label>
        <Select value={formData.team_type} onValueChange={(v) => setFormData(prev => ({ ...prev, team_type: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="maggiore">Maggiore</SelectItem>
            <SelectItem value="primavera">Primavera</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Colore Primario</Label>
          <Input type="color" value={formData.primary_color}
            onChange={(e) => setFormData(prev => ({ ...prev, primary_color: e.target.value }))} className="h-10" />
        </div>
        <div className="space-y-2">
          <Label>Colore Secondario</Label>
          <Input type="color" value={formData.secondary_color}
            onChange={(e) => setFormData(prev => ({ ...prev, secondary_color: e.target.value }))} className="h-10" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Logo Squadra</Label>
        {formData.logo_url ? (
          <div className="flex items-center gap-3">
            <img src={formData.logo_url} alt="Logo" className="w-16 h-16 rounded-lg object-cover" />
            <Button type="button" variant="outline" size="sm"
              onClick={() => setFormData(prev => ({ ...prev, logo_url: '' }))}>
              Rimuovi
            </Button>
          </div>
        ) : (
          <>
            <input type="file" accept="image/*" onChange={handleLogoUpload}
              className="hidden" id={isEdit ? "logo-upload-edit" : "logo-upload-create"} disabled={uploadingLogo} />
            <label htmlFor={isEdit ? "logo-upload-edit" : "logo-upload-create"} className="block">
              <Button type="button" variant="outline" className="w-full" disabled={uploadingLogo} asChild>
                <span>
                  {uploadingLogo
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Caricamento...</>
                    : <><Upload className="w-4 h-4 mr-2" />Carica Logo</>}
                </span>
              </Button>
            </label>
          </>
        )}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Annulla</Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {isEdit ? 'Salva' : 'Crea Squadra'}
        </Button>
      </DialogFooter>
    </form>
  );
}
