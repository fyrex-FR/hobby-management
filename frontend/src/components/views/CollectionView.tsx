import { useMemo, useState, useRef, useEffect } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table';
import { useCards, useDeleteCard } from '../../hooks/useCards';
import { useAppStore } from '../../stores/appStore';
import type { Card, CardStatus } from '../../types';
import { CardBadge } from '../shared/CardBadge';
import { StatusBadge } from '../shared/StatusBadge';
import { CardDetail } from '../shared/CardDetail';

type FilterTab = 'all' | 'a_vendre' | 'vendu';
type GroupBy = 'none' | 'player' | 'team' | 'brand' | 'set_name' | 'year';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData, TValue> {
    mobileHide?: boolean;
  }
}

function TableActions({ card, onEdit }: { card: Card; onEdit: () => void }) {
  const deleteCard = useDeleteCard();
  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
        style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)' }}
      >
        ✏ Modifier
      </button>
      <button
        onClick={async (e) => {
          e.stopPropagation();
          if (!confirm(`Supprimer ${card.player ?? 'cette carte'} ?`)) return;
          await deleteCard.mutateAsync(card.id);
        }}
        className="px-2 py-1 rounded-lg text-xs transition-colors"
        style={{ color: 'var(--red)', border: '1px solid rgba(240,77,77,0.2)' }}
      >
        🗑
      </button>
    </div>
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
          <div className="flex items-center gap-2.5">
            {card.image_front_url
              ? <img src={card.image_front_url} alt="" className="w-7 h-9 object-contain rounded shrink-0" />
              : <div className="w-7 h-9 rounded shrink-0 flex items-center justify-center text-xs" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
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
      header: '',
      cell: (info) => {
        const card = info.row.original;
        const isAuto = card.card_type === 'auto' || card.card_type === 'auto_patch';
        const isPatch = card.card_type === 'patch' || card.card_type === 'auto_patch';
        return (
          <div className="flex items-center gap-1">
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
        const parallel = card.parallel_name && card.parallel_name !== 'Base' ? card.parallel_name : null;
        return (
          <div className="min-w-0">
            <div className="text-xs whitespace-nowrap">{info.getValue() ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
            {parallel && <div className="text-[11px] whitespace-nowrap" style={{ color: 'var(--accent)' }}>{parallel}</div>}
          </div>
        );
      },
      meta: { mobileHide: true },
    }),
    columnHelper.accessor('card_type', {
      header: 'Type',
      cell: (info) => <CardBadge type={info.getValue() ?? null} />,
      meta: { mobileHide: true },
    }),
    columnHelper.accessor('status', {
      header: 'Statut',
      cell: (info) => <StatusBadge status={info.getValue()} />,
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
    <button
      onClick={onClick}
      className="group relative bg-[var(--bg-secondary)] rounded-2xl overflow-hidden border border-white/5 hover:border-[var(--accent)]/60 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:shadow-black/40 text-left w-full"
    >
      <div className="relative aspect-[3/4] bg-[var(--bg-primary)] overflow-hidden">
        {card.image_front_url ? (
          <img
            src={card.image_front_url}
            alt={card.player ?? ''}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-[var(--text-muted)] text-3xl">🃏</span>
          </div>
        )}
        {/* top-left: auto / patch / numbered badges */}
        {(card.card_type === 'auto' || card.card_type === 'auto_patch' || card.card_type === 'patch' || card.numbered) && (
          <div className="absolute top-2 left-2 flex flex-row gap-1 flex-wrap max-w-[80%]">
            {(card.card_type === 'auto' || card.card_type === 'auto_patch') && (
              <div
                className="h-5 px-1.5 rounded flex items-center justify-center text-[10px] font-black"
                style={{ background: 'rgba(16,185,129,0.9)', color: '#fff', backdropFilter: 'blur(4px)' }}
                title="Autographe"
              >
                AUTO
              </div>
            )}
            {(card.card_type === 'patch' || card.card_type === 'auto_patch') && (
              <div
                className="h-5 px-1.5 rounded flex items-center justify-center text-[10px] font-black"
                style={{ background: 'rgba(239,68,68,0.9)', color: '#fff', backdropFilter: 'blur(4px)' }}
                title="Patch"
              >
                PATCH
              </div>
            )}
            {card.numbered && (
              <div
                className="h-5 px-1.5 rounded flex items-center justify-center text-[10px] font-black"
                style={{ background: 'rgba(245,166,35,0.9)', color: '#000', backdropFilter: 'blur(4px)' }}
                title="Numérotée"
              >
                {card.numbered}
              </div>
            )}
          </div>
        )}
        {card.status !== 'collection' && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent pt-6 pb-2 px-2">
            <StatusBadge status={card.status} />
          </div>
        )}
      </div>
      <div className="p-3 space-y-1">
        <p className="text-sm font-semibold text-white truncate leading-tight">
          {card.player ?? '—'}
        </p>
        <p className="text-xs text-[var(--text-secondary)] truncate">
          {[card.year, card.brand, card.set_name].filter(Boolean).join(' · ')}
        </p>
        {(card.insert_name || (card.parallel_name && card.parallel_name !== 'Base')) && (
          <p className="text-xs text-[var(--accent)] truncate">
            {card.insert_name || card.parallel_name}
          </p>
        )}
        <div className="flex items-center justify-between pt-0.5">
          <CardBadge type={card.card_type} />
          {card.price != null && (
            <span className="text-xs font-medium text-white">{card.price} €</span>
          )}
        </div>
      </div>
    </button>
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
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap"
        style={active
          ? { background: 'var(--accent)', color: '#0E0E11' }
          : { background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
        }
      >
        {active ? selectedLabel : label}
        <span style={{ opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 z-30 rounded-2xl overflow-hidden py-1 min-w-[180px] max-h-64 overflow-y-auto"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        >
          {active && (
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              className="flex items-center justify-between w-full px-3 py-2 text-xs transition-colors"
              style={{ color: 'var(--accent)' }}
            >
              <span>Effacer</span>
              <span>✕</span>
            </button>
          )}
          {items.map(({ value, count, label: itemLabel }) => (
            <button
              key={value}
              onClick={() => { onSelect(selected === value ? null : value); setOpen(false); }}
              className="flex items-center justify-between w-full px-3 py-2 text-sm transition-colors text-left"
              style={{
                background: selected === value ? 'rgba(245,175,35,0.1)' : 'transparent',
                color: selected === value ? 'var(--accent)' : 'var(--text-primary)',
              }}
            >
              <span className="truncate">{itemLabel ?? value}</span>
              <span className="text-xs ml-3 shrink-0" style={{ color: 'var(--text-muted)' }}>{count}</span>
            </button>
          ))}
        </div>
      )}
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
                    className={`px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap ${
                      header.column.getCanSort() ? 'cursor-pointer' : ''
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
              className={`group border-b border-white/5 cursor-pointer transition-colors hover:bg-white/[0.04] ${
                i % 2 === 0 ? '' : 'bg-white/[0.02]'
              }`}
            >
              {row.getVisibleCells().map((cell) => {
                if (isMobile && (cell.column.columnDef.meta as any)?.mobileHide) return null;
                return (
                  <td key={cell.id} className="px-3 py-2.5 text-[var(--text-primary)]">
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
  }, [cards, statusFilter, playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter, search]);

  // Sidebar facets (calculées sur toute la collection, pas sur filtered)
  function facets(key: keyof Card) {
    const counts: Record<string, number> = {};
    cards.forEach((c) => {
      const v = c[key] as string | null;
      if (v) counts[v] = (counts[v] ?? 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([value, count]) => ({ value, count }));
  }

  const players = useMemo(() => facets('player'), [cards]);
  const teams = useMemo(() => facets('team'), [cards]);
  const brands = useMemo(() => facets('brand'), [cards]);
  const sets = useMemo(() => facets('set_name'), [cards]);
  const years = useMemo(() => facets('year'), [cards]);
  const TYPE_LABELS: Record<string, string> = {
    base: 'Base', insert: 'Insert', parallel: 'Parallel', numbered: 'Numbered',
    auto: 'Auto', patch: 'Patch', auto_patch: 'Auto/Patch',
  };
  const types = useMemo(() => facets('card_type').map(({ value, count }) => ({ value, count, label: TYPE_LABELS[value] ?? value })), [cards]);

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

  const activeFiltersCount = [playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter].filter(Boolean).length;

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
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 px-3 sm:px-6 py-3 border-b shrink-0" style={{ borderColor: 'var(--border)' }}>
        {/* Row 1: status tabs + right controls */}
        <div className="flex items-center gap-2">
          {/* Status tabs */}
          <div className="flex gap-0.5 p-1 rounded-xl shrink-0" style={{ background: 'var(--bg-secondary)' }}>
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setStatusFilter(t.key)}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap"
                style={statusFilter === t.key
                  ? { background: 'var(--accent)', color: '#0E0E11' }
                  : { color: 'var(--text-secondary)' }
                }
              >
                {t.label} <span style={{ opacity: 0.65 }}>{statusCounts[t.key]}</span>
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Grouper par */}
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
            className="rounded-lg px-2 py-1.5 text-xs outline-none hidden sm:block"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="none">Grouper…</option>
            <option value="player">Joueur</option>
            <option value="team">Équipe</option>
            <option value="brand">Marque</option>
            <option value="set_name">Set</option>
            <option value="year">Année</option>
          </select>

          {/* View toggle */}
          <div className="flex rounded-xl overflow-hidden shrink-0" style={{ border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
            <button onClick={() => setViewMode('grid')} title="Grille" className="px-2.5 py-2 transition-colors" style={{ background: viewMode === 'grid' ? 'var(--bg-elevated)' : 'transparent', color: viewMode === 'grid' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="1.5"/><rect x="9" y="1" width="6" height="6" rx="1.5"/><rect x="1" y="9" width="6" height="6" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="1.5"/></svg>
            </button>
            <button onClick={() => setViewMode('table')} title="Tableau" className="px-2.5 py-2 transition-colors" style={{ background: viewMode === 'table' ? 'var(--bg-elevated)' : 'transparent', color: viewMode === 'table' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg>
            </button>
          </div>
        </div>

        {/* Row 2: search + filter chips */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative shrink-0" style={{ width: '130px' }}>
            <input
              type="text"
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl pl-7 pr-3 py-1.5 text-xs outline-none transition-all placeholder:text-[var(--text-muted)]"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--text-muted)' }}>🔍</span>
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: 'var(--text-muted)' }}>✕</button>
            )}
          </div>
          <FilterDropdown label="Joueur" items={players} selected={playerFilter} onSelect={setPlayerFilter} />
          <FilterDropdown label="Équipe" items={teams} selected={teamFilter} onSelect={setTeamFilter} />
          <FilterDropdown label="Marque" items={brands} selected={brandFilter} onSelect={setBrandFilter} />
          <FilterDropdown label="Set" items={sets} selected={setFilter} onSelect={setSetFilter} />
          <FilterDropdown label="Année" items={years} selected={yearFilter} onSelect={setYearFilter} />
          <FilterDropdown label="Type" items={types} selected={typeFilter} onSelect={setTypeFilter} />
          {activeFiltersCount > 0 && (
            <button
              onClick={() => { setPlayerFilter(null); setTeamFilter(null); setBrandFilter(null); setSetFilter(null); setYearFilter(null); setTypeFilter(null); clearDrillFilter(); }}
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap"
              style={{ color: 'var(--accent)', border: '1px solid rgba(245,175,35,0.2)' }}
            >
              ✕ Effacer ({activeFiltersCount})
            </button>
          )}

          <div className="flex-1 hidden sm:block" />

          <button
            onClick={exportCSV}
            title={`Exporter ${filtered.length} carte(s) en CSV`}
            className="px-2.5 py-1.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap hidden sm:flex items-center gap-1.5 shrink-0"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M8 2v8M5 7l3 3 3-3" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 12h10" strokeLinecap="round"/>
            </svg>
            CSV ({filtered.length})
          </button>
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
                  onClick={() => { setPlayerFilter(null); setTeamFilter(null); setBrandFilter(null); setSetFilter(null); setYearFilter(null); setTypeFilter(null); setSearch(''); }}
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
