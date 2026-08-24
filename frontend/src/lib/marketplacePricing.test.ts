import { describe, expect, it } from 'vitest';
import { calculateEbayPrice } from './marketplacePricing';

describe('calculateEbayPrice', () => {
  it('covers 9% fees and 0.35 euro then rounds to the next euro', () => {
    expect(calculateEbayPrice({
      vintedPrice: 10,
    })).toEqual({ beforeRounding: 11.37, roundingStep: 1, ebayPrice: 12 });
  });

  it('rounds to the next half euro below five euros', () => {
    expect(calculateEbayPrice({
      vintedPrice: 3.2,
    })).toEqual({ beforeRounding: 3.9, roundingStep: 0.5, ebayPrice: 4 });
  });

  it('does not move a value already on an increment', () => {
    expect(calculateEbayPrice({
      vintedPrice: 4.2,
    }).ebayPrice).toBe(5);
  });

  it('rejects negative values', () => {
    expect(() => calculateEbayPrice({
      vintedPrice: -1,
    })).toThrow();
  });
});
