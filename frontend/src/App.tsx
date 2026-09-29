import { useState, useRef, useEffect } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
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
  HardDrive,
  Plus,
  User,
  LogOut,
  Key,
  Share2,
  Inbox,
  ChevronDown,
  ChevronsUpDown,
  ShoppingBag,
  FileClock,
  Camera,
  Menu,
  Puzzle,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { useAppStore, viewFromHash } from './stores/appStore';
import type { ActiveView } from './stores/appStore';
import { useCards } from './hooks/useCards';
import { useRequests } from './hooks/useRequests';
import { useImpersonateStore } from './stores/impersonateStore';
import { apiFetch } from './api/client';
import { EbayView } from './components/views/EbayView';
import { LoginView } from './components/views/LoginView';
import { DashboardView } from './components/views/DashboardView';
import { CollectionView } from './components/views/CollectionView';
import { AddCardView } from './components/views/AddCardView';
import { ScanView } from './components/views/ScanView';
import { StudioView } from './components/views/StudioView';
import { BatchView } from './components/views/BatchView';
import { ImportReviewView } from './components/views/ImportReviewView';
import { ReviewView } from './components/views/ReviewView';
import { SalesView } from './components/views/SalesView';
import { CompareView } from './components/views/CompareView';
import { PlayersView } from './components/views/PlayersView';
import { GradingView } from './components/views/GradingView';
import { RequestsView } from './components/views/RequestsView';
import { ShareView } from './components/views/ShareView';
import { ShareModal } from './components/shared/ShareModal';
import { ResetPasswordView } from './components/views/ResetPasswordView';
import MigrationView from './components/views/MigrationView';
import { ExtensionPairView } from './components/views/ExtensionPairView';
import { supabase } from './lib/supabase';
import { Popover } from './components/shared/Popover';
import { CommandPalette, CommandPaletteTrigger } from './components/shared/CommandPalette';
import { FeedbackHost, Field, Modal, Notice, ThemeSwitcher } from './components/ui';

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

  return (
    <Modal
      onClose={onClose}
      size="sm"
      title="Changer le mot de passe"
      subtitle={done ? undefined : '8 caractères minimum.'}
      footer={
        done ? (
          <button onClick={onClose} className="ui-btn ui-btn-primary">Fermer</button>
        ) : (
          <>
            <button type="button" onClick={onClose} className="ui-btn">Annuler</button>
            <button type="submit" form="change-password-form" disabled={loading} className="ui-btn ui-btn-primary">
              {loading ? 'Enregistrement…' : 'Mettre à jour'}
            </button>
          </>
        )
      }
    >
      {done ? (
        <Notice tone="success" icon={CheckCircle2}>Mot de passe mis à jour !</Notice>
      ) : (
        <form id="change-password-form" onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nouveau mot de passe">
            <input type="password" placeholder="Nouveau mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" className="ui-input" />
          </Field>
          <Field label="Confirmation">
            <input type="password" placeholder="Confirmer" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" className="ui-input" />
          </Field>
          {error && <Notice tone="error">{error}</Notice>}
        </form>
      )}
    </Modal>
  );
}

type NavItem = { id: ActiveView; label: string; icon: typeof LayoutDashboard; badge?: number };

const ADD_OPTIONS = [
  { id: 'scan', label: 'Scan live', desc: 'Vise, l\'IA reconnaît et estime', icon: Camera },
  { id: 'add_card', label: 'Ajout rapide', desc: 'Une carte, identifiée par l\'IA', icon: Plus },
  { id: 'studio', label: 'Studio photo', desc: 'Session multi-cartes', icon: ScanLine },
  { id: 'batch', label: 'Import en lot', desc: 'Glisser-déposer des photos', icon: Upload },
] as const;

const VIEW_TITLES: Partial<Record<ActiveView, string>> = {
  dashboard: 'Vue d\'ensemble',
  collection: 'Collection',
  sales: 'Ventes',
  requests: 'Demandes',
  review: 'Brouillons',
  players: 'Joueurs',
  grading: 'Grading',
  ebay: 'eBay',
  studio: 'Studio photo',
  batch: 'Import en lot',
  import_review: 'Revue d\'import',
  add_card: 'Ajout rapide',
  scan: 'Scan live',
  compare: 'Comparer IA',
  migration: 'Migration R2',
};

