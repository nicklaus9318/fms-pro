import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, CheckCircle, AlertCircle, UserPlus, Users, Check, X } from 'lucide-react';
import { toast } from 'sonner';

// Phase: 'upload' | 'review' | 'done'

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
    const loadingToast = toast.loading('Elaborazione screenshot in corso...');

    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      const response = await base44.functions.invoke('processTeamScreenshot', { file_url, team_id_override: selectedTeamId });
      const data = response.data;
      toast.dismiss(loadingToast);

      if (data.success && data.mode === 'preview') {
        setPreviewData(data);
        // Auto-set decisions: exact match -> 'approve', no match -> 'create'
        const initialDecisions = {};
        data.match_candidates.forEach((candidate, idx) => {
          if (candidate.exact_match) {
            initialDecisions[idx] = { action: 'approve', player_id: candidate.exact_match.id };
          } else {
            initialDecisions[idx] = { action: 'create' };
          }
        });
        setDecisions(initialDecisions);
        setPhase('review');
      } else {
        setResult(data);
        setPhase('done');
        if (!data.success) toast.error(data.error || 'Errore durante l\'elaborazione');
      }
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

    const approved = [];
    const create_new = [];

    previewData.match_candidates.forEach((candidate, idx) => {
      const decision = decisions[idx];
      if (!decision) return;

      if (decision.action === 'approve' && decision.player_id) {
        approved.push({
          player_id: decision.player_id,
          extracted_name: `${candidate.extracted.first_name} ${candidate.extracted.last_name}`
        });
      } else if (decision.action === 'create') {
        create_new.push(candidate.extracted);
      }
      // 'skip' -> do nothing
    });

    try {
      const response = await base44.functions.invoke('processTeamScreenshot', {
        file_url: 'confirm', // dummy, not used in confirm mode
        confirm_matches: {
          team_id: previewData.team_id,
          approved,
          create_new
        }
      });
      const data = response.data;
      toast.dismiss(loadingToast);

      setResult(data);
      setPhase('done');
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['pendingPlayers'] });
      queryClient.invalidateQueries({ queryKey: ['allPlayers'] });
      toast.success('Modifiche applicate con successo!');
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
                <li>Carica uno screenshot della rosa di una squadra</li>
                <li>L'IA estrae automaticamente nome squadra e giocatori</li>
                <li>Per ogni giocatore ti viene mostrata una corrispondenza proposta dal sistema</li>
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
            {/* Team selector */}
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
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" id="screenshot-upload" disabled={processing} />
              <label htmlFor="screenshot-upload" className="cursor-pointer">
                {processing ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
                    <p className="text-slate-600 font-medium">Elaborazione in corso...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-12 h-12 text-slate-300" />
                    <p className="text-slate-600 font-medium">Clicca per caricare screenshot della rosa</p>
                    <p className="text-xs text-slate-400">Formati supportati: PNG, JPG, JPEG</p>
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
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-800">🔍 Revisione Giocatori</h2>
              <p className="text-sm text-slate-500">Squadra: <strong>{previewData.team_name}</strong> — {previewData.match_candidates.length} giocatori estratti</p>
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
              const allMatches = exact_match ? [exact_match, ...fuzzy_matches] : fuzzy_matches;

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
                          {extracted.overall_rating && ` • VG/OVR: ${extracted.overall_rating}`}
                        </p>
                      </div>

                      {/* Arrow */}
                      <div className="hidden md:flex items-center text-slate-400 text-xl">→</div>

                      {/* Decision area */}
                      <div className="flex-2 space-y-2 min-w-0">
                        <p className="text-xs font-semibold text-slate-400 uppercase mb-1">Abbinamento</p>

                        {/* Exact match button */}
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
                                <p className="font-semibold">{exact_match.name}</p>
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

                        {/* Fuzzy matches */}
                        {fuzzy_matches.length > 0 && fuzzy_matches.map((fm) => (
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
                                <p className="font-semibold">{fm.name}</p>
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

                        {/* Create new / Skip */}
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

          <div className="flex justify-end">
            <Button onClick={handleConfirm} disabled={processing} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
              Applica Decisioni
            </Button>
          </div>
        </div>
      )}

      {/* Results */}
      {phase === 'done' && result && (
        <Card className={result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.success
                ? <><CheckCircle className="w-5 h-5 text-green-600" /><span className="text-green-900">Operazione Completata</span></>
                : <><AlertCircle className="w-5 h-5 text-red-600" /><span className="text-red-900">Errore</span></>}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.success ? (
              <>
                <div className="bg-white rounded-lg p-4 border border-green-200">
                  <h3 className="font-semibold text-green-800 mb-1">🏆 {result.team_name}</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm mt-3">
                    <div><span className="text-slate-500">Assegnati:</span><span className="font-bold ml-2">{result.players_assigned?.length || 0}</span></div>
                    <div><span className="text-slate-500">Già presenti:</span><span className="font-bold ml-2">{result.players_already_in_team?.length || 0}</span></div>
                    <div><span className="text-slate-500">Creati (pending):</span><span className="font-bold ml-2">{result.players_created?.length || 0}</span></div>
                  </div>
                </div>
                {result.errors?.length > 0 && (
                  <div className="bg-white rounded-lg p-4 border border-rose-200">
                    <h3 className="font-semibold text-rose-800 mb-2">⚠️ Errori</h3>
                    {result.errors.map((e, i) => <p key={i} className="text-sm text-rose-600">• {e}</p>)}
                  </div>
                )}
              </>
            ) : (
              <div className="bg-white rounded-lg p-4 border border-red-200">
                <p className="text-red-800">{result.error}</p>
              </div>
            )}
            <Button onClick={reset} variant="outline">↩ Carica un altro screenshot</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}