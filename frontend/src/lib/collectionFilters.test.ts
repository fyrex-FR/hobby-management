import { describe, expect, it } from 'vitest';
import type { Card } from '../types';
import {
  buildFilterContext,
  emptyFilters,
  facetOptions,
  filterCards,
  sortCards,
  statusCounts,
  type CollectionFilters,
} from './collectionFilters';

function card(overrides: Partial<Card>): Card {
  return {
    id: Math.random().toString(36).slice(2),
    status: 'collection',
    sport: 'Basket',
    player: null, team: null, year: null, brand: null, set_name: null,
    card_type: null, insert_name: null, parallel_name: null, numbered: null,
    is_rookie: false, price: null, vinted_price: null, folder_ids: [],
    vinted_url: null, ebay_url: null, grading_company: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as Card;
}

const cards = [
  card({ player: 'LeBron James', team: 'Lakers', status: 'a_vendre', year: '2023-24', vinted_price: 10 }),
  card({ player: 'LeBron James', team: 'Cavaliers', year: '2003-04', is_rookie: true }),
  card({ player: 'Nikola Jokić', team: 'Nuggets', status: 'a_vendre', price: 5 }),
  card({ player: 'Nikola Jokic', team: 'Nuggets', status: 'vendu' }),
  card({ player: 'Brouillon', status: 'draft' }),
];
const ctx = buildFilterContext(cards);

function withFacet(key: keyof CollectionFilters['facets'], values: string[]): CollectionFilters {
  const f = emptyFilters();
  f.facets[key] = values;
  return f;
}

describe('collectionFilters', () => {
  it('exclut toujours les brouillons', () => {
    expect(filterCards(cards, emptyFilters(), ctx)).toHaveLength(4);
  });

  it('combine les valeurs d\'une facette en OU', () => {
    expect(filterCards(cards, withFacet('team', ['Lakers', 'Nuggets']), ctx)).toHaveLength(3);
  });

  it('fusionne les variantes accentuées d\'un joueur', () => {
    const opts = facetOptions(cards, emptyFilters(), ctx, 'player');
    expect(opts.filter((o) => o.value.startsWith('Nikola'))).toHaveLength(1);
    expect(opts.find((o) => o.value.startsWith('Nikola'))?.count).toBe(2);
  });

  it('calcule les compteurs d\'une facette avec les autres filtres', () => {
    const f = withFacet('player', ['LeBron James']);
    const teams = facetOptions(cards, f, ctx, 'team');
    expect(teams.map((t) => t.value).sort()).toEqual(['Cavaliers', 'Lakers']);
  });

  it('compte les statuts sans appliquer le filtre de statut', () => {
    const f = { ...withFacet('player', ['LeBron James']), status: 'vendu' as const };
    expect(statusCounts(cards, f, ctx)).toMatchObject({ all: 2, a_vendre: 1, collection: 1, vendu: 0 });
  });

  it('recherche multi-mots, sans accents', () => {
    const f = { ...emptyFilters(), search: 'jokic nuggets' };
    expect(filterCards(cards, f, ctx)).toHaveLength(2);
  });

  it('filtre « sans prix » sur le prix Vinted puis le prix historique', () => {
    const f = { ...emptyFilters(), flags: ['no_price' as const] };
    expect(filterCards(cards, f, ctx)).toHaveLength(2);
  });

  it('trie par prix en laissant les cartes sans prix à la fin', () => {
    const sorted = sortCards(filterCards(cards, emptyFilters(), ctx), 'price_asc');
    expect(sorted.slice(0, 2).map((c) => c.vinted_price ?? c.price)).toEqual([5, 10]);
  });
});
