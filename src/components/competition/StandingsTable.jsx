import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trophy } from 'lucide-react';

export default function StandingsTable({ standings = [], teams = [], leagueName = '' }) {
  // Ordina classifica: 1. Punti, 2. Differenza reti, 3. Gol fatti
  const sortedStandings = [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const diffA = a.goals_for - a.goals_against;
    const diffB = b.goals_for - b.goals_against;
    if (diffB !== diffA) return diffB - diffA;
    return b.goals_for - a.goals_for;
  });

  const getTeam = (teamId) => teams.find(t => t.id === teamId);

  if (sortedStandings.length === 0) {
    return null;
  }

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-emerald-600" />
          Classifica {leagueName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200">
              <tr className="text-left text-slate-500">
                <th className="py-2 px-2">#</th>
                <th className="py-2">Squadra</th>
                <th className="py-2 text-center">Pt</th>
                <th className="py-2 text-center hidden sm:table-cell">G</th>
                <th className="py-2 text-center hidden sm:table-cell">V</th>
                <th className="py-2 text-center hidden sm:table-cell">N</th>
                <th className="py-2 text-center hidden sm:table-cell">P</th>
                <th className="py-2 text-center hidden md:table-cell">GF</th>
                <th className="py-2 text-center hidden md:table-cell">GS</th>
                <th className="py-2 text-center">DR</th>
              </tr>
            </thead>
            <tbody>
              {sortedStandings.map((standing, index) => {
                const team = getTeam(standing.team_id);
                const goalDiff = standing.goals_for - standing.goals_against;
                return (
                  <tr key={standing.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-2 font-semibold text-slate-700">{index + 1}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-6 h-6 rounded-md flex items-center justify-center text-xs text-white font-bold"
                          style={{ backgroundColor: team?.primary_color || '#10B981' }}
                        >
                          {team?.name?.charAt(0) || '?'}
                        </div>
                        <span className="font-medium text-slate-800">{team?.name || 'N/A'}</span>
                      </div>
                    </td>
                    <td className="py-3 text-center font-bold text-slate-800">{standing.points}</td>
                    <td className="py-3 text-center text-slate-600 hidden sm:table-cell">{standing.played}</td>
                    <td className="py-3 text-center text-slate-600 hidden sm:table-cell">{standing.won}</td>
                    <td className="py-3 text-center text-slate-600 hidden sm:table-cell">{standing.drawn}</td>
                    <td className="py-3 text-center text-slate-600 hidden sm:table-cell">{standing.lost}</td>
                    <td className="py-3 text-center text-slate-600 hidden md:table-cell">{standing.goals_for}</td>
                    <td className="py-3 text-center text-slate-600 hidden md:table-cell">{standing.goals_against}</td>
                    <td className={`py-3 text-center font-semibold ${goalDiff > 0 ? 'text-emerald-600' : goalDiff < 0 ? 'text-red-600' : 'text-slate-600'}`}>
                      {goalDiff > 0 ? '+' : ''}{goalDiff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}