import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowRight,
  CornerDownLeft,
  FileClock,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  Library,
  Monitor,
  Moon,
  Plus,
  ScanLine,
  Search,
  Share2,
  ShoppingBag,
  Sun,
  TrendingUp,
  Upload,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useCards } from '../../hooks/useCards';
import { useAppStore, type ActiveView } from '../../stores/appStore';
import { useCollectionFilters } from '../../stores/collectionFilterStore';
import { buildPlayerCanonical, playerNameKey, stripDiacritics } from '../../lib/playerName';
import { useTheme } from '../../lib/theme';
import { cdnImg } from '../../lib/cdn';
import type { Card } from '../../types';
import { CardDetail } from './CardDetail';
import { useCommandPalette } from '../../stores/commandPaletteStore';


interface Item {
  id: string;
  group: 'Cartes' | 'Joueurs' | 'Aller à' | 'Actions';
  label: string;
  hint?: string;
  icon?: LucideIcon;
  image?: string | null;
  keywords: string;
  run: () => void;
}

const MAX_CARDS = 6;
const MAX_PLAYERS = 4;

function norm(s: string) {
  return stripDiacritics(s).toLowerCase();
}

function matches(haystack: string, tokens: string[]) {
  return tokens.every((t) => haystack.includes(t));
}

export function CommandPalette({ isAdmin, onShare }: { isAdmin: boolean; onShare: () => void }) {
  const { open, setOpen } = useCommandPalette();
  const [openedCardId, setOpenedCardId] = useState<string | null>(null);
  const { data: cards = [] } = useCards();

  // ⌘K / Ctrl+K partout ; « / » hors champ de saisie.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useCommandPalette.getState().open);
      } else if (e.key === '/' && !typing && !useCommandPalette.getState().open) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const openedCard: Card | undefined = openedCardId ? cards.find((c) => c.id === openedCardId) : undefined;

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              className="fixed inset-0 z-[120] flex items-start justify-center px-3 pt-[10vh] sm:pt-[14vh]"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
            >
              <div className="absolute inset-0 bg-[var(--backdrop)] backdrop-blur-[2px]" onClick={() => setOpen(false)} />
              <PaletteBody isAdmin={isAdmin} onShare={onShare} onOpenCard={setOpenedCardId} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
      {openedCard && <CardDetail card={openedCard} onClose={() => setOpenedCardId(null)} />}
    </>
  );
}

