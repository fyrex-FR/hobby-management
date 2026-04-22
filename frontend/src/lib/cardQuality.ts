import type { Card, CardType } from '../types';

export interface CardAlert {
  id: string;
  label: string;
  severity: 'low' | 'medium' | 'high';
}

const PARALLEL_CANONICAL_MAP: Array<[RegExp, string]> = [
  [/\bsilver\b/i, 'Silver'],
  [/\bgold\b/i, 'Gold'],
  [/\bblue\s*prizm\b/i, 'Blue Prizm'],
  [/\bred\s*prizm\b/i, 'Red Prizm'],
  [/\bpink\s*prizm\b/i, 'Pink Prizm'],
  [/\borange\s*pulsar\b/i, 'Orange Pulsar'],
  [/\bred\s*wave\b/i, 'Red Wave'],
  [/\bruby\s*wave\b/i, 'Ruby Wave'],
  [/\bholo\b/i, 'Holo'],
  [/\bmojo\b/i, 'Mojo'],
  [/\bcheckerboard\b/i, 'Checkerboard'],
  [/\bdisco\b/i, 'Disco'],
  [/\breactive\b/i, 'Reactive'],
];

const PREMIUM_TYPES = new Set<CardType>(['auto', 'patch', 'auto_patch', 'numbered']);

export function normalizeParallelName(value: string | null | undefined) {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.toLowerCase() === 'base') return null;

  for (const [pattern, normalized] of PARALLEL_CANONICAL_MAP) {
    if (pattern.test(raw)) return normalized;
  }

  return raw
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function getCardConfidence(card: Partial<Card>) {
  let score = 0;
  if (card.player) score += 24;
  if (card.year) score += 14;
  if (card.brand) score += 12;
  if (card.set_name) score += 18;
  if (card.card_type) score += 12;
  if (card.card_number) score += 8;
  if (card.numbered) score += 4;

  const normalizedParallel = normalizeParallelName(card.parallel_name);
  if (normalizedParallel) score += 4;
  if ((card.parallel_confidence ?? 0) >= 80) score += 4;
  else if ((card.parallel_confidence ?? 0) > 0) score += 2;

  if (card.team) score += 2;
  if (card.insert_name) score += 2;

  const value = Math.max(0, Math.min(100, score));
  const tier = value >= 78 ? 'high' : value >= 50 ? 'medium' : 'low';
  return { value, tier } as const;
}

export function getCardAlerts(card: Partial<Card>): CardAlert[] {
  const alerts: CardAlert[] = [];
  const normalizedParallel = normalizeParallelName(card.parallel_name);

  if (!card.player) alerts.push({ id: 'missing_player', label: 'Joueur manquant', severity: 'high' });
  if (!card.year) alerts.push({ id: 'missing_year', label: 'Année manquante', severity: 'medium' });
  if (!card.set_name) alerts.push({ id: 'missing_set', label: 'Set manquant', severity: 'medium' });
  if (!card.card_type) alerts.push({ id: 'missing_type', label: 'Type manquant', severity: 'medium' });

  if (card.numbered && !card.card_type) {
    alerts.push({ id: 'numbered_without_type', label: 'Numérotation sans type', severity: 'medium' });
  }

  if ((card.parallel_confidence ?? 100) > 0 && (card.parallel_confidence ?? 100) < 60) {
    alerts.push({ id: 'low_parallel_confidence', label: 'Parallel peu fiable', severity: 'medium' });
  }

  if (card.parallel_name && !normalizedParallel) {
    alerts.push({ id: 'base_parallel_noise', label: 'Parallel à nettoyer', severity: 'low' });
  }

  if (card.is_rookie && card.year && !/^\d{4}/.test(card.year)) {
    alerts.push({ id: 'rookie_year_format', label: 'RC à vérifier', severity: 'medium' });
  }

  if (card.card_type && PREMIUM_TYPES.has(card.card_type as CardType) && !card.image_front_url) {
    alerts.push({ id: 'premium_without_image', label: 'Photo recto manquante', severity: 'high' });
  }

  return alerts;
}
