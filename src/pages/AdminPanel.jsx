import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Upload, FileSpreadsheet, Trophy, Users, Loader2, Plus, Settings,
  AlertCircle, Trash2, CheckCircle, RefreshCw, FileUp, Info, TrendingUp, Gavel, ShoppingBag, Lock, Unlock, Clock, Ticket, Minus,
} from 'lucide-react';
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from 'sonner';
import PlayerApprovalManager from '../components/admin/PlayerApprovalManager';

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(/[;,\t]/).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  return lines.slice(1).map(line => {
    const values = line.split(/[;,\t]/).map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  }).filter(row => Object.values(row).some(v => v !== ''));
}

const COL_MAP = {
  first_name:     ['first_name','nome','firstname','name','first name'],
  last_name:      ['last_name','cognome','lastname','surname','last name'],
  role:           ['role','ruolo','position','pos'],
  age:            ['age','eta','età','years'],
  overall_rating: ['overall_rating','overall','ovr','rating','voto'],
  id_sofifa:      ['id_sofifa','sofifa_id','sofifa','id'],
  nationality:    ['nationality','nazionalita','nation','country'],
};

function mapRow(raw) {
  const out = {};
  for (const [canon, aliases] of Object.entries(COL_MAP)) {
    for (const alias of aliases) {
      if (raw[alias] !== undefined && raw[alias] !== '') { out[canon] = raw[alias]; break; }
    }
  }
  return out;
}

function calcSalary(ovr) {
  if (!ovr) return 100000;
  const r = parseInt(ovr);
  if (r >= 88) return 1000000;
  if (r >= 85) return 700000;
  if (r >= 82) return 500000;
  if (r >= 75) return 250000;
  return 100000;
}

function calcValue(ovr, age) {
  if (!ovr || parseInt(ovr) < 40) return 500000;
  const o = parseInt(ovr), a = parseInt(age) || 25;
  if (o > 85 && a < 25) return 30000000 + (o - 85) * 4000000;
  if (o >= 80 && o <= 85 && a < 25) return 25000000 - (85 - o) * 1000000;
  if (o < 80) return Math.max(0, Math.min(15000000, 1000000 + (o - 60) * 400000 + (30 - a) * 200000));
  return Math.max(5000000, Math.min(25000000, 15000000 + (o - 80) * 500000 + (30 - a) * 300000));
}

