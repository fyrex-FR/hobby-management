import { useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { Card, CardType, Folder } from '../../types';
import {
  CARD_TYPE_LABELS,
  FACET_LABELS,
  FLAG_LABELS,
  LISTING_LABELS,
  STATUS_LABELS,
  UNFILED,
  facetOptions,
  flagCounts,
  listingCounts,
  statusCounts,
  type FacetKey,
  type FilterContext,
  type FlagKey,
  type ListingFilter,
  type StatusFilter,
} from '../../lib/collectionFilters';
import { useCollectionFilters } from '../../stores/collectionFilterStore';
import { Popover } from './Popover';

const FACETS_SHOWN: FacetKey[] = ['sport', 'player', 'team', 'set_name', 'brand', 'year', 'card_type', 'folder'];
const FLAGS_SHOWN: FlagKey[] = ['rookie', 'numbered', 'auto', 'patch', 'graded', 'no_price'];
const STATUSES: StatusFilter[] = ['all', 'collection', 'a_vendre', 'reserve', 'vendu'];

function useFacetLabel(folderById: Map<string, Folder>) {
  return (key: FacetKey, value: string): string => {
    if (key === 'card_type') return CARD_TYPE_LABELS[value as CardType] ?? value;
    if (key === 'folder') {
      if (value === UNFILED) return 'Non classé';
      const f = folderById.get(value);
      return f ? `${f.emoji ? `${f.emoji} ` : ''}${f.name}` : 'Dossier supprimé';
    }
    return value;
  };
}

/** Onglets de statut, avec compteurs qui suivent les autres filtres. */
export function StatusTabs({ cards, ctx }: { cards: Card[]; ctx: FilterContext }) {
  const filters = useCollectionFilters((s) => s.filters);
  const setStatus = useCollectionFilters((s) => s.setStatus);
  const counts = useMemo(() => statusCounts(cards, filters, ctx), [cards, filters, ctx]);

  return (
    <div className="ui-segmented max-w-full overflow-x-auto no-scrollbar" role="tablist">
      {STATUSES.map((s) => (
        <button key={s} role="tab" aria-selected={filters.status === s} data-active={filters.status === s} onClick={() => setStatus(s)}>
          {STATUS_LABELS[s]}
          <span className="count">{counts[s]}</span>
        </button>
      ))}
    </div>
  );
}

export function SearchField() {
  const search = useCollectionFilters((s) => s.filters.search);
  const setSearch = useCollectionFilters((s) => s.setSearch);
  return (
    <div className="relative min-w-0 flex-1">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Joueur, set, parallel, année…"
        className="ui-input pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
        aria-label="Rechercher dans la collection"
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
  );
}

function FacetMenu({
  facet,
  cards,
  ctx,
  label,
  onManageFolders,
}: {
  facet: FacetKey;
  cards: Card[];
  ctx: FilterContext;
  label: (key: FacetKey, value: string) => string;
  onManageFolders?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const anchor = useRef<HTMLButtonElement>(null);
  const filters = useCollectionFilters((s) => s.filters);
  const toggleFacet = useCollectionFilters((s) => s.toggleFacet);
  const clearFacet = useCollectionFilters((s) => s.clearFacet);
  const selected = filters.facets[facet];

  // Calcul seulement à l'ouverture : 8 facettes × toute la collection à
  // chaque frappe dans la recherche serait du gaspillage.
  const options = useMemo(
    () => (open ? facetOptions(cards, filters, ctx, facet) : []),
    [open, cards, filters, ctx, facet],
  );
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => label(facet, o.value).toLowerCase().includes(q));
  }, [options, query, label, facet]);

  const buttonText =
    selected.length === 0
      ? FACET_LABELS[facet]
      : selected.length === 1
        ? label(facet, selected[0])
        : `${FACET_LABELS[facet]} · ${selected.length}`;

  return (
    <>
      <button
        ref={anchor}
        className="ui-chip max-w-[220px]"
        data-active={selected.length > 0}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="truncate">{buttonText}</span>
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => { setOpen(false); setQuery(''); }}>
        {options.length > 8 && (
          <div className="border-b border-[var(--border)] p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Chercher un ${FACET_LABELS[facet].toLowerCase()}…`}
              className="ui-input h-8"
            />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {visible.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-[var(--text-muted)]">Aucun résultat</p>
          )}
          {visible.map((o) => {
            const active = selected.includes(o.value);
            return (
              <button key={o.value} className="ui-menu-item" onClick={() => toggleFacet(facet, o.value)}>
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    active ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--on-accent)]' : 'border-[var(--border-strong)]'
                  }`}
                >
                  {active && <Check size={12} strokeWidth={3} />}
                </span>
                <span className="min-w-0 flex-1 truncate">{label(facet, o.value)}</span>
                <span className="tabular text-xs text-[var(--text-muted)]">{o.count}</span>
              </button>
            );
          })}
        </div>
        {(selected.length > 0 || onManageFolders) && (
          <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] p-2">
            {onManageFolders ? (
              <button className="text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]" onClick={() => { setOpen(false); onManageFolders(); }}>
                Gérer les dossiers
              </button>
            ) : <span />}
            {selected.length > 0 && (
              <button className="text-[13px] font-medium text-[var(--accent)]" onClick={() => clearFacet(facet)}>
                Effacer
              </button>
            )}
          </div>
        )}
      </Popover>
    </>
  );
}

function ListingMenu({ cards, ctx }: { cards: Card[]; ctx: FilterContext }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const filters = useCollectionFilters((s) => s.filters);
  const setListing = useCollectionFilters((s) => s.setListing);
  const counts = useMemo(() => (open ? listingCounts(cards, filters, ctx) : null), [open, cards, filters, ctx]);
  const active = filters.listing !== 'all';

  return (
    <>
      <button ref={anchor} className="ui-chip" data-active={active} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {active ? LISTING_LABELS[filters.listing as Exclude<ListingFilter, 'all'>] : 'Annonce'}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={() => setOpen(false)} width={260}>
        <div className="p-1">
          {(Object.keys(LISTING_LABELS) as Exclude<ListingFilter, 'all'>[]).map((k) => (
            <button
              key={k}
              className="ui-menu-item"
              onClick={() => { setListing(filters.listing === k ? 'all' : k); setOpen(false); }}
            >
              <span className={`h-3.5 w-3.5 shrink-0 rounded-full border ${filters.listing === k ? 'border-[4px] border-[var(--accent)]' : 'border-[var(--border-strong)]'}`} />
              <span className="flex-1">{LISTING_LABELS[k]}</span>
              <span className="tabular text-xs text-[var(--text-muted)]">{counts?.[k] ?? ''}</span>
            </button>
          ))}
        </div>
        {active && (
          <div className="border-t border-[var(--border)] p-2 text-right">
            <button className="text-[13px] font-medium text-[var(--accent)]" onClick={() => { setListing('all'); setOpen(false); }}>
              Effacer
            </button>
          </div>
        )}
      </Popover>
    </>
  );
}

/** Rangée de filtres : facettes multi-sélection + bascules rapides. */
export function FilterRow({
  cards,
  ctx,
  folders,
  onManageFolders,
}: {
  cards: Card[];
  ctx: FilterContext;
  folders: Folder[];
  onManageFolders: () => void;
}) {
  const filters = useCollectionFilters((s) => s.filters);
  const toggleFlag = useCollectionFilters((s) => s.toggleFlag);
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const label = useFacetLabel(folderById);
  const flagN = useMemo(() => flagCounts(cards, filters, ctx), [cards, filters, ctx]);

  return (
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 no-scrollbar sm:-mx-6 sm:px-6">
      {FACETS_SHOWN.map((f) => (
        <FacetMenu
          key={f}
          facet={f}
          cards={cards}
          ctx={ctx}
          label={label}
          onManageFolders={f === 'folder' ? onManageFolders : undefined}
        />
      ))}
      <ListingMenu cards={cards} ctx={ctx} />
      <span className="mx-1 h-5 w-px shrink-0 bg-[var(--border-strong)]" />
      {FLAGS_SHOWN.map((flag) => {
        const active = filters.flags.includes(flag);
        if (!active && flagN[flag] === 0) return null;
        return (
          <button key={flag} className="ui-chip" data-active={active} onClick={() => toggleFlag(flag)} aria-pressed={active}>
            {FLAG_LABELS[flag]}
            <span className="count">{flagN[flag]}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Pastilles des filtres actifs, chacune retirable, + « Tout effacer ». */
export function ActiveFilterChips({ folders, resultCount }: { folders: Folder[]; resultCount: number }) {
  const filters = useCollectionFilters((s) => s.filters);
  const { toggleFacet, toggleFlag, setListing, setStatus, setSearch, reset } = useCollectionFilters();
  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const label = useFacetLabel(folderById);

  const chips: { key: string; text: string; onRemove: () => void }[] = [];
  if (filters.status !== 'all') chips.push({ key: 'status', text: STATUS_LABELS[filters.status], onRemove: () => setStatus('all') });
  if (filters.search.trim()) chips.push({ key: 'search', text: `« ${filters.search.trim()} »`, onRemove: () => setSearch('') });
  for (const f of FACETS_SHOWN) {
    for (const v of filters.facets[f]) {
      chips.push({ key: `${f}:${v}`, text: `${FACET_LABELS[f]} : ${label(f, v)}`, onRemove: () => toggleFacet(f, v) });
    }
  }
  if (filters.listing !== 'all') {
    chips.push({ key: 'listing', text: LISTING_LABELS[filters.listing as Exclude<ListingFilter, 'all'>], onRemove: () => setListing('all') });
  }
  for (const flag of filters.flags) chips.push({ key: flag, text: FLAG_LABELS[flag], onRemove: () => toggleFlag(flag) });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[13px] text-[var(--text-secondary)]">
        <span className="tabular font-semibold text-[var(--text-primary)]">{resultCount}</span> carte{resultCount !== 1 ? 's' : ''}
      </span>
      {chips.map((c) => (
        <span key={c.key} className="inline-flex h-7 items-center gap-1 rounded-full bg-[var(--bg-elevated)] pl-2.5 pr-1 text-xs text-[var(--text-primary)] ring-1 ring-[var(--border)]">
          <span className="max-w-[220px] truncate">{c.text}</span>
          <button onClick={c.onRemove} className="rounded-full p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]" aria-label={`Retirer ${c.text}`}>
            <X size={13} />
          </button>
        </span>
      ))}
      <button onClick={() => { reset(); }} className="ml-1 text-xs font-medium text-[var(--accent)] hover:underline">
        Tout effacer
      </button>
    </div>
  );
}

