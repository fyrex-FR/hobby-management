import type { Card } from '../types';

/**
 * Détection des « ventes à finaliser » : une carte est vendue, mais une annonce
 * reste en ligne sur l'autre plateforme — risque de la vendre deux fois.
 *
 * Le discriminant est `ebay_sold_at`, posé UNIQUEMENT par le sync des ventes
 * eBay (`sync_sold_cards`) :
 *   - renseigné  -> la vente a eu lieu sur eBay, dont l'annonce est donc déjà
 *     close par la vente elle-même ; seul Vinted reste à nettoyer ;
 *   - nul        -> la carte a été passée en vendu à la main (typiquement
 *     vendue sur Vinted), et son annonce eBay est toujours en ligne.
 *
 * Une carte à quantité > 1 partiellement vendue n'est pas `vendu` : elle n'est
 * donc jamais signalée, ce qui est voulu (Vinted n'a aucune notion de quantité).
 */

/** Vendue sur eBay, toujours en ligne sur Vinted. L'app ne peut PAS agir sur
 * Vinted (aucune API d'annonce) : on alerte et on donne le lien. */
export function vintedToRemove(cards: Card[]): Card[] {
  return cards.filter((c) => c.ebay_sold_at && c.vinted_url);
}

/** Vendue ailleurs, toujours en vente sur eBay. Là l'app peut agir : retrait
 * via l'API. */
export function ebayToWithdraw(cards: Card[]): Card[] {
  return cards.filter((c) => c.status === 'vendu' && c.ebay_url && !c.ebay_sold_at);
}

export function pendingReconcileCount(cards: Card[]): number {
  return vintedToRemove(cards).length + ebayToWithdraw(cards).length;
}
