import type { Card, SaleChannel } from '../types';
import { displayPrice } from './collectionFilters';

export const SALE_CHANNELS: { value: SaleChannel; label: string }[] = [
  { value: 'vinted', label: 'Vinted' },
  { value: 'ebay', label: 'eBay' },
  { value: 'salon', label: 'Salon' },
  { value: 'direct', label: 'En direct' },
  { value: 'autre', label: 'Autre' },
];

export const SALE_CHANNEL_LABEL = Object.fromEntries(SALE_CHANNELS.map((c) => [c.value, c.label])) as Record<SaleChannel, string>;

/** Prix réellement encaissé (null si inconnu : ventes antérieures au suivi). */
export function soldPrice(card: Card): number | null {
  return card.sold_price ?? card.ebay_sold_price ?? null;
}

/** Date de la vente (null si inconnue). */
export function soldAt(card: Card): string | null {
  return card.sold_at ?? card.ebay_sold_at ?? null;
}

/** Annonce en ligne : Vinted, eBay, ou marquée en ligne ailleurs à la main. */
export function isOnline(card: Card): boolean {
  return Boolean(card.vinted_url || card.ebay_offer_id || card.is_listed);
}

/** Canal le plus probable d'une vente, d'après les annonces de la carte. */
export function guessChannel(cards: Card[]): SaleChannel {
  if (cards.length && cards.every((c) => c.vinted_url && !c.ebay_offer_id)) return 'vinted';
  if (cards.length && cards.every((c) => c.ebay_offer_id && !c.vinted_url)) return 'ebay';
  return 'direct';
}

/** Répartit un total sur plusieurs cartes au prorata de leur prix demandé (au centime). */
export function spreadTotal(cards: Card[], total: number): Map<string, number> {
  const asked = cards.map((c) => displayPrice(c) ?? 0);
  const sum = asked.reduce((a, b) => a + b, 0);
  const shares = cards.map((_, i) => (sum > 0 ? (total * asked[i]) / sum : total / cards.length));
  const rounded = shares.map((v) => Math.round(v * 100) / 100);
  // L'écart d'arrondi va sur la carte la plus chère, pour que la somme tombe juste.
  const drift = Math.round((total - rounded.reduce((a, b) => a + b, 0)) * 100) / 100;
  if (drift && rounded.length) {
    const top = asked.indexOf(Math.max(...asked));
    rounded[top] = Math.round((rounded[top] + drift) * 100) / 100;
  }
  return new Map(cards.map((c, i) => [c.id, rounded[i]]));
}
