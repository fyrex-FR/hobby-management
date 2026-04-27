import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Library,
  TrendingUp,
  Users,
  GraduationCap,
  ScanLine,
  Upload,
  Database,
  Plus,
  User,
  LogOut,
  Key,
  Share2,
  ChevronDown
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useAppStore } from './stores/appStore';
import { useCards } from './hooks/useCards';
import { LoginView } from './components/views/LoginView';
import { DashboardView } from './components/views/DashboardView';
import { CollectionView } from './components/views/CollectionView';
import { AddCardView } from './components/views/AddCardView';
import { StudioView } from './components/views/StudioView';
import { BatchView } from './components/views/BatchView';
import { ReviewView } from './components/views/ReviewView';
import { SalesView } from './components/views/SalesView';
import { CompareView } from './components/views/CompareView';
import { PlayersView } from './components/views/PlayersView';
import { GradingView } from './components/views/GradingView';
import { ShareView } from './components/views/ShareView';
import { ShareModal } from './components/shared/ShareModal';
import { ResetPasswordView } from './components/views/ResetPasswordView';
import { supabase } from './lib/supabase';

const queryClient = new QueryClient();

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { setError('Les mots de passe ne correspondent pas.'); return; }
    if (password.length < 8) { setError('Minimum 8 caractères.'); return; }
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else setDone(true);
    setLoading(false);
  }

  const inputClass = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all';
  const inputStyle = { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="rounded-2xl w-full max-w-sm p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Changer le mot de passe</h2>
          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>✕</button>
        </div>
        {done ? (
          <div className="text-center py-4 space-y-2">
            <p className="text-lg">✓</p>
            <p className="text-sm" style={{ color: 'var(--text-primary)' }}>Mot de passe mis à jour !</p>
            <button onClick={onClose} className="mt-2 px-4 py-2 rounded-xl text-sm font-semibold" style={{ background: 'var(--accent)', color: '#0d0c0b' }}>Fermer</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input type="password" placeholder="Nouveau mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required className={inputClass} style={inputStyle} />
            <input type="password" placeholder="Confirmer" value={confirm} onChange={(e) => setConfirm(e.target.value)} required className={inputClass} style={inputStyle} />
            {error && <p className="text-xs px-1" style={{ color: 'var(--red)' }}>{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: loading ? 'var(--bg-elevated)' : 'var(--accent)', color: loading ? 'var(--text-muted)' : '#0d0c0b' }}>
              {loading ? 'Enregistrement…' : 'Mettre à jour'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function UserMenu() {
  const [open, setOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  return (
    <>
      <div className="relative ml-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:bg-white/5 active:scale-95"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
          title="Mon compte"
        >
          <User size={18} className="text-[var(--text-secondary)]" />
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="absolute right-0 top-full mt-2 rounded-2xl overflow-hidden z-20 w-52 glass border-strong shadow-xl p-1"
            >
              <button
                onClick={() => { setShowChangePassword(true); setOpen(false); }}
                className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-white/5 rounded-xl flex items-center gap-3"
                style={{ color: 'var(--text-primary)' }}
              >
                <Key size={15} className="text-[var(--text-secondary)]" />
                Changer le mot de passe
              </button>
              <div className="h-px bg-[var(--border)] my-1 mx-2" />
              <button
                onClick={() => supabase.auth.signOut()}
                className="w-full px-4 py-2.5 text-left text-sm transition-colors hover:bg-red-500/10 rounded-xl flex items-center gap-3"
                style={{ color: 'var(--red, #ef4444)' }}
              >
                <LogOut size={15} />
                Déconnexion
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </>
  );
}

function Header({ onShare, isAdmin }: { onShare: () => void; isAdmin: boolean }) {
  const { activeView, setActiveView } = useAppStore();
  const { data: cards = [] } = useCards();
  const draftCount = cards.filter((c) => c.status === 'draft').length;
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const mainNav = [
    { id: 'dashboard', label: 'Vue d\'ensemble', icon: LayoutDashboard },
    { id: 'collection', label: 'Collection', icon: Library },
    { id: 'sales', label: 'Ventes', icon: TrendingUp },
  ] as const;

  const toolNav = [
    { id: 'players', label: 'Joueurs', icon: Users },
    { id: 'grading', label: 'Grading', icon: GraduationCap },
    { id: 'studio', label: 'Studio photo', icon: ScanLine },
    { id: 'batch', label: 'Import lot', icon: Upload },
    ...(isAdmin ? [{ id: 'compare' as const, label: 'Comparer IA', icon: Database }] : []),
  ] as const;

  // Auto-close tools when switching views
  const handleViewChange = (view: typeof activeView) => {
    setActiveView(view);
    setToolsOpen(false);
    setMobileMenuOpen(false);
  };

  return (
    <header className="px-4 sm:px-6 py-3 sticky top-0 z-50 glass border-strong rounded-b-[2rem] mx-2 mt-2 overflow-visible">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <button
          onClick={() => handleViewChange('dashboard')}
          className="flex items-center gap-3 group transition-transform active:scale-95 shrink-0"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-base font-black transition-all group-hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-light) 100%)',
              color: '#09090B',
              boxShadow: '0 0 25px var(--accent-glow)',
            }}
          >
            N
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-sm font-bold leading-none text-white tracking-tight">
              NBA Card <span className="text-[var(--accent)]">Studio</span>
            </div>
            <div className="text-[10px] mt-1 font-medium text-[var(--text-muted)]">
              {cards.length} carte{cards.length !== 1 ? 's' : ''}
            </div>
          </div>
        </button>

        {/* Desktop Nav */}
        <nav className="desktop-only flex items-center gap-1.5">
          {mainNav.map((item) => (
            <button
              key={item.id}
              onClick={() => handleViewChange(item.id)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5 relative group"
              style={{ color: activeView === item.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}
            >
              <item.icon size={16} className={activeView === item.id ? 'text-[var(--accent)]' : 'text-current'} />
              <span>{item.label}</span>
              {activeView === item.id && (
                <motion.div
                  layoutId="nav-active"
                  className="absolute inset-0 bg-white/5 border border-white/10 rounded-xl -z-10 shadow-sm"
                />
              )}
            </button>
          ))}

          <div className="relative">
            <button
              onClick={() => { setToolsOpen(!toolsOpen); setMobileMenuOpen(false); }}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white/5"
              style={{
                color: toolNav.some(t => t.id === activeView) ? 'var(--text-primary)' : 'var(--text-secondary)',
                background: toolsOpen || toolNav.some(t => t.id === activeView) ? 'var(--bg-elevated)' : 'transparent'
              }}
            >
              <Plus size={16} />
              <span>Outils</span>
              <ChevronDown size={14} className={`transition-transform duration-200 ${toolsOpen ? 'rotate-180' : ''}`} />
            </button>

            <AnimatePresence>
              {toolsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full left-0 mt-2 w-48 glass border-strong rounded-2xl shadow-2xl p-1.5 z-50 overflow-hidden"
                >
                  {toolNav.map((tool) => (
                    <button
                      key={tool.id}
                      onClick={() => handleViewChange(tool.id)}
                      className="flex items-center gap-3 w-full px-3.5 py-2.5 text-left text-sm font-medium rounded-xl transition-all hover:bg-white/5"
                      style={{ color: activeView === tool.id ? 'var(--accent)' : 'var(--text-primary)' }}
                    >
                      <tool.icon size={16} />
                      {tool.label}
                    </button>
                  ))}
                  <div className="h-px bg-white/5 my-1 mx-2" />
                  <button
                    onClick={() => { onShare(); setToolsOpen(false); }}
                    className="flex items-center gap-3 w-full px-3.5 py-2.5 text-left text-sm font-medium rounded-xl transition-all hover:bg-white/5"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    <Share2 size={16} className="text-[var(--text-secondary)]" />
                    Partager ma collection
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </nav>

        <div className="flex items-center gap-2">
          {draftCount > 0 && (
            <button
              onClick={() => handleViewChange('review')}
              className="relative px-3 sm:px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 bg-[var(--accent-dim)] border border-[var(--border-accent)] text-[var(--accent)] active:scale-95"
            >
              <span className="hidden sm:inline">Brouillons</span>
              <span className="bg-[var(--accent)] text-black text-[10px] h-4 min-w-[16px] px-1 flex items-center justify-center rounded-full">
                {draftCount}
              </span>
            </button>
          )}

          <button
            onClick={() => handleViewChange('add_card')}
            className="flex items-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 shadow-lg"
            style={
              activeView === 'add_card'
                ? { background: 'var(--accent)', color: '#09090B' }
                : { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }
            }
          >
            <Plus size={18} strokeWidth={3} />
            <span className="hidden sm:inline">Ajouter</span>
          </button>

          <UserMenu />

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => { setMobileMenuOpen(!mobileMenuOpen); setToolsOpen(false); }}
            className="mobile-only w-10 h-10 flex flex-col items-center justify-center gap-1 rounded-xl bg-white/5 border border-white/5"
          >
            <div className={`w-5 h-0.5 bg-white transition-all ${mobileMenuOpen ? 'rotate-45 translate-y-1.5' : ''}`} />
            <div className={`w-5 h-0.5 bg-white transition-all ${mobileMenuOpen ? 'opacity-0' : ''}`} />
            <div className={`w-5 h-0.5 bg-white transition-all ${mobileMenuOpen ? '-rotate-45 -translate-y-1.5' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mobile Nav Overlay */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="lg:hidden mt-4 pt-4 border-t border-white/5 overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-2 pb-2">
              {[...mainNav, ...toolNav].map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleViewChange(item.id)}
                  className="flex items-center gap-3 p-3 rounded-2xl text-sm font-semibold transition-all"
                  style={{
                    background: activeView === item.id ? 'var(--accent-dim)' : 'bg-white/5',
                    color: activeView === item.id ? 'var(--accent)' : 'var(--text-secondary)',
                    border: activeView === item.id ? '1px solid var(--border-accent)' : '1px solid transparent'
                  }}
                >
                  <item.icon size={18} />
                  {item.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

function AppShell() {
  const { session, loading } = useAuth();
  const { activeView } = useAppStore();
  const [showShare, setShowShare] = useState(false);

  // Détecter le token de reset dans le hash de l'URL
  const isResetFlow = window.location.hash.includes('type=recovery');

  // Détecter une route /share/:token
  const shareTokenMatch = window.location.pathname.match(/^\/share\/([A-Za-z0-9_-]+)$/);
  if (shareTokenMatch) {
    return <ShareView token={shareTokenMatch[1]} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span style={{ color: 'var(--text-secondary)' }} className="text-sm font-medium">Chargement du studio…</span>
        </motion.div>
      </div>
    );
  }

  if (isResetFlow) return <ResetPasswordView onDone={() => { window.location.hash = ''; window.location.reload(); }} />;

  if (!session) return <LoginView />;

  const isAdmin = session.user.email === 'xavier.andrieux@gmail.com';

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      <Header onShare={() => setShowShare(true)} isAdmin={isAdmin} />
      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0 overflow-auto"
          >
            {activeView === 'dashboard' && <DashboardView />}
            {activeView === 'collection' && <CollectionView />}
            {activeView === 'add_card' && <AddCardView />}
            {activeView === 'studio' && <StudioView />}
            {activeView === 'batch' && <BatchView />}
            {activeView === 'review' && <ReviewView />}
            {activeView === 'sales' && <SalesView />}
            {activeView === 'compare' && isAdmin && <CompareView />}
            {activeView === 'players' && <PlayersView />}
            {activeView === 'grading' && <GradingView />}
          </motion.div>
        </AnimatePresence>
      </main>
      {showShare && <ShareModal onClose={() => setShowShare(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
    </QueryClientProvider>
  );
}
