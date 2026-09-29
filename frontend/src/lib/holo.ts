import type { Card } from '../types';

export type HoloRarity = 'base' | 'rookie' | 'parallel' | 'numbered' | 'graded' | 'auto';

/** Rareté visuelle d'une carte : pilote l'intensité du film holographique. */
export function holoRarity(card: Pick<Card, 'card_type' | 'grading_company' | 'numbered' | 'parallel_name' | 'is_rookie'>): HoloRarity {
  if (card.card_type === 'auto' || card.card_type === 'auto_patch') return 'auto';
  if (card.grading_company) return 'graded';
  const n = card.numbered?.match(/(\d+)\s*$/)?.[1];
  if (n && parseInt(n, 10) <= 99) return 'numbered';
  if (n || (card.parallel_name && card.parallel_name !== 'Base')) return 'parallel';
  if (card.is_rookie) return 'rookie';
  return 'base';
}

/**
 * iOS n'envoie les mesures du gyroscope qu'après une autorisation donnée sur
 * un geste de l'utilisateur. Retourne true si le gyroscope est utilisable.
 */
export async function requestGyroPermission(): Promise<boolean> {
  const DOE = window.DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<'granted' | 'denied'> } | undefined;
  if (!DOE) return false;
  if (typeof DOE.requestPermission !== 'function') return true;
  try {
    return (await DOE.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}
