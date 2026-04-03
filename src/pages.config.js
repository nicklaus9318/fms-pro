import { lazy } from 'react';
import __Layout from './Layout.jsx';

// Lazy loading — ogni pagina viene caricata solo quando visitata
const AdminPanel         = lazy(() => import('./pages/AdminPanel'));
const AppearanceSettings = lazy(() => import('./pages/AppearanceSettings'));
const AsteBusteChiuse    = lazy(() => import('./pages/AsteBusteChiuse'));
const BudgetManager      = lazy(() => import('./pages/BudgetManager'));
const Calendar           = lazy(() => import('./pages/Calendar'));
const CalendarioGenerale = lazy(() => import('./pages/CalendarioGenerale'));
const Censimento         = lazy(() => import('./pages/Censimento'));
const Dashboard          = lazy(() => import('./pages/Dashboard'));
const GestioneAste       = lazy(() => import('./pages/GestioneAste'));
const GlobalStats        = lazy(() => import('./pages/GlobalStats'));
const HallOfFame         = lazy(() => import('./pages/HallOfFame'));
const Leagues            = lazy(() => import('./pages/Leagues'));
const ListaUtenti        = lazy(() => import('./pages/ListaUtenti'));
const ManagersList       = lazy(() => import('./pages/ManagersList'));
const Market             = lazy(() => import('./pages/Market'));
const PlayerHistory      = lazy(() => import('./pages/PlayerHistory'));
const Players            = lazy(() => import('./pages/Players'));
const Profile            = lazy(() => import('./pages/Profile'));
const SimpleDashboard    = lazy(() => import('./pages/SimpleDashboard'));
const SportsJustice      = lazy(() => import('./pages/SportsJustice'));
const StoricoMercato     = lazy(() => import('./pages/StoricoMercato'));
const Teams              = lazy(() => import('./pages/Teams'));
const LoginPage          = lazy(() => import('./pages/LoginPage'));

export const PAGES = {
    "AdminPanel":         AdminPanel,
    "AppearanceSettings": AppearanceSettings,
    "AsteBusteChiuse":    AsteBusteChiuse,
    "BudgetManager":      BudgetManager,
    "Calendar":           Calendar,
    "CalendarioGenerale": CalendarioGenerale,
    "Censimento":         Censimento,
    "Dashboard":          Dashboard,
    "GestioneAste":       GestioneAste,
    "GlobalStats":        GlobalStats,
    "HallOfFame":         HallOfFame,
    "Leagues":            Leagues,
    "ListaUtenti":        ListaUtenti,
    "ManagersList":       ManagersList,
    "Market":             Market,
    "PlayerHistory":      PlayerHistory,
    "Players":            Players,
    "Profile":            Profile,
    "StoricoMercato":     StoricoMercato,
    "SimpleDashboard":    SimpleDashboard,
    "SportsJustice":      SportsJustice,
    "Teams":              Teams,
    "LoginPage":          LoginPage,
}

export const pagesConfig = {
    mainPage: "SimpleDashboard",
    Pages: PAGES,
    Layout: __Layout,
};
