import { useState, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';
import { Trophy } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [registrationsOpen, setRegistrationsOpen] = useState(true);

  useEffect(() => {
    const checkRegistrations = async () => {
      const { data } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'registrations_status')
        .single();
      setRegistrationsOpen(data?.value !== 'closed');
    };
    checkRegistrations();
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        // Controlla se le registrazioni sono aperte
        const { data: regSetting } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'registrations_status')
          .single();

        if (regSetting?.value === 'closed') {
          setError('Le registrazioni sono attualmente chiuse. Contatta un amministratore per accedere.');
          setLoading(false);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } }
        });
        if (error) throw error;
        setMessage('Registrazione completata! Controlla la tua email per confermare.');
      }
    } catch (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Email o password errati'
        : err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25 mb-4">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">FMS Pro</h1>
          <p className="text-slate-400 text-sm">Football Management System</p>
        </div>

        {/* Card */}
        <div className="bg-slate-800 rounded-2xl p-8 shadow-xl border border-slate-700">
          <h2 className="text-xl font-semibold text-white mb-6">
            {isLogin ? 'Accedi al tuo account' : 'Crea un account'}
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {message && (
            <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm">
              {message}
            </div>
          )}

          <div className="space-y-4">
            {!isLogin && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Nome completo</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Mario Rossi"
                  className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="mario@example.com"
                className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 transition-colors"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-500/50 text-white font-semibold rounded-lg transition-colors"
            >
              {loading ? 'Caricamento...' : isLogin ? 'Accedi' : 'Registrati'}
            </button>
          </div>

          <p className="mt-6 text-center text-slate-400 text-sm">
            {isLogin ? (
              registrationsOpen ? (
                <>
                  Non hai un account?{' '}
                  <button
                    onClick={() => { setIsLogin(false); setError(''); setMessage(''); }}
                    className="text-emerald-400 hover:text-emerald-300 font-medium"
                  >
                    Registrati
                  </button>
                </>
              ) : (
                <span className="text-slate-500">Le registrazioni sono attualmente chiuse.</span>
              )
            ) : (
              <>
                Hai già un account?{' '}
                <button
                  onClick={() => { setIsLogin(true); setError(''); setMessage(''); }}
                  className="text-emerald-400 hover:text-emerald-300 font-medium"
                >
                  Accedi
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
