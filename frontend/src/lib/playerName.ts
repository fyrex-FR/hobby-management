// Extraction du nom de famille d'un joueur pour le tri / le répertoire alphabétique.
// Gère les suffixes (Jr, III, …) et les cartes à plusieurs joueurs.

const SUFFIXES = new Set([
  'jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v', 'vi',
]);

// Séparateurs possibles entre plusieurs joueurs sur une même carte.
const MULTI_PLAYER_SEPARATORS = /\s*(?:\/|&|\+|,| x | et )\s*/i;

/** Retire les accents/diacritiques (Jokić -> Jokic). */
export function stripDiacritics(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Clé de regroupement/correspondance d'un nom de joueur, insensible aux
 * accents, à la casse et aux espaces multiples. Permet de fusionner les
 * variantes que l'IA renvoie (ex. « Dončić » et « Doncic »).
 */
export function playerNameKey(name: string | null | undefined): string {
  if (!name) return '';
  return stripDiacritics(name).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Vrai si le nom contient au moins un accent/diacritique. */
function hasDiacritics(name: string): boolean {
  return stripDiacritics(name) !== name;
}

/**
 * À partir d'une liste de noms (avec doublons accent/sans accent), renvoie une
 * map clé -> orthographe « canonique » à afficher. On choisit la variante la
 * plus fréquente, puis on préfère celle qui a des accents (plus correcte).
 */
export function buildPlayerCanonical(names: Array<string | null | undefined>): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const raw of names) {
    const name = raw?.trim();
    if (!name) continue;
    const key = playerNameKey(name);
    if (!key) continue;
    if (!counts.has(key)) counts.set(key, new Map());
    const variants = counts.get(key)!;
    variants.set(name, (variants.get(name) ?? 0) + 1);
  }
  const result = new Map<string, string>();
  for (const [key, variants] of counts) {
    let best = '';
    let bestScore = -1;
    let bestCount = -1;
    for (const [name, count] of variants) {
      const score = count * 2 + (hasDiacritics(name) ? 1 : 0);
      if (score > bestScore || (score === bestScore && count > bestCount)) {
        best = name;
        bestScore = score;
        bestCount = count;
      }
    }
    result.set(key, best);
  }
  return result;
}

/**
 * Renvoie le nom de famille (minuscule) servant au tri.
 * - Pour plusieurs joueurs, on se base sur le premier.
 * - On ignore les suffixes (Jr, III, …).
 */
export function playerLastName(name: string | null | undefined): string {
  if (!name) return '';
  // Premier joueur si plusieurs.
  const first = name.split(MULTI_PLAYER_SEPARATORS)[0]?.trim() ?? '';
  if (!first) return '';

  const words = first.split(/\s+/);
  // Retire les suffixes en fin de nom.
  while (words.length > 1 && SUFFIXES.has(words[words.length - 1].toLowerCase())) {
    words.pop();
  }
  return stripDiacritics(words[words.length - 1] ?? '').toLowerCase();
}

/** Première lettre (majuscule) du nom de famille, pour le répertoire A-Z. */
export function playerInitial(name: string | null | undefined): string {
  const last = playerLastName(name);
  const ch = last.charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}