/** Items de navigation, partagés entre la sidebar desktop et le menu mobile. */
function useNavItems(isAdmin: boolean) {
  const { data: cards = [] } = useCards();
  const { data: shareRequests = [] } = useRequests();
  const draftCount = cards.filter((c) => c.status === 'draft').length;
  const newRequests = shareRequests.filter((r) => r.status === 'new').length;

  const main: NavItem[] = [
    { id: 'dashboard', label: 'Vue d\'ensemble', icon: LayoutDashboard },
    { id: 'collection', label: 'Collection', icon: Library },
    { id: 'sales', label: 'Ventes', icon: TrendingUp },
    { id: 'requests', label: 'Demandes', icon: Inbox, badge: newRequests },
    ...(draftCount > 0 ? [{ id: 'review' as const, label: 'Brouillons', icon: FileClock, badge: draftCount }] : []),
  ];
  const tools: NavItem[] = [
    { id: 'scan', label: 'Scan live', icon: Camera },
    { id: 'players', label: 'Joueurs', icon: Users },
    { id: 'grading', label: 'Grading', icon: GraduationCap },
    { id: 'ebay', label: 'eBay', icon: ShoppingBag },
    { id: 'studio', label: 'Studio photo', icon: ScanLine },
    { id: 'batch', label: 'Import en lot', icon: Upload },
    ...(isAdmin ? [{ id: 'compare' as const, label: 'Comparer IA', icon: Database }] : []),
    ...(isAdmin ? [{ id: 'migration' as const, label: 'Migration R2', icon: HardDrive }] : []),
  ];
  return { main, tools, cardCount: cards.filter((c) => c.status !== 'draft').length, draftCount };
}

function NavButton({ item, active, onClick }: { item: NavItem; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`group flex h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${
        active
          ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
      }`}
    >
      <item.icon size={17} className={active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'} />
      <span className="flex-1 truncate text-left">{item.label}</span>
      {!!item.badge && (
        <span className="tabular flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[11px] font-semibold text-[var(--on-accent)]">
          {item.badge}
        </span>
      )}
    </button>
  );
}

function Logo({ subtitle }: { subtitle?: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-extrabold text-[var(--on-accent)]">
        C
      </div>
      <div className="min-w-0 text-left">
        <div className="text-sm font-semibold leading-tight tracking-tight text-[var(--text-primary)]">CardVaults</div>
        {subtitle && <div className="tabular truncate text-xs text-[var(--text-muted)]">{subtitle}</div>}
      </div>
    </div>
  );
}

