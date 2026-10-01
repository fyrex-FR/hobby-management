import type { Card } from '../../types';
import { formatCardNumber } from '../../lib/cardQuality';

/** « 2023-24 · Prizm » */
export function cardMeta(c: Pick<Card, 'year' | 'set_name' | 'brand'>): string {
  return [c.year, c.set_name || c.brand].filter(Boolean).join(' · ');
}

/** « Silver Prizm · #37 » : ce qui distingue la carte d'une base. */
export function cardVariant(c: Pick<Card, 'insert_name' | 'parallel_name' | 'card_number'>): string {
  return [c.insert_name, c.parallel_name && c.parallel_name !== 'Base' ? c.parallel_name : null, formatCardNumber(c.card_number)]
    .filter(Boolean)
    .join(' · ');
}
