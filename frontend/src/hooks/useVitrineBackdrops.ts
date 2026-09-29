import { useQuery } from '@tanstack/react-query';
import { fetchBackdrops, type Backdrops } from '../lib/vitrine';

/** Fonds vitrine du compte connecté (null par ton si aucun envoyé). */
export function useVitrineBackdrops() {
  return useQuery<Backdrops>({ queryKey: ['vitrine-backdrops'], queryFn: () => fetchBackdrops(true), staleTime: 5 * 60_000 });
}
