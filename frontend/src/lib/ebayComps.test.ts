import { describe, expect, it } from 'vitest';
import { computeStats, trimOutliers, withoutGraded, type EbayResult } from './ebayComps';

const r = (price: number, title = 'Lavoy Allen Totally Certified Auto'): EbayResult => ({
  title, price, currency: 'USD', url: '', image: '', condition: '', end_date: '', sale_type: '',
});

describe('ebayComps', () => {
  it('écarte les exemplaires gradés', () => {
    const out = withoutGraded([r(5), r(80, 'Lavoy Allen Auto PSA 10'), r(40, 'BGS 9.5 Lavoy Allen'), r(6, 'PSA pack fresh')]);
    expect(out.map((x) => x.price)).toEqual([5, 6]);
  });

  it('retire les prix aberrants', () => {
    const out = trimOutliers([r(1), r(3), r(4), r(5), r(5), r(6), r(8), r(449)]);
    expect(out.map((x) => x.price)).not.toContain(449);
    expect(computeStats(out)?.median).toBe(5);
  });

  it('ne coupe rien sous 4 ventes', () => {
    expect(trimOutliers([r(1), r(2), r(300)])).toHaveLength(3);
  });
});