// ─── Componente importatore ───────────────────────────────────────────────────
function PlayerImporter({ allPlayers, queryClient }) {
  const fileRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState([]);
  const [fileName, setFileName] = useState('');
  const [matchKey, setMatchKey] = useState('id_sofifa');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState(null);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    setReport(null);
    setRows([]);
    const text = await file.text();
    if (!file.name.match(/\.(csv|txt)$/i)) {
      toast.error('Carica un file .csv o .txt. Per Excel: Salva come CSV da Excel prima.');
      return;
    }
    const parsed = parseCSV(text);
    const mapped = parsed.map(mapRow);
    setRows(mapped);
    setPreview(mapped.slice(0, 5));
    toast.success(`${mapped.length} righe caricate`);
  };

  const handleImport = async () => {
    if (rows.length === 0) { toast.error('Nessuna riga da importare'); return; }
    if (!window.confirm(`Importare ${rows.length} giocatori?\n\nGiocatori ESISTENTI → solo i campi del CSV vengono aggiornati (team, gol, ecc. restano intatti).\nGiocatori NUOVI → creati con status "approved".`)) return;

    setImporting(true);
    setProgress(0);
    const rep = { created: 0, updated: 0, skipped: 0, errors: [] };

    const existingMap = new Map();
    for (const p of allPlayers) {
      if (matchKey === 'id_sofifa' && p.id_sofifa) {
        existingMap.set(String(p.id_sofifa).trim(), p);
      } else if (matchKey === 'name') {
        const key = `${(p.first_name||'').toLowerCase().trim()}|${(p.last_name||'').toLowerCase().trim()}`;
        existingMap.set(key, p);
      }
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      setProgress(Math.round(((i + 1) / rows.length) * 100));
      try {
        if (!row.first_name && !row.last_name) { rep.skipped++; continue; }
        const fields = {};
        if (row.first_name)     fields.first_name     = row.first_name;
        if (row.last_name)      fields.last_name      = row.last_name;
        if (row.role)           fields.role           = row.role;
        if (row.age)            fields.age            = parseInt(row.age) || undefined;
        if (row.overall_rating) fields.overall_rating = parseInt(row.overall_rating) || undefined;
        if (row.id_sofifa)      fields.id_sofifa      = String(row.id_sofifa).trim();
        if (row.nationality)    fields.nationality    = row.nationality;
        if (row.id_sofifa)      fields.sofifa_link    = `https://sofifa.com/player/${String(row.id_sofifa).trim()}`;
        if (fields.overall_rating) {
          fields.salary       = calcSalary(fields.overall_rating);
          fields.player_value = calcValue(fields.overall_rating, fields.age);
        }
        let existing = null;
        if (matchKey === 'id_sofifa' && row.id_sofifa) existing = existingMap.get(String(row.id_sofifa).trim());
        else if (matchKey === 'name' && row.first_name && row.last_name) {
          existing = existingMap.get(`${row.first_name.toLowerCase().trim()}|${row.last_name.toLowerCase().trim()}`);
        }
        if (existing) {
          await base44.entities.Player.update(existing.id, fields);
          rep.updated++;
        } else {
          await base44.entities.Player.create({ ...fields, status: 'approved' });
          rep.created++;
        }
      } catch (err) {
        rep.errors.push(`Riga ${i + 1}: ${err.message}`);
      }
      if (i % 20 === 19) await new Promise(r => setTimeout(r, 100));
    }

    setReport(rep);
    setImporting(false);
    setProgress(100);
    queryClient.invalidateQueries({ queryKey: ['allPlayers'] });
    queryClient.invalidateQueries({ queryKey: ['players'] });
    toast.success(`Import completato: ${rep.created} creati, ${rep.updated} aggiornati`);
  };

  return (
    <div className="space-y-6">
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-blue-800 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Formato CSV Accettato
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-blue-700 space-y-2">
          <p>Intestazioni riconosciute (separatore virgola, punto e virgola o tab):</p>
          <div className="grid grid-cols-2 gap-x-8 font-mono text-xs bg-white rounded p-2 border border-blue-200">
            <span>first_name / nome</span><span>last_name / cognome</span>
            <span>role / ruolo</span><span>age / eta</span>
            <span>overall_rating / ovr</span><span>id_sofifa / sofifa_id</span>
            <span>nationality</span><span>(team_name ignorato)</span>
          </div>
          <p className="text-blue-600 text-xs">ℹ️ I giocatori trovati vengono <strong>aggiornati</strong> (solo campi del CSV). Team, gol e statistiche restano intatti. I nuovi vengono creati con status "approved".</p>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <Label className="whitespace-nowrap font-medium text-sm">Identifica giocatori per:</Label>
        <Select value={matchKey} onValueChange={setMatchKey}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="id_sofifa">ID SoFIFA (consigliato)</SelectItem>
            <SelectItem value="name">Nome + Cognome</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div
        className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50 transition-colors"
        onClick={() => fileRef.current?.click()}
      >
        <FileUp className="w-10 h-10 text-slate-400 mx-auto mb-3" />
        <p className="font-medium text-slate-700">{fileName || 'Clicca per selezionare un file CSV'}</p>
        <p className="text-sm text-slate-500 mt-1">Formati supportati: .csv, .txt</p>
        <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
      </div>

      {preview.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Anteprima — {rows.length} righe totali</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    {Object.keys(preview[0]).map(k => <th key={k} className="p-2 text-left border border-slate-200 font-semibold">{k}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      {Object.values(row).map((v, j) => <td key={j} className="p-2 border border-slate-200">{v || '-'}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 5 && <p className="text-xs text-slate-500 mt-2">... e altre {rows.length - 5} righe</p>}
          </CardContent>
        </Card>
      )}

      {importing && (
        <Card>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Importazione in corso...</span>
              <span className="font-semibold">{progress}%</span>
            </div>
            <Progress value={progress} className="h-2" />
          </CardContent>
        </Card>
      )}

      {report && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-emerald-800 flex items-center gap-2"><CheckCircle className="w-4 h-4" />Import Completato</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-white rounded-lg p-3 border border-emerald-200">
                <p className="text-2xl font-bold text-emerald-700">{report.created}</p>
                <p className="text-xs text-slate-600">Creati</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-blue-200">
                <p className="text-2xl font-bold text-blue-700">{report.updated}</p>
                <p className="text-xs text-slate-600">Aggiornati</p>
              </div>
              <div className="bg-white rounded-lg p-3 border border-slate-200">
                <p className="text-2xl font-bold text-slate-500">{report.skipped}</p>
                <p className="text-xs text-slate-600">Saltati</p>
              </div>
            </div>
            {report.errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-700 mb-1">{report.errors.length} errori:</p>
                {report.errors.slice(0, 5).map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                {report.errors.length > 5 && <p className="text-xs text-red-500">...e altri {report.errors.length - 5}</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {rows.length > 0 && !importing && (
        <Button onClick={handleImport} className="w-full bg-emerald-600 hover:bg-emerald-700" size="lg">
          <RefreshCw className="w-4 h-4 mr-2" />
          Importa / Aggiorna {rows.length} Giocatori
        </Button>
      )}
    </div>
  );
}

// ─── MercatoManager ──────────────────────────────────────────────────────────
function MercatoManager() {
  const queryClient = useQueryClient();
  const [showNewSession, setShowNewSession] = useState(false);
  const [sessionForm, setSessionForm] = useState({
    name: '',
    type: 'sealed_bid', // sealed_bid = buste, transfer = calciomercato
    notes: ''
  });
  const [savingSession, setSavingSession] = useState(false);

  const { data: appSettings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list()
  });

  const { data: auctions = [] } = useQuery({
    queryKey: ['auctionsAdmin'],
    queryFn: () => base44.entities.Auction.list('-created_date')
  });

  // Sessioni di aste (raggruppate per auction_session_name)
  const auctionSessions = [...new Set(
    auctions.map(a => a.auction_session_name).filter(Boolean)
  )].map(name => {
    const sessionAuctions = auctions.filter(a => a.auction_session_name === name);
    const active = sessionAuctions.filter(a => a.status === 'active').length;
    const completed = sessionAuctions.filter(a => a.status === 'completed').length;
    return { name, total: sessionAuctions.length, active, completed };
  });

  // Stato sessione calciomercato (da app_settings)
  const mercatoStatus = appSettings.find(s => s.key === 'mercato_status');
  const mercatoOpen = mercatoStatus?.value === 'open';
  const mercatoSessionName = appSettings.find(s => s.key === 'mercato_session_name')?.value || '';

  const toggleMercato = async () => {
    const t = toast.loading(mercatoOpen ? 'Chiusura mercato...' : 'Apertura mercato...');
    try {
      const newStatus = mercatoOpen ? 'closed' : 'open';
      const existing = appSettings.find(s => s.key === 'mercato_status');
      if (existing) {
        await base44.entities.AppSettings.update(existing.id, { value: newStatus });
      } else {
        await base44.entities.AppSettings.create({ key: 'mercato_status', value: newStatus });
      }
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      toast.dismiss(t);
      toast.success(newStatus === 'open' ? 'Mercato aperto!' : 'Mercato chiuso!');
    } catch (e) {
      toast.dismiss(t);
      toast.error('Errore: ' + e.message);
    }
  };

  const saveSessionName = async (name) => {
    const existing = appSettings.find(s => s.key === 'mercato_session_name');
    if (existing) {
      await base44.entities.AppSettings.update(existing.id, { value: name });
    } else {
      await base44.entities.AppSettings.create({ key: 'mercato_session_name', value: name });
    }
    queryClient.invalidateQueries({ queryKey: ['appSettings'] });
  };

  const closeAllAuctions = async (sessionName) => {
    if (!window.confirm(`Chiudere tutte le aste della sessione "${sessionName}"?`)) return;
    const t = toast.loading('Chiusura aste...');
    try {
      const sessionAuctions = auctions.filter(a => a.auction_session_name === sessionName && a.status === 'active');
      for (const a of sessionAuctions) {
        await base44.entities.Auction.update(a.id, { status: 'completed' });
      }
      queryClient.invalidateQueries({ queryKey: ['auctionsAdmin'] });
      toast.dismiss(t);
      toast.success(`${sessionAuctions.length} aste chiuse`);
    } catch (e) {
      toast.dismiss(t);
      toast.error('Errore: ' + e.message);
    }
  };

  const reopenAllAuctions = async (sessionName) => {
    if (!window.confirm(`Riaprire tutte le aste della sessione "${sessionName}"?`)) return;
    const t = toast.loading('Riapertura aste...');
    try {
      const sessionAuctions = auctions.filter(a => a.auction_session_name === sessionName && a.status === 'completed');
      const newEndTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      for (const a of sessionAuctions) {
        await base44.entities.Auction.update(a.id, { status: 'active', end_time: newEndTime });
      }
      queryClient.invalidateQueries({ queryKey: ['auctionsAdmin'] });
      toast.dismiss(t);
      toast.success(`${sessionAuctions.length} aste riaperte (+24h)`);
    } catch (e) {
      toast.dismiss(t);
      toast.error('Errore: ' + e.message);
    }
  };

  return (
    <div className="space-y-6">

      {/* ── Censimento ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-500" />
            Sessione Censimento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const censimentoStatus = appSettings.find(s => s.key === 'censimento_status');
            const censimentoOpen = censimentoStatus?.value === 'open';
            const censimentoName = appSettings.find(s => s.key === 'censimento_session_name')?.value || '';
            const toggleCensimento = async () => {
              const t = toast.loading(censimentoOpen ? 'Chiusura censimento...' : 'Apertura censimento...');
              try {
                const newStatus = censimentoOpen ? 'closed' : 'open';
                const existing = appSettings.find(s => s.key === 'censimento_status');
                if (existing) await base44.entities.AppSettings.update(existing.id, { value: newStatus });
                else await base44.entities.AppSettings.create({ key: 'censimento_status', value: newStatus });
                queryClient.invalidateQueries({ queryKey: ['appSettings'] });
                toast.dismiss(t);
                toast.success(newStatus === 'open' ? 'Censimento aperto!' : 'Censimento chiuso!');
              } catch (e) { toast.dismiss(t); toast.error('Errore: ' + e.message); }
            };
            const saveCensimentoName = async (name) => {
              const existing = appSettings.find(s => s.key === 'censimento_session_name');
              if (existing) await base44.entities.AppSettings.update(existing.id, { value: name });
              else await base44.entities.AppSettings.create({ key: 'censimento_session_name', value: name });
              queryClient.invalidateQueries({ queryKey: ['appSettings'] });
            };
            return (
              <>
                <div className="flex items-center justify-between p-4 rounded-xl border-2 border-dashed">
                  <div>
                    <p className="font-semibold text-slate-800">Stato Censimento</p>
                    <p className="text-sm text-slate-500">
                      {censimentoOpen ? '🟢 Censimento aperto — gli utenti possono registrare giocatori' : '🔴 Censimento chiuso — nessuna registrazione consentita'}
                    </p>
                  </div>
                  <Button onClick={toggleCensimento} className={censimentoOpen ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}>
                    {censimentoOpen ? <><Lock className="w-4 h-4 mr-2" />Chiudi</> : <><Unlock className="w-4 h-4 mr-2" />Apri</>}
                  </Button>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-600">Nome Sessione Censimento</label>
                  <Input placeholder="Es: Censimento Stagione 3" defaultValue={censimentoName} onBlur={(e) => saveCensimentoName(e.target.value)} />
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>

      {/* ── Registrazioni Utenti ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-amber-500" />
            Registrazioni Utenti
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const regStatus = appSettings.find(s => s.key === 'registrations_status');
            const regOpen = regStatus?.value !== 'closed'; // aperto di default
            const toggleReg = async () => {
              const t = toast.loading(regOpen ? 'Chiusura registrazioni...' : 'Apertura registrazioni...');
              try {
                const newStatus = regOpen ? 'closed' : 'open';
                const existing = appSettings.find(s => s.key === 'registrations_status');
                if (existing) await base44.entities.AppSettings.update(existing.id, { value: newStatus });
                else await base44.entities.AppSettings.create({ key: 'registrations_status', value: newStatus });
                queryClient.invalidateQueries({ queryKey: ['appSettings'] });
                toast.dismiss(t);
                toast.success(newStatus === 'open' ? 'Registrazioni aperte!' : 'Registrazioni chiuse!');
              } catch (e) { toast.dismiss(t); toast.error('Errore: ' + e.message); }
            };
            return (
              <div className="flex items-center justify-between p-4 rounded-xl border-2 border-dashed">
                <div>
                  <p className="font-semibold text-slate-800">Nuove Registrazioni</p>
                  <p className="text-sm text-slate-500">
                    {regOpen ? '🟢 Aperte — i nuovi utenti possono registrarsi' : '🔴 Chiuse — solo gli utenti esistenti possono accedere'}
                  </p>
                </div>
                <Button onClick={toggleReg} className={regOpen ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}>
                  {regOpen ? <><Lock className="w-4 h-4 mr-2" />Chiudi</> : <><Unlock className="w-4 h-4 mr-2" />Apri</>}
                </Button>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* ── Calciomercato ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-blue-500" />
            Sessione Calciomercato
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-xl border-2 border-dashed">
            <div>
              <p className="font-semibold text-slate-800">Stato Mercato</p>
              <p className="text-sm text-slate-500">
                {mercatoOpen ? '🟢 Mercato aperto — i manager possono fare proposte' : '🔴 Mercato chiuso — nessuna operazione consentita'}
              </p>
            </div>
            <Button
              onClick={toggleMercato}
              className={mercatoOpen ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'}
            >
              {mercatoOpen ? <><Lock className="w-4 h-4 mr-2" />Chiudi Mercato</> : <><Unlock className="w-4 h-4 mr-2" />Apri Mercato</>}
            </Button>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-600">Nome Sessione di Mercato</label>
            <div className="flex gap-2">
              <Input
                placeholder="Es: Mercato Invernale 2025"
                defaultValue={mercatoSessionName}
                onBlur={(e) => saveSessionName(e.target.value)}
              />
            </div>
            <p className="text-xs text-slate-400">Usato per raggruppare le operazioni nello storico</p>
          </div>
        </CardContent>
      </Card>

      {/* ── Sessioni Aste Pubbliche ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="w-5 h-5 text-purple-500" />
            Sessioni Aste Pubbliche
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {auctionSessions.length === 0 ? (
            <p className="text-center text-slate-400 py-4 text-sm">Nessuna sessione di aste trovata</p>
          ) : auctionSessions.map(session => (
            <div key={session.name} className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border">
              <div>
                <p className="font-semibold text-slate-800">{session.name}</p>
                <div className="flex gap-3 mt-1 text-xs text-slate-500">
                  <span>📦 {session.total} aste totali</span>
                  <span className="text-emerald-600">🟢 {session.active} attive</span>
                  <span className="text-slate-400">✅ {session.completed} chiuse</span>
                </div>
              </div>
              <div className="flex gap-2">
                {session.active > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-rose-600 border-rose-200 hover:bg-rose-50"
                    onClick={() => closeAllAuctions(session.name)}
                  >
                    <Lock className="w-3 h-3 mr-1" />Chiudi
                  </Button>
                )}
                {session.completed > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-blue-600 border-blue-200 hover:bg-blue-50"
                    onClick={() => reopenAllAuctions(session.name)}
                  >
                    <Unlock className="w-3 h-3 mr-1" />Riapri
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── ResetCard ────────────────────────────────────────────────────────────────
const COLOR_MAP = {
  amber:  { border: 'border-amber-200',  bg: 'bg-amber-50',  title: 'text-amber-700',  dot: 'bg-amber-500',  btn: 'bg-amber-600 hover:bg-amber-700' },
  orange: { border: 'border-orange-200', bg: 'bg-orange-50', title: 'text-orange-700', dot: 'bg-orange-500', btn: 'bg-orange-600 hover:bg-orange-700' },
  blue:   { border: 'border-blue-200',   bg: 'bg-blue-50',   title: 'text-blue-700',   dot: 'bg-blue-500',   btn: 'bg-blue-700 hover:bg-blue-800' },
  purple: { border: 'border-purple-200', bg: 'bg-purple-50', title: 'text-purple-700', dot: 'bg-purple-500', btn: 'bg-purple-700 hover:bg-purple-800' },
  red:    { border: 'border-red-200',    bg: 'bg-red-50',    title: 'text-red-700',    dot: 'bg-red-500',    btn: 'bg-red-700 hover:bg-red-800' },
};

function ResetCard({ color, title, description, items, confirmText, doubleConfirm, buttonLabel, onConfirm, queryClient, successMessage }) {
  const [loading, setLoading] = useState(false);
  const c = COLOR_MAP[color] || COLOR_MAP.red;

  const handleClick = async () => {
    if (!window.confirm(confirmText)) return;
    if (doubleConfirm && !window.confirm('Sei ASSOLUTAMENTE SICURO? Non può essere annullato.')) return;
    setLoading(true);
    const t = toast.loading('Operazione in corso...');
    try {
      await onConfirm();
      queryClient.invalidateQueries();
      toast.dismiss(t);
      toast.success(successMessage);
    } catch (e) {
      toast.dismiss(t);
      toast.error('Errore: ' + e.message);
    }
    setLoading(false);
  };

  return (
    <Card className={`${c.border} ${c.bg}`}>
      <CardHeader className="pb-3">
        <CardTitle className={`flex items-center gap-2 ${c.title}`}>
          <Trash2 className="w-5 h-5" />
          {title}
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">{description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-white rounded-lg p-4 border border-slate-200">
          <ul className="space-y-1.5">
            {items.map((item, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <Button
          onClick={handleClick}
          disabled={loading}
          className={`w-full text-white ${c.btn}`}
          size="lg"
        >
          {loading
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Operazione in corso...</>
            : <><Trash2 className="w-4 h-4 mr-2" />{buttonLabel}</>
          }
        </Button>
      </CardContent>
    </Card>
  );
}


// ─── GettoniManager ──────────────────────────────────────────────────────────
function GettoniManager({ teams }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState({});

  const { data: appSettings = [], refetch } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list()
  });

  const getGettoni = (teamId) => {
    const setting = appSettings.find(s => s.key === `gettoni_${teamId}`);
    return setting ? parseInt(setting.value) || 0 : 5;
  };

  const updateGettoni = async (teamId, teamName, delta) => {
    const current = getGettoni(teamId);
    const newVal = Math.max(0, current + delta);
    setSaving(prev => ({ ...prev, [teamId]: true }));
    try {
      const existing = appSettings.find(s => s.key === `gettoni_${teamId}`);
      if (existing) {
        await base44.entities.AppSettings.update(existing.id, { value: String(newVal) });
      } else {
        await base44.entities.AppSettings.create({ key: `gettoni_${teamId}`, value: String(newVal) });
      }
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
    } catch (e) {
      toast.error('Errore: ' + e.message);
    }
    setSaving(prev => ({ ...prev, [teamId]: false }));
  };

  const resetAllGettoni = async () => {
    if (!window.confirm('Ripristinare 5 gettoni a tutte le squadre?')) return;
    for (const team of teams) {
      const existing = appSettings.find(s => s.key === `gettoni_${team.id}`);
      if (existing) {
        await base44.entities.AppSettings.update(existing.id, { value: '5' });
      } else {
        await base44.entities.AppSettings.create({ key: `gettoni_${team.id}`, value: '5' });
      }
    }
    await refetch();
    toast.success('Gettoni ripristinati a 5 per tutte le squadre');
  };

  return (
    <div className="space-y-4">
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-800">Gettoni Rinvii</p>
              <p className="text-xs text-blue-600 mt-0.5">Ogni squadra ha 5 gettoni. Scalali quando una squadra richiede un rinvio.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={resetAllGettoni}>
          <RefreshCw className="w-4 h-4 mr-2" />Ripristina tutti a 5
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map(team => {
          const gettoni = getGettoni(team.id);
          const isSaving = saving[team.id];
          return (
            <Card key={team.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {team.logo_url
                      ? <img src={team.logo_url} alt={team.name} className="w-10 h-10 rounded-lg object-cover" />
                      : <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: team.primary_color || '#10B981' }}>
                          <span className="text-white font-bold">{team.name?.charAt(0)}</span>
                        </div>
                    }
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{team.name}</p>
                      <div className="flex gap-1 mt-1">
                        {[...Array(5)].map((_, i) => (
                          <div key={i} className={`w-4 h-4 rounded-full ${i < gettoni ? 'bg-emerald-500' : 'bg-slate-200'}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-8 h-8 p-0 text-rose-600 border-rose-200 hover:bg-rose-50"
                      onClick={() => updateGettoni(team.id, team.name, -1)}
                      disabled={isSaving || gettoni <= 0}
                    >
                      {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Minus className="w-3 h-3" />}
                    </Button>
                    <span className={`text-2xl font-bold w-8 text-center ${gettoni === 0 ? 'text-rose-600' : gettoni <= 2 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {gettoni}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-8 h-8 p-0 text-emerald-600 border-emerald-200 hover:bg-emerald-50"
                      onClick={() => updateGettoni(team.id, team.name, +1)}
                      disabled={isSaving || gettoni >= 5}
                    >
                      {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ─── AdminPanel ───────────────────────────────────────────────────────────────
export default function AdminPanel() {
  const [user, setUser] = useState(null);
  const [showLeagueForm, setShowLeagueForm] = useState(false);
  const [leagueFormData, setLeagueFormData] = useState({ name:'', season:'', default_budget:100000000, participating_teams:[], competition_format:'league', logo_url:'' });
  const [uploadingLeagueLogo, setUploadingLeagueLogo] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generatingKnockout, setGeneratingKnockout] = useState(false);
  const [selectedKnockoutCompetition, setSelectedKnockoutCompetition] = useState(null);
  const [valueSearchTerm, setValueSearchTerm] = useState('');
  const [editingPlayerValue, setEditingPlayerValue] = useState(null); // { id, player_value, salary }
  const [savingPlayerValue, setSavingPlayerValue] = useState(false);
  const [showCompetitionEditModal, setShowCompetitionEditModal] = useState(false);
  const [editingCompetition, setEditingCompetition] = useState(null);
  const [competitionFormData, setCompetitionFormData] = useState({ name:'', format:'league', participating_teams:[] });
  const [loadingDuplicates, setLoadingDuplicates] = useState(false);
  const [duplicates, setDuplicates] = useState([]);
  const [selectedDuplicatesToDelete, setSelectedDuplicatesToDelete] = useState([]);

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try { const u = await base44.auth.me(); setUser(u); }
      catch (e) { base44.auth.redirectToLogin(); }
    };
    loadUser();
  }, []);

  const isAdmin = user?.role === 'admin';

  const { data: leagues = [] }        = useQuery({ queryKey:['leagues'],        queryFn:() => base44.entities.League.list() });
  const { data: pendingPlayers = [] } = useQuery({ queryKey:['pendingPlayers'], queryFn:() => base44.entities.Player.filter({ status:'pending' }) });
  const { data: teams = [] }          = useQuery({ queryKey:['teams'],          queryFn:() => base44.entities.Team.list() });
  const { data: allPlayers = [] }     = useQuery({ queryKey:['allPlayers'],     queryFn:() => base44.entities.Player.list() });
  const { data: competitions = [] }   = useQuery({ queryKey:['competitions'],   queryFn:() => base44.entities.Competition.list() });
  const { data: matches = [] }        = useQuery({ queryKey:['matches'],        queryFn:() => base44.entities.Match.list() });

  const createLeagueMutation = useMutation({
    mutationFn: async (data) => {
      const league = await base44.entities.League.create(data);
      const competition = await base44.entities.Competition.create({
        name: data.name, league_id: league.id, season: data.season,
        format: data.competition_format, participating_teams: data.participating_teams, status: 'active'
      });
      if (data.participating_teams?.length >= 2) {
        let matchesToCreate = [];
        const teamsData = teams.filter(t => data.participating_teams.includes(t.id));
        if (data.competition_format === 'league') {
          const { generateClassicLeague } = await import('../components/competition/CompetitionGenerator');
          matchesToCreate = generateClassicLeague(teamsData, league.id, data.season);
        } else if (data.competition_format === 'knockout') {
          const { generateKnockoutCup } = await import('../components/competition/CompetitionGenerator');
          matchesToCreate = generateKnockoutCup(teamsData, league.id, data.season);
        } else if (data.competition_format === 'world_cup') {
          const { generateWorldCupStyle } = await import('../components/competition/CompetitionGenerator');
          matchesToCreate = generateWorldCupStyle(teamsData, league.id, data.season);
        } else if (data.competition_format === 'champions_swiss') {
          const { generateChampionsSwiss } = await import('../components/competition/CompetitionGenerator');
          matchesToCreate = generateChampionsSwiss(teamsData, league.id, data.season);
        }
        if (matchesToCreate.length > 0) await base44.entities.Match.bulkCreate(matchesToCreate.map(m => ({ ...m, competition_id: competition.id })));
      }
      return league;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey:['leagues'] });
      queryClient.invalidateQueries({ queryKey:['matches'] });
      queryClient.invalidateQueries({ queryKey:['competitions'] });
      toast.success('Competizione creata e calendario generato');
      setShowLeagueForm(false);
      setLeagueFormData({ name:'', season:'', default_budget:100000000, participating_teams:[], competition_format:'league' });
    }
  });

  const deleteLeagueMutation = useMutation({
    mutationFn: async (leagueId) => {
      const ms = await base44.entities.Match.filter({ league_id: leagueId });
      await Promise.all(ms.map(m => base44.entities.Match.delete(m.id)));
      await base44.entities.League.delete(leagueId);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey:['leagues'] }); queryClient.invalidateQueries({ queryKey:['matches'] }); toast.success('Lega eliminata'); }
  });

  const closeLeagueMutation = useMutation({
    mutationFn: async (leagueId) => {
      const league = leagues.find(l => l.id === leagueId);

      // 1. Azzera cartellini gialli accumulati
      const playersWithYellows = allPlayers.filter(p => p.yellow_cards_accumulated > 0);
      await Promise.all(playersWithYellows.map(p => base44.entities.Player.update(p.id, { yellow_cards_accumulated: 0 })));

      // 2. Elimina squalifiche attive
      const suspensions = await base44.entities.PlayerStatus.filter({ status_type: 'suspended' });
      await Promise.all(suspensions.map(s => base44.entities.PlayerStatus.delete(s.id)));

      // 3. Premi classifica finale (solo per leghe campionato)
      const PRIZES = [70000000, 66000000, 65000000, 64000000, 63000000, 62000000, 61000000, 60000000, 59000000, 58000000];
      const SERIE_A_BONUS = 5000000; // bonus extra solo Serie A

      // Recupera classifica finale ordinata per punti
      const { data: standingsData } = await supabase
        .from('standings')
        .select('*')
        .eq('league_id', leagueId)
        .order('points', { ascending: false })
        .order('goal_difference', { ascending: false })
        .order('goals_for', { ascending: false });

      if (standingsData && standingsData.length > 0) {
        const isSerieA = league?.name?.toLowerCase().includes('serie a');

        for (let i = 0; i < standingsData.length; i++) {
          const standing = standingsData[i];
          const prize = PRIZES[i] || 58000000;
          const bonus = (i === 0 && isSerieA) ? SERIE_A_BONUS : 0;
          const totalPrize = prize + bonus;

          // Recupera team aggiornato
          const { data: teamData } = await supabase
            .from('teams')
            .select('budget')
            .eq('id', standing.team_id)
            .single();

          if (teamData) {
            const prevBudget = teamData.budget || 0;
            const newBudget = prevBudget + totalPrize;

            await supabase
              .from('teams')
              .update({ budget: newBudget })
              .eq('id', standing.team_id);

            await supabase
              .from('budget_transactions')
              .insert({
                team_id: standing.team_id,
                team_name: standing.team_name,
                amount: totalPrize,
                type: 'match_prize',
                description: `Premio ${i + 1}° posto - ${league?.name || 'Competizione'} (${league?.season || ''})${bonus > 0 ? ' + Bonus Serie A' : ''}`,
                previous_balance: prevBudget,
                new_balance: newBudget,
                league_id: leagueId
              });
          }
        }
      }

      // 4. Chiudi la lega
      await base44.entities.League.update(leagueId, { status: 'completed' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey:['leagues'] });
      queryClient.invalidateQueries({ queryKey:['allPlayers'] });
      queryClient.invalidateQueries({ queryKey:['teams'] });
      toast.success('Competizione chiusa e premi classifica accreditati!');
    }
  });

  const updateCompetitionMutation = useMutation({
    mutationFn: async ({ id, data }) => { await base44.entities.Competition.update(id, data); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey:['competitions'] }); toast.success('Competizione aggiornata'); setShowCompetitionEditModal(false); setEditingCompetition(null); }
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md"><CardContent className="pt-6 text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Accesso Negato</h2>
          <p className="text-slate-500">Solo gli amministratori possono accedere a questa sezione.</p>
        </CardContent></Card>
      </div>
    );
  }

  const handleLeagueLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingLeagueLogo(true);
    try {
      const { compressImage } = await import('@/lib/r2Client');
      const compressed = await compressImage(file, { maxWidth: 300, maxHeight: 300, quality: 0.8 });
      const fileName = `league-logos/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('backgrounds').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('backgrounds').getPublicUrl(fileName);
      setLeagueFormData(prev => ({ ...prev, logo_url: publicUrl }));
      toast.success('Logo caricato');
    } catch (err) {
      toast.error('Errore upload: ' + err.message);
    }
    setUploadingLeagueLogo(false);
    e.target.value = '';
  };

  const handleCreateLeague = async (e) => {
    e.preventDefault();
    if (leagueFormData.participating_teams.length < 2) { toast.error('Seleziona almeno 2 squadre'); return; }
    setLoading(true);
    try { await createLeagueMutation.mutateAsync({ ...leagueFormData, status:'active' }); }
    catch (error) { toast.error('Errore creazione lega: ' + error.message); }
    setLoading(false);
  };

  const toggleTeam = (teamId) => setLeagueFormData(prev => ({
    ...prev,
    participating_teams: prev.participating_teams.includes(teamId)
      ? prev.participating_teams.filter(id => id !== teamId)
      : [...prev.participating_teams, teamId]
  }));

  const handleGenerateNextKnockoutRound = async (competitionId) => {
    const competition = competitions.find(c => c.id === competitionId);
    if (!competition) { toast.error('Competizione non trovata'); return; }
    const competitionMatches = matches.filter(m => m.competition_id === competitionId);
    if (competitionMatches.filter(m => m.status !== 'completed').length > 0) { toast.error('Ci sono ancora partite da completare'); return; }
    if (competitionMatches.filter(m => m.status === 'completed').length === 0) { toast.error('Nessuna partita completata'); return; }
    if (!window.confirm(`Generare il turno successivo per "${competition.name}"?`)) return;
    setGeneratingKnockout(true);
    try {
      await base44.functions.invoke('generateNextKnockoutRound', { competition_id: competitionId });
      queryClient.invalidateQueries({ queryKey:['matches'] });
      toast.success('Turno successivo generato');
    } catch (error) { toast.error('Errore: ' + error.message); }
    setGeneratingKnockout(false);
    setSelectedKnockoutCompetition(null);
  };

  const toggleCompetitionTeam = (teamId) => setCompetitionFormData(prev => ({
    ...prev,
    participating_teams: prev.participating_teams.includes(teamId)
      ? prev.participating_teams.filter(id => id !== teamId)
      : [...prev.participating_teams, teamId]
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Pannello Admin</h1>
        <p className="text-slate-500">Gestione avanzata del sistema</p>
      </div>

      <Tabs defaultValue="approval" className="space-y-6">
        <TabsList>
          <TabsTrigger value="approval" className="flex items-center gap-2">
            <Users className="w-4 h-4" />Approvazioni
            {pendingPlayers.length > 0 && <Badge className="bg-amber-100 text-amber-700">{pendingPlayers.length}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="import" className="flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" />Importa Database</TabsTrigger>
          <TabsTrigger value="leagues" className="flex items-center gap-2"><Trophy className="w-4 h-4" />Leghe</TabsTrigger>
          <TabsTrigger value="reset" className="flex items-center gap-2"><Trash2 className="w-4 h-4" />Reset</TabsTrigger>
          <TabsTrigger value="duplicates" className="flex items-center gap-2"><Users className="w-4 h-4" />Doppioni</TabsTrigger>
          <TabsTrigger value="values" className="flex items-center gap-2"><TrendingUp className="w-4 h-4" />Valori</TabsTrigger>
          <TabsTrigger value="mercato" className="flex items-center gap-2"><ShoppingBag className="w-4 h-4" />Mercato</TabsTrigger>
          <TabsTrigger value="gettoni" className="flex items-center gap-2"><Ticket className="w-4 h-4" />Gettoni</TabsTrigger>
        </TabsList>

        {/* ── Import ── */}
        <TabsContent value="import">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-blue-500" />Importa / Aggiorna Giocatori da CSV</CardTitle>
            </CardHeader>
            <CardContent>
              <PlayerImporter allPlayers={allPlayers} queryClient={queryClient} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Approval ── */}
        <TabsContent value="approval"><PlayerApprovalManager /></TabsContent>

        {/* ── Reset ── */}
        <TabsContent value="reset" className="space-y-4">

          {/* Avviso generale */}
          <Card className="border-red-300 bg-red-50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 font-medium">
                  Tutte le operazioni in questa sezione sono <strong>irreversibili</strong>. Procedi solo se sei assolutamente sicuro.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* 1 — Azzera Statistiche Giocatori */}
          <ResetCard
            color="amber"
            title="Azzera Statistiche Giocatori"
            description="Azzera gol, assist, MVP, cartellini su tutti i giocatori. Elimina squalifiche, infortuni e classifiche."
            items={[
              'Gol, assist, MVP (tabella players)',
              'Cartellini gialli e rossi (tabella players)',
              'Squalifiche e infortuni (player_statuses)',
              'Sanzioni attive (sanctions)',
              'Classifiche (standings)',
            ]}
            confirmText="Azzera statistiche giocatori, squalifiche e classifiche? Operazione irreversibile."
            buttonLabel="Azzera Statistiche Giocatori"
            onConfirm={async () => {
              // 1. Reset colonne statistiche su players
              const { error: e1 } = await supabase
                .from('players')
                .update({ goals: 0, assists: 0, mvp_count: 0, yellow_cards: 0, red_cards: 0 })
                .neq('id', '00000000-0000-0000-0000-000000000000'); // tutti i record
              if (e1) throw new Error('players: ' + e1.message);

              // 2. Elimina tutti i player_statuses
              const { error: e2 } = await supabase
                .from('player_statuses')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');
              if (e2) throw new Error('player_statuses: ' + e2.message);

              // 3. Elimina tutte le sanctions
              const { error: e3 } = await supabase
                .from('sanctions')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');
              if (e3) throw new Error('sanctions: ' + e3.message);

              // 4. Elimina tutte le standings
              const { error: e4 } = await supabase
                .from('standings')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');
              if (e4) throw new Error('standings: ' + e4.message);
            }}
            queryClient={queryClient}
            successMessage="Statistiche giocatori azzerate con successo"
          />

          {/* 2 — Reset Aste */}
          <ResetCard
            color="orange"
            title="Reset Aste"
            description="Elimina tutte le aste e le relative offerte. I giocatori e le squadre restano invariati."
            items={[
              'Tutte le aste (auctions)',
              'Tutte le offerte (bids)',
            ]}
            confirmText="Eliminare TUTTE le aste e offerte? Operazione irreversibile."
            buttonLabel="Reset Aste e Offerte"
            onConfirm={async () => {
              const { error: e1 } = await supabase
                .from('bids')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');
              if (e1) throw new Error('bids: ' + e1.message);

              const { error: e2 } = await supabase
                .from('auctions')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');
              if (e2) throw new Error('auctions: ' + e2.message);
            }}
            queryClient={queryClient}
            successMessage="Aste e offerte eliminate"
          />

          {/* 3 — Reset Budget Squadre */}
          <ResetCard
            color="blue"
            title="Reset Budget Squadre"
            description="Ripristina il budget di tutte le squadre al valore di default (100.000.000€) ed elimina lo storico transazioni."
            items={[
              'Budget squadre → €100.000.000 (tabella teams)',
              'Storico transazioni (budget_transactions)',
            ]}
            confirmText="Ripristinare il budget di tutte le squadre a €100M ed eliminare lo storico transazioni?"
            buttonLabel="Reset Budget Squadre"
            onConfirm={async () => {
              const { error: e1 } = await supabase
                .from('teams')
                .update({ budget: 100000000 })
                .neq('id', '00000000-0000-0000-0000-000000000000');
              if (e1) throw new Error('teams budget: ' + e1.message);

              const { error: e2 } = await supabase
                .from('budget_transactions')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');
              if (e2) throw new Error('budget_transactions: ' + e2.message);
            }}
            queryClient={queryClient}
            successMessage="Budget squadre ripristinato e storico eliminato"
          />

          {/* 4 — Reset Completo Stagione */}
          <ResetCard
            color="purple"
            title="Reset Completo Stagione"
            description="Azzera l'intera stagione: partite, trasferimenti, aste, budget, sanzioni, classifiche e stati giocatori."
            items={[
              'Tutte le partite (matches)',
              'Tutti i trasferimenti (transfers)',
              'Tutte le aste e offerte (auctions + bids)',
              'Tutte le transazioni budget (budget_transactions)',
              'Classifiche (standings)',
              'Sanzioni (sanctions)',
              'Stati giocatori (player_statuses)',
            ]}
            confirmText="🔥 Reset TOTALE della stagione. Tutte le partite, trasferimenti, aste e budget saranno eliminati. Sei sicuro?"
            doubleConfirm
            buttonLabel="🔥 Reset Completo Stagione"
            onConfirm={async () => {
              const tables = ['bids', 'auctions', 'transfers', 'budget_transactions', 'standings', 'sanctions', 'player_statuses', 'matches'];
              for (const table of tables) {
                const { error } = await supabase
                  .from(table)
                  .delete()
                  .neq('id', '00000000-0000-0000-0000-000000000000');
                if (error) throw new Error(`${table}: ${error.message}`);
              }
              // Reset budget squadre
              const { error: eb } = await supabase
                .from('teams')
                .update({ budget: 100000000 })
                .neq('id', '00000000-0000-0000-0000-000000000000');
              if (eb) throw new Error('teams budget: ' + eb.message);
              // Reset statistiche giocatori
              const { error: ep } = await supabase
                .from('players')
                .update({ goals: 0, assists: 0, mvp_count: 0, yellow_cards: 0, red_cards: 0 })
                .neq('id', '00000000-0000-0000-0000-000000000000');
              if (ep) throw new Error('players stats: ' + ep.message);
            }}
            queryClient={queryClient}
            successMessage="Stagione azzerata completamente"
          />

          {/* 5 — Elimina Tutti i Giocatori */}
          <ResetCard
            color="red"
            title="Elimina Tutti i Giocatori"
            description="Cancella PERMANENTEMENTE tutti i giocatori dal database. Le squadre rimarranno vuote."
            items={[
              'Tutti i giocatori (tabella players)',
              'Stati giocatori collegati (player_statuses)',
              'Sanzioni collegate (sanctions)',
            ]}
            confirmText="⚠️ Eliminare TUTTI I GIOCATORI? Questa operazione non può essere annullata!"
            doubleConfirm
            buttonLabel="🗑️ Elimina Tutti i Giocatori"
            onConfirm={async () => {
              // Prima elimina le tabelle dipendenti
              for (const table of ['player_statuses', 'sanctions']) {
                const { error } = await supabase
                  .from(table)
                  .delete()
                  .neq('id', '00000000-0000-0000-0000-000000000000');
                if (error) throw new Error(`${table}: ${error.message}`);
              }
              // Poi elimina i giocatori
              const { error } = await supabase
                .from('players')
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000');
              if (error) throw new Error('players: ' + error.message);
            }}
            queryClient={queryClient}
            successMessage="Tutti i giocatori eliminati"
          />

        </TabsContent>

        {/* ── Leagues ── */}
        <TabsContent value="leagues" className="space-y-6">
          <div className="flex justify-end">
            <Button onClick={() => setShowLeagueForm(true)} className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-2" />Nuova Lega
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {leagues.map(league => {
              const lc = competitions.find(c => c.league_id === league.id);
              const isKO = lc?.format === 'knockout';
              return (
                <Card key={league.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{league.name}</CardTitle>
                      <Button size="icon" variant="ghost" className="text-rose-500 hover:text-rose-700"
                        onClick={() => { if (window.confirm(`Eliminare "${league.name}"?`)) deleteLeagueMutation.mutate(league.id); }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Badge variant="outline">{league.status === 'active' ? 'Attiva' : league.status === 'completed' ? 'Completata' : 'Bozza'}</Badge>
                    <p className="text-sm text-slate-500">Stagione: {league.season}</p>
                    {isKO && <Badge className="bg-purple-100 text-purple-700">⚔️ Eliminazione Diretta</Badge>}
                    {league.status === 'active' && isKO && lc && (
                      <Button size="sm" variant="outline" className="w-full border-purple-300 text-purple-700"
                        onClick={() => { setSelectedKnockoutCompetition(lc.id); handleGenerateNextKnockoutRound(lc.id); }}
                        disabled={generatingKnockout && selectedKnockoutCompetition === lc.id}>
                        {generatingKnockout && selectedKnockoutCompetition === lc.id && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Genera Turno Successivo
                      </Button>
                    )}
                    {lc && (
                      <Button size="sm" variant="outline" className="w-full border-blue-300 text-blue-700"
                        onClick={() => { setEditingCompetition(lc); setCompetitionFormData({ name:lc.name, format:lc.format, participating_teams:lc.participating_teams||[] }); setShowCompetitionEditModal(true); }}>
                        <Settings className="w-4 h-4 mr-2" />Modifica Competizione
                      </Button>
                    )}
                    {league.status === 'active' && (
                      <Button size="sm" variant="outline" className="w-full border-amber-300 text-amber-700"
                        onClick={() => { if (window.confirm(`Chiudere "${league.name}"?`)) closeLeagueMutation.mutate(league.id); }}>
                        Chiudi Competizione
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {leagues.length === 0 && (
              <Card className="bg-slate-50 border-dashed col-span-full">
                <CardContent className="py-8 text-center"><Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" /><p className="text-slate-500">Nessuna lega creata</p></CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* ── Duplicates ── */}
        <TabsContent value="duplicates" className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-orange-500" />Gestione Giocatori Duplicati</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-sm text-amber-800">ℹ️ Identifica giocatori con lo stesso nome e cognome. Seleziona i duplicati da eliminare.</p>
              </div>
              <Button onClick={async () => {
                setLoadingDuplicates(true);
                try {
                  const result = await base44.functions.invoke('findDuplicatePlayers', {});
                  const dupes = result.data?.duplicates || result.duplicates || [];
                  setDuplicates(dupes);
                  if (dupes.length === 0) toast.success('Nessun duplicato trovato');
                  else toast.info(`Trovati ${dupes.length} gruppi di duplicati`);
                } catch (e) { toast.error('Errore: ' + e.message); }
                setLoadingDuplicates(false);
              }} disabled={loadingDuplicates} className="bg-orange-600 hover:bg-orange-700">
                {loadingDuplicates && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}🔍 Trova Giocatori Duplicati
              </Button>
              {duplicates.length > 0 && (
                <>
                  <div className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-800 font-medium">Trovati {duplicates.length} gruppi</p>
                    <Button variant="outline" size="sm" className="border-blue-300 text-blue-700" onClick={() => {
                      const allIds = duplicates.flatMap(g => g.players.map(p => p.id));
                      const allSel = allIds.every(id => selectedDuplicatesToDelete.includes(id));
                      setSelectedDuplicatesToDelete(allSel ? [] : allIds);
                    }}>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {selectedDuplicatesToDelete.length === duplicates.flatMap(g => g.players).length ? 'Deseleziona Tutti' : 'Seleziona Tutti'}
                    </Button>
                  </div>
                  <div className="space-y-4">
                    {duplicates.map((group, idx) => {
                      const allGroupIds = group.players.map(p => p.id);
                      return (
                        <Card key={idx} className="border-orange-200">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                              <Checkbox checked={allGroupIds.every(id => selectedDuplicatesToDelete.includes(id))}
                                onCheckedChange={(checked) => {
                                  if (checked) setSelectedDuplicatesToDelete(prev => [...prev, ...allGroupIds.filter(id => !prev.includes(id))]);
                                  else setSelectedDuplicatesToDelete(prev => prev.filter(id => !allGroupIds.includes(id)));
                                }} />
                              <Users className="w-4 h-4 text-orange-500" />{group.name}
                              <Badge variant="outline" className="ml-auto">{group.players.length} duplicati</Badge>
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              {group.players.map(player => {
                                const team = teams.find(t => t.id === player.team_id);
                                return (
                                  <div key={player.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                                    <Checkbox checked={selectedDuplicatesToDelete.includes(player.id)}
                                      onCheckedChange={(checked) => {
                                        if (checked) setSelectedDuplicatesToDelete(prev => [...prev, player.id]);
                                        else setSelectedDuplicatesToDelete(prev => prev.filter(id => id !== player.id));
                                      }} />
                                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                                      <div><span className="text-slate-500 text-xs">Nome:</span><p className="font-medium">{player.first_name} {player.last_name}</p></div>
                                      <div><span className="text-slate-500 text-xs">Ruolo:</span><p>{player.age||'-'} / {player.role}</p></div>
                                      <div><span className="text-slate-500 text-xs">OVR:</span><p className="font-semibold text-emerald-600">{player.overall_rating||'-'}</p></div>
                                      <div><span className="text-slate-500 text-xs">Squadra:</span><p>{team?.name||'Svincolato'}</p></div>
                                    </div>
                                    <Badge variant={player.status==='approved'?'default':'secondary'}>{player.status}</Badge>
                                  </div>
                                );
                              })}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                  {selectedDuplicatesToDelete.length > 0 && (
                    <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-lg">
                      <div>
                        <p className="font-medium text-red-800">{selectedDuplicatesToDelete.length} giocatori selezionati</p>
                        <p className="text-xs text-red-600">Questa azione non può essere annullata</p>
                      </div>
                      <Button onClick={async () => {
                        if (!window.confirm(`Eliminare ${selectedDuplicatesToDelete.length} giocatori?`)) return;
                        setLoadingDuplicates(true);
                        let deleted = 0, errors = 0;
                        try {
                          for (const id of selectedDuplicatesToDelete) {
                            try {
                              // Elimina tutti i record collegati per evitare FK constraint (409)
                              await supabase.from('player_statuses').delete().eq('player_id', id);
                              await supabase.from('bids').delete().eq('player_id', id);
                              await supabase.from('auctions').delete().eq('player_id', id);
                              await supabase.from('sanctions').delete().eq('player_id', id);
                              await supabase.from('budget_transactions').update({ related_player_id: null }).eq('related_player_id', id);
                              await supabase.from('matches').update({ mvp_player_id: null }).eq('mvp_player_id', id);
                              await supabase.from('transfers').update({ player_id: null }).eq('player_id', id);
                              await base44.entities.Player.delete(id);
                              deleted++;
                            } catch (e) {
                              console.error('Errore eliminazione giocatore', id, e.message);
                              errors++;
                            }
                          }
                          if (errors > 0) toast.error(`Eliminati ${deleted}, errori su ${errors}`);
                          else toast.success(`${deleted} giocatori eliminati`);
                          setSelectedDuplicatesToDelete([]); setDuplicates([]);
                          queryClient.invalidateQueries({ queryKey:['allPlayers'] });
                        } catch (e) { toast.error('Errore: ' + e.message); }
                        setLoadingDuplicates(false);
                      }} disabled={loadingDuplicates} variant="destructive">
                        {loadingDuplicates && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        <Trash2 className="w-4 h-4 mr-2" />Elimina Selezionati
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="values" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                Aggiorna Valori di Mercato e Stipendi
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                <p className="font-semibold mb-2">Come funziona il calcolo:</p>
                <ul className="space-y-1 list-disc ml-4">
                  <li>Overall 90+ età 23-28 → fino a <strong>150M€</strong></li>
                  <li>Overall 85-89 età &lt;25 → fino a <strong>50M€</strong></li>
                  <li>Overall 85+ senior → fino a <strong>80M€</strong></li>
                  <li>Overall 80-85 → fino a <strong>50M€</strong></li>
                  <li>Overall &lt;80 → fino a <strong>30M€</strong></li>
                </ul>
                <p className="font-semibold mt-3 mb-2">Stipendi:</p>
                <ul className="space-y-1 list-disc ml-4">
                  <li>Overall 90+ → <strong>10M€/anno</strong></li>
                  <li>Overall 88-89 → <strong>7M€/anno</strong></li>
                  <li>Overall 85-87 → <strong>5M€/anno</strong></li>
                  <li>Overall 82-84 → <strong>3M€/anno</strong></li>
                  <li>Overall 75-81 → <strong>1.5M€/anno</strong></li>
                  <li>Overall 65-74 → <strong>500K€/anno</strong></li>
                </ul>
              </div>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 w-full"
                onClick={async () => {
                  const t = toast.loading('Calcolo valori in corso...');
                  try {
                    const allPlayers = await base44.entities.Player.list();
                    const result = await base44.functions.invoke('updatePlayerMarketValueAndSalary', { players: allPlayers });
                    toast.dismiss(t);
                    toast.success(`Aggiornati ${result.updated || 0} giocatori`);
                    queryClient.invalidateQueries({ queryKey: ['players'] });
                  } catch (e) {
                    toast.dismiss(t);
                    toast.error('Errore: ' + e.message);
                  }
                }}
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Aggiorna Valori e Stipendi di tutti i Giocatori
              </Button>
            </CardContent>
          </Card>

          {/* Card modifica manuale valore giocatore */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-blue-500" />
                Modifica Valore Singolo Giocatore
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Cerca giocatore per nome..."
                value={valueSearchTerm}
                onChange={(e) => { setValueSearchTerm(e.target.value); setEditingPlayerValue(null); }}
              />
              {valueSearchTerm.length >= 2 && (
                <div className="border rounded-lg divide-y max-h-60 overflow-y-auto">
                  {allPlayers
                    .filter(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(valueSearchTerm.toLowerCase()))
                    .slice(0, 10)
                    .map(p => (
                      <div
                        key={p.id}
                        onClick={() => setEditingPlayerValue({
                          id: p.id,
                          name: `${p.first_name} ${p.last_name}`,
                          role: p.role,
                          overall_rating: p.overall_rating,
                          player_value: p.player_value || 0,
                          salary: p.salary || 0
                        })}
                        className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                          editingPlayerValue?.id === p.id ? 'bg-blue-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <p className="font-medium text-slate-800">{p.first_name} {p.last_name}</p>
                          <p className="text-xs text-slate-500">{p.role} · OVR {p.overall_rating || '-'}</p>
                        </div>
                        <div className="text-right text-sm">
                          <p className="text-emerald-600 font-semibold">€{p.player_value ? (p.player_value/1000000).toFixed(1)+'M' : '-'}</p>
                          <p className="text-slate-400">Stip: €{p.salary ? (p.salary/1000000).toFixed(1)+'M' : '-'}</p>
                        </div>
                      </div>
                    ))}
                  {allPlayers.filter(p => `${p.first_name} ${p.last_name}`.toLowerCase().includes(valueSearchTerm.toLowerCase())).length === 0 && (
                    <p className="text-center text-slate-400 py-4 text-sm">Nessun giocatore trovato</p>
                  )}
                </div>
              )}

              {editingPlayerValue && (
                <div className="bg-slate-50 rounded-lg p-4 space-y-3 border">
                  <p className="font-semibold text-slate-800">{editingPlayerValue.name}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">Valore Mercato (€)</label>
                      <Input
                        type="number"
                        value={editingPlayerValue.player_value}
                        onChange={(e) => setEditingPlayerValue(prev => ({ ...prev, player_value: parseFloat(e.target.value) || 0 }))}
                        placeholder="Es: 50000000"
                      />
                      <p className="text-xs text-slate-400">= €{(editingPlayerValue.player_value/1000000).toFixed(2)}M</p>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-slate-600">Stipendio (€/anno)</label>
                      <Input
                        type="number"
                        value={editingPlayerValue.salary}
                        onChange={(e) => setEditingPlayerValue(prev => ({ ...prev, salary: parseFloat(e.target.value) || 0 }))}
                        placeholder="Es: 5000000"
                      />
                      <p className="text-xs text-slate-400">= €{(editingPlayerValue.salary/1000000).toFixed(2)}M</p>
                    </div>
                  </div>
                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    disabled={savingPlayerValue}
                    onClick={async () => {
                      setSavingPlayerValue(true);
                      try {
                        await base44.entities.Player.update(editingPlayerValue.id, {
                          player_value: editingPlayerValue.player_value,
                          salary: editingPlayerValue.salary
                        });
                        queryClient.invalidateQueries({ queryKey: ['allPlayers'] });
                        toast.success(`Valori aggiornati per ${editingPlayerValue.name}`);
                        setEditingPlayerValue(null);
                        setValueSearchTerm('');
                      } catch (e) {
                        toast.error('Errore: ' + e.message);
                      }
                      setSavingPlayerValue(false);
                    }}
                  >
                    {savingPlayerValue ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvataggio...</> : 'Salva Modifiche'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── MERCATO ── */}
        <TabsContent value="mercato" className="space-y-6">
          <MercatoManager />
        </TabsContent>

        {/* ── Gettoni ── */}
        <TabsContent value="gettoni" className="space-y-6">
          <GettoniManager teams={teams} />
        </TabsContent>
      </Tabs>

      {/* League Form */}
      <Dialog open={showLeagueForm} onOpenChange={setShowLeagueForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuova Lega</DialogTitle></DialogHeader>
          <form onSubmit={handleCreateLeague} className="space-y-4">
            <div className="space-y-2"><Label>Nome Lega *</Label><Input value={leagueFormData.name} onChange={(e) => setLeagueFormData({...leagueFormData, name:e.target.value})} placeholder="Es: Serie A Fantasy" required /></div>
            <div className="space-y-2">
              <Label>Logo Competizione</Label>
              <div className="flex items-center gap-3">
                {leagueFormData.logo_url && (
                  <img src={leagueFormData.logo_url} alt="Logo" className="w-12 h-12 rounded-lg object-cover border" />
                )}
                <input type="file" accept="image/*" onChange={handleLeagueLogoUpload} className="hidden" id="league-logo-upload" disabled={uploadingLeagueLogo} />
                <label htmlFor="league-logo-upload" className="flex-1">
                  <Button type="button" variant="outline" className="w-full cursor-pointer" disabled={uploadingLeagueLogo} asChild>
                    <span>{uploadingLeagueLogo ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Caricamento...</> : <><Upload className="w-4 h-4 mr-2" />{leagueFormData.logo_url ? 'Cambia logo' : 'Carica logo'}</>}</span>
                  </Button>
                </label>
              </div>
            </div>
            <div className="space-y-2"><Label>Stagione *</Label><Input value={leagueFormData.season} onChange={(e) => setLeagueFormData({...leagueFormData, season:e.target.value})} placeholder="Es: 2024/2025" required /></div>
            <div className="space-y-2">
              <Label>Formato *</Label>
              <Select value={leagueFormData.competition_format} onValueChange={(v) => setLeagueFormData({...leagueFormData, competition_format:v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="league">🏆 Campionato Classico (A/R)</SelectItem>
                  <SelectItem value="knockout">⚔️ Coppa Eliminazione Diretta</SelectItem>
                  <SelectItem value="world_cup">🌍 Stile Mondiale (Gironi + KO)</SelectItem>
                  <SelectItem value="champions_swiss">⭐ Champions Swiss System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Squadre Partecipanti *</Label>
              <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                {teams.map(team => (
                  <div key={team.id} className="flex items-center gap-2">
                    <Checkbox checked={leagueFormData.participating_teams.includes(team.id)} onCheckedChange={() => toggleTeam(team.id)} />
                    <Label className="cursor-pointer">{team.name} <span className="text-xs text-slate-500">({team.team_type === 'primavera' ? 'Primavera' : 'Maggiore'})</span></Label>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">Selezionate: {leagueFormData.participating_teams.length}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowLeagueForm(false)}>Annulla</Button>
              <Button type="submit" disabled={loading || leagueFormData.participating_teams.length < 2}>
                {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Crea Lega
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Competition Edit */}
      <Dialog open={showCompetitionEditModal} onOpenChange={setShowCompetitionEditModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Modifica: {editingCompetition?.name}</DialogTitle></DialogHeader>
          <form onSubmit={async (e) => {
            e.preventDefault();
            if (competitionFormData.participating_teams.length < 2) { toast.error('Seleziona almeno 2 squadre'); return; }
            await updateCompetitionMutation.mutateAsync({ id: editingCompetition.id, data: competitionFormData });
          }} className="space-y-4">
            <div className="space-y-2"><Label>Nome *</Label><Input value={competitionFormData.name} onChange={(e) => setCompetitionFormData({...competitionFormData, name:e.target.value})} required /></div>
            <div className="space-y-2">
              <Label>Formato *</Label>
              <Select value={competitionFormData.format} onValueChange={(v) => setCompetitionFormData({...competitionFormData, format:v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="league">🏆 Campionato</SelectItem>
                  <SelectItem value="knockout">⚔️ Eliminazione</SelectItem>
                  <SelectItem value="world_cup">🌍 Mondiale</SelectItem>
                  <SelectItem value="champions_swiss">⭐ Champions Swiss</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Squadre *</Label>
              <div className="border rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                {teams.map(team => (
                  <div key={team.id} className="flex items-center gap-2">
                    <Checkbox checked={competitionFormData.participating_teams.includes(team.id)} onCheckedChange={() => toggleCompetitionTeam(team.id)} />
                    <Label className="cursor-pointer">{team.name}</Label>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-800">⚠️ Modificare formato o squadre non rigenera il calendario automaticamente.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCompetitionEditModal(false)}>Annulla</Button>
              <Button type="submit" disabled={competitionFormData.participating_teams.length < 2}>Salva</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
