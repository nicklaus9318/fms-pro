import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Crosshair, Target, Shield } from 'lucide-react';

const calculateDepartmentAverages = (players, minRatingForAverage = 76) => {
  const attackRoles = ['ATT', 'AS', 'AD', 'ES', 'ED'];
  const midfieldRoles = ['CC', 'COC', 'CDC'];
  const defenseRoles = ['DC', 'TS', 'TD', 'POR'];

  const filterByRating = (playersList) => 
    playersList.filter(p => p.overall_rating && parseFloat(p.overall_rating) >= minRatingForAverage);

  const attackPlayers = filterByRating(players.filter(p => attackRoles.includes(p.role)));
  const midfieldPlayers = filterByRating(players.filter(p => midfieldRoles.includes(p.role)));
  const defensePlayers = filterByRating(players.filter(p => defenseRoles.includes(p.role)));

  const getAverage = (playersList) => {
    if (playersList.length === 0) return 0;
    const sum = playersList.reduce((acc, p) => acc + (parseFloat(p.overall_rating) || 0), 0);
    return (sum / playersList.length).toFixed(2);
  };

  const attackAvg = getAverage(attackPlayers);
  const midfieldAvg = getAverage(midfieldPlayers);
  const defenseAvg = getAverage(defensePlayers);

  const validAverages = [attackAvg, midfieldAvg, defenseAvg].filter(avg => parseFloat(avg) > 0);
  const overallAvg = validAverages.length > 0 
    ? (validAverages.reduce((a, b) => parseFloat(a) + parseFloat(b), 0) / validAverages.length).toFixed(2)
    : '0.00';

  return {
    attack: { avg: attackAvg, count: attackPlayers.length },
    midfield: { avg: midfieldAvg, count: midfieldPlayers.length },
    defense: { avg: defenseAvg, count: defensePlayers.length },
    overall: overallAvg
  };
};

export default function DepartmentAverages({ players, minRatingForAverage = 76 }) {
  const stats = calculateDepartmentAverages(players, minRatingForAverage);

  const departments = [
    {
      name: 'Attacco',
      icon: Crosshair,
      color: 'text-rose-500',
      bgColor: 'bg-rose-100',
      ...stats.attack
    },
    {
      name: 'Centrocampo',
      icon: Target,
      color: 'text-blue-500',
      bgColor: 'bg-blue-100',
      ...stats.midfield
    },
    {
      name: 'Difesa',
      icon: Shield,
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-100',
      ...stats.defense
    }
  ];

  return (
    <Card className="bg-white border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-slate-800">
          Medie Reparto
        </CardTitle>
        {minRatingForAverage > 0 && (
          <p className="text-xs text-slate-500">
            Solo giocatori con Overall ≥ {minRatingForAverage}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {departments.map((dept, idx) => {
          const Icon = dept.icon;
          return (
            <div key={idx} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${dept.bgColor} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${dept.color}`} />
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{dept.name}</p>
                    <p className="text-xs text-slate-500">{dept.count} giocatori</p>
                  </div>
                </div>
                <span className={`text-2xl font-bold ${dept.color}`}>
                  {dept.avg || '-'}
                </span>
              </div>
              <Progress value={dept.avg || 0} max={99} className="h-2" />
            </div>
          );
        })}

        <div className="pt-4 border-t">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-800">Media Totale</p>
            <span className="text-3xl font-bold text-slate-800">
              {stats.overall || '-'}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export { calculateDepartmentAverages };