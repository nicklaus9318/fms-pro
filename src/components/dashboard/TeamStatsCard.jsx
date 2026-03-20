import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

export default function TeamStatsCard({ title, value, subtitle, icon: Icon, trend, trendValue, color = 'emerald' }) {
  const colorClasses = {
    emerald: 'from-emerald-500 to-emerald-600 shadow-emerald-500/25',
    blue: 'from-blue-500 to-blue-600 shadow-blue-500/25',
    amber: 'from-amber-500 to-amber-600 shadow-amber-500/25',
    rose: 'from-rose-500 to-rose-600 shadow-rose-500/25',
    purple: 'from-purple-500 to-purple-600 shadow-purple-500/25',
  };

  const getTrendIcon = () => {
    if (trend === 'up') return <TrendingUp className="w-3 h-3 text-emerald-500" />;
    if (trend === 'down') return <TrendingDown className="w-3 h-3 text-rose-500" />;
    return <Minus className="w-3 h-3 text-slate-400" />;
  };

  return (
    <Card className="relative overflow-hidden bg-white border-0 shadow-sm hover:shadow-md transition-shadow duration-300">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-slate-500">{title}</CardTitle>
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${colorClasses[color]} shadow-lg flex items-center justify-center`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          <p className="text-2xl font-bold text-slate-800">{value}</p>
          <div className="flex items-center gap-2">
            {trend && (
              <div className="flex items-center gap-1">
                {getTrendIcon()}
                <span className={`text-xs font-medium ${
                  trend === 'up' ? 'text-emerald-500' : 
                  trend === 'down' ? 'text-rose-500' : 'text-slate-400'
                }`}>
                  {trendValue}
                </span>
              </div>
            )}
            {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}