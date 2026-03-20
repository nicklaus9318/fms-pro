import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DollarSign, TrendingUp, TrendingDown, AlertTriangle, Plus, Minus, History, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import moment from 'moment';

export default function BudgetManager() {
  const [user, setUser] = useState(null);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showAdjustDialog, setShowAdjustDialog] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState('');
  const [adjustmentDescription, setAdjustmentDescription] = useState('');
  const [adjustmentType, setAdjustmentType] = useState('add');

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        if (userData.role !== 'admin') {
          base44.auth.redirectToLogin();
        }
      } catch (e) {
        base44.auth.redirectToLogin();
      }
    };
    loadUser();
  }, []);

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list(),
    enabled: !!user
  });

  const { data: transactions = [], isLoading: transactionsLoading } = useQuery({
    queryKey: ['budgetTransactions'],
    queryFn: async () => {
      const allTransactions = [];
      let skip = 0;
      const limit = 100;
      while (true) {
        const batch = await base44.entities.BudgetTransaction.list('-created_date', limit, skip);
        allTransactions.push(...batch);
        if (batch.length < limit) break;
        skip += limit;
      }
      return allTransactions;
    },
    enabled: !!user
  });

  const adjustBudgetMutation = useMutation({
    mutationFn: async ({ team, amount, description, isAddition }) => {
      const actualAmount = isAddition ? Math.abs(amount) : -Math.abs(amount);
      const newBalance = team.budget + actualAmount;

      await base44.entities.BudgetTransaction.create({
        team_id: team.id,
        team_name: team.name,
        amount: actualAmount,
        type: 'manual_adjustment',
        description: description || (isAddition ? 'Aggiunta manuale budget' : 'Rimozione manuale budget'),
        previous_balance: team.budget,
        new_balance: newBalance
      });

      await base44.entities.Team.update(team.id, {
        budget: newBalance
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['budgetTransactions'] });
      setShowAdjustDialog(false);
      setAdjustmentAmount('');
      setAdjustmentDescription('');
      toast.success('Budget aggiornato');
    },
    onError: () => toast.error('Errore aggiornamento budget')
  });

  const handleAdjustBudget = () => {
    if (!selectedTeam || !adjustmentAmount) return;
    adjustBudgetMutation.mutate({
      team: selectedTeam,
      amount: parseFloat(adjustmentAmount) * 1000000,
      description: adjustmentDescription,
      isAddition: adjustmentType === 'add'
    });
  };

  const getTeamTransactions = (teamId) => {
    return transactions.filter(t => t.team_id === teamId);
  };

  const getLowBudgetTeams = () => {
    return teams.filter(t => t.budget < 5000000).sort((a, b) => a.budget - b.budget);
  };

  const getNegativeBudgetTeams = () => {
    return teams.filter(t => t.budget < 0);
  };

  const getTransactionIcon = (type) => {
    const icons = {
      purchase: TrendingDown,
      sale: TrendingUp,
      salary: TrendingDown,
      auction_win: TrendingDown,
      auction_sale: TrendingUp,
      manual_adjustment: DollarSign,
      transfer_out: TrendingUp,
      transfer_in: TrendingDown
    };
    return icons[type] || DollarSign;
  };

  const getTransactionColor = (amount) => {
    return amount >= 0 ? 'text-green-600' : 'text-red-600';
  };

  const getTypeLabel = (type) => {
    const labels = {
      purchase: 'Acquisto',
      sale: 'Vendita',
      salary: 'Stipendio',
      auction_win: 'Asta Vinta',
      auction_sale: 'Vendita Asta',
      manual_adjustment: 'Rettifica Manuale',
      transfer_out: 'Cessione',
      transfer_in: 'Acquisto'
    };
    return labels[type] || type;
  };

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const lowBudgetTeams = getLowBudgetTeams();
  const negativeBudgetTeams = getNegativeBudgetTeams();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
          <DollarSign className="w-8 h-8 text-emerald-500" />
          Gestione Budget
        </h1>
        <p className="text-slate-500 mt-1">Monitora e gestisci il budget delle squadre</p>
      </div>

      {negativeBudgetTeams.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" />
              Attenzione: Budget Negativi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {negativeBudgetTeams.map(team => (
                <div key={team.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-red-200">
                  <div className="flex items-center gap-3">
                    {team.logo_url && <img src={team.logo_url} alt={team.name} className="w-10 h-10 rounded-full" />}
                    <span className="font-semibold">{team.name}</span>
                  </div>
                  <Badge className="bg-red-600 text-white">
                    €{(team.budget / 1000000).toFixed(2)}M
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {lowBudgetTeams.length > 0 && negativeBudgetTeams.length === 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              Budget Bassi
            </CardTitle>
            <CardDescription>Squadre con budget sotto i €5M</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {lowBudgetTeams.map(team => (
                <div key={team.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-200">
                  <div className="flex items-center gap-2">
                    {team.logo_url && <img src={team.logo_url} alt={team.name} className="w-8 h-8 rounded-full" />}
                    <span className="text-sm font-medium">{team.name}</span>
                  </div>
                  <Badge variant="outline" className="text-amber-700">
                    €{(team.budget / 1000000).toFixed(1)}M
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Panoramica</TabsTrigger>
          <TabsTrigger value="history">Storico Completo</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {teams.map(team => {
              const teamTransactions = getTeamTransactions(team.id);
              const recentTransactions = teamTransactions.slice(0, 3);
              return (
                <Card key={team.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {team.logo_url && <img src={team.logo_url} alt={team.name} className="w-10 h-10 rounded-full" />}
                        <CardTitle className="text-lg">{team.name}</CardTitle>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedTeam(team);
                          setShowAdjustDialog(true);
                        }}
                      >
                        <DollarSign className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="mt-2">
                      <Badge className={`${team.budget < 0 ? 'bg-red-600' : team.budget < 5000000 ? 'bg-amber-500' : 'bg-emerald-600'} text-white text-lg`}>
                        €{(team.budget / 1000000).toFixed(2)}M
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {recentTransactions.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-500 font-medium mb-2">Ultime transazioni:</p>
                        {recentTransactions.map((transaction, idx) => {
                          const Icon = getTransactionIcon(transaction.type);
                          return (
                            <div key={idx} className="flex items-center justify-between text-xs p-2 bg-slate-50 rounded">
                              <div className="flex items-center gap-2">
                                <Icon className={`w-3 h-3 ${getTransactionColor(transaction.amount)}`} />
                                <span className="text-slate-600">{getTypeLabel(transaction.type)}</span>
                              </div>
                              <span className={`font-semibold ${getTransactionColor(transaction.amount)}`}>
                                {transaction.amount >= 0 ? '+' : ''}€{(transaction.amount / 1000000).toFixed(1)}M
                              </span>
                            </div>
                          );
                        })}
                        {teamTransactions.length > 3 && (
                          <p className="text-xs text-slate-400 text-center pt-1">
                            +{teamTransactions.length - 3} altre transazioni
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-4">Nessuna transazione</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {teams.map(team => {
            const teamTransactions = getTeamTransactions(team.id);
            if (teamTransactions.length === 0) return null;

            return (
              <Card key={team.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {team.logo_url && <img src={team.logo_url} alt={team.name} className="w-10 h-10 rounded-full" />}
                      <div>
                        <CardTitle>{team.name}</CardTitle>
                        <CardDescription>
                          Budget attuale: €{(team.budget / 1000000).toFixed(2)}M
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline">
                      <History className="w-3 h-3 mr-1" />
                      {teamTransactions.length} transazioni
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {teamTransactions.map((transaction) => {
                      const Icon = getTransactionIcon(transaction.type);
                      return (
                        <div key={transaction.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Icon className={`w-4 h-4 ${getTransactionColor(transaction.amount)}`} />
                              <span className="font-medium text-sm">{getTypeLabel(transaction.type)}</span>
                              {transaction.related_player_name && (
                                <Badge variant="outline" className="text-xs">
                                  {transaction.related_player_name}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">{transaction.description}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {moment(transaction.created_date).format('DD/MM/YYYY HH:mm')}
                            </p>
                          </div>
                          <div className="text-right ml-4">
                            <p className={`text-lg font-bold ${getTransactionColor(transaction.amount)}`}>
                              {transaction.amount >= 0 ? '+' : ''}€{(transaction.amount / 1000000).toFixed(2)}M
                            </p>
                            <p className="text-xs text-slate-500">
                              Saldo: €{(transaction.new_balance / 1000000).toFixed(2)}M
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
      </Tabs>

      <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rettifica Budget - {selectedTeam?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-600">Budget attuale:</p>
              <p className="text-2xl font-bold text-slate-800">
                €{((selectedTeam?.budget || 0) / 1000000).toFixed(2)}M
              </p>
            </div>

            <div className="space-y-2">
              <Label>Tipo di operazione</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={adjustmentType === 'add' ? 'default' : 'outline'}
                  onClick={() => setAdjustmentType('add')}
                  className={adjustmentType === 'add' ? 'bg-green-600 hover:bg-green-700' : ''}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi
                </Button>
                <Button
                  variant={adjustmentType === 'remove' ? 'default' : 'outline'}
                  onClick={() => setAdjustmentType('remove')}
                  className={adjustmentType === 'remove' ? 'bg-red-600 hover:bg-red-700' : ''}
                >
                  <Minus className="w-4 h-4 mr-2" />
                  Rimuovi
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Importo (Milioni €)</Label>
              <Input
                type="number"
                step="0.1"
                min="0"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
                placeholder="es: 10.5"
              />
            </div>

            <div className="space-y-2">
              <Label>Descrizione (opzionale)</Label>
              <Input
                value={adjustmentDescription}
                onChange={(e) => setAdjustmentDescription(e.target.value)}
                placeholder="Motivo della rettifica"
              />
            </div>

            {adjustmentAmount && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-slate-600">Nuovo budget:</p>
                <p className="text-2xl font-bold text-blue-700">
                  €{(((selectedTeam?.budget || 0) + (adjustmentType === 'add' ? 1 : -1) * parseFloat(adjustmentAmount || 0) * 1000000) / 1000000).toFixed(2)}M
                </p>
              </div>
            )}

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowAdjustDialog(false)}
                className="flex-1"
              >
                Annulla
              </Button>
              <Button
                onClick={handleAdjustBudget}
                disabled={adjustBudgetMutation.isPending || !adjustmentAmount}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                {adjustBudgetMutation.isPending ? 'Applicazione...' : 'Applica Rettifica'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}