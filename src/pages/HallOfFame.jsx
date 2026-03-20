import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trophy, Target, Medal, Award, Star, Loader2, Trash2, Upload } from 'lucide-react';
import { supabase } from '@/api/supabaseClient';
import { compressImage } from '@/lib/r2Client';
import { toast } from 'sonner';

export default function HallOfFame() {
  const [user, setUser] = useState(null);
  const [showAwardForm, setShowAwardForm] = useState(false);
  const [formData, setFormData] = useState({
    season: '',
    award_type: 'championship',
    winner_type: 'team',
    winner_id: '',
    trophy_name: '',
  });
  const [loading, setLoading] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [iconUrl, setIconUrl] = useState('');

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {
        base44.auth.redirectToLogin();
      }
    };
    loadUser();
  }, []);

  const isAdmin = user?.role === 'admin';

  const { data: awards = [] } = useQuery({
    queryKey: ['hallOfFame'],
    queryFn: () => base44.entities.HallOfFame.list('-created_date')
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const { data: players = [] } = useQuery({
    queryKey: ['players'],
    queryFn: () => base44.entities.Player.filter({ status: 'approved' })
  });

  const { data: leagues = [] } = useQuery({
    queryKey: ['leagues'],
    queryFn: () => base44.entities.League.list()
  });

  const createAwardMutation = useMutation({
    mutationFn: (data) => base44.entities.HallOfFame.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hallOfFame'] });
      toast.success('Premio aggiunto all\'Albo d\'Oro');
      setShowAwardForm(false);
      setIconUrl('');
      resetForm();
    },
    onError: (e) => {
      toast.error('Errore: ' + e.message);
      setLoading(false);
    }
  });

  const deleteAwardMutation = useMutation({
    mutationFn: (id) => base44.entities.HallOfFame.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hallOfFame'] });
      toast.success('Premio eliminato');
    }
  });

  const handleDelete = async (awardId, awardName) => {
    if (window.confirm(`Sei sicuro di voler eliminare il premio "${awardName}"?`)) {
      await deleteAwardMutation.mutateAsync(awardId);
    }
  };

  const resetForm = () => {
    setIconUrl('');
    setFormData({
      season: '',
      award_type: 'championship',
      winner_type: 'team',
      winner_id: '',
      trophy_name: '',
    });
  };

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setLoading(true);

    const winner = formData.winner_type === 'team' 
      ? teams.find(t => t.id === formData.winner_id)
      : players.find(p => p.id === formData.winner_id);

    const winnerName = formData.winner_type === 'team'
      ? winner?.name
      : `${winner?.first_name} ${winner?.last_name}`;

    await createAwardMutation.mutateAsync({
      season: formData.season,
      award_type: formData.award_type,
      winner_type: formData.winner_type,
      winner_id: formData.winner_id,
      winner_name: winnerName || 'Sconosciuto',
      trophy_name: formData.trophy_name,
      icon_url: iconUrl || null,
    });

    setLoading(false);
  };

  const handleIconUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      const compressed = await compressImage(file, { maxWidth: 200, maxHeight: 200, quality: 0.8 });
      const fileName = `hall-of-fame/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('backgrounds').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('backgrounds').getPublicUrl(fileName);
      setIconUrl(publicUrl);
      toast.success('Icona caricata');
    } catch (err) {
      toast.error('Errore upload: ' + err.message);
    }
    setUploadingIcon(false);
    e.target.value = '';
  };

  const awardTypeLabels = {
    championship: { label: 'Campionato', icon: Trophy, color: 'text-amber-500' },
    cup: { label: 'Coppa', icon: Award, color: 'text-blue-500' },
    top_scorer: { label: 'Capocannoniere', icon: Target, color: 'text-rose-500' },
    top_assists: { label: 'Miglior Assistman', icon: Medal, color: 'text-purple-500' },
    mvp: { label: 'Pallone d\'Oro', icon: Star, color: 'text-amber-600' }
  };

  const groupedAwards = awards.reduce((acc, award) => {
    if (!acc[award.season]) acc[award.season] = [];
    acc[award.season].push(award);
    return acc;
  }, {});

  const seasons = Object.keys(groupedAwards).sort().reverse();

  const winners = formData.winner_type === 'team' ? teams : players;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Albo d'Oro</h1>
          <p className="text-slate-500">Trofei e premi delle stagioni passate</p>
        </div>
        {isAdmin && (
          <Button 
            onClick={() => setShowAwardForm(true)}
            className="bg-amber-600 hover:bg-amber-700 gap-2"
          >
            <Trophy className="w-4 h-4" />
            Aggiungi Premio
          </Button>
        )}
      </div>

      {/* Awards by Season */}
      {seasons.length > 0 ? (
        <div className="space-y-8">
          {seasons.map(season => {
            const seasonAwards = groupedAwards[season];
            return (
              <Card key={season} className="overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-amber-500 to-amber-600 text-white">
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-6 h-6" />
                    Stagione {season}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {seasonAwards.map(award => {
                      const config = awardTypeLabels[award.award_type];
                      const Icon = config.icon;
                      const winnerTeam = teams.find(t => t.id === award.winner_id || t.name === award.winner_name);
                      const ownerEmail = winnerTeam?.owner_email || '';

                      return (
                        <Card key={award.id} className="border-0 shadow-lg hover:shadow-xl transition-all relative group overflow-hidden">
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity text-rose-600 hover:text-rose-700 hover:bg-rose-50 w-7 h-7"
                              onClick={() => handleDelete(award.id, `${config.label} - ${award.winner_name}`)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                          <CardContent className="p-0">
                            {/* Foto trofeo */}
                            <div className={`flex items-center justify-center py-6 bg-gradient-to-br from-amber-50 to-amber-100`}>
                              {award.icon_url ? (
                                <img src={award.icon_url} alt={config.label}
                                  className="w-24 h-24 object-contain drop-shadow-lg" />
                              ) : (
                                <div className={`w-24 h-24 rounded-full flex items-center justify-center bg-white shadow-md ${config.color}`}>
                                  <Icon className="w-12 h-12" />
                                </div>
                              )}
                            </div>

                            {/* Info */}
                            <div className="p-4 text-center space-y-2">
                              {/* Nome trofeo */}
                              <h4 className="font-bold text-slate-800 text-base">{award.trophy_name || config.label}</h4>

                              {/* Squadra vincente */}
                              <div className="flex items-center justify-center gap-2">
                                {winnerTeam?.logo_url && (
                                  <img src={winnerTeam.logo_url} alt={winnerTeam.name}
                                    className="w-6 h-6 rounded-full object-cover" />
                                )}
                                <p className="font-bold text-amber-700 text-lg">{award.winner_name}</p>
                              </div>

                              {/* Utente/owner */}
                              {ownerEmail && (
                                <p className="text-xs text-slate-500">👤 {ownerEmail}</p>
                              )}

                              {/* Stagione */}
                              <div className="inline-block bg-slate-100 rounded-full px-3 py-1">
                                <p className="text-xs font-semibold text-slate-600">📅 Stagione {award.season}</p>
                              </div>

                              {/* Stats opzionali */}
                              {award.stats?.value && (
                                <p className="text-sm text-slate-600">
                                  {award.stats.value} {award.stats.description || ''}
                                </p>
                              )}
                              {award.notes && (
                                <p className="text-xs text-slate-400 italic">{award.notes}</p>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="py-16 text-center">
            <Trophy className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg">Nessun premio assegnato</p>
            {isAdmin && (
              <p className="text-sm text-slate-400 mt-2">
                Inizia ad aggiungere i vincitori dell'Albo d'Oro
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Award Form */}
      {isAdmin && (
        <Dialog open={showAwardForm} onOpenChange={setShowAwardForm}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Aggiungi Premio</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* 1. Nome trofeo */}
              <div className="space-y-2">
                <Label>Nome Trofeo *</Label>
                <Input
                  value={formData.trophy_name}
                  onChange={(e) => setFormData({ ...formData, trophy_name: e.target.value })}
                  placeholder="Es: Serie A, Coppa Italia, Pallone d'Oro..."
                  required
                />
              </div>

              {/* 2. Squadra vincente */}
              <div className="space-y-2">
                <Label>Squadra Vincente *</Label>
                <Select
                  value={formData.winner_id}
                  onValueChange={(v) => setFormData({ ...formData, winner_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona squadra" />
                  </SelectTrigger>
                  <SelectContent>
                    {teams.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        <span className="font-medium">{t.name}</span>
                        {t.owner_email && <span className="text-slate-400 ml-2 text-xs">({t.owner_email})</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* 3. Stagione */}
              <div className="space-y-2">
                <Label>Stagione *</Label>
                <Input
                  value={formData.season}
                  onChange={(e) => setFormData({ ...formData, season: e.target.value })}
                  placeholder="2024/2025"
                  required
                />
              </div>

              {/* Upload icona competizione */}
              <div className="space-y-2">
                <Label>Icona Competizione</Label>
                <div className="flex items-center gap-3">
                  {iconUrl && (
                    <img src={iconUrl} alt="Icona" className="w-10 h-10 rounded-full object-cover border" />
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleIconUpload}
                    className="hidden"
                    id="icon-upload"
                    disabled={uploadingIcon}
                  />
                  <label htmlFor="icon-upload" className="flex-1">
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full cursor-pointer"
                      disabled={uploadingIcon}
                      asChild
                    >
                      <span>
                        {uploadingIcon
                          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Caricamento...</>
                          : <><Upload className="w-4 h-4 mr-2" />{iconUrl ? 'Cambia icona' : 'Carica icona trofeo'}</>
                        }
                      </span>
                    </Button>
                  </label>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAwardForm(false)}>
                  Annulla
                </Button>
                <Button type="button" onClick={handleSubmit} disabled={loading} className="bg-amber-600 hover:bg-amber-700">
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Aggiungi
                </Button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}