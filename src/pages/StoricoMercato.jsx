import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Gavel, ArrowRightLeft, Search, Trophy, TrendingUp } from 'lucide-react';

export default function StoricoMercato() {
  const [searchAste, setSearchAste] = useState('');
  const [searchTransfer, setSearchTransfer] = useState('');
  const [filterSession, setFilterSession] = useState('all');

  const { data: auctions = [], isLoading: loadingAuctions } = useQuery({
    queryKey: ['storicoAuctions'],
    queryFn: () => base44.entities.Auction.list('-created_date'),
  });

  const { data: bids = [] } = useQuery({
    queryKey: ['storicoBids'],
    queryFn: () => base44.entities.Bid.list('-created_date'),
  });

  const { data: transfers = [], isLoading: loadingTransfers } = useQuery({
    queryKey: ['storicoTransfers'],
    queryFn: () => base44.entities.Transfer.list('-created_date'),
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
  });

  const { data: players = [] } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.filter({ status: 'approved' }),
  });

  // Aste chiuse con almeno un'offerta
  const closedAuctions = auctions
    .filter(a => (a.status === 'completed' || a.status === 'closed'))
    .filter(a => bids.some(b => b.auction_id === a.id))
    .filter(a => !searchAste || a.player_name?.toLowerCase().includes(searchAste.toLowerCase()))
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  // Sessioni disponibili per filtro
  const sessions = [...new Set(closedAuctions.map(a => a.auction_session_name).filter(Boolean))];

  // Trasferimenti completati (acquisti e prestiti)
  const completedTransfers = transfers
    .filter(t => (t.type === 'purchase' || t.type === 'loan') && t.status === 'completed')
    .filter(t => !searchTransfer || (() => {
      const playerIds = t.player_ids_out || [];
      return playerIds.some(id => {
        const p = players.find(pl => pl.id === id);
        return p && `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchTransfer.toLowerCase());
      });
    })())
    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  // Raggruppa trasferimenti per sessione/periodo
  const transferGroups = completedTransfers.reduce((acc, t) => {
    const date = t.created_date ? new Date(t.created_date) : null;
    const key = date
      ? `${date.toLocaleString('it-IT', { month: 'long', year: 'numeric' })}`
      : 'Senza data';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

  const getPlayerNames = (playerIds) => {
    if (!playerIds?.length) return 'Giocatore';
    return playerIds.map(id => {
      const p = players.find(pl => pl.id === id);
      return p ? `${p.first_name} ${p.last_name}` : '?';
    }).join(', ');
  };

  const getTeamName = (teamId) => teams.find(t => t.id === teamId)?.name || '-';

  const filteredAuctions = filterSession === 'all'
    ? closedAuctions
    : closedAuctions.filter(a => a.auction_session_name === filterSession);

  // Raggruppa aste per sessione
  const auctionGroups = filteredAuctions.reduce((acc, a) => {
    const key = a.auction_session_name || 'Senza sessione';
    if (!acc[key]) acc[key] = [];
    acc[key].push(a);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <TrendingUp className="w-7 h-7 text-emerald-600" />
          Storico Mercato
        </h1>
        <p className="text-slate-500">Cronologia aste e operazioni di mercato</p>
      </div>

      <Tabs defaultValue="aste">
        <TabsList className="w-full">
          <TabsTrigger value="aste" className="flex-1 gap-2">
            <Gavel className="w-4 h-4" />Storico Aste
          </TabsTrigger>
          <TabsTrigger value="trasferimenti" className="flex-1 gap-2">
            <ArrowRightLeft className="w-4 h-4" />Operazioni Mercato
          </TabsTrigger>
        </TabsList>

        {/* ── STORICO ASTE ── */}
        <TabsContent value="aste" className="mt-4 space-y-4">
          <div className="flex gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Cerca giocatore..."
                value={searchAste}
                onChange={(e) => setSearchAste(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterSession} onValueChange={setFilterSession}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Sessione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le sessioni</SelectItem>
                {sessions.map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loadingAuctions ? (
            <div className="text-center py-8 text-slate-400">Caricamento...</div>
          ) : Object.keys(auctionGroups).length === 0 ? (
            <Card className="bg-slate-50 border-dashed">
              <CardContent className="py-10 text-center text-slate-400">
                <Gavel className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                Nessuna asta conclusa trovata
              </CardContent>
            </Card>
          ) : Object.entries(auctionGroups).map(([session, sessionAuctions]) => (
            <Card key={session}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Gavel className="w-4 h-4 text-purple-500" />
                  {session}
                  <Badge variant="outline" className="ml-auto">{sessionAuctions.length} aste</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {sessionAuctions.map(auction => {
                  const winnerTeam = teams.find(t => t.id === auction.current_winner_team_id);
                  const auctionBids = bids.filter(b => b.auction_id === auction.id && b.status === 'active');
                  const topBid = auctionBids.sort((a, b) => b.amount - a.amount)[0];
                  return (
                    <div key={auction.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{auction.player_name}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {winnerTeam && (
                            <span className="text-xs text-emerald-700 font-medium flex items-center gap-1">
                              <Trophy className="w-3 h-3" />{winnerTeam.name}
                            </span>
                          )}
                          <span className="text-xs text-slate-400">
                            {auction.created_date && new Date(auction.created_date).toLocaleDateString('it-IT')}
                          </span>
                          <span className="text-xs text-slate-400">
                            {auctionBids.length} offerte
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-800">
                          €{((topBid?.amount || auction.current_price || 0) / 1000000).toFixed(2)}M
                        </p>
                        <Badge className="bg-emerald-100 text-emerald-700 text-xs">Chiusa</Badge>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ── OPERAZIONI DI MERCATO ── */}
        <TabsContent value="trasferimenti" className="mt-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Cerca giocatore..."
              value={searchTransfer}
              onChange={(e) => setSearchTransfer(e.target.value)}
              className="pl-9"
            />
          </div>

          {loadingTransfers ? (
            <div className="text-center py-8 text-slate-400">Caricamento...</div>
          ) : Object.keys(transferGroups).length === 0 ? (
            <Card className="bg-slate-50 border-dashed">
              <CardContent className="py-10 text-center text-slate-400">
                <ArrowRightLeft className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                Nessuna operazione di mercato trovata
              </CardContent>
            </Card>
          ) : Object.entries(transferGroups).map(([period, periodTransfers]) => (
            <Card key={period}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 capitalize">
                  <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                  {period}
                  <Badge variant="outline" className="ml-auto">{periodTransfers.length} operazioni</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {periodTransfers.map(transfer => {
                  const playerNames = getPlayerNames(transfer.player_ids_out);
                  const fromTeam = getTeamName(transfer.from_team_id);
                  const toTeam = getTeamName(transfer.to_team_id);
                  return (
                    <div key={transfer.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{playerNames}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {fromTeam} → {toTeam}
                        </p>
                        <p className="text-xs text-slate-400">
                          {transfer.created_date && new Date(transfer.created_date).toLocaleDateString('it-IT')}
                        </p>
                      </div>
                      <div className="text-right space-y-1">
                        {transfer.amount > 0 && (
                          <p className="font-bold text-slate-700">€{(transfer.amount / 1000000).toFixed(2)}M</p>
                        )}
                        <Badge className={transfer.type === 'loan'
                          ? 'bg-blue-100 text-blue-700 text-xs'
                          : 'bg-emerald-100 text-emerald-700 text-xs'
                        }>
                          {transfer.type === 'loan' ? '🤝 Prestito' : '💰 Acquisto'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
