import { useEffect, useState, useMemo, useRef } from 'react';
import type { Card } from '../../types';
import { CardBadge } from '../shared/CardBadge';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

interface ShareData {
  title: string | null;
  filter: string;
  show_prices: boolean;
  card_count: number;
  cards: Card[];
}

const TYPE_ORDER = ['auto_patch', 'auto', 'patch', 'numbered', 'parallel', 'insert', 'base'];
const TYPE_LABELS: Record<string, string> = {
  base: 'Base', insert: 'Insert', parallel: 'Parallel', numbered: 'Numbered',
  auto: 'Auto', patch: 'Patch', auto_patch: 'Auto/Patch',
};
const FILTER_LABELS: Record<string, string> = {
  all: 'Collection complète', collection: 'Collection', a_vendre: 'À vendre',
};
const GRADE_COLOR: Record<string, string> = {
  '10': 'rgb(16,185,129)', '9.5': 'rgb(16,185,129)', '9': '#6366f1',
  '8.5': '#8b5cf6', '8': '#F5AF23', '7.5': '#F5AF23',
};

// ── FilterDropdown ────────────────────────────────────────────────────────────

function FilterDropdown({ label, items, selected, onSelect }: {
  label: string; items: string[]; selected: string | null; onSelect: (v: string | null) => void;
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
        <div className="absolute top-full left-0 mt-1.5 z-30 rounded-2xl overflow-hidden py-1 min-w-[180px] max-h-64 overflow-y-auto"
          style={{ background: '#1c1c1f', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}>
          {selected && (
            <button onClick={() => { onSelect(null); setOpen(false); }}
              className="flex items-center justify-between w-full px-3 py-2 text-xs"
              style={{ color: '#F5AF23' }}>
              <span>Effacer</span><span>✕</span>
            </button>
          )}
          {items.map((v) => (
            <button key={v} onClick={() => { onSelect(v); setOpen(false); }}
              className="w-full px-3 py-2 text-sm text-left transition-colors"
              style={{ background: selected === v ? 'rgba(245,166,35,0.1)' : 'transparent', color: selected === v ? '#F5AF23' : 'rgba(255,255,255,0.8)' }}>
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CardModal ─────────────────────────────────────────────────────────────────

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
    ['N° carte', card.card_number],
    ['Tirage', card.numbered],
    ['État', card.condition_notes || null],
    ...(card.grading_grade ? [['Grading', `${card.grading_company ?? ''} ${card.grading_grade}`.trim()]] : []),
    ...(showPrice && card.price != null ? [['Prix', `${card.price} €`]] : []),
  ].filter(([, v]) => v) as [string, string][];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}>
      <div className="rounded-t-3xl sm:rounded-3xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        style={{ background: '#18181b', border: '1px solid rgba(255,255,255,0.1)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Images */}
        <div className="relative flex-shrink-0" style={{ background: '#0E0E11' }}>
          <div className="flex items-center justify-center gap-4 py-6 px-6" style={{ minHeight: '240px' }}>
            {card.image_front_url ? (
              <img src={card.image_front_url} alt="Face"
                className="max-h-52 w-auto rounded-xl object-contain shadow-2xl cursor-zoom-in hover:scale-105 transition-transform"
                style={{ boxShadow: '0 0 40px rgba(0,0,0,0.8)' }}
                onClick={(e) => { e.stopPropagation(); setLightboxUrl(card.image_front_url!); }} />
            ) : (
              <div className="h-52 w-36 rounded-xl flex items-center justify-center text-4xl opacity-10">🃏</div>
            )}
            {card.image_back_url && (
              <img src={card.image_back_url} alt="Dos"
                className="max-h-52 w-auto rounded-xl object-contain shadow-2xl cursor-zoom-in hover:scale-105 transition-transform opacity-75 hover:opacity-100"
                style={{ boxShadow: '0 0 40px rgba(0,0,0,0.8)' }}
                onClick={(e) => { e.stopPropagation(); setLightboxUrl(card.image_back_url!); }} />
            )}
          </div>

          {/* Badges */}
          <div className="absolute top-3 left-3 flex flex-col gap-1">
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

          <button onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full text-sm"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)' }}>✕</button>
        </div>

        {/* Lightbox */}
        {lightboxUrl && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95"
            onClick={() => setLightboxUrl(null)}>
            <img src={lightboxUrl} alt=""
              className="max-h-[90vh] max-w-[90vw] rounded-2xl object-contain"
              style={{ boxShadow: '0 0 80px rgba(0,0,0,0.9)' }} />
            <button className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full text-sm"
              style={{ background: 'rgba(255,255,255,0.1)', color: '#fff' }}
              onClick={() => setLightboxUrl(null)}>✕</button>
          </div>
        )}

        {/* Info */}
        <div className="overflow-y-auto flex-1 p-5">
          <div className="mb-4">
            <h2 className="text-xl font-black text-white leading-tight">{card.player ?? '—'}</h2>
            {card.team && <p className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.45)' }}>{card.team}</p>}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-4">
            <CardBadge type={card.card_type} />
            {card.numbered && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                style={{ background: 'rgba(245,166,35,0.12)', color: '#F5AF23', border: '1px solid rgba(245,166,35,0.2)' }}>
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
            <a href={card.vinted_url} target="_blank" rel="noopener noreferrer"
              className="w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all hover:opacity-90"
              style={{ background: 'rgb(9,182,109)', color: '#fff' }}>
              Acheter sur Vinted ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SharedCard ────────────────────────────────────────────────────────────────

function SharedCard({ card, showPrice, onClick }: { card: Card; showPrice: boolean; onClick: () => void }) {
  return (
    <div className="group rounded-2xl overflow-hidden cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl hover:shadow-black/60"
      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
      onClick={onClick}>
      <div className="relative aspect-[3/4] overflow-hidden" style={{ background: 'rgba(0,0,0,0.3)' }}>
        {card.image_front_url ? (
          <img src={card.image_front_url} alt={card.player ?? ''}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl opacity-20">🃏</div>
        )}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
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
            <span className="text-[10px] font-black px-2 py-1 rounded-lg"
              style={{ background: 'rgba(0,0,0,0.75)', color: '#fff', backdropFilter: 'blur(4px)', border: '1px solid rgba(255,255,255,0.15)' }}>
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
        <div className="mt-2"><CardBadge type={card.card_type} /></div>
        {card.vinted_url && (
          <div className="mt-2 w-full py-1 rounded-lg text-[10px] font-semibold text-center"
            style={{ background: 'rgba(9,182,109,0.12)', color: 'rgb(9,182,109)', border: '1px solid rgba(9,182,109,0.2)' }}>
            Disponible sur Vinted
          </div>
        )}
      </div>
    </div>
  );
}

// ── ShareView ─────────────────────────────────────────────────────────────────

export function ShareView({ token }: { token: string }) {
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Card | null>(null);
  const [search, setSearch] = useState('');
  const [playerFilter, setPlayerFilter] = useState<string | null>(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [setFilter, setSetFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

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

  // Tous les useMemo AVANT les returns conditionnels
  const cards = useMemo(() => data?.cards ?? [], [data]);
  const players = useMemo(() => [...new Set(cards.map((c) => c.player).filter(Boolean) as string[])].sort(), [cards]);
  const teams = useMemo(() => [...new Set(cards.map((c) => c.team).filter(Boolean) as string[])].sort(), [cards]);
  const sets = useMemo(() => [...new Set(cards.map((c) => c.set_name).filter(Boolean) as string[])].sort(), [cards]);
  const types = useMemo(() => [...new Set(cards.map((c) => c.card_type).filter(Boolean) as string[])], [cards]);
  const activeCount = [playerFilter, teamFilter, setFilter, typeFilter].filter(Boolean).length;
  const filtered = useMemo(() => {
    return cards
      .filter((c) => {
        if (playerFilter && c.player !== playerFilter) return false;
        if (teamFilter && c.team !== teamFilter) return false;
        if (setFilter && c.set_name !== setFilter) return false;
        if (typeFilter && c.card_type !== typeFilter) return false;
        if (search) {
          const q = search.toLowerCase();
          const hay = [c.player, c.team, c.brand, c.set_name, c.insert_name, c.parallel_name, c.year]
            .filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => TYPE_ORDER.indexOf(a.card_type ?? 'base') - TYPE_ORDER.indexOf(b.card_type ?? 'base'));
  }, [cards, playerFilter, teamFilter, setFilter, typeFilter, search]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0E0E11' }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-lg font-black mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, #F5AF23 0%, #E8920A 100%)', color: '#0E0E11' }}>N</div>
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
  const forSale = cards.filter((c) => c.vinted_url).length;

  return (
    <div className="min-h-screen" style={{ background: '#0E0E11' }}>
      {/* Hero header */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] rounded-full opacity-20 blur-3xl"
            style={{ background: 'radial-gradient(ellipse, #F5AF23 0%, transparent 70%)' }} />
        </div>
        <div className="relative max-w-6xl mx-auto px-6 pt-12 pb-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
              style={{ background: 'linear-gradient(135deg, #F5AF23 0%, #E8920A 100%)', color: '#0E0E11', boxShadow: '0 0 24px rgba(245,175,35,0.4)' }}>N</div>
            <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.5)' }}>NBA Card Studio</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3 leading-tight">
            {data.title || FILTER_LABELS[data.filter] || 'Ma collection'}
          </h1>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>{data.card_count} carte{data.card_count !== 1 ? 's' : ''}</span>
            {autos > 0 && <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(16,185,129,0.12)', color: 'rgb(16,185,129)', border: '1px solid rgba(16,185,129,0.2)' }}>{autos} auto{autos > 1 ? 's' : ''}</span>}
            {numbered > 0 && <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(245,166,35,0.12)', color: '#F5AF23', border: '1px solid rgba(245,166,35,0.2)' }}>{numbered} numérotée{numbered > 1 ? 's' : ''}</span>}
            {graded > 0 && <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }}>{graded} gradée{graded > 1 ? 's' : ''}</span>}
            {forSale > 0 && <span className="text-xs font-bold px-2 py-1 rounded-lg" style={{ background: 'rgba(9,182,109,0.12)', color: 'rgb(9,182,109)', border: '1px solid rgba(9,182,109,0.2)' }}>{forSale} sur Vinted</span>}
          </div>
        </div>
      </div>

      <div className="border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }} />

      {/* Filters */}
      <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <input type="text" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl pl-7 pr-3 py-1.5 text-xs outline-none w-36"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }} />
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>🔍</span>
          {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>✕</button>}
        </div>
        <FilterDropdown label="Joueur" items={players} selected={playerFilter} onSelect={setPlayerFilter} />
        <FilterDropdown label="Équipe" items={teams} selected={teamFilter} onSelect={setTeamFilter} />
        <FilterDropdown label="Set" items={sets} selected={setFilter} onSelect={setSetFilter} />
        <FilterDropdown
          label="Type"
          items={types.map((t) => TYPE_LABELS[t] ?? t)}
          selected={typeFilter ? (TYPE_LABELS[typeFilter] ?? typeFilter) : null}
          onSelect={(v) => setTypeFilter(v ? (Object.entries(TYPE_LABELS).find(([, l]) => l === v)?.[0] ?? v) : null)}
        />
        {activeCount > 0 && (
          <button onClick={() => { setPlayerFilter(null); setTeamFilter(null); setSetFilter(null); setTypeFilter(null); setSearch(''); }}
            className="px-2.5 py-1.5 rounded-xl text-xs font-medium"
            style={{ color: '#F5AF23', border: '1px solid rgba(245,166,35,0.2)' }}>
            ✕ Effacer ({activeCount})
          </button>
        )}
        <span className="ml-auto text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
          {filtered.length} carte{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Grid */}
      <div className="max-w-6xl mx-auto px-6 pb-8">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <span className="text-4xl opacity-20">🃏</span>
            <p className="text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>Aucune carte ne correspond.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map((card) => (
              <SharedCard key={card.id} card={card} showPrice={data.show_prices} onClick={() => setSelected(card)} />
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
