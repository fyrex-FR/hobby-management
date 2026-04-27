import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  LayoutGrid,
  List,
  Download,
  Pencil,
  Trash2,
  Group,
  X,
  ChevronDown
} from 'lucide-react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useCards, useDeleteCard, useUpdateCard } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import type { Card, CardStatus, CardType } from '../../types';
import { GradingBadge } from '../shared/GradingBadge';
import { StatusBadge } from '../shared/StatusBadge';
import { CardDetail } from '../shared/CardDetail';
import { RookieBadge } from '../shared/RookieBadge';
import { AlertChips } from '../shared/CardSignals';
import { normalizeParallelName } from '../../lib/cardQuality';

type FilterTab = 'all' | 'a_vendre' | 'vendu';
type GroupBy = 'none' | 'player' | 'team' | 'brand' | 'set_name' | 'year';

const TYPE_LABELS: Record<CardType, string> = {
  base: 'Base',
  insert: 'Insert',
  parallel: 'Parallel',
  numbered: 'Numbered',
  auto: 'Auto',
  patch: 'Patch',
  auto_patch: 'Auto/Patch',
  memo: 'Memorabilia',
  auto_memo: 'Auto/Memo',
} as any;

const CARD_TYPE_OPTIONS: { value: CardType; label: string }[] = [
  { value: 'base', label: 'Base' },
  { value: 'insert', label: 'Insert' },
  { value: 'parallel', label: 'Parallel' },
  { value: 'numbered', label: 'Numbered' },
  { value: 'auto', label: 'Auto' },
  { value: 'patch', label: 'Patch' },
  { value: 'auto_patch', label: 'Auto/Patch' },
];

const STATUS_OPTIONS: { value: CardStatus; label: string }[] = [
  { value: 'collection', label: 'Collection' },
  { value: 'a_vendre', label: 'À vendre' },
  { value: 'reserve', label: 'Réservé' },
  { value: 'vendu', label: 'Vendu' },
];

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    mobileHide?: boolean;
  }
}

function TableActions({ card, onEdit }: { card: Card; onEdit: () => void }) {
  const deleteCard = useDeleteCard();
  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="p-2 rounded-xl transition-all hover:bg-white/10 active:scale-90"
        title="Modifier"
        style={{ color: 'var(--text-primary)', border: '1px solid var(--border)' }}
      >
        <Pencil size={14} />
      </button>
      <button
        onClick={async (e) => {
          e.stopPropagation();
          if (!confirm(`Supprimer ${card.player ?? 'cette carte'} ?`)) return;
          await deleteCard.mutateAsync(card.id);
        }}
        className="p-2 rounded-xl transition-all hover:bg-red-500/10 active:scale-90"
        title="Supprimer"
        style={{ color: 'var(--red, #ef4444)', border: '1px solid hsla(0, 84%, 60%, 0.2)' }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function QuickRookieToggle({ card }: { card: Card }) {
  const updateCard = useUpdateCard();
  const saving = updateCard.isPending;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        updateCard.mutate({ id: card.id, is_rookie: !card.is_rookie });
      }}
      disabled={saving}
      className="transition-all"
      title={card.is_rookie ? 'Retirer RC' : 'Marquer RC'}
      style={{ opacity: saving ? 0.6 : 1 }}
    >
      {card.is_rookie ? (
        <RookieBadge compact />
      ) : (
        <span
          className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
        >
          RC
        </span>
      )}
    </button>
  );
}

