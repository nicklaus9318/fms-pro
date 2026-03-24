import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Gavel, ArrowRightLeft, Search, TrendingUp, Eye, Trophy } from 'lucide-react';
import moment from 'moment';
import 'moment/locale/it';

moment.locale('it');

export default function StoricoMercato() {
  const [searchAste, setSearchAste] = useState('');
  const [searchTransfer, setSearchTransfer] = useState('');
  const [filterSession, setFilterSession] = useState('all');
  const [selectedSession, setSelectedSession] = useState(null);
  const [showSessionDetail, setShowSessionDetail] = useState(false);

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

  // ── BUSTE CHIUSE ──────────────────────────────────────────────────────────
  // Raggruppa aste sealed_bid per sessione
  const sealedAuctions = auctions.filter(a => a.auction_type === 'sealed_bid');
  const sealedSessions = [...new Set(sealedAuctions.map(a => a.auction_session_name).filter(Boolean))];

  const getSealedSessionStatus = (sessionName) => {
    const sessionAuctions = sealedAuctions.filter(a => a.auction_session_name === sessionName);
    const hasActive = sessionAuctions.some(a => a.status === 'active');
    return hasActive ? 'Attiva' : 'Conclusa';
  };

  const getSealedSessionEndTime = (sessionName) => {
    const sessionAuctions = sealedAuctions.filter(a => a.auction_session_name === sessionName);
    const latest = sessionAuctions.sort((a, b) => new Date(b.end_time) - new Date(a.end_time))[0];
    return latest?.end_time;
  };

  const filteredSealedSessions = sealedSessions
    .filter(s => !searchAste || s.toLowerCase().includes(searchAste.toLowerCase()))
    .sort((a, b) => {
      const tA = getSealedSessionEndTime(a);
      const tB = getSealedSessionEndTime(b);
      return new Date(tB) - new Date(tA);
    });

  // ── FASE SCAMBI (trasferimenti per sessione) ───────────────────────────────
  const transferSessions = [...new Set(
    transfers
      .filter(t => t.type === 'purchase' || t.type === 'loan')
      .map(t => t.session_name || t.notes || null)
      .filter(Boolean)
  )];

  // Raggruppa per mese se non c'è session_name
  const transfersBySession = transfers
    .filter(t => (t.type === 'purchase' || t.type === 'loan'))
    .reduce((acc, t) => {
      const key = t.session_name || t.notes ||
        (t.created_date ? moment(t.created_date).format('MMMM YYYY') : 'Senza data');
      if (!acc[key]) acc[key] = [];
      acc[key].push(t);
      return acc;
    }, {});

  const transferSessionKeys = Object.keys(transfersBySession)
    .filter(s => !searchTransfer || s.toLowerCase().includes(searchTransfer.toLowerCase()))
    .sort((a, b) => {
      const tA = transfersBySession[a][0]?.created_date;
      const tB = transfersBySession[b][0]?.created_date;
      return new Date(tB) - new Date(tA);
    });

  const getTransferSessionStatus = (key) => {
    const sessionTransfers = transfersBySession[key];
    const hasPending = sessionTransfers.some(t => t.status === 'pending');
    return hasPending ? 'Aperta' : 'Conclusa';
  };

  // ── Detail Dialog ─────────────────────────────────────────────────────────
  const openSessionDetail = (sessionName, type) => {
    setSelectedSession({ name: sessionName, type });
    setShowSessionDetail(true);
  };

  const getPlayerNames = (playerIds) => {
    if (!playerIds?.length) return 'Giocatore';
    return playerIds.map(id => {
      const p = players.find(pl => pl.id === id);
      return p ? `${p.first_name} ${p.last_name}` : '?';
    }).join(', ');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <TrendingUp className="w-7 h-7 text-emerald-600" />
          Storico Mercato
        </h1>
        <p className="text-slate-500">Cronologia aste e operazioni di mercato</p>
      </div>

      <Tabs defaultValue="buste">
        <TabsList className="w-full">
          <TabsTrigger value="buste" className="flex-1 gap-2">
            <Gavel className="w-4 h-4" />Busta Chiusa
          </TabsTrigger>
          <TabsTrigger value="scambi" className="flex-1 gap-2">
            <ArrowRightLeft className="w-4 h-4" />Fase Scambi
          </TabsTrigger>
        </TabsList>

        {/* ── BUSTE CHIUSE ── */}
        <TabsContent value="buste" className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Cerca sessione..."
              value={searchAste}
              onChange={(e) => setSearchAste(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingAuctions ? (
                <div className="text-center py-8 text-slate-400">Caricamento...</div>
              ) : filteredSealedSessions.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <Gavel className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p>Nessuna sessione trovata</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="text-left p-3 text-sm font-semibold">Nome Asta</th>
                      <th className="text-left p-3 text-sm font-semibold hidden sm:table-cell">Scadenza</th>
                      <th className="text-left p-3 text-sm font-semibold">Stato</th>
                      <th className="p-3 text-sm font-semibold">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredSealedSessions.map(session => {
                      const endTime = getSealedSessionEndTime(session);
                      const status = getSealedSessionStatus(session);
                      const count = sealedAuctions.filter(a => a.auction_session_name === session).length;
                      return (
                        <tr key={session} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3">
                            <p className="font-medium text-slate-800">{session}</p>
                            <p className="text-xs text-slate-400">{count} aste</p>
                          </td>
                          <td className="p-3 hidden sm:table-cell">
                            <p className="text-sm text-slate-600">
                              {endTime ? moment(endTime).format('DD-MM-YYYY HH:mm') : '-'}
                            </p>
                          </td>
                          <td className="p-3">
                            <Badge className={status === 'Attiva'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                            }>
                              {status}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                              onClick={() => openSessionDetail(session, 'buste')}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FASE SCAMBI ── */}
        <TabsContent value="scambi" className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Cerca sessione..."
              value={searchTransfer}
              onChange={(e) => setSearchTransfer(e.target.value)}
              className="pl-9"
            />
          </div>

          <Card>
            <CardContent className="p-0">
              {loadingTransfers ? (
                <div className="text-center py-8 text-slate-400">Caricamento...</div>
              ) : transferSessionKeys.length === 0 ? (
                <div className="text-center py-10 text-slate-400">
                  <ArrowRightLeft className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p>Nessuna operazione di mercato trovata</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-slate-800 text-white">
                    <tr>
                      <th className="text-left p-3 text-sm font-semibold">Nome Asta</th>
                      <th className="text-left p-3 text-sm font-semibold hidden sm:table-cell">Data</th>
                      <th className="text-left p-3 text-sm font-semibold">Stato</th>
                      <th className="p-3 text-sm font-semibold">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transferSessionKeys.map(key => {
                      const sessionTransfers = transfersBySession[key];
                      const latestDate = sessionTransfers[0]?.created_date;
                      const status = getTransferSessionStatus(key);
                      return (
                        <tr key={key} className="hover:bg-slate-50 transition-colors">
                          <td className="p-3">
                            <p className="font-medium text-slate-800 capitalize">{key}</p>
                            <p className="text-xs text-slate-400">{sessionTransfers.length} operazioni</p>
                          </td>
                          <td className="p-3 hidden sm:table-cell">
                            <p className="text-sm text-slate-600">
                              {latestDate ? moment(latestDate).format('DD-MM-YYYY') : '-'}
                            </p>
                          </td>
                          <td className="p-3">
                            <Badge className={status === 'Aperta'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-100 text-slate-600'
                            }>
                              {status}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                              onClick={() => openSessionDetail(key, 'scambi')}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── Dialog Dettaglio Sessione ── */}
      <Dialog open={showSessionDetail} onOpenChange={setShowSessionDetail}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedSession?.type === 'buste' ? <Gavel className="w-5 h-5 text-purple-500" /> : <ArrowRightLeft className="w-5 h-5 text-blue-500" />}
              {selectedSession?.name}
            </DialogTitle>
          </DialogHeader>

          {selectedSession?.type === 'buste' && (() => {
            const sessionAuctions = sealedAuctions
              .filter(a => a.auction_session_name === selectedSession.name)
              .sort((a, b) => new Date(b.end_time) - new Date(a.end_time));
            return (
              <div className="space-y-2">
                {sessionAuctions.map(auction => {
                  const winnerTeam = teams.find(t => t.id === auction.current_winner_team_id);
                  const auctionBids = bids.filter(b => b.auction_id === auction.id);
                  const topBid = [...auctionBids].sort((a, b) => b.amount - a.amount)[0];
                  return (
                    <div key={auction.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border">
                      <div>
                        <p className="font-medium text-slate-800">{auction.player_name}</p>
                        <div className="flex gap-2 mt-0.5 text-xs text-slate-500 flex-wrap">
                          <span>{moment(auction.end_time).format('DD/MM/YYYY HH:mm')}</span>
                          <span>{auctionBids.length} offerte</span>
                        </div>
                        {winnerTeam && (
                          <p className="text-xs text-emerald-700 mt-0.5 flex items-center gap-1">
                            <Trophy className="w-3 h-3" />{winnerTeam.name}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-slate-800">
                          €{((topBid?.amount || auction.current_price || 0) / 1000000).toFixed(2)}M
                        </p>
                        <Badge className={auction.status === 'active'
                          ? 'bg-emerald-100 text-emerald-700 text-xs'
                          : 'bg-slate-100 text-slate-600 text-xs'
                        }>
                          {auction.status === 'active' ? 'Attiva' : 'Conclusa'}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {selectedSession?.type === 'scambi' && (() => {
            const sessionTransfers = transfersBySession[selectedSession.name] || [];
            return (
              <div className="space-y-2">
                {sessionTransfers.map(transfer => {
                  const fromTeam = teams.find(t => t.id === transfer.from_team_id);
                  const toTeam = teams.find(t => t.id === transfer.to_team_id);
                  const playerNames = getPlayerNames(transfer.player_ids_out);
                  return (
                    <div key={transfer.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border">
                      <div>
                        <p className="font-medium text-slate-800">{playerNames}</p>
                        <p className="text-xs text-slate-500">
                          {fromTeam?.name || '-'} → {toTeam?.name || '-'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {transfer.created_date && moment(transfer.created_date).format('DD/MM/YYYY')}
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
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
