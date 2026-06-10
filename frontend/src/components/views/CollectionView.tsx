import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  ChevronDown,
  CheckCircle2,
  Circle,
  ListChecks,
  FolderPlus,
  Settings2,
  Check,
  Smile,
  Folder as FolderIcon,
  ArrowUpDown,
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
import { useFolders, useCreateFolder, useUpdateFolder, useDeleteFolder } from '../../hooks/useFolders';
import { useAppStore } from '../../stores/appStore';
import type { Card, CardStatus, CardType, Folder } from '../../types';
import { GradingBadge } from '../shared/GradingBadge';
import { StatusBadge } from '../shared/StatusBadge';
import { CardDetail } from '../shared/CardDetail';
import { RookieBadge } from '../shared/RookieBadge';

import { normalizeParallelName } from '../../lib/cardQuality';
import { playerLastName, playerInitial } from '../../lib/playerName';

type FilterTab = 'all' | 'a_vendre' | 'vendu';
type GroupBy = 'none' | 'player' | 'team' | 'brand' | 'set_name' | 'year';
type SortBy = 'recent' | 'player' | 'year_desc' | 'year_asc' | 'price_desc' | 'price_asc' | 'numbered';
type ListingFilter = 'all' | 'online' | 'vinted' | 'ebay' | 'offline';

const SORT_LABELS: Record<SortBy, string> = {
  recent: 'Plus récentes',
  player: 'Joueur A-Z',
  year_desc: 'Année ↓',
  year_asc: 'Année ↑',
  price_desc: 'Prix ↓',
  price_asc: 'Prix ↑',
  numbered: 'Numérotation #',
};

const GROUP_BY_LABELS: Record<GroupBy, string> = {
  none: 'Aucun',
  player: 'Joueur',
  team: 'Équipe',
  brand: 'Marque',
  set_name: 'Collection',
  year: 'Année',
};

function seasonStart(year: string | null | undefined): number {
  if (!year) return -1;
  const match = year.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : -1;
}

