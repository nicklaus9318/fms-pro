import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Badge } from "@/components/ui/badge";
import { Wifi, WifiOff } from 'lucide-react';

export default function ConnectionStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showOffline, setShowOffline] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowOffline(false);
      queryClient.invalidateQueries();
    };
    
    const handleOffline = () => {
      setIsOnline(false);
      setShowOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [queryClient]);

  if (!showOffline && isOnline) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
      <Badge 
        variant={isOnline ? "default" : "destructive"} 
        className="flex items-center gap-2 py-2 px-3 shadow-lg"
      >
        {isOnline ? (
          <>
            <Wifi className="w-4 h-4" />
            Connesso
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4" />
            Nessuna Connessione
          </>
        )}
      </Badge>
    </div>
  );
}