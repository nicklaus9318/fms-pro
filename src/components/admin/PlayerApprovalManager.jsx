import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, CheckCircle, XCircle, Loader2, Search, Filter, Calendar, Users, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ROLES = [
  { value: 'all', label: 'Tutti i Ruoli' },
  { value: 'POR', label: 'Portiere' },
  { value: 'DC', label: 'Difensore Centrale' },
  { value: 'TS', label: 'Terzino Sinistro' },
  { value: 'TD', label: 'Terzino Destro' },
  { value: 'CDC', label: 'Centrocampista Difensivo' },
  { value: 'CC', label: 'Centrocampista Centrale' },
  { value: 'COC', label: 'Centrocampista Offensivo' },
  { value: 'ES', label: 'Esterno Sinistro' },
  { value: 'ED', label: 'Esterno Destro' },
  { value: 'AS', label: 'Attaccante Sinistro' },
  { value: 'AD', label: 'Attaccante Destro' },
  { value: 'ATT', label: 'Attaccante' }
];

export default function PlayerApprovalManager() {
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [overallFilter, setOverallFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [hasShownNotification, setHasShownNotification] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');
  const [expandedSessions, setExpandedSessions] = useState({});

  const queryClient = useQueryClient();

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list()
  });

  const censimentoSessionName = appSettings.find(s => s.key === 'censimento_session_name')?.value || 'Sessione corrente';

  const { data: allCensimentoPlayers = [], isLoading } = useQuery({
    queryKey: ['allCensimentoPlayers'],
    queryFn: () => base44.entities.Player.list(),
    refetchInterval: 30000
  });

  const pendingPlayers = allCensimentoPlayers.filter(p => p.status === 'pending');

  const playersBySession = allCensimentoPlayers
    .filter(p => p.status === 'pending' || p.status === 'approved' || p.status === 'rejected')
    .reduce((acc, player) => {
      const session = player.censimento_session || censimentoSessionName;
      if (!acc[session]) acc[session] = [];
      acc[session].push(player);
      return acc;
    }, {});

  useEffect(() => {
    if (!hasShownNotification && pendingPlayers.length > 0) {
      toast.info(`🔔 Ci sono ${pendingPlayers.length} giocatori in attesa di approvazione`, { duration: 5000 });
      setHasShownNotification(true);
    }
  }, [pendingPlayers.length, hasShownNotification]);

  const updatePlayerMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Player.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allCensimentoPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['pendingPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['allPlayers'] });
    }
  });

  const handleApprovePlayer = async (playerId) => {
    await updatePlayerMutation.mutateAsync({ id: playerId, data: { status: 'approved' } });
    toast.success('Giocatore approvato');
  };

  const handleRejectPlayer = async (playerId) => {
    if (!window.confirm('Rifiutare questo giocatore?')) return;
    await updatePlayerMutation.mutateAsync({ id: playerId, data: { status: 'rejected' } });
    toast.success('Giocatore rifiutato');
  };

  const handleApproveAllInSession = async (sessionPlayers) => {
    const pending = sessionPlayers.filter(p => p.status === 'pending');
    if (!pending.length) return;
    if (!window.confirm(`Approvare ${pending.length} giocatori di questa sessione?`)) return;
    setIsApproving(true);
    try {
      await Promise.all(pending.map(p => base44.entities.Player.update(p.id, { status: 'approved' })));
      queryClient.invalidateQueries({ queryKey: ['allCensimentoPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['pendingPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      toast.success(`${pending.length} giocatori approvati`);
    } catch (e) { toast.error('Errore: ' + e.message); }
    setIsApproving(false);
  };

  const handleBulkApprove = async () => {
    if (selectedPlayers.length === 0) { toast.error('Seleziona almeno un giocatore'); return; }
    if (!window.confirm(`Approvare ${selectedPlayers.length} giocatori selezionati?`)) return;
    setIsApproving(true);
    try {
      await Promise.all(selectedPlayers.map(id => base44.entities.Player.update(id, { status: 'approved' })));
      queryClient.invalidateQueries({ queryKey: ['allCensimentoPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['pendingPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      toast.success(`${selectedPlayers.length} giocatori approvati`);
      setSelectedPlayers([]);
    } catch (error) { toast.error('Errore: ' + error.message); }
    setIsApproving(false);
  };

  const handleBulkReject = async () => {
    if (selectedPlayers.length === 0) { toast.error('Seleziona almeno un giocatore'); return; }
    if (!window.confirm(`Rifiutare ${selectedPlayers.length} giocatori?`)) return;
    setIsRejecting(true);
    try {
      await Promise.all(selectedPlayers.map(id => base44.entities.Player.update(id, { status: 'rejected' })));
      queryClient.invalidateQueries({ queryKey: ['allCensimentoPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['pendingPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      toast.success(`${selectedPlayers.length} giocatori rifiutati`);
      setSelectedPlayers([]);
    } catch (error) { toast.error('Errore: ' + error.message); }
    setIsRejecting(false);
  };

  const togglePlayerSelection = (playerId) => {
    setSelectedPlayers(prev => prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]);
  };

  const filteredPlayers = pendingPlayers.filter(player => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const fullName = `${player.first_name} ${player.last_name}`.toLowerCase();
      if (!fullName.includes(query)) return false;
    }
    if (roleFilter !== 'all' && player.role !== roleFilter) return false;
    if (overallFilter !== 'all') {
      const overall = player.overall_rating || 0;
      if (overallFilter === 'high' && overall < 80) return false;
      if (overallFilter === 'medium' && (overall < 70 || overall >= 80)) return false;
      if (overallFilter === 'low' && overall >= 70) return false;
      if (overallFilter === 'none' && overall > 0) return false;
    }
    if (dateFilter !== 'all' && player.created_date) {
      const diffDays = Math.floor((new Date() - new Date(player.created_date)) / (1000 * 60 * 60 * 24));
      if (dateFilter === 'today' && diffDays > 0) return false;
      if (dateFilter === 'week' && diffDays > 7) return false;
      if (dateFilter === 'month' && diffDays > 30) return false;
    }
    return true;
  });

  const toggleSelectAll = () => {
    if (selectedPlayers.length === filteredPlayers.length && filteredPlayers.length > 0) {
      setSelectedPlayers([]);
    } else {
      setSelectedPlayers(filteredPlayers.map(p => p.id));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* Tab switch */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'pending' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          In Attesa ({pendingPlayers.length})
        </button>
        <button
          onClick={() => setActiveTab('bySession')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'bySession' ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
        >
          Per Sessione ({Object.keys(playersBySession).length})
        </button>
      </div>

      {/* ── VISTA PER SESSIONE ── */}
      {activeTab === 'bySession' && (
        <div className="space-y-3">
          {Object.keys(playersBySession).length === 0 ? (
            <div className="text-center py-8 text-slate-400">Nessun giocatore censito</div>
          ) : (
            Object.entries(playersBySession).map(([session, sessionPlayers]) => {
              const pending = sessionPlayers.filter(p => p.status === 'pending');
              const approved = sessionPlayers.filter(p => p.status === 'approved');
              const rejected = sessionPlayers.filter(p => p.status === 'rejected');
              const isExpanded = expandedSessions[session] !== false;
              return (
                <Card key={session} className="overflow-hidden">
                  <CardHeader
                    className="pb-3 cursor-pointer hover:bg-slate-50"
                    onClick={() => setExpandedSessions(prev => ({ ...prev, [session]: !isExpanded }))}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-wrap">
                        <CardTitle className="text-base">{session}</CardTitle>
                        {pending.length > 0 && <Badge className="bg-amber-100 text-amber-700 text-xs">{pending.length} in attesa</Badge>}
                        {approved.length > 0 && <Badge className="bg-emerald-100 text-emerald-700 text-xs">{approved.length} approvati</Badge>}
                        {rejected.length > 0 && <Badge className="bg-rose-100 text-rose-700 text-xs">{rejected.length} rifiutati</Badge>}
                      </div>
                      <div className="flex items-center gap-2">
                        {pending.length > 0 && (
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700 text-xs"
                            onClick={(e) => { e.stopPropagation(); handleApproveAllInSession(sessionPlayers); }}
                            disabled={isApproving}
                          >
                            Approva tutti ({pending.length})
                          </Button>
                        )}
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>
                  </CardHeader>
                  {isExpanded && (
                    <CardContent className="pt-0 space-y-2">
                      {sessionPlayers.map(player => (
                        <div key={player.id} className={`flex items-center justify-between p-3 rounded-lg border ${
                          player.status === 'pending' ? 'bg-amber-50 border-amber-200' :
                          player.status === 'approved' ? 'bg-emerald-50 border-emerald-200 opacity-80' :
                          'bg-rose-50 border-rose-200 opacity-70'
                        }`}>
                          <div>
                            <p className="font-medium text-slate-800">{player.first_name} {player.last_name}</p>
                            <div className="flex gap-2 mt-0.5 flex-wrap">
                              <Badge variant="outline" className="text-xs">{player.role}</Badge>
                              {player.overall_rating && <Badge className="bg-emerald-100 text-emerald-700 text-xs">OVR {player.overall_rating}</Badge>}
                              {player.created_by && <span className="text-xs text-slate-400">{player.created_by.split('@')[0]}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {player.status === 'pending' && (
                              <>
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprovePlayer(player.id)}>
                                  <Check className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="outline" className="text-rose-600 border-rose-200" onClick={() => handleRejectPlayer(player.id)}>
                                  <X className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {player.status === 'approved' && <Badge className="bg-emerald-100 text-emerald-700 text-xs">✓ Approvato</Badge>}
                            {player.status === 'rejected' && (
                              <div className="flex items-center gap-2">
                                <Badge className="bg-rose-100 text-rose-700 text-xs">✗ Rifiutato</Badge>
                                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-xs" onClick={() => handleApprovePlayer(player.id)}>Riapprova</Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* ── VISTA IN ATTESA ── */}
      {activeTab === 'pending' && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                  <Users className="w-4 h-4" />In Attesa
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-amber-600">{pendingPlayers.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                  <Filter className="w-4 h-4" />Filtrati
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-blue-600">{filteredPlayers.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />Selezionati
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-emerald-600">{selectedPlayers.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="w-5 h-5" />Filtri
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Cerca per Nome</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder="Nome giocatore..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Ruolo</Label>
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLES.map(role => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Overall</Label>
                  <Select value={overallFilter} onValueChange={setOverallFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutti</SelectItem>
                      <SelectItem value="high">Alto (80+)</SelectItem>
                      <SelectItem value="medium">Medio (70-79)</SelectItem>
                      <SelectItem value="low">Basso (&lt;70)</SelectItem>
                      <SelectItem value="none">Non Specificato</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data Registrazione</Label>
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tutte</SelectItem>
                      <SelectItem value="today">Oggi</SelectItem>
                      <SelectItem value="week">Ultima Settimana</SelectItem>
                      <SelectItem value="month">Ultimo Mese</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bulk actions */}
          {filteredPlayers.length > 0 && (
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedPlayers.length === filteredPlayers.length && filteredPlayers.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
                <span className="text-sm font-medium text-slate-700">
                  {selectedPlayers.length === filteredPlayers.length && filteredPlayers.length > 0 ? 'Deseleziona tutti' : 'Seleziona tutti'}
                </span>
              </div>
              <div className="flex gap-2">
                {selectedPlayers.length > 0 && (
                  <>
                    <Button onClick={handleBulkApprove} disabled={isApproving || isRejecting} className="bg-emerald-600 hover:bg-emerald-700">
                      {isApproving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Approvazione...</> : <><CheckCircle className="w-4 h-4 mr-2" />Approva {selectedPlayers.length}</>}
                    </Button>
                    <Button onClick={handleBulkReject} disabled={isApproving || isRejecting} variant="destructive">
                      {isRejecting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Rifiuto...</> : <><XCircle className="w-4 h-4 mr-2" />Rifiuta {selectedPlayers.length}</>}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-500" />
                Giocatori in Attesa ({filteredPlayers.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {filteredPlayers.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b bg-slate-50">
                      <tr>
                        <th className="text-left p-3 text-sm font-semibold text-slate-600 w-12">
                          <Checkbox checked={selectedPlayers.length === filteredPlayers.length} onCheckedChange={toggleSelectAll} />
                        </th>
                        <th className="text-left p-3 text-sm font-semibold text-slate-600">Nome</th>
                        <th className="text-left p-3 text-sm font-semibold text-slate-600">Ruolo</th>
                        <th className="text-left p-3 text-sm font-semibold text-slate-600">Età</th>
                        <th className="text-left p-3 text-sm font-semibold text-slate-600">Overall</th>
                        <th className="text-left p-3 text-sm font-semibold text-slate-600">Registrato da</th>
                        <th className="text-left p-3 text-sm font-semibold text-slate-600">Data</th>
                        <th className="text-right p-3 text-sm font-semibold text-slate-600">Azioni</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.map((player, idx) => (
                        <tr key={player.id} className={`border-b hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
                          <td className="p-3">
                            <Checkbox checked={selectedPlayers.includes(player.id)} onCheckedChange={() => togglePlayerSelection(player.id)} />
                          </td>
                          <td className="p-3">
                            <div>
                              <p className="font-medium text-slate-800">{player.first_name} {player.last_name}</p>
                              {player.id_sofifa && (
                                <a href={`https://sofifa.com/player/${player.id_sofifa}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">SoFIFA ↗</a>
                              )}
                            </div>
                          </td>
                          <td className="p-3"><Badge variant="outline" className="font-mono">{player.role}</Badge></td>
                          <td className="p-3 text-slate-600">{player.age || '-'}</td>
                          <td className="p-3">
                            {player.overall_rating ? (
                              <Badge className={player.overall_rating >= 80 ? 'bg-emerald-100 text-emerald-700' : player.overall_rating >= 70 ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}>
                                {player.overall_rating}
                              </Badge>
                            ) : <span className="text-slate-400 text-sm">-</span>}
                          </td>
                          <td className="p-3"><span className="text-sm text-slate-600">{player.created_by?.split('@')[0] || 'N/D'}</span></td>
                          <td className="p-3">
                            {player.created_date ? (
                              <div className="flex items-center gap-1 text-sm text-slate-600">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(player.created_date), 'dd/MM/yyyy')}
                              </div>
                            ) : <span className="text-slate-400 text-sm">-</span>}
                          </td>
                          <td className="p-3">
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => handleApprovePlayer(player.id)}>
                                <Check className="w-4 h-4" />
                              </Button>
                              <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={() => handleRejectPlayer(player.id)}>
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  {pendingPlayers.length === 0 ? (
                    <>
                      <CheckCircle className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
                      <p className="text-slate-500">Nessun giocatore in attesa di approvazione</p>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-slate-500">Nessun giocatore corrisponde ai filtri applicati</p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => { setSearchQuery(''); setRoleFilter('all'); setOverallFilter('all'); setDateFilter('all'); }}>
                        Resetta Filtri
                      </Button>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
