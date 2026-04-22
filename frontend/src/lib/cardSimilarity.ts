import type { Card } from '../types';
import { normalizeParallelName } from './cardQuality';

export interface DuplicateMatch {
  card: Card;
  score: number;
  reason: string;
}

function safe(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? '';
}

export function findDuplicateMatches(target: Card, cards: Card[], limit = 3): DuplicateMatch[] {
  return cards
    .filter((card) => card.id !== target.id)
    .map((card) => {
      let score = 0;
      if (safe(card.player) && safe(card.player) === safe(target.player)) score += 28;
      if (safe(card.year) && safe(card.year) === safe(target.year)) score += 16;
      if (safe(card.brand) && safe(card.brand) === safe(target.brand)) score += 10;
      if (safe(card.set_name) && safe(card.set_name) === safe(target.set_name)) score += 22;
      if (safe(card.card_number) && safe(card.card_number) === safe(target.card_number)) score += 18;
      if (normalizeParallelName(card.parallel_name) && normalizeParallelName(card.parallel_name) === normalizeParallelName(target.parallel_name)) score += 10;
      if (safe(card.numbered) && safe(card.numbered) === safe(target.numbered)) score += 10;

      let reason = 'À vérifier';
      if (score >= 80) reason = 'Doublon probable';
      else if (score >= 55) reason = 'Carte très proche';

      return { card, score, reason };
    })
    .filter((match) => match.score >= 55)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function buildSimilarityPrefill(target: Card, cards: Card[]) {
  const pool = cards.filter((card) => {
    if (card.id === target.id) return false;
    if (card.status !== 'draft') return false;
    const sameBrand = safe(card.brand) && safe(card.brand) === safe(target.brand);
    const sameSet = safe(card.set_name) && safe(card.set_name) === safe(target.set_name);
    const sameYear = safe(card.year) && safe(card.year) === safe(target.year);
    return sameBrand || sameSet || sameYear;
  });

  if (pool.length === 0) return null;

  const fields: Partial<Card> = {};
  const keys: Array<keyof Pick<Card, 'year' | 'brand' | 'set_name' | 'team' | 'card_type'>> = ['year', 'brand', 'set_name', 'team', 'card_type'];

  for (const key of keys) {
    const values = pool.map((card) => card[key]).filter(Boolean);
    const unique = [...new Set(values)];
    if (unique.length === 1 && !target[key]) {
      fields[key] = unique[0] as any;
    }
  }

  return Object.keys(fields).length > 0 ? fields : null;
}
