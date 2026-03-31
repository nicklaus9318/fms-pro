import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gavel, Clock, Search, Loader2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

const ROLES = ['POR','DC','TS','TD','CDC','CC','COC','ES','ED','AS','AD','ATT'];

const getSofifaPhotoUrl = (idSofifa) => {
  if (!idSofifa) return null;
  const id = String(idSofifa).replace(/\D/g, '');
  if (id.length < 4) return null;
  return `https://images.fotmob.com/image_resources/playerimages/${id}.png`;
};

const getSofifaFallbackUrl = (idSofifa) => {
  if (!idSofifa) return null;
  const id = String(idSofifa).replace(/\D/g, '');
  if (id.length < 4) return null;
  return `https://cdn.futwiz.com/assets/img/fc25/faces/${id}.png`;
};

export default function AsteBusteChiuse() {
  const [user, setUser] = useState(null);
  const [myTeam, setMyTeam] = useState(null);
  const [searchAuction, setSearchAuction] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [showBidModal, setShowBidModal] = useState(false);
  const [selectedAuction, setSelectedAuction] = useState(null);
  const [bidAmount, setBidAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showMyBids, setShowMyBids] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;
  const [filterOverallMin, setFilterOverallMin] = useState('');
  const [filterOverallMax, setFilterOverallMax] = useState('');
  const [filterAgeMin, setFilterAgeMin] = useState('');
  const [filterAgeMax, setFilterAgeMax] = useState('');

  // Reset pagina quando cambiano i filtri
  useEffect(() => { setPage(0); }, [searchAuction, filterRole, filterOverallMin, filterOverallMax, filterAgeMin, filterAgeMax]);

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;
      const { data: userData } = await supabase.from('user_roles').select('*').eq('email', authUser.email).single();
      if (!userData) return;
      setUser(userData);
      // Carica subito la squadra dell'utente
      const { data: teamData } = await supabase.from('teams').select('id,name,budget,owner_email').eq('owner_email', authUser.email).single();
      if (teamData) setMyTeam(teamData);
    };
    loadUser();
  }, []);

  // Aste attive con dati giocatore in join — ordinate per overall desc, 50 per pagina
  const { data: auctionsData, isLoading } = useQuery({
    queryKey: ['sealedBidAuctions', searchAuction, filterRole, filterOverallMin, filterOverallMax, filterAgeMin, filterAgeMax, page],
    queryFn: async () => {
      let q = supabase
        .from('auctions')
        .select(`
          id, player_id, player_name, auction_type, auction_session_name,
          status, starting_price, current_price, end_time, max_bids_per_team,
          players!player_id (id, role, overall_rating, age, player_value, id_sofifa, photo_url)
        `, { count: 'exact' })
        .eq('status', 'active')
        .eq('auction_type', 'sealed_bid')
        .gt('end_time', new Date().toISOString())
        .order('overall_rating', { ascending: false, foreignTable: 'players' })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (searchAuction.trim()) q = q.ilike('player_name', `%${searchAuction.trim()}%`);
      if (filterRole !== 'all') q = q.eq('players.role', filterRole);
      if (filterOverallMin) q = q.gte('players.overall_rating', parseInt(filterOverallMin));
      if (filterOverallMax) q = q.lte('players.overall_rating', parseInt(filterOverallMax));
      if (filterAgeMin) q = q.gte('players.age', parseInt(filterAgeMin));
      if (filterAgeMax) q = q.lte('players.age', parseInt(filterAgeMax));

      const { data, count, error } = await q;
      if (error) throw error;
      return { auctions: data || [], total: count || 0 };
    },
    refetchInterval: 30000,
    staleTime: 20 * 1000,
    keepPreviousData: true,
  });

  const auctions = auctionsData?.auctions || [];
  const totalAuctions = auctionsData?.total || 0;
  const totalPages = Math.ceil(totalAuctions / PAGE_SIZE);

  // Le mie offerte — solo quelle della mia squadra, non tutte
  const { data: myBids = [] } = useQuery({
    queryKey: ['myBids', myTeam?.id],
    queryFn: async () => {
      if (!myTeam?.id) return [];
      const { data } = await supabase
        .from('bids')
        .select('id,auction_id,team_id,team_name,amount,status,bid_time')
        .eq('team_id', myTeam.id)
        .eq('status', 'active');
      return data || [];
    },
    enabled: !!myTeam,
  });

  // Filtri già applicati server-side nella query
  const sealedAuctions = auctions;

  const myBidForAuction = (auctionId) => myBids.find(b => b.auction_id === auctionId);

  const openBidModal = (auction) => {
    if (!myTeam) { toast.error('Non hai una squadra associata al tuo account'); return; }
    setSelectedAuction(auction);
    const existing = myBidForAuction(auction.id);
    setBidAmount(existing ? String(existing.amount) : String(auction.starting_price));
    setShowBidModal(true);
  };

  const submitBid = async () => {
    if (!myTeam || !selectedAuction) return;
    const amount = parseFloat(bidAmount);
    if (!amount || amount <= 0) { toast.error('Inserisci un importo valido'); return; }
    if (amount < selectedAuction.starting_price) {
      toast.error(`L'offerta deve essere almeno €${(selectedAuction.starting_price / 1000000).toFixed(2)}M`);
      return;
    }
    if (amount > (myTeam.budget || 0)) { toast.error('Budget insufficiente per questa offerta'); return; }

    // Controlla limite offerte per sessione
    const maxBids = selectedAuction.max_bids_per_team;
    if (maxBids && maxBids > 0) {
      const sessionName = selectedAuction.auction_session_name;
      const sessionAuctions = auctions.filter(a => a.auction_session_name === sessionName);
      const sessionBids = myBids.filter(b => sessionAuctions.some(a => a.id === b.auction_id));
      const existingBid = myBidForAuction(selectedAuction.id);
      if (!existingBid && sessionBids.length >= maxBids) {
        toast.error(`Hai raggiunto il limite di ${maxBids} offerte per questa sessione`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const existing = myBidForAuction(selectedAuction.id);
      if (existing) {
        await supabase.from('bids').update({ status: 'cancelled' }).eq('id', existing.id);
      }
      await supabase.from('bids').insert({
        auction_id: selectedAuction.id,
        team_id: myTeam.id,
        team_name: myTeam.name,
        amount,
        bid_time: new Date().toISOString(),
        status: 'active',
        is_winning: false
      });
      queryClient.invalidateQueries({ queryKey: ['myBids'] });
      toast.success('Offerta inserita con successo!');
      setShowBidModal(false);
    } catch (e) {
      toast.error('Errore: ' + e.message);
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Gavel className="w-7 h-7 text-purple-500" />
          Aste Buste Chiuse
        </h1>
        <p className="text-slate-500">Fai le tue offerte segrete sui giocatori svincolati</p>
      </div>

      {myTeam && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-purple-500 to-purple-600 border-0 text-white">
            <CardContent className="p-4">
              <p className="text-purple-100 text-sm">La tua squadra</p>
              <p className="text-xl font-bold mt-1">{myTeam.name}</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 text-white">
            <CardContent className="p-4">
              <p className="text-emerald-100 text-sm">Budget disponibile</p>
              <p className="text-xl font-bold mt-1">€{((myTeam.budget || 0) / 1000000).toFixed(1)}M</p>
            </CardContent>
          </Card>
          <Card
            className="bg-gradient-to-br from-amber-500 to-amber-600 border-0 text-white cursor-pointer hover:shadow-lg hover:scale-105 transition-all"
            onClick={() => setShowMyBids(true)}
          >
            <CardContent className="p-4">
              <p className="text-amber-100 text-sm">Mie offerte attive</p>
              <p className="text-xl font-bold mt-1">{myBids.filter(b => b.status === 'active').length}</p>
              <p className="text-amber-200 text-xs mt-1">👆 Clicca per vedere</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="relative col-span-2 sm:col-span-1 lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input placeholder="Cerca giocatore..." value={searchAuction} onChange={(e) => setSearchAuction(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger><SelectValue placeholder="Ruolo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti i ruoli</SelectItem>
            {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="number" placeholder="OVR min" min="1" max="99"
          value={filterOverallMin} onChange={(e) => setFilterOverallMin(e.target.value)} />
        <Input type="number" placeholder="OVR max" min="1" max="99"
          value={filterOverallMax} onChange={(e) => setFilterOverallMax(e.target.value)} />
        <Input type="number" placeholder="Età min" min="15" max="50"
          value={filterAgeMin} onChange={(e) => setFilterAgeMin(e.target.value)} />
        <Input type="number" placeholder="Età max" min="15" max="50"
          value={filterAgeMax} onChange={(e) => setFilterAgeMax(e.target.value)} />
      </div>
      {(filterRole !== 'all' || filterOverallMin || filterOverallMax || filterAgeMin || filterAgeMax || searchAuction) && (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => {
            setSearchAuction(''); setFilterRole('all');
            setFilterOverallMin(''); setFilterOverallMax('');
            setFilterAgeMin(''); setFilterAgeMax('');
          }}>
            ✕ Rimuovi filtri
          </Button>
        </div>
      )}

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
        🔒 <strong>Buste Chiuse:</strong> Le tue offerte sono segrete. Alla chiusura dell'asta, vince chi ha offerto di più. Puoi modificare la tua offerta finché l'asta è aperta.
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-purple-500" /></div>
      ) : sealedAuctions.length === 0 ? (
        <Card className="border-dashed bg-slate-50">
          <CardContent className="py-12 text-center">
            <Gavel className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Nessuna asta attiva al momento</p>
            <p className="text-slate-400 text-sm mt-1">Torna presto per nuove opportunità</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Info totale + navigazione pagine */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              {totalAuctions} aste totali · pagina {page + 1} di {totalPages}
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>← Prec</Button>
                <span className="text-sm text-slate-600 font-medium">{page + 1} / {totalPages}</span>
                <Button size="sm" variant="outline" onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}>Succ →</Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sealedAuctions.map(auction => {
            const player = auction.players; // dati dal join
            const photoUrl = getSofifaPhotoUrl(player?.id_sofifa);
            const myBid = myBidForAuction(auction.id);
            const timeLeft = moment(auction.end_time).diff(moment(), 'hours');
            const isUrgent = timeLeft < 6;

            return (
              <Card key={auction.id} className={`border-0 shadow-md hover:shadow-lg transition-all ${myBid ? 'ring-2 ring-emerald-300' : ''}`}>
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-center gap-3">
                    {photoUrl && (
                      <img src={photoUrl} className="w-14 h-14 rounded-full object-cover bg-slate-100"
                        onError={(e) => { const fb = getSofifaFallbackUrl(player?.id_sofifa); if (fb && e.target.src !== fb) { e.target.src = fb; } else { e.target.onerror = null; e.target.style.display = 'none'; } }} alt="" />
                    )}
                    <div className="flex-1">
                      <p className="font-bold text-slate-800">{auction.player_name}</p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {player && <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">{player.role}</Badge>}
                        {player?.overall_rating && <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">OVR {player.overall_rating}</Badge>}
                        {player?.age && <Badge className="bg-slate-100 text-slate-600 border-0 text-xs">{player.age} anni</Badge>}
                      </div>
                    </div>
                  </div>

                  {auction.auction_session_name && (
                    <p className="text-xs text-slate-500">📋 {auction.auction_session_name}</p>
                  )}

                  <div className={`flex items-center gap-2 text-sm font-medium ${isUrgent ? 'text-red-600' : 'text-slate-600'}`}>
                    <Clock className="w-4 h-4" />
                    Scade {moment(auction.end_time).fromNow()} ({moment(auction.end_time).format('DD/MM HH:mm')})
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-500">Prezzo base</p>
                    <p className="font-bold text-slate-800">€{(auction.starting_price / 1000000).toFixed(2)}M</p>
                    {player?.player_value && (
                      <p className="text-xs text-slate-400">Valore mercato: €{(player.player_value / 1000000).toFixed(1)}M</p>
                    )}
                  </div>

                  {myBid && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        <div>
                          <p className="text-xs text-emerald-700">La tua offerta</p>
                          <p className="font-bold text-emerald-800">€{(myBid.amount / 1000000).toFixed(2)}M</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {myTeam ? (
                    <Button className={`w-full ${myBid ? 'bg-amber-500 hover:bg-amber-600' : 'bg-purple-600 hover:bg-purple-700'}`} onClick={() => openBidModal(auction)}>
                      <Gavel className="w-4 h-4 mr-2" />
                      {myBid ? 'Modifica Offerta' : "Fai un'Offerta"}
                    </Button>
                  ) : (
                    <p className="text-center text-sm text-slate-500">Non hai una squadra</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

          {/* Paginazione in fondo */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button size="sm" variant="outline" onClick={() => { setPage(p => Math.max(0, p - 1)); window.scrollTo(0,0); }} disabled={page === 0}>← Precedente</Button>
              <span className="text-sm text-slate-600">{page + 1} / {totalPages}</span>
              <Button size="sm" variant="outline" onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); window.scrollTo(0,0); }} disabled={page >= totalPages - 1}>Successiva →</Button>
            </div>
          )}
        </>
      )}

      {/* Dialog Mie Offerte */}
      <Dialog open={showMyBids} onOpenChange={setShowMyBids}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Gavel className="w-5 h-5 text-amber-500" />
              Le Mie Offerte Attive
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {myBids.filter(b => b.status === 'active').length === 0 ? (
              <div className="text-center py-8">
                <Gavel className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Nessuna offerta attiva</p>
              </div>
            ) : (
              myBids.filter(b => b.status === 'active').map(bid => {
                const auction = auctions.find(a => a.id === bid.auction_id);
                const player = auction?.players;
                const photoUrl = getSofifaPhotoUrl(player?.id_sofifa);
                const isExpired = auction && new Date(auction.end_time) <= new Date();
                return (
                  <div key={bid.id} className={`flex items-center gap-3 p-3 rounded-xl border ${isExpired ? 'bg-slate-50 border-slate-200 opacity-60' : 'bg-white border-emerald-200'}`}>
                    {photoUrl ? (
                      <img src={photoUrl} className="w-12 h-12 rounded-full object-cover bg-slate-100"
                        onError={(e) => { const fb = getSofifaFallbackUrl(player?.id_sofifa); if (fb && e.target.src !== fb) { e.target.src = fb; } else { e.target.onerror = null; e.target.style.display = 'none'; } }} alt="" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center">
                        <Gavel className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{auction?.player_name || 'Giocatore'}</p>
                      <p className="text-xs text-slate-500">
                        {player?.role && <span className="mr-2">{player.role}</span>}
                        {auction && (isExpired
                          ? <span className="text-rose-500">⏰ Scaduta</span>
                          : <span>Scade {moment(auction.end_time).fromNow()}</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-emerald-700">€{(bid.amount / 1000000).toFixed(2)}M</p>
                      {auction && !isExpired && (
                        <button
                          onClick={() => { setShowMyBids(false); openBidModal(auction); }}
                          className="text-xs text-amber-600 hover:text-amber-700 underline mt-1"
                        >
                          Modifica
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMyBids(false)}>Chiudi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showBidModal} onOpenChange={setShowBidModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Offerta per {selectedAuction?.player_name}</DialogTitle>
          </DialogHeader>
          {selectedAuction && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-lg p-4 space-y-1">
                <p className="text-sm text-slate-600"><strong>Prezzo base:</strong> €{(selectedAuction.starting_price / 1000000).toFixed(2)}M</p>
                <p className="text-sm text-slate-600"><strong>Budget disponibile:</strong> €{((myTeam?.budget || 0) / 1000000).toFixed(2)}M</p>
                <p className="text-sm text-slate-600"><strong>Scade:</strong> {moment(selectedAuction.end_time).format('DD/MM/YYYY HH:mm')}</p>
              </div>
              <div className="space-y-2">
                <Label>La tua offerta (€)</Label>
                <Input type="number" min={selectedAuction.starting_price} max={myTeam?.budget}
                  value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder="Inserisci importo" />
                <p className="text-xs text-slate-500">
                  Min: €{(selectedAuction.starting_price / 1000000).toFixed(2)}M &bull; Max: €{((myTeam?.budget || 0) / 1000000).toFixed(2)}M
                </p>
              </div>
              {selectedAuction?.max_bids_per_team && (() => {
                const sessionName = selectedAuction.auction_session_name;
                const sessionAuctions = auctions.filter(a => a.auction_session_name === sessionName && a.status === 'active');
                const sessionBids = myBids.filter(b => b.status === 'active' && sessionAuctions.some(a => a.id === b.auction_id));
                const existingBid = myBidForAuction(selectedAuction.id);
                const usedBids = existingBid ? sessionBids.length : sessionBids.length;
                return (
                  <div className={`rounded-lg p-3 text-xs border ${usedBids >= selectedAuction.max_bids_per_team && !existingBid ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-blue-50 border-blue-200 text-blue-800'}`}>
                    📊 Offerte sessione: <strong>{usedBids}/{selectedAuction.max_bids_per_team}</strong>
                    {existingBid && <span className="ml-1">(stai modificando un'offerta esistente)</span>}
                  </div>
                );
              })()}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
                🔒 La tua offerta è segreta. Se modifichi l'offerta, quella precedente verrà annullata.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBidModal(false)}>Annulla</Button>
            <Button className="bg-purple-600 hover:bg-purple-700" onClick={submitBid} disabled={submitting || !bidAmount}>
              {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Conferma Offerta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
