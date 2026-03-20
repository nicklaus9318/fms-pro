import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRightLeft, Check, X, Plus, TrendingUp, Users, Gavel } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';
import PublicAuctions from '../components/market/PublicAuctions';

export default function Market() {
  const [user, setUser] = useState(null);
  const [showTransferForm, setShowTransferForm] = useState(false);
  const [showReleasePlayerForm, setShowReleasePlayerForm] = useState(false);
  const [playerToReleaseId, setPlayerToReleaseId] = useState('');
  const [releaseValue, setReleaseValue] = useState('');
  const [transferFormData, setTransferFormData] = useState({
    type: 'purchase',
    player_ids_out: [],
    player_ids_in: [],
    amount: '',
    loan_end_date: ''
  });
  const [searchOut, setSearchOut] = useState('');
  const [searchIn, setSearchIn] = useState('');
  const [searchTeamOut, setSearchTeamOut] = useState('');

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {
        console.log('User not logged in');
      }
    };
    loadUser();
  }, []);

  const isAdmin = user?.role === 'admin';

  const { data: transfers = [] } = useQuery({
    queryKey: ['transfers'],
    queryFn: () => base44.entities.Transfer.list('-created_date')
  });

  const { data: players = [] } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.filter({ status: 'approved' })
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const { data: leagues = [] } = useQuery({
    queryKey: ['leagues'],
    queryFn: () => base44.entities.League.list()
  });

  const { data: auctions = [] } = useQuery({
    queryKey: ['auctions'],
    queryFn: () => base44.entities.Auction.list('-created_date')
  });

  const myTeams = teams.filter(t => t.owner_email === user?.email);
  const myTeam = myTeams[0];

  // Auto-chiusura aste scadute (simula cron job)
  useEffect(() => {
    if (!isAdmin || auctions.length === 0) return;

    const checkExpiredAuctions = () => {
      const now = new Date();
      const hasExpired = auctions.some(a => 
        a.status === 'active' && new Date(a.end_time) <= now
      );

      if (hasExpired) {
        console.log('🔄 Aste scadute rilevate, chiusura automatica...');
        closeExpiredAuctionsMutation.mutate();
      }
    };

    // Controlla immediatamente al caricamento
    checkExpiredAuctions();

    // Poi controlla ogni 2 minuti
    const interval = setInterval(checkExpiredAuctions, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAdmin, auctions.length]);

  const createTransferMutation = useMutation({
    mutationFn: (data) => base44.entities.Transfer.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      toast.success('Proposta inviata con successo');
      setShowTransferForm(false);
      resetForm();
    },
    onError: (e) => toast.error('Errore trasferimento: ' + e.message)
  });

  const updateTransferMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Transfer.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    }
  });

  const releasePlayerMutation = useMutation({
    mutationFn: async () => {
      if (!myTeam) {
        throw new Error('Devi avere una squadra per svincolare giocatori.');
      }
      if (!playerToReleaseId) {
        throw new Error('Seleziona un giocatore da svincolare.');
      }
      if (!releaseValue || parseFloat(releaseValue) <= 0) {
        throw new Error('Inserisci un valore di svincolo valido.');
      }

      const player = players.find(p => p.id === playerToReleaseId);
      if (!player || player.team_id !== myTeam.id) {
        throw new Error('Il giocatore selezionato non appartiene alla tua squadra.');
      }

      const amount = parseFloat(releaseValue);

      // Aggiorna il budget della squadra
      await base44.entities.Team.update(myTeam.id, {
        budget: (myTeam.budget || 0) + amount,
      });

      // Rendi il giocatore svincolato
      await base44.entities.Player.update(playerToReleaseId, {
        team_id: null,
        player_value: amount,
        is_on_loan: false,
        loan_from_team_id: null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Giocatore svincolato con successo!');
      setShowReleasePlayerForm(false);
      setPlayerToReleaseId('');
      setReleaseValue('');
    },
    onError: (error) => {
      toast.error(error.message || 'Errore nello svincolare il giocatore');
    }
  });

  const closeExpiredAuctionsMutation = useMutation({
    mutationFn: async () => {
      const now = new Date();
      const expiredAuctions = auctions.filter(a => 
        a.status === 'active' && new Date(a.end_time) <= now
      );

      if (expiredAuctions.length === 0) {
        throw new Error('Nessuna asta scaduta da chiudere');
      }

      const operations = [];

      for (const auction of expiredAuctions) {
        if (auction.bids && auction.bids.length > 0) {
          // Ordina offerte: prima per importo decrescente, poi per timestamp crescente
          const sortedBids = [...auction.bids].sort((a, b) => {
            if (b.amount !== a.amount) return b.amount - a.amount;
            return new Date(a.timestamp) - new Date(b.timestamp);
          });
          
          // Tentativo di assegnazione con fallback automatico
          let assignedWinner = null;
          
          for (const bid of sortedBids) {
            const candidateTeam = teams.find(t => t.id === bid.team_id);
            
            if (!candidateTeam) {
              console.warn(`Squadra ${bid.team_id} non trovata, passo al successivo`);
              continue;
            }

            // CONTROLLO BUDGET FINALE (simula SELECT FOR UPDATE)
            if (bid.amount <= (candidateTeam.budget || 0)) {
              // ✅ Ha budget sufficiente: assegna a questa squadra
              assignedWinner = { bid, team: candidateTeam };
              console.log(`✅ Asta ${auction.id}: Vincitore ${candidateTeam.name} (€${bid.amount})`);
              break;
            } else {
              // ❌ Budget insufficiente: tentativo fallback
              console.warn(`⚠️ ${candidateTeam.name} non ha più budget (aveva offerto €${bid.amount}), provo col successivo...`);
            }
          }

          if (assignedWinner) {
            const { bid, team } = assignedWinner;

            // Assegna giocatore
            operations.push(
              base44.entities.Player.update(auction.player_id, {
                team_id: team.id,
                is_on_loan: false,
                loan_from_team_id: null
              })
            );

            // Sottrai crediti
            operations.push(
              base44.entities.Team.update(team.id, {
                budget: (team.budget || 0) - bid.amount
              })
            );

            // Se c'era venditore, aggiungi crediti
            if (auction.seller_team_id) {
              const sellerTeam = teams.find(t => t.id === auction.seller_team_id);
              if (sellerTeam) {
                operations.push(
                  base44.entities.Team.update(auction.seller_team_id, {
                    budget: (sellerTeam.budget || 0) + bid.amount
                  })
                );
              }
            }

            // Chiudi asta con vincitore
            operations.push(
              base44.entities.Auction.update(auction.id, {
                status: 'completed',
                winner_team_id: team.id,
                final_price: bid.amount
              })
            );
          } else {
            // NESSUN VINCITORE VALIDO: tutte le squadre senza budget
            console.warn(`❌ Asta ${auction.id} annullata: nessuna squadra con budget sufficiente`);
            operations.push(
              base44.entities.Auction.update(auction.id, {
                status: 'cancelled'
              })
            );
          }
        } else {
          // Nessuna offerta
          operations.push(
            base44.entities.Auction.update(auction.id, {
              status: 'completed'
            })
          );
        }
      }

      await Promise.all(operations);
      return expiredAuctions.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['auctions'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success(`✅ ${count} aste chiuse con successo!`);
    },
    onError: (error) => {
      toast.error(error.message || 'Errore nella chiusura delle aste');
    }
  });

  const resetForm = () => {
    setTransferFormData({
      type: 'purchase',
      player_ids_out: [],
      player_ids_in: [],
      amount: '',
      loan_end_date: ''
    });
    setSearchOut('');
    setSearchIn('');
    setSearchTeamOut('');
  };

  const handleReleasePlayer = async (e) => {
    e.preventDefault();
    releasePlayerMutation.mutate();
  };

  const handleCreateTransfer = async (e) => {
    e.preventDefault();

    if (!myTeam) {
      toast.error('Devi avere una squadra');
      return;
    }

    const { type, player_ids_out, player_ids_in, amount, loan_end_date } = transferFormData;

    if (player_ids_out.length === 0) {
      toast.error('Seleziona almeno un giocatore da acquisire');
      return;
    }

    if (type === 'purchase' && !amount) {
      toast.error('Inserisci l\'importo');
      return;
    }

    // Data fine prestito opzionale
    // if (type === 'loan') {
    //   if (!loan_end_date) {
    //     toast.error('Inserisci la data di fine prestito');
    //     return;
    //   }
    // }



    const leagueId = myTeam.league_id || leagues[0]?.id || null;
    // league_id opzionale — non blocchiamo se mancante

    const playersOut = players.filter(p => player_ids_out.includes(p.id));
    const fromTeamId = playersOut[0]?.team_id || null;

    const transferData = {
      league_id: leagueId,
      type: type,
      from_team_id: fromTeamId,
      to_team_id: myTeam.id,
      player_ids_out: player_ids_out,
      status: 'pending'
    };



    if (type === 'purchase' || type === 'auction') {
      transferData.amount = parseFloat(amount);
    }

    if (type === 'loan' && loan_end_date) {
      transferData.loan_end_date = loan_end_date;
      transferData.amount = 0; // Prestito senza costo
    }

    await createTransferMutation.mutateAsync(transferData);
  };

  const handleTransferAction = async (transferId, action) => {
    const loadingToast = toast.loading('Elaborazione...');

    try {
      const transfer = transfers.find(t => t.id === transferId);
      if (!transfer) throw new Error('Trasferimento non trovato');

      const fromTeam = teams.find(t => t.id === transfer.from_team_id);
      const toTeam = teams.find(t => t.id === transfer.to_team_id);

      if (!toTeam) throw new Error('Squadra acquirente non trovata');

      const canManage = isAdmin || fromTeam?.owner_email === user?.email || toTeam?.owner_email === user?.email;
      if (!canManage) throw new Error('Non hai i permessi');

      if (action === 'completed') {
        const operations = [];
        const amount = parseFloat(transfer.amount) || 0;

        // Sposta giocatori OUT (da FROM a TO)
        for (const playerId of transfer.player_ids_out || []) {
          const updateData = { team_id: toTeam.id };
          
          if (transfer.type === 'loan') {
            updateData.is_on_loan = true;
            updateData.loan_from_team_id = fromTeam?.id;
          } else {
            updateData.is_on_loan = false;
            updateData.loan_from_team_id = null;
          }

          operations.push(base44.entities.Player.update(playerId, updateData));
        }



        // Gestione budget
        if ((transfer.type === 'purchase' || transfer.type === 'auction') && amount > 0) {
          if (amount > (toTeam.budget || 0)) {
            throw new Error('Budget insufficiente');
          }
          operations.push(base44.entities.Team.update(toTeam.id, {
            budget: (toTeam.budget || 0) - amount
          }));
          if (fromTeam) {
            operations.push(base44.entities.Team.update(fromTeam.id, {
              budget: (fromTeam.budget || 0) + amount
            }));
          }
        }

        operations.push(base44.entities.Transfer.update(transferId, { status: 'completed' }));

        await Promise.all(operations);

        toast.dismiss(loadingToast);
        toast.success('✅ Trasferimento completato!');
      } else if (action === 'rejected') {
        await base44.entities.Transfer.update(transferId, { status: 'rejected' });
        toast.dismiss(loadingToast);
        toast.success('Trasferimento rifiutato');
      }

      queryClient.invalidateQueries({ queryKey: ['transfers'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });

    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error(`Errore: ${error.message}`);
    }
  };

  const pendingTransfers = transfers.filter(t => t.status === 'pending');
  const completedTransfers = transfers.filter(t => t.status === 'completed' || t.status === 'rejected');

  const myTeamIds = myTeams.map(t => t.id);
  const myPlayers = players.filter(p => myTeamIds.includes(p.team_id));
  const otherPlayers = players.filter(p => !myTeamIds.includes(p.team_id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">
            Calciomercato
          </h1>
          <p className="text-slate-500 mt-1">Trasferimenti e aste pubbliche</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-sm font-medium">Proposte Attive</p>
                <p className="text-3xl font-bold text-white mt-1">{pendingTransfers.length}</p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <ArrowRightLeft className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500 to-amber-600 border-0 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-amber-100 text-sm font-medium">Budget</p>
                <p className="text-3xl font-bold text-white mt-1">
                  €{myTeam ? (myTeam.budget / 1000000).toFixed(1) : 0}M
                </p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <span className="text-2xl">💰</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 border-0 shadow-lg">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-purple-100 text-sm font-medium">Mia Rosa</p>
                <p className="text-3xl font-bold text-white mt-1">{myPlayers.length}</p>
              </div>
              <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="auctions" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="auctions" className="flex items-center gap-2">
            <Gavel className="w-4 h-4" />
            Aste Pubbliche
          </TabsTrigger>
          <TabsTrigger value="transfers" className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" />
            Trasferimenti
          </TabsTrigger>
          <TabsTrigger value="release" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Svincola
          </TabsTrigger>
          <TabsTrigger value="history">Storico</TabsTrigger>
        </TabsList>

        <TabsContent value="auctions" className="space-y-8">
          <PublicAuctions 
            auctions={auctions} 
            players={players} 
            teams={teams} 
            myTeam={myTeam} 
            user={user} 
          />
        </TabsContent>

        <TabsContent value="transfers" className="space-y-6">
          {/* Action Buttons */}
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => setShowTransferForm(true)}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuova Proposta
            </Button>
          </div>

      {/* Pending Transfers */}
      {pendingTransfers.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-slate-800">Proposte in Attesa</h2>
          <div className="space-y-3">
            {pendingTransfers.map(transfer => {
              const fromTeam = teams.find(t => t.id === transfer.from_team_id);
              const toTeam = teams.find(t => t.id === transfer.to_team_id);
              const playersOut = players.filter(p => transfer.player_ids_out?.includes(p.id));
              const playersIn = players.filter(p => transfer.player_ids_in?.includes(p.id));
              const canManage = isAdmin || fromTeam?.owner_email === user?.email || toTeam?.owner_email === user?.email;

              return (
                <Card key={transfer.id} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                          <ArrowRightLeft className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <Badge className="bg-blue-100 text-blue-700 border-0">
                              {transfer.type === 'purchase' ? 'Acquisto' :
                                transfer.type === 'loan' ? 'Prestito' :
                                  transfer.type === 'auction' ? 'Asta' : 'Altro'}
                            </Badge>
                            {transfer.amount > 0 && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-0 font-bold">
                                €{(transfer.amount / 1000000).toFixed(1)}M
                              </Badge>
                            )}
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-slate-600">
                              <span className="font-semibold">{fromTeam?.name || 'Svincolato'}</span> → <span className="font-semibold">{toTeam?.name}</span>
                            </p>
                            <p className="text-sm text-slate-700">
                              📤 In entrata: {playersOut.map(p => `${p.first_name} ${p.last_name}`).join(', ')}
                            </p>

                            {transfer.loan_end_date && (
                              <p className="text-xs text-slate-500">
                                Fino a: {moment(transfer.loan_end_date).format('DD/MM/YYYY')}
                              </p>
                            )}
                            {transfer.type === 'loan' && (
                              <Badge className="bg-blue-100 text-blue-700 border-0">
                                Prestito
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      {canManage && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-emerald-500 hover:bg-emerald-600 text-white flex-1"
                            onClick={() => handleTransferAction(transfer.id, 'completed')}
                          >
                            <Check className="w-4 h-4 mr-1" />
                            Accetta
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-rose-600 border-rose-200 hover:bg-rose-50 flex-1"
                            onClick={() => handleTransferAction(transfer.id, 'rejected')}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Rifiuta
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

          {/* Completed Transfers */}
          {completedTransfers.length > 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-slate-800">Trasferimenti Completati</h2>
              <div className="space-y-3">
                {completedTransfers.slice(0, 5).map(transfer => {
                  const fromTeam = teams.find(t => t.id === transfer.from_team_id);
                  const toTeam = teams.find(t => t.id === transfer.to_team_id);
                  const playersOut = players.filter(p => transfer.player_ids_out?.includes(p.id));

                  return (
                    <Card key={transfer.id} className="border-0 bg-slate-50">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="text-2xl">
                              {transfer.status === 'completed' ? '✅' : '❌'}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-700">
                                {playersOut.map(p => `${p.first_name} ${p.last_name}`).join(', ')}
                              </p>
                              <p className="text-sm text-slate-500">
                                {fromTeam?.name || 'Svincolato'} → {toTeam?.name}
                              </p>
                            </div>
                          </div>
                          <Badge variant={transfer.status === 'completed' ? 'default' : 'destructive'}>
                            {transfer.status === 'completed' ? 'Completato' : 'Rifiutato'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="release" className="space-y-6">
          <div className="flex gap-2 flex-wrap">
            <Button
              onClick={() => setShowReleasePlayerForm(true)}
              className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white shadow-lg"
            >
              <Plus className="w-4 h-4 mr-2" />
              Svincola un Giocatore
            </Button>
          </div>
          <Card className="bg-slate-50 border-dashed">
            <CardContent className="py-12 text-center">
              <p className="text-slate-500">Svincola i giocatori della tua squadra per renderli disponibili sul mercato come free agent.</p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card className="bg-slate-50 border-dashed">
            <CardContent className="py-12 text-center">
              <p className="text-slate-500">Consulta lo <a href="/auction-history" className="text-blue-600 hover:underline">Storico Aste completo</a></p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Transfer Form Modal */}
      <Dialog open={showTransferForm} onOpenChange={(open) => { if (!open) { setShowTransferForm(false); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuova Proposta di Trasferimento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Tipo operazione */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Tipo Operazione</p>
              <div className="flex gap-2">
                {['purchase', 'loan'].map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTransferFormData(prev => ({ ...prev, type: t, player_ids_out: [], amount: '', loan_end_date: '' }))}
                    className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium border transition-all ${
                      transferFormData.type === t
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    {t === 'purchase' ? '💰 Acquisto' : '🤝 Prestito'}
                  </button>
                ))}
              </div>
            </div>

            {/* Ricerca giocatore */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Cerca Giocatore</p>
              <Input
                placeholder="Cerca per nome..."
                value={searchOut}
                onChange={(e) => setSearchOut(e.target.value)}
              />
            </div>

            {/* Filtro squadra */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">Filtra per Squadra</p>
              <Select value={searchTeamOut} onValueChange={setSearchTeamOut}>
                <SelectTrigger>
                  <SelectValue placeholder="Tutte le squadre" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le squadre</SelectItem>
                  {teams.filter(t => !myTeamIds.includes(t.id)).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lista giocatori selezionabili */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">
                Giocatori disponibili
                {transferFormData.player_ids_out.length > 0 && (
                  <span className="ml-2 text-blue-600">({transferFormData.player_ids_out.length} selezionati)</span>
                )}
              </p>
              <div className="border rounded-lg divide-y max-h-52 overflow-y-auto">
                {otherPlayers
                  .filter(p => {
                    const nameMatch = !searchOut || `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchOut.toLowerCase());
                    const teamMatch = !searchTeamOut || searchTeamOut === 'all' || p.team_id === searchTeamOut;
                    return nameMatch && teamMatch && !p.is_on_loan;
                  })
                  .map(p => {
                    const isSelected = transferFormData.player_ids_out.includes(p.id);
                    const teamName = teams.find(t => t.id === p.team_id)?.name || 'Svincolato';
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setTransferFormData(prev => ({
                            ...prev,
                            player_ids_out: isSelected
                              ? prev.player_ids_out.filter(id => id !== p.id)
                              : [...prev.player_ids_out, p.id]
                          }));
                        }}
                        className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <span className="text-sm font-medium text-slate-800">
                            {p.first_name} {p.last_name}
                          </span>
                          <span className="text-xs text-slate-500 ml-2">
                            {p.role} · {teamName}
                          </span>
                        </div>
                        {isSelected && (
                          <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs">✓</span>
                        )}
                      </div>
                    );
                  })}
                {otherPlayers.filter(p => {
                  const nameMatch = !searchOut || `${p.first_name} ${p.last_name}`.toLowerCase().includes(searchOut.toLowerCase());
                  const teamMatch = !searchTeamOut || searchTeamOut === 'all' || p.team_id === searchTeamOut;
                  return nameMatch && teamMatch && !p.is_on_loan;
                }).length === 0 && (
                  <p className="text-center text-slate-400 text-sm py-6">Nessun giocatore trovato</p>
                )}
              </div>
            </div>

            {/* Importo per acquisto */}
            {transferFormData.type === 'purchase' && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Importo Offerta (€)</p>
                <Input
                  type="number"
                  placeholder="Es: 5000000"
                  value={transferFormData.amount}
                  onChange={(e) => setTransferFormData(prev => ({ ...prev, amount: e.target.value }))}
                />
              </div>
            )}

            {/* Data fine prestito */}
            {transferFormData.type === 'loan' && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700">Data Fine Prestito</p>
                <Input
                  type="date"
                  value={transferFormData.loan_end_date}
                  onChange={(e) => setTransferFormData(prev => ({ ...prev, loan_end_date: e.target.value }))}
                />
              </div>
            )}

            {/* Footer */}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => { setShowTransferForm(false); resetForm(); }}
              >
                Annulla
              </Button>
              <Button
                type="button"
                className="flex-1 bg-blue-500 hover:bg-blue-600"
                disabled={
                  createTransferMutation.isPending ||
                  transferFormData.player_ids_out.length === 0 ||
                  (transferFormData.type === 'purchase' && !transferFormData.amount)
                }
                onClick={() => {
                  if (!myTeam) { toast.error('Non hai una squadra associata'); return; }
                  if (transferFormData.player_ids_out.length === 0) { toast.error('Seleziona almeno un giocatore'); return; }
                  if (transferFormData.type === 'purchase' && !transferFormData.amount) { toast.error('Inserisci l\'importo'); return; }

                  const leagueId = myTeam.league_id || leagues[0]?.id || null;
                  const playersOut = players.filter(p => transferFormData.player_ids_out.includes(p.id));
                  const fromTeamId = playersOut[0]?.team_id || null;

                  const transferData = {
                    league_id: leagueId,
                    type: transferFormData.type,
                    from_team_id: fromTeamId,
                    to_team_id: myTeam.id,
                    player_ids_out: transferFormData.player_ids_out,
                    status: 'pending',
                    ...(transferFormData.type === 'purchase' ? { amount: parseFloat(transferFormData.amount) } : {}),
                    ...(transferFormData.type === 'loan' && transferFormData.loan_end_date ? { loan_end_date: transferFormData.loan_end_date, amount: 0 } : {})
                  };

                  createTransferMutation.mutate(transferData);
                }}
              >
                {createTransferMutation.isPending ? 'Invio...' : 'Invia Proposta'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Release Player Dialog */}
      <Dialog open={showReleasePlayerForm} onOpenChange={setShowReleasePlayerForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Svincola Giocatore</DialogTitle>
            <DialogDescription>
              Seleziona un giocatore dalla tua squadra da svincolare e imposta il valore economico.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleReleasePlayer} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="playerToRelease">Giocatore</Label>
              <Select
                value={playerToReleaseId}
                onValueChange={(id) => {
                  setPlayerToReleaseId(id);
                  const p = myPlayers.find(pl => pl.id === id);
                  if (p?.player_value) setReleaseValue(String(p.player_value));
                }}
              >
                <SelectTrigger id="playerToRelease">
                  <SelectValue placeholder="Seleziona un giocatore" />
                </SelectTrigger>
                <SelectContent>
                  {myPlayers.map(player => (
                    <SelectItem key={player.id} value={player.id}>
                      {player.first_name} {player.last_name} ({player.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {playerToReleaseId && (() => {
                const p = myPlayers.find(pl => pl.id === playerToReleaseId);
                return (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                    <p className="text-xs text-emerald-600 font-medium">Valore di svincolo (automatico)</p>
                    <p className="text-xl font-bold text-emerald-700 mt-1">
                      €{p?.player_value ? (p.player_value / 1000000).toFixed(2) + 'M' : 'N/D'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Basato sul valore di mercato del giocatore</p>
                  </div>
                );
              })()}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowReleasePlayerForm(false)}>
                Annulla
              </Button>
              <Button 
                type="submit" 
                className="bg-red-500 hover:bg-red-600"
                disabled={releasePlayerMutation.isPending || !playerToReleaseId}
              >
                {releasePlayerMutation.isPending ? 'Svincolo...' : 'Svincola'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}