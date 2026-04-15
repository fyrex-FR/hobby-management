import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuth } from './hooks/useAuth';
import { useAppStore } from './stores/appStore';
import { useCards } from './hooks/useCards';
import { LoginView } from './components/views/LoginView';
import { DashboardView } from './components/views/DashboardView';
import { CollectionView } from './components/views/CollectionView';
import { AddCardView } from './components/views/AddCardView';
import { BatchView } from './components/views/BatchView';
import { ReviewView } from './components/views/ReviewView';
import { SalesView } from './components/views/SalesView';
import { CompareView } from './components/views/CompareView';
import { PlayersView } from './components/views/PlayersView';
import { GradingView } from './components/views/GradingView';
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
      <div className="relative ml-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          title="Mon compte"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-1.5 rounded-xl overflow-hidden z-20 w-44"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}>
            <button
              onClick={() => { setShowChangePassword(true); setOpen(false); }}
              className="w-full px-4 py-2.5 text-left text-xs transition-colors hover:bg-white/[0.05]"
              style={{ color: 'var(--text-primary)' }}
            >
              🔑 Changer le mot de passe
            </button>
            <button
              onClick={() => supabase.auth.signOut()}
              className="w-full px-4 py-2.5 text-left text-xs transition-colors hover:bg-white/[0.05]"
              style={{ color: 'var(--red)' }}
            >
              ↪ Déconnexion
            </button>
          </div>
        )}
      </div>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </>
  );
}

function Header() {
  const { activeView, setActiveView } = useAppStore();
  const { data: cards = [] } = useCards();
  const draftCount = cards.filter((c) => c.status === 'draft').length;

  return (
    <header
      className="flex items-center justify-between px-6 py-3 sticky top-0 z-10"
      style={{
        background: 'rgba(14,14,17,0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border-strong)',
      }}
    >
      <button onClick={() => setActiveView('dashboard')} className="flex items-center gap-3 group">
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black"
          style={{
            background: 'linear-gradient(135deg, #F5AF23 0%, #E8920A 100%)',
            color: '#0E0E11',
            boxShadow: '0 0 16px rgba(245,175,35,0.35)',
          }}
        >
          N
        </div>
        <div className="hidden sm:block text-left">
          <div
            className="text-sm font-bold leading-none transition-colors group-hover:text-[var(--accent)]"
            style={{ color: 'var(--text-primary)' }}
          >
            NBA Card Studio
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {cards.length} carte{cards.length !== 1 ? 's' : ''}
          </div>
        </div>
      </button>

      <nav className="flex items-center gap-1">
        {(['dashboard', 'collection', 'sales'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className="px-3 py-1.5 rounded-lg text-sm transition-all"
            style={{
              color: activeView === view ? 'var(--text-primary)' : 'var(--text-secondary)',
              background: activeView === view ? 'var(--bg-elevated)' : 'transparent',
            }}
          >
            {view === 'dashboard' ? (
              <><span className="sm:hidden">Accueil</span><span className="hidden sm:inline">Vue d'ensemble</span></>
            ) : view === 'collection' ? 'Collection' : 'Ventes'}
          </button>
        ))}

        <button
          onClick={() => setActiveView('players')}
          className="hidden sm:block px-3 py-1.5 rounded-lg text-sm transition-all"
          style={{
            color: activeView === 'players' ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: activeView === 'players' ? 'var(--bg-elevated)' : 'transparent',
          }}
        >
          Joueurs
        </button>

        <button
          onClick={() => setActiveView('grading')}
          className="hidden sm:block px-3 py-1.5 rounded-lg text-sm transition-all"
          style={{
            color: activeView === 'grading' ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: activeView === 'grading' ? 'var(--bg-elevated)' : 'transparent',
          }}
        >
          Grading
        </button>

        <button
          onClick={() => setActiveView('batch')}
          className="px-3 py-1.5 rounded-lg text-sm transition-all"
          style={{
            color: activeView === 'batch' ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: activeView === 'batch' ? 'var(--bg-elevated)' : 'transparent',
          }}
          title="Import lot"
        >
          <span className="sm:hidden">↑</span>
          <span className="hidden sm:inline">Import lot</span>
        </button>

        <button
          onClick={() => setActiveView('compare')}
          className="hidden sm:block px-3 py-1.5 rounded-lg text-sm transition-all"
          style={{
            color: activeView === 'compare' ? 'var(--text-primary)' : 'var(--text-secondary)',
            background: activeView === 'compare' ? 'var(--bg-elevated)' : 'transparent',
          }}
        >
          Comparer IA
        </button>

        {draftCount > 0 && (
          <button
            onClick={() => setActiveView('review')}
            className="relative px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1.5"
            style={{
              color: activeView === 'review' ? 'var(--accent)' : 'var(--accent)',
              background: activeView === 'review' ? 'var(--accent-dim)' : 'var(--accent-dim)',
              border: '1px solid rgba(245,166,35,0.2)',
            }}
          >
            Brouillons
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--accent)', color: '#0d0c0b' }}
            >
              {draftCount}
            </span>
          </button>
        )}

        <button
          onClick={() => setActiveView('add_card')}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ml-1"
          style={
            activeView === 'add_card'
              ? { background: 'var(--accent)', color: '#0d0c0b', boxShadow: '0 0 20px var(--accent-glow)' }
              : { background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
          }
        >
          <span className="text-base leading-none">+</span> Ajouter
        </button>

        <UserMenu />
      </nav>
    </header>
  );
}

function AppShell() {
  const { session, loading } = useAuth();
  const { activeView } = useAppStore();

  // Détecter le token de reset dans le hash de l'URL
  const isResetFlow = window.location.hash.includes('type=recovery');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <span style={{ color: 'var(--text-muted)' }} className="text-sm">Chargement…</span>
      </div>
    );
  }

  if (isResetFlow) return <ResetPasswordView onDone={() => { window.location.hash = ''; window.location.reload(); }} />;

  if (!session) return <LoginView />;

  return (
    <div className="flex flex-col h-screen" style={{ background: 'var(--bg-primary)' }}>
      <Header />
      <main className="flex flex-1 overflow-hidden">
        {activeView === 'dashboard' && <DashboardView />}
        {activeView === 'collection' && <CollectionView />}
        {activeView === 'add_card' && <AddCardView />}
        {activeView === 'batch' && <BatchView />}
        {activeView === 'review' && <ReviewView />}
        {activeView === 'sales' && <SalesView />}
        {activeView === 'compare' && <CompareView />}
        {activeView === 'players' && <PlayersView />}
        {activeView === 'grading' && <GradingView />}
      </main>
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
