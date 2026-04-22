import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  X,
  Calendar,
  Building,
  Target,
  Globe,
  Settings2,
  ExternalLink,
  LayoutGrid,
  Maximize2,
  Layers,
  Star,
  Hash,
  RefreshCw
} from 'lucide-react';
import type { Card } from '../../types';
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
  '10': '#10b981',
  '9.5': '#10b981',
  '9': '#6366f1',
  '8.5': '#8b5cf6',
  '8': 'var(--accent)',
  '7.5': 'var(--accent)',
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
      case 'player': return (a.player ?? '').localeCompare(b.player ?? '');
      case 'brand': return (a.brand ?? '').localeCompare(b.brand ?? '') || (a.set_name ?? '').localeCompare(b.set_name ?? '');
      case 'set': return (a.set_name ?? '').localeCompare(b.set_name ?? '') || (a.player ?? '').localeCompare(b.player ?? '');
      case 'price_desc': return (b.price ?? -1) - (a.price ?? -1);
      case 'price_asc': return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
      case 'numbered': return parseNumberedValue(a.numbered) - parseNumberedValue(b.numbered);
      case 'rookie_first': return Number(b.is_rookie ?? false) - Number(a.is_rookie ?? false) || (a.player ?? '').localeCompare(b.player ?? '');
      case 'recent':
      default: return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
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
    const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all ${selected
          ? 'bg-[var(--accent)] text-black shadow-lg shadow-[var(--accent-glow)]'
          : 'bg-white/5 border border-white/5 text-white/40 hover:text-white/60'
          }`}
      >
        {selected ?? label}
        <span className="opacity-40">{open ? '▲' : '▼'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            className="absolute top-full left-0 mt-2 z-50 rounded-2xl bg-[#1c1c1f]/95 backdrop-blur-xl border border-white/10 shadow-2xl py-2 min-w-[180px] max-h-64 overflow-y-auto custom-scrollbar"
          >
            {selected && (
              <button
                onClick={() => { onSelect(null); setOpen(false); }}
                className="flex items-center justify-between w-full px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-colors border-b border-white/5 mb-1"
                style={{ color: 'var(--accent)', background: 'var(--accent-dim)' }}
              >
                Effacer ✕
              </button>
            )}
            {items.map((v) => (
              <button
                key={v}
                onClick={() => { onSelect(v); setOpen(false); }}
                className={`w-full px-4 py-2.5 text-xs text-left transition-colors font-medium border-l-2 ${selected === v
                  ? 'bg-white/5 border-[var(--accent)] text-white'
                  : 'border-transparent text-white/60 hover:bg-white/5 hover:text-white'
                  }`}
              >
                {v}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CardModal({ card, showPrice, onClose }: { card: Card; showPrice: boolean; onClose: () => void }) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6" onClick={onClose}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/90 backdrop-blur-xl" />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="panel relative w-full max-w-4xl max-h-[90vh] flex flex-col md:flex-row rounded-[40px] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="md:w-1/2 bg-black/40 flex flex-col p-8 relative">
          <div className="flex-1 flex flex-col items-center justify-center gap-6">
            <div className="relative group perspective">
              {card.image_front_url ? (
                <img
                  src={card.image_front_url}
                  alt=""
                  className="max-h-[350px] w-auto rounded-3xl object-contain shadow-2xl cursor-zoom-in transition-transform duration-700 hover:scale-105"
                  onClick={() => setLightboxUrl(card.image_front_url!)}
                />
              ) : (
                <div className="w-48 h-64 rounded-3xl bg-white/5 border border-white/5 flex flex-col items-center justify-center gap-4 opacity-20">
                  <Globe size={40} />
                  <span className="text-[10px] font-black uppercase tracking-widest">No Image</span>
                </div>
              )}
            </div>
            {card.image_back_url && (
              <button
                onClick={() => setLightboxUrl(card.image_back_url!)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all"
              >
                <Maximize2 size={12} /> Voir le Verso
              </button>
            )}
          </div>

          <div className="flex gap-2 absolute top-6 left-6">
            {card.is_rookie && <RookieBadge compact />}
            {card.numbered && <div className="px-2 py-0.5 rounded-lg bg-[var(--accent-dim)] border border-[var(--border-accent)] text-[var(--accent)] text-[10px] font-black">{card.numbered}</div>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
          <div className="flex items-center justify-between">
            <button onClick={onClose} className="md:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 text-white/40"><X size={20} /></button>
            {showPrice && card.price != null && (
              <div className="px-4 py-2 rounded-2xl bg-[var(--accent-dim)] border border-[var(--border-accent)] text-[var(--accent)] text-lg font-black tracking-tight">
                {card.price}€
              </div>
            )}
          </div>

          <div>
            <h2 className="text-3xl font-black text-white tracking-tight leading-tight mb-2">{card.player || 'Joueur inconnu'}</h2>
            <p className="text-sm font-bold text-[var(--text-muted)] uppercase tracking-wide">
              {card.year} · {card.brand} · {card.set_name}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-6">
            {details.map((d, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center gap-1.5 opacity-20">
                  <d.icon size={10} />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em]">{d.label}</span>
                </div>
                <div className="text-sm font-bold text-white/80">{d.value}</div>
              </div>
            ))}
          </div>

          {card.vinted_url && (
            <a
              href={card.vinted_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-4 rounded-2xl bg-[#00BDD3] hover:bg-[#00BDD3]/90 text-white text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all shadow-xl shadow-[#00BDD3]/20"
            >
              Voir sur Vinted <ExternalLink size={16} />
            </a>
          )}
        </div>

        <button onClick={onClose} className="hidden md:absolute top-8 right-8 w-10 h-10 md:flex items-center justify-center rounded-xl bg-white/5 text-white/40 hover:bg-white/10 transition-all"><X size={20} /></button>
      </motion.div>

      <AnimatePresence>
        {lightboxUrl && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/98 p-8"
            onClick={(e) => { e.stopPropagation(); setLightboxUrl(null); }}
          >
            <motion.img
              initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              src={lightboxUrl} alt="" className="max-h-full max-w-full rounded-2xl object-contain shadow-2xl"
            />
            <button className="absolute top-8 right-8 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 text-white"><X size={24} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SharedCard({ card, showPrice, onClick }: { card: Card; showPrice: boolean; onClick: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative h-full flex flex-col rounded-[2.5rem] bg-white/[0.02] border border-white/5 hover:bg-white/[0.06] hover:border-white/10 transition-all duration-300 cursor-pointer overflow-hidden p-2"
      onClick={onClick}
    >
      <div className="relative aspect-[3/4] rounded-[2rem] overflow-hidden bg-black/20">
        {card.image_front_url ? (
          <img src={card.image_front_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-10"><Globe size={32} /></div>
        )}

        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {card.is_rookie && <RookieBadge compact />}
          {card.numbered && (
            <div className="px-2 py-0.5 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-[9px] font-black text-[var(--accent)]">
              {card.numbered}
            </div>
          )}
          {card.grading_grade && (
            <div
              className="px-2 py-0.5 rounded-lg bg-black text-white text-[9px] font-black"
              style={{ color: GRADE_COLOR[card.grading_grade] }}
            >
              {card.grading_company} {card.grading_grade}
            </div>
          )}
        </div>

        {showPrice && card.price != null && (
          <div className="absolute bottom-3 right-3 px-3 py-1.5 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 text-xs font-black text-white shadow-xl shadow-black/40">
            {card.price}€
          </div>
        )}
      </div>

      <div className="p-4 pt-5 pb-6 text-center">
        <h3 className="text-sm font-black text-white tracking-tight truncate leading-none mb-1.5 group-hover:text-[var(--accent)] transition-colors">{card.player || '—'}</h3>
        <p className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest truncate opacity-60">
          {card.year} · {card.brand}
        </p>
      </div>
    </motion.div>
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
    if (groupBy !== 'none') params.set('group', groupBy);
    if (sortBy !== 'recent') params.set('sort', sortBy);
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [search, playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter, parallelFilter, rookieOnly, gradedOnly, groupBy, sortBy]);

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
      if (search) {
        const q = search.toLowerCase();
        const hay = [c.player, c.team, c.brand, c.set_name, c.insert_name, c.parallel_name, c.year].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return sortCards(result, sortBy);
  }, [cardsList, playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter, parallelFilter, rookieOnly, gradedOnly, search, sortBy]);

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

  const stats = useMemo(() => ({
    autos: cardsList.filter(c => c.card_type === 'auto' || c.card_type === 'auto_patch').length,
    numbered: cardsList.filter(c => c.numbered).length,
    graded: cardsList.filter(c => c.grading_grade).length,
    rookieCount: cardsList.filter(c => c.is_rookie).length,
    forSale: cardsList.filter(c => c.vinted_url).length,
  }), [cardsList]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-[2rem] bg-[var(--accent-dim)] border border-[var(--border-accent)] flex items-center justify-center text-[var(--accent)] animate-pulse">
          <Globe size={32} />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">Initialising Gallery…</p>
      </div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center space-y-6">
        <div className="w-20 h-20 rounded-[32px] bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-500">
          <X size={40} />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-white tracking-tight">Portail Introuvable</h2>
          <p className="text-sm font-medium text-[var(--text-muted)]">Ce lien n'existe plus ou a expiré.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      {/* Background decoration */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[var(--accent-glow)] blur-[120px] opacity-10" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#6366f1] blur-[120px] opacity-10" />
      </div>

      <header className="sticky top-0 z-40 bg-[var(--bg-primary)]/80 backdrop-blur-xl border-b border-white/5 px-6 py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <div className="flex items-center gap-3 mb-6 opacity-40 hover:opacity-100 transition-opacity">
              <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-[var(--accent)] font-black text-xs">N</div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">NBA Card Studio</span>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight mb-3">
              {data.title || FILTER_LABELS[data.filter] || 'Ma collection'}
            </h1>
            <div className="flex flex-wrap gap-2">
              <div className="px-3 py-1 rounded-xl bg-white/5 border border-white/5 text-[10px] font-black uppercase tracking-widest text-white/40">
                {data.card_count} Cartes
              </div>
              {stats.rookieCount > 0 && <span className="px-3 py-1 rounded-xl bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-widest border border-blue-500/20">{stats.rookieCount} RC</span>}
              {stats.autos > 0 && <span className="px-3 py-1 rounded-xl bg-green-500/10 text-green-400 text-[10px] font-black uppercase tracking-widest border border-green-500/20">{stats.autos} Auto</span>}
              {stats.numbered > 0 && <span className="px-3 py-1 rounded-xl bg-[var(--accent-dim)] text-[var(--accent)] text-[10px] font-black uppercase tracking-widest border border-[var(--border-accent)]">{stats.numbered} Tirages</span>}
              {stats.graded > 0 && <span className="px-3 py-1 rounded-xl bg-indigo-500/10 text-indigo-400 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">{stats.graded} Gradées</span>}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" />
              <input
                type="text"
                placeholder="Rechercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="rounded-2xl pl-10 pr-4 py-3 text-xs font-bold outline-none w-full sm:w-48 bg-white/5 border border-white/10 focus:bg-white/10 focus:border-[var(--accent)]/30 transition-all placeholder:text-white/20 text-white"
              />
            </div>
            <button
              onClick={() => {
                setPlayerFilter(null); setTeamFilter(null); setBrandFilter(null); setSetFilter(null);
                setYearFilter(null); setTypeFilter(null); setParallelFilter(null);
                setRookieOnly(false); setGradedOnly(false); setSearch('');
              }}
              className="w-12 h-12 flex items-center justify-center rounded-2xl bg-white/5 border border-white/5 text-white/40 hover:text-[var(--accent)] transition-all active:scale-90"
              title="Réinitialiser"
            >
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-10">
        <div className="flex flex-wrap items-center gap-2 mb-12 relative z-30">
          <FilterDropdown label="Joueur" items={players} selected={playerFilter} onSelect={setPlayerFilter} />
          <FilterDropdown label="Équipe" items={teams} selected={teamFilter} onSelect={setTeamFilter} />
          <FilterDropdown label="Année" items={years} selected={yearFilter} onSelect={setYearFilter} />
          <FilterDropdown label="Marque" items={brands} selected={brandFilter} onSelect={setBrandFilter} />
          <FilterDropdown label="Set" items={sets} selected={setFilter} onSelect={setSetFilter} />
          <FilterDropdown label="Parallel" items={parallels} selected={parallelFilter} onSelect={setParallelFilter} />

          <div className="h-4 w-px bg-white/10 mx-2 hidden sm:block" />

          <button
            onClick={() => setRookieOnly(!rookieOnly)}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${rookieOnly ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-white/5 border border-white/5 text-white/40'
              }`}
          >
            RC
          </button>
          <button
            onClick={() => setGradedOnly(!gradedOnly)}
            className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${gradedOnly ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30' : 'bg-white/5 border border-white/5 text-white/40'
              }`}
          >
            Gradées
          </button>

          <div className="ml-auto flex items-center gap-2 bg-white/5 border border-white/5 p-1 rounded-2xl">
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl transition-colors hover:bg-white/5">
              <LayoutGrid size={12} className="text-white/20" />
              <select
                className="bg-transparent text-[10px] font-black uppercase tracking-[0.2em] text-white/40 outline-none cursor-pointer hover:text-white appearance-none"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
              >
                {Object.entries(GROUP_LABELS).map(([v, l]) => <option key={v} value={v} className="bg-[#18181b]">{l.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl transition-colors hover:bg-white/5">
              <Settings2 size={12} className="text-white/20" />
              <select
                className="bg-transparent text-[10px] font-black uppercase tracking-[0.2em] text-white/40 outline-none cursor-pointer hover:text-white appearance-none"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
              >
                {Object.entries(SORT_LABELS).map(([v, l]) => <option key={v} value={v} className="bg-[#18181b]">{l.toUpperCase()}</option>)}
              </select>
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-[2rem] bg-white/5 border border-white/5 flex items-center justify-center text-white/10 mb-6 font-black italic">!</div>
            <h3 className="text-xl font-black text-white/40 uppercase tracking-widest">Aucun résultat</h3>
            <p className="text-sm text-white/20 mt-2">Ajustez les filtres pour explorer plus de cartes.</p>
          </div>
        ) : (
          <div className="space-y-16">
            {grouped.map((group) => (
              <div key={group.key || 'all'}>
                {groupBy !== 'none' && (
                  <div className="flex items-center gap-4 mb-8">
                    <h3 className="text-lg font-black text-white tracking-tight">{group.label}</h3>
                    <div className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/5 text-[10px] font-black text-white/20">
                      {group.cards.length}
                    </div>
                    <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-6 sm:gap-8">
                  {group.cards.map((card) => (
                    <SharedCard key={card.id} card={card} showPrice={data.show_prices} onClick={() => setSelected(card)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-white/5 py-12 px-6">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2 opacity-30">
            <Globe size={14} />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">Public Showcase</span>
          </div>
          <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
            Powered by <span className="text-white/40">NBA Card Studio</span> v2.0
          </p>
        </div>
      </footer>

      <AnimatePresence>
        {selected && <CardModal card={selected} showPrice={data.show_prices} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}

