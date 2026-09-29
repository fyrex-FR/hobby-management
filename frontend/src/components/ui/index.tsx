/**
 * Kit UI CardVaults. Tous les écrans l'utilisent pour rester cohérents :
 * mêmes surfaces, mêmes rayons (lg=10px contrôles, xl=12px cartes, 2xl=16px
 * modales), même échelle typographique (11 / 12 / 13 / 14 / 20px).
 *
 * Classes CSS associées (index.css) : ui-btn, ui-btn-primary, ui-btn-ghost,
 * ui-btn-danger, ui-btn-icon, ui-chip, ui-input, ui-select, ui-textarea,
 * ui-segmented, ui-menu-item, ui-menu-label, ui-card, popover-surface, tabular.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X, type LucideIcon } from 'lucide-react';

/* ── Page ─────────────────────────────────────────────────── */

/** Conteneur standard d'une vue : largeur max, gouttières, espacement vertical. */
export function Page({ children, width = 'default', className = '' }: { children: ReactNode; width?: 'default' | 'narrow' | 'wide' | 'full'; className?: string }) {
  const max = { narrow: 'max-w-3xl', default: 'max-w-6xl', wide: 'max-w-7xl', full: 'max-w-none' }[width];
  return <div className={`mx-auto w-full ${max} space-y-6 px-4 py-5 sm:px-6 sm:py-6 ${className}`}>{children}</div>;
}

/** En-tête de vue : titre (masqué sur mobile, déjà dans la barre du haut), sous-titre, actions. */
export function PageHeader({ title, subtitle, actions, showTitleOnMobile = false }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; showTitleOnMobile?: boolean }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className={`${showTitleOnMobile ? '' : 'hidden lg:block'} text-xl font-semibold tracking-tight text-[var(--text-primary)]`}>{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── Surfaces ─────────────────────────────────────────────── */

/** Bloc de contenu avec titre optionnel. */
export function Panel({
  title,
  icon: Icon,
  action,
  children,
  className = '',
  padded = true,
}: {
  title?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`ui-card ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
            {Icon && <Icon size={16} className="shrink-0 text-[var(--text-muted)]" />}
            <span className="truncate">{title}</span>
          </h2>
          {action}
        </header>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  accent = false,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  accent?: boolean;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={`ui-card flex h-full w-full flex-col gap-1 p-4 text-left ${onClick ? 'transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]' : ''}`}
    >
      <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
        {Icon && <Icon size={14} />}
        {label}
      </span>
      <span className={`tabular text-2xl font-semibold tracking-tight ${accent ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{value}</span>
      {hint && <span className="text-xs text-[var(--text-muted)]">{hint}</span>}
    </Tag>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-16 text-center">
      {Icon && (
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
          <Icon size={22} />
        </div>
      )}
      <div>
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-[13px] text-[var(--text-muted)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ label, className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-10 text-[13px] text-[var(--text-muted)] ${className}`}>
      <Loader2 size={18} className="animate-spin" />
      {label}
    </div>
  );
}

/* ── Formulaires ──────────────────────────────────────────── */

export function Field({ label, hint, error, children, className = '' }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="block text-xs font-medium text-[var(--text-secondary)]">{label}</span>
      {children}
      {error ? <span className="block text-xs text-[var(--red)]">{error}</span> : hint ? <span className="block text-xs text-[var(--text-muted)]">{hint}</span> : null}
    </label>
  );
}

/** Message d'état inline (erreur, succès, info, avertissement). */
export function Notice({ tone = 'info', children, icon: Icon }: { tone?: 'info' | 'success' | 'warning' | 'error'; children: ReactNode; icon?: LucideIcon }) {
  const color = { info: 'var(--blue)', success: 'var(--green)', warning: 'var(--accent)', error: 'var(--red)' }[tone];
  return (
    <div
      className="flex items-start gap-2 rounded-lg px-3 py-2.5 text-[13px] leading-snug"
      style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 22%, transparent)` }}
    >
      {Icon && <Icon size={16} className="mt-px shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Pastille neutre ou colorée (statut, type, info courte). */
export function Badge({ children, tone = 'neutral', className = '' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'green' | 'red' | 'blue'; className?: string }) {
  const color = { neutral: 'var(--text-secondary)', accent: 'var(--accent)', green: 'var(--green)', red: 'var(--red)', blue: 'var(--blue)' }[tone];
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 text-[11px] font-medium ${className}`}
      style={{ color, background: tone === 'neutral' ? 'var(--bg-elevated)' : `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {children}
    </span>
  );
}

/* ── Modale ───────────────────────────────────────────────── */

/** Pile des modales ouvertes : Échap ne ferme que celle du dessus. */
const modalStack: symbol[] = [];

/**
 * Modale standard. Desktop : centrée. Mobile : feuille ancrée en bas.
 * Échap et clic sur le fond ferment (sauf `dismissible={false}` pendant un
 * traitement). Le contenu défile, l'en-tête et le pied restent visibles.
 */
export function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  icon,
  size = 'md',
  footer,
  children,
  dismissible = true,
  bodyClassName = '',
  zIndex = 80,
}: {
  open?: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  footer?: ReactNode;
  children: ReactNode;
  dismissible?: boolean;
  bodyClassName?: string;
  zIndex?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<symbol | null>(null);
  const max = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl', full: 'sm:max-w-6xl' }[size];

  // Ouverture : entrée dans la pile, blocage du scroll de fond, focus.
  useEffect(() => {
    if (!open) return;
    const id = Symbol('modal');
    modalStack.push(id);
    idRef.current = id;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      modalStack.splice(modalStack.indexOf(id), 1);
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape' || !dismissible) return;
      if (modalStack[modalStack.length - 1] !== idRef.current) return;
      e.stopPropagation();
      onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, dismissible]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 flex items-end justify-center sm:items-center sm:p-4"
          style={{ zIndex }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div className="absolute inset-0 bg-[var(--backdrop)] backdrop-blur-[2px]" onClick={dismissible ? onClose : undefined} />
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: 'spring', damping: 34, stiffness: 420 }}
            className={`relative flex max-h-[92dvh] w-full ${max} flex-col overflow-hidden rounded-t-2xl border border-[var(--border-strong)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)] outline-none sm:rounded-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {(title || icon) && (
              <header className="flex shrink-0 items-start gap-3 border-b border-[var(--border)] px-5 py-4">
                {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
                <div className="min-w-0 flex-1">
                  {title && <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">{title}</h2>}
                  {subtitle && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{subtitle}</p>}
                </div>
                {dismissible && (
                  <button onClick={onClose} className="ui-btn ui-btn-ghost ui-btn-icon -mr-2 -mt-1 h-8 w-8" aria-label="Fermer">
                    <X size={16} />
                  </button>
                )}
              </header>
            )}
            <div className={`min-h-0 flex-1 overflow-y-auto px-5 py-4 ${bodyClassName}`}>{children}</div>
            {footer && (
              <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] px-5 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:pb-3">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
export { ThemeSwitcher, ThemeToggleButton } from './ThemeSwitcher';
export { FeedbackHost } from './Feedback';
export { HoloCard } from './HoloCard';
