import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Trophy, TrendingUp, User } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

const ROLE_ORDER = {
  'POR': 1,
  'DC': 2, 'TS': 3, 'TD': 4,
  'CDC': 5, 'CC': 6, 'COC': 7,
  'ES': 8, 'ED': 9, 'AS': 10, 'AD': 11,
  'ATT': 12
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

export default function TeamTableView({ teamId }) {
  const { data: players = [] } = useQuery({
    queryKey: ['players', teamId],
    queryFn: () => base44.entities.Player.filter({ team_id: teamId, status: 'approved' })
  });

  const sortedPlayers = [...players].sort((a, b) => {
    const roleA = ROLE_ORDER[a.role] || 999;
    const roleB = ROLE_ORDER[b.role] || 999;
    return roleA - roleB;
  });

  const totalSalaries = players.reduce((sum, p) => sum + (parseFloat(p.salary) || 0), 0);

  const { data: teamData } = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => base44.entities.Team.filter({ id: teamId }),
    select: (teams) => teams[0]
  });

  const netBudget = (parseFloat(teamData?.budget) || 0) - totalSalaries;

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-6">
        <Card className="bg-gradient-to-br from-emerald-500 to-emerald-600 border-0 shadow-xl overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-emerald-100 uppercase tracking-wider mb-2">Tot. Stipendi</p>
                <p className="text-3xl font-bold text-white">€{(totalSalaries / 1000000).toFixed(2)}M</p>
              </div>
              <div className="p-3 rounded-xl bg-white/20">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 border-0 shadow-xl overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-100 uppercase tracking-wider mb-2">Budget Disponibile</p>
                <p className="text-3xl font-bold text-white">€{(netBudget / 1000000).toFixed(2)}M</p>
              </div>
              <div className="p-3 rounded-xl bg-white/20">
                <Trophy className="w-8 h-8 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Players Table */}
      <Card className="bg-white border-0 shadow-xl overflow-hidden">
        <CardHeader className="border-b border-slate-100">
          <CardTitle className="text-2xl font-bold text-slate-800">Rosa Completa</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-left text-xs font-medium text-slate-500 uppercase">
                  <th className="px-4 py-3">Foto</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Ruolo</th>
                  <th className="px-4 py-3 text-center">OVR</th>
                  <th className="px-4 py-3 text-right">Stipendio</th>
                  <th className="px-4 py-3 text-center">Gol</th>
                  <th className="px-4 py-3 text-center">Assist</th>
                  <th className="px-4 py-3 text-center">MVP</th>
                  <th className="px-4 py-3">SoFIFA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedPlayers.map((player) => {
                  const photoUrl = getSofifaPhotoUrl(player);
                  return (
                    <tr key={player.id} className="hover:bg-emerald-50 transition-colors">
                      <td className="px-4 py-3">
                        {photoUrl ? (
                          <img
                            src={photoUrl}
                            alt={`${player.first_name} ${player.last_name}`}
                            className="w-10 h-10 rounded-lg object-cover"
                            onError={(e) => {
                              const fb = getSofifaFallbackUrl(player.id_sofifa);
                              if (fb && e.target.src !== fb) { e.target.src = fb; }
                              else { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }
                            }}
                          />
                        ) : null}
                        <div
                          className="w-10 h-10 rounded-lg bg-slate-100 items-center justify-center"
                          style={{ display: photoUrl ? 'none' : 'flex' }}
                        >
                          <User className="w-5 h-5 text-slate-400" />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">
                          {player.first_name} {player.last_name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-xs">{player.role}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold text-slate-700">{player.overall_rating || '-'}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-sm text-slate-600">
                        {player.salary ? `€${(parseFloat(player.salary) / 1000000).toFixed(2)}M` : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-emerald-600 font-semibold">{player.goals || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-blue-600 font-semibold">{player.assists || 0}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-amber-600 font-semibold">{player.mvp_count || 0}</span>
                      </td>
                      <td className="px-4 py-3">
                        {player.id_sofifa ? (
                          <a href={`https://sofifa.com/player/${player.id_sofifa}`} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm">
                            {player.id_sofifa}
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">N/A</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {players.length === 0 && (
            <div className="py-12 text-center text-slate-400">Nessun giocatore in rosa</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
