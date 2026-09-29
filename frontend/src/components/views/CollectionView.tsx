import { useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  LayoutGrid,
  List,
  Download,
  Pencil,
  Trash2,
  X,
  ChevronDown,
  CheckCircle2,
  Circle,
  ListChecks,
  FolderPlus,
  Check,
  Smile,
  Folder as FolderIcon,
  ArrowUpDown,
  ShoppingBag,
  BadgeEuro,
  MoreHorizontal,
  FolderCog,
  SearchX,
} from 'lucide-react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useCards, useDeleteCard, useRecalculateEbayPrices, useUpdateCard } from '../../hooks/useCards';
import { useFolders, useCreateFolder, useUpdateFolder, useDeleteFolder } from '../../hooks/useFolders';
import { useAppStore } from '../../stores/appStore';
import { useCollectionFilters } from '../../stores/collectionFilterStore';
import type { Card, CardStatus, CardType, Folder } from '../../types';
import { GradingBadge } from '../shared/GradingBadge';
import { StatusBadge } from '../shared/StatusBadge';
import { CardDetail } from '../shared/CardDetail';
import { EbayBulkPublishModal } from '../shared/EbayBulkPublishModal';
import { WhatnotExportModal } from '../shared/WhatnotExportModal';
import { EbayStockSyncModal } from '../shared/EbayStockSyncModal';
import { EbayLogo, VintedLogo } from '../shared/EbayLogo';
import { PricingFlow } from '../shared/PricingFlow';
import { VintedPublishFlow } from '../shared/VintedPublishFlow';
import { Popover } from '../shared/Popover';
import { ActiveFilterChips, FilterRow, SearchField, StatusTabs } from '../shared/CollectionFilterBar';
import { cdnImg } from '../../lib/cdn';
import { RookieBadge } from '../shared/RookieBadge';

import { normalizeParallelName } from '../../lib/cardQuality';
import { playerLastName, playerInitial } from '../../lib/playerName';
import {
  GROUP_BY_LABELS,
  SORT_LABELS,
  buildFilterContext,
  canonicalPlayer,
  displayPrice,
  filterCards,
  hasAnyFilter,
  isAuto,
  isPatch,
  sortCards,
  type GroupBy,
  type SortBy,
} from '../../lib/collectionFilters';

const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
function formatEuro(v: number): string {
  return euro.format(v);
}

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

