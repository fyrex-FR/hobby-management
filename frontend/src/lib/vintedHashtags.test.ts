import { describe, expect, it } from 'vitest';
import { addVintedHashtags, buildVintedHashtags, normalizeVintedHashtag } from './vintedHashtags';

describe('Vinted hashtags', () => {
  it('normalise les accents, espaces et signes de ponctuation', () => {
    expect(normalizeVintedHashtag("Jérémy Sochan Jr." )).toBe('jeremysochanjr');
  });

  it('utilise les noms courts des équipes NBA', () => {
    expect(buildVintedHashtags({
      player: 'Stephen Curry',
      team: 'Golden State Warriors',
      series: 'Donruss Optic',
    })).toEqual(['#fyrex_stephencurry', '#fyrex_warriors', '#fyrex_donrussoptic']);
  });

  it('fonctionne aussi avec une équipe hors NBA et ignore les valeurs absentes', () => {
    expect(buildVintedHashtags({ team: 'Paris Saint-Germain' }))
      .toEqual(['#fyrex_parissaintgermain']);
  });

  it('supprime les doublons', () => {
    expect(buildVintedHashtags({ player: 'Magic', team: 'Orlando Magic' }))
      .toEqual(['#fyrex_magic']);
  });

  it('place le bloc de navigation avant la description', () => {
    expect(addVintedHashtags('Carte protégée.', {
      player: 'Derrick Rose', team: 'Chicago Bulls', series: 'Donruss Optic',
    })).toBe(
      '🔎 Explorez ma collection via les hashtags ci-dessous pour découvrir d’autres cartes similaires :\n\n' +
      '#fyrex_derrickrose\n#fyrex_bulls\n#fyrex_donrussoptic\n\nCarte protégée.',
    );
  });
});
