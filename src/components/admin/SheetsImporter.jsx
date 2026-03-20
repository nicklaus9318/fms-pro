import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FileSpreadsheet, Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function SheetsImporter() {
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [result, setResult] = useState(null);

  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: async () => {
      // Extract spreadsheet ID from URL
      let spreadsheetId = spreadsheetUrl;
      
      const urlMatch = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
      if (urlMatch) {
        spreadsheetId = urlMatch[1];
      }

      const response = await base44.functions.invoke('importPlayersFromSheets', {
        spreadsheetId,
        sheetName: sheetName || null
      });

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['players'] });
      queryClient.invalidateQueries({ queryKey: ['allPlayers'] });
      setResult(data);
      toast.success(`Importati ${data.imported} giocatori su ${data.total} righe`);
    },
    onError: (error) => {
      toast.error(error.message || 'Errore durante l\'importazione');
      setResult({ error: error.message });
    }
  });

  const handleImport = (e) => {
    e.preventDefault();
    if (!spreadsheetUrl) {
      toast.error('Inserisci l\'URL del foglio Google Sheets');
      return;
    }
    setResult(null);
    importMutation.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          Importa da Google Sheets
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription className="text-sm">
            <strong>Formato richiesto:</strong> Il foglio deve avere una riga di intestazione con colonne come: 
            Nome, Cognome, Età, Ruolo, Overall, Stipendio, Valore, SoFIFA ID/Link
          </AlertDescription>
        </Alert>

        <form onSubmit={handleImport} className="space-y-4">
          <div className="space-y-2">
            <Label>URL Google Sheets</Label>
            <Input
              value={spreadsheetUrl}
              onChange={(e) => setSpreadsheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Nome Foglio (opzionale)</Label>
            <Input
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Foglio1"
            />
            <p className="text-xs text-slate-500">
              Lascia vuoto per usare il primo foglio
            </p>
          </div>

          <Button
            type="submit"
            disabled={importMutation.isPending}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importazione in corso...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Importa Giocatori
              </>
            )}
          </Button>
        </form>

        {result && (
          <div className="mt-4 space-y-2">
            {result.success ? (
              <Alert className="border-emerald-200 bg-emerald-50">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                <AlertDescription>
                  <strong>Importazione completata!</strong>
                  <div className="mt-2 text-sm">
                    <p>✓ Giocatori importati: {result.imported}</p>
                    <p>• Totale righe processate: {result.total}</p>
                    {result.errors && result.errors.length > 0 && (
                      <p className="text-orange-600">⚠ Errori: {result.errors.length}</p>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="w-4 h-4 text-red-600" />
                <AlertDescription>
                  <strong>Errore:</strong> {result.error}
                </AlertDescription>
              </Alert>
            )}

            {result.errors && result.errors.length > 0 && (
              <div className="text-xs bg-slate-50 p-3 rounded border max-h-40 overflow-y-auto">
                <strong>Dettagli errori:</strong>
                {result.errors.map((err, idx) => (
                  <div key={idx} className="mt-1 text-slate-600">
                    Riga {err.row}: {err.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}