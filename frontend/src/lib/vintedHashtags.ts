const NBA_TEAM_SLUGS: Record<string, string> = {
  'atlanta hawks': 'hawks',
  'boston celtics': 'celtics',
  'brooklyn nets': 'nets',
  'charlotte hornets': 'hornets',
  'chicago bulls': 'bulls',
  'cleveland cavaliers': 'cavaliers',
  'dallas mavericks': 'mavericks',
  'denver nuggets': 'nuggets',
  'detroit pistons': 'pistons',
  'golden state warriors': 'warriors',
  'houston rockets': 'rockets',
  'indiana pacers': 'pacers',
  'la clippers': 'clippers',
  'los angeles clippers': 'clippers',
  'los angeles lakers': 'lakers',
  'memphis grizzlies': 'grizzlies',
  'miami heat': 'heat',
  'milwaukee bucks': 'bucks',
  'minnesota timberwolves': 'timberwolves',
  'new orleans pelicans': 'pelicans',
  'new york knicks': 'knicks',
  'oklahoma city thunder': 'thunder',
  'orlando magic': 'magic',
  'philadelphia 76ers': '76ers',
  'phoenix suns': 'suns',
  'portland trail blazers': 'trailblazers',
  'sacramento kings': 'kings',
  'san antonio spurs': 'spurs',
  'toronto raptors': 'raptors',
  'utah jazz': 'jazz',
  'washington wizards': 'wizards',
};

export function normalizeVintedHashtag(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function teamSlug(team: string | null | undefined): string {
  const normalizedTeam = (team ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return NBA_TEAM_SLUGS[normalizedTeam] ?? normalizeVintedHashtag(team);
}

export interface VintedHashtagFields {
  player?: string | null;
  team?: string | null;
  series?: string | null;
}

export function buildVintedHashtags(fields: VintedHashtagFields): string[] {
  const slugs = [
    normalizeVintedHashtag(fields.player),
    teamSlug(fields.team),
    normalizeVintedHashtag(fields.series),
  ].filter(Boolean);

  return [...new Set(slugs)].map((slug) => `#fyrex_${slug}`);
}

export function addVintedHashtags(description: string, fields: VintedHashtagFields): string {
  const hashtags = buildVintedHashtags(fields);
  if (hashtags.length === 0) return description;

  return [
    '🔎 Explorez ma collection via les hashtags ci-dessous pour découvrir d’autres cartes similaires :',
    '',
    ...hashtags,
    '',
    description,
  ].join('\n');
}
