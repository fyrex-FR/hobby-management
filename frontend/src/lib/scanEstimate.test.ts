import { describe, expect, it } from 'vitest';
import type { EbayResult } from './ebayComps';
import { classifyComps, estimateFrom, type Comps } from './scanEstimate';

const r = (price: number, title: string, id: string): EbayResult => ({
  title, price, currency: 'EUR', url: `https://ebay/${id}`, image: '', condition: '', end_date: '', sale_type: '', item_id: id,
});

const ident = { player: 'Lavoy Allen', year: '2012-13', set: 'Totally Certified' };
const sold = [
  r(4, '2012-13 Totally Certified Lavoy Allen Rookie Roll Call Auto', 'a'),
  r(3, '2012-13 Panini Totally Certified Lavoy Allen RC', 'b'),
  r(5, '2012-13 Totally Certified Lavoy Allen Auto /149', 'c'),
  r(448, '2013-14 Totally Certified Giannis Antetokounmpo', 'd'),
  r(60, '2012-13 Totally Certified Lavoy Allen PSA 10', 'e'),
];

function comps(soldList = sold): Comps {
  return { query: 'q', broad: false, sold: classifyComps(soldList, ident), active: [], soldUnavailable: false, activeUnavailable: false };
}

describe('scanEstimate', () => {
  it('explique chaque résultat écarté', () => {
    const byKey = Object.fromEntries(comps().sold.map((c) => [c.key, c.auto]));
    expect(byKey).toMatchObject({ a: 'kept', b: 'kept', c: 'kept', d: 'other_player', e: 'graded' });
  });

  it('nettoie le libellé d’accessibilité eBay des titres', () => {
    const [c] = classifyComps([r(4, "Lavoy Allen Totally Certified La page s'ouvre dans une nouvelle fenêtre ou un nouvel onglet", 'z')], ident);
    expect(c.title).toBe('Lavoy Allen Totally Certified');
  });

  it('estime sur les ventes retenues', () => {
    expect(estimateFrom(comps())).toMatchObject({ status: 'ready', source: 'sold', value: 4, count: 3, min: 3, max: 5 });
  });

  it('recalcule avec les choix de l\'utilisateur', () => {
    const est = estimateFrom(comps(), { c: false, e: true });
    expect(est).toMatchObject({ count: 3, max: 60 });
  });

  it('bascule sur les annonces en cours sans assez de ventes', () => {
    const c: Comps = { ...comps([]), active: classifyComps([r(6, 'Lavoy Allen Totally Certified', 'x'), r(8, 'Lavoy Allen Totally Certified auto', 'y')], ident) };
    expect(estimateFrom(c)).toMatchObject({ status: 'ready', source: 'active', value: 7 });
  });

  it('signale une panne quand ventes et annonces sont indisponibles', () => {
    expect(estimateFrom({ ...comps([]), soldUnavailable: true, activeUnavailable: true }).status).toBe('error');
  });
});