function AddMenu({ onSelect, variant }: { onSelect: (view: ActiveView) => void; variant: 'sidebar' | 'icon' }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={anchor}
        onClick={() => setOpen((v) => !v)}
        className={variant === 'sidebar' ? 'ui-btn ui-btn-primary h-9 w-full' : 'ui-btn ui-btn-primary ui-btn-icon'}
        aria-expanded={open}
        aria-label="Ajouter des cartes"
      >
        <Plus size={17} strokeWidth={2.5} />
        {variant === 'sidebar' && <><span className="flex-1 text-left">Ajouter des cartes</span><ChevronDown size={15} /></>}
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={260} align={variant === 'icon' ? 'end' : 'start'}>
        <div className="p-1">
          {ADD_OPTIONS.map((opt) => (
            <button key={opt.id} className="ui-menu-item" onClick={() => { onSelect(opt.id); setOpen(false); }}>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                <opt.icon size={16} />
              </span>
              <span>
                <span className="block text-[13px] font-medium">{opt.label}</span>
                <span className="block text-xs text-[var(--text-muted)]">{opt.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Popover>
    </>
  );
}

function AccountMenu({ email, onShare, compact = false }: { email: string; onShare: () => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const initial = email.charAt(0).toUpperCase();

  return (
    <>
      <button
        ref={anchor}
        onClick={() => setOpen((v) => !v)}
        className={compact
          ? 'flex h-9 w-9 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[13px] font-semibold text-[var(--text-primary)] ring-1 ring-[var(--border)]'
          : 'flex w-full items-center gap-2.5 rounded-lg p-2 text-left transition-colors hover:bg-[var(--bg-elevated)]'}
        aria-label="Mon compte"
        aria-expanded={open}
      >
        {compact ? initial : (
          <>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-hover)] text-[13px] font-semibold text-[var(--text-primary)]">{initial}</span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-secondary)]">{email}</span>
            <ChevronsUpDown size={15} className="shrink-0 text-[var(--text-muted)]" />
          </>
        )}
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={272} align={compact ? 'end' : 'start'}>
        <div className="p-1">
          {compact && <div className="truncate px-2.5 pb-1.5 pt-2 text-xs text-[var(--text-muted)]">{email}</div>}
          <button className="ui-menu-item" onClick={() => { setOpen(false); onShare(); }}>
            <Share2 size={15} className="text-[var(--text-secondary)]" /> Partager ma collection
          </button>
          <button className="ui-menu-item" onClick={() => { window.location.href = '/extension/pair'; }}>
            <Puzzle size={15} className="text-[var(--text-secondary)]" /> Extension Chrome
          </button>
          <div className="px-1 pb-1 pt-1.5">
            <div className="ui-menu-label px-1.5 pt-0">Thème</div>
            <ThemeSwitcher />
          </div>
          <div className="mx-1 my-1 h-px bg-[var(--border)]" />
          <button className="ui-menu-item" onClick={() => { setShowChangePassword(true); setOpen(false); }}>
            <Key size={15} className="text-[var(--text-secondary)]" /> Changer le mot de passe
          </button>
          <div className="mx-1 my-1 h-px bg-[var(--border)]" />
          <button className="ui-menu-item !text-[var(--red)]" onClick={() => supabase.auth.signOut()}>
            <LogOut size={15} /> Déconnexion
          </button>
        </div>
      </Popover>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </>
  );
}

function Sidebar({ isAdmin, email, onShare }: { isAdmin: boolean; email: string; onShare: () => void }) {
  const { activeView, setActiveView } = useAppStore();
  const { main, tools, cardCount } = useNavItems(isAdmin);

  return (
    <aside className="desktop-only flex h-full w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-secondary)]">
      <div className="flex h-14 items-center px-4">
        <button onClick={() => setActiveView('dashboard')} className="rounded-lg focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
          <Logo subtitle={`${cardCount} cartes`} />
        </button>
      </div>
      <div className="space-y-2 px-3 pb-3">
        <AddMenu onSelect={setActiveView} variant="sidebar" />
        <CommandPaletteTrigger />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-1" aria-label="Navigation principale">
        <div className="space-y-0.5">
          {main.map((item) => (
            <NavButton key={item.id} item={item} active={activeView === item.id} onClick={() => setActiveView(item.id)} />
          ))}
        </div>
        <div className="space-y-0.5">
          <div className="px-2.5 pb-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">Outils</div>
          {tools.map((item) => (
            <NavButton key={item.id} item={item} active={activeView === item.id} onClick={() => setActiveView(item.id)} />
          ))}
        </div>
      </nav>
      <div className="space-y-2 border-t border-[var(--border)] p-3">
        {isAdmin && <ImpersonateSelector />}
        <AccountMenu email={email} onShare={onShare} />
      </div>
    </aside>
  );
}

function MobileTopBar({ isAdmin, email, onShare }: { isAdmin: boolean; email: string; onShare: () => void }) {
  const { activeView, setActiveView } = useAppStore();
  return (
    <header className="mobile-only sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-primary)]/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <button onClick={() => setActiveView('dashboard')} className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-extrabold text-[var(--on-accent)]">C</div>
        <span className="truncate text-[15px] font-semibold text-[var(--text-primary)]">{VIEW_TITLES[activeView] ?? 'CardVaults'}</span>
      </button>
      <div className="flex items-center gap-2">
        {isAdmin && <ImpersonateSelector compact />}
        <CommandPaletteTrigger compact />
        <AddMenu onSelect={setActiveView} variant="icon" />
        <AccountMenu email={email} onShare={onShare} compact />
      </div>
    </header>
  );
}

function MobileTabBar({ isAdmin }: { isAdmin: boolean }) {
  const { activeView, setActiveView } = useAppStore();
  const { main, tools } = useNavItems(isAdmin);
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryIds: ActiveView[] = ['dashboard', 'collection', 'sales', 'requests'];
  const primary = primaryIds.map((id) => main.find((m) => m.id === id)!).filter(Boolean);
  const overflow = [...main.filter((m) => !primaryIds.includes(m.id)), ...tools];
  const overflowActive = overflow.some((o) => o.id === activeView);
  const overflowBadge = overflow.reduce((n, o) => n + (o.badge ?? 0), 0);

  function go(id: ActiveView) {
    setActiveView(id);
    setMoreOpen(false);
  }

  const tab = (active: boolean) =>
    `relative flex flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 text-[10px] font-medium transition-colors ${
      active ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
    }`;

  return (
    <>
      <nav
        className="mobile-only fixed inset-x-0 bottom-0 z-40 flex border-t border-[var(--border)] bg-[var(--bg-secondary)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl"
        aria-label="Navigation"
      >
        {primary.map((item) => (
          <button key={item.id} onClick={() => go(item.id)} className={`${tab(activeView === item.id)} h-14`}>
            <item.icon size={21} />
            {item.label === 'Vue d\'ensemble' ? 'Accueil' : item.label}
            {!!item.badge && (
              <span className="absolute left-1/2 top-1 ml-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-semibold text-[var(--on-accent)]">
                {item.badge}
              </span>
            )}
          </button>
        ))}
        <button onClick={() => setMoreOpen(true)} className={`${tab(overflowActive || moreOpen)} h-14`}>
          <Menu size={21} />
          Plus
          {overflowBadge > 0 && <span className="absolute left-1/2 top-1.5 ml-2 h-2 w-2 rounded-full bg-[var(--accent)]" />}
        </button>
      </nav>

      <AnimatePresence>
        {moreOpen && (
          <motion.div className="mobile-only fixed inset-0 z-[60]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-[var(--backdrop)]" onClick={() => setMoreOpen(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 380 }}
              className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-[var(--border-strong)] bg-[var(--bg-card)] p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border-strong)]" />
              <div className="grid grid-cols-2 gap-1">
                {overflow.map((item) => (
                  <NavButton key={item.id} item={item} active={activeView === item.id} onClick={() => go(item.id)} />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function ImpersonateBanner() {
  const { impersonatedEmail, clearImpersonate } = useImpersonateStore();
  const queryClient = useQueryClient();
  if (!impersonatedEmail) return null;

  function stop() {
    clearImpersonate();
    queryClient.invalidateQueries({ queryKey: ['cards'] });
  }

  return (
    <div
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+4.25rem)] left-1/2 z-50 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-3 rounded-xl border bg-[var(--bg-card)] py-1.5 pl-3 pr-1.5 text-[13px] shadow-[var(--shadow-lg)] lg:bottom-4"
      style={{ borderColor: 'color-mix(in srgb, var(--red) 45%, transparent)' }}
      role="status"
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--red)]" />
      <span className="min-w-0 truncate text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--red)]">Mode admin</span> · {impersonatedEmail}
      </span>
      <button onClick={stop} className="ui-btn ui-btn-sm ui-btn-danger shrink-0">Quitter</button>
    </div>
  );
}

function ImpersonateSelector({ compact = false }: { compact?: boolean }) {
  const [users, setUsers] = useState<{ id: string; email: string }[]>([]);
  const [open, setOpen] = useState(false);
  const { impersonatedUserId, setImpersonate, clearImpersonate } = useImpersonateStore();
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch<{ id: string; email: string; created_at: string }[]>('/admin/users')
      .then(setUsers)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  function select(id: string, email: string) {
    setImpersonate(id, email);
    queryClient.invalidateQueries({ queryKey: ['cards'] });
    setOpen(false);
  }

  function reset() {
    clearImpersonate();
    queryClient.invalidateQueries({ queryKey: ['cards'] });
    setOpen(false);
  }

  return (
    <div ref={ref} className={compact ? 'relative' : 'relative w-full'}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] ${compact ? 'h-9' : 'h-8 w-full'}`}
        style={{
          background: impersonatedUserId ? 'var(--red, #ef4444)' : 'var(--bg-elevated)',
          color: impersonatedUserId ? '#fff' : 'var(--text-secondary)',
          border: '1px solid var(--border)',
        }}
        title="Impersonnifier un utilisateur"
      >
        <User size={13} />
        {!compact && <span className="flex-1 truncate text-left">{impersonatedUserId ? '⚠ Mode admin' : 'Changer d\'utilisateur'}</span>}
        <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className={`popover-surface absolute z-50 max-h-72 w-64 overflow-y-auto p-1 ${compact ? 'right-0 top-full mt-2' : 'bottom-full left-0 mb-2'}`}
          >
            {impersonatedUserId && (
              <>
                <button onClick={reset} className="w-full px-3.5 py-2.5 text-left text-sm font-semibold rounded-xl hover:bg-[var(--bg-hover)]"
                  style={{ color: 'var(--red, #ef4444)' }}>
                  ✕ Revenir à mon compte
                </button>
                <div className="h-px bg-[var(--border)] my-1 mx-2" />
              </>
            )}
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => select(u.id, u.email)}
                className="w-full px-3.5 py-2.5 text-left text-sm rounded-xl hover:bg-[var(--bg-hover)] flex items-center gap-2"
                style={{ color: u.id === impersonatedUserId ? 'var(--accent)' : 'var(--text-primary)' }}
              >
                <User size={13} className="shrink-0 opacity-40" />
                <span className="truncate">{u.email}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AppShell() {
  const { session, loading } = useAuth();
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

  if (window.location.pathname === '/extension/pair') return <ExtensionPairView />;

  return <AuthedShell email={session.user.email ?? ''} showShare={showShare} setShowShare={setShowShare} />;
}

function AuthedShell({ email, showShare, setShowShare }: { email: string; showShare: boolean; setShowShare: (v: boolean) => void }) {
  const { activeView, setActiveView } = useAppStore();
  const isAdmin = email === 'xavier.andrieux@gmail.com';

  // Retour du flux OAuth eBay (?ebay=connected | ?ebay=error&reason=...) :
  // navigue vers la vue eBay, qui lit et nettoie ces paramètres elle-même.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('ebay')) setActiveView('ebay');
  }, [setActiveView]);

  // Vue courante ⇄ URL (#/collection) : le bouton retour du navigateur et le
  // rafraîchissement fonctionnent enfin.
  useEffect(() => {
    if (viewFromHash() === activeView) return;
    const url = `${window.location.pathname}${window.location.search}#/${activeView}`;
    if (window.location.hash) window.history.pushState(null, '', url);
    else window.history.replaceState(null, '', url);
  }, [activeView]);
  useEffect(() => {
    const onPop = () => {
      const v = viewFromHash();
      if (v) setActiveView(v);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [setActiveView]);

  // Scroll remis en haut à chaque changement de vue.
  const mainRef = useRef<HTMLDivElement>(null);
  useEffect(() => { mainRef.current?.scrollTo(0, 0); }, [activeView]);

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--bg-primary)]">
      <Sidebar isAdmin={isAdmin} email={email} onShare={() => setShowShare(true)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar isAdmin={isAdmin} email={email} onShare={() => setShowShare(true)} />
        <main className="relative min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeView}
              ref={mainRef}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="absolute inset-0 overflow-auto pb-[calc(env(safe-area-inset-bottom)+3.5rem)] lg:pb-0"
            >
              {activeView === 'dashboard' && <DashboardView />}
              {activeView === 'collection' && <CollectionView />}
              {activeView === 'add_card' && <AddCardView />}
              {activeView === 'scan' && <ScanView />}
              {activeView === 'studio' && <StudioView />}
              {activeView === 'batch' && <BatchView />}
              {activeView === 'import_review' && <ImportReviewView />}
              {activeView === 'review' && <ReviewView />}
              {activeView === 'sales' && <SalesView />}
              {activeView === 'compare' && isAdmin && <CompareView />}
              {activeView === 'players' && <PlayersView />}
              {activeView === 'grading' && <GradingView />}
              {activeView === 'ebay' && <EbayView />}
              {activeView === 'requests' && <RequestsView />}
              {activeView === 'migration' && isAdmin && <MigrationView />}
            </motion.div>
          </AnimatePresence>
        </main>
        <MobileTabBar isAdmin={isAdmin} />
      </div>
      {showShare && <ShareModal onClose={() => setShowShare(false)} />}
      <CommandPalette isAdmin={isAdmin} onShare={() => setShowShare(true)} />
      {isAdmin && <ImpersonateBanner />}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppShell />
      <FeedbackHost />
    </QueryClientProvider>
  );
}