function buildColumns(
  onEdit: (card: Card) => void,
  selectMode: boolean,
  selectedIds: Set<string>,
  onToggleSelect: (id: string) => void,
  folderById: Map<string, Folder>,
  folders: Folder[],
) {
  const selectCol = columnHelper.display({
    id: 'select',
    header: '',
    cell: (info) => {
      const id = info.row.original.id;
      const checked = selectedIds.has(id);
      return (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect(id); }}
          className="flex items-center justify-center"
        >
          {checked ? (
            <CheckCircle2 size={20} className="text-[var(--accent)]" fill="currentColor" />
          ) : (
            <Circle size={20} className="text-white/40" />
          )}
        </button>
      );
    },
  });
  return [
    ...(selectMode ? [selectCol] : []),
    columnHelper.accessor('player', {
      header: 'Joueur',
      sortingFn: (a, b) => {
        const la = playerLastName(a.original.player);
        const lb = playerLastName(b.original.player);
        return la.localeCompare(lb) || (a.original.player ?? '').localeCompare(b.original.player ?? '');
      },
      cell: (info) => {
        const card = info.row.original;
        return (
          <div className="flex items-center gap-3 min-w-0">
            {card.image_front_url
              ? <img src={cdnImg(card.image_front_url)} alt="" loading="lazy" decoding="async" className="w-10 h-14 object-contain rounded-md shrink-0" />
              : <div className="w-10 h-14 rounded-md shrink-0 flex items-center justify-center text-sm" style={{ background: 'var(--bg-elevated)' }}>🃏</div>
            }
            <div className="min-w-0">
              <div className="font-medium text-sm truncate">{info.getValue() ?? '—'}</div>
              <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{card.team ?? ''}</div>
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
            {(card.quantity ?? 1) > 1 && (
              <span className="text-[10px] font-bold px-1 py-0.5 rounded shrink-0 whitespace-nowrap text-white" style={{ background: '#6366F1' }} title={`${card.quantity} exemplaires`}>×{card.quantity}</span>
            )}
            {card.vinted_url && (
              <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black shrink-0 text-white" style={{ background: '#007782' }} title="Annonce Vinted">V</span>
            )}
            {card.ebay_url && (
              <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black shrink-0 text-white" style={{ background: '#E53238' }} title="Annonce eBay">e</span>
            )}
            {(card.folder_ids ?? []).map((fid) => {
              const f = folderById.get(fid);
              if (!f) return null;
              return (
                <span key={fid} className="text-[10px] font-bold px-1 py-0.5 rounded shrink-0 whitespace-nowrap max-w-[90px] truncate" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }} title={`${f.emoji ?? ''} ${f.name}`.trim()}>
                  {f.emoji || f.name}
                </span>
              );
            })}
            {folders.length > 0 && (
              <span onClick={(e) => e.stopPropagation()}>
                <FolderQuickAssign card={card} folders={folders} variant="icon" />
              </span>
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
      cell: (info) => <span className="tabular text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{info.getValue() != null ? formatEuro(info.getValue() as number) : '—'}</span>,
      meta: { mobileHide: true },
    }),
    columnHelper.accessor((c) => displayPrice(c), {
      id: 'price',
      header: 'Prix',
      cell: (info) => <span className="tabular text-sm font-medium whitespace-nowrap text-[var(--accent)]">{info.getValue() != null ? formatEuro(info.getValue() as number) : <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>,
    }),
    columnHelper.display({
      id: 'actions',
      header: '',
      cell: (info) => <TableActions card={info.row.original} onEdit={() => onEdit(info.row.original)} />,
      meta: { mobileHide: true },
    }),
  ];
}

/** Pastille posée sur la photo : fond sombre translucide, texte coloré. */
function PhotoTag({ children, tone, title }: { children: React.ReactNode; tone: 'accent' | 'green' | 'red' | 'indigo'; title?: string }) {
  const color = { accent: 'var(--accent)', green: 'var(--green)', red: 'var(--red)', indigo: '#A5B4FC' }[tone];
  return (
    <span
      title={title}
      className="tabular inline-flex h-5 items-center rounded-md bg-black/70 px-1.5 text-[10px] font-semibold ring-1 ring-white/10 backdrop-blur-sm"
      style={{ color }}
    >
      {children}
    </span>
  );
}

function MarketDot({ kind }: { kind: 'vinted' | 'ebay' }) {
  return (
    <span
      className="inline-flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-[10px] font-bold text-white ring-1 ring-white/10"
      style={{ background: kind === 'vinted' ? '#007782' : '#E53238' }}
      title={kind === 'vinted' ? 'En ligne sur Vinted' : 'En ligne sur eBay'}
    >
      {kind === 'vinted' ? 'V' : 'e'}
    </span>
  );
}

function GridCard({
  card,
  onClick,
  selectMode = false,
  selected = false,
  onToggleSelect,
  anchorLetter,
  folderChips = [],
  folders = [],
}: {
  card: Card;
  onClick: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  anchorLetter?: string;
  folderChips?: string[];
  folders?: Folder[];
}) {
  const price = displayPrice(card);
  const variant = card.insert_name || (card.parallel_name && card.parallel_name !== 'Base' ? normalizeParallelName(card.parallel_name) : null);
  const activate = () => (selectMode ? onToggleSelect?.(card.id) : onClick());

  return (
    <div
      role="button"
      tabIndex={0}
      data-jump={anchorLetter}
      onClick={activate}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); } }}
      className={`group relative flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-[var(--bg-card)] text-left transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] ${
        selected ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--border-strong)]'
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
          <div className="flex h-full w-full items-center justify-center text-4xl opacity-10">🃏</div>
        )}

        <div className="absolute left-2 top-2 z-10 flex max-w-[80%] flex-wrap gap-1">
          {card.is_rookie && <RookieBadge compact />}
          {card.grading_company && <GradingBadge card={card} compact />}
          {isAuto(card) && <PhotoTag tone="green">AUTO</PhotoTag>}
          {isPatch(card) && <PhotoTag tone="red">PATCH</PhotoTag>}
          {card.numbered && <PhotoTag tone="accent">{card.numbered}</PhotoTag>}
          {(card.quantity ?? 1) > 1 && <PhotoTag tone="indigo" title={`${card.quantity} exemplaires`}>×{card.quantity}</PhotoTag>}
        </div>

        <div className="absolute right-2 top-2 z-20">
          {selectMode ? (
            selected
              ? <CheckCircle2 size={24} className="text-[var(--accent)] drop-shadow" fill="currentColor" stroke="var(--on-accent)" />
              : <Circle size={24} className="text-white/80 drop-shadow" />
          ) : folders.length > 0 ? (
            <div className="opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100">
              <FolderQuickAssign card={card} folders={folders} variant="overlay" />
            </div>
          ) : null}
        </div>

        {(card.status !== 'collection' || card.vinted_url || card.ebay_url) && (
          <div className="absolute inset-x-2 bottom-2 z-10 flex items-end justify-between gap-1">
            <span>{card.status !== 'collection' && <StatusBadge status={card.status} solid />}</span>
            <span className="flex gap-1">
              {card.vinted_url && <MarketDot kind="vinted" />}
              {card.ebay_url && <MarketDot kind="ebay" />}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{card.player ?? '—'}</p>
          {price != null && <span className="tabular shrink-0 text-[13px] font-semibold text-[var(--accent)]">{formatEuro(price)}</span>}
        </div>
        <p className="truncate text-xs text-[var(--text-muted)]">
          {[card.year, card.brand, card.set_name].filter(Boolean).join(' · ') || '—'}
        </p>
        {variant && <p className="truncate text-xs text-[var(--text-secondary)]">{variant}</p>}
        {folderChips.length > 0 && (
          <p className="mt-1 truncate text-[11px] text-[var(--text-muted)]" title={folderChips.join(', ')}>{folderChips.join(' · ')}</p>
        )}
      </div>
    </div>
  );
}

/** Colonnes triables du tableau → tri global (un seul système de tri). */
const TABLE_SORT: Record<string, [SortBy, SortBy]> = {
  player: ['player', 'player'],
  year: ['year_desc', 'year_asc'],
  price: ['price_desc', 'price_asc'],
};

function TableView({
  table,
  onRowClick,
  selectMode,
  selectedIds,
  onToggleSelect,
  sortBy,
  onSort,
}: {
  table: ReturnType<typeof useReactTable<Card>>;
  onRowClick: (card: Card) => void;
  selectMode: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  sortBy: SortBy;
  onSort: (s: SortBy) => void;
}) {
  const isMobile = useIsMobile();

  const rowAnchor = new Map<string, string>();
  {
    const seen = new Set<string>();
    for (const row of table.getRowModel().rows) {
      const ini = playerInitial(row.original.player);
      if (!seen.has(ini)) {
        seen.add(ini);
        rowAnchor.set(row.id, ini);
      }
    }
  }

  if (isMobile) {
    return (
      <div className="flex flex-col divide-y divide-[var(--border)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
        {table.getRowModel().rows.map((row) => {
          const card = row.original;
          const isSelected = selectMode && selectedIds.has(card.id);
          const price = displayPrice(card);
          return (
            <div
              key={row.id}
              data-jump={rowAnchor.get(row.id)}
              onClick={() => (selectMode ? onToggleSelect(card.id) : onRowClick(card))}
              className={`flex items-center gap-3 p-2.5 transition-colors active:bg-[var(--bg-hover)] ${isSelected ? 'bg-[var(--accent-dim)]' : ''}`}
            >
              {selectMode && (
                isSelected
                  ? <CheckCircle2 size={20} className="shrink-0 text-[var(--accent)]" fill="currentColor" stroke="var(--on-accent)" />
                  : <Circle size={20} className="shrink-0 text-[var(--text-muted)]" />
              )}
              {card.image_front_url
                ? <img src={cdnImg(card.image_front_url)} alt="" loading="lazy" decoding="async" className="h-16 w-11 shrink-0 rounded-md object-cover" />
                : <div className="flex h-16 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--bg-elevated)]">🃏</div>}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{card.player ?? '—'}</div>
                <div className="truncate text-xs text-[var(--text-muted)]">
                  {[card.year, card.set_name].filter(Boolean).join(' · ') || '—'}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {card.is_rookie && <RookieBadge compact />}
                  {card.grading_company && <GradingBadge card={card} compact />}
                  {card.numbered && <span className="tabular text-[11px] font-semibold text-[var(--accent)]">{card.numbered}</span>}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span className={`tabular text-sm font-semibold ${price != null ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'}`}>
                  {price != null ? formatEuro(price) : '—'}
                </span>
                {card.status !== 'collection' && <StatusBadge status={card.status} />}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-[var(--border)] bg-[var(--bg-secondary)]">
              {hg.headers.map((header) => {
                const sortPair = TABLE_SORT[header.column.id];
                const dir = sortPair ? (sortBy === sortPair[0] ? (sortPair[0] === sortPair[1] ? '↑' : '↓') : sortBy === sortPair[1] ? '↑' : '') : '';
                return (
                  <th
                    key={header.id}
                    onClick={sortPair ? () => onSort(sortBy === sortPair[0] ? sortPair[1] : sortPair[0]) : undefined}
                    className={`whitespace-nowrap px-3 py-2.5 text-left text-xs font-medium text-[var(--text-muted)] ${sortPair ? 'cursor-pointer select-none hover:text-[var(--text-primary)]' : ''}`}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {dir && <span className="ml-1 text-[var(--accent)]">{dir}</span>}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const isSelected = selectMode && selectedIds.has(row.original.id);
            return (
              <tr
                key={row.id}
                data-jump={rowAnchor.get(row.id)}
                onClick={() => (selectMode ? onToggleSelect(row.original.id) : onRowClick(row.original))}
                className={`group cursor-pointer border-b border-[var(--border)] transition-colors last:border-b-0 hover:bg-white/[0.03] ${isSelected ? 'bg-[var(--accent-dim)]' : ''}`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2.5 align-middle text-[var(--text-primary)]">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function useIsMobile(breakpoint = 640) {
  const [mobile, setMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const on = () => setMobile(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [breakpoint]);
  return mobile;
}

/** Tri + groupement dans un seul menu « Affichage ». */
function DisplayMenu({ viewMode }: { viewMode: 'grid' | 'table' }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const { sortBy, groupBy, setSortBy, setGroupBy } = useCollectionFilters();

  return (
    <>
      <button ref={anchor} className="ui-btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Trier et grouper">
        <ArrowUpDown size={15} />
        <span className="hidden md:inline">{SORT_LABELS[sortBy]}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={240} align="end">
        <div className="overflow-y-auto p-1">
          <div className="ui-menu-label">Trier par</div>
          {(Object.keys(SORT_LABELS) as SortBy[]).map((k) => (
            <button key={k} className="ui-menu-item" onClick={() => { setSortBy(k); setOpen(false); }}>
              <span className="flex-1">{SORT_LABELS[k]}</span>
              {sortBy === k && <Check size={15} className="text-[var(--accent)]" />}
            </button>
          ))}
          {viewMode === 'grid' && (
            <>
              <div className="ui-menu-label mt-1 border-t border-[var(--border)] pt-2">Grouper par</div>
              {(Object.keys(GROUP_BY_LABELS) as GroupBy[]).map((k) => (
                <button key={k} className="ui-menu-item" onClick={() => { setGroupBy(k); setOpen(false); }}>
                  <span className="flex-1">{GROUP_BY_LABELS[k]}</span>
                  {groupBy === k && <Check size={15} className="text-[var(--accent)]" />}
                </button>
              ))}
            </>
          )}
        </div>
      </Popover>
    </>
  );
}

function MoreMenu({ onExport, onManageFolders }: { onExport: () => void; onManageFolders: () => void }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button ref={anchor} className="ui-btn ui-btn-icon" onClick={() => setOpen((v) => !v)} aria-label="Plus d'actions" title="Plus d'actions">
        <MoreHorizontal size={16} />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={240} align="end">
        <div className="p-1">
          <button className="ui-menu-item" onClick={() => { setOpen(false); onManageFolders(); }}>
            <FolderCog size={15} className="text-[var(--text-secondary)]" /> Gérer les dossiers
          </button>
          <button className="ui-menu-item" onClick={() => { setOpen(false); onExport(); }}>
            <Download size={15} className="text-[var(--text-secondary)]" /> Exporter la sélection filtrée (CSV)
          </button>
        </div>
      </Popover>
    </>
  );
}

/** Menu déroulant de la barre d'actions groupées. S'ouvre vers le HAUT (la
 * barre est ancrée en bas de l'écran) et se referme au clic extérieur. Regroupe
 * les actions par intention pour éviter une rangée de dix boutons illisible sur
 * mobile. */
function BulkMenu({
  label,
  icon,
  disabled,
  accent,
  children,
}: {
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
  accent?: boolean;
  children: (close: () => void) => React.ReactNode;
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

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        className={`ui-btn h-8 ${accent ? 'ui-btn-primary' : ''}`}
      >
        {icon}
        {label}
        <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className="popover-surface absolute bottom-full left-0 z-50 mb-2 max-h-[60vh] min-w-[240px] overflow-y-auto p-1"
          onClick={(e) => e.stopPropagation()}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function BulkMenuItem({
  onClick,
  children,
  danger,
}: {
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`ui-menu-item ${danger ? '!text-[var(--red)]' : ''}`}
    >
      {children}
    </button>
  );
}

/** Intitulé de section d'un menu groupé. Accepte un nœud (et pas seulement du
 * texte) pour porter le logo de la plateforme : c'est la section qui identifie
 * eBay ou Whatnot, pas le bouton du menu — celui-ci couvre les deux. */
function BulkMenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="ui-menu-label flex items-center gap-1.5">
      {children}
    </div>
  );
}

export function CollectionView() {
  const { data: cards = [], isLoading } = useCards();
  const { data: folders = [] } = useFolders();
  const { viewMode, setViewMode, drillFilter, clearDrillFilter } = useAppStore();
  const filters = useCollectionFilters((s) => s.filters);
  const sortBy = useCollectionFilters((s) => s.sortBy);
  const groupBy = useCollectionFilters((s) => s.groupBy);
  const setSortBy = useCollectionFilters((s) => s.setSortBy);
  const resetFilters = useCollectionFilters((s) => s.reset);
  const applyDrill = useCollectionFilters((s) => s.applyDrill);

  const [manageFolders, setManageFolders] = useState(false);
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [ebayBulkOpen, setEbayBulkOpen] = useState(false);
  const [whatnotOpen, setWhatnotOpen] = useState(false);
  const [ebayUpdateOpen, setEbayUpdateOpen] = useState(false);
  const [vintedPublishOpen, setVintedPublishOpen] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const updateCard = useUpdateCard();
  const recalculateEbayPrices = useRecalculateEbayPrices();
  const deleteCard = useDeleteCard();
  const deleteFolder = useDeleteFolder();

  // Arrivée depuis le dashboard ou la vue Joueurs : le critère cliqué
  // remplace les filtres en cours (sinon il s'additionnerait à d'anciens
  // filtres persistés et donnerait un résultat incompréhensible).
  useLayoutEffect(() => {
    if (Object.keys(drillFilter).length === 0) return;
    applyDrill(drillFilter);
    clearDrillFilter();
  }, [drillFilter, applyDrill, clearDrillFilter]);

  // Garde selectedCard synchronisée avec les données fraîches (ex. après une
  // mutation déclenchée depuis CardDetail : prix, statut, publication eBay…)
  // au lieu de garder le snapshot pris au moment du clic.
  useEffect(() => {
    if (!selectedCard) return;
    const fresh = cards.find((c) => c.id === selectedCard.id);
    if (fresh && fresh !== selectedCard) setSelectedCard(fresh);
  }, [cards, selectedCard]);

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const ctx = useMemo(() => buildFilterContext(cards), [cards]);
  const filtered = useMemo(() => filterCards(cards, filters, ctx), [cards, filters, ctx]);
  const sorted = useMemo(() => sortCards(filtered, sortBy), [filtered, sortBy]);
  const pricingCards = useMemo(() => sorted.filter((card) => displayPrice(card) == null), [sorted]);
  const collectionSize = useMemo(() => cards.filter((c) => c.status !== 'draft').length, [cards]);
  const filteredValue = useMemo(() => filtered.reduce((sum, c) => sum + (displayPrice(c) ?? 0) * (c.quantity ?? 1), 0), [filtered]);
  const anyFilter = hasAnyFilter(filters);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function applyBulkPrice() {
    const raw = prompt('Prix de vente à appliquer aux cartes sélectionnées (€) :');
    if (raw === null) return;
    const trimmed = raw.trim();
    const price = trimmed === '' ? null : parseFloat(trimmed.replace(',', '.'));
    if (price !== null && (Number.isNaN(price) || price < 0)) {
      alert('Prix invalide.');
      return;
    }
    setBulkBusy(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) => updateCard.mutateAsync({ id, price })),
      );
      exitSelectMode();
    } finally {
      setBulkBusy(false);
    }
  }

  async function applyEbayPriceCalculation(onlyMissing: boolean) {
    if (selectedIds.size === 0) return;
    const action = onlyMissing ? 'calculer les prix eBay manquants' : 'recalculer et remplacer tous les prix eBay';
    if (!confirm(`Confirmer : ${action} pour ${selectedIds.size} carte(s) ?\nLes annonces eBay en ligne ne seront pas modifiées.`)) return;
    setBulkBusy(true);
    try {
      const result = await recalculateEbayPrices.mutateAsync({
        card_ids: [...selectedIds],
        only_missing: onlyMissing,
      });
      alert(`${result.updated} prix eBay mis à jour · ${result.skipped} carte(s) ignorée(s).`);
      exitSelectMode();
    } finally {
      setBulkBusy(false);
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function applyBulkStatus(status: CardStatus) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) => updateCard.mutateAsync({ id, status })),
      );
      exitSelectMode();
    } finally {
      setBulkBusy(false);
    }
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Supprimer ${selectedIds.size} carte(s) ?`)) return;
    setBulkBusy(true);
    try {
      await Promise.all([...selectedIds].map((id) => deleteCard.mutateAsync(id)));
      exitSelectMode();
    } finally {
      setBulkBusy(false);
    }
  }

  // Ajoute ou retire un dossier sur les cartes sélectionnées (fusion du tableau folder_ids).
  async function applyBulkFolder(folderId: string, add: boolean) {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const byId = new Map(cards.map((c) => [c.id, c]));
      await Promise.all(
        [...selectedIds].map((id) => {
          const current = byId.get(id)?.folder_ids ?? [];
          const set = new Set(current);
          if (add) set.add(folderId);
          else set.delete(folderId);
          return updateCard.mutateAsync({ id, folder_ids: [...set] });
        }),
      );
      exitSelectMode();
    } finally {
      setBulkBusy(false);
    }
  }

  // Supprime un dossier + nettoie les cartes qui le référencent.
  async function removeFolder(folderId: string) {
    if (!confirm('Supprimer ce dossier ? Les cartes ne seront pas supprimées.')) return;
    const affected = cards.filter((c) => (c.folder_ids ?? []).includes(folderId));
    await Promise.all(
      affected.map((c) =>
        updateCard.mutateAsync({ id: c.id, folder_ids: (c.folder_ids ?? []).filter((f) => f !== folderId) }),
      ),
    );
    await deleteFolder.mutateAsync(folderId);
    if (filters.facets.folder.includes(folderId)) useCollectionFilters.getState().toggleFacet('folder', folderId);
  }

  // Groupement
  const grouped = useMemo(() => {
    if (groupBy === 'none' || viewMode !== 'grid') return { '': sorted };
    const groups: Record<string, Card[]> = {};
    sorted.forEach((c) => {
      const key = groupBy === 'player'
        ? canonicalPlayer(c, ctx) ?? 'Inconnu'
        : (c[groupBy] as string | null) ?? 'Inconnu';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    const compare =
      groupBy === 'player'
        ? ([a]: [string, Card[]], [b]: [string, Card[]]) =>
            playerLastName(a).localeCompare(playerLastName(b)) || a.localeCompare(b)
        : groupBy === 'year'
          ? ([a]: [string, Card[]], [b]: [string, Card[]]) => b.localeCompare(a)
          : ([a]: [string, Card[]], [b]: [string, Card[]]) => a.localeCompare(b);
    return Object.fromEntries(Object.entries(groups).sort(compare));
  }, [sorted, groupBy, viewMode, ctx]);

  // Le répertoire A-Z n'a de sens que si l'affichage suit l'ordre alphabétique des joueurs.
  const availableInitials = useMemo(
    () => new Set(filtered.map((c) => playerInitial(c.player))),
    [filtered],
  );
  const showAlphabet = sortBy === 'player' && (groupBy === 'none' || groupBy === 'player' || viewMode === 'table') && filtered.length > 24 && availableInitials.size > 3;
  const gridAnchor = useMemo(() => {
    const m = new Map<string, string>();
    const seen = new Set<string>();
    for (const list of Object.values(grouped)) {
      for (const c of list) {
        const ini = playerInitial(c.player);
        if (!seen.has(ini)) {
          seen.add(ini);
          m.set(c.id, ini);
        }
      }
    }
    return m;
  }, [grouped]);

  function jumpToLetter(letter: string) {
    const el = document.querySelector(`[data-jump="${letter}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

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
    const rows = sorted.map((card) =>
      CSV_COLS.map((c) => escapeCell(card[c.key])).join(','),
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `collection_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns = useMemo(
    () => buildColumns(setSelectedCard, selectMode, selectedIds, toggleSelect, folderById, folders),
    [selectMode, selectedIds, folderById, folders],
  );

  const table = useReactTable({
    data: sorted,
    columns,
    enableSorting: false,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* En-tête + filtres */}
      <div className="relative z-30 shrink-0 space-y-3 border-b border-[var(--border)] bg-[var(--bg-primary)] px-4 pb-3 pt-4 sm:px-6 sm:pt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="hidden text-xl font-semibold tracking-tight text-[var(--text-primary)] lg:block">Collection</h1>
            <p className="tabular text-[13px] text-[var(--text-muted)]">
              {anyFilter ? `${filtered.length} sur ${collectionSize} cartes` : `${collectionSize} cartes`}
              {filteredValue > 0 && <> · {formatEuro(Math.round(filteredValue))} estimés</>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPricingOpen(true)}
              disabled={pricingCards.length === 0}
              className="ui-btn"
              data-active={pricingCards.length > 0}
              title="Pricer une à une les cartes sans prix (dans les filtres actuels)"
            >
              <BadgeEuro size={15} />
              <span className="hidden sm:inline">À pricer</span>
              <span className="tabular text-xs opacity-80">{pricingCards.length}</span>
            </button>
            <button
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              className="ui-btn"
              data-active={selectMode}
              title="Sélection multiple"
            >
              <ListChecks size={15} />
              <span className="hidden sm:inline">Sélectionner</span>
            </button>
            <DisplayMenu viewMode={viewMode} />
            <div className="ui-segmented">
              <button data-active={viewMode === 'grid'} onClick={() => setViewMode('grid')} aria-label="Vue grille" title="Grille">
                <LayoutGrid size={15} />
              </button>
              <button data-active={viewMode === 'table'} onClick={() => setViewMode('table')} aria-label="Vue liste" title="Liste">
                <List size={15} />
              </button>
            </div>
            <MoreMenu onExport={exportCSV} onManageFolders={() => setManageFolders(true)} />
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <StatusTabs cards={cards} ctx={ctx} />
          <SearchField />
        </div>

        <FilterRow cards={cards} ctx={ctx} folders={folders} onManageFolders={() => setManageFolders(true)} />
        <ActiveFilterChips folders={folders} resultCount={filtered.length} />
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-28 sm:px-6">
        {!isLoading && showAlphabet && (
          <div className="no-scrollbar sticky top-0 z-20 -mx-4 mb-3 flex flex-nowrap items-center gap-0.5 overflow-x-auto border-b border-[var(--border)] bg-[var(--bg-primary)]/90 px-4 py-1.5 backdrop-blur-xl sm:-mx-6 sm:justify-center sm:px-6">
            {[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#'].map((letter) => {
              const has = availableInitials.has(letter);
              return (
                <button
                  key={letter}
                  disabled={!has}
                  onClick={() => jumpToLetter(letter)}
                  className={`h-6 w-6 shrink-0 rounded-md text-[11px] font-semibold transition-colors ${
                    has
                      ? 'text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-[var(--on-accent)]'
                      : 'cursor-default text-white/15'
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}
        {!showAlphabet && <div className="h-4" />}

        {isLoading ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
                <div className="aspect-[3/4] animate-pulse bg-[var(--bg-elevated)]" />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-[var(--bg-elevated)]" />
                  <div className="h-2.5 w-1/2 animate-pulse rounded bg-[var(--bg-elevated)]" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
              <SearchX size={22} />
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {collectionSize === 0 ? 'Ta collection est vide' : 'Aucune carte ne correspond'}
              </p>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">
                {collectionSize === 0 ? 'Ajoute ta première carte avec le bouton « Ajouter ».' : 'Essaie de retirer un filtre ou de modifier la recherche.'}
              </p>
            </div>
            {anyFilter && (
              <button onClick={resetFilters} className="ui-btn mt-1">
                <X size={14} /> Effacer tous les filtres
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="space-y-8">
            {Object.entries(grouped).map(([group, groupCards]) => (
              <section key={group}>
                {groupBy !== 'none' && (
                  <div className="sticky top-0 z-10 -mx-1 mb-3 flex items-baseline gap-2 bg-[var(--bg-primary)]/90 px-1 py-2 backdrop-blur">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">{group}</h3>
                    <span className="tabular text-xs text-[var(--text-muted)]">{groupCards.length}</span>
                  </div>
                )}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] sm:gap-4">
                  {groupCards.map((card) => (
                    <GridCard
                      key={card.id}
                      card={card}
                      onClick={() => setSelectedCard(card)}
                      selectMode={selectMode}
                      selected={selectedIds.has(card.id)}
                      onToggleSelect={toggleSelect}
                      anchorLetter={gridAnchor.get(card.id)}
                      folderChips={(card.folder_ids ?? [])
                        .map((fid) => folderById.get(fid))
                        .filter((f): f is Folder => !!f)
                        .map((f) => (f.emoji ? `${f.emoji} ${f.name}` : f.name))}
                      folders={folders}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <TableView
            table={table}
            onRowClick={setSelectedCard}
            selectMode={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            sortBy={sortBy}
            onSort={setSortBy}
          />
        )}
      </div>

      {selectMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-50 px-3 lg:bottom-4">
          <div className="popover-surface pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-2 p-2.5">
            <span className="tabular px-2 text-sm font-semibold text-[var(--text-primary)]">
              {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id)))}
              disabled={bulkBusy}
              className="ui-btn h-8"
            >
              {selectedIds.size === filtered.length ? 'Tout désélectionner' : `Tout (${filtered.length})`}
            </button>

            <div className="h-6 w-px bg-[var(--border-strong)]" />

            <BulkMenu label="Statut" disabled={bulkBusy || selectedIds.size === 0}>
              {(close) => STATUS_OPTIONS.map((opt) => (
                <BulkMenuItem key={opt.value} onClick={() => { close(); applyBulkStatus(opt.value); }}>
                  {opt.label}
                </BulkMenuItem>
              ))}
            </BulkMenu>

            <BulkMenu label="Modifier" disabled={bulkBusy || selectedIds.size === 0}>
              {(close) => (
                <>
                  <BulkMenuItem onClick={() => { close(); applyBulkPrice(); }}>
                    Prix de vente…
                  </BulkMenuItem>
                  <BulkMenuItem onClick={() => { close(); applyEbayPriceCalculation(true); }}>
                    Calculer les prix eBay manquants
                  </BulkMenuItem>
                  <BulkMenuItem onClick={() => { close(); applyEbayPriceCalculation(false); }}>
                    Recalculer tous les prix eBay…
                  </BulkMenuItem>
                  {folders.length > 0 && (
                    <>
                      <BulkMenuLabel>Ajouter au dossier</BulkMenuLabel>
                      {folders.map((f) => (
                        <BulkMenuItem key={`add-${f.id}`} onClick={() => { close(); applyBulkFolder(f.id, true); }}>
                          {f.emoji ? `${f.emoji} ` : ''}{f.name}
                        </BulkMenuItem>
                      ))}
                      <BulkMenuLabel>Retirer du dossier</BulkMenuLabel>
                      {folders.map((f) => (
                        <BulkMenuItem key={`rm-${f.id}`} onClick={() => { close(); applyBulkFolder(f.id, false); }}>
                          {f.emoji ? `${f.emoji} ` : ''}{f.name}
                        </BulkMenuItem>
                      ))}
                    </>
                  )}
                </>
              )}
            </BulkMenu>

            <BulkMenu
              label="Vendre"
              accent
              icon={<ShoppingBag size={14} />}
              disabled={bulkBusy || selectedIds.size === 0}
            >
              {(close) => (
                <>
                  <BulkMenuLabel><EbayLogo width={30} height={12} /></BulkMenuLabel>
                  <BulkMenuItem onClick={() => { close(); setEbayBulkOpen(true); }}>
                    Publier les non listées
                  </BulkMenuItem>
                  <BulkMenuItem onClick={() => { close(); setEbayUpdateOpen(true); }}>
                    Mettre à jour les annonces (prix + stock)
                  </BulkMenuItem>
                  <BulkMenuLabel><VintedLogo width={38} height={12} /></BulkMenuLabel>
                  <BulkMenuItem onClick={() => { close(); setVintedPublishOpen(true); }}>
                    Publier les non listées en chaîne
                  </BulkMenuItem>
                  <BulkMenuLabel>Whatnot</BulkMenuLabel>
                  <BulkMenuItem onClick={() => { close(); setWhatnotOpen(true); }}>
                    <Download size={13} /> Exporter en CSV
                  </BulkMenuItem>
                </>
              )}
            </BulkMenu>

            <button
              onClick={bulkDelete}
              disabled={bulkBusy || selectedIds.size === 0}
              title="Supprimer"
              className="ui-btn h-8 text-[var(--red)] hover:!text-[var(--red)]"
            >
              <Trash2 size={14} />
              <span className="hidden sm:inline">Supprimer</span>
            </button>

            <div className="flex-1" />

            <button onClick={exitSelectMode} disabled={bulkBusy} className="ui-btn ui-btn-icon h-8 w-8" aria-label="Quitter la sélection" title="Quitter la sélection">
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {selectedCard && (
        <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />
      )}

      {pricingOpen && (
        <PricingFlow cards={pricingCards} onClose={() => setPricingOpen(false)} />
      )}

      {ebayBulkOpen && (
        <EbayBulkPublishModal
          cards={cards.filter((c) => selectedIds.has(c.id))}
          onClose={() => setEbayBulkOpen(false)}
        />
      )}

      {whatnotOpen && (
        <WhatnotExportModal
          cards={cards.filter((c) => selectedIds.has(c.id))}
          onClose={() => setWhatnotOpen(false)}
        />
      )}

      {ebayUpdateOpen && (
        <EbayStockSyncModal
          cardIds={[...selectedIds]}
          onClose={() => setEbayUpdateOpen(false)}
        />
      )}

      {vintedPublishOpen && (
        <VintedPublishFlow
          cards={cards.filter((c) => selectedIds.has(c.id))}
          onClose={() => setVintedPublishOpen(false)}
        />
      )}

      {manageFolders && (
        <FolderManager folders={folders} onClose={() => setManageFolders(false)} onDelete={removeFolder} />
      )}
    </div>
  );
}

function FolderQuickAssign({
  card,
  folders,
  variant,
}: {
  card: Card;
  folders: Folder[];
  variant: 'overlay' | 'icon';
}) {
  const updateCard = useUpdateCard();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const current = new Set(card.folder_ids ?? []);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (popRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    function close() { setOpen(false); }
    document.addEventListener('mousedown', handle);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', handle);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  function openMenu(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    const r = triggerRef.current!.getBoundingClientRect();
    const width = 224;
    const estH = Math.min(folders.length * 38 + 14, 280);
    const openUp = r.bottom + estH > window.innerHeight;
    setPos({
      top: openUp ? Math.max(8, r.top - estH - 4) : r.bottom + 4,
      left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)),
    });
    setOpen(true);
  }

  function toggle(e: React.MouseEvent, fid: string) {
    e.stopPropagation();
    const next = new Set(current);
    if (next.has(fid)) next.delete(fid);
    else next.add(fid);
    updateCard.mutate({ id: card.id, folder_ids: [...next] });
  }

  return (
    <>
      <span
        ref={triggerRef}
        role="button"
        tabIndex={0}
        onClick={openMenu}
        className={variant === 'overlay'
          ? 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-black/55 text-white shadow-lg backdrop-blur-sm hover:bg-black/75'
          : 'inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-white/10 hover:text-white'}
        title="Ranger dans un dossier"
      >
        <FolderIcon size={variant === 'overlay' ? 15 : 14} />
      </span>
      {open && pos && createPortal(
        <div
          ref={popRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: 224 }}
          className="z-[80] max-h-[280px] overflow-auto rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-1.5 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {folders.map((f) => {
            const active = current.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={(e) => toggle(e, f.id)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-semibold hover:bg-white/10"
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${active ? 'border-[var(--accent)] bg-[var(--accent)] text-black' : 'border-white/20 text-transparent'}`}>
                  <Check size={11} />
                </span>
                {f.emoji && <span>{f.emoji}</span>}
                <span className="truncate text-white/90">{f.name}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

const EMOJI_CHOICES = [
  '🏀', '⚾', '🏈', '⚽', '🏒', '🎾', '🏐', '🏉',
  '🥎', '🎱', '🏓', '🥊', '🥇', '🥈', '🥉', '🏆',
  '⭐', '🔥', '💎', '👑', '💰', '📈', '🎯', '✨',
  '❤️', '💙', '💚', '💛', '💜', '🧡', '🖤', '🤍',
  '🇺🇸', '🇫🇷', '🇨🇦', '🦁', '🐍', '🐂', '🦅', '🐻',
  '📁', '📦', '🗂️', '🔒', '⚡', '🌟', '🎬', '🎵',
];

function EmojiPicker({ value, onChange }: { value: string; onChange: (emoji: string) => void }) {
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

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-[38px] w-12 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lg outline-none hover:bg-white/10 focus:border-[var(--accent)]/50"
        title="Choisir un emoji"
      >
        {value || <span className="text-[var(--text-muted)]"><Smile size={16} /></span>}
      </button>
      {open && (
        <div className="absolute left-0 top-[44px] z-20 w-60 rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-2 shadow-2xl">
          <div className="grid grid-cols-8 gap-1">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-white/10"
              title="Aucun"
            >
              <X size={13} />
            </button>
            {EMOJI_CHOICES.map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => { onChange(e); setOpen(false); }}
                className={`flex h-7 w-7 items-center justify-center rounded-lg text-base hover:bg-white/10 ${value === e ? 'bg-[var(--accent-dim)] ring-1 ring-[var(--accent)]' : ''}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FolderManager({
  folders,
  onClose,
  onDelete,
}: {
  folders: Folder[];
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const [newEmoji, setNewEmoji] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await createFolder.mutateAsync({ name, emoji: newEmoji.trim() || null, position: folders.length });
      setNewEmoji('');
      setNewName('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[var(--bg-card)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-white">Dossiers</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-white/10 hover:text-white">
            <X size={16} />
          </button>
        </div>

        {/* Création */}
        <div className="mb-4 flex items-center gap-2">
          <EmojiPicker value={newEmoji} onChange={setNewEmoji} />
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
            placeholder="Nom du dossier"
            className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm outline-none focus:border-[var(--accent)]/50"
          />
          <button
            onClick={handleCreate}
            disabled={busy || !newName.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-dim)] px-3 py-2 text-xs font-bold text-[var(--accent)] hover:opacity-90 disabled:opacity-40"
          >
            <FolderPlus size={14} />
            Créer
          </button>
        </div>

        {/* Liste */}
        <div className="max-h-[50vh] space-y-2 overflow-auto">
          {folders.length === 0 && (
            <p className="py-6 text-center text-xs text-[var(--text-muted)]">Aucun dossier pour le moment.</p>
          )}
          {folders.map((f) => (
            <FolderRow key={f.id} folder={f} onSave={(emoji, name) => updateFolder.mutate({ id: f.id, emoji, name })} onDelete={() => onDelete(f.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function FolderRow({
  folder,
  onSave,
  onDelete,
}: {
  folder: Folder;
  onSave: (emoji: string | null, name: string) => void;
  onDelete: () => void;
}) {
  const [emoji, setEmoji] = useState(folder.emoji ?? '');
  const [name, setName] = useState(folder.name);
  const dirty = emoji !== (folder.emoji ?? '') || name !== folder.name;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] p-2">
      <EmojiPicker value={emoji} onChange={setEmoji} />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm outline-none focus:border-[var(--accent)]/50"
      />
      <button
        onClick={() => name.trim() && onSave(emoji.trim() || null, name.trim())}
        disabled={!dirty || !name.trim()}
        className="rounded-lg p-2 text-[var(--accent)] hover:bg-[var(--accent-dim)] disabled:opacity-30"
        title="Enregistrer"
      >
        <Check size={15} />
      </button>
      <button
        onClick={onDelete}
        className="rounded-lg p-2 text-red-300 hover:bg-red-500/15"
        title="Supprimer"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
