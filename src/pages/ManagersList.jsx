import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Euro, MessageCircle, Mail, Phone, Search, Shield, Trash2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from 'sonner';

export default function ManagersList() {
  const [user, setUser] = useState(null);
  const [search, setSearch] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {}
    };
    loadUser();
  }, []);

  const isAdmin = user?.role === 'admin';

  // Carica utenti SOLO da user_roles (tabella corretta — 'users' non esiste)
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data: roles, error } = await supabase.from('user_roles').select('*');
      if (error) throw error;
      return (roles || []).map(r => ({
        id: r.id,
        email: r.email,
        full_name: r.full_name || r.email,
        role: r.role,
        phone: r.phone_number || null,  // colonna corretta: phone_number
      }));
    }
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ email, role }) => {
      const { error } = await supabase
        .from('user_roles')
        .upsert({ email, role }, { onConflict: 'email' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('Ruolo aggiornato con successo');
    },
    onError: () => toast.error('Errore aggiornamento ruolo')
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (email) => {
      const { error } = await supabase.from('user_roles').delete().eq('email', email);
      if (error) throw error;
      // Rimuovi l'owner_email dalla squadra eventualmente assegnata
      await supabase.from('teams').update({ owner_email: null }).eq('owner_email', email);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Utente eliminato');
    },
    onError: () => toast.error('Errore eliminazione utente')
  });

  const assignTeamMutation = useMutation({
    mutationFn: async ({ teamId, userEmail }) => {
      const oldTeam = teams.find(t => t.owner_email === userEmail);
      if (oldTeam) await base44.entities.Team.update(oldTeam.id, { owner_email: null });
      if (teamId) await base44.entities.Team.update(teamId, { owner_email: userEmail });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      toast.success('Squadra assegnata con successo');
    },
    onError: () => toast.error("Errore nell'assegnazione della squadra")
  });

  const formatBudget = (budget) => {
    if (!budget) return '€0';
    if (budget >= 1000000) return `€${(budget / 1000000).toFixed(1)}M`;
    if (budget >= 1000) return `€${(budget / 1000).toFixed(0)}K`;
    return `€${budget}`;
  };

  const getUserTeam = (email) => teams.find(t => t.owner_email === email);

  const getWhatsAppLink = (phone, userName, teamName) => {
    if (!phone) return null;
    const cleanPhone = phone.replace(/[^0-9+]/g, '');
    const message = encodeURIComponent(`Ciao ${userName}, sono l'admin della lega!`);
    return `https://wa.me/${cleanPhone}?text=${message}`;
  };

  const filteredUsers = users.filter(u => {
    if (!search) return true;
    const s = search.toLowerCase();
    return u.full_name?.toLowerCase().includes(s) ||
      u.email?.toLowerCase().includes(s) ||
      getUserTeam(u.email)?.name?.toLowerCase().includes(s);
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Anagrafica Manager</h1>
          <p className="text-slate-500">{filteredUsers.length} manager registrati</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Cerca per nome, email o squadra..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Desktop Table */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-500" />
            Lista Completa Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Manager</TableHead>
                <TableHead>Squadra</TableHead>
                <TableHead>Budget</TableHead>
                <TableHead>Ruolo</TableHead>
                <TableHead>Contatti</TableHead>
                {isAdmin && <TableHead>Assegna Squadra</TableHead>}
                {isAdmin && <TableHead>Cambia Ruolo</TableHead>}
                {isAdmin && <TableHead>Elimina</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map(manager => {
                const team = getUserTeam(manager.email);
                const whatsappLink = getWhatsAppLink(manager.phone, manager.full_name, team?.name);
                return (
                  <TableRow key={manager.id || manager.email}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-slate-800">{manager.full_name}</p>
                        <p className="text-sm text-slate-500">{manager.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {team ? (
                        <div className="flex items-center gap-2">
                          {team.logo_url && <img src={team.logo_url} alt={team.name} className="w-8 h-8 rounded-lg" />}
                          <span className="font-medium">{team.name}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Nessuna squadra</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Euro className="w-4 h-4 text-emerald-500" />
                        <span className="font-semibold">{formatBudget(team?.budget)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={manager.role === 'admin' ? 'default' : 'secondary'}>
                        {manager.role === 'admin' ? <><Shield className="w-3 h-3 mr-1" />Admin</> : manager.role === 'controller' ? '🔍 Controllore' : 'User'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`mailto:${manager.email}`}><Mail className="w-4 h-4 text-slate-500" /></a>
                        </Button>
                        {whatsappLink && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                              <MessageCircle className="w-4 h-4 text-green-600" />
                            </a>
                          </Button>
                        )}
                        {manager.phone && (
                          <Button variant="ghost" size="sm" asChild>
                            <a href={`tel:${manager.phone}`}><Phone className="w-4 h-4 text-blue-500" /></a>
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <Select
                          value={team?.id || ''}
                          onValueChange={(value) => assignTeamMutation.mutate({ teamId: value === 'none' ? null : value, userEmail: manager.email })}
                        >
                          <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="Seleziona squadra" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nessuna squadra</SelectItem>
                            {teams.map(t => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    {isAdmin && (
                      <TableCell>
                        <Select
                          value={manager.role || 'user'}
                          onValueChange={(role) => changeRoleMutation.mutate({ email: manager.email, role })}
                        >
                          <SelectTrigger className="w-[120px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">👤 User</SelectItem>
                            <SelectItem value="admin">🔐 Admin</SelectItem>
                            <SelectItem value="controller">🔍 Controllore</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    {isAdmin && (
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Eliminare ${manager.email}?`)) {
                              deleteUserMutation.mutate(manager.email);
                            }
                          }}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile Cards */}
      <div className="grid md:hidden gap-4">
        {filteredUsers.map(manager => {
          const team = getUserTeam(manager.email);
          const whatsappLink = getWhatsAppLink(manager.phone, manager.full_name, team?.name);
          return (
            <Card key={manager.id || manager.email} className="bg-white">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-slate-800">{manager.full_name}</p>
                    <p className="text-sm text-slate-500">{manager.email}</p>
                  </div>
                  <Badge variant={manager.role === 'admin' ? 'default' : 'secondary'}>
                    {manager.role === 'admin' ? 'Admin' : manager.role === 'controller' ? 'Controllore' : 'User'}
                  </Badge>
                </div>
                {team && (
                  <div className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                    {team.logo_url && <img src={team.logo_url} alt={team.name} className="w-10 h-10 rounded-lg" />}
                    <div>
                      <p className="text-sm font-medium">{team.name}</p>
                      <div className="flex items-center gap-1 text-emerald-600">
                        <Euro className="w-3 h-3" />
                        <span className="text-xs font-semibold">{formatBudget(team.budget)}</span>
                      </div>
                    </div>
                  </div>
                )}
                {isAdmin && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Assegna squadra</label>
                      <Select
                        value={team?.id || ''}
                        onValueChange={(value) => assignTeamMutation.mutate({ teamId: value === 'none' ? null : value, userEmail: manager.email })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleziona squadra" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nessuna squadra</SelectItem>
                          {teams.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Ruolo</label>
                      <Select
                        value={manager.role || 'user'}
                        onValueChange={(role) => changeRoleMutation.mutate({ email: manager.email, role })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="user">👤 User</SelectItem>
                          <SelectItem value="admin">🔐 Admin</SelectItem>
                          <SelectItem value="controller">🔍 Controllore</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" asChild>
                    <a href={`mailto:${manager.email}`}><Mail className="w-4 h-4 mr-2" />Email</a>
                  </Button>
                  {whatsappLink && (
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <a href={whatsappLink} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="w-4 h-4 mr-2 text-green-600" />WhatsApp
                      </a>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