function numberedValue(numbered: string | null | undefined): number {
  if (!numbered) return Number.POSITIVE_INFINITY;
  const match = numbered.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

function sortCards(list: Card[], sortBy: SortBy): Card[] {
  if (sortBy === 'recent') return list;
  return [...list].sort((a, b) => {
    switch (sortBy) {
      case 'player':
        return playerLastName(a.player).localeCompare(playerLastName(b.player)) || (a.player ?? '').localeCompare(b.player ?? '');
      case 'year_desc':
        return seasonStart(b.year) - seasonStart(a.year);
      case 'year_asc':
        return seasonStart(a.year) - seasonStart(b.year);
      case 'price_desc':
        return (b.price ?? -1) - (a.price ?? -1);
      case 'price_asc':
        return (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY);
      case 'numbered':
        return numberedValue(a.numbered) - numberedValue(b.numbered);
      default:
        return 0;
    }
  });
}


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
          <div className="flex items-center gap-3">
            {card.image_front_url
              ? <img src={card.image_front_url} alt="" loading="lazy" decoding="async" className="w-10 h-14 object-contain rounded-md shrink-0" />
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
  return (
    <motion.button
      whileHover={{ y: -4 }}
      data-jump={anchorLetter}
      onClick={() => (selectMode ? onToggleSelect?.(card.id) : onClick())}
      className={`group relative bg-[var(--bg-card)] rounded-3xl overflow-hidden border transition-all duration-300 hover:shadow-2xl hover:shadow-[var(--accent-glow)] text-left w-full glass ${
        selected ? 'border-[var(--accent)] ring-2 ring-[var(--accent)]' : 'border-white/5 hover:border-[var(--accent)]/40'
      }`}
    >
      <div className="relative aspect-[3/4] bg-[var(--bg-primary)] overflow-hidden">
        {selectMode && (
          <div className="absolute top-3 right-3 z-20">
            {selected ? (
              <CheckCircle2 size={26} className="text-[var(--accent)] drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]" fill="currentColor" />
            ) : (
              <Circle size={26} className="text-white/80 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]" />
            )}
          </div>
        )}
        {!selectMode && folders.length > 0 && (
          <div className="absolute top-3 right-3 z-20">
            <FolderQuickAssign card={card} folders={folders} variant="overlay" />
          </div>
        )}
        {card.image_front_url ? (
          <img
            src={card.image_front_url}
            alt={card.player ?? ''}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-4xl opacity-10">🃏</span>
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
          {(card.quantity ?? 1) > 1 && (
            <div className="h-5 px-2 rounded-lg flex items-center justify-center text-[9px] font-black bg-[#6366F1] text-white shadow-lg shadow-indigo-900/40 border border-indigo-400/20 backdrop-blur-sm" title={`${card.quantity} exemplaires`}>
              ×{card.quantity}
            </div>
          )}
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-card)] via-transparent to-transparent opacity-60 group-hover:opacity-40 transition-opacity" />

        {(folderChips.length > 0 || card.status !== 'collection') && (
          <div className="absolute bottom-3 left-3 z-10 flex flex-col items-start gap-1.5">
            {folderChips.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {folderChips.map((chip, i) => (
                  <span
                    key={i}
                    className="max-w-[120px] truncate rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-lg border border-white/10 backdrop-blur-sm"
                    title={chip}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            )}
            {card.status !== 'collection' && <StatusBadge status={card.status} />}
          </div>
        )}

        {(card.vinted_url || card.ebay_url) && (
          <div className="absolute bottom-3 right-3 z-10 flex gap-1">
            {card.vinted_url && (
              <span className="h-5 px-1.5 rounded-md flex items-center text-[9px] font-black bg-[#007782] text-white shadow-lg border border-white/10 backdrop-blur-sm" title="Annonce Vinted">
                V
              </span>
            )}
            {card.ebay_url && (
              <span className="h-5 px-1.5 rounded-md flex items-center text-[9px] font-black bg-[#E53238] text-white shadow-lg border border-white/10 backdrop-blur-sm" title="Annonce eBay">
                e
              </span>
            )}
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

function TableView({ table, onRowClick, selectMode, selectedIds, onToggleSelect }: { table: ReturnType<typeof useReactTable<Card>>; onRowClick: (card: Card) => void; selectMode: boolean; selectedIds: Set<string>; onToggleSelect: (id: string) => void }) {
  const isMobile = window.innerWidth < 640;

  // Premier id de ligne pour chaque initiale (répertoire A-Z).
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
          {table.getRowModel().rows.map((row, i) => {
            const isSelected = selectMode && selectedIds.has(row.original.id);
            return (
              <tr
                key={row.id}
                data-jump={rowAnchor.get(row.id)}
                onClick={() => (selectMode ? onToggleSelect(row.original.id) : onRowClick(row.original))}
                className={`group border-b border-white/5 cursor-pointer transition-colors hover:bg-white/[0.04] ${isSelected ? 'bg-[var(--accent-dim)]' : i % 2 === 0 ? '' : 'bg-white/[0.02]'
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
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CollectionView() {
  const { data: cards = [], isLoading } = useCards();
  const { data: folders = [] } = useFolders();
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
  const [listingFilter, setListingFilter] = useState<ListingFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('player');
  const [folderFilter, setFolderFilter] = useState<string | null>(null); // id de dossier, ou '__none__' pour Non classé
  const [manageFolders, setManageFolders] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const updateCard = useUpdateCard();
  const deleteCard = useDeleteCard();
  const deleteFolder = useDeleteFolder();

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

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
    if (folderFilter === folderId) setFolderFilter(null);
  }

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
      if (listingFilter !== 'all') {
        const hasV = !!c.vinted_url;
        const hasE = !!c.ebay_url;
        if (listingFilter === 'online' && !(hasV || hasE)) return false;
        if (listingFilter === 'vinted' && !hasV) return false;
        if (listingFilter === 'ebay' && !hasE) return false;
        if (listingFilter === 'offline' && (hasV || hasE)) return false;
      }
      if (folderFilter) {
        const fids = c.folder_ids ?? [];
        if (folderFilter === '__none__') {
          if (fids.length > 0) return false;
        } else if (!fids.includes(folderFilter)) {
          return false;
        }
      }
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
  }, [cards, statusFilter, playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter, rookieOnly, listingFilter, folderFilter, search]);

  // Tri appliqué après filtrage (grille + tableau).
  const sorted = useMemo(() => sortCards(filtered, sortBy), [filtered, sortBy]);

  // Compteurs annonces.
  const listingCounts = useMemo(() => {
    let online = 0, vinted = 0, ebay = 0, offline = 0;
    cards.forEach((c) => {
      if (c.status === 'draft') return;
      const hasV = !!c.vinted_url, hasE = !!c.ebay_url;
      if (hasV) vinted += 1;
      if (hasE) ebay += 1;
      if (hasV || hasE) online += 1;
      else offline += 1;
    });
    return { online, vinted, ebay, offline };
  }, [cards]);

  // Compteurs par dossier (cartes hors brouillon).
  const folderCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    let unfiled = 0;
    cards.forEach((c) => {
      if (c.status === 'draft') return;
      const fids = c.folder_ids ?? [];
      if (fids.length === 0) unfiled += 1;
      fids.forEach((fid) => { counts[fid] = (counts[fid] ?? 0) + 1; });
    });
    return { counts, unfiled };
  }, [cards]);

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
    if (groupBy === 'none') return { '': sorted };
    const groups: Record<string, Card[]> = {};
    sorted.forEach((c) => {
      const key = (c[groupBy] as string | null) ?? 'Inconnu';
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    });
    // Pour un classement par joueur, on trie sur le nom de famille (suffixes / multi-joueurs gérés).
    const compare =
      groupBy === 'player'
        ? ([a]: [string, Card[]], [b]: [string, Card[]]) =>
            playerLastName(a).localeCompare(playerLastName(b)) || a.localeCompare(b)
        : ([a]: [string, Card[]], [b]: [string, Card[]]) => a.localeCompare(b);
    return Object.fromEntries(Object.entries(groups).sort(compare));
  }, [sorted, groupBy]);

  // Répertoire alphabétique : initiales présentes + ancre (1er id de carte par initiale dans l'ordre affiché en grille).
  const availableInitials = useMemo(
    () => new Set(filtered.map((c) => playerInitial(c.player))),
    [filtered],
  );
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

  const rookieCount = useMemo(() => cards.filter((c) => c.is_rookie).length, [cards]);
  const activeFiltersCount = [playerFilter, teamFilter, brandFilter, setFilter, yearFilter, typeFilter, rookieOnly ? 'rookie' : null, listingFilter !== 'all' ? 'listing' : null].filter(Boolean).length;

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

  const columns = useMemo(
    () => buildColumns(setSelectedCard, selectMode, selectedIds, toggleSelect, folderById, folders),
    [selectMode, selectedIds, folderById, folders],
  );

  const table = useReactTable({
    data: sorted,
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
    <div className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_50%_-20%,_var(--accent-dim)_0%,_transparent_70%)]">
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
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              className="p-3 rounded-2xl border transition-all active:scale-95"
              style={selectMode
                ? { background: 'var(--accent)', color: '#09090B', borderColor: 'var(--border-accent)' }
                : { background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}
              title="Sélection multiple"
            >
              <ListChecks size={16} />
            </button>

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
            <FilterDropdown
              label="Annonce"
              items={[
                { value: 'online', label: 'En ligne', count: listingCounts.online },
                { value: 'vinted', label: 'Vinted', count: listingCounts.vinted },
                { value: 'ebay', label: 'eBay', count: listingCounts.ebay },
                { value: 'offline', label: 'Hors ligne', count: listingCounts.offline },
              ]}
              selected={listingFilter === 'all' ? null : listingFilter}
              onSelect={(v) => setListingFilter((v as ListingFilter) ?? 'all')}
            />

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
                onClick={() => { setPlayerFilter(null); setTeamFilter(null); setBrandFilter(null); setSetFilter(null); setYearFilter(null); setTypeFilter(null); setRookieOnly(false); setListingFilter('all'); clearDrillFilter(); }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
                style={{ color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)' }}
              >
                Effacer ({activeFiltersCount})
              </button>
            )}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-3">
            {/* Trier par (grille + tableau) */}
            <div className="flex items-center gap-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-2xl">
              <ArrowUpDown size={12} className="text-white/20" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="bg-transparent text-[10px] font-black uppercase tracking-[0.2em] outline-none cursor-pointer text-white/40 hover:text-white transition-colors appearance-none"
                title="Trier par"
              >
                {(Object.keys(SORT_LABELS) as SortBy[]).map((k) => (
                  <option key={k} value={k} className="bg-[#18181b]">TRI : {SORT_LABELS[k].toUpperCase()}</option>
                ))}
              </select>
            </div>

            {/* Grouper par (grille uniquement) */}
            {viewMode === 'grid' && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/5 px-3 py-1.5 rounded-2xl">
                <Group size={12} className="text-white/20" />
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                  className="bg-transparent text-[10px] font-black uppercase tracking-[0.2em] outline-none cursor-pointer text-white/40 hover:text-white transition-colors appearance-none"
                  title="Grouper par"
                >
                  {(Object.keys(GROUP_BY_LABELS) as GroupBy[]).map((k) => (
                    <option key={k} value={k} className="bg-[#18181b]">GROUPE : {GROUP_BY_LABELS[k].toUpperCase()}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* Row 3: dossiers */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFolderFilter(null)}
            className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 border"
            style={folderFilter === null
              ? { background: 'var(--accent)', color: '#09090B', borderColor: 'var(--border-accent)' }
              : { background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            Tous
          </button>
          {folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setFolderFilter((prev) => (prev === f.id ? null : f.id))}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 border inline-flex items-center gap-1.5"
              style={folderFilter === f.id
                ? { background: 'var(--accent)', color: '#09090B', borderColor: 'var(--border-accent)' }
                : { background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
            >
              {f.emoji && <span>{f.emoji}</span>}
              {f.name}
              <span className={`px-1.5 py-0.5 rounded-lg text-[9px] font-black ${folderFilter === f.id ? 'bg-black/10' : 'bg-white/10'}`}>
                {folderCounts.counts[f.id] ?? 0}
              </span>
            </button>
          ))}
          {folderCounts.unfiled > 0 && (
            <button
              onClick={() => setFolderFilter((prev) => (prev === '__none__' ? null : '__none__'))}
              className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 border"
              style={folderFilter === '__none__'
                ? { background: 'var(--accent)', color: '#09090B', borderColor: 'var(--border-accent)' }
                : { background: 'var(--bg-secondary)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}
            >
              Non classé ({folderCounts.unfiled})
            </button>
          )}
          <button
            onClick={() => setManageFolders(true)}
            className="px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 border inline-flex items-center gap-1.5 bg-white/5 border-white/5 text-[var(--text-secondary)] hover:text-white hover:bg-white/10"
            title="Gérer les dossiers"
          >
            <Settings2 size={13} />
            Gérer
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
        {!isLoading && filtered.length > 0 && (
          <div className="sticky top-0 z-20 -mx-6 mb-4 flex flex-wrap items-center justify-center gap-0.5 border-b border-white/5 bg-[var(--bg-primary)]/90 px-6 py-2.5 backdrop-blur-xl">
            {[...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), '#'].map((letter) => {
              const has = availableInitials.has(letter);
              return (
                <button
                  key={letter}
                  disabled={!has}
                  onClick={() => jumpToLetter(letter)}
                  className={`h-6 w-6 rounded-md text-[11px] font-bold transition-colors ${
                    has
                      ? 'text-[var(--text-secondary)] hover:bg-[var(--accent)] hover:text-black'
                      : 'cursor-default text-[var(--text-muted)]/30'
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}
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
                onClick={() => { setPlayerFilter(null); setTeamFilter(null); setBrandFilter(null); setSetFilter(null); setYearFilter(null); setTypeFilter(null); setRookieOnly(false); setListingFilter('all'); setSearch(''); }}
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
              </div>
            ))}
          </div>
        ) : (
          <TableView table={table} onRowClick={setSelectedCard} selectMode={selectMode} selectedIds={selectedIds} onToggleSelect={toggleSelect} />
        )}
      </div>

      {selectMode && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-4 pb-4">
          <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-[1.5rem] border border-white/10 bg-black/80 p-3 shadow-2xl backdrop-blur-2xl">
            <span className="px-2 text-sm font-bold text-white">
              {selectedIds.size} sélectionnée{selectedIds.size > 1 ? 's' : ''}
            </span>
            <button
              onClick={() => setSelectedIds(new Set(filtered.map((c) => c.id)))}
              disabled={bulkBusy}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/10 disabled:opacity-40"
            >
              Tout ({filtered.length})
            </button>

            <div className="h-6 w-px bg-white/10" />

            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">Statut →</span>
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => applyBulkStatus(opt.value)}
                disabled={bulkBusy || selectedIds.size === 0}
                className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-dim)] px-3 py-2 text-xs font-bold text-[var(--accent)] transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {opt.label}
              </button>
            ))}

            <div className="h-6 w-px bg-white/10" />

            <button
              onClick={applyBulkPrice}
              disabled={bulkBusy || selectedIds.size === 0}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/85 transition-all hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prix de vente…
            </button>

            {folders.length > 0 && (
              <>
                <div className="h-6 w-px bg-white/10" />
                <select
                  value=""
                  disabled={bulkBusy || selectedIds.size === 0}
                  onChange={(e) => { if (e.target.value) applyBulkFolder(e.target.value, true); e.target.value = ''; }}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/85 outline-none transition-all hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="" className="bg-[#18181b]">Ajouter au dossier…</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id} className="bg-[#18181b]">{f.emoji ? `${f.emoji} ` : ''}{f.name}</option>
                  ))}
                </select>
                <select
                  value=""
                  disabled={bulkBusy || selectedIds.size === 0}
                  onChange={(e) => { if (e.target.value) applyBulkFolder(e.target.value, false); e.target.value = ''; }}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/85 outline-none transition-all hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <option value="" className="bg-[#18181b]">Retirer du dossier…</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id} className="bg-[#18181b]">{f.emoji ? `${f.emoji} ` : ''}{f.name}</option>
                  ))}
                </select>
              </>
            )}

            <div className="h-6 w-px bg-white/10" />

            <button
              onClick={bulkDelete}
              disabled={bulkBusy || selectedIds.size === 0}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 size={14} />
              Supprimer
            </button>

            <div className="flex-1" />

            <button
              onClick={exitSelectMode}
              disabled={bulkBusy}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/10 disabled:opacity-40"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {selectedCard && (
        <CardDetail card={selectedCard} onClose={() => setSelectedCard(null)} />
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
