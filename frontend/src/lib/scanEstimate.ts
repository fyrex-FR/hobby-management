import { cleanTitle, computeStats, filterRelevant, toEurPrice, trimOutliers, withoutGraded, type EbayResult } from './ebayComps';
import { playerLastName } from './playerName';

/**
 * Estimation de valeur du scan à partir des ventes / annonces eBay.
 *
 * Chaque résultat eBay est classé (retenu, ou écarté avec une raison) pour
 * que l'utilisateur puisse vérifier sur quoi repose l'estimation, et la
 * corriger en cochant / décochant : l'estimation se recalcule sur ses choix.
 */

export type CompReason = 'kept' | 'other_player' | 'other_card' | 'graded' | 'outlier';

export const REASON_LABELS: Record<Exclude<CompReason, 'kept'>, string> = {
  other_player: 'Autre joueur',
  other_card: 'Autre carte',
  graded: 'Gradée',
  outlier: 'Prix hors norme',
};

export interface Comp extends EbayResult {
  key: string;
  /** Classement automatique ; l'utilisateur peut le renverser. */
  auto: CompReason;
}

export type CompSource = 'sold' | 'active';

export interface Comps {
  query: string;
  /** Recherche élargie (joueur + set) faute de résultats précis. */
  broad: boolean;
  sold: Comp[];
  active: Comp[];
  soldUnavailable: boolean;
  activeUnavailable: boolean;
}

/** Surcharges manuelles : clé du résultat → retenu (true) ou écarté (false). */
export type CompOverrides = Record<string, boolean>;

export interface ScanIdent {
  player?: string | null;
  year?: string | null;
  set?: string | null;
  card_number?: string | null;
  numbered?: string | null;
}

export interface Estimate {
  status: 'loading' | 'ready' | 'none' | 'error';
  source?: CompSource;
  broad?: boolean;
  value?: number;
  min?: number;
  max?: number;
  count?: number;
  thumbs?: string[];
}

/**
 * Classe les résultats par étapes successives. Une étape n'écarte des
 * résultats que s'il en reste au moins 2 après elle : mieux vaut une
 * estimation large qu'aucune.
 */
export function classifyComps(results: EbayResult[], ident: ScanIdent): Comp[] {
  const items: Comp[] = results.map((r, i) => ({ ...r, title: cleanTitle(r.title), key: r.item_id || r.url || `${i}-${r.title}`, auto: 'kept' }));
  const alive = () => items.filter((c) => c.auto === 'kept');
  const narrow = (kept: Comp[], reason: CompReason) => {
    if (kept.length < 2) return;
    const set = new Set(kept);
    for (const c of alive()) if (!set.has(c)) c.auto = reason;
  };

  const last = playerLastName(ident.player).toLowerCase();
  if (last) narrow(alive().filter((c) => c.title.toLowerCase().includes(last)), 'other_player');
  narrow(
    filterRelevant(alive(), { year: ident.year, cardNumber: ident.card_number, numbered: ident.numbered, setName: ident.set }) as Comp[],
    'other_card',
  );
  // La carte scannée est brute : les slabs gradés faussent l'estimation.
  narrow(withoutGraded(alive()) as Comp[], 'graded');
  narrow(trimOutliers(alive()) as Comp[], 'outlier');
  return items;
}

export function isKept(c: Comp, overrides: CompOverrides): boolean {
  return overrides[c.key] ?? c.auto === 'kept';
}

/** Ventes réelles d'abord ; annonces en cours si moins de 2 ventes retenues. */
export function estimateFrom(comps: Comps, overrides: CompOverrides = {}): Estimate {
  for (const source of ['sold', 'active'] as const) {
    const kept = comps[source].filter((c) => isKept(c, overrides));
    const stats = computeStats(kept);
    if (stats && stats.count >= 2) {
      return {
        status: 'ready',
        source,
        broad: comps.broad,
        value: toEurPrice(stats.median),
        min: toEurPrice(stats.min),
        max: toEurPrice(stats.max),
        count: stats.count,
        thumbs: kept.map((c) => c.image).filter(Boolean).slice(0, 4),
      };
    }
  }
  return { status: comps.soldUnavailable && comps.activeUnavailable ? 'error' : 'none' };
}
