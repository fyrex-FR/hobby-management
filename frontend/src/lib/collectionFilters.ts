import type { Card, CardStatus, CardType } from '../types';
import { buildPlayerCanonical, playerLastName, playerNameKey, stripDiacritics } from './playerName';

/**
 * Filtrage de la collection, sans dépendance React : testable et partagé
 * entre la barre de filtres et la grille/tableau.
 *
 * Règles :
 * - Chaque facette est multi-sélection (OU entre valeurs d'une même facette,
 *   ET entre facettes).
 * - Les compteurs d'une facette sont calculés avec TOUS les autres filtres
 *   actifs (facettage classique) : un compteur affiché = le nombre de cartes
 *   qu'on obtiendra en cochant la valeur. Plus d'options à 12 qui donnent 0.
 * - Les brouillons ne font jamais partie de la collection.
 */

export type StatusFilter = 'all' | Exclude<CardStatus, 'draft'>;
export type FacetKey = 'sport' | 'player' | 'team' | 'brand' | 'set_name' | 'year' | 'card_type' | 'folder';
export type FlagKey = 'rookie' | 'numbered' | 'auto' | 'patch' | 'graded' | 'no_price';
export type ListingFilter = 'all' | 'online' | 'vinted' | 'ebay' | 'offline' | 'not_vinted' | 'not_ebay';
export type SortBy = 'player' | 'recent' | 'oldest' | 'year_desc' | 'year_asc' | 'price_desc' | 'price_asc' | 'numbered';
export type GroupBy = 'none' | 'sport' | 'player' | 'team' | 'brand' | 'set_name' | 'year';

export const UNFILED = '__none__';

export interface CollectionFilters {
  status: StatusFilter;
  search: string;
  facets: Record<FacetKey, string[]>;
  flags: FlagKey[];
  listing: ListingFilter;
}

export const FACET_KEYS: FacetKey[] = ['sport', 'player', 'team', 'brand', 'set_name', 'year', 'card_type', 'folder'];

export function emptyFacets(): Record<FacetKey, string[]> {
  return { sport: [], player: [], team: [], brand: [], set_name: [], year: [], card_type: [], folder: [] };
}

export function emptyFilters(): CollectionFilters {
  return { status: 'all', search: '', facets: emptyFacets(), flags: [], listing: 'all' };
}

export const STATUS_LABELS: Record<StatusFilter, string> = {
  all: 'Toutes',
  collection: 'Collection',
  a_vendre: 'À vendre',
  reserve: 'Réservées',
  vendu: 'Vendues',
};

export const FACET_LABELS: Record<FacetKey, string> = {
  sport: 'Sport',
  player: 'Joueur',
  team: 'Équipe',
  brand: 'Marque',
  set_name: 'Set',
  year: 'Année',
  card_type: 'Type',
  folder: 'Dossier',
};

export const FLAG_LABELS: Record<FlagKey, string> = {
  rookie: 'Rookie',
  numbered: 'Numérotées',
  auto: 'Auto',
  patch: 'Patch',
  graded: 'Gradées',
  no_price: 'Sans prix',
};

export const LISTING_LABELS: Record<Exclude<ListingFilter, 'all'>, string> = {
  online: 'En ligne (Vinted ou eBay)',
  vinted: 'Sur Vinted',
  ebay: 'Sur eBay',
  offline: 'Hors ligne',
  not_vinted: 'Pas sur Vinted',
  not_ebay: 'Pas sur eBay',
};

export const SORT_LABELS: Record<SortBy, string> = {
  player: 'Joueur A → Z',
  recent: 'Ajout récent',
  oldest: 'Ajout ancien',
  year_desc: 'Année récente',
  year_asc: 'Année ancienne',
  price_desc: 'Prix décroissant',
  price_asc: 'Prix croissant',
  numbered: 'Tirage le plus bas',
};

export const GROUP_BY_LABELS: Record<GroupBy, string> = {
  none: 'Aucun groupe',
  sport: 'Sport',
  player: 'Joueur',
  team: 'Équipe',
  brand: 'Marque',
  set_name: 'Set',
  year: 'Année',
};

export const CARD_TYPE_LABELS: Record<CardType, string> = {
  base: 'Base',
  insert: 'Insert',
  parallel: 'Parallel',
  numbered: 'Numbered',
  auto: 'Auto',
  patch: 'Patch',
  auto_patch: 'Auto/Patch',
};

