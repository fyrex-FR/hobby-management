import type { Card } from '../types';
import { addVintedHashtags } from './vintedHashtags';
import { prepareVintedPhotos } from './vintedPhotoBadge';

export interface VintedDraft {
  cardId: string;
  title: string;
  description: string;
  price: number;
  brand: string;
  photos: string[];
}

async function toBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function buildVintedDraft(card: Card): Promise<VintedDraft> {
  const title = [
    card.player, card.year, card.brand, card.set_name, card.insert_name,
    card.parallel_name && card.parallel_name !== 'Base' ? card.parallel_name : null,
    card.numbered,
  ].filter(Boolean).join(' ');

  const sourcePhotos = (await Promise.all(
    [card.image_front_url, card.image_back_url].filter(Boolean).map((url) => toBase64(url!)),
  )).filter(Boolean) as string[];
  const photos = await prepareVintedPhotos(sourcePhotos, card.numbered);
  const baseDescription = [
    card.brand && card.set_name ? `${card.brand} ${card.set_name}` : null,
    card.insert_name ? `Insert : ${card.insert_name}` : null,
    card.parallel_name ? `Parallel : ${card.parallel_name}` : null,
    card.card_number ? `Carte ${card.card_number}` : null,
    card.numbered ? `Numérotée ${card.numbered}` : null,
    card.condition_notes ? `État : ${card.condition_notes}` : 'Excellent état, jamais joué',
  ].filter(Boolean).join('\n');

  return {
    cardId: card.id,
    title,
    description: addVintedHashtags(baseDescription, {
      player: card.player, team: card.team, series: card.set_name || card.brand,
    }),
    price: card.vinted_price ?? card.price ?? 0,
    brand: card.brand ?? '',
    photos,
  };
}

export function openVintedDraft(draft: VintedDraft) {
  const encoded = encodeURIComponent(JSON.stringify(draft));
  window.open(`https://www.vinted.fr/items/new#vinted_pending=${encoded}`, '_blank');
}
