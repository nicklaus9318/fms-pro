import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/api/supabaseClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings] = useState({ id: 'local', public_settings: {} });

  useEffect(() => {
    // Controlla sessione esistente
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        loadUserWithRole(session.user);
      } else {
        setIsLoadingAuth(false);
        setAuthError({ type: 'auth_required' });
      }
    });

    // Ascolta cambiamenti auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadUserWithRole(session.user);
      } else {
        setUser(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required' });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadUserWithRole = async (supabaseUser) => {
    try {
      // Carica ruolo dalla tabella user_roles
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('email', supabaseUser.email)
        .single();

      const role = roleData?.role || 'user';

      const userData = {
        id: supabaseUser.id,
        email: supabaseUser.email,
        full_name: supabaseUser.user_metadata?.full_name || supabaseUser.email,
        role,
      };

      setUser(userData);
      setIsAuthenticated(true);
      setAuthError(null);
    } catch (error) {
      setAuthError({ type: 'unknown', message: error.message });
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setIsAuthenticated(false);
  };

  const navigateToLogin = () => {
    setAuthError({ type: 'auth_required' });
  };

  const checkAppState = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await loadUserWithRole(session.user);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
