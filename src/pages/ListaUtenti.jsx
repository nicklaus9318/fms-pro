import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Users, Search, MessageCircle, Phone } from 'lucide-react';
import { toast } from 'sonner';

export default function ListaUtenti() {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentUser, setCurrentUser] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setCurrentUser(userData);
      } catch (e) {
        console.log('User not logged in');
      }
    };
    loadUser();
  }, []);

  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const isAdmin = currentUser?.role === 'admin';

  // Carica tutti gli utenti da user_roles (include phone_number e full_name)
  const { data: allUsers = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
    enabled: isAdmin
  });

  // Update via email — più sicuro di user.id che potrebbe non corrispondere
  const updatePhoneMutation = useMutation({
    mutationFn: async ({ email, phoneNumber }) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ phone_number: phoneNumber })
        .eq('email', email);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Numero di telefono aggiornato');
    },
    onError: (e) => {
      toast.error('Errore aggiornamento: ' + e.message);
    }
  });

  // Mappa email → user
  const userMap = allUsers.reduce((acc, user) => {
    acc[user.email] = user;
    return acc;
  }, {});

  const handleWhatsAppClick = (team) => {
    const user = userMap[team.owner_email];
    const phoneNumber = user?.phone_number;
    if (!phoneNumber) {
      toast.error('Numero di telefono non disponibile per questo utente');
      return;
    }
    const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
    const message = encodeURIComponent(`Ciao! Ti contatto riguardo la tua squadra ${team.name}`);
    window.open(`https://wa.me/${cleanPhone}?text=${message}`, '_blank');
  };

  const filteredTeams = teams.filter(team =>
    team.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    team.owner_email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <Users className="w-8 h-8 text-emerald-600" />
            Lista Utenti
          </h1>
          <p className="text-slate-500 mt-1">Contatta i proprietari delle squadre</p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          placeholder="Cerca per nome squadra o email..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600 mx-auto" />
          <p className="text-slate-500 mt-4">Caricamento...</p>
        </div>
      ) : filteredTeams.length === 0 ? (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="py-12 text-center">
            <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Nessuna squadra trovata</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTeams.map((team) => {
            const user = userMap[team.owner_email];
            const hasPhone = !!user?.phone_number;

            return (
              <Card key={team.id} className="hover:shadow-lg transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    {team.logo_url ? (
                      <img
                        src={team.logo_url}
                        alt={team.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                        <span className="text-white font-bold text-lg">
                          {team.name.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-lg truncate">{team.name}</CardTitle>
                      <p className="text-xs text-slate-500 truncate mt-1">
                        {user?.full_name || team.owner_email}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Solo admin vede e modifica il telefono */}
                  {isAdmin && (
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        Numero di telefono
                      </label>
                      <Input
                        type="tel"
                        placeholder="+39 123 456 7890"
                        defaultValue={user?.phone_number || ''}
                        onBlur={(e) => {
                          const newPhone = e.target.value.trim();
                          const oldPhone = user?.phone_number || '';
                          // Aggiorna solo se il valore è cambiato e abbiamo un'email
                          if (newPhone !== oldPhone && team.owner_email) {
                            updatePhoneMutation.mutate({
                              email: team.owner_email,  // ← usa email, non user.id
                              phoneNumber: newPhone,
                            });
                          }
                        }}
                        className="text-sm"
                      />
                      {!user && (
                        <p className="text-xs text-amber-600">
                          ⚠️ Utente non registrato nel sistema
                        </p>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={() => handleWhatsAppClick(team)}
                    disabled={!hasPhone}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300"
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    {hasPhone ? 'Contatta su WhatsApp' : 'Numero non disponibile'}
                  </Button>

                  {team.owner_email && (
                    <p className="text-xs text-slate-400 text-center truncate">
                      {team.owner_email}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="py-4">
          <p className="text-sm text-blue-800">
            <strong>Nota:</strong> Per poter contattare un utente su WhatsApp, il proprietario della squadra deve aver inserito il proprio numero di telefono nel profilo.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
