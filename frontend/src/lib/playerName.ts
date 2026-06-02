// Extraction du nom de famille d'un joueur pour le tri / le répertoire alphabétique.
// Gère les suffixes (Jr, III, …) et les cartes à plusieurs joueurs.

const SUFFIXES = new Set([
  'jr', 'jr.', 'sr', 'sr.', 'ii', 'iii', 'iv', 'v', 'vi',
]);

// Séparateurs possibles entre plusieurs joueurs sur une même carte.
const MULTI_PLAYER_SEPARATORS = /\s*(?:\/|&|\+|,| x | et )\s*/i;

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
  return (words[words.length - 1] ?? '').toLowerCase();
}

/** Première lettre (majuscule) du nom de famille, pour le répertoire A-Z. */
export function playerInitial(name: string | null | undefined): string {
  const last = playerLastName(name);
  const ch = last.charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}
