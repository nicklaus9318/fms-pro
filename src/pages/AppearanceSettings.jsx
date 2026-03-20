import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { supabase } from '@/api/supabaseClient';
import { compressImage } from '@/lib/r2Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Image, Upload, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';

export default function AppearanceSettings() {
  const [user, setUser] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [currentBg, setCurrentBg] = useState(null);

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
        if (userData.role !== 'admin') {
          window.location.href = '/';
        }
      } catch (e) {
        base44.auth.redirectToLogin();
      }
    };
    loadUser();
  }, []);

  const { data: settings = [] } = useQuery({
    queryKey: ['appSettings'],
    queryFn: () => base44.entities.AppSettings.list()
  });

  useEffect(() => {
    const bgSetting = settings.find(s => s.key === 'background_image');
    if (bgSetting && bgSetting.value) {
      setCurrentBg(bgSetting.value);
      document.body.style.backgroundImage = `linear-gradient(rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.85)), url(${bgSetting.value})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
    }
  }, [settings]);

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }) => {
      const existing = settings.find(s => s.key === key);
      if (existing) {
        return base44.entities.AppSettings.update(existing.id, { value });
      } else {
        return base44.entities.AppSettings.create({ key, value, description: 'Immagine di sfondo sito' });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appSettings'] });
      toast.success('Sfondo aggiornato con successo');
    }
  });

  const handleBackgroundUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    try {
      // Comprimi e carica su Supabase Storage
      const compressed = await compressImage(file, { maxWidth: 1920, maxHeight: 1080, quality: 0.65 });
      const fileName = `background_${Date.now()}.jpg`;
      const { data, error } = await supabase.storage.from('backgrounds').upload(fileName, compressed, { upsert: true, contentType: 'image/jpeg' });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('backgrounds').getPublicUrl(fileName);

      await updateSettingMutation.mutateAsync({
        key: 'background_image',
        value: publicUrl
      });

      setCurrentBg(publicUrl);
      document.body.style.backgroundImage = `linear-gradient(rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.85)), url(${publicUrl})`;
      document.body.style.backgroundSize = 'cover';
      document.body.style.backgroundPosition = 'center';
      document.body.style.backgroundAttachment = 'fixed';
    } catch (error) {
      toast.error('Errore caricamento: ' + error.message);
    }
    setUploading(false);
    e.target.value = '';
  };

  const handleRemoveBackground = async () => {
    await updateSettingMutation.mutateAsync({
      key: 'background_image',
      value: ''
    });
    setCurrentBg(null);
    document.body.style.backgroundImage = '';
    toast.success('Sfondo rimosso');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Personalizzazione Aspetto</h1>
        <p className="text-slate-500">Personalizza l'aspetto del sito</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Image className="w-5 h-5 text-emerald-500" />
            Sfondo Sito
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Immagine di Sfondo</Label>
            <p className="text-sm text-slate-500">
              Carica un'immagine che verrà applicata come sfondo dell'intero sito
            </p>
          </div>

          {currentBg ? (
            <div className="space-y-4">
              <div className="relative rounded-xl overflow-hidden border-2 border-slate-200">
                <img
                  src={currentBg}
                  alt="Background"
                  className="w-full h-48 object-cover"
                />
                <div className="absolute inset-0 bg-slate-900/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemoveBackground}
                    className="gap-2"
                  >
                    <X className="w-4 h-4" />
                    Rimuovi
                  </Button>
                </div>
              </div>

              <div className="flex gap-3">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleBackgroundUpload}
                  className="hidden"
                  id="bg-upload"
                  disabled={uploading}
                />
                <label htmlFor="bg-upload" className="flex-1">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={uploading}
                    asChild
                  >
                    <span className="flex items-center justify-center gap-2">
                      {uploading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Caricamento...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Cambia Sfondo
                        </>
                      )}
                    </span>
                  </Button>
                </label>
              </div>
            </div>
          ) : (
            <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-emerald-300 transition-colors">
              <input
                type="file"
                accept="image/*"
                onChange={handleBackgroundUpload}
                className="hidden"
                id="bg-upload-new"
                disabled={uploading}
              />
              <label htmlFor="bg-upload-new" className="cursor-pointer">
                {uploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
                    <p className="text-slate-600">Caricamento in corso...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Upload className="w-10 h-10 text-slate-300" />
                    <p className="text-slate-600">Clicca per caricare un'immagine di sfondo</p>
                    <p className="text-sm text-slate-400">Supporta JPG, PNG, GIF (max 10MB)</p>
                  </div>
                )}
              </label>
            </div>
          )}

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>💡 Suggerimento:</strong> L'immagine verrà applicata con un overlay scuro per garantire la leggibilità del testo.
              Funziona meglio con immagini ad alta risoluzione.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
