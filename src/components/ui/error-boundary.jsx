import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="w-5 h-5" />
                Errore Imprevisto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-slate-600">
                Si è verificato un errore. Prova a ricaricare la pagina.
              </p>
              <div className="bg-red-50 border border-red-100 rounded-lg p-3">
                <p className="text-xs text-red-800 font-mono">
                  {this.state.error?.message || 'Errore sconosciuto'}
                </p>
              </div>
              <Button
                onClick={() => window.location.reload()}
                className="w-full bg-red-500 hover:bg-red-600"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Ricarica Pagina
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}