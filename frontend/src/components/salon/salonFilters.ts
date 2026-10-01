import {
  emptyFilters,
  facetOptions,
  filterCards,
  flagCounts,
  sortCards,
  type CollectionFilters,
  type FacetKey,
  type FacetOption,
  type FilterContext,
  type FlagKey,
} from '../../lib/collectionFilters';
import { BUDGETS } from '../../lib/salon';
import type { Card } from '../../types';

/**
 * Filtres de la page publique du stand. Réutilise le moteur de la collection
 * (facettes multi-valeurs, compteurs qui tiennent compte des autres filtres)
 * et ajoute ce qui compte pour un acheteur : un budget maximum.
 */
export type SalonSort = 'recent' | 'price_asc' | 'price_desc' | 'player';
export const SALON_SORTS: { value: SalonSort; label: string }[] = [
  { value: 'recent', label: 'Nouveautés' },
  { value: 'price_asc', label: 'Prix croissant' },
  { value: 'price_desc', label: 'Prix décroissant' },
  { value: 'player', label: 'Joueur A → Z' },
];

/** Facettes proposées dans le panneau, dans cet ordre. */
export const SALON_FACETS: { key: FacetKey; label: string }[] = [
  { key: 'player', label: 'Joueur' },
  { key: 'team', label: 'Équipe' },
  { key: 'set_name', label: 'Set' },
  { key: 'year', label: 'Année' },
];

/** Raccourcis en un geste, affichés seulement s'ils concernent au moins une carte. */
export const SALON_FLAGS: { key: FlagKey; label: string }[] = [
  { key: 'auto', label: 'Auto' },
  { key: 'numbered', label: 'Numérotée' },
  { key: 'rookie', label: 'Rookie' },
  { key: 'patch', label: 'Patch' },
  { key: 'graded', label: 'Gradée' },
];

export interface SalonFilterState {
  filters: CollectionFilters;
  budget: number | null;
  sort: SalonSort;
}

export const emptySalonFilters = (): SalonFilterState => ({ filters: emptyFilters(), budget: null, sort: 'recent' });

const priceOf = (c: Card) => c.price ?? 0;
const withinBudget = (cards: Card[], budget: number | null) => (budget == null ? cards : cards.filter((c) => priceOf(c) <= budget));

export interface SalonFacets {
  shown: Card[];
  sports: FacetOption[];
  facets: Record<string, FacetOption[]>;
  flags: Record<FlagKey, number>;
  budgets: { value: number; count: number }[];
}

/** Liste affichée + tous les compteurs, en un passage. */
export function computeSalon(cards: Card[], state: SalonFilterState, ctx: FilterContext, unavailable: Set<string>): SalonFacets {
  const pool = withinBudget(cards, state.budget);
  const matched = filterCards(pool, state.filters, ctx);
  const sorted = state.sort === 'player' ? sortCards(matched, 'player')
    : state.sort === 'price_asc' ? [...matched].sort((a, b) => priceOf(a) - priceOf(b))
    : state.sort === 'price_desc' ? [...matched].sort((a, b) => priceOf(b) - priceOf(a))
    : sortCards(matched, 'recent');
  // Les cartes réservées par d'autres restent visibles, mais en fin de liste.
  const shown = [...sorted.filter((c) => !unavailable.has(c.id)), ...sorted.filter((c) => unavailable.has(c.id))];

  const facets: Record<string, FacetOption[]> = {};
  for (const { key } of SALON_FACETS) facets[key] = facetOptions(pool, state.filters, ctx, key);
  // Les années se lisent dans l'ordre chronologique (récentes d'abord), pas par volume.
  facets.year = [...facets.year].sort((a, b) => b.value.localeCompare(a.value));
  const sports = facetOptions(pool, state.filters, ctx, 'sport');
  const flags = flagCounts(pool, state.filters, ctx);
  const beforeBudget = filterCards(cards, state.filters, ctx);
  const budgets = BUDGETS.map((value) => ({ value, count: beforeBudget.filter((c) => priceOf(c) <= value).length }));
  return { shown, sports, facets, flags, budgets };
}

export function activeCount(state: SalonFilterState): number {
  const f = state.filters;
  return SALON_FACETS.reduce((n, { key }) => n + f.facets[key].length, 0) + f.flags.length + (state.budget != null ? 1 : 0);
}

/* ── Mises à jour immuables ─────────────────────────────────────────────── */

export function toggleFacet(state: SalonFilterState, key: FacetKey, value: string): SalonFilterState {
  const cur = state.filters.facets[key];
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  return { ...state, filters: { ...state.filters, facets: { ...state.filters.facets, [key]: next } } };
}

export function setSport(state: SalonFilterState, sport: string | null): SalonFilterState {
  return { ...state, filters: { ...state.filters, facets: { ...state.filters.facets, sport: sport ? [sport] : [] } } };
}

export function toggleFlag(state: SalonFilterState, flag: FlagKey): SalonFilterState {
  const cur = state.filters.flags;
  return { ...state, filters: { ...state.filters, flags: cur.includes(flag) ? cur.filter((f) => f !== flag) : [...cur, flag] } };
}

/** Efface les filtres du panneau ; garde la recherche, le sport et le tri. */
export function clearFilters(state: SalonFilterState): SalonFilterState {
  const base = emptyFilters();
  return { ...state, budget: null, filters: { ...base, search: state.filters.search, facets: { ...base.facets, sport: state.filters.facets.sport } } };
}
