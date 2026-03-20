import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gavel, Clock, Euro, Trophy, Plus, History, TrendingUp, X } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function PublicAuctions({ auctions, players, teams, myTeam, user }) {
  const [showCreateAuction, setShowCreateAuction] = useState(false);
  const [showBidDialog, setShowBidDialog] = useState(false);
  const [showBidHistory, setShowBidHistory] = useState(false);
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [createForm, setCreateForm] = useState({
    player_id: '',
    starting_price: '',
    duration_hours: 6
  });

  const queryClient = useQueryClient();

  // Fetch all bids for real-time updates
  const { data: allBids = [] } = useQuery({
    queryKey: ['allBids'],
    queryFn: () => base44.entities.Bid.list('-bid_time'),
    refetchInterval: 5000 // Refresh every 5 seconds
  });

  const myPlayers = players.filter(p => p.team_id === myTeam?.id);
  const activePublicAuctions = auctions.filter(a => a.auction_type === 'public' && a.status === 'active');

  const createAuctionMutation = useMutation({
    mutationFn: async (data) => {
      const player = players.find(p => p.id === data.player_id);
      if (!player) throw new Error('Giocatore non trovato');

      const startTime = new Date();
      const endTime = new Date(startTime.getTime() + data.duration_hours * 60 * 60 * 1000);

      return await base44.entities.Auction.create({
        auction_type: 'public',
        player_id: data.player_id,
        player_name: `${player.first_name} ${player.last_name}`,
        seller_team_id: myTeam.id,
        seller_team_name: myTeam.name,
        starting_price: parseFloat(data.starting_price),
        current_price: parseFloat(data.starting_price),
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: 'active',
        anti_sniping_minutes: 5,
        league_id: myTeam.league_id || null
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auctions'] });
      toast.success('Asta creata con successo!');
      setShowCreateAuction(false);
      setCreateForm({ player_id: '', starting_price: '', duration_hours: 6 });
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const placeBidMutation = useMutation({
    mutationFn: async ({ auction, amount }) => {
      const bidValue = parseFloat(amount);
      
      if (bidValue <= auction.current_price) {
        throw new Error('L\'offerta deve essere superiore all\'offerta corrente');
      }

      if (bidValue > (myTeam?.budget || 0)) {
        throw new Error('Budget insufficiente');
      }

      // Crea l'offerta
      await base44.entities.Bid.create({
        auction_id: auction.id,
        team_id: myTeam.id,
        team_name: myTeam.name,
        amount: bidValue,
        bid_time: new Date().toISOString()
      });

      // Sistema anti-sniping: se l'offerta è negli ultimi 5 minuti, estendi il tempo
      const now = new Date();
      const endTime = new Date(auction.end_time);
      const minutesRemaining = (endTime - now) / (1000 * 60);

      let newEndTime = auction.end_time;
      if (minutesRemaining < 5) {
        const extensionMinutes = auction.anti_sniping_minutes || 5;
        newEndTime = new Date(now.getTime() + extensionMinutes * 60 * 1000).toISOString();
      }

      // Aggiorna l'asta
      await base44.entities.Auction.update(auction.id, {
        current_price: bidValue,
        current_winner_team_id: myTeam.id,
        current_winner_team_name: myTeam.name,
        end_time: newEndTime
      });

      return { extended: newEndTime !== auction.end_time };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['auctions'] });
      queryClient.invalidateQueries({ queryKey: ['myBids'] });
      if (data.extended) {
        toast.success('Offerta piazzata! Tempo esteso per anti-sniping');
      } else {
        toast.success('Offerta piazzata con successo!');
      }
      setShowBidDialog(false);
      setBidAmount('');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const formatCurrency = (value) => {
    if (!value) return '€0';
    if (value >= 1000000) return `€${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `€${(value / 1000).toFixed(0)}K`;
    return `€${value}`;
  };

  const getTimeRemaining = (endTime) => {
    const now = new Date();
    const end = new Date(endTime);
    const diff = end - now;

    if (diff <= 0) return 'Scaduta';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const handleCreateAuction = (e) => {
    e.preventDefault();
    if (!myTeam) {
      toast.error('Non hai una squadra associata al tuo account');
      return;
    }
    if (!createForm.player_id || !createForm.starting_price) {
      toast.error('Compila tutti i campi');
      return;
    }
    if (parseFloat(createForm.starting_price) <= 0) {
      toast.error('Il prezzo base deve essere maggiore di 0');
      return;
    }
    createAuctionMutation.mutate(createForm);
  };

  const handlePlaceBid = (e) => {
    e.preventDefault();
    placeBidMutation.mutate({ auction: selectedAuction, amount: bidAmount });
  };

  const getAuctionBids = (auctionId) => {
    return allBids.filter(bid => bid.auction_id === auctionId && bid.status !== 'cancelled').sort((a, b) => b.amount - a.amount);
  };

  const cancelBidMutation = useMutation({
    mutationFn: async (bidId) => {
      const result = await base44.functions.invoke('cancelBid', { bid_id: bidId });
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auctions'] });
      queryClient.invalidateQueries({ queryKey: ['allBids'] });
      toast.success('Offerta annullata con successo');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const formatDateTime = (dateString) => {
    return moment(dateString).format('DD/MM HH:mm');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Gavel className="w-6 h-6 text-blue-600" />
            Aste Pubbliche
          </h2>
          <p className="text-sm text-slate-500">Aste in tempo reale con sistema anti-sniping</p>
        </div>
        {myTeam && (
          <Button
            onClick={() => setShowCreateAuction(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Crea Asta
          </Button>
        )}
      </div>

      {/* Aste attive */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {activePublicAuctions.map(auction => {
          const player = players.find(p => p.id === auction.player_id);
          const isMyAuction = auction.seller_team_id === myTeam?.id;
          const isWinning = auction.current_winner_team_id === myTeam?.id;

          return (
            <Card key={auction.id} className={`border-2 ${isWinning ? 'border-emerald-300 bg-emerald-50/30' : 'border-slate-200'}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{auction.player_name}</CardTitle>
                    {player && (
                      <p className="text-sm text-slate-500">{player.role} • OVR {player.overall_rating}</p>
                    )}
                  </div>
                  {isMyAuction && (
                    <Badge className="bg-blue-100 text-blue-700">Tua asta</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">Prezzo attuale</span>
                    <span className="font-bold text-lg text-emerald-600">
                      {formatCurrency(auction.current_price)}
                    </span>
                  </div>
                  
                  {auction.current_winner_team_name && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">In testa</span>
                      <div className="flex items-center gap-1">
                        <Trophy className="w-3 h-3 text-emerald-600" />
                        <span className={isWinning ? 'font-semibold text-emerald-600' : 'text-slate-700'}>
                          {auction.current_winner_team_name}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Tempo rimanente</span>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-amber-600" />
                      <span className="font-medium text-amber-600">
                        {getTimeRemaining(auction.end_time)}
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-400 pt-1">
                    Venditore: {auction.seller_team_name || 'Svincolato'}
                  </div>
                </div>

                <div className="space-y-2">
                  {!isMyAuction && myTeam && (
                    <Button
                      className={`w-full ${isWinning ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                      onClick={() => {
                        setSelectedAuction(auction);
                        setBidAmount((auction.current_price + 100000).toString());
                        setShowBidDialog(true);
                      }}
                    >
                      <Gavel className="w-4 h-4 mr-2" />
                      {isWinning ? 'Rilancia' : 'Fai un\'offerta'}
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setSelectedAuction(auction);
                      setShowBidHistory(true);
                    }}
                  >
                    <History className="w-4 h-4 mr-2" />
                    Cronologia ({getAuctionBids(auction.id).length})
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {activePublicAuctions.length === 0 && (
          <Card className="col-span-full bg-slate-50 border-dashed">
            <CardContent className="py-12 text-center">
              <Gavel className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Nessuna asta pubblica attiva</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Dialog Crea Asta */}
      <Dialog open={showCreateAuction} onOpenChange={setShowCreateAuction}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crea Asta Pubblica</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAuction} className="space-y-4">
            <div className="space-y-2">
              <Label>Giocatore</Label>
              <Select value={createForm.player_id} onValueChange={(v) => setCreateForm({ ...createForm, player_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona giocatore" />
                </SelectTrigger>
                <SelectContent>
                  {myPlayers.map(p => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} ({p.role}) - OVR {p.overall_rating}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Prezzo di Partenza (€)</Label>
              <Input
                type="number"
                value={createForm.starting_price}
                onChange={(e) => setCreateForm({ ...createForm, starting_price: e.target.value })}
                placeholder="Es: 5000000"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Durata Asta</Label>
              <Select value={createForm.duration_hours.toString()} onValueChange={(v) => setCreateForm({ ...createForm, duration_hours: parseInt(v) })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 ora</SelectItem>
                  <SelectItem value="3">3 ore</SelectItem>
                  <SelectItem value="6">6 ore (consigliato)</SelectItem>
                  <SelectItem value="12">12 ore</SelectItem>
                  <SelectItem value="24">24 ore</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800">
                <strong>Sistema Anti-Sniping:</strong> Se un'offerta viene piazzata negli ultimi 5 minuti, il tempo verrà automaticamente esteso di altri 5 minuti.
              </p>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateAuction(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={createAuctionMutation.isPending}>
                {createAuctionMutation.isPending ? 'Creazione...' : 'Crea Asta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Piazza Offerta */}
      <Dialog open={showBidDialog} onOpenChange={setShowBidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fai un'offerta per {selectedAuction?.player_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handlePlaceBid} className="space-y-4">
            <div className="space-y-3 bg-slate-50 rounded-lg p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Offerta corrente</span>
                <span className="font-bold text-emerald-600">
                  {formatCurrency(selectedAuction?.current_price)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Il tuo budget</span>
                <span className="font-bold">{formatCurrency(myTeam?.budget)}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>La tua offerta (€)</Label>
              <Input
                type="number"
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder={`Minimo: ${(selectedAuction?.current_price || 0) + 1}`}
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowBidDialog(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={placeBidMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
                {placeBidMutation.isPending ? 'Invio...' : 'Conferma Offerta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Cronologia Offerte */}
      <Dialog open={showBidHistory} onOpenChange={setShowBidHistory}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Cronologia Offerte - {selectedAuction?.player_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Statistiche */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg">
              <div className="text-center">
                <p className="text-xs text-slate-500">Offerte Totali</p>
                <p className="text-xl font-bold text-slate-700">{getAuctionBids(selectedAuction?.id).length}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">Offerta Attuale</p>
                <p className="text-xl font-bold text-emerald-600">{formatCurrency(selectedAuction?.current_price)}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-slate-500">Prezzo Iniziale</p>
                <p className="text-xl font-bold text-blue-600">{formatCurrency(selectedAuction?.starting_price)}</p>
              </div>
            </div>

            {/* Lista offerte */}
            <div className="max-h-96 overflow-y-auto space-y-2">
              {getAuctionBids(selectedAuction?.id).length > 0 ? (
                getAuctionBids(selectedAuction?.id).map((bid, idx) => {
                  const isMyBid = bid.team_id === myTeam?.id;
                  const canCancel = (isMyBid || user?.role === 'admin') && selectedAuction?.status === 'active';
                  
                  return (
                    <div 
                      key={bid.id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        idx === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {idx === 0 && <Trophy className="w-5 h-5 text-emerald-600" />}
                        <div>
                          <p className="font-medium text-slate-900">{bid.team_name}</p>
                          <p className="text-xs text-slate-500">{formatDateTime(bid.bid_time)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={`font-bold text-lg ${idx === 0 ? 'text-emerald-600' : 'text-slate-700'}`}>
                            {formatCurrency(bid.amount)}
                          </p>
                          {idx === 0 && <Badge className="bg-emerald-100 text-emerald-700 text-xs">In testa</Badge>}
                        </div>
                        {canCancel && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => {
                              if (window.confirm('Vuoi annullare questa offerta?')) {
                                cancelBidMutation.mutate(bid.id);
                              }
                            }}
                            disabled={cancelBidMutation.isPending}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <History className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p>Nessuna offerta ancora</p>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}