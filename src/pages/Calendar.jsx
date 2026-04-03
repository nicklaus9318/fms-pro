import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar as CalendarIcon, Trophy, Play, ChevronLeft, ChevronRight, FileEdit, Image, Youtube, ScanSearch, AlertTriangle } from 'lucide-react';
import { FORMAT_GENERATORS, FORMAT_LABELS } from '@/lib/CompetitionGenerator';
import MatchReportForm from '@/components/match/MatchReportForm';
import StandingsTable from '@/components/competition/StandingsTable';
import SeasonStats from '@/components/competition/SeasonStats';
import KnockoutBracket from '@/components/competition/KnockoutBracket';
import moment from 'moment';
import 'moment/locale/it';
import { toast } from 'sonner';

moment.locale('it');

// ─── Hall of Fame ─────────────────────────────────────────────────────────────
function HallOfFame({ players, teams }) {
  const [tab, setTab] = useState('goals');

  const getTeamName = (teamId) => teams.find(t => t.id === teamId)?.name || 'Svincolato';

  const topScorers = [...players]
    .filter(p => (p.goals || 0) > 0)
    .sort((a, b) => (b.goals || 0) - (a.goals || 0))
    .slice(0, 50);

  const topAssistmen = [...players]
    .filter(p => (p.assists || 0) > 0)
    .sort((a, b) => (b.assists || 0) - (a.assists || 0))
    .slice(0, 50);

  const list = tab === 'goals' ? topScorers : topAssistmen;
  const statKey = tab === 'goals' ? 'goals' : 'assists';
  const statLabel = tab === 'goals' ? '⚽ Gol' : '🅰️ Assist';

  const medalColor = (i) => {
    if (i === 0) return 'text-yellow-500 font-bold';
    if (i === 1) return 'text-slate-400 font-bold';
    if (i === 2) return 'text-amber-600 font-bold';
    return 'text-slate-500';
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="w-5 h-5 text-amber-500" />
            Hall of Fame — Top 50 All Time
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Button
              size="sm"
              variant={tab === 'goals' ? 'default' : 'outline'}
              onClick={() => setTab('goals')}
            >⚽ Marcatori</Button>
            <Button
              size="sm"
              variant={tab === 'assists' ? 'default' : 'outline'}
              onClick={() => setTab('assists')}
            >🅰️ Assistman</Button>
          </div>

          {list.length === 0 ? (
            <p className="text-center text-slate-400 py-8">Nessun dato disponibile</p>
          ) : (
            <div className="space-y-1">
              {list.map((player, i) => (
                <div
                  key={player.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg ${i < 3 ? 'bg-amber-50' : i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}
                >
                  <span className={`w-7 text-center text-sm ${medalColor(i)}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm truncate">
                      {player.first_name} {player.last_name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{getTeamName(player.team_id)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {player.role && (
                      <Badge className="bg-blue-100 text-blue-700 border-0 text-xs">{player.role}</Badge>
                    )}
                    <span className="font-bold text-slate-800 text-lg w-8 text-right">
                      {player[statKey] || 0}
                    </span>
                    <span className="text-xs text-slate-400 w-12">{statLabel}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function generateBergerSchedule(teams) {
  const n = teams.length;
  if (n < 2) return [];
  const teamList = [...teams];
  if (n % 2 !== 0) teamList.push({ id: 'BYE', name: 'Riposo' });
  const numTeams = teamList.length;
  const numRounds = numTeams - 1;
  const matchesPerRound = numTeams / 2;
  const schedule = [];
  for (let round = 0; round < numRounds; round++) {
    const roundMatches = [];
    for (let match = 0; match < matchesPerRound; match++) {
      const home = (round + match) % (numTeams - 1);
      let away = (numTeams - 1 - match + round) % (numTeams - 1);
      if (match === 0) away = numTeams - 1;
      const homeTeam = teamList[home];
      const awayTeam = teamList[away];
      if (homeTeam.id !== 'BYE' && awayTeam.id !== 'BYE') {
        roundMatches.push({
          home_team_id: round % 2 === 0 ? homeTeam.id : awayTeam.id,
          away_team_id: round % 2 === 0 ? awayTeam.id : homeTeam.id,
          matchday: round + 1
        });
      }
    }
    schedule.push(...roundMatches);
  }
  return schedule;
}

export default function Calendar() {
  const [user, setUser] = useState(null);
  const [selectedLeague, setSelectedLeague] = useState('');
  const [selectedMatchday, setSelectedMatchday] = useState(1);
  const [showReportForm, setShowReportForm] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [showMatchDetails, setShowMatchDetails] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState('classic');
  const [showFormatDialog, setShowFormatDialog] = useState(false);
  const [analyzingMatchPhotos, setAnalyzingMatchPhotos] = useState(false);
  const [matchPhotoWarnings, setMatchPhotoWarnings] = useState([]);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (!authUser) return;
        const { data } = await supabase.from('user_roles').select('*').eq('email', authUser.email).single();
        if (data) setUser(data);
      } catch (e) {}
    };
    loadUser();
  }, []);

  const isAdmin = user?.role === 'admin';
  const isController = user?.role === 'controller' || user?.role === 'controllore';

  const { data: leagues = [] } = useQuery({ queryKey: ['leagues'], queryFn: async () => { const { data } = await supabase.from('leagues').select('id,name,season,status,participating_teams,current_matchday,prize_type,competition_format,default_budget,logo_url'); return data || []; } });
  const { data: competitions = [] } = useQuery({ queryKey: ['competitions'], queryFn: async () => { const { data } = await supabase.from('competitions').select('id,name,league_id,season,format,participating_teams,status'); return data || []; } });
  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: async () => { const { data } = await supabase.from('teams').select('id,name,owner_email,primary_color,logo_url,budget,league_id,team_type'); return data || []; } });
  const { data: matches = [] } = useQuery({ queryKey: ['matches'], queryFn: async () => { const { data } = await supabase.from('matches').select('id,league_id,competition_id,season,matchday,stage,status,home_team_id,home_team_name,away_team_id,away_team_name,home_score,away_score,scorers,assists,cards,injuries,photos,stream_link,notes,mvp_player_id,mvp_player_name,home_goalkeeper_id,home_goalkeeper_rating,away_goalkeeper_id,away_goalkeeper_rating'); return data || []; } });
  const { data: players = [] } = useQuery({ queryKey: ['players'], queryFn: async () => { const { data } = await supabase.from('players').select('id,first_name,last_name,role,age,overall_rating,goals,assists,mvp_count,yellow_cards_accumulated,player_status,team_id,id_sofifa,photo_url,status').eq('status', 'approved'); return data || []; } });
  const { data: playerStatuses = [] } = useQuery({ queryKey: ['playerStatuses'], queryFn: async () => { const { data } = await supabase.from('player_statuses').select('id,player_id,player_name,team_id,status_type,matchdays_remaining,reason,reason_type,matchday_of_card,suspension_start_matchday'); return data || []; } });
  const { data: rawStandings = [] } = useQuery({
    queryKey: ['standings', selectedLeague],
    queryFn: async () => { const { data } = await supabase.from('standings').select('*').eq('league_id', selectedLeague); return data || []; },
    enabled: !!selectedLeague
  });

  const standings = Array.from(new Map(rawStandings.map(s => [s.team_id, s])).values());
  const userTeam = teams.find(t => t.owner_email === user?.email);

  useEffect(() => {
    if (leagues.length > 0 && !selectedLeague) setSelectedLeague(leagues[0].id);
  }, [leagues, selectedLeague]);

  const createMatchesMutation = useMutation({
    mutationFn: async (data) => {
      const { error } = await supabase.from('matches').insert(data);
      if (error) throw error;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['matches'] }); toast.success('Calendario generato con successo'); }
  });

  const analyzeMatchPhotosAI = async (match) => {
    if (!match.photos?.length) { toast.error('Nessuna foto disponibile'); return; }

    // Giocatori squalificati/infortunati
    const riskyPlayers = players.filter(p =>
      playerStatuses.some(s => s.player_id === p.id && ['suspended', 'injured'].includes(s.status_type))
    );
    if (riskyPlayers.length === 0) { toast.info('Nessun giocatore squalificato/infortunato al momento'); return; }

    setAnalyzingMatchPhotos(true);
    setMatchPhotoWarnings([]);
    try {
      const imageContents = [];
      const hasPhotos = match.photos?.length > 0;

      if (hasPhotos) {
        // Usa le foto caricate (max 10)
        for (const photoUrl of match.photos.slice(0, 10)) {
          try {
            const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(photoUrl)}`;
            const res = await fetch(proxyUrl);
            const blob = await res.blob();
            const base64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(',')[1]);
              reader.readAsDataURL(blob);
            });
            imageContents.push({ type: 'image', source: { type: 'base64', media_type: blob.type || 'image/jpeg', data: base64 } });
          } catch (e) { console.warn('Foto non caricabile:', photoUrl); }
        }
      } else if (match.stream_link) {
        // Nessuna foto — usa thumbnail YouTube
        const ytMatch = match.stream_link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) {
          const videoId = ytMatch[1];
          try {
            const res = await fetch(`https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`);
            const blob = await res.blob();
            const base64 = await new Promise((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result.split(',')[1]);
              reader.readAsDataURL(blob);
            });
            imageContents.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } });
          } catch (e) { console.warn('Thumbnail YouTube non caricabile'); }
        }
      }
      if (!imageContents.length) { toast.error('Nessuna foto o thumbnail disponibile'); setAnalyzingMatchPhotos(false); return; }

      const riskyNames = riskyPlayers.map(p => {
        const s = playerStatuses.find(s => s.player_id === p.id);
        return `${p.first_name} ${p.last_name} (${s?.status_type === 'suspended' ? 'SQUALIFICATO' : 'INFORTUNATO'})`;
      }).join('\n');

      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 1000,
          messages: [{ role: 'user', content: [
            ...imageContents,
            { type: 'text', text: `Analizza queste foto di una partita. Cerca nei tabellini, maglie o grafiche i seguenti giocatori NON dovrebbero essere in campo:\n${riskyNames}\n\nRispondi SOLO in JSON: {"found":[{"name":"...","reason":"squalificato o infortunato","confidence":"high/medium/low","detail":"..."}],"message":"..."}` }
          ]}]
        })
      });
      const data = await response.json();
      const text = data.content?.[0]?.text || '';
      const parsed = JSON.parse(text.replace(/\`\`\`json|\`\`\`/g, '').trim());
      if (parsed.found?.length > 0) {
        setMatchPhotoWarnings(parsed.found);
        toast.warning(`⚠️ ${parsed.found.length} giocatore/i a rischio rilevato/i!`);
      } else {
        setMatchPhotoWarnings([]);
        toast.success('✅ Nessun giocatore squalificato/infortunato rilevato');
      }
    } catch (e) { toast.error('Errore analisi: ' + e.message); }
    setAnalyzingMatchPhotos(false);
  };

  const handleGenerateCalendar = async () => {
    const currentLeague = leagues.find(l => l.id === selectedLeague);
    const leagueTeamIds = currentLeague?.participating_teams || [];
    const leagueTeams = leagueTeamIds.length > 0
      ? teams.filter(t => leagueTeamIds.includes(t.id))
      : teams.filter(t => t.league_id === selectedLeague);
    const formatInfo = FORMAT_LABELS[selectedFormat];
    if (leagueTeams.length < (formatInfo?.minTeams || 2)) {
      toast.error(`Servono almeno ${formatInfo?.minTeams || 2} squadre per il formato "${formatInfo?.label}"`);
      return;
    }
    try {
      const generator = FORMAT_GENERATORS[selectedFormat];
      const schedule = generator(leagueTeams, selectedLeague, currentLeague?.season || '2025/2026');
      await createMatchesMutation.mutateAsync(schedule);
      setShowFormatDialog(false);
    } catch (e) {
      toast.error('Errore generazione: ' + e.message);
    }
  };

  const handleReportSubmit = async (data) => {
    const loadingToast = toast.loading('Salvataggio in corso...');
    try {
      if (!selectedMatch?.id) throw new Error('ID partita mancante');
      const homeScore = parseInt(data.home_score);
      const awayScore = parseInt(data.away_score);
      if (isNaN(homeScore) || isNaN(awayScore)) throw new Error('Punteggio non valido');

      const homeTeam = teams.find(t => t.id === selectedMatch.home_team_id);
      const awayTeam = teams.find(t => t.id === selectedMatch.away_team_id);
      if (!homeTeam || !awayTeam) throw new Error('Squadre non trovate nel database');

      let homePoints = 0, awayPoints = 0;
      if (homeScore > awayScore) { homePoints = 3; }
      else if (homeScore < awayScore) { awayPoints = 3; }
      else { homePoints = 1; awayPoints = 1; }

      const operations = [];
      const isFirstSave = selectedMatch.status !== 'completed';
      const homePlayers = players.filter(p => p.team_id === selectedMatch.home_team_id);
      const awayPlayers = players.filter(p => p.team_id === selectedMatch.away_team_id);
      const allMatchPlayers = [...homePlayers, ...awayPlayers];

      const getPlayerName = (playerId, fallbackName) => {
        if (fallbackName && fallbackName.trim()) return fallbackName.trim();
        const p = allMatchPlayers.find(pl => pl.id === playerId);
        return p ? `${p.first_name} ${p.last_name}` : '';
      };
      const getPlayerTeamId = (playerId, fallbackTeamId) => {
        if (fallbackTeamId) return fallbackTeamId;
        const p = allMatchPlayers.find(pl => pl.id === playerId);
        return p?.team_id || '';
      };

      // 1. Aggiorna partita
      operations.push(supabase.from('matches').update({
        home_score: homeScore, away_score: awayScore, status: 'completed',
        scorers: data.scorers || [],
        assists: data.assists?.filter(a => a && a.player_id) || [],
        mvp_player_id: data.mvp_player_id || null,
        mvp_player_name: data.mvp_player_name || null,
        home_goalkeeper_id: data.home_goalkeeper_id || null,
        home_goalkeeper_rating: data.home_goalkeeper_rating ? parseFloat(data.home_goalkeeper_rating) : null,
        away_goalkeeper_id: data.away_goalkeeper_id || null,
        away_goalkeeper_rating: data.away_goalkeeper_rating ? parseFloat(data.away_goalkeeper_rating) : null,
        cards: data.cards || [], injuries: data.injuries || [],
        photos: data.photos || [], stream_link: data.stream_link || '', notes: data.notes || ''
      }).eq('id', selectedMatch.id));

      // Reset vecchie statistiche se modifica
      if (!isFirstSave) {
        if (selectedMatch.scorers) {
          for (const oldScorer of selectedMatch.scorers) {
            if (oldScorer.player_id && !oldScorer.is_own_goal) {
              const player = allMatchPlayers.find(p => p.id === oldScorer.player_id);
              if (player) operations.push(supabase.from('players').update({ goals: Math.max(0, (parseInt(player.goals) || 0) - 1) }).eq('id', oldScorer.player_id));
            }
          }
        }
        if (selectedMatch.assists) {
          for (const oldAssist of selectedMatch.assists) {
            if (oldAssist?.player_id) {
              const player = allMatchPlayers.find(p => p.id === oldAssist.player_id);
              if (player) operations.push(supabase.from('players').update({ assists: Math.max(0, (parseInt(player.assists) || 0) - 1) }).eq('id', oldAssist.player_id));
            }
          }
        }
        if (selectedMatch.mvp_player_id) {
          const oldMvp = allMatchPlayers.find(p => p.id === selectedMatch.mvp_player_id);
          if (oldMvp) operations.push(supabase.from('players').update({ mvp_count: Math.max(0, (parseInt(oldMvp.mvp_count) || 0) - 1) }).eq('id', selectedMatch.mvp_player_id));
        }
      }

      // Gol
      for (const scorer of data.scorers || []) {
        if (scorer.player_id && !scorer.is_own_goal) {
          const player = allMatchPlayers.find(p => p.id === scorer.player_id);
          if (player) operations.push(supabase.from('players').update({ goals: (parseInt(player.goals) || 0) + 1 }).eq('id', scorer.player_id));
        }
      }
      // Assist
      for (const assist of data.assists || []) {
        if (assist?.player_id) {
          const player = allMatchPlayers.find(p => p.id === assist.player_id);
          if (player) operations.push(supabase.from('players').update({ assists: (parseInt(player.assists) || 0) + 1 }).eq('id', assist.player_id));
        }
      }
      // MVP
      if (data.mvp_player_id) {
        const mvpPlayer = allMatchPlayers.find(p => p.id === data.mvp_player_id);
        if (mvpPlayer) operations.push(supabase.from('players').update({ mvp_count: (parseInt(mvpPlayer.mvp_count) || 0) + 1 }).eq('id', data.mvp_player_id));
      }

      // === CARTELLINI ===
      const currentMatchday = selectedMatch.matchday;
      const calculateSuspensionStartMatchday = (matchday) => matchday % 2 === 1 ? matchday + 2 : matchday + 1;

      for (const card of data.cards || []) {
        if (!card.player_id) continue;
        const player = allMatchPlayers.find(p => p.id === card.player_id);
        if (!player) continue;
        const playerName = getPlayerName(card.player_id, card.player_name);
        const playerTeamId = getPlayerTeamId(card.player_id, card.team_id);

        if (card.type === 'yellow') {
          const newYellowCount = (player.yellow_cards_accumulated || 0) + 1;
          operations.push(supabase.from('players').update({ yellow_cards_accumulated: newYellowCount }).eq('id', card.player_id));
          if (newYellowCount >= 2) {
            const suspensionStartMatchday = calculateSuspensionStartMatchday(currentMatchday);
            operations.push(supabase.from('player_statuses').insert({
              player_id: card.player_id, player_name: playerName, team_id: playerTeamId,
              status_type: 'suspended', matchdays_remaining: 1,
              reason: 'Squalifica per 2 ammonizioni', reason_type: 'yellow_card_accumulation',
              matchday_of_card: currentMatchday, suspension_start_matchday: suspensionStartMatchday
            }));
            operations.push(supabase.from('players').update({ yellow_cards_accumulated: 0 }).eq('id', card.player_id));
          }
        } else if (card.type === 'red') {
          const suspensionStartMatchday = calculateSuspensionStartMatchday(currentMatchday);
          const banRounds = card.rounds_ban || 1;
          operations.push(supabase.from('player_statuses').insert({
            player_id: card.player_id, player_name: playerName, team_id: playerTeamId,
            status_type: 'suspended', matchdays_remaining: banRounds,
            reason: `Espulsione diretta (${banRounds} giornate)`, reason_type: 'red_card_direct',
            matchday_of_card: currentMatchday, suspension_start_matchday: suspensionStartMatchday
          }));
        }
      }

      // === INFORTUNI ===
      for (const injury of data.injuries || []) {
        if (!injury.player_id) continue;
        const playerName = getPlayerName(injury.player_id, injury.player_name);
        const playerTeamId = getPlayerTeamId(injury.player_id, injury.team_id);
        const matchdaysOut = parseInt(injury.matchdays_out) || 1;
        const suspensionStartMatchday = calculateSuspensionStartMatchday(currentMatchday);
        operations.push(supabase.from('player_statuses').insert({
          player_id: injury.player_id, player_name: playerName, team_id: playerTeamId,
          status_type: 'injured', matchdays_remaining: matchdaysOut,
          reason: injury.reason && injury.reason.trim() ? injury.reason.trim() : 'Infortunio',
          reason_type: 'injury', matchday_of_card: currentMatchday, suspension_start_matchday: suspensionStartMatchday
        }));
        operations.push(supabase.from('players').update({ player_status: 'injured' }).eq('id', injury.player_id));
      }

      // === CLASSIFICA — fetch diretto, sempre dati freschi ===
      const { data: standingsData } = await supabase.from('standings').select('*').eq('league_id', selectedMatch.league_id);

      // Helper differenza reti
      const calcGD = (gf, ga) => (gf || 0) - (ga || 0);

      // ── Standing CASA ──
      const homeStanding = standingsData?.find(s => s.team_id === selectedMatch.home_team_id);
      if (homeStanding) {
        let oldPlayed = 0, oldWon = 0, oldDraw = 0, oldLost = 0, oldGF = 0, oldGA = 0, oldPts = 0;
        if (!isFirstSave && selectedMatch.home_score != null && selectedMatch.away_score != null) {
          oldPlayed = 1;
          const oH = selectedMatch.home_score, oA = selectedMatch.away_score;
          oldGF = oH; oldGA = oA;
          if (oH > oA) { oldWon = 1; oldPts = 3; }
          else if (oH === oA) { oldDraw = 1; oldPts = 1; }
          else { oldLost = 1; }
        }
        const newGF = (homeStanding.goals_for || 0) - oldGF + homeScore;
        const newGA = (homeStanding.goals_against || 0) - oldGA + awayScore;
        operations.push(supabase.from('standings').update({
          played:         (homeStanding.played  || 0) - oldPlayed + 1,
          won:            (homeStanding.won     || 0) - oldWon    + (homeScore > awayScore ? 1 : 0),
          drawn:          (homeStanding.drawn   || 0) - oldDraw   + (homeScore === awayScore ? 1 : 0),
          lost:           (homeStanding.lost    || 0) - oldLost   + (homeScore < awayScore ? 1 : 0),
          goals_for:      newGF,
          goals_against:  newGA,
          goal_difference: calcGD(newGF, newGA),
          points:         (homeStanding.points  || 0) - oldPts    + homePoints
        }).eq('id', homeStanding.id));
      } else {
        operations.push(supabase.from('standings').insert({
          league_id: selectedMatch.league_id,
          team_id: selectedMatch.home_team_id,
          team_name: homeTeam.name,
          played: 1,
          won:   homeScore > awayScore ? 1 : 0,
          drawn: homeScore === awayScore ? 1 : 0,
          lost:  homeScore < awayScore ? 1 : 0,
          goals_for: homeScore, goals_against: awayScore,
          goal_difference: calcGD(homeScore, awayScore),
          points: homePoints
        }));
      }

      // ── Standing OSPITE ──
      const awayStanding = standingsData?.find(s => s.team_id === selectedMatch.away_team_id);
      if (awayStanding) {
        let oldPlayed = 0, oldWon = 0, oldDraw = 0, oldLost = 0, oldGF = 0, oldGA = 0, oldPts = 0;
        if (!isFirstSave && selectedMatch.home_score != null && selectedMatch.away_score != null) {
          oldPlayed = 1;
          const oH = selectedMatch.home_score, oA = selectedMatch.away_score;
          oldGF = oA; oldGA = oH;
          if (oA > oH) { oldWon = 1; oldPts = 3; }
          else if (oH === oA) { oldDraw = 1; oldPts = 1; }
          else { oldLost = 1; }
        }
        const newGF = (awayStanding.goals_for || 0) - oldGF + awayScore;
        const newGA = (awayStanding.goals_against || 0) - oldGA + homeScore;
        operations.push(supabase.from('standings').update({
          played:         (awayStanding.played  || 0) - oldPlayed + 1,
          won:            (awayStanding.won     || 0) - oldWon    + (awayScore > homeScore ? 1 : 0),
          drawn:          (awayStanding.drawn   || 0) - oldDraw   + (homeScore === awayScore ? 1 : 0),
          lost:           (awayStanding.lost    || 0) - oldLost   + (awayScore < homeScore ? 1 : 0),
          goals_for:      newGF,
          goals_against:  newGA,
          goal_difference: calcGD(newGF, newGA),
          points:         (awayStanding.points  || 0) - oldPts    + awayPoints
        }).eq('id', awayStanding.id));
      } else {
        operations.push(supabase.from('standings').insert({
          league_id: selectedMatch.league_id,
          team_id: selectedMatch.away_team_id,
          team_name: awayTeam.name,
          played: 1,
          won:   awayScore > homeScore ? 1 : 0,
          drawn: homeScore === awayScore ? 1 : 0,
          lost:  awayScore < homeScore ? 1 : 0,
          goals_for: awayScore, goals_against: homeScore,
          goal_difference: calcGD(awayScore, homeScore),
          points: awayPoints
        }));
      }

      await Promise.all(operations);

      // === SCADENZA SQUALIFICHE/INFORTUNI ===
      // Per ogni giocatore delle due squadre, se ha uno status attivo
      // e questa è la giornata in cui scade (suspension_start_matchday <= currentMatchday),
      // decrementa matchdays_remaining e rimuovi se arriva a 0
      if (isFirstSave) {
        const allTeamPlayerIds = allMatchPlayers.map(p => p.id);
        const activeStatuses = playerStatuses.filter(s =>
          allTeamPlayerIds.includes(s.player_id) &&
          s.suspension_start_matchday != null &&
          s.suspension_start_matchday <= currentMatchday
        );
        for (const status of activeStatuses) {
          const newRemaining = (status.matchdays_remaining || 1) - 1;
          if (newRemaining <= 0) {
            await supabase.from('player_statuses').delete().eq('id', status.id);
            if (status.status_type === 'injured') {
              await supabase.from('players').update({ player_status: null }).eq('id', status.player_id);
            }
          } else {
            await supabase.from('player_statuses').update({ matchdays_remaining: newRemaining }).eq('id', status.id);
          }
        }
      }

      // === PREMI BUDGET ===
      // Solo al primo salvataggio del report (non alle modifiche)
      if (isFirstSave) {
        const PRIZE_BASE = 3000000;   // 3M a entrambe le squadre
        const PRIZE_WIN  = 1000000;   // +1M a chi vince
        const PRIZE_DRAW = 500000;    // +500K in caso di pareggio

        const homePrize = PRIZE_BASE + (homeScore > awayScore ? PRIZE_WIN : homeScore === awayScore ? PRIZE_DRAW : 0);
        const awayPrize = PRIZE_BASE + (awayScore > homeScore ? PRIZE_WIN : homeScore === awayScore ? PRIZE_DRAW : 0);

        // Recupera budget aggiornato delle squadre da Supabase
        const { data: homeTeamFresh } = await supabase.from('teams').select('budget').eq('id', homeTeam.id).single();
        const { data: awayTeamFresh } = await supabase.from('teams').select('budget').eq('id', awayTeam.id).single();
        const homePrevBudget = homeTeamFresh?.budget || homeTeam.budget || 0;
        const awayPrevBudget = awayTeamFresh?.budget || awayTeam.budget || 0;

        // Aggiorna budget casa
        const newHomeBudget = homePrevBudget + homePrize;
        await supabase.from('teams').update({ budget: newHomeBudget }).eq('id', homeTeam.id);
        await supabase.from('budget_transactions').insert({
          team_id: homeTeam.id, team_name: homeTeam.name,
          amount: homePrize, type: 'match_prize',
          description: `Premio partita G${currentMatchday} vs ${awayTeam.name} (${homeScore}-${awayScore})`,
          previous_balance: homePrevBudget, new_balance: newHomeBudget,
          league_id: selectedMatch.league_id
        });

        // Aggiorna budget ospite
        const newAwayBudget = awayPrevBudget + awayPrize;
        await supabase.from('teams').update({ budget: newAwayBudget }).eq('id', awayTeam.id);
        await supabase.from('budget_transactions').insert({
          team_id: awayTeam.id, team_name: awayTeam.name,
          amount: awayPrize, type: 'match_prize',
          description: `Premio partita G${currentMatchday} vs ${homeTeam.name} (${awayScore}-${homeScore})`,
          previous_balance: awayPrevBudget, new_balance: newAwayBudget,
          league_id: selectedMatch.league_id
        });
      }

      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['standings'] });
      queryClient.invalidateQueries({ queryKey: ['playerStatuses'] });

      toast.dismiss(loadingToast);
      toast.success('Risultato salvato! Classifica aggiornata');
      setShowReportForm(false);
      setSelectedMatch(null);

    } catch (error) {
      toast.dismiss(loadingToast);
      console.error('Errore critico salvataggio:', error);
      toast.error(`Errore: ${error.message || 'Salvataggio fallito'}`);
      throw error;
    }
  };

  const knockoutCompetition = competitions.find(c => c.league_id === selectedLeague && c.format === 'knockout');
  const knockoutMatches = knockoutCompetition ? matches.filter(m => m.competition_id === knockoutCompetition.id) : [];
  const getTeam = (teamId) => teams.find(t => t.id === teamId);
  const getTeamPlayers = (teamId) => players.filter(p => p.team_id === teamId);
  const openMatchDetails = (match) => { setSelectedMatch(match); setShowMatchDetails(true); };
  const currentLeague = leagues.find(l => l.id === selectedLeague);
  const seasonMatches = matches.filter(m => m.season === currentLeague?.season && m.status === 'completed');

  const leagueMatches = matches.filter(m => m.league_id === selectedLeague);

  // Giornata massima visibile: manual override o ultima completata + 1
  const visibleUpToMatchday = (() => {
    if (!currentLeague) return Infinity;
    if (currentLeague.current_matchday && currentLeague.current_matchday > 0) return currentLeague.current_matchday;
    const completed = leagueMatches.filter(m => m.status === 'completed');
    if (completed.length === 0) return 1;
    return Math.max(...completed.map(m => m.matchday)) + 1;
  })();

  const matchdays = [...new Set(leagueMatches.map(m => m.matchday))]
    .filter(d => d <= visibleUpToMatchday)
    .sort((a, b) => a - b);
  const currentMatchdayMatches = leagueMatches.filter(m => m.matchday === selectedMatchday);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Competizioni</h1>
          <p className="text-slate-500">Classifiche e calendario delle competizioni</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedLeague} onValueChange={setSelectedLeague}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Seleziona lega" /></SelectTrigger>
            <SelectContent>
              {leagues.map(league => <SelectItem key={league.id} value={league.id}>{league.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {isAdmin && leagueMatches.length === 0 && (
            <Button onClick={() => setShowFormatDialog(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <CalendarIcon className="w-4 h-4 mr-2" />Genera Calendario
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="classifica" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="classifica">Classifica</TabsTrigger>
          <TabsTrigger value="statistiche">Statistiche</TabsTrigger>
          <TabsTrigger value="halloffame">🏆 Hall of Fame</TabsTrigger>
          {knockoutCompetition && <TabsTrigger value="tabellone">Tabellone</TabsTrigger>}
        </TabsList>
        <TabsContent value="classifica">
          <StandingsTable standings={standings} teams={teams} leagueName={currentLeague?.name || ''} />
        </TabsContent>
        <TabsContent value="statistiche">
          <SeasonStats matches={seasonMatches} players={players} playerStatuses={playerStatuses} />
        </TabsContent>
        <TabsContent value="halloffame">
          <HallOfFame players={players} teams={teams} />
        </TabsContent>
        {knockoutCompetition && (
          <TabsContent value="tabellone">
            <KnockoutBracket matches={knockoutMatches} teams={teams} competition={knockoutCompetition} />
          </TabsContent>
        )}
      </Tabs>

      {matchdays.length > 0 && (
        <Card className="bg-white border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setSelectedMatchday(Math.max(1, selectedMatchday - 1))} disabled={selectedMatchday === 1}>
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <div className="flex items-center gap-2 overflow-x-auto py-2">
                {matchdays.map(day => (
                  <Button key={day} variant={selectedMatchday === day ? 'default' : 'ghost'} size="sm"
                    onClick={() => setSelectedMatchday(day)}
                    className={selectedMatchday === day ? 'bg-emerald-600 hover:bg-emerald-700' : ''}>
                    G{day}
                  </Button>
                ))}
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelectedMatchday(Math.min(matchdays.length, selectedMatchday + 1))} disabled={selectedMatchday === matchdays.length}>
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">Giornata {selectedMatchday}</h2>
        {currentMatchdayMatches.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {currentMatchdayMatches.map(match => {
              const homeTeam = getTeam(match.home_team_id);
              const awayTeam = getTeam(match.away_team_id);
              return (
                <Card key={match.id} className="bg-white border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => openMatchDetails(match)}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 text-center">
                        <div className="w-16 h-16 rounded-xl mx-auto mb-2 flex items-center justify-center p-2"
                          style={{ backgroundColor: homeTeam?.primary_color || '#10B981' }}>
                          {homeTeam?.logo_url
                            ? <img src={homeTeam.logo_url} alt={homeTeam.name} className="w-full h-full object-contain" />
                            : <span className="text-white font-bold text-xl">{homeTeam?.name?.charAt(0) || '?'}</span>}
                        </div>
                        <p className="font-semibold text-slate-800 text-sm">{homeTeam?.name || 'TBD'}</p>
                      </div>
                      <div className="px-4">
                        {match.status === 'completed' ? (
                          <div className="text-center">
                            <div className="flex items-center gap-2 text-2xl font-bold">
                              <span className="text-slate-800">{match.home_score}</span>
                              <span className="text-slate-300">-</span>
                              <span className="text-slate-800">{match.away_score}</span>
                            </div>
                            <Badge className="mt-2 bg-emerald-100 text-emerald-700 text-xs">Conclusa</Badge>
                          </div>
                        ) : match.status === 'in_progress' ? (
                          <div className="text-center">
                            <Badge className="bg-amber-100 text-amber-700 text-xs"><Play className="w-3 h-3 mr-1" />In corso</Badge>
                          </div>
                        ) : (
                          <div className="text-center">
                            <p className="text-xl font-bold text-slate-300">vs</p>
                            <Badge variant="outline" className="mt-2 text-xs">Da giocare</Badge>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 text-center">
                        <div className="w-16 h-16 rounded-xl mx-auto mb-2 flex items-center justify-center p-2"
                          style={{ backgroundColor: awayTeam?.primary_color || '#3B82F6' }}>
                          {awayTeam?.logo_url
                            ? <img src={awayTeam.logo_url} alt={awayTeam.name} className="w-full h-full object-contain" />
                            : <span className="text-white font-bold text-xl">{awayTeam?.name?.charAt(0) || '?'}</span>}
                        </div>
                        <p className="font-semibold text-slate-800 text-sm">{awayTeam?.name || 'TBD'}</p>
                      </div>
                    </div>
                    {match.status === 'completed' && (
                      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-center gap-4 text-sm text-slate-500">
                        {match.mvp_player_name && <span className="flex items-center gap-1"><Trophy className="w-4 h-4 text-amber-500" />MVP: {match.mvp_player_name}</span>}
                        {match.photos?.length > 0 && <span className="flex items-center gap-1"><Image className="w-4 h-4" />{match.photos.length} foto</span>}
                        {match.stream_link && <span className="flex items-center gap-1"><Youtube className="w-4 h-4 text-red-500" />Video</span>}
                      </div>
                    )}
                    {(match.status !== 'completed' || isAdmin) && (isAdmin || userTeam?.id === match.home_team_id || userTeam?.id === match.away_team_id) && (
                      <div className="mt-4 pt-4 border-t border-slate-100 flex justify-center">
                        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setSelectedMatch(match); setShowReportForm(true); }}>
                          <FileEdit className="w-4 h-4 mr-2" />{match.status === 'completed' ? 'Modifica Risultato' : 'Inserisci Risultato'}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="bg-slate-50 border-dashed">
            <CardContent className="py-12 text-center">
              <CalendarIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Nessuna partita in questa giornata</p>
            </CardContent>
          </Card>
        )}
      </div>

      {selectedMatch && (
        <MatchReportForm
          open={showReportForm}
          onClose={() => { setShowReportForm(false); setSelectedMatch(null); }}
          match={selectedMatch}
          homeTeam={getTeam(selectedMatch.home_team_id)}
          awayTeam={getTeam(selectedMatch.away_team_id)}
          homePlayers={getTeamPlayers(selectedMatch.home_team_id)}
          awayPlayers={getTeamPlayers(selectedMatch.away_team_id)}
          onSubmit={handleReportSubmit}
          readOnly={selectedMatch.status === 'completed' && !isAdmin}
          isController={isController}
        />
      )}

      <Dialog open={showMatchDetails} onOpenChange={(open) => { setShowMatchDetails(open); if (!open) setMatchPhotoWarnings([]); }}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          {selectedMatch && (
            <>
              <DialogHeader><DialogTitle>Dettagli Partita</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="text-center py-4">
                  <div className="flex items-center justify-center gap-4 text-3xl font-bold">
                    <span>{getTeam(selectedMatch.home_team_id)?.name}</span>
                    <span className="text-emerald-600">{selectedMatch.home_score ?? 0}</span>
                    <span className="text-slate-300">-</span>
                    <span className="text-emerald-600">{selectedMatch.away_score ?? 0}</span>
                    <span>{getTeam(selectedMatch.away_team_id)?.name}</span>
                  </div>
                </div>
                {selectedMatch.scorers?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-2">Marcatori</h4>
                    <div className="space-y-1">
                      {selectedMatch.scorers.map((scorer, idx) => (
                        <p key={idx} className="text-sm text-slate-600">{scorer.player_name} {scorer.minute && `(${scorer.minute}')`}</p>
                      ))}
                    </div>
                  </div>
                )}
                {selectedMatch.mvp_player_name && (
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-500" />
                    <span className="font-semibold">MVP:</span>
                    <span>{selectedMatch.mvp_player_name}</span>
                  </div>
                )}
                {selectedMatch.cards?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-2">Cartellini</h4>
                    <div className="space-y-1">
                      {selectedMatch.cards.map((card, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <div className={`w-4 h-5 rounded ${card.type === 'yellow' ? 'bg-yellow-400' : 'bg-red-600'}`} />
                          <span className="text-slate-700">{card.player_name}</span>
                          {card.rounds_ban > 0 && <Badge variant="outline" className="text-xs">{card.rounds_ban} giornate</Badge>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedMatch.injuries?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-2">Infortuni</h4>
                    <div className="space-y-1">
                      {selectedMatch.injuries.map((injury, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm">
                          <span className="text-slate-700">{injury.player_name}</span>
                          {injury.matchdays_out > 0 && <Badge variant="outline" className="text-xs">{injury.matchdays_out} giornate</Badge>}
                          {injury.reason && <span className="text-slate-500">- {injury.reason}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedMatch.photos?.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-slate-800 mb-2">Foto</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {selectedMatch.photos.map((photo, idx) => (
                        <img key={idx} src={photo} alt="" className="w-full h-20 object-cover rounded-lg" />
                      ))}
                    </div>
                    {(isAdmin || isController) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full mt-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                        onClick={() => analyzeMatchPhotosAI(selectedMatch)}
                        disabled={analyzingMatchPhotos}
                      >
                        {analyzingMatchPhotos
                          ? <><span className="animate-spin mr-2">⏳</span>Analisi AI in corso...</>
                          : <><ScanSearch className="w-4 h-4 mr-2" />Analizza foto — rileva squalificati/infortunati</>
                        }
                      </Button>
                    )}
                    {matchPhotoWarnings.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {matchPhotoWarnings.map((w, i) => (
                          <div key={i} className={`flex items-start gap-2 p-2 rounded-lg text-xs ${w.reason === 'squalificato' ? 'bg-red-50 border border-red-200' : 'bg-orange-50 border border-orange-200'}`}>
                            <AlertTriangle className={`w-3 h-3 mt-0.5 shrink-0 ${w.reason === 'squalificato' ? 'text-red-500' : 'text-orange-500'}`} />
                            <div>
                              <span className="font-semibold">{w.name}</span>
                              <span className={`ml-1 px-1 rounded text-xs ${w.reason === 'squalificato' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>{w.reason?.toUpperCase()}</span>
                              {w.detail && <p className="text-slate-500 mt-0.5">{w.detail}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {selectedMatch.stream_link && (
                  <Button variant="outline" className="w-full" onClick={() => window.open(selectedMatch.stream_link, '_blank')}>
                    <Youtube className="w-4 h-4 mr-2 text-red-500" />Guarda la diretta
                  </Button>
                )}
              </div>
              <DialogFooter>
                {selectedMatch.status === 'completed' && isAdmin && (
                  <Button variant="outline" onClick={() => { setShowMatchDetails(false); setShowReportForm(true); }}>
                    <FileEdit className="w-4 h-4 mr-2" />Modifica Report
                  </Button>
                )}
                <Button onClick={() => setShowMatchDetails(false)}>Chiudi</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog selezione formato competizione */}
      <Dialog open={showFormatDialog} onOpenChange={setShowFormatDialog}>
        <DialogContent className="sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>Seleziona Formato Competizione</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {Object.entries(FORMAT_LABELS).map(([key, info]) => (
              <div
                key={key}
                onClick={() => setSelectedFormat(key)}
                className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  selectedFormat === key
                    ? 'border-emerald-500 bg-emerald-50'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <span className="text-2xl">{info.icon}</span>
                <div className="flex-1">
                  <p className="font-semibold text-slate-800">{info.label}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{info.description}</p>
                  <p className="text-xs text-slate-400 mt-1">Min. {info.minTeams} squadre</p>
                </div>
                {selectedFormat === key && (
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFormatDialog(false)}>Annulla</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={handleGenerateCalendar}
              disabled={createMatchesMutation.isPending}
            >
              {createMatchesMutation.isPending
                ? <><CalendarIcon className="w-4 h-4 mr-2 animate-spin" />Generazione...</>
                : <><CalendarIcon className="w-4 h-4 mr-2" />Genera</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}