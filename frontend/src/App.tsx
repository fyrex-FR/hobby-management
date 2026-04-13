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
import { supabase } from './lib/supabase';

const queryClient = new QueryClient();

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

        <button
          onClick={() => supabase.auth.signOut()}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-xs ml-1 transition-colors"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
          title="Déconnexion"
        >
          ↪
        </button>
      </nav>
    </header>
  );
}

function AppShell() {
  const { session, loading } = useAuth();
  const { activeView } = useAppStore();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <span style={{ color: 'var(--text-muted)' }} className="text-sm">Chargement…</span>
      </div>
    );
  }

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