function PaletteBody({ isAdmin, onShare, onOpenCard }: { isAdmin: boolean; onShare: () => void; onOpenCard: (id: string) => void }) {
  const setOpen = useCommandPalette((s) => s.setOpen);
  const [query, setQueryRaw] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const { data: cards = [] } = useCards();
  const setActiveView = useAppStore((s) => s.setActiveView);
  const applyDrill = useCollectionFilters((s) => s.applyDrill);
  const setTheme = useTheme((s) => s.setPreference);
  const setQuery = (q: string) => { setQueryRaw(q); setActive(0); };

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const collection = useMemo(() => cards.filter((c) => c.status !== 'draft'), [cards]);

  const staticItems = useMemo<Item[]>(() => {
    const close = () => setOpen(false);
    const go = (view: ActiveView) => () => { setActiveView(view); close(); };
    const nav: [ActiveView, string, LucideIcon, string][] = [
      ['dashboard', "Vue d'ensemble", LayoutDashboard, 'accueil dashboard'],
      ['collection', 'Collection', Library, 'cartes grille'],
      ['sales', 'Ventes', TrendingUp, 'vendre vendu'],
      ['requests', 'Demandes', Inbox, 'interets messages'],
      ['review', 'Brouillons', FileClock, 'drafts valider'],
      ['players', 'Joueurs', Users, 'players'],
      ['grading', 'Grading', GraduationCap, 'psa bgs note'],
      ['ebay', 'eBay', ShoppingBag, 'annonces reglages'],
    ];
    return [
      { id: 'a-add', group: 'Actions' as const, label: 'Ajouter une carte', hint: 'Identification IA', icon: Plus, keywords: 'nouvelle ajout rapide photo', run: go('add_card') },
      { id: 'a-studio', group: 'Actions' as const, label: 'Ouvrir le studio photo', icon: ScanLine, keywords: 'camera session', run: go('studio') },
      { id: 'a-batch', group: 'Actions' as const, label: 'Importer un lot de photos', icon: Upload, keywords: 'import batch glisser', run: go('batch') },
      { id: 'a-share', group: 'Actions' as const, label: 'Partager ma collection', icon: Share2, keywords: 'lien public', run: () => { close(); onShare(); } },
      { id: 'a-light', group: 'Actions' as const, label: 'Thème clair', icon: Sun, keywords: 'light mode apparence', run: () => { setTheme('light'); close(); } },
      { id: 'a-dark', group: 'Actions' as const, label: 'Thème sombre', icon: Moon, keywords: 'dark mode apparence', run: () => { setTheme('dark'); close(); } },
      { id: 'a-system', group: 'Actions' as const, label: 'Thème du système', icon: Monitor, keywords: 'auto apparence', run: () => { setTheme('system'); close(); } },
      ...nav.map(([view, label, icon, kw]): Item => ({ id: `n-${view}`, group: 'Aller à', label, icon, keywords: kw, run: go(view) })),
      ...(isAdmin ? [{ id: 'n-compare', group: 'Aller à' as const, label: 'Comparer IA', icon: User, keywords: 'admin', run: go('compare') }] : []),
    ].map((it): Item => ({ ...it, keywords: norm(`${it.label} ${it.keywords}`) }));
  }, [setActiveView, setOpen, onShare, setTheme, isAdmin]);

  const cardIndex = useMemo(
    () =>
      collection.map((c) => ({
        card: c,
        hay: norm([c.player, c.team, c.year, c.brand, c.set_name, c.insert_name, c.parallel_name, c.numbered, c.card_number].filter(Boolean).join(' ')),
      })),
    [collection],
  );

  const players = useMemo(() => {
    const canonical = buildPlayerCanonical(collection.map((c) => c.player));
    const counts = new Map<string, number>();
    for (const c of collection) {
      if (!c.player) continue;
      const name = canonical.get(playerNameKey(c.player)) ?? c.player;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].map(([name, count]) => ({ name, count, hay: norm(name) }));
  }, [collection]);

  const items = useMemo<Item[]>(() => {
    const tokens = norm(query).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return [...staticItems.filter((i) => i.group === 'Actions').slice(0, 4), ...staticItems.filter((i) => i.group === 'Aller à')];
    }
    const close = () => setOpen(false);
    const playerItems: Item[] = players
      .filter((p) => matches(p.hay, tokens))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_PLAYERS)
      .map((p) => ({
        id: `p-${p.name}`,
        group: 'Joueurs',
        label: p.name,
        hint: `${p.count} carte${p.count > 1 ? 's' : ''}`,
        icon: Users,
        keywords: p.hay,
        run: () => { applyDrill({ player: p.name }); setActiveView('collection'); close(); },
      }));
    const cardItems: Item[] = cardIndex
      .filter((c) => matches(c.hay, tokens))
      .slice(0, MAX_CARDS)
      .map(({ card }) => ({
        id: `c-${card.id}`,
        group: 'Cartes',
        label: card.player ?? 'Carte sans joueur',
        hint: [card.year, card.set_name, card.parallel_name && card.parallel_name !== 'Base' ? card.parallel_name : null, card.numbered].filter(Boolean).join(' · '),
        image: card.image_front_url,
        keywords: '',
        run: () => { close(); onOpenCard(card.id); },
      }));
    const other = staticItems.filter((i) => matches(i.keywords, tokens));
    return [...cardItems, ...playerItems, ...other];
  }, [query, staticItems, players, cardIndex, applyDrill, setActiveView, setOpen, onOpenCard]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[active]?.run(); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
  }

  let lastGroup = '';
  return (
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Recherche et commandes"
                initial={{ opacity: 0, y: -8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.98 }}
                transition={{ type: 'spring', damping: 32, stiffness: 420 }}
                className="popover-surface relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden"
                onKeyDown={onKeyDown}
              >
                <div className="flex items-center gap-3 border-b border-[var(--border)] px-4">
                  <Search size={17} className="shrink-0 text-[var(--text-muted)]" />
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Chercher une carte, un joueur, une action…"
                    className="h-13 min-w-0 flex-1 bg-transparent py-4 text-[15px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls="cmdk-list"
                    aria-activedescendant={items[active] ? `cmdk-${items[active].id}` : undefined}
                  />
                  <kbd className="hidden rounded-md border border-[var(--border-strong)] px-1.5 py-0.5 text-[11px] text-[var(--text-muted)] sm:inline">Échap</kbd>
                </div>

                <div ref={listRef} id="cmdk-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-1.5">
                  {items.length === 0 && (
                    <p className="px-3 py-10 text-center text-[13px] text-[var(--text-muted)]">Aucun résultat pour « {query} »</p>
                  )}
                  {items.map((it, i) => {
                    const header = it.group !== lastGroup ? it.group : null;
                    lastGroup = it.group;
                    const Icon = it.icon;
                    return (
                      <div key={it.id}>
                        {header && <div className="px-2.5 pb-1 pt-2.5 text-[11px] font-medium text-[var(--text-muted)]">{header}</div>}
                        <button
                          id={`cmdk-${it.id}`}
                          role="option"
                          aria-selected={i === active}
                          data-index={i}
                          onMouseMove={() => setActive(i)}
                          onClick={() => it.run()}
                          className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors ${i === active ? 'bg-[var(--bg-hover)]' : ''}`}
                        >
                          {it.group === 'Cartes' ? (
                            it.image
                              ? <img src={cdnImg(it.image)} alt="" className="h-10 w-7 shrink-0 rounded object-cover" loading="lazy" />
                              : <span className="h-10 w-7 shrink-0 rounded bg-[var(--bg-elevated)]" />
                          ) : Icon ? (
                            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)] text-[var(--text-secondary)]">
                              <Icon size={15} />
                            </span>
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium text-[var(--text-primary)]">{it.label}</span>
                            {it.hint && <span className="block truncate text-xs text-[var(--text-muted)]">{it.hint}</span>}
                          </span>
                          {i === active && (
                            it.group === 'Cartes' || it.group === 'Actions'
                              ? <CornerDownLeft size={14} className="shrink-0 text-[var(--text-muted)]" />
                              : <ArrowRight size={14} className="shrink-0 text-[var(--text-muted)]" />
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="hidden items-center gap-4 border-t border-[var(--border)] px-4 py-2 text-[11px] text-[var(--text-muted)] sm:flex">
                  <span><kbd className="font-sans">↑↓</kbd> naviguer</span>
                  <span><kbd className="font-sans">↵</kbd> ouvrir</span>
                  <span className="ml-auto">{collection.length} cartes indexées</span>
                </div>
              </motion.div>
  );
}

/** Champ factice qui ouvre la palette (sidebar desktop). */
export function CommandPaletteTrigger({ compact = false }: { compact?: boolean }) {
  const setOpen = useCommandPalette((s) => s.setOpen);
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  if (compact) {
    return (
      <button className="ui-btn ui-btn-ghost ui-btn-icon" onClick={() => setOpen(true)} aria-label="Rechercher">
        <Search size={17} />
      </button>
    );
  }
  return (
    <button
      onClick={() => setOpen(true)}
      className="flex h-9 w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 text-left text-[13px] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-secondary)]"
    >
      <Search size={15} />
      <span className="flex-1">Rechercher…</span>
      <kbd className="rounded border border-[var(--border-strong)] px-1 text-[11px]">{isMac ? '⌘K' : 'Ctrl K'}</kbd>
    </button>
  );
}
