import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Scale, DollarSign, TrendingDown, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function SportsJustice() {
  const [user, setUser] = useState(null);
  const [showSanctionForm, setShowSanctionForm] = useState(false);
  const [formData, setFormData] = useState({
    team_id: '',
    league_id: 'none',
    type: 'fine',
    amount: '',
    reason: ''
  });
  const [loading, setLoading] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        if (userData.role !== 'admin') {
          window.location.href = '/';
        }
      } catch (e) {
        base44.auth.redirectToLogin();
      }
    };
    loadUser();
  }, []);

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const { data: leagues = [] } = useQuery({
    queryKey: ['leagues'],
    queryFn: () => base44.entities.League.list()
  });

  const { data: sanctions = [] } = useQuery({
    queryKey: ['sanctions'],
    queryFn: () => base44.entities.Sanction.list('-created_date')
  });

  const createSanctionMutation = useMutation({
    mutationFn: async (data) => {
      const sanction = await base44.entities.Sanction.create(data);
      
      const team = teams.find(t => t.id === data.team_id);
      if (!team) return sanction;

      if (data.type === 'fine') {
        await base44.entities.Team.update(team.id, {
          budget: (team.budget || 0) - data.amount
        });
      }
      
      return sanction;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sanctions'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Sanzione applicata con successo');
      setShowSanctionForm(false);
      setFormData({ team_id: '', league_id: 'none', type: 'fine', amount: '', reason: '' });
    }
  });

  const revokeSanctionMutation = useMutation({
    mutationFn: async (sanction) => {
      await base44.entities.Sanction.update(sanction.id, { status: 'revoked' });
      
      if (sanction.type === 'fine') {
        const team = teams.find(t => t.id === sanction.team_id);
        if (team) {
          await base44.entities.Team.update(team.id, {
            budget: (team.budget || 0) + sanction.amount
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sanctions'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Sanzione revocata');
    }
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const team = teams.find(t => t.id === formData.team_id);
    
    await createSanctionMutation.mutateAsync({
      ...formData,
      league_id: formData.league_id === 'none' || formData.league_id === '' ? null : formData.league_id,
      team_name: team?.name || '',
      amount: parseFloat(formData.amount),
      issued_by: user?.email,
      status: 'active'
    });

    setLoading(false);
  };

  const activeSanctions = sanctions.filter(s => s.status === 'active');
  const revokedSanctions = sanctions.filter(s => s.status === 'revoked');

  const formatAmount = (amount, type) => {
    if (type === 'fine') {
      if (amount >= 1000000) return `€${(amount / 1000000).toFixed(1)}M`;
      if (amount >= 1000) return `€${(amount / 1000).toFixed(0)}K`;
      return `€${amount}`;
    }
    return `${amount} punti`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Giustizia Sportiva</h1>
          <p className="text-slate-500">Gestione multe e penalità</p>
        </div>
        <Button 
          onClick={() => setShowSanctionForm(true)}
          className="bg-rose-600 hover:bg-rose-700 gap-2"
        >
          <Scale className="w-4 h-4" />
          Nuova Sanzione
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-500" />
            Sanzioni Attive
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activeSanctions.length > 0 ? (
            <div className="space-y-3">
              {activeSanctions.map(sanction => {
                const league = leagues.find(l => l.id === sanction.league_id);
                return (
                  <Card key={sanction.id} className="bg-rose-50 border-rose-200">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            {sanction.type === 'fine' ? (
                              <DollarSign className="w-5 h-5 text-rose-600" />
                            ) : (
                              <TrendingDown className="w-5 h-5 text-rose-600" />
                            )}
                            <div>
                              <h4 className="font-semibold text-slate-800">{sanction.team_name}</h4>
                              <p className="text-sm text-slate-500">
                                {league?.name || 'Tutte le competizioni'} • {new Date(sanction.created_date).toLocaleDateString('it-IT')}
                              </p>
                            </div>
                          </div>
                          <div className="ml-8">
                            <Badge className="bg-rose-600 text-white mb-2">
                              {sanction.type === 'fine' ? 'Multa' : 'Penalità Punti'}
                            </Badge>
                            <p className="font-bold text-lg text-rose-700 mb-2">
                              {formatAmount(sanction.amount, sanction.type)}
                            </p>
                            <p className="text-sm text-slate-700">
                              <span className="font-medium">Motivazione:</span> {sanction.reason}
                            </p>
                            {sanction.issued_by && (
                              <p className="text-xs text-slate-500 mt-1">Emessa da: {sanction.issued_by}</p>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => revokeSanctionMutation.mutate(sanction)}
                          className="text-slate-600"
                        >
                          Revoca
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <Scale className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p>Nessuna sanzione attiva</p>
            </div>
          )}
        </CardContent>
      </Card>

      {revokedSanctions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-slate-600">Storico Sanzioni Revocate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {revokedSanctions.slice(0, 5).map(sanction => (
                <div key={sanction.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-700">{sanction.team_name}</p>
                    <p className="text-sm text-slate-500">{sanction.reason}</p>
                  </div>
                  <Badge variant="outline" className="bg-slate-100">Revocata</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={showSanctionForm} onOpenChange={setShowSanctionForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuova Sanzione</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Squadra *</Label>
              <Select 
                value={formData.team_id} 
                onValueChange={(v) => setFormData({ ...formData, team_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona squadra" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Competizione</Label>
              <Select 
                value={formData.league_id} 
                onValueChange={(v) => setFormData({ ...formData, league_id: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Tutte le competizioni" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Tutte</SelectItem>
                  {leagues.map(league => (
                    <SelectItem key={league.id} value={league.id}>{league.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo Sanzione *</Label>
              <Select 
                value={formData.type} 
                onValueChange={(v) => setFormData({ ...formData, type: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fine">Multa (detrazione budget)</SelectItem>
                  <SelectItem value="points_deduction">Penalità Punti (classifica)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{formData.type === 'fine' ? 'Importo Multa (€) *' : 'Punti da Detrarre *'}</Label>
              <Input
                type="number"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                placeholder={formData.type === 'fine' ? '10000' : '3'}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Motivazione *</Label>
              <Textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                placeholder="Descrivi la motivazione della sanzione..."
                rows={3}
                required
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowSanctionForm(false)}>
                Annulla
              </Button>
              <Button type="submit" disabled={loading} className="bg-rose-600 hover:bg-rose-700">
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Applica Sanzione
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
