import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const ROLES = [
  { value: 'POR', label: 'Portiere' },
  { value: 'DC', label: 'Difensore Centrale' },
  { value: 'TS', label: 'Terzino Sinistro' },
  { value: 'TD', label: 'Terzino Destro' },
  { value: 'CDC', label: 'Centrocampista Difensivo' },
  { value: 'CC', label: 'Centrocampista Centrale' },
  { value: 'COC', label: 'Centrocampista Offensivo' },
  { value: 'ES', label: 'Esterno Sinistro' },
  { value: 'ED', label: 'Esterno Destro' },
  { value: 'AS', label: 'Ala Sinistra' },
  { value: 'AD', label: 'Ala Destra' },
  { value: 'ATT', label: 'Attaccante' },
];

export default function PlayerEditModal({ open, onClose, player, teams, onSave, isAdmin }) {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    age: '',
    role: 'ATT',
    salary: '',
    overall_rating: '',
    id_sofifa: '',
    sofifa_link: '',
    team_id: '',
    player_status: 'available',
    suspension_end_date: '',
    injury_end_date: '',
    lotto_number: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (player) {
      setFormData({
        first_name: player.first_name || '',
        last_name: player.last_name || '',
        age: player.age || '',
        role: player.role || 'ATT',
        salary: player.salary || '',
        overall_rating: player.overall_rating || '',
        id_sofifa: player.id_sofifa || '',
        sofifa_link: player.sofifa_link || '',
        team_id: player.team_id || '',
        player_status: player.player_status || 'available',
        suspension_end_date: player.suspension_end_date || '',
        injury_end_date: player.injury_end_date || '',
        lotto_number: player.lotto_number || ''
      });
    }
  }, [player]);

  const extractSoFIFAId = (link) => {
    if (!link) return null;
    const match = link.match(/\/player\/(\d+)/);
    return match ? match[1] : null;
  };

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setLoading(true);
    
    try {
      const extractedId = extractSoFIFAId(formData.sofifa_link);
      
      // Manda solo i campi che esistono nel DB, converti stringhe vuote in null
      const dataToSave = {
        first_name: formData.first_name || null,
        last_name: formData.last_name || null,
        age: formData.age ? parseInt(formData.age) : null,
        role: formData.role || null,
        salary: formData.salary ? parseFloat(formData.salary) : null,
        overall_rating: formData.overall_rating ? parseInt(formData.overall_rating) : null,
        id_sofifa: extractedId || formData.id_sofifa || null,
        sofifa_link: formData.id_sofifa ? `https://sofifa.com/player/${formData.id_sofifa}` : (formData.sofifa_link || null),
        team_id: formData.team_id || null,
        player_status: formData.player_status || 'available',
        suspension_end_date: formData.suspension_end_date || null,
        injury_end_date: formData.injury_end_date || null,
        lotto_number: formData.lotto_number ? parseInt(formData.lotto_number) : null,
      };
      
      await onSave(dataToSave);
      toast.success('Giocatore aggiornato');
      onClose();
    } catch (error) {
      toast.error('Errore durante il salvataggio');
    }
    
    setLoading(false);
  };

  const handleQuickMove = async (teamId) => {
    setLoading(true);
    try {
      const dataToSave = {
        age: formData.age ? parseInt(formData.age) : null,
        salary: formData.salary ? parseFloat(formData.salary) : null,
        overall_rating: formData.overall_rating ? parseInt(formData.overall_rating) : null,
        lotto_number: formData.lotto_number ? parseInt(formData.lotto_number) : null,
        team_id: teamId,
        first_name: formData.first_name,
        last_name: formData.last_name,
        role: formData.role,
        id_sofifa: formData.id_sofifa || null,
        sofifa_link: formData.sofifa_link || null,
        player_status: formData.player_status,
        suspension_end_date: formData.suspension_end_date || null,
        injury_end_date: formData.injury_end_date || null
      };
      await onSave(dataToSave);
      toast.success('Giocatore spostato');
      onClose();
    } catch (error) {
      toast.error('Errore durante lo spostamento');
    }
    setLoading(false);
  };

  const maggioreTeams = teams.filter(t => t.team_type === 'maggiore' || (!t.team_type && !t.name.toLowerCase().includes('primavera')));
  const primaveraTeams = teams.filter(t => t.team_type === 'primavera' || t.name.toLowerCase().includes('primavera'));

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Modifica Giocatore</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome *</Label>
              <Input
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Cognome *</Label>
              <Input
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>Età</Label>
              <Input
                type="number"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Overall</Label>
              <Input
                type="number"
                min="1"
                max="99"
                value={formData.overall_rating}
                onChange={(e) => setFormData({ ...formData, overall_rating: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Stipendio</Label>
              <Input
                type="number"
                value={formData.salary}
                onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>N° Lotto</Label>
              <Input
                type="number"
                min="1"
                max="90"
                value={formData.lotto_number}
                onChange={(e) => setFormData({ ...formData, lotto_number: e.target.value })}
                placeholder="1-90"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Ruolo *</Label>
              <Select value={formData.role} onValueChange={(v) => setFormData({ ...formData, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map(role => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Link SoFIFA</Label>
              <Input
                value={formData.sofifa_link}
                onChange={(e) => setFormData({ ...formData, sofifa_link: e.target.value })}
                placeholder="https://sofifa.com/player/192985"
              />
              {formData.sofifa_link && extractSoFIFAId(formData.sofifa_link) && (
                <p className="text-xs text-emerald-600">
                  ID estratto: {extractSoFIFAId(formData.sofifa_link)}
                </p>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label>Stato Giocatore</Label>
            <Select 
              value={formData.player_status} 
              onValueChange={(v) => setFormData({ ...formData, player_status: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="available">Disponibile</SelectItem>
                <SelectItem value="injured">Infortunato</SelectItem>
                <SelectItem value="suspended">Squalificato</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.player_status === 'injured' && (
            <div className="space-y-2">
              <Label>Fine Infortunio</Label>
              <Input
                type="date"
                value={formData.injury_end_date}
                onChange={(e) => setFormData({ ...formData, injury_end_date: e.target.value })}
              />
            </div>
          )}

          {formData.player_status === 'suspended' && (
            <div className="space-y-2">
              <Label>Fine Squalifica</Label>
              <Input
                type="date"
                value={formData.suspension_end_date}
                onChange={(e) => setFormData({ ...formData, suspension_end_date: e.target.value })}
              />
            </div>
          )}

          {/* Quick Move Section */}
          <div className="border-t pt-4 space-y-3">
            <Label className="text-base font-semibold">Spostamento Rapido</Label>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Maggiore Teams */}
              <div className="space-y-2">
                <p className="text-sm text-slate-600 font-medium">Squadre Maggiori</p>
                <div className="space-y-1">
                  {maggioreTeams.map(team => (
                    <Button
                      key={team.id}
                      type="button"
                      variant={formData.team_id === team.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleQuickMove(team.id)}
                      disabled={loading}
                      className="w-full justify-start"
                    >
                      <ArrowRight className="w-4 h-4 mr-2" />
                      {team.name}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Primavera Teams */}
              <div className="space-y-2">
                <p className="text-sm text-slate-600 font-medium">Squadre Primavera</p>
                <div className="space-y-1">
                  {primaveraTeams.map(team => (
                    <Button
                      key={team.id}
                      type="button"
                      variant={formData.team_id === team.id ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleQuickMove(team.id)}
                      disabled={loading}
                      className="w-full justify-start"
                    >
                      <ArrowRight className="w-4 h-4 mr-2" />
                      {team.name}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleQuickMove(null)}
              disabled={loading}
              className="w-full"
            >
              Svincola Giocatore
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salva Modifiche
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}