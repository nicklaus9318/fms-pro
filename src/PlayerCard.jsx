import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, User, Euro, History, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../../utils';
import { supabase } from '@/api/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const ROLE_COLORS = {
  'POR': 'bg-yellow-100 text-yellow-800',
  'DC': 'bg-blue-100 text-blue-800',
  'TS': 'bg-blue-100 text-blue-800',
  'TD': 'bg-blue-100 text-blue-800',
  'CDC': 'bg-green-100 text-green-800',
  'CC': 'bg-green-100 text-green-800',
  'COC': 'bg-green-100 text-green-800',
  'ES': 'bg-purple-100 text-purple-800',
  'ED': 'bg-purple-100 text-purple-800',
  'AS': 'bg-rose-100 text-rose-800',
  'AD': 'bg-rose-100 text-rose-800',
  'ATT': 'bg-rose-100 text-rose-800',
};

const getSofifaPhotoUrl = (player) => {
  if (player?.photo_url && typeof player.photo_url === 'string') return player.photo_url;
  let sofifaId = player?.id_sofifa;
  if (!sofifaId) return null;
  sofifaId = String(sofifaId).trim();
  if (sofifaId.includes('sofifa.com')) {
    const match = sofifaId.match(/\/player\/(\d+)\//);
    if (match) sofifaId = match[1];
    else return null;
  }
  sofifaId = sofifaId.replace(/\D/g, '');
  if (sofifaId.length < 4) return null;
  // FotMob CDN - nessuna restrizione hotlink
  return `https://images.fotmob.com/image_resources/playerimages/${sofifaId}.png`;
};

const getSofifaFallbackUrl = (sofifaId) => {
  if (!sofifaId) return null;
  const id = String(sofifaId).replace(/\D/g, '');
  if (id.length < 4) return null;
  // Fallback FUTWIZ
  return `https://cdn.futwiz.com/assets/img/fc25/faces/${id}.png`;
};

export default function PlayerCard({ player, onClick, showTeam, teamName, showHistoryButton = false, showDeleteButton = false, onDeleted }) {
  const queryClient = useQueryClient();

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (!window.confirm(`Eliminare ${player.first_name} ${player.last_name}?`)) return;
    if (!window.confirm('Sei sicuro? L\'operazione non può essere annullata.')) return;
    try {
      // Elimina tabelle dipendenti prima
      await supabase.from('player_statuses').delete().eq('player_id', player.id);
      await supabase.from('sanctions').delete().eq('player_id', player.id);
      const { error } = await supabase.from('players').delete().eq('id', player.id);
      if (error) throw error;
      toast.success(`${player.first_name} ${player.last_name} eliminato`);
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['allPlayers'] });
      if (onDeleted) onDeleted(player.id);
    } catch (err) {
      toast.error('Errore eliminazione: ' + err.message);
    }
  };
  const formatSalary = (salary) => {
    if (!salary) return '-';
    if (salary >= 1000000) return `€${(salary / 1000000).toFixed(1)}M`;
    if (salary >= 1000) return `€${(salary / 1000).toFixed(0)}K`;
    return `€${salary}`;
  };

  const photoUrl = getSofifaPhotoUrl(player);

  return (
    <Card 
      className="group relative overflow-hidden bg-white border-0 shadow-sm hover:shadow-lg transition-all duration-300 cursor-pointer"
      onClick={onClick}
    >
      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-slate-50 to-transparent rounded-bl-full" />
      
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Player Image */}
          <div className="relative flex-shrink-0">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={`${player.first_name} ${player.last_name}`}
                className="w-16 h-16 rounded-xl object-cover shadow-sm"
                onError={(e) => {
                  const fb = getSofifaFallbackUrl(player.id_sofifa);
                  if (fb && e.target.src !== fb) { e.target.src = fb; }
                  else { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }
                }}
              />
            ) : null}
            <div
              className="w-16 h-16 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 items-center justify-center"
              style={{ display: photoUrl ? 'none' : 'flex' }}
            >
              <User className="w-8 h-8 text-slate-400" />
            </div>
            {player.overall_rating && (
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg">
                <span className="text-xs font-bold text-white">{player.overall_rating}</span>
              </div>
            )}
          </div>

          {/* Player Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-sm font-semibold text-slate-800 truncate">
                {player.first_name} {player.last_name}
              </h3>
              {player.status === 'pending' && (
                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                  In attesa
                </Badge>
              )}
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <Badge className={`${ROLE_COLORS[player.role] || 'bg-slate-100 text-slate-800'} text-xs font-medium`}>
                {player.role}
              </Badge>
              {player.age && (
                <span className="text-xs text-slate-500">{player.age} anni</span>
              )}
            </div>

            {showTeam && teamName && (
              <p className="text-xs text-slate-500 mb-2">{teamName}</p>
            )}

            <div className="flex flex-col gap-1 mb-2">
              {player.player_value != null && (
                <div className="flex items-center gap-1 text-emerald-600">
                  <Euro className="w-3 h-3" />
                  <span className="text-xs font-medium">Valore: {formatSalary(player.player_value)}</span>
                </div>
              )}
              {player.salary && (
                <div className="flex items-center gap-1 text-slate-600">
                  <Euro className="w-3 h-3" />
                  <span className="text-xs font-medium">Stipendio: {formatSalary(player.salary)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end">
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {showHistoryButton && (
                  <Link to={createPageUrl('PlayerHistory') + '?id=' + player.id}>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => e.stopPropagation()}>
                      <History className="w-3 h-3" />
                    </Button>
                  </Link>
                )}
                {player.sofifa_link && (
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={(e) => { e.stopPropagation(); window.open(player.sofifa_link, '_blank'); }}>
                    <ExternalLink className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
