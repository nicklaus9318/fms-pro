import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gavel, Users, Search, Plus, Loader2, CheckCircle, XCircle, Clock, Trophy, Eye } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

const ROLES = ['POR','DC','TS','TD','CDC','CC','COC','ES','ED','AS','AD','ATT'];

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

export default function GestioneAste() {
  const [user, setUser] = useState(null);
  const [searchPlayer, setSearchPlayer] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterOverallMin, setFilterOverallMin] = useState('');
  const [filterOverallMax, setFilterOverallMax] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showBidsModal, setShowBidsModal] = useState(false);
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [auctionFormData, setAuctionFormData] = useState({
    auction_session_name: '',
    duration_hours: 24,
    price_percentage: 10,
    start_delay_hours: 0,
    max_bids_per_team: 5
  });
  const [closingAuction, setClosingAuction] = useState(null);
  const [selectedActiveAuctions, setSelectedActiveAuctions] = useState([]);
  const [closingBulk, setClosingBulk] = useState(false);
  const [deletingClosed, setDeletingClosed] = useState(false);
  const [closingSession, setClosingSession] = useState(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data } = await supabase.from('user_roles').select('*').eq('email', authUser.email).single();
      if (data) setUser(data);
    };
    loadUser();
  }, []);

  const isAdmin = user?.role === 'admin';

  // Carica solo i svincolati (team_id IS NULL) — molto più leggero di tutti i 5000
  const { data: freePlayers = [], isLoading: loadingPlayers } = useQuery({
    queryKey: ['freePlayersAuction'],
    queryFn: async () => {
      const { data } = await supabase
        .from('players')
        .select('id,first_name,last_name,role,age,overall_rating,player_value,team_id,id_sofifa,photo_url,status,created_by')
        .eq('status', 'approved')
        .is('team_id', null)
        .order('overall_rating', { ascending: false });
      return data || [];
    },
    enabled: isAdmin,
  });

  const { data: auctions = [] } = useQuery({
    queryKey: ['auctionsAdmin'],
    queryFn: async () => {
      const { data } = await supabase.from('auctions').select('id,player_id,player_name,auction_type,auction_session_name,status,starting_price,current_price,current_winner_team_id,current_winner_team_name,start_time,end_time,max_bids_per_team,league_id,seller_team_id,created_at').order('created_at', { ascending: false });
      return data || [];
    }
  });

  const { data: bids = [] } = useQuery({
    queryKey: ['allBids'],
    queryFn: async () => {
      const { data } = await supabase.from('bids').select('id,auction_id,team_id,team_name,amount,status,bid_time,created_at').order('created_at', { ascending: false });
      return data || [];
    }
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data } = await supabase.from('teams').select('id,name,owner_email,budget,logo_url,primary_color');
      return data || [];
    }
  });

  const { data: players = [] } = useQuery({
    queryKey: ['allPlayersAuction'],
    queryFn: async () => {
      const { data } = await supabase.from('players').select('id,first_name,last_name,role,age,overall_rating,player_value,team_id,id_sofifa,photo_url,status,created_by').eq('status', 'approved');
      return data || [];
    }
  });

  // Sessioni attive: raggruppa le aste attive per nome sessione
  const activeSessions = (() => {
    const sessionMap = {};
    auctions
      .filter(a => a.status === 'active' && a.auction_session_name)
      .forEach(a => {
        const name = a.auction_session_name;
        if (!sessionMap[name]) sessionMap[name] = { name, auctions: [], totalActive: 0 };
        sessionMap[name].auctions.push(a);
        sessionMap[name].totalActive++;
      });
    return Object.values(sessionMap);
  })();

  // Filtro client-side sui svincolati già caricati
  const freeFilteredPlayers = freePlayers.filter(p => {
    const nameMatch = !searchPlayer || `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchPlayer.toLowerCase());
    const roleMatch = filterRole === 'all' || p.role === filterRole;
    const minMatch = !filterOverallMin || (p.overall_rating || 0) >= parseInt(filterOverallMin);
    const maxMatch = !filterOverallMax || (p.overall_rating || 0) <= parseInt(filterOverallMax);
    return nameMatch && roleMatch && minMatch && maxMatch;
  });

  const togglePlayer = (playerId) => {
    setSelectedPlayers(prev =>
      prev.includes(playerId) ? prev.filter(id => id !== playerId) : [...prev, playerId]
    );
  };

  const toggleAll = () => {
    if (selectedPlayers.length === freeFilteredPlayers.length) {
      setSelectedPlayers([]);
    } else {
      setSelectedPlayers(freeFilteredPlayers.map(p => p.id));
    }
  };

  // Chiude tutte le aste di una sessione in bulk
  const closeSession = async (sessionName) => {
    if (!window.confirm(`Chiudere tutte le aste della sessione "${sessionName}"?`)) return;
    setClosingSession(sessionName);
    const sessionAuctions = auctions.filter(a => a.auction_session_name === sessionName && a.status === 'active');
    let success = 0, errors = 0;
    for (const auction of sessionAuctions) {
      try { await closeAuctionMutation.mutateAsync(auction.id); success++; }
      catch (e) { errors++; }
    }
    setClosingSession(null);
    toast.success(`Sessione "${sessionName}": chiuse ${success} aste${errors > 0 ? `, ${errors} errori` : ''}`);
  };

  const createAuctionsMutation = useMutation({
    mutationFn: async (data) => {
      const now = new Date();
      const startTime = new Date(now.getTime() + data.start_delay_hours * 60 * 60 * 1000);
      const endTime = new Date(startTime.getTime() + data.duration_hours * 60 * 60 * 1000);
      const pricePerc = data.price_percentage / 100;
      const auctionsToCreate = selectedPlayers.map(playerId => {
        const player = freePlayers.find(p => p.id === playerId);
        const startingPrice = Math.round((player?.player_value || 500000) * pricePerc);
        return {
          auction_type: 'sealed_bid',
          auction_session_name: data.auction_session_name,
          max_bids_per_team: data.max_bids_per_team || 5,
          player_id: playerId,
          player_name: player ? `${player.first_name} ${player.last_name}` : '',
          starting_price: startingPrice,
          current_price: startingPrice,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          status: 'active',
        };
      });
      const { error } = await supabase.from('auctions').insert(auctionsToCreate);
      if (error) throw error;
      return auctionsToCreate.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['auctionsAdmin'] });
      toast.success(`${count} aste create con successo!`);
      setShowCreateForm(false);
      setSelectedPlayers([]);
    },
    onError: (e) => toast.error('Errore: ' + e.message)
  });

  const closeAuctionMutation = useMutation({
    mutationFn: async (auctionId) => {
      setClosingAuction(auctionId);

      // 1. Recupera l'asta
      const auction = auctions.find(a => a.id === auctionId);
      if (!auction) throw new Error('Asta non trovata');

      // 2. Recupera tutte le offerte attive ordinate per importo decrescente
      const { data: auctionBids } = await supabase
        .from('bids')
        .select('*')
        .eq('auction_id', auctionId)
        .eq('status', 'active')
        .order('amount', { ascending: false });

      if (!auctionBids || auctionBids.length === 0) {
        // Nessuna offerta — annulla l'asta
        await supabase.from('auctions').update({ status: 'cancelled' }).eq('id', auctionId);
        return { winner: null };
      }

      const winningBid = auctionBids[0];
      const winningAmount = winningBid.amount;

      // 3. Recupera squadra vincitrice
      const { data: winnerTeam } = await supabase
        .from('teams')
        .select('*')
        .eq('id', winningBid.team_id)
        .single();
      if (!winnerTeam) throw new Error('Squadra vincitrice non trovata');

      // 4. Scala budget squadra vincitrice
      const newBudget = (winnerTeam.budget || 0) - winningAmount;
      await supabase.from('teams').update({ budget: newBudget }).eq('id', winnerTeam.id);

      // 5. Crea budget_transaction per acquisto
      await supabase.from('budget_transactions').insert({
        team_id: winnerTeam.id,
        team_name: winnerTeam.name,
        amount: -winningAmount,
        type: 'auction_purchase',
        description: `Acquisto ${auction.player_name} all'asta`,
        previous_balance: winnerTeam.budget || 0,
        new_balance: newBudget,
        related_player_id: auction.player_id,
        related_player_name: auction.player_name,
        league_id: auction.league_id || null
      });

      // 6. Assegna giocatore alla squadra vincitrice
      await supabase.from('players').update({ team_id: winnerTeam.id }).eq('id', auction.player_id);

      // 7. Crea transfer record
      await supabase.from('transfers').insert({
        player_id: auction.player_id,
        player_name: auction.player_name,
        to_team_id: winnerTeam.id,
        to_team_name: winnerTeam.name,
        transfer_type: 'auction',
        amount: winningAmount,
        season: new Date().getFullYear().toString(),
        notes: `Asta a busta chiusa - sessione: ${auction.auction_session_name || 'N/D'}`
      });

      // 8. Premio 10% al censore (created_by del giocatore)
      const { data: playerData } = await supabase
        .from('players')
        .select('created_by')
        .eq('id', auction.player_id)
        .single();

      if (playerData?.created_by) {
        // Trova la squadra del censore
        const { data: censorTeam } = await supabase
          .from('teams')
          .select('*')
          .eq('owner_email', playerData.created_by)
          .single();

        if (censorTeam) {
          const censorPrize = Math.round(winningAmount * 0.1);
          const newCensorBudget = (censorTeam.budget || 0) + censorPrize;
          await supabase.from('teams').update({ budget: newCensorBudget }).eq('id', censorTeam.id);
          await supabase.from('budget_transactions').insert({
            team_id: censorTeam.id,
            team_name: censorTeam.name,
            amount: censorPrize,
            type: 'manual_adjustment',
            description: `Premio censimento 10% - ${auction.player_name} venduto a ${winnerTeam.name}`,
            previous_balance: censorTeam.budget || 0,
            new_balance: newCensorBudget,
            related_player_name: auction.player_name,
            league_id: auction.league_id || null
          });
        }
      }

      // 9. Chiudi l'asta e marca il vincitore
      await supabase.from('auctions').update({
        status: 'completed',
        current_winner_team_id: winnerTeam.id,
        current_winner_team_name: winnerTeam.name,
        current_price: winningAmount
      }).eq('id', auctionId);

      // 10. Annulla tutte le altre offerte
      await supabase.from('bids').update({ status: 'cancelled' })
        .eq('auction_id', auctionId)
        .neq('id', winningBid.id);

      return { winner: { team_name: winnerTeam.name, amount: winningAmount } };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auctionsAdmin'] });
      queryClient.invalidateQueries({ queryKey: ['allBids'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['allPlayersAuction'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      if (data?.winner) {
        toast.success(`Asta chiusa! Vince ${data.winner.team_name} con €${(data.winner.amount / 1000000).toFixed(2)}M`);
      } else {
        toast.info('Asta chiusa: nessun vincitore');
      }
      setClosingAuction(null);
    },
    onError: (e) => { toast.error('Errore chiusura: ' + e.message); setClosingAuction(null); }
  });

  const cancelAuctionMutation = useMutation({
    mutationFn: async (auctionId) => {
      const { error } = await supabase.from('auctions').update({ status: 'cancelled' }).eq('id', auctionId);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['auctionsAdmin'] }); toast.success('Asta annullata'); }
  });

  const deleteClosedAuctions = async () => {
    if (!window.confirm(`Eliminare definitivamente tutte le ${closedAuctions.length} aste chiuse e le relative offerte?`)) return;
    setDeletingClosed(true);
    let errors = 0;
    for (const auction of closedAuctions) {
      try {
        const auctionBids = bids.filter(b => b.auction_id === auction.id);
        for (const bid of auctionBids) {
          await supabase.from('bids').delete().eq('id', bid.id);
        }
        await supabase.from('auctions').delete().eq('id', auction.id);
      } catch (e) {
        console.error('Errore eliminazione asta ' + auction.id + ':', e.message);
        errors++;
      }
    }
    queryClient.invalidateQueries({ queryKey: ['auctionsAdmin'] });
    queryClient.invalidateQueries({ queryKey: ['myBids'] });
    setDeletingClosed(false);
    if (errors > 0) {
      toast.error('Completato con ' + errors + ' errori. Riprova per le aste non eliminate.');
    } else {
      toast.success('Tutte le aste chiuse sono state eliminate');
    }
  };

  // Aste attive: tutte le sealed_bid attive (con o senza offerte)
  const activeAuctions = auctions.filter(a => a.auction_type === 'sealed_bid' && a.status === 'active');
  const closedAuctions = auctions.filter(a => a.auction_type === 'sealed_bid' && (a.status === 'completed' || a.status === 'cancelled'));

  const toggleActiveAuction = (id) => {
    setSelectedActiveAuctions(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAllActiveAuctions = () => {
    if (selectedActiveAuctions.length === activeAuctions.length) {
      setSelectedActiveAuctions([]);
    } else {
      setSelectedActiveAuctions(activeAuctions.map(a => a.id));
    }
  };

  const closeSelectedAuctions = async () => {
    if (!window.confirm(`Chiudere ${selectedActiveAuctions.length} aste?`)) return;
    setClosingBulk(true);
    let success = 0, errors = 0;
    for (const auctionId of selectedActiveAuctions) {
      try {
        await closeAuctionMutation.mutateAsync(auctionId);
        success++;
      } catch (e) { errors++; }
    }
    setSelectedActiveAuctions([]);
    setClosingBulk(false);
    toast.success(`Chiuse ${success} aste${errors > 0 ? `, ${errors} errori` : ''}`);
  };

  const getAuctionBids = (auctionId) => bids.filter(b => b.auction_id === auctionId && b.status === 'active');
  const viewBids = (auction) => { setSelectedAuction(auction); setShowBidsModal(true); };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">Accesso Negato</h2>
            <p className="text-slate-500">Solo gli amministratori possono accedere a questa sezione.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Gavel className="w-7 h-7 text-purple-500" />
            Gestione Aste Buste Chiuse
          </h1>
          <p className="text-slate-500">Crea e gestisci sessioni d'asta per giocatori svincolati</p>
        </div>
        <Badge className="bg-purple-100 text-purple-700 text-sm px-3 py-1">{activeAuctions.length} aste attive</Badge>
      </div>

      <Tabs defaultValue="players" className="space-y-6">
        <TabsList>
          <TabsTrigger value="players" className="flex items-center gap-2"><Users className="w-4 h-4" />Seleziona Giocatori</TabsTrigger>
          <TabsTrigger value="sessions" className="flex items-center gap-2"><Gavel className="w-4 h-4" />Sessioni ({activeSessions.length})</TabsTrigger>
          <TabsTrigger value="active" className="flex items-center gap-2"><Clock className="w-4 h-4" />Aste Attive ({activeAuctions.length})</TabsTrigger>
          <TabsTrigger value="closed" className="flex items-center gap-2"><Trophy className="w-4 h-4" />Aste Chiuse</TabsTrigger>
        </TabsList>

        {/* TAB GIOCATORI */}
        <TabsContent value="players" className="space-y-4">
          <Card>
            <CardContent className="pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input placeholder="Cerca per nome..." value={searchPlayer} onChange={(e) => setSearchPlayer(e.target.value)} className="pl-9" />
                </div>
                <Select value={filterRole} onValueChange={setFilterRole}>
                  <SelectTrigger><SelectValue placeholder="Ruolo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti i ruoli</SelectItem>
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input type="number" placeholder="Overall min" value={filterOverallMin} onChange={(e) => setFilterOverallMin(e.target.value)} />
                <Input type="number" placeholder="Overall max" value={filterOverallMax} onChange={(e) => setFilterOverallMax(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          {selectedPlayers.length > 0 && (
            <div className="flex items-center justify-between p-4 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="font-medium text-purple-800">{selectedPlayers.length} giocatori selezionati</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelectedPlayers([])}>Deseleziona tutti</Button>
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => setShowCreateForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />Crea Aste ({selectedPlayers.length})
                </Button>
              </div>
            </div>
          )}

          {loadingPlayers ? (
            <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-purple-500" /></div>
          ) : (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="p-3 border-b bg-slate-50 flex items-center gap-3">
                <Checkbox
                  checked={selectedPlayers.length === freeFilteredPlayers.length && freeFilteredPlayers.length > 0}
                  onCheckedChange={toggleAll}
                />
                <span className="text-sm text-slate-600 font-medium">
                  {loadingPlayers ? 'Caricamento...' : `${freeFilteredPlayers.length} svincolati disponibili`}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="w-10 p-3"></th>
                      <th className="text-left p-3 text-sm font-semibold text-slate-600">Giocatore</th>
                      <th className="text-center p-3 text-sm font-semibold text-slate-600">Ruolo</th>
                      <th className="text-center p-3 text-sm font-semibold text-slate-600">OVR</th>
                      <th className="text-center p-3 text-sm font-semibold text-slate-600">Età</th>
                      <th className="text-right p-3 text-sm font-semibold text-slate-600">Valore</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {freeFilteredPlayers.map(player => {
                      const photoUrl = getSofifaPhotoUrl(player);
                      return (
                        <tr key={player.id}
                          className={`hover:bg-slate-50 cursor-pointer transition-colors ${selectedPlayers.includes(player.id) ? 'bg-purple-50' : ''}`}
                          onClick={() => togglePlayer(player.id)}>
                          <td className="p-3">
                            <Checkbox checked={selectedPlayers.includes(player.id)} onCheckedChange={() => togglePlayer(player.id)} />
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-3">
                              {photoUrl && (
                                <img src={photoUrl} className="w-9 h-9 rounded-full object-cover bg-slate-100"
                                  onError={(e) => { const fb = getSofifaFallbackUrl(player?.id_sofifa); if (fb && e.target.src !== fb) { e.target.src = fb; } else { e.target.onerror = null; e.target.style.display = 'none'; } }} alt="" />
                              )}
                              <span className="font-medium text-slate-800">{player.first_name} {player.last_name}</span>
                            </div>
                          </td>
                          <td className="p-3 text-center"><Badge className="bg-blue-100 text-blue-700 border-0">{player.role}</Badge></td>
                          <td className="p-3 text-center font-bold text-emerald-600">{player.overall_rating || '-'}</td>
                          <td className="p-3 text-center text-slate-600">{player.age || '-'}</td>
                          <td className="p-3 text-right font-medium text-slate-700">
                            €{player.player_value ? (player.player_value / 1000000).toFixed(1) + 'M' : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {freeFilteredPlayers.length === 0 && (
                  <div className="py-12 text-center text-slate-500">
                    <Users className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    Nessun giocatore svincolato corrisponde ai filtri
                  </div>
                )}
              </div>
            </div>
          )}
        </TabsContent>

        {/* TAB SESSIONI ATTIVE */}
        <TabsContent value="sessions" className="space-y-4">
          {activeSessions.length === 0 ? (
            <Card className="border-dashed bg-slate-50">
              <CardContent className="py-12 text-center">
                <Gavel className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Nessuna sessione aperta</p>
                <p className="text-xs text-slate-400 mt-1">Crea aste con un nome sessione per vederle qui</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {activeSessions.map(session => {
                const sessionBids = bids.filter(b => session.auctions.some(a => a.id === b.auction_id) && b.status === 'active');
                const teamsWithBids = new Set(sessionBids.map(b => b.team_id)).size;
                const auctionsWithBids = new Set(sessionBids.map(b => b.auction_id)).size;
                return (
                  <Card key={session.name} className="border-0 shadow-sm border-l-4 border-l-purple-400">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div>
                          <p className="font-bold text-slate-800 text-lg">{session.name}</p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <Badge className="bg-purple-100 text-purple-700 border-0">{session.totalActive} aste attive</Badge>
                            <Badge className="bg-blue-100 text-blue-700 border-0">{auctionsWithBids} con offerte</Badge>
                            <Badge className="bg-emerald-100 text-emerald-700 border-0">{teamsWithBids} squadre hanno offerto</Badge>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => closeSession(session.name)}
                            disabled={closingSession === session.name}
                          >
                            {closingSession === session.name
                              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />Chiusura...</>
                              : <><CheckCircle className="w-4 h-4 mr-1" />Chiudi Sessione</>
                            }
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB ASTE ATTIVE */}
        <TabsContent value="active" className="space-y-4">
          {activeAuctions.length === 0 ? (
            <Card className="border-dashed bg-slate-50">
              <CardContent className="py-12 text-center">
                <Gavel className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Nessuna asta attiva</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-slate-50 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={selectedActiveAuctions.length === activeAuctions.length && activeAuctions.length > 0}
                    onCheckedChange={toggleAllActiveAuctions}
                  />
                  <span className="text-sm text-slate-600 font-medium">
                    {selectedActiveAuctions.length > 0 ? `${selectedActiveAuctions.length} aste selezionate` : 'Seleziona tutte'}
                  </span>
                </div>
                {selectedActiveAuctions.length > 0 && (
                  <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={closeSelectedAuctions} disabled={closingBulk}>
                    {closingBulk ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                    Chiudi & Assegna ({selectedActiveAuctions.length})
                  </Button>
                )}
              </div>

              {activeAuctions.map(auction => {
                const player = players.find(p => p.id === auction.player_id);
                const photoUrl = getSofifaPhotoUrl(player);
                const auctionBids = getAuctionBids(auction.id);
                const isExpired = new Date(auction.end_time) <= new Date();
                return (
                  <Card key={auction.id} className={`border-0 shadow-sm ${isExpired ? 'border-l-4 border-l-red-400' : ''} ${selectedActiveAuctions.includes(auction.id) ? 'ring-2 ring-emerald-400' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between flex-wrap gap-3">
                        <div className="flex items-center gap-4">
                          <Checkbox checked={selectedActiveAuctions.includes(auction.id)} onCheckedChange={() => toggleActiveAuction(auction.id)} />
                          {photoUrl && (
                            <img src={photoUrl} className="w-12 h-12 rounded-full object-cover bg-slate-100"
                              onError={(e) => { const fb = getSofifaFallbackUrl(player?.id_sofifa); if (fb && e.target.src !== fb) { e.target.src = fb; } else { e.target.onerror = null; e.target.style.display = 'none'; } }} alt="" />
                          )}
                          <div>
                            <p className="font-semibold text-slate-800">{auction.player_name}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {player && <Badge className="bg-blue-100 text-blue-700 border-0">{player.role}</Badge>}
                              {player && <Badge className="bg-emerald-100 text-emerald-700 border-0">OVR {player.overall_rating}</Badge>}
                              {auction.auction_session_name && <Badge variant="outline">{auction.auction_session_name}</Badge>}
                              <Badge className={isExpired ? 'bg-red-100 text-red-700 border-0' : 'bg-amber-100 text-amber-700 border-0'}>
                                {isExpired ? '⏰ Scaduta' : `Scade ${moment(auction.end_time).fromNow()}`}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-500 mt-1">Base: €{(auction.starting_price / 1000000).toFixed(2)}M &bull; Offerte: {auctionBids.length}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => viewBids(auction)}>
                            <Eye className="w-4 h-4 mr-1" />Offerte ({auctionBids.length})
                          </Button>
                          {isExpired && (
                            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700"
                              onClick={() => closeAuctionMutation.mutate(auction.id)} disabled={closingAuction === auction.id}>
                              {closingAuction === auction.id ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
                              Chiudi & Assegna
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50"
                            onClick={() => { if (window.confirm('Annullare questa asta?')) cancelAuctionMutation.mutate(auction.id); }}>
                            <XCircle className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* TAB ASTE CHIUSE */}
        <TabsContent value="closed" className="space-y-4">
          {closedAuctions.length === 0 ? (
            <Card className="border-dashed bg-slate-50">
              <CardContent className="py-12 text-center text-slate-500">Nessuna asta chiusa</CardContent>
            </Card>
          ) : (
            <>
              <div className="flex justify-end">
                <Button variant="outline" size="sm" className="text-rose-600 border-rose-200 hover:bg-rose-50"
                  onClick={deleteClosedAuctions} disabled={deletingClosed}>
                  {deletingClosed ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
                  Azzera aste chiuse ({closedAuctions.length})
                </Button>
              </div>
              {(() => {
                const groups = {};
                closedAuctions.forEach(auction => {
                  const groupName = auction.auction_session_name || 'Senza nome';
                  if (!groups[groupName]) groups[groupName] = [];
                  groups[groupName].push(auction);
                });
                return Object.entries(groups).map(([groupName, groupAuctions]) => (
                  <div key={groupName} className="space-y-2">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-slate-700 text-base">{groupName}</h3>
                      <Badge variant="outline" className="text-xs">{groupAuctions.length} aste</Badge>
                      <div className="flex-1 h-px bg-slate-200" />
                    </div>
                    {groupAuctions.map(auction => {
                      const player = players.find(p => p.id === auction.player_id);
                      const winnerTeam = teams.find(t => t.id === auction.current_winner_team_id);
                      const auctionBids = getAuctionBids(auction.id);
                      return (
                        <Card key={auction.id} className={`border-0 shadow-sm ${auction.status === 'completed' ? 'border-l-4 border-l-emerald-400' : 'border-l-4 border-l-slate-300'}`}>
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between flex-wrap gap-3">
                              <div>
                                <p className="font-semibold text-slate-800">{auction.player_name}</p>
                                <div className="flex items-center gap-2 mt-1">
                                  {player && <Badge className="bg-blue-100 text-blue-700 border-0">{player.role}</Badge>}
                                  <Badge className={auction.status === 'completed' ? 'bg-emerald-100 text-emerald-700 border-0' : 'bg-slate-100 text-slate-600 border-0'}>
                                    {auction.status === 'completed' ? '✅ Assegnato' : '❌ Annullata'}
                                  </Badge>
                                </div>
                                {winnerTeam && (
                                  <p className="text-sm text-emerald-700 font-medium mt-1">
                                    🏆 {winnerTeam.name} - €{(auction.current_price / 1000000).toFixed(2)}M
                                  </p>
                                )}
                              </div>
                              <Button size="sm" variant="outline" onClick={() => viewBids(auction)}>
                                <Eye className="w-4 h-4 mr-1" />Offerte ({auctionBids.length})
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ));
              })()}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog creazione aste */}
      <Dialog open={showCreateForm} onOpenChange={setShowCreateForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Crea Sessione d'Asta</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-sm text-purple-800">
              Stai creando aste per <strong>{selectedPlayers.length}</strong> giocatori selezionati.
            </div>
            <div className="space-y-2">
              <Label>Nome Sessione (opzionale)</Label>
              <Input placeholder="Es: Sessione Gennaio 2026" value={auctionFormData.auction_session_name}
                onChange={(e) => setAuctionFormData({ ...auctionFormData, auction_session_name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Durata Asta (ore)</Label>
              <Input type="number" min="1" value={auctionFormData.duration_hours}
                onChange={(e) => setAuctionFormData({ ...auctionFormData, duration_hours: parseInt(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Inizio tra (ore) - 0 = subito</Label>
              <Input type="number" min="0" value={auctionFormData.start_delay_hours}
                onChange={(e) => setAuctionFormData({ ...auctionFormData, start_delay_hours: parseInt(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Prezzo Base (% del valore di mercato)</Label>
              <div className="flex items-center gap-2">
                <Input type="number" min="1" max="100" value={auctionFormData.price_percentage}
                  onChange={(e) => setAuctionFormData({ ...auctionFormData, price_percentage: parseInt(e.target.value) })} />
                <span className="text-slate-500">%</span>
              </div>
              <p className="text-xs text-slate-500">Es: con 10% su un giocatore da €10M → base €1M</p>
            </div>
            <div className="space-y-2">
              <Label>Limite Offerte per Squadra (per sessione)</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number" min="1" max="25"
                  value={auctionFormData.max_bids_per_team}
                  onChange={(e) => setAuctionFormData({ ...auctionFormData, max_bids_per_team: Math.min(25, Math.max(1, parseInt(e.target.value) || 1)) })}
                  className="w-24"
                />
                <span className="text-slate-500 text-sm">offerte max (1-25)</span>
              </div>
              <p className="text-xs text-slate-500">
                Ogni squadra potrà fare al massimo {auctionFormData.max_bids_per_team} offerte totali in questa sessione
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateForm(false)}>Annulla</Button>
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={() => createAuctionsMutation.mutate(auctionFormData)} disabled={createAuctionsMutation.isPending}>
              {createAuctionsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Crea {selectedPlayers.length} Aste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog visualizza offerte */}
      <Dialog open={showBidsModal} onOpenChange={setShowBidsModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Offerte - {selectedAuction?.player_name}</DialogTitle></DialogHeader>
          {selectedAuction && (() => {
            const auctionBids = bids
              .filter(b => b.auction_id === selectedAuction.id && b.status === 'active')
              .sort((a, b) => b.amount - a.amount);
            return (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {auctionBids.length === 0 ? (
                  <p className="text-center text-slate-500 py-6">Nessuna offerta ricevuta</p>
                ) : auctionBids.map((bid, idx) => {
                  const team = teams.find(t => t.id === bid.team_id);
                  return (
                    <div key={bid.id} className={`flex items-center justify-between p-3 rounded-lg ${idx === 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50'}`}>
                      <div className="flex items-center gap-3">
                        {idx === 0 && <Trophy className="w-5 h-5 text-emerald-500" />}
                        <div>
                          <p className="font-medium text-slate-800">{team?.name || bid.team_name}</p>
                          <p className="text-xs text-slate-500">{moment(bid.bid_time || bid.created_date).format('DD/MM HH:mm')}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold text-lg ${idx === 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                          €{(bid.amount / 1000000).toFixed(2)}M
                        </p>
                        {idx === 0 && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">🏆 Vincitore</Badge>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBidsModal(false)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
