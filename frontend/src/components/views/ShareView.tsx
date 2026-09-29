import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  Search,
  X,
  Calendar,
  Building,
  Target,
  Globe,
  ExternalLink,
  LayoutGrid,
  Maximize2,
  Layers,
  Star,
  Hash,
  RefreshCw,
  Heart,
  Send,
  Copy,
  Check,
  ChevronDown,
  ArrowUpDown,
  SearchX,
  ImageOff,
  Link2Off,
} from 'lucide-react';
import { errorMessage, toast } from '../../lib/feedback';
import type { Card } from '../../types';
import { RookieBadge } from '../shared/RookieBadge';
import { Popover } from '../shared/Popover';
import { Badge, EmptyState, Field, Modal, Spinner, ThemeToggleButton } from '../ui';
import { playerLastName, stripDiacritics } from '../../lib/playerName';
import { cdnImg } from '../../lib/cdn';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface ShareData {
  title: string | null;
  filter: string;
  show_prices: boolean;
  card_count: number;
  cards: Card[];
}

type GroupBy = 'none' | 'year' | 'player' | 'team' | 'brand' | 'set' | 'type' | 'rookie' | 'graded';
type SortBy =
  | 'recent'
  | 'year_desc'
  | 'year_asc'
  | 'player'
  | 'brand'
  | 'set'
  | 'price_desc'
  | 'price_asc'
  | 'numbered'
  | 'rookie_first';

const TYPE_LABELS: Record<string, string> = {
  base: 'Base',
  insert: 'Insert',
  parallel: 'Parallel',
  numbered: 'Numbered',
  auto: 'Auto',
  patch: 'Patch',
  auto_patch: 'Auto/Patch',
};
const FILTER_LABELS: Record<string, string> = {
  all: 'Collection complète',
  collection: 'Collection',
  a_vendre: 'À vendre',
};
const GROUP_LABELS: Record<GroupBy, string> = {
  none: 'Aucun',
  year: 'Année',
  player: 'Joueur',
  team: 'Équipe',
  brand: 'Marque',
  set: 'Set',
  type: 'Type',
  rookie: 'RC',
  graded: 'Grading',
};
const SORT_LABELS: Record<SortBy, string> = {
  recent: 'Plus récentes',
  year_desc: 'Année décroissante',
  year_asc: 'Année croissante',
  player: 'Joueur A-Z',
  brand: 'Marque A-Z',
  set: 'Set A-Z',
  price_desc: 'Prix décroissant',
  price_asc: 'Prix croissant',
  numbered: 'Numérotation #',
  rookie_first: 'RC en premier',
};

function parseSeasonStart(year: string | null | undefined): number {
  if (!year) return -1;
  const match = year.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : -1;
}

function parseNumberedValue(numbered: string | null | undefined): number {
  if (!numbered) return Number.POSITIVE_INFINITY;
  const match = numbered.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

function buildGroupKey(card: Card, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'year': return card.year ?? 'Année inconnue';
    case 'player': return card.player ?? 'Joueur inconnu';
    case 'team': return card.team ?? 'Équipe inconnue';
    case 'brand': return card.brand ?? 'Marque inconnue';
    case 'set': return card.set_name ?? 'Set inconnu';
    case 'type': return TYPE_LABELS[card.card_type ?? ''] ?? (card.card_type ?? 'Sans type');
    case 'rookie': return card.is_rookie ? 'RC' : 'Non RC';
    case 'graded': return card.grading_company ? 'Gradées' : 'Non gradées';
    default: return '';
  }
}

