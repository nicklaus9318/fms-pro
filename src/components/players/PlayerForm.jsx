import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from 'lucide-react';

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

export default function PlayerForm({ open, onClose, onSubmit, player, teams, isAdmin }) {
  const [formData, setFormData] = useState(player || {
    first_name: '',
    last_name: '',
    age: '',
    role: '',
    salary: '',
    overall_rating: '',
    sofifa_link: '',
    transfermarkt_link: '',
    team_id: '',
    status: isAdmin ? 'approved' : 'pending'
  });
  const [loading, setLoading] = useState(false);

  const calculateSalaryByOverall = (overall) => {
    const ovr = parseInt(overall);
    if (isNaN(ovr)) return '';
    if (ovr >= 88) return 1000000;
    if (ovr >= 85) return 700000;
    if (ovr >= 82) return 500000;
    if (ovr >= 75) return 250000;
    return 100000;
  };

  const handleOverallChange = (value) => {
    const suggestedSalary = calculateSalaryByOverall(value);
    setFormData({ 
      ...formData, 
      overall_rating: value,
      salary: suggestedSalary
    });
  };

  const extractSoFIFAId = (link) => {
    if (!link) return null;
    const match = link.match(/\/player\/(\d+)/);
    return match ? match[1] : null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    const extractedId = extractSoFIFAId(formData.sofifa_link);
    
    // Genera numero lotto casuale tra 1 e 90
    const randomLottoNumber = Math.floor(Math.random() * 90) + 1;
    
    const dataToSubmit = {
      ...formData,
      age: formData.age ? parseInt(formData.age) : null,
      salary: formData.salary ? parseFloat(formData.salary) : null,
      overall_rating: formData.overall_rating ? parseInt(formData.overall_rating) : null,
      id_sofifa: extractedId || formData.id_sofifa,
      status: isAdmin ? 'approved' : 'pending',
      lotto_number: randomLottoNumber,
      team_id: formData.team_id || null
    };
    
    await onSubmit(dataToSubmit);
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{player ? 'Modifica Giocatore' : 'Nuovo Giocatore'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="first_name">Nome *</Label>
              <Input
                id="first_name"
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="last_name">Cognome *</Label>
              <Input
                id="last_name"
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="age">Età</Label>
              <Input
                id="age"
                type="number"
                min="15"
                max="50"
                value={formData.age}
                onChange={(e) => setFormData({ ...formData, age: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Ruolo *</Label>
              <Select 
                value={formData.role} 
                onValueChange={(value) => setFormData({ ...formData, role: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona ruolo" />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="salary">Stipendio (€)</Label>
              <Input
                id="salary"
                type="number"
                min="0"
                value={formData.salary}
                onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="overall_rating">Overall (1-100)</Label>
              <Input
                id="overall_rating"
                type="number"
                min="1"
                max="100"
                value={formData.overall_rating}
                onChange={(e) => handleOverallChange(e.target.value)}
              />
              {formData.overall_rating && (
                <p className="text-xs text-emerald-600">
                  Stipendio suggerito: €{calculateSalaryByOverall(formData.overall_rating).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {teams && teams.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="team">Squadra</Label>
              <Select 
                value={formData.team_id} 
                onValueChange={(value) => setFormData({ ...formData, team_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Svincolato" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Svincolato</SelectItem>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="sofifa_link">Link SoFIFA</Label>
            <Input
              id="sofifa_link"
              type="url"
              value={formData.sofifa_link}
              onChange={(e) => setFormData({ ...formData, sofifa_link: e.target.value })}
              placeholder="https://sofifa.com/player/..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="transfermarkt_link">Link Transfermarkt</Label>
            <Input
              id="transfermarkt_link"
              type="url"
              value={formData.transfermarkt_link}
              onChange={(e) => setFormData({ ...formData, transfermarkt_link: e.target.value })}
              placeholder="https://www.transfermarkt.it/..."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Annulla
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {player ? 'Salva' : 'Crea Giocatore'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}