import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { User, Mail, Shield, Trophy, Users, Euro, Phone, Lock, Eye, EyeOff, History, Gavel, ArrowRightLeft, UserMinus } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from '@/api/supabaseClient';
import { toast } from 'sonner';
import DepartmentAverages from '@/components/dashboard/DepartmentAverages';

export default function Profile() {
  const [user, setUser] = useState(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        setPhoneNumber(userData.phone_number || '');
      } catch (e) {
        base44.auth.redirectToLogin();
      }
    };
    loadUser();
  }, []);

  const updatePhoneMutation = useMutation({
    mutationFn: async (phone) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ phone_number: phone })
        .eq('email', user.email);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      // Aggiorna lo stato locale
      setUser(prev => ({ ...prev, phone_number: phoneNumber }));
      toast.success('Numero di telefono aggiornato');
    },
    onError: (e) => {
      toast.error('Errore: ' + e.message);
    }
  });

  const handlePhoneUpdate = () => {
    if (phoneNumber !== (user.phone_number || '')) {
      updatePhoneMutation.mutate(phoneNumber);
    }
  };

  const handlePasswordUpdate = async () => {
    if (!newPassword) { toast.error('Inserisci la nuova password'); return; }
    if (newPassword.length < 6) { toast.error('La password deve essere di almeno 6 caratteri'); return; }
    if (newPassword !== confirmPassword) { toast.error('Le password non coincidono'); return; }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success('Password aggiornata con successo');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      toast.error('Errore: ' + e.message);
    }
    setSavingPassword(false);
  };

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const { data: players = [] } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.filter({ status: 'approved' })
  });

  const myTeam = teams.find(t => t.owner_email === user?.email);

  const { data: allAuctions = [] } = useQuery({
    queryKey: ['myAuctions', myTeam?.id],
    queryFn: () => base44.entities.Auction.list('-created_date'),
    enabled: !!myTeam
  });

  const { data: allBids = [] } = useQuery({
    queryKey: ['myBidsHistory', myTeam?.id],
    queryFn: () => base44.entities.Bid.filter({ team_id: myTeam?.id }),
    enabled: !!myTeam
  });

  const { data: allTransfers = [] } = useQuery({
    queryKey: ['myTransfers', myTeam?.id],
    queryFn: () => base44.entities.Transfer.list('-created_date'),
    enabled: !!myTeam
  });

  const myPlayers = players.filter(p => p.team_id === myTeam?.id);

  const formatBudget = (budget) => {
    if (!budget) return '€0';
    if (budget >= 1000000) return `€${(budget / 1000000).toFixed(1)}M`;
    if (budget >= 1000) return `€${(budget / 1000).toFixed(0)}K`;
    return `€${budget}`;
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Profilo</h1>
        <p className="text-slate-500">Le tue informazioni personali</p>
      </div>

      {/* User Info Card */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle>Informazioni Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
              <span className="text-2xl font-bold text-white">
                {user.full_name?.charAt(0) || user.email?.charAt(0)}
              </span>
            </div>
            <div>
              <h3 className="text-xl font-semibold text-slate-800">{user.full_name || 'Utente'}</h3>
              <Badge variant="outline" className={user.role === 'admin' ? 'bg-amber-50 text-amber-700 border-amber-200' : ''}>
                {user.role === 'admin' ? 'Amministratore' : 'Utente'}
              </Badge>
            </div>
          </div>

          <div className="grid gap-4 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <Mail className="w-5 h-5 text-slate-400" />
              <span className="text-slate-600">{user.email}</span>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-600 flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Numero di telefono
              </label>
              <div className="flex gap-2">
                <Input
                  type="tel"
                  placeholder="+39 123 456 7890"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  className="flex-1"
                />
                <Button 
                  onClick={handlePhoneUpdate}
                  disabled={updatePhoneMutation.isPending || phoneNumber === (user.phone_number || '')}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {updatePhoneMutation.isPending ? 'Salvataggio...' : 'Salva'}
                </Button>
              </div>
              <p className="text-xs text-slate-500">
                Inserisci il tuo numero con prefisso internazionale (es: +39 per l'Italia)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cambio Password */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-slate-500" />
            Cambia Password
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600">Nuova Password</label>
            <div className="relative">
              <Input
                type={showPasswords ? 'text' : 'password'}
                placeholder="Minimo 6 caratteri"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPasswords ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600">Conferma Password</label>
            <Input
              type={showPasswords ? 'text' : 'password'}
              placeholder="Ripeti la nuova password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-rose-600">Le password non coincidono</p>
          )}
          <Button
            onClick={handlePasswordUpdate}
            disabled={savingPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
            className="w-full bg-slate-700 hover:bg-slate-800"
          >
            {savingPassword ? 'Aggiornamento...' : 'Aggiorna Password'}
          </Button>
        </CardContent>
      </Card>

      {/* My Team */}
      {myTeam ? (
        <>
          <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-32 translate-x-32" />
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                {myTeam.logo_url ? (
                  <img src={myTeam.logo_url} alt={myTeam.name} className="w-16 h-16 rounded-xl object-cover" />
                ) : (
                  <div 
                    className="w-16 h-16 rounded-xl flex items-center justify-center bg-white/20"
                  >
                    <Shield className="w-8 h-8 text-white" />
                  </div>
                )}
                <div>
                  <p className="text-emerald-100 text-sm">La mia squadra</p>
                  <h2 className="text-2xl font-bold">{myTeam.name}</h2>
                </div>
              </div>
              
              <div className="flex items-center gap-6 mt-6">
                <div className="flex items-center gap-2">
                  <Euro className="w-5 h-5 text-emerald-200" />
                  <span className="text-xl font-bold">{formatBudget(myTeam.budget)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Users className="w-5 h-5 text-emerald-200" />
                  <span>{myPlayers.length} giocatori</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Team Stats */}
          <DepartmentAverages players={myPlayers} />

          {/* Team Roster Preview */}
          <Card className="bg-white border-0 shadow-sm">
            <CardHeader>
              <CardTitle>Rosa Squadra</CardTitle>
            </CardHeader>
            <CardContent>
              {myPlayers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {myPlayers.map(player => (
                    <div key={player.id} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
                      <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                        <span className="text-sm font-medium text-slate-600">
                          {player.first_name?.[0]}{player.last_name?.[0]}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {player.first_name} {player.last_name}
                        </p>
                        <p className="text-xs text-slate-500">{player.role}</p>
                      </div>
                      {player.overall_rating && (
                        <span className="text-sm font-bold text-emerald-600">{player.overall_rating}</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-slate-500 py-4">Nessun giocatore in rosa</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="py-12 text-center">
            <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Non hai ancora una squadra associata</p>
            <p className="text-sm text-slate-400 mt-1">Contatta un amministratore per essere assegnato a una squadra</p>
          </CardContent>
        </Card>
      )}

      {/* Storico Operazioni */}
      {myTeam && (
        <Card className="bg-white border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-slate-500" />
              Storico Operazioni di Mercato
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="aste">
              <TabsList className="w-full">
                <TabsTrigger value="aste" className="flex-1">
                  <Gavel className="w-4 h-4 mr-1" />Aste
                </TabsTrigger>
                <TabsTrigger value="trasferimenti" className="flex-1">
                  <ArrowRightLeft className="w-4 h-4 mr-1" />Trasferimenti
                </TabsTrigger>
                <TabsTrigger value="svincoli" className="flex-1">
                  <UserMinus className="w-4 h-4 mr-1" />Svincoli
                </TabsTrigger>
              </TabsList>

              {/* ASTE */}
              <TabsContent value="aste" className="mt-4 space-y-2">
                {(() => {
                  const myWonAuctions = allAuctions
                    .filter(a => a.current_winner_team_id === myTeam.id || 
                      allBids.some(b => b.auction_id === a.id && b.is_winning))
                    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
                  return myWonAuctions.length === 0 ? (
                    <p className="text-center text-slate-400 py-6 text-sm">Nessuna asta vinta</p>
                  ) : myWonAuctions.map(auction => {
                    const bid = allBids.find(b => b.auction_id === auction.id);
                    return (
                      <div key={auction.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border">
                        <div>
                          <p className="font-medium text-slate-800">{auction.player_name}</p>
                          <p className="text-xs text-slate-500">
                            {auction.auction_session_name && <span className="mr-2">📋 {auction.auction_session_name}</span>}
                            {auction.created_date && new Date(auction.created_date).toLocaleDateString('it-IT')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-600">€{((bid?.amount || 0) / 1000000).toFixed(2)}M</p>
                          <Badge className="bg-emerald-100 text-emerald-700 text-xs">Vinta</Badge>
                        </div>
                      </div>
                    );
                  });
                })()}
              </TabsContent>

              {/* TRASFERIMENTI */}
              <TabsContent value="trasferimenti" className="mt-4 space-y-2">
                {(() => {
                  const myTransfers = allTransfers
                    .filter(t => t.to_team_id === myTeam.id || t.from_team_id === myTeam.id)
                    .filter(t => t.type === 'purchase' || t.type === 'loan')
                    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
                  return myTransfers.length === 0 ? (
                    <p className="text-center text-slate-400 py-6 text-sm">Nessun trasferimento</p>
                  ) : myTransfers.map(transfer => {
                    const isIncoming = transfer.to_team_id === myTeam.id;
                    const playerIds = transfer.player_ids_out || [];
                    const playerNames = playerIds.map(id => {
                      const p = players.find(pl => pl.id === id);
                      return p ? `${p.first_name} ${p.last_name}` : id;
                    }).join(', ');
                    return (
                      <div key={transfer.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border">
                        <div>
                          <p className="font-medium text-slate-800">{playerNames || 'Giocatore'}</p>
                          <p className="text-xs text-slate-500">
                            {transfer.created_date && new Date(transfer.created_date).toLocaleDateString('it-IT')}
                          </p>
                        </div>
                        <div className="text-right space-y-1">
                          {transfer.amount > 0 && (
                            <p className="font-bold text-slate-700">€{(transfer.amount / 1000000).toFixed(2)}M</p>
                          )}
                          <Badge className={`text-xs ${
                            transfer.type === 'loan' ? 'bg-blue-100 text-blue-700' :
                            isIncoming ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                          }`}>
                            {transfer.type === 'loan' ? '🤝 Prestito' : isIncoming ? '📥 Acquisto' : '📤 Cessione'}
                          </Badge>
                        </div>
                      </div>
                    );
                  });
                })()}
              </TabsContent>

              {/* SVINCOLI */}
              <TabsContent value="svincoli" className="mt-4 space-y-2">
                {(() => {
                  const myReleases = allTransfers
                    .filter(t => t.from_team_id === myTeam.id && t.type === 'release')
                    .sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
                  return myReleases.length === 0 ? (
                    <p className="text-center text-slate-400 py-6 text-sm">Nessun svincolo</p>
                  ) : myReleases.map(transfer => {
                    const playerIds = transfer.player_ids_out || [];
                    const playerNames = playerIds.map(id => {
                      const p = players.find(pl => pl.id === id);
                      return p ? `${p.first_name} ${p.last_name}` : id;
                    }).join(', ');
                    return (
                      <div key={transfer.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border">
                        <div>
                          <p className="font-medium text-slate-800">{playerNames || 'Giocatore'}</p>
                          <p className="text-xs text-slate-500">
                            {transfer.created_date && new Date(transfer.created_date).toLocaleDateString('it-IT')}
                          </p>
                        </div>
                        <div className="text-right">
                          {transfer.amount > 0 && (
                            <p className="font-bold text-emerald-600">+€{(transfer.amount / 1000000).toFixed(2)}M</p>
                          )}
                          <Badge className="bg-slate-100 text-slate-600 text-xs">Svincolato</Badge>
                        </div>
                      </div>
                    );
                  });
                })()}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Logout Button */}
      <div className="pt-4">
        <Button 
          variant="outline" 
          className="text-rose-600 border-rose-200 hover:bg-rose-50"
          onClick={() => base44.auth.logout()}
        >
          Esci dall'account
        </Button>
      </div>
    </div>
  );
}