function sortCards(list: Card[], sortBy: SortBy): Card[] {
  return [...list].sort((a, b) => {
    switch (sortBy) {
      case 'year_desc': return parseSeasonStart(b.year) - parseSeasonStart(a.year);
      case 'year_asc': return parseSeasonStart(a.year) - parseSeasonStart(b.year);
      case 'player': return playerLastName(a.player).localeCompare(playerLastName(b.player)) || (a.player ?? '').localeCompare(b.player ?? '');
      case 'brand': return (a.brand ?? '').localeCompare(b.brand ?? '') || (a.set_name ?? '').localeCompare(b.set_name ?? '');
      case 'set': return (a.set_name ?? '').localeCompare(b.set_name ?? '') || (a.player ?? '').localeCompare(b.player ?? '');
      case 'price_desc': return (b.price ?? -1) - (a.price ?? -1);
      case 'price_asc': return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
      case 'numbered': return parseNumberedValue(a.numbered) - parseNumberedValue(b.numbered);
      case 'rookie_first': return Number(b.is_rookie ?? false) - Number(a.is_rookie ?? false) || playerLastName(a.player).localeCompare(playerLastName(b.player));
      case 'recent':
      default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });
}

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
function formatEuro(v: number): string {
  return euro.format(v);
}

/* ── Primitives locales (page publique, hors shell) ───────── */

/** Marque CardVaults : carré accent + « C ». */
function LogoMark({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg bg-[var(--accent)] font-extrabold text-[var(--on-accent)] ${
        size === 'md' ? 'h-10 w-10 text-lg' : 'h-7 w-7 text-sm'
      }`}
      aria-hidden="true"
    >
      C
    </span>
  );
}

function ShareHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg-primary)]">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <LogoMark />
          <span className="text-sm font-bold tracking-tight text-[var(--text-primary)]">CardVaults</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 text-xs text-[var(--text-muted)] sm:inline-flex">
            <Globe size={13} />
            Collection partagée
          </span>
          <ThemeToggleButton />
        </div>
      </div>
    </header>
  );
}

/** Pastille posée sur la photo : fond sombre translucide, texte coloré. */
function PhotoTag({ children, color = 'var(--text-primary)', background }: { children: ReactNode; color?: string; background?: string }) {
  return (
    <span
      className={`tabular inline-flex h-5 items-center rounded-md px-1.5 text-[10px] font-semibold ring-1 ring-white/10 ${background ? '' : 'dark-scope bg-black/70'}`}
      style={{ color, background }}
    >
      {children}
    </span>
  );
}

function SectionHeading({ title, count }: { title: ReactNode; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
      <Badge>
        <span className="tabular">{count}</span>
      </Badge>
      <span className="h-px flex-1 bg-[var(--border)]" />
    </div>
  );
}

function FilterDropdown({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: string[];
  selected: string | null;
  onSelect: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const anchor = useRef<HTMLButtonElement>(null);

  const visible = useMemo(() => {
    const q = stripDiacritics(query.trim()).toLowerCase();
    if (!q) return items;
    return items.filter((v) => stripDiacritics(v).toLowerCase().includes(q));
  }, [items, query]);

  if (items.length === 0) return null;

  function close() {
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <button
        ref={anchor}
        className="ui-chip max-w-[220px] shrink-0"
        data-active={!!selected}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="truncate">{selected ?? label}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={close}>
        {items.length > 8 && (
          <div className="border-b border-[var(--border)] p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Chercher : ${label.toLowerCase()}…`}
              className="ui-input h-8"
            />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {visible.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-[var(--text-muted)]">Aucun résultat</p>}
          {visible.map((v) => {
            const active = selected === v;
            return (
              <button key={v} className="ui-menu-item" onClick={() => { onSelect(v); close(); }}>
                <span className="min-w-0 flex-1 truncate">{v}</span>
                {active && <Check size={14} className="shrink-0 text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>
        {selected && (
          <div className="border-t border-[var(--border)] p-2 text-right">
            <button className="text-[13px] font-medium text-[var(--accent)]" onClick={() => { onSelect(null); close(); }}>
              Effacer
            </button>
          </div>
        )}
      </Popover>
    </>
  );
}

function CardTags({ card }: { card: Card }) {
  return (
    <>
      {card.is_rookie && <RookieBadge compact />}
      {card.grading_grade && <PhotoTag>{`${card.grading_company ?? ''} ${card.grading_grade}`.trim()}</PhotoTag>}
      {card.numbered && <PhotoTag color="var(--accent)">{card.numbered}</PhotoTag>}
    </>
  );
}

function CardModal({ card, showPrice, onClose, interested, onToggleInterest }: { card: Card; showPrice: boolean; onClose: () => void; interested: boolean; onToggleInterest: () => void }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const details = [
    { label: 'Joueur', value: card.player, icon: Users },
    { label: 'Équipe', value: card.team, icon: Target },
    { label: 'Année', value: card.year, icon: Calendar },
    { label: 'Marque', value: card.brand, icon: Layers },
    { label: 'Set', value: card.set_name, icon: Layers },
    { label: 'Insert', value: card.insert_name, icon: Star },
    { label: 'Parallel', value: (card.parallel_name && card.parallel_name !== 'Base') ? card.parallel_name : null, icon: Star },
    { label: 'Type', value: card.card_type ? TYPE_LABELS[card.card_type] : null, icon: Target },
    { label: 'Tirage', value: card.numbered, icon: Hash },
    { label: 'Grading', value: card.grading_grade ? `${card.grading_company ?? ''} ${card.grading_grade}` : null, icon: Building },
  ].filter(d => d.value);

  const subtitle = [card.year, card.brand, card.set_name].filter(Boolean).join(' · ');

  return (
    <Modal
      onClose={onClose}
      size="lg"
      zIndex={90}
      title={card.player || 'Joueur inconnu'}
      subtitle={subtitle || undefined}
      footer={
        <>
          <button className="ui-btn" onClick={onClose}>Fermer</button>
          <button className={`ui-btn ${interested ? '' : 'ui-btn-primary'}`} data-active={interested} onClick={onToggleInterest}>
            <Heart size={15} fill={interested ? 'currentColor' : 'none'} />
            {interested ? 'Dans ta sélection' : 'Ça m\'intéresse'}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="w-full shrink-0 space-y-2 sm:w-[44%]">
          <div className="relative overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            {card.image_front_url ? (
              <button
                type="button"
                className="block w-full cursor-zoom-in"
                onClick={() => setLightboxUrl(cdnImg(card.image_front_url)!)}
                aria-label="Agrandir le recto"
              >
                <img
                  src={cdnImg(card.image_front_url)}
                  alt={card.player ?? ''}
                  loading="lazy"
                  decoding="async"
                  className="mx-auto max-h-[360px] w-full object-contain"
                />
              </button>
            ) : (
              <div className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
                <ImageOff size={28} />
                <span className="text-xs">Pas de photo</span>
              </div>
            )}
            <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap gap-1">
              <CardTags card={card} />
            </div>
          </div>
          {card.image_back_url && (
            <button onClick={() => setLightboxUrl(cdnImg(card.image_back_url)!)} className="ui-btn ui-btn-sm w-full">
              <Maximize2 size={13} /> Voir le verso
            </button>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-5">
          {showPrice && card.price != null && (
            <div>
              <p className="text-xs text-[var(--text-muted)]">Prix</p>
              <p className="tabular text-2xl font-semibold tracking-tight text-[var(--price)]">{formatEuro(card.price)}</p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            {details.map((d, i) => (
              <div key={i} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
                  <d.icon size={12} className="shrink-0" />
                  {d.label}
                </dt>
                <dd className="mt-0.5 break-words text-[13px] font-medium text-[var(--text-primary)]">{d.value}</dd>
              </div>
            ))}
          </dl>

          {card.vinted_url && (
            <a href={card.vinted_url} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-lg w-full">
              Voir sur Vinted <ExternalLink size={15} />
            </a>
          )}
        </div>
      </div>

      {lightboxUrl && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center dark-scope bg-black/90 p-4 sm:p-8"
          onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
        >
          <img src={lightboxUrl} alt="" className="max-h-full max-w-full rounded-xl object-contain" />
          <button className="ui-btn ui-btn-icon absolute right-4 top-4" aria-label="Fermer">
            <X size={18} />
          </button>
        </div>,
        document.body,
      )}
    </Modal>
  );
}

function SharedCard({ card, showPrice, onClick, interested, onToggleInterest }: { card: Card; showPrice: boolean; onClick: () => void; interested?: boolean; onToggleInterest?: () => void }) {
  const variant = card.insert_name || (card.parallel_name && card.parallel_name !== 'Base' ? card.parallel_name : null);
  const meta = [card.year, card.brand, card.set_name].filter(Boolean).join(' · ');

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className={`group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-[var(--bg-card)] text-left transition-[border-color,box-shadow] duration-200 hover:shadow-[var(--shadow-md)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        interested ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'
      }`}
    >
      <div className="relative aspect-[3/4] overflow-hidden bg-[var(--bg-secondary)]">
        {card.image_front_url ? (
          <img
            src={cdnImg(card.image_front_url)}
            alt={card.player ?? ''}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--text-muted)]">
            <ImageOff size={26} />
          </div>
        )}

        <div className="absolute left-2 top-2 z-10 flex max-w-[70%] flex-wrap gap-1">
          <CardTags card={card} />
        </div>

        {onToggleInterest && (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleInterest(); }}
            className={`absolute right-2 top-2 z-20 flex h-9 w-9 items-center justify-center rounded-full ring-1 transition-colors ${
              interested
                ? 'bg-[var(--accent)] text-[var(--on-accent)] ring-transparent'
                : 'dark-scope bg-black/60 text-white ring-white/15 hover:bg-black/80'
            }`}
            title={interested ? 'Retirer de ma sélection' : 'Ça m’intéresse'}
            aria-label="Ça m'intéresse"
            aria-pressed={!!interested}
          >
            <Heart size={16} fill={interested ? 'currentColor' : 'none'} />
          </button>
        )}

        {card.vinted_url && (
          <div className="absolute bottom-2 left-2 z-10">
            <PhotoTag background="#007782" color="#fff">Vinted</PhotoTag>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{card.player || '—'}</p>
          {showPrice && card.price != null && (
            <span className="tabular shrink-0 text-[13px] font-semibold text-[var(--price)]">{formatEuro(card.price)}</span>
          )}
        </div>
        <p className="truncate text-xs text-[var(--text-muted)]">{meta || '—'}</p>
        {variant && <p className="truncate text-xs text-[var(--text-secondary)]">{variant}</p>}
      </div>
    </div>
  );
}

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-4';

export function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Card | null>(null);

  const initialSearch = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const [search, setSearch] = useState(initialSearch.get('q') ?? '');
  const [playerFilter, setPlayerFilter] = useState<string | null>(initialSearch.get('player'));
  const [teamFilter, setTeamFilter] = useState<string | null>(initialSearch.get('team'));
  const [brandFilter, setBrandFilter] = useState<string | null>(initialSearch.get('brand'));
  const [setFilter, setSetFilter] = useState<string | null>(initialSearch.get('set'));
  const [yearFilter, setYearFilter] = useState<string | null>(initialSearch.get('year'));
  const [typeFilter, setTypeFilter] = useState<string | null>(initialSearch.get('type'));
  const [parallelFilter, setParallelFilter] = useState<string | null>(initialSearch.get('parallel'));
  const [rookieOnly, setRookieOnly] = useState(initialSearch.get('rookie') === '1');
  const [gradedOnly, setGradedOnly] = useState(initialSearch.get('graded') === '1');
  const [vintedOnly, setVintedOnly] = useState(initialSearch.get('vinted') === '1');
  const [groupBy, setGroupBy] = useState<GroupBy>((initialSearch.get('group') as GroupBy) || 'none');
  const [sortBy, setSortBy] = useState<SortBy>((initialSearch.get('sort') as SortBy) || 'recent');

  // ── Sélection « Ça m'intéresse » ──
  const [interest, setInterest] = useState<Set<string>>(new Set());
  const [submitOpen, setSubmitOpen] = useState(false);
  const [handle, setHandle] = useState('');
  const [reqMessage, setReqMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submittedCards, setSubmittedCards] = useState<Card[]>([]);
  const [copied, setCopied] = useState(false);

  function toggleInterest(id: string) {
    setInterest((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const interestTotal = useMemo(
    () => (data?.cards ?? []).filter((c) => interest.has(c.id)).reduce((sum, c) => sum + (c.price ?? 0), 0),
    [data, interest],
  );

  const interestCards = useMemo(
    () => (data?.cards ?? []).filter((c) => interest.has(c.id)),
    [data, interest],
  );

  const recapText = useMemo(() => {
    const showPrice = data?.show_prices;
    const typeLabel: Record<string, string> = {
      base: 'Base', insert: 'Insert', parallel: 'Parallèle', numbered: 'Numérotée',
      auto: 'Autographe', patch: 'Patch/Memorabilia', auto_patch: 'Auto + Patch',
    };
    const lines = submittedCards.map((c) => {
      const parts: string[] = [];
      if (c.team) parts.push(c.team);
      if (c.year) parts.push(c.year);
      if (c.brand) parts.push(c.brand);
      if (c.set_name) parts.push(c.set_name);
      if (c.parallel_name) parts.push(c.parallel_name);
      if (c.card_number) parts.push(`N°${c.card_number}`);
      if (c.numbered) parts.push(`/${c.numbered}`);
      if (c.card_type) parts.push(typeLabel[c.card_type] ?? c.card_type);
      if (c.is_rookie) parts.push('Rookie');
      if (showPrice && c.price != null) parts.push(`${c.price}€`);
      return `- ${c.player ?? 'Carte'}${parts.length ? ` — ${parts.join(' · ')}` : ''}`;
    });
    const total = submittedCards.reduce((s, c) => s + (c.price ?? 0), 0);
    const header = `Ma sélection — ${submittedCards.length} carte${submittedCards.length > 1 ? 's' : ''}`;
    const totalLine = showPrice && total > 0 ? `\n\nTotal : ${total.toFixed(0)}€` : '';
    return `${header}\n${lines.join('\n')}${totalLine}`;
  }, [submittedCards, data]);

  async function submitInterest() {
    const h = handle.trim();
    if (!h) return;
    setSubmitting(true);
    try {
      const resp = await fetch(`${API_BASE}/api/share/${token}/interest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ viewer_handle: h, message: reqMessage.trim() || null, card_ids: [...interest] }),
      });
      if (!resp.ok) throw new Error('Échec de l\u2019envoi');
      setSubmittedCards(interestCards);
      setSubmitted(true);
      setCopied(false);
      setSubmitOpen(false);
      setInterest(new Set());
      setReqMessage('');
    } catch (e) {
      toast.error('Envoi impossible', { description: errorMessage(e, 'Réessaie dans un instant.') });
    } finally {
      setSubmitting(false);
    }
  }

  useEffect(() => {
    fetch(`${API_BASE}/api/share/${token}/view`)
      .then((r) => { if (!r.ok) throw new Error('Lien introuvable ou expiré'); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const cardsList = useMemo(() => data?.cards ?? [], [data]);

  const players = useMemo(() => [...new Set(cardsList.map((c) => c.player).filter(Boolean) as string[])].sort(), [cardsList]);
  const teams = useMemo(() => [...new Set(cardsList.map((c) => c.team).filter(Boolean) as string[])].sort(), [cardsList]);
  const brands = useMemo(() => [...new Set(cardsList.map((c) => c.brand).filter(Boolean) as string[])].sort(), [cardsList]);
  const sets = useMemo(() => [...new Set(cardsList.map((c) => c.set_name).filter(Boolean) as string[])].sort(), [cardsList]);
  const years = useMemo(() => [...new Set(cardsList.map((c) => c.year).filter(Boolean) as string[])].sort((a, b) => parseSeasonStart(b) - parseSeasonStart(a)), [cardsList]);
  const parallels = useMemo(() => [...new Set(cardsList.map((c) => c.parallel_name).filter((v): v is string => !!v && v !== 'Base'))].sort(), [cardsList]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (search) params.set('q', search);
    if (playerFilter) params.set('player', playerFilter);
    if (teamFilter) params.set('team', teamFilter);
    if (brandFilter) params.set('brand', brandFilter);
    if (setFilter) params.set('set', setFilter);
    if (yearFilter) params.set('year', yearFilter);
    if (typeFilter) params.set('type', typeFilter);
    if (parallelFilter) params.set('parallel', parallelFilter);
    if (rookieOnly) params.set('rookie', '1');
    if (gradedOnly) params.set('graded', '1');
    if (vintedOnly) params.set('vinted', '1');
    if (groupBy !== 'none') params.set('group', groupBy);
    if (sortBy !== 'recent') params.set('sort', sortBy);
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [search, playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter, parallelFilter, rookieOnly, gradedOnly, vintedOnly, groupBy, sortBy]);

  const filtered = useMemo(() => {
    const result = cardsList.filter((c) => {
      if (playerFilter && c.player !== playerFilter) return false;
      if (teamFilter && c.team !== teamFilter) return false;
      if (brandFilter && c.brand !== brandFilter) return false;
      if (setFilter && c.set_name !== setFilter) return false;
      if (yearFilter && c.year !== yearFilter) return false;
      if (typeFilter && c.card_type !== typeFilter) return false;
      if (parallelFilter && c.parallel_name !== parallelFilter) return false;
      if (rookieOnly && !c.is_rookie) return false;
      if (gradedOnly && !c.grading_company) return false;
      if (vintedOnly && !c.vinted_url) return false;
      if (search) {
        const q = stripDiacritics(search).toLowerCase();
        const hay = stripDiacritics(
          [c.player, c.team, c.brand, c.set_name, c.insert_name, c.parallel_name, c.year].filter(Boolean).join(' '),
        ).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortCards(result, sortBy);
  }, [cardsList, playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter, parallelFilter, rookieOnly, gradedOnly, vintedOnly, search, sortBy]);

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: '', label: '', cards: filtered }];
    const map = new Map<string, Card[]>();
    filtered.forEach((card) => {
      const key = buildGroupKey(card, groupBy);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(card);
    });
    return [...map.entries()]
      .sort(([a], [b]) =>
        groupBy === 'player'
          ? playerLastName(a).localeCompare(playerLastName(b)) || a.localeCompare(b)
          : a.localeCompare(b),
      )
      .map(([label, groupCards]) => ({ key: label, label, cards: groupCards }));
  }, [filtered, groupBy]);

  const stats = useMemo(() => ({
    autos: cardsList.filter(c => c.card_type === 'auto' || c.card_type === 'auto_patch').length,
    numbered: cardsList.filter(c => c.numbered).length,
    graded: cardsList.filter(c => c.grading_grade).length,
    rookieCount: cardsList.filter(c => c.is_rookie).length,
    forSale: cardsList.filter(c => c.vinted_url).length,
  }), [cardsList]);

  const showcaseSections = useMemo(() => {
    const sections = [
      { key: 'rc', title: 'RC', cards: filtered.filter((card) => card.is_rookie).slice(0, 6) },
      { key: 'psa', title: 'PSA', cards: filtered.filter((card) => card.grading_company === 'PSA').slice(0, 6) },
      { key: 'sale', title: 'À vendre', cards: filtered.filter((card) => card.status === 'a_vendre' || card.vinted_url).slice(0, 6) },
      { key: 'autos', title: 'Autos', cards: filtered.filter((card) => card.card_type === 'auto' || card.card_type === 'auto_patch').slice(0, 6) },
    ];
    return sections.filter((section) => section.cards.length > 0);
  }, [filtered]);

  function resetFilters() {
    setPlayerFilter(null); setTeamFilter(null); setBrandFilter(null); setSetFilter(null);
    setYearFilter(null); setTypeFilter(null); setParallelFilter(null);
    setRookieOnly(false); setGradedOnly(false); setVintedOnly(false); setSearch('');
  }

  const noFilter = search === '' && !playerFilter && !teamFilter && !brandFilter && !setFilter && !yearFilter && !typeFilter && !parallelFilter && !rookieOnly && !gradedOnly && !vintedOnly;
  const showShowcase = groupBy === 'none' && noFilter;

  if (loading) return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--bg-primary)]">
      <ShareHeader />
      <div className="flex flex-1 items-center justify-center">
        <Spinner label="Chargement de la collection…" />
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--bg-primary)]">
      <ShareHeader />
      <div className="flex flex-1 items-center justify-center px-4">
        <EmptyState
          icon={Link2Off}
          title="Lien introuvable"
          description="Ce lien de partage n'existe plus ou a expiré. Demande un nouveau lien à la personne qui te l'a envoyé."
        />
      </div>
    </div>
  );

  const selectionCount = interest.size;
  const plural = selectionCount > 1 ? 's' : '';

  return (
    <div className="flex min-h-[100dvh] flex-col overflow-x-clip bg-[var(--bg-primary)]">
      <ShareHeader />

      <main className={`mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 py-5 sm:px-6 sm:py-8 ${selectionCount > 0 ? 'pb-32' : ''}`}>
        {/* En-tête de la vitrine */}
        <section className="space-y-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-2xl">
              {data.title || FILTER_LABELS[data.filter] || 'Ma collection'}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--text-muted)]">
              <span className="tabular">{data.card_count}</span> carte{data.card_count > 1 ? 's' : ''}
              {data.show_prices ? ' · prix indiqués' : ''}
            </p>
          </div>
          {(stats.rookieCount > 0 || stats.autos > 0 || stats.numbered > 0 || stats.graded > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {stats.rookieCount > 0 && <Badge tone="blue"><span className="tabular">{stats.rookieCount}</span> RC</Badge>}
              {stats.autos > 0 && <Badge tone="green"><span className="tabular">{stats.autos}</span> Auto</Badge>}
              {stats.numbered > 0 && <Badge tone="accent"><span className="tabular">{stats.numbered}</span> Tirages</Badge>}
              {stats.graded > 0 && <Badge><span className="tabular">{stats.graded}</span> Gradées</Badge>}
            </div>
          )}
          <p className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)]">
            <Heart size={15} className="mt-0.5 shrink-0 text-[var(--accent)]" />
            <span>Touche le cœur des cartes qui t'intéressent, puis envoie ta sélection : le collectionneur te recontactera.</span>
          </p>
        </section>

        {/* Recherche, regroupement, tri */}
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <input
                  type="text"
                  placeholder="Joueur, équipe, set, année…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="ui-input pl-9 pr-9"
                  aria-label="Rechercher une carte"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    aria-label="Effacer la recherche"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <button onClick={resetFilters} className="ui-btn ui-btn-icon shrink-0" title="Réinitialiser" aria-label="Réinitialiser les filtres">
                <RefreshCw size={15} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <div className="relative">
                <LayoutGrid size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <select
                  className="ui-select pl-8 sm:w-40"
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                  aria-label="Regrouper par"
                >
                  {Object.entries(GROUP_LABELS).map(([v, l]) => <option key={v} value={v}>{v === 'none' ? 'Sans groupe' : l}</option>)}
                </select>
              </div>
              <div className="relative">
                <ArrowUpDown size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
                <select
                  className="ui-select pl-8 sm:w-48"
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortBy)}
                  aria-label="Trier par"
                >
                  {Object.entries(SORT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Filtres */}
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 no-scrollbar sm:-mx-6 sm:flex-wrap sm:px-6">
            <FilterDropdown label="Joueur" items={players} selected={playerFilter} onSelect={setPlayerFilter} />
            <FilterDropdown label="Équipe" items={teams} selected={teamFilter} onSelect={setTeamFilter} />
            <FilterDropdown label="Année" items={years} selected={yearFilter} onSelect={setYearFilter} />
            <FilterDropdown label="Marque" items={brands} selected={brandFilter} onSelect={setBrandFilter} />
            <FilterDropdown label="Set" items={sets} selected={setFilter} onSelect={setSetFilter} />
            <FilterDropdown label="Parallel" items={parallels} selected={parallelFilter} onSelect={setParallelFilter} />
            <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border-strong)]" />
            <button className="ui-chip shrink-0" data-active={rookieOnly} aria-pressed={rookieOnly} onClick={() => setRookieOnly(!rookieOnly)}>RC</button>
            <button className="ui-chip shrink-0" data-active={gradedOnly} aria-pressed={gradedOnly} onClick={() => setGradedOnly(!gradedOnly)}>Gradées</button>
            <button className="ui-chip shrink-0" data-active={vintedOnly} aria-pressed={vintedOnly} onClick={() => setVintedOnly(!vintedOnly)}>Vinted</button>
          </div>

          {!noFilter && (
            <div className="flex items-center gap-3 text-[13px] text-[var(--text-secondary)]">
              <span>
                <span className="tabular font-semibold text-[var(--text-primary)]">{filtered.length}</span> carte{filtered.length !== 1 ? 's' : ''}
              </span>
              <button onClick={resetFilters} className="text-xs font-medium text-[var(--accent)] hover:underline">Tout effacer</button>
            </div>
          )}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={SearchX}
            title="Aucun résultat"
            description="Ajuste les filtres pour explorer plus de cartes."
            action={<button onClick={resetFilters} className="ui-btn">Réinitialiser les filtres</button>}
          />
        ) : (
          <div className="space-y-8">
            {showShowcase && showcaseSections.map((section) => (
              <section key={section.key} className="space-y-3">
                <SectionHeading title={section.title} count={section.cards.length} />
                <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 no-scrollbar sm:-mx-6 sm:gap-4 sm:px-6">
                  {section.cards.map((card) => (
                    <div key={`${section.key}-${card.id}`} className="w-[150px] shrink-0 snap-start sm:w-[180px]">
                      <SharedCard card={card} showPrice={data.show_prices} onClick={() => setSelected(card)} interested={interest.has(card.id)} onToggleInterest={() => toggleInterest(card.id)} />
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {grouped.map((group) => (
              <section key={group.key || 'all'} className="space-y-3">
                {groupBy !== 'none' ? (
                  <SectionHeading title={group.label} count={group.cards.length} />
                ) : showShowcase && showcaseSections.length > 0 ? (
                  <SectionHeading title="Toutes les cartes" count={group.cards.length} />
                ) : null}
                <div className={GRID}>
                  {group.cards.map((card) => (
                    <SharedCard key={card.id} card={card} showPrice={data.show_prices} onClick={() => setSelected(card)} interested={interest.has(card.id)} onToggleInterest={() => toggleInterest(card.id)} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-[var(--border)] px-4 py-6">
        <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
          <LogoMark />
          <span>Collection partagée avec <span className="font-medium text-[var(--text-secondary)]">CardVaults</span></span>
        </div>
      </footer>

      {selected && <CardModal card={selected} showPrice={data.show_prices} onClose={() => setSelected(null)} interested={interest.has(selected.id)} onToggleInterest={() => toggleInterest(selected.id)} />}

      {/* Barre de sélection « Ça m'intéresse » */}
      {selectionCount > 0 && !submitOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-strong)] bg-[var(--bg-card)] px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-[var(--shadow-lg)] sm:inset-x-auto sm:bottom-4 sm:left-1/2 sm:w-[460px] sm:-translate-x-1/2 sm:rounded-xl sm:border sm:pb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent-dim)] text-[var(--accent)]">
              <Heart size={16} fill="currentColor" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                <span className="tabular">{selectionCount}</span> carte{plural} sélectionnée{plural}
              </p>
              {data.show_prices && interestTotal > 0 && (
                <p className="tabular text-xs text-[var(--text-muted)]">Total {formatEuro(interestTotal)}</p>
              )}
            </div>
            <button onClick={() => setSubmitOpen(true)} className="ui-btn ui-btn-primary shrink-0">
              <Send size={15} /> Envoyer
            </button>
          </div>
        </div>
      )}

      {/* Modale d'envoi */}
      {submitOpen && (
        <Modal
          onClose={() => setSubmitOpen(false)}
          size="lg"
          title="Envoyer ma sélection"
          subtitle={`${selectionCount} carte${plural} sélectionnée${plural}${data.show_prices && interestTotal > 0 ? ` · total ${formatEuro(interestTotal)}` : ''}`}
          footer={
            <>
              <button onClick={() => setSubmitOpen(false)} className="ui-btn">Annuler</button>
              <button
                onClick={submitInterest}
                disabled={submitting || !handle.trim() || interest.size === 0}
                className="ui-btn ui-btn-primary"
              >
                <Send size={15} /> {submitting ? 'Envoi…' : 'Envoyer'}
              </button>
            </>
          }
        >
          <div className="space-y-5">
            <div className="space-y-2">
              <p className="text-xs text-[var(--text-muted)]">Touche une carte pour la voir en détail, ou la croix pour la retirer.</p>
              {interestCards.length === 0 ? (
                <p className="rounded-lg border border-dashed border-[var(--border-strong)] px-3 py-6 text-center text-[13px] text-[var(--text-muted)]">
                  Aucune carte sélectionnée.
                </p>
              ) : (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
                  {interestCards.map((c) => (
                    <div key={c.id} className="relative min-w-0">
                      <button
                        onClick={() => setSelected(c)}
                        className="block w-full overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] transition-colors hover:border-[var(--border-strong)]"
                      >
                        <div className="aspect-[3/4]">
                          {c.image_front_url
                            ? <img src={cdnImg(c.image_front_url)} alt="" loading="lazy" className="h-full w-full object-cover" />
                            : <div className="flex h-full items-center justify-center text-[var(--text-muted)]"><ImageOff size={18} /></div>}
                        </div>
                      </button>
                      <button
                        onClick={() => toggleInterest(c.id)}
                        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full dark-scope bg-black/70 text-[var(--text-primary)] ring-1 ring-white/15 transition-colors hover:bg-[var(--red)]"
                        title="Retirer"
                        aria-label="Retirer"
                      >
                        <X size={14} />
                      </button>
                      <div className="mt-1 truncate text-xs font-medium text-[var(--text-primary)]" title={c.player ?? ''}>{c.player ?? '—'}</div>
                      {data.show_prices && c.price != null && (
                        <div className="tabular text-xs font-semibold text-[var(--price)]">{formatEuro(c.price)}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Field label="Pseudo Insta / Discord *" hint="Pour que le collectionneur puisse te recontacter.">
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@ton_pseudo"
                className="ui-input"
              />
            </Field>
            <Field label="Message (optionnel)">
              <textarea
                value={reqMessage}
                onChange={(e) => setReqMessage(e.target.value)}
                rows={3}
                placeholder="Une offre, une question…"
                className="ui-textarea"
              />
            </Field>
          </div>
        </Modal>
      )}

      {/* Récap après envoi (copiable) */}
      {submitted && (
        <Modal
          onClose={() => setSubmitted(false)}
          title="Sélection envoyée, merci !"
          subtitle="Le vendeur va te recontacter. Tu peux aussi copier ta liste et la lui envoyer en message."
          icon={
            <span className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--green)]" style={{ background: 'color-mix(in srgb, var(--green) 14%, transparent)' }}>
              <Check size={18} />
            </span>
          }
          footer={
            <>
              <button onClick={() => setSubmitted(false)} className="ui-btn">Fermer</button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(recapText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* clipboard indispo : le textarea reste sélectionnable */
                  }
                }}
                className="ui-btn ui-btn-primary"
              >
                {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copié !' : 'Copier la liste'}
              </button>
            </>
          }
        >
          <textarea
            readOnly
            value={recapText}
            className="ui-textarea h-64 resize-none text-xs leading-relaxed text-[var(--text-secondary)]"
            onFocus={(e) => e.currentTarget.select()}
          />
        </Modal>
      )}
    </div>
  );
}