/** Prix de référence d'une carte : le prix Vinted stocké, sinon le prix de vente historique. */
export function displayPrice(card: Card): number | null {
  return card.vinted_price ?? card.price ?? null;
}

export function isAuto(card: Card): boolean {
  return card.card_type === 'auto' || card.card_type === 'auto_patch';
}

export function isPatch(card: Card): boolean {
  return card.card_type === 'patch' || card.card_type === 'auto_patch';
}

/** Contexte précalculé une fois par liste de cartes (noms canoniques des joueurs). */
export interface FilterContext {
  playerCanonical: Map<string, string>;
}

export function buildFilterContext(cards: Card[]): FilterContext {
  return { playerCanonical: buildPlayerCanonical(cards.map((c) => c.player)) };
}

export function canonicalPlayer(card: Card, ctx: FilterContext): string | null {
  if (!card.player) return null;
  return ctx.playerCanonical.get(playerNameKey(card.player)) ?? card.player;
}

/** Valeurs d'une carte pour une facette (plusieurs pour les dossiers). */
export function facetValues(card: Card, key: FacetKey, ctx: FilterContext): string[] {
  switch (key) {
    case 'player': {
      const p = canonicalPlayer(card, ctx);
      return p ? [p] : [];
    }
    case 'folder': {
      const ids = card.folder_ids ?? [];
      return ids.length > 0 ? ids : [UNFILED];
    }
    default: {
      const v = card[key] as string | null;
      return v ? [v] : [];
    }
  }
}

function matchesFlag(card: Card, flag: FlagKey): boolean {
  switch (flag) {
    case 'rookie': return !!card.is_rookie;
    case 'numbered': return !!card.numbered;
    case 'auto': return isAuto(card);
    case 'patch': return isPatch(card);
    case 'graded': return !!card.grading_company;
    case 'no_price': return displayPrice(card) == null;
  }
}

function matchesListing(card: Card, listing: ListingFilter): boolean {
  const v = !!card.vinted_url;
  const e = !!card.ebay_url;
  switch (listing) {
    case 'all': return true;
    case 'online': return v || e;
    case 'vinted': return v;
    case 'ebay': return e;
    case 'offline': return !v && !e;
    case 'not_vinted': return !v;
    case 'not_ebay': return !e;
  }
}

function searchHaystack(card: Card): string {
  return stripDiacritics(
    [
      card.player, card.team, card.brand, card.set_name, card.insert_name, card.parallel_name,
      card.year, card.card_number, card.numbered, card.grading_company, card.grading_grade,
    ]
      .filter(Boolean)
      .join(' '),
  ).toLowerCase();
}

/** Tokens de recherche : chaque mot doit être présent (« lebron prizm 2023 »). */
export function searchTokens(search: string): string[] {
  return stripDiacritics(search).toLowerCase().split(/\s+/).filter(Boolean);
}

type Dimension = FacetKey | 'status' | 'listing' | 'search' | FlagKey;

/**
 * `skip` exclut une dimension du test, pour calculer les compteurs de cette
 * dimension en tenant compte de toutes les autres.
 */
export function matchesFilters(
  card: Card,
  filters: CollectionFilters,
  ctx: FilterContext,
  tokens: string[],
  skip?: Dimension,
): boolean {
  if (card.status === 'draft') return false;
  if (skip !== 'status' && filters.status !== 'all' && card.status !== filters.status) return false;
  if (skip !== 'listing' && !matchesListing(card, filters.listing)) return false;
  for (const flag of filters.flags) {
    if (skip !== flag && !matchesFlag(card, flag)) return false;
  }
  for (const key of FACET_KEYS) {
    if (skip === key) continue;
    const selected = filters.facets[key];
    if (selected.length === 0) continue;
    const values = facetValues(card, key, ctx);
    if (!values.some((v) => selected.includes(v))) return false;
  }
  if (skip !== 'search' && tokens.length > 0) {
    const hay = searchHaystack(card);
    if (!tokens.every((t) => hay.includes(t))) return false;
  }
  return true;
}

export function filterCards(cards: Card[], filters: CollectionFilters, ctx: FilterContext): Card[] {
  const tokens = searchTokens(filters.search);
  return cards.filter((c) => matchesFilters(c, filters, ctx, tokens));
}

export interface FacetOption {
  value: string;
  count: number;
}

/**
 * Options d'une facette avec compteurs facettés. Les valeurs sélectionnées
 * restent listées même à 0 pour pouvoir être décochées.
 */