function QuickTypeSelect({ card }: { card: Card }) {
  const updateCard = useUpdateCard();

  return (
    <select
      value={card.card_type ?? ''}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => updateCard.mutate({ id: card.id, card_type: (e.target.value || null) as CardType | null })}
      className="rounded-lg px-2 py-1 text-[11px] font-medium outline-none transition-all min-w-[108px]"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
    >
      <option value="">—</option>
      {CARD_TYPE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function QuickStatusSelect({ card }: { card: Card }) {
  const updateCard = useUpdateCard();

  return (
    <select
      value={card.status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => updateCard.mutate({ id: card.id, status: e.target.value as CardStatus })}
      className="rounded-lg px-2 py-1 text-[11px] font-medium outline-none transition-all min-w-[118px]"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function QuickParallelInput({ card }: { card: Card }) {
  const updateCard = useUpdateCard();
  const [value, setValue] = useState(card.parallel_name && card.parallel_name !== 'Base' ? card.parallel_name : '');

  useEffect(() => {
    setValue(card.parallel_name && card.parallel_name !== 'Base' ? card.parallel_name : '');
  }, [card.parallel_name]);

  async function save() {
    const normalized = value.trim();
    const current = card.parallel_name && card.parallel_name !== 'Base' ? card.parallel_name : '';
    if (normalized === current) return;
    await updateCard.mutateAsync({ id: card.id, parallel_name: normalized || null });
  }

  return (
    <input
      value={value}
      placeholder="Parallel"
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { void save(); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      className="w-full rounded-lg px-2 py-1 text-[11px] outline-none transition-all"
      style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--accent)' }}
    />
  );
}

const columnHelper = createColumnHelper<Card>();

function buildColumns(onEdit: (card: Card) => void) {
  return [
    columnHelper.accessor('player', {
      header: 'Joueur',
      cell: (info) => {
        const card = info.row.original;
        return (
          <div className="flex items-center gap-3">
            {card.image_front_url
              ? <img src={card.image_front_url} alt="" className="w-10 h-14 object-contain rounded-md shrink-0" />
              : <div className="w-10 h-14 rounded-md shrink-0 flex items-center justify-center text-sm" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
            }
            <div>
              <div className="font-medium text-sm whitespace-nowrap">{info.getValue() ?? '—'}</div>
              <div className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{card.team ?? ''}</div>
            </div>
          </div>
        );
      },
    }),
    columnHelper.display({
      id: 'icons',
      header: 'RC',
      cell: (info) => {
        const card = info.row.original;
        const isAuto = card.card_type === 'auto' || card.card_type === 'auto_patch';
        const isPatch = card.card_type === 'patch' || card.card_type === 'auto_patch';
        return (
          <div className="flex items-center gap-1.5">
            <QuickRookieToggle card={card} />
            {card.grading_company && (
              <GradingBadge card={card} compact />
            )}
            {isAuto && (
              <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: 'rgba(16,185,129,0.15)', color: 'rgb(16,185,129)', border: '1px solid rgba(16,185,129,0.3)' }} title="Autographe">✍</span>
            )}
            {isPatch && (
              <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black shrink-0" style={{ background: 'rgba(239,68,68,0.15)', color: 'rgb(239,68,68)', border: '1px solid rgba(239,68,68,0.3)' }} title="Patch">P</span>
            )}
            {card.numbered && (
              <span className="text-[10px] font-bold px-1 py-0.5 rounded shrink-0 whitespace-nowrap" style={{ background: 'rgba(245,166,35,0.15)', color: 'var(--accent)', border: '1px solid rgba(245,166,35,0.25)' }}>{card.numbered}</span>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor('year', {
      header: 'Année',
      cell: (info) => <span className="text-xs whitespace-nowrap">{info.getValue() ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>,
      meta: { mobileHide: true },
    }),
    columnHelper.accessor('set_name', {
      header: 'Set',
      cell: (info) => {
        const card = info.row.original;
        return (
          <div className="min-w-0 w-[210px]">
            <div className="text-xs whitespace-nowrap mb-1">{info.getValue() ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
            <QuickParallelInput card={card} />
          </div>
        );
      },
      meta: { mobileHide: true },
    }),
    columnHelper.accessor('card_type', {
      header: 'Type',
      cell: (info) => <QuickTypeSelect card={info.row.original} />,
      meta: { mobileHide: true },
    }),
    columnHelper.accessor('status', {
      header: 'Statut',
      cell: (info) => <QuickStatusSelect card={info.row.original} />,
    }),
    columnHelper.accessor('purchase_price', {
      header: 'Achat',
      cell: (info) => <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{info.getValue() != null ? `${info.getValue()} €` : '—'}</span>,
      meta: { mobileHide: true },
    }),
    columnHelper.accessor('price', {
      header: 'Vente',
      cell: (info) => <span className="text-sm font-medium whitespace-nowrap">{info.getValue() != null ? `${info.getValue()} €` : <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>,
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: (info) => <TableActions card={info.row.original} onEdit={() => onEdit(info.row.original)} />,
      meta: { mobileHide: true },
    }),
  ];
}

function GridCard({ card, onClick }: { card: Card; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -4 }}
      onClick={onClick}
      className="group relative bg-[var(--bg-card)] rounded-3xl overflow-hidden border border-white/5 hover:border-[var(--accent)]/40 transition-all duration-300 hover:shadow-2xl hover:shadow-[var(--accent-glow)] text-left w-full glass"
    >
      <div className="relative aspect-[3/4] bg-[var(--bg-primary)] overflow-hidden">
        {card.image_front_url ? (
          <img
            src={card.image_front_url}
            alt={card.player ?? ''}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2">
            <span className="text-4xl opacity-20">🃏</span>
            <span className="text-[10px] font-bold text-[var(--text-muted)] uppercase tracking-widest">Image absente</span>
          </div>
        )}

        {/* top-left: auto / patch / numbered badges */}
        <div className="absolute top-3 left-3 flex flex-row gap-1.5 flex-wrap max-w-[85%] z-10">
          {card.is_rookie && <RookieBadge compact />}
          {card.grading_company && <GradingBadge card={card} compact />}
          {(card.card_type === 'auto' || card.card_type === 'auto_patch') && (
            <div className="h-5 px-2 rounded-lg flex items-center justify-center text-[9px] font-black bg-[#10B981] text-white shadow-lg shadow-emerald-900/40 border border-emerald-400/20 backdrop-blur-sm">
              AUTO
            </div>
          )}
          {(card.card_type === 'patch' || card.card_type === 'auto_patch') && (
            <div className="h-5 px-2 rounded-lg flex items-center justify-center text-[9px] font-black bg-[#EF4444] text-white shadow-lg shadow-red-900/40 border border-red-400/20 backdrop-blur-sm">
              PATCH
            </div>
          )}
          {card.numbered && (
            <div className="h-5 px-2 rounded-lg flex items-center justify-center text-[9px] font-black bg-[var(--accent)] text-black shadow-lg shadow-amber-900/40 border border-amber-400/20 backdrop-blur-sm">
              {card.numbered}
            </div>
          )}
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

        {card.status !== 'collection' && (
          <div className="absolute bottom-3 left-3 z-10">
            <StatusBadge status={card.status} />
          </div>
        )}
      </div>

      <div className="p-4 space-y-1.5 relative">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-bold text-white truncate leading-tight group-hover:text-[var(--accent)] transition-colors">
            {card.player ?? '—'}
          </p>
          {card.price != null && (
            <span className="text-[11px] font-black text-[var(--accent)] shrink-0">{card.price}€</span>
          )}
        </div>

        <p className="text-[11px] font-medium text-[var(--text-muted)] truncate group-hover:text-[var(--text-secondary)] transition-colors">
          {[card.year, card.brand, card.set_name].filter(Boolean).join(' · ')}
        </p>

        {(card.insert_name || (card.parallel_name && card.parallel_name !== 'Base')) && (
          <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
            <div className="h-1 w-1 rounded-full bg-[var(--accent)] shrink-0" />
            <p className="text-[10px] font-bold text-[var(--text-secondary)] truncate uppercase tracking-wider">
              {card.insert_name || normalizeParallelName(card.parallel_name)}
            </p>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
        </div>
        <div className="mt-2">
          <AlertChips card={card} limit={2} />
        </div>
      </div>
    </motion.button>
  );
}

function FilterDropdown({
  label,
  items,
  selected,
  onSelect,
}: {
  label: string;
  items: { value: string; count: number; label?: string }[];
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

  const active = selected !== null;
  const selectedLabel = active ? (items.find((i) => i.value === selected)?.label ?? selected) : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap active:scale-95"
        style={active
          ? { background: 'var(--accent)', color: '#09090B' }
          : { background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
        }
      >
        <span>{active ? selectedLabel : label}</span>
        <ChevronDown size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            className="absolute top-full left-0 mt-2 z-30 rounded-2xl overflow-hidden py-1.5 min-w-[200px] max-h-64 overflow-y-auto glass border-strong shadow-2xl p-1"
          >
            {active && (
              <button
                onClick={() => { onSelect(null); setOpen(false); }}
                className="flex items-center justify-between w-full px-3 py-2 text-[11px] font-bold transition-colors hover:bg-white/5 rounded-xl mb-1 text-[var(--accent)]"
              >
                <span>Effacer le filtre</span>
                <X size={12} />
              </button>
            )}
            {items.map(({ value, count, label: itemLabel }) => (
              <button
                key={value}
                onClick={() => { onSelect(selected === value ? null : value); setOpen(false); }}
                className="flex items-center justify-between w-full px-3 py-2.5 text-xs font-medium transition-colors text-left rounded-xl hover:bg-white/5"
                style={{
                  background: selected === value ? 'var(--accent-glow)' : 'transparent',
                  color: selected === value ? 'var(--accent)' : 'var(--text-primary)',
                }}
              >
                <span className="truncate">{itemLabel ?? value}</span>
                <span className="text-[10px] font-bold ml-3 shrink-0 opacity-40">{count}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TableView({ table, onRowClick }: { table: ReturnType<typeof useReactTable<Card>>; onRowClick: (card: Card) => void }) {
  const isMobile = window.innerWidth < 640;

  return (
    <div className="rounded-xl border border-white/5 overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-white/5 bg-[var(--bg-secondary)]/50">
              {hg.headers.map((header) => {
                if (isMobile && (header.column.columnDef.meta as any)?.mobileHide) return null;
                return (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={`px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${header.column.getCanSort() ? 'cursor-pointer' : ''
                      }`}
                    style={{ color: 'var(--text-muted)' }}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {{ asc: ' ↑', desc: ' ↓' }[header.column.getIsSorted() as string] ?? ''}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => (
            <tr
              key={row.id}
              onClick={() => onRowClick(row.original)}
              className={`group border-b border-white/5 cursor-pointer transition-colors hover:bg-white/[0.04] ${i % 2 === 0 ? '' : 'bg-white/[0.02]'
                }`}
            >
              {row.getVisibleCells().map((cell) => {
                if (isMobile && (cell.column.columnDef.meta as any)?.mobileHide) return null;
                return (
                  <td key={cell.id} className="px-3 py-3 text-[var(--text-primary)] align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CollectionView() {
  const { data: cards = [], isLoading } = useCards();
  const { viewMode, setViewMode, drillFilter, clearDrillFilter } = useAppStore();

  const [statusFilter, setStatusFilter] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [playerFilter, setPlayerFilter] = useState<string | null>(drillFilter.player ?? null);
  const [teamFilter, setTeamFilter] = useState<string | null>(drillFilter.team ?? null);
  const [brandFilter, setBrandFilter] = useState<string | null>(null);
  const [setFilter, setSetFilter] = useState<string | null>(drillFilter.set_name ?? null);
  const [yearFilter, setYearFilter] = useState<string | null>(drillFilter.year ?? null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [rookieOnly, setRookieOnly] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);

  // Counts pour les onglets (avant filtres sidebar)
  const statusCounts = useMemo(() => ({
    all: cards.length,
    a_vendre: cards.filter((c) => c.status === 'a_vendre').length,
    vendu: cards.filter((c) => c.status === 'vendu').length,
  }), [cards]);

  // Filtrage principal (exclure les drafts de la collection)
  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (c.status === 'draft') return false;
      if (statusFilter !== 'all' && c.status !== (statusFilter as CardStatus)) return false;
      if (playerFilter && c.player !== playerFilter) return false;
      if (teamFilter && c.team !== teamFilter) return false;
      if (brandFilter && c.brand !== brandFilter) return false;
      if (setFilter && c.set_name !== setFilter) return false;
      if (yearFilter && c.year !== yearFilter) return false;
      if (typeFilter && c.card_type !== typeFilter) return false;
      if (rookieOnly && !c.is_rookie) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = [c.player, c.team, c.brand, c.set_name, c.insert_name, c.parallel_name, c.year]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [cards, statusFilter, playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter, rookieOnly, search]);

  const facets = useCallback((key: keyof Card) => {
    const counts: Record<string, number> = {};
    cards.forEach((c) => {
      const v = c[key] as string | null;
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }, [cards]);

  const players = useMemo(() => facets('player'), [facets]);
  const teams = useMemo(() => facets('team'), [facets]);
  const brands = useMemo(() => facets('brand'), [facets]);
  const sets = useMemo(() => facets('set_name'), [facets]);
  const years = useMemo(() => facets('year'), [facets]);

  const types = useMemo(() =>
    facets('card_type').map(({ value, count }) => ({
      value,
      count,
      label: TYPE_LABELS[value as CardType] ?? value
    })),
    [facets]
  );

  // Groupement
  const grouped = useMemo(() => {
    if (groupBy === 'none') return { '': filtered };
    const groups: Record<string, Card[]> = {};
    filtered.forEach((c) => {
      const key = (c[groupBy] as string | null) ?? 'Inconnu';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)));
  }, [filtered, groupBy]);

  const rookieCount = useMemo(() => cards.filter((c) => c.is_rookie).length, [cards]);
  const activeFiltersCount = [playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter, rookieOnly ? 'rookie' : null].filter(Boolean).length;

  function exportCSV() {
    const CSV_COLS: { key: keyof Card; label: string }[] = [
      { key: 'player', label: 'Joueur' },
      { key: 'team', label: 'Équipe' },
      { key: 'year', label: 'Année' },
      { key: 'brand', label: 'Marque' },
      { key: 'set_name', label: 'Set' },
      { key: 'insert_name', label: 'Insert' },
      { key: 'parallel_name', label: 'Parallel' },
      { key: 'card_number', label: 'N° carte' },
      { key: 'numbered', label: 'Tirage' },
      { key: 'is_rookie', label: 'RC' },
      { key: 'card_type', label: 'Type' },
      { key: 'status', label: 'Statut' },
      { key: 'condition_notes', label: 'État' },
      { key: 'purchase_price', label: 'Prix achat (€)' },
      { key: 'price', label: 'Prix vente (€)' },
    ];
    function escapeCell(v: unknown): string {
      const s = v == null ? '' : String(v);
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    }
    const header = CSV_COLS.map((c) => escapeCell(c.label)).join(',');
    const rows = filtered.map((card) =>
      CSV_COLS.map((c) => escapeCell(card[c.key])).join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collection_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns = useMemo(() => buildColumns(setSelectedCard), []);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'Tout' },
    { key: 'a_vendre', label: 'À vendre' },
    { key: 'vendu', label: 'Vendu' },
  ];

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_-20%,_var(--accent-dim)_0%,_transparent_70%)]">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 px-6 py-5 border-b border-white/5 bg-black/20 backdrop-blur-3xl shrink-0 relative z-40">
        {/* Row 1: status tabs + right controls */}
        <div className="flex items-center justify-between gap-4">
          {/* Status tabs */}
          <div className="flex gap-1 p-1 rounded-2xl bg-white/5 border border-white/5 shrink-0">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setStatusFilter(t.key)}
                className="px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-2 active:scale-95"
                style={statusFilter === t.key
                  ? { background: 'var(--accent)', color: '#09090B', boxShadow: '0 4px 12px var(--accent-glow)' }
                  : { color: 'var(--text-secondary)' }
                }
              >
                {t.label}
                <span className={`px-1.5 py-0.5 rounded-lg text-[9px] font-black ${statusFilter === t.key ? 'bg-black/10' : 'bg-white/10'}`}>
                  {statusCounts[t.key]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            {/* View toggle */}
            <div className="flex p-1 rounded-2xl bg-white/5 border border-white/5 shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white/10 text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-xl transition-all ${viewMode === 'table' ? 'bg-white/10 text-white shadow-lg' : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'}`}
              >
                <List size={16} />
              </button>
            </div>

            <button
              onClick={exportCSV}
              className="p-3 rounded-2xl bg-white/5 border border-white/5 text-[var(--text-secondary)] hover:bg-white/10 hover:text-white transition-all active:scale-95"
              title="Exporter en CSV"
            >
              <Download size={16} />
            </button>
          </div>
        </div>

        {/* Row 2: search + filters */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative group min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-focus-within:text-[var(--accent)] transition-colors" size={14} />
            <input
              type="text"
              placeholder="Rechercher une pépite…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/5 rounded-2xl pl-10 pr-10 py-2.5 text-xs font-medium outline-none transition-all focus:border-[var(--accent)]/50 focus:bg-white/[0.08] placeholder:text-[var(--text-muted)]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="h-6 w-px bg-white/10 mx-1 hidden lg:block" />

          <div className="flex items-center gap-2 flex-wrap">
            <FilterDropdown label="Joueur" items={players} selected={playerFilter} onSelect={setPlayerFilter} />
            <FilterDropdown label="Équipe" items={teams} selected={teamFilter} onSelect={setTeamFilter} />
            <FilterDropdown label="Marque" items={brands} selected={brandFilter} onSelect={setBrandFilter} />
            <FilterDropdown label="Collection" items={sets} selected={setFilter} onSelect={setSetFilter} />
            <FilterDropdown label="Année" items={years} selected={yearFilter} onSelect={setYearFilter} />
            <FilterDropdown label="Type" items={types} selected={typeFilter} onSelect={setTypeFilter} />

            {rookieCount > 0 && (
              <button
                onClick={() => setRookieOnly((v) => !v)}
                className="px-4 py-2 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap active:scale-95 border"
                style={rookieOnly
                  ? { background: 'var(--accent-glow)', color: 'var(--accent)', borderColor: 'var(--border-accent)' }
                  : { background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
              >
                ROOKIE RC
              </button>
            )}

            {activeFiltersCount > 0 && (
              <button
                onClick={() => { setPlayerFilter(null); setTeamFilter(null); setBrandFilter(null); setSetFilter(null); setYearFilter(null); setTypeFilter(null); setRookieOnly(false); clearDrillFilter(); }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
                style={{ color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
              >
                Effacer ({activeFiltersCount})
              </button>
            )}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-3 bg-white/5 border border-white/5 px-3 py-1.5 rounded-2xl">
            <div className="flex items-center gap-2">
              <Group size={12} className="text-white/20" />
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="bg-transparent text-[10px] font-black uppercase tracking-[0.2em] outline-none cursor-pointer text-white/40 hover:text-white transition-colors appearance-none"
              >
                <option value="none" className="bg-[#18181b]">ORGANISATION</option>
                <option value="player" className="bg-[#18181b]">PAR JOUEUR</option>
                <option value="team" className="bg-[#18181b]">PAR ÉQUIPE</option>
                <option value="brand" className="bg-[#18181b]">PAR MARQUE</option>
                <option value="set_name" className="bg-[#18181b]">PAR COLLECTION</option>
                <option value="year" className="bg-[#18181b]">PAR ANNÉE</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-[var(--text-muted)] text-sm">Chargement…</div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <span className="text-4xl">🃏</span>
            <p className="text-[var(--text-muted)] text-sm">Aucune carte ne correspond.</p>
            {(activeFiltersCount > 0 || search) && (
              <button
                onClick={() => { setPlayerFilter(null); setTeamFilter(null); setBrandFilter(null); setSetFilter(null); setYearFilter(null); setTypeFilter(null); setRookieOnly(false); setSearch(''); }}
                className="text-xs text-[var(--accent)] hover:opacity-80"
              >
                Effacer les filtres
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="space-y-8">
            {Object.entries(grouped).map(([group, groupCards]) => (
              <div key={group}>
                {groupBy !== 'none' && (
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-sm font-semibold text-white">{group}</h3>
                    <span className="text-xs text-[var(--text-muted)]">{groupCards.length} carte{groupCards.length !== 1 ? 's' : ''}</span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {groupCards.map((card) => (
                    <GridCard key={card.id} card={card} onClick={() => setSelectedCard(card)} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <TableView table={table} onRowClick={setSelectedCard} />
        )}
      </div>

      {selectedCard && (
        <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}
    </div>
  );
}
