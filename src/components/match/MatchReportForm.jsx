import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Trophy, Star, Upload, Youtube, Image as ImageIcon, Ambulance, ScanSearch, AlertTriangle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

export default function MatchReportForm({ open, onClose, match, homeTeam, awayTeam, homePlayers, awayPlayers, onSubmit, readOnly = false, isController = false }) {
  const [formData, setFormData] = useState({
    home_score: match?.home_score || 0,
    away_score: match?.away_score || 0,
    scorers: match?.scorers || [],
    assists: match?.assists || [],
    mvp_player_id: match?.mvp_player_id || '',
    mvp_player_name: match?.mvp_player_name || '',
    home_goalkeeper_id: match?.home_goalkeeper_id || '',
    home_goalkeeper_rating: match?.home_goalkeeper_rating || '',
    away_goalkeeper_id: match?.away_goalkeeper_id || '',
    away_goalkeeper_rating: match?.away_goalkeeper_rating || '',
    cards: match?.cards || [],
    injuries: match?.injuries || [],
    photos: match?.photos || [],
    stream_link: match?.stream_link || '',
    notes: match?.notes || '',
  });
  const [loading, setLoading] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [analyzingPhotos, setAnalyzingPhotos] = useState(false);
  const [aiWarnings, setAiWarnings] = useState([]);

  // Giocatori squalificati o infortunati
  const { data: playerStatuses = [] } = useQuery({
    queryKey: ['playerStatusesMatchForm'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('player_statuses')
        .select('*')
        .in('status_type', ['suspended', 'injured']);
      if (error) throw error;
      return data || [];
    }
  });

  // Analisi foto con Claude Vision
  const analyzePhotosWithAI = async () => {
    if (formData.photos.length === 0) {
      toast.error('Carica almeno una foto prima di analizzare');
      return;
    }

    // Costruisci lista giocatori a rischio (squalificati/infortunati)
    const riskyPlayerIds = playerStatuses.map(s => s.player_id);
    const riskyPlayers = allPlayers.filter(p => riskyPlayerIds.includes(p.id));

    if (riskyPlayers.length === 0) {
      toast.info('Nessun giocatore squalificato o infortunato registrato al momento');
      return;
    }

    setAnalyzingPhotos(true);
    setAiWarnings([]);

    try {
      // Converti le foto in base64
      const imageContents = [];
      const hasPhotos = formData.photos.length > 0;

      if (hasPhotos) {
        // Usa le foto caricate (max 10)
        for (const photoUrl of formData.photos.slice(0, 10)) {
          try {
            const proxyUrl = `/api/proxy-image?url=${encodeURIComponent(photoUrl)}`;
            const res = await fetch(proxyUrl);
          const blob = await res.blob();
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(blob);
          });
          const mediaType = blob.type || 'image/jpeg';
          imageContents.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
          } catch (e) {
            console.warn('Impossibile caricare foto:', photoUrl, e.message);
          }
        }
      } else if (formData.stream_link) {
        // Nessuna foto — usa thumbnail YouTube
        const ytMatch = formData.stream_link.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) {
          try {
            const res = await fetch(`https://img.youtube.com/vi/${ytMatch[1]}/maxresdefault.jpg`);
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

      if (imageContents.length === 0) {
        toast.error('Nessuna foto o thumbnail disponibile per l'analisi.');
        setAnalyzingPhotos(false);
        return;
      }

      const riskyNames = riskyPlayers.map(p => {
        const status = playerStatuses.find(s => s.player_id === p.id);
        return `${p.first_name} ${p.last_name} (${status?.status_type === 'suspended' ? 'SQUALIFICATO' : 'INFORTUNATO'})`;
      }).join('\n');

      const prompt = `Analizza queste foto di una partita di calcio.
Cerca nei tabellini, nei nomi sulle maglie, nelle grafiche a schermo, o in qualsiasi testo visibile i seguenti giocatori che NON dovrebbero essere in campo perché squalificati o infortunati:

${riskyNames}

Rispondi SOLO in formato JSON, senza testo aggiuntivo:
{
  "found": [
    { "name": "Nome Cognome", "reason": "squalificato" o "infortunato", "confidence": "high" o "medium" o "low", "detail": "breve descrizione di dove/come è stato identificato" }
  ],
  "message": "breve riassunto"
}
Se non trovi nessun giocatore a rischio, rispondi con found: [].`;

      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              ...imageContents,
              { type: 'text', text: prompt }
            ]
          }]
        })
      });

      if (!response.ok) throw new Error('Errore risposta AI: ' + response.status);

      const data = await response.json();
      const text = data.content?.[0]?.text || '';

      let parsed;
      try {
        const clean = text.replace(/```json|```/g, '').trim();
        parsed = JSON.parse(clean);
      } catch {
        toast.error('Risposta AI non leggibile');
        setAnalyzingPhotos(false);
        return;
      }

      if (parsed.found && parsed.found.length > 0) {
        setAiWarnings(parsed.found);
        toast.warning(`⚠️ Trovati ${parsed.found.length} giocatore/i a rischio nelle foto!`);
      } else {
        setAiWarnings([]);
        toast.success('✅ Nessun giocatore squalificato/infortunato rilevato nelle foto');
      }

    } catch (e) {
      toast.error('Errore analisi AI: ' + e.message);
    }

    setAnalyzingPhotos(false);
  };

  const allPlayers = [...(homePlayers || []), ...(awayPlayers || [])];
  const homeGoalkeepers = homePlayers?.filter(p => p.role === 'POR') || [];
  const awayGoalkeepers = awayPlayers?.filter(p => p.role === 'POR') || [];

  // Auto-generate scorer slots when score changes
  useEffect(() => {
    if (!homeTeam || !awayTeam) return;
    
    const homeScore = parseInt(formData.home_score) || 0;
    const awayScore = parseInt(formData.away_score) || 0;
    const totalGoals = homeScore + awayScore;
    
    if (totalGoals !== formData.scorers.length) {
      const newScorers = [];
      for (let i = 0; i < homeScore; i++) {
        newScorers.push(formData.scorers[i] || { player_id: '', player_name: '', team_id: homeTeam.id, minute: '' });
      }
      for (let i = 0; i < awayScore; i++) {
        newScorers.push(formData.scorers[homeScore + i] || { player_id: '', player_name: '', team_id: awayTeam.id, minute: '' });
      }
      setFormData(prev => ({ ...prev, scorers: newScorers }));
    }
  }, [formData.home_score, formData.away_score, homeTeam, awayTeam]);

  const addScorer = () => {
    setFormData({
      ...formData,
      scorers: [...formData.scorers, { player_id: '', player_name: '', team_id: '', minute: '' }]
    });
  };

  const removeScorer = (index) => {
    setFormData({
      ...formData,
      scorers: formData.scorers.filter((_, i) => i !== index)
    });
  };

  const updateScorer = (index, field, value) => {
    const newScorers = [...formData.scorers];
    newScorers[index] = { ...newScorers[index], [field]: value };
    
    if (field === 'player_id') {
      const player = allPlayers.find(p => p.id === value);
      if (player) {
        newScorers[index].player_name = `${player.first_name} ${player.last_name}`;
        newScorers[index].team_id = player.team_id;
      }
    }
    
    setFormData({ ...formData, scorers: newScorers });
  };

  const addAssist = () => {
    setFormData({
      ...formData,
      assists: [...formData.assists, { player_id: '', player_name: '', team_id: '' }]
    });
  };

  const removeAssist = (index) => {
    setFormData({
      ...formData,
      assists: formData.assists.filter((_, i) => i !== index)
    });
  };

  const updateAssist = (index, field, value) => {
    const newAssists = [...formData.assists];
    newAssists[index] = { ...newAssists[index], [field]: value };
    
    if (field === 'player_id') {
      const player = allPlayers.find(p => p.id === value);
      if (player) {
        newAssists[index].player_name = `${player.first_name} ${player.last_name}`;
        newAssists[index].team_id = player.team_id;
      }
    }
    
    setFormData({ ...formData, assists: newAssists });
  };

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (formData.photos.length + files.length > 10) {
      toast.error('Massimo 10 foto per partita');
      return;
    }

    setUploadingPhoto(true);
    const newPhotos = [];
    try {
      for (const file of files) {
        const formPayload = new FormData();
        formPayload.append('file', file);
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formPayload,
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Errore upload');
        }
        const data = await res.json();
        newPhotos.push(data.url);
      }
      setFormData(prev => ({ ...prev, photos: [...prev.photos, ...newPhotos] }));
      toast.success(`${newPhotos.length} foto caricate`);
    } catch (error) {
      toast.error('Errore caricamento foto: ' + error.message);
    }
    setUploadingPhoto(false);
  };

  const removePhoto = (index) => {
    setFormData({
      ...formData,
      photos: formData.photos.filter((_, i) => i !== index)
    });
  };

  const handleMvpChange = (playerId) => {
    if (playerId && playerId !== 'none') {
      const player = allPlayers.find(p => p.id === playerId);
      setFormData({
        ...formData,
        mvp_player_id: playerId,
        mvp_player_name: player ? `${player.first_name} ${player.last_name}` : ''
      });
    } else {
      setFormData({
        ...formData,
        mvp_player_id: '',
        mvp_player_name: ''
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Prepara i dati per l'aggiornamento della partita
      const matchData = {
        home_score: parseInt(formData.home_score) || 0,
        away_score: parseInt(formData.away_score) || 0,
        scorers: formData.scorers.filter(s => s.player_id),
        assists: formData.assists.filter(a => a && a.player_id),
        mvp_player_id: formData.mvp_player_id || null,
        mvp_player_name: formData.mvp_player_name || null,
        home_goalkeeper_id: formData.home_goalkeeper_id || null,
        home_goalkeeper_rating: formData.home_goalkeeper_rating ? parseFloat(formData.home_goalkeeper_rating) : null,
        away_goalkeeper_id: formData.away_goalkeeper_id || null,
        away_goalkeeper_rating: formData.away_goalkeeper_rating ? parseFloat(formData.away_goalkeeper_rating) : null,
        cards: formData.cards || [],
        injuries: formData.injuries || [],
        photos: formData.photos || [],
        stream_link: formData.stream_link || '',
        notes: formData.notes || '',
        status: 'completed'
      };

      // Aggiorna la partita e attendi il completamento
      await onSubmit(matchData);
      
      // Chiudi il modal dopo il successo
      setLoading(false);
      onClose();
      
    } catch (error) {
      console.error('Errore nel salvataggio:', error);
      toast.error('Errore nel salvataggio: ' + (error.message || 'Errore sconosciuto'));
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            {readOnly ? 'Visualizza Report Partita' : 'Report Partita'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Risultato */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Risultato</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-600 mb-2">{homeTeam?.name || 'Casa'}</p>
                  <Input
                    type="number"
                    min="0"
                    value={formData.home_score}
                    onChange={(e) => setFormData({ ...formData, home_score: e.target.value })}
                    className="w-20 text-center text-2xl font-bold"
                    disabled={readOnly}
                  />
                </div>
                <span className="text-2xl font-bold text-slate-300">-</span>
                <div className="text-center">
                  <p className="text-sm font-medium text-slate-600 mb-2">{awayTeam?.name || 'Ospite'}</p>
                  <Input
                    type="number"
                    min="0"
                    value={formData.away_score}
                    onChange={(e) => setFormData({ ...formData, away_score: e.target.value })}
                    className="w-20 text-center text-2xl font-bold"
                    disabled={readOnly}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Marcatori */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">
                Marcatori {formData.scorers.length > 0 && `(${formData.scorers.length} gol)`}
              </CardTitle>
              <p className="text-xs text-slate-500">Gli slot si generano automaticamente in base al punteggio</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {formData.scorers.map((scorer, index) => {
                const isHomeTeamGoal = index < parseInt(formData.home_score);
                const teamPlayers = isHomeTeamGoal ? homePlayers : awayPlayers;
                const teamName = isHomeTeamGoal ? homeTeam?.name : awayTeam?.name;
                
                return (
                  <div key={index} className="space-y-2 p-3 bg-slate-50 rounded-lg">
                    <div className="text-xs font-medium text-slate-600">{teamName} - Gol #{index + 1}</div>
                    <div className="flex gap-2 items-center">
                      <Select value={scorer.player_id} onValueChange={(v) => updateScorer(index, 'player_id', v)} disabled={readOnly}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Marcatore" />
                        </SelectTrigger>
                        <SelectContent>
                          {teamPlayers?.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.first_name} {p.last_name} ({p.role})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="Min"
                        value={scorer.minute}
                        onChange={(e) => updateScorer(index, 'minute', e.target.value)}
                        className="w-20"
                        disabled={readOnly}
                      />
                    </div>
                  </div>
                );
              })}
              {formData.scorers.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">Inserisci il punteggio per generare gli slot marcatori</p>
              )}
            </CardContent>
          </Card>

          {/* Assist */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Assist (Opzionali)</CardTitle>
              <p className="text-xs text-slate-500">Collega ogni assist al rispettivo gol</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {formData.scorers.map((scorer, index) => (
                <div key={index} className="space-y-2 p-3 bg-slate-50 rounded-lg">
                  <div className="text-xs font-medium text-slate-600">
                    Gol #{index + 1} - {scorer.player_name || 'Non assegnato'}
                  </div>
                  <Select 
                    value={formData.assists[index]?.player_id || ''} 
                    onValueChange={(v) => {
                      const newAssists = [...formData.assists];
                      if (v && v !== 'none') {
                        const player = allPlayers.find(p => p.id === v);
                        newAssists[index] = {
                          player_id: v,
                          player_name: player ? `${player.first_name} ${player.last_name}` : '',
                          team_id: player?.team_id || ''
                        };
                      } else {
                        newAssists[index] = null;
                      }
                      setFormData({ ...formData, assists: newAssists });
                    }}
                    disabled={readOnly}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Nessun assist" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessun assist</SelectItem>
                      {allPlayers.filter(p => p.team_id === scorer.team_id).map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.first_name} {p.last_name} ({p.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
              {formData.scorers.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-2">Inserisci prima i marcatori</p>
              )}
            </CardContent>
          </Card>

          {/* MVP e Voti Portieri */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-500" />
                MVP e Voti
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>MVP della partita</Label>
                <Select value={formData.mvp_player_id || 'none'} onValueChange={handleMvpChange} disabled={readOnly}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona MVP" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nessun MVP</SelectItem>
                    {allPlayers.map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.first_name} {p.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Portiere {homeTeam?.name}</Label>
                  <Select value={formData.home_goalkeeper_id || 'none'} onValueChange={(v) => {
                    if (v && v !== 'none') {
                      setFormData({ ...formData, home_goalkeeper_id: v });
                    } else {
                      setFormData({ ...formData, home_goalkeeper_id: '', home_goalkeeper_rating: '' });
                    }
                  }} disabled={readOnly}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona portiere" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessun portiere</SelectItem>
                      {homeGoalkeepers.map(gk => (
                        <SelectItem key={gk.id} value={gk.id}>
                          {gk.first_name} {gk.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    value={formData.home_goalkeeper_rating}
                    onChange={(e) => setFormData({ ...formData, home_goalkeeper_rating: e.target.value })}
                    placeholder="Voto (1-10)"
                    disabled={readOnly}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Portiere {awayTeam?.name}</Label>
                  <Select value={formData.away_goalkeeper_id || 'none'} onValueChange={(v) => {
                    if (v && v !== 'none') {
                      setFormData({ ...formData, away_goalkeeper_id: v });
                    } else {
                      setFormData({ ...formData, away_goalkeeper_id: '', away_goalkeeper_rating: '' });
                    }
                  }} disabled={readOnly}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleziona portiere" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nessun portiere</SelectItem>
                      {awayGoalkeepers.map(gk => (
                        <SelectItem key={gk.id} value={gk.id}>
                          {gk.first_name} {gk.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    value={formData.away_goalkeeper_rating}
                    onChange={(e) => setFormData({ ...formData, away_goalkeeper_rating: e.target.value })}
                    placeholder="Voto (1-10)"
                    disabled={readOnly}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cartellini */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Cartellini (Opzionali)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {formData.cards.map((card, index) => (
                <div key={index} className="flex gap-2 items-center p-3 bg-slate-50 rounded-lg">
                  <Select value={card.player_id} onValueChange={(v) => {
                    const player = allPlayers.find(p => p.id === v);
                    const newCards = [...formData.cards];
                    newCards[index] = {
                      ...newCards[index],
                      player_id: v,
                      player_name: player ? `${player.first_name} ${player.last_name}` : '',
                      team_id: player?.team_id || ''
                    };
                    setFormData({ ...formData, cards: newCards });
                  }} disabled={readOnly}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Giocatore" />
                    </SelectTrigger>
                    <SelectContent>
                      {allPlayers.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.first_name} {p.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={card.type} onValueChange={(v) => {
                    const newCards = [...formData.cards];
                    newCards[index].type = v;
                    setFormData({ ...formData, cards: newCards });
                  }} disabled={readOnly}>
                    <SelectTrigger className="w-24">
                      <SelectValue placeholder="Tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yellow">🟨 Giallo</SelectItem>
                      <SelectItem value="red">🟥 Rosso</SelectItem>
                    </SelectContent>
                  </Select>
                  {card.type === 'red' && (
                    <Input
                      type="number"
                      min="1"
                      placeholder="Giornate"
                      value={card.rounds_ban || 1}
                      onChange={(e) => {
                        const newCards = [...formData.cards];
                        newCards[index].rounds_ban = parseInt(e.target.value) || 1;
                        setFormData({ ...formData, cards: newCards });
                      }}
                      className="w-24"
                      disabled={readOnly}
                    />
                  )}
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setFormData({ ...formData, cards: formData.cards.filter((_, i) => i !== index) })}
                    >
                      <Trash2 className="w-4 h-4 text-rose-500" />
                    </Button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData({ 
                    ...formData, 
                    cards: [...formData.cards, { player_id: '', player_name: '', team_id: '', type: 'yellow', rounds_ban: 1 }] 
                  })}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi Cartellino
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Infortuni */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Ambulance className="w-4 h-4 text-red-500" />
                Infortuni (Opzionali)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {formData.injuries.map((injury, index) => (
                <div key={index} className="flex gap-2 items-center p-3 bg-red-50 rounded-lg">
                  <Select value={injury.player_id} onValueChange={(v) => {
                    const player = allPlayers.find(p => p.id === v);
                    const newInjuries = [...formData.injuries];
                    newInjuries[index] = {
                      ...newInjuries[index],
                      player_id: v,
                      player_name: player ? `${player.first_name} ${player.last_name}` : '',
                      team_id: player?.team_id || ''
                    };
                    setFormData({ ...formData, injuries: newInjuries });
                  }} disabled={readOnly}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Giocatore" />
                    </SelectTrigger>
                    <SelectContent>
                      {allPlayers.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.first_name} {p.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Giornate"
                    value={injury.matchdays_out || 1}
                    onChange={(e) => {
                      const newInjuries = [...formData.injuries];
                      newInjuries[index].matchdays_out = parseInt(e.target.value) || 1;
                      setFormData({ ...formData, injuries: newInjuries });
                    }}
                    className="w-24"
                    disabled={readOnly}
                  />
                  <Input
                    type="text"
                    placeholder="Tipo infortunio"
                    value={injury.reason || ''}
                    onChange={(e) => {
                      const newInjuries = [...formData.injuries];
                      newInjuries[index].reason = e.target.value;
                      setFormData({ ...formData, injuries: newInjuries });
                    }}
                    className="flex-1"
                    disabled={readOnly}
                  />
                  {!readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setFormData({ ...formData, injuries: formData.injuries.filter((_, i) => i !== index) })}
                    >
                      <Trash2 className="w-4 h-4 text-rose-500" />
                    </Button>
                  )}
                </div>
              ))}
              {!readOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setFormData({ 
                    ...formData, 
                    injuries: [...formData.injuries, { player_id: '', player_name: '', team_id: '', reason: '', matchdays_out: 1 }] 
                  })}
                  className="w-full"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Aggiungi Infortunio
                </Button>
              )}
            </CardContent>
          </Card>

          {/* Media Gallery */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-blue-500" />
                Media Gallery
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Foto partita (max 10)</Label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {formData.photos.map((photo, index) => (
                    <div key={index} className="relative group">
                      <img src={photo} alt="" className="w-20 h-20 object-cover rounded-lg" />
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {!readOnly && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      disabled={uploadingPhoto || formData.photos.length >= 10}
                      className="flex-1"
                    />
                    {uploadingPhoto && <Loader2 className="w-4 h-4 animate-spin" />}
                  </div>
                )}
                {formData.photos.length > 0 && (!readOnly || isController) && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={analyzePhotosWithAI}
                    disabled={analyzingPhotos}
                  >
                    {analyzingPhotos
                      ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Analisi AI in corso...</>
                      : <><ScanSearch className="w-4 h-4 mr-2" />Analizza foto — rileva squalificati/infortunati</>
                    }
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Youtube className="w-4 h-4 text-red-500" />
                  Link Streaming
                </Label>
                <Input
                  type="url"
                  value={formData.stream_link}
                  onChange={(e) => setFormData({ ...formData, stream_link: e.target.value })}
                  placeholder="https://youtube.com/... o https://twitch.tv/..."
                  disabled={readOnly}
                />
              </div>

              <div className="space-y-2">
                <Label>Note</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Note aggiuntive sulla partita..."
                  rows={3}
                  disabled={readOnly}
                />
              </div>
            </CardContent>
          </Card>

          {/* Banner avvisi AI */}
          {aiWarnings.length > 0 && (
            <Card className="border-amber-400 bg-amber-50">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-amber-700 text-sm">
                  <ShieldAlert className="w-5 h-5" />
                  ⚠️ Attenzione — Giocatori a rischio rilevati nelle foto
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {aiWarnings.map((w, i) => (
                  <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${
                    w.reason === 'squalificato' ? 'bg-red-50 border-red-200' : 'bg-orange-50 border-orange-200'
                  }`}>
                    <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${w.reason === 'squalificato' ? 'text-red-500' : 'text-orange-500'}`} />
                    <div>
                      <p className="font-semibold text-sm text-slate-800">
                        {w.name}
                        <span className={`ml-2 text-xs font-medium px-1.5 py-0.5 rounded ${
                          w.reason === 'squalificato' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {w.reason?.toUpperCase()}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">
                          (confidenza: {w.confidence})
                        </span>
                      </p>
                      {w.detail && <p className="text-xs text-slate-500 mt-0.5">{w.detail}</p>}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-amber-600 mt-2">
                  Verifica manualmente prima di salvare il report.
                </p>
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {readOnly ? 'Chiudi' : 'Annulla'}
            </Button>
            {!readOnly && (
              <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Salva Report
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}