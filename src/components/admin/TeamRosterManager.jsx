import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, CheckCircle, AlertCircle, UserPlus, Users, Check, X } from 'lucide-react';
import { toast } from 'sonner';

export default function TeamRosterManager() {
  const [phase, setPhase] = useState('upload');
  const [processing, setProcessing] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [decisions, setDecisions] = useState({});
  const [result, setResult] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const queryClient = useQueryClient();

  const { data: teams = [] } = useQuery({
    queryKey: ['teams'],
    queryFn: () => base44.entities.Team.list()
  });

  const { data: allPlayers = [] } = useQuery({
    queryKey: ['allPlayers'],
    queryFn: () => base44.entities.Player.list()
  });

  // Converti file in base64
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Confronta nome estratto con giocatori esistenti
  const findMatches = (extractedName) => {
    const name = extractedName.toLowerCase().trim();
    const nameParts = name.split(/\s+/);

    const exact = allPlayers.find(p => {
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
      return fullName === name;
    });

    const fuzzy = allPlayers.filter(p => {
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
      if (fullName === name) return false;
      return nameParts.some(part => part.length > 2 && fullName.includes(part));
    }).slice(0, 3);

    return { exact, fuzzy };
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Per favore carica un file immagine (PNG, JPG, etc.)');
      return;
    }
    if (!selectedTeamId) {
      toast.error('Seleziona prima la squadra di destinazione');
      return;
    }

    setProcessing(true);
    setResult(null);
    setDecisions({});
    const loadingToast = toast.loading('Analisi screenshot con AI...');

    try {
      const base64Data = await fileToBase64(file);
      const mediaType = file.type;

      // Chiama Claude API con vision
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64Data }
              },
              {
                type: 'text',
                text: `Analizza questo screenshot di una rosa di calcio. Estrai TUTTI i giocatori visibili.
Per ogni giocatore restituisci un oggetto JSON con:
- first_name: nome
- last_name: cognome  
- age: età (numero, se visibile)
- overall_rating: overall/valutazione (numero, se visibile)
- role: ruolo (POR/DC/TS/TD/CDC/CC/COC/ES/ED/AS/AD/ATT, se visibile)

Rispondi SOLO con un array JSON valido, nessun testo aggiuntivo. Esempio:
[{"first_name":"Kylian","last_name":"Mbappé","age":25,"overall_rating":91,"role":"ATT"}]`
              }
            ]
          }]
        })
      });

      const data = await response.json();
      toast.dismiss(loadingToast);

      if (!response.ok) throw new Error(data.error?.message || 'Errore API Claude');

      const text = data.content[0]?.text || '';
      // Estrai JSON dalla risposta
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('Nessun giocatore trovato nello screenshot');

      const extractedPlayers = JSON.parse(jsonMatch[0]);
      if (!extractedPlayers.length) throw new Error('Nessun giocatore riconosciuto');

      // Confronta con giocatori esistenti
      const matchCandidates = extractedPlayers.map(player => {
        const { exact, fuzzy } = findMatches(`${player.first_name} ${player.last_name}`);
        return { extracted: player, exact_match: exact || null, fuzzy_matches: fuzzy };
      });

      // Inizializza decisioni
      const initialDecisions = {};
      matchCandidates.forEach((candidate, idx) => {
        if (candidate.exact_match) {
          initialDecisions[idx] = { action: 'approve', player_id: candidate.exact_match.id };
        } else {
          initialDecisions[idx] = { action: 'create' };
        }
      });

      setPreviewData({ team_id: selectedTeamId, match_candidates: matchCandidates });
      setDecisions(initialDecisions);
      setPhase('review');
      toast.success(`${extractedPlayers.length} giocatori trovati nello screenshot`);

    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Errore: ' + error.message);
    }

    setProcessing(false);
    e.target.value = '';
  };

  const setDecision = (idx, action, player_id = null) => {
    setDecisions(prev => ({ ...prev, [idx]: { action, player_id } }));
  };

  const handleConfirm = async () => {
    setProcessing(true);
    const loadingToast = toast.loading('Applicazione modifiche...');

    try {
      let added = 0, assigned = 0, skipped = 0;

      for (const [idxStr, decision] of Object.entries(decisions)) {
        const idx = parseInt(idxStr);
        const candidate = previewData.match_candidates[idx];

        if (decision.action === 'approve' && decision.player_id) {
          // Assegna alla squadra
          await base44.entities.Player.update(decision.player_id, {
            team_id: previewData.team_id
          });
          assigned++;
        } else if (decision.action === 'create') {
          // Crea nuovo giocatore
          const p = candidate.extracted;
          await base44.entities.Player.create({
            first_name: p.first_name,
            last_name: p.last_name,
            age: p.age || null,
            overall_rating: p.overall_rating || null,
            role: p.role || 'ATT',
            team_id: previewData.team_id,
            status: 'pending',
            created_by: 'roster-import'
          });
          added++;
        } else {
          skipped++;
        }
      }

      toast.dismiss(loadingToast);
      setResult({ success: true, assigned, added, skipped });
      setPhase('done');
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['allPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['pendingPlayers'] });
      toast.success(`Completato: ${assigned} assegnati, ${added} creati, ${skipped} ignorati`);
    } catch (error) {
      toast.dismiss(loadingToast);
      toast.error('Errore: ' + error.message);
    }
    setProcessing(false);
  };

  const reset = () => {
    setPhase('upload');
    setPreviewData(null);
    setDecisions({});
    setResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Header info */}
      {phase === 'upload' && (
        <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Users className="w-5 h-5" />
              Gestione Rose Squadre da Screenshot
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white/80 rounded-lg p-4 border border-blue-200">
              <h3 className="font-semibold text-blue-800 mb-2">📸 Come Funziona</h3>
              <ol className="text-sm text-slate-700 space-y-2 ml-4 list-decimal">
                <li>Seleziona la squadra di destinazione</li>
                <li>Carica uno screenshot della rosa (da SoFIFA o simili)</li>
                <li>L'AI estrae automaticamente i giocatori visibili</li>
                <li>Per ogni giocatore ti viene mostrata una corrispondenza proposta</li>
                <li>Approva, modifica o ignora ogni abbinamento prima di applicare</li>
              </ol>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upload */}
      {phase === 'upload' && (
        <Card>
          <CardHeader><CardTitle>Carica Screenshot</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Squadra di destinazione *</label>
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona squadra..." />
                </SelectTrigger>
                <SelectContent>
                  {teams.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-blue-300 transition-colors">
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" id="screenshot-upload" disabled={processing || !selectedTeamId} />
              <label htmlFor="screenshot-upload" className={`${selectedTeamId ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                {processing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                    <p className="text-slate-600 font-medium">Analisi AI in corso...</p>
                    <p className="text-xs text-slate-400">Potrebbe richiedere qualche secondo</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-12 h-12 text-slate-300" />
                    <p className="text-slate-600 font-medium">Clicca per caricare screenshot della rosa</p>
                    <p className="text-xs text-slate-400">Formati supportati: PNG, JPG, JPEG</p>
                    {!selectedTeamId && <p className="text-xs text-amber-500">⚠️ Seleziona prima la squadra</p>}
                  </div>
                )}
              </label>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review phase */}
      {phase === 'review' && previewData && (
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-xl font-bold text-slate-800">🔍 Revisione Giocatori</h2>
              <p className="text-sm text-slate-500">{previewData.match_candidates.length} giocatori estratti dallo screenshot</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={reset}>Annulla</Button>
              <Button onClick={handleConfirm} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                Applica Decisioni
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {previewData.match_candidates.map((candidate, idx) => {
              const decision = decisions[idx] || {};
              const { extracted, exact_match, fuzzy_matches } = candidate;

              return (
                <Card key={idx} className={`border-2 ${
                  decision.action === 'approve' ? 'border-emerald-300 bg-emerald-50' :
                  decision.action === 'skip' ? 'border-slate-200 bg-slate-50 opacity-60' :
                  'border-amber-300 bg-amber-50'
                }`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      {/* Extracted player */}
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Da screenshot</p>
                        <p className="text-lg font-bold text-slate-800">{extracted.first_name} {extracted.last_name}</p>
                        <p className="text-sm text-slate-500">
                          {extracted.age && `Età: ${extracted.age}`}
                          {extracted.overall_rating && ` • OVR: ${extracted.overall_rating}`}
                          {extracted.role && ` • ${extracted.role}`}
                        </p>
                      </div>

                      <div className="hidden md:flex items-center text-slate-400 text-xl">→</div>

                      {/* Decision area */}
                      <div className="flex-1 space-y-2">
                        <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Abbinamento</p>

                        {exact_match && (
                          <button
                            onClick={() => setDecision(idx, 'approve', exact_match.id)}
                            className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                              decision.action === 'approve' && decision.player_id === exact_match.id
                                ? 'border-emerald-500 bg-emerald-100'
                                : 'border-slate-200 bg-white hover:border-emerald-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <Badge className="bg-emerald-100 text-emerald-700 mb-1">✓ Corrispondenza esatta</Badge>
                                <p className="font-semibold">{exact_match.first_name} {exact_match.last_name}</p>
                                <p className="text-xs text-slate-500">
                                  {exact_match.age && `Età: ${exact_match.age}`}
                                  {exact_match.overall_rating && ` • OVR: ${exact_match.overall_rating}`}
                                </p>
                              </div>
                              {decision.action === 'approve' && decision.player_id === exact_match.id && (
                                <Check className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                              )}
                            </div>
                          </button>
                        )}

                        {fuzzy_matches.map((fm) => (
                          <button
                            key={fm.id}
                            onClick={() => setDecision(idx, 'approve', fm.id)}
                            className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                              decision.action === 'approve' && decision.player_id === fm.id
                                ? 'border-blue-500 bg-blue-100'
                                : 'border-slate-200 bg-white hover:border-blue-300'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <Badge className="bg-blue-100 text-blue-700 mb-1">~ Simile</Badge>
                                <p className="font-semibold">{fm.first_name} {fm.last_name}</p>
                                <p className="text-xs text-slate-500">
                                  {fm.age && `Età: ${fm.age}`}
                                  {fm.overall_rating && ` • OVR: ${fm.overall_rating}`}
                                </p>
                              </div>
                              {decision.action === 'approve' && decision.player_id === fm.id && (
                                <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                              )}
                            </div>
                          </button>
                        ))}

                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() => setDecision(idx, 'create')}
                            className={`flex-1 p-2 rounded-lg border-2 text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                              decision.action === 'create'
                                ? 'border-amber-500 bg-amber-100 text-amber-800'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300'
                            }`}
                          >
                            <UserPlus className="w-4 h-4" />
                            Crea Nuovo
                          </button>
                          <button
                            onClick={() => setDecision(idx, 'skip')}
                            className={`flex-1 p-2 rounded-lg border-2 text-sm font-medium transition-all flex items-center justify-center gap-1 ${
                              decision.action === 'skip'
                                ? 'border-slate-400 bg-slate-200 text-slate-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                            }`}
                          >
                            <X className="w-4 h-4" />
                            Ignora
                          </button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Done phase */}
      {phase === 'done' && result && (
        <Card className={result.success ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'}>
          <CardContent className="p-6 text-center space-y-4">
            {result.success ? (
              <>
                <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
                <h3 className="text-xl font-bold text-emerald-800">Completato!</h3>
                <div className="flex justify-center gap-4 flex-wrap">
                  <Badge className="bg-emerald-100 text-emerald-700 text-sm px-3 py-1">✓ {result.assigned} assegnati</Badge>
                  <Badge className="bg-amber-100 text-amber-700 text-sm px-3 py-1">+ {result.added} creati (in attesa)</Badge>
                  {result.skipped > 0 && <Badge className="bg-slate-100 text-slate-600 text-sm px-3 py-1">– {result.skipped} ignorati</Badge>}
                </div>
                {result.added > 0 && (
                  <p className="text-sm text-emerald-700">I nuovi giocatori creati sono in stato "in attesa" — approvali dalla sezione Approvazione.</p>
                )}
              </>
            ) : (
              <>
                <AlertCircle className="w-16 h-16 text-rose-500 mx-auto" />
                <h3 className="text-xl font-bold text-rose-800">Errore</h3>
                <p className="text-rose-600">{result.error}</p>
              </>
            )}
            <Button onClick={reset} variant="outline">Carica Altro Screenshot</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
