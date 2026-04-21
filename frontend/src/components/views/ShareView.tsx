import { useEffect, useMemo, useRef, useState } from 'react';
import type { Card } from '../../types';
import { CardBadge } from '../shared/CardBadge';
import { GradingBadge } from '../shared/GradingBadge';
import { RookieBadge } from '../shared/RookieBadge';

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
const GRADE_COLOR: Record<string, string> = {
  '10': 'rgb(16,185,129)',
  '9.5': 'rgb(16,185,129)',
  '9': '#6366f1',
  '8.5': '#8b5cf6',
  '8': '#F5AF23',
  '7.5': '#F5AF23',
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
  numbered: 'Numérotation la plus basse',
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
    case 'year':
      return card.year ?? 'Année inconnue';
    case 'player':
      return card.player ?? 'Joueur inconnu';
    case 'team':
      return card.team ?? 'Équipe inconnue';
    case 'brand':
      return card.brand ?? 'Marque inconnue';
    case 'set':
      return card.set_name ?? 'Set inconnu';
    case 'type':
      return TYPE_LABELS[card.card_type ?? ''] ?? (card.card_type ?? 'Sans type');
    case 'rookie':
      return card.is_rookie ? 'RC' : 'Non RC';
    case 'graded':
      return card.grading_company ? 'Gradées' : 'Non gradées';
    default:
      return '';
  }
}

