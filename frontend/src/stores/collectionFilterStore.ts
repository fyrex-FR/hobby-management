import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  emptyFacets,
  emptyFilters,
  type CollectionFilters,
  type FacetKey,
  type FlagKey,
  type GroupBy,
  type ListingFilter,
  type SortBy,
  type StatusFilter,
} from '../lib/collectionFilters';
import type { DrillFilter } from './appStore';

interface CollectionFilterStore {
  filters: CollectionFilters;
  sortBy: SortBy;
  groupBy: GroupBy;
  setStatus: (status: StatusFilter) => void;
  setSearch: (search: string) => void;
  toggleFacet: (key: FacetKey, value: string) => void;
  clearFacet: (key: FacetKey) => void;
  toggleFlag: (flag: FlagKey) => void;
  setListing: (listing: ListingFilter) => void;
  setSortBy: (sortBy: SortBy) => void;
  setGroupBy: (groupBy: GroupBy) => void;
  /** Efface les filtres (garde tri et groupement). */
  reset: () => void;
  /** Arrivée depuis le dashboard / joueurs : remplace les filtres par ce seul critère. */
  applyDrill: (drill: DrillFilter) => void;
}

/**
 * Filtres de la collection, conservés quand on change de vue et entre deux
 * visites (localStorage). La recherche texte n'est pas persistée : revenir
 * le lendemain sur une recherche oubliée est plus déroutant qu'utile.
 */
export const useCollectionFilters = create<CollectionFilterStore>()(
  persist(
    (set) => ({
      filters: emptyFilters(),
      sortBy: 'player',
      groupBy: 'none',
      setStatus: (status) => set((s) => ({ filters: { ...s.filters, status } })),
      setSearch: (search) => set((s) => ({ filters: { ...s.filters, search } })),
      toggleFacet: (key, value) =>
        set((s) => {
          const current = s.filters.facets[key];
          const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
          return { filters: { ...s.filters, facets: { ...s.filters.facets, [key]: next } } };
        }),
      clearFacet: (key) => set((s) => ({ filters: { ...s.filters, facets: { ...s.filters.facets, [key]: [] } } })),
      toggleFlag: (flag) =>
        set((s) => {
          const flags = s.filters.flags.includes(flag) ? s.filters.flags.filter((f) => f !== flag) : [...s.filters.flags, flag];
          return { filters: { ...s.filters, flags } };
        }),
      setListing: (listing) => set((s) => ({ filters: { ...s.filters, listing } })),
      setSortBy: (sortBy) => set({ sortBy }),
      setGroupBy: (groupBy) => set({ groupBy }),
      reset: () => set({ filters: emptyFilters() }),
      applyDrill: (drill) => {
        const facets = emptyFacets();
        if (drill.player) facets.player = [drill.player];
        if (drill.team) facets.team = [drill.team];
        if (drill.set_name) facets.set_name = [drill.set_name];
        if (drill.year) facets.year = [drill.year];
        set({ filters: { ...emptyFilters(), facets } });
      },
    }),
    {
      name: 'cv-collection-filters',
      version: 1,
      partialize: (s) => ({
        filters: { ...s.filters, search: '' },
        sortBy: s.sortBy,
        groupBy: s.groupBy,
      }),
      // Une ancienne sauvegarde incomplète ne doit jamais casser la vue.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<CollectionFilterStore>;
        return {
          ...current,
          sortBy: p.sortBy ?? current.sortBy,
          groupBy: p.groupBy ?? current.groupBy,
          filters: {
            ...emptyFilters(),
            ...(p.filters ?? {}),
            facets: { ...emptyFacets(), ...(p.filters?.facets ?? {}) },
            search: '',
          },
        };
      },
    },
  ),
);
