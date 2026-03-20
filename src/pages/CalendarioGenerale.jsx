import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Search, Trophy, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import moment from 'moment';

export default function CalendarioGenerale() {
  const [selectedCompetition, setSelectedCompetition] = useState('all');
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const { data: competitions = [] } = useQuery({
    queryKey: ['competitions'],
    queryFn: () => base44.entities.Competition.list()
  });

  const { data: matches = [] } = useQuery({
    queryKey: ['matches'],
    queryFn: () => base44.entities.Match.list()
  });

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const activeCompetitions = competitions.filter(c => c.status === 'active');

  const filteredMatches = matches.filter(match => {
    const matchesCompetition = selectedCompetition === 'all' || match.competition_id === selectedCompetition;
    const matchesTeam = selectedTeam === 'all' || 
                       match.home_team_id === selectedTeam || 
                       match.away_team_id === selectedTeam;
    const matchesStatus = selectedStatus === 'all' || match.status === selectedStatus;
    const matchesSearch = searchQuery === '' ||
      match.home_team_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      match.away_team_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDate = !selectedDate || 
      (match.created_date && moment(match.created_date).format('YYYY-MM-DD') === selectedDate);
    
    return matchesCompetition && matchesTeam && matchesStatus && matchesSearch && matchesDate;
  }).sort((a, b) => {
    // Sort by matchday descending (future first)
    if (b.matchday !== a.matchday) return b.matchday - a.matchday;
    return new Date(b.created_date) - new Date(a.created_date);
  });

  const futureMatches = filteredMatches.filter(m => m.status === 'scheduled');
  const pastMatches = filteredMatches.filter(m => m.status === 'completed');
  const inProgressMatches = filteredMatches.filter(m => m.status === 'in_progress');

  const getCompetitionName = (competitionId) => {
    const comp = competitions.find(c => c.id === competitionId);
    return comp?.name || 'N/A';
  };

  const getTeamLogo = (teamId) => {
    const team = teams.find(t => t.id === teamId);
    return team?.logo_url;
  };

  const getStatusBadge = (status) => {
    switch(status) {
      case 'scheduled':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Da giocare</Badge>;
      case 'in_progress':
        return <Badge className="bg-amber-100 text-amber-700">In corso</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-100 text-emerald-700">Completata</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderMatchRow = (match) => (
    <tr key={match.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="px-4 py-3 text-sm font-medium text-slate-700">
        {getCompetitionName(match.competition_id)}
      </td>
      <td className="px-4 py-3 text-sm text-center text-slate-500">
        Giornata {match.matchday}
      </td>
      <td className="px-4 py-3 text-sm text-right">
        <div className="flex items-center justify-end gap-2">
          <span className="font-medium text-slate-800">{match.home_team_name}</span>
          {getTeamLogo(match.home_team_id) && (
            <img src={getTeamLogo(match.home_team_id)} alt={match.home_team_name} className="w-6 h-6 object-contain" />
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-center font-bold text-slate-800">
        {match.status === 'completed' ? (
          <span>{match.home_score} - {match.away_score}</span>
        ) : (
          <span className="text-sm text-slate-500 font-normal">vs</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-left">
        <div className="flex items-center justify-start gap-2">
          {getTeamLogo(match.away_team_id) && (
            <img src={getTeamLogo(match.away_team_id)} alt={match.away_team_name} className="w-6 h-6 object-contain" />
          )}
          <span className="font-medium text-slate-800">{match.away_team_name}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        {getStatusBadge(match.status)}
      </td>
    </tr>
  );

  const paginateMatches = (matchesList) => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return matchesList.slice(startIndex, endIndex);
  };

  const renderPagination = (totalItems) => {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return null;

    return (
      <div className="flex items-center justify-center gap-2 mt-6">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          disabled={currentPage === 1}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm text-slate-600">
          Pagina {currentPage} di {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          <Calendar className="w-7 h-7 text-emerald-500" />
          Calendario Generale
        </h1>
        <p className="text-slate-500">Tutte le partite di tutte le competizioni</p>
      </div>

      {/* Filters */}
      <Card className="bg-white border-0 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Filtri</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600">Competizione</label>
              <Select value={selectedCompetition} onValueChange={(v) => { setSelectedCompetition(v); setCurrentPage(1); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le competizioni</SelectItem>
                  {activeCompetitions.map(comp => (
                    <SelectItem key={comp.id} value={comp.id}>
                      {comp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600">Squadra</label>
              <Select value={selectedTeam} onValueChange={(v) => { setSelectedTeam(v); setCurrentPage(1); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte le squadre</SelectItem>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600">Stato</label>
              <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setCurrentPage(1); }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti gli stati</SelectItem>
                  <SelectItem value="scheduled">Da giocare</SelectItem>
                  <SelectItem value="in_progress">In corso</SelectItem>
                  <SelectItem value="completed">Completate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-slate-600">Data</label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setCurrentPage(1); }}
              />
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Cerca squadra..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              className="pl-10"
            />
          </div>

          {/* Stats Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t">
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-800">{filteredMatches.length}</p>
              <p className="text-xs text-slate-500">Totale partite</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{futureMatches.length}</p>
              <p className="text-xs text-slate-500">Da giocare</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-amber-600">{inProgressMatches.length}</p>
              <p className="text-xs text-slate-500">In corso</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-emerald-600">{pastMatches.length}</p>
              <p className="text-xs text-slate-500">Completate</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Matches Tabs */}
      <Tabs defaultValue="future" onValueChange={() => setCurrentPage(1)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="future">
            Da Giocare ({futureMatches.length})
          </TabsTrigger>
          <TabsTrigger value="progress">
            In Corso ({inProgressMatches.length})
          </TabsTrigger>
          <TabsTrigger value="past">
            Completate ({pastMatches.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="future" className="space-y-4">
          {futureMatches.length > 0 ? (
            <>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Competizione</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Giornata</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Casa</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase"></th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Trasferta</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginateMatches(futureMatches).map(renderMatchRow)}
                    </tbody>
                  </table>
                </div>
              </Card>
              {renderPagination(futureMatches.length)}
            </>
          ) : (
            <Card className="bg-slate-50 border-dashed">
              <CardContent className="py-12 text-center">
                <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Nessuna partita in programma</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="progress" className="space-y-4">
          {inProgressMatches.length > 0 ? (
            <>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Competizione</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Giornata</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Casa</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase"></th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Trasferta</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginateMatches(inProgressMatches).map(renderMatchRow)}
                    </tbody>
                  </table>
                </div>
              </Card>
              {renderPagination(inProgressMatches.length)}
            </>
          ) : (
            <Card className="bg-slate-50 border-dashed">
              <CardContent className="py-12 text-center">
                <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Nessuna partita in corso</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="past" className="space-y-4">
          {pastMatches.length > 0 ? (
            <>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-100 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Competizione</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Giornata</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Casa</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase"></th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase">Trasferta</th>
                        <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase">Stato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginateMatches(pastMatches).map(renderMatchRow)}
                    </tbody>
                  </table>
                </div>
              </Card>
              {renderPagination(pastMatches.length)}
            </>
          ) : (
            <Card className="bg-slate-50 border-dashed">
              <CardContent className="py-12 text-center">
                <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500">Nessuna partita completata</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}