function sortCards(list: Card[], sortBy: SortBy): Card[] {
  return [...list].sort((a, b) => {
    switch (sortBy) {
      case 'year_desc':
        return parseSeasonStart(b.year) - parseSeasonStart(a.year);
      case 'year_asc':
        return parseSeasonStart(a.year) - parseSeasonStart(b.year);
      case 'player':
        return (a.player ?? '').localeCompare(b.player ?? '');
      case 'brand':
        return (a.brand ?? '').localeCompare(b.brand ?? '') || (a.set_name ?? '').localeCompare(b.set_name ?? '');
      case 'set':
        return (a.set_name ?? '').localeCompare(b.set_name ?? '') || (a.player ?? '').localeCompare(b.player ?? '');
      case 'price_desc':
        return (b.price ?? -1) - (a.price ?? -1);
      case 'price_asc':
        return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
      case 'numbered':
        return parseNumberedValue(a.numbered) - parseNumberedValue(b.numbered);
      case 'rookie_first':
        return Number(b.is_rookie ?? false) - Number(a.is_rookie ?? false) || (a.player ?? '').localeCompare(b.player ?? '');
      case 'recent':
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap"
        style={selected
          ? { background: '#F5AF23', color: '#0E0E11' }
          : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
      >
        {selected ?? label}
        <span style={{ opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 z-30 rounded-2xl overflow-hidden py-1 min-w-[180px] max-h-64 overflow-y-auto"
          style={{ background: '#1c1c1f', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
        >
          {selected && (
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className="flex items-center justify-between w-full px-3 py-2 text-xs"
              style={{ color: '#F5AF23' }}
            >
              <span>Effacer</span>
              <span>✕</span>
            </button>
          )}
          {items.map((v) => (
            <button
              key={v}
              onClick={() => { onSelect(v); setOpen(false); }}
              className="w-full px-3 py-2 text-sm text-left transition-colors"
              style={{ background: selected === v ? 'rgba(245,166,35,0.1)' : 'transparent', color: selected === v ? '#F5AF23' : 'rgba(255,255,255,0.8)' }}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function OptionDropdown<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const selectedLabel = options.find((o) => o.value === selected)?.label ?? label;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap"
        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
      >
        <span style={{ color: 'rgba(255,255,255,0.45)' }}>{label}:</span>
        <span>{selectedLabel}</span>
        <span style={{ opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 z-30 rounded-2xl overflow-hidden py-1 min-w-[220px] max-h-72 overflow-y-auto"
          style={{ background: '#1c1c1f', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
        >
          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => { onSelect(option.value); setOpen(false); }}
              className="w-full px-3 py-2 text-sm text-left transition-colors"
              style={{ background: selected === option.value ? 'rgba(245,166,35,0.1)' : 'transparent', color: selected === option.value ? '#F5AF23' : 'rgba(255,255,255,0.8)' }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CardModal({ card, showPrice, onClose }: { card: Card; showPrice: boolean; onClose: () => void }) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const details = [
    ['Joueur', card.player],
    ['Équipe', card.team],
    ['Année', card.year],
    ['Marque', card.brand],
    ['Set', card.set_name],
    ['Insert', card.insert_name],
    ['Parallel', card.parallel_name && card.parallel_name !== 'Base' ? card.parallel_name : null],
    ['RC', card.is_rookie ? 'Oui' : null],
    ['N° carte', card.card_number],
    ['Tirage', card.numbered],
    ['État', card.condition_notes || null],
    ...(card.grading_grade ? [['Grading', `${card.grading_company ?? ''} ${card.grading_grade}`.trim()]] : []),
    ...(showPrice && card.price != null ? [['Prix', `${card.price} €`]] : []),
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative flex-shrink-0" style={{ background: '#0E0E11' }}>
          <div className="flex items-center justify-center gap-4 py-6 px-6" style={{ minHeight: '240px' }}>
            {card.image_front_url ? (
              <img
                src={card.image_front_url}
                alt="Face"
                className="max-h-52 w-auto rounded-xl object-contain shadow-2xl cursor-zoom-in hover:scale-105 transition-transform"
                style={{ boxShadow: '0 0 40px rgba(0,0,0,0.8)' }}
                onClick={(e) => { e.stopPropagation(); setLightboxUrl(card.image_front_url!); }}
              />
            ) : (
              <div className="h-52 w-36 rounded-xl flex items-center justify-center text-4xl opacity-10">🃏</div>
            )}
            {card.image_back_url && (
              <img
                src={card.image_back_url}
                alt="Dos"
                className="max-h-52 w-auto rounded-xl object-contain shadow-2xl cursor-zoom-in hover:scale-105 transition-transform opacity-75 hover:opacity-100"
                style={{ boxShadow: '0 0 40px rgba(0,0,0,0.8)' }}
                onClick={(e) => { e.stopPropagation(); setLightboxUrl(card.image_back_url!); }}
              />
            )}
          </div>

          <div className="absolute top-3 left-3 flex flex-col gap-1">
            {card.is_rookie && <RookieBadge compact />}
            {(card.card_type === 'auto' || card.card_type === 'auto_patch') && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.9)', color: '#fff' }}>AUTO</span>
            )}
            {(card.card_type === 'patch' || card.card_type === 'auto_patch') && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.9)', color: '#fff' }}>PATCH</span>
            )}
            {card.numbered && (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,166,35,0.9)', color: '#000' }}>{card.numbered}</span>
            )}
          </div>

          {card.grading_grade && (
            <div className="absolute top-3 right-10 text-center">
              <div className="text-2xl font-black leading-none" style={{ color: GRADE_COLOR[card.grading_grade] ?? 'rgba(255,255,255,0.7)' }}>
                {card.grading_grade}
              </div>
              <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{card.grading_company ?? 'GRADE'}</div>
            </div>
          )}

          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-sm"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}
          >
            ✕
          </button>
        </div>

        {lightboxUrl && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95" onClick={() => setLightboxUrl(null)}>
            <img
              src={lightboxUrl}
              alt=""
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain"
              style={{ boxShadow: '0 0 80px rgba(0,0,0,0.9)' }}
            />
            <button
              className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-sm"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
              onClick={() => setLightboxUrl(null)}
            >
              ✕
            </button>
          </div>
        )}

        <div className="overflow-y-auto flex-1 p-5">
          <div className="mb-4">
            <h2 className="text-xl font-black text-white leading-tight">{card.player ?? '—'}</h2>
            {card.team && <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{card.team}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            <CardBadge type={card.card_type} />
            {card.is_rookie && <RookieBadge compact />}
            {card.grading_company && <GradingBadge card={card} />}
            {card.numbered && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'rgba(245,166,35,0.12)', color: '#F5AF23', border: '1px solid rgba(245,166,35,0.2)' }}>
                {card.numbered}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm mb-5">
            {details.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{label}</dt>
                <dd className="font-medium text-white">{value}</dd>
              </div>
            ))}
          </div>
          {card.vinted_url && (
            <a
              href={card.vinted_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90"
              style={{ background: 'rgb(9,182,109)', color: '#fff' }}
            >
              Acheter sur Vinted ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function SharedCard({ card, showPrice, onClick }: { card: Card; showPrice: boolean; onClick: () => void }) {
  return (
    <div
      className="group rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/60"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      onClick={onClick}
    >
      <div className="relative aspect-[3/4] overflow-hidden" style={{ background: 'rgba(0,0,0,0.3)' }}>
        {card.image_front_url ? (
          <img src={card.image_front_url} alt={card.player ?? ''} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-20">🃏</div>
        )}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {card.is_rookie && <RookieBadge compact />}
          {card.grading_company && <GradingBadge card={card} compact />}
          {(card.card_type === 'auto' || card.card_type === 'auto_patch') && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: 'rgba(16,185,129,0.9)', color: '#fff' }}>AUTO</span>
          )}
          {(card.card_type === 'patch' || card.card_type === 'auto_patch') && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.9)', color: '#fff' }}>PATCH</span>
          )}
          {card.numbered && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: 'rgba(245,166,35,0.9)', color: '#000' }}>{card.numbered}</span>
          )}
          {card.grading_grade && (
            <span className="text-[9px] font-black px-1.5 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.9)', color: '#fff' }}>
              {card.grading_company ?? 'PSA'} {card.grading_grade}
            </span>
          )}
        </div>
        {showPrice && card.price != null && (
          <div className="absolute top-2 right-2">
            <span className="text-[10px] font-black px-2 py-1 rounded-lg" style={{ background: 'rgba(0,0,0,0.75)', color: '#fff', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.15)' }}>
              {card.price} €
            </span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="font-bold text-sm truncate text-white">{card.player ?? '—'}</p>
        <p className="text-xs truncate mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {[card.year, card.brand, card.set_name].filter(Boolean).join(' · ')}
        </p>
        {(card.insert_name || (card.parallel_name && card.parallel_name !== 'Base')) && (
          <p className="text-xs truncate mt-0.5" style={{ color: '#F5AF23' }}>
            {card.insert_name || card.parallel_name}
          </p>
        )}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          {card.is_rookie && <RookieBadge compact />}
          <CardBadge type={card.card_type} />
          {card.grading_company && <GradingBadge card={card} compact />}
        </div>
        {card.vinted_url && (
          <div className="mt-2 w-full py-1 rounded-lg text-[10px] font-semibold text-center" style={{ background: 'rgba(9,182,109,0.12)', color: 'rgb(9,182,109)', border: '1px solid rgba(9,182,109,0.2)' }}>
            Disponible sur Vinted
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [groupBy, setGroupBy] = useState<GroupBy>((initialSearch.get('group') as GroupBy) || 'none');
  const [sortBy, setSortBy] = useState<SortBy>((initialSearch.get('sort') as SortBy) || 'recent');

  useEffect(() => {
    fetch(`${API_BASE}/api/share/${token}/view`)
      .then((r) => {
        if (!r.ok) throw new Error('Lien introuvable ou expiré');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const cards = useMemo(() => data?.cards ?? [], [data]);

  const players = useMemo(() => [...new Set(cards.map((c) => c.player).filter(Boolean) as string[])].sort(), [cards]);
  const teams = useMemo(() => [...new Set(cards.map((c) => c.team).filter(Boolean) as string[])].sort(), [cards]);
  const brands = useMemo(() => [...new Set(cards.map((c) => c.brand).filter(Boolean) as string[])].sort(), [cards]);
  const sets = useMemo(() => [...new Set(cards.map((c) => c.set_name).filter(Boolean) as string[])].sort(), [cards]);
  const years = useMemo(() => [...new Set(cards.map((c) => c.year).filter(Boolean) as string[])].sort((a, b) => parseSeasonStart(b) - parseSeasonStart(a)), [cards]);
  const parallels = useMemo(() => [...new Set(cards.map((c) => c.parallel_name).filter((v): v is string => !!v && v !== 'Base'))].sort(), [cards]);
  const types = useMemo(() => [...new Set(cards.map((c) => c.card_type).filter(Boolean) as string[])], [cards]);

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
    if (groupBy !== 'none') params.set('group', groupBy);
    if (sortBy !== 'recent') params.set('sort', sortBy);
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}`;
    window.history.replaceState({}, '', nextUrl);
  }, [search, playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter, parallelFilter, rookieOnly, gradedOnly, groupBy, sortBy]);

  const activeCount = [playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter, parallelFilter, rookieOnly ? 'rookie' : null, gradedOnly ? 'graded' : null].filter(Boolean).length;

  const filtered = useMemo(() => {
    const result = cards.filter((c) => {
      if (playerFilter && c.player !== playerFilter) return false;
      if (teamFilter && c.team !== teamFilter) return false;
      if (brandFilter && c.brand !== brandFilter) return false;
      if (setFilter && c.set_name !== setFilter) return false;
      if (yearFilter && c.year !== yearFilter) return false;
      if (typeFilter && c.card_type !== typeFilter) return false;
      if (parallelFilter && c.parallel_name !== parallelFilter) return false;
      if (rookieOnly && !c.is_rookie) return false;
      if (gradedOnly && !c.grading_company) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [c.player, c.team, c.brand, c.set_name, c.insert_name, c.parallel_name, c.year]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortCards(result, sortBy);
  }, [cards, playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter, parallelFilter, rookieOnly, gradedOnly, search, sortBy]);

  const grouped = useMemo(() => {
    if (groupBy === 'none') return [{ key: '', label: '', cards: filtered }];
    const map = new Map<string, Card[]>();
    filtered.forEach((card) => {
      const key = buildGroupKey(card, groupBy);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(card);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, groupCards]) => ({ key: label, label, cards: groupCards }));
  }, [filtered, groupBy]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0E0E11' }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black mx-auto mb-4" style={{ background: 'linear-gradient(135deg, #F5AF23 0%, #E8920A 100%)', color: '#0E0E11' }}>N</div>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Chargement…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0E0E11' }}>
        <div className="text-center space-y-3">
          <p className="text-5xl">🔗</p>
          <p className="text-white font-semibold">Lien introuvable</p>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Ce lien n'existe pas ou a été supprimé.</p>
        </div>
      </div>
    );
  }

  const autos = cards.filter((c) => c.card_type === 'auto' || c.card_type === 'auto_patch').length;
  const numbered = cards.filter((c) => c.numbered).length;
  const graded = cards.filter((c) => c.grading_grade).length;
  const rookieCount = cards.filter((c) => c.is_rookie).length;
  const forSale = cards.filter((c) => c.vinted_url).length;

  return (
    <div className="min-h-screen" style={{ background: '#0E0E11' }}>
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-20 blur-3xl" style={{ background: 'radial-gradient(ellipse, #F5AF23 0%, transparent 70%)' }} />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 pt-12 pb-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0" style={{ background: 'linear-gradient(135deg, #F5AF23 0%, #E8920A 100%)', color: '#0E0E11', boxShadow: '0 0 24px rgba(245,175,35,0.4)' }}>N</div>
            <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>NBA Card Studio</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3 leading-tight">
            {data.title || FILTER_LABELS[data.filter] || 'Ma collection'}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{data.card_count} carte{data.card_count !== 1 ? 's' : ''}</span>
            {rookieCount > 0 && <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: '1px solid rgba(96,165,250,0.2)' }}>{rookieCount} RC</span>}
            {autos > 0 && <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(16,185,129,0.12)', color: 'rgb(16,185,129)', border: '1px solid rgba(16,185,129,0.2)' }}>{autos} auto{autos > 1 ? 's' : ''}</span>}
            {numbered > 0 && <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(245,166,35,0.12)', color: '#F5AF23', border: '1px solid rgba(245,166,35,0.2)' }}>{numbered} numérotée{numbered > 1 ? 's' : ''}</span>}
            {graded > 0 && <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }}>{graded} gradée{graded > 1 ? 's' : ''}</span>}
            {forSale > 0 && <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(9,182,109,0.12)', color: 'rgb(9,182,109)', border: '1px solid rgba(9,182,109,0.2)' }}>{forSale} sur Vinted</span>}
          </div>
        </div>
      </div>

      <div className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <input
            type="text"
            placeholder="Rechercher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl pl-7 pr-3 py-1.5 text-xs outline-none w-36"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}
          />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>🔍</span>
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>✕</button>}
        </div>

        <FilterDropdown label="Joueur" items={players} selected={playerFilter} onSelect={setPlayerFilter} />
        <FilterDropdown label="Équipe" items={teams} selected={teamFilter} onSelect={setTeamFilter} />
        <FilterDropdown label="Année" items={years} selected={yearFilter} onSelect={setYearFilter} />
        <FilterDropdown label="Marque" items={brands} selected={brandFilter} onSelect={setBrandFilter} />
        <FilterDropdown label="Set" items={sets} selected={setFilter} onSelect={setSetFilter} />
        <FilterDropdown label="Parallel" items={parallels} selected={parallelFilter} onSelect={setParallelFilter} />
        <FilterDropdown
          label="Type"
          items={types.map((t) => TYPE_LABELS[t] ?? t)}
          selected={typeFilter ? (TYPE_LABELS[typeFilter] ?? typeFilter) : null}
          onSelect={(v) => setTypeFilter(v ? (Object.entries(TYPE_LABELS).find(([, l]) => l === v)?.[0] ?? v) : null)}
        />

        <button
          onClick={() => setRookieOnly((v) => !v)}
          className="px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
          style={rookieOnly
            ? { background: 'rgba(59,130,246,0.18)', color: '#93c5fd', border: '1px solid rgba(96,165,250,0.28)' }
            : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
        >
          RC
        </button>
        <button
          onClick={() => setGradedOnly((v) => !v)}
          className="px-2.5 py-1.5 rounded-xl text-xs font-semibold transition-all"
          style={gradedOnly
            ? { background: 'rgba(99,102,241,0.18)', color: '#a5b4fc', border: '1px solid rgba(129,140,248,0.28)' }
            : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
        >
          Gradées
        </button>

        {activeCount > 0 && (
          <button
            onClick={() => {
              setPlayerFilter(null);
              setTeamFilter(null);
              setBrandFilter(null);
              setSetFilter(null);
              setYearFilter(null);
              setTypeFilter(null);
              setParallelFilter(null);
              setRookieOnly(false);
              setGradedOnly(false);
              setSearch('');
            }}
            className="px-2.5 py-1.5 rounded-xl text-xs font-medium"
            style={{ color: '#F5AF23', border: '1px solid rgba(245,166,35,0.2)' }}
          >
            ✕ Effacer ({activeCount})
          </button>
        )}

        <div className="hidden lg:block w-px h-7 mx-1" style={{ background: 'rgba(255,255,255,0.08)' }} />

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.35)' }}>
            Organisation
          </span>
          <OptionDropdown
            label="Grouper"
            options={Object.entries(GROUP_LABELS).map(([value, label]) => ({ value: value as GroupBy, label }))}
            selected={groupBy}
            onSelect={setGroupBy}
          />
          <OptionDropdown
            label="Trier"
            options={Object.entries(SORT_LABELS).map(([value, label]) => ({ value: value as SortBy, label }))}
            selected={sortBy}
            onSelect={setSortBy}
          />
        </div>

        <span className="ml-auto text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {filtered.length} carte{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-8">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <span className="text-4xl opacity-20">🃏</span>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Aucune carte ne correspond.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {grouped.map((group) => (
              <div key={group.key || 'all'}>
                {groupBy !== 'none' && (
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-sm font-semibold text-white">{group.label}</h3>
                    <span className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {group.cards.length} carte{group.cards.length !== 1 ? 's' : ''}
                    </span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {group.cards.map((card) => (
                    <SharedCard key={card.id} card={card} showPrice={data.show_prices} onClick={() => setSelected(card)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t mt-8 py-6 text-center" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <p className="text-xs" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Partagé via <span style={{ color: 'rgba(255,255,255,0.4)' }}>NBA Card Studio</span>
        </p>
      </div>

      {selected && <CardModal card={selected} showPrice={data.show_prices} onClose={() => setSelected(null)} />}
    </div>
  );
}
