/**
 * Ventes eBay comparables : filtrage de pertinence, statistiques et prix
 * proposé. Partagé par la fiche carte (EbaySoldItems) et le scan live.
 */

export interface EbayResult {
  title: string;
  price: number;
  currency: string;
  url: string;
  image: string;
  condition: string;
  end_date: string;
  sale_type: string;
  epid?: string;
  item_id?: string;
}

export interface EbayData {
  count?: number;
  min?: number | null;
  max?: number | null;
  avg?: number | null;
  median?: number | null;
  results?: EbayResult[];
  error?: string;
  detail?: string;
  needs_approval?: boolean;
  source?: string;
  cached?: boolean;
  fetched_at?: string;
}

export interface MatchInfo {
  year?: string | null;
  cardNumber?: string | null;
  numbered?: string | null;
  setName?: string | null;
}

/** Vrai si `title` contient le nombre `n` isolé (pas 133 pour 33, pas 1490 pour 149). */
function titleHasNumber(title: string, n: string): boolean {
  const digits = n.replace(/[^0-9]/g, '');
  if (!digits) return false;
  return new RegExp(`(^|[^0-9])0*${digits}([^0-9]|$)`).test(title);
}

/** Match du n° de carte, en gérant les numéros alphanumériques (ex. « CHR-KK »). */
function titleHasCardNumber(title: string, num: string): boolean {
  const n = num.trim();
  if (!n) return true;
  if (/[a-zA-Z]/.test(n)) {
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    return norm(title).includes(norm(n));
  }
  return titleHasNumber(title, n);
}

/** Ne garde que les ventes qui correspondent vraiment à la carte (n° + tirage + année). */
export function filterRelevant(results: EbayResult[], m?: MatchInfo): EbayResult[] {
  if (!m) return results;
  const preds: Array<(t: string) => boolean> = [];

  const year4 = m.year ? (m.year.match(/\d{4}/)?.[0] ?? '') : '';
  if (year4) preds.push((t) => titleHasNumber(t, year4));
  if (m.cardNumber) preds.push((t) => titleHasCardNumber(t, m.cardNumber!));

  // Tirage /149 : discriminant fort de parallèle. Sinon, on retombe sur le set.
  const denom = m.numbered ? (m.numbered.match(/(\d+)\s*$/)?.[1] ?? '') : '';
  if (denom) {
    preds.push((t) => titleHasNumber(t, denom));
  } else if (m.setName) {
    const set = m.setName.toLowerCase();
    preds.push((t) => t.toLowerCase().includes(set));
  }

  if (!preds.length) return results;
  // Précision avant tout : si rien ne matche, on renvoie vide (le bouton
  // « Voir tout » permet de retrouver l'ensemble non filtré).
  return results.filter((r) => preds.every((p) => p(r.title)));
}

export function computeStats(results: EbayResult[]) {
  const prices = results.map((r) => r.price).filter((p) => p > 0).sort((a, b) => a - b);
  if (!prices.length) return null;
  const n = prices.length;
  const median = n % 2 ? prices[(n - 1) / 2] : (prices[n / 2 - 1] + prices[n / 2]) / 2;
  return {
    count: n,
    min: Math.round(prices[0] * 100) / 100,
    max: Math.round(prices[n - 1] * 100) / 100,
    median: Math.round(median * 100) / 100,
  };
}

// Prix de vente proposé à partir des ventes eBay. Pas de conversion $→€
// (1 $ = 1 €), juste un arrondi à l'euro pour un prix propre.
export function toEurPrice(usd: number): number {
  return Math.max(1, Math.round(usd));
}

const GRADED_TITLE = /\b(psa|bgs|sgc|cgc|beckett|hga)\s*(gem\s*)?(mint\s*)?\d/i;

/** Retire les exemplaires gradés (PSA 10, BGS 9.5…) : ils faussent la valeur d'une carte brute. */
export function withoutGraded(results: EbayResult[]): EbayResult[] {
  return results.filter((r) => !GRADED_TITLE.test(r.title));
}

/**
 * Retire les prix aberrants (méthode des quartiles, 1,5 × IQR) : un lot ou
 * une erreur de listing à 449 € ne doit pas tirer une médiane à 32 €.
 * Sous 4 ventes, on ne coupe rien (pas assez de données pour juger).
 */
export function trimOutliers(results: EbayResult[]): EbayResult[] {
  const prices = results.map((r) => r.price).filter((p) => p > 0).sort((a, b) => a - b);
  if (prices.length < 4) return results;
  const q = (p: number) => {
    const i = (prices.length - 1) * p;
    const lo = Math.floor(i);
    return prices[lo] + (prices[Math.ceil(i)] - prices[lo]) * (i - lo);
  };
  const q1 = q(0.25);
  const q3 = q(0.75);
  const fence = (q3 - q1) * 1.5;
  return results.filter((r) => r.price >= q1 - fence && r.price <= q3 + fence);
}
