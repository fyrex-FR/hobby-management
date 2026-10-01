import { describe, expect, it, vi } from 'vitest';

vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));
import { codeFromHash, formatEuro, minutesLeft, offerSuggestions, offerSummary, parseAmount, type SalonLine } from './salon';

describe('salon', () => {
  it('lit le code du QR dans le hash', () => {
    expect(codeFromHash('#/salon?c=k7m2')).toBe('K7M2');
    expect(codeFromHash('#/salon')).toBeNull();
    expect(codeFromHash('#/salon?c=ABCDE')).toBeNull();
  });
  it('compte les minutes restantes', () => {
    const now = Date.parse('2026-10-01T10:00:00Z');
    expect(minutesLeft('2026-10-01T10:30:00Z', now)).toBe(30);
    expect(minutesLeft('2026-10-01T09:59:00Z', now)).toBeLessThan(0);
  });
  it('propose des offres rondes et distinctes', () => {
    expect(offerSuggestions(52)).toEqual([{ pct: 12, amount: 46 }, { pct: 15, amount: 44 }, { pct: 21, amount: 41 }]);
    expect(offerSuggestions(180).map((o) => o.amount)).toEqual([160, 150, 140]);
    expect(offerSuggestions(7)).toEqual([{ pct: 14, amount: 6 }, { pct: 21, amount: 5.5 }]);
    expect(offerSuggestions(2)).toEqual([{ pct: 25, amount: 1.5 }]);
    expect(offerSuggestions(1)).toEqual([]);
  });
  it('lit un montant saisi', () => {
    expect(parseAmount('12,5')).toBe(12.5);
    expect(parseAmount(' 40 € ')).toBe(40);
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('0')).toBeNull();
  });
  it('résume la négociation du lot', () => {
    const l = (state: SalonLine['state'], offer: number | null): SalonLine => ({ card_id: 'x', asked: 10, offer, final: 10, state });
    expect(offerSummary([l('none', null), l('none', null)])).toEqual({ asked: 20, offer: null, offer_state: 'none' });
    expect(offerSummary([l('offered', 8), l('offered', 7)]).offer).toBe(15);
    expect(offerSummary([l('countered', 8), l('accepted', 7)]).offer_state).toBe('countered');
    expect(offerSummary([l('accepted', 8), l('accepted', 7)]).offer_state).toBe('accepted');
    expect(offerSummary([l('refused', 8)]).offer_state).toBe('refused');
  });
  it('formate les prix avec les centimes seulement si besoin', () => {
    expect(formatEuro(12).replace(/\s/g, ' ')).toBe('12 €');
    expect(formatEuro(1.5).replace(/\s/g, ' ')).toBe('1,50 €');
  });
});
