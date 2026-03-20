import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, ExternalLink, FileText, Info } from 'lucide-react';

// Il PDF si trova in: public/regolamento.pdf
// Per aggiornarlo: sostituisci il file in quella cartella e rebuilda
const PDF_URL = '/regolamento.pdf';

export default function Regolamento() {
  const [user, setUser] = useState(null);
  const [pdfExists, setPdfExists] = useState(true);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    // Verifica se il PDF esiste
    fetch(PDF_URL, { method: 'HEAD' })
      .then(res => setPdfExists(res.ok))
      .catch(() => setPdfExists(false));
  }, []);

  const isAdmin = user?.role === 'admin';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BookOpen className="w-7 h-7 text-emerald-600" />
            Regolamento
          </h1>
          <p className="text-slate-500 mt-1">Regolamento ufficiale della lega</p>
        </div>

        {pdfExists && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.open(PDF_URL, '_blank')}
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            Apri in nuova scheda
          </Button>
        )}
      </div>

      {/* Box istruzioni admin */}
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-semibold mb-1">Come aggiornare il regolamento:</p>
            <ol className="list-decimal ml-4 space-y-1">
              <li>Rinomina il tuo PDF in <code className="bg-blue-100 px-1 rounded">regolamento.pdf</code></li>
              <li>Copialo nella cartella <code className="bg-blue-100 px-1 rounded">fc-fanta-standalone\public\</code></li>
              <li>Sostituisci il file esistente se già presente</li>
              <li>Il regolamento sarà immediatamente visibile a tutti gli utenti</li>
            </ol>
          </div>
        </div>
      )}

      {/* Contenuto */}
      {pdfExists ? (
        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            <iframe
              src={PDF_URL}
              className="w-full"
              style={{ height: 'calc(100vh - 220px)', minHeight: '600px' }}
              title="Regolamento Lega"
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium text-lg">Nessun regolamento disponibile</p>
            {isAdmin ? (
              <p className="text-slate-400 text-sm mt-2">
                Segui le istruzioni qui sopra per caricare il PDF
              </p>
            ) : (
              <p className="text-slate-400 text-sm mt-2">
                Il regolamento non è ancora stato pubblicato. Contatta l'amministratore.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
