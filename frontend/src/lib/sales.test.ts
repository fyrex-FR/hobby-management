import { describe, expect, it } from 'vitest';
import type { Card } from '../types';
import { guessChannel, spreadTotal } from './sales';

const card = (id: string, price: number | null, extra: Partial<Card> = {}) => ({ id, price, vinted_price: price, ...extra }) as Card;

describe('spreadTotal', () => {
  it('répartit au prorata des prix demandés et tombe juste au centime', () => {
    const out = spreadTotal([card('a', 10), card('b', 5), card('c', 5)], 7);
    expect(out.get('a')).toBe(3.5);
    expect(out.get('b')).toBe(1.75);
    expect([...out.values()].reduce((x, y) => x + y, 0)).toBeCloseTo(7, 10);
  });
  it('partage à parts égales sans prix demandés', () => {
    const out = spreadTotal([card('a', null), card('b', null), card('c', null)], 10);
    expect([...out.values()].reduce((x, y) => x + y, 0)).toBeCloseTo(10, 10);
  });
});

describe('guessChannel', () => {
  it('reconnaît une carte seulement sur Vinted ou seulement sur eBay', () => {
    expect(guessChannel([card('a', 1, { vinted_url: 'v', ebay_offer_id: null })])).toBe('vinted');
    expect(guessChannel([card('a', 1, { vinted_url: null, ebay_offer_id: 'o' })])).toBe('ebay');
    expect(guessChannel([card('a', 1, { vinted_url: 'v', ebay_offer_id: 'o' })])).toBe('direct');
  });
});
