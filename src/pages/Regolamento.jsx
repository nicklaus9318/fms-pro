import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, Download, Upload, FileText, Info, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

export default function Regolamento() {
  const [user, setUser] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const isAdmin = user?.role === 'admin';

  // Leggi URL del PDF da app_settings
  const { data: appSettings = [], refetch } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list()
  });

  const regolamentoUrl = appSettings.find(s => s.key === 'regolamento_url')?.value || null;
  const regolamentoName = appSettings.find(s => s.key === 'regolamento_name')?.value || 'regolamento.pdf';

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      toast.error('Carica solo file PDF');
      return;
    }

    setUploading(true);
    try {
      const fileName = `regolamento/regolamento_${Date.now()}.pdf`;
      const { error } = await supabase.storage
        .from('backgrounds')
        .upload(fileName, file, { upsert: true, contentType: 'application/pdf' });
      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('backgrounds')
        .getPublicUrl(fileName);

      // Salva URL in app_settings
      const existingUrl = appSettings.find(s => s.key === 'regolamento_url');
      const existingName = appSettings.find(s => s.key === 'regolamento_name');

      if (existingUrl) {
        await base44.entities.AppSettings.update(existingUrl.id, { value: publicUrl });
      } else {
        await base44.entities.AppSettings.create({ key: 'regolamento_url', value: publicUrl });
      }
      if (existingName) {
        await base44.entities.AppSettings.update(existingName.id, { value: file.name });
      } else {
        await base44.entities.AppSettings.create({ key: 'regolamento_name', value: file.name });
      }

      await refetch();
      toast.success('Regolamento caricato con successo!');
    } catch (err) {
      toast.error('Errore upload: ' + err.message);
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleDownload = () => {
    if (!regolamentoUrl) return;
    const a = document.createElement('a');
    a.href = regolamentoUrl;
    a.download = regolamentoName;
    a.target = '_blank';
    a.click();
  };

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
      </div>

      {/* Admin upload */}
      {isAdmin && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800 font-semibold">Carica o aggiorna il regolamento PDF</p>
          </div>
          <input
            type="file"
            accept="application/pdf"
            onChange={handleUpload}
            className="hidden"
            id="regolamento-upload"
            disabled={uploading}
          />
          <label htmlFor="regolamento-upload">
            <Button
              type="button"
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-100 cursor-pointer"
              disabled={uploading}
              asChild
            >
              <span>
                {uploading
                  ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Caricamento...</>
                  : <><Upload className="w-4 h-4 mr-2" />{regolamentoUrl ? 'Aggiorna PDF' : 'Carica PDF'}</>
                }
              </span>
            </Button>
          </label>
        </div>
      )}

      {/* Contenuto */}
      {regolamentoUrl ? (
        <Card className="border-0 shadow-sm">
          <CardContent className="py-10 text-center space-y-5">
            <div className="w-20 h-20 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto">
              <FileText className="w-10 h-10 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-slate-800 text-lg">Regolamento disponibile</p>
              <p className="text-slate-500 text-sm mt-1">{regolamentoName}</p>
            </div>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 px-8"
              onClick={handleDownload}
            >
              <Download className="w-4 h-4 mr-2" />
              Scarica Regolamento PDF
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-50 border-dashed">
          <CardContent className="py-16 text-center">
            <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 font-medium text-lg">Nessun regolamento disponibile</p>
            {isAdmin ? (
              <p className="text-slate-400 text-sm mt-2">Carica il PDF usando il pulsante qui sopra</p>
            ) : (
              <p className="text-slate-400 text-sm mt-2">Il regolamento non è ancora stato pubblicato. Contatta l'amministratore.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
