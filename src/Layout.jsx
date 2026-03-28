import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from './utils';
import { base44 } from '@/api/base44Client';
import ConnectionStatus from '@/components/ui/connection-status';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { 
        LayoutDashboard, 
        Users, 
        Trophy, 
        Calendar, 
        TrendingUp,
        Settings,
        Menu,
        X,
        LogOut,
        Shield,
        UserCircle,
        ChevronDown,
        Gavel
      } from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function Layout({ children, currentPageName }) {
  const [user, setUser] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const userData = await base44.auth.me();
        setUser(userData);
      } catch (e) {
        console.log('User not logged in');
      }
    };
    loadUser();
  }, []);

  const isAdmin = user?.role === 'admin';

  const navigation = [
    { name: 'Dashboard', href: createPageUrl('SimpleDashboard'), icon: LayoutDashboard, page: 'SimpleDashboard' },
    { name: 'Censimento', href: createPageUrl('Censimento'), icon: UserCircle, page: 'Censimento' },
    { name: 'Giocatori', href: createPageUrl('Players'), icon: Users, page: 'Players' },
    { name: 'Svincolati', href: createPageUrl('FreeAgents'), icon: Users, page: 'FreeAgents' },
    { name: 'Squadre', href: createPageUrl('Teams'), icon: Shield, page: 'Teams' },
    { name: 'Lista Utenti', href: createPageUrl('ListaUtenti'), icon: Users, page: 'ListaUtenti' },
    { name: 'Calciomercato', href: createPageUrl('Market'), icon: TrendingUp, page: 'Market' },
    { name: 'Aste Buste Chiuse', href: createPageUrl('AsteBusteChiuse'), icon: Trophy, page: 'AsteBusteChiuse' },
    { name: 'Competizioni', href: createPageUrl('Calendar'), icon: Calendar, page: 'Calendar' },
    { name: 'Classifiche', href: createPageUrl('GlobalStats'), icon: Trophy, page: 'GlobalStats' },
    { name: 'Albo d\'Oro', href: createPageUrl('HallOfFame'), icon: Trophy, page: 'HallOfFame' },
    { name: 'Storico Mercato', href: createPageUrl('StoricoMercato'), icon: TrendingUp, page: 'StoricoMercato' },
  ];

  const adminNavigation = [
    { name: 'Admin Panel', href: createPageUrl('AdminPanel'), icon: Settings, page: 'AdminPanel' },
    { name: 'Manager', href: createPageUrl('ManagersList'), icon: Users, page: 'ManagersList' },
    { name: 'Giustizia Sportiva', href: createPageUrl('SportsJustice'), icon: Shield, page: 'SportsJustice' },
    { name: 'Gestione Budget', href: createPageUrl('BudgetManager'), icon: TrendingUp, page: 'BudgetManager' },
    { name: 'Gestione Aste', href: createPageUrl('GestioneAste'), icon: Gavel, page: 'GestioneAste' },
    { name: 'Aspetto Sito', href: createPageUrl('AppearanceSettings'), icon: Settings, page: 'AppearanceSettings' },
  ];

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-50">
        <ConnectionStatus />
        <style>{`
          :root {
            --primary: 16 185 129;
            --primary-dark: 5 150 105;
            --secondary: 30 58 138;
            --accent: 234 179 8;
          }
        `}</style>
      
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-72 bg-gradient-to-b from-slate-900 to-slate-800 
        transform transition-transform duration-300 ease-in-out
        lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-6 border-b border-slate-700/50">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">FMS Pro</h1>
              <p className="text-xs text-slate-400">Football Management</p>
            </div>
            <button 
              className="lg:hidden ml-auto text-slate-400 hover:text-white"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            <p className="px-3 mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Menu</p>
            {navigation.map((item) => {
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                    ${isActive 
                      ? 'bg-emerald-500/10 text-emerald-400 shadow-sm' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                    }
                  `}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? 'text-emerald-400' : ''}`} />
                  {item.name}
                </Link>
              );
            })}

            {isAdmin && (
              <>
                <p className="px-3 mt-6 mb-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Admin</p>
                {adminNavigation.map((item) => {
                  const isActive = currentPageName === item.page;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`
                        flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200
                        ${isActive 
                          ? 'bg-amber-500/10 text-amber-400 shadow-sm' 
                          : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
                        }
                      `}
                    >
                      <item.icon className={`w-5 h-5 ${isActive ? 'text-amber-400' : ''}`} />
                      {item.name}
                    </Link>
                  );
                })}
              </>
            )}
          </nav>

          {/* User section */}
          {user && (
            <div className="px-4 py-4 border-t border-slate-700/50">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-3 w-full px-3 py-2 rounded-xl hover:bg-slate-700/50 transition-colors">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                      <span className="text-sm font-semibold text-white">
                        {user.full_name?.charAt(0) || user.email?.charAt(0)}
                      </span>
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-white truncate">{user.full_name || 'Utente'}</p>
                      <p className="text-xs text-slate-400">{isAdmin ? 'Admin' : 'Utente'}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem asChild>
                    <Link to={createPageUrl('Profile')} className="flex items-center gap-2">
                      <UserCircle className="w-4 h-4" />
                      Profilo
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => base44.auth.logout()}
                    className="text-red-600 focus:text-red-600"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Esci
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-72">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-lg border-b border-slate-200/50">
          <div className="flex items-center justify-between px-4 lg:px-8 h-16">
            <button 
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5 text-slate-600" />
            </button>
            <div className="lg:hidden" />
            <div className="hidden lg:block">
              <h2 className="text-lg font-semibold text-slate-800">{currentPageName}</h2>
            </div>
            <div />
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>
        </div>
        </div>
        </ErrorBoundary>
        );
        }