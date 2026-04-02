import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { UserPlus, TrendingUp, Loader2, CheckCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

const ROLES = [
  { value: "POR", label: "Portiere" },
  { value: "DC", label: "Difensore Centrale" },
  { value: "TS", label: "Terzino Sinistro" },
  { value: "TD", label: "Terzino Destro" },
  { value: "CDC", label: "Centrocampista Difensivo Centrale" },
  { value: "CC", label: "Centrocampista Centrale" },
  { value: "COC", label: "Centrocampista Offensivo Centrale" },
  { value: "ES", label: "Esterno Sinistro" },
  { value: "ED", label: "Esterno Destro" },
  { value: "AS", label: "Attaccante Sinistro" },
  { value: "AD", label: "Attaccante Destro" },
  { value: "ATT", label: "Attaccante" }
];

export default function Censimento() {
  const [user, setUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    age: '',
    role: '',
    overall_rating: '',
    id_sofifa: ''
  });

  const [sofifaCheck, setSofifaCheck] = useState(null); // null | 'checking' | 'ok' | { name, status }

  const checkSofifaId = async (id) => {
    if (!id || String(id).trim().length < 4) { setSofifaCheck(null); return; }
    setSofifaCheck('checking');
    const { data } = await supabase
      .from('players')
      .select('first_name, last_name, status')
      .eq('id_sofifa', String(id).trim())
      .maybeSingle();
    if (data) {
      setSofifaCheck({ name: `${data.first_name} ${data.last_name}`, status: data.status });
    } else {
      setSofifaCheck('ok');
    }
  };

  const queryClient = useQueryClient();

  const calculateSalary = (overallRating) => {
    if (!overallRating) return 500000;
    const ovr = parseInt(overallRating);
    if (ovr >= 90) return 8000000;
    if (ovr >= 88) return 6000000;
    if (ovr >= 85) return 4000000;
    if (ovr >= 82) return 3000000;
    if (ovr >= 75) return 2000000;
    if (ovr >= 65) return 1000000;
    return 500000;
  };

  const calculatePlayerValue = (overall, age) => {
    if (!overall || overall < 40) return 500000;
    const ovr = parseInt(overall);
    const a = parseInt(age) || 25;
    const ageFactor = Math.max(1.0, Math.min(1.5, 1.0 + (28 - Math.min(a, 28)) * 0.1));
    // Overall 90+: 120M-150M
    if (ovr >= 90) return Math.min(150000000, (120000000 + (ovr - 90) * 10000000) * ageFactor);
    // Overall 85-89 giovani <25: 60M-100M
    if (ovr >= 85 && a < 25) {
      const yf = Math.max(1.0, Math.min(1.4, 1.0 + (25 - a) * 0.1));
      return Math.min(100000000, (60000000 + (ovr - 85) * 8000000) * yf);
    }
    // Overall 85+ senior: 50M-80M
    if (ovr >= 85) return Math.min(80000000, 50000000 + (ovr - 85) * 6000000);
    // Overall 80-84: 40M-60M
    if (ovr >= 80) return Math.min(60000000, (40000000 + (ovr - 80) * 4000000) * ageFactor);
    // Overall <80: fino a 40M
    return Math.min(Math.max(1000000 + (ovr - 60) * 1500000 + Math.max(0, 30 - a) * 300000, 500000), 40000000);
  };

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) { window.location.href = '/login'; return; }
        const { data } = await supabase.from('user_roles').select('*').eq('email', authUser.email).single();
        if (data) setUser(data);
        else window.location.href = '/login';
      } catch (e) {
        window.location.href = '/login';
      }
    };
    loadUser();
  }, []);

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: async () => { const { data } = await supabase.from('app_settings').select('*'); return data || []; }
  });

  const censimentoStatus = appSettings.find(s => s.key === 'censimento_status')?.value;
  const censimentoSessionName = appSettings.find(s => s.key === 'censimento_session_name')?.value || '';
  const censimentoClosed = censimentoStatus === 'closed';

  const { data: myPlayers = [] } = useQuery({
    queryKey: ['myRegisteredPlayers', user?.email],
    queryFn: async () => {
      if (!user?.email) return [];
      const { data } = await supabase.from('players').select('*').eq('created_by', user.email);
      return data || [];
    },
    enabled: !!user
  });

  const createPlayerMutation = useMutation({
    mutationFn: async (data) => {
      // Controllo duplicato ID SoFIFA
      if (data.id_sofifa) {
        const { data: existing, error: checkErr } = await supabase
          .from('players')
          .select('id, first_name, last_name, status')
          .eq('id_sofifa', String(data.id_sofifa).trim())
          .maybeSingle();

        if (checkErr) throw new Error('Errore verifica ID SoFIFA: ' + checkErr.message);

        if (existing) {
          const statusLabel = existing.status === 'pending' ? '(in attesa di approvazione)' : '(già approvato)';
          throw new Error(
            `ID SoFIFA già presente: ${existing.first_name} ${existing.last_name} ${statusLabel}. Non puoi registrare lo stesso giocatore due volte.`
          );
        }
      }

      const { data: player, error } = await supabase
        .from('players')
        .insert({ ...data, status: 'pending', created_by: user.email })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return player;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['myRegisteredPlayers'] });
      setShowForm(false);
      setFormData({ first_name: '', last_name: '', age: '', role: '', overall_rating: '', id_sofifa: '' });
      toast.success('Giocatore registrato! Sarà disponibile dopo l\'approvazione.');
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    if (!formData.first_name || !formData.last_name || !formData.role) {
      toast.error('Compila i campi obbligatori');
      return;
    }
    const overallRating = formData.overall_rating ? parseInt(formData.overall_rating) : undefined;
    const age = formData.age ? parseInt(formData.age) : undefined;
    const playerData = {
      first_name: formData.first_name,
      last_name: formData.last_name,
      age,
      role: formData.role,
      overall_rating: overallRating,
      salary: calculateSalary(overallRating),
      player_value: calculatePlayerValue(overallRating, age),
      id_sofifa: formData.id_sofifa || undefined,
      sofifa_link: formData.id_sofifa ? `https://sofifa.com/player/${formData.id_sofifa}` : undefined
    };
    await createPlayerMutation.mutateAsync(playerData);
  };

  const pendingCount = myPlayers.filter(p => p.status === 'pending').length;
  const approvedCount = myPlayers.filter(p => p.status === 'approved').length;

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Censimento Giocatori</h1>
          <p className="text-slate-500">Registra nuovi giocatori e guadagna dalla loro vendita</p>
        </div>
        <Button onClick={() => setShowForm(true)} disabled={censimentoClosed} className="gap-2">
          <UserPlus className="w-4 h-4" />
          Registra Giocatore
        </Button>
      </div>

      {censimentoClosed && (
        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-800 flex items-center gap-2">
          🔴 <strong>Censimento chiuso</strong> — non è possibile registrare nuovi giocatori al momento.
        </div>
      )}
      {censimentoSessionName && !censimentoClosed && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800">
          📋 Sessione attiva: <strong>{censimentoSessionName}</strong>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Totale Registrati</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-slate-800">{myPlayers.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">In Attesa</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-3xl font-bold text-amber-600">{pendingCount}</div>
              <Clock className="w-5 h-5 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600">Approvati</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-3xl font-bold text-emerald-600">{approvedCount}</div>
              <CheckCircle className="w-5 h-5 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-emerald-800">
            <TrendingUp className="w-5 h-5" />
            Come Funziona
          </CardTitle>
          <CardDescription className="text-emerald-700">
            Registra nuovi giocatori e guadagna dalla loro vendita all'asta
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-emerald-800">
          <p>• Registra un giocatore compilando il form</p>
          <p>• Il giocatore verrà inviato agli admin per l'approvazione</p>
          <p>• Una volta approvato, sarà disponibile per essere acquistato dai manager</p>
          <p>• Più giocatori di qualità registri, più contribuisci al gioco!</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>I Miei Giocatori Registrati</CardTitle>
        </CardHeader>
        <CardContent>
          {myPlayers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <UserPlus className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p>Non hai ancora registrato giocatori</p>
              <Button variant="outline" onClick={() => setShowForm(true)} className="mt-4">
                Registra il tuo primo giocatore
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {myPlayers.map((player) => (
                <div key={player.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-slate-50">
                  <div className="flex-1">
                    <h3 className="font-semibold text-slate-800">{player.first_name} {player.last_name}</h3>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline">{player.role}</Badge>
                      {player.overall_rating && (
                        <Badge className="bg-emerald-100 text-emerald-700">OVR {player.overall_rating}</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    {player.status === 'pending' ? (
                      <Badge className="bg-amber-100 text-amber-700">
                        <Clock className="w-3 h-3 mr-1" />In Attesa
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-700">
                        <CheckCircle className="w-3 h-3 mr-1" />Approvato
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registra Nuovo Giocatore</DialogTitle>
            <DialogDescription>
              Compila i dati del giocatore. Verrà automaticamente messo all'asta.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="first_name">Nome *</Label>
                <Input id="first_name" value={formData.first_name}
                  onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                  placeholder="Mario" required />
              </div>
              <div>
                <Label htmlFor="last_name">Cognome *</Label>
                <Input id="last_name" value={formData.last_name}
                  onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                  placeholder="Rossi" required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="age">Età</Label>
                <Input id="age" type="number" value={formData.age}
                  onChange={(e) => setFormData({...formData, age: e.target.value})} placeholder="25" />
              </div>
              <div>
                <Label htmlFor="role">Ruolo *</Label>
                <Select value={formData.role} onValueChange={(value) => setFormData({...formData, role: value})} required>
                  <SelectTrigger><SelectValue placeholder="Seleziona ruolo" /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((role) => (
                      <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="overall_rating">Overall Rating</Label>
              <Input id="overall_rating" type="number" min="1" max="99" value={formData.overall_rating}
                onChange={(e) => setFormData({...formData, overall_rating: e.target.value})} placeholder="75" />
            </div>
            <div>
              <Label htmlFor="id_sofifa">ID SoFIFA</Label>
              <Input id="id_sofifa" value={formData.id_sofifa}
                onChange={(e) => { setFormData({...formData, id_sofifa: e.target.value}); setSofifaCheck(null); }}
                onBlur={(e) => checkSofifaId(e.target.value)}
                placeholder="123456"
                className={sofifaCheck && sofifaCheck !== 'ok' && sofifaCheck !== 'checking' ? 'border-red-400' : ''}
              />
              {sofifaCheck === 'checking' && (
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Verifica in corso...
                </p>
              )}
              {sofifaCheck === 'ok' && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> ID disponibile
                </p>
              )}
              {sofifaCheck && sofifaCheck !== 'ok' && sofifaCheck !== 'checking' && (
                <p className="text-xs text-red-600 mt-1 font-medium">
                  ⛔ Già presente: <strong>{sofifaCheck.name}</strong>
                  {sofifaCheck.status === 'pending' ? ' (in attesa di approvazione)' : ' (approvato)'}
                </p>
              )}
              <p className="text-xs text-slate-500 mt-1">Genera automaticamente il link al profilo</p>
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>Annulla</Button>
              <Button type="button" onClick={handleSubmit}
                disabled={createPlayerMutation.isPending || (sofifaCheck && sofifaCheck !== 'ok' && sofifaCheck !== 'checking')}
                className="gap-2">
                {createPlayerMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Registrazione...</>
                ) : (
                  <><UserPlus className="w-4 h-4" />Registra Giocatore</>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