export function facetOptions(
  cards: Card[],
  filters: CollectionFilters,
  ctx: FilterContext,
  key: FacetKey,
): FacetOption[] {
  const tokens = searchTokens(filters.search);
  const counts = new Map<string, number>();
  for (const card of cards) {
    if (card.status === 'draft') continue;
    const values = facetValues(card, key, ctx);
    if (values.length === 0) continue;
    const ok = matchesFilters(card, filters, ctx, tokens, key);
    for (const v of values) {
      if (!counts.has(v)) counts.set(v, 0);
      if (ok) counts.set(v, counts.get(v)! + 1);
    }
  }
  for (const v of filters.facets[key]) if (!counts.has(v)) counts.set(v, 0);
  return [...counts.entries()]
    .filter(([value, count]) => count > 0 || filters.facets[key].includes(value))
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function statusCounts(cards: Card[], filters: CollectionFilters, ctx: FilterContext): Record<StatusFilter, number> {
  const tokens = searchTokens(filters.search);
  const out: Record<StatusFilter, number> = { all: 0, collection: 0, a_vendre: 0, reserve: 0, vendu: 0 };
  for (const card of cards) {
    if (!matchesFilters(card, filters, ctx, tokens, 'status')) continue;
    out.all += 1;
    if (card.status in out) out[card.status as StatusFilter] += 1;
  }
  return out;
}

export function flagCounts(cards: Card[], filters: CollectionFilters, ctx: FilterContext): Record<FlagKey, number> {
  const tokens = searchTokens(filters.search);
  const out: Record<FlagKey, number> = { rookie: 0, numbered: 0, auto: 0, patch: 0, graded: 0, no_price: 0 };
  for (const flag of Object.keys(out) as FlagKey[]) {
    for (const card of cards) {
      if (matchesFlag(card, flag) && matchesFilters(card, filters, ctx, tokens, flag)) out[flag] += 1;
    }
  }
  return out;
}

export function listingCounts(cards: Card[], filters: CollectionFilters, ctx: FilterContext): Record<Exclude<ListingFilter, 'all'>, number> {
  const tokens = searchTokens(filters.search);
  const out = { online: 0, vinted: 0, ebay: 0, offline: 0, not_vinted: 0, not_ebay: 0 };
  for (const card of cards) {
    if (!matchesFilters(card, filters, ctx, tokens, 'listing')) continue;
    for (const k of Object.keys(out) as (keyof typeof out)[]) {
      if (matchesListing(card, k)) out[k] += 1;
    }
  }
  return out;
}

/** Nombre de filtres actifs hors statut et recherche (qui ont leur propre UI visible). */
export function activeFilterCount(filters: CollectionFilters): number {
  let n = filters.flags.length + (filters.listing !== 'all' ? 1 : 0);
  for (const key of FACET_KEYS) n += filters.facets[key].length;
  return n;
}

export function hasAnyFilter(filters: CollectionFilters): boolean {
  return activeFilterCount(filters) > 0 || filters.status !== 'all' || filters.search.trim() !== '';
}

function seasonStart(year: string | null | undefined): number {
  const match = year?.match(/^(\d{4})/);
  return match ? parseInt(match[1], 10) : -1;
}

function numberedValue(numbered: string | null | undefined): number {
  const match = numbered?.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : Number.POSITIVE_INFINITY;
}

function comparePlayer(a: Card, b: Card): number {
  return playerLastName(a.player).localeCompare(playerLastName(b.player)) || (a.player ?? '').localeCompare(b.player ?? '');
}

export function sortCards(list: Card[], sortBy: SortBy): Card[] {
  const out = [...list];
  out.sort((a, b) => {
    switch (sortBy) {
      case 'player': return comparePlayer(a, b);
      case 'recent': return b.created_at.localeCompare(a.created_at);
      case 'oldest': return a.created_at.localeCompare(b.created_at);
      case 'year_desc': return seasonStart(b.year) - seasonStart(a.year) || comparePlayer(a, b);
      case 'year_asc': return seasonStart(a.year) - seasonStart(b.year) || comparePlayer(a, b);
      case 'price_desc': return (displayPrice(b) ?? -1) - (displayPrice(a) ?? -1);
      case 'price_asc': return (displayPrice(a) ?? Number.POSITIVE_INFINITY) - (displayPrice(b) ?? Number.POSITIVE_INFINITY);
      case 'numbered': return numberedValue(a.numbered) - numberedValue(b.numbered) || comparePlayer(a, b);
    }
  });
  return out;
}
